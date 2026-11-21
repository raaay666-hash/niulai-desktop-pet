const { app, BrowserWindow, ipcMain, screen, powerMonitor, shell, Tray, Menu, nativeTheme, Notification, safeStorage } = require('electron');
const path = require('node:path');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { normalizeMarketSymbol, marketForSymbol, quoteProviderSymbol, parseTencentSuggestions, externalQuoteUrl } = require('./main-modules/market-symbols');
const { parseSinaQuote, parseTencentQuote } = require('./main-modules/quote-parsers');
const { marketClock, quoteHealth, newestQuote } = require('./main-modules/quote-time');
const { normalizeState, normalizeSettings, normalizeCounts, tapCounts, MAX_NEWS_FOLLOWS } = require('./main-modules/desktop-state.cjs');
const { CryingReaction } = require('./main-modules/crying-reaction.cjs');
const { defaultSourceConfig, normalizeSourceConfig, fetchCustomQuote, fetchCustomQuotes, fetchCustomSeries } = require('./main-modules/custom-quotes.cjs');
const { createUpdateChecker } = require('./main-modules/update-checker.cjs');
const { OFFICIAL } = require('./main-modules/update-policy.cjs');
const { submitFeedback } = require('./main-modules/feedback.cjs');
const { parseMarketDetails, parseTencentMinutes, parseYahooMinutes } = require('./main-modules/market-insights.cjs');
const { parseNews, newsRequest, stockNewsTerms, newsMatchesStock, globalNewsRequests, mergeNews, translateTitle, newsNotificationBatch } = require('./main-modules/market-news.cjs');
let updater, updateTimer;

const argument = prefix => (process.argv.find(value => value.startsWith(prefix)) || '').slice(prefix.length);
const qaProfile = argument('--qa-user-data-dir=');
if (qaProfile) app.setPath('userData', path.resolve(qaProfile));
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.niulai.desktop-pet' : process.execPath);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let dashboard, tray, state, counts, persisted = null, suspended = false, quitting = false;
let pollTimer, reactionTimer, polling = false, refreshPending = false, quoteEpoch = 0;
let failedPolls = 0, manualRefresh;
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
    storage: sealedQuoteSource ? 'encrypted' : 'session', error: quoteSourceError
  };
  return { state, counts, quotes: Object.fromEntries(quotes), histories: Object.fromEntries(histories), reactions: crying.snapshot(), quoteSource, suspended, refreshing: polling || refreshPending, dark: nativeTheme.shouldUseDarkColors, version: app.getVersion() };
}
function windows() {
  return [dashboard, ...overlays.values()].filter(window => window && !window.isDestroyed());
}
function broadcast(channel = 'desktop:snapshot', value = snapshot()) {
  for (const window of windows()) window.webContents.send(channel, value);
}
function persist() {
  const payload = JSON.stringify({ state, counts, positions, quoteSource: sealedQuoteSource, newsCursors: Object.fromEntries(newsCursors), reactionAudioAt: Number.isFinite(crying.lastAudioAt) ? crying.lastAudioAt : 0 });
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const temporary = stateFile() + '.tmp';
    await fsp.writeFile(temporary, payload, 'utf8');
    await fsp.rename(temporary, stateFile());
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
  if (kind === 'island') return { width: state.settings.islandWidth, height: collapsed.has(kind) ? 66 : 194 };
  if (kind === 'widget') return { width: 346, height: 358 };
  if (collapsed.has(kind)) return { width: 104, height: 86 };
  return { width: Math.round(282 * state.settings.petScale / 100), height: Math.round(302 * state.settings.petScale / 100) };
}
function overlayBounds(kind) {
  const area = screen.getPrimaryDisplay().workArea;
  const size = overlaySize(kind);
  return constrain({
    ...size,
    x: positions[kind]?.x ?? (kind === 'island' ? area.x + (area.width - size.width) / 2 : area.x + area.width - size.width - (kind === 'widget' ? 346 : 32)),
    y: positions[kind]?.y ?? (kind === 'island' ? area.y + 12 : area.y + area.height - size.height - 32)
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
  if (kind === 'island') collapsed.add(kind);
  const names = { pet: '桌宠', island: '悬浮窗', widget: '桌面卡片' };
  const window = new BrowserWindow({
    ...overlayBounds(kind), frame: false, transparent: true, resizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    hasShadow: false, show: false, backgroundColor: '#00000000', title: '牛来' + names[kind],
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
  for (const kind of ['pet', 'island', 'widget']) {
    const enabled = state.settings[kind === 'pet' ? 'petEnabled' : kind === 'island' ? 'islandEnabled' : 'widgetEnabled'];
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
  return [...new Set([...state.stocks.map(stock => stock.code), state.settings.islandSymbol].filter(Boolean))];
}
function quotePollDelay() {
  const settings = state.settings;
  const requested = settings.islandEnabled ? Math.min(settings.interval, settings.islandInterval) : settings.interval;
  const custom = settings.quoteSourceMode === 'custom' ? customQuoteConfig : null;
  const publicCodes = quoteCodes().filter(code => !custom || settings.quoteSourceFallback || !custom.markets.includes(marketForSymbol(code)));
  const now = Date.now();
  const marketOpen = publicCodes.some(code => ['pre', 'regular', 'post'].includes(marketClock(code, now).phase));
  const publicFloor = marketOpen ? 1 : publicCodes.length ? 10 : 0;
  const interval = Math.max(requested, custom?.interval || 0, publicFloor) * 1000;
  if (!failedPolls) return interval;
  return Math.min(60000, Math.max(interval, 2000) * 2 ** (failedPolls - 1));
}
function schedulePoll(delay) {
  clearTimeout(pollTimer);
  if (!state || suspended || quitting) return;
  pollTimer = setTimeout(poll, delay ?? quotePollDelay());
}
async function resolveQuotes(codes) {
  const resolved = new Map(), errors = new Map();
  let limited = false;
  const usingCustom = state.settings.quoteSourceMode === 'custom';
  const config = customQuoteConfig;
  const customCodes = usingCustom ? codes.filter(code => !config || config.markets.includes(marketForSymbol(code))) : [];
  if (config && customCodes.length) {
    const results = await fetchCustomQuotes(customCodes, config);
    for (const [code, result] of results) {
      if (result.quote) resolved.set(code, result.quote);
      else {
        errors.set(code, result.error);
        limited ||= result.limited === true;
      }
    }
  } else for (const code of customCodes) errors.set(code, '自有行情源需重新配置');

  const publicCodes = codes.filter(code => !customCodes.includes(code) || state.settings.quoteSourceFallback && quoteHealth({ quote: resolved.get(code), received: Date.now() }, state.settings.interval).warning);
  if (!publicCodes.length) return { resolved, errors, limited };
  let primary = '';
  try { primary = await requestText('https://hq.sinajs.cn/list=' + publicCodes.join(','), 'https://finance.sina.com.cn/'); }
  catch (error) { limited ||= error.status === 429; log('WARN', '新浪 ' + error.message); }
  const publicQuotes = new Map();
  for (const code of publicCodes) {
    const quote = parseSinaQuote(primary, code);
    if (quote?.price > 0) publicQuotes.set(code, quote);
  }
  const missing = publicCodes.filter(code => !publicQuotes.has(code) || code.startsWith('gb_') && quoteHealth({ quote: publicQuotes.get(code), received: Date.now() }, state.settings.interval).warning);
  if (missing.length) {
    try {
      const fallback = await requestText('https://qt.gtimg.cn/q=' + missing.map(code => quoteProviderSymbol(code, 'tencent')).join(','), 'https://gu.qq.com/');
      for (const code of missing) {
        const quote = parseTencentQuote(fallback, code);
        if (quote?.price > 0) publicQuotes.set(code, newestQuote([publicQuotes.get(code), quote]));
      }
    } catch (error) { limited ||= error.status === 429; log('WARN', '腾讯 ' + error.message); }
  }
  for (const [code, quote] of publicQuotes) {
    const chosen = newestQuote([resolved.get(code), quote]);
    if (chosen === quote && customCodes.includes(code)) chosen.fallbackFrom = config?.name || '自有行情源';
    resolved.set(code, chosen);
  }
  return { resolved, errors, limited };
}

function finishManualRefresh(error) {
  if (!manualRefresh) return;
  const { resolve, reject } = manualRefresh;
  manualRefresh = null;
  if (error) reject(error);
  else resolve(quotes.get(state.selected) || null);
}
async function poll() {
  clearTimeout(pollTimer);
  if (!state || suspended || quitting) return;
  if (polling) { refreshPending = true; return; }
  polling = true;
  refreshPending = false;
  const epoch = quoteEpoch;
  const codes = quoteCodes();
  try {
    const { resolved, errors, limited } = await resolveQuotes(codes);
    if (epoch !== quoteEpoch || suspended || quitting) return;
    failedPolls = limited || !resolved.size ? Math.min(7, failedPolls + 1) : 0;
    let namesChanged = false;
    const received = Date.now();
    for (const code of codes) {
      let quote = resolved.get(code);
      if (quote) {
        const previous = quotes.get(code)?.quote;
        if (code.startsWith('gb_')) quote = newestQuote([quote, previous]);
        quotes.set(code, { quote, received });
        const sessionChanged = code.startsWith('gb_') && previous && (previous.session !== quote.session || previous.quotedAt && quote.quotedAt && marketClock(code, previous.quotedAt).dateKey !== marketClock(code, quote.quotedAt).dateKey);
        const samples = sessionChanged ? [] : histories.get(code) || [];
        const at = quote.quotedAt ?? received;
        if ((!code.startsWith('gb_') || Number.isFinite(quote.quotedAt)) && (samples.at(-1)?.at !== at || samples.at(-1)?.price !== quote.price)) samples.push({ price: quote.price, at });
        histories.set(code, samples.slice(-60));
        const stock = state.stocks.find(item => item.code === code);
        if (stock && stock.name !== quote.name) { stock.name = quote.name; namesChanged = true; }
      } else quotes.set(code, { ...quotes.get(code), error: errors.get(code) || '更新失败，保留上次报价' });
      crying.update(code, quotes.get(code), state.settings.interval);
    }
    broadcast();
    finishManualRefresh();
    if (namesChanged) persist().catch(error => log('ERROR', error.message));
  } catch (error) {
    if (epoch === quoteEpoch && !suspended && !quitting) {
      failedPolls = Math.min(7, failedPolls + 1);
      finishManualRefresh(new Error('行情更新失败，请重试'));
    }
    log('WARN', '行情更新 ' + error.message);
  } finally {
    polling = false;
    refreshPending = !suspended && !quitting && (refreshPending || epoch !== quoteEpoch);
    schedulePoll(refreshPending ? 0 : undefined);
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
handle('desktop:settings', async (_event, patch) => {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  syncOverlays(); broadcast();
  if (['interval', 'islandInterval', 'islandEnabled', 'islandSymbol'].some(key => Object.hasOwn(patch, key))) {
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
  if (operation === 'select') {
    if (!stock) throw new Error('请先添加到自选');
    if (state.selected !== code) crying.reset(code);
    state.selected = code;
  } else if (operation === 'add') {
    if (!stock) {
      if (state.stocks.length >= 50) throw new Error('自选已满 50 只');
      const epoch = quoteEpoch;
      const { resolved, errors } = await resolveQuotes([code]);
      if (epoch !== quoteEpoch) throw new Error('行情配置已更改，请重新添加股票');
      const quote = resolved.get(code);
      if (!quote?.price) throw new Error(errors.get(code) || '暂未获取有效行情，请检查代码或稍后重试');
      if (!state.stocks.some(item => item.code === code)) {
        if (state.stocks.length >= 50) throw new Error('自选已满 50 只');
        state.stocks.push({ code, name: quote.name, cost: 0, shares: 0 });
      }
      quotes.set(code, { quote, received: Date.now() });
    }
    if (state.selected !== code) crying.reset(code);
    state.selected = code;
  } else if (operation === 'remove') {
    if (state.stocks.length <= 1) throw new Error('请保留至少一只自选');
    state.stocks = state.stocks.filter(item => item.code !== code);
    if (state.selected === code) state.selected = state.stocks[0].code;
    if (state.settings.islandSymbol === code) state.settings.islandSymbol = '';
    quotes.delete(code); histories.delete(code);
    state.news.followed = state.news.followed.filter(followed => followed !== code);
    newsCursors.delete(code);
    scheduleNews();
  } else if (operation === 'position') {
    if (!stock) throw new Error('股票已移出自选');
    const cost = Number(payload.cost), shares = Number(payload.shares);
    if (!Number.isFinite(cost * shares) || cost < 0 || shares < 0 || cost > 1e9 || shares > 1e12 || Boolean(cost) !== Boolean(shares)) throw new Error('请输入有效成本和股数');
    stock.cost = cost; stock.shares = shares;
  } else throw new Error('无效操作');
  quoteEpoch++;
  broadcast(); schedulePoll(0);
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
        quoteEpoch++;
        broadcast(); schedulePoll(0);
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
  if (manual !== true) { schedulePoll(0); return true; }
  if (event.sender !== dashboard?.webContents || !state || suspended || quitting) throw new Error('当前无法刷新行情');
  if (!manualRefresh) {
    manualRefresh = {};
    manualRefresh.promise = new Promise((resolve, reject) => Object.assign(manualRefresh, { resolve, reject }));
    if (!polling) schedulePoll(0);
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
      const quote = await fetchCustomQuote(code, config);
      const received = Date.now();
      const series = config.seriesUrl
        ? await fetchCustomSeries(code, 'day', 'raw', config).then(result => ({ bars: result.bars.length }), error => ({ error: error.message }))
        : null;
      return { quote, received, series };
    }
    if (operation !== 'save') throw new Error('无效操作');
    let sealed = null;
    if (config && safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text') sealed = safeStorage.encryptString(JSON.stringify(config)).toString('base64');
    customQuoteConfig = config; sealedQuoteSource = sealed; quoteSourceError = '';
    state.settings.quoteSourceMode = payload.mode === 'custom' ? 'custom' : 'public';
    state.settings.quoteSourceFallback = payload.fallback === true;
  }
  quoteEpoch++;
  seriesRevision++;
  failedPolls = 0;
  quotes.clear(); histories.clear();
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
  const candidates = windows().filter(window => window.isVisible() && window.marketScene);
  for (const code of new Set([state.selected, state.settings.islandSymbol].filter(Boolean))) {
    const target = candidates.find(window => window.overlayKind === 'island' ? (state.settings.islandSymbol || state.selected) === code : state.selected === code);
    if (crying.claimAudio(code, quotes.get(code), state.settings, Boolean(target))) {
      target.webContents.send('desktop:mama', { volume: state.settings.volume });
      persist().catch(error => log('ERROR', error.message));
    }
  }
}
handle('desktop:feedback', (_event, value) => submitFeedback(value, app.getVersion() + ' · ' + ({ win32: 'Windows', darwin: 'macOS' }[process.platform] || process.platform) + ' ' + process.arch));
handle('desktop:window', async (event, action, value) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const kind = window.overlayKind;
  if (action === 'dashboard') showDashboard();
  else if (action === 'hide') { dashboard.hide(); syncOverlays(); }
  else if (action === 'quit') app.quit();
  else if (action === 'collapse' && kind) {
    collapsed.has(kind) ? collapsed.delete(kind) : collapsed.add(kind);
    window.setBounds(constrain({ ...window.getBounds(), ...overlaySize(kind) }));
    window.webContents.send('desktop:collapsed', collapsed.has(kind));
  } else if (action === 'close' && kind) {
    state.settings[kind === 'pet' ? 'petEnabled' : kind === 'island' ? 'islandEnabled' : 'widgetEnabled'] = false;
    syncOverlays(); broadcast(); await persist();
  } else if (action === 'reset') {
    for (const item of ['pet', 'island', 'widget']) delete positions[item];
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
    Object.assign(positions, persisted.positions);
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
    suspended = true; quoteEpoch++; newsGeneration++; clearTimeout(pollTimer); clearTimeout(newsTimer);
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
  nativeTheme.on('updated', () => broadcast());
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
  finishManualRefresh(new Error('程序正在退出'));
  clearTimeout(pollTimer);
  clearTimeout(newsTimer);
  clearInterval(reactionTimer);
  for (const window of windows()) stopDrag(window);
  if (state) persist().catch(error => log('ERROR', error.message)).finally(() => app.quit());
  else app.quit();
});
