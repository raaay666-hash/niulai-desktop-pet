const MAX_CONCURRENT = 4;
const FAILURE_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 60000;
const MAX_TIMER_MS = 2 ** 31 - 1;

const defaultClock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer)
};

function cancelled() {
  return new DOMException('行情请求已取消', 'AbortError');
}

function backoff(interval, failures) {
  return Math.min(MAX_BACKOFF_MS, Math.max(interval, FAILURE_INTERVAL_MS) * 2 ** (failures - 1));
}

class QuotePoller {
  constructor({ fetchQuote, onResult, interval, shouldPoll = () => true, clock = {} }) {
    Object.assign(this, { fetchQuote, onResult, interval, shouldPoll });
    this.clock = { ...defaultClock, ...clock };
    this.records = new Map();
    this.active = new Map();
    this.providerFailures = 0;
    this.providerBlockedUntil = -Infinity;
    this.providerRevision = 0;
    this.timer = null;
  }

  get isRefreshing() {
    for (const [code, record] of this.records) {
      if (record.waiters.length || this.active.get(code)?.record === record) return true;
    }
    return false;
  }

  setCodes(codes) {
    const next = new Set(codes);
    for (const [code, record] of this.records) {
      if (!next.has(code)) this.remove(code, record);
    }
    const now = this.clock.now();
    for (const code of next) {
      if (!this.records.has(code)) {
        this.records.set(code, {
          lastStarted: null, firstDue: now, failures: 0, blockedUntil: -Infinity, skippedUntil: -Infinity, waiters: []
        });
      }
    }
    this.schedule();
  }

  refresh(code) {
    const record = this.records.get(code);
    if (!record) return Promise.reject(cancelled());
    const result = new Promise((resolve, reject) => {
      record.waiters.push({ at: this.clock.now(), resolve, reject });
    });
    this.schedule();
    return result;
  }

  stop() {
    this.clearTimer();
    for (const [code, record] of this.records) this.remove(code, record);
    this.providerFailures = 0;
    this.providerBlockedUntil = -Infinity;
    this.providerRevision++;
  }

  remove(code, record) {
    this.records.delete(code);
    const reason = cancelled();
    for (const waiter of record.waiters.splice(0)) waiter.reject(reason);
    const job = this.active.get(code);
    if (job?.record === record) job.controller.abort(reason);
  }

  clearTimer() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  armTimer(delay) {
    this.timer = this.clock.setTimeout(() => this.schedule(), Math.min(MAX_TIMER_MS, Math.ceil(delay)));
  }

  schedule() {
    this.clearTimer();
    if (!this.records.size || this.active.size >= MAX_CONCURRENT) return;
    const now = this.clock.now();
    if (now < this.providerBlockedUntil) {
      this.armTimer(this.providerBlockedUntil - now);
      return;
    }

    const interval = this.interval();
    const ready = [];
    let nextAt = Infinity;
    for (const [code, record] of this.records) {
      if (this.active.has(code)) continue;
      const manual = record.waiters[0];
      const nextPoll = record.lastStarted === null ? record.firstDue : record.lastStarted + interval;
      const due = manual ? manual.at : Math.max(nextPoll, record.blockedUntil, record.skippedUntil);
      if (due > now) {
        nextAt = Math.min(nextAt, due);
      } else if (manual || this.shouldPoll(code)) {
        ready.push({ code, record, due, manual: Boolean(manual) });
      } else {
        record.skippedUntil = now + interval;
        nextAt = Math.min(nextAt, record.skippedUntil);
      }
    }
    ready.sort((left, right) => Number(right.manual) - Number(left.manual) || left.due - right.due);
    for (const { code, record } of ready.slice(0, MAX_CONCURRENT - this.active.size)) {
      record.lastStarted = now;
      record.skippedUntil = -Infinity;
      const job = { code, record, controller: new AbortController(), providerRevision: this.providerRevision };
      this.active.set(code, job);
      // Register all jobs before a synchronous fetch exception can finish a job and schedule more.
      void Promise.resolve().then(() => this.run(job));
    }
    if (this.active.size < MAX_CONCURRENT && Number.isFinite(nextAt)) this.armTimer(nextAt - now);
  }

  async run(job) {
    const { code, record, controller, providerRevision } = job;
    let result, retryAfter;
    try {
      controller.signal.throwIfAborted();
      const reply = await this.fetchQuote(code, { signal: controller.signal });
      result = reply && Object.hasOwn(reply, 'quote') ? reply : { quote: reply, received: this.clock.wallNow() };
      if (!result.quote) throw new Error('行情源未返回报价');
    } catch (error) {
      result = { error: error?.message || '行情更新失败', limited: error?.status === 429 };
      retryAfter = error?.retryAfterMs;
    }

    // Retain the slot until the transport settles, even if a removed symbol is re-added meanwhile.
    this.active.delete(code);
    if (this.records.get(code) !== record || controller.signal.aborted) {
      this.schedule();
      return;
    }

    const now = this.clock.now();
    const interval = this.interval();
    if (result.limited) {
      if (now >= this.providerBlockedUntil) {
        this.providerFailures = Math.min(7, this.providerFailures + 1);
        this.providerRevision++;
      }
      const retry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0;
      this.providerBlockedUntil = Math.max(this.providerBlockedUntil, now + Math.max(retry, backoff(interval, this.providerFailures)));
    } else if (result.error) {
      record.failures = Math.min(7, record.failures + 1);
      record.blockedUntil = now + backoff(interval, record.failures);
    } else {
      record.failures = 0;
      record.blockedUntil = -Infinity;
      if (providerRevision === this.providerRevision) this.providerFailures = 0;
    }

    const waiters = record.waiters.splice(0);
    let callbackError;
    try { this.onResult?.(code, result); }
    catch (error) { callbackError = error; }
    for (const waiter of waiters) {
      if (this.records.get(code) !== record) waiter.reject(cancelled());
      else if (callbackError) waiter.reject(callbackError);
      else waiter.resolve(result);
    }
    this.schedule();
  }
}

module.exports = { QuotePoller };
