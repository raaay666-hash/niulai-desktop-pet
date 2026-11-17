export function createFeedbackForm({ submit, context, open }) {
  const dialog = document.getElementById('feedback-dialog');
  const form = document.getElementById('feedback-form');
  const status = document.getElementById('feedback-status');
  const send = document.getElementById('feedback-send');
  const message = document.getElementById('feedback-message');
  const success = document.getElementById('feedback-success');
  const fields = [...form.querySelectorAll('input, textarea, select')];
  let busy = false;
  let clientId;
  form.addEventListener('input', () => { if (!busy) clientId = undefined; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    if (Array.from(message.value.trim()).length < 5) {
      status.textContent = '请至少填写 5 个字';
      message.focus();
      return;
    }
    if (!clientId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      clientId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }
    const value = {
      kind: document.getElementById('feedback-kind').value,
      message: message.value.trim(),
      contact: document.getElementById('feedback-contact').value.trim(),
      clientId
    };
    busy = true;
    send.disabled = true;
    send.textContent = '正在提交…';
    form.setAttribute('aria-busy', 'true');
    fields.forEach(field => field.disabled = true);
    status.textContent = '';
    try {
      await submit(value);
      form.hidden = true;
      success.hidden = false;
      if (dialog.open) document.getElementById('feedback-done').focus();
      form.reset();
      clientId = undefined;
    } catch (error) { status.textContent = (error.message || '提交失败，请重试').replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally {
      busy = false;
      send.disabled = false;
      send.textContent = '提交反馈';
      form.setAttribute('aria-busy', 'false');
      fields.forEach(field => field.disabled = false);
    }
  });
  document.getElementById('feedback-done').onclick = () => dialog.close();
  return () => {
    document.getElementById('feedback-context').textContent = '随反馈附上 牛来盯盘 ' + context();
    if (!busy && form.hidden) {
      form.hidden = false;
      success.hidden = true;
      status.textContent = '';
    }
    open();
    if (!busy) message.focus();
  };
}
