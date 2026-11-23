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
  const deadline = Date.now() + 15000;
  let surface;
  while (!surface && Date.now() < deadline) {
    surface = app.windows().find(window => window.url().includes('kind=' + kind));
    if (!surface) await page.waitForTimeout(50);
  }
  assert.ok(surface, 'Overlay ' + kind);
  await surface.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  return surface;
}

async function waitFor(read, ready, message, timeout = 8000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  assert.fail(message);
}

async function verifyMixedSourcesAndPush() {
  const now = Date.parse('2026-11-20T15:00:00Z');
  const fastStarts = [], heldPeers = [], heldSelected = [], pulls = new Map(), feeds = [];
  let holdPeer = false, holdSelected = false, limitNextQuote = false;
  let mixedPrice = 44, limitedAt;
  let snapshotPrice = 43;
  const quote = (symbol, price, timestamp = now - 2000) => ({
    symbol, name: '实时测试 ' + symbol, price, previousClose: 37.5, timestamp, session: 'regular'
  });
  const send = (reply, body) => {
    if (!reply || reply.destroyed || reply.writableEnded) return;
    reply.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  };
  const fixture = http.createServer((request, reply) => {
    const url = new URL(request.url, 'http://localhost');
    const symbol = url.searchParams.get('symbol');
    if (url.pathname === '/stream') {
      const feed = { reply, closed: false, codes: url.searchParams.get('codes'), accept: request.headers.accept };
      feeds.push(feed);
      reply.on('close', () => { feed.closed = true; });
      reply.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      reply.flushHeaders();
    } else if (url.pathname === '/mixed') {
      if (symbol === 'MP') {
        const start = performance.now();
        fastStarts.push(start);
        if (limitNextQuote) {
          limitNextQuote = false;
          limitedAt = start;
          reply.writeHead(429, { 'Retry-After': '3' }).end('{}');
        } else if (holdSelected) heldSelected.push(reply);
        else send(reply, quote(symbol, mixedPrice, now - 2000 + mixedPrice));
      } else if (holdPeer && symbol === 'AAPL') {
        const peer = { closed: false };
        heldPeers.push(peer);
        reply.on('close', () => { peer.closed = true; });
      } else send(reply, quote(symbol, 44));
    } else {
      pulls.set(symbol, (pulls.get(symbol) || 0) + 1);
      send(reply, quote(symbol, symbol === 'MP' ? snapshotPrice : 46, snapshotPrice > 43 ? now - 200 : now - 2000));
    }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + fixture.address().port;
  const mixed = { mode: 'custom', name: '混合测试源', url: origin + '/mixed?symbol={symbol}', markets: ['us'], interval: .2, fallback: false };
  const pushed = { ...mixed, name: '实时报价源', url: origin + '/snapshot?symbol={symbol}', streamUrl: origin + '/stream?codes={codes}' };
  const source = (operation, input) => page.evaluate(({ operation, input }) => window.desktopPet.quoteSource(operation, input), { operation, input });
  const line = body => JSON.stringify(body) + '\n';
  try {
    await clocks(now);
    await app.evaluate(() => {
      const baseFetch = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        if (!String(url).startsWith('https://hq.sinajs.cn/')) return baseFetch(url, options);
        const codes = String(url).split('list=')[1].split(',');
        return Promise.resolve(new Response(codes.map(code => 'var hq_str_' + code + '="QA Index,3000,0,0,100,100";').join('\n')));
      };
    });
    await page.evaluate(() => window.desktopPet.settings({ interval: .2, islandInterval: .2 }));
    await source('save', mixed);
    await page.evaluate(async () => {
      const api = window.desktopPet;
      await api.stock('add', { code: 'gb_aapl' });
      await api.stock('add', { code: 's_sh600519' });
      await api.stock('select', { code: 'gb_mp' });
    });
    const start = fastStarts.length;
    await waitFor(() => fastStarts.length, count => count >= start + 6, 'Mixed watchlist did not receive sub-second quotes');
    const timings = fastStarts.slice(start + 1, start + 6);
    const delays = timings.slice(1).map((at, i) => at - timings[i]).sort((a, b) => a - b);
    assert.ok(delays.every(delay => delay >= 180), 'Polling faster than the configured 200ms floor: ' + delays.join(', '));
    assert.ok(delays[2] < 440, 'Mixed coverage did not allow 200ms polling: ' + delays.join(', '));
    assert.equal((await state()).state.settings.interval, .2);
    assert.ok((await state()).quotes.s_sh600519?.quote.price > 0);
    pass('a 200ms private source updates a mixed list without inheriting the public polling interval');

    limitNextQuote = true;
    await waitFor(() => limitedAt, Number.isFinite, 'The fast source did not receive the controlled HTTP 429');
    const retryAt = await waitFor(() => fastStarts.find(at => at > limitedAt), Number.isFinite, 'The fast source did not retry after HTTP 429');
    assert.ok(retryAt - limitedAt >= 2950, 'HTTP 429 Retry-After was ignored at the 200ms polling setting');
    pass('HTTP 429 honors Retry-After even with a 200ms private source and a mixed watchlist');

    holdPeer = true;
    const slowPeer = await waitFor(() => heldPeers[0], Boolean, 'The slow AAPL request did not start');
    mixedPrice = 45;
    await waitFor(state, value => value.quotes.gb_mp?.quote.price === 45, 'Fast quote waited for the slower symbol');
    mixedPrice = 46;
    await waitFor(state, value => value.quotes.gb_mp?.quote.price === 46, 'A second fast quote waited for the same slower request');
    assert.equal(slowPeer.closed, false);
    assert.equal(heldPeers.length, 1, 'A duplicate AAPL request started while the first was held');
    pass('two successive MP quotes arrive during the same held AAPL request without duplicating it');

    holdSelected = true;
    await waitFor(() => heldSelected[0], Boolean, 'The selected MP request did not start');
    await page.evaluate(() => {
      window.__marketQaManualResult = null;
      void window.desktopPet.refresh(true).then(entry => {
        window.__marketQaManualResult = { price: entry?.quote?.price };
      }, error => {
        window.__marketQaManualResult = { error: error.message };
      });
    });
    mixedPrice = 47;
    holdSelected = false;
    for (const pending of heldSelected) send(pending, quote('MP', mixedPrice, now - 2000 + mixedPrice));
    const manual = await waitFor(() => page.evaluate(() => window.__marketQaManualResult), Boolean,
      'Selected manual refresh was blocked by AAPL', 4000);
    assert.deepEqual(manual, { price: 47 });
    assert.equal(slowPeer.closed, false);
    assert.equal(heldPeers.length, 1, 'Manual refresh duplicated the slow AAPL request');
    pass('manual refresh completes on the selected MP quote while the same AAPL request stays pending');

    const probePromise = source('test', { ...pushed, testCode: 'gb_mp' });
    probePromise.catch(() => {});
    const probe = await waitFor(() => feeds[0], Boolean, 'The connection test did not open the NDJSON feed');
    assert.equal(probe.codes, 'gb_mp');
    assert.equal(probe.accept, 'application/x-ndjson');
    probe.reply.write(line(quote('MP', 52, now - 1700)));
    const tested = await probePromise;
    assert.equal(tested.quote.price, 43);
    assert.equal(tested.stream?.symbol, 'gb_mp', tested.stream?.error);
    assert.equal(tested.stream.latencyMs, tested.stream.received - tested.stream.quotedAt);
    await waitFor(() => probe.closed, Boolean, 'The connection test left its stream open');

    assert.equal(slowPeer.closed, false);
    assert.equal(heldPeers.length, 1);
    await source('save', pushed);
    await waitFor(() => slowPeer.closed, Boolean, 'Saving a replacement source did not abort the held AAPL connection', 3500);
    const feed = await waitFor(() => feeds[1], Boolean, 'The active configuration did not open the NDJSON feed');
    assert.deepEqual(feed.codes?.split(',').sort(), ['gb_aapl', 'gb_mp']);
    await waitFor(state, value => value.quotes.gb_mp?.quote.price === 43 && value.quotes.gb_aapl?.quote.price === 46, 'Startup HTTP snapshots were not applied');
    pass('switching quote sources cancels an unattended old HTTP request and starts replacement snapshots');
    const bytes = Buffer.from(line(quote('MP', 52, now - 1200)));
    const split = bytes.indexOf(Buffer.from('实')) + 1;
    assert.ok(split > 0);
    feed.reply.write(bytes.subarray(0, split));
    assert.equal((await state()).quotes.gb_mp.quote.price, 43);
    feed.reply.write(bytes.subarray(split));
    const pushedValue = await waitFor(state, value => value.quotes.gb_mp?.transport === 'ndjson', 'The streamed quote did not reach the desktop');
    assert.equal(pushedValue.quotes.gb_mp.quote.price, 52);
    assert.equal(pushedValue.quotes.gb_mp.quote.name, '实时测试 MP');
    assert.equal(pushedValue.quotes.gb_aapl.quote.price, 46);
    assert.equal(typeof pushedValue.quoteSource.streamStatus, 'string');
    await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('推送'));
    pass('NDJSON connection test and active feed accept partial UTF-8 frames');

    const peerCalls = pulls.get('AAPL');
    await waitFor(() => pulls.get('AAPL'), count => count > peerCalls, 'An uncovered peer stopped polling');
    const fastCalls = pulls.get('MP');
    await waitFor(() => pulls.get('AAPL'), count => count >= peerCalls + 3, 'Polling stalled with an open quote stream');
    assert.equal(pulls.get('MP'), fastCalls, 'A freshly streamed symbol is still polled automatically');
    await page.evaluate(() => window.desktopPet.refresh(true));
    assert.ok(pulls.get('MP') > fastCalls, 'Manual refresh did not request the HTTP snapshot');
    assert.equal((await state()).quotes.gb_mp.quote.price, 52);
    pass('live stream suppresses only its covered symbol and preserves manual refresh without accepting older snapshots');

    feed.reply.write(line(quote('MP', 99, now - 1500)) + line(quote('UNTRACKED', 98, now - 900)) + line(quote('AAPL', 54, now - 800)));
    const ordered = await waitFor(state, value => value.quotes.gb_aapl?.quote.price === 54, 'The second symbol did not arrive through the stream');
    assert.equal(ordered.quotes.gb_mp.quote.price, 52);
    assert.equal(Object.hasOwn(ordered.quotes, 'gb_untracked'), false);
    snapshotPrice = 55;
    feed.reply.end();
    await waitFor(state, value => value.quotes.gb_mp?.quote.price === 55 && value.quotes.gb_mp.transport !== 'ndjson', 'HTTP fallback did not recover after stream disconnect', 14000);
    const reconnect = await waitFor(() => feeds[2], Boolean, 'The stream did not reconnect', 14000);
    await source('save', { ...pushed, streamUrl: '' });
    await waitFor(() => reconnect.closed, Boolean, 'Disabling quote push left a connection open');
    pass('late and untracked frames are ignored; disconnect recovers to snapshots and disabling push closes the connection');
  } finally {
    await new Promise(resolve => { fixture.close(resolve); fixture.closeAllConnections(); });
  }
}

try {
  await fs.mkdir(output, { recursive: true });
  await launch();
  await page.waitForFunction(async () => (await window.desktopPet.bootstrap()).quotes.s_sh000001?.quote.price > 0, { timeout: 30000 });
  assert.equal((await state()).version, require('../package.json').version);
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
  const receivedHeaders = [], receivedAt = [];
  server = http.createServer((request, response) => {
    receivedHeaders.push(request.headers['x-qa-key']);
    receivedAt.push(performance.now());
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

  responseStatus = 200;
  await page.evaluate(async url => {
    const api = window.desktopPet;
    const { state } = await api.bootstrap();
    for (const stock of state.stocks) if (stock.code !== 'gb_mp') await api.stock('remove', { code: stock.code });
    await api.settings({ interval: .5, islandInterval: .5, islandSymbol: '' });
    await api.quoteSource('save', { mode: 'custom', name: '毫秒级测试源', url, markets: ['us'], interval: .5, fallback: false });
  }, `http://127.0.0.1:${server.address().port}/quote?symbol={symbol}`);
  const first = receivedAt.length;
  const deadline = performance.now() + 7000;
  while (receivedAt.length < first + 4 && performance.now() < deadline) await page.waitForTimeout(75);
  const fast = receivedAt.slice(first, first + 4);
  assert.equal(fast.length, 4);
  for (let i = 1; i < fast.length; i++) assert.ok(fast[i] - fast[i - 1] >= 490 && fast[i] - fast[i - 1] < 1400);
  assert.equal(await page.locator('#refresh').getAttribute('aria-busy'), 'false');
  const limited = receivedAt.length;
  responseStatus = 429;
  const retryDeadline = performance.now() + 7000;
  while (receivedAt.length < limited + 2 && performance.now() < retryDeadline) await page.waitForTimeout(100);
  assert.match((await state()).quotes.gb_mp?.error ?? '', /限流/);
  const retryDelay = receivedAt[limited + 1] - receivedAt[limited];
  assert.ok(retryDelay >= 1950, `HTTP 429 must slow the next poll (observed ${retryDelay}ms)`);
  pass('a fully configured own source polls at 500ms and backs off when rate limited');
  await verifyMixedSourcesAndPush();
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  if (app) await app.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed, platform: process.platform, arch: process.arch, checks, errors, encryptedStorage: encrypted, checkedAt: new Date().toISOString() }, null, 2));
}
