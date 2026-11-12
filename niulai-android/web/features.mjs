import symbols from '../../main-modules/market-symbols.js';

export const featureDefaults = {
  petEnabled: false, petMode: 'market', petQuote: true, petHideInApp: true, autoActions: true,
  muyuSound: false, muyuEffects: true, muyuCount: true,
  islandEnabled: false, islandContent: 'market', islandTheme: 'dark', islandPrice: true,
  islandPercent: true, islandBull: true, islandCount: true, islandHoldings: false,
  islandHideInApp: true, islandMotion: true, islandAutoCollapse: true, islandSymbol: '',
  islandWidth: 264, islandOffsetX: 0, islandOffsetY: 0, islandInterval: 5,
  islandPlacement: 'auto', islandCameraInteraction: false, islandCameraX: 50,
  islandCameraWidth: 24, islandCameraHeight: 28,
  widgetTheme: 'system', widgetSparkline: true, widgetBull: true
};

export function cleanFeatures(raw = {}) {
  const clean = { ...featureDefaults };
  for (const [key, fallback] of Object.entries(featureDefaults)) {
    if (typeof fallback === 'boolean') clean[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
  }
  for (const key of ['petMode', 'islandContent']) clean[key] = raw[key] === 'muyu' ? 'muyu' : 'market';
  for (const key of ['widgetTheme', 'islandTheme']) {
    if (['system', 'light', 'dark'].includes(raw[key])) clean[key] = raw[key];
  }
  for (const [key, min, max] of [['islandWidth', 200, 360], ['islandOffsetX', -160, 160], ['islandOffsetY', -24, 160], ['islandCameraX', 0, 100], ['islandCameraWidth', 12, 200], ['islandCameraHeight', 12, 80]]) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) clean[key] = Math.max(min, Math.min(max, Math.round(value)));
  }
  clean.islandPlacement = ['auto', 'manual', 'below'].includes(raw.islandPlacement) ? raw.islandPlacement : 'auto';
  clean.islandInterval = [5, 10, 30].includes(raw.islandInterval) ? raw.islandInterval : 5;
  clean.islandSymbol = raw.islandSymbol && symbols.normalizeMarketSymbol(raw.islandSymbol) === raw.islandSymbol ? raw.islandSymbol : '';
  return clean;
}

const COUNTS_KEY = 'niulai:android:muyu:v1';
export function localCounts(storage, tap = false, reset = false, now = new Date()) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(COUNTS_KEY) || '{}') || {}; } catch { }
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const valid = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const increment = value => Math.min(Number.MAX_SAFE_INTEGER, value + (tap ? 1 : 0));
  const counts = { day, total: increment(valid(saved.total)), today: increment(saved.day === day ? valid(saved.today) : 0), session: increment(reset ? 0 : valid(saved.session)) };
  if (tap || reset || saved.day !== day) storage.setItem(COUNTS_KEY, JSON.stringify(counts));
  return counts;
}
