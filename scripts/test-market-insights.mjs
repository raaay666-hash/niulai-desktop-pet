import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadChart } from '../niulai-android/web/market-chart-data.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(import.meta.dirname, '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/market-insights-20261120');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-insights-'));
const stocks = [
  { code: 's_sh600519', name: '贵州茅台' },
  { code: 'rt_hk00700', name: '腾讯控股' },
  { code: 'gb_aapl', name: '苹果' }
];
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(profile, 'desktop-state-v2.json'), JSON.stringify({
  state: { stocks, selected: stocks[0].code, settings: { petEnabled: false, motion: false, interval: 30, theme: 'light' } }
}));

const checks = [], errors = [], live = [], auth = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
const date = '2026-11-20';
const book = {
  unit: '股', timestamp: date + 'T15:00:00Z',
  bids: [{ price: 99, size: 50 }, { price: 100.125, size: 180 }, { price: 0, size: 30 }],
  asks: [{ price: 100.25, size: 100 }]
};
let brokenSeries = false;
const api = http.createServer((request, response) => {
  auth.push(request.headers.authorization);
  const url = new URL(request.url, 'http://localhost');
  const symbol = url.searchParams.get('symbol');
  const period = url.searchParams.get('period');
  const adjustment = url.searchParams.get('adjustment');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/quote') {
    response.end(JSON.stringify({ symbol, name: '苹果', price: 100.125, previousClose: 100, timestamp: new Date().toISOString(),
      session: 'regular', open: 99, high: 101.25, low: 98, volume: 500, volumeUnit: '股', amount: 50500, orderBook: book }));
  } else if (brokenSeries) {
    response.writeHead(503).end('{}');
  } else if (period === 'minute') {
    response.end(JSON.stringify({ symbol, period, adjustment, volumeUnit: '股', date, previousClose: 100,
      session: { open: '09:30', close: '16:00' }, points: [{ time: '09:30', price: 100, volume: 50 }, { time: '10:00', price: 100.125, volume: 180 }] }));
  } else {
    response.end(JSON.stringify({ symbol, period, adjustment, volumeUnit: '股',
      bars: [{ date, open: 100, high: 102, low: 99, close: adjustment === 'raw' ? 101 : 100.125, volume: 350 }] }));
  }
});

let app, completed = false, nativeNotification = null;
try {
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const packaged = process.env.NIULAI_QA_EXECUTABLE;
  app = await _electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), '--qa-user-data-dir=' + profile],
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  const select = code => page.evaluate(value => window.desktopPet.stock('select', { code: value }), code);
  const idle = selector => page.waitForFunction(value => document.querySelector(value).getAttribute('aria-busy') === 'false', selector);
  const chart = page.locator('#market-chart');
  const detail = page.locator('#market-details');
  const news = page.locator('#market-news');
  const sectionOrder = await page.locator('#market-chart, #market-details, #market-news')
    .evaluateAll(sections => sections.map(section => section.id));
  assert.deepEqual(sectionOrder, ['market-chart', 'market-details', 'market-news']);
  const readyChart = text => page.waitForFunction(value =>
    document.querySelector('#market-chart').getAttribute('aria-busy') === 'false' && document.querySelector('.market-chart-source').textContent.includes(value), text);

  if (process.argv.includes('--native-toast')) {
    await page.evaluate(() => window.desktopPet.newsPreferences('notifications', true));
    nativeNotification = await page.evaluate(() => window.desktopPet.newsPreferences('test'));
    await page.evaluate(() => window.desktopPet.newsPreferences('notifications', false));
    console.log('Native Windows notification show event: ' + nativeNotification);
  }

  if (process.argv.includes('--live')) {
    for (const { code } of stocks) {
      const [minute, details, headlines, raw, adjusted] = await Promise.all([
        page.evaluate(code => window.desktopPet.chartMinutes(code), code),
        page.evaluate(code => window.desktopPet.marketDetails(code), code),
        page.evaluate(code => window.desktopPet.marketNews('stock', code, true), code),
        loadChart(value => page.evaluate(value => window.desktopPet.chartHistory(value + ',raw'), value), code, 'day'),
        loadChart(value => page.evaluate(value => window.desktopPet.chartHistory(value), value), code, 'day')
      ]);
      assert.ok(minute.points.length > 10, code + ' has sufficient minute history');
      assert.ok(details.open > 0 && details.high >= details.low && Number.isFinite(details.quotedAt), code + ' real quote snapshot');
      assert.equal(Boolean(details.book), code.startsWith('s_'), code + ' depth coverage');
      assert.ok(headlines.articles.length > 0, code + ' real news');
      if (code === 'gb_aapl') assert.ok(new Set(headlines.articles.filter(item => item.international).map(item => item.language)).size >= 2, 'live international headlines in multiple languages');
      assert.ok(raw.bars.length > 100 && !raw.adjusted && adjusted.bars.length > 100 && adjusted.adjusted, code + ' raw and adjusted history');
      live.push({ code, minuteSource: minute.source, minutes: minute.points.length, tradingDate: minute.date,
        dateOfLastCandle: raw.bars.at(-1).date, rawBars: raw.bars.length, adjusted: adjusted.adjusted,
        depthPerSide: [details.book?.bids.length || 0, details.book?.asks.length || 0],
        newsSource: headlines.source, headlines: headlines.articles.length, languages: [...new Set(headlines.articles.map(item => item.language))] });
    }
    const market = await page.evaluate(() => window.desktopPet.marketNews('market'));
    assert.ok(market.articles.length > 0);
    await page.locator('[data-period=minute]').click();
    await readyChart('腾讯公开行情');
    await idle('#market-details');
    await idle('#market-news');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, '盯盘-浅色.png') });
    await chart.screenshot({ path: path.join(output, '分时.png') });
    await detail.screenshot({ path: path.join(output, '五档.png') });
    await news.screenshot({ path: path.join(output, '财经新闻.png') });
    await select('gb_aapl');
    await page.locator('[data-news-scope=international]').click();
    await idle('#market-news');
    await news.locator('.market-news-original:visible').first().waitFor({ timeout: 20000 });
    await news.screenshot({ path: path.join(output, '国际媒体与翻译.png') });
    await page.locator('[data-period=day]').click();
    await readyChart('腾讯公开行情');
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#market-chart').getBoundingClientRect().top + scrollY - 15));
    await page.screenshot({ path: path.join(output, 'K线与新闻.png') });
    await select(stocks[0].code);
    await page.evaluate(() => window.desktopPet.settings({ theme: 'dark' }));
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, '盯盘-深色.png') });
    pass('live minute charts, raw and adjusted daily history, details and news on three markets');
  }

  await app.evaluate(({ shell, Notification }) => {
    const original = globalThis.fetch;
    shell.openExternal = async url => { globalThis.__openedArticle = url; };
    globalThis.__newsToasts = [];
    Notification.prototype.show = function () {
      if (globalThis.__failNewsToast) {
        globalThis.__failedNewsToasts = (globalThis.__failedNewsToasts || 0) + 1;
        this.emit('failed');
        return;
      }
      globalThis.__newsToasts.push(this);
      this.emit('show');
    };
    globalThis.__stockHeadline = 'Apple quarterly update';
    globalThis.fetch = async (url, options) => {
      const address = new URL(url);
      if (address.hostname === 'feed.mix.sina.com.cn') {
        return new Response(JSON.stringify({ result: { status: { code: 0 }, data: [
          { title: '市场 &amp; 产业新闻', media_name: '测试媒体', ctime: Math.floor(Date.now() / 1000), url: 'https://finance.sina.com.cn/example' },
          { title: '市场 &amp; 产业新闻', ctime: Math.floor(Date.now() / 1000), url: 'https://finance.sina.com.cn/duplicate' },
          { title: '危险链接', ctime: Math.floor(Date.now() / 1000), url: 'file:///C:/example' }
        ] } }));
      }
      if (address.hostname === 'query1.finance.yahoo.com') {
        const date = '2026-11-20', start = Date.parse(date + 'T14:30:00Z') / 1000;
        return new Response(JSON.stringify({ chart: { result: [{
          meta: { symbol: 'AAPL', exchangeTimezoneName: 'America/New_York', chartPreviousClose: 100,
            tradingPeriods: [[{ start, end: start + 390 * 60 }]] },
          timestamp: [start, start + 60],
          indicators: { quote: [{ close: [100, 101], volume: [10, 20] }] }
        }] } }));
      }
      if (address.hostname === 'news.google.com') {
        const locale = address.searchParams.get('gl');
        const labels = { US: ['Reuters', 'reuters.com', 'Apple latest market report'], JP: ['日本経済新聞', 'nikkei.com', 'アップルの株価動向'],
          FR: ['Les Échos', 'lesechos.fr', 'Les actions Apple progressent'], DE: ['Handelsblatt', 'handelsblatt.com', 'Apple-Aktie im Handel'] };
        const [publisher, host, title] = labels[locale];
        return new Response('<rss><channel><item><title>' + title + ' - ' + publisher + '</title>' +
          '<link>https://news.google.com/rss/articles/' + locale + '</link><source url="https://' + host + '">' + publisher + '</source>' +
          '<pubDate>' + new Date(Date.now() - 10000).toUTCString() + '</pubDate></item></channel></rss>');
      }
      if (address.hostname === 'translate.googleapis.com') {
        const target = address.searchParams.get('tl');
        const translation = target === 'en' ? 'Apple Inc.' : target === 'ja' ? 'アップル株式会社' : '苹果股价最新报道';
        return new Response(JSON.stringify([[ [translation] ]]));
      }
      if (address.hostname === 'feeds.finance.yahoo.com') {
        const title = globalThis.__stockHeadline;
        const published = new Date(Date.now() - 1000).toUTCString();
        return new Response('<rss><channel><item><title>' + title + '</title><link>https://finance.yahoo.com/news/' + encodeURIComponent(title) +
          '</link><pubDate>' + published + '</pubDate></item></channel></rss>');
      }
      return original(url, options);
    };
  });
  await assert.rejects(page.evaluate(() => window.desktopPet.openNews('https://example.com')));
  await assert.rejects(page.evaluate(() => window.desktopPet.chartMinutes(null)));
  const { parseNews, newsNotificationBatch } = require('../main-modules/market-news.cjs');
  const headersOnly = parseNews('<rss><channel><item><title><![CDATA[A &amp; B]]></title><description>ignored</description>'
    + '<link>https://finance.yahoo.com/article?x=1&amp;y=2</link><pubDate>Fri, 20 Nov 2026 14:00:00 GMT</pubDate></item>'
    + '<item><title>Old index page</title><link>https://finance.yahoo.com/old</link><pubDate>Fri, 20 Nov 2025 14:00:00 GMT</pubDate></item></channel></rss>',
  'yahoo', Date.parse(date + 'T15:00:00Z'));
  assert.equal(headersOnly.length, 1);
  assert.equal(headersOnly[0].title, 'A & B');
  assert.match(headersOnly[0].url, /x=1&y=2/);
  assert.deepEqual(Object.keys(headersOnly[0]).sort(), ['id', 'international', 'language', 'publishedAt', 'publisher', 'title', 'url']);
  await app.evaluate(() => {
    globalThis.__realNow = Date.now;
    Date.now = () => globalThis.__realNow() + 600000;
  });
  await page.locator('[data-news-scope=market]').click();
  await idle('#market-news');
  await app.evaluate(() => { Date.now = globalThis.__realNow; });
  assert.match(await news.locator('.market-news-context').textContent(), /市场动态/);
  assert.equal(await news.locator('li').count(), 1);
  await news.getByRole('button', { name: /市场 & 产业新闻/ }).click();
  assert.equal(await app.evaluate(() => globalThis.__openedArticle), 'https://finance.sina.com.cn/example');
  pass('news parses RSS and JSON, removes duplicated headlines and rejects unsupported links');

  await select('gb_aapl');
  const quoteUrl = `http://127.0.0.1:${api.address().port}/quote?symbol={symbol}`;
  const seriesUrl = `http://127.0.0.1:${api.address().port}/series?symbol={symbol}&period={period}&adjustment={adjustment}`;
  const token = 'local-test-key';
  const configuration = { mode: 'custom', name: '授权测试行情', url: quoteUrl, seriesUrl, markets: ['us'], authType: 'bearer', token };
  const testSource = input => page.evaluate(input => window.desktopPet.quoteSource('test', input), input);
  const saveSource = input => page.evaluate(input => window.desktopPet.quoteSource('save', input), input);
  await assert.rejects(testSource({ ...configuration, seriesUrl: 'https://example.com/{period}' }), /相同/);
  const tested = await testSource(configuration);
  assert.equal(tested.series.bars, 1);
  assert.equal(tested.quote.details.book.bids[0].size, 180);
  await saveSource(configuration);
  await page.locator('[data-period=day]').click();
  await readyChart('授权测试行情');
  await page.locator('.market-adjustment').selectOption('raw');
  await page.waitForFunction(() => document.querySelector('.market-chart-stats').textContent.includes('101.00'));
  assert.match(await chart.locator('.market-chart-basis').textContent(), /不复权/);
  await detail.locator('table.market-book-bid').waitFor();
  assert.match(await detail.locator('table.market-book-bid tbody tr').first().textContent(), /100\.125/);
  await page.locator('[data-period=minute]').click();
  await readyChart('授权测试行情');
  await chart.locator('canvas').focus();
  await page.keyboard.press('Home');
  assert.match(await chart.locator('.market-chart-stats').textContent(), /09:30/);
  await page.keyboard.press('End');
  assert.match(await chart.locator('.market-chart-stats').textContent(), /10:00/);
  assert.ok(auth.every(value => value === 'Bearer ' + token));
  pass('custom quote, book, both adjustment modes and minute series share validated credentials');

  brokenSeries = true;
  await chart.locator('.market-retry').click();
  await readyChart('保留上次数据');
  assert.doesNotMatch(await chart.locator('.market-chart-source').textContent(), /回退/);
  await saveSource({ ...configuration, fallback: true });
  await readyChart('自有源回退');
  assert.match(await chart.locator('.market-chart-source').textContent(), /Yahoo Finance/);
  pass('offline chart retains the last series and falls back only after explicit configuration');

  await page.locator('#show-market-news').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'market-news-title');
  assert.equal(await page.locator('[data-news-scope=stock]').getAttribute('aria-pressed'), 'true');

  await app.evaluate(() => { Date.now = () => globalThis.__realNow() + 600000; });
  await page.locator('[data-news-scope=international]').click();
  await news.locator('.market-news-refresh').click();
  await idle('#market-news');
  await news.getByText('アップルの株価動向', { exact: true }).waitFor();
  await news.locator('.market-news-original:visible').first().waitFor();
  assert.match(await news.textContent(), /Reuters.*日本経済新聞|日本経済新聞.*Reuters/s);
  await news.locator('summary').click();
  await news.locator('.market-news-translate').uncheck();
  await page.waitForFunction(() => ![...document.querySelectorAll('.market-news-original')].some(node => !node.hidden));
  await news.locator('.market-news-translate').check();
  await news.locator('.market-news-original:visible').first().waitFor();
  await news.locator('.market-news-follow').click();
  await page.waitForFunction(() => document.querySelector('.market-news-follow').getAttribute('aria-pressed') === 'true');
  await news.locator('.market-news-notify').check();
  const profileFile = path.join(profile, 'desktop-state-v2.json');
  const baseline = async () => JSON.parse(await fs.readFile(profileFile, 'utf8')).newsCursors.gb_aapl;
  for (let attempt = 0; attempt < 60 && !await baseline(); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(await baseline(), 'first news check establishes baseline');
  assert.equal(await app.evaluate(() => globalThis.__newsToasts.length), 0, 'first subscription does not notify old stories');
  await news.locator('.market-news-test').click();
  await news.getByText('已发送测试通知').waitFor();
  await app.evaluate(({ powerMonitor }) => {
    Date.now = () => globalThis.__realNow() + 1200000;
    globalThis.__stockHeadline = 'Apple announces a fresh update';
    globalThis.__failNewsToast = true;
    powerMonitor.emit('resume');
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await app.evaluate(() => globalThis.__failedNewsToasts > 0)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await app.evaluate(() => globalThis.__failedNewsToasts), 1, 'the first delivery was rejected');
  await app.evaluate(({ powerMonitor }) => {
    globalThis.__failNewsToast = false;
    powerMonitor.emit('resume');
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await app.evaluate(() => globalThis.__newsToasts.length) >= 2) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await app.evaluate(() => globalThis.__newsToasts.length), 2, 'failed delivery retries only the new headline');
  await app.evaluate(() => globalThis.__newsToasts.at(-1).emit('click'));
  await page.waitForFunction(() => document.activeElement.id === 'market-news-title');
  const readback = JSON.parse(await fs.readFile(profileFile, 'utf8'));
  assert.deepEqual(readback.state.news.followed, ['gb_aapl']);
  assert.ok(readback.state.news.notifications);
  assert.equal(newsNotificationBatch({ since: Date.now() - 10000, seen: ['already'] }, [{ id: 'already', publishedAt: Date.now() }]).eligible.length, 0);
  pass('bilingual news below K-line, persistent subscriptions, translation toggle, deduplicated new-article notification and click-through');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('index.html')).setContentSize(860, 640));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  pass('stock-specific news shortcut and native narrow layout, with zero renderer errors');
  completed = true;
} finally {
  if (app) await app.close();
  if (api.listening) await new Promise(resolve => api.close(resolve));
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed: completed, checks, errors, live, nativeNotification }, null, 2));
}
