const { app, BrowserWindow, ipcMain, screen, powerMonitor, shell, Tray, Menu, nativeTheme, systemPreferences, Notification, safeStorage, dialog } = require('electron');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { normalizeMarketSymbol, marketForSymbol, quoteProviderSymbol, parseTencentSuggestions, externalQuoteUrl } = require('./main-modules/market-symbols');
const { parseSinaQuote, parseTencentQuote } = require('./main-modules/quote-parsers');
const { marketClock, quoteHealth, newestQuote } = require('./main-modules/quote-time');
const { normalizeState, normalizeSettings, normalizeCounts, tapCounts, MAX_NEWS_FOLLOWS } = require('./main-modules/desktop-state.cjs');
const { CryingReaction } = require('./main-modules/crying-reaction.cjs');
const { defaultSourceConfig, normalizeSourceConfig, fetchCustomQuote, fetchCustomSeries } = require('./main-modules/custom-quotes.cjs');
const { followQuoteStream } = require('./main-modules/quote-stream.cjs');
const { QuotePoller } = require('./main-modules/quote-poller.cjs');
const { createUpdateChecker } = require('./main-modules/update-checker.cjs');
const { OFFICIAL } = require('./main-modules/update-policy.cjs');
const { submitFeedback } = require('./main-modules/feedback.cjs');
const { parseMarketDetails, parseTencentMinutes, parseYahooMinutes } = require('./main-modules/market-insights.cjs');
const { parseNews, newsRequest, stockNewsTerms, newsMatchesStock, globalNewsRequests, mergeNews, translateTitle, newsNotificationBatch } = require('./main-modules/market-news.cjs');
const { OrderbookPlugin } = require('./main-modules/orderbook-plugin.cjs');
let updater, updateTimer, orderbook;
let systemAccent = null;

const argument = prefix => (process.argv.find(value => value.startsWith(prefix)) || '').slice(prefix.length);
const qaProfile = argument('--qa-user-data-dir=');
if (qaProfile) app.setPath('userData', path.resolve(qaProfile));
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.niulai.desktop-pet' : process.execPath);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let dashboard, tray, state, counts, persisted = null, suspended = false, quitting = false;
let reactionTimer, quoteEpoch = 0, manualRefresh;
const publicPoll = { timer: null, running: false, rerun: false, failures: 0 };
const customRecords = new Map();
const customPoller = new QuotePoller({
  interval: customQuoteInterval,
  shouldPoll: code => !hasRecentStreamQuote(code),
  async fetchQuote(code, { signal }) {
    const snapshotRun = orderbook.snapshotCode === code ? orderbook.runId : null;
    const quote = await fetchCustomQuote(code, activeQuoteConfig(), { signal });
    return { quote, received: Date.now(), snapshotRun };
  },
  onResult(code, result) { applyCustomQuote(code, result, result.snapshotRun); }
});
let quoteStream, quoteBroadcastTimer, lastQuoteBroadcastAt = -Infinity, quoteNamesChanged = false;
let writeQueue = Promise.resolve();
let customQuoteConfig = null, sealedQuoteSource = null, quoteSourceError = '', seriesRevision = 0;
const overlays = new Map();
const quotes = new Map();
const histories = new Map();
const newsFeeds = new Map();
const newsAliases = new Map();
const newsTranslations = new Map();
const newsCursors = new Map();
let newsTimer, checkingNews = false, newsGeneration = 0;
const newsInterval = 5 * 60000;
const newsId = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const positions = {};
const overlayNames = { pet: '桌宠', widget: '桌面卡片' };
const collapsed = new Set();
const crying = new CryingReaction();
let logFile;
const stateFile = () => path.join(app.getPath('userData'), 'desktop-state-v2.json');

function log(level, message) {
  try {
    if (logFile) fs.appendFileSync(logFile, `[${new Date().toISOString()}] [${level}] ${message}\n`);
  } catch { }
}
process.on('uncaughtException', error => log('ERROR', error.stack));
process.on('unhandledRejection', error => log('ERROR', error?.stack || error));

function snapshot() {
  counts = normalizeCounts(counts);
  const quoteSource = {
    configured: Boolean(customQuoteConfig), name: customQuoteConfig?.name || '', markets: customQuoteConfig?.markets || null,
    seriesConfigured: Boolean(customQuoteConfig?.seriesUrl), seriesRevision,
    storage: sealedQuoteSource ? 'encrypted' : 'session', error: quoteSourceError,
    streamConfigured: Boolean(customQuoteConfig?.streamUrl), streamStatus: quoteStream?.status || ''
  };
  const refreshing = publicPoll.running || publicPoll.rerun || customPoller.isRefreshing;
  return { state, counts, quotes: Object.fromEntries(quotes), histories: Object.fromEntries(histories), reactions: crying.snapshot(), quoteSource, suspended, refreshing, dark: nativeTheme.shouldUseDarkColors, accent: systemAccent, version: app.getVersion() };
}
function windows() {
  return [dashboard, ...overlays.values()].filter(window => window && !window.isDestroyed());
}
function broadcast(channel = 'desktop:snapshot', value = snapshot()) {
  for (const window of windows()) window.webContents.send(channel, value);
}
function updateSystemAccent(value) {
  const color = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value || '');
  const next = color ? '#' + color[1].toLowerCase() : null;
  if (systemAccent === next) return false;
  systemAccent = next;
  return true;
}
function readSystemAccent() {
  try { return ['win32', 'darwin'].includes(process.platform) ? systemPreferences.getAccentColor() : null; }
  catch { return null; }
}
function persist() {
  const payload = JSON.stringify({ state, counts, positions, quoteSource: sealedQuoteSource, newsCursors: Object.fromEntries(newsCursors), reactionAudioAt: Number.isFinite(crying.lastAudioAt) ? crying.lastAudioAt : 0 });
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const temporary = stateFile() + '.tmp';
    await fsp.writeFile(temporary, payload, 'utf8');
    for (let retries = 0; ; retries++) {
      try {
        await fsp.rename(temporary, stateFile());
        break;
      } catch (error) {
        if (process.platform !== 'win32' || retries === 3 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 25 * (retries + 1)));
      }
    }
  });
  return writeQueue;
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!windows().some(window => window.webContents === event.sender)) throw new Error('无效窗口');
    return callback(event, ...args);
  });
}
function constrain(bounds) {
  const primary = screen.getPrimaryDisplay().workArea;
  bounds = {
    x: Number.isFinite(bounds.x) ? bounds.x : primary.x,
    y: Number.isFinite(bounds.y) ? bounds.y : primary.y,
    width: Number.isFinite(bounds.width) ? bounds.width : 300,
    height: Number.isFinite(bounds.height) ? bounds.height : 300
  };
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width, height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)))
  };
}
function overlaySize(kind) {
  if (kind === 'widget') return { width: 346, height: 358 };
  if (collapsed.has(kind)) return { width: 104, height: 86 };
  return { width: Math.round(282 * state.settings.petScale / 100), height: Math.round(302 * state.settings.petScale / 100) };
}
function overlayBounds(kind) {
  const area = screen.getPrimaryDisplay().workArea;
  const size = overlaySize(kind);
  return constrain({
    ...size,
    x: positions[kind]?.x ?? (area.x + area.width - size.width - (kind === 'widget' ? 346 : 32)),
    y: positions[kind]?.y ?? (area.y + area.height - size.height - 32)
  });
}
function configureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('console-message', (_event, level, message) => log('RENDERER', typeof level === 'object' ? level.message : message));
  let recoveries = 0;
  window.webContents.on('render-process-gone', (_event, details) => {
    log('ERROR', `渲染进程退出 ${details.reason}`);
    if (!quitting && details.reason !== 'clean-exit' && recoveries++ < 2) {
      setTimeout(() => { if (!window.isDestroyed()) window.reload(); }, 400);
    }
  });
  window.on('move', () => {
    const kind = window === dashboard ? 'dashboard' : window.overlayKind;
    const { x, y } = window.getBounds();
    positions[kind] = { x, y };
  });
  window.on('moved', () => persist().catch(error => log('ERROR', error.message)));
}
function createOverlay(kind) {
  if (quitting || overlays.has(kind)) return;
  const window = new BrowserWindow({
    ...overlayBounds(kind), frame: false, transparent: true, resizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    hasShadow: false, show: false, backgroundColor: '#00000000', title: '牛来' + overlayNames[kind],
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true }
  });
  window.overlayKind = kind;
  window.overlayReady = false;
  const keepOnTop = () => {
    if (quitting || window.isDestroyed()) return;
    window.setAlwaysOnTop(true, process.platform === 'win32' ? 'screen-saver' : 'floating');
    if (process.platform === 'win32' && window.isVisible()) window.moveTop();
  };
  keepOnTop();
  window.on('show', keepOnTop);
  window.on('blur', keepOnTop);
  overlays.set(kind, window);
  configureWindow(window);
  window.loadFile(path.join(__dirname, 'overlay.html'), { query: { kind } });
  window.once('ready-to-show', () => {
    window.overlayReady = true;
    syncOverlays();
  });
  window.on('closed', () => { stopDrag(window); overlays.delete(kind); });
  if (process.platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}
function syncOverlays() {
  if (!state || quitting) return;
  for (const kind of Object.keys(overlayNames)) {
    const enabled = state.settings[kind + 'Enabled'];
    if (enabled) createOverlay(kind);
    const window = overlays.get(kind);
    if (!window) continue;
    if (!enabled) { window.close(); continue; }
    const hideInApp = state.settings[kind + 'HideInApp'] && dashboard?.isVisible() && dashboard?.isFocused();
    if (suspended || hideInApp) window.hide();
    else if (window.overlayReady) window.showInactive();
    window.setBounds(constrain({ ...window.getBounds(), ...overlaySize(kind) }));
  }
}
function showDashboard() {
  if (!dashboard || dashboard.isDestroyed()) return;
  if (dashboard.isMinimized()) dashboard.restore();
  dashboard.show();
  dashboard.focus();
}
function createDashboard() {
  const area = screen.getPrimaryDisplay().workArea;
  const size = { width: Math.min(1180, area.width), height: Math.min(820, area.height) };
  const bounds = constrain({ ...size, x: positions.dashboard?.x ?? area.x + (area.width - size.width) / 2, y: positions.dashboard?.y ?? area.y + (area.height - size.height) / 2 });
  dashboard = new BrowserWindow({
    ...bounds, minWidth: Math.min(860, area.width), minHeight: Math.min(640, area.height),
    title: '牛来盯盘', icon: path.join(__dirname, 'build/icon.png'), backgroundColor: '#f4f5f7', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  configureWindow(dashboard);
  dashboard.loadFile(path.join(__dirname, 'index.html'));
  dashboard.once('ready-to-show', showDashboard);
  dashboard.on('focus', syncOverlays);
  dashboard.on('blur', () => setTimeout(syncOverlays, 0));
  dashboard.on('close', event => {
    if (!quitting) { event.preventDefault(); dashboard.hide(); syncOverlays(); }
  });
}

async function requestText(url, referer, encoding = 'gbk') {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}
function quoteCodes() {
  return state.stocks.map(stock => stock.code);
}
function activeQuoteConfig() {
  return state.settings.quoteSourceMode === 'custom' ? customQuoteConfig : null;
}
function usesCustomQuote(code) {
  return state.settings.quoteSourceMode === 'custom' &&
    (!customQuoteConfig || customQuoteConfig.markets.includes(marketForSymbol(code)));
}
function requestedQuoteInterval() {
  return state.settings.interval * 1000;
}
function customQuoteInterval() {
  return Math.max(requestedQuoteInterval(), (activeQuoteConfig()?.interval || 0) * 1000);
}
function publicQuoteInterval(codes) {
  const now = Date.now();
  const open = codes.some(code => ['pre', 'regular', 'post'].includes(marketClock(code, now).phase));
  return Math.max(requestedQuoteInterval(), open ? 1000 : 10000);
}
function armPublicPoll(delay) {
  clearTimeout(publicPoll.timer);
  if (!state || suspended || quitting) return;
  if (publicPoll.running) { publicPoll.rerun = true; return; }
  publicPoll.timer = setTimeout(() => void pollPublicQuotes(), Math.max(0, Math.ceil(delay)));
}
function syncCustomPoller() {
  const codes = quoteCodes().filter(usesCustomQuote);
  const config = activeQuoteConfig();
  customPoller.setCodes(config ? codes : []);
  if (!config) {
    for (const code of codes) applyCustomQuote(code, { error: '自有行情源需重新配置' });
  }
}
function schedulePoll(delay = 0) {
  if (!state || suspended || quitting) return;
  syncQuoteStream();
  syncCustomPoller();
  armPublicPoll(delay);
  routeManualRefresh();
}
function stopQuotePolling() {
  clearTimeout(publicPoll.timer);
  publicPoll.rerun = false;
  customPoller.stop();
  stopQuoteStream();
  clearTimeout(quoteBroadcastTimer);
  quoteBroadcastTimer = null;
}
function queueQuoteUpdate() {
  if (quoteBroadcastTimer) return;
  const remaining = 35 - (performance.now() - lastQuoteBroadcastAt);
  quoteBroadcastTimer = setTimeout(flushQuoteUpdates, Math.max(0, Math.ceil(remaining)));
}
function flushQuoteUpdates() {
  clearTimeout(quoteBroadcastTimer);
  quoteBroadcastTimer = null;
  lastQuoteBroadcastAt = performance.now();
  broadcast();
  if (quoteNamesChanged) {
    quoteNamesChanged = false;
    persist().catch(error => log('ERROR', error.message));
  }
}
function storeQuote(code, entry) {
  const previous = quotes.get(code);
  if (entry.error) {
    if (previous?.error !== entry.error) {
      quotes.set(code, { ...previous, error: entry.error });
      crying.update(code, quotes.get(code), state.settings.interval);
      queueQuoteUpdate();
    }
    return;
  }
  const { quote, received } = entry;
  quotes.set(code, entry);
  const before = previous?.quote;
  const us = code.startsWith('gb_');
  const sessionChanged = us && before && (before.session !== quote.session ||
    before.quotedAt && quote.quotedAt && marketClock(code, before.quotedAt).dateKey !== marketClock(code, quote.quotedAt).dateKey);
  const samples = sessionChanged ? [] : histories.get(code) || [];
  const receivedTime = !Number.isFinite(quote.quotedAt);
  const at = receivedTime ? received : quote.quotedAt;
  const last = samples.at(-1);
  if ((!us || !receivedTime) &&
      (!last || at > last.at || at === last.at && quote.price !== last.price)) {
    samples.push({
      price: quote.price, at, session: quote.session, receivedTime,
      timePrecision: receivedTime ? 'millisecond' : quote.timePrecision || 'second'
    });
    histories.set(code, samples.slice(-60));
  } else if (sessionChanged) histories.set(code, []);
  const stock = state.stocks.find(item => item.code === code);
  if (stock && stock.name !== quote.name) {
    stock.name = quote.name;
    quoteNamesChanged = true;
  }
  crying.update(code, entry, state.settings.interval);
  queueQuoteUpdate();
}
function hasRecentStreamQuote(code, now = Date.now()) {
  const record = customRecords.get(code);
  return quoteStream?.status === 'live' && record?.transport === 'ndjson' &&
    now - record.received < 3000 && !quoteHealth(record, state.settings.interval, now).warning;
}
function applyCustomQuote(code, result, snapshotRun, transport = 'http') {
  const previous = customRecords.get(code);
  if (!result.quote) {
    if (hasRecentStreamQuote(code)) return;
    const record = { ...previous, error: result.error };
    customRecords.set(code, record);
    if (!quotes.get(code)?.quote?.fallbackFrom) storeQuote(code, record);
    return;
  }
  const { quote, received } = result;
  if (orderbook.snapshotCode === code && orderbook.runId === snapshotRun) {
    orderbook.ingestSnapshot(quote, received);
  }
  const previousAt = previous?.quote?.quotedAt;
  if (Number.isFinite(quote.quotedAt) && previousAt > quote.quotedAt ||
      previous?.transport === 'ndjson' && !previous.error && hasRecentStreamQuote(code, received) &&
      transport !== 'ndjson' && (quote.quotedAt === null || previousAt === quote.quotedAt)) return;
  const record = { quote, received, transport };
  customRecords.set(code, record);
  if (!state.settings.quoteSourceFallback || !quotes.get(code)?.quote?.fallbackFrom ||
      !quoteHealth(record, state.settings.interval, received).warning) storeQuote(code, record);
}
function shouldUsePublicQuote(code, interval, now = Date.now()) {
  return !usesCustomQuote(code) || state.settings.quoteSourceFallback &&
    quoteHealth(customRecords.get(code), interval, now).warning;
}
function applyPublicQuote(code, quote, received) {
  if (!shouldUsePublicQuote(code, state.settings.interval)) return;
  const previous = quotes.get(code);
  if (!quote) {
    if (!usesCustomQuote(code)) storeQuote(code, { error: '更新失败，保留上次报价' });
    return;
  }
  if (code.startsWith('gb_') && newestQuote([quote, previous?.quote], received) !== quote) return;
  if (usesCustomQuote(code)) quote = { ...quote, fallbackFrom: activeQuoteConfig()?.name || '自有行情源' };
  storeQuote(code, { quote, received });
}
async function resolvePublicQuotes(codes, onQuote = () => {}) {
  const resolved = new Map();
  let limited = false, primary = '';
  try { primary = await requestText('https://hq.sinajs.cn/list=' + codes.join(','), 'https://finance.sina.com.cn/'); }
  catch (error) { limited ||= error.status === 429; log('WARN', '新浪 ' + error.message); }
  const received = Date.now();
  const missing = [];
  for (const code of codes) {
    const quote = parseSinaQuote(primary, code, received);
    if (quote?.price > 0) resolved.set(code, { quote, received });
    if (!resolved.has(code) || code.startsWith('gb_') &&
        quoteHealth(resolved.get(code), state.settings.interval, received).warning) missing.push(code);
    else onQuote(code, resolved.get(code));
  }
  if (missing.length) {
    try {
      const body = await requestText('https://qt.gtimg.cn/q=' + missing.map(code => quoteProviderSymbol(code, 'tencent')).join(','), 'https://gu.qq.com/');
      const fallbackAt = Date.now();
      for (const code of missing) {
        const quote = parseTencentQuote(body, code, fallbackAt);
        if (quote?.price > 0 && newestQuote([resolved.get(code)?.quote, quote], fallbackAt) === quote) {
          resolved.set(code, { quote, received: fallbackAt });
        }
      }
    } catch (error) { limited ||= error.status === 429; log('WARN', '腾讯 ' + error.message); }
  }
  for (const code of missing) onQuote(code, resolved.get(code) || { received: Date.now() });
  return { resolved, limited };
}
async function resolveStockQuote(code) {
  let quote;
  let error;
  const config = activeQuoteConfig();
  const useCustom = usesCustomQuote(code);
  if (useCustom) {
    if (!config) error = '自有行情源需重新配置';
    else {
      try { quote = await fetchCustomQuote(code, config); }
      catch (failure) { error = failure.message; }
    }
    if (!state.settings.quoteSourceFallback || !quoteHealth({ quote, received: Date.now() }, state.settings.interval).warning) {
      return { quote, error };
    }
  }
  const { resolved } = await resolvePublicQuotes([code]);
  const fallback = resolved.get(code)?.quote;
  if (fallback && newestQuote([quote, fallback]) === fallback) {
    quote = useCustom ? { ...fallback, fallbackFrom: config?.name || '自有行情源' } : fallback;
  }
  return { quote, error };
}

function stopQuoteStream() {
  const stream = quoteStream;
  quoteStream = null;
  clearTimeout(stream?.retryTimer);
  stream?.controller.abort();
}
function syncQuoteStream() {
  const config = activeQuoteConfig();
  const codes = config?.streamUrl ? quoteCodes().filter(usesCustomQuote).sort() : [];
  const key = codes.join(',');
  if (codes.length && quoteStream?.config === config && quoteStream.key === key) return;
  const wasConnected = Boolean(quoteStream);
  stopQuoteStream();
  if (!codes.length) {
    if (wasConnected) queueQuoteUpdate();
    return;
  }
  quoteStream = { config, codes, key, controller: new AbortController(), failures: 0, status: 'connecting' };
  queueQuoteUpdate();
  void connectQuoteStream(quoteStream);
}
async function connectQuoteStream(stream) {
  let limited = false, requestedDelay = 0;
  try {
    await followQuoteStream(stream.codes, stream.config, {
      signal: stream.controller.signal,
      onQuote(quote, received) {
        if (quoteStream !== stream || suspended || quitting) return;
        if (stream.status !== 'live') queueQuoteUpdate();
        stream.failures = 0;
        stream.status = 'live';
        applyCustomQuote(quote.code, { quote, received }, orderbook.runId, 'ndjson');
      }
    });
  } catch (error) {
    limited = error.status === 429;
    requestedDelay = error.retryAfterMs || 0;
  }
  if (quoteStream !== stream || suspended || quitting) return;
  stream.status = 'reconnecting';
  stream.failures = Math.min(6, stream.failures + 1);
  const backoff = Math.min(60000, (limited ? 2000 : 1000) * 2 ** (stream.failures - 1));
  const delay = Math.min(2 ** 31 - 1, Math.max(backoff, requestedDelay));
  stream.retryTimer = setTimeout(() => void connectQuoteStream(stream), delay);
  queueQuoteUpdate();
}
async function testQuoteStream(config, code) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let sample;
  try {
    await followQuoteStream([code], config, {
      signal: controller.signal,
      onQuote(quote, received) {
        sample = { quote, received, quotedAt: quote.quotedAt,
          latencyMs: received >= quote.quotedAt ? received - quote.quotedAt : null, symbol: quote.code };
        controller.abort();
      }
    });
  } catch (error) { return { error: error.message }; }
  finally { clearTimeout(timer); }
  return sample || { error: '5 秒内未收到该标的的有效推送报价' };
}

function finishManualRefresh(error) {
  const request = manualRefresh;
  if (!request) return;
  manualRefresh = null;
  if (error) request.reject(error);
  else {
    flushQuoteUpdates();
    request.resolve(quotes.get(request.code) || null);
  }
}
function routeManualRefresh() {
  const request = manualRefresh;
  if (!request) return;
  const code = quoteCodes().includes(request.code) ? request.code : state.selected;
  if (request.code !== code) {
    request.code = code;
    request.fallbackConfig = null;
  }
  const config = usesCustomQuote(code) ? activeQuoteConfig() : null;
  if (!config) {
    request.job = null;
    if (usesCustomQuote(code) && !state.settings.quoteSourceFallback) finishManualRefresh();
    else {
      request.lane = 'public';
      if (!publicPoll.running) armPublicPoll(0);
    }
    return;
  }
  if (request.job?.config === config && request.job.code === code) return;
  if (request.lane === 'public' && request.fallbackConfig === config) return;

  const job = { config, code };
  request.job = job;
  request.lane = 'custom';
  void customPoller.refresh(code).then(() => {
    if (manualRefresh !== request || request.job !== job) return;
    request.job = null;
    if (state.settings.quoteSourceFallback && shouldUsePublicQuote(code, state.settings.interval)) {
      request.lane = 'public';
      request.fallbackConfig = config;
      armPublicPoll(0);
    } else finishManualRefresh();
  }, error => {
    if (manualRefresh !== request || request.job !== job) return;
    // Configuration and subscription changes route the pending refresh to the replacement request.
    request.job = null;
    if (error.name !== 'AbortError') finishManualRefresh(new Error('行情更新失败，请重试'));
  });
}
async function pollPublicQuotes() {
  if (suspended || quitting) return;
  publicPoll.running = true;
  publicPoll.rerun = false;
  const epoch = quoteEpoch, started = performance.now();
  const isCurrent = () => epoch === quoteEpoch && !suspended && !quitting;
  const scope = quoteCodes().filter(code => !usesCustomQuote(code) || state.settings.quoteSourceFallback);
  const codes = scope.filter(code => shouldUsePublicQuote(code, state.settings.interval));
  try {
    if (codes.length) {
      const { resolved, limited } = await resolvePublicQuotes(codes, (code, { quote, received }) => {
        if (isCurrent()) applyPublicQuote(code, quote, received);
      });
      if (isCurrent()) publicPoll.failures = limited || !resolved.size ? Math.min(7, publicPoll.failures + 1) : 0;
    }
  } catch (error) {
    if (isCurrent()) {
      publicPoll.failures = Math.min(7, publicPoll.failures + 1);
      if (manualRefresh?.lane === 'public') finishManualRefresh(new Error('行情更新失败，请重试'));
    }
    log('WARN', '行情更新 ' + error.message);
  } finally {
    publicPoll.running = false;
    if (suspended || quitting) return;
    const rerun = publicPoll.rerun || epoch !== quoteEpoch;
    publicPoll.rerun = rerun;
    if (rerun) armPublicPoll(0);
    else if (scope.length) {
      const interval = publicQuoteInterval(scope);
      const delay = publicPoll.failures ? Math.min(60000, Math.max(interval, 2000) * 2 ** (publicPoll.failures - 1)) :
        interval - (performance.now() - started);
      armPublicPoll(delay);
    }
    if (!rerun && manualRefresh?.lane === 'public') finishManualRefresh();
  }
}

handle('desktop:bootstrap', async (_event, legacy) => {
  if (!state) {
    state = normalizeState(persisted?.state || legacy);
    counts = normalizeCounts(persisted?.counts);
    for (const code of newsCursors.keys()) if (!state.news.followed.includes(code)) newsCursors.delete(code);
    await persist();
    syncOverlays(); schedulePoll(0); scheduleNews(0);
  }
  return snapshot();
});
handle('desktop:updates', async (_event, operation) => {
  if (operation === 'permissions') { await shell.openExternal(process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.preference.notifications' : 'ms-settings:notifications'); return updater.status(); }
  if (operation === 'download') { await shell.openExternal(OFFICIAL + '/download/#versions'); return updater.status(); }
  if (operation === 'history') { await shell.openExternal(OFFICIAL + '/download/updates/'); return updater.status(); }
  return operation === 'check' ? updater.check(true) : updater.status();
});
handle('desktop:orderbook', (event, operation, input) => {
  if (event.sender !== dashboard?.webContents || quitting) throw new Error('请在牛来主面板操作插件');
  if (operation === 'start' && suspended) throw new Error('系统休眠，模拟已暂停');
  return orderbook.command(operation, input, dashboard);
});
handle('desktop:settings', async (_event, patch) => {
  const sourceMode = state.settings.quoteSourceMode;
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  if (sourceMode !== state.settings.quoteSourceMode) {
    stopQuoteStream();
    customPoller.stop();
    customRecords.clear();
    if (manualRefresh) manualRefresh.fallbackConfig = null;
    if (orderbook.snapshotCode) orderbook.stop('行情来源已变化，本轮已停止');
  }
  syncOverlays(); broadcast();
  if (['interval', 'quoteSourceMode', 'quoteSourceFallback'].some(key => Object.hasOwn(patch, key))) {
    quoteEpoch++;
    schedulePoll(0);
  }
  await persist();
  return snapshot();
});
handle('desktop:stock', async (_event, operation, payload = {}) => {
  const code = normalizeMarketSymbol(payload.code);
  if (!code) throw new Error('股票代码无效');
  const stock = state.stocks.find(item => item.code === code);
  let watchlistChanged = false;
  if (operation === 'select') {
    if (!stock) throw new Error('请先添加到自选');
    if (state.selected !== code) crying.reset(code);
    state.selected = code;
  } else if (operation === 'add') {
    if (!stock) {
      if (state.stocks.length >= 50) throw new Error('自选已满 50 只');
      const epoch = quoteEpoch;
      const { quote, error } = await resolveStockQuote(code);
      if (epoch !== quoteEpoch) throw new Error('行情配置已更改，请重新添加股票');
      if (!quote?.price) throw new Error(error || '暂未获取有效行情，请检查代码或稍后重试');
      if (!state.stocks.some(item => item.code === code)) {
        if (state.stocks.length >= 50) throw new Error('自选已满 50 只');
        state.stocks.push({ code, name: quote.name, cost: 0, shares: 0 });
        watchlistChanged = true;
      }
      quotes.set(code, { quote, received: Date.now() });
    }
    if (state.selected !== code) crying.reset(code);
    state.selected = code;
  } else if (operation === 'remove') {
    if (state.stocks.length <= 1) throw new Error('请保留至少一只自选');
    state.stocks = state.stocks.filter(item => item.code !== code);
    if (state.selected === code) state.selected = state.stocks[0].code;
    quotes.delete(code); histories.delete(code); customRecords.delete(code);
    watchlistChanged = Boolean(stock);
    if (orderbook.snapshotCode === code) orderbook.stop('监控标的已移出自选');
    state.news.followed = state.news.followed.filter(followed => followed !== code);
    newsCursors.delete(code);
    scheduleNews();
  } else if (operation === 'position') {
    if (!stock) throw new Error('股票已移出自选');
    const cost = Number(payload.cost), shares = Number(payload.shares);
    if (!Number.isFinite(cost * shares) || cost < 0 || shares < 0 || cost > 1e9 || shares > 1e12 || Boolean(cost) !== Boolean(shares)) throw new Error('请输入有效成本和股数');
    stock.cost = cost; stock.shares = shares;
  } else throw new Error('无效操作');
  broadcast();
  if (watchlistChanged) {
    quoteEpoch++;
    schedulePoll(0);
  }
  await persist();
  return snapshot();
});
handle('desktop:search', async (_event, query) => {
  const value = String(query || '').trim().slice(0, 40);
  if (!value) return [];
  return parseTencentSuggestions(await requestText('https://smartbox.gtimg.cn/s3/?t=all&q=' + encodeURIComponent(value), 'https://gu.qq.com/'));
});
handle('desktop:chart-history', async (_event, value) => {
  if (suspended) throw new Error('系统休眠，行情已暂停');
  if (typeof value !== 'string' || !/^(?:(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,20}),(?:day|week|month)(?:,raw)?$/.test(value)) throw new Error('历史行情参数无效');
  const [symbol, period, basis] = value.split(',');
  const endpoint = basis !== 'raw' && /^(hk|us)/.test(symbol) ? symbol.slice(0, 2) + 'fqkline' : 'fqkline';
  try {
    return await requestText('https://web.ifzq.gtimg.cn/appstock/app/' + endpoint + '/get?param=' + encodeURIComponent(symbol + ',' + period + ',,,240,' + (basis === 'raw' ? '' : 'qfq')), 'https://gu.qq.com/');
  } catch { throw new Error('历史行情连接失败，请稍后重试'); }
});
handle('desktop:chart-minutes', async (event, code) => {
  if (event.sender !== dashboard?.webContents || typeof code !== 'string' || code !== normalizeMarketSymbol(code)) throw new Error('分时参数无效');
  if (suspended) throw new Error('系统休眠，行情已暂停');
  const market = marketForSymbol(code);
  if (market === 'us') {
    const ticker = code.slice(3).toUpperCase().replace('.', '-');
    const series = await requestText('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1d&interval=1m&includePrePost=false', 'https://finance.yahoo.com/', 'utf-8');
    return parseYahooMinutes(JSON.parse(series), code, ticker);
  }
  const symbol = code.replace(/^(s_|rt_)/, '');
  const series = await requestText('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=' + symbol, 'https://gu.qq.com/', 'utf-8');
  return parseTencentMinutes(JSON.parse(series), market, symbol);
});
handle('desktop:custom-series', async (event, code, period, adjustment) => {
  if (event.sender !== dashboard?.webContents || typeof code !== 'string' || code !== normalizeMarketSymbol(code) ||
    !['minute', 'day', 'week', 'month'].includes(period) || !['raw', 'qfq'].includes(adjustment) || period === 'minute' && adjustment !== 'raw') {
    throw new Error('走势参数无效');
  }
  if (suspended) throw new Error('系统休眠，行情已暂停');
  const config = customQuoteConfig;
  if (state.settings.quoteSourceMode !== 'custom' || !config?.seriesUrl || !config.markets.includes(marketForSymbol(code))) throw new Error('自有走势接口未配置');
  try { return await fetchCustomSeries(code, period, adjustment, config); }
  catch (error) {
    if (!state.settings.quoteSourceFallback) throw error;
    return { fallbackFrom: config.name };
  }
});
handle('desktop:market-details', async (event, code) => {
  if (event.sender !== dashboard?.webContents || typeof code !== 'string' || code !== normalizeMarketSymbol(code)) throw new Error('盘口参数无效');
  if (suspended) throw new Error('系统休眠，行情已暂停');
  const market = marketForSymbol(code);
  if (state.settings.quoteSourceMode === 'custom' && (!customQuoteConfig || customQuoteConfig.markets.includes(market)) && !quotes.get(code)?.quote.fallbackFrom) {
    throw new Error('当前使用自有行情源');
  }
  const symbol = code.replace(/^(s_|rt_)/, '').replace(/^gb_(.*)$/, (_match, ticker) => 'us' + ticker.toUpperCase());
  const body = await requestText('https://qt.gtimg.cn/q=' + symbol, 'https://gu.qq.com/');
  return parseMarketDetails(body, code, symbol);
});
function findNewsArticle(id) {
  for (const feed of newsFeeds.values()) {
    const article = feed.data?.articles.find(item => item.id === id);
    if (article) return article;
  }
  return null;
}
function translatedHeadline(article) {
  if (article.language === 'zh') return Promise.resolve('');
  if (newsTranslations.has(article.title)) return newsTranslations.get(article.title);
  const result = translateTitle(article.title).catch(() => '').then(value => {
    if (!value || value === article.title) newsTranslations.delete(article.title);
    return value === article.title ? '' : value;
  });
  newsTranslations.set(article.title, result);
  if (newsTranslations.size > 180) newsTranslations.delete(newsTranslations.keys().next().value);
  return result;
}
async function getStockAliases(stock) {
  if (!/[\p{Script=Han}]/u.test(stock.name)) return [];
  if (!newsAliases.has(stock.name)) {
    const name = stock.code.startsWith('gb_') && stock.name.length <= 2 ? stock.name + '公司' : stock.name;
    const translated = Promise.all(['en', 'ja'].map(language => translateTitle(name, language).catch(() => '')));
    newsAliases.set(stock.name, translated);
    if (newsAliases.size > 60) newsAliases.delete(newsAliases.keys().next().value);
  }
  return newsAliases.get(stock.name);
}
async function getNewsFeed(stock, force = false) {
  const key = stock?.code || 'market';
  const cached = newsFeeds.get(key);
  const now = Date.now();
  if (cached?.pending) return cached.pending;
  if (cached?.data && now - cached.data.received < (force === true ? 10000 : 300000)) return cached.data;
  const primary = newsRequest(stock?.code, stock?.name);
  const feed = { data: cached?.data };
  newsFeeds.set(key, feed);
  feed.pending = (async () => {
    try {
      const load = async request => parseNews(await requestText(request.url, request.referer, 'utf-8'), request.kind, Date.now(), request, newsId);
      const termsForStock = stock ? getStockAliases(stock).then(aliases => stockNewsTerms(stock.code, stock.name, aliases)) : Promise.resolve([]);
      const loadGlobal = async () => Promise.allSettled(globalNewsRequests(await termsForStock).map(load));
      const [local, world] = await Promise.allSettled([load(primary), stock ? loadGlobal() : []]);
      const international = world.status === 'fulfilled' ? world.value.filter(result => result.status === 'fulfilled').map(result => result.value) : [];
      if (local.status === 'rejected' && !international.length) throw new Error('新闻源暂不可用');
      const terms = await termsForStock;
      const articles = mergeNews([local.status === 'fulfilled' ? local.value : [], ...international]
        .map(items => stock ? items.filter(article => newsMatchesStock(article, terms)) : items));
      const sources = [local.status === 'fulfilled' ? primary.source : '', articles.some(item => item.international) ? 'Google News' : ''].filter(Boolean);
      feed.data = { articles, source: sources.join(' / '), received: Date.now() };
      return feed.data;
    } finally {
      feed.pending = null;
      if (!feed.data) newsFeeds.delete(key);
      for (const old of newsFeeds.keys()) {
        if (newsFeeds.size <= 52) break;
        if (!newsFeeds.get(old).pending && old !== key) newsFeeds.delete(old);
      }
    }
  })();
  return feed.pending;
}
handle('desktop:market-news', async (event, scope, code, force) => {
  if (event.sender !== dashboard?.webContents || !['stock', 'market'].includes(scope)) throw new Error('新闻参数无效');
  if (suspended) throw new Error('系统休眠，新闻已暂停');
  const stock = scope === 'stock' ? state.stocks.find(item => item.code === code) : null;
  if (scope === 'stock' && !stock) throw new Error('股票已移出自选');
  return getNewsFeed(stock, force);
});
handle('desktop:open-news', async (event, id) => {
  if (event.sender !== dashboard?.webContents || typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) throw new Error('新闻链接无效');
  const article = findNewsArticle(id);
  if (!article) throw new Error('新闻已更新，请刷新后再打开');
  await shell.openExternal(article.url);
  return true;
});
function showNewsNotification(title, body, code) {
  if (!Notification.isSupported()) return Promise.resolve(false);
  return new Promise(resolve => {
    const notification = new Notification({ title, body, silent: true, icon: path.join(__dirname, 'build/icon.png') });
    notification.on('click', () => {
      if (code && state.stocks.some(stock => stock.code === code)) {
        if (state.selected !== code) crying.reset(code);
        state.selected = code;
        broadcast();
        persist().catch(error => log('ERROR', error.message));
      }
      showDashboard();
      if (code) dashboard.webContents.send('desktop:news-arrived');
    });
    notification.once('show', () => { clearTimeout(timeout); resolve(true); });
    notification.once('failed', () => { clearTimeout(timeout); resolve(false); });
    const timeout = setTimeout(() => resolve(false), 5000);
    timeout.unref();
    notification.show();
  });
}
function scheduleNews(delay = newsInterval) {
  clearTimeout(newsTimer);
  if (!state?.news.notifications || !state.news.followed.length || suspended || quitting) return;
  newsTimer = setTimeout(pollFollowedNews, delay);
  newsTimer.unref();
}
async function pollFollowedNews() {
  if (checkingNews) { scheduleNews(); return; }
  checkingNews = true;
  const generation = newsGeneration;
  const codes = [...state.news.followed];
  const active = () => generation === newsGeneration && state.news.notifications && !suspended && !quitting;
  try {
    for (let start = 0; start < codes.length && active(); start += 2) {
      const stocks = codes.slice(start, start + 2).map(code => state.stocks.find(stock => stock.code === code)).filter(Boolean);
      await Promise.allSettled(stocks.map(async stock => {
        const stillFollowing = () => active() && state.news.followed.includes(stock.code);
        const { articles } = await getNewsFeed(stock);
        if (!stillFollowing()) return;
        const { cursor, eligible } = newsNotificationBatch(newsCursors.get(stock.code), articles, Date.now(), newsId);
        if (eligible.length) {
          const [latest] = eligible;
          const translated = state.news.autoTranslate ? await translatedHeadline(latest) : '';
          if (!stillFollowing()) return;
          const extra = eligible.length > 1 ? ' · 另有 ' + (eligible.length - 1) + ' 条' : '';
          const delivered = await showNewsNotification(stock.name + ' · ' + latest.publisher + extra, translated || latest.title, stock.code);
          if (!delivered || !stillFollowing()) return;
        }
        newsCursors.set(stock.code, cursor);
      }));
    }
    if (active()) await persist();
  } catch (error) { log('WARN', '新闻通知 ' + error.message); }
  finally {
    checkingNews = false;
    scheduleNews(generation === newsGeneration ? newsInterval : 0);
  }
}
handle('desktop:translate-news', async (event, ids) => {
  if (event.sender !== dashboard?.webContents || !Array.isArray(ids) || ids.length > 12) throw new Error('新闻翻译参数无效');
  if (!state.news.autoTranslate || suspended) return {};
  const articles = [...new Set(ids)].map(findNewsArticle).filter(Boolean);
  const result = {};
  for (let start = 0; start < articles.length; start += 3) {
    await Promise.all(articles.slice(start, start + 3).map(async article => { result[article.id] = await translatedHeadline(article); }));
  }
  return result;
});
handle('desktop:news-preferences', async (event, operation, value) => {
  if (event.sender !== dashboard?.webContents) throw new Error('请在主面板设置新闻');
  if (operation === 'permissions') {
    await shell.openExternal(process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.preference.notifications' : 'ms-settings:notifications');
    return true;
  }
  if (operation === 'test') {
    if (!state.news.notifications) throw new Error('请先开启新闻通知');
    return showNewsNotification('牛来盯盘 · 新闻通知', '已收到测试通知。关注的股票发布新消息时会在这里提醒。');
  }
  if (operation === 'follow') {
    if (!state.stocks.some(stock => stock.code === value)) throw new Error('请先添加到自选');
    const followed = state.news.followed;
    if (followed.includes(value)) {
      state.news.followed = followed.filter(code => code !== value);
      newsCursors.delete(value);
    } else {
      if (followed.length >= MAX_NEWS_FOLLOWS) throw new Error('最多关注 ' + MAX_NEWS_FOLLOWS + ' 只股票');
      state.news.followed = [...followed, value];
    }
    newsGeneration++;
    scheduleNews(0);
  } else if (operation === 'notifications' || operation === 'autoTranslate') {
    if (typeof value !== 'boolean') throw new Error('新闻设置无效');
    if (operation === 'notifications') {
      if (value && !Notification.isSupported()) throw new Error('此系统不支持桌面通知');
      if (value !== state.news.notifications) {
        newsGeneration++;
        newsCursors.clear();
      }
    }
    state.news[operation] = value;
    if (operation === 'notifications') scheduleNews(0);
  } else throw new Error('新闻设置无效');
  await persist();
  broadcast();
  return snapshot();
});
handle('desktop:refresh', (event, manual) => {
  if (manual !== true) {
    schedulePoll(0);
    if (state && !suspended && !quitting && activeQuoteConfig() && usesCustomQuote(state.selected)) {
      void customPoller.refresh(state.selected).catch(() => {});
    }
    return true;
  }
  if (event.sender !== dashboard?.webContents || !state || suspended || quitting) throw new Error('当前无法刷新行情');
  if (!manualRefresh) {
    manualRefresh = { code: state.selected };
    manualRefresh.promise = new Promise((resolve, reject) => Object.assign(manualRefresh, { resolve, reject }));
    const pending = manualRefresh.promise;
    syncCustomPoller();
    routeManualRefresh();
    return pending;
  }
  return manualRefresh.promise;
});
handle('desktop:quote-source', async (event, operation, payload = {}) => {
  if (event.sender !== dashboard?.webContents) throw new Error('请在主面板配置行情来源');
  if (operation === 'get') {
    const { token, ...config } = customQuoteConfig || defaultSourceConfig();
    return { ...config, hasToken: Boolean(token), mode: state.settings.quoteSourceMode, fallback: state.settings.quoteSourceFallback, storage: sealedQuoteSource ? 'encrypted' : 'session', error: quoteSourceError };
  }
  if (operation === 'clear') {
    customQuoteConfig = null; sealedQuoteSource = null; quoteSourceError = '';
    state.settings.quoteSourceMode = 'public';
  } else {
    let config = null;
    if (operation === 'test' || payload.mode === 'custom' || payload.url) {
      const token = payload.token || (payload.authType === customQuoteConfig?.authType ? customQuoteConfig?.token || '' : '');
      if (!payload.token && token && new URL(payload.url).origin !== new URL(customQuoteConfig.url).origin) throw new Error('接口域名已更换，请重新填写鉴权密钥');
      config = normalizeSourceConfig({ ...payload, token });
    }
    if (operation === 'test') {
      const code = normalizeMarketSymbol(payload.testCode || state.selected);
      if (!code || !config.markets.includes(marketForSymbol(code))) throw new Error('测试股票须属于所选市场');
      const [snapshotResult, streamSample, series] = await Promise.all([
        fetchCustomQuote(code, config).then(quote => ({ quote, received: Date.now() }), error => ({ error })),
        config.streamUrl ? testQuoteStream(config, code) : null,
        config.seriesUrl ? fetchCustomSeries(code, 'day', 'raw', config).then(result => ({ bars: result.bars.length }), error => ({ error: error.message })) : null
      ]);
      const result = snapshotResult.quote ? snapshotResult : streamSample;
      if (!result?.quote) throw snapshotResult.error;
      const { quote: _, ...stream } = streamSample || {};
      return { quote: result.quote, received: result.received, transport: snapshotResult.quote ? 'http' : 'ndjson',
        series, stream: streamSample ? stream : null };
    }
    if (operation !== 'save') throw new Error('无效操作');
    let sealed = null;
    if (config && safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text') sealed = safeStorage.encryptString(JSON.stringify(config)).toString('base64');
    customQuoteConfig = config; sealedQuoteSource = sealed; quoteSourceError = '';
    state.settings.quoteSourceMode = payload.mode === 'custom' ? 'custom' : 'public';
    state.settings.quoteSourceFallback = payload.fallback === true;
  }
  if (orderbook.snapshotCode) orderbook.stop('行情来源已变化，本轮已停止');
  stopQuoteStream();
  customPoller.stop();
  quoteEpoch++;
  seriesRevision++;
  if (manualRefresh) manualRefresh.fallbackConfig = null;
  publicPoll.failures = 0;
  quotes.clear(); histories.clear(); customRecords.clear();
  for (const code of crying.entries.keys()) crying.reset(code);
  await persist();
  broadcast(); schedulePoll(0);
  return { mode: state.settings.quoteSourceMode, storedSecurely: Boolean(sealedQuoteSource), configured: Boolean(customQuoteConfig) };
});
handle('desktop:counts', async (_event, reset) => {
  counts = tapCounts(counts, reset === true);
  broadcast('desktop:knock', { counts, reset: reset === true });
  await persist();
  return counts;
});
handle('desktop:alerts', async (_event, alerts) => {
  state.alerts = normalizeState({ ...state, alerts }).alerts;
  broadcast();
  await persist();
  return state.alerts;
});
handle('desktop:notify', (_event, body) => {
  if (Notification.isSupported()) {
    const notification = new Notification({ title: '牛来盯盘', body: String(body).slice(0, 200), silent: true });
    notification.on('click', showDashboard);
    notification.show();
  }
});
handle('desktop:scene', (event, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.marketScene = value === true;
});

function playMarketReaction() {
  if (!state || suspended || quitting) return;
  const target = windows().find(window => window.isVisible() && window.marketScene);
  const code = state.selected;
  if (crying.claimAudio(code, quotes.get(code), state.settings, Boolean(target))) {
    target.webContents.send('desktop:mama', { volume: state.settings.volume });
    persist().catch(error => log('ERROR', error.message));
  }
}
handle('desktop:feedback', (_event, value) => submitFeedback(value, app.getVersion() + ' · ' + ({ win32: 'Windows', darwin: 'macOS' }[process.platform] || process.platform) + ' ' + process.arch));
handle('desktop:window', async (event, action, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const kind = window.overlayKind;
  if (action === 'dashboard') showDashboard();
  else if (action === 'hide') { dashboard.hide(); syncOverlays(); }
  else if (action === 'quit') app.quit();
  else if (action === 'collapse' && kind === 'pet') {
    collapsed.has(kind) ? collapsed.delete(kind) : collapsed.add(kind);
    window.setBounds(constrain({ ...window.getBounds(), ...overlaySize(kind) }));
    window.webContents.send('desktop:collapsed', collapsed.has(kind));
  } else if (action === 'close' && kind) {
    state.settings[kind + 'Enabled'] = false;
    syncOverlays(); broadcast(); await persist();
  } else if (action === 'reset') {
    for (const item of Object.keys(overlayNames)) delete positions[item];
    for (const [item, overlay] of overlays) overlay.setBounds(overlayBounds(item));
    await persist();
  } else if (action === 'external') {
    const url = externalQuoteUrl(value || state.selected);
    if (url) await shell.openExternal(url);
  } else if (action === 'preview') broadcast('desktop:preview', String(value).slice(0, 30));
  return true;
});
function stopDrag(window) {
  clearInterval(window.dragTimer);
  clearTimeout(window.dragTimeout);
  window.dragTimer = null;
  window.dragOrigin = null;
}
function updateDrag(window) {
  if (window.isDestroyed() || !window.dragOrigin) return;
  const { start, bounds } = window.dragOrigin;
  const cursor = screen.getCursorScreenPoint();
  window.setBounds(constrain({ ...bounds, x: bounds.x + cursor.x - start.x, y: bounds.y + cursor.y - start.y }));
}
handle('desktop:drag-start', (event, origin) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window.overlayKind) return;
  stopDrag(window);
  const start = Number.isFinite(origin?.x) && Number.isFinite(origin?.y) ? origin : screen.getCursorScreenPoint();
  window.dragOrigin = { start, bounds: window.getBounds() };
  updateDrag(window);
  window.dragTimer = setInterval(() => {
    if (window.isDestroyed()) return stopDrag(window);
    updateDrag(window);
  }, 16);
  window.dragTimeout = setTimeout(() => stopDrag(window), 15000);
});
handle('desktop:drag-end', async event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  updateDrag(window);
  stopDrag(window);
  await persist();
});

app.on('second-instance', () => { log('INFO', '检测到重复启动'); showDashboard(); });
app.whenReady().then(async () => {
  if (!locked) return;
  const logs = path.join(app.getPath('userData'), 'logs');
  await fsp.mkdir(logs, { recursive: true });
  logFile = path.join(logs, 'main.log');
  log('INFO', `启动 ${app.getVersion()}`);
  try {
    persisted = JSON.parse(await fsp.readFile(stateFile(), 'utf8'));
    for (const kind of ['dashboard', ...Object.keys(overlayNames)]) {
      const position = persisted.positions?.[kind];
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) positions[kind] = position;
    }
    for (const [code, cursor] of Object.entries(persisted.newsCursors || {}).slice(0, MAX_NEWS_FOLLOWS)) {
      if (typeof code === 'string' && code === normalizeMarketSymbol(code) && Number.isFinite(cursor?.since)) {
        newsCursors.set(code, { since: cursor.since, seen: Array.isArray(cursor.seen) ? cursor.seen.filter(id => typeof id === 'string' && /^[0-9a-f]{24}$/.test(id)).slice(-75) : [] });
      }
    }
    if (Number.isFinite(persisted.reactionAudioAt) && persisted.reactionAudioAt > 0) crying.lastAudioAt = persisted.reactionAudioAt;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      log('ERROR', '设置文件读取失败 ' + error.message);
      if (fs.existsSync(stateFile())) await fsp.copyFile(stateFile(), stateFile() + '.recovery-' + Date.now());
    }
  }
  if (!persisted) {
    try {
      const previous = JSON.parse(await fsp.readFile(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
      if (Number.isFinite(previous.x) && Number.isFinite(previous.y)) positions.pet = { x: previous.x, y: previous.y };
    } catch { }
  }
  if (typeof persisted?.quoteSource === 'string') {
    sealedQuoteSource = persisted.quoteSource;
    try {
      customQuoteConfig = normalizeSourceConfig(JSON.parse(safeStorage.decryptString(Buffer.from(sealedQuoteSource, 'base64'))));
    } catch {
      quoteSourceError = '本机无法读取已保存的行情凭据，请重新配置';
      log('WARN', '自有行情凭据解密失败');
    }
  }
  orderbook = new OrderbookPlugin({
    file: path.join(app.getPath('userData'), 'orderbook-plugin.json'),
    dialog,
    checkSnapshot: (code, { latencyMs, maxAgeMs }) => {
      if (!code || !state?.stocks.some(stock => stock.code === code)) throw new Error('请先将标的加入牛来自选');
      if (state.settings.quoteSourceMode !== 'custom' || !customQuoteConfig?.markets.includes(marketForSymbol(code))) {
        throw new Error('请先在设置中启用该市场的自有行情源');
      }
      const interval = hasRecentStreamQuote(code) ? 0 : customQuoteInterval();
      const window = latencyMs + maxAgeMs;
      if (interval >= window) {
        throw new Error('行情轮询间隔 ' + interval + ' ms 达到或超过 ' + window + ' ms 的模拟等待窗口。请缩短行情轮询间隔或改用深度推送。');
      }
    }
  });
  await orderbook.load();
  const updateFile = path.join(app.getPath('userData'), 'updates.json');
  updater = createUpdateChecker({ current: app.getVersion(),
    read: () => { try { return JSON.parse(fs.readFileSync(updateFile, 'utf8')); } catch { return {}; } },
    save: value => fs.writeFileSync(updateFile, JSON.stringify(value)),
    enabled: () => state?.settings.updateNotifications && !suspended && !qaProfile,
    changed: value => broadcast('desktop:update', value),
    notify: info => new Promise(resolve => {
      if (!Notification.isSupported()) return resolve(false);
      const notification = new Notification({ title: '牛来盯盘 ' + info.version + ' 已发布', body: info.notes[0] + '，点击查看更新。', silent: true });
      notification.on('click', () => shell.openExternal(OFFICIAL + '/download/#versions'));
      notification.once('show', () => resolve(true)); notification.once('failed', () => resolve(false));
      notification.show(); setTimeout(() => resolve(false), 5000).unref();
    })
  });
  if (!qaProfile) { setTimeout(() => updater.check(), 15000).unref(); updateTimer = setInterval(() => updater.check(), updater.interval); updateTimer.unref(); }
  updateSystemAccent(readSystemAccent());
  createDashboard();
  tray = new Tray(path.join(__dirname, 'build/icon.png'));
  tray.setToolTip('牛来盯盘');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开牛来盯盘', click: showDashboard },
    { label: '悬浮窗口归位', click: () => { for (const kind of overlays.keys()) { delete positions[kind]; overlays.get(kind).setBounds(overlayBounds(kind)); } } },
    { type: 'separator' }, { label: '退出牛来', click: () => app.quit() }
  ]));
  tray.on('double-click', showDashboard);
  const suspend = () => {
    suspended = true; quoteEpoch++; newsGeneration++; stopQuotePolling(); clearTimeout(newsTimer);
    orderbook.stop('系统休眠或锁屏，本轮已停止');
    finishManualRefresh(new Error('系统休眠，刷新已暂停'));
    for (const code of crying.entries.keys()) crying.invalidate(code);
    syncOverlays(); broadcast();
  };
  const resume = () => {
    suspended = false;
    for (const code of crying.entries.keys()) crying.reset(code);
    syncOverlays(); broadcast(); schedulePoll(0); scheduleNews(0);
  };
  powerMonitor.on('suspend', suspend);
  powerMonitor.on('lock-screen', suspend);
  powerMonitor.on('resume', resume);
  powerMonitor.on('unlock-screen', resume);
  nativeTheme.on('updated', () => {
    updateSystemAccent(readSystemAccent());
    broadcast();
  });
  if (process.platform === 'win32') {
    systemPreferences.on('accent-color-changed', (_event, value) => {
      if (updateSystemAccent(value)) broadcast();
    });
  } else if (process.platform === 'darwin') {
    const refreshAccent = () => { if (updateSystemAccent(readSystemAccent())) broadcast(); };
    app.on('browser-window-focus', refreshAccent);
    try {
      const subscription = systemPreferences.subscribeLocalNotification('NSSystemColorsDidChangeNotification', refreshAccent);
      app.once('will-quit', () => systemPreferences.unsubscribeLocalNotification(subscription));
    } catch (error) { log('WARN', '无法监听系统强调色：' + error.message); }
  }
  reactionTimer = setInterval(playMarketReaction, 250);
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => {
    for (const window of windows()) window.setBounds(constrain(window.getBounds()));
  });
  const qaQuit = Number(argument('--qa-auto-quit='));
  if (qaProfile && qaQuit > 0) setTimeout(() => { log('INFO', 'QA自动退出'); app.quit(); }, qaQuit);
});
app.on('activate', showDashboard);
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  orderbook?.stop('牛来已退出');
  finishManualRefresh(new Error('程序正在退出'));
  stopQuotePolling();
  clearTimeout(newsTimer);
  clearInterval(reactionTimer);
  for (const window of windows()) stopDrag(window);
  if (state) persist().catch(error => log('ERROR', error.message)).finally(() => app.quit());
  else app.quit();
});
