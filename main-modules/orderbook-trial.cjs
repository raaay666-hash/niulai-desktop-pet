const LIMITS = Object.freeze({
  quantity: [1, 1000000, 1],
  lotSize: [1, 1000000, 1],
  imbalance: [1, 100, 1],
  spreadBp: [1, 1000, 0.1],
  edgeBp: [0.1, 1000, 0.1],
  buyFeeBp: [0, 999, 0.1],
  sellFeeBp: [0, 999, 0.1],
  minFee: [0, 10000, 0.01],
  slipBp: [0, 999, 0.1],
  latencyMs: [1, 3000, 1],
  maxAgeMs: [50, 5000, 1],
  maxSkewMs: [1, 2000, 1],
  cooldownMs: [100, 60000, 1],
  cash: [0, 1e9, 0.01],
  inventoryA: [0, 1e9, 1],
  inventoryB: [0, 1e9, 1]
});
const MANIFEST_ID = 'niulai.orderbook-trial';
const BOOK_LEVELS = 20;
const HISTORY_LIMIT = 100;
const BP = 10000;
const sideDirection = side => side === 'buy' ? 1 : -1;

function readSettings(input, strategy = 'spread') {
  const values = {};
  for (const [key, [min, max, step]] of Object.entries(LIMITS)) {
    const value = input?.[key];
    if (!Number.isFinite(value) || value < min || value > max || step === 1 && !Number.isInteger(value)) {
      throw new Error('策略参数无效 · ' + key);
    }
    values[key] = value;
  }
  if (values.quantity % values.lotSize !== 0) throw new Error('每腿股数必须是每手股数的整数倍');
  if (strategy === 'spread' && values.maxSkewMs > values.maxAgeMs) throw new Error('两场所最大时差不能高于行情最大年龄');
  return values;
}

function readManifest(value) {
  if (value?.format !== 1 || value.id !== MANIFEST_ID || value.version !== '0.1.0') {
    throw new Error('当前牛来版本无法导入此插件包');
  }
  return { format: 1, id: MANIFEST_ID, version: value.version, settings: readSettings(value.settings) };
}

function depth(rows, order) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const valid = [];
  for (const row of rows.slice(0, BOOK_LEVELS)) {
    const { price, size } = row || {};
    if (!Number.isFinite(price) || price <= 0 || price > 1e9 ||
      !Number.isSafeInteger(size) || size <= 0 || size > 1e9 ||
      valid.length && (price - valid.at(-1).price) * order <= 0) return null;
    valid.push({ price, size });
  }
  return valid;
}

function normalizeBook(frame, now, maxAgeMs) {
  const { timestamp, sequence } = frame;
  if (frame.unit !== 'share' || frame.phase !== 'continuous' ||
    now - timestamp > maxAgeMs) return null;
  const bids = depth(frame.bids, -1);
  const asks = depth(frame.asks, 1);
  if (!bids || !asks || bids[0].price >= asks[0].price) return null;
  const mid = (bids[0].price + asks[0].price) / 2;
  const size = levels => levels.slice(0, 3).reduce((total, level) => total + level.size, 0);
  const bidSize = size(bids);
  const askSize = size(asks);
  return {
    venue: frame.venue, timestamp, sequence, receivedAt: now, bids, asks,
    imbalance: (bidSize - askSize) / (bidSize + askSize) * 100,
    spreadBp: (asks[0].price - bids[0].price) / mid * BP
  };
}

function quoteLeg(book, side, settings, consumed) {
  const levels = side === 'buy' ? book.asks : book.bids;
  let remaining = settings.quantity;
  let value = 0;
  const taken = [];
  for (const level of levels) {
    const quantity = Math.min(remaining, level.size - (consumed.get(level.price) || 0));
    if (quantity <= 0) continue;
    value += quantity * level.price;
    taken.push({ price: level.price, quantity });
    remaining -= quantity;
    if (remaining) continue;
    const adverse = 1 + sideDirection(side) * settings.slipBp / BP;
    const notional = value * adverse;
    const feeBp = side === 'buy' ? settings.buyFeeBp : settings.sellFeeBp;
    const fee = Math.max(settings.minFee, notional * feeBp / BP);
    return {
      venue: book.venue, side, quantity: settings.quantity, fee,
      price: notional / settings.quantity, limit: level.price * adverse,
      cashChange: -(notional * sideDirection(side)) - fee, sequence: book.sequence, taken
    };
  }
  return null;
}

class OrderbookTrial {
  constructor({ source, strategy, symbol, venues, currency, settings, startedAt }) {
    Object.assign(this, { source, strategy, symbol, venues, currency, settings, startedAt });
    this.accounts = venues.map((venue, index) => {
      const sellable = index === 0 ? settings.inventoryA : settings.inventoryB;
      return { venue, cash: settings.cash, quantity: sellable, sellable };
    });
    this.books = new Map();
    this.lastFrames = new Map();
    this.lastValidAt = new Map();
    this.consumed = new Map(venues.map(venue => [venue, { buy: new Map(), sell: new Map() }]));
    this.stats = { received: 0, rejected: 0, signals: 0, fills: 0, cancelled: 0, unpaired: 0, pairedNet: 0 };
    this.history = [];
    this.pending = null;
    this.lastSignalAt = -Infinity;
    this.lastSignal = null;
    this.note = '等待有效盘口';
    this.paused = false;
  }

  ingest(frame, now) {
    if (!frame || frame.symbol !== this.symbol || frame.currency !== this.currency || !this.venues.includes(frame.venue)) return;
    this.expire(now);
    const { sequence, timestamp } = frame;
    const previous = this.lastFrames.get(frame.venue);
    const validClock = Number.isSafeInteger(sequence) && sequence >= 0 &&
      Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now;
    if (validClock && previous && (sequence <= previous.sequence || timestamp < previous.timestamp)) {
      this.stats.rejected++;
      return;
    }
    const book = validClock ? normalizeBook(frame, now, this.settings.maxAgeMs) : null;
    if (validClock) this.lastFrames.set(frame.venue, { sequence, timestamp });
    if (!book) {
      this.books.delete(frame.venue);
      this.stats.rejected++;
      return;
    }
    this.stats.received++;
    this.lastValidAt.set(book.venue, now);
    this.books.set(book.venue, book);
    const consumed = this.consumed.get(book.venue);
    for (const [side, levels] of [['buy', book.asks], ['sell', book.bids]]) {
      const prices = new Set(levels.map(level => level.price));
      for (const price of consumed[side].keys()) {
        if (!prices.has(price)) consumed[side].delete(price);
      }
    }
    if (this.pending) {
      this.settleLeg(book, now);
      return;
    }
    if (this.paused || now - this.lastSignalAt < this.settings.cooldownMs) return;
    const current = this.venues.map(venue => this.books.get(venue));
    if (!current.every(entry => entry && entry.timestamp <= now && now - entry.timestamp <= this.settings.maxAgeMs)) return;
    if (this.strategy === 'sweep') this.signalSweep(book, now);
    else this.signalSpread(current, now);
  }

  canFill(leg) {
    const account = this.accounts.find(item => item.venue === leg.venue);
    return account.cash + leg.cashChange >= 0 && (leg.side === 'buy' || account.sellable >= leg.quantity);
  }

  estimate(book, side) {
    return quoteLeg(book, side, this.settings, this.consumed.get(book.venue)[side]);
  }

  signalSweep(book, now) {
    if (Math.abs(book.imbalance) < this.settings.imbalance || book.spreadBp > this.settings.spreadBp) {
      this.note = '等待盘口失衡与价差条件';
      return;
    }
    const leg = this.estimate(book, book.imbalance > 0 ? 'buy' : 'sell');
    if (!leg || !this.canFill(leg)) {
      this.note = '可见深度或模拟资金、可卖数量不足';
      return;
    }
    this.queue([leg], now, null);
  }

  signalSpread(books, now) {
    const [a, b] = books;
    if (Math.abs(a.timestamp - b.timestamp) > this.settings.maxSkewMs) {
      this.note = '两场所盘口时差过大';
      return;
    }
    const opportunities = [];
    for (const [buyBook, sellBook] of [[a, b], [b, a]]) {
      const buy = this.estimate(buyBook, 'buy');
      const sell = this.estimate(sellBook, 'sell');
      if (!buy || !sell) continue;
      const net = buy.cashChange + sell.cashChange;
      const edgeBp = net / -buy.cashChange * BP;
      if (edgeBp >= this.settings.edgeBp) opportunities.push({ legs: [buy, sell], edgeBp });
    }
    const eligible = opportunities.filter(item => item.legs.every(leg => this.canFill(leg)));
    const best = eligible.sort((left, right) => right.edgeBp - left.edgeBp)[0];
    if (best) this.queue(best.legs, now, best.edgeBp);
    else this.note = opportunities.length ? '模拟资金或可卖数量不足' : '等待覆盖成本的双边价差';
  }

  queue(legs, now, edgeBp) {
    const dueAt = now + this.settings.latencyMs;
    this.lastSignalAt = now;
    this.stats.signals++;
    this.lastSignal = { at: now, edgeBp, legs: legs.map(({ venue, side, limit }) => ({ venue, side, limit })) };
    this.pending = {
      id: this.stats.signals, at: now, dueAt, expiresAt: dueAt + this.settings.maxAgeMs, edgeBp,
      legs: legs.map(leg => ({ ...leg, status: 'pending' }))
    };
    this.note = '等待模拟延迟后的新盘口';
  }

  settleLeg(book, now) {
    const pending = this.pending;
    if (book.timestamp < pending.dueAt) return;
    const leg = pending.legs.find(item => item.status === 'pending' && item.venue === book.venue);
    if (!leg || book.sequence <= leg.sequence) return;
    const fill = this.estimate(book, leg.side);
    const insideLimit = fill && (fill.limit - leg.limit) * sideDirection(leg.side) <= 1e-9;
    if (!insideLimit || !this.canFill(fill)) {
      leg.status = 'cancelled';
      leg.reason = '限价、深度或模拟余额不足';
    } else {
      const account = this.accounts.find(item => item.venue === book.venue);
      account.quantity += sideDirection(leg.side) * leg.quantity;
      if (leg.side === 'sell') account.sellable -= leg.quantity;
      account.cash += fill.cashChange;
      const consumed = this.consumed.get(book.venue)[leg.side];
      for (const { price, quantity } of fill.taken) consumed.set(price, (consumed.get(price) || 0) + quantity);
      Object.assign(leg, {
        status: 'filled', price: fill.price, fee: fill.fee, cashChange: fill.cashChange,
        quoteAt: book.timestamp, filledAt: now
      });
      this.stats.fills++;
    }
    this.complete(now);
  }

  expire(now, reason) {
    const pending = this.pending;
    if (!pending || (!reason && now <= pending.expiresAt)) return;
    for (const leg of pending.legs.filter(item => item.status === 'pending')) {
      leg.status = 'cancelled';
      leg.reason = reason || '超时，未收到可成交的新盘口';
    }
    this.complete(now);
  }

  complete(now) {
    const pending = this.pending;
    if (pending.legs.some(leg => leg.status === 'pending')) return;
    const filled = pending.legs.filter(leg => leg.status === 'filled');
    const paired = filled.length === 2;
    const unpaired = pending.legs.length === 2 && filled.length === 1;
    const net = paired ? filled.reduce((sum, leg) => sum + leg.cashChange, 0) : null;
    if (paired) this.stats.pairedNet += net;
    this.stats.cancelled += pending.legs.length - filled.length;
    if (unpaired) {
      this.stats.unpaired++;
      this.paused = true;
    }
    const status = unpaired ? 'unpaired' : filled.length ? 'filled' : 'cancelled';
    this.note = { filled: '模拟成交', cancelled: '模拟委托取消', unpaired: '仅一腿模拟成交，本轮已暂停' }[status];
    const legs = pending.legs.map(({ venue, side, quantity, limit, status, price, fee, cashChange, quoteAt, filledAt, reason }) => ({
      venue, side, quantity, limit, status,
      ...(status === 'filled' ? { price, fee, cashChange, quoteAt, filledAt } : { reason })
    }));
    this.history.push({ id: pending.id, at: pending.at, endedAt: now, edgeBp: pending.edgeBp, status, net, legs });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.pending = null;
  }

  snapshot(now) {
    return {
      source: this.source, strategy: this.strategy, symbol: this.symbol, currency: this.currency, startedAt: this.startedAt,
      settings: { ...this.settings }, accounts: this.accounts.map(account => ({ ...account })), stats: { ...this.stats },
      books: this.venues.flatMap(venue => {
        const book = this.books.get(venue);
        if (!book) return [];
        return [{
          venue, bid: book.bids[0], ask: book.asks[0], imbalance: book.imbalance, spreadBp: book.spreadBp,
          delayMs: book.receivedAt - book.timestamp, ageMs: now - book.timestamp
        }];
      }),
      history: this.history.slice().reverse(), signal: this.lastSignal, pending: Boolean(this.pending),
      note: this.note, paused: this.paused
    };
  }
}

module.exports = { LIMITS, readManifest, readSettings, OrderbookTrial };
