import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('../niulai-android/node_modules/playwright');
const { buildSync } = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/desktop-hq-20261113');
await fs.mkdir(output, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/2d/frames/hq/manifest.json')));
const finalAssets = JSON.parse(await fs.readFile(path.join(root, 'outputs/desktop-hq-20261113/final-assets.json')));
const checks = [], errors = [];
const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };
assert.equal(Object.keys(manifest.sheets).length, 15);
let frames = 0, bytes = 0;
for (const [name, spec] of Object.entries(manifest.sheets)) {
  assert.equal(spec.count, Math.max(24, Math.round(spec.duration * .06)));
  assert.equal(spec.pages.length, Math.ceil(spec.count / 16)); frames += spec.count;
  for (const file of finalAssets.sheets[name].pages) {
    const data = await fs.readFile(path.join(root, 'assets/2d/frames/hq', file.file)); bytes += data.length;
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), file.sha256);
  }
}
pass('15 complete 512-pixel action sequences contain 1176 verified frames at a 60 fps time base');

const bundle = buildSync({ stdin: { contents: "export { DesktopBullMotion } from './renderer-modules/desktop-crying-motion.js'; export { BullMotion } from './niulai-android/web/bull-motion.mjs'; export { prepareDesktopSheet } from './renderer-modules/desktop-frame-colors.js'; export { hqManifest, hqCacheSnapshot } from './renderer-modules/desktop-hq-frames.js';", resolveDir: root }, bundle: true, write: false, format: 'iife', globalName: 'HQ' }).outputFiles[0].text;
const html = '<meta charset="utf-8"><style>body{margin:0;padding:24px;background:#edf1f6;color:#17202f;font-family:Segoe UI,Microsoft YaHei,sans-serif}h1{font-size:24px;margin:0 0 8px}p{color:#667386}.row{display:flex;gap:20px}.card{padding:16px;background:white;border-radius:20px;text-align:center}.card.dark{background:#202733;color:white}h2{font-size:17px;margin:0 0 8px}canvas{width:448px;height:448px}</style><h1>牛来 · 高清插帧对比</h1><p id="caption">颜色稳定处理保持开启</p><div class="row"><div class="card"><h2>原始动作帧 · 256×256</h2><canvas id="before" width="448" height="448"></canvas></div><div class="card"><h2>高清插帧 · 512×512 · 60 fps</h2><canvas id="after" width="448" height="448"></canvas></div></div>';
let failPage = '';
const server = http.createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (name === '/hq.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); return; }
  if (failPage && name.endsWith(failPage)) { response.writeHead(503).end(); return; }
  const folder = name.startsWith('/hq/') ? 'hq' : 'webp';
  try { response.setHeader('Content-Type', 'image/webp'); response.end(await fs.readFile(path.join(root, 'assets/2d/frames', folder, path.basename(name)))); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1040, height: 600 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.addScriptTag({ url: '/hq.js' });
  await page.evaluate(async () => {
    window.now = 1000; performance.now = () => now;
    window.callbacks = new Map(); let nextId = 0;
    requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
    cancelAnimationFrame = id => callbacks.delete(id);
    window.step = time => { now = time; const list = [...callbacks.values()]; callbacks.clear(); for (const callback of list) callback(time); };
    window.after = new HQ.DesktopBullMotion(document.getElementById('after'), null, { assetBase: '/webp/' });
    window.before = new HQ.BullMotion(document.getElementById('before'), null, { assetBase: '/webp/', prepareSheet: HQ.prepareDesktopSheet });
    await Promise.all([after.pending, before.pending]);
    window.poseReady = () => after.getDrawing(after.player.frame(now)).key.startsWith('hq-') && after.getDrawing(after.player.frame(now)).key !== 'hq-wait';
  });
  const observed = {};
  for (const [name, spec] of Object.entries(manifest.sheets)) {
    const id = { thumb: 'rise', celebrate: 'rally', cheek: 'fall', sleep: 'lunch', look: 'flat', stretch: 'preopen', lean: 'opening' }[name] || name;
    const result = await page.evaluate(async ({ id, count, duration }) => {
      const start = now + 5000; now = start; await after.replay(id);
      const seen = new Set(); let waits = 0;
      for (let frame = 0; frame < count; frame++) {
        const time = start + frame * duration / count + .01;
        step(time);
        const expected = 'hq-' + frame;
        for (let attempt = 0; after.getDrawing(after.player.frame(time)).key !== expected && attempt < 100; attempt++) {
          waits++; await new Promise(resolve => setTimeout(resolve, 3));
        }
        // Normal animation ticks repaint after a speculative decode completes.
        cancelAnimationFrame(after.raf); after.last = -Infinity; after.renderKey = null; after.draw(time);
        seen.add(after.getDrawing(after.player.frame(time)).key);
      }
      const alpha = after.canvas.getContext('2d').getImageData(0, 0, after.canvas.width, after.canvas.height).data;
      return { seen: [...seen], visible: alpha.some((value, index) => index % 4 === 3 && value > 200), cache: HQ.hqCacheSnapshot(), waits };
    }, { id, count: spec.count, duration: spec.duration });
    assert.equal(result.seen.length, spec.count, name + ' must reach every frame');
    assert(result.seen.every(key => /^hq-\d+$/.test(key))); assert(result.visible); assert(result.cache.pages <= 4);
    observed[name] = result;
  }
  pass('every interpolated frame is reachable across page boundaries with a bounded four-page cache');

  const lifecycle = await page.evaluate(async () => {
    now += 5000; await after.replay('wave'); step(now + 250); await new Promise(resolve => setTimeout(resolve, 30)); cancelAnimationFrame(after.raf); after.last = -Infinity; after.draw(now);
    after.configure(false, true); const saved = after.canvas.toDataURL(); step(now + 5000); after.configure(true, true);
    const resumed = saved === after.canvas.toDataURL(); after.configure(true, false); const still = after.canvas.toDataURL(); step(now + 2000);
    return { resumed, still: still === after.canvas.toDataURL() };
  });
  assert(lifecycle.resumed && lifecycle.still);
  pass('high-quality playback pauses and resumes without a pose jump and respects motion-off');

  const hidpi = await browser.newPage({ viewport: { width: 1040, height: 600 }, deviceScaleFactor: 2 });
  await hidpi.goto(`http://127.0.0.1:${server.address().port}/`); await hidpi.addScriptTag({ url: '/hq.js' });
  const pixels = await hidpi.evaluate(async () => {
    const canvas = document.getElementById('after'); const motion = new HQ.DesktopBullMotion(canvas, null, { assetBase: '/webp/' });
    await motion.pending; await new Promise(resolve => setTimeout(resolve, 80));
    const result = { width: canvas.width, height: canvas.height, smoothing: canvas.getContext('2d').imageSmoothingQuality }; motion.close(); return result;
  });
  assert.deepEqual(pixels, { width: 896, height: 896, smoothing: 'high' }); await hidpi.close();
  pass('2× display scale receives a 896-pixel backing canvas with high-quality downsampling');

  failPage = 'wave-00.webp';
  const failure = await browser.newPage(); await failure.goto(`http://127.0.0.1:${server.address().port}/`); await failure.addScriptTag({ url: '/hq.js' });
  const fallback = await failure.evaluate(async () => {
    const item = new HQ.DesktopBullMotion(document.getElementById('after'), null, { assetBase: '/webp/' });
    await item.pending; await item.replay('wave'); const drawing = item.getDrawing(item.player.frame());
    const result = { correctedFallback: drawing.columns === 6 && !!drawing.image }; item.close(); return result;
  });
  assert(fallback.correctedFallback); await failure.close(); failPage = '';
  pass('a missing high-quality page falls back to the corrected original action');

  const live = await browser.newPage({ viewport: { width: 1040, height: 600 } });
  await live.goto(`http://127.0.0.1:${server.address().port}/`); await live.addScriptTag({ url: '/hq.js' });
  const cadence = await live.evaluate(async () => {
    const item = new HQ.DesktopBullMotion(document.getElementById('after'), null, { assetBase: '/webp/' });
    await item.pending; await item.replay('wave');
    const ctx = item.canvas.getContext('2d'), drawImage = ctx.drawImage; const times = [], keys = new Set();
    ctx.drawImage = function (...args) { times.push(performance.now()); keys.add(item.renderKey); return drawImage.apply(this, args); };
    await new Promise(resolve => setTimeout(resolve, 900));
    ctx.drawImage = drawImage; item.close();
    const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
    return { frames: times.length, unique: keys.size, medianGapMs: gaps[Math.floor(gaps.length / 2)], maximumGapMs: Math.max(...gaps), elapsedMs: times.at(-1) - times[0] };
  });
  assert(cadence.unique >= 40 && cadence.medianGapMs < 25 && cadence.maximumGapMs < 150, JSON.stringify(cadence));
  await live.close();
  pass('real-time browser playback reaches at least 40 distinct frames in 900 ms without long page stalls');

  // Capture real rendered frames at 60 fps for user review. The clock advances
  // independently of screenshot time; page readiness is checked before capture.
  const directory = path.join(output, 'preview-frames'); await fs.mkdir(directory, { recursive: true });
  let index = 0;
  for (const [id, label] of [['wave', '招手'], ['cover', '捂眼'], ['incense', '上香'], ['scratch', '挠头']]) {
    const start = await page.evaluate(async ({ id, label }) => {
      after.configure(true, true); now += 5000; await Promise.all([after.replay(id), before.replay(id)]);
      document.getElementById('caption').textContent = label + ' · 左右均保持颜色校正';
      for (const card of document.querySelectorAll('.card')) card.classList.toggle('dark', id === 'cover' || id === 'scratch');
      return now;
    }, { id, label });
    for (let frame = 0; frame < 120; frame++) {
      await page.evaluate(async time => {
        step(time);
        const drawing = after.player.frame(time); const spec = HQ.hqManifest.sheets[drawing.sheet];
        const expected = 'hq-' + Math.min(spec.count - 1, Math.floor(drawing.elapsed * spec.count / spec.duration));
        for (let retry = 0; after.getDrawing(drawing).key !== expected && retry < 100; retry++) await new Promise(resolve => setTimeout(resolve, 3));
        cancelAnimationFrame(after.raf); cancelAnimationFrame(before.raf); after.last = before.last = -Infinity; after.draw(time); before.draw(time);
      }, start + frame * 1000 / 60 + .01);
      await page.screenshot({ path: path.join(directory, String(index++).padStart(4, '0') + '.png') });
    }
  }
  await page.screenshot({ path: path.join(output, 'hq-preview.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'hq-verification.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, frames, bytes, observed, hidpi: pixels, cadence, errors, scope: 'Actual Chromium rendering, all generated frames, local-file image requests over a loopback fixture server, deterministic clock plus one real-time browser playback sample.' }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
