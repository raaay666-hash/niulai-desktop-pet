const assert = require('node:assert/strict');
const http = require('node:http');
const { defaultSourceConfig, normalizeSourceConfig, sourceSymbol, requestForSource, requestForQuoteStream, readPath, parseCustomQuote, fetchCustomQuote, retryAfterMs } = require('../main-modules/custom-quotes.cjs');
const { followQuoteStream } = require('../main-modules/quote-stream.cjs');
const { quoteHealth } = require('../main-modules/quote-time');

const now = Date.parse('2026-11-12T13:47:50Z');
const config = normalizeSourceConfig({ ...defaultSourceConfig(), name: '本地行情', url: 'http://127.0.0.1:1234/quotes?symbol={symbol}' });
const body = { symbol: 'MP', price: '37.88', previousClose: 36.73, timestamp: 1794491220, session: 'pre' };
body.timestamp = Date.parse('2026-11-12T13:47:00Z') / 1000;
const quote = parseCustomQuote(body, 'gb_mp', config, now);
assert.equal(quote.source, 'custom');
assert.equal(quote.sourceName, '本地行情');
assert.equal(quote.price, 37.88);
assert.equal(quote.session, 'pre');
assert.equal(quote.quotedAt, Date.parse('2026-11-12T13:47:00Z'));
assert.equal(quoteHealth({ quote, received: now }, 10, now).actionable, true);
assert.equal(sourceSymbol('rt_hk00700', 'yahoo'), '0700.HK');
assert.equal(sourceSymbol('s_sh600519', 'yahoo'), '600519.SS');
assert.equal(sourceSymbol('gb_brk.b', 'yahoo'), 'BRK-B');
assert.equal(sourceSymbol('gb_mp', 'niulai'), 'gb_mp');
assert.equal(readPath({ data: [{ price: 3 }] }, 'data[0].price'), 3);
assert.equal(readPath({ 'Global Quote': { '05. price': 3 } }, '/Global Quote/05. price'), 3);
assert.equal(readPath({}, '__proto__.polluted'), undefined);
assert.equal(readPath({}, 'constructor.prototype'), undefined);
const mapped = { ...config, dataPath: 'data[0]', fields: { ...config.fields, price: 'last', prevClose: '', changePct: 'pct', timestamp: 'at' } };
const mappedQuote = parseCustomQuote({ data: [{ symbol: 'MP', last: '1,200.00', pct: '20%', at: '2026-11-12T13:47:00Z', session: 'pre' }] }, 'gb_mp', mapped, now);
assert.equal(mappedQuote.prevClose, 1000);
assert.equal(mappedQuote.changePct, 20);
assert.equal(parseCustomQuote([body, { ...body, symbol: 'AAPL', price: 300 }], 'gb_mp', config, now).price, 37.88);
assert.throws(() => parseCustomQuote({ ...body, symbol: 'AAPL' }, 'gb_mp', config, now), /代码与请求不符/);
assert.throws(() => parseCustomQuote({ ...body, price: null }, 'gb_mp', config, now), /现价字段/);
assert.equal(parseCustomQuote({ ...body, timestamp: null }, 'gb_mp', config, now).quotedAt, null);
assert.equal(parseCustomQuote({ ...body, timestamp: '2026-11-12 21:47:00' }, 'gb_mp', { ...config, timeZone: 'Asia/Shanghai' }, now).quotedAt, quote.quotedAt);
assert.equal(parseCustomQuote({ ...body, timestamp: '2026-11-12 13:47:00' }, 'gb_mp', { ...config, timeZone: 'UTC' }, now).quotedAt, quote.quotedAt);
assert.equal(parseCustomQuote({ ...body, timestamp: '2026-11-12 21:47:00.123' }, 'gb_mp', { ...config, timeZone: 'Asia/Shanghai' }, now).quotedAt, quote.quotedAt + 123);
assert.equal(parseCustomQuote({ ...body, timestamp: '2026-11-12T13:47:00.25' }, 'gb_mp', { ...config, timeZone: 'UTC' }, now).quotedAt, quote.quotedAt + 250);
assert.equal(parseCustomQuote({ ...body, timestamp: '2026-11-31T13:47:00.25' }, 'gb_mp', { ...config, timeZone: 'UTC' }, now).quotedAt, null);
const missingBase = parseCustomQuote({ price: 39, timestamp: '2026-11-12T21:05:00Z', session: 'post' }, 'gb_mp', config, now);
assert.equal(missingBase.changePct, null);
assert.equal(missingBase.dayPrevClose, null);
for (const patch of [{ url: 'file:///data.json' }, { url: 'https://user:password@example.com' }, { markets: [] }, { authType: 'bearer' }, { authType: 'header', token: 'secret', authName: 'X\r\nsecret' }]) {
  assert.throws(() => normalizeSourceConfig({ ...config, ...patch }));
}
const bearer = normalizeSourceConfig({ ...config, authType: 'bearer', token: 'secret-token' });
assert.equal(requestForSource(bearer, 'gb_mp').headers.Authorization, 'Bearer secret-token');
const query = normalizeSourceConfig({ ...config, authType: 'query', authName: 'apikey', token: 'secret + token' });
assert.equal(new URL(requestForSource(query, 'gb_mp').url).searchParams.get('apikey'), 'secret + token');
for (const streamUrl of ['https://example.com/feed', 'http://127.0.0.1:1235/feed',
  'http://secret@127.0.0.1:1234/feed', 'http://127.0.0.1:1234/feed#secret']) {
  assert.throws(() => normalizeSourceConfig({ ...config, streamUrl }), /推送/);
}
assert.throws(() => normalizeSourceConfig({ ...config, url: 'http://quotes.example.test/value', streamUrl: 'http://quotes.example.test/feed' }), /HTTPS/);
const streamed = normalizeSourceConfig({ ...query, interval: .2, streamUrl: 'http://127.0.0.1:1234/feed?symbols={codes}' });
assert.equal(streamed.interval, .2);
assert.throws(() => normalizeSourceConfig({ ...streamed, fields: { ...streamed.fields, symbol: '' } }), /股票代码字段/);
const streamRequest = requestForQuoteStream(streamed, ['gb_mp', 'gb_aapl']);
assert.match(streamRequest.url, /symbols=gb_mp%2Cgb_aapl/);
assert.equal(new URL(streamRequest.url).searchParams.get('apikey'), 'secret + token');
assert.equal(streamRequest.headers.Accept, 'application/x-ndjson');

async function verifyStreamFailures() {
  const callbacks = { onQuote() { assert.fail('An invalid frame was accepted'); } };
  await assert.rejects(followQuoteStream(['gb_mp'], streamed, {
    ...callbacks, connectTimeoutMs: 20,
    fetcher: async (_url, { signal }) => new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }), /推送连接超时/);

  let cancelled = false;
  await assert.rejects(followQuoteStream(['gb_mp'], streamed, {
    ...callbacks, idleTimeoutMs: 20,
    fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }))
  }), /未收到报价或心跳/);
  assert.equal(cancelled, true);

  const controller = new AbortController();
  await followQuoteStream(['gb_mp'], streamed, {
    ...callbacks, signal: controller.signal, onOpen: () => controller.abort(),
    fetcher: async () => new Response('{}\n')
  });
  await assert.rejects(followQuoteStream(['gb_mp'], streamed, {
    ...callbacks, fetcher: async () => new Response('限流响应主体 secret + token', { status: 429 })
  }), error => error.status === 429 && /限流/.test(error.message) && !error.message.includes('secret'));
  await assert.rejects(followQuoteStream(['gb_mp'], streamed, {
    ...callbacks, fetcher: async () => new Response('证'.repeat(22000) + '\n')
  }), /64 KiB/);
}

(async () => {
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ url: request.url, authorization: request.headers.authorization, accept: request.headers.accept });
    const address = new URL(request.url, 'http://localhost');
    if (address.pathname === '/feed') {
      const timestamp = Date.now();
      const frame = data => JSON.stringify({ data }) + '\r\n';
      const message = Buffer.from('\n{"type":"heartbeat"}\nmalformed\n' + frame({ ticker: 'MP', name: '测试股票', price: 38, timestamp }) +
        frame({ ticker: 'AAPL', price: 300, timestamp: timestamp + 30000 }) + frame({ ticker: 'AAPL', price: 300 }) +
        frame({ ticker: '000001', price: 300, timestamp }) + frame({ ticker: 's_sz000001', price: 14, timestamp: new Date(timestamp + 1).toISOString() }));
      const split = message.indexOf(Buffer.from('测试')) + 1;
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' }).write(message.subarray(0, split));
      setTimeout(() => response.end(message.subarray(split)), 20);
      return;
    }
    const symbol = address.searchParams.get('symbol');
    if (symbol === 'ERROR') { response.writeHead(429, { 'Retry-After': '3' }).end('{}'); return; }
    if (symbol === 'HUGE') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"payload":"');
      response.end('x'.repeat(2 * 1024 * 1024) + '"}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...body, symbol }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const local = { ...bearer, url: `http://127.0.0.1:${server.address().port}/quotes?symbol={symbol}` };
    const result = await fetchCustomQuote('gb_mp', local, { now });
    assert.equal(result.price, 37.88);
    assert.equal(calls[0].url, '/quotes?symbol=MP');
    assert.equal(calls[0].authorization, 'Bearer secret-token');
    await assert.rejects(fetchCustomQuote('gb_error', local), error =>
      error.status === 429 && error.retryAfterMs === 3000 && /限流/.test(error.message) && !error.message.includes('secret-token'));
    assert.equal(retryAfterMs(new Headers({ 'Retry-After': new Date(now + 7000).toUTCString() }), now), 7000);
    await assert.rejects(fetchCustomQuote('gb_huge', local), /接口响应过大/);
    const { position } = await import('../niulai-android/web/core.mjs');
    assert.equal(position({ code: 'gb_mp', cost: 30, shares: 5 }, missingBase).today, null);
    const { AlertTriggerEngine } = await import('../renderer-modules/alert-trigger-engine.js');
    assert.equal(Number.isNaN(new AlertTriggerEngine().valueFor({ type: 'change_pct' }, { quote: missingBase })), true);
    const push = normalizeSourceConfig({
      ...local, streamUrl: `http://127.0.0.1:${server.address().port}/feed?codes={codes}`,
      dataPath: 'data', fields: { ...local.fields, symbol: 'ticker' }
    });
    const received = [];
    let opened = 0;
    await followQuoteStream(['gb_mp', 'gb_aapl', 's_sh000001', 's_sz000001'], push, {
      onOpen: () => { opened++; }, onQuote: (streamQuote, at) => received.push({ quote: streamQuote, at })
    });
    assert.equal(opened, 1);
    assert.equal(calls.at(-1).url, '/feed?codes=gb_mp%2Cgb_aapl%2Cs_sh000001%2Cs_sz000001');
    assert.equal(calls.at(-1).authorization, 'Bearer secret-token');
    assert.equal(calls.at(-1).accept, 'application/x-ndjson');
    assert.deepEqual(received.map(item => item.quote.code), ['gb_mp', 's_sz000001']);
    assert.equal(received[0].quote.name, '测试股票');
    assert.equal(received[1].quote.quotedAt - received[0].quote.quotedAt, 1);
    assert.ok(received.every(item => item.at >= item.quote.quotedAt));
    await verifyStreamFailures();
    console.log('Custom source HTTP and NDJSON streaming, auth, mappings, timestamps, failure and deadline regressions passed');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
