import { normalizeMarketSymbol } from './core.mjs';

export const chartPeriods = { day: '日 K', week: '周 K', month: '月 K' };

export function chartSymbol(code) {
  const normalized = normalizeMarketSymbol(code);
  if (!normalized) throw new Error('股票代码无效');
  if (normalized.startsWith('s_')) return normalized.slice(2);
  if (normalized.startsWith('rt_')) return normalized.slice(3);
  return 'us' + normalized.slice(3).toUpperCase();
}

export function parseChartResponse(text, symbol, period) {
  if (!Object.prototype.hasOwnProperty.call(chartPeriods, period)) throw new Error('K 线周期无效');
  const response = JSON.parse(text);
  const data = response?.data?.[symbol];
  if (response.code !== 0 || !data) throw new Error('历史行情暂不可用');
  const adjusted = Array.isArray(data['qfq' + period]);
  const rows = adjusted ? data['qfq' + period] : data[period];
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(row) || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) continue;
    const [date, ...values] = row;
    const dateAt = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(dateAt) || new Date(dateAt).toISOString().slice(0, 10) !== date) continue;
    const [open, close, high, low] = values.slice(0, 4).map(value => value === '' || value == null ? NaN : Number(value));
    if (![open, close, high, low].every(Number.isFinite) || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    const volume = values[4] === '' || values[4] == null ? NaN : Number(values[4]);
    unique.set(date, { date, open, close, high, low, volume: Number.isFinite(volume) && volume >= 0 ? volume : null });
  }
  const bars = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  const exchangeSymbol = data.qt?.[symbol]?.[2];
  const resolved = symbol.startsWith('us') && typeof exchangeSymbol === 'string' && /^[A-Z][A-Z0-9.-]{0,20}\.(?:OQ|O|N|A|AMEX|PS|K)$/.test(exchangeSymbol)
    ? 'us' + exchangeSymbol : symbol;
  return { bars, adjusted, resolved, volumeUnit: /^(sh|sz)/.test(symbol) ? '手' : '股' };
}

export async function loadChart(request, code, period) {
  const symbol = chartSymbol(code);
  let result = parseChartResponse(await request(symbol + ',' + period), symbol, period);
  // US history requires the exchange suffix returned by the provider's quote metadata.
  if (result.resolved !== symbol) {
    result = parseChartResponse(await request(result.resolved + ',' + period), result.resolved, period);
  }
  if (!result.bars.length) throw new Error('行情源暂未提供该标的的历史 K 线');
  return { ...result, received: Date.now(), code, period };
}

export function movingAverage(bars, index, size) {
  if (index + 1 < size) return null;
  let sum = 0;
  for (let cursor = index - size + 1; cursor <= index; cursor++) sum += bars[cursor].close;
  return sum / size;
}

export function chartChange(bars, index) {
  const previous = bars[index - 1]?.close;
  return Number.isFinite(previous) && previous !== 0 ? (bars[index].close - previous) / Math.abs(previous) * 100 : null;
}

export function compactVolume(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
