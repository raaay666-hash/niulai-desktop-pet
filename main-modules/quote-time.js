const { marketForSymbol } = require('./market-symbols');

const US_ZONE = 'America/New_York';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const clockFormats = new Map();

function marketClock(code, now = Date.now()) {
  const market = marketForSymbol(code);
  const zone = market === 'us' ? US_ZONE : 'Asia/Shanghai';
  if (!clockFormats.has(zone)) {
    clockFormats.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
  }
  const parts = Object.fromEntries(clockFormats.get(zone).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  let phase = 'closed';
  if (['Sat', 'Sun'].includes(parts.weekday)) phase = 'weekend';
  else if (market === 'us') {
    if (minute >= 240 && minute < 570) phase = 'pre';
    else if (minute >= 570 && minute < 960) phase = 'regular';
    else if (minute >= 960 && minute < 1200) phase = 'post';
  } else {
    const lunch = market === 'hk' ? 720 : 690;
    const close = market === 'hk' ? 960 : 900;
    if (minute >= lunch && minute < 780) phase = 'lunch';
    else if (minute >= 570 && minute < close) phase = 'regular';
  }
  return { ...parts, market, zone, dateKey, minuteOfDay: minute, phase };
}

function wallTime(year, month, day, hour, minute, second, code) {
  const wanted = Date.UTC(year, month, day, hour, minute, second);
  if (!Number.isFinite(wanted)) return null;
  let timestamp = wanted;
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = marketClock(code, timestamp);
    const represented = Date.UTC(Number(actual.year), Number(actual.month) - 1, Number(actual.day), Number(actual.hour), Number(actual.minute), Number(actual.second));
    timestamp += wanted - represented;
  }
  const actual = marketClock(code, timestamp);
  return Number(actual.year) === year && Number(actual.month) - 1 === month && Number(actual.day) === day && Number(actual.hour) === hour && Number(actual.minute) === minute ? timestamp : null;
}

function parseQuoteTime(value, code, reference = Date.now()) {
  const text = String(value || '').trim();
  const numeric = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (numeric) {
    const [, year, month, day, hour, minute, second] = numeric.map(Number);
    return wallTime(year, month - 1, day, hour, minute, second, code);
  }
  if (marketForSymbol(code) !== 'us') return null;
  const american = /^([a-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(AM|PM)(?:\s+(EST|EDT))?$/i.exec(text);
  if (!american) return null;
  const month = MONTHS.indexOf(american[1].toLowerCase());
  const day = Number(american[2]), rawHour = Number(american[3]), minute = Number(american[4]);
  if (month < 0 || rawHour < 1 || rawHour > 12 || minute > 59 || day < 1 || day > 31) return null;
  const hour = rawHour % 12 + (american[5].toUpperCase() === 'PM' ? 12 : 0);
  const year = Number(marketClock(code, reference).year);
  const candidates = [year - 1, year, year + 1].map(candidate => {
    if (american[6]) {
      const offset = american[6].toUpperCase() === 'EDT' ? 4 : 5;
      const timestamp = Date.UTC(candidate, month, day, hour + offset, minute);
      const clock = marketClock(code, timestamp);
      return Number(clock.month) - 1 === month && Number(clock.day) === day && Number(clock.hour) === hour ? timestamp : null;
    }
    return wallTime(candidate, month, day, hour, minute, 0, code);
  }).filter(Number.isFinite);
  candidates.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference));
  return candidates[0] ?? null;
}

function quoteHealth(record, interval = 10, now = Date.now()) {
  const quote = record?.quote;
  const maxReceiveAge = Math.max(45000, interval * 2500);
  if (!quote || !(quote.price > 0)) return { warning: true, actionable: false, message: record?.error || '等待行情' };
  if (record.error || !record.received || now - record.received > maxReceiveAge || record.received > now + 5000) {
    return { warning: true, actionable: false, message: record.error ? '更新延迟 · ' + record.error : '连接更新延迟' };
  }
  if (marketForSymbol(quote.code) !== 'us' && quote.source !== 'custom') return { warning: false, actionable: true, message: '' };
  if (!Number.isFinite(quote.quotedAt) || quote.quotedAt > now + 90000) {
    return { warning: true, actionable: false, message: '报价时间未确认' };
  }
  const clock = marketClock(quote.code, now);
  const active = ['pre', 'regular', 'post'].includes(clock.phase);
  if (!active) return { warning: false, actionable: false, message: '休市' };
  if (quote.session !== clock.phase || marketClock(quote.code, quote.quotedAt).dateKey !== clock.dateKey) {
    return { warning: true, actionable: false, message: { pre: '盘前报价待更新', regular: '常规报价待更新', post: '盘后报价待更新' }[clock.phase] };
  }
  if (now - quote.quotedAt > Math.max(120000, interval * 3000)) {
    return { warning: true, actionable: false, message: '报价较早' };
  }
  return { warning: false, actionable: true, message: '' };
}

function newestQuote(candidates, now = Date.now()) {
  let latest = null;
  const timed = quote => Number.isFinite(quote?.quotedAt) && quote.quotedAt <= now + 90000;
  const current = quote => timed(quote) && !quoteHealth({ quote, received: now }, 10, now).warning;
  for (const candidate of candidates) {
    if (!(candidate?.price > 0)) continue;
    const candidateCurrent = current(candidate), latestCurrent = current(latest);
    if (!latest || candidateCurrent && !latestCurrent || candidateCurrent === latestCurrent && timed(candidate) && (!timed(latest) || candidate.quotedAt > latest.quotedAt)) latest = candidate;
  }
  return latest;
}

module.exports = { marketClock, parseQuoteTime, quoteHealth, newestQuote };
