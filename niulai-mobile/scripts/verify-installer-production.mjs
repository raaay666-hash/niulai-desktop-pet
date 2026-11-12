import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://niulai.raaay.art';
const dist = path.join(project, 'dist');
const metadata = JSON.parse(fs.readFileSync(path.join(project, 'download-files.json'), 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const report = { at: new Date().toISOString(), origin, assets: [], downloads: [], fullInstaller: null, feedbackApi: null };
const files = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory)) {
    const full = path.join(directory, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else {
      const relative = path.relative(dist, full).replaceAll('\\', '/');
      if (!['_worker.js', '_routes.json', '_headers'].includes(relative)) files.push(relative);
    }
  }
}
walk(dist);
for (let offset = 0; offset < files.length; offset += 4) {
  await Promise.all(files.slice(offset, offset + 4).map(async file => {
    const response = await fetch(origin + '/' + file, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    const body = Buffer.from(await response.arrayBuffer());
    const result = { file, status: response.status, matchesLocal: sha(body) === sha(fs.readFileSync(path.join(dist, file))) };
    report.assets.push(result);
    assert.equal(result.status, 200, file); assert.equal(result.matchesLocal, true, file);
  }));
}
console.log('Static assets verified: ' + report.assets.length);
for (const [name, expected] of Object.entries(metadata)) {
  const url = origin + '/files/' + name;
  for (const mode of ['head', 'first', 'tail']) {
    const start = mode === 'tail' ? expected.size - 512 : 0;
    const end = mode === 'tail' ? expected.size - 1 : 63;
    const response = await fetch(url, {
      method: mode === 'head' ? 'HEAD' : 'GET',
      headers: mode === 'head' ? {} : { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(30000)
    });
    const result = {
      name, mode, status: response.status,
      sameOrigin: new URL(response.url).origin === origin,
      attachment: response.headers.get('Content-Disposition') === `attachment; filename="${name}"`,
      hashHeaderMatches: response.headers.get('X-File-SHA256') === expected.sha256,
      contentTypeMatches: response.headers.get('Content-Type') === expected.type,
      sizeOrRangeMatches: mode === 'head' ? Number(response.headers.get('Content-Length')) === expected.size : response.headers.get('Content-Range') === `bytes ${start}-${end}/${expected.size}`
    };
    assert.equal(result.status, mode === 'head' ? 200 : 206, name + ':' + mode);
    for (const key of ['sameOrigin', 'attachment', 'hashHeaderMatches', 'contentTypeMatches', 'sizeOrRangeMatches']) assert.equal(result[key], true, name + ':' + mode + ':' + key);
    if (mode !== 'head') assert.equal((await response.arrayBuffer()).byteLength, end - start + 1);
    report.downloads.push({ ...result, passed: true });
  }
}
console.log('Download HEAD and range checks verified: ' + report.downloads.length);
const feedback = await fetch(origin + '/api/feedback', { signal: AbortSignal.timeout(30000) });
report.feedbackApi = { method: 'GET', status: feedback.status, allow: feedback.headers.get('Allow') };
assert.equal(feedback.status, 405); assert.equal(report.feedbackApi.allow, 'POST');

const name = 'Niulai-1.4.0-Setup-x64.exe';
const response = await fetch(origin + '/files/' + name, { signal: AbortSignal.timeout(240000) });
assert.equal(response.status, 200);
const digest = crypto.createHash('sha256'); let length = 0, magic = null, nextProgress = 20 * 1024 * 1024;
const began = Date.now();
for await (const chunk of response.body) {
  if (magic === null) magic = Buffer.from(chunk).subarray(0, 2).toString('ascii');
  digest.update(chunk); length += chunk.length;
  if (length >= nextProgress) { console.log('Full installer download: ' + Math.round(length / 1024 / 1024) + ' MiB'); nextProgress += 20 * 1024 * 1024; }
}
report.fullInstaller = { name, status: response.status, bytes: length, sha256: digest.digest('hex'), executableMagic: magic, seconds: (Date.now() - began) / 1000 };
assert.equal(length, metadata[name].size); assert.equal(report.fullInstaller.sha256, metadata[name].sha256); assert.equal(magic, 'MZ');
report.scope = { newInstallerFullyDownloadedAndHashed: true, otherPackagesSampled: true, feedbackSubmitted: false, privateDatabaseRead: false, mainlandDeviceNetworkTested: false };
fs.writeFileSync(path.join(project, '../outputs/牛来安装程序-正式网站发布核验-20261109.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ assets: report.assets.length, downloads: report.downloads.length, fullInstaller: report.fullInstaller, feedbackStatus: report.feedbackApi.status }, null, 2));
