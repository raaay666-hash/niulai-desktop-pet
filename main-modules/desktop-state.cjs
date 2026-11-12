const { normalizeMarketSymbol, displaySymbol } = require('./market-symbols');

const DEFAULTS = Object.freeze({
  theme: 'system', sound: false, muted: false, mamaSound: false, volume: 0.9, motion: true, interval: 10,
  private: true, scene: 0, smartScene: true, autoActions: true,
  petEnabled: true, petMode: 'market', petQuote: true, petHideInApp: false,
  petScale: 100, muyuSound: false, muyuEffects: true, muyuCount: true,
  islandEnabled: false, islandContent: 'market', islandTheme: 'dark',
  islandPrice: true, islandPercent: true, islandBull: true, islandCount: true,
  islandHoldings: false, islandMotion: true, islandAutoCollapse: true,
  islandHideInApp: false, islandSymbol: '', islandWidth: 320, islandInterval: 10,
  widgetEnabled: false, widgetTheme: 'system', widgetSparkline: true, widgetBull: true,
  emotionMemory: false, closeSummary: false,
  quietOffice: { enabled: false, start: '09:30', end: '11:30' }
});
const DEFAULT_STOCKS = [
  { code: 's_sh000001', name: '上证指数', cost: 0, shares: 0 },
  { code: 's_sz399001', name: '深证成指', cost: 0, shares: 0 },
  { code: 's_sz399006', name: '创业板指', cost: 0, shares: 0 }
];
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;

function normalizeSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const result = { ...DEFAULTS };
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (typeof fallback === 'boolean' && typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  for (const key of ['theme', 'islandTheme', 'widgetTheme']) {
    if (['system', 'light', 'dark'].includes(raw[key])) result[key] = raw[key];
  }
  for (const key of ['petMode', 'islandContent']) result[key] = raw[key] === 'muyu' ? 'muyu' : 'market';
  for (const key of ['interval', 'islandInterval']) result[key] = [5, 10, 30].includes(Number(raw[key])) ? Number(raw[key]) : DEFAULTS[key];
  result.volume = clamp(raw.volume, 0, 1, DEFAULTS.volume);
  result.petScale = clamp(raw.petScale, 75, 125, DEFAULTS.petScale);
  result.islandWidth = Math.round(clamp(raw.islandWidth, 260, 420, DEFAULTS.islandWidth));
  result.scene = [0, 1, 2, 3].includes(Number(raw.scene)) ? Number(raw.scene) : 0;
  result.islandSymbol = raw.islandSymbol ? normalizeMarketSymbol(raw.islandSymbol) || '' : '';
  const quiet = raw.quietOffice || {};
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
  result.quietOffice = {
    enabled: quiet.enabled === true,
    start: validTime(quiet.start) ? quiet.start : '09:30',
    end: validTime(quiet.end) ? quiet.end : '11:30'
  };
  return result;
}

function normalizeState(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const seen = new Set();
  const stocks = [];
  for (const item of Array.isArray(raw.stocks) ? raw.stocks : []) {
    const code = normalizeMarketSymbol(item?.code || item?.symbol);
    if (!code || seen.has(code) || stocks.length >= 50) continue;
    seen.add(code);
    stocks.push({ code, name: String(item.name || displaySymbol(code)).slice(0, 50), cost: positive(item.cost), shares: positive(item.shares) });
  }
  if (!stocks.length) stocks.push(...DEFAULT_STOCKS.map(stock => ({ ...stock })));
  const selected = normalizeMarketSymbol(raw.selected);
  const alerts = (Array.isArray(raw.alerts) ? raw.alerts : []).slice(0, 20).filter(item => item && typeof item === 'object').map(item => ({
    ...item, presentation: item.presentation === '3d' ? '2d' : item.presentation
  }));
  return {
    version: 2, stocks, selected: stocks.some(stock => stock.code === selected) ? selected : stocks[0].code,
    settings: normalizeSettings(raw.settings), alerts
  };
}

function migrateLegacy(values = {}) {
  const parse = (key, fallback) => { try { return JSON.parse(values[key] || 'null') || fallback; } catch { return fallback; } };
  const old = parse('niulai:pet-settings', {});
  const portfolio = parse('niulai:portfolio', {});
  const stocks = parse('niulai:saved-stocks-v1', []);
  const candidates = Array.isArray(stocks) ? [...stocks] : [];
  const selected = normalizeMarketSymbol(values['niulai:selected-symbol'] || portfolio.symbol) || 's_sh000001';
  const existing = candidates.find(stock => normalizeMarketSymbol(stock?.symbol) === normalizeMarketSymbol(portfolio.symbol));
  if (portfolio.cost > 0 && portfolio.shares > 0 && !existing) candidates.push(portfolio);
  if (!candidates.some(stock => normalizeMarketSymbol(stock?.symbol) === selected) && candidates.length < 50) candidates.unshift({ symbol: selected });
  if (!values['niulai:pet-settings'] && !values['niulai:saved-stocks-v1'] && !values['niulai:portfolio'] && !values['niulai:selected-symbol']) return normalizeState();
  return normalizeState({
    stocks: candidates, selected,
    settings: {
      ...old, sound: old.muted === false && Number(old.volume) > 0,
      motion: old.motion === undefined || Number(old.motion) > 0,
      interval: old.powerSave === false ? 5 : 10,
      petQuote: old.showQuote !== false,
      petScale: old.modelScale ? Number(old.modelScale) * 100 : 100
    },
    alerts: parse('niulai:alert-triggers-v1', [])
  });
}

function dayKey(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
function normalizeCounts(raw = {}, now = new Date()) {
  if (!raw || typeof raw !== 'object') raw = {};
  const valid = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return { day: dayKey(now), total: valid(raw.total), today: raw.day === dayKey(now) ? valid(raw.today) : 0, session: valid(raw.session) };
}
function tapCounts(raw, reset = false, now = new Date()) {
  const counts = normalizeCounts(raw, now);
  if (reset) return { ...counts, session: 0 };
  for (const key of ['total', 'today', 'session']) counts[key] = Math.min(Number.MAX_SAFE_INTEGER, counts[key] + 1);
  return counts;
}
module.exports = { DEFAULTS, DEFAULT_STOCKS, normalizeSettings, normalizeState, migrateLegacy, normalizeCounts, tapCounts };
