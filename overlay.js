import { $, api, fmt, signed, tone, time, element, makeMotion, catalog, drawSparkline, desktopMood, quotePresentation, quoteHealth } from './renderer-modules/desktop-ui.js';
import { position, currency, displaySymbol, marketSession } from './niulai-android/web/core.mjs';
import { MarketMood } from './niulai-android/web/market-mood.mjs';
import { TapVoice } from './niulai-android/web/tap-voice.mjs';
import { MamaVoice } from './renderer-modules/mama-voice.js';
import { isQuietOfficeActive } from './renderer-modules/quiet-office.js';

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
function code() { return kind === 'island' && data.state.settings.islandSymbol || data.state.selected; }
function settings() { return data.state.settings; }
function entry() { return data.quotes[code()]; }
function isWood() { return (kind === 'island' ? settings().islandContent : settings().petMode) === 'muyu' && kind !== 'widget'; }
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
  $('overlay-count-value').textContent = data.counts.session.toLocaleString('zh-CN');
  $('overlay-total').textContent = `今日 ${data.counts.today.toLocaleString('zh-CN')} · 累计 ${data.counts.total.toLocaleString('zh-CN')}`;
  if (isWood()) {
    $('compact-name').textContent = '牛来木鱼';
    $('compact-price').textContent = settings().islandCount ? '本轮 ' + data.counts.session.toLocaleString('zh-CN') : '轻触敲击';
    $('compact-percent').textContent = '+1';
  }
}
function render() {
  if (!data?.state) return;
  const quote = entry()?.quote, stock = data.state.stocks.find(item => item.code === code());
  const presentation = quotePresentation(entry(), settings().interval);
  const theme = kind === 'widget' ? settings().widgetTheme : kind === 'island' ? settings().islandTheme : settings().theme;
  const dark = theme === 'dark' || theme === 'system' && data.dark;
  document.documentElement.classList.toggle('dark', dark);
  shell.classList.toggle('light-island', !dark);
  shell.classList.toggle('collapsed', collapsed);
  shell.classList.toggle('wood-mode', isWood());
  $('overlay-title').textContent = isWood() ? '牛来木鱼' : { pet: '牛来桌宠', widget: '牛来卡片', island: '牛来悬浮窗' }[kind];
  const name = quote?.name || stock?.name || displaySymbol(code());
  $('overlay-name').textContent = name;
  $('compact-name').textContent = name + (presentation.label ? ' · ' + presentation.label : '') + (quote && presentation.warning ? ' · 待更新' : '');
  $('overlay-code').textContent = displaySymbol(code()) + ' · ' + currency(code()) + (presentation.label ? ' · ' + presentation.label : '');
  $('overlay-price').textContent = $('compact-price').textContent = fmt(quote?.price, currency(code()) === 'HKD' ? 3 : 2);
  $('overlay-percent').textContent = $('compact-percent').textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + '%' : '—';
  $('overlay-numbers').className = $('compact-percent').className = tone(quote?.changePct);
  if (kind === 'island' && !isWood()) {
    $('compact-price').hidden = !settings().islandPrice;
    $('compact-percent').hidden = !settings().islandPercent;
  } else { $('compact-price').hidden = $('compact-percent').hidden = false; }
  $('overlay-status').textContent = presentation.compact;
  $('overlay-status').title = presentation.detail;
  shell.classList.toggle('quote-warning', Boolean(quote && presentation.warning && !isWood()));
  shell.title = presentation.detail;
  $('compact-island').setAttribute('aria-label', name + ' · ' + presentation.compact);
  $('compact-island').hidden = kind !== 'island';
  $('overlay-content').hidden = kind === 'island' && collapsed;
  $('mini-canvas').hidden = !settings().islandBull;
  $('scene-tabs').hidden = kind !== 'widget';
  $('overlay-quote').hidden = isWood() || kind === 'pet' && !settings().petQuote;
  $('overlay-count').hidden = !isWood() || !settings().muyuCount;
  $('island-expanded').hidden = kind !== 'island' || collapsed;
  $('overlay-pet').hidden = kind === 'island' || kind === 'widget' && (settings().scene !== 0 || !settings().widgetBull);
  for (const [id, scene] of [['market-scene', 1], ['position-scene', 2], ['calm-scene', 3]]) $(id).hidden = kind !== 'widget' || settings().scene !== scene;
  for (const button of document.querySelectorAll('[data-scene]')) {
    button.classList.toggle('active', Number(button.dataset.scene) === settings().scene);
    button.setAttribute('aria-pressed', String(Number(button.dataset.scene) === settings().scene));
  }
  const held = stock && position(stock, quote);
  const holdingText = held ? settings().private ? '持仓金额已隐藏' : `今日 ${signed(held.today)} · 累计 ${signed(held.total)} ${currency(code())}` : '尚未设置持仓';
  $('island-position').textContent = settings().islandHoldings && !isWood() ? holdingText : isWood() ? '今日 ' + data.counts.today + ' · 累计 ' + data.counts.total : presentation.session || marketSession(code());
  const positionContainer = $('overlay-position'); positionContainer.replaceChildren();
  if (held) {
    const grid = element('div', '', 'pnl-grid');
    for (const [label, value] of [['今日盈亏', held.today], ['累计盈亏', held.total]]) {
      const cell = element('div'); cell.append(element('small', label + ' · ' + currency(code())), element('strong', settings().private ? '••••' : signed(value), settings().private ? '' : tone(value))); grid.append(cell);
    }
    positionContainer.append(grid);
  } else positionContainer.append(element('p', '尚未设置持仓', 'position-empty'));
  const samples = data.histories[code()] || [];
  $('overlay-chart').hidden = !settings().widgetSparkline;
  drawSparkline($('overlay-chart'), samples, getComputedStyle(document.documentElement).getPropertyValue(quote?.changePct < 0 ? '--fall' : '--rise'));
  $('chart-description').textContent = samples.length > 1 ? `本次运行 ${samples.length} 个样本 · ${time(samples[0].at)}–${time(samples.at(-1).at)}` : '本次运行采样，等待更多报价';
  renderCounts(); updateMood();
}
function updateMood() {
  if (!data) return;
  const record = entry();
  const health = quoteHealth(record, settings().interval);
  const base = isWood() ? 'muyu' : settings().autoActions ? moods.update(record?.quote ? { ...record.quote, received: record.received } : null, record?.error || (record?.quote && health.warning ? health.message : null), Date.now(), settings().interval, code()) : 'idle';
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
async function switchStock(direction) {
  const stocks = data.state.stocks;
  const index = stocks.findIndex(stock => stock.code === code());
  const next = stocks[(index + direction + stocks.length) % stocks.length].code;
  try {
    if (kind === 'island' && settings().islandSymbol) await api.settings({ islandSymbol: next });
    else await api.stock('select', { code: next });
  } catch (error) { $('overlay-status').textContent = error.message; }
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
  bull.replay(mood); previewUntil = now + 3200;
  if (settings().sound && !settings().muted && !quiet) {
    stopAudio(); const sound = sounds[entry()?.quote?.changePct < 0 ? 'fall' : 'rise']; sound.volume = settings().volume; sound.play().catch(() => {});
  }
}
function autoCollapse() {
  clearTimeout(collapseTimer);
  if (!collapsed && settings().islandAutoCollapse) collapseTimer = setTimeout(() => { if (!collapsed) api.window('collapse'); }, 10000);
}
api.onSnapshot(next => { data = next; render(); });
api.onMamaVoice(({ volume }) => {
  if (data && lastMarketScene && settings().mamaSound && !settings().muted && !isQuietOfficeActive(settings().quietOffice)) {
    stopAudio(); mamaVoice.play(volume).catch(() => {});
  }
});
api.onCollapsed(value => { collapsed = value; render(); autoCollapse(); });
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
$('collapse-overlay').onclick = () => api.window('collapse');
$('compact-island').onclick = () => { if (isWood()) interact(); else { api.window('collapse'); } };
$('compact-island').ondblclick = () => { if (isWood()) api.window('collapse'); };
$('previous-stock').onclick = () => { switchStock(-1); autoCollapse(); };
$('next-stock').onclick = () => { switchStock(1); autoCollapse(); };
shell.addEventListener('wheel', event => {
  event.preventDefault();
  if (Date.now() - wheelAt < 350) return;
  wheelAt = Date.now(); switchStock(event.deltaY > 0 ? 1 : -1); autoCollapse();
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
document.addEventListener('visibilitychange', syncMotion);
api.bootstrap().then(next => { data = next; render(); setInterval(updateMood, 1000); window.__NIULAI_RENDERER_READY__ = true; });
