const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const [archive, reportPath] = process.argv.slice(2);
assert.ok(archive && reportPath, 'Supply the packaged ASAR and output JSON paths');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'build/desktop-1.5.0-payload.json'), 'utf8'));
const files = asar.listPackage(archive).map(file => file.replace(/^[\\/]/, '').replaceAll('\\', '/'))
  .filter(file => !asar.statFile(archive, file).files).sort();
assert.deepEqual(files, expected.files.map(file => file.name).sort(), 'Packaged file inventory matches Windows');
const differences = [];
for (const file of expected.files) {
  const bytes = asar.extractFile(archive, file.name);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== file.bytes || hash !== file.sha256) {
    differences.push({ name: file.name, expectedBytes: file.bytes, actualBytes: bytes.length, expectedSha256: file.sha256, actualSha256: hash });
  }
}
const version = JSON.parse(asar.extractFile(archive, 'package.json')).version;
assert.equal(version, expected.version);
const report = {
  passed: differences.length === 0, version, platform: process.platform, arch: process.arch,
  reference: expected.reference, identicalFileCount: files.length - differences.length,
  allFileBytesEqual: differences.length === 0, files: expected.files, differences,
  actualAsarSha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  checkedAt: new Date().toISOString()
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
assert.deepEqual(differences, [], 'Packaged file content matches Windows');
console.log('All ' + files.length + ' packaged files match the Windows 1.5.0 release byte for byte');
