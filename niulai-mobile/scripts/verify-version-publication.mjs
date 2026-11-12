import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const origin = 'https://niulai.raaay.art';
const metadata = JSON.parse(fs.readFileSync(path.join(project, 'download-files.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = { checkedAt: new Date().toISOString(), origin, assets: [], ranges: [], fullDownloads: [], feedback: null, passed: false };
const output = path.resolve(project, '../outputs/desktop-1.5.0/site/publication-verification.json');
const files = [];
function walk(directory) {
  for (const name of fs.readdirSync(directory)) {
    const full = path.join(directory, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else {
      const relative = path.relative(dist, full).replaceAll('\\', '/');
      if (!['_worker.js', '_headers', '_routes.json'].includes(relative)) files.push(relative);
    }
  }
}
walk(dist);
try {
  for (let offset = 0; offset < files.length; offset += 4) {
    await Promise.all(files.slice(offset, offset + 4).map(async file => {
      const response = await fetch(origin + '/' + file, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(45000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      const result = { file, status: response.status, bytes: bytes.length, matchesLocal: sha(bytes) === sha(fs.readFileSync(path.join(dist, file))) };
      report.assets.push(result);
      assert.equal(result.status, 200, file);
      assert.equal(result.matchesLocal, true, file);
    }));
  }
  console.log('Public assets match local build: ' + report.assets.length);
  for (const [name, expected] of Object.entries(metadata)) {
    for (const mode of ['HEAD', 'first', 'last']) {
      const start = mode === 'last' ? expected.size - 256 : 0;
      const end = mode === 'last' ? expected.size - 1 : 63;
      const response = await fetch(origin + '/files/' + name, {
        method: mode === 'HEAD' ? 'HEAD' : 'GET',
        headers: mode === 'HEAD' ? {} : { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(45000)
      });
      const result = {
        name, mode, status: response.status,
        sameOrigin: new URL(response.url).origin === origin,
        attachment: response.headers.get('Content-Disposition') === `attachment; filename="${name}"`,
        shaMatches: response.headers.get('X-File-SHA256') === expected.sha256,
        lengthMatches: mode === 'HEAD' ? Number(response.headers.get('Content-Length')) === expected.size : response.headers.get('Content-Range') === `bytes ${start}-${end}/${expected.size}`
      };
      assert.equal(result.status, mode === 'HEAD' ? 200 : 206, name + ' ' + mode);
      for (const key of ['sameOrigin', 'attachment', 'shaMatches', 'lengthMatches']) assert.equal(result[key], true, name + ' ' + mode + ' ' + key);
      if (mode !== 'HEAD') assert.equal((await response.arrayBuffer()).byteLength, end - start + 1);
      report.ranges.push(result);
    }
  }
  console.log('Download headers and byte ranges verified: ' + report.ranges.length);
  for (const name of ['Niulai-1.5.0-Setup-x64.exe', 'Niulai-1.5.0-portable-x64.exe']) {
    const response = await fetch(origin + '/files/' + name, { signal: AbortSignal.timeout(240000) });
    assert.equal(response.status, 200, name);
    const digest = crypto.createHash('sha256');
    let bytes = 0, magic, nextProgress = 20 * 1024 * 1024;
    for await (const chunk of response.body) {
      magic ??= Buffer.from(chunk).subarray(0, 2).toString('ascii');
      digest.update(chunk); bytes += chunk.length;
      if (bytes >= nextProgress) { console.log(name + ' ' + Math.round(bytes / 1024 / 1024) + ' MiB'); nextProgress += 20 * 1024 * 1024; }
    }
    const result = { name, bytes, sha256: digest.digest('hex'), magic };
    assert.equal(result.bytes, metadata[name].size);
    assert.equal(result.sha256, metadata[name].sha256);
    assert.equal(result.magic, 'MZ');
    report.fullDownloads.push(result);
  }
  const feedback = await fetch(origin + '/api/feedback', { signal: AbortSignal.timeout(30000) });
  report.feedback = { method: 'GET', status: feedback.status, allow: feedback.headers.get('Allow') };
  assert.equal(feedback.status, 405);
  assert.equal(report.feedback.allow, 'POST');
  report.passed = true;
  console.log(JSON.stringify({ passed: true, assets: report.assets.length, rangeChecks: report.ranges.length, fullDownloads: report.fullDownloads.length, feedbackStatus: report.feedback.status }));
} finally {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}
