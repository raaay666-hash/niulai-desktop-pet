import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, position, marketSession, normalizeMarketSymbol, parseSinaQuote, parseTencentQuote, parseTencentSuggestions, quoteProviderSymbol, currency } from '../web/core.mjs';

test('corrupt or invalid persisted data recovers without accepting an arbitrary request symbol', () => {
  const storage = { getItem: () => '{bad' };
  assert.equal(loadState(storage).stocks.length, 3);
  storage.getItem = () => JSON.stringify({ stocks: [{ code: 'https://bad' }, { code: 'gb_aapl', shares: 'NaN', cost: -1 }, { code: 'gb_aapl' }], selected: 'evil', theme: 'evil', interval: 0 });
  const state = loadState(storage);
  assert.equal(state.stocks.length, 1); assert.equal(state.selected, 'gb_aapl');
  assert.equal(state.stocks[0].shares, 0); assert.equal(state.stocks[0].cost, 0);
  assert.equal(state.theme, 'system'); assert.equal(state.interval, 10);
});
test('saved watchlist, selected symbol and fractional positions survive a restart', () => {
  let raw;
  const storage = { getItem: () => raw, setItem: (k, value) => { raw = value; } };
  const state = loadState(storage); state.stocks.push({ code: 'gb_aapl', name: '苹果', cost: 100, shares: 1.25 }); state.selected = 'gb_aapl';
  saveState(storage, state); assert.deepEqual(loadState(storage), state);
});
test('position accounting uses previous close and never sums different currencies', () => {
  const stock = { code: 'gb_aapl', cost: 100, shares: 1.5 };
  assert.deepEqual(position(stock, { code: 'gb_aapl', price: 110, prevClose: 112 }), { today: -3, total: 15, percent: (110 / 100 - 1) * 100, value: 165 });
  assert.equal(position(stock, { code: 'rt_hk00700', price: 110, prevClose: 112 }), null);
  assert.equal(currency('gb_aapl'), 'USD'); assert.equal(currency('rt_hk00700'), 'HKD'); assert.equal(currency('s_sh000001'), 'CNY');
});
test('market hours handle CN/HK lunch, weekends, and US daylight saving time', () => {
  assert.equal(marketSession('s_sh000001', new Date('2026-11-10T03:45:00Z')), '午间休市');
  assert.equal(marketSession('rt_hk00700', new Date('2026-11-10T03:45:00Z')), '常规交易时段');
  assert.equal(marketSession('s_sh000001', new Date('2026-11-07T02:00:00Z')), '周末休市');
  assert.equal(marketSession('gb_aapl', new Date('2026-07-07T13:30:00Z')), '常规交易时段');
  assert.equal(marketSession('gb_aapl', new Date('2026-11-10T13:30:00Z')), '常规时段外');
  assert.equal(marketSession('gb_aapl', new Date('2026-11-10T14:30:00Z')), '常规交易时段');
});
test('desktop parsers preserve A/HK/US mappings and reject invalid quote bodies', () => {
  assert.equal(normalizeMarketSymbol('600519'), 's_sh600519'); assert.equal(normalizeMarketSymbol('00700'), 'rt_hk00700'); assert.equal(normalizeMarketSymbol('AAPL'), 'gb_aapl');
  assert.equal(quoteProviderSymbol('rt_hk00700', 'tencent'), 'hk00700');
  const quote = parseSinaQuote('var hq_str_s_sh000001="上证指数,3000,-30,-0.99,10,20";', 's_sh000001');
  assert.equal(quote.prevClose, 3030); assert.equal(quote.changePct, -.99);
  assert.equal(parseSinaQuote('var hq_str_s_sh000001="";', 's_sh000001'), null);
  assert.equal(parseTencentQuote('v_s_sh000001="1~上证指数~000001~3000~-30~-0.99~10~20";', 's_sh000001').price, 3000);
  assert.equal(parseTencentSuggestions('v_hint="sh~600519~贵州茅台~gzmt~GP^hk~00700~腾讯控股~txkg~GP";').length, 2);
});
