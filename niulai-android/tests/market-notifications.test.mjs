import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = {};
const { MobileMarkets } = await import('../web/market-workspace.mjs');
const niulaiResult = globalThis.window.__niulaiResult;

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

test('failed translations are not permanently cached and retry after failure', async () => {
  let calls = 0;
  const markets = Object.assign(Object.create(MobileMarkets.prototype), {
    translations: new Map(),
    aliases: new Map(),
    async fetchTranslation() {
      calls++;
      return calls === 1 ? '' : '苹果扩大开发者计划';
    }
  });
  const article = { id: 'a1', language: 'en', title: 'Apple expands program' };
  assert.equal(await markets.headline(article), '');
  assert.equal(markets.translations.has('a1'), false);
  assert.equal(await markets.headline(article), '苹果扩大开发者计划');
  assert.equal(markets.translations.has('a1'), true);
  assert.equal(calls, 2);
});

test('background pause errors do not trigger Google News cooldown', async t => {
  globalThis.window = {
    __niulaiResult: niulaiResult,
    NiulaiNative: {
      request(id) {
        setTimeout(() => niulaiResult(id, null, '刷新已暂停'), 5);
      }
    }
  };
  t.after(() => { delete globalThis.window; });
  const markets = Object.assign(Object.create(MobileMarkets.prototype), {
    feeds: new Map(),
    aliases: new Map(),
    translations: new Map(),
    googleCooldownUntil: 0,
    active: true,
    news: { active: true, resource: { cache: new Map(), key: '' } }
  });
  await assert.rejects(() => markets.loadNews({ code: 'gb_aapl', name: 'Apple' }), /新闻源暂不可用/);
  assert.equal(markets.googleCooldownUntil, 0);
});
