const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const { path7za } = require('7zip-bin');

const root = path.resolve(__dirname, '..');
const [releaseArgument, outputArgument] = process.argv.slice(2);
assert(releaseArgument && outputArgument, 'Supply release directory and report directory');
const release = path.resolve(releaseArgument), output = path.resolve(outputArgument);
fs.mkdirSync(output, { recursive: true });
const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const archive = path.join(release, 'win-unpacked/resources/app.asar');
const archiveHash = hash(fs.readFileSync(archive));
const files = asar.listPackage(archive).map(name => name.replace(/^[\\/]/, ''))
  .filter(name => !asar.statFile(archive, name).files).map(name => name.replaceAll('\\', '/')).sort();
const expected = ['package.json', ...config.build.files.filter(name => !name.startsWith('!'))].sort();
assert.deepEqual(files, expected, 'The build includes exactly the declared application files');
const sourceFiles = files.filter(name => name !== 'package.json').map(name => {
  const bytes = asar.extractFile(archive, path.normalize(name));
  assert.equal(hash(bytes), hash(fs.readFileSync(path.join(root, name))), 'Source mismatch: ' + name);
  return { name, bytes: bytes.length, sha256: hash(bytes) };
});
assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, config.version);
const archives = [{ file: archive, sha256: archiveHash }];
const artifacts = [];
for (const [kind, name] of [['installer', `Niulai-${config.version}-Setup-x64.exe`], ['portable', `${config.build.productName}-${config.version}-portable-x64.exe`]]) {
  const file = path.join(release, name), extracted = path.join(output, kind + '-payload');
  execFileSync(path7za, ['x', file, 'resources/app.asar', '-o' + extracted, '-y'], { windowsHide: true, stdio: 'pipe' });
  const packaged = path.join(extracted, 'resources/app.asar');
  const sha256 = hash(fs.readFileSync(packaged));
  assert.equal(sha256, archiveHash, kind + ' must contain the verified application');
  archives.push({ file: packaged, sha256 });
  const bytes = fs.readFileSync(file), digest = hash(bytes);
  artifacts.push({ name, file, bytes: bytes.length, sha256: digest });
  fs.writeFileSync(file + '.sha256', digest + '  ' + name + '\n');
}
const report = { passed: true, version: config.version, checkedAt: new Date().toISOString(), fileCount: files.length, sourceFilesMatched: sourceFiles.length, archives, artifacts, files: sourceFiles };
fs.writeFileSync(path.join(output, 'payload-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${sourceFiles.length} source files and ${archives.length} identical application archives`);
