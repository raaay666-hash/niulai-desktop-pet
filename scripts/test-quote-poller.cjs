const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: flush } = require('node:timers/promises');
const { QuotePoller } = require('../main-modules/quote-poller.cjs');

const quote = code => ({ code, price: 1 });

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function setup(fetchQuote, options = {}) {
  let now = 0;
  const timers = new Map(), issued = [], results = [];
  const poller = new QuotePoller({
    fetchQuote(code, { signal }) {
      issued.push({ at: now, code, signal });
      return fetchQuote(code, { signal });
    },
    interval: () => 200,
    onResult(code, result) { results.push({ code, result }); },
    clock: {
      now: () => now,
      wallNow: () => 1700000000000 + now,
      setTimeout(callback, delay) {
        const id = Symbol();
        timers.set(id, { at: now + delay, callback });
        return id;
      },
      clearTimeout: id => timers.delete(id)
    },
    ...options
  });
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      await flush();
      const next = [...timers].sort((left, right) => left[1].at - right[1].at)[0];
      if (!next || next[1].at > end) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.at;
      timer.callback();
    }
    now = end;
    await flush();
  }
  return { poller, issued, results, advance };
}

for (const interval of [200, 500]) {
  test(`available symbol keeps its ${interval} ms interval with a slow peer`, async () => {
    const slow = deferred();
    const sample = { quote: quote('fast'), received: 1700000000123, snapshotRun: 19 };
    const { poller, issued, results, advance } = setup(code => code === 'slow' ? slow.promise : sample, { interval: () => interval });
    poller.setCodes(['slow', 'fast']);
    await advance(interval * 4);
    assert.deepEqual(issued.filter(job => job.code === 'fast').map(job => job.at), [0, interval, interval * 2, interval * 3, interval * 4]);
    assert.equal(issued.filter(job => job.code === 'slow').length, 1);
    assert.ok(results.every(row => row.result === sample));
    poller.stop();
    slow.resolve(quote('slow'));
  });
}

test('uses four slots, favors the longest waiting symbol and joins the current request', async () => {
  const pending = new Map();
  const { poller, issued, results, advance } = setup(code => {
    const job = deferred();
    pending.set(code, job);
    return job.promise;
  });
  poller.setCodes(['a', 'b', 'c', 'd', 'e', 'f']);
  await advance(250);
  assert.deepEqual(issued.map(job => job.code), ['a', 'b', 'c', 'd']);
  const manual = poller.refresh('a');
  assert.equal(poller.isRefreshing, true);
  pending.get('a').resolve(quote('a'));
  assert.deepEqual(await manual, { quote: quote('a'), received: 1700000000250 });
  await flush();
  assert.deepEqual(issued.map(job => job.code), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(results.length, 1);
  pending.get('e').resolve(quote('e'));
  await flush();
  assert.equal(issued.at(-1).code, 'f');
  poller.stop();
});

test('backs off an individual failing symbol without affecting good quotes', async () => {
  const { poller, issued, advance } = setup(code => {
    if (code === 'failing') throw new Error('unavailable');
    return quote(code);
  });
  poller.setCodes(['failing', 'good']);
  await advance(1999);
  assert.equal(issued.filter(job => job.code === 'failing').length, 1);
  assert.equal(issued.filter(job => job.code === 'good').length, 10);
  await advance(4001);
  assert.deepEqual(issued.filter(job => job.code === 'failing').map(job => job.at), [0, 2000, 6000]);
  poller.stop();
});

test('uses explicit 429 Retry-After across all symbols, even with successful peers', async () => {
  let limited = false;
  const peer = deferred();
  const { poller, issued, advance } = setup(code => {
    if (code === 'limited' && !limited) {
      limited = true;
      throw Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 70000 });
    }
    if (code === 'peer' && issued.filter(job => job.code === code).length === 1) return peer.promise;
    return quote(code);
  });
  poller.setCodes(['limited', 'peer']);
  await advance(500);
  peer.resolve(quote('peer'));
  await flush();
  const manual = poller.refresh('peer');
  await advance(69499);
  assert.equal(issued.length, 2);
  await advance(1);
  await manual;
  assert.deepEqual(issued.slice(-2).map(job => [job.code, job.at]), [['peer', 70000], ['limited', 70000]]);
  poller.stop();
});

test('stop aborts requests, rejects manual waiters and suppresses a late response after reconfiguration', async () => {
  const old = deferred();
  const { poller, issued, results, advance } = setup(code => issued.length === 1 ? old.promise : quote(code));
  poller.setCodes(['same']);
  await advance(0);
  const manual = poller.refresh('same');
  poller.stop();
  await assert.rejects(manual, { name: 'AbortError' });
  assert.equal(issued[0].signal.aborted, true);
  assert.equal(poller.isRefreshing, false);

  poller.setCodes(['same']);
  await advance(1000);
  assert.equal(issued.length, 1);
  old.reject(Object.assign(new Error('old 429'), { status: 429, retryAfterMs: 60000 }));
  await advance(0);
  assert.deepEqual(issued.map(job => job.at), [0, 1000]);
  assert.equal(results.length, 1);
  assert.equal(results[0].result.quote.code, 'same');
  poller.stop();
});

test('manual refresh bypasses healthy push suppression and removal rejects queued waiters', async () => {
  const pending = deferred();
  const { poller, issued, advance } = setup(() => pending.promise, { shouldPoll: () => false });
  poller.setCodes(['code']);
  await advance(600);
  assert.equal(issued.length, 0);
  const manual = poller.refresh('code');
  await advance(0);
  assert.equal(issued.length, 1);
  poller.setCodes([]);
  await assert.rejects(manual, { name: 'AbortError' });
  assert.equal(issued[0].signal.aborted, true);
  pending.resolve(quote('code'));
  await flush();
  await assert.rejects(poller.refresh('code'), { name: 'AbortError' });
});
