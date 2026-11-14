const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('../niulai-android/node_modules/playwright');
const animation = require('../niulai-android/web/bull-frames.json');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const results = {}, sourceHashes = {};
    for (const [name, spec] of Object.entries(animation.sheets)) {
      const bytes = fs.readFileSync(path.join(root, 'assets/2d/frames/webp', spec.file));
      sourceHashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
      const url = 'data:image/webp;base64,' + bytes.toString('base64');
      results[name] = await page.evaluate(async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const fw = canvas.width / 6, fh = canvas.height / 4, frames = [];
        for (let frame = 0; frame < 24; frame++) {
          const colors = { gold: [[], [], []], pink: [[], [], []] }, opaque = [];
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
            const offset = (((Math.floor(frame / 6) * fh + y) * canvas.width) + frame % 6 * fw + x) * 4;
            const [r, g, b, a] = pixels.slice(offset, offset + 4);
            if (a > 200 && g - b > 35 && r - g > 16 && r > 125) opaque.push(a);
            if (a < 250) continue;
            let group;
            if (g - b > 35 && r - g > 16 && r > 125) group = colors.gold;
            else if (r - g > 25 && Math.abs(g - b) < 15 && r > 150 && g > 85) group = colors.pink;
            if (group) { group[0].push(r); group[1].push(g); group[2].push(b); }
          }
          opaque.sort((a, b) => a - b);
          frames.push({ alphaQuantiles: [.1, .5, .9].map(q => opaque[Math.floor((opaque.length - 1) * q)]), ...Object.fromEntries(Object.entries(colors).map(([name, group]) => [name, { count: group[0].length, quantiles: group.map(channel => { channel.sort((a, b) => a - b); return [.1, .5, .9].map(q => channel[Math.floor((channel.length - 1) * q)]); }) }])) });
        }
        return frames;
      }, url);
    }
    const out = path.join(root, 'outputs/desktop-color-20261113'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'source-color-analysis.json'), JSON.stringify(results, null, 2));
    if (process.argv.includes('--calibrate')) {
      const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const target = Object.fromEntries(['gold', 'pink'].map(material => [material, [0, 1, 2].map(c => median(results.idle.map(frame => frame[material].quantiles[c][1])))]));
      const sheets = Object.fromEntries(Object.entries(results).map(([name, frames]) => [name, frames.map(frame => Object.fromEntries(['gold', 'pink'].map(material => [material, frame[material].quantiles.map(channel => channel[1])])))]));
      fs.writeFileSync(path.join(root, 'renderer-modules/desktop-frame-colors.json'), JSON.stringify({ reference: 'idle-v1.webp: median of 24 opaque-material frame medians', sourceHashes, target, sheets }, null, 2) + '\n');
    }
    for (const [name, frames] of Object.entries(results)) {
      const range = [0,1,2].map(channel => { const values = frames.map(frame => frame.gold.quantiles[channel][1]); return [Math.min(...values), Math.max(...values)]; });
      const jump = Math.max(...frames.map((frame, index) => Math.hypot(...[0,1,2].map(channel => frame.gold.quantiles[channel][1] - frames[(index + 23) % 24].gold.quantiles[channel][1]))));
      console.log(JSON.stringify({ name, goldMedianRange: range, maximumAdjacentMedianRgbDistance: +jump.toFixed(2), medianAlphaRange: [Math.min(...frames.map(f => f.alphaQuantiles[1])), Math.max(...frames.map(f => f.alphaQuantiles[1]))] }));
    }
  } finally { await browser.close(); }
})();
