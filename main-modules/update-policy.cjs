const OFFICIAL = 'https://niulai.raaay.art';
const MANIFEST_URL = OFFICIAL + '/updates.json';
function compareVersions(left, right) {
  const valid = value => typeof value === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value);
  if (!valid(left) || !valid(right)) throw new Error('版本格式无效');
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}
function publishedUpdate(manifest, platform, current, now = Date.now()) {
  if (manifest?.schema !== 1) throw new Error('更新信息暂不可用');
  const entry = manifest.releases?.[platform];
  if (!entry || entry.status !== 'published' || !Number.isFinite(Date.parse(entry.publishedAt)) || Date.parse(entry.publishedAt) > now) throw new Error('暂无正式发布信息');
  const newer = compareVersions(entry.version, current) > 0;
  if (entry.url !== OFFICIAL + '/download/#versions') throw new Error('更新地址无效');
  if (!Array.isArray(entry.notes) || entry.notes.length > 8 || entry.notes.some(note => typeof note !== 'string' || note.length > 160)) throw new Error('更新说明无效');
  return { version: entry.version, available: newer, publishedAt: entry.publishedAt, notes: entry.notes, url: entry.url };
}
module.exports = { compareVersions, publishedUpdate, MANIFEST_URL, OFFICIAL };
