let sequence = 0;
const pending = new Map();
window.__niulaiResult = (id, text, error) => {
  const item = pending.get(id);
  if (!item) return;
  clearTimeout(item.timer); pending.delete(id);
  if (error) item.reject(new Error(error)); else item.resolve(text);
};
export function request(kind, value) {
  return new Promise((resolve, reject) => {
    if (!window.NiulaiNative) { reject(new Error('请在安卓应用中连接行情')); return; }
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('连接超时，请重试')); }, 16000);
    pending.set(id, { resolve, reject, timer });
    try { window.NiulaiNative.request(id, kind, value); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
export function cancelRequests() {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('应用已暂停')); }
  pending.clear();
}
