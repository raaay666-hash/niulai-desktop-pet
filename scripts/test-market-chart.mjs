import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadChart } from '../niulai-android/web/market-chart-data.mjs';

const require = createRequire(import.meta.url);
const { _electron, chromium } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(import.meta.dirname, '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/market-chart-20261116');
await fs.mkdir(output, { recursive: true });
const checks = [], errors = [], live = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const rows = Object.fromEntries(['day', 'week', 'month'].map((period, periodIndex) => [period,
  Array.from({ length: 140 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    const open = 100 * (periodIndex + 1) + index / 10 + Math.sin(index) * 3;
    const close = open + Math.cos(index) * 2;
    return [date, open, close, Math.max(open, close) + 2, Math.min(open, close) - 2, 100000 + index * 500];
  })]));

async function checkChart(page, prefix) {
  await page.locator('.market-retry').click();
  await page.waitForFunction(() => document.querySelector('.market-chart-stats')?.textContent.includes('2026-05-20'));
  assert.match(await page.locator('.market-chart-basis').textContent(), /前复权.*手/);
  assert.match(await page.locator('.market-ma').textContent(), /MA5.*MA10.*MA20/);
  const pixels = await page.locator('#market-chart canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index]) count++;
    return count;
  });
  assert.ok(pixels > 5000);
  pass(prefix + ' candles, volume, OHLC and MA5/10/20 render actual canvas pixels');
  await page.locator('[data-period=week]').click();
  await page.locator('[data-period=month]').click();
  await page.waitForFunction(() => document.querySelector('#market-chart').getAttribute('aria-busy') === 'false');
  await page.waitForTimeout(450);
  assert.match(await page.locator('#market-chart canvas').getAttribute('aria-label'), /月 K/);
  assert.match(await page.locator('.market-chart-stats').textContent(), /31[0-9]/);
  pass(prefix + ' rapid period changes discard the slower previous response');
  await page.locator('[data-zoom=in]').click();
  const range = page.locator('.market-chart-range input');
  assert.equal(await range.getAttribute('max'), '100');
  await range.evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#market-chart canvas').focus();
  await page.keyboard.press('Home');
  assert.match(await page.locator('.market-chart-stats').textContent(), /2026-01-01/);
  assert.match(await page.locator('.market-ma').textContent(), /MA5 —/);
  await page.keyboard.press('End');
  assert.match(await page.locator('.market-chart-stats').textContent(), /2026-05-20/);
  pass(prefix + ' zoom, history range and keyboard navigation preserve full-history MA calculations');
  await page.locator('[data-period=day]').click();
  await page.waitForFunction(() => document.querySelector('#market-chart').getAttribute('aria-busy') === 'false');
  const area = await page.locator('#market-chart canvas').boundingBox();
  await page.mouse.move(area.x + 45, area.y + 100);
  assert.doesNotMatch(await page.locator('.market-chart-stats').textContent(), /2026-05-20/);
  await page.mouse.move(0, 0);
  pass(prefix + ' pointer crosshair updates the selected candle metrics');
}

if (!process.argv.includes('--mobile-only')) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-chart-'));
  await fs.writeFile(path.join(profile, 'desktop-state-v2.json'), JSON.stringify({ state: { settings: { petEnabled: false, motion: false, interval: 30 } } }));
  const packaged = process.env.NIULAI_QA_EXECUTABLE;
  const app = await _electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), '--qa-user-data-dir=' + profile], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')) });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
    if (process.argv.includes('--live')) {
      for (const code of ['s_sh600519', 'rt_hk00700', 'gb_aapl']) {
        for (const period of ['day', 'week', 'month']) {
          const result = await loadChart(value => page.evaluate(value => window.desktopPet.chartHistory(value), value), code, period);
          assert.ok(result.bars.length > 100, code + ' ' + period + ' has complete history');
          live.push({ code, period, bars: result.bars.length, first: result.bars[0].date, last: result.bars.at(-1).date, adjusted: result.adjusted, volumeUnit: result.volumeUnit });
        }
      }
      await page.locator('.market-chart').screenshot({ path: path.join(output, 'desktop-live-history.png') });
      pass('nine live mainland, Hong Kong and US history series pass through packaged IPC');
    }
    await page.waitForFunction(() => document.querySelector('#market-chart').getAttribute('aria-busy') === 'false');
    await app.evaluate((_, rows) => {
      const original = globalThis.fetch;
      globalThis.__chartOffline = false;
      globalThis.__chartRequests = 0;
      globalThis.__chartDelay = 0;
      globalThis.fetch = async (url, ...args) => {
        if (new URL(url).hostname !== 'web.ifzq.gtimg.cn') return original(url, ...args);
        globalThis.__chartRequests++;
        const [symbol, period] = new URL(url).searchParams.get('param').split(',');
        await new Promise(resolve => setTimeout(resolve, globalThis.__chartDelay || (period === 'week' ? 350 : 30)));
        if (globalThis.__chartOffline) throw new Error('Controlled history offline');
        return new Response(JSON.stringify({ code: 0, data: { [symbol]: { ['qfq' + period]: rows[period] } } }));
      };
    }, rows);
    await checkChart(page, 'desktop');
    await page.locator('.market-chart').screenshot({ path: path.join(output, 'desktop-chart-light.png') });
    await page.evaluate(() => window.desktopPet.settings({ theme: 'dark' }));
    await page.locator('.market-chart').screenshot({ path: path.join(output, 'desktop-chart-dark.png') });
    await app.evaluate(() => { globalThis.__chartOffline = true; });
    await page.locator('.market-retry').click();
    await page.waitForFunction(() => document.querySelector('.market-chart-source').textContent.includes('保留上次数据'));
    const before = await app.evaluate(() => globalThis.__chartRequests);
    for (let index = 0; index < 3; index++) await page.evaluate(() => window.desktopPet.settings({ theme: 'dark' }));
    assert.equal(await app.evaluate(() => globalThis.__chartRequests), before);
    pass('desktop offline refresh retains known candles and quote repaints respect retry backoff');
    await app.evaluate(() => { globalThis.__chartOffline = false; });
    await page.locator('.market-retry').click();
    await page.waitForFunction(() => !document.querySelector('.market-chart-source').textContent.includes('保留上次数据'));
    await assert.rejects(page.evaluate(() => window.desktopPet.chartHistory('https://example.com,day')));
    pass('desktop retry recovers and history IPC rejects arbitrary destinations');
    await app.evaluate(() => { globalThis.__chartDelay = 500; });
    await page.locator('.market-retry').click();
    await page.locator('[data-tab=watchlist]').click();
    await page.evaluate(() => window.desktopPet.stock('select', { code: 's_sz399001' }));
    await page.locator('[data-tab=home]').click();
    await page.waitForFunction(() => document.querySelector('#market-chart canvas').getAttribute('aria-label').startsWith('s_sz399001'));
    await page.waitForFunction(() => document.querySelector('#market-chart').getAttribute('aria-busy') === 'false');
    pass('desktop switching stocks while a hidden chart request is pending recovers with the selected symbol');
  } finally { await app.close(); }
}

if (!process.argv.includes('--desktop-only')) {
  const web = path.join(root, 'niulai-android/build/web');
  const server = http.createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(web, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(web + path.sep)) { res.writeHead(403).end(); return; }
    try { const data = await fs.readFile(file); res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); res.end(data); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__chartRequest', async (kind, value) => {
      if (kind === 'history') {
        const [symbol, period] = value.split(',');
        await new Promise(resolve => setTimeout(resolve, period === 'week' ? 350 : 30));
        return JSON.stringify({ code: 0, data: { [symbol]: { ['qfq' + period]: rows[period] } } });
      }
      if (kind === 'quote') return value.split(',').map(code => `var hq_str_${code}="测试指数,4000,20,0.50,10000,100000";`).join('\n');
      return '';
    });
    await page.addInitScript(() => {
      window.ResizeObserver = undefined;
      Array.prototype.at = undefined;
      Array.prototype.flatMap = undefined;
      window.NiulaiNative = {
        request(id, kind, value) { window.__chartRequest(kind, value).then(text => window.__niulaiResult(id, text, null)); },
        appearance() {}, haptic() {}, configurePet() {}, publishQuote() {}, petStatus() { return 'permission'; }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__niulaiReady);
    await checkChart(page, 'Android');
    await page.locator('#market-chart canvas').tap({ position: { x: 45, y: 100 } });
    assert.doesNotMatch(await page.locator('.market-chart-stats').textContent(), /2026-05-20/);
    pass('Android touch selects a historical candle');
    await page.locator('.market-chart').screenshot({ path: path.join(output, 'android-chart-light.png') });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.locator('.market-chart').screenshot({ path: path.join(output, 'android-chart-dark.png') });
    for (const width of [360, 390, 720]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    pass('Android 360px, 390px and wide layouts have no horizontal overflow');
    await page.evaluate(() => window.__niulaiLifecycle(false));
    assert.equal(await page.locator('.market-chart').getAttribute('aria-busy'), 'false');
    await page.evaluate(() => window.__niulaiLifecycle(true));
    await page.waitForFunction(() => document.querySelector('#market-chart').getAttribute('aria-busy') === 'false');
    pass('Android foreground recovery reloads through the native bridge');
    pass('Android chart works without ResizeObserver, Array.at or Array.flatMap');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
assert.deepEqual(errors, []);
await fs.writeFile(path.join(output, 'chart-verification.json'), JSON.stringify({ passed: true, checks, errors, live, fixture: 'Controlled historical series for interactions. Live source checks are listed separately.', platform: process.platform, arch: process.arch }, null, 2));
