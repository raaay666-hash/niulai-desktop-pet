import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DesktopFramePlayer } from '../renderer-modules/desktop-frame-player.js';

const require = createRequire(import.meta.url);
const { chromium } = require('../niulai-android/node_modules/playwright');
const { buildSync } = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/desktop-color-20261113');
await fs.mkdir(output, { recursive: true });
const checks = [], errors = [];
const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };

const player = new DesktopFramePlayer();
player.state('rally', 1000, true);
const beforeAlias = player.frame(1450);
player.state('surge', 1450);
assert.deepEqual(player.frame(1450), beforeAlias);
assert.equal(player.id, 'surge');
pass('market aliases retain the current drawing and phase');

player.state('wave', 2000, true);
for (const now of [2120, 2250, 2400]) player.state('wave', now, true, { finishCurrent: true });
assert.equal(player.frame(2500).index, 12);
assert.equal(player.frame(3000).index, 0);
assert.equal(player.frame(3500).index, 12);
assert.equal(player.frame(4200).index, 23);
assert.equal(player.pendingGesture, null);
player.state('wave', 4300, true);
assert.equal(player.frame(4300).index, 0);
pass('rapid gestures finish, coalesce one follow-up, and explicit previews restart');

player.state('wave', 5000, true);
player.state('wave', 5100, true, { finishCurrent: true });
player.pause(true, 5400);
const pausedFrame = player.frame(5400);
player.pause(false, 9400);
assert.deepEqual(player.frame(9400), pausedFrame);
assert.equal(player.pendingGesture, null);
player.state('wave', 10000, true);
player.state('wave', 10100, true, { finishCurrent: true });
assert.equal(player.frame(12000).index, 23);
pass('hide/resume preserves the pose and drops stale queued gestures');

player.state('happy', 13000, true);
player.state('happy', 13200, true, { finishCurrent: true });
player.state('rally', 13400);
player.frame(14000);
assert.equal(player.id, 'rally');
assert.equal(player.pendingGesture, null);
pass('a new market state cancels a pending interaction even when sharing its artwork');

const bundle = buildSync({ stdin: { contents: "export { DesktopBullMotion } from './renderer-modules/desktop-crying-motion.js'; export { animation } from './niulai-android/web/frame-player.mjs';", resolveDir: root }, bundle: true, format: 'iife', globalName: 'MotionQA', write: false }).outputFiles[0].text;
const markup = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eef1f6;font-family:Segoe UI,Microsoft YaHei,sans-serif;color:#17202f}main{width:960px;margin:28px auto}h1{font-size:25px;margin:0}p{color:#687386}.stage{display:flex;align-items:center;gap:32px;background:white;border-radius:24px;padding:24px}canvas{width:384px;height:384px}.dark{background:#17202f;border-radius:20px}.caption{font-size:18px;margin-top:20px}</style><main><h1>牛来 · 角色动作优化</h1><p>统一帧间颜色 · 连续互动 · 稳定绘制</p><div class="stage"><canvas id="bull" width="384" height="384"></canvas><canvas class="dark" id="mini" width="192" height="192" style="width:192px;height:192px"></canvas></div><div class="caption" id="caption">招手</div></main>';
let assetFailures = 0;
const server = http.createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (name === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(markup); return; }
  if (name === '/motion.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); return; }
  if (name.startsWith('/retry/') && assetFailures++ === 0) { response.writeHead(503).end(); return; }
  const file = path.resolve(root, 'assets/2d/frames/webp', path.basename(name));
  try { response.setHeader('Content-Type', 'image/webp'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 620 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addScriptTag({ url: '/motion.js' });
  await page.evaluate(async () => {
    window.qaNow = 1000;
    performance.now = () => window.qaNow;
    window.qaRafs = new Map(); window.qaRafId = 0;
    window.requestAnimationFrame = callback => { const id = ++window.qaRafId; window.qaRafs.set(id, callback); return id; };
    window.cancelAnimationFrame = id => window.qaRafs.delete(id);
    window.step = time => {
      window.qaNow = time;
      const callbacks = [...window.qaRafs.values()]; window.qaRafs.clear();
      for (const callback of callbacks) callback(time);
    };
    window.motion = new MotionQA.DesktopBullMotion(document.getElementById('bull'), null, { assetBase: '/assets/', highQuality: false });
    window.miniMotion = new MotionQA.DesktopBullMotion(document.getElementById('mini'), null, { assetBase: '/assets/', highQuality: false });
    window.miniMotion.mini = true;
    await Promise.all([motion.pending, miniMotion.pending]);
    window.pixels = () => document.getElementById('bull').toDataURL();
    window.coverage = () => {
      const data = document.getElementById('bull').getContext('2d').getImageData(0, 0, 384, 384).data;
      let sum = 0; for (let index = 3; index < data.length; index += 4) sum += data[index]; return sum;
    };
  });

  for (const id of Object.keys((await import('../niulai-android/web/frame-player.mjs')).animation.clips)) {
    const result = await page.evaluate(async id => {
      qaNow += 3000; await Promise.all([motion.replay(id), miniMotion.replay(id)]);
      const samples = [];
      for (const offset of [0, 80, 160, 400, 900]) { step(qaNow + (offset || 1)); samples.push(coverage()); }
      return { samples, selected: motion.player.id, sheet: motion.sheetName };
    }, id);
    assert(result.samples.every(value => value > 1000000), id + ' must stay visible');
    assert.equal(result.selected, id === 'slump' ? 'cover' : id);
  }
  pass('all 27 desktop states draw at full and miniature sizes without blank transitions');

  const transition = await page.evaluate(async () => {
    qaNow = 200000; await motion.replay('idle'); step(200300);
    await motion.replay('cover');
    step(200380);
    const actual = pixels();
    const expected = document.createElement('canvas'); expected.width = expected.height = 384;
    const ctx = expected.getContext('2d');
    const size = 384 * .94, frame = motion.player.frame(qaNow).index;
    ctx.drawImage(motion.sheet, frame % 6 * 256, Math.floor(frame / 6) * 256, 256, 256, (384 - size) / 2, 384 - size - 3.84, size, size);
    const a = motion.canvas.getContext('2d').getImageData(0, 0, 384, 384).data;
    const b = ctx.getImageData(0, 0, 384, 384).data;
    let maximum = 0, sum = 0;
    for (let index = 0; index < a.length; index += 4) {
      for (let channel = 0; channel < 4; channel++) {
        const actual = channel === 3 ? a[index + 3] : a[index + channel] * a[index + 3] / 255;
        const expected = channel === 3 ? b[index + 3] : b[index + channel] * b[index + 3] / 255;
        const error = Math.abs(actual - expected); sum += error; maximum = Math.max(maximum, error);
      }
    }
    return { meanError: sum / a.length, maximum, released: !motion.transition, composite: motion.canvas.getContext('2d').globalCompositeOperation };
  });
  // GPU and CPU canvases round premultiplied edges differently when scaling.
  // Compare premultiplied pixels, avoiding meaningless RGB under zero alpha.
  assert(transition.meanError < 1 && transition.maximum < 24, 'single-pose rendering: ' + JSON.stringify(transition));
  assert.equal(transition.composite, 'source-over');
  assert(transition.released);
  pass('state changes draw one corrected pose without additive blending or ghost images');

  const pause = await page.evaluate(async () => {
    qaNow = 210000; await motion.replay('wave'); step(210300); step(210500);
    motion.configure(false, true); const before = pixels(); step(215000);
    motion.configure(true, true); const resumed = pixels();
    motion.configure(true, false); const still = pixels(); step(216000); step(218000);
    return { before, resumed, still, after: pixels() };
  });
  assert(pause.before === pause.resumed, 'resume must preserve pose');
  assert(pause.still === pause.after, 'motion off must freeze pixels');
  pass('hidden windows resume at the same pose and disabled motion remains pixel-still');

  const breath = await page.evaluate(async () => {
    motion.configure(true, true); qaNow = 220000; await motion.replay('scratch'); step(221200);
    const a = { frame: motion.player.frame(qaNow).index, pixels: pixels() }; step(221650);
    const b = { frame: motion.player.frame(qaNow).index, pixels: pixels() };
    return { a, b };
  });
  assert.equal(breath.a.frame, 23); assert.equal(breath.b.frame, 23);
  assert(breath.a.pixels === breath.b.pixels, 'rest poses must not shimmer through repeated scaling');
  pass('rest intervals retain identical pixels without extra whole-body scaling');

  const cadence = await page.evaluate(async () => {
    qaNow = 230000; await motion.replay('idle'); step(230300);
    const ctx = motion.canvas.getContext('2d'), original = ctx.drawImage;
    let draws = 0; ctx.drawImage = function (...args) { draws++; return original.apply(this, args); };
    for (let time = 230317; time <= 231300; time += 1000 / 60) step(time);
    ctx.drawImage = original;
    qaNow = 232000; await motion.state('muyu'); step(232300);
    const stationary = pixels(); let woodDraws = 0;
    ctx.drawImage = function (...args) { woodDraws++; return original.apply(this, args); };
    for (let time = 232317; time < 233300; time += 1000 / 60) step(time);
    ctx.drawImage = original;
    const stopped = motion.raf === 0 && stationary === pixels();
    await motion.replay('muyu'); step(233450);
    return { draws, woodDraws, stopped, restarted: motion.player.knocking && motion.raf !== 0 };
  });
  assert(cadence.draws >= 8 && cadence.draws <= 11, JSON.stringify(cadence));
  assert.equal(cadence.woodDraws, 0); assert(cadence.stopped); assert(cadence.restarted);
  pass('slow idle frames skip redundant draws and untouched wood animation stops scheduling');

  const strokeFrames = await page.evaluate(async () => {
    qaNow = 240000; await motion.replay('muyu'); step(240017);
    const seen = new Set();
    for (let time = 240034; time < 240400; time += 1000 / 60) { step(time); seen.add(motion.renderKey.split(':')[1]); }
    return seen.size;
  });
  assert(strokeFrames >= 20, 'short wood strokes must retain their faster drawing cadence');
  pass('short wood strikes keep a 60 fps budget for the fast contact and recovery');

  const retry = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const item = new MotionQA.DesktopBullMotion(canvas, null, { assetBase: '/retry/', highQuality: false });
    await item.pending; const failed = item.target === null;
    await item.state('idle'); const recovered = item.sheetName === 'idle' && !!item.sheet;
    item.close(); return { failed, recovered };
  });
  assert(retry.failed && retry.recovered);
  pass('a failed atlas request can recover on the next state update');

  // Capture a deterministic sequence for visual review and a shareable preview.
  const framesDir = path.join(output, 'frames'); await fs.mkdir(framesDir, { recursive: true });
  let index = 0;
  for (const [id, label] of [['wave', '招手 · 连续点击完成当前动作'], ['scratch', '挠头 · 帧间颜色稳定'], ['cover', '捂眼 · 泪滴随动作出现'], ['idle', '待机 · 原画动作，无额外缩放']]) {
    const start = 250000 + index / 30 * 1000;
    await page.evaluate(async ({ id, label, start }) => {
      qaNow = start; await Promise.all([motion.replay(id), miniMotion.replay(id)]);
      document.getElementById('caption').textContent = label;
    }, { id, label, start });
    for (let frame = 0; frame < 75; frame++) {
      await page.evaluate(time => step(time), start + frame * 1000 / 30);
      if (id === 'wave' && frame === 8) await page.evaluate(() => Promise.all([motion.interact('wave'), miniMotion.interact('wave')]));
      await page.screenshot({ path: path.join(framesDir, String(index++).padStart(4, '0') + '.png') });
    }
  }
  await page.screenshot({ path: path.join(output, 'motion-preview.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'motion-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, cadence, errors, scope: 'Desktop playback unit cases plus actual Chromium canvas rendering from current source; deterministic clock. Artwork unchanged. Android native playback remains unchanged.' }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}



