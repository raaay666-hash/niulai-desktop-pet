const { parseCustomQuote, readPath, requestForQuoteStream, sourceSymbols, retryAfterMs } = require('./custom-quotes.cjs');

const MAX_LINE_BYTES = 64 * 1024;
const MAX_FUTURE_MS = 5000;

class StreamError extends Error {
  constructor(message, status) {
    super(message);
    if (status) this.status = status;
  }
}

function streamSymbols(codes, config) {
  const symbols = new Map();
  for (const code of new Set(codes)) {
    for (const alias of sourceSymbols(code, config)) {
      // Identical ticker text can belong to several exchanges. Require a qualified symbol in that case.
      symbols.set(alias, symbols.has(alias) ? null : code);
    }
  }
  return symbols;
}

async function followQuoteStream(codes, config, {
  signal, onQuote, onOpen, fetcher = fetch, connectTimeoutMs = 8000, idleTimeoutMs = 15000
} = {}) {
  if (signal?.aborted || !codes.length) return;
  const request = requestForQuoteStream(config, codes);
  const symbols = streamSymbols(codes, config);
  const clock = new AbortController();
  const streamSignal = signal ? AbortSignal.any([signal, clock.signal]) : clock.signal;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const pendingLine = Buffer.allocUnsafe(MAX_LINE_BYTES);
  let pendingBytes = 0;
  let reader;
  let timeout;

  function setDeadline(ms, message) {
    clearTimeout(timeout);
    timeout = setTimeout(() => clock.abort(new StreamError(message)), ms);
  }

  function renewIdleDeadline() {
    setDeadline(idleTimeoutMs, '自有行情推送超时，未收到报价或心跳');
  }

  function readFrame(bytes) {
    let data;
    try { data = JSON.parse(decoder.decode(bytes)); }
    catch { return; }
    if (data?.type === 'heartbeat') {
      renewIdleDeadline();
      return;
    }
    const item = readPath(data, config.dataPath);
    const alias = config.fields.symbol && readPath(item, config.fields.symbol);
    if (typeof alias !== 'string') return;
    const code = symbols.get(alias);
    if (!code) return;

    const received = Date.now();
    let quote;
    try { quote = parseCustomQuote(data, code, config, received); }
    catch { return; }
    if (!Number.isSafeInteger(quote.quotedAt) || quote.quotedAt <= 0 || quote.quotedAt > received + MAX_FUTURE_MS) return;
    renewIdleDeadline();
    onQuote?.(quote, received);
  }

  const cancel = () => { void reader?.cancel().catch(() => {}); };
  streamSignal.addEventListener('abort', cancel, { once: true });
  try {
    setDeadline(connectTimeoutMs, '自有行情推送连接超时');
    const response = await fetcher(request.url, { headers: request.headers, redirect: 'error', signal: streamSignal });
    streamSignal.throwIfAborted();
    if (!response.ok || !response.body) {
      void response.body?.cancel().catch(() => {});
      const status = response.status;
      const message = response.ok ? '自有行情推送未返回数据流'
        : status === 429 ? '自有行情推送限流，请稍后重试' : '自有行情推送返回 HTTP ' + status;
      const error = new StreamError(message, status);
      if (status === 429) error.retryAfterMs = retryAfterMs(response.headers);
      throw error;
    }
    reader = response.body.getReader();
    renewIdleDeadline();
    onOpen?.();

    while (true) {
      streamSignal.throwIfAborted();
      const { value, done } = await reader.read();
      streamSignal.throwIfAborted();
      if (done) {
        if (pendingBytes) readFrame(pendingLine.subarray(0, pendingBytes));
        break;
      }
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      for (let start = 0; start < chunk.length;) {
        streamSignal.throwIfAborted();
        const newline = chunk.indexOf(10, start);
        const slice = chunk.subarray(start, newline === -1 ? chunk.length : newline);
        if (pendingBytes + slice.length > MAX_LINE_BYTES) throw new StreamError('自有行情推送包含超出 64 KiB 的单条消息');
        if (newline === -1) {
          slice.copy(pendingLine, pendingBytes);
          pendingBytes += slice.length;
          break;
        }
        if (pendingBytes) {
          slice.copy(pendingLine, pendingBytes);
          readFrame(pendingLine.subarray(0, pendingBytes + slice.length));
          pendingBytes = 0;
        } else if (slice.length) readFrame(slice);
        start = newline + 1;
      }
    }
  } catch (error) {
    if (signal?.aborted) return;
    if (clock.signal.aborted) throw clock.signal.reason;
    if (error instanceof StreamError) throw error;
    throw new StreamError('自有行情推送连接中断，请检查网络和接口');
  } finally {
    clearTimeout(timeout);
    streamSignal.removeEventListener('abort', cancel);
    cancel();
    reader?.releaseLock();
  }
}

module.exports = { followQuoteStream };
