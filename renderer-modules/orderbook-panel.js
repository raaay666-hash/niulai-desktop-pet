import { element } from './desktop-ui.js';

const fields = {
  quantity: '每腿数量（股）', lotSize: '每手股数', edgeBp: '起始净价差（bp）', maxSkewMs: '双场所最大时差（ms）',
  imbalance: '盘口失衡阈值（%）', spreadBp: '最大买卖价差（bp）',
  buyFeeBp: '买入费率（bp）', sellFeeBp: '卖出费率（bp）', minFee: '每腿最低费用', slipBp: '每腿不利滑点（bp）',
  latencyMs: '模拟延迟（ms）', maxAgeMs: '盘口最大年龄（ms）', cooldownMs: '信号冷却（ms）',
  cash: '每场所初始现金', inventoryA: '场所 A 可卖（股）', inventoryB: '场所 B 可卖（股）'
};
const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 });
const formatAmount = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const formatTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' });
const statusLabel = { filled: '已成交', unpaired: '单腿未配对', cancelled: '已取消' };
const sideLabel = { buy: '买入', sell: '卖出' };
const number = value => formatNumber.format(value);
const amount = value => formatAmount.format(value);

export function mountOrderbookPanel(view, { api, toast, selected }) {
  const get = name => view.querySelector('#ob-' + name);
  const source = get('source'), strategy = get('strategy'), form = get('setup');
  const inputs = Object.fromEntries(Object.entries(fields).map(([key, label]) => {
    const input = element('input');
    input.type = 'number';
    input.required = true;
    input.name = key;
    const field = element('label', label);
    field.append(input);
    get('parameters').append(field);
    return [key, input];
  }));
  let viewState, timer, readingGeneration, lastHistory;
  let generation = 0, busy = false, visible = false, needsStatus = true;

  function showFields() {
    const usingSnapshot = source.value === 'snapshot';
    const usingStream = source.value === 'stream';
    strategy.options[0].disabled = usingSnapshot;
    if (usingSnapshot) strategy.value = 'sweep';
    const paired = strategy.value === 'spread';
    for (const [name, show] of [['snapshot-fields', usingSnapshot], ['stream-fields', usingStream]]) {
      get(name).hidden = !show;
      get(name).disabled = !show;
    }
    if (usingSnapshot && !get('watch').value) get('watch').value = selected() || '';
    get('second-venue').hidden = !paired;
    get('venue-b').disabled = !paired;
    for (const [keys, enabled] of [[['edgeBp', 'inventoryB', 'maxSkewMs'], paired], [['imbalance', 'spreadBp'], !paired]]) {
      for (const key of keys) {
        inputs[key].parentElement.hidden = !enabled;
        inputs[key].disabled = !enabled;
      }
    }
  }

  function enableControls() {
    const running = viewState?.running;
    for (const name of ['install', 'uninstall', 'start', 'stop', 'export']) get(name).disabled = busy;
    get('fields').disabled = busy || running;
    get('uninstall').disabled = busy || running;
    get('start').hidden = Boolean(running);
    get('stop').hidden = !running;
  }

  function show(next) {
    const previous = viewState;
    viewState = next;
    needsStatus = false;
    const installed = Boolean(next.version);
    if (installed && next.version !== previous?.version) {
      for (const [key, input] of Object.entries(inputs)) {
        const [min, max, step] = next.limits[key];
        input.min = min;
        input.max = max;
        input.step = step === 1 ? '1' : 'any';
        input.value = next.defaults[key];
      }
      showFields();
    }
    get('install').hidden = installed;
    get('uninstall').hidden = !installed;
    get('empty').hidden = installed;
    form.hidden = !installed;
    get('results').hidden = !next.trial;
    const status = [installed ? '已安装 ' + next.version : '未安装', next.status].filter(Boolean).join(' · ');
    if (get('status').textContent !== status) get('status').textContent = status;
    enableControls();
    if (!next.trial) return;

    const { trial } = next;
    const { currency, stats, history, signal } = trial;
    get('note').textContent = trial.symbol + ' · ' + trial.note;
    get('note').classList.toggle('orderbook-warning', trial.paused);
    get('signal').hidden = !signal;
    if (signal) {
      const legs = signal.legs.map(leg => leg.venue + ' ' + sideLabel[leg.side]);
      const edge = signal.edgeBp === null ? '' : ' · 预估净差 ' + amount(signal.edgeBp) + ' bp';
      get('signal').textContent = '最近信号 ' + formatTime.format(signal.at) + ' · ' + legs.join(' / ') + edge;
    }
    const metrics = [
      ['有效盘口', number(stats.received)],
      ['被拒盘口', number(stats.rejected)],
      ['信号', number(stats.signals)],
      ['模拟成交 / 取消腿数', number(stats.fills) + ' / ' + number(stats.cancelled)]
    ];
    if (trial.strategy === 'spread') metrics.push(['已配对净差额', amount(stats.pairedNet) + ' ' + currency], ['未配对信号', number(stats.unpaired)]);
    get('metrics').replaceChildren(...metrics.map(([key, value]) => {
      const item = element('div');
      item.append(element('dt', key), element('dd', value));
      return item;
    }));
    get('books').replaceChildren(...trial.accounts.map(account => {
      const book = trial.books.find(item => item.venue === account.venue);
      const article = element('article');
      article.append(element('h3', account.venue));
      if (book) {
        article.append(
          element('p', '买一 ' + number(book.bid.price) + ' × ' + number(book.bid.size) + '　卖一 ' + number(book.ask.price) + ' × ' + number(book.ask.size)),
          element('p', '盘口年龄 ' + number(book.ageMs) + ' ms · 接收延迟 ' + number(book.delayMs) + ' ms', book.ageMs > trial.settings.maxAgeMs ? 'orderbook-warning' : 'muted'),
          element('p', '失衡 ' + amount(book.imbalance) + '% · 买卖价差 ' + amount(book.spreadBp) + ' bp', 'muted')
        );
      } else article.append(element('p', '等待有效盘口', 'muted'));
      article.append(element('p', '现金 ' + amount(account.cash) + ' ' + currency + ' · 持有 ' + number(account.quantity) + ' 股 · 可卖 ' + number(account.sellable) + ' 股', 'muted'));
      return article;
    }));

    const historyKey = [next.sequence, history[0]?.id, history.length].join('/');
    if (historyKey === lastHistory) return;
    lastHistory = historyKey;
    get('no-trades').hidden = history.length > 0;
    get('rows').replaceChildren(...history.slice(0, 12).map(record => {
      const row = element('tr');
      const legs = element('td', '', 'orderbook-legs');
      for (const leg of record.legs) {
        const action = leg.venue + ' ' + sideLabel[leg.side] + ' ' + number(leg.quantity) + ' 股';
        const result = leg.status === 'filled' ? '成交 ' + number(leg.price) + ' · 费用 ' + amount(leg.fee) : leg.reason;
        legs.append(element('span', action + ' · ' + result));
      }
      row.append(
        element('td', formatTime.format(record.at)),
        element('td', statusLabel[record.status], record.status === 'unpaired' ? 'orderbook-warning' : ''),
        legs, element('td', record.net === null ? '—' : amount(record.net) + ' ' + currency)
      );
      return row;
    }));
  }

  async function refresh() {
    if (!visible || busy || readingGeneration === generation) return;
    const epoch = generation;
    readingGeneration = epoch;
    try {
      const next = await api.orderbook('status');
      if (epoch === generation && !busy) show(next);
    } catch (error) {
      if (epoch === generation) get('status').textContent = '暂时无法读取插件状态';
    } finally {
      if (readingGeneration === epoch) readingGeneration = undefined;
    }
  }

  async function action(operation, input) {
    if (busy) return;
    busy = true;
    generation++;
    enableControls();
    try { show(await api.orderbook(operation, input)); }
    catch (error) { toast(error.message); }
    finally { busy = false; enableControls(); }
  }

  source.onchange = showFields;
  strategy.onchange = showFields;
  get('install').onclick = () => action('install');
  get('uninstall').onclick = () => action('uninstall');
  get('export').onclick = () => action('export');
  get('stop').onclick = () => action('stop');
  form.onsubmit = event => {
    event.preventDefault();
    void action('start', {
      source: source.value, strategy: strategy.value,
      symbol: source.value === 'snapshot' ? get('watch').value : get('symbol').value,
      currency: get('currency').value.trim().toUpperCase(), venueA: get('venue-a').value, venueB: get('venue-b').value, url: get('url').value,
      settings: Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.disabled ? viewState.defaults[key] : input.valueAsNumber]))
    });
  };
  showFields();
  return active => {
    if (active === visible) return;
    visible = active;
    clearInterval(timer);
    generation++;
    if (active) {
      needsStatus = true;
      void refresh();
      timer = setInterval(() => { if (needsStatus || viewState?.running) void refresh(); }, 350);
    }
  };
}
