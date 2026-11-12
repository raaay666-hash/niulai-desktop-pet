const {
  MARKET,
  marketForSymbol,
  quoteProviderSymbol
} = require('./market-symbols');
const { marketClock, parseQuoteTime } = require('./quote-time');

function parseSinaQuote(text, symbol, now = Date.now()) {
  const escaped = String(symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`var hq_str_${escaped}="([^"]*)"`));
  if (!match || !match[1]) return null;
  const parts = match[1].split(',');
  const market = marketForSymbol(symbol);
  const layout = market === MARKET.HK
    ? { name: 1, price: 6, change: 7, changePct: 8, prevClose: 3, volume: 12, amount: 11, date: 17, time: 18 }
    : market === MARKET.US
      ? { name: 0, price: 1, change: 4, changePct: 2, prevClose: 26, volume: 10, amount: 12, time: 3 }
      : { name: 0, price: 1, change: 2, changePct: 3, volume: 4, amount: 5, time: 31 };
  const price = Number.parseFloat(parts[layout.price]);
  const change = Number.parseFloat(parts[layout.change]);
  const changePct = Number.parseFloat(parts[layout.changePct]);
  if (![price, change, changePct].every(Number.isFinite)) return null;
  const providedPrevClose = Number.parseFloat(parts[layout.prevClose]);
  const quote = {
    code: symbol,
    name: parts[layout.name] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ''),
    price,
    change,
    prevClose: Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
    changePct,
    volume: parts[layout.volume] || '',
    amount: parts[layout.amount] || '',
    time: [parts[layout.date], parts[layout.time]].filter(Boolean).join(' '),
    market,
    source: 'sina'
  };
  if (market !== MARKET.US) return quote;

  // The provider update at field 3 also advances while the regular price is unchanged.
  const providerUpdatedAt = parseQuoteTime(parts[3], 's_sh000001', now);
  const reference = providerUpdatedAt ?? now;
  const regular = {
    price, change, changePct, prevClose: quote.prevClose,
    time: parts[25] || '', quotedAt: parseQuoteTime(parts[25], symbol, reference)
  };
  Object.assign(quote, {
    time: regular.time, quotedAt: regular.quotedAt, session: 'regular',
    dayPrevClose: regular.prevClose, providerUpdatedAt, timePrecision: 'minute', regular
  });
  const extendedPrice = Number.parseFloat(parts[21]);
  const extendedAt = parseQuoteTime(parts[24], symbol, reference);
  if (!(extendedPrice > 0) || !Number.isFinite(extendedAt) || extendedAt > now + 90000) return quote;
  const phase = marketClock(symbol, extendedAt).phase;
  if (!['pre', 'post'].includes(phase) || Number.isFinite(regular.quotedAt) && extendedAt <= regular.quotedAt) return quote;

  const extendedChange = extendedPrice - regular.price;
  return {
    ...quote, price: extendedPrice, change: extendedChange,
    changePct: extendedChange / regular.price * 100, prevClose: regular.price,
    dayPrevClose: phase === 'pre' ? regular.price : regular.prevClose,
    time: parts[24], quotedAt: extendedAt, session: phase,
    volume: parts[27] || '', amount: ''
  };
}

function parseTencentQuote(text, symbol) {
  const providerSymbol = quoteProviderSymbol(symbol, 'tencent');
  const escaped = providerSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`v_${escaped}="([^"]*)"`));
  if (!match || !match[1]) return null;
  const parts = match[1].split('~');
  const market = marketForSymbol(symbol);
  const detailed = market !== MARKET.CN;
  const price = Number.parseFloat(parts[3]);
  const change = Number.parseFloat(parts[detailed ? 31 : 4]);
  const changePct = Number.parseFloat(parts[detailed ? 32 : 5]);
  if (![price, change, changePct].every(Number.isFinite)) return null;
  const providedPrevClose = Number.parseFloat(parts[4]);
  const quote = {
    code: symbol,
    name: parts[1] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ''),
    price,
    change,
    prevClose: detailed && Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
    changePct,
    volume: parts[6] || '',
    amount: parts[detailed ? 37 : 7] || '',
    time: detailed ? parts[30] || '' : '',
    source: 'tencent',
    market
  };
  if (market === MARKET.US) {
    quote.session = 'regular';
    quote.quotedAt = parseQuoteTime(quote.time, symbol);
    quote.dayPrevClose = quote.prevClose;
    quote.regular = { price, change, changePct, prevClose: quote.prevClose, time: quote.time, quotedAt: quote.quotedAt };
  }
  return quote;
}

module.exports = { parseSinaQuote, parseTencentQuote };
