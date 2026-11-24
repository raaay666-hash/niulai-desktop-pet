import { catalog as sharedCatalog } from '../niulai-android/web/bull-motion.mjs';
import { DesktopBullMotion } from './desktop-crying-motion.js';
import { marketSession } from '../niulai-android/web/core.mjs';
import quoteTime from '../main-modules/quote-time.js';
export const { quoteHealth } = quoteTime;
export const catalog = sharedCatalog.map(spec => ['cover', 'slump'].includes(spec.id) ? { ...spec, action: '捂眼哭泣' } : spec);
export const $ = id => document.getElementById(id);
export const api = window.desktopPet;
const numberFormats = new Map();
const priceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const hkPriceFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 });
const localClock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23' });
const receiptClock = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false, hourCycle: 'h23'
});
const sourceClocks = new Map();
export function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  if (!numberFormats.has(digits)) numberFormats.set(digits, new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return numberFormats.get(digits).format(value);
}
export const marketPrice = (value, code = '') => Number.isFinite(value) ? (code.startsWith('rt_hk') ? hkPriceFormat : priceFormat).format(value) : '—';
export const signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value), digits)}` : '—';
export const tone = value => value > 0 ? 'rise' : value < 0 ? 'fall' : 'neutral';
export const time = value => Number.isFinite(value) ? localClock.format(value) : '—';
export function setText(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}
export function setAttributeValue(node, name, value) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}
export function sourceReceiptTiming(delay) {
  if (!Number.isFinite(delay)) return '';
  if (delay < 0) return '源时间晚于本机接收时间';
  return `源时间至接收 ${delay < 10000 ? Math.round(delay) + ' 毫秒' : fmt(delay / 1000, 1) + ' 秒'}`;
}
export function streamStatusText(source) {
  if (!source?.streamConfigured) return '';
  return { connecting: '正在连接推送', live: '推送已连接', reconnecting: '推送已断开，正在重连' }[source.streamStatus] || '等待推送连接';
}
function sourceTimestamp(quote, us, isPush) {
  if (!Number.isFinite(quote.quotedAt)) return quote.time || '时间未提供';
  const zone = us ? 'America/New_York' : 'Asia/Shanghai';
  const precision = quote.timePrecision === 'minute' ? 'minute' :
    isPush && quote.timePrecision === 'millisecond' ? 'millisecond' : 'second';
  const key = `${zone}/${precision}`;
  if (!sourceClocks.has(key)) sourceClocks.set(key, new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
    second: precision === 'minute' ? undefined : '2-digit', fractionalSecondDigits: precision === 'millisecond' ? 3 : undefined
  }));
  return sourceClocks.get(key).format(quote.quotedAt) + (us ? ' 美东' : '');
}
export function quotePresentation(record, interval = 10, now = Date.now()) {
  const quote = record?.quote;
  const health = quoteHealth(record, interval, now);
  if (!quote) return { ...health, session: '', label: '', summary: health.message, compact: health.message, detail: health.message, basis: '' };
  const us = quote.market === 'us' || quote.code.startsWith('gb_');
  const clock = quoteTime.marketClock(quote.code, now);
  const label = us ? { pre: '盘前', regular: '常规', post: '盘后' }[quote.session] || '常规' : '';
  const custom = quote.source === 'custom', isPush = custom && record.transport === 'ndjson';
  const provider = custom ? (quote.sourceName || '自有源') + ' · ' + (isPush ? '推送' : 'HTTP 快照') : (quote.source === 'tencent' ? '腾讯' : '新浪') + (quote.fallbackFrom ? '（自有源回退）' : '');
  const stamp = sourceTimestamp(quote, us, isPush);
  const prefix = health.message ? health.message + ' · ' : '';
  const quoteText = us || custom ? `${label ? label + ' · ' : ''}报价 ${stamp}` : `获取于 ${time(record.received)}`;
  const currentSession = { pre: '盘前', regular: '常规交易时段', post: '盘后', closed: '常规时段外', weekend: '周末休市', lunch: '午间休市' }[clock.phase];
  const basis = quote.session === 'pre' ? '盘前涨跌较上一常规收盘' : quote.session === 'post' ? '盘后涨跌较当日常规收盘' : '涨跌较前收盘';
  const reference = quote.regular && quote.session !== 'regular' ? ` · 常规收盘 ${fmt(quote.regular.price)}` : '';
  const timing = custom && quote.timePrecision !== 'minute' && Number.isFinite(quote.quotedAt) && Number.isFinite(record.received)
    ? sourceReceiptTiming(record.received - quote.quotedAt) : '';
  const receipt = Number.isFinite(record.received) ? receiptClock.format(record.received) : '—';
  return {
    ...health, label, session: us ? currentSession + (label && quote.session !== clock.phase ? ` · 最近${label}报价` : '') : marketSession(quote.code),
    summary: isPush ? `${prefix}${provider}${label ? ' · ' + label : ''}` : `${prefix}${provider} · ${quoteText}`,
    compact: `${prefix}${custom || quote.fallbackFrom ? provider + ' · ' : ''}${quoteText}`,
    detail: [
      `${provider} · ${label || '常规'}报价`, `报价时间 ${stamp}`, `本机接收 ${receipt}`, timing,
      basis + reference,
      custom ? '时间差取决于源时间戳与两端时钟。交易范围以自有接口为准。' : '公开行情可能延迟，不同来源的成交范围可能不同'
    ].filter(Boolean).join('\n'),
    basis: basis + reference, timing, receipt
  };
}
export function element(tag, value = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = className;
  return node;
}
export function makeMotion(canvas) {
  return new DesktopBullMotion(canvas, null, { assetBase: 'assets/2d/frames/webp/' });
}
export function desktopMood(base, data, code) {
  if (!data.state.settings.autoActions || data.suspended || ['offline', 'loading', 'preopen', 'closed', 'weekend', 'lunch'].includes(base)) return base;
  if (data.reactions?.[code]?.crying && marketSession(code) === '常规交易时段') return data.quotes[code]?.quote?.changePct <= -5 ? 'slump' : 'cover';
  return ['cover', 'slump'].includes(base) ? 'incense' : base;
}
const sparklines = new WeakMap();
export function drawSparkline(canvas, samples, color) {
  const previous = sparklines.get(canvas);
  const width = canvas.width, height = canvas.height;
  if (previous?.color === color && previous.width === width && previous.height === height && previous.samples.length === samples.length &&
      samples.every((sample, index) => sample.at === previous.samples[index].at && sample.price === previous.samples[index].price)) return;
  sparklines.set(canvas, { color, width, height, samples });
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  if (samples.length < 2) return;
  const prices = samples.map(sample => sample.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || Math.max(1, min * .001);
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = 5 + index / (samples.length - 1) * (width - 10);
    const y = max === min ? height / 2 : height - 9 - (sample.price - min) / span * (height - 18);
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.stroke();
}

const paths = {
  feedback: '<path d="M5 4h14a2 2 0 012 2v10a2 2 0 01-2 2h-7l-5 3v-3H5a2 2 0 01-2-2V6a2 2 0 012-2zM7 9h10M7 13h7"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M3 17l6-6 4 3 8-9M16 5h5v5M3 21h18"/>',
  wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 12v3h4v-3"/>',
  wood: '<path d="M4 16c0-4 3-7 8-7s8 3 8 7c0 3-16 3-16 0zM8 14l8-2M6 4l7 5"/>',
  desktop: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M20 10a8 8 0 10-1 7M20 3v7h-7"/>',
  pet: '<path d="M5 9L3 4l6 3m10 2 2-5-6 3M5 11c0-4 14-4 14 0v6c0 6-14 6-14 0zM8 13v1m8-1v1M9 18h6"/>',
  card: '<rect x="3" y="3" width="18" height="16" rx="3"/><path d="M7 7h5M7 12h10M7 22h10"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>'
};
export function paintIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[node.dataset.icon] || ''}</svg>`;
  }
}
