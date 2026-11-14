import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const { normalizeState } = require('../main-modules/desktop-state.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/desktop-experience-20261113');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-experience-'));
const seed = normalizeState({ settings: { petEnabled: false, motion: false, interval: 30, theme: 'light' } });
seed.stocks[0].cost = 90;
seed.stocks[0].shares = 1.25;
seed.stocks.push(...Array.from({ length: 47 }, (_, index) => ({
  code: 's_sh' + (600001 + index), name: 'Sample ' + index, cost: 0, shares: 0
})));
await fs.writeFile(path.join(profile, 'desktop-state-v2.json'), JSON.stringify({ state: seed }));
await fs.mkdir(output, { recursive: true });
const executablePath = process.env.NIULAI_QA_EXECUTABLE || require('electron');
const checks = [], errors = [];
let app, page;
const snapshot = () => page.evaluate(() => window.desktopPet.bootstrap());
const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };

async function waitForSnapshot(predicate) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const next = await snapshot();
    if (predicate(next)) return next;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error('Timed out waiting for the desktop snapshot');
}

async function refresh() {
  const before = (await snapshot()).quotes.s_sh000001?.received;
  await page.evaluate(() => window.desktopPet.refresh());
  const next = await waitForSnapshot(next => next.quotes.s_sh000001?.received > (before || 0) && !next.refreshing);
  const value = next.quotes[next.state.selected].quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await page.waitForFunction(price => document.getElementById('price').textContent === price, value);
}

try {
  app = await _electron.launch({
    executablePath,
    args: [...(process.env.NIULAI_QA_EXECUTABLE ? [] : [root]), '--qa-user-data-dir=' + profile],
    cwd: root,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'))
  });
  app.on('window', surface => surface.on('pageerror', error => errors.push(error.message)));
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  await app.evaluate(() => {
    globalThis.__experienceFetch = globalThis.fetch;
    globalThis.__quoteRequests = 0;
    globalThis.__quoteDelay = 80;
    globalThis.__searchQueries = [];
    globalThis.__offline = false;
    globalThis.fetch = async url => {
      const address = new URL(url);
      let text;
      if (address.hostname === 'smartbox.gtimg.cn') {
        const query = address.searchParams.get('q');
        globalThis.__searchQueries.push(query);
        await new Promise(resolve => setTimeout(resolve, query === 'slow' ? 800 : 120));
        text = query === 'slow' ? 'v_hint="sh~600001~Old result~~GP";' : 'v_hint="sh~600519~Moutai~~GP^sz~000001~PingAn~~GP";';
      } else {
        globalThis.__quoteRequests++;
        await new Promise(resolve => setTimeout(resolve, globalThis.__quoteDelay));
        if (globalThis.__offline) throw new Error('Controlled offline fixture');
        const codes = (String(url).split('list=')[1] || '').split(',');
        text = codes.map(code => `var hq_str_${code}="QA ${code},${100 + globalThis.__quoteRequests},1,1,100,100";`).join('\n');
      }
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(text) };
    };
  });
  await refresh();
  await page.locator('[data-tab=watchlist]').click();
  assert.equal(await page.locator('#watch-stocks .stock-row').count(), 50);
  await page.locator('#watch-stocks .stock-main').first().focus();
  assert.equal(await page.locator('#watch-stocks .stock-main').first().evaluate(button => button === document.activeElement), true);
  await page.evaluate(() => { window.__focusedStock = document.activeElement; });
  await refresh();
  assert.equal(await page.evaluate(() => window.__focusedStock.isConnected && document.activeElement === window.__focusedStock), true);
  pass('50-stock quote refresh preserves row identity and keyboard focus');

  await page.locator('[data-tab=portfolio]').click();
  await page.locator('.portfolio-item .link-button').first().focus();
  await page.evaluate(() => { window.__focusedPosition = document.activeElement; });
  await refresh();
  assert.equal(await page.evaluate(() => window.__focusedPosition.isConnected && document.activeElement === window.__focusedPosition), true);
  pass('portfolio refresh preserves the focused edit entry');

  await page.locator('[data-tab=home]').click();
  const homeScroll = await page.locator('#home-stocks').evaluate(list => {
    list.scrollTop = 180;
    return { top: list.scrollTop, height: list.clientHeight, content: list.scrollHeight };
  });
  assert.ok(homeScroll.content > homeScroll.height);
  await refresh();
  assert.equal(await page.locator('#home-stocks').evaluate(list => list.scrollTop), homeScroll.top);
  pass('the home watchlist scrolls independently and keeps its scroll position during refresh');
  await app.evaluate(() => { globalThis.__quoteDelay = 600; });
  const beforeRequests = await app.evaluate(() => globalThis.__quoteRequests);
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('refresh').disabled);
  assert.equal(await page.locator('#refresh').getAttribute('aria-busy'), 'true');
  assert.match(await page.locator('#refresh').textContent(), /刷新中/);
  await page.locator('#refresh').evaluate(button => { for (let index = 0; index < 5; index++) button.click(); });
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(await app.evaluate(() => globalThis.__quoteRequests), beforeRequests + 1);
  assert.match(await page.locator('#toast').textContent(), /已刷新/);
  pass('manual refresh has busy and completion feedback and suppresses repeat requests');

  const beforeReconfigure = await app.evaluate(() => globalThis.__quoteRequests);
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('refresh').disabled);
  await page.evaluate(() => window.desktopPet.settings({ interval: 10 }));
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(await app.evaluate(() => globalThis.__quoteRequests), beforeReconfigure + 2);
  assert.equal((await snapshot()).refreshing, false);
  pass('changing quote settings during refresh finishes the replacement request before clearing busy state');

  await app.evaluate(() => { globalThis.__offline = true; globalThis.__quoteDelay = 80; });
  const lastPrice = await page.locator('#price').textContent();
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('connection').textContent.includes('更新延迟'));
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(await page.locator('#price').textContent(), lastPrice);
  assert.match(await page.locator('#toast').textContent(), /失败|延迟/);
  await app.evaluate(() => { globalThis.__offline = false; });
  await refresh();
  pass('failed refresh retains the last price and gives a recoverable status');

  await page.evaluate(() => window.desktopPet.stock('remove', { code: 's_sh600047' }));
  await waitForSnapshot(next => !next.refreshing);
  await app.evaluate(() => { globalThis.__quoteDelay = 600; });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#search-input').fill('600520');
  await page.locator('#search-form').evaluate(form => form.requestSubmit());
  await page.locator('#search-results .search-result').first().click();
  assert.equal(await page.locator('#search-input').isDisabled(), true);
  await page.locator('#search-dialog .close-dialog').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await waitForSnapshot(next => next.state.stocks.some(stock => stock.code === 's_sh600520'));
  await page.waitForFunction(() => document.getElementById('search-dialog').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#search-dialog').evaluate(dialog => dialog.open), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.desktopPet.stock('remove', { code: 's_sh600046' }));
  await app.evaluate(() => { globalThis.__quoteDelay = 80; globalThis.__searchQueries = []; });
  pass('an add in flight locks duplicate input and leaves a reopened search dialog available');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#search-input').evaluate(input => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 'mao';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await page.waitForTimeout(500);
  assert.deepEqual(await app.evaluate(() => globalThis.__searchQueries), []);
  await page.locator('#search-input').evaluate(input => {
    input.value = '茅台';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById('search-message').textContent.includes('选择股票'));
  assert.deepEqual(await app.evaluate(() => globalThis.__searchQueries), ['茅台']);
  await page.locator('#search-input').press('ArrowDown');
  assert.equal(await page.locator('#search-results .search-result').first().evaluate(button => button === document.activeElement), true);
  await page.screenshot({ path: path.join(output, 'search-keyboard.png') });
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#search-results .search-result').nth(1).evaluate(button => button === document.activeElement), true);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.getElementById('search-dialog').open);
  assert.ok((await snapshot()).state.stocks.some(stock => stock.code === 's_sh600519'));
  pass('IME composition sends one completed query and arrow keys plus Enter add the chosen stock');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#search-input').fill('slow');
  await waitForSnapshot(next => next.state.stocks.length === 50);
  await page.waitForTimeout(430);
  await page.locator('#search-input').fill('茅台');
  assert.equal(await page.locator('#search-results .search-result').count(), 0);
  await page.waitForFunction(() => document.getElementById('search-message').textContent.includes('选择股票'));
  await page.waitForTimeout(400);
  assert.match(await page.locator('#search-results .search-result').first().textContent(), /Moutai/);
  assert.match(await page.locator('#search-results .search-result').first().textContent(), /已在自选/);
  const beforeSearches = (await app.evaluate(() => globalThis.__searchQueries)).length;
  await page.locator('#search-input').press('Enter');
  await page.waitForFunction(() => !document.getElementById('search-dialog').open);
  assert.equal((await app.evaluate(() => globalThis.__searchQueries)).length, beforeSearches);
  assert.equal((await snapshot()).state.stocks.length, 50);
  pass('obsolete search results stay hidden and Enter opens an existing stock without another search');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.overlayKind).setSize(860, 640));
  await page.locator('[data-tab=watchlist]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'watchlist-compact.png') });
  await page.locator('[data-tab=home]').click();
  await page.screenshot({ path: path.join(output, 'home-light.png'), fullPage: true });
  await page.evaluate(() => window.desktopPet.settings({ theme: 'dark' }));
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.screenshot({ path: path.join(output, 'home-dark.png'), fullPage: true });
  assert.deepEqual(errors, []);
  pass('compact layout and light/dark themes have no renderer exceptions');
  await fs.writeFile(path.join(output, 'experience-verification.json'), JSON.stringify({
    passed: true, checks, errors, fixture: 'Controlled HTTP responses in the normal Electron process',
    version: (await snapshot()).version, capturedAt: new Date().toISOString()
  }, null, 2));
} catch (error) {
  await fs.writeFile(path.join(output, 'experience-failure.json'), JSON.stringify({ checks, errors, error: error.stack,
    profile, snapshot: page ? await snapshot().catch(() => null) : null,
    requests: app ? await app.evaluate(() => ({ quotes: globalThis.__quoteRequests, searches: globalThis.__searchQueries })).catch(() => null) : null
  }, null, 2));
  throw error;
} finally {
  if (app) await app.close();
}
