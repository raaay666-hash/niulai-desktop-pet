const assert = require('node:assert/strict');
const { CryingReaction, AUDIO_COOLDOWN_MS } = require('../main-modules/crying-reaction.cjs');
const { normalizeSettings } = require('../main-modules/desktop-state.cjs');
const opening = Date.parse('2026-11-12T02:00:00Z');
let now = opening;
const code = 's_sh000001';
const config = normalizeSettings({ mamaSound: true, autoActions: true });
let policy = new CryingReaction({ now: () => now });
const record = (pct, extras = {}) => ({ quote: { code, price: 100, changePct: pct }, received: now, ...extras });
const update = (pct, extras) => policy.update(code, record(pct, extras));
const enter = () => {
  policy.reset(code); now += 30000;
  assert.equal(update(-3.1), false);
  now += 5000;
  assert.equal(update(-3.2), true);
};
enter();
assert.equal(policy.claimAudio(code, record(-3.2), config, true), false, 'One-second visual lead');
now += 1000;
assert.equal(policy.claimAudio(code, record(-3.2), config, true), true);
assert.equal(policy.claimAudio(code, record(-3.2), config, true), false, 'One voice per crying episode');
now += 10000; assert.equal(update(-2.6), true, 'Hysteresis retains the animation');
now += 10000; assert.equal(update(-2.4), true);
now += 5000; assert.equal(update(-2.4), false, 'Two recovery quotes stop crying');
now += 5000; update(-3.2); now += 5000; update(-3.3); now += 1000;
assert.equal(policy.claimAudio(code, record(-3.3), config, true), false, 'Global cooldown');
now += AUDIO_COOLDOWN_MS;
update(-2.4); now += 5000; update(-2.4);
now += 5000; update(-3.1); now += 5000; update(-3.3); now += 1000;
assert.equal(policy.claimAudio(code, record(-3.3), config, true), true, 'Recovery and another crossing rearm audio');

for (const [label, options, visible] of [
  ['default disabled', { mamaSound: false }, true],
  ['muted', { muted: true }, true],
  ['animation disabled', { motion: false }, true],
  ['automatic actions disabled', { autoActions: false }, true],
  ['quiet office', { quietOffice: { enabled: true, start: '09:00', end: '11:00' } }, true],
  ['no visible character', {}, false]
]) {
  now = opening;
  policy = new CryingReaction({ now: () => now }); enter(); now += 1000;
  assert.equal(policy.claimAudio(code, record(-3.3), { ...config, ...options }, visible), false, label);
  assert.equal(policy.claimAudio(code, record(-3.3), config, true), false, label + ' does not replay later');
}
now = opening;
policy = new CryingReaction({ now: () => now }); policy.reset(code);
assert.equal(update(-6), false); now += 20000; assert.equal(update(-6), false, 'Startup guard');
now += 10000; assert.equal(update(-6), false); now += 1000; assert.equal(update(-6), false, 'Five-second minimum confirmation');
now += 5000; assert.equal(update(-6), true);
policy.invalidate(code);
now += 5000; assert.equal(update(-3.3), false); now += 5000; assert.equal(update(-3.3), true); now += 1000;
assert.equal(policy.claimAudio(code, record(-3.3), config, true), false, 'Reconnect cannot replay the same episode');
policy.reset(code); now += 1000; assert.equal(update(-6), false, 'Selection/resume guard');
now += 30000; update(-3.3); now += 5000; assert.equal(update(-3.3, { error: 'offline' }), false);
now += 5000; assert.equal(update(-3.3), false, 'Failed sample breaks confirmation');
now += 5000; assert.equal(update(-3.3, { received: now - 100000 }), false, 'Stale quote');
now = Date.parse('2026-11-14T02:00:00Z'); assert.equal(update(-6), false, 'Weekend');
now = Date.parse('2026-11-12T04:00:00Z'); assert.equal(update(-6), false, 'Lunch');
now = Date.parse('2026-11-12T10:00:00Z'); assert.equal(update(-6), false, 'Closed session');
console.log('Crying confirmation, hysteresis, cooldown, startup, audio and interruption rules passed');
