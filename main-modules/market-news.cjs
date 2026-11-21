const { parseQuoteTime } = require('./quote-time');
const { marketForSymbol } = require('./market-symbols');

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const newsKey = value => value.normalize('NFKC').toLowerCase().replace(/[\s\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e\u2000-\u206f\u3000-\u303f]/g, '');
const containsHan = value => /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
const editions = [
  { language: 'en', languageCode: 'en-US', region: 'US', edition: 'US:en', domains: ['reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'cnbc.com', 'apnews.com', 'bbc.com'] },
  { language: 'ja', languageCode: 'ja', region: 'JP', edition: 'JP:ja', domains: ['jp.reuters.com', 'nikkei.com', 'bloomberg.co.jp', 'jp.wsj.com'] },
  { language: 'fr', languageCode: 'fr', region: 'FR', edition: 'FR:fr', domains: ['lesechos.fr', 'lefigaro.fr', 'boursorama.com'] },
  { language: 'de', languageCode: 'de', region: 'DE', edition: 'DE:de', domains: ['handelsblatt.com', 'boersen-zeitung.de', 'tagesschau.de'] }
];

function clean(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? match;
      const point = /^#x/i.test(entity) ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    }).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function articleUrl(value) {
  let url;
  try { url = new URL(clean(value)); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.')) return null;
  // The Chinese feed still returns HTTP links for these HTTPS publishers.
  if (['finance.eastmoney.com', 'stock.eastmoney.com', 'hk.eastmoney.com', 'global.eastmoney.com', 'finance.sina.com.cn'].includes(url.hostname)) url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  if (!/\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)) return null;
  for (const key of [...url.searchParams.keys()]) if (key === '.tsrc' || key.startsWith('utm_')) url.searchParams.delete(key);
  url.hash = '';
  return url;
}

function extractRows(text, kind) {
  if (kind === 'yahoo' || kind === 'world') {
    if (!/<rss[\s>]/i.test(text)) throw new Error('新闻源返回了无法识别的数据');
    const tag = (item, key) => item.match(new RegExp('<' + key + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + key + '>', 'i'))?.[1];
    return (text.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []).map(item => ({
      title: tag(item, 'title'), url: tag(item, 'link'), publisher: tag(item, 'source'),
      publisherUrl: item.match(/<source\s+url=["']([^"']+)["']/i)?.[1],
      publishedAt: Date.parse(clean(tag(item, 'pubDate')))
    }));
  }
  if (kind === 'eastmoney') {
    const match = /^niulaiNews\(([\s\S]*)\);?$/.exec(text.trim());
    const result = match ? JSON.parse(match[1]) : JSON.parse(text);
    if (result.code !== 0 || !Array.isArray(result.result?.cmsArticleWebOld)) throw new Error('东方财富新闻暂不可用');
    return result.result.cmsArticleWebOld.map(row => ({
      title: row.title, url: row.url, publisher: row.mediaName,
      publishedAt: parseQuoteTime(row.date, 's_sh000001')
    }));
  }
  const result = JSON.parse(text).result;
  if (result?.status?.code !== 0 || !Array.isArray(result.data)) throw new Error('新浪财经新闻暂不可用');
  return result.data.map(row => ({
    title: row.title, url: row.url, publisher: row.media_name, publishedAt: Number(row.ctime) * 1000
  }));
}

function languageFor(title, fallback) {
  if (/[\u3040-\u30ff]/.test(title)) return 'ja';
  if (containsHan(title) && fallback !== 'ja') return 'zh';
  return fallback;
}

function parseNews(text, kind, now = Date.now(), request = {}, identify = value => value) {
  const keys = new Set(), articles = [];
  const earliest = now - (kind === 'world' ? 14 : 30) * 86400000;
  const rows = extractRows(text, kind).sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  for (const row of rows) {
    const publisher = clean(row.publisher).slice(0, 50), url = articleUrl(row.url);
    const rawTitle = clean(row.title);
    const suffix = ' - ' + publisher;
    const title = (kind === 'world' && publisher && rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle).slice(0, 220);
    if (!title || !url || !Number.isFinite(row.publishedAt) || row.publishedAt < earliest || row.publishedAt > now + 600000) continue;
    if (kind === 'world') {
      const host = articleUrl(row.publisherUrl)?.hostname;
      if (url.hostname !== 'news.google.com' || !url.pathname.startsWith('/rss/articles/') ||
        !host || !request.domains?.some(domain => host === domain || host.endsWith('.' + domain))) continue;
    }
    const normalized = newsKey(title);
    if (keys.has(url.href) || keys.has(normalized)) continue;
    keys.add(url.href);
    keys.add(normalized);
    articles.push({
      id: identify(url.href),
      url: url.href, title,
      publisher: publisher || url.hostname.replace(/^www\./, ''),
      language: languageFor(title, request.language || (kind === 'yahoo' ? 'en' : 'zh')),
      international: kind === 'world',
      publishedAt: row.publishedAt
    });
    if (articles.length === (kind === 'world' ? 36 : 18)) break;
  }
  return articles;
}

function stockNewsTerms(code, name, aliases = []) {
  const ticker = code.replace(/^(s_(sh|sz)|rt_hk|gb_)/, '').toUpperCase();
  const localName = name.replace(/^(贵州|上海|深圳|北京|浙江|天津|山东|江苏)(?=.{2,})/, '');
  const shortName = localName.replace(/(股份有限公司|股份|控股|集团|公司)$/, '');
  const abbreviations = aliases.map(alias => alias.replace(/[ .]*(corporation|inc\.?|corp\.?|company|ltd\.?|plc|holdings|株式会社|・ホールディングス|社)$/i, '').trim());
  if (name !== localName && aliases[0]) abbreviations.push(aliases[0].replace(/^[a-z]+ /i, ''));
  const symbols = ticker.length > 2 ? [ticker] : ['$' + ticker];
  if (code.startsWith('rt_hk')) symbols.push(ticker.replace(/^0+/, '').padStart(4, '0') + '.HK');
  const indexAliases = {
    s_sh000001: ['沪指', '上证综指', 'Shanghai Composite', 'SHCOMP'],
    s_sz399001: ['深成指', 'Shenzhen Component'],
    s_sz399006: ['创业板指数', 'ChiNext Index']
  }[code] || [];
  const terms = [...symbols, name, shortName, ...abbreviations, ...aliases, ...indexAliases]
    .map(term => String(term).replace(/["\\():{}<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60))
    .filter(term => term.length >= (containsHan(term) ? 2 : 3) || term.startsWith('$'));
  return [...new Set(terms.map(term => term.toLowerCase()))];
}

function newsMatchesStock(article, terms) {
  const title = article.title.normalize('NFKC').toLowerCase();
  return terms.some(term => {
    term = term.normalize('NFKC');
    if (/[^\x00-\x7f]/.test(term)) return title.includes(term);
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:$|[^a-z0-9])').test(title);
  });
}

function globalNewsRequests(terms) {
  if (!terms.length) return [];
  const query = terms.map(term => '"' + term + '"').join(' OR ');
  return editions.map(({ language, languageCode, region, edition, domains }) => {
    const q = '(' + query + ') when:14d (' + domains.map(domain => 'site:' + domain).join(' OR ') + ')';
    const queryString = new URLSearchParams({ q, hl: languageCode, gl: region, ceid: edition });
    return { url: 'https://news.google.com/rss/search?' + queryString, kind: 'world', source: 'Google News', language, domains };
  });
}

function mergeNews(feeds) {
  const seen = new Set(), result = [];
  for (const article of [].concat(...feeds).sort((a, b) => b.publishedAt - a.publishedAt)) {
    const key = newsKey(article.title);
    if (seen.has(key) || seen.has(article.id)) continue;
    seen.add(key);
    seen.add(article.id);
    result.push(article);
    if (result.length === 30) break;
  }
  return result;
}

function translationUrl(title, target = 'zh-CN') {
  const query = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: title });
  return 'https://translate.googleapis.com/translate_a/single?' + query;
}
function parseTranslation(data) {
  const [parts] = data;
  return Array.isArray(parts) ? clean(parts.map(part => part[0]).join('')).slice(0, 280) : '';
}

async function translateTitle(title, target) {
  const response = await fetch(translationUrl(title, target), { signal: AbortSignal.timeout(3500) });
  return response.ok ? parseTranslation(await response.json()) : '';
}

function newsNotificationBatch(previous, articles, now = Date.now(), identify = value => value) {
  const since = Number.isFinite(previous?.since) ? previous.since : now;
  const seen = new Set(Array.isArray(previous?.seen) ? previous.seen : []);
  const eligible = [], earliest = Math.max(since, now - 24 * 60 * 60000);
  for (const item of [...articles].reverse()) {
    const id = item.title ? identify(newsKey(item.title)) : item.id;
    if (previous && item.publishedAt >= earliest && !seen.has(id) && !seen.has(item.id)) eligible.unshift(item);
    seen.delete(id);
    seen.add(id);
  }
  return { cursor: { since, seen: [...seen].slice(-75) }, eligible };
}

function newsRequest(code, name) {
  if (!code) {
    return { url: 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&num=18&page=1', kind: 'sina', source: '新浪财经', referer: 'https://finance.sina.com.cn/' };
  }
  if (marketForSymbol(code) === 'us') {
    const query = new URLSearchParams({ s: code.slice(3).toUpperCase().replace('.', '-'), region: 'US', lang: 'en-US' });
    return { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?' + query, kind: 'yahoo', source: 'Yahoo Finance', referer: 'https://finance.yahoo.com/' };
  }
  const keyword = String(name || '').trim().slice(0, 60) || code.replace(/^(s_(sh|sz)|rt_hk)/, '');
  const param = { uid: '', keyword, type: ['cmsArticleWebOld'], client: 'web', clientType: 'web', clientVersion: 'curr', param: {
    cmsArticleWebOld: { searchScope: 'default', sort: 'time', pageIndex: 1, pageSize: 18, preTag: '', postTag: '' }
  } };
  const query = new URLSearchParams({ cb: 'niulaiNews', param: JSON.stringify(param) });
  return { url: 'https://search-api-web.eastmoney.com/search/jsonp?' + query, kind: 'eastmoney', source: '东方财富', referer: 'https://www.eastmoney.com/' };
}

module.exports = { parseNews, newsRequest, stockNewsTerms, newsMatchesStock, globalNewsRequests, mergeNews, containsHan, translationUrl, parseTranslation, translateTitle, newsNotificationBatch };
