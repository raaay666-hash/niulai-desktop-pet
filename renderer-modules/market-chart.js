import { chartPeriods, loadChart, movingAverage, chartChange, compactVolume } from '../niulai-android/web/market-chart-data.mjs';

const price = value => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—';
const percent = value => Number.isFinite(value) ? (value > 0 ? '+' : '') + value.toFixed(2) + '%' : '—';
const averageColors = ['#bf840d', '#6f7fe8', '#ba68b2'];

export class MarketChart {
  constructor(root, request) {
    this.root = root;
    this.request = request;
    this.period = 'day';
    this.code = '';
    this.epoch = 0;
    this.count = 60;
    this.offset = 0;
    this.hover = null;
    this.cache = new Map();
    root.classList.add('market-chart');
    root.innerHTML = `
      <div class="market-chart-heading"><h2>行情走势</h2><div class="market-periods" role="group" aria-label="K 线周期">${Object.entries(chartPeriods).map(([key, label]) => `<button type="button" data-period="${key}" aria-pressed="${key === 'day'}">${label}</button>`).join('')}</div></div>
      <div class="market-chart-toolbar"><span class="market-chart-basis"></span><div><button type="button" data-zoom="out" aria-label="缩小 K 线">−</button><button type="button" data-zoom="in" aria-label="放大 K 线">＋</button><button type="button" class="market-latest">最近</button><button type="button" class="market-retry" aria-label="刷新历史 K 线">刷新</button></div></div>
      <div class="market-chart-stats" aria-live="off"></div>
      <div class="market-ma" aria-label="移动平均线"></div>
      <div class="market-plot"><canvas tabindex="0" role="img" aria-label="股票 K 线和成交量，左右方向键查看，Home 和 End 跳至首尾"></canvas><div class="market-chart-empty" role="status"></div></div>
      <div class="market-chart-range"><input type="range" min="0" max="0" value="0" step="1" aria-label="浏览历史 K 线区间"></div>
      <p class="market-chart-source" role="status"></p>`;
    this.canvas = root.querySelector('canvas');
    this.status = root.querySelector('.market-chart-source');
    this.empty = root.querySelector('.market-chart-empty');
    this.range = root.querySelector('input');
    root.querySelectorAll('[data-period]').forEach(button => button.onclick = () => {
      this.period = button.dataset.period;
      this.offset = 0;
      this.hover = null;
      this.load();
    });
    root.querySelector('.market-retry').onclick = () => this.load(true);
    root.querySelector('.market-latest').onclick = () => { this.offset = 0; this.hover = null; this.draw(); };
    root.querySelectorAll('[data-zoom]').forEach(button => button.onclick = () => {
      this.count = Math.max(20, Math.min(160, this.count + (button.dataset.zoom === 'in' ? -20 : 20)));
      this.hover = null;
      this.draw();
    });
    this.range.oninput = () => { this.offset = Number(this.range.max) - Number(this.range.value); this.hover = null; this.draw(); };
    this.canvas.addEventListener('pointermove', event => this.point(event));
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.focus({ preventScroll: true });
      this.point(event);
    });
    this.canvas.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') { this.hover = null; this.draw(); } });
    this.canvas.addEventListener('keydown', event => this.key(event));
    if (typeof ResizeObserver === 'function') {
      this.resize = new ResizeObserver(() => this.draw());
      this.resize.observe(root);
    } else {
      window.addEventListener('resize', () => this.draw());
    }
    this.theme = new MutationObserver(() => this.draw());
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  update(code, active = true) {
    const changed = this.code !== code;
    const resumed = active && !this.active;
    this.active = active;
    if (changed) {
      this.code = code;
      this.result = null;
      this.loading = false;
      this.offset = 0;
      this.hover = null;
      this.lastAttempt = 0;
      ++this.epoch;
    }
    if (!active) return;
    if (changed || !this.loading && (resumed || Date.now() - (this.lastAttempt || 0) >= 60000)) this.load();
    else this.draw();
  }

  async load(force = false) {
    const ticket = ++this.epoch;
    const code = this.code, period = this.period, key = code + ',' + period;
    if (!code || !this.active) return;
    this.lastAttempt = Date.now();
    this.result = this.cache.get(key) || null;
    this.loading = false;
    this.error = '';
    this.draw();
    if (!force && this.result && Date.now() - this.result.received < 60000) return;
    this.loading = true;
    this.draw();
    try {
      const result = await loadChart(this.request, code, period);
      if (ticket !== this.epoch) return;
      this.cache.delete(key);
      this.cache.set(key, result);
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
      this.result = result;
    } catch (error) {
      if (ticket !== this.epoch) return;
      this.error = String(error.message || '历史行情连接失败').replace(/^Error invoking remote method '[^']+': Error: /, '');
    } finally {
      if (ticket === this.epoch) { this.loading = false; this.draw(); }
    }
  }

  point(event) {
    if (!this.geometry) return;
    const { left, width } = this.canvas.getBoundingClientRect();
    const { start, size, plotWidth } = this.geometry;
    const x = (event.clientX - left) * this.geometry.width / width;
    this.hover = start + Math.max(0, Math.min(size - 1, Math.floor((x - 8) / plotWidth * size)));
    this.draw();
  }

  key(event) {
    const bars = this.result?.bars;
    if (!bars?.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = this.hover ?? bars.length - this.offset - 1;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = bars.length - 1;
    else index += event.key === 'ArrowLeft' ? -1 : 1;
    this.hover = Math.max(0, Math.min(bars.length - 1, index));
    if (this.hover < this.geometry.start) this.offset = bars.length - this.count - this.hover;
    if (this.hover >= this.geometry.start + this.geometry.size) this.offset = bars.length - this.hover - 1;
    this.draw();
  }

  draw() {
    const bars = this.result?.bars || [];
    const ready = bars.length > 0;
    this.root.setAttribute('aria-busy', String(Boolean(this.loading)));
    for (const button of this.root.querySelectorAll('[data-period]')) button.setAttribute('aria-pressed', String(button.dataset.period === this.period));
    this.root.querySelector('.market-retry').disabled = Boolean(this.loading);
    this.root.querySelector('.market-chart-basis').textContent = ready ? (this.result.adjusted ? '前复权' : '不复权') + ' · 成交量/' + this.result.volumeUnit : '';
    this.empty.hidden = ready;
    this.empty.textContent = this.loading ? '正在获取历史 K 线…' : this.error || '等待历史行情';
    this.status.textContent = this.loading ? '正在更新腾讯历史行情…' : this.error ? this.error + (ready ? ' · 保留上次数据' : ' · 点击刷新重试') : ready ? '腾讯历史行情 · 截至 ' + bars[bars.length - 1].date + ' · 获取于 ' + new Date(this.result.received).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    this.offset = Math.max(0, Math.min(Math.max(0, bars.length - this.count), this.offset));
    this.range.max = String(Math.max(0, bars.length - this.count));
    this.range.value = String(Number(this.range.max) - this.offset);
    this.range.disabled = !ready || bars.length <= this.count;
    this.root.querySelector('[data-zoom="in"]').disabled = !ready || this.count <= 20;
    this.root.querySelector('[data-zoom="out"]').disabled = !ready || this.count >= 160;
    this.root.querySelector('.market-latest').disabled = !ready || this.offset === 0;
    const width = this.canvas.clientWidth;
    if (!width) return;
    const height = 300, ratio = Math.min(devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const ctx = this.canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    this.geometry = null;
    const stats = this.root.querySelector('.market-chart-stats');
    const ma = this.root.querySelector('.market-ma');
    if (!ready) { stats.replaceChildren(); ma.replaceChildren(); return; }
    const end = bars.length - this.offset, start = Math.max(0, end - this.count);
    const visible = bars.slice(start, end), size = visible.length;
    const selected = Math.max(start, Math.min(end - 1, this.hover ?? end - 1));
    const bar = bars[selected];
    stats.replaceChildren();
    for (const [label, value] of [['日期', bar.date], ['开', price(bar.open)], ['高', price(bar.high)], ['低', price(bar.low)], ['收', price(bar.close)], ['涨跌', percent(chartChange(bars, selected))], ['量', compactVolume(bar.volume) + this.result.volumeUnit]]) {
      const cell = document.createElement('span');
      const small = document.createElement('small'); small.textContent = label;
      const strong = document.createElement('b'); strong.textContent = value;
      cell.append(small, strong); stats.append(cell);
    }
    ma.replaceChildren();
    for (const [index, length] of [5, 10, 20].entries()) {
      const label = document.createElement('span'); label.className = 'market-ma-' + index;
      label.textContent = 'MA' + length + ' ' + price(movingAverage(bars, selected, length));
      ma.append(label);
    }
    const style = getComputedStyle(this.root);
    const color = name => style.getPropertyValue(name).trim();
    const ink = color('--chart-ink'), muted = color('--muted'), line = color('--line');
    const rise = color('--chart-rise'), fall = color('--chart-fall');
    const left = 8, right = 68, top = 12, bottom = 210, volumeTop = 235, volumeBottom = 278;
    const plotWidth = Math.max(20, width - left - right), step = plotWidth / size;
    const values = [];
    for (const item of visible) values.push(item.low, item.high);
    for (let index = start; index < end; index++) {
      for (const length of [5, 10, 20]) { const value = movingAverage(bars, index, length); if (value != null) values.push(value); }
    }
    const rawMin = Math.min(...values), rawMax = Math.max(...values);
    const padding = Math.max((rawMax - rawMin) * .08, Math.abs(rawMax) * .002, .01);
    const min = rawMin - padding, max = rawMax + padding;
    const y = value => bottom - (value - min) / (max - min) * (bottom - top);
    const x = index => left + (index - start + .5) * step;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let index = 0; index <= 4; index++) {
      const value = min + (max - min) * index / 4, py = y(value);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + plotWidth, py); ctx.stroke();
      ctx.fillStyle = muted; ctx.fillText(price(value), left + plotWidth + 7, py);
    }
    const maxVolume = Math.max(1, ...visible.map(item => item.volume || 0));
    ctx.fillStyle = muted; ctx.fillText('成交量', left, volumeTop - 10);
    ctx.textAlign = 'right'; ctx.fillText(compactVolume(maxVolume), width - 3, volumeTop); ctx.textAlign = 'left';
    for (let index = start; index < end; index++) {
      const item = bars[index], px = x(index), body = Math.max(1, step * .62);
      ctx.strokeStyle = ctx.fillStyle = item.close >= item.open ? rise : fall;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, y(item.high)); ctx.lineTo(px, y(item.low)); ctx.stroke();
      const py = Math.min(y(item.open), y(item.close)), bodyHeight = Math.max(1, Math.abs(y(item.close) - y(item.open)));
      if (item.close > item.open && body > 3) ctx.strokeRect(px - body / 2, py, body, bodyHeight);
      else ctx.fillRect(px - body / 2, py, body, bodyHeight);
      if (item.volume != null) ctx.fillRect(px - body / 2, volumeBottom - item.volume / maxVolume * (volumeBottom - volumeTop), body, Math.max(1, item.volume / maxVolume * (volumeBottom - volumeTop)));
    }
    for (const [lineIndex, length] of [5, 10, 20].entries()) {
      ctx.beginPath(); ctx.strokeStyle = averageColors[lineIndex]; ctx.lineWidth = 1.2;
      let begun = false;
      for (let index = start; index < end; index++) {
        const value = movingAverage(bars, index, length);
        if (value == null) continue;
        if (begun) ctx.lineTo(x(index), y(value)); else { ctx.moveTo(x(index), y(value)); begun = true; }
      }
      ctx.stroke();
    }
    if (this.hover != null) {
      ctx.strokeStyle = muted; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x(selected), top); ctx.lineTo(x(selected), volumeBottom); ctx.moveTo(left, y(bar.close)); ctx.lineTo(left + plotWidth, y(bar.close)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x(selected), y(bar.close), 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = muted;
    ctx.fillText(visible[0].date, left, 294);
    ctx.textAlign = 'right'; ctx.fillText(visible[visible.length - 1].date, left + plotWidth, 294);
    this.canvas.setAttribute('aria-label', `${this.code} ${chartPeriods[this.period]}，${bar.date}，开 ${price(bar.open)}，高 ${price(bar.high)}，低 ${price(bar.low)}，收 ${price(bar.close)}，成交量 ${compactVolume(bar.volume)}${this.result.volumeUnit}。左右方向键查看，Home 和 End 跳至首尾`);
    this.geometry = { start, size, plotWidth, width };
  }
}
