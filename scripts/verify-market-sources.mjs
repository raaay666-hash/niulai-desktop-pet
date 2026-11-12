import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_SOURCE_QA_OUTPUT || path.join(root, 'outputs/desktop-us-quotes-1.5.0/sources');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-market-source-'));
const executablePath = process.env.NIULAI_QA_EXECUTABLE || require('electron');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
const args = [...(process.env.NIULAI_QA_EXECUTABLE ? [] : [root]), '--qa-user-data-dir=' + profile];
const checks = [], errors = [];
let app, page, server, encrypted = false, passed = false;
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const state = () => page.evaluate(() => window.desktopPet.bootstrap());

function fixture(patch = {}) {
  const fields = Array(36).fill('0');
  Object.assign(fields, { 0: 'MP', 1: '36.73', 2: '0.74', 3: '2026-11-12 21:47:50', 4: '0.27', 21: '37.88', 24: 'Nov 12 08:47AM EST', 25: 'Nov 11 04:00PM EST', 26: '36.46', ...patch });
  return `var hq_str_gb_mp="${fields.join(',')}";`;
}
async function launch() {
  app = await _electron.launch({ executablePath, args, cwd: root, env });
  app.on('window', surface => surface.on('pageerror', error => errors.push(error.message)));
  page = await app.firstWindow();
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
}
async function clocks(now) {
  await app.evaluate((_electron, value) => {
    globalThis.__sourceQaNow = value;
    Date.now = () => globalThis.__sourceQaNow;
  }, now);
  for (const surface of app.windows()) {
    await surface.evaluate(value => {
      window.__sourceQaNow = value;
      if (!window.__sourceQaDate) {
        window.__sourceQaDate = Date;
        window.Date = class extends window.__sourceQaDate {
          constructor(...args) { super(...(args.length ? args : [window.__sourceQaNow])); }
          static now() { return window.__sourceQaNow; }
        };
      }
    }, now);
  }
}
async function refresh(now, body) {
  await clocks(now);
  if (body) await app.evaluate((_electron, text) => globalThis.__sourceQaBody = text, body);
  await page.evaluate(() => window.desktopPet.refresh());
  await page.waitForFunction(async value => {
    const snapshot = await window.desktopPet.bootstrap();
    const record = snapshot.quotes.gb_mp;
    return record?.received === value || record?.error;
  }, now, { timeout: 25000 });
}
async function overlay(kind) {
  await page.waitForTimeout(200);
  const surface = app.windows().find(window => window.url().includes('kind=' + kind));
  assert.ok(surface, 'Overlay ' + kind);
  await surface.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  return surface;
}
try {
  await fs.mkdir(output, { recursive: true });
  await launch();
  await page.waitForFunction(async () => (await window.desktopPet.bootstrap()).quotes.s_sh000001?.quote.price > 0, { timeout: 30000 });
  assert.equal((await state()).version, '1.5.0');
  pass('unchanged version and real public quote through the native application');
  const preNow = Date.parse('2026-11-12T13:47:50Z');
  await clocks(preNow);
  await app.evaluate((_electron, body) => {
    globalThis.__sourceQaBody = body;
    globalThis.__sourceQaFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://hq.sinajs.cn/')) {
        const codes = String(url).split('list=')[1].split(',');
        const text = codes.map(code => code === 'gb_mp' ? globalThis.__sourceQaBody : `var hq_str_${code}="QA Index,3000,0,0,100,100";`).join('\n');
        return new Response(text);
      }
      if (String(url).startsWith('https://qt.gtimg.cn/')) return new Response('');
      return globalThis.__sourceQaFetch(url, options);
    };
  }, fixture());
  await page.evaluate(async () => {
    await window.desktopPet.stock('add', { code: 'gb_mp' });
    await window.desktopPet.stock('position', { code: 'gb_mp', cost: 30, shares: 5 });
    await window.desktopPet.settings({ private: false, petHideInApp: false, islandHideInApp: false, islandEnabled: true, widgetEnabled: true, smartScene: false, scene: 1 });
  });
  const island = await overlay('island'), widget = await overlay('widget'), pet = await overlay('pet');
  await refresh(preNow + 1000, fixture());
  await page.waitForFunction(() => document.getElementById('price').textContent === '37.88');
  assert.match(await page.locator('#session').textContent(), /盘前/);
  assert.match(await page.locator('#connection').textContent(), /08:47 美东/);
  assert.match(await page.locator('#home-position').textContent(), /5\.75/);
  for (const surface of [island, widget, pet]) {
    await surface.waitForFunction(() => document.getElementById('overlay-price').textContent === '37.88');
    assert.match(await surface.locator('#overlay-code').textContent(), /盘前/);
  }
  assert.match(await island.locator('#compact-name').textContent(), /盘前/);
  await page.screenshot({ path: path.join(output, 'premarket.png') });
  await island.screenshot({ path: path.join(output, 'premarket-island.png') });
  pass('MP premarket quote, actual trade time, P&L and all three overlay surfaces');
  await page.locator('[data-tab=watchlist]').click();
  const mpRow = page.locator('#watch-stocks .stock-row').filter({ hasText: 'MP' });
  assert.match(await mpRow.textContent(), /盘前/);
  await page.locator('[data-tab=portfolio]').click();
  assert.match(await page.locator('#portfolio-list').textContent(), /盘前.*美东/);
  await page.locator('[data-tab=home]').click();
  pass('watchlist and portfolio identify the same quote session');

  const regularNow = Date.parse('2026-11-12T15:00:30Z');
  const regularBody = fixture({ 1: '38.1', 2: '3.73', 4: '1.37', 25: 'Nov 12 10:00AM EST', 26: '36.73' });
  await refresh(regularNow, regularBody);
  await page.waitForFunction(() => document.getElementById('price').textContent === '38.10');
  assert.equal((await state()).quotes.gb_mp.quote.session, 'regular');
  const samples = (await state()).histories.gb_mp.length;
  await refresh(regularNow + 1000, regularBody);
  assert.equal((await state()).histories.gb_mp.length, samples);
  await refresh(regularNow + 180000, regularBody);
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('报价较早'));
  assert.equal((await state()).reactions.gb_mp?.crying || false, false);
  pass('regular quotes replace premarket, duplicate timestamps do not add samples, old data is marked');

  const postNow = Date.parse('2026-11-12T21:05:30Z');
  const postBody = fixture({ 1: '38.1', 21: '39', 24: 'Nov 12 04:05PM EST', 25: 'Nov 12 04:00PM EST', 26: '36.73', 3: '2026-11-13 05:05:30' });
  await refresh(postNow, postBody);
  await page.waitForFunction(() => document.getElementById('price').textContent === '39.00');
  assert.match(await page.locator('#home-position').textContent(), /11\.35/);
  assert.match(await page.locator('#footer-status').textContent(), /盘后涨跌较当日常规收盘/);
  await page.screenshot({ path: path.join(output, 'postmarket.png') });
  await refresh(postNow + 1000, regularBody);
  assert.equal((await state()).quotes.gb_mp.quote.price, 39);
  pass('after-hours movement and full-day P&L use their respective baselines, older responses cannot overwrite');

  let responseStatus = 200;
  let sourceBody = { symbol: 'MP', name: 'MP', price: 41, previousClose: 38.1, dayPreviousClose: 36.73, regularPrice: 38.1, timestamp: '2026-11-12T21:05:00Z', session: 'post' };
  const receivedHeaders = [];
  server = http.createServer((request, response) => {
    receivedHeaders.push(request.headers['x-qa-key']);
    response.writeHead(responseStatus, { 'Content-Type': 'application/json' }).end(JSON.stringify(sourceBody));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=source]').click();
  await page.locator('#source-mode').selectOption('custom');
  await page.locator('#source-name').fill('我的付费行情');
  await page.locator('#source-url').fill(`http://127.0.0.1:${server.address().port}/quote?symbol={symbol}`);
  await page.locator('#source-authType').selectOption('header');
  await page.locator('#source-authName').fill('X-QA-Key');
  const verificationToken = 'niulai-verification-only-token';
  await page.locator('#source-token').fill(verificationToken);
  await page.locator('#source-test').click();
  await page.waitForFunction(() => document.getElementById('source-status').textContent.includes('连接成功'));
  assert.match(await page.locator('#source-status').textContent(), /41\.00/);
  await page.locator('#source-save').click();
  await page.waitForFunction(async () => (await window.desktopPet.bootstrap()).quotes.gb_mp?.quote.source === 'custom');
  await page.waitForFunction(() => document.getElementById('source-token')?.value === '');
  assert.equal(receivedHeaders.every(value => value === verificationToken), true);
  const sourceConfig = await page.evaluate(() => window.desktopPet.quoteSource('get'));
  assert.equal(sourceConfig.hasToken, true);
  assert.equal(Object.hasOwn(sourceConfig, 'token'), false);
  assert.equal(JSON.stringify(await state()).includes(verificationToken), false);
  const persistedText = await fs.readFile(path.join(profile, 'desktop-state-v2.json'), 'utf8');
  assert.equal(persistedText.includes(verificationToken), false);
  encrypted = sourceConfig.storage === 'encrypted';
  if (encrypted) assert.equal(persistedText.includes('127.0.0.1'), false);
  await page.locator('.source-mapping summary').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'custom-source-settings.png'), fullPage: true });
  await page.locator('[data-tab=home]').click();
  await page.waitForFunction(() => document.getElementById('price').textContent === '41.00');
  assert.match(await page.locator('#connection').textContent(), /我的付费行情/);
  for (const surface of [island, widget, pet]) {
    await surface.waitForFunction(() => document.getElementById('overlay-price').textContent === '41.00');
    assert.match(await surface.locator('#overlay-status').textContent(), /我的付费行情/);
  }
  await page.screenshot({ path: path.join(output, 'custom-source-home.png') });
  pass('own source connects through the settings UI, applies to every surface and keeps credentials out of snapshots and plaintext storage');

  responseStatus = 503;
  await refresh(postNow + 2000);
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('HTTP 503'));
  assert.equal((await state()).quotes.gb_mp.quote.source, 'custom');
  pass('custom failure retains the last custom quote when public fallback is disabled');
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=source]').click();
  await page.locator('#source-fallback').check();
  const fallbackNow = postNow + 5 * 60000;
  await clocks(fallbackNow);
  await app.evaluate((_electron, body) => globalThis.__sourceQaBody = body, fixture({ 1: '38.1', 21: '39.5', 24: 'Nov 12 04:10PM EST', 25: 'Nov 12 04:00PM EST', 26: '36.73', 3: '2026-11-13 05:10:30' }));
  await page.locator('#source-save').click();
  await page.waitForFunction(async () => (await window.desktopPet.bootstrap()).quotes.gb_mp?.quote.fallbackFrom === '我的付费行情');
  await page.locator('[data-tab=home]').click();
  assert.match(await page.locator('#connection').textContent(), /新浪（自有源回退）/);
  pass('explicit fallback permission uses public data with visible source attribution');

  if (encrypted) {
    responseStatus = 200; sourceBody = { ...sourceBody, price: 42, timestamp: '2026-11-12T21:11:00Z' };
    await app.close(); app = null;
    await launch();
    await clocks(Date.parse('2026-11-12T21:11:30Z'));
    await page.evaluate(() => window.desktopPet.refresh());
    let restored;
    for (let attempt = 0; attempt < 100; attempt++) {
      restored = (await state()).quotes.gb_mp?.quote;
      if (restored?.source === 'custom' && restored.price === 42) break;
      await page.waitForTimeout(200);
    }
    assert.equal(restored?.price, 42);
    assert.equal((await page.evaluate(() => window.desktopPet.quoteSource('get'))).hasToken, true);
    pass('encrypted source and authentication survive a native application restart');
  }
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  if (app) await app.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed, platform: process.platform, arch: process.arch, checks, errors, encryptedStorage: encrypted, checkedAt: new Date().toISOString() }, null, 2));
}
