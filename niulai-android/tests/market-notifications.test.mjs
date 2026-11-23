import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};
const { MobileMarkets } = await import('../web/market-workspace.mjs');

test('news remains eligible until Android accepts the notification', async t => {
  const code = 's_sh600519';
  const now = Date.now();
  const original = { since: now - 60_000, seen: [] };
  const article = { id: '1', title: '贵州茅台最新公告', publisher: '交易所', publishedAt: now };
  const preferences = { notifications: true, followed: [code], cursors: { [code]: original } };
  let permission = false;
  let accepted = false;
  let attempts = 0;
  globalThis.window = { NiulaiNative: {
    newsPermission: () => permission,
    showStockNews(symbol, title, headline) {
      assert.equal(symbol, code);
      assert.equal(title, '贵州茅台 · 交易所');
      assert.equal(headline, article.title);
      attempts++;
      return accepted;
    }
  } };
  t.after(() => { delete globalThis.window; });

  const markets = Object.assign(Object.create(MobileMarkets.prototype), {
    state: { news: preferences, stocks: [{ code, name: '贵州茅台' }] },
    generation: 0,
    active: true,
    loadNews: async () => ({ articles: [article] }),
    persist() {},
    schedule() {}
  });

  await markets.checkFollowed();
  assert.equal(attempts, 0);
  assert.equal(preferences.cursors[code], original);
  permission = true;
  await markets.checkFollowed();
  assert.equal(attempts, 1);
  assert.equal(preferences.cursors[code], original);
  accepted = true;
  await markets.checkFollowed();
  assert.equal(preferences.cursors[code].seen.length, 1);
  await markets.checkFollowed();
  assert.equal(attempts, 2);
});
