const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildSync } = require('esbuild');
const { chromium } = require('../niulai-android/node_modules/playwright');
const animation = require('../niulai-android/web/bull-frames.json');
const calibration = require('../renderer-modules/desktop-frame-colors.json');
const root = path.resolve(__dirname, '..');
const out = process.env.NIULAI_QA_OUTPUT || path.join(root, 'outputs/desktop-color-20261113');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [], sheets = {}, errors = [];
  const pass = name => { checks.push({ name, passed: true }); console.log('PASS ' + name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 600 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<meta charset="utf-8"><style>body{margin:0;background:#f1f3f7;font-family:Segoe UI,Microsoft YaHei,sans-serif;color:#16202f}main{padding:24px}h1{font-size:24px;margin:0 0 12px}.grid{display:flex;gap:20px}.card{border-radius:20px;background:white;padding:18px;text-align:center}.dark{background:#202633;color:white}canvas{width:424px;height:424px}h2{font-size:18px;margin:0}p{margin:8px 0 20px;color:#687386}</style><main><h1>牛来 · 帧间颜色对比</h1><p id="caption">同一动作、同一帧、同一尺寸</p><div class="grid"><div class="card"><h2>原图集</h2><canvas id="before" width="424" height="424"></canvas></div><div class="card"><h2>颜色稳定版</h2><canvas id="after" width="424" height="424"></canvas></div></div></main>');
    const code = buildSync({ stdin: { contents: "export { prepareDesktopSheet, correctFramePixels } from './renderer-modules/desktop-frame-colors.js';", resolveDir: root }, bundle: true, write: false, format: 'iife', globalName: 'ColorQA' }).outputFiles[0].text;
    await page.addScriptTag({ content: code });
    for (const [name, spec] of Object.entries(animation.sheets)) {
      const bytes = fs.readFileSync(path.join(root, 'assets/2d/frames/webp', spec.file));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), calibration.sourceHashes[name], 'Calibration source changed: ' + name);
      const url = 'data:image/webp;base64,' + bytes.toString('base64');
      sheets[name] = await page.evaluate(async ({ name, url }) => {
        const image = new Image(); image.src = url; await image.decode();
        const start = performance.now();
        const corrected = await ColorQA.prepareDesktopSheet(image, name);
        const processingMs = performance.now() - start;
        const original = document.createElement('canvas'); original.width = image.naturalWidth; original.height = image.naturalHeight;
        const ctx = original.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const before = ctx.getImageData(0, 0, original.width, original.height).data;
        const after = corrected.getContext('2d').getImageData(0, 0, original.width, original.height).data;
        let alphaChanges = 0;
        for (let index = 3; index < before.length; index += 4) if (before[index] !== after[index]) alphaChanges++;
        const frames = [], w = original.width, fw = w / 6, fh = original.height / 4;
        for (let frame = 0; frame < 24; frame++) {
          const samples = { gold: { before: [[], [], []], after: [[], [], []] }, pink: { before: [[], [], []], after: [[], [], []] } };
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
            const offset = ((Math.floor(frame / 6) * fh + y) * w + frame % 6 * fw + x) * 4;
            const r = before[offset], g = before[offset + 1], b = before[offset + 2];
            if (before[offset + 3] < 250) continue;
            let material;
            if (g - b > 35 && r - g > 16 && r > 125) material = samples.gold;
            else if (r - g > 25 && Math.abs(g - b) < 15 && r > 150 && g > 85) material = samples.pink;
            if (material) for (let c = 0; c < 3; c++) { material.before[c].push(before[offset + c]); material.after[c].push(after[offset + c]); }
          }
          const median = values => { values.sort((a, b) => a - b); return values[Math.floor((values.length - 1) * .5)]; };
          frames.push(Object.fromEntries(Object.entries(samples).map(([material, values]) => [material, { before: values.before.map(median), after: values.after.map(median) }])));
        }
        window.colorSheets ||= {}; colorSheets[name] = { original, corrected };
        window.paintComparison = (name, frame, dark = false) => {
          for (const [id, key] of [['before', 'original'], ['after', 'corrected']]) {
            const canvas = document.getElementById(id), ctx = canvas.getContext('2d');
            canvas.parentElement.classList.toggle('dark', dark);
            ctx.clearRect(0, 0, 424, 424); ctx.drawImage(colorSheets[name][key], frame % 6 * fw, Math.floor(frame / 6) * fh, fw, fh, 12, 12, 400, 400);
          }
          document.getElementById('caption').textContent = name + ' · 同一动作、同一帧、同一尺寸';
        };
        return { frames, alphaChanges, processingMs };
      }, { name, url });
    }
    pass('all 15 calibration records match the actual shipped image bytes');
    assert(Object.values(sheets).every(sheet => sheet.alphaChanges === 0));
    pass('all 360 corrected drawings retain exactly the original alpha channel');
    const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
    const metrics = {};
    for (const material of ['gold', 'pink']) {
      metrics[material] = {};
      for (const version of ['before', 'after']) {
        const changes = Object.values(sheets).flatMap(sheet => sheet.frames.map((frame, index) => distance(frame[material][version], sheet.frames[(index + 23) % 24][material][version])));
        metrics[material][version] = { meanAdjacentMedianRgbDistance: changes.reduce((sum, value) => sum + value, 0) / changes.length, maxAdjacentMedianRgbDistance: Math.max(...changes) };
      }
      assert(metrics[material].after.meanAdjacentMedianRgbDistance < metrics[material].before.meanAdjacentMedianRgbDistance * .3, material + ' must reduce mean material-color movement by at least 70%');
      assert(metrics[material].after.maxAdjacentMedianRgbDistance < metrics[material].before.maxAdjacentMedianRgbDistance * .4, material + ' must reduce its largest color jump');
    }
    pass('fur and muzzle median-color jumps are reduced across all clips, including loop boundaries');
    const synthetic = await page.evaluate(() => {
      const data = new Uint8ClampedArray(6 * 4 * 4);
      for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = i % 8 ? 255 : 0; data[i + 3] = 255; }
      const original = Array.from(data); ColorQA.correctFramePixels(data, 6, 1, 1, 'cover'); return original.every((value, index) => data[index] === value);
    });
    assert(synthetic); pass('neutral white and black stay unchanged by material correction');
    await page.evaluate(() => paintComparison('cover', 10, false));
    await page.screenshot({ path: path.join(out, 'color-comparison-light.png') });
    await page.evaluate(() => paintComparison('cover', 10, true));
    await page.screenshot({ path: path.join(out, 'color-comparison-dark.png') });
    const framesDir = path.join(out, 'comparison-frames'); fs.mkdirSync(framesDir, { recursive: true });
    let index = 0;
    for (const name of ['cover', 'incense', 'wave', 'idle']) {
      for (let frame = 0; frame < 60; frame++) {
        const t = frame / 30 * 1000, duration = animation.sheets[name].duration;
        const drawing = Math.min(23, Math.floor(Math.min(t, duration) * 24 / duration));
        await page.evaluate(({ name, drawing, dark }) => paintComparison(name, drawing, dark), { name, drawing, dark: name === 'incense' || name === 'idle' });
        await page.screenshot({ path: path.join(framesDir, String(index++).padStart(4, '0') + '.png') });
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'color-verification.json'), JSON.stringify({ passed: true, checkedAt: new Date().toISOString(), checks, metrics, sheets, errors, scope: 'Opaque material median RGB distances, sampled over all 360 source drawings and loop seams. This measures color stability, not a perceptual Delta E or a guarantee of identical colors at every moving pixel.' }, null, 2));
    console.log(JSON.stringify(metrics));
  } finally { await browser.close(); }
})();
