import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const web = path.resolve(import.meta.dirname, '../build/web');
const output = process.env.NIULAI_QA_OUTPUT || path.resolve(import.meta.dirname, '../../outputs/ui-20261121/android');
await fs.mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(web + path.sep)) return response.writeHead(403).end();
  try { response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [], checks = [], calls = [], quoteStarts = [];
let quoteLatency = 0, quoteLimited = false;
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const fixtures = Array.from({ length: 155 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10);
  const begin = 100 + .5 * index + Math.sin(index / 2) * 4;
  const end = begin + Math.cos(index) * 2;
  return [date, begin, end, Math.max(begin, end) + 2, Math.min(begin, end) - 2, 100000 + 480 * index];
});
const date = '2026-11-20';
const published = new Date(Date.now() - 40000).toUTCString();
page.on('pageerror', error => errors.push(error.message));
await page.exposeFunction('__request', async (kind, value) => {
  calls.push([kind, value]);
  if (kind === 'quote') {
    quoteStarts.push(performance.now());
    if (quoteLimited) return { error: '行情源暂时限流' };
    if (quoteLatency) await new Promise(resolve => setTimeout(resolve, quoteLatency));
    const fields = ['苹果', '175.42', '1.45', date + ' 23:25:00', '2.49'];
    fields[25] = 'Nov 20 10:25AM EST'; fields[26] = '172.93';
    return `var hq_str_gb_aapl="${fields.join(',')}";var hq_str_s_sh600519="贵州茅台,1500.87,2,0.13,100,100";`;
  }
  if (kind === 'history') {
    const [symbol, period, adjustment] = value.split(',');
    const key = adjustment === 'raw' ? period : 'qfq' + period;
    return JSON.stringify({ code: 0, data: { [symbol]: { [key]: fixtures } } });
  }
  if (kind === 'minutes') {
    if (value === 's_sh600519') {
      const symbol = 'sh600519', quote = [];
      quote[4] = '1498.87'; quote[30] = '20261120150000';
      const points = ['0930 1499.32 1400', '0931 1501.23 2500', '0932 1500.87 3100', '1300 1501.01 9300', '1301 1500.87 10305'];
      return JSON.stringify({ code: 0, data: { [symbol]: { data: { date: '20261120', data: points }, qt: { [symbol]: quote } } } });
    }
    const start = Date.parse(date + 'T14:30:00Z') / 1000;
    const prices = Array.from({ length: 34 }, (_, index) => 173 + index * .06 + Math.sin(index / 3) * .5);
    return JSON.stringify({ chart: { result: [{
      meta: { symbol: 'AAPL', exchangeTimezoneName: 'America/New_York', chartPreviousClose: 172.93, tradingPeriods: [[{ start, end: start + 390 * 60 }]] },
      timestamp: prices.map((_, index) => start + index * 60), indicators: { quote: [{ close: prices, volume: prices.map((_, index) => 900 + index * 44) }] }
    }] } });
  }
  if (kind === 'book') {
    const fields = ['200', value === 'usAAPL' ? '苹果' : '贵州茅台', value, '175.42', '172.93', '173.15', '501300'];
    fields[9] = '1480.50'; fields[10] = '250'; fields[19] = '1480.53'; fields[20] = '500';
    fields[30] = date + ' 10:25:30'; fields[33] = '177.25'; fields[34] = '170.15'; fields[37] = '17500000';
    return `v_${value}="${fields.join('~')}";`;
  }
  if (kind === 'news-feed') {
    const url = new URL(value), region = url.searchParams.get('gl');
    if (url.hostname === 'search-api-web.eastmoney.com') {
      return 'niulaiNews(' + JSON.stringify({ code: 0, result: { cmsArticleWebOld: [{
        title: '贵州茅台发布经营公告', url: 'https://finance.eastmoney.com/a/123.html', mediaName: '东方财富', date: date + ' 10:00:00'
      }] } }) + ')';
    }
    const feed = {
      US: ['Reuters', 'reuters.com', 'Apple expands its developer program'],
      JP: ['日本経済新聞', 'nikkei.com', 'アップルが開発者支援を拡大'],
      FR: ['Les Échos', 'lesechos.fr', 'Apple élargit son programme de développement'],
      DE: ['Handelsblatt', 'handelsblatt.com', 'Apple baut sein Entwicklerprogramm aus']
    }[region] || ['Yahoo Finance', 'finance.yahoo.com', 'Apple shares gain after product news'];
    return `<rss><channel><item><title>${feed[2]} - ${feed[0]}</title><link>https://news.google.com/rss/articles/${region || 'Yahoo'}</link><source url="https://${feed[1]}">${feed[0]}</source><pubDate>${published}</pubDate></item></channel></rss>`;
  }
  if (kind === 'news-translation') {
    const { searchParams } = new URL(value);
    const translated = searchParams.get('tl') === 'en' ? 'Apple Inc.' : searchParams.get('tl') === 'ja' ? 'アップル株式会社' : '苹果扩大开发者支持计划';
    return JSON.stringify([[[translated]]]);
  }
  return '';
});
await page.addInitScript(() => {
  Array.prototype.at = undefined;
  Array.prototype.flat = undefined;
  Object.hasOwn = undefined;
  window.ResizeObserver = undefined;
  localStorage.setItem('niulai:android:v1', localStorage.getItem('niulai:android:v1') || JSON.stringify({
    stocks: [{ code: 'gb_aapl', name: '苹果' }, { code: 's_sh600519', name: '贵州茅台' }], selected: 'gb_aapl', motion: false, scene: 0, smartScene: false
  }));
  window.NiulaiNative = {
    request(id, kind, value) {
      window.__request(kind, value).then(result => typeof result === 'string'
        ? window.__niulaiResult(id, result, null) : window.__niulaiResult(id, null, result.error));
    },
    haptic() {}, appearance() {}, configurePet() {}, publishQuote() {}, petStatus() { return 'permission'; },
    openNewsArticle(url) { window.__article = url; return true; },
    newsPermission() { return Boolean(window.__permission); },
    updatePermission() { window.__permission = true; },
    showStockNews(code, title) { window.__notification = [code, title]; return window.__permission; }
  };
});

let passed = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__niulaiReady);
  const chart = page.locator('#market-chart'), news = page.locator('#market-news');
  await chart.locator('.market-chart-stats b').first().waitFor();
  await page.waitForFunction(() => document.getElementById('price').textContent !== '—');
  assert.equal(await chart.evaluate(section => section.previousElementSibling.id), 'market-book-panel');
  assert.equal(await news.evaluate(section => section.previousElementSibling.id), 'market-chart');
  await chart.locator('.market-adjustment').selectOption('raw');
  await page.waitForFunction(() => document.querySelector('.market-chart-basis').textContent.startsWith('不复权'));
  await chart.locator('[data-period=minute]').tap();
  await chart.locator('.market-chart-stats').getByText('分时量').waitFor();
  await chart.locator('canvas').tap({ position: { x: 12, y: 55 } });
  assert.match(await chart.locator('.market-chart-stats').textContent(), /09:3[0-9]/);
  await page.locator('#app-content').evaluate(scroller => { scroller.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, '手机-盯盘.png') });
  pass('390dp chart periods, unadjusted history and touch crosshair with old WebView compatibility features disabled');

  await page.locator('#show-news').tap();
  await news.locator('[data-news-scope=international]').tap();
  await news.locator('.market-news-original:visible').first().waitFor();
  await news.getByText('アップルが開発者支援を拡大', { exact: true }).waitFor();
  await news.locator('li').first().locator('button').tap();
  assert.match(await page.evaluate(() => window.__article), /^https:\/\/news\.google\.com\/rss\/articles\//);
  await page.screenshot({ path: path.join(output, '手机-国际新闻.png') });
  await news.locator('.market-news-follow').tap();
  await news.locator('summary').tap();
  await news.locator('.market-news-translate').uncheck();
  assert.equal(await news.locator('.market-news-original:visible').count(), 0);
  await news.locator('.market-news-notify').check();
  await news.locator('.market-news-test').tap();
  await news.getByText('已发送测试通知', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__permission), true);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('niulai:android:v1')).news.followed), ['gb_aapl']);
  pass('bilingual newsroom, translation preference, stock following and native notification bridge');

  await page.locator('[data-tab=watchlist]').tap();
  await page.locator('#watch-stocks .stock-row').filter({ hasText: '贵州茅台' }).locator('.stock-main').tap();
  await page.waitForFunction(() => document.querySelector('.market-news-context').textContent === '贵州茅台');
  await page.locator('#show-book').tap();
  await page.locator('#market-book-panel').getByText('公开五档', { exact: true }).waitFor();
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [430, 932], [840, 860], [844, 390], [280, 512]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(width => document.documentElement.clientWidth === width, width);
    const layout = await page.locator('#app-content').evaluate(scroller => [scroller.clientWidth, scroller.scrollWidth]);
    assert.ok(layout[1] <= layout[0], `overflow at ${width}×${height}: ${layout.join('/')}`);
  }
  await page.locator('#device-help').tap();
  await page.locator('#cover-preview').tap();
  assert.equal(await chart.isVisible(), false);
  assert.equal(await news.isVisible(), false);
  await page.screenshot({ path: path.join(output, '折叠外屏.png') });
  await page.setViewportSize({ width: 840, height: 860 });
  await page.locator('#cover-exit').tap();
  await page.waitForFunction(() => !document.documentElement.classList.contains('cover'));
  assert.equal(await chart.isVisible(), true);
  await page.evaluate(() => window.__niulaiFolds([{ left: 411, right: 429, top: 0, bottom: 860 }]));
  await page.waitForFunction(() => document.documentElement.dataset.fold === 'book');
  const split = await page.evaluate(() => [document.querySelector('.home-left').getBoundingClientRect().right, document.querySelector('.home-right').getBoundingClientRect().left]);
  assert.ok(split[0] <= 411 && split[1] >= 429);
  await page.locator('#app-content').evaluate(scroller => { scroller.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, '折叠内屏.png') });

  await page.evaluate(() => {
    Date.now = () => Date.parse('2026-11-20T15:30:00Z');
    window.refreshMutations = 0;
    new MutationObserver(records => { window.refreshMutations += records.length; })
      .observe(document.getElementById('refresh'), { attributes: true, childList: true });
  });
  await page.locator('#settings-open').tap();
  await page.locator('[data-settings=general]').tap();
  await page.locator('#interval').selectOption('1');
  await page.locator('#theme').selectOption('dark');
  await page.locator('#settings-dialog .close-dialog').tap();
  const start = quoteStarts.length;
  const fastDeadline = performance.now() + 6000;
  while (quoteStarts.length < start + 3 && performance.now() < fastDeadline) await page.waitForTimeout(60);
  assert.ok(quoteStarts.length >= start + 3);
  for (let i = start + 1; i < start + 3; i++) {
    const delay = quoteStarts[i] - quoteStarts[i - 1];
    assert.ok(delay >= 980 && delay < 2100, `Expected one-second polling, observed ${delay}ms`);
  }
  assert.equal(await page.evaluate(() => window.refreshMutations), 0);
  await page.locator('#app-content').evaluate(scroller => { scroller.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, '折叠内屏-深色.png') });
  quoteLatency = 600;
  await page.locator('#refresh').tap();
  assert.equal(await page.locator('#refresh').getAttribute('aria-busy'), 'true');
  await page.locator('#refresh[aria-busy=false]').waitFor();
  const limited = quoteStarts.length;
  quoteLimited = true;
  await page.locator('#connection-text').filter({ hasText: '行情源暂时限流' }).waitFor();
  const retryDeadline = performance.now() + 6500;
  while (quoteStarts.length < limited + 2 && performance.now() < retryDeadline) await page.waitForTimeout(60);
  assert.ok(quoteStarts[limited + 1] - quoteStarts[limited] >= 1950);
  assert.equal(await page.locator('#refresh').getAttribute('aria-busy'), 'false');
  pass('one-second foreground polling leaves the manual button untouched and backs off on HTTP 429');

  await page.evaluate(() => window.__niulaiLifecycle(false));
  const before = calls.length;
  await page.waitForTimeout(1300);
  assert.equal(calls.length, before);
  assert.deepEqual(errors, []);
  pass('stock changes, genuine displayed levels, 280–844dp layouts and paused lifecycle with zero page errors');
  passed = true;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.writeFile(path.join(output, 'browser-verification.json'), JSON.stringify({ passed, checks, errors }, null, 2));
}
