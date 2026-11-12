const assert = require('node:assert/strict');
const { parseSinaQuote, parseTencentQuote } = require('../main-modules/quote-parsers');
const { marketClock, parseQuoteTime, quoteHealth, newestQuote } = require('../main-modules/quote-time');
const { CryingReaction } = require('../main-modules/crying-reaction.cjs');

const premarketNow = Date.parse('2026-11-12T13:47:50Z');
const regularNow = Date.parse('2026-11-12T15:00:30Z');
const postmarketNow = Date.parse('2026-11-12T21:05:30Z');
function fixture(patch = {}) {
  const fields = Array(36).fill('0');
  Object.assign(fields, {
    0: 'MP', 1: '36.73', 2: '0.74', 3: '2026-11-12 21:47:50',
    4: '0.27', 10: '5193900', 21: '37.88', 22: '3.16', 23: '1.16',
    24: 'Nov 12 08:47AM EST', 25: 'Nov 11 04:00PM EST', 26: '36.46', 27: '174211', ...patch
  });
  return `var hq_str_gb_mp="${fields.join(',')}";`;
}
const quote = (patch, now = premarketNow) => parseSinaQuote(fixture(patch), 'gb_mp', now);
const pre = quote();
assert.equal(pre.price, 37.88);
assert.equal(pre.session, 'pre');
assert.equal(pre.prevClose, 36.73);
assert.equal(pre.dayPrevClose, 36.73);
assert.ok(Math.abs(pre.change - 1.15) < 1e-9);
assert.equal(pre.quotedAt, Date.parse('2026-11-12T13:47:00Z'));
assert.equal(pre.regular.quotedAt, Date.parse('2026-11-11T21:00:00Z'));
assert.equal(pre.providerUpdatedAt, premarketNow);
assert.equal(pre.time, 'Nov 12 08:47AM EST');

const regular = quote({ 1: '38.1', 2: '3.73', 4: '1.37', 25: 'Nov 12 10:00AM EST', 26: '36.73' }, regularNow);
assert.equal(regular.price, 38.1);
assert.equal(regular.session, 'regular');
assert.equal(regular.prevClose, 36.73);
assert.equal(regular.quotedAt, Date.parse('2026-11-12T15:00:00Z'));
const post = quote({ 1: '38.1', 21: '39', 24: 'Nov 12 04:05PM EST', 25: 'Nov 12 04:00PM EST', 26: '36.73', 3: '2026-11-13 05:05:30' }, postmarketNow);
assert.equal(post.price, 39);
assert.equal(post.session, 'post');
assert.equal(post.prevClose, 38.1);
assert.equal(post.dayPrevClose, 36.73);
assert.ok(Math.abs(post.change - 0.9) < 1e-9);
assert.equal(post.quotedAt, Date.parse('2026-11-12T21:05:00Z'));
for (const patch of [{ 21: '0' }, { 21: '' }, { 24: '' }, { 24: 'invalid' }, { 24: 'Nov 12 08:55AM EST' }, { 24: 'Nov 10 05:00PM EST' }]) {
  assert.equal(quote(patch).session, 'regular', JSON.stringify(patch));
}

assert.equal(parseQuoteTime('Jul 01 08:47AM EDT', 'gb_mp', Date.parse('2026-07-01T12:47:00Z')), Date.parse('2026-07-01T12:47:00Z'));
assert.equal(parseQuoteTime('Nov 12 12:00AM EST', 'gb_mp', premarketNow), Date.parse('2026-11-12T05:00:00Z'));
assert.equal(parseQuoteTime('Nov 12 12:00PM EST', 'gb_mp', premarketNow), Date.parse('2026-11-12T17:00:00Z'));
assert.equal(parseQuoteTime('Dec 31 04:00PM EST', 'gb_mp', Date.parse('2027-01-01T01:00:00Z')), Date.parse('2026-12-31T21:00:00Z'));
assert.equal(parseQuoteTime('Nov 12 08:47AM EDT', 'gb_mp', premarketNow), null, 'Reject an inconsistent daylight-saving suffix');
assert.equal(parseQuoteTime('2026-02-31 10:00:00', 'gb_mp', premarketNow), null);
assert.equal(parseQuoteTime('2026-11-12 16:00:01', 'gb_mp'), Date.parse('2026-11-12T21:00:01Z'));
assert.equal(parseQuoteTime('2026/11/12 16:00:01', 'rt_hk00700'), Date.parse('2026-11-12T08:00:01Z'));
for (const [time, phase] of [
  ['2026-11-12T08:59:00Z', 'closed'], ['2026-11-12T09:00:00Z', 'pre'],
  ['2026-11-12T14:29:59Z', 'pre'], ['2026-11-12T14:30:00Z', 'regular'],
  ['2026-11-12T21:00:00Z', 'post'], ['2026-11-13T01:00:00Z', 'closed'],
  ['2026-11-14T15:00:00Z', 'weekend'], ['2026-07-01T13:30:00Z', 'regular']
]) assert.equal(marketClock('gb_mp', Date.parse(time)).phase, phase, time);

const record = { quote: pre, received: premarketNow };
assert.equal(quoteHealth(record, 10, premarketNow).actionable, true);
assert.equal(quoteHealth({ ...record, quote: quote({ 21: 0 }) }, 10, premarketNow).message, '盘前报价待更新');
assert.equal(quoteHealth({ ...record, received: premarketNow + 180000 }, 10, premarketNow + 180000).message, '报价较早');
assert.equal(quoteHealth({ ...record, error: '更新失败' }, 10, premarketNow).actionable, false);
assert.equal(quoteHealth({ ...record, quote: { ...pre, quotedAt: null } }, 10, premarketNow).message, '报价时间未确认');
assert.equal(quoteHealth({ quote: pre, received: regularNow }, 10, regularNow).actionable, false);
assert.equal(quoteHealth({ quote: regular, received: regularNow }, 10, regularNow).actionable, true);
assert.equal(quoteHealth({ quote: post, received: postmarketNow }, 10, postmarketNow).actionable, true);
assert.equal(quoteHealth({ quote: post, received: postmarketNow + 5 * 3600000 }, 10, postmarketNow + 5 * 3600000).actionable, false);
assert.equal(newestQuote([quote({ 21: 0 }), pre]), pre, 'An older fallback cannot replace a newer extended quote');
assert.equal(newestQuote([post, regular], postmarketNow), post);
assert.equal(newestQuote([{ ...post, session: 'regular', quotedAt: postmarketNow }, post], postmarketNow), post, 'A valid after-hours fallback wins over a regular-only feed with a newer update timestamp');

const tencentFields = Array(70).fill('0');
Object.assign(tencentFields, { 1: 'MP', 3: '36.73', 4: '36.46', 30: '2026-11-11 16:04:18', 31: '0.27', 32: '0.74' });
const backup = parseTencentQuote(`v_usMP="${tencentFields.join('~')}";`, 'gb_mp');
assert.equal(backup.session, 'regular');
assert.equal(backup.quotedAt, Date.parse('2026-11-11T21:04:18Z'));
assert.equal(newestQuote([backup, pre]), pre);

let clock = regularNow;
const policy = new CryingReaction({ now: () => clock });
const oldRegular = { ...regular, changePct: -5, quotedAt: regularNow - 3600000 };
policy.reset('gb_mp');
clock += 30000;
policy.update('gb_mp', { quote: oldRegular, received: clock });
clock += 6000;
assert.equal(policy.update('gb_mp', { quote: oldRegular, received: clock }), false, 'Fresh HTTP responses with old prices cannot trigger crying');
clock = regularNow;
const confirmed = new CryingReaction({ now: () => clock });
confirmed.reset('gb_mp');
clock += 30000;
const sameTrade = { ...regular, changePct: -5 };
assert.equal(confirmed.update('gb_mp', { quote: sameTrade, received: clock }), false);
clock += 6000;
assert.equal(confirmed.update('gb_mp', { quote: sameTrade, received: clock }), false, 'Repeated copies of the same quote do not confirm a reaction');
clock += 6000;
assert.equal(confirmed.update('gb_mp', { quote: { ...sameTrade, price: 37, quotedAt: clock }, received: clock }), true);

import('../niulai-android/web/core.mjs').then(({ position }) => {
  const stock = { code: 'gb_mp', cost: 30, shares: 5 };
  assert.ok(Math.abs(position(stock, pre).today - 5.75) < 1e-9);
  assert.ok(Math.abs(position(stock, post).today - 11.35) < 1e-9, 'After-hours daily P&L includes the regular session');
  assert.equal(position(stock, post).total, 45);
  console.log('US premarket, regular, after-hours, timestamps, DST, fallback, freshness and P&L regressions passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
