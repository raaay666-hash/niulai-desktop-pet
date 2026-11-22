const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readManifest, OrderbookTrial } = require('../main-modules/orderbook-trial.cjs');
const { OrderbookPlugin } = require('../main-modules/orderbook-plugin.cjs');
const { normalizeSourceConfig, parseCustomQuote } = require('../main-modules/custom-quotes.cjs');
const manifest = require('../plugins/niulai-orderbook.niulai-plugin.json');

const baseTime = Date.parse('2026-11-23T02:30:00Z');
const start = (strategy = 'spread', overrides = {}) => new OrderbookTrial({
  source: 'stream', strategy, symbol: 'DEMO', currency: 'CNY', venues: strategy === 'spread' ? ['A', 'B'] : ['A'],
  startedAt: baseTime, settings: { ...manifest.settings, ...overrides }
});
function frame(venue, time, sequence, patch = {}) {
  const bid = venue === 'A' ? 100 : 100.25;
  return {
    symbol: 'DEMO', currency: 'CNY', venue, phase: 'continuous', unit: 'share', sequence, timestamp: time,
    bids: [{ price: bid, size: 1800 }], asks: [{ price: bid + 0.03, size: 100 }], ...patch
  };
}
function pair(trial, at, sequence, a, b) {
  trial.ingest(frame('A', at, sequence, a), at);
  trial.ingest(frame('B', at, sequence, b), at);
}

test('manifest validates version and whole lots and only imports known data', () => {
  assert.deepEqual(readManifest({ ...manifest, code: 'script' }), manifest);
  assert.throws(() => readManifest({ ...manifest, version: '1.0.0' }), /无法导入/);
  assert.throws(() => readManifest({ ...manifest, settings: { ...manifest.settings, quantity: 101, lotSize: 100 } }), /整数倍/);
});

test('spread waits for both new books after latency and computes two-sided costs', () => {
  const trial = start();
  pair(trial, baseTime, 1);
  assert.equal(trial.stats.signals, 1);
  assert.equal(trial.stats.fills, 0);
  pair(trial, baseTime + 50, 2);
  assert.equal(trial.stats.fills, 0);
  trial.ingest(frame('A', baseTime + 100, 3), baseTime + 160);
  assert.equal(trial.stats.fills, 0, 'A newly received but pre-order quote does not fill');
  trial.ingest(frame('A', baseTime + 200, 4), baseTime + 205);
  assert.equal(trial.stats.fills, 1);
  assert.equal(trial.history.length, 0);
  trial.ingest(frame('B', baseTime + 210, 4), baseTime + 215);
  const modelBuy = 100 * 100.03 * 1.0001;
  const modelSell = 100 * 100.25 * 0.9999;
  const expected = modelSell * (1 - 0.00025) - modelBuy * (1 + 0.00015);
  assert.ok(Math.abs(trial.stats.pairedNet - expected) < 1e-8);
  assert.equal(trial.accounts[0].sellable, manifest.settings.inventoryA);
  assert.equal(trial.accounts[1].sellable, manifest.settings.inventoryB - 100);
});

test('an unfilled second leg is recorded and further signals pause', () => {
  const trial = start();
  pair(trial, baseTime, 1);
  pair(trial, baseTime + 200, 2, {}, { bids: [{ price: 100.18, size: 200 }] });
  assert.equal(trial.paused, true);
  assert.equal(trial.history[0].status, 'unpaired');
  assert.equal(trial.history[0].net, null);
  assert.equal(trial.stats.pairedNet, 0);
  assert.equal(trial.accounts[0].quantity, manifest.settings.inventoryA + 100);
  pair(trial, baseTime + 900, 3);
  assert.equal(trial.stats.signals, 1);
});

test('expiry cancels unfilled legs and exposes pending inventory', () => {
  const trial = start();
  pair(trial, baseTime, 1);
  trial.ingest(frame('B', baseTime + 200, 2), baseTime + 200);
  trial.expire(baseTime + 1500);
  assert.equal(trial.pending, null);
  assert.equal(trial.stats.cancelled, 1);
  assert.equal(trial.history[0].status, 'unpaired');
  assert.equal(trial.accounts[1].quantity, manifest.settings.inventoryB - 100);
});

test('duplicate, crossed, stale and differently denominated quotes do not create a pair', () => {
  const trial = start();
  trial.ingest(frame('A', baseTime, 1), baseTime);
  trial.ingest(frame('B', baseTime, 1, { currency: 'USD' }), baseTime);
  trial.ingest(frame('B', baseTime, 1, { phase: 'auction' }), baseTime);
  trial.ingest(frame('B', baseTime, 1), baseTime);
  trial.ingest(frame('B', baseTime + 10, 2, { asks: [{ price: 100.24, size: 200 }] }), baseTime + 10);
  trial.ingest(frame('B', baseTime + 20, 3), baseTime + 2000);
  assert.equal(trial.stats.rejected, 4);
  assert.equal(trial.stats.signals, 0);
});

test('price levels depleted by the simulation cannot be repeatedly reused', () => {
  const trial = start();
  pair(trial, baseTime, 1);
  pair(trial, baseTime + 200, 2);
  pair(trial, baseTime + 1000, 3);
  assert.equal(trial.stats.signals, 1);
  pair(trial, baseTime + 1200, 4, { asks: [{ price: 100.03, size: 200 }] });
  assert.equal(trial.stats.signals, 2);
});

test('skew, insufficient inventory and costs each block a spread signal', () => {
  const skew = start();
  skew.ingest(frame('A', baseTime, 1), baseTime);
  skew.ingest(frame('B', baseTime + 300, 1), baseTime + 300);
  assert.equal(skew.stats.signals, 0);
  assert.match(skew.note, /时差/);
  for (const options of [{ inventoryB: 0 }, { cash: 1000 }, { minFee: 20 }, { slipBp: 20 }]) {
    const trial = start('spread', options);
    pair(trial, baseTime, 1);
    assert.equal(trial.stats.signals, 0);
  }
});

test('single-book trades walk depth and leave new shares unavailable to sell', () => {
  const trial = start('sweep', { inventoryA: 0, minFee: 0, buyFeeBp: 0, slipBp: 0 });
  const bids = [{ price: 100, size: 1800 }];
  const asks = [{ price: 100.03, size: 60 }, { price: 100.08, size: 50 }];
  trial.ingest(frame('A', baseTime, 1, { bids, asks }), baseTime);
  trial.ingest(frame('A', baseTime + 200, 2, { bids, asks }), baseTime + 200);
  assert.equal(trial.accounts[0].quantity, 100);
  assert.equal(trial.accounts[0].sellable, 0);
  assert.equal(trial.history[0].legs[0].price, (100.03 * 60 + 100.08 * 40) / 100);
  trial.ingest(frame('A', baseTime + 900, 3, {
    bids: [{ price: 100, size: 120 }], asks: [{ price: 100.03, size: 1500 }]
  }), baseTime + 900);
  assert.equal(trial.stats.signals, 1);
});

test('single-venue settings can use a book age below the unused cross-venue skew limit', () => {
  const plugin = new OrderbookPlugin({});
  plugin.manifest = manifest;
  const settings = { ...manifest.settings, maxAgeMs: 50 };
  assert.throws(() => plugin.start({ source: 'demo', strategy: 'spread', settings }), /时差/);
  try {
    assert.equal(plugin.start({ source: 'demo', strategy: 'sweep', settings }).running, true);
  } finally { plugin.stop('test'); }
});

test('native custom source requires an independent timestamp and shares in a continuous session', () => {
  const plugin = new OrderbookPlugin({ checkSnapshot() {} });
  plugin.manifest = manifest;
  const settings = { ...manifest.settings };
  plugin.start({ source: 'snapshot', strategy: 'sweep', symbol: 'sh600519', settings });
  const config = normalizeSourceConfig({ url: 'https://example.test/quotes/{symbol}' });
  const quote = (at, unit, stamp) => parseCustomQuote({
    price: 100, timestamp: new Date(at).toISOString(),
    orderBook: {
      unit, timestamp: stamp ? new Date(at).toISOString() : undefined,
      bids: [{ price: 100, size: 1800 }], asks: [{ price: 100.03, size: 150 }]
    }
  }, 's_sh600519', config, at);
  try {
    plugin.ingestSnapshot(quote(baseTime, '股', false), baseTime);
    plugin.ingestSnapshot(quote(baseTime, '手', true), baseTime);
    assert.equal(plugin.trial.stats.signals, 0);
    plugin.ingestSnapshot(quote(baseTime + 500, '股', true), baseTime + 500);
    plugin.ingestSnapshot(quote(baseTime + 600, '股', true), baseTime + 600);
    assert.equal(plugin.trial.stats.fills, 0);
    plugin.ingestSnapshot(quote(baseTime + 700, '股', true), baseTime + 700);
    assert.equal(plugin.trial.stats.signals, 1);
    assert.equal(plugin.trial.stats.fills, 1);
  } finally { plugin.stop('test'); }
});

test('native custom source rejects opening auction depth received after continuous trading begins', () => {
  const plugin = new OrderbookPlugin({ checkSnapshot() {} });
  plugin.manifest = manifest;
  const opening = Date.parse('2026-11-23T01:30:00Z');
  const config = normalizeSourceConfig({ url: 'https://example.test/quotes/{symbol}' });
  const { bids, asks } = frame('A', opening, 1);
  const quote = snapshotAt => parseCustomQuote({
    price: 100, orderBook: { unit: '股', timestamp: snapshotAt, bids, asks }
  }, 's_sh600519', config, opening);

  plugin.start({ source: 'snapshot', strategy: 'sweep', symbol: 'sh600519', settings: manifest.settings });
  try {
    plugin.ingestSnapshot(quote(opening - 10), opening);
    assert.equal(plugin.trial.stats.signals, 0);
    assert.equal(plugin.trial.books.size, 0);
    plugin.ingestSnapshot(quote(opening), opening + 10);
    assert.equal(plugin.trial.stats.signals, 1);
  } finally { plugin.stop('test'); }
});

test('continuous depth stops when a required venue goes stale despite fresh frames from its peer', t => {
  const plugin = new OrderbookPlugin({});
  let now = baseTime;
  let heartbeat;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', tick => { heartbeat = tick; });
  t.mock.method(plugin, 'follow', async () => {});
  plugin.manifest = manifest;
  plugin.start({ source: 'stream', strategy: 'spread', url: 'https://example.test', symbol: 'DEMO',
    currency: 'CNY', venueA: 'A', venueB: 'B', settings: { ...manifest.settings, inventoryB: 0 } });
  const trial = plugin.trial;
  pair(trial, baseTime, 1);
  now += 10001;
  trial.ingest(frame('A', now, 2), now);
  heartbeat();
  assert.equal(plugin.running, false);
  assert.match(plugin.status, /B.*超时/);
});

test('unusable custom timestamps do not invalidate a quote or masquerade as a depth timestamp', () => {
  const config = normalizeSourceConfig({ url: 'https://example.test/quotes/{symbol}' });
  const { bids, asks } = frame('A', baseTime, 1);
  const quote = parseCustomQuote({
    price: 100, timestamp: 9e15,
    orderBook: { unit: '股', timestamp: 9e15, bids, asks }
  }, 'gb_aapl', config, baseTime);

  assert.equal(quote.quotedAt, null);
  assert.equal(quote.details.book.snapshotAt, undefined);
});

test('unrecognized custom sessions remain plain quote data', () => {
  const config = normalizeSourceConfig({ url: 'https://example.test/quotes/{symbol}' });
  const quote = parseCustomQuote({ price: 100, session: 'constructor' }, 'gb_aapl', config, baseTime);

  assert.equal(quote.session, 'regular');
  assert.doesNotThrow(() => structuredClone(quote));
});
