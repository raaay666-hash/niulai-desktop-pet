import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSymbol, parseChartResponse, loadChart, movingAverage, chartChange, compactVolume } from '../web/market-chart-data.mjs';

const response = rows => JSON.stringify({ code: 0, data: { sh600519: { qfqday: rows } } });
test('history symbols preserve mainland, Hong Kong and US class-share codes', () => {
  assert.equal(chartSymbol('s_sh600519'), 'sh600519');
  assert.equal(chartSymbol('rt_hk00700'), 'hk00700');
  assert.equal(chartSymbol('gb_brk.b'), 'usBRK.B');
  assert.throws(() => chartSymbol('https://example.com'));
});
test('historical candles sort and deduplicate, reject corrupt fields and retain negative adjusted prices', () => {
  const result = parseChartResponse(response([
    ['2026-11-13', '10', '12', '13', '9', '100'],
    ['2026-11-12', '-10', '-8', '-7', '-11', ''],
    ['2026-11-13', '10', '11', '13', '9', '0'],
    ['2026-11-14', '', '11', '13', '9', '100'],
    ['2026-11-15', '10', '11', '9', '8', '100'],
    ['2026-02-30', '10', '11', '13', '9', '100']
  ]), 'sh600519', 'day');
  assert.equal(result.adjusted, true);
  assert.equal(result.volumeUnit, '手');
  assert.deepEqual(result.bars.map(bar => bar.close), [-8, 11]);
  assert.equal(result.bars[0].volume, null);
  assert.equal(result.bars[1].volume, 0);
  assert.throws(() => parseChartResponse('{}', 'sh600519', 'day'));
  assert.throws(() => parseChartResponse(response([]), 'sh600519', '__proto__'));
});
test('US exchange-qualified history replaces the legacy sparse series', async () => {
  const requested = [];
  const result = await loadChart(async value => {
    requested.push(value);
    if (value === 'usAAPL,day') return JSON.stringify({ code: 0, data: { usAAPL: { day: [], qt: { usAAPL: ['delay', '苹果', 'AAPL.OQ'] } } } });
    return JSON.stringify({ code: 0, data: { 'usAAPL.OQ': { day: [['2026-11-13', '10', '11', '12', '9', '100']] } } });
  }, 'gb_aapl', 'day');
  assert.deepEqual(requested, ['usAAPL,day', 'usAAPL.OQ,day']);
  assert.equal(result.adjusted, false);
  assert.equal(result.volumeUnit, '股');
  assert.equal(result.bars.length, 1);
});
test('moving averages use preceding history and changes handle absent or zero baselines', () => {
  const bars = Array.from({ length: 25 }, (_, index) => ({ close: index + 1 }));
  assert.equal(movingAverage(bars, 3, 5), null);
  assert.equal(movingAverage(bars, 24, 5), 23);
  assert.equal(movingAverage(bars, 24, 20), 15.5);
  assert.equal(chartChange(bars, 0), null);
  assert.equal(chartChange([{ close: 0 }, { close: 10 }], 1), null);
  assert.equal(chartChange([{ close: 10 }, { close: 11 }], 1), 10);
  assert.equal(compactVolume(null), '—');
  assert.equal(compactVolume(12345), '1.23万');
});
