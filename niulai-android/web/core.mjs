import { cleanFeatures } from './features.mjs';
import symbols from '../../main-modules/market-symbols.js';
import parsers from '../../main-modules/quote-parsers.js';
export const { normalizeMarketSymbol, marketForSymbol, displaySymbol, quoteProviderSymbol, parseTencentSuggestions } = symbols;
export const { parseSinaQuote, parseTencentQuote } = parsers;
export const DEFAULT_STOCKS = [
  { code: 's_sh000001', name: '上证指数' },
  { code: 's_sz399001', name: '深证成指' },
  { code: 's_sz399006', name: '创业板指' }
];
const KEY = 'niulai:android:v1';
export function loadState(storage) {
  let raw = {};
  try { raw = JSON.parse(storage.getItem(KEY) || '{}') || {}; } catch {}
  const stocks = Array.isArray(raw.stocks) ? raw.stocks.filter(s => s && normalizeMarketSymbol(s.code) === s.code)
    .filter((s, i, all) => all.findIndex(t => t.code === s.code) === i).slice(0, 20)
    .map(s => ({ code: s.code, name: String(s.name || displaySymbol(s.code)).slice(0, 50),
      cost: finitePositive(s.cost), shares: finitePositive(s.shares) })) : [];
  if (!stocks.length) stocks.push(...DEFAULT_STOCKS.map(s => ({ ...s, cost: 0, shares: 0 })));
  return { stocks, selected: stocks.some(s => s.code === raw.selected) ? raw.selected : stocks[0].code,
    theme: ['system', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'system',
    sound: raw.sound === true, haptic: raw.haptic !== false, motion: raw.motion !== false,
    interval: [5, 10, 30].includes(raw.interval) ? raw.interval : 10,
    private: raw.private !== false, scene: [0,1,2,3].includes(raw.scene) ? raw.scene : 0,
    smartScene: raw.smartScene !== false, ...cleanFeatures(raw) };
}
export function saveState(storage, state) { storage.setItem(KEY, JSON.stringify(state)); }
function finitePositive(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0; }
export function position(stock, quote) {
  if (!stock?.cost || !stock?.shares || !quote || quote.code !== stock.code) return null;
  return { today: (quote.price - quote.prevClose) * stock.shares,
    total: (quote.price - stock.cost) * stock.shares,
    percent: (quote.price / stock.cost - 1) * 100, value: quote.price * stock.shares };
}
export function currency(code) { return { cn: 'CNY', hk: 'HKD', us: 'USD' }[marketForSymbol(code)]; }
export function marketSession(code, now = new Date()) {
  const market = marketForSymbol(code);
  const zone = market === 'us' ? 'America/New_York' : 'Asia/Shanghai';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now).map(p => [p.type, p.value]));
  const minute = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return '周末休市';
  if (market === 'us') return minute >= 570 && minute < 960 ? '常规交易时段' : '常规时段外';
  const close = market === 'hk' ? 960 : 900;
  const lunch = market === 'hk' ? 720 : 690;
  if (minute >= lunch && minute < 780) return '午间休市';
  return minute >= 570 && minute < close ? '常规交易时段' : '常规时段外';
}
