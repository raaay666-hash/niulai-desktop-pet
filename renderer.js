import { $, api, fmt, signed, tone, time, element, makeMotion, catalog, paintIcons, drawSparkline, desktopMood, quotePresentation, quoteHealth } from './renderer-modules/desktop-ui.js';
import { position, currency, displaySymbol, marketSession, normalizeMarketSymbol } from './niulai-android/web/core.mjs';
import { MarketMood } from './niulai-android/web/market-mood.mjs';
import { TapVoice } from './niulai-android/web/tap-voice.mjs';
import { MamaVoice } from './renderer-modules/mama-voice.js';
import desktopState from './main-modules/desktop-state.cjs';
import { EmotionMemory } from './renderer-modules/emotion-memory.js';
import { DailySessionTracker } from './renderer-modules/daily-session.js';
import { AlertTriggerEngine } from './renderer-modules/alert-trigger-engine.js';
import { isQuietOfficeActive } from './renderer-modules/quiet-office.js';
import { buildQuoteSourceSettings } from './renderer-modules/quote-source-settings.js';

let data, tab = 'home', settingsPanel = 'island', positionCode, toastTimer, searchTimer, searchEpoch = 0;
let liveMood = 'loading', previewUntil = 0, motionPreview = 'loading';
let featureCode = '', lastFeatureQuote = 0, wasOpen = false;
let emotion, session, alerts;
let lastMarketScene;
let sourceFormEpoch = 0;
const moods = new MarketMood();
const bull = makeMotion($('bull'));
const wood = makeMotion($('wood-canvas'));
const gallery = makeMotion($('motion-canvas'));
let mini;
wood.state('muyu');
const voice = new TapVoice('assets/audio/niulai-tap.wav');
const mamaVoice = new MamaVoice();
const sounds = { rise: new Audio('assets/audio/niulai.mp3'), fall: new Audio('assets/audio/mama.mp3') };
const titles = {
  home: ['盯盘', ''],
  watchlist: ['自选', '选择一只股票，开始盯盘。'],
  portfolio: ['持仓', '查看和管理本机保存的持仓。'],
  muyu: ['木鱼', '敲一敲，歇一会儿。'],
  settings: ['设置', '调整桌面显示与使用习惯。']
};
const selectedStock = () => data.state.stocks.find(stock => stock.code === data.state.selected);
const settings = () => data.state.settings;
const quiet = () => isQuietOfficeActive(settings().quietOffice);
const currentEntry = () => data.quotes[data.state.selected];
const money = value => settings().private ? '••••' : signed(value);
function toast(message) {
  $('toast').textContent = String(message).replace(/^Error invoking remote method '[^']+': Error: /, '');
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 3500);
}
async function perform(task, done) {
  try {
    const result = await task;
    done?.(result);
    return result;
  } catch (error) { toast(error.message); }
}
function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function storeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('本机存储暂不可用'); }
}
function openDialog(id) {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $(id).showModal();
  syncMotion();
}
function stopAudio() {
  voice.stop();
  mamaVoice.stop();
  for (const sound of Object.values(sounds)) { sound.pause(); sound.currentTime = 0; }
}
function playPetVoice() {
  if (!settings().sound || settings().muted || quiet() || data.suspended) return;
  stopAudio();
  const sound = sounds[currentEntry()?.quote?.changePct < 0 ? 'fall' : 'rise'];
  sound.volume = settings().volume;
  sound.play().catch(() => toast('声音未能播放'));
}
function syncMotion() {
  if (!data) return;
  const visible = !document.hidden && !data.suspended;
  const modal = Boolean(document.querySelector('dialog[open]'));
  const moving = settings().motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const marketScene = visible && tab === 'home' && !modal && moving;
  if (marketScene !== lastMarketScene) { lastMarketScene = marketScene; api.reportScene(marketScene).catch(() => {}); }
  bull.configure(visible && tab === 'home' && !modal, moving);
  wood.configure(visible && tab === 'muyu' && !modal, moving);
  gallery.configure(visible && $('motion-dialog').open, moving);
  mini?.configure(visible && tab === 'settings' && settingsPanel === 'island' && !modal && settings().islandBull, moving && settings().islandMotion);
  if (!visible) stopAudio();
}
function updateMood() {
  if (!data) return;
  const entry = currentEntry();
  const health = quoteHealth(entry, settings().interval);
  liveMood = settings().autoActions ? moods.update(entry?.quote ? { ...entry.quote, received: entry.received } : null, entry?.error || (entry?.quote && health.warning ? health.message : null), Date.now(), settings().interval, data.state.selected) : 'idle';
  liveMood = desktopMood(liveMood, data, data.state.selected);
  const spec = catalog.find(item => item.id === liveMood);
  $('pet-state').textContent = spec.label;
  if (Date.now() > previewUntil) bull.state(liveMood);
  if (settings().muted || quiet() || data.suspended) stopAudio();
  if (!settings().mamaSound) mamaVoice.stop();
  if (!settings().muyuSound) voice.stop();
  syncMotion();
}
function renderPosition(container, stock, entry) {
  container.replaceChildren();
  if (!stock.cost || !stock.shares) {
    container.append(element('p', '尚未设置持仓', 'position-empty'));
    return;
  }
  const result = position(stock, entry?.quote);
  if (!result) {
    container.append(element('p', '持仓已保存，等待行情', 'position-empty'));
    return;
  }
  const grid = element('div', '', 'pnl-grid');
  for (const [label, value] of [['今日盈亏', result.today], ['累计盈亏', result.total]]) {
    const cell = element('div');
    cell.append(element('small', label + ' · ' + currency(stock.code)), element('strong', money(value), settings().private ? '' : tone(value)));
    grid.append(cell);
  }
  container.append(grid);
}
function renderStocks() {
  for (const [id, full] of [['home-stocks', false], ['watch-stocks', true]]) {
    const container = $(id);
    container.replaceChildren();
    for (const stock of data.state.stocks) {
      const entry = data.quotes[stock.code], quote = entry?.quote;
      const presentation = quotePresentation(entry, settings().interval);
      const row = element('div', '', 'stock-row' + (stock.code === data.state.selected ? ' selected' : ''));
      row.title = presentation.detail;
      const button = element('button', '', 'stock-main');
      button.setAttribute('aria-label', '盯盘 ' + stock.name);
      const name = element('div');
      name.append(element('strong', stock.name), element('small', displaySymbol(stock.code) + (presentation.label ? ' · ' + presentation.label : '')));
      const price = element('div', '', 'stock-price ' + tone(quote?.changePct));
      price.append(element('strong', fmt(quote?.price, currency(stock.code) === 'HKD' ? 3 : 2)), element('small', Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : quote ? '涨跌幅未提供' : '等待行情'));
      if (quote && presentation.warning) price.append(element('small', presentation.message));
      button.append(name, price);
      if (full) button.append(element('span', Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : '—', 'stock-pct ' + tone(quote?.changePct)));
      button.onclick = () => selectStock(stock.code);
      row.append(button);
      if (full) {
        const actions = element('div', '', 'row-actions');
        const edit = element('button', '持仓');
        edit.onclick = () => openPosition(stock.code);
        const remove = element('button', '移出');
        remove.setAttribute('aria-label', '移出 ' + stock.name);
        remove.onclick = () => confirmRemove(stock);
        actions.append(edit, remove); row.append(actions);
      }
      container.append(row);
    }
  }
  $('stock-count').textContent = data.state.stocks.length;
}
function renderPortfolio() {
  const container = $('portfolio-list');
  container.replaceChildren();
  const held = data.state.stocks.filter(stock => stock.cost > 0 && stock.shares > 0);
  if (!held.length) container.append(element('p', '暂无持仓记录。可为任一自选设置成本和股数。', 'position-empty'));
  for (const stock of held) {
    const card = element('article', '', 'card portfolio-item');
    const header = element('div', '', 'section-heading');
    const title = element('div');
    title.append(element('h2', stock.name), element('p', displaySymbol(stock.code) + ' · ' + currency(stock.code)));
    const edit = element('button', '编辑 ↗', 'link-button');
    edit.onclick = () => openPosition(stock.code);
    header.append(title, edit);
    const content = element('div'), entry = data.quotes[stock.code];
    renderPosition(content, stock, entry);
    const details = element('div', '', 'holding-details');
    const result = position(stock, entry?.quote);
    details.append(element('span', settings().private ? '成本与股数已隐藏' : `成本 ${fmt(stock.cost, 3)} · ${stock.shares} 股`), element('span', settings().private || !result ? '' : signed(result.percent) + '%', tone(result?.percent)));
    const presentation = quotePresentation(entry, settings().interval);
    card.title = presentation.detail;
    card.append(header, content, details, element('p', presentation.summary, 'footnote'));
    container.append(card);
  }
}
function renderCounts() {
  if (!data) return;
  for (const [id, key] of [['wood-count', 'session'], ['wood-today', 'today'], ['wood-total', 'total']]) $(id).textContent = data.counts[key].toLocaleString('zh-CN');
}
function syncControls() {
  for (const control of document.querySelectorAll('[data-setting]')) {
    if (document.activeElement === control) continue;
    const value = settings()[control.dataset.setting];
    if (control.type === 'checkbox') control.checked = value;
    else control.value = value;
    const output = control.closest('.setting-row')?.querySelector('output');
    if (output) output.value = control.value + (control.dataset.setting === 'volume' ? '' : ' px');
  }
  for (const control of document.querySelectorAll('[data-quiet]')) {
    if (control.type === 'checkbox') control.checked = settings().quietOffice[control.dataset.quiet];
    else if (document.activeElement !== control) control.value = settings().quietOffice[control.dataset.quiet];
  }
  $('privacy-toggle').setAttribute('aria-pressed', String(settings().private));
  $('privacy-toggle').title = settings().private ? '显示持仓金额' : '隐藏持仓金额';
}
function renderSettingsPreview() {
  const preview = $('island-preview');
  if (!preview) return;
  const code = settings().islandSymbol || data.state.selected;
  const quote = data.quotes[code]?.quote;
  const woodMode = settings().islandContent === 'muyu';
  $('preview-name').textContent = woodMode ? '牛来木鱼' : quote?.name || selectedStock().name;
  $('preview-price').textContent = woodMode ? '本轮 ' + data.counts.session : settings().islandPrice ? fmt(quote?.price) : '牛来';
  $('preview-pct').textContent = woodMode ? '+1' : settings().islandPercent && Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : '';
  $('preview-pct').className = tone(quote?.changePct);
  $('preview-canvas').hidden = !settings().islandBull;
  mini?.state(woodMode ? 'muyu' : liveMood);
}
function renderQuoteStatus() {
  if (!data?.state) return;
  const entry = currentEntry(), quote = entry?.quote;
  const presentation = quotePresentation(entry, settings().interval);
  $('session').textContent = presentation.session || marketSession(data.state.selected);
  $('connection').className = 'connection ' + (presentation.warning ? 'error' : quote ? 'ok' : '');
  $('connection').textContent = presentation.summary;
  $('connection').title = presentation.detail;
  $('footer-status').textContent = data.suspended ? '系统休眠，已暂停' : quiet() ? '安静办公中' : quote ? quote.market === 'us' ? presentation.basis : quote.time ? '源时间 ' + quote.time : '行情源未提供成交时间' : '等待行情';
  $('footer-status').title = presentation.detail;
}
function render() {
  if (!data?.state) return;
  const stock = selectedStock(), entry = currentEntry(), quote = entry?.quote;
  document.documentElement.classList.toggle('dark', settings().theme === 'dark' || settings().theme === 'system' && data.dark);
  $('app-version').textContent = data.version;
  $('quote-name').textContent = stock.name;
  $('quote-code').textContent = displaySymbol(stock.code) + ' · ' + currency(stock.code);
  $('price').textContent = fmt(quote?.price, currency(stock.code) === 'HKD' ? 3 : 2);
  $('change').textContent = signed(quote?.change);
  $('percent').textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : '—';
  $('quote-number').className = 'quote-number ' + tone(quote?.changePct);
  renderQuoteStatus();
  renderPosition($('home-position'), stock, entry);
  renderStocks(); renderPortfolio(); renderCounts(); syncControls();
  const samples = data.histories[stock.code] || [];
  $('sample-count').textContent = samples.length < 2 ? '等待采样' : samples.length + ' 个样本';
  $('sample-start').textContent = time(samples[0]?.at);
  $('sample-end').textContent = time(samples.at(-1)?.at);
  drawSparkline($('sparkline'), samples, getComputedStyle(document.documentElement).getPropertyValue(quote?.changePct < 0 ? '--fall' : '--rise'));
  updateMood(); renderSettingsPreview(); processFeatures();
}
function applySnapshot(next) {
  if (!next?.state) return;
  const changedStock = data?.state.selected !== next.state.selected;
  const changedStocks = JSON.stringify(data?.state.stocks.map(stock => stock.code)) !== JSON.stringify(next.state.stocks.map(stock => stock.code));
  data = next;
  if (changedStock) { moods.reset(); featureCode = ''; stopAudio(); }
  if (changedStocks && tab === 'settings') buildSettings();
  render();
}
function changeTab(next) {
  tab = next;
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.classList.toggle('active', button.dataset.tab === tab);
    button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false');
  }
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== 'view-' + tab;
  $('page-title').textContent = titles[tab][0];
  $('page-subtitle').textContent = titles[tab][1];
  $('page-subtitle').hidden = !titles[tab][1];
  if (tab === 'settings') buildSettings();
  window.scrollTo(0, 0);
  syncMotion();
}
function selectStock(code) { perform(api.stock('select', { code })); }
function openPosition(code = data.state.selected) {
  const stock = data.state.stocks.find(item => item.code === code);
  positionCode = code;
  $('position-title').textContent = stock.name;
  $('position-currency').textContent = currency(code);
  $('cost').value = stock.cost || '';
  $('shares').value = stock.shares || '';
  $('clear-position').hidden = !stock.cost && !stock.shares;
  openDialog('position-dialog');
}
function confirmRemove(stock) {
  $('confirm-title').textContent = '移出自选';
  $('confirm-message').textContent = `将「${stock.name}」移出自选${stock.cost && stock.shares ? '，并清除其本机持仓记录' : ''}？`;
  $('confirm-accept').onclick = () => perform(api.stock('remove', { code: stock.code }), () => $('confirm-dialog').close());
  openDialog('confirm-dialog');
}
function openSearch() {
  $('search-input').value = '';
  $('search-results').replaceChildren();
  $('search-message').textContent = '支持 A 股、港股和美股';
  openDialog('search-dialog');
  $('search-input').focus();
}
function searchButton(stock) {
  const button = element('button', '', 'search-result');
  const title = element('div');
  title.append(element('strong', stock.name), element('small', displaySymbol(stock.code)));
  button.append(title, element('span', '＋ 添加', 'link-button'));
  button.onclick = () => addStock(stock.code);
  return button;
}
let adding = false;
async function addStock(code) {
  if (adding) return;
  adding = true;
  $('search-message').textContent = '正在验证行情…';
  try {
    await api.stock('add', { code });
    $('search-dialog').close(); toast('已加入自选');
  } catch (error) { $('search-message').textContent = error.message.replace(/^.*Error: /, ''); }
  finally { adding = false; }
}
async function search() {
  const epoch = ++searchEpoch;
  const query = $('search-input').value.trim();
  $('search-results').replaceChildren();
  if (!query) { $('search-message').textContent = '支持 A 股、港股和美股'; return; }
  const direct = normalizeMarketSymbol(query);
  if (direct) $('search-results').append(searchButton({ code: direct, name: displaySymbol(direct) }));
  $('search-message').textContent = '正在搜索…';
  try {
    const results = await api.search(query);
    if (epoch !== searchEpoch || !$('search-dialog').open) return;
    $('search-results').replaceChildren(...results.map(searchButton));
    if (direct && !results.some(stock => stock.code === direct)) $('search-results').prepend(searchButton({ code: direct, name: displaySymbol(direct) }));
    $('search-message').textContent = results.length || direct ? '选择股票加入自选' : '暂未找到，试试完整代码';
  } catch {
    if (epoch === searchEpoch) $('search-message').textContent = direct ? '名称搜索暂不可用，可按代码验证添加' : '搜索连接失败，请稍后重试';
  }
}

const settingsSections = [['island', '悬浮窗'], ['pet', '桌宠'], ['muyu', '木鱼'], ['widget', '卡片'], ['source', '行情来源'], ['general', '通用'], ['alerts', '提醒与记录'], ['about', '关于']];
function heading(title) { $('settings-content').append(element('h3', title)); }
function settingRow(label, key, type = 'checkbox', options = [], note = '') {
  const row = element('label', '', 'setting-row');
  const title = element('span', label, 'setting-label');
  if (note) title.append(element('small', note));
  const input = document.createElement(type === 'select' ? 'select' : 'input');
  input.dataset.setting = key;
  input.setAttribute('aria-label', label);
  if (type === 'select') {
    for (const [value, name] of options) { const option = element('option', name); option.value = value; input.append(option); }
  } else {
    input.type = type;
    if (type === 'checkbox') input.setAttribute('role', 'switch');
    if (type === 'range') [input.min, input.max, input.step] = options;
  }
  row.append(title, input);
  $('settings-content').append(row);
}
function settingsButton(label, action) {
  const button = element('button', label, 'button secondary');
  button.onclick = action;
  $('settings-content').append(button);
}
function buildSettings() {
  const sourceEpoch = ++sourceFormEpoch;
  mini?.close(); mini = null;
  const container = $('settings-content'); container.replaceChildren();
  $('settings-nav').replaceChildren(...settingsSections.map(([key, label]) => {
    const button = element('button', label, key === settingsPanel ? 'active' : '');
    button.dataset.settingsPanel = key;
    button.onclick = () => { settingsPanel = key; buildSettings(); };
    return button;
  }));
  container.append(element('h2', settingsSections.find(([key]) => key === settingsPanel)[1]));
  const themes = [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']];
  const intervals = [[5, '每 5 秒'], [10, '每 10 秒'], [30, '每 30 秒']];
  const modes = [['market', '股票行情'], ['muyu', '木鱼计数']];
  if (settingsPanel === 'island') {
    const preview = element('div', '', 'settings-preview'); preview.id = 'island-preview';
    const canvas = document.createElement('canvas'); canvas.id = 'preview-canvas'; canvas.width = canvas.height = 100;
    const name = element('small'); name.id = 'preview-name';
    const price = element('b'); price.id = 'preview-price';
    const values = element('div'); values.append(name, price);
    const pct = element('span'); pct.id = 'preview-pct';
    preview.append(canvas, values, pct); container.append(preview);
    mini = makeMotion(canvas, true);
    container.append(element('p', '桌面悬浮行情条。点击展开，滚轮切换自选，拖动左侧手柄调整位置。', 'muted'));
    settingRow('开启悬浮窗', 'islandEnabled');
    settingRow('显示内容', 'islandContent', 'select', modes);
    settingRow('显示股票', 'islandSymbol', 'select', [['', '跟随当前自选'], ...data.state.stocks.map(stock => [stock.code, stock.name])]);
    settingRow('显示价格', 'islandPrice'); settingRow('显示涨跌幅', 'islandPercent');
    settingRow('展开显示持仓', 'islandHoldings', 'checkbox', [], '持仓金额遵循隐私开关');
    settingRow('显示牛来', 'islandBull'); settingRow('岛内动画', 'islandMotion');
    settingRow('显示木鱼计数', 'islandCount');
    settingRow('外观', 'islandTheme', 'select', themes);
    settingRow('宽度', 'islandWidth', 'range', [260, 420, 8]);
    settingRow('行情刷新', 'islandInterval', 'select', intervals);
    settingRow('展开后 10 秒自动收起', 'islandAutoCollapse');
    settingRow('使用主面板时隐藏', 'islandHideInApp');
  } else if (settingsPanel === 'pet') {
    settingRow('开启桌宠', 'petEnabled'); settingRow('桌宠模式', 'petMode', 'select', [['market', '盯盘桌宠'], ['muyu', '牛来木鱼']]);
    settingRow('显示行情卡', 'petQuote'); settingRow('按行情切换动作', 'autoActions');
    settingRow('播放动画', 'motion'); settingRow('点击音效', 'sound');
    settingRow('下跌时播放妈妈音效', 'mamaSound');
    settingRow('音量', 'volume', 'range', [0, 1, .05]);
    settingRow('桌宠大小', 'petScale', 'range', [75, 125, 5]);
    settingRow('使用主面板时隐藏', 'petHideInApp');
    settingsButton('查看动作与姿势', openMotions);
    container.append(element('p', '拖动牛身移动，单击互动，三连击触发不耐烦。顶部按钮打开主面板、收起或关闭桌宠。', 'footnote'));
  } else if (settingsPanel === 'muyu') {
    settingRow('敲击音效', 'muyuSound'); settingRow('牛气＋1 动效', 'muyuEffects'); settingRow('显示悬浮计数', 'muyuCount');
    settingsButton('打开木鱼', () => changeTab('muyu'));
    container.append(element('p', '所有窗口共用本轮、今日和累计计数。快速连点保留每次计数，动作按节拍衔接。', 'footnote'));
  } else if (settingsPanel === 'widget') {
    container.append(element('p', '独立的桌面悬浮卡片，支持桌宠、行情、持仓与休息四个场景。', 'muted'));
    settingRow('开启桌面卡片', 'widgetEnabled');
    settingRow('卡片外观', 'widgetTheme', 'select', themes);
    settingRow('显示最近报价曲线', 'widgetSparkline'); settingRow('显示牛来', 'widgetBull');
    settingRow('隐藏持仓金额', 'private'); settingRow('跟随常规交易时段切换场景', 'smartScene');
    container.append(element('p', '行情来自应用内同一份数据。卡片标记获取时间，关闭程序后停止刷新。', 'footnote'));
  } else if (settingsPanel === 'source') {
    buildQuoteSourceSettings(container, { api, toast, onSaved: buildSettings, isCurrent: () => sourceEpoch === sourceFormEpoch && settingsPanel === 'source' });
  } else if (settingsPanel === 'general') {
    settingRow('应用外观', 'theme', 'select', themes);
    settingRow('静音', 'muted');
    settingRow('行情刷新', 'interval', 'select', intervals);
    settingRow('播放动画', 'motion'); settingRow('隐藏持仓金额', 'private');
    heading('使用模式');
    const presets = element('div', '', 'preset-buttons');
    for (const [name, values] of [
      ['静音', { muted: true, motion: true, interval: 30, islandInterval: 30 }],
      ['标准', { muted: false, motion: true, interval: 10, islandInterval: 10 }],
      ['省电', { muted: true, motion: false, interval: 30, islandInterval: 30 }]
    ]) { const button = element('button', name); button.onclick = () => perform(api.settings(values), () => toast('已切换为' + name)); presets.append(button); }
    container.append(presets);
    settingsButton('所有悬浮窗口归位', () => perform(api.window('reset'), () => toast('悬浮窗口已归位')));
    heading('关闭程序');
    container.append(element('p', '关闭主面板会收起到托盘，桌宠与行情继续运行。可从托盘菜单退出。', 'muted'));
    settingsButton('退出牛来', () => {
      $('confirm-title').textContent = '退出牛来'; $('confirm-message').textContent = '退出后，桌宠与行情刷新将一同结束。';
      $('confirm-accept').onclick = () => api.window('quit'); openDialog('confirm-dialog');
    });
  } else if (settingsPanel === 'alerts') {
    buildFeatureSettings();
  } else {
    container.append(element('p', '牛来盯盘 Windows · ' + data.version, 'muted'));
    for (const paragraph of [
      '支持 A 股、港股和美股行情，默认使用新浪与腾讯接口，也可在“行情来源”中接入自己的 HTTP JSON 接口。美股区分盘前、常规和盘后报价。行情可能延迟或中断，交易时段按周历估算，节假日与停牌以交易所公告为准。',
      '自选、持仓、木鱼计数和设置保存在这台电脑。查询词和股票代码发送给行情提供方，成本、股数和计数仅在本机使用。',
      'Ctrl + K 搜索股票，Ctrl + 1–4 切换页面，Esc 关闭弹窗。木鱼页面支持空格敲击。'
    ]) container.append(element('p', paragraph, 'footnote'));
  }
  syncControls(); renderSettingsPreview(); syncMotion();
}

function buildFeatureSettings() {
  settingRow('情绪记忆', 'emotionMemory'); settingRow('收盘总结', 'closeSummary');
  const quietRow = element('label', '', 'setting-row');
  const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.dataset.quiet = 'enabled'; enabled.setAttribute('role', 'switch');
  quietRow.append(element('span', '安静办公'), enabled); $('settings-content').append(quietRow);
  const times = element('div', '', 'quiet-times');
  for (const key of ['start', 'end']) { const input = document.createElement('input'); input.type = 'time'; input.dataset.quiet = key; input.setAttribute('aria-label', key === 'start' ? '安静开始时间' : '安静结束时间'); times.append(input); }
  $('settings-content').append(times, element('p', '安静时段按北京时间执行，点击与提醒声音静音。', 'footnote'));
  heading('当前盯盘标的提醒');
  const form = element('form', '', 'rule-form');
  const type = document.createElement('select'); type.id = 'rule-type'; type.setAttribute('aria-label', '提醒类型');
  for (const [value, label] of [['price', '价格'], ['change_pct', '涨跌幅 %'], ['pnl_amount', '累计盈亏'], ['cost_return', '回到成本'], ['rapid_rise', '快速拉升'], ['rapid_fall', '快速跳水']]) { const option = element('option', label); option.value = value; type.append(option); }
  const comparator = document.createElement('select'); comparator.id = 'rule-comparator'; comparator.setAttribute('aria-label', '提醒方向');
  for (const [value, label] of [['gte', '达到'], ['lte', '跌至']]) { const option = element('option', label); option.value = value; comparator.append(option); }
  const value = document.createElement('input'); value.id = 'rule-value'; value.type = 'number'; value.step = 'any'; value.value = '0'; value.setAttribute('aria-label', '提醒阈值');
  form.append(type, comparator, value);
  const soundLabel = element('label', '', 'muted'); const sound = document.createElement('input'); sound.type = 'checkbox'; soundLabel.append(sound, ' 提醒声音');
  const add = element('button', '添加提醒', 'button primary'); add.type = 'submit'; form.append(soundLabel, add);
  form.onsubmit = event => {
    event.preventDefault();
    if (data.state.alerts.length >= 20) { toast('提醒最多 20 条'); return; }
    perform(api.alerts([...data.state.alerts, { id: crypto.randomUUID(), type: type.value, comparator: comparator.value, value: Number(value.value), presentation: '2d', sound: sound.checked, cooldownMs: 60000 }]), () => buildSettings());
  };
  $('settings-content').append(form);
  const labels = { price: '价格', change_pct: '涨跌幅', pnl_amount: '累计盈亏', cost_return: '回到成本', rapid_rise: '快速拉升', rapid_fall: '快速跳水' };
  for (const rule of data.state.alerts) {
    const row = element('div', '', 'alert-rule');
    const label = labels[rule.type] + (['price', 'change_pct', 'pnl_amount'].includes(rule.type) ? ` ${rule.comparator === 'lte' ? '≤' : '≥'} ${rule.value}` : '');
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = rule.enabled !== false; toggle.setAttribute('aria-label', '启用' + label);
    toggle.onchange = () => perform(api.alerts(data.state.alerts.map(item => item.id === rule.id ? { ...item, enabled: toggle.checked } : item)));
    const remove = element('button', '删除', 'link-button'); remove.onclick = () => perform(api.alerts(data.state.alerts.filter(item => item.id !== rule.id)), () => buildSettings());
    row.append(toggle, element('span', label), remove); $('settings-content').append(row);
  }
  $('settings-content').append(element('p', '仅对当前盯盘标的生效。阈值穿越后提醒，每条至少间隔 60 秒。盈亏金额采用标的原币。', 'footnote'));
}
function processFeatures() {
  const code = data.state.selected, entry = currentEntry();
  if (featureCode !== code) {
    featureCode = code; lastFeatureQuote = 0; wasOpen = false;
    emotion = new EmotionMemory({ state: readJson('niulai:emotion-memory-v1:' + code) || readJson('niulai:emotion-memory-v1') });
    session = new DailySessionTracker({ state: readJson('niulai:daily-session-v1:' + code) });
    alerts = new AlertTriggerEngine({ triggers: data.state.alerts });
  }
  emotion.configure({ enabled: settings().emotionMemory }); alerts.configure(data.state.alerts);
  const marketOpen = marketSession(code) === '常规交易时段';
  const sampleKey = [entry?.quote?.quotedAt ?? entry?.received, entry?.quote?.price, entry?.quote?.changePct].join(':');
  if (entry?.quote && quoteHealth(entry, settings().interval).actionable && sampleKey !== lastFeatureQuote) {
    lastFeatureQuote = sampleKey;
    const result = position(selectedStock(), entry.quote);
    const held = result ? { totalPnl: result.total, todayPnl: result.today, totalPct: result.percent, shares: selectedStock().shares } : null;
    const events = liveMood === 'surge' ? [{ type: 'RAPID_RISE' }] : liveMood === 'drop' ? [{ type: 'RAPID_FALL' }] : [];
    emotion.update({ quote: entry.quote, position: held, marketOpen, events });
    session.update({ quote: entry.quote, position: held, marketOpen });
    storeJson('niulai:emotion-memory-v1:' + code, emotion.snapshot());
    storeJson('niulai:daily-session-v1:' + code, session.snapshot());
    for (const hit of alerts.evaluate({ quote: entry.quote, position: held, events })) {
      const label = hit.type === 'pnl_amount' ? `累计盈亏${hit.comparator === 'lte' ? '跌至' : '达到'} ${currency(code)} ${fmt(hit.value)}` : hit.label;
      toast(selectedStock().name + ' · ' + label);
      if (document.hidden && !data.suspended) api.notify(selectedStock().name + ' · ' + label).catch(() => {});
      if (hit.presentation === '2d') api.window('preview', hit.direction > 0 ? 'clap' : 'cover');
      if (hit.sound && !settings().muted && !quiet() && !data.suspended) {
        stopAudio(); const sound = sounds[hit.direction > 0 ? 'rise' : 'fall']; sound.volume = settings().volume; sound.play().catch(() => {});
      }
    }
    if (settings().emotionMemory && Date.now() > previewUntil) $('pet-message').textContent = emotion.quips(marketOpen ? 'flat' : 'closed')[0];
  }
  if (wasOpen && !marketOpen && settings().closeSummary && !session.snapshot().shown) {
    const summary = session.summary(emotion.snapshot().label);
    if (summary) {
      const content = $('summary-content'); content.replaceChildren(element('p', summary.day + ' · ' + selectedStock().name, 'muted'));
      for (const [label, value] of [['收盘涨跌幅', signed(summary.changePct) + '%'], ['今日盈亏', money(summary.todayPnl)], ['最大浮盈', money(summary.maxFloatingProfit)], ['最大回撤', money(summary.maxDrawdown)]]) content.append(element('p', label + '　' + value, 'footnote'));
      content.append(element('p', summary.comment, 'footnote'));
      session.markShown(); storeJson('niulai:daily-session-v1:' + code, session.snapshot()); openDialog('summary-dialog');
    }
  }
  wasOpen = marketOpen;
}

function openMotions() { openDialog('motion-dialog'); previewMotion(liveMood); }
function previewMotion(id) {
  $('motion-dialog').scrollTop = 0;
  motionPreview = id;
  const spec = catalog.find(item => item.id === id);
  $('motion-name').textContent = spec.label; $('motion-action').textContent = spec.action;
  gallery.replay(id);
  for (const button of document.querySelectorAll('[data-motion]')) button.classList.toggle('selected', button.dataset.motion === id);
}
function knock() { perform(api.knock()); }
api.onKnock(({ counts, reset }) => {
  if (!data) return;
  data.counts = counts; renderCounts(); renderSettingsPreview();
  if (!reset) {
    wood.replay('muyu');
    if (tab === 'muyu' && !document.hidden && settings().motion && settings().muyuEffects) {
      const layer = $('wood-feedback');
      if (layer.children.length >= 6) layer.firstChild.remove();
      const feedback = element('span', '牛气＋1 📈', 'wood-pulse'); layer.append(feedback);
      setTimeout(() => feedback.remove(), 760);
    }
  }
});
api.onSnapshot(applySnapshot);
api.onMamaVoice(({ volume }) => {
  if (data && lastMarketScene && settings().mamaSound && !settings().muted && !quiet()) {
    stopAudio(); mamaVoice.play(volume).catch(() => {});
  }
});
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => changeTab(button.dataset.tab);
document.querySelector('.brand').onclick = event => { event.preventDefault(); changeTab('home'); };
for (const button of document.querySelectorAll('.add-stock')) button.onclick = openSearch;
$('all-stocks').onclick = $('select-stock').onclick = () => changeTab('watchlist');
$('refresh').onclick = () => { perform(api.refresh()); toast('正在刷新行情'); };
$('privacy-toggle').onclick = () => perform(api.settings({ private: !settings().private }));
$('hide-dashboard').onclick = () => perform(api.window('hide'));
$('open-quote').onclick = () => perform(api.window('external'));
$('edit-position').onclick = $('portfolio-edit').onclick = () => openPosition();
$('reset-overlays').onclick = () => perform(api.window('reset'), () => toast('悬浮窗口已归位'));
$('motions-open').onclick = openMotions;
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
document.addEventListener('change', event => {
  const control = event.target;
  if (control.dataset.setting) {
    const key = control.dataset.setting;
    const value = control.type === 'checkbox' ? control.checked : control.type === 'range' || ['interval', 'islandInterval'].includes(key) ? Number(control.value) : control.value;
    perform(api.settings({ [key]: value }));
  }
  if (control.dataset.quiet) {
    const value = control.type === 'checkbox' ? control.checked : control.value;
    perform(api.settings({ quietOffice: { ...settings().quietOffice, [control.dataset.quiet]: value } }));
  }
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.close-dialog').onclick = () => dialog.close();
  dialog.addEventListener('close', syncMotion);
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
}
$('position-form').onsubmit = event => {
  event.preventDefault();
  perform(api.stock('position', { code: positionCode, cost: Number($('cost').value), shares: Number($('shares').value) }), () => { $('position-dialog').close(); toast('持仓已保存'); });
};
$('clear-position').onclick = () => perform(api.stock('position', { code: positionCode, cost: 0, shares: 0 }), () => $('position-dialog').close());
$('search-form').onsubmit = event => { event.preventDefault(); clearTimeout(searchTimer); search(); };
$('search-input').oninput = () => { ++searchEpoch; clearTimeout(searchTimer); searchTimer = setTimeout(search, 350); };
$('search-dialog').addEventListener('close', () => { ++searchEpoch; clearTimeout(searchTimer); });
for (const button of document.querySelectorAll('[data-code]')) button.onclick = () => addStock(button.dataset.code);
let taps = [];
$('pet').onclick = () => {
  const now = Date.now(); taps = taps.filter(at => now - at < 1150); taps.push(now);
  const id = taps.length >= 3 ? 'annoyed' : 'wave';
  if (id === 'annoyed') taps = [];
  bull.replay(id); previewUntil = now + 3200; playPetVoice();
};
$('wood-tap').onclick = () => { knock(); if (settings().muyuSound && !settings().muted && !quiet()) { voice.volume = settings().volume; voice.play().catch(() => toast('声音未能播放')); } };
$('wood-round').onclick = () => perform(api.newRound());
$('wood-floating').onclick = () => perform(api.settings({ petEnabled: true, petMode: 'muyu' }), () => toast('悬浮木鱼已开启'));
for (const spec of catalog) {
  const button = element('button', '', 'motion-option'); button.dataset.motion = spec.id;
  button.append(element('strong', spec.label), element('small', spec.action));
  button.onclick = () => previewMotion(spec.id); $('motion-list').append(button);
}
$('preview-floating').onclick = () => perform(api.window('preview', motionPreview));
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
  if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key)) { event.preventDefault(); changeTab(['home', 'watchlist', 'portfolio', 'muyu'][Number(event.key) - 1]); return; }
  if (event.code === 'Space' && tab === 'muyu' && !document.querySelector('dialog[open]') && !event.target.closest('input, select, button, textarea')) { event.preventDefault(); $('wood-tap').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); syncMotion(); });
window.addEventListener('online', () => perform(api.refresh()));
paintIcons();
const legacyValues = {};
for (const key of ['niulai:pet-settings', 'niulai:saved-stocks-v1', 'niulai:portfolio', 'niulai:selected-symbol', 'niulai:alert-triggers-v1']) {
  try { legacyValues[key] = localStorage.getItem(key); } catch { }
}
api.bootstrap(desktopState.migrateLegacy(legacyValues)).then(next => {
  applySnapshot(next);
  setInterval(() => { renderQuoteStatus(); updateMood(); processFeatures(); }, 1000);
  window.__NIULAI_RENDERER_READY__ = true;
}).catch(error => toast('启动失败 · ' + error.message));
