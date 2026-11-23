import { $, api, marketPrice, signed, tone, time, setText, setAttributeValue, element, makeMotion, catalog, drawSparkline, desktopMood, quotePresentation, quoteHealth } from './renderer-modules/desktop-ui.js';
import { position, currency, displaySymbol, marketSession } from './niulai-android/web/core.mjs';
import { MarketMood } from './niulai-android/web/market-mood.mjs';
import { TapVoice } from './niulai-android/web/tap-voice.mjs';
import { MamaVoice } from './renderer-modules/mama-voice.js';
import { isQuietOfficeActive } from './renderer-modules/quiet-office.js';
import { applyAppearance } from './renderer-modules/system-appearance.js';

const kind = new URLSearchParams(location.search).get('kind');
const shell = $('overlay'); shell.dataset.kind = kind;
document.title = '牛来' + { pet: '桌宠', island: '悬浮窗', widget: '桌面卡片' }[kind];
const bull = makeMotion($('pet-canvas'));
const mini = makeMotion($('mini-canvas'), true);
const moods = new MarketMood();
const voice = new TapVoice('assets/audio/niulai-tap.wav');
const mamaVoice = new MamaVoice();
const sounds = { rise: new Audio('assets/audio/niulai.mp3'), fall: new Audio('assets/audio/mama.mp3') };
let data, collapsed = kind === 'island', collapseTimer, previewUntil = 0, wheelAt = 0, manualSceneUntil = 0, calmEnd = 0;
let taps = [], pointer, pointerStart, dragged = false, lastMarketScene;
let changingStock = false, changingCollapse = false;
function code() { return kind === 'island' && data.state.settings.islandSymbol || data.state.selected; }
function settings() { return data.state.settings; }
function entry() { return data.quotes[code()]; }
function quoteInterval() { return kind === 'island' ? settings().islandInterval : settings().interval; }
function isWood() { return (kind === 'island' ? settings().islandContent : settings().petMode) === 'muyu' && kind !== 'widget'; }
function setHidden(node, hidden) { if (node.hidden !== hidden) node.hidden = hidden; }
function stopAudio() { voice.stop(); mamaVoice.stop(); for (const sound of Object.values(sounds)) { sound.pause(); sound.currentTime = 0; } }
function syncMotion() {
  if (!data) return;
  const visible = !document.hidden && !data.suspended;
  const moving = settings().motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const marketScene = visible && moving && !isWood() && (kind === 'pet' || kind === 'widget' && settings().scene === 0 && settings().widgetBull || kind === 'island' && settings().islandBull && settings().islandMotion);
  if (marketScene !== lastMarketScene) { lastMarketScene = marketScene; api.reportScene(marketScene).catch(() => {}); }
  bull.configure(visible && kind !== 'island' && (kind === 'pet' || settings().scene === 0 && settings().widgetBull), moving);
  mini.configure(visible && kind === 'island' && settings().islandBull, moving && settings().islandMotion);
  if (!visible || settings().muted || isQuietOfficeActive(settings().quietOffice)) stopAudio();
  if (!settings().mamaSound) mamaVoice.stop();
}
function renderCounts() {
  const session = data.counts.session.toLocaleString('zh-CN');
  const totals = `今日 ${data.counts.today.toLocaleString('zh-CN')} · 累计 ${data.counts.total.toLocaleString('zh-CN')}`;
  setText($('overlay-count-value'), session);
  setText($('overlay-total'), totals);
  if (kind === 'island' && isWood()) {
    setText($('compact-price'), session);
    setText($('island-position'), settings().islandCount ? totals : '');
    setAttributeValue($('island-position'), 'title', settings().islandCount ? totals : '');
    setAttributeValue($('compact-island'), 'aria-label', settings().islandCount ? '敲木鱼 · 本轮 ' + session : '敲木鱼');
  }
}
function renderQuoteStatus(record, presentation) {
  const wood = kind === 'island' && isWood();
  const stale = !wood && (record?.error || record?.quote && presentation.warning);
  setText($('overlay-status'), wood ? '点击木鱼敲击' : presentation.compact);
  setAttributeValue($('overlay-status'), 'title', wood ? '点击或按空格敲击木鱼' : presentation.detail);
  shell.classList.toggle('quote-warning', Boolean(stale));
  if (kind !== 'island') return;
  if (wood) {
    setText($('compact-meta'), settings().islandCount ? '本轮敲击' : '点击敲击');
    return;
  }
  const status = record?.error ? '更新失败' : !record?.quote ? '等待行情' : presentation.warning ? '报价待更新' : record.quote.fallbackFrom ? '公共行情回退' : '';
  setText($('compact-meta'), [status, displaySymbol(code())].filter(Boolean).join(' · '));
}
function renderIsland(stock, quote, presentation, name, price, percent) {
  const wood = isWood(), pinned = Boolean(settings().islandSymbol);
  const compact = $('compact-island');
  setHidden($('expand-island'), !collapsed);
  const collapse = $('collapse-overlay');
  const collapseLabel = collapsed ? '展开悬浮窗' : '收起悬浮窗';
  setAttributeValue(collapse, 'aria-label', collapseLabel);
  setAttributeValue(collapse, 'title', collapseLabel);
  setAttributeValue(collapse, 'aria-expanded', String(!collapsed));
  setAttributeValue(collapse, 'aria-controls', 'overlay-content');
  setText($('compact-name'), wood ? '牛来木鱼' : name + (presentation.label ? ' · ' + presentation.label : ''));
  setHidden($('compact-price'), wood ? !settings().islandCount : !settings().islandPrice);
  setHidden($('compact-percent'), wood || !settings().islandPercent);
  if (wood) {
    compact.removeAttribute('aria-expanded');
    compact.removeAttribute('aria-controls');
    setAttributeValue(compact, 'title', '敲木鱼');
  } else {
    setText($('compact-price'), price);
    setText($('compact-percent'), percent);
    setAttributeValue(compact, 'aria-expanded', String(!collapsed));
    setAttributeValue(compact, 'aria-controls', 'overlay-content');
    setAttributeValue(compact, 'title', presentation.detail);
    setAttributeValue(compact, 'aria-label', [collapseLabel, name, settings().islandPrice ? price : '',
      settings().islandPercent ? percent : '', $('compact-meta').textContent, pinned ? '已固定标的' : '跟随主面板'].filter(Boolean).join(' · '));
  }
  setHidden($('island-expanded').querySelector('.island-navigation'), wood);
  if (collapsed || wood) return;
  const stocks = data.state.stocks;
  const index = stocks.findIndex(item => item.code === code());
  const disableNavigation = stocks.length < 2 && index >= 0;
  for (const id of ['previous-stock', 'next-stock']) if ($(id).disabled !== disableNavigation) $(id).disabled = disableNavigation;
  setText($('island-stock-index'), index < 0 ? '—' : `${index + 1} / ${stocks.length}`);
  const pin = $('pin-island');
  setText(pin, pinned ? '取消固定' : '固定标的');
  setAttributeValue(pin, 'aria-pressed', String(pinned));
  setAttributeValue(pin, 'title', pinned ? '取消固定，跟随主面板' : '固定当前标的');
  let positionText = presentation.session || marketSession(code());
  if (settings().islandHoldings) {
    const held = stock && position(stock, quote);
    if (!stock?.cost || !stock.shares) positionText = '尚未设置持仓';
    else if (settings().private) positionText = '持仓金额已隐藏';
    else positionText = held ? `今日 ${signed(held.today)} · 累计 ${signed(held.total)} ${currency(code())}` : '持仓已保存，等待行情';
  }
  setText($('island-position'), positionText);
  setAttributeValue($('island-position'), 'title', positionText);
}
function render() {
  if (!data?.state) return;
  if (document.hidden) { syncMotion(); return; }
  const record = entry(), quote = record?.quote, stock = data.state.stocks.find(item => item.code === code());
  const presentation = quotePresentation(record, quoteInterval());
  const theme = kind === 'widget' ? settings().widgetTheme : kind === 'island' ? settings().islandTheme : settings().theme;
  applyAppearance(data, theme);
  shell.classList.toggle('collapsed', collapsed);
  shell.classList.toggle('wood-mode', isWood());
  setText($('overlay-title'), isWood() ? '牛来木鱼' : { pet: '牛来桌宠', widget: '牛来卡片', island: '悬浮窗' }[kind]);
  const name = quote?.name || stock?.name || displaySymbol(code());
  setText($('overlay-name'), name);
  setText($('overlay-code'), displaySymbol(code()) + ' · ' + currency(code()) + (presentation.label ? ' · ' + presentation.label : ''));
  const price = marketPrice(quote?.price, code());
  const percent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : '—';
  setText($('overlay-price'), price);
  setText($('overlay-percent'), percent);
  setAttributeValue($('overlay-numbers'), 'class', tone(quote?.changePct));
  setAttributeValue($('compact-percent'), 'class', tone(quote?.changePct));
  renderQuoteStatus(record, presentation);
  if (kind === 'island') renderIsland(stock, quote, presentation, name, price, percent);
  setHidden($('compact-island'), kind !== 'island');
  setHidden($('overlay-content'), kind === 'island' && collapsed);
  setHidden($('mini-canvas'), !settings().islandBull);
  setHidden($('scene-tabs'), kind !== 'widget');
  setHidden($('overlay-quote'), isWood() || kind === 'pet' && !settings().petQuote);
  setHidden($('overlay-count'), kind === 'island' || !isWood() || !settings().muyuCount);
  setHidden($('island-expanded'), kind !== 'island' || collapsed);
  setHidden($('overlay-pet'), kind === 'island' || kind === 'widget' && (settings().scene !== 0 || !settings().widgetBull));
  for (const [id, scene] of [['market-scene', 1], ['position-scene', 2], ['calm-scene', 3]]) setHidden($(id), kind !== 'widget' || settings().scene !== scene);
  for (const button of document.querySelectorAll('[data-scene]')) {
    button.classList.toggle('active', Number(button.dataset.scene) === settings().scene);
    setAttributeValue(button, 'aria-pressed', String(Number(button.dataset.scene) === settings().scene));
  }
  if (kind === 'widget' && settings().scene === 2) {
    const held = stock && position(stock, quote);
    const positionContainer = $('overlay-position'); positionContainer.replaceChildren();
    if (held) {
      const grid = element('div', '', 'pnl-grid');
      for (const [label, value] of [['今日盈亏', held.today], ['累计盈亏', held.total]]) {
        const cell = element('div'); cell.append(element('small', label + ' · ' + currency(code())), element('strong', settings().private ? '••••' : signed(value), settings().private ? '' : tone(value))); grid.append(cell);
      }
      positionContainer.append(grid);
    } else positionContainer.append(element('p', '尚未设置持仓', 'position-empty'));
  }
  if (kind === 'widget' && settings().scene === 1) {
    const samples = data.histories[code()] || [];
    setHidden($('overlay-chart'), !settings().widgetSparkline);
    if (settings().widgetSparkline) drawSparkline($('overlay-chart'), samples, getComputedStyle(document.documentElement).getPropertyValue(quote?.changePct < 0 ? '--fall' : '--rise'));
    setText($('chart-description'), samples.length > 1 ? `本次运行 ${samples.length} 个样本 · ${time(samples[0].at)}–${time(samples.at(-1).at)}` : '本次运行采样，等待更多报价');
  }
  renderCounts(); updateMood();
}
function updateMood() {
  if (!data) return;
  const record = entry();
  const health = quoteHealth(record, quoteInterval());
  const base = isWood() ? 'muyu' : settings().autoActions ? moods.update(record?.quote ? { ...record.quote, received: record.received } : null, record?.error || (record?.quote && health.warning ? health.message : null), Date.now(), quoteInterval(), code()) : 'idle';
  const mood = isWood() ? base : desktopMood(base, data, code());
  if (Date.now() > previewUntil) { bull.state(mood); mini.state(mood); }
  syncMotion();
  if (kind === 'widget' && settings().scene === 3 && calmEnd) {
    const remaining = Math.max(0, Math.ceil((calmEnd - Date.now()) / 1000));
    $('calm-time').textContent = remaining ? remaining + ' 秒' : '休息结束';
    if (!remaining) { calmEnd = 0; $('calm-start').textContent = '再休息一会儿'; }
  }
  if (kind === 'widget' && settings().smartScene && Date.now() > manualSceneUntil) {
    const recommended = marketSession(code()) === '常规交易时段' ? 1 : 0;
    if (settings().scene !== recommended) api.settings({ scene: recommended });
  }
}
async function changeStock(task) {
  if (changingStock) return;
  changingStock = true;
  try { await task(); }
  catch (error) { setText($('overlay-status'), error.message); }
  finally { changingStock = false; }
}
function switchStock(direction) {
  if (!data || isWood()) return;
  const stocks = data.state.stocks;
  const index = stocks.findIndex(stock => stock.code === code());
  if (stocks.length < 2 && index >= 0) return;
  const nextIndex = index < 0 ? (direction < 0 ? stocks.length - 1 : 0) : (index + direction + stocks.length) % stocks.length;
  const next = stocks[nextIndex]?.code;
  if (!next) return;
  const pinned = kind === 'island' && settings().islandSymbol;
  void changeStock(() => pinned ? api.settings({ islandSymbol: next }) : api.stock('select', { code: next }));
  autoCollapse();
}
function togglePin() {
  if (!data || kind !== 'island' || isWood()) return;
  const target = settings().islandSymbol ? '' : code();
  void changeStock(() => api.settings({ islandSymbol: target }));
  autoCollapse();
}
async function toggleCollapse() {
  if (!data || changingCollapse) return;
  changingCollapse = true;
  try { await api.window('collapse'); }
  catch (error) { setText($('overlay-status'), error.message); }
  finally { changingCollapse = false; }
}
async function interact() {
  if (!data || data.suspended) return;
  const quiet = isQuietOfficeActive(settings().quietOffice);
  if (isWood()) {
    api.knock().catch(error => $('overlay-status').textContent = error.message);
    if (settings().muyuSound && !settings().muted && !quiet) { voice.volume = settings().volume; voice.play().catch(() => {}); }
    return;
  }
  const now = Date.now(); taps = taps.filter(at => now - at < 1150); taps.push(now);
  const mood = taps.length >= 3 ? 'annoyed' : 'wave';
  if (mood === 'annoyed') taps = [];
  bull.interact(mood); previewUntil = now + 3200;
  if (settings().sound && !settings().muted && !quiet) {
    stopAudio(); const sound = sounds[entry()?.quote?.changePct < 0 ? 'fall' : 'rise']; sound.volume = settings().volume; sound.play().catch(() => {});
  }
}
function autoCollapse() {
  clearTimeout(collapseTimer);
  if (kind === 'island' && data && !collapsed && settings().islandAutoCollapse) {
    collapseTimer = setTimeout(() => { if (!collapsed) void toggleCollapse(); }, 10000);
  }
}
api.onSnapshot(next => {
  const collapseChanged = data?.state.settings.islandAutoCollapse !== next.state.settings.islandAutoCollapse;
  data = next;
  render();
  if (collapseChanged) autoCollapse();
});
api.onMamaVoice(({ volume }) => {
  if (data && lastMarketScene && settings().mamaSound && !settings().muted && !isQuietOfficeActive(settings().quietOffice)) {
    stopAudio(); mamaVoice.play(volume).catch(() => {});
  }
});
api.onCollapsed(value => {
  const focused = document.activeElement;
  const restoreFocus = kind === 'island' && (value
    ? $('overlay-content').contains(focused) || focused?.closest('.overlay-window-buttons')
    : focused === $('expand-island'));
  collapsed = value;
  render();
  if (restoreFocus) $('compact-island').focus({ preventScroll: true });
  autoCollapse();
});
api.onPreview(id => {
  if (!catalog.some(spec => spec.id === id)) return;
  previewUntil = Date.now() + 6000; bull.replay(id); mini.replay(id);
});
api.onKnock(({ counts, reset }) => {
  if (!data) return;
  data.counts = counts; renderCounts();
  if (isWood() && !reset) {
    bull.replay('muyu'); mini.replay('muyu');
    if (settings().muyuEffects && settings().motion && kind === 'pet') {
      const layer = $('overlay-feedback'); if (layer.children.length >= 6) layer.firstChild.remove();
      const pulse = element('span', '牛气＋1 📈', 'wood-pulse'); layer.append(pulse); setTimeout(() => pulse.remove(), 760);
    }
  }
});
$('open-dashboard').onclick = $('edit-position').onclick = () => api.window('dashboard');
$('close-overlay').onclick = () => api.window('close');
$('expand-island').onclick = $('collapse-overlay').onclick = toggleCollapse;
$('compact-island').onclick = () => { if (data && isWood()) { interact(); autoCollapse(); } else void toggleCollapse(); };
$('compact-island').ondblclick = () => { if (data && isWood()) void toggleCollapse(); };
$('previous-stock').onclick = () => switchStock(-1);
$('next-stock').onclick = () => switchStock(1);
$('pin-island').onclick = togglePin;
$('island-expanded').addEventListener('focusin', autoCollapse);
shell.addEventListener('keydown', event => {
  if (kind !== 'island' || !data || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape' && !collapsed) { event.preventDefault(); void toggleCollapse(); }
  else if (!isWood() && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    switchStock(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
shell.addEventListener('wheel', event => {
  if (!data || isWood() || !event.deltaY) return;
  event.preventDefault();
  if (Date.now() - wheelAt < 350) return;
  wheelAt = Date.now(); switchStock(event.deltaY > 0 ? 1 : -1);
}, { passive: false });
function beginPointer(event) {
  if (event.button !== 0) return;
  pointer = event.pointerId; pointerStart = { x: event.screenX, y: event.screenY }; dragged = false;
  event.currentTarget.setPointerCapture(pointer);
}
function movePointer(event) {
  if (pointer !== event.pointerId || kind !== 'pet' && event.currentTarget.id !== 'drag-handle') return;
  if (!dragged && Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 4) { dragged = true; api.beginDrag(pointerStart); }
}
function endPointer(event) {
  if (pointer !== event.pointerId) return;
  pointer = null;
  api.endDrag();
  if (!dragged && event.currentTarget.id === 'overlay-pet') interact();
}
for (const target of [$('drag-handle'), $('overlay-pet')]) {
  target.onpointerdown = beginPointer; target.onpointermove = movePointer; target.onpointerup = endPointer;
  target.onpointercancel = () => { pointer = null; api.endDrag(); };
  target.onlostpointercapture = () => { if (pointer !== null) { pointer = null; api.endDrag(); } };
}
$('overlay-pet').addEventListener('keydown', event => { if (event.code === 'Space' || event.key === 'Enter') { event.preventDefault(); interact(); } });
for (const button of document.querySelectorAll('[data-scene]')) button.onclick = () => {
  manualSceneUntil = Date.now() + 3600000; api.settings({ scene: Number(button.dataset.scene) });
};
$('calm-start').onclick = () => { calmEnd = Date.now() + 20000; $('calm-time').textContent = '20 秒'; $('calm-start').textContent = '重新计时'; };
document.addEventListener('visibilitychange', render);
api.bootstrap().then(next => {
  data = next;
  render();
  setInterval(() => { if (kind === 'island' && !document.hidden) render(); else updateMood(); }, 1000);
  window.__NIULAI_RENDERER_READY__ = true;
});
