import { Bull2DController } from '../../renderer-modules/bull-controllers.js';
import { normalizeMarketSymbol, marketForSymbol, displaySymbol, quoteProviderSymbol, parseTencentSuggestions,
  parseSinaQuote, parseTencentQuote, loadState, saveState, position, currency, marketSession } from './core.mjs';
import { request, cancelRequests } from './bridge.mjs';
import { MarketMood } from './market-mood.mjs';
import { cropSprite, catalog } from './bull-motion.mjs';
import { DesktopBullMotion as BullMotion } from '../../renderer-modules/desktop-crying-motion.js';
import { featureDefaults, cleanFeatures, localCounts } from './features.mjs';
import { TapVoice } from './tap-voice.mjs';

const $ = id => document.getElementById(id);
window.__niulaiUpdate = value => {
  $('update-banner').hidden = !value.available;
  $('update-title').textContent = '牛来盯盘 ' + (value.version || '') + ' 已发布';
  $('update-note').textContent = (value.notes || []).slice(0, 2).join(' · ');
  $('update-status').textContent = value.checking ? '正在检查更新…' : value.error || (value.available ? '发现新版本 ' + value.version : value.checkedAt ? '当前已是最新版本' : '当前版本 ' + (value.current || '1.4.0'));
  $('check-update').disabled = Boolean(value.checking);
  $('update-notifications').checked = value.enabled !== false;
  $('update-permission').textContent = value.permission ? '系统通知设置' : '开启系统通知';
};
$('check-update').onclick = () => { if (window.NiulaiNative?.checkUpdates) window.NiulaiNative.checkUpdates(); else toast('请在安装版中检查更新'); };
$('update-notifications').onchange = () => window.NiulaiNative?.updateNotifications?.($('update-notifications').checked);
$('update-permission').onclick = () => window.NiulaiNative?.updatePermission?.();
$('update-download').onclick = () => window.NiulaiNative?.openUpdates?.(false);
$('update-history').onclick = () => window.NiulaiNative?.openUpdates?.(true);
try { window.__niulaiUpdate(JSON.parse(window.NiulaiNative?.updateStatus?.() || '{}')); } catch {}
try { const restored=window.NiulaiNative?.restoreAppState?.(); if(restored)localStorage.setItem('niulai:android:v1',restored); } catch {}
const state = loadState(localStorage);
const quotes = new Map();
const audio = { rise: new Audio('assets/niulai.mp3'), fall: new Audio('assets/mama.mp3') };
const woodAudio = new TapVoice('assets/niulai-tap.wav');
woodAudio.volume = .65;
let active = true, busy = false, refreshTimer, toastTimer, bubbleTimer, tab = 'home', requestEpoch = 0;
let searchEpoch = 0, searchTimer, positionCode, taps = [], adding = false, searchComposing = false;
const tabScroll = new Map();
const stockRows = { 'home-stocks': new Map(), 'watch-stocks': new Map() };
const portfolioCards = new Map();
let petConfigSent='', manualSceneUntil=0, calmTimer;
let coverOverride=null, previousWideTab=null;
function dialogOpen(){return Boolean(document.querySelector('dialog[open]'));}
function petVisible(){return active&&tab==='home'&&([0,3].includes(state.scene)||document.documentElement.classList.contains('cover'))&&!dialogOpen();}
const moods=new MarketMood();let bullMotion=null,galleryMotion=null,previewUntil=0,liveMood='loading',moodTimer;
let woodMotion = null, miniMotion = null;
let settingsPanel = 'island';
function syncMotionVisibility() {
  bullMotion?.configure(petVisible(), state.motion);
  galleryMotion?.configure(active && $('motion-dialog').open, state.motion);
  woodMotion?.configure(active && tab === 'muyu' && !dialogOpen(), state.motion);
  miniMotion?.configure(active && $('settings-dialog').open && settingsPanel === 'island' && state.islandBull, state.motion && state.islandMotion);
}
function selectSettings(panel) {
  settingsPanel = panel;
  for (const button of document.querySelectorAll('[data-settings]')) {
    const selected = button.dataset.settings === panel;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const section of document.querySelectorAll('[data-settings-panel]')) section.hidden = section.dataset.settingsPanel !== panel;
  $('settings-dialog').scrollTop = 0;
  syncMotionVisibility();
}
function openSettings(panel = 'island') {
  selectSettings(panel);
  applySettings();
  $('settings-dialog').showModal();
  syncMotionVisibility();
}
let counts = localCounts(localStorage);
const media = matchMedia('(prefers-color-scheme: dark)');
function systemIsDark(){try{if(window.NiulaiNative?.systemDark)return window.NiulaiNative.systemDark();}catch{}return media.matches;}
const fmt = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const signed = (n, digits = 2) => Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), digits)}` : '—';
const tone = n => n > 0 ? 'rise' : n < 0 ? 'fall' : 'neutral';
const selectedStock = () => state.stocks.find(s => s.code === state.selected);
function persist() { try { saveState(localStorage, state);window.NiulaiNative?.storeAppState?.(JSON.stringify(state)); } catch { toast('本机存储已满，设置暂未保存'); } }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3000); }
function text(tag, value, className) { const e = document.createElement(tag); e.textContent = value; if (className) e.className = className; return e; }
function applySettings() {
  const dark = state.theme === 'dark' || (state.theme === 'system' && systemIsDark());
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('no-motion', !state.motion);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#15181e' : '#f4f5f7';
  syncMotionVisibility();
  window.NiulaiNative?.appearance(dark);
  for (const key of ['theme', 'interval']) $(key).value = state[key];
  for (const key of ['sound', 'haptic', 'motion', 'private', 'smartScene']) $(key).checked = state[key];
  paintFeatureSettings();
  if (!state.sound) stopAudio();
  if (!state.muyuSound) woodAudio.stop();
}
function stopAudio() { for (const a of Object.values(audio)) { a.pause(); a.currentTime = 0; } }
function animatePet(kind, message) {
  previewUntil=Date.now()+3200;if(bullMotion){bullMotion.interact(kind);}
  $('pet-bubble').textContent = message;
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(updatePetMessage, 4200);
}
function updatePetMessage() {
  const q = quotes.get(state.selected)?.quote;
  $('pet-bubble').textContent = '点击牛来互动';
}
function updateMood(){
  const entry=quotes.get(state.selected),q=entry?.quote;
  liveMood=state.autoActions ? moods.update(q?{...q,received:entry.received}:null,entry?.error,Date.now(),state.interval,state.selected) : 'idle';
  const spec=catalog.find(s=>s.id===liveMood);$('pet-state').textContent=spec.label;$('pet-state').dataset.tone=spec.tone;
  $('pet').dataset.mood=liveMood;
  if(Date.now()>=previewUntil)bullMotion?.state(liveMood);
  if (tab === 'muyu' || $('settings-dialog').open) refreshCounts();
}
function openMotions(){
  $('motion-dialog').showModal();bullMotion?.configure(false,state.motion);galleryMotion?.configure(active,state.motion);previewMotion(liveMood);
}
function previewMotion(id){
  $('motion-dialog').scrollTop=0;
  const spec=catalog.find(s=>s.id===id);$('floating-preview').dataset.previewId=id;$('motion-name').textContent=spec.label;$('motion-action').textContent=spec.action;
  for(const b of document.querySelectorAll('[data-motion]'))b.classList.toggle('selected',b.dataset.motion===id);
  if(galleryMotion){galleryMotion.replay(id);}
}
function renderPosition(container, stock, q) {
  container.replaceChildren();
  const p = position(stock, q);
  if (!stock.cost || !stock.shares) { container.append(text('p', '尚未设置持仓', 'position-empty')); return; }
  if (!p) { container.append(text('p', `已保存 ${fmt(stock.shares, 4).replace(/\.?0+$/, '')} 股 · 等待行情计算盈亏`, 'position-empty')); return; }
  const grid = text('div', '', 'pnl-grid');
  for (const [label, value] of [['今日盈亏', p.today], ['累计盈亏', p.total]]) {
    const cell = document.createElement('div'); cell.append(text('small', `${label} · ${currency(stock.code)}`), text('strong', signed(value), tone(value))); grid.append(cell);
  }
  container.append(grid);
}
function renderLists() {
  for (const [id, removable] of [['home-stocks', false], ['watch-stocks', true]]) {
    const container = $(id), rows = stockRows[id];
    for (const [code, row] of rows) if (!state.stocks.some(stock => stock.code === code)) { row.remove(); rows.delete(code); }
    for (const stock of state.stocks) {
      const entry = quotes.get(stock.code), q = entry?.quote;
      let row = rows.get(stock.code);
      if (!row) {
        row = text('div', '', 'stock-row');
        const button = text('button', '', 'stock-main'), name = document.createElement('div'), price = text('div', '', 'stock-price');
        name.append(text('strong', ''), text('small', displaySymbol(stock.code)));
        price.append(text('strong', ''), text('small', '更新延迟'));
        button.append(name, price, text('span', '', 'stock-pct'));
        button.onclick = () => select(stock.code); row.append(button);
        if (removable) { const remove = text('button', '×', 'remove-stock'); remove.onclick = () => removeStock(stock.code); row.append(remove); }
        rows.set(stock.code, row); container.append(row);
      }
      const button = row.firstElementChild, name = button.children[0], price = button.children[1], percent = button.children[2];
      row.classList.toggle('selected', stock.code === state.selected);
      button.setAttribute('aria-label', `盯盘 ${q?.name || stock.name}`);
      button.setAttribute('aria-pressed', String(stock.code === state.selected));
      name.firstElementChild.textContent = q?.name || stock.name;
      price.className = `stock-price ${q ? tone(q.changePct) : 'neutral'}`;
      price.firstElementChild.textContent = q ? fmt(q.price, marketForSymbol(stock.code) === 'hk' ? 3 : 2) : '—';
      price.lastElementChild.hidden = !entry || !(entry.error || Date.now() - entry.received > state.interval * 1000 + 20000);
      percent.className = `stock-pct ${q ? tone(q.changePct) : ''}`;
      percent.textContent = q ? `${signed(q.changePct)}%` : '—';
      if (removable) row.lastElementChild.setAttribute('aria-label', `移出 ${stock.name}`);
    }
  }
  $('stock-count').textContent = state.stocks.length;
}
function renderPortfolio() {
  const container = $('portfolio-list');
  const held = state.stocks.filter(s => s.cost > 0 && s.shares > 0);
  for (const [code, card] of portfolioCards) if (!held.some(stock => stock.code === code)) { card.remove(); portfolioCards.delete(code); }
  let empty = container.querySelector('.portfolio-empty');
  if (!held.length && !empty) { empty = text('p', '暂无持仓记录，点击上方设置持仓。', 'subtext portfolio-empty'); container.append(empty); }
  if (held.length) empty?.remove();
  for (const stock of held) {
    let card = portfolioCards.get(stock.code);
    if (!card) {
      card = text('article', '', 'portfolio-item');
      const title = text('button', ''); title.append(text('strong', ''), text('small', `${displaySymbol(stock.code)} · 编辑 ↗`)); title.onclick = () => openPosition(stock.code);
      card.append(title, document.createElement('div'), text('p', '', 'subtext')); portfolioCards.set(stock.code, card); container.append(card);
    }
    card.firstElementChild.firstElementChild.textContent = stock.name;
    renderPosition(card.children[1], stock, quotes.get(stock.code)?.quote);
    const entry = quotes.get(stock.code);
    card.lastElementChild.textContent = `成本 ${fmt(stock.cost, 3)} ${currency(stock.code)} · ${Number(stock.shares.toFixed(6))} 股${entry?.error ? ' · 行情更新失败，使用上次数据' : entry ? ' · 获取于 ' + new Date(entry.received).toLocaleTimeString('zh-CN', { hour12: false }) : ''}`;
  }
}
function render() {
  const stock = selectedStock(); if (!stock) return;
  const entry = quotes.get(state.selected), q = entry?.quote;
  $('quote-name').textContent = q?.name || stock.name;
  $('quote-code').textContent = `${displaySymbol(stock.code)} · ${currency(stock.code)}`;
  $('session').textContent = marketSession(stock.code);
  $('price').textContent = q ? fmt(q.price, marketForSymbol(stock.code) === 'hk' ? 3 : 2) : '—';
  $('change').textContent = q ? signed(q.change, 3) : '—';
  $('percent').textContent = q ? `${signed(q.changePct)}%` : '—';
  $('quote-number').className = `quote-number ${q ? tone(q.changePct) : 'neutral'}`;
  const delayed = entry && (entry.error || Date.now() - entry.received > state.interval * 1000 + 20000);
  $('connection').className = `connection ${delayed ? 'error' : q ? 'ok' : ''}`;
  $('connection-text').textContent = q ? `${delayed ? '更新失败 · 保留上次数据 · ' : ''}${q.source === 'tencent' ? '腾讯' : '新浪'} · 获取于 ${new Date(entry.received).toLocaleTimeString('zh-CN', { hour12: false })}${q.time ? ` · 源时间 ${q.time}` : ' · 源未提供时间'}` : entry?.error || (window.NiulaiNative ? '正在连接行情…' : '请安装安卓应用连接行情');
  $('refresh').disabled = busy || !active;
  $('refresh').setAttribute('aria-busy', String(busy));
  $('refresh').textContent = busy ? '↻ 正在更新' : '↻ 刷新行情';
  renderPosition($('home-position'), stock, q); renderLists(); renderPortfolio();
  if(document.documentElement.classList.contains('cover')&&state.private)$('stack-position').replaceChildren(text('p','•••• · 展开手机，在内屏查看持仓。','subtext'));else renderPosition($('stack-position'),stock,q);
  $('market-caption').textContent=marketSession(stock.code);
  $('market-details').textContent=q?`昨收 ${fmt(q.prevClose,3)} · ${currency(stock.code)}。${q.time?'行情源时间 '+q.time:'接口未提供行情时间；获取时间不代表成交时间。'}`:'等待连接，暂无可展示的行情。';
  syncPet();
  updateMood();
}
function syncPet(){
  const stock=selectedStock();if(!stock)return;
  const quote=quotes.get(stock.code)?.quote,p=position(stock,quote);
  const config=JSON.stringify({...cleanFeatures(state),theme:state.theme,symbol:stock.code,name:quote?.name||stock.name,sound:state.sound,haptic:state.haptic,motion:state.motion,interval:state.interval,private:state.private,scene:state.scene,...(!state.private&&p?{cost:stock.cost,shares:stock.shares}:{})});
  if(config!==petConfigSent){window.NiulaiNative?.configurePet?.(config);petConfigSent=config;}
  const entry=quotes.get(stock.code);if(entry?.quote)window.NiulaiNative?.publishQuote?.(JSON.stringify({...entry.quote,received:entry.received}));
}
window.__niulaiPetChanged=()=>{
  const running=window.NiulaiNative?.petStatus?.()==='running';
  $('desktop-title').textContent=running?'桌宠已开启':'桌宠';
  $('desktop-description').textContent=running?'拖动调整位置 · 支持收起':'悬浮显示当前行情';
  $('desktop-start').hidden=running;$('desktop-home').hidden=$('desktop-stop').hidden=!running;
};
function setScene(scene,manual=false){
  state.scene=Number(scene);bullMotion?.configure(petVisible(),state.motion);if(manual)manualSceneUntil=Date.now()+3600000;
  document.documentElement.dataset.scene=state.scene;
  for(const b of document.querySelectorAll('button[data-scene]')){b.classList.toggle('active',Number(b.dataset.scene)===state.scene);b.setAttribute('aria-pressed',Number(b.dataset.scene)===state.scene?'true':'false');}
  for(const [id,n] of [['scene-market',1],['scene-position',2],['scene-calm',3]])$(id).hidden=state.scene!==n;
  persist();syncPet();
}
function recommendScene(){if(state.smartScene&&Date.now()>manualSceneUntil)setScene(marketSession(state.selected)==='常规交易时段'?1:0);}
for(const b of document.querySelectorAll('button[data-scene]'))b.onclick=()=>setScene(b.dataset.scene,true);
let swipeY,swipeX;
document.querySelector('.hero').addEventListener('touchstart',e=>{swipeX=e.touches[0].clientX;swipeY=e.touches[0].clientY;},{passive:true});
document.querySelector('.hero').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-swipeX,dy=e.changedTouches[0].clientY-swipeY;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)setScene((state.scene+(dx<0?1:3))%4,true);},{passive:true});
$('desktop-start').onclick=()=>{syncPet();if(window.NiulaiNative?.startPet)window.NiulaiNative.startPet();else toast('请在安卓安装版中开启桌宠');};
$('desktop-stop').onclick=()=>window.NiulaiNative?.stopPet?.();$('desktop-home').onclick=()=>window.NiulaiNative?.goHome?.();
$('widget-pin').onclick=()=>{syncPet();if(window.NiulaiNative?.pinWidget)window.NiulaiNative.pinWidget();else toast('请在安卓安装版中添加桌面卡片');};
$('stack-edit').onclick=()=>openPosition();$('next-stock').onclick=()=>{const index=state.stocks.findIndex(s=>s.code===state.selected);select(state.stocks[(index+1)%state.stocks.length].code);};
$('calm-start').onclick=()=>{clearInterval(calmTimer);let remaining=20;$('calm-message').textContent='剩余 20 秒';calmTimer=setInterval(()=>{remaining--;$('calm-message').textContent=remaining>0?`剩余 ${remaining} 秒`:'计时结束';if(remaining<=0)clearInterval(calmTimer);},1000);};
$('device-help').onclick=()=>{
  let device={};try{device=JSON.parse(window.NiulaiNative?.deviceInfo?.()||'{}');}catch{}
  $('device-name').textContent=device.brand?`${device.brand} ${device.model}${device.android?" · Android "+device.android:""}`:'安卓手机适配说明';
  const brand=String(device.brand||'').toLowerCase();let tips;
  if(/xiaomi|redmi|poco/.test(brand))tips=['在小米或 REDMI 的系统设置中允许悬浮窗。桌宠后台消失时，检查后台运行和后台弹出界面权限。','折叠手机可在系统的外屏应用列表中查找牛来盯盘。'];
  else if(/huawei/.test(brand))tips=['华为 EMUI 和可直接运行 APK 的 HarmonyOS 4.x 可使用安卓安装包。','桌宠后台消失时，在应用启动管理中允许后台活动。桌面卡片从小组件入口添加。'];
  else if(/honor/.test(brand))tips=['在荣耀手机上检查悬浮窗权限和应用启动管理中的后台活动设置。','折叠屏、分屏和小窗会随窗口大小调整布局。外屏入口由手机系统提供。'];
  else if(/oppo|oneplus|realme/.test(brand))tips=['在 OPPO、一加或真我手机上检查悬浮窗和后台活动权限。','外屏入口可在系统的外屏应用列表中查找。'];
  else if(/vivo|iqoo/.test(brand))tips=['在 vivo 或 iQOO 手机上检查悬浮窗权限，以及电池设置中的后台运行限制。','外屏入口由手机系统提供。'];
  else tips=['先允许悬浮窗。桌宠后台消失时，检查应用的后台运行限制。','桌面卡片从系统的小组件入口添加。外屏入口由手机系统提供。'];
  $('device-guide').replaceChildren(...tips.map(t=>text('p',t)));$('device-dialog').showModal();
};
$('app-settings').onclick=()=>window.NiulaiNative?.supportSettings?.('app');$('battery-settings').onclick=()=>window.NiulaiNative?.supportSettings?.('battery');
$('compat-open').onclick=()=>{if(window.NiulaiNative?.compatibilityUI)window.NiulaiNative.compatibilityUI();else toast('请在安卓安装版中使用兼容界面');};
$('cover-preview').onclick=()=>{coverOverride=true;document.documentElement.classList.add('previewing');adaptViewport();$('device-dialog').close();toast('外屏精简预览 · 右下角退出');};
$('cover-exit').onclick=()=>{coverOverride=false;document.documentElement.classList.remove('previewing');adaptViewport();};
function schedule() { clearTimeout(refreshTimer); if (active && window.NiulaiNative) refreshTimer = setTimeout(refresh, state.interval * 1000); }
async function refresh() {
  clearTimeout(refreshTimer);
  if (!active || busy || !window.NiulaiNative) { render(); return; }
  busy = true; const epoch = requestEpoch;
  const codes = state.stocks.map(s => s.code);
  render();
  try {
    let primary = '';
    try { primary = await request('quote', codes.join(',')); } catch {}
    if (!active || epoch !== requestEpoch) return;
    const resolved = new Map();
    for (const code of codes) { const q = parseSinaQuote(primary, code); if (q && q.price > 0) resolved.set(code, { ...q, source: 'sina' }); }
    const missing = codes.filter(code => !resolved.has(code));
    if (missing.length) {
      try {
        const fallback = await request('fallback', missing.map(c => quoteProviderSymbol(c, 'tencent')).join(','));
        for (const code of missing) { const q = parseTencentQuote(fallback, code); if (q && q.price > 0) resolved.set(code, q); }
      } catch {}
    }
    if (!active || epoch !== requestEpoch) return;
    let renamed = false;
    for (const code of codes) {
      const stock = state.stocks.find(s => s.code === code); if (!stock) continue;
      const quote = resolved.get(code);
      if (quote) {
        quotes.set(code, { quote, received: Date.now() });
        if (stock.name !== quote.name) { stock.name = quote.name; renamed = true; }
      } else quotes.set(code, { ...quotes.get(code), error: '连接失败 · 点击刷新重试' });
    }
    if (renamed) persist(); updatePetMessage();
  } finally { if (epoch === requestEpoch) { busy = false; render(); schedule(); } }
}
function changeTab(next) {
  tabScroll.set(tab, window.scrollY);
  tab = next;
  for (const e of document.querySelectorAll('[data-tab]')) { e.classList.toggle('active', e.dataset.tab === next); e.setAttribute('aria-current', e.dataset.tab === next ? 'page' : 'false'); }
  for (const e of document.querySelectorAll('.view')) e.hidden = e.id !== `view-${next}`;
  window.scrollTo(0, tabScroll.get(next) || 0); render();
  bullMotion?.configure(petVisible(),state.motion);
  woodMotion?.configure(active && tab === 'muyu', state.motion);
  if (next === 'muyu') refreshCounts();
}
function select(code) { if(code!==state.selected){moods.reset();previewUntil=0;}state.selected = code; persist(); changeTab('home'); updatePetMessage(); }
function removeStock(code) {
  if (state.stocks.length === 1) { toast('至少保留一只自选'); return; }
  const stock = state.stocks.find(s => s.code === code);
  // A separate explicit action prevents watchlist removal from destroying position records.
  if (stock.cost || stock.shares) { toast('该股票有持仓，请先清除持仓后再移出自选'); return; }
  state.stocks = state.stocks.filter(s => s.code !== code); quotes.delete(code);
  if (state.selected === code) state.selected = state.stocks[0].code;
  persist(); render(); updatePetMessage();
}
function openSearch() { $('search-dialog').showModal(); $('search-input').focus(); }
function resultButton(stock, label) {
  const b = text('button', '', 'result'); const n = document.createElement('div');
  n.append(text('strong', stock.name), text('small', `${displaySymbol(stock.code)} · ${{ cn: 'A 股', hk: '港股', us: '美股' }[marketForSymbol(stock.code)]}`));
  b.append(n, text('span', label || (state.stocks.some(s => s.code === stock.code) ? '去盯盘 ↗' : '＋ 自选')));
  b.onclick = () => addStock(stock); return b;
}
async function search() {
  if (searchComposing || adding) return;
  const query = $('search-input').value.trim(); const epoch = ++searchEpoch;
  $('search-results').replaceChildren();
  if (!query) { $('search-message').textContent = '支持 A 股、港股和美股。'; return; }
  $('search-message').textContent = '正在搜索…';
  const direct = normalizeMarketSymbol(query);
  if (direct) $('search-results').append(resultButton({ code: direct, name: displaySymbol(direct) }, '验证并添加'));
  try {
    const response = await request('search', query);
    if (epoch !== searchEpoch || !$('search-dialog').open) return;
    const results = parseTencentSuggestions(response);
    $('search-results').replaceChildren(...results.map(s => resultButton(s)));
    if (direct && !results.some(s => s.code === direct)) $('search-results').prepend(resultButton({ code: direct, name: displaySymbol(direct) }, '验证并添加'));
    $('search-message').textContent = results.length || direct ? '选择股票加入自选' : '暂时没找到，试试完整股票代码。';
  } catch {
    if (epoch !== searchEpoch) return;
    $('search-message').textContent = direct ? '名称搜索暂不可用，可点击下方验证代码。' : '搜索连接失败，请检查网络后重试。';
  }
}
async function addStock(stock) {
  if (adding) return;
  if (state.stocks.some(s => s.code === stock.code)) { select(stock.code); $('search-dialog').close(); return; }
  if (state.stocks.length >= 20) { toast('自选已满 20 只，请先移出一只'); return; }
  adding = true; const searchTicket = ++searchEpoch;
  for (const button of document.querySelectorAll('#search-dialog .result, #search-dialog [data-code], #search-form button')) button.disabled = true;
  $('search-message').textContent = '正在验证股票行情…';
  const epoch = requestEpoch;
  try {
    let quote;
    try { quote = parseSinaQuote(await request('quote', stock.code), stock.code); } catch {}
    if (!quote || quote.price <= 0) quote = parseTencentQuote(await request('fallback', quoteProviderSymbol(stock.code, 'tencent')), stock.code);
    if (!active || epoch !== requestEpoch || searchTicket !== searchEpoch || !$('search-dialog').open) return;
    if (!quote || quote.price <= 0) throw new Error('暂未获取到有效行情，请检查代码或稍后再试');
    state.stocks.push({ code: stock.code, name: quote.name, cost: 0, shares: 0 });
    quotes.set(stock.code, { quote, received: Date.now() }); persist(); select(stock.code); $('search-dialog').close(); toast('已加入自选');
  } catch (error) { if (searchTicket === searchEpoch) $('search-message').textContent = error.message; }
  finally { adding = false; for (const button of document.querySelectorAll('#search-dialog .result, #search-dialog [data-code], #search-form button')) button.disabled = false; }
}
function openPosition(code = state.selected) {
  const stock = state.stocks.find(s => s.code === code); if (!stock) return;
  positionCode = code; $('position-title').textContent = stock.name; $('position-currency').textContent = currency(code);
  $('cost').value = stock.cost || ''; $('shares').value = stock.shares || '';
  $('clear-position').hidden = !stock.cost && !stock.shares; $('position-dialog').showModal();
}
for (const button of document.querySelectorAll('[data-tab]')) button.onclick = () => changeTab(button.dataset.tab);
for (const button of document.querySelectorAll('.add-stock')) button.onclick = openSearch;
$('select-stock').onclick = () => changeTab('watchlist'); $('refresh').onclick = refresh;
$('settings-open').onclick = () => openSettings();
for (const button of document.querySelectorAll('[data-settings]')) {
  button.onclick = () => selectSettings(button.dataset.settings);
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...document.querySelectorAll('[data-settings]')];
    const index = buttons.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  };
}
selectSettings('island');
$('edit-position').onclick = () => openPosition(); $('portfolio-edit').onclick = () => openPosition();
for (const dialog of document.querySelectorAll('dialog')) {
  new MutationObserver(syncMotionVisibility).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  dialog.querySelector('.close-dialog').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
}
$('search-dialog').addEventListener('close', () => { ++searchEpoch; searchComposing = false; clearTimeout(searchTimer); });
$('search-input').oninput = () => { ++searchEpoch; clearTimeout(searchTimer); if (!searchComposing) searchTimer = setTimeout(search, 350); };
$('search-input').addEventListener('compositionstart', () => { searchComposing = true; ++searchEpoch; clearTimeout(searchTimer); });
$('search-input').addEventListener('compositionend', () => { searchComposing = false; clearTimeout(searchTimer); searchTimer = setTimeout(search, 350); });
$('search-form').onsubmit = e => { e.preventDefault(); if (searchComposing) return; clearTimeout(searchTimer); search(); };
$('search-dialog').addEventListener('keydown', e => {
  if (e.isComposing || searchComposing || !['ArrowDown','ArrowUp'].includes(e.key)) return;
  const results = [...document.querySelectorAll('#search-results .result:not(:disabled)')];
  if (!results.length) return;
  e.preventDefault(); const current = results.indexOf(document.activeElement);
  results[(current + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length].focus();
});
for (const b of document.querySelectorAll('[data-code]')) b.onclick = () => addStock({ code: b.dataset.code, name: displaySymbol(b.dataset.code) });
$('position-form').onsubmit = e => {
  e.preventDefault(); const cost = Number($('cost').value), shares = Number($('shares').value);
  if (!(cost > 0 && cost <= 1e9 && shares > 0 && shares <= 1e12) || !Number.isFinite(cost * shares)) { toast('请输入有效成本和股数'); return; }
  const stock = state.stocks.find(s => s.code === positionCode); if (!stock) return;
  stock.cost = cost; stock.shares = shares; persist(); $('position-dialog').close(); render(); toast('持仓已保存到本机');
};
$('clear-position').onclick = () => {
  const stock = state.stocks.find(s => s.code === positionCode); if (!stock) return;
  stock.cost = 0; stock.shares = 0; persist(); $('position-dialog').close(); render(); toast('已清除此持仓');
};
for (const key of ['theme', 'interval', 'sound', 'haptic', 'motion','private','smartScene']) $(key).onchange = () => {
  state[key] = ['sound', 'haptic', 'motion','private','smartScene'].includes(key) ? $(key).checked : key === 'interval' ? Number($(key).value) : $(key).value;
  persist(); applySettings();syncPet();if(key==='smartScene')recommendScene(); if (key === 'interval') schedule();
};
if(media.addEventListener)media.addEventListener('change', applySettings);else media.addListener(applySettings);
for(const b of document.querySelectorAll('[data-preset]'))b.onclick=()=>{
  const presets={office:{sound:false,muyuSound:false,haptic:false,motion:true,interval:30,islandInterval:30,scene:0},commute:{sound:false,muyuSound:false,haptic:true,motion:true,interval:30,islandInterval:30,scene:1},home:{sound:true,haptic:true,motion:true,interval:10,scene:0},battery:{sound:false,muyuSound:false,haptic:false,motion:false,interval:30,islandInterval:30,scene:0}};
  Object.assign(state,presets[b.dataset.preset],{private:true});persist();applySettings();setScene(state.scene,true);syncPet();schedule();toast('已切换为'+b.textContent);
};
$('pet').onclick = () => {
  if (!active) return;
  if (state.haptic) window.NiulaiNative?.haptic();
  const now = Date.now(); taps = taps.filter(t => now - t < 1150); taps.push(now);
  const rage = taps.length >= 3; if (rage) taps = [];
  animatePet(rage ? 'annoyed' : 'wave', rage ? '别挠了' : '招手');
  if (state.sound) { const q = quotes.get(state.selected)?.quote; stopAudio(); audio[q && q.changePct < 0 ? 'fall' : 'rise'].play().catch(() => toast('声音未能播放，请检查媒体音量')); }
};
for (const button of document.querySelectorAll('[data-action]')) button.onclick = () => {
  const kind = button.dataset.action;
  if(kind==='gallery'){openMotions();return;}
  animatePet(kind,catalog.find(s=>s.id===kind).label);
  if (state.haptic) window.NiulaiNative?.haptic();
};
window.__niulaiBack = () => {
  const opened = [...document.querySelectorAll('dialog')].find(d => d.open); if (opened) { opened.close(); return true; }
  if (tab !== 'home') { changeTab('home'); return true; } return false;
};
window.__niulaiLifecycle = foreground => {
  if (active === foreground) return;
  active = foreground; document.documentElement.classList.toggle('paused', !active);
  ++requestEpoch; ++searchEpoch; clearTimeout(refreshTimer); clearTimeout(searchTimer); cancelRequests(); busy = false; adding = false; stopAudio();
  clearInterval(calmTimer);
  clearInterval(moodTimer);syncMotionVisibility();
  woodAudio.stop();
  if(active)moodTimer=setInterval(updateMood,1000);else previewUntil=0;
  if (active) { applySettings();recommendScene();window.__niulaiPetChanged(); refresh(); } else render();
};
document.addEventListener('visibilitychange', () => window.__niulaiLifecycle(!document.hidden));
window.addEventListener('online', () => { if (active && !busy) refresh(); });
function adaptViewport(){
  const compact=coverOverride??((location.hash==='#cover'&&innerWidth<600&&innerHeight<900)||(innerWidth<340&&innerHeight<620));
  document.documentElement.classList.toggle('cover',compact);
  if(compact&&tab==='portfolio'&&state.private){previousWideTab=tab;changeTab('home');}
  else if(!compact&&previousWideTab){const previous=previousWideTab;previousWideTab=null;changeTab(previous);}
  render();
}
window.addEventListener('resize',adaptViewport);
adaptViewport();
applySettings();setScene(state.scene);recommendScene();window.__niulaiPetChanged();render();
const bull = new Bull2DController({ root: $('pet'), canvas: $('bull'), assetUrl: path => `assets/${path.split('/').pop()}` });
bull.loadSprite().then(ok => {
  if (!ok) { $('pet-bubble').textContent = '图片加载失败，请重新打开应用';return; }
  const sprite=cropSprite($('bull'));$('bull').width=$('bull').height=384;
  bullMotion=new BullMotion($('bull'),sprite);galleryMotion=new BullMotion($('motion-canvas'),sprite);
  miniMotion = new BullMotion($('island-mini'), sprite);miniMotion.mini=true;miniMotion.configure(false,state.motion);
  woodMotion = new BullMotion($('wood-canvas'), sprite);
  woodMotion.state('muyu'); woodMotion.configure(active && tab === 'muyu', state.motion);
  bullMotion.state(liveMood);bullMotion.configure(petVisible(),state.motion);galleryMotion.configure(false,state.motion);
});
for(const s of catalog){const b=text('button','','motion-option');b.dataset.motion=s.id;b.dataset.tone=s.tone;b.append(text('strong',s.label),text('small',s.action));b.onclick=()=>previewMotion(s.id);$('motion-list').append(b);}
$('motion-dialog').addEventListener('close',()=>{galleryMotion?.configure(false,state.motion);bullMotion?.configure(petVisible(),state.motion);});
$('floating-preview').hidden=!window.NiulaiNative?.previewPet;$('floating-preview').onclick=()=>window.NiulaiNative?.previewPet?.($('floating-preview').dataset.previewId||liveMood);
moodTimer=setInterval(updateMood,1000);
refresh();
window.__niulaiReady=true;

function refreshCounts() {
  try {
    counts = window.NiulaiNative?.muyuCounts ? JSON.parse(window.NiulaiNative.muyuCounts()) : localCounts(localStorage);
  } catch { }
  $('wood-count').textContent = Number(counts.session || 0).toLocaleString('zh-CN');
  $('wood-count').style.fontSize=counts.session>999999999?'22px':counts.session>999999?'30px':'';
  $('wood-today').textContent = Number(counts.today || 0).toLocaleString('zh-CN');
  $('wood-total').textContent = Number(counts.total || 0).toLocaleString('zh-CN');
  $('wood-sound').textContent = state.muyuSound ? '音效开启' : '音效关闭';
  paintIslandPreview();
}

function knockWood() {
  try {
    counts = window.NiulaiNative?.tapMuyu ? JSON.parse(window.NiulaiNative.tapMuyu()) : localCounts(localStorage, true);
  } catch { toast('计数暂未保存'); return; }
  if (woodMotion) { woodMotion.replay('muyu'); }
  if (state.muyuSound) woodAudio.play().catch(() => toast('请检查媒体音量'));
  if (state.haptic) window.NiulaiNative?.haptic();
  if (state.muyuEffects && state.motion) {
    const feedback = $('wood-feedback');
    if (feedback.children.length >= 6) feedback.firstElementChild.remove();
    const pulse = text('span', '牛气➕1 📈', 'wood-pulse');
    pulse.style.marginTop = (counts.session % 3) * 11 + 'px';
    feedback.append(pulse);
    setTimeout(() => pulse.remove(), 760);
  }
  refreshCounts();
}

function paintIslandPreview() {
  const quote = quotes.get(state.selected)?.quote;
  const wood = state.islandContent === 'muyu';
  const demo = document.querySelector('.island-demo');
  demo.style.width=state.islandWidth+'px';demo.style.maxWidth='100%';
  demo.classList.toggle('light', state.islandTheme === 'light' || state.islandTheme === 'system' && !systemIsDark());
  $('island-demo-name').textContent = wood ? '牛来木鱼' : quote?.name || selectedStock()?.name || '牛来盯盘';
  $('island-demo-value').textContent = wood ? '本轮 ' + Number(counts.session || 0).toLocaleString('zh-CN') : state.islandPrice && quote ? fmt(quote.price) : '牛来';
  $('island-demo-percent').textContent = wood ? '+1' : state.islandPercent && quote ? signed(quote.changePct) + '%' : '';
  $('island-demo-percent').className = wood ? '' : quote ? tone(quote.changePct) : '';
  $('island-mini').hidden = !state.islandBull;
  miniMotion?.state(wood?'muyu':liveMood);syncMotionVisibility();
}

function paintFeatureSettings() {
  for (const [key, fallback] of Object.entries(featureDefaults)) {
    const element = $(key);
    if (!element) continue;
    if (typeof fallback === 'boolean') element.checked = state[key];
    else if (key !== 'islandSymbol') element.value = state[key];
  }
  const options = $('islandSymbol');
  options.replaceChildren();
  const follow = text('option', '跟随当前自选'); follow.value = ''; options.append(follow);
  for (const stock of state.stocks) { const option = text('option', stock.name); option.value = stock.code; options.append(option); }
  options.value = state.islandSymbol;
  $('island-market-settings').hidden = state.islandContent === 'muyu';
  $('islandCount').closest('.setting-row').hidden = state.islandContent !== 'muyu';
  for (const key of ['islandWidth', 'islandOffsetX', 'islandOffsetY', 'islandCameraX', 'islandCameraWidth', 'islandCameraHeight']) $(key + '-value').textContent = state[key] + (key === 'islandCameraX' ? '%' : ' dp');
  $('camera-manual').hidden = state.islandPlacement !== 'manual';
  const cameraReady = window.NiulaiNative?.cameraInteractionReady?.() || false;
  $('camera-status').textContent = cameraReady && state.islandCameraInteraction ? '前摄交互已开启。位置识别有误时，可选择手动校准。' : '要在摄像头周围点击和滑动，请在系统无障碍设置中开启“牛来前摄交互”。';
  $('camera-permission').hidden = cameraReady;
  paintIslandPreview();
}

for (const [key, fallback] of Object.entries(featureDefaults)) {
  const element = $(key);
  if (!element) continue;
  if (typeof fallback === 'number') element.oninput = () => { $(key + '-value')?.replaceChildren(document.createTextNode(element.value + (key === 'islandCameraX' ? '%' : ' dp'))); };
  element.onchange = () => {
    state[key] = typeof fallback === 'boolean' ? element.checked : typeof fallback === 'number' || key === 'islandInterval' ? Number(element.value) : element.value;
    Object.assign(state, cleanFeatures(state));
    persist(); applySettings(); syncPet();
    if (key === 'petEnabled' || key === 'islandEnabled') {
      if (window.NiulaiNative?.setOverlayEnabled) window.NiulaiNative.setOverlayEnabled(key === 'petEnabled' ? 'pet' : 'island', state[key]);
      else toast('请在安卓安装版中开启悬浮功能');
    }
  };
}

window.__niulaiSystemTheme = () => applySettings();
window.__niulaiSettingsChanged = () => {
  try {
    const restored = window.NiulaiNative?.restoreAppState?.();
    if (restored) Object.assign(state, loadState({ getItem: () => restored }));
    applySettings(); render(); refreshCounts();
  } catch { }
};
$('settings-dialog').addEventListener('close',()=>miniMotion?.configure(false,state.motion));
$('wood-tap').onclick = knockWood;
$('wood-sound').onclick = () => { state.muyuSound = !state.muyuSound; persist(); applySettings(); syncPet(); refreshCounts(); };
$('wood-round').onclick = () => {
  counts = window.NiulaiNative?.newMuyuRound ? JSON.parse(window.NiulaiNative.newMuyuRound()) : localCounts(localStorage, false, true);
  refreshCounts();
};
$('wood-floating').onclick = () => {
  state.petMode = 'muyu'; persist(); applySettings(); syncPet();
  if (window.NiulaiNative?.startPet) window.NiulaiNative.startPet();
  else toast('请在安卓安装版中开启悬浮木鱼');
};
$('island-home').onclick = () => openSettings('island');
$('muyu-settings').onclick = () => openSettings('muyu');
$('settings-motions').onclick = () => { $('settings-dialog').close(); openMotions(); };
$('settings-muyu').onclick = () => { $('settings-dialog').close(); changeTab('muyu'); };
$('settings-widget').onclick = () => $('widget-pin').click();
$('camera-permission').onclick = () => { if (window.NiulaiNative?.cameraInteractionSettings) window.NiulaiNative.cameraInteractionSettings(); else toast('请在安卓安装版中开启前摄交互'); };
$('preview-island').onclick = () => {
  if (window.NiulaiNative?.previewIsland) window.NiulaiNative.previewIsland();
  else toast('请在安卓安装版中预览悬浮灵动岛');
};
refreshCounts();
