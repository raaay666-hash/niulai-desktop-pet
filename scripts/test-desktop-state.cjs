const assert = require('node:assert/strict');
const { normalizeSettings, normalizeState, migrateLegacy, normalizeCounts, tapCounts } = require('../main-modules/desktop-state.cjs');

const migrated = migrateLegacy({
  'niulai:pet-settings': JSON.stringify({ displayMode: '3d', volume: .4, muted: false, motion: 0, showQuote: false, quietOffice: { enabled: true, start: '23:00', end: '08:00' } }),
  'niulai:selected-symbol': 'gb_aapl',
  'niulai:saved-stocks-v1': JSON.stringify([{ symbol: 'gb_aapl', name: '苹果', cost: 180, shares: 1.25 }, { symbol: 'rt_hk00700', name: '腾讯', cost: 400, shares: 100 }]),
  'niulai:alert-triggers-v1': JSON.stringify([{ id: 'old', type: 'price', presentation: '3d', value: 200 }])
});
assert.equal(migrated.selected, 'gb_aapl');
assert.equal(migrated.stocks[0].shares, 1.25);
assert.equal(migrated.stocks[1].cost, 400);
assert.equal(migrated.settings.volume, .4);
assert.equal(migrated.settings.sound, true);
assert.equal(migrated.settings.motion, false);
assert.equal(migrated.settings.petQuote, false);
assert.equal(migrated.settings.displayMode, undefined);
assert.equal(migrated.alerts[0].presentation, '2d');
assert.equal(migrated.settings.quietOffice.enabled, true);
assert.equal(migrated.settings.quietOffice.start, '23:00');
const single = migrateLegacy({ 'niulai:portfolio': JSON.stringify({ symbol: 's_sh600519', cost: 1600, shares: 10 }) });
assert.equal(single.stocks[0].cost, 1600);
assert.equal(single.selected, 's_sh600519');
assert.equal(migrateLegacy({ 'niulai:pet-settings': 'broken' }).settings.sound, false);
assert.equal(normalizeState({ stocks: [null, { code: 'oops!' }] }).stocks.length, 3);
assert.equal(normalizeSettings({ islandWidth: 999, interval: 0, volume: -1 }).islandWidth, 420);
assert.equal(normalizeSettings({ quietOffice: { start: '99:99' } }).quietOffice.start, '09:30');
const fifty = Array.from({ length: 50 }, (_, i) => ({ symbol: 's_sh' + String(600000 + i), cost: i + 1, shares: 10 }));
assert.equal(migrateLegacy({ 'niulai:saved-stocks-v1': JSON.stringify(fifty) }).stocks.length, 50);
const yesterday = { day: '2026-11-11', total: 200, today: 50, session: 12 };
const tomorrow = new Date(2026, 10, 12, 0, 0, 1);
assert.deepEqual(normalizeCounts(yesterday, tomorrow), { day: '2026-11-12', total: 200, today: 0, session: 12 });
assert.deepEqual(tapCounts(yesterday, false, tomorrow), { day: '2026-11-12', total: 201, today: 1, session: 13 });
assert.equal(tapCounts(yesterday, true, tomorrow).total, 200);
assert.equal(tapCounts(yesterday, true, tomorrow).session, 0);
assert.equal(tapCounts({ ...yesterday, total: Number.MAX_SAFE_INTEGER }, false, tomorrow).total, Number.MAX_SAFE_INTEGER);
console.log('Desktop migration, settings and shared counter regressions passed');
