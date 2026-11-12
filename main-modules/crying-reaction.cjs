const { marketForSymbol } = require('./market-symbols');
const STARTUP_GUARD_MS = 30000;
const AUDIO_COOLDOWN_MS = 15 * 60 * 1000;
const CONFIRM_MS = 5000;

function regularSession(code, now) {
  const market = marketForSymbol(code);
  const zone = market === 'us' ? 'America/New_York' : 'Asia/Shanghai';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  if (['Sat', 'Sun'].includes(parts.weekday)) return false;
  const minute = Number(parts.hour) % 24 * 60 + Number(parts.minute);
  if (market === 'us') return minute >= 570 && minute < 960;
  return minute >= 570 && minute < (market === 'hk' ? 720 : 690) || minute >= 780 && minute < (market === 'hk' ? 960 : 900);
}
function quietNow(settings, now) {
  const quiet = settings.quietOffice;
  if (!quiet?.enabled) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) % 24 * 60 + Number(parts.minute);
  const toMinute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = toMinute(quiet.start), end = toMinute(quiet.end);
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

class CryingReaction {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.entries = new Map();
    this.lastAudioAt = -Infinity;
  }
  reset(code) {
    const previous = this.entries.get(code);
    this.entries.set(code, {
      guardUntil: this.now() + STARTUP_GUARD_MS,
      crying: false, armed: previous?.armed ?? true, pendingAudio: false,
      lowAt: null, highAt: null, lastReceived: 0, enteredAt: 0
    });
  }
  invalidate(code) {
    const entry = this.entries.get(code);
    if (!entry) return;
    entry.crying = false; entry.pendingAudio = false;
    entry.lowAt = null; entry.highAt = null;
  }
  update(code, record, interval = 10) {
    if (!this.entries.has(code)) this.reset(code);
    const entry = this.entries.get(code), now = this.now();
    const quote = record?.quote;
    const maxAge = Math.max(45000, interval * 2500);
    if (!quote || record.error || quote.code !== code || !(quote.price > 0) || !Number.isFinite(quote.changePct) || !regularSession(code, now) || now - record.received > maxAge || record.received > now + 5000) {
      this.invalidate(code);
      return false;
    }
    if (record.received <= entry.lastReceived) return entry.crying;
    if (record.received - entry.lastReceived > maxAge) { entry.lowAt = null; entry.highAt = null; }
    entry.lastReceived = record.received;
    if (now < entry.guardUntil) return false;
    if (quote.changePct > -2.5) {
      entry.lowAt = null;
      if (entry.highAt === null) entry.highAt = record.received;
      else if (record.received - entry.highAt >= CONFIRM_MS) {
        entry.crying = false; entry.armed = true; entry.pendingAudio = false;
      }
    } else {
      entry.highAt = null;
      if (quote.changePct <= -3) {
        if (entry.lowAt === null) entry.lowAt = record.received;
        else if (!entry.crying && record.received - entry.lowAt >= CONFIRM_MS) {
          entry.crying = true;
          entry.enteredAt = now;
          entry.pendingAudio = entry.armed;
          entry.armed = false;
        }
      } else entry.lowAt = null;
    }
    return entry.crying;
  }
  claimAudio(code, record, settings, visible) {
    const entry = this.entries.get(code), now = this.now();
    if (!entry?.pendingAudio || now - entry.enteredAt < 1000) return false;
    entry.pendingAudio = false;
    if (!entry.crying || !visible || !settings.autoActions || !settings.mamaSound || settings.muted || !settings.motion || quietNow(settings, now) || !regularSession(code, now) || record?.error || !record?.received || now - record.received > Math.max(45000, settings.interval * 2500) || now - entry.enteredAt > 5000 || now - this.lastAudioAt < AUDIO_COOLDOWN_MS) return false;
    this.lastAudioAt = now;
    return true;
  }
  snapshot() {
    return Object.fromEntries([...this.entries].map(([code, entry]) => [code, { crying: entry.crying }]));
  }
}
module.exports = { CryingReaction, regularSession, quietNow, STARTUP_GUARD_MS, AUDIO_COOLDOWN_MS };
