import { element, marketPrice } from './desktop-ui.js';
import { compactVolume } from '../niulai-android/web/market-chart-data.mjs';

class PanelResource {
  constructor(paint) {
    this.paint = paint;
    this.cache = new Map();
  }

  update({ key, active, request, interval, force = false }) {
    this.key = key;
    this.active = active;
    if (!active || !key) return;
    const record = this.cache.get(key) || { attempted: -Infinity };
    if (record.loading || !force && Date.now() - record.attempted < interval) {
      this.paint(record);
      return;
    }
    record.loading = true;
    record.error = false;
    record.attempted = Date.now();
    this.cache.delete(key);
    this.cache.set(key, record);
    if (this.cache.size > 52) this.cache.delete(this.cache.keys().next().value);
    this.paint(record);
    request().then(result => { record.result = result; }, () => { record.error = true; }).finally(() => {
      record.loading = false;
      if (this.active && this.key === key) this.paint(record);
    });
  }
}

const marketZone = code => code.startsWith('gb_') ? 'America/New_York' : code.startsWith('rt_hk') ? 'Asia/Hong_Kong' : 'Asia/Shanghai';
const marketZoneName = code => code.startsWith('gb_') ? '美东时间' : code.startsWith('rt_hk') ? '香港时间' : '北京时间';
const shortDate = (value, timeZone, detailed = false) => new Intl.DateTimeFormat('zh-CN', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  second: detailed ? '2-digit' : undefined, hourCycle: 'h23'
}).format(value);

export class MarketDetails {
  constructor(root, request) {
    this.root = root;
    this.request = request;
    this.metrics = root.querySelector('.market-metrics');
    this.book = root.querySelector('.market-book');
    this.status = root.querySelector('.market-detail-status');
    this.resource = new PanelResource(record => this.render(record));
  }

  update(code, active, { entry, custom, source, interval, force }) {
    this.code = code;
    const useCustom = custom && !entry?.quote?.fallbackFrom;
    this.resource.update({
      key: useCustom ? null : code, active, request: () => this.request(code), interval: Math.max(10000, interval * 1000), force
    });
    if (active && useCustom) {
      this.render({ result: entry?.quote?.details ?? { source: source || '自有行情源' }, error: Boolean(entry?.error) });
    }
  }

  render({ result, loading = false, error = false }) {
    const code = this.code;
    const unit = code.startsWith('gb_') ? ' USD' : code.startsWith('rt_hk') ? ' HKD' : ' CNY';
    this.root.setAttribute('aria-busy', String(loading));
    if (result !== this.painted || code !== this.paintedCode) {
      this.painted = result;
      this.paintedCode = code;
      const rows = [
        ['今开', marketPrice(result?.open, code)], ['昨收', marketPrice(result?.previousClose, code)],
        ['最高', marketPrice(result?.high, code)], ['最低', marketPrice(result?.low, code)],
        ['成交量', Number.isFinite(result?.volume) && result.volumeUnit ? compactVolume(result.volume) + result.volumeUnit : '—'],
        ['成交额', Number.isFinite(result?.amount) ? compactVolume(result.amount) + unit : '—']
      ];
      this.metrics.replaceChildren(...rows.map(([label, value]) => {
        const cell = element('div');
        cell.append(element('dt', label), element('dd', value));
        return cell;
      }));
      this.renderBook(result);
    }
    const timestamp = result?.quotedAt;
    const at = Number.isFinite(timestamp) ? shortDate(timestamp, marketZone(code), true) + ' ' + marketZoneName(code) : '';
    this.status.textContent = [
      result?.source, at || (result ? '未提供时间' : ''),
      result?.source === '腾讯公开行情' ? '可能延迟' : '',
      error ? (result ? '更新失败，显示上次数据' : '行情资料加载失败') : loading ? '更新中…' : ''
    ].filter(Boolean).join(' · ');
  }

  renderBook(result) {
    const book = result?.book;
    const heading = element('div', '', 'market-book-heading');
    heading.append(element('h3', book ? result.depthLabel : '委托档位'));
    if (!book) {
      this.book.replaceChildren(heading, element('p', result ? '当前行情源未提供该标的的委托档位。' : '等待委托档位。', 'muted'));
      return;
    }
    const depth = Math.max(book.bids.length, book.asks.length);
    const maxSize = Math.max(...[...book.bids, ...book.asks].map(level => level.size));
    const at = Number.isFinite(book.quotedAt) ? shortDate(book.quotedAt, marketZone(this.code), true) : '未提供时间';
    heading.append(element('span', at, 'muted'));
    const columns = element('div', '', 'market-book-columns');
    const sides = [[book.bids, '买盘', '买'], [book.asks, '卖盘', '卖']];
    for (const [levels, label, prefix] of sides) {
      const table = element('table', '', 'market-book-' + (prefix === '买' ? 'bid' : 'ask'));
      table.append(element('caption', label));
      const header = table.createTHead().insertRow();
      for (const title of ['档位', '价格', '委托量/' + book.unit]) {
        const col = element('th', title);
        col.scope = 'col';
        header.append(col);
      }
      const body = table.createTBody();
      for (let index = 0; index < depth; index++) {
        const level = levels[index], row = body.insertRow();
        row.insertCell().textContent = prefix + (index + 1);
        row.insertCell().textContent = marketPrice(level?.price, this.code);
        const size = row.insertCell();
        size.textContent = compactVolume(level?.size);
        if (level) {
          size.style.setProperty('--depth-share', (level.size / maxSize * 100) + '%');
          size.title = level.size.toLocaleString('zh-CN') + book.unit;
        }
      }
      columns.append(table);
    }
    this.book.replaceChildren(heading, columns);
  }
}

export class MarketNews {
  constructor(root, { request, open, translate, save, select }) {
    this.root = root;
    this.request = request;
    this.open = open;
    this.translate = translate;
    this.save = save;
    this.select = select;
    this.scope = 'stock';
    this.visible = 5;
    this.translations = new Map();
    this.translating = new Set();
    this.title = root.querySelector('.market-news-context');
    this.status = root.querySelector('.market-news-status');
    this.list = root.querySelector('ol');
    this.more = root.querySelector('.market-news-more');
    this.refresh = root.querySelector('.market-news-refresh');
    this.follow = root.querySelector('.market-news-follow');
    this.notify = root.querySelector('.market-news-notify');
    this.autoTranslate = root.querySelector('.market-news-translate');
    this.followed = root.querySelector('.market-news-followed');
    this.test = root.querySelector('.market-news-test');
    this.notifyStatus = root.querySelector('.market-news-notify-status');
    this.follow.onclick = () => this.updatePreference('follow', this.stock.code, this.follow);
    this.notify.onchange = () => this.updatePreference('notifications', this.notify.checked, this.notify);
    this.autoTranslate.onchange = () => this.updatePreference('autoTranslate', this.autoTranslate.checked, this.autoTranslate);
    root.querySelector('.market-news-permissions').onclick = event => this.updatePreference('permissions', null, event.currentTarget);
    this.test.onclick = () => this.updatePreference('test', null, this.test);
    this.resource = new PanelResource(record => this.render(record));
    for (const button of root.querySelectorAll('[data-news-scope]')) {
      button.onclick = () => this.setScope(button.dataset.newsScope);
    }
    this.more.onclick = () => {
      this.visible = this.visible >= this.visibleArticles().length ? 5 : this.visible + 5;
      this.paintArticles(this.articles);
    };
    this.refresh.onclick = () => this.load(true);
  }

  setScope(scope) {
    if (this.scope !== scope) this.visible = 5;
    this.scope = scope;
    this.load();
  }

  update(stock, active, preferences, stocks) {
    if (this.stock?.code !== stock.code && this.scope === 'market') this.scope = 'stock';
    this.stock = stock;
    this.active = active;
    const changed = this.translationEnabled !== preferences.autoTranslate;
    this.translationEnabled = preferences.autoTranslate;
    this.preferences = preferences;
    this.stocks = stocks;
    this.paintPreferences();
    this.load();
    if (changed && this.active) this.paintArticles(this.articles);
  }

  load(force = false) {
    if (!this.stock) return;
    const { code, name } = this.stock, scope = this.scope;
    const key = scope === 'market' ? 'market' : code;
    if (key !== this.resource.key) this.visible = 5;
    this.title.textContent = scope === 'market' ? '市场动态' : name;
    this.follow.hidden = scope === 'market';
    for (const button of this.root.querySelectorAll('[data-news-scope]')) {
      button.setAttribute('aria-pressed', String(button.dataset.newsScope === scope));
    }
    this.resource.update({ key, active: this.active, request: () => this.request(scope === 'market' ? 'market' : 'stock', code, force), interval: 300000, force });
  }

  render({ result, loading = false, error = false }) {
    this.root.setAttribute('aria-busy', String(loading));
    this.refresh.disabled = loading;
    if (this.articles !== result?.articles || this.paintedKey !== this.resource.key || this.paintedScope !== this.scope) this.paintArticles(result?.articles);
    this.status.textContent = [
      result?.source,
      error ? (result ? '更新失败，显示上次新闻' : '新闻加载失败，请刷新重试') :
        loading ? '正在获取新闻…' : result && this.visibleArticles().length === 0 ? '暂未找到相关新闻' : ''
    ].filter(Boolean).join(' · ');
  }

  visibleArticles() {
    const all = this.articles || [];
    const articles = this.scope === 'international' ? all.filter(item => item.international) : all;
    if (this.scope === 'market' || articles.length < 2) return articles;
    const roundup = title => /^(?:stock movers|final trade)\b|analyst calls:|[，、,].*[，、,].*[，、,]/i.test(title);
    if (!roundup(articles[0].title)) return articles;
    const lead = articles.findIndex(item => !roundup(item.title) && articles[0].publishedAt - item.publishedAt <= 36 * 3600000);
    return lead > 0 ? [articles[lead], ...articles.slice(0, lead), ...articles.slice(lead + 1)] : articles;
  }

  paintArticles(articles) {
    this.articles = articles;
    this.paintedKey = this.resource.key;
    this.paintedScope = this.scope;
    this.list.replaceChildren();
    const visible = this.visibleArticles();
    const translations = [];
    const languages = { en: '英文', ja: '日文', fr: '法文', de: '德文' };
    for (const item of visible.slice(0, this.visible)) {
      const row = element('li');
      const button = element('button', '', 'market-news-article');
      button.type = 'button';
      button.dataset.article = item.id;
      button.title = '在浏览器打开原文';
      const meta = element('span', '', 'market-news-meta');
      const date = element('time', shortDate(item.publishedAt, 'Asia/Shanghai'));
      date.dateTime = new Date(item.publishedAt).toISOString();
      date.title = '北京时间';
      meta.append(element('span', item.publisher), date);
      const headline = element('strong', item.title);
      const original = element('span', '', 'market-news-original');
      original.hidden = true;
      const label = element('span', languages[item.language] || '', 'market-news-language');
      if (label.textContent) meta.append(label);
      const showTranslation = translated => {
        if (!translated || !this.preferences.autoTranslate) return;
        headline.textContent = translated;
        original.hidden = false;
        original.textContent = item.title;
        label.textContent = [languages[item.language], '机器翻译'].filter(Boolean).join(' · ');
      };
      if (this.preferences?.autoTranslate && item.language !== 'zh') {
        if (this.translations.has(item.id)) showTranslation(this.translations.get(item.id));
        else if (!this.translating.has(item.id)) translations.push(item.id);
      }
      button.append(meta, headline, original);
      button.onclick = () => this.open(item.id);
      row.append(button);
      this.list.append(row);
    }
    this.more.hidden = visible.length <= 5;
    this.more.textContent = this.visible >= visible.length ? '收起' : '更多新闻';
    this.more.setAttribute('aria-expanded', String(this.visible > 5));
    const batch = translations.slice(0, 12);
    if (batch.length) {
      for (const id of batch) this.translating.add(id);
      this.translate(batch).then(result => {
        for (const id of batch) this.translations.set(id, result[id] || '');
        while (this.translations.size > 180) this.translations.delete(this.translations.keys().next().value);
        if (this.active && this.preferences.autoTranslate) {
          const focused = this.list.querySelector('button:focus')?.dataset.article;
          this.paintArticles(this.articles);
          if (focused) this.list.querySelector('[data-article="' + focused + '"]')?.focus({ preventScroll: true });
        }
      }, () => {}).finally(() => { for (const id of batch) this.translating.delete(id); });
    }
  }

  paintPreferences() {
    const preferences = this.preferences;
    const following = preferences.followed.includes(this.stock.code);
    this.follow.setAttribute('aria-pressed', String(following));
    this.follow.textContent = following ? '已关注' : '关注新闻';
    this.autoTranslate.checked = preferences.autoTranslate;
    this.notify.checked = preferences.notifications;
    this.test.disabled = !preferences.notifications;
    const stocks = preferences.followed.map(code => this.stocks.find(stock => stock.code === code)).filter(Boolean);
    const key = stocks.map(stock => stock.code + stock.name).join('|');
    if (key === this.followedKey) return;
    this.followedKey = key;
    this.followed.replaceChildren();
    this.followed.append(element('span', stocks.length ? '已关注 ' + stocks.length + ' 只' : '暂无关注的股票', 'muted'));
    for (const stock of stocks) {
      const button = element('button', stock.name, 'link-button');
      button.type = 'button';
      button.onclick = () => { this.setScope('stock'); this.select(stock.code); };
      this.followed.append(button);
    }
  }

  async updatePreference(operation, value, control) {
    control.disabled = true;
    this.notifyStatus.textContent = '';
    try {
      const result = await this.save(operation, value);
      if (operation === 'test') this.notifyStatus.textContent = result ? '已发送测试通知' : '系统未确认通知，请检查应用的通知权限。';
    } catch (error) {
      this.notifyStatus.textContent = String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '');
      this.root.querySelector('.market-news-preferences').open = true;
    } finally {
      control.disabled = operation === 'test' && !this.preferences.notifications;
      this.paintPreferences();
    }
  }
}
