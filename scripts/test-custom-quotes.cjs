const assert = require('node:assert/strict');
const http = require('node:http');
const { defaultSourceConfig, normalizeSourceConfig, sourceSymbol, requestForSource, readPath, parseCustomQuote, fetchCustomQuote, fetchCustomQuotes } = require('../main-modules/custom-quotes.cjs');
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

(async () => {
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ url: request.url, authorization: request.headers.authorization });
    const symbol = new URL(request.url, 'http://localhost').searchParams.get('symbol');
    if (symbol === 'ERROR') { response.writeHead(429).end('{}'); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...body, symbol }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const local = { ...bearer, url: `http://127.0.0.1:${server.address().port}/quotes?symbol={symbol}` };
    const result = await fetchCustomQuote('gb_mp', local, { now });
    assert.equal(result.price, 37.88);
    assert.equal(calls[0].url, '/quotes?symbol=MP');
    assert.equal(calls[0].authorization, 'Bearer secret-token');
    const quotes = await fetchCustomQuotes(['gb_mp', 'gb_aapl', 'gb_error'], local);
    assert.equal(quotes.get('gb_aapl').quote.code, 'gb_aapl');
    assert.match(quotes.get('gb_error').error, /限流/);
    assert.equal(quotes.get('gb_error').error.includes('secret-token'), false);
    const { position } = await import('../niulai-android/web/core.mjs');
    assert.equal(position({ code: 'gb_mp', cost: 30, shares: 5 }, missingBase).today, null);
    const { AlertTriggerEngine } = await import('../renderer-modules/alert-trigger-engine.js');
    assert.equal(Number.isNaN(new AlertTriggerEngine().valueFor({ type: 'change_pct' }, { quote: missingBase })), true);
    console.log('Custom source HTTP, auth, mapping, symbol validation, timestamps, missing baselines and partial failures passed');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
