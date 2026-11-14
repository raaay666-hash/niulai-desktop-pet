const { publishedUpdate, MANIFEST_URL } = require('./update-policy.cjs');
const INTERVAL = 6 * 60 * 60 * 1000;
function createUpdateChecker({ current, read, save, enabled, notify, changed, fetcher = (...args) => fetch(...args), now = Date.now }) {
  let status = { current, available: false, checking: false, error: '', checkedAt: 0 }, pending;
  const remembered = read() || {};
  async function check(manual = false) {
    if (pending) return pending;
    if (!manual && status.checkedAt && now() - status.checkedAt < INTERVAL) return status;
    status = { ...status, checking: true, error: '' }; changed(status);
    pending = (async () => {
      try {
        const response = await fetcher(MANIFEST_URL, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('暂时无法连接更新服务');
        const reader = response.body.getReader(); let size = 0, chunks = [];
        for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new Error('更新信息无效'); } chunks.push(value); }
        const info = publishedUpdate(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'desktop', current, now());
        status = { current, ...info, checking: false, checkedAt: now(), error: '' }; changed(status);
        if (!manual && info.available && enabled() && remembered.notified !== info.version && await notify(info)) {
          remembered.notified = info.version; save(remembered);
        }
      } catch { status = { ...status, checking: false, checkedAt: now(), error: '暂时无法检查更新，请稍后重试' }; changed(status); }
      finally { pending = null; }
      return status;
    })();
    return pending;
  }
  return { check, status: () => status, interval: INTERVAL };
}
module.exports = { createUpdateChecker };
