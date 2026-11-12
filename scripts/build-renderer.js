const path = require('path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');

for (const entry of ['renderer', 'overlay']) {
  const result = esbuild.buildSync({
    entryPoints: [path.join(projectRoot, entry + '.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome128',
    outfile: path.join(projectRoot, entry + '.bundle.js'),
    metafile: true,
    logLevel: 'info'
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some(input => /(?:node_modules\/three|skeletal-animation|desktop-roaming|\.glb$)/i.test(input))) {
    throw new Error('Desktop renderer contains a removed dependency');
  }
}
