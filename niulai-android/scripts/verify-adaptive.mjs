import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { foldLayout } from '../web/fold-layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'outputs/mobile-adaptive/1.6.2');
await fs.mkdir(output, { recursive: true });

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png',
  '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer(async (request, reply) => {
  const url = new URL(request.url, 'http://localhost');
  const android = url.pathname.startsWith('/app/');
  const dir = path.join(root, android ? 'niulai-android/build/web' : 'niulai-mobile/dist');
  const resource = android ? url.pathname.slice('/app'.length) : url.pathname;
  const file = path.resolve(dir, '.' + resource + (resource.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(dir + path.sep)) { reply.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    reply.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { reply.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const quote = {
  s_sh000001: '上证指数,3412.67,32.18,0.95,10,20',
  s_sz399001: '深证成指,11002.88,-64.19,-0.58,10,20',
  s_sz399006: '创业板指,2510.00,0.00,0.00,10,20'
};

let browser;
try {
  browser = await chromium.launch({ channel: process.env.NIULAI_BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(quoteData => {
    if (!location.pathname.startsWith('/app/')) return;
    window.NiulaiNative = {
      request(id, kind, value) {
        const result = kind === 'quote'
          ? value.split(',').filter(code => quoteData[code] && !window.qaOffline).map(code => 'var hq_str_' + code + '="' + quoteData[code] + '";').join('')
          : '{}';
        queueMicrotask(() => window.__niulaiResult(id, result, null));
      },
      publishWatchQuotes(raw) {
        const cache = JSON.parse(sessionStorage.getItem('qa:quotes') || '{}');
        for (const item of JSON.parse(raw)) cache[item.code] = item;
        sessionStorage.setItem('qa:quotes', JSON.stringify(cache));
      },
      coverQuote(code) { return JSON.stringify(JSON.parse(sessionStorage.getItem('qa:quotes') || '{}')[code] || null); },
      openMain() { window.testOpenedMain = true; },
      appearance() {}, haptic() {}, publishQuote() {}, configurePet() {}
    };
  }, quote);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const box = selector => page.locator(selector).boundingBox();
  const resize = (width, height) => page.setViewportSize({ width, height });
  const shot = name => page.screenshot({ path: path.join(output, name + '.png') });
  async function fits(selector, width, height) {
    const rect = await box(selector);
    assert(rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1
      && rect.y + rect.height <= height + 1, selector + ' overflows ' + width + '×' + height + ' ' + JSON.stringify(rect));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.goto(origin + '/app/');
  await page.waitForFunction(() => document.getElementById('price').textContent.includes('3,412'));
  await page.locator('#edit-position').click();
  await page.locator('#cost').fill('3100');
  await page.locator('#shares').fill('2');
  for (const [width, height] of [[280, 512], [390, 844], [844, 390], [672, 820], [1010, 760]]) {
    await resize(width, height);
    await fits('#position-dialog', width, height);
    assert.equal(await page.locator('#shares').inputValue(), '2');
  }
  await page.locator('#position-form [type=submit]').click();
  assert.match(await page.locator('#home-position').textContent(), /盈亏/);
  console.log('PASS Position draft survives small, tall, landscape, unfolded and tablet viewports');

  await resize(280, 512);
  await page.locator('[data-tab=portfolio]').click();
  await fits('.bottom-nav', 280, 512);
  assert(await page.locator('#portfolio-list .portfolio-item').isVisible());
  await page.locator('[data-tab=watchlist]').click();
  assert(await page.locator('#watch-stocks .remove-stock').first().isVisible());
  await shot('phone-narrow');
  await resize(844, 390);
  assert.equal(await page.locator('.bottom-nav').evaluate(el => getComputedStyle(el).flexDirection), 'column');
  await page.locator('[data-tab=home]').click();
  for (const [width, height] of [[672, 820], [1100, 780]]) {
    await resize(width, height);
    const left = await box('.home-left'), right = await box('.home-right');
    assert(left.x + left.width < right.x, 'Expanded screens should show both columns');
    assert.equal(await page.locator('.home-left').evaluate(el => getComputedStyle(el).overflowY), 'auto');
  }

  await resize(780, 690);
  await page.evaluate(() => window.__niulaiFolds([{ left: 365, right: 401, top: 0, bottom: 690 }]));
  await page.waitForFunction(() => document.documentElement.dataset.fold === 'book');
  const left = await box('.home-left'), right = await box('.home-right');
  assert(left.x + left.width <= 365 && right.x >= 401);
  const positionBeforeScroll = await box('.position-card');
  const leftScroll = await page.locator('.home-left').evaluate(el => { el.scrollTop = 420; return el.scrollTop; });
  assert(leftScroll > 200, 'Chart pane must scroll within the left screen');
  assert.deepEqual(await box('.position-card'), positionBeforeScroll, 'Scrolling the chart pane must keep positions visible');
  await page.locator('.home-left').evaluate(el => { el.scrollTop = 0; });
  await page.locator('#settings-open').click();
  const settings = await box('#settings-dialog');
  assert(settings.x >= 401 && settings.x + settings.width <= 780);
  await page.locator('#settings-dialog .close-dialog').click();
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await shot('phone-book');
  await page.evaluate(() => window.__niulaiFolds([{ left: 0, right: 780, top: 335, bottom: 355 }]));
  await page.waitForFunction(() => document.documentElement.dataset.fold === 'single');
  await fits('.bottom-nav', 780, 335);
  await page.evaluate(() => window.__niulaiFolds([]));
  await page.waitForFunction(() => !document.documentElement.dataset.fold);
  const tri = foldLayout(1100, 760, [
    { left: 350, right: 370, top: 0, bottom: 760 }, { left: 740, right: 760, top: 0, bottom: 760 }
  ]);
  assert.equal(tri.type, 'single');
  assert.equal(tri.left, 370);
  console.log('PASS Book, tabletop and three-pane fold boundaries, with independently scrolling book panes');

  await resize(390, 844);
  await page.locator('#device-help').click();
  await page.locator('#cover-preview').click();
  assert.equal(await page.locator('#view-portfolio').isVisible(), false);
  await page.locator('#cover-next').click();
  assert.equal(await page.locator('#cover-name').textContent(), '深证成指');
  await page.waitForFunction(() => document.getElementById('cover-price').textContent.includes('11,002'));
  await shot('cover-preview-square');
  await page.locator('[data-cover-size=strip]').click();
  assert((await box('#cover-card')).width <= 325);
  await page.locator('#cover-mode').click();
  await page.locator('#cover-pet').click();
  assert.equal(await page.locator('#cover-count').textContent(), '1');
  await shot('cover-preview-strip');
  await page.locator('#cover-exit').click();
  assert.match(await page.locator('#quote-code').textContent(), /399001/);

  await resize(256, 126);
  await page.addInitScript(() => { window.qaOffline = location.hash === '#cover'; });
  await page.goto(origin + '/app/index.html#cover');
  await page.waitForFunction(() => document.getElementById('cover-price').textContent.includes('11,002'));
  await fits('#cover-next', 256, 126);
  await fits('#cover-open', 256, 126);
  await page.locator('#cover-next').click();
  await page.waitForFunction(() => document.getElementById('cover-price').textContent.includes('2,510'));
  assert.match(await page.locator('#cover-status').textContent(), /快照/);
  await shot('cover-narrow-offline');
  await page.locator('#cover-mode').click();
  await fits('#cover-pet', 256, 126);
  await page.locator('#cover-pet').click();
  assert.equal(await page.locator('#cover-count').textContent(), '2');
  await page.locator('#cover-open').click();
  assert(await page.evaluate(() => window.testOpenedMain));
  assert.equal(await page.locator('#cover-tools').isVisible(), false);
  await shot('cover-narrow-wood');
  console.log('PASS Cover previews, per-symbol offline snapshot, 256×126 launcher and wood counter');

  const cdp = await context.newCDPSession(page);
  await resize(844, 390);
  await page.goto(origin + '/');
  await page.locator('#bull[data-ready=true]').waitFor();
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 55, right: 40, bottom: 18 } });
  await fits('.stage', 844, 390);
  assert((await box('#settings-open')).x >= 55);
  await page.locator('#settings-open').click();
  const dialog = await box('#settings-dialog');
  assert(dialog.x >= 55 && dialog.x + dialog.width <= 804);
  await page.locator('.dialog-header .icon-button').click();
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
  await resize(800, 650);
  const foldMetrics = { width: 800, height: 650, screenWidth: 800, screenHeight: 650, deviceScaleFactor: 2, mobile: true };
  const bookMetrics = {
    ...foldMetrics, displayFeature: { orientation: 'vertical', offset: 382, maskLength: 36 },
    devicePosture: { type: 'folded' }
  };
  await cdp.send('Emulation.setDeviceMetricsOverride', bookMetrics);
  await page.waitForFunction(() => matchMedia('(horizontal-viewport-segments: 2)').matches);
  assert((await box('#desktop-open')).x + 44 <= 382);
  assert((await box('.stage')).x >= 418);
  await page.locator('#bull').click();
  assert.equal(await page.locator('#session-count').textContent(), '1');
  await shot('website-book');
  const downloads = await context.newPage();
  downloads.on('pageerror', error => errors.push(error.message));
  await downloads.setViewportSize({ width: 800, height: 650 });
  await downloads.goto(origin + '/download/');
  const downloadCdp = await context.newCDPSession(downloads);
  await downloadCdp.send('Emulation.setDeviceMetricsOverride', bookMetrics);
  await downloads.waitForFunction(() => matchMedia('(horizontal-viewport-segments: 2)').matches);
  const header = await downloads.locator('.site-header').boundingBox();
  assert(header.x + header.width <= 382, 'Download header crosses the hinge: ' + JSON.stringify(header));
  await downloadCdp.send('Emulation.setDeviceMetricsOverride', foldMetrics);
  await downloads.setViewportSize({ width: 280, height: 512 });
  const narrowHeader = await downloads.locator('.site-header').boundingBox();
  assert(narrowHeader.x >= 0 && narrowHeader.x + narrowHeader.width <= 280);
  assert(await downloads.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS Website safe areas, fold segments, downloads and tap counter');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
