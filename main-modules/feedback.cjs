const { OFFICIAL } = require('./update-policy.cjs');

function feedbackPayload(value, context) {
  const message = typeof value?.message === 'string' ? value.message.trim() : '';
  const contact = typeof value?.contact === 'string' ? value.contact.trim() : '';
  if (!['problem', 'suggestion'].includes(value?.kind) || Array.from(message).length < 5 || message.length > 2800 || contact.length > 160 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value?.clientId || '')) {
    throw new Error('请检查反馈内容，至少填写 5 个字');
  }
  return { kind: value.kind, message: message + '\n\n牛来盯盘 ' + context, contact, clientId: value.clientId, website: '' };
}

async function submitFeedback(value, context, fetcher = fetch) {
  const payload = feedbackPayload(value, context);
  let response, result;
  try {
    response = await fetcher(OFFICIAL + '/api/feedback', {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Origin: OFFICIAL },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
    });
    result = await response.json();
  } catch { throw new Error('网络连接失败，内容已保留，请重试'); }
  if (response.status === 429) throw new Error('提交太频繁，请稍后再试');
  if (!response.ok || result.ok !== true || result.id !== payload.clientId) throw new Error('提交失败，内容已保留，请重试');
  return { id: result.id };
}

module.exports = { feedbackPayload, submitFeedback };
