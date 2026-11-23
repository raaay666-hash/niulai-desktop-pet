import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { _electron } = require('../niulai-android/node_modules/playwright');
const { normalizeState } = require('../main-modules/desktop-state.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.realpath(os.tmpdir());
const profile = await fs.mkdtemp(path.join(temp, 'niulai-orderbook-'));
const output = process.env.NIULAI_QA_OUTPUT || profile;
const report = path.join(output, 'orderbook-export.json');
const executable = process.env.NIULAI_QA_EXECUTABLE;
const manifestOverride = process.env.NIULAI_QA_PLUGIN_MANIFEST;
if (manifestOverride) assert.ok(path.isAbsolute(manifestOverride), 'Supply an absolute plugin manifest path');
const manifest = manifestOverride || (executable
  ? path.resolve(path.dirname(executable), '..', 'niulai-orderbook.niulai-plugin.json')
  : path.join(root, 'plugins/niulai-orderbook.niulai-plugin.json'));
const errors = [];
let app;
let page;

function venueFrame(venue, sequence, now) {
  const bid = venue === 'A' ? 100 : sequence === 1 ? 100.25 : 100.17;
  return JSON.stringify({
    symbol: 'PAPER', venue, currency: 'USD', unit: 'share', phase: 'continuous', timestamp: now,
    sequence, bids: [{ price: bid, size: 2000 }], asks: [{ price: bid + 0.03, size: 100 }]
  }) + '\n';
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  const at = Date.now();
  const first = venueFrame('A', 1, at) + venueFrame('B', 1, at);
  response.write(first.slice(0, 31));
  const timers = [
    setTimeout(() => response.write(first.slice(31)), 30),
    setTimeout(() => {
      const next = Date.now();
      response.write(venueFrame('A', 2, next) + venueFrame('B', 2, next));
    }, 450)
  ];
  response.on('close', () => timers.forEach(clearTimeout));
});

async function launch() {
  app = await _electron.launch({
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), '--qa-user-data-dir=' + profile],
    cwd: root,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'))
  });
  await app.evaluate(({ dialog }, values) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [values.manifest] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: values.report });
    const fetchEndpoint = globalThis.fetch;
    globalThis.fetch = (url, options) => new URL(url).hostname === '127.0.0.1' ?
      fetchEndpoint(url, options) : Promise.resolve(new Response(null, { status: 503 }));
  }, { manifest, report });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
  await page.locator('[data-tab=orderbook]').click();
  await page.waitForFunction(() => /安装/.test(document.querySelector('#ob-status').textContent));
}

async function testSnapshotCadence() {
  const code = 's_sh000001';
  await app.evaluate(() => {
    const marketTime = Date.parse('2026-11-20T02:00:00Z');
    const start = performance.now();
    Date.now = () => marketTime + Math.floor(performance.now() - start);
    const otherFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const address = new URL(url);
      if (address.hostname !== 'snapshot.example.invalid') return otherFetch(url, options);
      const symbol = address.pathname.split('/').at(-1);
      if (symbol === '000001' && globalThis.__holdSnapshot) {
        await new Promise(resolve => {
          globalThis.__releaseSnapshot = resolve;
          globalThis.__holdSnapshot();
        });
      }
      const timestamp = Date.now();
      return Response.json({
        symbol, price: 100.03, previousClose: 100, timestamp,
        orderBook: {
          timestamp, unit: '股', bids: [{ price: 100, size: 2000 }], asks: [{ price: 100.03, size: 400 }]
        }
      });
    };
  });
  const command = (op, input) => page.evaluate(({ op, input }) => window.desktopPet.orderbook(op, input), { op, input });
  const readQuote = () => page.evaluate(code => window.desktopPet.bootstrap().then(data => data.quotes[code]), code);
  const saveSource = interval => page.evaluate(interval => window.desktopPet.quoteSource('save', {
    name: 'QA 盘口', mode: 'custom', markets: ['cn'], url: 'https://snapshot.example.invalid/{symbol}', interval
  }), interval);
  async function waitFor(read, predicate) {
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      const value = await read();
      if (predicate(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    assert.fail('Timed out waiting for snapshot data');
  }
  const { defaults: settings } = await command('status');
  const input = { source: 'snapshot', strategy: 'sweep', symbol: code, settings };
  await page.evaluate(() => window.desktopPet.settings({ interval: .5 }));
  await saveSource(10);
  await assert.rejects(command('start', input), /10000 ms.*1320 ms/);
  assert.equal((await command('status')).running, false);

  await saveSource(.5);
  await command('start', input);
  const run = await waitFor(() => command('status'), value => value.trial.stats.fills > 0);
  assert.ok(run.trial.stats.received >= 2);
  assert.equal(run.trial.history[0].legs[0].status, 'filled');
  console.log('PASS snapshot cadence rejects a 10-second poll and fills with fresh 500ms snapshots');

  await app.evaluate(() => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The snapshot request never started')), 5000);
    globalThis.__holdSnapshot = () => { clearTimeout(timeout); resolve(); };
  }));
  const { received } = await readQuote();
  await command('stop');
  const restarted = await command('start', input);
  assert.equal(restarted.trial.stats.received, 0);
  await app.evaluate(() => { globalThis.__releaseSnapshot(); });
  await waitFor(readQuote, quote => quote.received > received);
  assert.equal((await command('status')).trial.stats.received, 0);
  await command('stop');
  await app.evaluate(() => {
    globalThis.__holdSnapshot = false;
    globalThis.__releaseSnapshot?.();
  });
  console.log('PASS an in-flight poll cannot feed a restarted snapshot simulation');
}

try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(profile, 'desktop-state-v2.json'), JSON.stringify({
    state: normalizeState({ settings: { petEnabled: false, widgetEnabled: false, interval: 30, motion: false, theme: 'light' } })
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await launch();
  assert.match(await page.locator('#ob-status').textContent(), /未安装/);
  await page.locator('#ob-install').click();
  await page.locator('#ob-start').waitFor();
  assert.match(await page.locator('#ob-status').textContent(), /已安装 0.1.0/);
  console.log('PASS import through the desktop plugin entry');

  await page.locator('#ob-start').click();
  await page.waitForFunction(() => document.querySelector('#ob-rows').textContent.includes('已成交'));
  assert.match(await page.locator('#ob-signal').textContent(), /预估净差/);
  await page.locator('#ob-stop').click();
  await page.waitForFunction(() => document.querySelector('#ob-status').textContent.includes('已手动停止'));
  if (process.env.NIULAI_QA_OUTPUT) await page.screenshot({ path: path.join(output, 'orderbook-preview.png'), fullPage: true });
  await page.locator('#ob-export').click();
  await page.waitForFunction(() => !document.querySelector('#ob-export').disabled);
  const paper = JSON.parse(await fs.readFile(report, 'utf8')).trial;
  assert.equal(paper.source, 'demo');
  assert.ok(paper.stats.pairedNet > 0);
  assert.ok(paper.history.some(event => event.legs.every(leg => leg.status === 'filled')));
  console.log('PASS deterministic replay, stop and export');

  await page.locator('#ob-strategy').selectOption('sweep');
  await page.locator('#ob-start').click();
  await page.waitForFunction(() => !document.querySelector('#ob-metrics').textContent.includes('已配对净差额') &&
    document.querySelector('#ob-rows').textContent.includes('已成交'));
  const sweep = (await page.evaluate(() => window.desktopPet.orderbook('status'))).trial;
  assert.equal(sweep.strategy, 'sweep');
  assert.equal(sweep.accounts.length, 1);
  assert.equal(sweep.history[0].legs.length, 1);
  await page.locator('#ob-stop').click();
  console.log('PASS single-venue sweep');

  await page.locator('#ob-source').selectOption('stream');
  await page.locator('#ob-strategy').selectOption('spread');
  await page.locator('#ob-url').fill('http://127.0.0.1:' + server.address().port + '/depth?key=local-qa');
  await page.locator('#ob-symbol').fill('PAPER');
  await page.locator('#ob-currency').fill('USD');
  await page.locator('#ob-venue-a').fill('A');
  await page.locator('#ob-venue-b').fill('B');
  await page.locator('#ob-start').click();
  await page.waitForFunction(() => document.querySelector('#ob-rows').textContent.includes('单腿未配对'));
  const state = await page.evaluate(() => window.desktopPet.orderbook('status'));
  assert.equal(state.running, false);
  assert.equal(state.trial.stats.unpaired, 1);
  assert.equal(state.trial.stats.fills, 1);
  assert.equal(state.trial.stats.pairedNet, 0);
  assert.equal(state.trial.accounts[0].quantity, 600);
  assert.ok(!JSON.stringify(state).includes('local-qa'));
  console.log('PASS incremental NDJSON, independent legs and unpaired-inventory stop');

  await testSnapshotCadence();
  await app.close();
  app = null;
  await launch();
  assert.match(await page.locator('#ob-status').textContent(), /已安装 0.1.0/);
  assert.equal((await page.evaluate(() => window.desktopPet.orderbook('status'))).running, false);
  await page.locator('#ob-uninstall').click();
  await page.locator('#ob-install').waitFor();
  assert.match(await page.locator('#ob-status').textContent(), /未安装/);
  await assert.rejects(fs.stat(path.join(profile, 'orderbook-plugin.json')), { code: 'ENOENT' });
  assert.deepEqual(errors, []);
  console.log('PASS persisted installation, explicit restart and uninstall');
} finally {
  if (app) await app.close().catch(() => {});
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(await fs.realpath(profile)), temp);
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
