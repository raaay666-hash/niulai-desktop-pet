const { app, BrowserWindow, ipcMain, screen, powerMonitor, shell, Tray, Menu, nativeTheme, Notification, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { normalizeMarketSymbol, marketForSymbol, quoteProviderSymbol, parseTencentSuggestions, externalQuoteUrl } = require('./main-modules/market-symbols');
const { parseSinaQuote, parseTencentQuote } = require('./main-modules/quote-parsers');
const { marketClock, quoteHealth, newestQuote } = require('./main-modules/quote-time');
const { normalizeState, normalizeSettings, normalizeCounts, tapCounts } = require('./main-modules/desktop-state.cjs');
const { CryingReaction } = require('./main-modules/crying-reaction.cjs');
const { defaultSourceConfig, normalizeSourceConfig, fetchCustomQuote, fetchCustomQuotes } = require('./main-modules/custom-quotes.cjs');
const { createUpdateChecker } = require('./main-modules/update-checker.cjs');
const { OFFICIAL } = require('./main-modules/update-policy.cjs');
let updater, updateTimer;

const argument = prefix => (process.argv.find(value => value.startsWith(prefix)) || '').slice(prefix.length);
const qaProfile = argument('--qa-user-data-dir=');
if (qaProfile) app.setPath('userData', path.resolve(qaProfile));
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let dashboard, tray, state, counts, persisted = null, suspended = false, quitting = false;
let pollTimer, reactionTimer, polling = false, refreshPending = false, quoteEpoch = 0;
let writeQueue = Promise.resolve();
let customQuoteConfig = null, sealedQuoteSource = null, quoteSourceError = '';
const overlays = new Map();
const quotes = new Map();
const histories = new Map();
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
  return { state, counts, quotes: Object.fromEntries(quotes), histories: Object.fromEntries(histories), reactions: crying.snapshot(), quoteSource: { configured: Boolean(customQuoteConfig), name: customQuoteConfig?.name || '', storage: sealedQuoteSource ? 'encrypted' : 'session', error: quoteSourceError }, suspended, refreshing: polling || refreshPending, dark: nativeTheme.shouldUseDarkColors, version: app.getVersion() };
}
function windows() {
  return [dashboard, ...overlays.values()].filter(window => window && !window.isDestroyed());
}
function broadcast(channel = 'desktop:snapshot', value = snapshot()) {
  for (const window of windows()) window.webContents.send(channel, value);
}
function persist() {
  const payload = JSON.stringify({ state, counts, positions, quoteSource: sealedQuoteSource, reactionAudioAt: Number.isFinite(crying.lastAudioAt) ? crying.lastAudioAt : 0 });
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

async function requestText(url, referer) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new TextDecoder('gbk').decode(await response.arrayBuffer());
}
function schedulePoll(delay) {
  clearTimeout(pollTimer);
  if (!state || suspended || quitting) return;
  let interval = state.settings.islandEnabled ? Math.min(state.settings.interval, state.settings.islandInterval) : state.settings.interval;
  if (state.settings.quoteSourceMode === 'custom' && customQuoteConfig) interval = Math.max(interval, customQuoteConfig.interval);
  pollTimer = setTimeout(poll, delay ?? interval * 1000);
}
async function resolveQuotes(codes) {
  const resolved = new Map(), errors = new Map();
  const usingCustom = state.settings.quoteSourceMode === 'custom';
  const config = customQuoteConfig;
  const customCodes = usingCustom ? codes.filter(code => !config || config.markets.includes(marketForSymbol(code))) : [];
  if (config && customCodes.length) {
    const results = await fetchCustomQuotes(customCodes, config);
    for (const [code, result] of results) {
      if (result.quote) resolved.set(code, result.quote);
      else errors.set(code, result.error);
    }
  } else for (const code of customCodes) errors.set(code, '自有行情源需重新配置');

  const publicCodes = codes.filter(code => !customCodes.includes(code) || state.settings.quoteSourceFallback && quoteHealth({ quote: resolved.get(code), received: Date.now() }, state.settings.interval).warning);
  if (!publicCodes.length) return { resolved, errors };
  let primary = '';
  try { primary = await requestText('https://hq.sinajs.cn/list=' + publicCodes.join(','), 'https://finance.sina.com.cn/'); }
  catch (error) { log('WARN', '新浪 ' + error.message); }
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
    } catch (error) { log('WARN', '腾讯 ' + error.message); }
  }
  for (const [code, quote] of publicQuotes) {
    const chosen = newestQuote([resolved.get(code), quote]);
    if (chosen === quote && customCodes.includes(code)) chosen.fallbackFrom = config?.name || '自有行情源';
    resolved.set(code, chosen);
  }
  return { resolved, errors };
}
async function poll() {
  clearTimeout(pollTimer);
  if (!state || suspended || quitting) return;
  if (polling) { refreshPending = true; return; }
  polling = true;
  refreshPending = false;
  broadcast('desktop:refreshing', true);
  const epoch = quoteEpoch;
  const codes = [...new Set([...state.stocks.map(stock => stock.code), state.settings.islandSymbol].filter(Boolean))];
  try {
    const { resolved, errors } = await resolveQuotes(codes);
    if (epoch !== quoteEpoch || suspended || quitting) return;
    for (const code of codes) {
      let quote = resolved.get(code);
      if (quote) {
        const received = Date.now();
        const previous = quotes.get(code)?.quote;
        if (code.startsWith('gb_')) quote = newestQuote([quote, previous]);
        quotes.set(code, { quote, received });
        const sessionChanged = code.startsWith('gb_') && previous && (previous.session !== quote.session || previous.quotedAt && quote.quotedAt && marketClock(code, previous.quotedAt).dateKey !== marketClock(code, quote.quotedAt).dateKey);
        const samples = sessionChanged ? [] : histories.get(code) || [];
        const at = quote.quotedAt ?? received;
        if ((!code.startsWith('gb_') || Number.isFinite(quote.quotedAt)) && (samples.at(-1)?.at !== at || samples.at(-1)?.price !== quote.price)) samples.push({ price: quote.price, at });
        histories.set(code, samples.slice(-60));
        const stock = state.stocks.find(item => item.code === code);
        if (stock) stock.name = quote.name;
      } else quotes.set(code, { ...quotes.get(code), error: errors.get(code) || '更新失败，保留上次报价' });
      crying.update(code, quotes.get(code), state.settings.interval);
    }
    broadcast();
    await persist();
  } finally {
    polling = false;
    refreshPending = !suspended && !quitting && (refreshPending || epoch !== quoteEpoch);
    broadcast('desktop:refreshing', refreshPending);
    schedulePoll(refreshPending ? 0 : undefined);
  }
}

handle('desktop:bootstrap', async (_event, legacy) => {
  if (!state) {
    state = normalizeState(persisted?.state || legacy);
    counts = normalizeCounts(persisted?.counts);
    await persist();
    syncOverlays(); schedulePoll(0);
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
handle('desktop:refresh', () => { schedulePoll(0); return true; });
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
      return { quote, received: Date.now() };
    }
    if (operation !== 'save') throw new Error('无效操作');
    let sealed = null;
    if (config && safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text') sealed = safeStorage.encryptString(JSON.stringify(config)).toString('base64');
    customQuoteConfig = config; sealedQuoteSource = sealed; quoteSourceError = '';
    state.settings.quoteSourceMode = payload.mode === 'custom' ? 'custom' : 'public';
    state.settings.quoteSourceFallback = payload.fallback === true;
  }
  quoteEpoch++;
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
    suspended = true; quoteEpoch++; clearTimeout(pollTimer);
    for (const code of crying.entries.keys()) crying.invalidate(code);
    syncOverlays(); broadcast();
  };
  const resume = () => {
    suspended = false;
    for (const code of crying.entries.keys()) crying.reset(code);
    syncOverlays(); broadcast(); schedulePoll(0);
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
  clearTimeout(pollTimer);
  clearInterval(reactionTimer);
  for (const window of windows()) stopDrag(window);
  if (state) persist().catch(error => log('ERROR', error.message)).finally(() => app.quit());
  else app.quit();
});
