import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { submitFeedback, feedbackPayload } = require('../main-modules/feedback.cjs');
const { chromium, _electron } = require('../niulai-android/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/feedback-20261117');
const checks = [];
const pass = name => { checks.push(name); console.log('PASS ' + name); };
await fs.mkdir(output, { recursive: true });
const value = { kind: 'problem', message: '打开设置后无法关闭', contact: '', clientId: crypto.randomUUID() };
for (const patch of [{ message: '😀😀😀' }, { message: '字'.repeat(2801) }, { contact: 'x'.repeat(161) }, { kind: 'invalid' }, { clientId: 'bad' }]) {
  assert.throws(() => feedbackPayload({ ...value, ...patch }, '1.7.1 · Windows'));
}
const context = '1.7.1 · Windows x64';
const result = await submitFeedback(value, context, async (url, options) => {
  assert.equal(url, 'https://niulai.raaay.art/api/feedback');
  assert.equal(options.headers.Origin, 'https://niulai.raaay.art');
  assert.equal(options.redirect, 'error');
  const body = JSON.parse(options.body);
  assert.equal(body.message, value.message + '\n\n牛来盯盘 ' + context);
  assert.equal(body.contact, '');
  return Response.json({ ok: true, id: body.clientId }, { status: 201 });
});
assert.equal(result.id, value.clientId);
await assert.rejects(submitFeedback(value, context, async () => Response.json({ ok: true, id: 'other' })), /提交失败/);
await assert.rejects(submitFeedback(value, context, async () => Response.json({ ok: false }, { status: 429 })), /太频繁/);
await assert.rejects(submitFeedback(value, context, async () => { throw new TypeError('offline'); }), /内容已保留/);
pass('native transport validates input, attaches version, checks receipts and reports recoverable failures');

async function exercise(page, open, name) {
  await open();
  await page.locator('#feedback-message').fill('关闭窗口后仍能听见声音，请增加说明。');
  await page.locator('#feedback-contact').fill('qa@example.invalid');
  await page.locator('#feedback-kind').selectOption('suggestion');
  await page.locator('#feedback-dialog .close-dialog').click();
  await open();
  assert.match(await page.locator('#feedback-message').inputValue(), /仍能听见声音/);
  await page.locator('#feedback-send').click();
  await page.waitForFunction(() => document.getElementById('feedback-status').textContent.includes('重试'));
  assert.match(await page.locator('#feedback-message').inputValue(), /仍能听见声音/);
  assert.doesNotMatch(await page.locator('#feedback-status').textContent(), /Error invoking/);
  await page.locator('#feedback-send').click();
  await page.waitForSelector('#feedback-success:not([hidden])');
  assert.equal(await page.locator('#feedback-message').inputValue(), '');
  await page.locator('#feedback-done').click();
  await open();
  assert.equal(await page.locator('#feedback-form').isVisible(), true);
  assert.equal(await page.locator('#feedback-contact').inputValue(), '');
  await page.locator('#feedback-message').fill('这是另一个改进建议。');
  await page.locator('#feedback-send').click();
  await page.waitForSelector('#feedback-success:not([hidden])');
  await page.locator('#feedback-done').click();
  pass(name + ' keeps drafts, retries with one receipt and clears only after confirmed delivery');
}

if (!process.argv.includes('--android-only')) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-feedback-'));
  const executable = process.env.NIULAI_QA_EXECUTABLE;
  const app = await _electron.launch({
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), '--qa-user-data-dir=' + profile],
    cwd: root, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'))
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.__NIULAI_RENDERER_READY__);
    await page.evaluate(() => window.desktopPet.settings({ theme: 'light' }));
    await app.evaluate(() => {
      const original = globalThis.fetch;
      globalThis.__feedbackRequests = [];
      globalThis.fetch = async (url, options) => {
        if (String(url) !== 'https://niulai.raaay.art/api/feedback') return original(url, options);
        const body = JSON.parse(options.body);
        globalThis.__feedbackRequests.push(body);
        if (globalThis.__feedbackRequests.length === 1) throw new TypeError('QA offline');
        await new Promise(resolve => setTimeout(resolve, 150));
        return Response.json({ ok: true, id: body.clientId }, { status: 201 });
      };
    });
    await exercise(page, () => page.locator('#feedback-open').click(), 'desktop form');
    const requests = await app.evaluate(() => globalThis.__feedbackRequests);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].clientId, requests[1].clientId);
    assert.notEqual(requests[1].clientId, requests[2].clientId);
    assert.match(requests[1].message, /牛来盯盘 \d+\.\d+\.\d+ · (Windows|macOS)/);
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-settings-panel="about"]').click();
    await page.getByRole('button', { name: '问题与建议', exact: true }).last().click();
    await page.screenshot({ path: path.join(output, 'desktop-feedback-light.png') });
    await page.locator('#feedback-dialog .close-dialog').click();
    await page.evaluate(() => window.desktopPet.settings({ theme: 'dark' }));
    await page.locator('#feedback-open').click();
    await page.screenshot({ path: path.join(output, 'desktop-feedback-dark.png') });
    assert.deepEqual(errors, []);
    pass('desktop sidebar and About entries open an accessible form in both themes');
  } finally { await app.close(); }
}

if (!process.argv.includes('--desktop-only')) {
  const web = path.join(root, 'niulai-android/build/web');
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname;
    const file = path.resolve(web, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(web + path.sep)) { response.writeHead(403).end(); return; }
    try {
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__feedbackRequests = [];
      window.NiulaiNative = {
        request(id, kind, raw) {
          if (kind !== 'feedback') { setTimeout(() => window.__niulaiResult(id, null, 'QA offline'), 10); return; }
          const value = JSON.parse(raw);
          window.__feedbackRequests.push(value);
          setTimeout(() => window.__niulaiResult(id, value.clientId, window.__feedbackRequests.length === 1 ? '网络连接失败，内容已保留，请重试' : null), 120);
        },
        updateStatus: () => JSON.stringify({ current: '1.5.1' }),
        appearance() {}, configurePet() {}, petStatus: () => 'permission'
      };
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.__niulaiReady);
    await exercise(page, () => page.locator('#feedback-open').click(), 'Android form');
    const requests = await page.evaluate(() => window.__feedbackRequests);
    assert.equal(requests[0].clientId, requests[1].clientId);
    assert.notEqual(requests[1].clientId, requests[2].clientId);
    await page.locator('#settings-open').click();
    await page.locator('[data-settings="about"]').click();
    await page.locator('#about-feedback').click();
    await page.screenshot({ path: path.join(output, 'android-feedback-light.png') });
    for (const width of [320, 390, 760]) {
      await page.setViewportSize({ width, height: 740 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#feedback-send').isVisible(), true);
    }
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.screenshot({ path: path.join(output, 'android-feedback-dark.png') });
    assert.deepEqual(errors, []);
    pass('Android toolbar and About entries fit narrow screens and both themes');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
await fs.writeFile(path.join(output, 'feedback-verification-' + process.platform + '-' + process.arch + '.json'), JSON.stringify({ passed: true, checks, productionSubmissions: 0, checkedAt: new Date().toISOString() }, null, 2));
