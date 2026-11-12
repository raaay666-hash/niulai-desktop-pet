const { marketForSymbol, displaySymbol } = require('./market-symbols');
const { marketClock, parseQuoteTime } = require('./quote-time');

const DEFAULT_FIELDS = Object.freeze({
  price: 'price', prevClose: 'previousClose', change: 'change', changePct: 'changePercent',
  timestamp: 'timestamp', session: 'session', name: 'name', symbol: 'symbol',
  regularPrice: 'regularPrice', dayPrevClose: 'dayPreviousClose'
});

function defaultSourceConfig() {
  return {
    name: '我的行情源', url: '', symbolFormat: 'ticker', authType: 'none', authName: 'X-API-Key', token: '',
    dataPath: '', timeZone: 'market', defaultSession: 'regular', interval: 10, markets: ['us'],
    fields: { ...DEFAULT_FIELDS }
  };
}

function normalizeSourceConfig(raw = {}) {
  const defaults = defaultSourceConfig();
  const config = {
    ...defaults, name: String(raw.name || defaults.name).trim().slice(0, 40),
    url: String(raw.url || '').trim(), token: String(raw.token || ''),
    authName: String(raw.authName || defaults.authName).trim(), dataPath: String(raw.dataPath || '').trim(),
    symbolFormat: ['ticker', 'yahoo', 'niulai'].includes(raw.symbolFormat) ? raw.symbolFormat : defaults.symbolFormat,
    authType: ['none', 'bearer', 'header', 'query'].includes(raw.authType) ? raw.authType : 'none',
    timeZone: ['market', 'UTC', 'Asia/Shanghai', 'America/New_York'].includes(raw.timeZone) ? raw.timeZone : 'market',
    defaultSession: raw.defaultSession === 'auto' ? 'auto' : 'regular',
    interval: [5, 10, 30, 60].includes(Number(raw.interval)) ? Number(raw.interval) : 10,
    markets: [...new Set((Array.isArray(raw.markets) ? raw.markets : defaults.markets).filter(value => ['cn', 'hk', 'us'].includes(value)))],
    fields: Object.fromEntries(Object.entries(DEFAULT_FIELDS).map(([key, fallback]) => [key, String(raw.fields?.[key] ?? fallback).trim().slice(0, 200)]))
  };
  if (!config.url || config.url.length > 4000) throw new Error('请填写有效的接口地址');
  let address;
  try { address = new URL(config.url.replace(/\{(?:symbol|ticker|code|market|exchange)\}/g, 'TEST')); }
  catch { throw new Error('接口地址格式无效'); }
  if (!['http:', 'https:'].includes(address.protocol)) throw new Error('接口地址须使用 HTTP 或 HTTPS');
  if (address.username || address.password) throw new Error('请在鉴权设置中填写凭据');
  if (!config.markets.length) throw new Error('请选择此行情源适用的市场');
  if (!config.fields.price) throw new Error('请填写现价字段路径');
  if (config.authType !== 'none' && !config.token) throw new Error('请填写鉴权密钥');
  if (config.token.length > 8192 || /[\r\n]/.test(config.token)) throw new Error('鉴权密钥格式无效');
  if (['header', 'query'].includes(config.authType) && !/^[A-Za-z0-9_-]{1,80}$/.test(config.authName)) throw new Error('鉴权名称只能包含字母、数字、下划线或连字符');
  if (config.authType === 'none') config.token = '';
  return config;
}

function sourceSymbol(code, format = 'ticker') {
  const market = marketForSymbol(code);
  const ticker = market === 'us' ? code.slice(3).toUpperCase() : market === 'hk' ? code.slice(5) : code.replace(/^s_(sh|sz|bj)/, '');
  if (format === 'niulai') return code;
  if (format === 'yahoo') {
    if (market === 'hk') return ticker.replace(/^0(?=\d{4}$)/, '') + '.HK';
    if (market === 'cn') return ticker + (code.includes('sh') ? '.SS' : code.includes('bj') ? '.BJ' : '.SZ');
    return ticker.replace('.', '-');
  }
  return ticker;
}

function requestForSource(config, code) {
  const market = marketForSymbol(code);
  const tokens = {
    symbol: sourceSymbol(code, config.symbolFormat), ticker: sourceSymbol(code), code, market,
    exchange: market === 'cn' ? code.slice(2, 4) : market
  };
  const address = new URL(config.url.replace(/\{(symbol|ticker|code|market|exchange)\}/g, (_match, key) => encodeURIComponent(tokens[key])));
  const headers = { Accept: 'application/json' };
  if (config.authType === 'bearer') headers.Authorization = 'Bearer ' + config.token;
  if (config.authType === 'header') headers[config.authName] = config.token;
  if (config.authType === 'query') address.searchParams.set(config.authName, config.token);
  return { url: address.toString(), headers };
}

function readPath(data, path) {
  if (!path) return data;
  const keys = path.startsWith('/') ? path.slice(1).split('/').map(key => key.replaceAll('~1', '/').replaceAll('~0', '~')) : path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let value = data;
  for (const key of keys) {
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function sourceTimestamp(value, config, code, now) {
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value))) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number < 1e12 ? number * 1000 : number : null;
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (config.timeZone === 'UTC') {
    const timestamp = /^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text) ? Date.parse(text.replaceAll('/', '-').replace(' ', 'T') + 'Z') : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const clockCode = config.timeZone === 'America/New_York' ? 'gb_mp' : config.timeZone === 'Asia/Shanghai' ? 's_sh000001' : code;
  return parseQuoteTime(text, clockCode, now);
}

function parseCustomQuote(data, code, config, now = Date.now()) {
  let item = readPath(data, config.dataPath);
  const field = (object, key) => config.fields[key] ? readPath(object, config.fields[key]) : undefined;
  if (Array.isArray(item)) {
    item = item.find(candidate => [sourceSymbol(code, config.symbolFormat), sourceSymbol(code), code].includes(String(field(candidate, 'symbol')))) || (item.length === 1 ? item[0] : null);
  }
  if (!item || typeof item !== 'object') throw new Error('数据路径未指向当前股票的报价对象');
  const number = key => {
    let value = field(item, key);
    if (typeof value === 'string') {
      value = value.trim().replaceAll(',', '');
      if (key === 'changePct') value = value.replace(/%$/, '');
    }
    return value === null || value === undefined || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const price = number('price');
  if (!(price > 0)) throw new Error('现价字段无有效正数，请检查字段映射');
  const returnedSymbol = field(item, 'symbol');
  if (returnedSymbol && ![sourceSymbol(code, config.symbolFormat), sourceSymbol(code), code].includes(String(returnedSymbol))) throw new Error('接口返回的股票代码与请求不符');
  const quotedAt = sourceTimestamp(field(item, 'timestamp'), config, code, now);
  const rawSession = String(field(item, 'session') || '').toLowerCase().replace(/[\s_-]/g, '');
  const sessions = { pre: 'pre', premarket: 'pre', '盘前': 'pre', post: 'post', postmarket: 'post', afterhours: 'post', '盘后': 'post', regular: 'regular', market: 'regular', '盘中': 'regular' };
  const inferred = Number.isFinite(quotedAt) ? marketClock(code, quotedAt).phase : 'regular';
  const session = marketForSymbol(code) === 'us' ? sessions[rawSession] || (config.defaultSession === 'auto' && ['pre', 'post'].includes(inferred) ? inferred : 'regular') : 'regular';
  const regularPrice = number('regularPrice');
  let prevClose = number('prevClose');
  let change = number('change'), changePct = number('changePct');
  if (!(prevClose > 0) && session !== 'regular' && regularPrice > 0) prevClose = regularPrice;
  if (!(prevClose > 0) && change !== null && price - change > 0) prevClose = price - change;
  if (!(prevClose > 0) && changePct !== null && changePct > -100) prevClose = price / (1 + changePct / 100);
  if (prevClose > 0) { change = price - prevClose; changePct = change / prevClose * 100; }
  const quote = {
    code, name: String(field(item, 'name') || displaySymbol(code)).slice(0, 60), price, prevClose,
    change, changePct, quotedAt, time: Number.isFinite(quotedAt) ? new Date(quotedAt).toISOString() : '',
    session, dayPrevClose: number('dayPrevClose') ?? (session === 'post' ? null : prevClose),
    market: marketForSymbol(code), source: 'custom', sourceName: config.name, volume: '', amount: ''
  };
  if (regularPrice > 0) quote.regular = { price: regularPrice };
  return quote;
}

async function fetchCustomQuote(code, config, { fetcher = fetch, now = Date.now(), signal } = {}) {
  const request = requestForSource(config, code);
  let response;
  try {
    const timeout = AbortSignal.timeout(8000);
    response = await fetcher(request.url, { headers: request.headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error' });
  } catch { throw new Error('自有接口连接失败，请检查地址、网络和鉴权设置'); }
  if (!response.ok) throw new Error(response.status === 429 ? '自有接口请求限流，请增大请求间隔' : '自有接口返回 HTTP ' + response.status);
  if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) throw new Error('接口响应过大，请使用单只股票的报价接口');
  let data;
  try { data = await response.json(); } catch { throw new Error('接口未返回有效 JSON'); }
  return parseCustomQuote(data, code, config, now);
}

async function fetchCustomQuotes(codes, config) {
  const results = new Map();
  const signal = AbortSignal.timeout(12000);
  let index = 0;
  async function worker() {
    while (index < codes.length) {
      const code = codes[index++];
      if (signal.aborted) { results.set(code, { error: '自有源本轮请求超时' }); continue; }
      try { results.set(code, { quote: await fetchCustomQuote(code, config, { signal }) }); }
      catch (error) { results.set(code, { error: error.message }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, codes.length) }, worker));
  return results;
}

module.exports = { defaultSourceConfig, normalizeSourceConfig, sourceSymbol, requestForSource, readPath, sourceTimestamp, parseCustomQuote, fetchCustomQuote, fetchCustomQuotes };
