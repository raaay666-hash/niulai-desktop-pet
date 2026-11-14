import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(project, '..');
const output = path.join(project, 'build/web');
await fs.mkdir(path.join(output, 'assets'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'compat.js']) await fs.copyFile(path.join(project, 'web', file), path.join(output, file));
for (const obsolete of ['pet.html','pet.css','pet.js']) await fs.rm(path.join(output,obsolete),{force:true});
for (const [from, to] of [
  ['assets/2d/bull-window-v2.png', 'bull-window-v2.png'],
  ['niulai-android/web/motion-catalog.json', 'motion-catalog.json'],
  ['niulai-android/web/bull-frames.json', 'bull-frames.json'],
  ['assets/2d/bull-poses-v3.png', 'bull-poses-v3.png'],
  ['assets/audio/niulai-tap.wav', 'niulai-tap.wav'],
  ['assets/audio/niulai.mp3', 'niulai.mp3'], ['assets/audio/mama.mp3', 'mama.mp3'],
  ['build/icon.png', 'icon.png']
]) await fs.copyFile(path.join(root, from), path.join(output, 'assets', to));
await fs.mkdir(path.join(output, 'assets/frames'), { recursive: true });
await fs.mkdir(path.join(output, 'assets/hq'), { recursive: true });
const hqSource = path.join(root, 'assets/2d/frames/mobile-hq');
for (const file of await fs.readdir(hqSource)) {
  await fs.copyFile(path.join(hqSource, file), path.join(output, 'assets/hq', file));
}
const animation = JSON.parse(await fs.readFile(path.join(project, 'web/bull-frames.json'), 'utf8'));
const frameFiles = new Set(Object.values(animation.sheets).map(sheet => sheet.file));
for (const file of await fs.readdir(path.join(output, 'assets/frames'))) {
  if (!frameFiles.has(file)) await fs.rm(path.join(output, 'assets/frames', file));
}
for (const file of frameFiles) {
  await fs.copyFile(path.join(root, 'assets/2d/frames/webp', file), path.join(output, 'assets/frames', file));
}
for (const obsolete of ['bull-rig.json', 'bull-parts-v4.png', 'wood-knock.wav']) await fs.rm(path.join(output, 'assets', obsolete), { force: true });
await build({ entryPoints: [path.join(project, 'web/app.mjs')], outfile: path.join(output, 'app.js'),
  bundle: true, minify: true, target: 'chrome58', format: 'iife', legalComments: 'none', metafile: true }).then(async result => {
    const inputs = Object.keys(result.metafile.inputs);
    if (inputs.some(p => /three|skeletal|3d|\.glb$/i.test(p))) throw new Error('Unexpected 3D dependency');
    await fs.writeFile(path.join(project, 'build/web-inputs.json'), JSON.stringify(inputs, null, 2));
  });
console.log('2D Android web assets ready: ' + output);
