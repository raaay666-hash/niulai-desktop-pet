import { MarketChart } from '../../renderer-modules/market-chart.js';
import { MarketDetails, MarketNews } from '../../renderer-modules/market-insights.js';
import detailsApi from '../../main-modules/market-insights.cjs';
import newsApi from '../../main-modules/market-news.cjs';
import { chartSymbol } from './market-chart-data.mjs';
import { marketForSymbol, MAX_NEWS_FOLLOWS } from './core.mjs';
import { request } from './bridge.mjs';

const { parseMarketDetails, parseTencentMinutes, parseYahooMinutes } = detailsApi;
const { parseNews, newsRequest, stockNewsTerms, newsMatchesStock, globalNewsRequests, mergeNews,
  containsHan, translationUrl, parseTranslation, newsNotificationBatch } = newsApi;
const interval = 300000;
const $ = id => document.getElementById(id);
const native = () => window.NiulaiNative;

function newsId(value) {
  let first = 2166136261, second = 608135816;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    first = Math.imul(first ^ unit, 16777619);
    second = Math.imul(second ^ unit, 1597334677);
  }
  return [first, second].map(part => ('00000000' + (part >>> 0).toString(16)).slice(-8)).join('');
}

export class MobileMarkets {
  constructor(state, { persist, select, toast }) {
    this.state = state;
    this.persist = persist;
    this.feeds = new Map();
    this.translations = new Map();
    this.aliases = new Map();
    this.generation = 0;
    this.chart = new MarketChart($('market-chart'), {
      history: value => request('history', value),
      minutes: async code => {
        const data = JSON.parse(await request('minutes', code));
        if (marketForSymbol(code) === 'us') return parseYahooMinutes(data, code, code.slice(3).toUpperCase().replace('.', '-'));
        return parseTencentMinutes(data, marketForSymbol(code), chartSymbol(code));
      }
    });
    this.details = new MarketDetails($('market-book-panel'), async code => {
      const symbol = chartSymbol(code);
      return parseMarketDetails(await request('book', symbol), code, symbol);
    });
    this.news = new MarketNews($('market-news'), {
      request: (scope, code, force) => this.loadNews(scope === 'market' ? null : this.state.stocks.find(stock => stock.code === code), force),
      translate: ids => this.translate(ids), save: (operation, value) => this.save(operation, value), select,
      open: id => {
        const article = this.findArticle(id);
        if (!article || !native()?.openNewsArticle?.(article.url)) toast('未找到可打开的新闻链接');
      }
    });
    $('market-chart').tabIndex = -1;
    $('show-chart').onclick = () => this.reveal('market-chart');
    $('show-book').onclick = () => this.reveal('market-book-panel', 'market-details-title');
    $('show-news').onclick = () => this.revealNews();
    const openTarget = code => {
      if (!this.state.stocks.some(stock => stock.code === code)) return;
      select(code);
      this.revealNews();
    };
    window.__niulaiNewsTarget = openTarget;
    window.__niulaiNotificationsChanged = () => this.schedule(0);
    const savedTarget = native()?.newsTarget?.();
    if (savedTarget) setTimeout(() => openTarget(savedTarget), 0);
  }

  revealNews() {
    this.news.setScope('stock');
    this.reveal('market-news', 'market-news-title');
  }

  reveal(section, focus = section) {
    $(section).scrollIntoView({ block: 'start' });
    $(focus).focus({ preventScroll: true });
  }

  update(stock, visible, active) {
    this.chart.update(stock.code, visible);
    this.details.update(stock.code, visible, { custom: false, interval: Math.max(25, this.state.interval) });
    this.news.update(stock, visible, this.state.news, this.state.stocks);
    if (this.active !== active) {
      this.active = active;
      this.generation++;
      this.schedule(0);
    }
  }

  async fetchTranslation(title, target) {
    try { return parseTranslation(JSON.parse(await request('news-translation', translationUrl(title, target)))) || ''; }
    catch { return ''; }
  }

  stockTerms(stock) {
    if (!stock) return Promise.resolve([]);
    if (!containsHan(stock.name)) return Promise.resolve(stockNewsTerms(stock.code, stock.name));
    if (!this.aliases.has(stock.name)) {
      const name = stock.code.startsWith('gb_') && stock.name.length <= 2 ? stock.name + '公司' : stock.name;
      this.aliases.set(stock.name, Promise.all(['en', 'ja'].map(language => this.fetchTranslation(name, language))));
      if (this.aliases.size > 24) this.aliases.delete(this.aliases.keys().next().value);
    }
    return this.aliases.get(stock.name).then(aliases => stockNewsTerms(stock.code, stock.name, aliases));
  }

  async loadNews(stock, force = false) {
    const key = stock?.code || 'market';
    const previous = this.feeds.get(key);
    if (previous?.pending) return previous.pending;
    if (previous?.data && Date.now() - previous.data.received < (force ? 8000 : interval)) return previous.data;
    const primary = newsRequest(stock?.code, stock?.name);
    const record = { data: previous?.data };
    this.feeds.delete(key);
    this.feeds.set(key, record);
    if (this.feeds.size > 22) this.feeds.delete(this.feeds.keys().next().value);
    const load = async feed => {
      try { return parseNews(await request('news-feed', feed.url), feed.kind, Date.now(), feed, newsId); }
      catch { return null; }
    };
    record.pending = (async () => {
      const termsPromise = this.stockTerms(stock);
      const global = termsPromise.then(terms => Promise.all(globalNewsRequests(terms).map(load)));
      try {
        const [local, world, terms] = await Promise.all([load(primary), global, termsPromise]);
        if (!local && !world.some(Boolean)) throw new Error('新闻源暂不可用');
        const articles = mergeNews([local, ...world].filter(Boolean).map(items => stock ? items.filter(article => newsMatchesStock(article, terms)) : items));
        const source = [local ? primary.source : '', articles.some(item => item.international) ? 'Google News' : ''].filter(Boolean).join(' / ');
        return (record.data = { articles, source, received: Date.now() });
      } finally { record.pending = null; }
    })();
    return record.pending;
  }

  findArticle(id) {
    for (const record of this.feeds.values()) {
      const article = record.data?.articles.find(item => item.id === id);
      if (article) return article;
    }
    return null;
  }

  headline(article) {
    if (article.language === 'zh') return Promise.resolve('');
    if (!this.translations.has(article.id)) {
      this.translations.set(article.id, this.fetchTranslation(article.title, 'zh-CN'));
      if (this.translations.size > 150) this.translations.delete(this.translations.keys().next().value);
    }
    return this.translations.get(article.id);
  }

  async translate(ids) {
    const output = {};
    if (!this.active || !this.state.news.autoTranslate) return output;
    for (let start = 0; start < ids.length && this.active; start += 3) {
      await Promise.all(ids.slice(start, start + 3).map(async id => {
        const article = this.findArticle(id);
        if (article) output[id] = await this.headline(article);
      }));
    }
    return output;
  }

  async save(operation, value) {
    const preferences = this.state.news;
    if (operation === 'test') {
      if (!native()?.testNewsNotification) return false;
      native().testNewsNotification();
      return null;
    }
    if (operation === 'permissions') { native()?.newsSettings?.(); return true; }
    if (operation === 'follow') {
      if (preferences.followed.includes(value)) this.remove(value);
      else {
        if (preferences.followed.length >= MAX_NEWS_FOLLOWS) throw new Error('最多关注 ' + MAX_NEWS_FOLLOWS + ' 只股票');
        preferences.followed.push(value);
      }
    } else if (operation === 'notifications' || operation === 'autoTranslate') {
      if (operation === 'notifications' && value !== preferences.notifications) {
        preferences.cursors = {};
        if (value && !native()?.newsPermission?.()) native()?.newsSettings?.();
      }
      preferences[operation] = value;
    }
    this.persist();
    const stock = this.state.stocks.find(item => item.code === this.state.selected);
    if (stock) this.news.update(stock, this.news.active, preferences, this.state.stocks);
    if (operation !== 'autoTranslate') {
      this.generation++;
      this.schedule(0);
    }
    return true;
  }

  remove(code) {
    const preferences = this.state.news;
    preferences.followed = preferences.followed.filter(value => code !== value);
    delete preferences.cursors[code];
  }

  schedule(delay = interval) {
    clearTimeout(this.timer);
    if (this.active && this.state.news.notifications && this.state.news.followed.length) {
      this.timer = setTimeout(() => this.checkFollowed(), delay);
    }
  }

  async checkFollowed() {
    if (this.checking) return;
    this.checking = true;
    const preferences = this.state.news, generation = this.generation;
    const allowed = () => this.active && preferences.notifications && generation === this.generation;
    try {
      for (const code of [...preferences.followed]) {
        if (!allowed()) break;
        const stock = this.state.stocks.find(item => item.code === code);
        if (!stock) continue;
        const result = await this.loadNews(stock).catch(() => null);
        if (!allowed() || !preferences.followed.includes(code) || !result) continue;
        const { cursor, eligible } = newsNotificationBatch(preferences.cursors[code], result.articles, Date.now(), newsId);
        if (eligible.length) {
          if (!native()?.newsPermission?.()) continue;
          const [latest] = eligible;
          const translated = preferences.autoTranslate ? await this.headline(latest) : '';
          if (!allowed() || !preferences.followed.includes(code)) continue;
          const extra = eligible.length > 1 ? ' · 另有 ' + (eligible.length - 1) + ' 条' : '';
          const sent = native()?.showStockNews?.(code, stock.name + ' · ' + latest.publisher + extra, translated || latest.title);
          if (!sent) continue;
        }
        preferences.cursors[code] = cursor;
        this.persist();
      }
    } finally {
      this.checking = false;
      this.schedule(generation === this.generation ? interval : 0);
    }
  }
}
