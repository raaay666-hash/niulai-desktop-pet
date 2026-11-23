import marketSymbols from '../main-modules/market-symbols.js';
import quoteTime from '../main-modules/quote-time.js';
import { element, fmt, marketPrice, quoteHealth, setText, signed, tone } from './desktop-ui.js';

const { displaySymbol, marketForSymbol } = marketSymbols;
const { marketClock } = quoteTime;
const marketNames = { cn: 'A 股', hk: '港股', us: '美股' };
const currency = { cn: 'CNY', hk: 'HKD', us: 'USD' };
const sessionLabels = { pre: '盘前', regular: '常规交易', post: '盘后' };
const clockPrecision = { minute: {}, second: { second: '2-digit' }, millisecond: { second: '2-digit', fractionalSecondDigits: 3 } };
const MAX_SAMPLES = 60;
const PLAY_INTERVAL = 600;
const clockFormats = new Map();

function selectField(id, label, options = []) {
  const wrapper = element('label', '', 'dp-field');
  const input = element('select');
  input.id = id;
  wrapper.htmlFor = id;
  wrapper.append(element('span', label), input);
  for (const [value, title] of options) input.add(new Option(title, value));
  return { wrapper, input };
}

function playbackButton(id, label) {
  const action = element('button', label, 'secondary dp-button');
  action.id = id;
  action.type = 'button';
  return action;
}

function panelHeading(id, title, controls) {
  const heading = element('header', '', 'dp-heading');
  const label = element('h2', title);
  label.id = id;
  heading.append(label, controls);
  return heading;
}

function priceTime(at, zone, precision = 'millisecond') {
  const level = Object.hasOwn(clockPrecision, precision) ? precision : 'millisecond';
  const key = `${zone}/${level}`;
  if (!clockFormats.has(key)) {
    clockFormats.set(key, new Intl.DateTimeFormat('zh-CN', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...clockPrecision[level]
    }));
  }
  return clockFormats.get(key).format(at);
}

function priceAxis(samples) {
  const values = samples.map(sample => sample.price);
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const padding = minimum === maximum ? maximum * .001 : Math.max(0, maximum * 1e-12 - (maximum - minimum));
  const low = Math.max(0, minimum - padding), high = maximum + padding;
  const stepTarget = (high - low) / 4;
  const exponent = Math.floor(Math.log10(stepTarget));
  const unit = 10 ** exponent;
  const factor = [1, 2, 2.5, 5, 10].find(candidate => candidate >= stepTarget / unit) || 10;
  const step = factor * unit;
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(high + step)) {
    return { low: minimum, high: maximum, ticks: [...new Set([minimum, maximum])], digits: 11 };
  }
  const first = Math.floor(low / step), last = Math.ceil(high / step);
  const ticks = Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step);
  const digits = Math.max(0, -exponent + (factor === 2.5 ? 1 : factor === 10 ? -1 : 0));
  return { low: ticks[0], high: ticks.at(-1), ticks, digits };
}

function chartPrice(value, code, digits, axis = false) {
  const precision = Math.max(code.startsWith('rt_hk') ? 3 : 2, digits);
  if (precision > 10 && value) {
    const magnitude = Math.floor(Math.log10(Math.abs(value)));
    return value.toExponential(Math.min(14, Math.max(2, precision + magnitude)));
  }
  return !axis && precision <= 4 ? marketPrice(value, code) : fmt(value, precision);
}

function recordedSession(sample, clock) {
  const boundary = sample.at % 60000 === 0 && clock.phase !== 'weekend';
  if (clock.market === 'us') {
    if (Object.hasOwn(sessionLabels, clock.phase)) {
      return Object.hasOwn(sessionLabels, sample.session) ? sample.session : clock.phase;
    }
    return boundary && clock.minuteOfDay === 1200 && sample.session === 'post' ? 'post' : '';
  }
  const regularCloses = clock.market === 'hk' ? [720, 960] : [690, 900];
  return clock.phase === 'regular' || boundary && regularCloses.includes(clock.minuteOfDay) ? 'regular' : '';
}

function latestSession(code, raw) {
  let session;
  const samples = [];
  for (const sample of raw.slice(-MAX_SAMPLES).reverse()) {
    if (!Number.isSafeInteger(sample?.at) || sample.at <= 0 || sample.at > 8.64e15 ||
        !Number.isFinite(sample?.price) || sample.price <= 0) continue;
    const clock = marketClock(code, sample.at);
    const phase = recordedSession(sample, clock);
    if (!phase) continue;
    const key = [clock.dateKey, phase, clock.market !== 'us' && clock.minuteOfDay >= 780].join('/');
    if (session && session.key !== key) break;
    const previous = samples.at(-1);
    if (sample.at === previous?.at && sample.price === previous.price) continue;
    session ||= { key, date: clock.dateKey, phase, zone: clock.zone };
    samples.push(sample);
  }
  return { session, samples: samples.reverse(), axis: samples.length ? priceAxis(samples) : null };
}

function drawTimeTicks(context, points, bounds, zone, millisecondLabels) {
  const times = Array.from(new Map(points.map(point => [point.at, point])).values());
  const candidates = [times[0], times.at(-1)];
  for (const fraction of [.25, .5, .75]) {
    const x = bounds.left + (bounds.right - bounds.left) * fraction;
    candidates.push(times.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best));
  }
  const placed = [];
  for (const point of new Set(candidates)) {
    const precision = point.timePrecision || 'millisecond';
    const label = priceTime(point.at, zone, !millisecondLabels && precision === 'millisecond' ? 'second' : precision);
    const width = context.measureText(label).width;
    const start = Math.max(bounds.left, Math.min(bounds.right - width, point.x - width / 2));
    if (width > bounds.right - bounds.left || placed.some(mark => start < mark.end + 10 && start + width > mark.start - 10)) continue;
    placed.push({ start, end: start + width });
    context.fillText(label, start, bounds.bottom + 17);
    context.beginPath();
    context.moveTo(point.x, bounds.bottom);
    context.lineTo(point.x, bounds.bottom + 5);
    context.stroke();
  }
}

function drawReplay(canvas, frame, cursor, code) {
  const { samples, session, axis } = frame;
  const context = canvas.getContext('2d');
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!context || width <= 0 || height <= 0) return null;
  const step = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * step)) canvas.width = Math.round(width * step);
  if (canvas.height !== Math.round(height * step)) canvas.height = Math.round(height * step);
  context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  context.clearRect(0, 0, width, height);
  const style = getComputedStyle(canvas);
  const color = name => style.getPropertyValue(name).trim();
  context.font = `11px ${style.fontFamily}`;
  const prices = axis.ticks.map(tick => chartPrice(tick, code, axis.digits, true));
  const bounds = {
    left: Math.ceil(Math.max(...prices.map(label => context.measureText(label).width))) + 18,
    right: width - 13, top: 13, bottom: height - 26
  };
  if (bounds.right <= bounds.left) return null;
  const yAt = price => axis.low === axis.high ? (bounds.top + bounds.bottom) / 2 :
    bounds.bottom - (price - axis.low) / (axis.high - axis.low) * (bounds.bottom - bounds.top);
  const firstAt = samples[0].at;
  const span = samples.at(-1).at - firstAt;
  const points = samples.map(sample => ({
    ...sample,
    x: span ? bounds.left + (sample.at - firstAt) / span * (bounds.right - bounds.left) : (bounds.left + bounds.right) / 2,
    y: yAt(sample.price)
  }));

  context.strokeStyle = color('--line');
  context.fillStyle = color('--muted');
  context.lineWidth = 1;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.beginPath();
  axis.ticks.forEach((price, index) => {
    const y = yAt(price);
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
    context.fillText(prices[index], bounds.left - 8, y);
  });
  context.stroke();
  context.textAlign = 'left';
  drawTimeTicks(context, points, bounds, session.zone, span < 20000);

  context.strokeStyle = color('--blue');
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const next of points.slice(1)) context.lineTo(next.x, next.y);
  context.stroke();
  const point = points[cursor];
  context.strokeStyle = color('--muted');
  context.lineWidth = 1;
  context.setLineDash([3, 4]);
  context.beginPath();
  context.moveTo(point.x, bounds.top);
  context.lineTo(point.x, bounds.bottom);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color('--blue');
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color('--surface');
  context.lineWidth = 2;
  context.stroke();
  return { points, bounds };
}

export function mountDesktopPlugins(root, { select }) {
  const heatmap = element('section', '', 'card dp-panel');
  heatmap.dataset.pluginPanel = 'heatmap';
  heatmap.setAttribute('aria-labelledby', 'dp-heatmap-title');
  const market = selectField('dp-heatmap-market', '市场', [['all', '全部市场'], ...Object.entries(marketNames)]);
  const sorting = selectField('dp-heatmap-sort', '排序', [
    ['descending', '涨幅优先'], ['ascending', '跌幅优先'], ['magnitude', '按波动幅度'], ['watchlist', '自选顺序']
  ]);
  const heatControls = element('div', '', 'dp-controls');
  heatControls.append(market.wrapper, sorting.wrapper);
  const heatSummary = element('p', '', 'dp-context muted');
  const heatHeader = element('div', '', 'dp-heat-header dp-heat-grid');
  const heatScale = element('span');
  heatHeader.append(element('span', '标的'), heatScale, element('span', '涨跌幅'));
  const heatRows = element('ul', '', 'dp-heat-rows');
  const heatEmpty = element('p', '当前市场暂无自选标的。', 'dp-empty muted');
  heatmap.append(panelHeading('dp-heatmap-title', '自选热图', heatControls), heatSummary, heatHeader, heatRows, heatEmpty);

  const replay = element('section', '', 'card dp-panel');
  replay.dataset.pluginPanel = 'replay';
  replay.setAttribute('aria-labelledby', 'dp-replay-title');
  const symbol = selectField('dp-replay-symbol', '标的');
  const replayControls = element('div', '', 'dp-controls');
  replayControls.append(symbol.wrapper);
  const replayBody = element('div', '', 'dp-replay-body');
  const reading = element('div', '', 'dp-replay-reading');
  const readingPrice = element('strong', '', 'dp-reading-price');
  readingPrice.id = 'dp-replay-price';
  const readingTime = element('time', '', 'dp-reading-time muted');
  const readingContext = element('p', '', 'dp-context muted');
  reading.append(readingPrice, readingTime, readingContext);
  const chart = element('div', '', 'dp-replay-chart');
  const canvas = element('canvas', '', 'dp-replay-canvas');
  canvas.id = 'dp-replay-chart';
  canvas.title = '点击定位报价样本';
  canvas.setAttribute('aria-hidden', 'true');
  const tooltip = element('div', '', 'dp-chart-tooltip');
  tooltip.hidden = true;
  tooltip.setAttribute('aria-hidden', 'true');
  const tooltipPrice = element('strong'), tooltipTime = element('span', '', 'muted');
  tooltip.append(tooltipPrice, tooltipTime);
  chart.append(canvas, tooltip);
  const timeline = element('div', '', 'dp-replay-timeline');
  const play = playbackButton('dp-replay-play', '播放');
  const latest = playbackButton('dp-replay-latest', '最新样本');
  const slider = element('input', '', 'dp-slider');
  slider.id = 'dp-replay-progress';
  slider.type = 'range';
  slider.min = '0';
  slider.step = '1';
  slider.setAttribute('aria-label', '回放进度');
  const sampleCount = element('span', '', 'dp-sample-count muted');
  timeline.append(play, slider, sampleCount, latest);
  replayBody.append(reading, chart, timeline);
  const replayEmpty = element('p', '', 'dp-empty muted');
  replay.append(panelHeading('dp-replay-title', '报价回放', replayControls), replayBody, replayEmpty);
  root.replaceChildren(heatmap, replay);

  let data, active = null;
  let rowsByCode = new Map(), heatOrder = '';
  let code = '', symbolOptions = '';
  let sourceSamples = [], frame = { session: null, samples: [] };
  let frozen = false, cursor = 0, timer = null;
  let chartFrame, chartCursor, chartKey, plot, pointer;
  const stocks = () => data?.state?.stocks || [];

  function makeHeatRow(stockCode) {
    const row = element('li');
    const button = element('button', '', 'dp-heat-grid dp-heat-row');
    button.type = 'button';
    button.dataset.heatStock = stockCode;
    button.onclick = () => select(stockCode);
    const heading = element('span', '', 'dp-stock');
    const name = element('strong');
    const metadata = element('span', '', 'dp-stock-meta');
    const symbolLabel = element('small', displaySymbol(stockCode), 'muted');
    const delayed = element('small', '行情延迟', 'dp-stock-delayed');
    metadata.append(symbolLabel, delayed);
    heading.append(name, metadata);
    const track = element('span', '', 'dp-change-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = element('span', '', 'dp-change-bar');
    track.append(bar);
    const change = element('span', '', 'dp-change-value');
    button.append(heading, track, change);
    row.append(button);
    return { row, button, name, delayed, bar, change };
  }

  function renderHeatmap() {
    const watched = stocks();
    const now = Date.now();
    const interval = data?.state?.settings?.interval;
    const rows = watched.filter(stock => market.input.value === 'all' || marketForSymbol(stock.code) === market.input.value)
      .map(stock => {
        const entry = data?.quotes?.[stock.code];
        const health = entry?.quote ? quoteHealth(entry, interval, now) : null;
        return { stock, change: entry?.quote?.changePct, delay: health?.warning ? health.message : '' };
      });
    if (sorting.input.value !== 'watchlist') {
      const order = sorting.input.value;
      const key = value => order === 'magnitude' ? -Math.abs(value) : order === 'ascending' ? value : -value;
      rows.sort((a, b) =>
        (Number.isFinite(a.change) ? key(a.change) : Infinity) -
        (Number.isFinite(b.change) ? key(b.change) : Infinity));
    }
    const available = rows.filter(row => Number.isFinite(row.change));
    const scale = Math.max(1, ...available.map(row => Math.ceil(Math.abs(row.change) * 10) / 10));
    const delayed = rows.filter(row => row.delay).length;
    setText(heatSummary, `${rows.length} 只自选 · ${available.length} 只有涨跌幅` + (delayed ? ` · ${delayed} 只行情延迟` : ''));
    setText(heatScale, `跌 / 涨 · ±${fmt(scale, 1)}%`);
    heatEmpty.hidden = rows.length > 0;
    heatHeader.hidden = rows.length === 0;
    const next = new Map();
    for (const { stock, change, delay } of rows) {
      const row = rowsByCode.get(stock.code) || makeHeatRow(stock.code);
      const movement = tone(change);
      row.bar.className = `dp-change-bar ${movement}`;
      row.bar.style.setProperty('--dp-change-width', `${Number.isFinite(change) ? Math.abs(change) / scale * 50 : 0}%`);
      setText(row.name, stock.name || displaySymbol(stock.code));
      row.delayed.hidden = !delay;
      row.delayed.title = delay;
      row.button.classList.toggle('dp-stale', Boolean(delay));
      setText(row.change, Number.isFinite(change) ? signed(change) + '%' : '—');
      row.change.className = `dp-change-value ${movement}`;
      if (stock.code === data?.state?.selected) row.button.setAttribute('aria-current', 'true');
      else row.button.removeAttribute('aria-current');
      next.set(stock.code, row);
    }
    rowsByCode = next;
    const order = [...next.keys()].join(',');
    if (order !== heatOrder) {
      const focused = heatRows.contains(document.activeElement) ? document.activeElement : null;
      heatRows.replaceChildren(...Array.from(next.values(), row => row.row));
      if (heatRows.contains(focused)) focused.focus({ preventScroll: true });
      heatOrder = order;
    }
  }

  function pause() {
    clearTimeout(timer);
    timer = null;
    setText(play, '播放');
  }

  function setSymbol(next) {
    pause();
    hideTooltip();
    code = next;
    sourceSamples = [];
    frame = { session: null, samples: [] };
    frozen = false;
    cursor = 0;
  }

  function hideTooltip() {
    pointer = null;
    tooltip.hidden = true;
  }

  function nearestPoint(position) {
    if (!plot || position.x < plot.bounds.left - 4 || position.x > plot.bounds.right + 4 ||
        position.y < plot.bounds.top - 4 || position.y > plot.bounds.bottom + 4) return -1;
    let selected = -1, bestX = Infinity, bestY = Infinity;
    plot.points.forEach((point, index) => {
      const x = Math.abs(point.x - position.x), y = Math.abs(point.y - position.y);
      if (x < bestX || x === bestX && y < bestY) {
        selected = index;
        bestX = x;
        bestY = y;
      }
    });
    return selected;
  }

  function renderTooltip() {
    const index = pointer ? nearestPoint(pointer) : -1;
    if (index < 0) { tooltip.hidden = true; return; }
    const point = plot.points[index];
    setText(tooltipPrice, chartPrice(point.price, code, frame.axis.digits));
    const time = priceTime(point.at, frame.session.zone, point.timePrecision);
    setText(tooltipTime, (point.receivedTime ? '本机接收 ' : '') + time);
    tooltip.hidden = false;
    const x = Math.max(5, Math.min(canvas.clientWidth - tooltip.offsetWidth - 5, point.x + 10));
    const above = point.y - tooltip.offsetHeight - 9;
    tooltip.style.left = x + 'px';
    tooltip.style.top = (above > 4 ? above : point.y + 9) + 'px';
  }

  function renderChart() {
    if (active !== 'replay' || !frame.samples.length) return;
    const key = [
      data?.state?.settings?.theme, data?.dark, data?.accent,
      canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio
    ].join('/');
    if (chartFrame === frame && chartCursor === cursor && chartKey === key) return;
    plot = drawReplay(canvas, frame, cursor, code);
    chartFrame = frame;
    chartCursor = cursor;
    chartKey = key;
    renderTooltip();
  }

  const chartSize = new ResizeObserver(renderChart);

  function renderReplay() {
    const watched = stocks();
    const choices = JSON.stringify(watched.map(stock => [stock.code, stock.name]));
    if (choices !== symbolOptions) {
      symbol.input.replaceChildren(...watched.map(stock =>
        new Option(`${stock.name || displaySymbol(stock.code)} · ${displaySymbol(stock.code)}`, stock.code)));
      symbolOptions = choices;
    }
    if (!watched.some(stock => stock.code === code)) {
      setSymbol(watched.find(stock => stock.code === data?.state?.selected)?.code || watched[0]?.code || '');
    }
    symbol.input.disabled = !code;
    symbol.input.value = code;
    const latestSamples = data?.histories?.[code] || [];
    if (!frozen && (sourceSamples.length !== latestSamples.length ||
        !sourceSamples.every((sample, index) => {
          const item = latestSamples[index];
          return sample?.at === item?.at && sample?.price === item?.price && sample?.timePrecision === item?.timePrecision &&
            sample?.receivedTime === item?.receivedTime && sample?.session === item?.session;
        }))) {
      sourceSamples = latestSamples;
      frame = latestSession(code, latestSamples);
      cursor = Math.max(0, frame.samples.length - 1);
    }
    const { session, samples } = frame;
    const sample = samples[cursor];
    const available = samples.length >= 2;
    replayBody.hidden = !sample;
    replayEmpty.hidden = available;
    setText(replayEmpty, !code ? '添加自选标的后可回放报价。' :
      sample ? '同一交易时段积累至少两条报价后可播放。' : '本次运行还没有采集到交易时段报价。');
    play.disabled = !available;
    latest.disabled = !frozen;
    slider.disabled = !available;
    if (!sample) return;
    slider.max = String(samples.length - 1);
    slider.value = String(cursor);
    const clock = priceTime(sample.at, session.zone, sample.timePrecision);
    const position = `${cursor + 1} / ${samples.length}`;
    slider.setAttribute('aria-valuetext', position + ' · ' + clock);
    setText(sampleCount, position);
    setText(readingPrice, `${chartPrice(sample.price, code, frame.axis.digits)} ${currency[marketForSymbol(code)]}`);
    setText(readingTime, (sample.receivedTime ? '本机接收 ' : '') + clock + (session.zone === 'America/New_York' ? ' 美东' : ' UTC+8'));
    readingTime.dateTime = new Date(sample.at).toISOString();
    setText(readingContext, `${session.date} · ${sessionLabels[session.phase]} · 本次运行采集`);
    renderChart();
  }

  function advance() {
    cursor++;
    if (cursor >= frame.samples.length - 1) pause();
    else timer = setTimeout(advance, PLAY_INTERVAL);
    renderReplay();
  }

  market.input.onchange = renderHeatmap;
  sorting.input.onchange = renderHeatmap;
  symbol.input.onchange = () => { setSymbol(symbol.input.value); renderReplay(); };
  function seek(index) {
    if (!Number.isInteger(index) || index < 0 || index >= frame.samples.length) return;
    pause();
    frozen = true;
    cursor = index;
    renderReplay();
  }

  const canvasPoint = event => {
    const rectangle = canvas.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  };
  canvas.onpointermove = event => {
    pointer = canvasPoint(event);
    renderTooltip();
  };
  canvas.onpointerleave = hideTooltip;
  canvas.onclick = event => seek(nearestPoint(canvasPoint(event)));
  slider.oninput = () => seek(slider.valueAsNumber);
  latest.onclick = () => {
    pause();
    frozen = false;
    cursor = frame.samples.length - 1;
    renderReplay();
  };
  play.title = '依次播放样本';
  play.onclick = () => {
    if (timer !== null) {
      pause();
    } else if (frame.samples.length >= 2) {
      frozen = true;
      if (cursor === frame.samples.length - 1) cursor = 0;
      timer = setTimeout(advance, PLAY_INTERVAL);
      setText(play, '暂停');
    }
    renderReplay();
  };

  function render() {
    if (active === 'heatmap') renderHeatmap();
    else if (active === 'replay') renderReplay();
  }

  heatmap.hidden = replay.hidden = root.hidden = true;
  return {
    update(snapshot) {
      data = snapshot;
      if (snapshot?.suspended && timer !== null) pause();
      render();
    },
    setActive(panel) {
      if (panel === active) return;
      pause();
      hideTooltip();
      chartSize.disconnect();
      active = panel;
      heatmap.hidden = panel !== 'heatmap';
      replay.hidden = panel !== 'replay';
      root.hidden = heatmap.hidden && replay.hidden;
      if (panel === 'replay') chartSize.observe(canvas);
      render();
    }
  };
}
