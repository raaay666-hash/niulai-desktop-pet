const { marketForSymbol } = require('./market-symbols');
const { tencentQuoteParts } = require('./quote-parsers');
const { marketClock, parseQuoteTime } = require('./quote-time');

const number = value => (typeof value === 'string' && value.trim() || typeof value === 'number') && Number.isFinite(Number(value)) ? Number(value) : null;
const positive = value => number(value) > 0 ? Number(value) : null;
const quantity = value => {
  const result = number(value);
  return result !== null && result >= 0 ? result : null;
};

function normalizeDetails(values) {
  const { volumeUnit, book, quotedAt } = values;
  const details = {
    open: positive(values.open), high: positive(values.high), low: positive(values.low),
    previousClose: positive(values.previousClose), volume: quantity(values.volume),
    amount: quantity(values.amount), quotedAt: Number.isFinite(quotedAt) ? quotedAt : null,
    volumeUnit: ['手', '股'].includes(volumeUnit) ? volumeUnit : ''
  };
  if (details.high !== null && details.low !== null && details.high < details.low) {
    details.high = details.low = null;
  }
  if (book && ['手', '股'].includes(book.unit)) {
    const levels = (rows, order) => {
      const unique = new Map();
      for (const row of Array.isArray(rows) ? rows.slice(0, 100) : []) {
        const price = positive(row?.price), size = quantity(row?.size);
        if (price !== null && size > 0) unique.set(price, { price, size });
      }
      return [...unique.values()].sort((a, b) => (a.price - b.price) * order).slice(0, 20);
    };
    const bids = levels(book.bids, -1), asks = levels(book.asks, 1);
    if (bids.length || asks.length) {
      details.book = {
        bids, asks, unit: book.unit,
        quotedAt: Number.isFinite(book.quotedAt) ? book.quotedAt : details.quotedAt
      };
    }
  }
  return details;
}

function parseMarketDetails(text, code, symbol) {
  const fields = tencentQuoteParts(text, symbol);
  if (!fields || !positive(fields[3])) throw new Error('行情源暂未提供该标的的盘口资料');
  const market = marketForSymbol(code);
  const cn = market === 'cn';
  const timestamp = (fields[30] || '').replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5:$6');
  const levels = start => Array.from({ length: 5 }, (_, level) => ({
    price: fields[start + level * 2], size: fields[start + level * 2 + 1]
  }));
  return {
    ...normalizeDetails({
      open: fields[5], high: fields[33], low: fields[34], previousClose: fields[4],
      volume: fields[6], volumeUnit: cn ? '手' : '股',
      amount: cn && quantity(fields[37]) !== null ? Number(fields[37]) * 10000 : fields[37],
      quotedAt: parseQuoteTime(timestamp, code),
      book: cn ? { unit: '手', bids: levels(9), asks: levels(19) } : null
    }),
    source: '腾讯公开行情', depthLabel: '公开五档'
  };
}

function dateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? value : '';
}

function parseTencentMinutes(body, market, symbol) {
  const data = body?.code === 0 ? body.data?.[symbol] : null;
  const date = dateKey(String(data?.data?.date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
  const end = market === 'hk' ? 970 : 900;
  const lunch = market === 'hk' ? 720 : 690;
  const unique = new Map();
  for (const row of Array.isArray(data?.data?.data) ? data.data.data : []) {
    if (typeof row !== 'string') continue;
    const [time, rawPrice, rawVolume] = row.trim().split(/\s+/);
    if (!/^\d{4}$/.test(time) || Number(time.slice(2)) > 59) continue;
    const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(2));
    const price = positive(rawPrice);
    if (!price || minute < 570 || minute > end || minute > lunch && minute < 780) continue;
    unique.set(minute, { minute, price, cumulative: quantity(rawVolume) });
  }
  let previousVolume = 0;
  const points = [...unique.values()].sort((a, b) => a.minute - b.minute).map(({ minute, price, cumulative }) => {
    const volume = cumulative !== null && previousVolume !== null && cumulative >= previousVolume ? cumulative - previousVolume : null;
    previousVolume = cumulative;
    return { minute, price, volume };
  });
  if (!date || !points.length) throw new Error('行情源暂未提供有效分时');
  const quote = data.qt?.[symbol];
  const quoteDate = String(quote?.[30] || '').match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  const previousClose = quoteDate?.slice(1).join('-') === date ? positive(quote?.[4]) : null;
  return { date, start: 570, end, lunch: [lunch, 780], points, previousClose, volumeUnit: market === 'hk' ? '股' : '手', source: '腾讯公开行情' };
}

function parseYahooMinutes(body, code, ticker) {
  const series = body?.chart?.result?.[0];
  if (series?.meta?.symbol !== ticker || series.meta.exchangeTimezoneName !== 'America/New_York') throw new Error('行情源暂未提供有效分时');
  const { meta, timestamp } = series, quote = series.indicators?.quote?.[0];
  const periods = meta.tradingPeriods?.regular || meta.tradingPeriods;
  const sessions = (Array.isArray(periods) ? [].concat(...periods) : []).filter(period => Number.isFinite(period?.start) && Number.isFinite(period?.end));
  const regular = meta.currentTradingPeriod?.regular;
  if (Number.isFinite(regular?.start) && Number.isFinite(regular?.end)) sessions.push(regular);
  const unique = new Map();
  for (const [index, seconds] of (Array.isArray(timestamp) ? timestamp : []).entries()) {
    const price = positive(quote?.close?.[index]);
    if (!price || !Number.isFinite(seconds)) continue;
    const session = sessions.find(period => seconds >= period.start && seconds < period.end);
    if (!session) continue;
    const clock = marketClock(code, seconds * 1000);
    const key = clock.dateKey + ' ' + clock.minuteOfDay;
    if (unique.has(key) && seconds % 60) continue;
    unique.set(key, {
      date: clock.dateKey, minute: clock.minuteOfDay, price,
      volume: seconds % 60 ? null : quantity(quote.volume?.[index]), session
    });
  }
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute);
  const latest = sorted[sorted.length - 1];
  if (!latest) throw new Error('行情源暂未提供有效分时');
  const date = latest.date, { start, end } = latest.session;
  return {
    date, start: marketClock(code, start * 1000).minuteOfDay, end: marketClock(code, end * 1000).minuteOfDay,
    points: sorted.filter(point => point.date === date).map(({ minute, price, volume }) => ({ minute, price, volume })),
    previousClose: positive(meta.chartPreviousClose), volumeUnit: '股', source: 'Yahoo Finance 公开行情'
  };
}

function minuteOfDay(time) {
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function parseCustomSeries(data, symbols, period, adjustment) {
  if (!symbols.includes(String(data?.symbol)) || data.period !== period || data.adjustment !== adjustment || !['手', '股'].includes(data.volumeUnit)) {
    throw new Error('走势接口返回的标的、周期、复权方式或成交量单位不符');
  }
  const { volumeUnit } = data, unique = new Map();
  if (period === 'minute') {
    const date = dateKey(data.date);
    const start = minuteOfDay(data.session?.open), end = minuteOfDay(data.session?.close);
    const from = minuteOfDay(data.session?.breakStart), to = minuteOfDay(data.session?.breakEnd);
    const lunch = from !== null && to !== null && from > start && from < to && to < end ? [from, to] : undefined;
    if (!date || start === null || end === null || start >= end) throw new Error('分时接口未提供有效交易日和时段');
    for (const row of Array.isArray(data.points) ? data.points.slice(-2000) : []) {
      const minute = minuteOfDay(row?.time), price = positive(row?.price);
      if (!price || minute === null || minute < start || minute > end || lunch && minute > from && minute < to) continue;
      unique.set(minute, { minute, price, volume: quantity(row.volume) });
    }
    if (!unique.size) throw new Error('分时接口未返回有效数据');
    return { date, start, end, lunch, points: [...unique.values()].sort((a, b) => a.minute - b.minute), previousClose: positive(data.previousClose), volumeUnit };
  }

  for (const row of Array.isArray(data.bars) ? data.bars.slice(-4000) : []) {
    const date = dateKey(row?.date);
    if (!date) continue;
    const [open, high, low, close] = [row.open, row.high, row.low, row.close].map(number);
    if ([open, high, low, close].some(value => value === null) || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    if (adjustment === 'raw' && low <= 0) continue;
    unique.set(date, { date, open, high, low, close, volume: quantity(row.volume) });
  }
  if (!unique.size) throw new Error('K 线接口未返回有效数据');
  return { bars: [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)), adjusted: adjustment === 'qfq', volumeUnit };
}

module.exports = { normalizeDetails, parseMarketDetails, parseTencentMinutes, parseYahooMinutes, parseCustomSeries };
