const fs = require('node:fs/promises');
const { OrderbookTrial, LIMITS, readManifest, readSettings } = require('./orderbook-trial.cjs');
const { normalizeMarketSymbol, marketForSymbol } = require('./market-symbols');
const { marketClock } = require('./quote-time');

const MAX_FRAME = 64 * 1024;
const FEED_TIMEOUT = 10000;
const manifestFilter = [{ name: '牛来盘口插件', extensions: ['json'] }];
const currencies = { cn: 'CNY', hk: 'HKD', us: 'USD' };
const textField = (value, pattern, label) => {
  if (typeof value === 'string' && pattern.test(value.trim())) return value.trim();
  throw new Error('请填写有效的' + label);
};

function streamUrl(value) {
  let url;
  try { if (typeof value === 'string' && value.length <= 2048) url = new URL(value); } catch { }
  const loopback = url && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (!url || url.username || url.password || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && loopback)) {
    throw new Error('深度推送须使用 HTTPS 或本机 HTTP 地址');
  }
  return url;
}

function isContinuous(clock) {
  // A-share continuous trading ends before the three-minute closing call auction.
  return clock.phase === 'regular' && (clock.market !== 'cn' || clock.minuteOfDay < 897);
}

function demoFrame(sequence, venue, strategy, now) {
  const b = venue === 'DEMO-B';
  const falling = strategy === 'sweep' && sequence >= 10;
  const best = b ? 100.25 : falling ? 100.02 : 100;
  const bidSize = falling ? 150 : 1800;
  const askSize = falling ? 1800 : 150;
  return {
    symbol: 'DEMO', currency: 'CNY', unit: 'share', phase: 'continuous', sequence,
    timestamp: now - 12, venue,
    bids: [{ price: best, size: bidSize }, { price: best - 0.01, size: bidSize }],
    asks: [{ price: best + 0.03, size: askSize }, { price: best + 0.04, size: askSize }]
  };
}

class OrderbookPlugin {
  constructor({ file, dialog, checkSnapshot }) {
    Object.assign(this, { file, dialog, checkSnapshot });
    this.manifest = null;
    this.trial = null;
    this.running = false;
    this.status = '';
    this.busy = false;
  }

  get snapshotCode() {
    return this.running && this.trial.source === 'snapshot' ? this.trial.symbol : null;
  }

  async load() {
    try { this.manifest = await this.read(this.file); }
    catch (error) { if (error.code !== 'ENOENT') this.status = '插件安装记录无法读取，请重新导入插件'; }
  }

  async read(file) {
    const handle = await fs.open(file, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 16384) throw new Error('插件文件无效');
      const buffer = Buffer.alloc(16385);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead === buffer.length) throw new Error('插件文件过大');
      return readManifest(JSON.parse(buffer.toString('utf8', 0, bytesRead)));
    } finally { await handle.close(); }
  }

  async command(operation, input, owner) {
    if (operation === 'status') return this.describe();
    if (operation === 'stop') return this.stop('已手动停止');
    if (this.busy) throw new Error('请先完成当前文件操作');
    if (operation === 'start') return this.start(input);
    this.busy = true;
    try {
      if (operation === 'install') {
        if (this.manifest) return this.describe();
        const result = await this.dialog.showOpenDialog(owner, { title: '导入牛来盘口插件', properties: ['openFile'], filters: manifestFilter });
        if (result.canceled) return this.describe();
        const manifest = await this.read(result.filePaths[0]);
        const temporary = this.file + '.tmp';
        await fs.writeFile(temporary, JSON.stringify(manifest), 'utf8');
        await fs.rename(temporary, this.file);
        this.manifest = manifest;
        this.status = '已安装，可以开始模拟';
      } else if (operation === 'uninstall') {
        if (this.running) throw new Error('请先停止本轮模拟');
        await fs.rm(this.file, { force: true });
        this.manifest = null;
        this.trial = null;
        this.status = '已卸载';
      } else if (operation === 'export') {
        if (!this.trial) throw new Error('当前没有可导出的模拟记录');
        const report = this.describe();
        const result = await this.dialog.showSaveDialog(owner, {
          title: '导出本轮模拟记录', defaultPath: '牛来盘口模拟-' + this.trial.startedAt + '.json',
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (!result.canceled) await fs.writeFile(result.filePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
      } else throw new Error('未知插件操作');
      return this.describe();
    } finally { this.busy = false; }
  }

  describe() {
    return {
      version: this.manifest?.version || null, defaults: this.manifest?.settings || null,
      limits: LIMITS, running: this.running, status: this.status, sequence: this.runId || 0,
      trial: this.trial?.snapshot(Date.now()) || null
    };
  }

  start(input) {
    if (!this.manifest) throw new Error('请先导入盘口插件');
    if (this.running) throw new Error('本轮模拟正在运行');
    const { source, strategy } = input || {};
    if (!['demo', 'snapshot', 'stream'].includes(source) || !['sweep', 'spread'].includes(strategy)) throw new Error('数据来源或策略无效');
    const settings = readSettings(input.settings, strategy);
    let symbol, currency, venues, url;
    if (source === 'demo') {
      symbol = 'DEMO';
      currency = 'CNY';
      venues = strategy === 'spread' ? ['DEMO-A', 'DEMO-B'] : ['DEMO-A'];
    } else if (source === 'snapshot') {
      if (strategy !== 'sweep') throw new Error('双场所套利需要深度推送');
      symbol = normalizeMarketSymbol(input.symbol);
      this.checkSnapshot(symbol, settings);
      currency = currencies[marketForSymbol(symbol)];
      venues = ['NIULAI'];
    } else {
      const venue = value => textField(value, /^[A-Za-z0-9_-]{1,24}$/u, '成交场所标识');
      symbol = textField(input.symbol, /^[A-Za-z0-9_.:/-]{1,40}$/u, '标的标识');
      currency = textField(input.currency, /^[A-Z]{3}$/u, '币种（例如 CNY、HKD、USD）');
      venues = strategy === 'spread' ? [venue(input.venueA), venue(input.venueB)] : [venue(input.venueA)];
      if (venues.length === 2 && venues[0].toUpperCase() === venues[1].toUpperCase()) throw new Error('两腿需要不同的成交场所');
      url = streamUrl(input.url);
    }
    this.trial = new OrderbookTrial({ source, strategy, symbol, currency, venues, settings, startedAt: Date.now() });
    this.runId = (this.runId || 0) + 1;
    this.running = true;
    this.status = source === 'stream' ? '正在连接深度推送' : source === 'snapshot' ? '等待牛来自有源盘口' : '正在回放样例行情';
    const trial = this.trial;
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      trial.expire(now);
      if (trial.paused) return this.stop(trial.note);
      if (source !== 'stream') return;
      const silentVenue = venues.find(venue => now - (trial.lastValidAt.get(venue) ?? trial.startedAt) > FEED_TIMEOUT);
      if (silentVenue) this.stop('场所 ' + silentVenue + ' 深度推送超时，未收到有效盘口');
    }, 200);
    if (source === 'demo') {
      let sequence = 0;
      this.demo = setInterval(() => {
        const now = Date.now();
        for (const venue of venues) trial.ingest(demoFrame(sequence, venue, strategy, now), now);
        if (++sequence >= 27) this.stop('样例回放结束');
      }, 160);
    }
    if (source === 'stream') {
      this.controller = new AbortController();
      void this.follow(url, trial, this.controller.signal);
    }
    return this.describe();
  }

  ingestSnapshot(quote, now) {
    const symbol = this.snapshotCode;
    if (!symbol) return;
    const trial = this.trial;
    const book = quote?.details?.book;
    const clock = marketClock(symbol, now);
    const continuous = isContinuous(clock);
    if (this.sessionDay && clock.dateKey !== this.sessionDay) {
      this.stop('交易日已变化，请重新设置模拟库存');
      return;
    }
    this.sessionDay = clock.dateKey;
    const timestamp = book?.snapshotAt;
    const validClock = Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now;
    if (!continuous || quote?.code !== symbol || quote.session === 'pre' || quote.session === 'post' ||
      quote.source !== 'custom' || book?.unit !== '股' || !validClock || !isContinuous(marketClock(symbol, timestamp))) {
      trial.books.delete('NIULAI');
      this.status = !continuous ? '等待连续竞价时段' : '等待连续竞价时段内带时间戳、单位为股的自有盘口';
      return;
    }
    trial.ingest({
      ...book, symbol, venue: 'NIULAI', currency: trial.currency, unit: 'share', phase: 'continuous',
      sequence: timestamp, timestamp
    }, now);
    this.status = '正在读取自有源盘口';
  }

  async follow(url, trial, signal) {
    try {
      const response = await fetch(url, { signal, redirect: 'error', headers: { Accept: 'application/x-ndjson' } });
      if (signal.aborted) return;
      if (!response.ok || !response.body) throw new Error('response');
      this.status = '已连接深度推送';
      let partial = '';
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        if (signal.aborted) return;
        const lines = (partial + decoder.decode(chunk, { stream: true })).split('\n');
        partial = lines.pop();
        if (partial.length > MAX_FRAME) throw new Error('frame');
        for (const line of lines) {
          if (line.length > MAX_FRAME) throw new Error('frame');
          if (!line.trim()) continue;
          let frame;
          try { frame = JSON.parse(line); } catch { trial.stats.rejected++; continue; }
          trial.ingest(frame, Date.now());
          if (trial.paused) { this.stop(trial.note); return; }
        }
      }
      if (!signal.aborted) this.stop('深度推送已结束');
    } catch {
      if (!signal.aborted) this.stop('深度推送连接失败或数据格式超限');
    }
  }

  stop(reason) {
    if (this.running) {
      this.running = false;
      this.controller?.abort();
      this.controller = null;
      clearInterval(this.demo);
      clearInterval(this.heartbeat);
      this.sessionDay = null;
      this.trial.expire(Date.now(), reason);
      this.status = this.trial.paused ? this.trial.note : reason;
    }
    return this.describe();
  }
}

module.exports = { OrderbookPlugin };
