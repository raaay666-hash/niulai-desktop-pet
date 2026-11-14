import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/desktop-1.5.0');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-desktop-150-'));
await fs.mkdir(output, { recursive: true });
const checks = [], errors = [];
const executablePath = process.env.NIULAI_QA_EXECUTABLE || require('electron');
const shortcutModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
const args = [...(process.env.NIULAI_QA_EXECUTABLE ? [] : [root]), '--qa-user-data-dir=' + profile];
let app;
const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };
async function launch() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
  app = await _electron.launch({ executablePath, args, cwd: root, env });
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  return page;
}
async function overlay(kind) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const page = app.windows().find(page => page.url().includes('kind=' + kind));
    if (page) { await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__); return page; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Missing overlay ' + kind);
}
const state = page => page.evaluate(() => window.desktopPet.bootstrap());
async function waitForState(page, predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const next = await state(page);
    if (predicate(next)) return next;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error('Timed out waiting for desktop state');
}
try {
  let page = await launch();
  const initialPet = await overlay('pet');
  await initialPet.waitForFunction(() => !document.hidden, null, { timeout: 5000 });
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.overlayKind === 'pet').isAlwaysOnTop()), true);
  pass('initial desktop pet appears without a manual settings or focus change');
  const dragBefore = await app.evaluate(({ BrowserWindow, screen }) => {
    globalThis.__qaCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ x: 500, y: 500 });
    return BrowserWindow.getAllWindows().find(window => window.overlayKind === 'pet').getBounds();
  });
  await initialPet.evaluate(async () => { await window.desktopPet.beginDrag({ x: 560, y: 550 }); await window.desktopPet.endDrag(); });
  const dragAfter = await app.evaluate(({ BrowserWindow, screen }) => {
    screen.getCursorScreenPoint = globalThis.__qaCursor;
    return BrowserWindow.getAllWindows().find(window => window.overlayKind === 'pet').getBounds();
  });
  assert.equal(dragAfter.x, dragBefore.x - 60);
  assert.equal(dragAfter.y, dragBefore.y - 50);
  pass('short desktop drags apply pointer-down origin and final cursor position');
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=general]').click();
  await page.locator('#settings-content [data-setting=theme]').selectOption('light');
  await page.locator('[data-tab=home]').click();
  await page.waitForFunction(() => document.getElementById('price').textContent !== '—', { timeout: 35000 });
  const realQuote = (await state(page)).quotes;
  assert.ok(realQuote.s_sh000001?.quote.price > 0);
  pass('normal Electron entry fetches real public quotes');
  const pet = await overlay('pet');
  await page.waitForFunction(() => {
    const bytes = document.getElementById('bull').getContext('2d').getImageData(0, 0, 384, 384).data;
    return bytes.some((value, index) => index % 4 === 3 && value > 100);
  });
  pass('shared frame assets draw through the desktop canvas');
  await page.locator('#edit-position').click();
  await page.locator('#cost').fill('3000');
  await page.locator('#shares').fill('1.25');
  await page.locator('#position-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#home-position .pnl-grid'));
  assert.match(await page.locator('#home-position').textContent(), /••••/);
  await page.locator('#privacy-toggle').click();
  await page.waitForFunction(() => !document.getElementById('home-position').textContent.includes('••••'));
  pass('fractional holdings calculate with default privacy and explicit reveal');
  await page.locator('#refresh').click();
  await page.waitForTimeout(3700);
  await page.screenshot({ path: path.join(output, 'home-light.png'), fullPage: true });
  await page.locator('[data-tab=portfolio]').click();
  await page.screenshot({ path: path.join(output, 'portfolio.png'), fullPage: true });
  await page.keyboard.press(shortcutModifier + '+k');
  await page.locator('#search-input').fill('AAPL');
  await page.locator('#search-form').evaluate(form => form.requestSubmit());
  await page.locator('#search-results .search-result').first().waitFor();
  await page.locator('#search-results .search-result').first().click();
  await page.waitForFunction(() => !document.getElementById('search-dialog').open, { timeout: 25000 });
  assert.ok((await state(page)).state.stocks.some(stock => stock.code === 'gb_aapl'));
  pass('keyboard search verifies and adds a US stock through the normal provider flow');
  await page.keyboard.press(shortcutModifier + '+2');
  await page.locator('.row-actions button[aria-label="移出 苹果"]').count().then(async count => {
    if (count) await page.locator('.row-actions button[aria-label="移出 苹果"]').click();
    else await page.locator('#watch-stocks .stock-row').last().locator('.row-actions button').last().click();
  });
  await page.locator('#confirm-accept').click();
  await page.waitForFunction(() => !document.getElementById('confirm-dialog').open);
  pass('removal follows the confirmation flow');
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=island]').click();
  await page.locator('#settings-content [data-setting=islandEnabled]').check();
  const island = await overlay('island');
  assert.equal(await island.locator('#overlay').evaluate(node => node.classList.contains('collapsed')), true);
  await island.locator('#compact-island').click();
  await island.waitForFunction(() => !document.getElementById('overlay').classList.contains('collapsed'));
  await island.locator('#next-stock').click();
  await page.waitForFunction(() => document.getElementById('quote-name').textContent !== '上证指数');
  pass('independent island expands and switches the shared selected stock');
  await island.screenshot({ path: path.join(output, 'island-expanded.png') });
  await island.locator('#previous-stock').click();
  await page.waitForFunction(() => document.getElementById('quote-name').textContent === '上证指数');
  await page.locator('[data-settings-panel=widget]').click();
  await page.locator('#settings-content [data-setting=widgetEnabled]').check();
  const widget = await overlay('widget');
  for (let scene = 0; scene < 4; scene++) {
    await widget.locator(`[data-scene="${scene}"]`).click();
    await widget.waitForFunction(value => document.querySelector(`[data-scene="${value}"]`).classList.contains('active'), scene);
    await widget.screenshot({ path: path.join(output, `card-scene-${scene}.png`) });
  }
  await widget.locator('#calm-start').click();
  assert.match(await widget.locator('#calm-time').textContent(), /20/);
  pass('desktop card supports all four scenes and a rest timer');
  await page.locator('[data-settings-panel=pet]').click();
  await page.locator('#settings-content [data-setting=petMode]').selectOption('muyu');
  await page.locator('[data-tab=muyu]').click();
  await pet.waitForFunction(() => document.getElementById('overlay').classList.contains('wood-mode'));
  const before = (await state(page)).counts.total;
  await page.locator('#wood-tap').click();
  await page.waitForFunction(total => Number(document.getElementById('wood-total').textContent.replaceAll(',', '')) > total, before);
  await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? page : pet).evaluate(() => window.desktopPet.knock())));
  const after = await state(page);
  assert.equal(after.counts.total, before + 25);
  await page.waitForFunction(total => Number(document.getElementById('wood-total').textContent.replaceAll(',', '')) === total, after.counts.total);
  await pet.waitForFunction(total => document.getElementById('overlay-total').textContent.includes(String(total)), after.counts.total);
  await page.screenshot({ path: path.join(output, 'muyu.png'), fullPage: true });
  pass('concurrent cross-window wood taps count exactly once per request');
  await page.locator('#wood-round').click();
  await page.waitForFunction(() => document.getElementById('wood-count').textContent === '0');
  assert.equal((await state(page)).counts.total, after.counts.total);
  pass('new wood round resets the session and preserves lifetime count');
  await pet.locator('#collapse-overlay').click();
  await pet.waitForFunction(() => document.getElementById('overlay').classList.contains('collapsed'));
  await pet.locator('#collapse-overlay').click();
  pass('desktop pet collapses and restores');
  await page.locator('[data-tab=home]').click();
  await page.locator('#motions-open').click();
  assert.equal(await page.locator('[data-motion]').count(), 27);
  for (const id of ['incense', 'clap', 'rally', 'cover', 'muyu']) await page.locator(`[data-motion=${id}]`).click();
  await page.screenshot({ path: path.join(output, 'motions.png') });
  await page.keyboard.press('Escape');
  pass('all 27 states are available from the motion gallery');
  const media = await page.evaluate(async () => {
    const results = [];
    for (const source of ['assets/audio/niulai.mp3', 'assets/audio/mama.mp3', 'assets/audio/niulai-tap.wav']) {
      const audio = new Audio(source);
      audio.muted = true;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Audio decode timed out ' + source)), 10000);
        audio.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        audio.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Audio decode failed ' + source)); }, { once: true });
        audio.load();
      });
      await audio.play();
      audio.pause();
      results.push({ source, duration: audio.duration, readyState: audio.readyState });
    }
    return results;
  });
  assert.ok(media.every(item => item.duration > 0 && item.readyState >= 2));
  pass('all three bundled audio files decode and support muted playback');
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=alerts]').click();
  await page.locator('#settings-content [data-setting=emotionMemory]').check();
  await page.locator('#settings-content [data-setting=closeSummary]').check();
  await page.locator('#rule-type').selectOption('price');
  await page.locator('#rule-value').fill('999999');
  await page.getByRole('button', { name: '添加提醒', exact: true }).click();
  await waitForState(page, next => next.state.alerts.length === 1);
  assert.equal((await state(page)).state.alerts[0].value, 999999);
  await page.locator('.alert-rule button').click();
  await waitForState(page, next => next.state.alerts.length === 0);
  assert.equal((await state(page)).state.settings.emotionMemory, true);
  assert.equal((await state(page)).state.settings.closeSummary, true);
  pass('emotion memory, closing summary and alert creation/removal are available');
  await page.evaluate(() => window.desktopPet.window('hide'));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.overlayKind).isVisible()), false);
  await pet.evaluate(() => window.desktopPet.window('dashboard'));
  await page.waitForFunction(() => !document.hidden);
  pass('the dashboard hides and reopens through the shared overlay entry');
  await page.locator('[data-tab=settings]').click();
  await page.locator('[data-settings-panel=general]').click();
  await page.locator('#settings-content [data-setting=theme]').selectOption('dark');
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.screenshot({ path: path.join(output, 'settings-dark.png'), fullPage: true });
  await page.locator('[data-tab=home]').click();
  await page.screenshot({ path: path.join(output, 'home-dark.png'), fullPage: true });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.overlayKind).setSize(860, 640));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'home-compact.png'), fullPage: true });
  pass('dark theme and 860-pixel desktop layout remain usable');
  await app.evaluate(() => { globalThis.__qaFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('QA offline'); }; });
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('更新延迟'));
  assert.notEqual(await page.locator('#price').textContent(), '—');
  pass('provider failures retain the last quote with a visible delayed label');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  assert.equal((await state(page)).suspended, true);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.overlayKind).every(window => !window.isVisible())), true);
  await app.evaluate(({ powerMonitor }) => { globalThis.fetch = globalThis.__qaFetch; powerMonitor.emit('unlock-screen'); });
  await page.waitForFunction(() => !document.getElementById('connection').textContent.includes('更新延迟'), { timeout: 25000 });
  pass('lock and unlock pause overlays and recover public quotes');
  await page.locator('[data-tab=home]').click();
  await page.evaluate(() => window.desktopPet.settings({ mamaSound: true, muted: false, motion: true, autoActions: true, petMode: 'market', islandContent: 'market', scene: 0, smartScene: false }));
  const fixtureTime = Date.parse('2026-11-12T02:00:00Z');
  for (const surface of app.windows()) {
    await surface.evaluate(value => {
      window.__qaClock = value;
      window.__qaDate = Date;
      window.Date = class extends window.__qaDate {
        constructor(...args) { super(...(args.length ? args : [window.__qaClock])); }
        static now() { return window.__qaClock; }
      };
      window.__qaMamaEvents = [];
      window.desktopPet.onMamaVoice(payload => window.__qaMamaEvents.push(payload));
      window.__qaPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    }, fixtureTime);
  }
  await app.evaluate((_electron, value) => {
    globalThis.__qaClock = value;
    globalThis.__qaDateNow = Date.now;
    Date.now = () => globalThis.__qaClock;
    globalThis.__qaFetch = globalThis.fetch;
    globalThis.fetch = async url => {
      const symbols = String(url).split('list=')[1]?.split(',') || [];
      const body = symbols.map(code => `var hq_str_${code}="QA Index,100,-3.5,-3.5,100,100";`).join('\n');
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(body) };
    };
  }, fixtureTime);
  await page.evaluate(async () => {
    await window.desktopPet.stock('select', { code: 's_sz399001' });
    await window.desktopPet.stock('select', { code: 's_sh000001' });
  });
  async function quoteAt(value) {
    await app.evaluate((_electron, clock) => globalThis.__qaClock = clock, value);
    for (const surface of app.windows()) await surface.evaluate(clock => window.__qaClock = clock, value);
    await page.evaluate(() => window.desktopPet.refresh());
    await waitForState(page, next => next.quotes.s_sh000001?.received === value && !next.refreshing);
    await page.waitForTimeout(100);
  }
  await quoteAt(fixtureTime + 30000);
  assert.equal((await state(page)).reactions.s_sh000001.crying, false);
  await quoteAt(fixtureTime + 35000);
  assert.equal((await state(page)).reactions.s_sh000001.crying, true);
  await app.evaluate((_electron, clock) => globalThis.__qaClock = clock, fixtureTime + 36000);
  for (const surface of app.windows()) await surface.evaluate(clock => window.__qaClock = clock, fixtureTime + 36000);
  await page.waitForTimeout(650);
  const voiceEvents = (await Promise.all(app.windows().map(surface => surface.evaluate(() => window.__qaMamaEvents)))).flat();
  assert.equal(voiceEvents.length, 1);
  assert.equal(voiceEvents[0].volume, .9);
  await page.locator('#motions-open').click();
  await page.locator('[data-motion=cover]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, 'crying-qa.png') });
  await page.keyboard.press('Escape');
  pass('simulated confirmed decline produces crying and one globally routed mama event with playback stubbed');
  for (const surface of app.windows()) await surface.evaluate(() => { window.Date = window.__qaDate; HTMLMediaElement.prototype.play = window.__qaPlay; });
  await app.evaluate(() => { Date.now = globalThis.__qaDateNow; globalThis.fetch = globalThis.__qaFetch; });
  await page.evaluate(() => window.desktopPet.settings({ mamaSound: false }));
  const saved = await state(page);
  await app.close(); app = null;
  page = await launch();
  const restored = await state(page);
  assert.equal(restored.counts.total, saved.counts.total);
  assert.deepEqual(restored.state.stocks.map(stock => [stock.code, stock.cost, stock.shares]), saved.state.stocks.map(stock => [stock.code, stock.cost, stock.shares]));
  assert.equal(restored.state.settings.theme, 'dark');
  assert.equal(restored.state.settings.petEnabled, saved.state.settings.petEnabled);
  assert.equal(restored.state.settings.islandEnabled, saved.state.settings.islandEnabled);
  assert.equal(restored.state.settings.widgetEnabled, saved.state.settings.widgetEnabled);
  pass('restart preserves settings, fractional positions and shared counts');
  assert.deepEqual(errors, []);
  pass('no renderer JavaScript exceptions');
  const report = { passed: true, version: restored.version, platform: process.platform, arch: process.arch, executablePath, profile,
    checks, errors, media, settings: Object.keys(restored.state.settings).sort(), realQuote, capturedAt: new Date().toISOString() };
  await fs.writeFile(path.join(output, process.env.NIULAI_QA_EXECUTABLE ? 'packaged-verification.json' : 'verification.json'), JSON.stringify(report, null, 2));
} catch (error) {
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ profile, checks, errors, error: error.stack }, null, 2));
  throw error;
} finally { if (app) await app.close(); }
