import { element, fmt, signed, quotePresentation } from './desktop-ui.js';
import symbols from '../main-modules/market-symbols.js';

export async function buildQuoteSourceSettings(container, { api, toast, onSaved, isCurrent }) {
  container.append(element('p', '正在读取行情配置…', 'muted'));
  let config;
  try { config = await api.quoteSource('get'); }
  catch (error) { if (isCurrent()) container.replaceChildren(element('p', error.message, 'footnote')); return; }
  if (!isCurrent()) return;
  container.replaceChildren();
  const form = element('form', '', 'source-form');
  form.noValidate = true;
  const controls = {};
  function input(parent, key, label, value = '', type = 'text') {
    const row = element('label', '', 'source-field');
    const control = document.createElement('input');
    control.type = type; control.id = 'source-' + key; control.value = value;
    control.autocomplete = 'off'; control.spellcheck = false;
    row.append(element('span', label), control); parent.append(row); controls[key] = control;
    return control;
  }
  function select(parent, key, label, value, options) {
    const row = element('label', '', 'source-field');
    const control = document.createElement('select'); control.id = 'source-' + key;
    for (const [id, text] of options) { const option = element('option', text); option.value = id; control.append(option); }
    control.value = value;
    row.append(element('span', label), control); parent.append(row); controls[key] = control;
    return control;
  }
  select(form, 'mode', '行情来源', config.mode, [['public', '公共行情 · 新浪 / 腾讯'], ['custom', '使用自己的 HTTP JSON 接口']]);
  const fields = element('fieldset', '', 'source-options');
  input(fields, 'name', '来源名称', config.name);
  const address = input(fields, 'url', '报价接口地址', config.url);
  address.placeholder = 'https://example.com/quote?symbol={symbol}';
  fields.append(element('p', '地址支持 {symbol}、{ticker}、{code}、{market}、{exchange}。本地转接服务也可使用 HTTP 地址。', 'footnote'));
  const marketGroup = element('div', '', 'source-markets');
  marketGroup.append(element('span', '适用市场'));
  const markets = [];
  for (const [id, label] of [['cn', 'A 股'], ['hk', '港股'], ['us', '美股']]) {
    const row = element('label'), control = document.createElement('input');
    control.type = 'checkbox'; control.value = id; control.checked = config.markets.includes(id);
    row.append(control, label); marketGroup.append(row); markets.push(control);
  }
  fields.append(marketGroup, element('p', '所选市场使用自有接口，其余市场继续使用公共行情。', 'footnote'));
  const connectionGrid = element('div', '', 'source-grid');
  select(connectionGrid, 'symbolFormat', '股票代码格式', config.symbolFormat, [['ticker', '原始代码 · MP / 00700 / 600519'], ['yahoo', 'Yahoo 格式 · MP / 0700.HK / 600519.SS'], ['niulai', '牛来代码 · gb_mp / rt_hk00700']]);
  select(connectionGrid, 'interval', '此模式最短刷新间隔', String(config.interval), [[5, '5 秒'], [10, '10 秒'], [30, '30 秒'], [60, '60 秒']]);
  select(connectionGrid, 'authType', '鉴权方式', config.authType, [['none', '无需鉴权'], ['bearer', 'Authorization · Bearer'], ['header', '自定义请求头'], ['query', 'URL 查询参数']]);
  input(connectionGrid, 'authName', '请求头 / 参数名称', config.authName);
  fields.append(connectionGrid);
  const token = input(fields, 'token', 'API 密钥 / Token', '', 'password');
  token.placeholder = config.hasToken ? '已保存，留空保留现有密钥' : '仅保存在这台电脑';
  const mapping = element('details', '', 'source-mapping');
  mapping.append(element('summary', 'JSON 字段与时间设置'));
  input(mapping, 'dataPath', '报价对象路径，顶层对象留空', config.dataPath).placeholder = '例如 data.quote 或 data[0]';
  mapping.append(element('p', '字段支持 price、quote.price、data[0].price 或 /Global Quote/05. price。可选字段留空表示不读取。', 'footnote'));
  const mappingGrid = element('div', '', 'source-grid');
  const labels = { price: '现价', prevClose: '涨跌比较基准价', change: '涨跌额', changePct: '涨跌幅，百分数', timestamp: '报价时间', session: '交易时段', name: '股票名称', symbol: '股票代码', regularPrice: '常规收盘价', dayPrevClose: '今日盈亏基准价' };
  for (const [key, label] of Object.entries(labels)) input(mappingGrid, 'field-' + key, label, config.fields[key]);
  mapping.append(mappingGrid);
  const timeGrid = element('div', '', 'source-grid');
  select(timeGrid, 'timeZone', '无时区日期使用', config.timeZone, [['market', '股票所属市场时区'], ['America/New_York', '美东时间'], ['Asia/Shanghai', '北京时间'], ['UTC', 'UTC']]);
  select(timeGrid, 'defaultSession', '接口缺少交易时段时', config.defaultSession, [['regular', '作为常规报价'], ['auto', '按报价时间判断盘前 / 盘后']]);
  mapping.append(timeGrid, element('p', '时间支持 Unix 秒、Unix 毫秒、ISO 8601 或年月日时分秒。交易时段填写 pre、regular、post。盘后今日盈亏基准价应为该交易日的前收盘价。', 'footnote'));
  const example = element('pre', '{\n  "symbol": "MP", "price": 37.88,\n  "previousClose": 36.73,\n  "timestamp": "2026-11-12T13:47:00Z",\n  "session": "pre"\n}', 'source-example');
  mapping.append(example); fields.append(mapping);
  const fallback = element('label', '', 'setting-row'), fallbackInput = document.createElement('input');
  fallbackInput.type = 'checkbox'; fallbackInput.id = 'source-fallback'; fallbackInput.checked = config.fallback;
  fallback.append(element('span', '自有源失败或报价过期时，允许回退公共行情'), fallbackInput);
  fields.append(fallback, element('p', '回退时会显示实际采用的来源。来源切换后重新建立报价采样。', 'footnote'));
  input(fields, 'testCode', '测试股票', config.markets.includes('us') ? 'MP' : config.markets.includes('hk') ? '00700.HK' : '600519');
  form.append(fields);
  const status = element('p', config.error || '', 'source-status footnote'); status.id = 'source-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = element('div', '', 'source-actions');
  const test = element('button', '测试连接', 'button secondary'); test.type = 'button'; test.id = 'source-test';
  const save = element('button', '保存并使用', 'button primary'); save.type = 'submit'; save.id = 'source-save';
  actions.append(test, save);
  if (config.url) {
    const clear = element('button', '清除自有源配置', 'link-button'); clear.type = 'button'; clear.id = 'source-clear';
    clear.onclick = () => run(async () => { await api.quoteSource('clear'); toast('已清除自有源配置'); onSaved(); });
    actions.append(clear);
  }
  form.append(status, actions); container.append(form);
  function updateVisibility() {
    fields.hidden = controls.mode.value !== 'custom'; test.hidden = fields.hidden;
    controls.authName.disabled = !['header', 'query'].includes(controls.authType.value);
    token.disabled = controls.authType.value === 'none';
  }
  controls.mode.onchange = updateVisibility; controls.authType.onchange = updateVisibility; updateVisibility();
  function payload() {
    return {
      ...Object.fromEntries(Object.entries(controls).filter(([key]) => !key.startsWith('field-')).map(([key, control]) => [key, control.value])),
      fields: Object.fromEntries(Object.keys(labels).map(key => [key, controls['field-' + key].value])),
      markets: markets.filter(control => control.checked).map(control => control.value),
      fallback: fallbackInput.checked, testCode: symbols.normalizeMarketSymbol(controls.testCode.value)
    };
  }
  async function run(task) {
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    status.textContent = '正在处理…';
    try { await task(); }
    catch (error) { status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally { for (const button of actions.querySelectorAll('button')) button.disabled = false; }
  }
  test.onclick = () => run(async () => {
    const result = await api.quoteSource('test', payload());
    const presentation = quotePresentation(result, Number(controls.interval.value));
    const percent = Number.isFinite(result.quote.changePct) ? signed(result.quote.changePct) + '%' : '涨跌幅未提供';
    status.textContent = `连接成功 · ${result.quote.name} ${fmt(result.quote.price)} · ${percent} · ${presentation.summary}`;
  });
  form.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const result = await api.quoteSource('save', payload());
      toast(result.mode === 'public' ? '已使用公共行情' : result.storedSecurely ? '已启用自有源，配置已加密保存在本机' : '已启用自有源，本机安全存储不可用，本次运行有效');
      token.value = ''; onSaved();
    });
  };
}
