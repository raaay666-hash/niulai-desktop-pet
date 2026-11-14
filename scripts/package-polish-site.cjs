const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sevenZip = require('7zip-bin').path7za;
const root = path.resolve(__dirname, '..');
const muyu = process.argv.includes('--muyu');
const name = muyu ? 'niulai-public-muyu-hq-20261114' : 'niulai-public-polish-20261114';
const frozen = path.join(root, 'artifacts', name);
const zip = path.join(root, 'artifacts', name + '-final.zip');
if (!fs.existsSync(frozen)) fs.cpSync(path.join(root, 'niulai-mobile/dist'), frozen, { recursive: true });
const records = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const name = path.relative(frozen, full).replaceAll('\\', '/');
      if (/(^|\/)(\.ops|\.git|node_modules|\.signing)(\/|$)|\.(p12|jks|keystore)$/.test(name)) throw Error('Private file in publication');
      const data = fs.readFileSync(full);
      if (!data.equals(fs.readFileSync(path.join(root, 'niulai-mobile/dist', name)))) throw Error('Frozen file changed: ' + name);
      records.push({ name, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
    }
  }
}
walk(frozen);
for (const required of ['index.html', '_worker.js', '_routes.json', '_headers', 'updates.json', 'download/updates/index.html']) {
  if (!records.some(file => file.name === required)) throw Error('Missing ' + required);
}
if (!fs.existsSync(zip)) execFileSync(sevenZip, ['a', '-tzip', '-mx=9', '-mm=Deflate', zip, './*', ...(muyu ? ['-xr!muyu-hq'] : [])], { cwd: frozen, stdio: 'pipe' });
const archives = [zip];
if (muyu) {
  const frames = path.join(root, 'artifacts', name + '-frames.zip');
  if (!fs.existsSync(frames)) execFileSync(sevenZip, ['a', '-tzip', '-mx=9', '-mm=Deflate', frames, 'assets/muyu-hq'], { cwd: frozen, stdio: 'pipe' });
  archives.push(frames);
}
for (const archive of archives) execFileSync(sevenZip, ['t', archive], { stdio: 'pipe' });
for (const record of records) {
  const archive = muyu && record.name.startsWith('assets/muyu-hq/') ? archives[1] : zip;
  const bytes = execFileSync(sevenZip, ['x', '-so', archive, record.name], { maxBuffer: 32 * 1024 * 1024 });
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw Error('Archive mismatch: ' + record.name);
}
  const uploads = archives.map(file => {const data = fs.readFileSync(file);if(data.length>=25*1024*1024)throw Error('Publication exceeds per-file upload limit');return {file,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
  const report = { frozen, uploadMethod: muyu ? 'directory' : 'zip', zip, bytes: uploads[0].bytes, sha256: uploads[0].sha256, archives: uploads, files: records };
  fs.mkdirSync(path.join(root, 'outputs/polish-20261113/site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'outputs/polish-20261113/site/package.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ zip, bytes: report.bytes, sha256: report.sha256, files: records.length }));
