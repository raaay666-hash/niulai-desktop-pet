(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // main-modules/market-symbols.js
  var require_market_symbols = __commonJS({
    "main-modules/market-symbols.js"(exports, module) {
      var MARKET = Object.freeze({
        CN: "cn",
        HK: "hk",
        US: "us"
      });
      var MARKET_LABEL = Object.freeze({
        [MARKET.CN]: "A\u80A1",
        [MARKET.HK]: "\u6E2F\u80A1",
        [MARKET.US]: "\u7F8E\u80A1"
      });
      function marketForSymbol2(symbol) {
        const value = String(symbol || "").toLowerCase();
        if (value.startsWith("rt_hk")) return MARKET.HK;
        if (value.startsWith("gb_")) return MARKET.US;
        return MARKET.CN;
      }
      function normalizeMarketList(markets) {
        const values = Array.isArray(markets) ? markets : [MARKET.CN, MARKET.HK, MARKET.US];
        const normalized = [...new Set(values.map((value) => String(value).toLowerCase()))].filter((value) => Object.values(MARKET).includes(value));
        return normalized.length ? normalized : [MARKET.CN, MARKET.HK, MARKET.US];
      }
      function normalizeMarketSymbol2(input, markets) {
        const allowed = normalizeMarketList(markets);
        let value = String(input || "").trim().replace(/\s+/g, "");
        const lower = value.toLowerCase();
        if (lower === "\u4E0A\u8BC1\u6307\u6570" || lower === "\u4E0A\u8BC1") return allowed.includes(MARKET.CN) ? "s_sh000001" : null;
        if (/^s_(sh|sz)\d{6}$/.test(lower)) return allowed.includes(MARKET.CN) ? lower : null;
        if (/^(sh|sz)\d{6}$/.test(lower)) return allowed.includes(MARKET.CN) ? `s_${lower}` : null;
        if (/^\d{6}$/.test(lower)) {
          if (!allowed.includes(MARKET.CN)) return null;
          const exchange = /^(5|6|9)/.test(lower) ? "sh" : "sz";
          return `s_${exchange}${lower}`;
        }
        const hkMatch = lower.match(/^(?:rt_)?hk(\d{1,5})$/) || lower.match(/^(\d{1,5})\.hk$/);
        if (hkMatch) {
          return allowed.includes(MARKET.HK) ? `rt_hk${hkMatch[1].padStart(5, "0")}` : null;
        }
        if (/^\d{5}$/.test(lower)) {
          return allowed.includes(MARKET.HK) ? `rt_hk${lower}` : null;
        }
        if (/^gb_[a-z][a-z0-9.-]{0,11}$/.test(lower)) {
          return allowed.includes(MARKET.US) ? lower : null;
        }
        value = value.replace(/^\$/, "").replace(/\.us$/i, "").replace(/^us/i, "");
        if (/^[a-z][a-z0-9.-]{0,11}$/i.test(value) && /[a-z]/i.test(value)) {
          const ticker = value.replace(/[^a-z0-9.-]/gi, "").toLowerCase();
          return ticker && allowed.includes(MARKET.US) ? `gb_${ticker}` : null;
        }
        return null;
      }
      function displaySymbol2(symbol) {
        const value = String(symbol || "s_sh000001");
        if (value.startsWith("rt_hk")) return `HK ${value.slice(5)}`;
        if (value.startsWith("gb_")) return value.slice(3).toUpperCase();
        return value.replace(/^s_/, "");
      }
      function quoteProviderSymbol2(symbol, provider = "sina") {
        const market = marketForSymbol2(symbol);
        if (provider === "sina") return String(symbol);
        if (market === MARKET.HK) return `hk${String(symbol).slice(5)}`;
        if (market === MARKET.US) return `us${String(symbol).slice(3).toUpperCase()}`;
        return String(symbol);
      }
      function decodeJavascriptString(value) {
        return String(value || "").replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
      function parseTencentSuggestions2(text, markets) {
        const allowed = normalizeMarketList(markets);
        const match = String(text || "").match(/v_hint="([\s\S]*?)"\s*;?/);
        if (!match) return [];
        const seen = /* @__PURE__ */ new Set();
        const results = [];
        for (const row of decodeJavascriptString(match[1]).split("^")) {
          const [prefix, rawCode, name, , type] = row.split("~");
          if (!prefix || !rawCode || type !== "GP") continue;
          let code = null;
          if (prefix === "sh" || prefix === "sz") code = `s_${prefix}${rawCode}`;
          else if (prefix === "hk") code = `rt_hk${String(rawCode).padStart(5, "0")}`;
          else if (prefix === "us") {
            const ticker = String(rawCode).replace(/\.(oq|o|n|a|ps|k)$/i, "").toLowerCase();
            code = `gb_${ticker}`;
          }
          if (!code || !allowed.includes(marketForSymbol2(code)) || seen.has(code)) continue;
          seen.add(code);
          results.push({
            code,
            name: name || displaySymbol2(code),
            market: marketForSymbol2(code),
            marketLabel: MARKET_LABEL[marketForSymbol2(code)],
            displayCode: displaySymbol2(code)
          });
          if (results.length >= 12) break;
        }
        return results;
      }
      function externalQuoteUrl(symbol) {
        const code = normalizeMarketSymbol2(symbol);
        if (!code) return null;
        const market = marketForSymbol2(code);
        if (market === MARKET.HK) return `https://gu.qq.com/hk${code.slice(5)}/gp`;
        if (market === MARKET.US) return `https://gu.qq.com/us${code.slice(3).toUpperCase()}/gp`;
        return `https://gu.qq.com/${code.replace(/^s_/, "")}/gp`;
      }
      module.exports = {
        MARKET,
        MARKET_LABEL,
        normalizeMarketList,
        normalizeMarketSymbol: normalizeMarketSymbol2,
        marketForSymbol: marketForSymbol2,
        displaySymbol: displaySymbol2,
        quoteProviderSymbol: quoteProviderSymbol2,
        parseTencentSuggestions: parseTencentSuggestions2,
        externalQuoteUrl
      };
    }
  });

  // main-modules/quote-time.js
  var require_quote_time = __commonJS({
    "main-modules/quote-time.js"(exports, module) {
      var { marketForSymbol: marketForSymbol2 } = require_market_symbols();
      var US_ZONE = "America/New_York";
      var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      var clockFormats = /* @__PURE__ */ new Map();
      function marketClock(code, now = Date.now()) {
        const market = marketForSymbol2(code);
        const zone = market === "us" ? US_ZONE : "Asia/Shanghai";
        if (!clockFormats.has(zone)) {
          clockFormats.set(zone, new Intl.DateTimeFormat("en-US", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
          }));
        }
        const parts = Object.fromEntries(clockFormats.get(zone).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
        const minute = Number(parts.hour) * 60 + Number(parts.minute);
        const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
        let phase = "closed";
        if (["Sat", "Sun"].includes(parts.weekday)) phase = "weekend";
        else if (market === "us") {
          if (minute >= 240 && minute < 570) phase = "pre";
          else if (minute >= 570 && minute < 960) phase = "regular";
          else if (minute >= 960 && minute < 1200) phase = "post";
        } else {
          const lunch = market === "hk" ? 720 : 690;
          const close = market === "hk" ? 960 : 900;
          if (minute >= lunch && minute < 780) phase = "lunch";
          else if (minute >= 570 && minute < close) phase = "regular";
        }
        return { ...parts, market, zone, dateKey, minuteOfDay: minute, phase };
      }
      function wallTime(year, month, day, hour, minute, second, code) {
        const wanted = Date.UTC(year, month, day, hour, minute, second);
        if (!Number.isFinite(wanted)) return null;
        let timestamp = wanted;
        for (let attempt = 0; attempt < 2; attempt++) {
          const actual2 = marketClock(code, timestamp);
          const represented = Date.UTC(Number(actual2.year), Number(actual2.month) - 1, Number(actual2.day), Number(actual2.hour), Number(actual2.minute), Number(actual2.second));
          timestamp += wanted - represented;
        }
        const actual = marketClock(code, timestamp);
        return Number(actual.year) === year && Number(actual.month) - 1 === month && Number(actual.day) === day && Number(actual.hour) === hour && Number(actual.minute) === minute ? timestamp : null;
      }
      function parseQuoteTime(value, code, reference = Date.now()) {
        const text = String(value || "").trim();
        const numeric = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
        if (numeric) {
          const [, year2, month2, day2, hour2, minute2, second] = numeric.map(Number);
          return wallTime(year2, month2 - 1, day2, hour2, minute2, second, code);
        }
        if (marketForSymbol2(code) !== "us") return null;
        const american = /^([a-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(AM|PM)(?:\s+(EST|EDT))?$/i.exec(text);
        if (!american) return null;
        const month = MONTHS.indexOf(american[1].toLowerCase());
        const day = Number(american[2]), rawHour = Number(american[3]), minute = Number(american[4]);
        if (month < 0 || rawHour < 1 || rawHour > 12 || minute > 59 || day < 1 || day > 31) return null;
        const hour = rawHour % 12 + (american[5].toUpperCase() === "PM" ? 12 : 0);
        const year = Number(marketClock(code, reference).year);
        const candidates = [year - 1, year, year + 1].map((candidate) => {
          if (american[6]) {
            const offset = american[6].toUpperCase() === "EDT" ? 4 : 5;
            const timestamp = Date.UTC(candidate, month, day, hour + offset, minute);
            const clock = marketClock(code, timestamp);
            return Number(clock.month) - 1 === month && Number(clock.day) === day && Number(clock.hour) === hour ? timestamp : null;
          }
          return wallTime(candidate, month, day, hour, minute, 0, code);
        }).filter(Number.isFinite);
        candidates.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference));
        return candidates[0] ?? null;
      }
      function quoteHealth2(record, interval = 10, now = Date.now()) {
        const quote = record?.quote;
        const maxReceiveAge = Math.max(45e3, interval * 2500);
        if (!quote || !(quote.price > 0)) return { warning: true, actionable: false, message: record?.error || "\u7B49\u5F85\u884C\u60C5" };
        if (record.error || !record.received || now - record.received > maxReceiveAge || record.received > now + 5e3) {
          return { warning: true, actionable: false, message: record.error ? "\u66F4\u65B0\u5EF6\u8FDF \xB7 " + record.error : "\u8FDE\u63A5\u66F4\u65B0\u5EF6\u8FDF" };
        }
        if (marketForSymbol2(quote.code) !== "us" && quote.source !== "custom") return { warning: false, actionable: true, message: "" };
        if (!Number.isFinite(quote.quotedAt) || quote.quotedAt > now + 9e4) {
          return { warning: true, actionable: false, message: "\u62A5\u4EF7\u65F6\u95F4\u672A\u786E\u8BA4" };
        }
        const clock = marketClock(quote.code, now);
        const active = ["pre", "regular", "post"].includes(clock.phase);
        if (!active) return { warning: false, actionable: false, message: "\u4F11\u5E02" };
        if (quote.session !== clock.phase || marketClock(quote.code, quote.quotedAt).dateKey !== clock.dateKey) {
          return { warning: true, actionable: false, message: { pre: "\u76D8\u524D\u62A5\u4EF7\u5F85\u66F4\u65B0", regular: "\u5E38\u89C4\u62A5\u4EF7\u5F85\u66F4\u65B0", post: "\u76D8\u540E\u62A5\u4EF7\u5F85\u66F4\u65B0" }[clock.phase] };
        }
        if (now - quote.quotedAt > Math.max(12e4, interval * 3e3)) {
          return { warning: true, actionable: false, message: "\u62A5\u4EF7\u8F83\u65E9" };
        }
        return { warning: false, actionable: true, message: "" };
      }
      function newestQuote(candidates, now = Date.now()) {
        let latest = null;
        const timed = (quote) => Number.isFinite(quote?.quotedAt) && quote.quotedAt <= now + 9e4;
        const current = (quote) => timed(quote) && !quoteHealth2({ quote, received: now }, 10, now).warning;
        for (const candidate of candidates) {
          if (!(candidate?.price > 0)) continue;
          const candidateCurrent = current(candidate), latestCurrent = current(latest);
          if (!latest || candidateCurrent && !latestCurrent || candidateCurrent === latestCurrent && timed(candidate) && (!timed(latest) || candidate.quotedAt > latest.quotedAt)) latest = candidate;
        }
        return latest;
      }
      module.exports = { marketClock, parseQuoteTime, quoteHealth: quoteHealth2, newestQuote };
    }
  });

  // main-modules/quote-parsers.js
  var require_quote_parsers = __commonJS({
    "main-modules/quote-parsers.js"(exports, module) {
      var {
        MARKET,
        marketForSymbol: marketForSymbol2,
        quoteProviderSymbol: quoteProviderSymbol2
      } = require_market_symbols();
      var { marketClock, parseQuoteTime } = require_quote_time();
      function parseSinaQuote2(text, symbol, now = Date.now()) {
        const escaped = String(symbol).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = String(text || "").match(new RegExp(`var hq_str_${escaped}="([^"]*)"`));
        if (!match || !match[1]) return null;
        const parts = match[1].split(",");
        const market = marketForSymbol2(symbol);
        const layout = market === MARKET.HK ? { name: 1, price: 6, change: 7, changePct: 8, prevClose: 3, volume: 12, amount: 11, date: 17, time: 18 } : market === MARKET.US ? { name: 0, price: 1, change: 4, changePct: 2, prevClose: 26, volume: 10, amount: 12, time: 3 } : { name: 0, price: 1, change: 2, changePct: 3, volume: 4, amount: 5, time: 31 };
        const price = Number.parseFloat(parts[layout.price]);
        const change = Number.parseFloat(parts[layout.change]);
        const changePct = Number.parseFloat(parts[layout.changePct]);
        if (![price, change, changePct].every(Number.isFinite)) return null;
        const providedPrevClose = Number.parseFloat(parts[layout.prevClose]);
        const quote = {
          code: symbol,
          name: parts[layout.name] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ""),
          price,
          change,
          prevClose: Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
          changePct,
          volume: parts[layout.volume] || "",
          amount: parts[layout.amount] || "",
          time: [parts[layout.date], parts[layout.time]].filter(Boolean).join(" "),
          market,
          source: "sina"
        };
        if (market !== MARKET.US) return quote;
        const providerUpdatedAt = parseQuoteTime(parts[3], "s_sh000001", now);
        const reference = providerUpdatedAt ?? now;
        const regular = {
          price,
          change,
          changePct,
          prevClose: quote.prevClose,
          time: parts[25] || "",
          quotedAt: parseQuoteTime(parts[25], symbol, reference)
        };
        Object.assign(quote, {
          time: regular.time,
          quotedAt: regular.quotedAt,
          session: "regular",
          dayPrevClose: regular.prevClose,
          providerUpdatedAt,
          timePrecision: "minute",
          regular
        });
        const extendedPrice = Number.parseFloat(parts[21]);
        const extendedAt = parseQuoteTime(parts[24], symbol, reference);
        if (!(extendedPrice > 0) || !Number.isFinite(extendedAt) || extendedAt > now + 9e4) return quote;
        const phase = marketClock(symbol, extendedAt).phase;
        if (!["pre", "post"].includes(phase) || Number.isFinite(regular.quotedAt) && extendedAt <= regular.quotedAt) return quote;
        const extendedChange = extendedPrice - regular.price;
        return {
          ...quote,
          price: extendedPrice,
          change: extendedChange,
          changePct: extendedChange / regular.price * 100,
          prevClose: regular.price,
          dayPrevClose: phase === "pre" ? regular.price : regular.prevClose,
          time: parts[24],
          quotedAt: extendedAt,
          session: phase,
          volume: parts[27] || "",
          amount: ""
        };
      }
      function parseTencentQuote2(text, symbol) {
        const providerSymbol = quoteProviderSymbol2(symbol, "tencent");
        const escaped = providerSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = String(text || "").match(new RegExp(`v_${escaped}="([^"]*)"`));
        if (!match || !match[1]) return null;
        const parts = match[1].split("~");
        const market = marketForSymbol2(symbol);
        const detailed = market !== MARKET.CN;
        const price = Number.parseFloat(parts[3]);
        const change = Number.parseFloat(parts[detailed ? 31 : 4]);
        const changePct = Number.parseFloat(parts[detailed ? 32 : 5]);
        if (![price, change, changePct].every(Number.isFinite)) return null;
        const providedPrevClose = Number.parseFloat(parts[4]);
        const quote = {
          code: symbol,
          name: parts[1] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ""),
          price,
          change,
          prevClose: detailed && Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
          changePct,
          volume: parts[6] || "",
          amount: parts[detailed ? 37 : 7] || "",
          time: detailed ? parts[30] || "" : "",
          source: "tencent",
          market
        };
        if (market === MARKET.US) {
          quote.session = "regular";
          quote.quotedAt = parseQuoteTime(quote.time, symbol);
          quote.dayPrevClose = quote.prevClose;
          quote.regular = { price, change, changePct, prevClose: quote.prevClose, time: quote.time, quotedAt: quote.quotedAt };
        }
        return quote;
      }
      module.exports = { parseSinaQuote: parseSinaQuote2, parseTencentQuote: parseTencentQuote2 };
    }
  });

  // main-modules/desktop-state.cjs
  var require_desktop_state = __commonJS({
    "main-modules/desktop-state.cjs"(exports, module) {
      var { normalizeMarketSymbol: normalizeMarketSymbol2, displaySymbol: displaySymbol2 } = require_market_symbols();
      var DEFAULTS = Object.freeze({
        theme: "system",
        sound: false,
        muted: false,
        mamaSound: false,
        volume: 0.9,
        motion: true,
        interval: 10,
        private: true,
        scene: 0,
        smartScene: true,
        autoActions: true,
        updateNotifications: true,
        petEnabled: true,
        petMode: "market",
        petQuote: true,
        petHideInApp: false,
        petScale: 100,
        muyuSound: false,
        muyuEffects: true,
        muyuCount: true,
        islandEnabled: false,
        islandContent: "market",
        islandTheme: "dark",
        islandPrice: true,
        islandPercent: true,
        islandBull: true,
        islandCount: true,
        islandHoldings: false,
        islandMotion: true,
        islandAutoCollapse: true,
        islandHideInApp: false,
        islandSymbol: "",
        islandWidth: 320,
        islandInterval: 10,
        widgetEnabled: false,
        widgetTheme: "system",
        widgetSparkline: true,
        widgetBull: true,
        emotionMemory: false,
        closeSummary: false,
        quoteSourceMode: "public",
        quoteSourceFallback: false,
        quietOffice: { enabled: false, start: "09:30", end: "11:30" }
      });
      var DEFAULT_STOCKS = [
        { code: "s_sh000001", name: "\u4E0A\u8BC1\u6307\u6570", cost: 0, shares: 0 },
        { code: "s_sz399001", name: "\u6DF1\u8BC1\u6210\u6307", cost: 0, shares: 0 },
        { code: "s_sz399006", name: "\u521B\u4E1A\u677F\u6307", cost: 0, shares: 0 }
      ];
      var positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
      var clamp2 = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
      function normalizeSettings(raw = {}) {
        if (!raw || typeof raw !== "object") raw = {};
        const result = { ...DEFAULTS };
        result.quoteSourceMode = raw.quoteSourceMode === "custom" ? "custom" : "public";
        for (const [key, fallback] of Object.entries(DEFAULTS)) {
          if (typeof fallback === "boolean" && typeof raw[key] === "boolean") result[key] = raw[key];
        }
        for (const key of ["theme", "islandTheme", "widgetTheme"]) {
          if (["system", "light", "dark"].includes(raw[key])) result[key] = raw[key];
        }
        for (const key of ["petMode", "islandContent"]) result[key] = raw[key] === "muyu" ? "muyu" : "market";
        for (const key of ["interval", "islandInterval"]) result[key] = [5, 10, 30].includes(Number(raw[key])) ? Number(raw[key]) : DEFAULTS[key];
        result.volume = clamp2(raw.volume, 0, 1, DEFAULTS.volume);
        result.petScale = clamp2(raw.petScale, 75, 125, DEFAULTS.petScale);
        result.islandWidth = Math.round(clamp2(raw.islandWidth, 260, 420, DEFAULTS.islandWidth));
        result.scene = [0, 1, 2, 3].includes(Number(raw.scene)) ? Number(raw.scene) : 0;
        result.islandSymbol = raw.islandSymbol ? normalizeMarketSymbol2(raw.islandSymbol) || "" : "";
        const quiet2 = raw.quietOffice || {};
        const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value));
        result.quietOffice = {
          enabled: quiet2.enabled === true,
          start: validTime(quiet2.start) ? quiet2.start : "09:30",
          end: validTime(quiet2.end) ? quiet2.end : "11:30"
        };
        return result;
      }
      function normalizeState(raw = {}) {
        if (!raw || typeof raw !== "object") raw = {};
        const seen = /* @__PURE__ */ new Set();
        const stocks = [];
        for (const item of Array.isArray(raw.stocks) ? raw.stocks : []) {
          const code = normalizeMarketSymbol2(item?.code || item?.symbol);
          if (!code || seen.has(code) || stocks.length >= 50) continue;
          seen.add(code);
          stocks.push({ code, name: String(item.name || displaySymbol2(code)).slice(0, 50), cost: positive(item.cost), shares: positive(item.shares) });
        }
        if (!stocks.length) stocks.push(...DEFAULT_STOCKS.map((stock) => ({ ...stock })));
        const selected = normalizeMarketSymbol2(raw.selected);
        const alerts2 = (Array.isArray(raw.alerts) ? raw.alerts : []).slice(0, 20).filter((item) => item && typeof item === "object").map((item) => ({
          ...item,
          presentation: item.presentation === "3d" ? "2d" : item.presentation
        }));
        return {
          version: 2,
          stocks,
          selected: stocks.some((stock) => stock.code === selected) ? selected : stocks[0].code,
          settings: normalizeSettings(raw.settings),
          alerts: alerts2
        };
      }
      function migrateLegacy(values = {}) {
        const parse = (key, fallback) => {
          try {
            return JSON.parse(values[key] || "null") || fallback;
          } catch {
            return fallback;
          }
        };
        const old = parse("niulai:pet-settings", {});
        const portfolio = parse("niulai:portfolio", {});
        const stocks = parse("niulai:saved-stocks-v1", []);
        const candidates = Array.isArray(stocks) ? [...stocks] : [];
        const selected = normalizeMarketSymbol2(values["niulai:selected-symbol"] || portfolio.symbol) || "s_sh000001";
        const existing = candidates.find((stock) => normalizeMarketSymbol2(stock?.symbol) === normalizeMarketSymbol2(portfolio.symbol));
        if (portfolio.cost > 0 && portfolio.shares > 0 && !existing) candidates.push(portfolio);
        if (!candidates.some((stock) => normalizeMarketSymbol2(stock?.symbol) === selected) && candidates.length < 50) candidates.unshift({ symbol: selected });
        if (!values["niulai:pet-settings"] && !values["niulai:saved-stocks-v1"] && !values["niulai:portfolio"] && !values["niulai:selected-symbol"]) return normalizeState();
        return normalizeState({
          stocks: candidates,
          selected,
          settings: {
            ...old,
            sound: old.muted === false && Number(old.volume) > 0,
            motion: old.motion === void 0 || Number(old.motion) > 0,
            interval: old.powerSave === false ? 5 : 10,
            petQuote: old.showQuote !== false,
            petScale: old.modelScale ? Number(old.modelScale) * 100 : 100
          },
          alerts: parse("niulai:alert-triggers-v1", [])
        });
      }
      function dayKey(now = /* @__PURE__ */ new Date()) {
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      }
      function normalizeCounts(raw = {}, now = /* @__PURE__ */ new Date()) {
        if (!raw || typeof raw !== "object") raw = {};
        const valid = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
        return { day: dayKey(now), total: valid(raw.total), today: raw.day === dayKey(now) ? valid(raw.today) : 0, session: valid(raw.session) };
      }
      function tapCounts(raw, reset = false, now = /* @__PURE__ */ new Date()) {
        const counts = normalizeCounts(raw, now);
        if (reset) return { ...counts, session: 0 };
        for (const key of ["total", "today", "session"]) counts[key] = Math.min(Number.MAX_SAFE_INTEGER, counts[key] + 1);
        return counts;
      }
      module.exports = { DEFAULTS, DEFAULT_STOCKS, normalizeSettings, normalizeState, migrateLegacy, normalizeCounts, tapCounts };
    }
  });

  // niulai-android/web/bull-frames.json
  var bull_frames_default = {
    columns: 6,
    rows: 4,
    count: 24,
    sheets: {
      muyu: {
        file: "muyu-v1.webp",
        duration: 400
      },
      scratch: {
        file: "scratch-v1.webp",
        duration: 1e3
      },
      incense: {
        file: "incense-v1.webp",
        duration: 1600
      },
      clap: {
        file: "clap-v1.webp",
        duration: 800
      },
      celebrate: {
        file: "celebrate-v1.webp",
        duration: 1e3
      },
      thumb: {
        file: "thumb-v1.webp",
        duration: 1200
      },
      cheek: {
        file: "cheek-v1.webp",
        duration: 1400
      },
      cover: {
        file: "cover-v1.webp",
        duration: 1400
      },
      sleep: {
        file: "sleep-v2.webp",
        duration: 2e3
      },
      look: {
        file: "look-v1.webp",
        duration: 1600
      },
      wave: {
        file: "wave-v1.webp",
        duration: 1e3
      },
      nod: {
        file: "nod-v1.webp",
        duration: 1e3
      },
      stretch: {
        file: "stretch-v1.webp",
        duration: 1600
      },
      lean: {
        file: "lean-v1.webp",
        duration: 1200
      },
      idle: {
        file: "idle-v1.webp",
        duration: 2400
      }
    },
    clips: {
      loading: {
        sheet: "look",
        rest: 1200
      },
      offline: {
        sheet: "cheek",
        rest: 1200
      },
      preopen: {
        sheet: "stretch",
        rest: 1200
      },
      opening: {
        sheet: "lean",
        rest: 1200
      },
      rise: {
        sheet: "thumb",
        rest: 1200
      },
      rally: {
        sheet: "celebrate",
        rest: 1200
      },
      fall: {
        sheet: "cheek",
        rest: 1200
      },
      slump: {
        sheet: "sleep",
        rest: 1200
      },
      surge: {
        sheet: "celebrate",
        rest: 1200
      },
      drop: {
        sheet: "cover",
        rest: 1200
      },
      rebound: {
        sheet: "lean",
        rest: 1200
      },
      pullback: {
        sheet: "nod",
        rest: 1200
      },
      near: {
        sheet: "scratch",
        rest: 1200
      },
      flat: {
        sheet: "look",
        rest: 1200
      },
      lunch: {
        sheet: "sleep",
        rest: 1600
      },
      closed: {
        sheet: "sleep",
        rest: 1600
      },
      weekend: {
        sheet: "sleep",
        rest: 1600
      },
      wave: {
        sheet: "wave",
        rest: 1200
      },
      nod: {
        sheet: "nod",
        rest: 1200
      },
      happy: {
        sheet: "celebrate",
        rest: 1200
      },
      annoyed: {
        sheet: "look",
        rest: 1200
      },
      clap: {
        sheet: "clap",
        rest: 1200
      },
      incense: {
        sheet: "incense",
        rest: 1200
      },
      cover: {
        sheet: "cover",
        rest: 1200
      },
      scratch: {
        sheet: "scratch",
        rest: 1200
      },
      muyu: {
        sheet: "muyu",
        rest: 0
      },
      idle: {
        sheet: "idle",
        rest: 1600
      }
    }
  };

  // niulai-android/web/frame-player.mjs
  var FramePlayer = class {
    constructor() {
      this.id = "idle";
      this.started = 0;
      this.knocking = false;
      this.queuedKnock = false;
      this.pausedAt = null;
      this.strokeDuration = 400;
      this.lastKnock = -Infinity;
    }
    state(id, now = performance.now(), replay = false) {
      if (!bull_frames_default.clips[id]) id = "loading";
      if (id === this.id && !replay) return;
      if (id === "muyu" && this.id === id && replay && this.knocking && now - this.started < this.strokeDuration) {
        this.queuedKnock = true;
        this.lastKnock = now;
        return;
      }
      this.id = id;
      this.started = this.pausedAt ?? now;
      this.knocking = id === "muyu" && replay;
      if (this.knocking) {
        this.lastKnock = now;
        this.strokeDuration = 400;
      }
      this.queuedKnock = false;
    }
    pause(value, now = performance.now()) {
      if (value && this.pausedAt === null) this.pausedAt = now;
      if (!value && this.pausedAt !== null) {
        this.started += now - this.pausedAt;
        this.pausedAt = null;
      }
      if (value) this.queuedKnock = false;
    }
    frame(now = performance.now(), moving = true) {
      const clip = bull_frames_default.clips[this.id];
      const sheet = bull_frames_default.sheets[clip.sheet];
      let duration = this.id === "muyu" ? this.strokeDuration : sheet.duration;
      let elapsed = Math.max(0, (this.pausedAt ?? now) - this.started);
      if (!moving || this.id === "muyu" && !this.knocking) return { sheet: clip.sheet, index: 0, elapsed: 0 };
      if (this.id === "muyu" && elapsed >= duration) {
        if (this.queuedKnock && elapsed < duration * 2) {
          this.started += duration;
          elapsed -= duration;
          duration = this.strokeDuration = now - this.lastKnock < 180 ? 300 : 400;
          this.queuedKnock = false;
        } else {
          this.knocking = false;
          this.queuedKnock = false;
          return { sheet: clip.sheet, index: 0, elapsed: 0 };
        }
      }
      const time2 = elapsed % (duration + clip.rest);
      const index = time2 >= duration ? 23 : Math.min(23, Math.floor(time2 * 24 / duration));
      return { sheet: clip.sheet, index, elapsed: time2 };
    }
  };

  // niulai-android/web/motion-catalog.json
  var motion_catalog_default = [
    {
      id: "loading",
      label: "\u7B49\u5F85\u884C\u60C5",
      action: "\u62AC\u5934\u5F20\u671B",
      tone: "neutral",
      effect: "dots",
      sprite: 0
    },
    {
      id: "offline",
      label: "\u66F4\u65B0\u5EF6\u8FDF",
      action: "\u6258\u816E\u7B49\u5019",
      tone: "neutral",
      effect: "dots",
      sprite: 0
    },
    {
      id: "preopen",
      label: "\u5F00\u76D8\u524D",
      action: "\u4F38\u5C55\u524D\u8E44",
      tone: "neutral",
      effect: "none",
      sprite: 4
    },
    {
      id: "opening",
      label: "\u5F00\u76D8\u65F6\u6BB5",
      action: "\u63A2\u5934\u770B\u76D8",
      tone: "neutral",
      effect: "spark",
      sprite: 4
    },
    {
      id: "rise",
      label: "\u4E0A\u6DA8",
      action: "\u7AD6\u8E44\u70B9\u5934",
      tone: "rise",
      effect: "up",
      sprite: 4
    },
    {
      id: "rally",
      label: "\u660E\u663E\u4E0A\u6DA8",
      action: "\u4E3E\u8E44\u5E86\u795D",
      tone: "rise",
      effect: "spark",
      sprite: 2
    },
    {
      id: "fall",
      label: "\u4E0B\u8DCC",
      action: "\u6258\u816E\u8F7B\u6643",
      tone: "fall",
      effect: "down",
      sprite: 5
    },
    {
      id: "slump",
      label: "\u660E\u663E\u4E0B\u8DCC",
      action: "\u4F4E\u5934\u7F13\u4E00\u7F13",
      tone: "fall",
      effect: "none",
      sprite: 7
    },
    {
      id: "surge",
      label: "\u77ED\u65F6\u4E0A\u884C",
      action: "\u8F7B\u8DC3\u518D\u7AD9\u7A33",
      tone: "rise",
      effect: "up",
      sprite: 2
    },
    {
      id: "drop",
      label: "\u77ED\u65F6\u56DE\u843D",
      action: "\u62AC\u8E44\u6342\u773C",
      tone: "fall",
      effect: "down",
      sprite: 6
    },
    {
      id: "rebound",
      label: "\u4F4E\u4F4D\u56DE\u5347",
      action: "\u63A2\u5934\u518D\u770B\u770B",
      tone: "rise",
      effect: "up",
      sprite: 4
    },
    {
      id: "pullback",
      label: "\u9AD8\u4F4D\u56DE\u843D",
      action: "\u4F4E\u5934\u770B\u770B",
      tone: "fall",
      effect: "down",
      sprite: 5
    },
    {
      id: "near",
      label: "\u6628\u6536\u9644\u8FD1",
      action: "\u6320\u5934\u770B\u770B",
      tone: "neutral",
      effect: "none",
      sprite: 0
    },
    {
      id: "flat",
      label: "\u7A84\u5E45\u6CE2\u52A8",
      action: "\u5DE6\u53F3\u770B\u770B",
      tone: "neutral",
      effect: "none",
      sprite: 0
    },
    {
      id: "lunch",
      label: "\u5348\u95F4\u4F11\u5E02",
      action: "\u772F\u773C\u6253\u76F9",
      tone: "neutral",
      effect: "sleep",
      sprite: 7
    },
    {
      id: "closed",
      label: "\u5E38\u89C4\u65F6\u6BB5\u5916",
      action: "\u4F4E\u5934\u4F11\u606F",
      tone: "neutral",
      effect: "none",
      sprite: 7
    },
    {
      id: "weekend",
      label: "\u5468\u672B\u4F11\u5E02",
      action: "\u8DB4\u4F4E\u6253\u76F9",
      tone: "neutral",
      effect: "sleep",
      sprite: 7
    },
    {
      id: "wave",
      label: "\u62DB\u624B",
      action: "\u62AC\u8D77\u4E00\u53EA\u524D\u8E44",
      tone: "neutral",
      effect: "spark",
      manual: true,
      sprite: 4
    },
    {
      id: "nod",
      label: "\u70B9\u5934",
      action: "\u8F7B\u8F7B\u70B9\u4E24\u4E0B",
      tone: "neutral",
      effect: "none",
      manual: true,
      sprite: 4
    },
    {
      id: "happy",
      label: "\u5F00\u5FC3",
      action: "\u4E3E\u8E44\u8F7B\u8DC3",
      tone: "rise",
      effect: "spark",
      manual: true,
      sprite: 2
    },
    {
      id: "annoyed",
      label: "\u522B\u6320\u4E86",
      action: "\u8F6C\u5934\u8EB2\u4E00\u4E0B",
      tone: "neutral",
      effect: "none",
      manual: true,
      sprite: 0
    },
    {
      id: "clap",
      label: "\u4E0A\u6DA8",
      action: "\u62CD\u8E44\u9F13\u638C",
      tone: "rise",
      effect: "spark",
      sprite: 3
    },
    {
      id: "incense",
      label: "\u4E0B\u8DCC",
      action: "\u4E0A\u9999\u8F7B\u70B9\u5934",
      tone: "fall",
      effect: "smoke",
      sprite: 1
    },
    {
      id: "cover",
      label: "\u660E\u663E\u4E0B\u8DCC",
      action: "\u62AC\u8E44\u6342\u773C",
      tone: "fall",
      effect: "none",
      sprite: 6
    },
    {
      id: "scratch",
      label: "\u6320\u5934",
      action: "\u524D\u8E44\u6320\u6320\u5934",
      tone: "neutral",
      effect: "none",
      sprite: 0,
      manual: true
    },
    {
      id: "muyu",
      label: "\u6572\u6728\u9C7C",
      action: "\u6728\u69CC\u6572\u51FB",
      tone: "neutral",
      effect: "knock",
      sprite: 8,
      manual: true
    },
    {
      id: "idle",
      label: "\u725B\u6765",
      action: "\u547C\u5438\u7728\u773C",
      tone: "neutral",
      effect: "none",
      sprite: 4,
      manual: true
    }
  ];

  // niulai-android/web/bull-motion.mjs
  var sheets = /* @__PURE__ */ new Map();
  var preparedCaches = /* @__PURE__ */ new WeakMap();
  function loadSheet(name, assetBase, prepareSheet) {
    let cache = sheets;
    if (prepareSheet) {
      if (!preparedCaches.has(prepareSheet)) preparedCaches.set(prepareSheet, /* @__PURE__ */ new Map());
      cache = preparedCaches.get(prepareSheet);
    }
    const key = assetBase + name;
    if (cache.has(key)) {
      const promise2 = cache.get(key);
      cache.delete(key);
      cache.set(key, promise2);
      return promise2;
    }
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try {
          resolve(prepareSheet ? await prepareSheet(image, name) : image);
        } catch (error) {
          cache.delete(key);
          reject(error);
        }
      };
      image.onerror = () => {
        cache.delete(key);
        reject(new Error("\u52A8\u753B\u52A0\u8F7D\u5931\u8D25"));
      };
      image.src = assetBase + bull_frames_default.sheets[name].file;
    });
    cache.set(key, promise);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    return promise;
  }
  var BullMotion = class {
    constructor(canvas, fallback, { assetBase = "assets/frames/", player = new FramePlayer(), fps = 60, miniFps = 30, transitionMs = 0, breathing = false, prepareSheet = null, highQuality = false } = {}) {
      this.canvas = canvas;
      this.fallback = fallback;
      this.assetBase = assetBase;
      this.player = player;
      this.fps = fps;
      this.miniFps = miniFps;
      this.transitionMs = transitionMs;
      this.breathing = breathing;
      this.prepareSheet = prepareSheet;
      this.highQuality = highQuality;
      this.active = true;
      this.motion = true;
      this.mini = false;
      this.raf = 0;
      this.last = 0;
      this.requested = 0;
      this.sheet = null;
      this.draw = this.draw.bind(this);
      this.state("idle");
    }
    async select(id, replay, options) {
      if (!bull_frames_default.clips[id]) id = "loading";
      const name = bull_frames_default.clips[id].sheet;
      const request = ++this.requested;
      try {
        const image = this.sheetName === name ? this.sheet : await this.loadMotionSheet(name);
        if (request !== this.requested) return;
        const now = performance.now();
        if (this.transitionMs && this.sheet && this.sheetName !== name && this.active && this.motion) {
          const snapshot = document.createElement("canvas");
          snapshot.width = this.canvas.width;
          snapshot.height = this.canvas.height;
          snapshot.getContext("2d").drawImage(this.canvas, 0, 0);
          this.transition = { image: snapshot, started: this.player.pausedAt ?? now };
        } else if (this.sheetName !== name) this.transition = null;
        this.sheet = image;
        this.sheetName = name;
        this.player.state(id, now, replay, options);
        this.renderKey = null;
        this.wake();
      } catch (error) {
        if (request === this.requested) this.target = null;
        console.error(error);
      }
    }
    state(id) {
      if (this.target === id) return this.pending;
      this.target = id;
      return this.pending = this.select(id, false);
    }
    replay(id, options) {
      this.target = id;
      return this.pending = this.select(id, true, options);
    }
    loadMotionSheet(name) {
      return loadSheet(name, this.assetBase, this.prepareSheet);
    }
    getDrawing(frame) {
      return { image: this.sheet, index: frame.index, columns: bull_frames_default.columns, rows: bull_frames_default.rows, key: frame.index };
    }
    configure(active, motion) {
      if (this.active === active && this.motion === motion) return;
      this.active = active;
      this.motion = motion;
      const now = performance.now();
      if (active && motion && this.player.pausedAt !== null && this.transition) this.transition.started += now - this.player.pausedAt;
      this.player.pause(!active || !motion, now);
      if (!motion) this.transition = null;
      this.renderKey = null;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (active) {
        this.last = -Infinity;
        this.draw(now);
      }
    }
    wake() {
      if (this.active && !this.raf) this.draw();
    }
    draw(now = performance.now()) {
      this.raf = 0;
      if (!this.active) return;
      const rate = this.player.id === "muyu" && this.player.knocking ? this.mini ? 30 : 60 : this.mini ? this.miniFps : this.fps;
      const interval = 1e3 / rate;
      const elapsed = now - this.last;
      if (this.motion && elapsed < interval - 0.5) {
        this.raf = requestAnimationFrame(this.draw);
        return;
      }
      this.last = this.motion && elapsed >= interval && elapsed < interval * 3 ? now - elapsed % interval : now;
      const w = this.canvas.width, h = this.canvas.height;
      const size = this.mini ? Math.min(w * 1.04, h * 1.08) : Math.min(w * 0.94, h * 0.96);
      const frame = this.player.frame(now, this.motion);
      const drawing = this.getDrawing(frame);
      const clock = this.player.pausedAt ?? now;
      const clip = bull_frames_default.clips[this.player.id];
      const duration = bull_frames_default.sheets[clip.sheet].duration;
      const smooth2 = (value) => {
        const t = Math.min(1, Math.max(0, value));
        return t * t * (3 - 2 * t);
      };
      const restWeight = this.player.id === "idle" ? 1 : smooth2((frame.elapsed - duration) / 180) * smooth2((duration + clip.rest - frame.elapsed) / 180);
      const breath = this.breathing && this.motion && this.player.id !== "muyu" ? (1 - Math.cos((clock - this.player.started) * Math.PI * 2 / 4200)) * 0.5 * restWeight : 0;
      const width = size * (1 + breath * 3e-3), height = size * (1 + breath * 8e-3);
      const x = (w - width) / 2, y = h - height - h * 0.01;
      const blend = this.transition ? smooth2((clock - this.transition.started) / this.transitionMs) : 1;
      if (blend >= 1) this.transition = null;
      const continuous = breath > 0 || this.transition || this.hasContinuousEffects();
      const key = [this.sheetName, frame.index, w, h, this.mini, this.motion, continuous ? clock : 0, drawing.key].join(":");
      const ticking = this.motion && (this.player.id !== "muyu" || this.player.knocking || this.transition);
      if (key === this.renderKey) {
        if (ticking) this.raf = requestAnimationFrame(this.draw);
        return;
      }
      this.renderKey = key;
      const ctx = this.canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = this.highQuality ? "high" : "low";
      ctx.clearRect(0, 0, w, h);
      let target = ctx;
      if (this.transition) {
        this.layer ||= document.createElement("canvas");
        if (this.layer.width !== w) this.layer.width = w;
        if (this.layer.height !== h) this.layer.height = h;
        target = this.layer.getContext("2d");
        target.clearRect(0, 0, w, h);
      }
      if (drawing.image) {
        const sw = (drawing.image.naturalWidth || drawing.image.width) / drawing.columns, sh = (drawing.image.naturalHeight || drawing.image.height) / drawing.rows;
        target.drawImage(drawing.image, drawing.index % drawing.columns * sw, Math.floor(drawing.index / drawing.columns) * sh, sw, sh, x, y, width, height);
        this.drawEffects(target, { frame, clock, x, y, width, height });
      } else if (this.fallback) target.drawImage(this.fallback, x, y, width, height);
      if (this.transition) {
        ctx.save();
        ctx.globalAlpha = 1 - blend;
        ctx.drawImage(this.transition.image, 0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = blend;
        ctx.drawImage(this.layer, 0, 0);
        ctx.restore();
      }
      if (ticking) this.raf = requestAnimationFrame(this.draw);
    }
    hasContinuousEffects() {
      return false;
    }
    drawEffects() {
    }
    close() {
      this.active = false;
      this.requested++;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.sheet = null;
      this.transition = null;
      this.layer = null;
    }
  };

  // renderer-modules/desktop-frame-player.js
  var DesktopFramePlayer = class extends FramePlayer {
    state(id, now = performance.now(), replay = false, { finishCurrent = false } = {}) {
      if (!bull_frames_default.clips[id]) id = "loading";
      const clock = this.pausedAt ?? now;
      if (!replay && id !== "muyu" && bull_frames_default.clips[id].sheet === bull_frames_default.clips[this.id].sheet) {
        if (id !== this.id) this.pendingGesture = null;
        this.id = id;
        return;
      }
      if (finishCurrent && replay && id === this.id && id !== "muyu") {
        const duration = bull_frames_default.sheets[bull_frames_default.clips[id].sheet].duration;
        const elapsed = clock - this.started;
        const cycle = duration + bull_frames_default.clips[id].rest;
        if (elapsed >= 0 && elapsed % cycle < duration) {
          this.pendingGesture = { id, at: this.started + Math.floor(elapsed / cycle) * cycle + duration };
          return;
        }
      }
      this.pendingGesture = null;
      super.state(id, now, replay);
    }
    frame(now = performance.now(), moving = true) {
      const clock = this.pausedAt ?? now;
      if (moving && this.pendingGesture && clock >= this.pendingGesture.at) {
        const pending = this.pendingGesture;
        this.pendingGesture = null;
        if (clock - pending.at < 250) super.state(pending.id, pending.at, true);
      }
      return super.frame(now, moving);
    }
    pause(value, now = performance.now()) {
      if (value) this.pendingGesture = null;
      super.pause(value, now);
    }
  };

  // renderer-modules/desktop-frame-colors.json
  var desktop_frame_colors_default = {
    reference: "idle-v1.webp: median of 24 opaque-material frame medians",
    sourceHashes: {
      muyu: "1802307826ad2b1ef86aa1d484a928ccaa7aab86a5fe409dc69ed7f22f438bc1",
      scratch: "b8c290633073235152b15c1fcbc454be21322bedcc39a971f57bded677b42fe5",
      incense: "81603d55db271fd6d7754474d1e216b9caf73cda7392d80861255ac08c0c03e3",
      clap: "3a0e193c938b3b65dfb1370c510d7917a56bfb187473991c803b06f107d38c91",
      celebrate: "b0e2394e4a818aa62d845df3c4492c1e964036616c162f7c57bdfade9b2302a7",
      thumb: "617ab3092f8e1529f933c7835fb17324900410f1a6fd10f628b0dc183dba4c58",
      cheek: "e65523a40923cf6c05d668d4d00197cb5277f8dd0d92791c9b68c9bda988f111",
      cover: "5a802c0cd8c55a81637bf63a7a5578da78ac825f2c129656456e1d35860633e7",
      sleep: "aea442cab83b3d63c762be8367bbb6481b2248bd89e9af45ca256b2b36e97711",
      look: "5bc6b49e1a61adc0010270e2b053678f949f73422e2bcc9e0466b319eeddea16",
      wave: "68482e1464450e5f7cc63c1d0da3f9f9f9cd108dbdc1d7a4268768bc0d0bab24",
      nod: "324a9ef0583558173d3b67855ff5ba0751a4a49f8449364a04f5684065703543",
      stretch: "26894fc1459d240cb65680607f80fc4eeb23c48b01ca5405ef5c5505ff26fecd",
      lean: "ec487dcd25b29055a12562cd5fef764bd2cf90fbedd706db05f34e56d7bb4d1c",
      idle: "72d5b43ec10c866c54531195d329bb84fbde768f8773c29d688bc2dddbfe5f15"
    },
    target: {
      gold: [
        237,
        149,
        60
      ],
      pink: [
        218,
        151,
        150
      ]
    },
    sheets: {
      muyu: [
        {
          gold: [
            237,
            149,
            65
          ],
          pink: [
            224,
            158,
            158
          ]
        },
        {
          gold: [
            238,
            150,
            65
          ],
          pink: [
            227,
            161,
            162
          ]
        },
        {
          gold: [
            237,
            150,
            65
          ],
          pink: [
            228,
            162,
            164
          ]
        },
        {
          gold: [
            236,
            148,
            62
          ],
          pink: [
            226,
            160,
            162
          ]
        },
        {
          gold: [
            235,
            147,
            62
          ],
          pink: [
            227,
            162,
            164
          ]
        },
        {
          gold: [
            234,
            146,
            60
          ],
          pink: [
            226,
            159,
            160
          ]
        },
        {
          gold: [
            232,
            145,
            59
          ],
          pink: [
            224,
            158,
            159
          ]
        },
        {
          gold: [
            232,
            144,
            58
          ],
          pink: [
            225,
            158,
            159
          ]
        },
        {
          gold: [
            232,
            145,
            58
          ],
          pink: [
            225,
            159,
            160
          ]
        },
        {
          gold: [
            233,
            145,
            58
          ],
          pink: [
            224,
            157,
            158
          ]
        },
        {
          gold: [
            234,
            146,
            61
          ],
          pink: [
            225,
            158,
            160
          ]
        },
        {
          gold: [
            236,
            148,
            62
          ],
          pink: [
            224,
            158,
            159
          ]
        },
        {
          gold: [
            237,
            149,
            62
          ],
          pink: [
            225,
            158,
            159
          ]
        },
        {
          gold: [
            236,
            147,
            63
          ],
          pink: [
            224,
            158,
            159
          ]
        },
        {
          gold: [
            232,
            144,
            59
          ],
          pink: [
            223,
            156,
            157
          ]
        },
        {
          gold: [
            230,
            142,
            56
          ],
          pink: [
            221,
            154,
            155
          ]
        },
        {
          gold: [
            233,
            145,
            59
          ],
          pink: [
            224,
            158,
            159
          ]
        },
        {
          gold: [
            232,
            144,
            58
          ],
          pink: [
            224,
            157,
            159
          ]
        },
        {
          gold: [
            233,
            145,
            59
          ],
          pink: [
            225,
            159,
            160
          ]
        },
        {
          gold: [
            233,
            146,
            60
          ],
          pink: [
            225,
            158,
            160
          ]
        },
        {
          gold: [
            235,
            147,
            62
          ],
          pink: [
            224,
            157,
            158
          ]
        },
        {
          gold: [
            236,
            148,
            64
          ],
          pink: [
            224,
            157,
            158
          ]
        },
        {
          gold: [
            237,
            149,
            65
          ],
          pink: [
            225,
            159,
            160
          ]
        },
        {
          gold: [
            236,
            149,
            65
          ],
          pink: [
            224,
            157,
            159
          ]
        }
      ],
      scratch: [
        {
          gold: [
            239,
            155,
            66
          ],
          pink: [
            217,
            154,
            155
          ]
        },
        {
          gold: [
            238,
            155,
            67
          ],
          pink: [
            219,
            155,
            154
          ]
        },
        {
          gold: [
            238,
            155,
            66
          ],
          pink: [
            219,
            154,
            155
          ]
        },
        {
          gold: [
            237,
            152,
            63
          ],
          pink: [
            218,
            154,
            155
          ]
        },
        {
          gold: [
            235,
            150,
            61
          ],
          pink: [
            218,
            154,
            154
          ]
        },
        {
          gold: [
            233,
            148,
            59
          ],
          pink: [
            216,
            153,
            152
          ]
        },
        {
          gold: [
            233,
            148,
            60
          ],
          pink: [
            217,
            153,
            154
          ]
        },
        {
          gold: [
            233,
            148,
            59
          ],
          pink: [
            219,
            155,
            156
          ]
        },
        {
          gold: [
            233,
            148,
            59
          ],
          pink: [
            219,
            154,
            155
          ]
        },
        {
          gold: [
            233,
            147,
            58
          ],
          pink: [
            219,
            155,
            154
          ]
        },
        {
          gold: [
            233,
            147,
            59
          ],
          pink: [
            218,
            154,
            153
          ]
        },
        {
          gold: [
            233,
            147,
            58
          ],
          pink: [
            220,
            156,
            156
          ]
        },
        {
          gold: [
            233,
            147,
            58
          ],
          pink: [
            219,
            156,
            157
          ]
        },
        {
          gold: [
            233,
            147,
            59
          ],
          pink: [
            217,
            154,
            153
          ]
        },
        {
          gold: [
            232,
            147,
            59
          ],
          pink: [
            218,
            155,
            154
          ]
        },
        {
          gold: [
            232,
            146,
            57
          ],
          pink: [
            217,
            155,
            154
          ]
        },
        {
          gold: [
            233,
            148,
            59
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            232,
            147,
            59
          ],
          pink: [
            217,
            154,
            153
          ]
        },
        {
          gold: [
            233,
            148,
            60
          ],
          pink: [
            217,
            154,
            153
          ]
        },
        {
          gold: [
            237,
            153,
            66
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            238,
            153,
            65
          ],
          pink: [
            217,
            152,
            152
          ]
        },
        {
          gold: [
            238,
            154,
            65
          ],
          pink: [
            217,
            153,
            153
          ]
        },
        {
          gold: [
            238,
            154,
            66
          ],
          pink: [
            217,
            153,
            153
          ]
        },
        {
          gold: [
            238,
            153,
            65
          ],
          pink: [
            218,
            153,
            153
          ]
        }
      ],
      incense: [
        {
          gold: [
            240,
            153,
            66
          ],
          pink: [
            224,
            161,
            160
          ]
        },
        {
          gold: [
            240,
            153,
            67
          ],
          pink: [
            222,
            157,
            156
          ]
        },
        {
          gold: [
            237,
            149,
            63
          ],
          pink: [
            224,
            161,
            160
          ]
        },
        {
          gold: [
            235,
            145,
            61
          ],
          pink: [
            225,
            162,
            160
          ]
        },
        {
          gold: [
            228,
            138,
            57
          ],
          pink: [
            226,
            163,
            161
          ]
        },
        {
          gold: [
            227,
            137,
            55
          ],
          pink: [
            226,
            164,
            162
          ]
        },
        {
          gold: [
            223,
            134,
            54
          ],
          pink: [
            226,
            164,
            162
          ]
        },
        {
          gold: [
            222,
            133,
            52
          ],
          pink: [
            225,
            162,
            159
          ]
        },
        {
          gold: [
            221,
            132,
            52
          ],
          pink: [
            225,
            161,
            158
          ]
        },
        {
          gold: [
            220,
            131,
            51
          ],
          pink: [
            225,
            161,
            158
          ]
        },
        {
          gold: [
            230,
            139,
            56
          ],
          pink: [
            224,
            162,
            158
          ]
        },
        {
          gold: [
            232,
            142,
            59
          ],
          pink: [
            223,
            162,
            158
          ]
        },
        {
          gold: [
            233,
            144,
            60
          ],
          pink: [
            223,
            161,
            159
          ]
        },
        {
          gold: [
            234,
            144,
            60
          ],
          pink: [
            223,
            161,
            158
          ]
        },
        {
          gold: [
            232,
            142,
            59
          ],
          pink: [
            226,
            164,
            161
          ]
        },
        {
          gold: [
            232,
            141,
            58
          ],
          pink: [
            225,
            162,
            160
          ]
        },
        {
          gold: [
            232,
            142,
            59
          ],
          pink: [
            225,
            161,
            159
          ]
        },
        {
          gold: [
            232,
            141,
            58
          ],
          pink: [
            225,
            164,
            162
          ]
        },
        {
          gold: [
            234,
            144,
            60
          ],
          pink: [
            228,
            165,
            164
          ]
        },
        {
          gold: [
            235,
            145,
            61
          ],
          pink: [
            224,
            162,
            160
          ]
        },
        {
          gold: [
            237,
            148,
            63
          ],
          pink: [
            226,
            162,
            160
          ]
        },
        {
          gold: [
            238,
            149,
            65
          ],
          pink: [
            225,
            160,
            159
          ]
        },
        {
          gold: [
            240,
            152,
            67
          ],
          pink: [
            224,
            158,
            158
          ]
        },
        {
          gold: [
            240,
            152,
            67
          ],
          pink: [
            221,
            155,
            153
          ]
        }
      ],
      clap: [
        {
          gold: [
            238,
            153,
            61
          ],
          pink: [
            225,
            158,
            156
          ]
        },
        {
          gold: [
            239,
            153,
            61
          ],
          pink: [
            227,
            161,
            158
          ]
        },
        {
          gold: [
            238,
            153,
            61
          ],
          pink: [
            228,
            161,
            158
          ]
        },
        {
          gold: [
            238,
            152,
            61
          ],
          pink: [
            227,
            160,
            157
          ]
        },
        {
          gold: [
            235,
            149,
            58
          ],
          pink: [
            228,
            162,
            158
          ]
        },
        {
          gold: [
            231,
            144,
            55
          ],
          pink: [
            228,
            161,
            157
          ]
        },
        {
          gold: [
            231,
            145,
            56
          ],
          pink: [
            226,
            162,
            158
          ]
        },
        {
          gold: [
            233,
            146,
            57
          ],
          pink: [
            228,
            163,
            159
          ]
        },
        {
          gold: [
            233,
            144,
            56
          ],
          pink: [
            230,
            164,
            161
          ]
        },
        {
          gold: [
            234,
            146,
            57
          ],
          pink: [
            231,
            164,
            161
          ]
        },
        {
          gold: [
            237,
            150,
            60
          ],
          pink: [
            231,
            165,
            161
          ]
        },
        {
          gold: [
            234,
            147,
            57
          ],
          pink: [
            231,
            163,
            161
          ]
        },
        {
          gold: [
            230,
            144,
            56
          ],
          pink: [
            230,
            166,
            163
          ]
        },
        {
          gold: [
            229,
            143,
            55
          ],
          pink: [
            230,
            165,
            161
          ]
        },
        {
          gold: [
            230,
            143,
            56
          ],
          pink: [
            230,
            164,
            161
          ]
        },
        {
          gold: [
            231,
            143,
            55
          ],
          pink: [
            230,
            165,
            161
          ]
        },
        {
          gold: [
            236,
            150,
            60
          ],
          pink: [
            230,
            164,
            161
          ]
        },
        {
          gold: [
            231,
            143,
            55
          ],
          pink: [
            232,
            168,
            165
          ]
        },
        {
          gold: [
            230,
            143,
            56
          ],
          pink: [
            230,
            164,
            161
          ]
        },
        {
          gold: [
            234,
            148,
            58
          ],
          pink: [
            228,
            163,
            159
          ]
        },
        {
          gold: [
            237,
            151,
            60
          ],
          pink: [
            227,
            159,
            156
          ]
        },
        {
          gold: [
            237,
            150,
            58
          ],
          pink: [
            226,
            158,
            156
          ]
        },
        {
          gold: [
            237,
            150,
            59
          ],
          pink: [
            227,
            159,
            156
          ]
        },
        {
          gold: [
            236,
            150,
            59
          ],
          pink: [
            227,
            159,
            156
          ]
        }
      ],
      celebrate: [
        {
          gold: [
            235,
            151,
            65
          ],
          pink: [
            218,
            153,
            153
          ]
        },
        {
          gold: [
            236,
            151,
            64
          ],
          pink: [
            220,
            154,
            155
          ]
        },
        {
          gold: [
            236,
            151,
            65
          ],
          pink: [
            220,
            155,
            155
          ]
        },
        {
          gold: [
            235,
            150,
            63
          ],
          pink: [
            219,
            155,
            154
          ]
        },
        {
          gold: [
            234,
            148,
            62
          ],
          pink: [
            219,
            154,
            154
          ]
        },
        {
          gold: [
            230,
            144,
            60
          ],
          pink: [
            219,
            155,
            153
          ]
        },
        {
          gold: [
            228,
            141,
            58
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            225,
            138,
            55
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            223,
            134,
            53
          ],
          pink: [
            221,
            156,
            156
          ]
        },
        {
          gold: [
            226,
            139,
            56
          ],
          pink: [
            221,
            155,
            155
          ]
        },
        {
          gold: [
            227,
            140,
            56
          ],
          pink: [
            222,
            156,
            157
          ]
        },
        {
          gold: [
            228,
            142,
            57
          ],
          pink: [
            220,
            154,
            154
          ]
        },
        {
          gold: [
            228,
            142,
            58
          ],
          pink: [
            220,
            155,
            156
          ]
        },
        {
          gold: [
            227,
            140,
            56
          ],
          pink: [
            220,
            154,
            155
          ]
        },
        {
          gold: [
            227,
            139,
            56
          ],
          pink: [
            222,
            156,
            155
          ]
        },
        {
          gold: [
            226,
            137,
            54
          ],
          pink: [
            221,
            156,
            156
          ]
        },
        {
          gold: [
            224,
            137,
            54
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            227,
            140,
            57
          ],
          pink: [
            219,
            154,
            153
          ]
        },
        {
          gold: [
            232,
            146,
            61
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            235,
            149,
            63
          ],
          pink: [
            220,
            155,
            155
          ]
        },
        {
          gold: [
            235,
            150,
            63
          ],
          pink: [
            220,
            155,
            156
          ]
        },
        {
          gold: [
            235,
            150,
            63
          ],
          pink: [
            219,
            154,
            154
          ]
        },
        {
          gold: [
            236,
            150,
            63
          ],
          pink: [
            221,
            154,
            154
          ]
        },
        {
          gold: [
            235,
            150,
            63
          ],
          pink: [
            220,
            153,
            153
          ]
        }
      ],
      thumb: [
        {
          gold: [
            237,
            153,
            68
          ],
          pink: [
            215,
            152,
            151
          ]
        },
        {
          gold: [
            237,
            152,
            67
          ],
          pink: [
            216,
            153,
            153
          ]
        },
        {
          gold: [
            237,
            152,
            67
          ],
          pink: [
            216,
            153,
            152
          ]
        },
        {
          gold: [
            235,
            150,
            66
          ],
          pink: [
            216,
            153,
            152
          ]
        },
        {
          gold: [
            233,
            148,
            64
          ],
          pink: [
            214,
            152,
            150
          ]
        },
        {
          gold: [
            232,
            147,
            63
          ],
          pink: [
            215,
            151,
            149
          ]
        },
        {
          gold: [
            233,
            148,
            63
          ],
          pink: [
            215,
            152,
            152
          ]
        },
        {
          gold: [
            232,
            147,
            63
          ],
          pink: [
            216,
            152,
            152
          ]
        },
        {
          gold: [
            232,
            147,
            63
          ],
          pink: [
            215,
            151,
            150
          ]
        },
        {
          gold: [
            230,
            144,
            61
          ],
          pink: [
            210,
            148,
            146
          ]
        },
        {
          gold: [
            228,
            142,
            59
          ],
          pink: [
            211,
            148,
            146
          ]
        },
        {
          gold: [
            227,
            141,
            59
          ],
          pink: [
            211,
            147,
            145
          ]
        },
        {
          gold: [
            228,
            141,
            59
          ],
          pink: [
            210,
            148,
            146
          ]
        },
        {
          gold: [
            231,
            144,
            61
          ],
          pink: [
            212,
            149,
            148
          ]
        },
        {
          gold: [
            231,
            145,
            61
          ],
          pink: [
            214,
            151,
            149
          ]
        },
        {
          gold: [
            232,
            146,
            62
          ],
          pink: [
            214,
            150,
            149
          ]
        },
        {
          gold: [
            233,
            148,
            63
          ],
          pink: [
            215,
            152,
            151
          ]
        },
        {
          gold: [
            233,
            148,
            65
          ],
          pink: [
            216,
            152,
            151
          ]
        },
        {
          gold: [
            234,
            149,
            66
          ],
          pink: [
            215,
            151,
            151
          ]
        },
        {
          gold: [
            236,
            151,
            67
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            238,
            154,
            69
          ],
          pink: [
            218,
            155,
            154
          ]
        },
        {
          gold: [
            238,
            153,
            68
          ],
          pink: [
            217,
            155,
            154
          ]
        },
        {
          gold: [
            238,
            154,
            69
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            238,
            154,
            69
          ],
          pink: [
            216,
            153,
            153
          ]
        }
      ],
      cheek: [
        {
          gold: [
            241,
            157,
            70
          ],
          pink: [
            224,
            157,
            154
          ]
        },
        {
          gold: [
            238,
            155,
            69
          ],
          pink: [
            222,
            157,
            155
          ]
        },
        {
          gold: [
            238,
            153,
            67
          ],
          pink: [
            223,
            156,
            153
          ]
        },
        {
          gold: [
            238,
            153,
            67
          ],
          pink: [
            224,
            158,
            155
          ]
        },
        {
          gold: [
            234,
            148,
            65
          ],
          pink: [
            222,
            156,
            153
          ]
        },
        {
          gold: [
            231,
            145,
            62
          ],
          pink: [
            221,
            154,
            152
          ]
        },
        {
          gold: [
            232,
            146,
            63
          ],
          pink: [
            222,
            158,
            156
          ]
        },
        {
          gold: [
            232,
            146,
            63
          ],
          pink: [
            224,
            159,
            158
          ]
        },
        {
          gold: [
            233,
            146,
            62
          ],
          pink: [
            223,
            159,
            157
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            223,
            158,
            156
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            224,
            160,
            158
          ]
        },
        {
          gold: [
            234,
            149,
            64
          ],
          pink: [
            224,
            158,
            155
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            220,
            156,
            153
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            220,
            156,
            152
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            221,
            156,
            153
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            221,
            157,
            154
          ]
        },
        {
          gold: [
            234,
            148,
            63
          ],
          pink: [
            222,
            155,
            153
          ]
        },
        {
          gold: [
            235,
            148,
            64
          ],
          pink: [
            223,
            157,
            154
          ]
        },
        {
          gold: [
            235,
            149,
            66
          ],
          pink: [
            222,
            156,
            154
          ]
        },
        {
          gold: [
            233,
            147,
            64
          ],
          pink: [
            224,
            158,
            156
          ]
        },
        {
          gold: [
            232,
            146,
            63
          ],
          pink: [
            223,
            157,
            154
          ]
        },
        {
          gold: [
            236,
            151,
            67
          ],
          pink: [
            222,
            156,
            153
          ]
        },
        {
          gold: [
            239,
            154,
            69
          ],
          pink: [
            222,
            155,
            152
          ]
        },
        {
          gold: [
            238,
            154,
            70
          ],
          pink: [
            221,
            155,
            152
          ]
        }
      ],
      cover: [
        {
          gold: [
            238,
            153,
            65
          ],
          pink: [
            223,
            157,
            153
          ]
        },
        {
          gold: [
            239,
            153,
            65
          ],
          pink: [
            222,
            157,
            154
          ]
        },
        {
          gold: [
            239,
            153,
            65
          ],
          pink: [
            223,
            157,
            154
          ]
        },
        {
          gold: [
            237,
            151,
            62
          ],
          pink: [
            223,
            157,
            154
          ]
        },
        {
          gold: [
            230,
            142,
            56
          ],
          pink: [
            224,
            158,
            155
          ]
        },
        {
          gold: [
            224,
            136,
            50
          ],
          pink: [
            223,
            156,
            152
          ]
        },
        {
          gold: [
            223,
            136,
            49
          ],
          pink: [
            222,
            155,
            152
          ]
        },
        {
          gold: [
            224,
            136,
            49
          ],
          pink: [
            222,
            157,
            153
          ]
        },
        {
          gold: [
            223,
            136,
            49
          ],
          pink: [
            219,
            151,
            149
          ]
        },
        {
          gold: [
            225,
            138,
            50
          ],
          pink: [
            218,
            151,
            147
          ]
        },
        {
          gold: [
            226,
            139,
            51
          ],
          pink: [
            217,
            147,
            143
          ]
        },
        {
          gold: [
            225,
            140,
            52
          ],
          pink: [
            218,
            149,
            145
          ]
        },
        {
          gold: [
            225,
            140,
            52
          ],
          pink: [
            218,
            150,
            146
          ]
        },
        {
          gold: [
            225,
            140,
            52
          ],
          pink: [
            217,
            149,
            145
          ]
        },
        {
          gold: [
            225,
            139,
            51
          ],
          pink: [
            217,
            148,
            143
          ]
        },
        {
          gold: [
            224,
            138,
            50
          ],
          pink: [
            218,
            148,
            143
          ]
        },
        {
          gold: [
            225,
            139,
            51
          ],
          pink: [
            219,
            149,
            146
          ]
        },
        {
          gold: [
            225,
            138,
            50
          ],
          pink: [
            219,
            151,
            147
          ]
        },
        {
          gold: [
            223,
            136,
            49
          ],
          pink: [
            221,
            154,
            151
          ]
        },
        {
          gold: [
            222,
            135,
            48
          ],
          pink: [
            222,
            156,
            152
          ]
        },
        {
          gold: [
            225,
            137,
            51
          ],
          pink: [
            222,
            156,
            153
          ]
        },
        {
          gold: [
            235,
            148,
            60
          ],
          pink: [
            221,
            153,
            151
          ]
        },
        {
          gold: [
            238,
            153,
            63
          ],
          pink: [
            222,
            156,
            153
          ]
        },
        {
          gold: [
            239,
            154,
            65
          ],
          pink: [
            221,
            155,
            151
          ]
        }
      ],
      sleep: [
        {
          gold: [
            243,
            154,
            67
          ],
          pink: [
            221,
            154,
            155
          ]
        },
        {
          gold: [
            243,
            153,
            67
          ],
          pink: [
            221,
            152,
            153
          ]
        },
        {
          gold: [
            242,
            152,
            66
          ],
          pink: [
            219,
            150,
            150
          ]
        },
        {
          gold: [
            241,
            150,
            63
          ],
          pink: [
            219,
            150,
            151
          ]
        },
        {
          gold: [
            242,
            152,
            63
          ],
          pink: [
            219,
            149,
            151
          ]
        },
        {
          gold: [
            242,
            152,
            63
          ],
          pink: [
            220,
            151,
            151
          ]
        },
        {
          gold: [
            242,
            152,
            65
          ],
          pink: [
            219,
            150,
            153
          ]
        },
        {
          gold: [
            242,
            153,
            65
          ],
          pink: [
            219,
            149,
            151
          ]
        },
        {
          gold: [
            243,
            154,
            66
          ],
          pink: [
            215,
            148,
            148
          ]
        },
        {
          gold: [
            243,
            154,
            66
          ],
          pink: [
            215,
            150,
            149
          ]
        },
        {
          gold: [
            243,
            153,
            65
          ],
          pink: [
            212,
            147,
            149
          ]
        },
        {
          gold: [
            244,
            154,
            66
          ],
          pink: [
            210,
            144,
            143
          ]
        },
        {
          gold: [
            243,
            154,
            66
          ],
          pink: [
            206,
            141,
            142
          ]
        },
        {
          gold: [
            243,
            154,
            66
          ],
          pink: [
            210,
            145,
            146
          ]
        },
        {
          gold: [
            243,
            154,
            66
          ],
          pink: [
            217,
            150,
            152
          ]
        },
        {
          gold: [
            245,
            155,
            66
          ],
          pink: [
            217,
            150,
            152
          ]
        },
        {
          gold: [
            244,
            155,
            66
          ],
          pink: [
            215,
            146,
            148
          ]
        },
        {
          gold: [
            244,
            154,
            65
          ],
          pink: [
            218,
            149,
            151
          ]
        },
        {
          gold: [
            243,
            154,
            65
          ],
          pink: [
            215,
            148,
            148
          ]
        },
        {
          gold: [
            242,
            151,
            63
          ],
          pink: [
            217,
            151,
            151
          ]
        },
        {
          gold: [
            241,
            150,
            61
          ],
          pink: [
            217,
            147,
            147
          ]
        },
        {
          gold: [
            242,
            151,
            63
          ],
          pink: [
            217,
            149,
            150
          ]
        },
        {
          gold: [
            242,
            152,
            65
          ],
          pink: [
            220,
            150,
            151
          ]
        },
        {
          gold: [
            242,
            151,
            64
          ],
          pink: [
            217,
            149,
            149
          ]
        }
      ],
      look: [
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            221,
            159,
            161
          ]
        },
        {
          gold: [
            238,
            156,
            71
          ],
          pink: [
            221,
            161,
            163
          ]
        },
        {
          gold: [
            239,
            157,
            71
          ],
          pink: [
            223,
            161,
            163
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            221,
            160,
            162
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            220,
            160,
            161
          ]
        },
        {
          gold: [
            237,
            156,
            69
          ],
          pink: [
            221,
            160,
            162
          ]
        },
        {
          gold: [
            237,
            156,
            69
          ],
          pink: [
            220,
            161,
            163
          ]
        },
        {
          gold: [
            238,
            156,
            69
          ],
          pink: [
            221,
            161,
            162
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            222,
            161,
            162
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            222,
            162,
            162
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            222,
            162,
            163
          ]
        },
        {
          gold: [
            238,
            157,
            71
          ],
          pink: [
            220,
            161,
            162
          ]
        },
        {
          gold: [
            237,
            156,
            70
          ],
          pink: [
            221,
            161,
            162
          ]
        },
        {
          gold: [
            237,
            154,
            68
          ],
          pink: [
            221,
            162,
            163
          ]
        },
        {
          gold: [
            235,
            153,
            67
          ],
          pink: [
            223,
            163,
            165
          ]
        },
        {
          gold: [
            236,
            153,
            67
          ],
          pink: [
            222,
            163,
            166
          ]
        },
        {
          gold: [
            235,
            153,
            67
          ],
          pink: [
            223,
            163,
            164
          ]
        },
        {
          gold: [
            236,
            154,
            67
          ],
          pink: [
            222,
            161,
            163
          ]
        },
        {
          gold: [
            236,
            155,
            68
          ],
          pink: [
            221,
            161,
            163
          ]
        },
        {
          gold: [
            237,
            155,
            68
          ],
          pink: [
            221,
            162,
            164
          ]
        },
        {
          gold: [
            237,
            155,
            69
          ],
          pink: [
            221,
            161,
            162
          ]
        },
        {
          gold: [
            237,
            155,
            69
          ],
          pink: [
            221,
            161,
            162
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            222,
            162,
            164
          ]
        },
        {
          gold: [
            238,
            156,
            70
          ],
          pink: [
            220,
            160,
            161
          ]
        }
      ],
      wave: [
        {
          gold: [
            237,
            150,
            63
          ],
          pink: [
            218,
            151,
            150
          ]
        },
        {
          gold: [
            238,
            150,
            62
          ],
          pink: [
            220,
            151,
            152
          ]
        },
        {
          gold: [
            237,
            150,
            63
          ],
          pink: [
            219,
            150,
            150
          ]
        },
        {
          gold: [
            237,
            150,
            62
          ],
          pink: [
            220,
            152,
            151
          ]
        },
        {
          gold: [
            234,
            146,
            60
          ],
          pink: [
            219,
            151,
            151
          ]
        },
        {
          gold: [
            233,
            145,
            59
          ],
          pink: [
            217,
            150,
            149
          ]
        },
        {
          gold: [
            231,
            143,
            57
          ],
          pink: [
            219,
            151,
            151
          ]
        },
        {
          gold: [
            231,
            143,
            57
          ],
          pink: [
            218,
            150,
            151
          ]
        },
        {
          gold: [
            231,
            143,
            57
          ],
          pink: [
            220,
            151,
            152
          ]
        },
        {
          gold: [
            232,
            144,
            57
          ],
          pink: [
            219,
            149,
            151
          ]
        },
        {
          gold: [
            232,
            144,
            58
          ],
          pink: [
            218,
            149,
            149
          ]
        },
        {
          gold: [
            230,
            143,
            58
          ],
          pink: [
            217,
            149,
            150
          ]
        },
        {
          gold: [
            231,
            143,
            57
          ],
          pink: [
            218,
            150,
            151
          ]
        },
        {
          gold: [
            232,
            145,
            58
          ],
          pink: [
            217,
            148,
            149
          ]
        },
        {
          gold: [
            230,
            143,
            58
          ],
          pink: [
            218,
            150,
            151
          ]
        },
        {
          gold: [
            230,
            142,
            57
          ],
          pink: [
            217,
            149,
            149
          ]
        },
        {
          gold: [
            232,
            145,
            59
          ],
          pink: [
            218,
            150,
            150
          ]
        },
        {
          gold: [
            236,
            149,
            62
          ],
          pink: [
            219,
            149,
            149
          ]
        },
        {
          gold: [
            237,
            150,
            63
          ],
          pink: [
            218,
            149,
            151
          ]
        },
        {
          gold: [
            237,
            149,
            62
          ],
          pink: [
            219,
            150,
            150
          ]
        },
        {
          gold: [
            237,
            150,
            63
          ],
          pink: [
            218,
            148,
            150
          ]
        },
        {
          gold: [
            236,
            149,
            63
          ],
          pink: [
            218,
            149,
            150
          ]
        },
        {
          gold: [
            237,
            151,
            63
          ],
          pink: [
            219,
            152,
            153
          ]
        },
        {
          gold: [
            238,
            152,
            65
          ],
          pink: [
            218,
            148,
            149
          ]
        }
      ],
      nod: [
        {
          gold: [
            239,
            149,
            61
          ],
          pink: [
            221,
            155,
            156
          ]
        },
        {
          gold: [
            239,
            149,
            61
          ],
          pink: [
            222,
            157,
            158
          ]
        },
        {
          gold: [
            238,
            148,
            60
          ],
          pink: [
            221,
            155,
            156
          ]
        },
        {
          gold: [
            236,
            144,
            56
          ],
          pink: [
            218,
            154,
            152
          ]
        },
        {
          gold: [
            235,
            144,
            57
          ],
          pink: [
            217,
            154,
            152
          ]
        },
        {
          gold: [
            235,
            144,
            58
          ],
          pink: [
            214,
            151,
            147
          ]
        },
        {
          gold: [
            235,
            145,
            58
          ],
          pink: [
            213,
            151,
            149
          ]
        },
        {
          gold: [
            236,
            144,
            57
          ],
          pink: [
            217,
            153,
            150
          ]
        },
        {
          gold: [
            236,
            145,
            57
          ],
          pink: [
            220,
            155,
            155
          ]
        },
        {
          gold: [
            237,
            147,
            59
          ],
          pink: [
            221,
            156,
            156
          ]
        },
        {
          gold: [
            238,
            147,
            59
          ],
          pink: [
            218,
            155,
            154
          ]
        },
        {
          gold: [
            236,
            145,
            57
          ],
          pink: [
            217,
            153,
            153
          ]
        },
        {
          gold: [
            235,
            144,
            56
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            235,
            143,
            55
          ],
          pink: [
            219,
            155,
            154
          ]
        },
        {
          gold: [
            236,
            145,
            57
          ],
          pink: [
            217,
            153,
            152
          ]
        },
        {
          gold: [
            237,
            146,
            59
          ],
          pink: [
            219,
            156,
            155
          ]
        },
        {
          gold: [
            238,
            148,
            60
          ],
          pink: [
            221,
            156,
            156
          ]
        },
        {
          gold: [
            237,
            147,
            59
          ],
          pink: [
            221,
            157,
            157
          ]
        },
        {
          gold: [
            238,
            148,
            60
          ],
          pink: [
            219,
            155,
            156
          ]
        },
        {
          gold: [
            238,
            148,
            59
          ],
          pink: [
            222,
            155,
            157
          ]
        },
        {
          gold: [
            238,
            149,
            61
          ],
          pink: [
            222,
            155,
            157
          ]
        },
        {
          gold: [
            238,
            148,
            60
          ],
          pink: [
            219,
            154,
            154
          ]
        },
        {
          gold: [
            238,
            148,
            60
          ],
          pink: [
            220,
            155,
            155
          ]
        },
        {
          gold: [
            238,
            149,
            61
          ],
          pink: [
            221,
            156,
            156
          ]
        }
      ],
      stretch: [
        {
          gold: [
            240,
            153,
            62
          ],
          pink: [
            222,
            156,
            155
          ]
        },
        {
          gold: [
            240,
            154,
            63
          ],
          pink: [
            222,
            155,
            154
          ]
        },
        {
          gold: [
            240,
            153,
            62
          ],
          pink: [
            224,
            157,
            155
          ]
        },
        {
          gold: [
            238,
            151,
            61
          ],
          pink: [
            220,
            156,
            153
          ]
        },
        {
          gold: [
            235,
            148,
            59
          ],
          pink: [
            221,
            157,
            154
          ]
        },
        {
          gold: [
            234,
            146,
            57
          ],
          pink: [
            221,
            156,
            153
          ]
        },
        {
          gold: [
            233,
            145,
            57
          ],
          pink: [
            220,
            157,
            154
          ]
        },
        {
          gold: [
            230,
            141,
            54
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            229,
            139,
            53
          ],
          pink: [
            219,
            155,
            153
          ]
        },
        {
          gold: [
            227,
            138,
            52
          ],
          pink: [
            218,
            155,
            152
          ]
        },
        {
          gold: [
            227,
            138,
            52
          ],
          pink: [
            220,
            154,
            153
          ]
        },
        {
          gold: [
            227,
            139,
            52
          ],
          pink: [
            220,
            154,
            153
          ]
        },
        {
          gold: [
            230,
            141,
            53
          ],
          pink: [
            220,
            156,
            155
          ]
        },
        {
          gold: [
            230,
            141,
            53
          ],
          pink: [
            220,
            156,
            154
          ]
        },
        {
          gold: [
            231,
            142,
            53
          ],
          pink: [
            219,
            153,
            152
          ]
        },
        {
          gold: [
            230,
            141,
            52
          ],
          pink: [
            219,
            154,
            152
          ]
        },
        {
          gold: [
            230,
            141,
            52
          ],
          pink: [
            219,
            155,
            154
          ]
        },
        {
          gold: [
            228,
            139,
            52
          ],
          pink: [
            220,
            155,
            153
          ]
        },
        {
          gold: [
            228,
            139,
            52
          ],
          pink: [
            220,
            155,
            154
          ]
        },
        {
          gold: [
            229,
            139,
            52
          ],
          pink: [
            221,
            156,
            154
          ]
        },
        {
          gold: [
            230,
            140,
            53
          ],
          pink: [
            221,
            156,
            155
          ]
        },
        {
          gold: [
            235,
            146,
            58
          ],
          pink: [
            219,
            154,
            152
          ]
        },
        {
          gold: [
            238,
            151,
            61
          ],
          pink: [
            222,
            154,
            153
          ]
        },
        {
          gold: [
            240,
            153,
            62
          ],
          pink: [
            220,
            153,
            153
          ]
        }
      ],
      lean: [
        {
          gold: [
            237,
            153,
            67
          ],
          pink: [
            223,
            155,
            157
          ]
        },
        {
          gold: [
            238,
            153,
            66
          ],
          pink: [
            225,
            157,
            158
          ]
        },
        {
          gold: [
            236,
            150,
            62
          ],
          pink: [
            224,
            156,
            158
          ]
        },
        {
          gold: [
            235,
            147,
            61
          ],
          pink: [
            224,
            155,
            158
          ]
        },
        {
          gold: [
            234,
            145,
            59
          ],
          pink: [
            223,
            154,
            156
          ]
        },
        {
          gold: [
            234,
            145,
            58
          ],
          pink: [
            221,
            154,
            154
          ]
        },
        {
          gold: [
            235,
            146,
            60
          ],
          pink: [
            220,
            155,
            155
          ]
        },
        {
          gold: [
            237,
            147,
            61
          ],
          pink: [
            217,
            151,
            152
          ]
        },
        {
          gold: [
            237,
            149,
            62
          ],
          pink: [
            218,
            153,
            153
          ]
        },
        {
          gold: [
            240,
            153,
            67
          ],
          pink: [
            216,
            152,
            153
          ]
        },
        {
          gold: [
            240,
            153,
            67
          ],
          pink: [
            216,
            152,
            152
          ]
        },
        {
          gold: [
            238,
            152,
            65
          ],
          pink: [
            216,
            152,
            152
          ]
        },
        {
          gold: [
            241,
            154,
            67
          ],
          pink: [
            216,
            153,
            153
          ]
        },
        {
          gold: [
            242,
            155,
            68
          ],
          pink: [
            217,
            154,
            154
          ]
        },
        {
          gold: [
            241,
            155,
            68
          ],
          pink: [
            218,
            153,
            154
          ]
        },
        {
          gold: [
            240,
            153,
            66
          ],
          pink: [
            219,
            154,
            156
          ]
        },
        {
          gold: [
            238,
            150,
            63
          ],
          pink: [
            219,
            153,
            155
          ]
        },
        {
          gold: [
            237,
            148,
            62
          ],
          pink: [
            219,
            154,
            155
          ]
        },
        {
          gold: [
            235,
            145,
            58
          ],
          pink: [
            219,
            153,
            155
          ]
        },
        {
          gold: [
            234,
            144,
            59
          ],
          pink: [
            221,
            154,
            157
          ]
        },
        {
          gold: [
            234,
            146,
            60
          ],
          pink: [
            220,
            153,
            155
          ]
        },
        {
          gold: [
            235,
            148,
            62
          ],
          pink: [
            222,
            153,
            155
          ]
        },
        {
          gold: [
            236,
            151,
            63
          ],
          pink: [
            223,
            155,
            157
          ]
        },
        {
          gold: [
            237,
            152,
            65
          ],
          pink: [
            223,
            156,
            158
          ]
        }
      ],
      idle: [
        {
          gold: [
            237,
            151,
            62
          ],
          pink: [
            217,
            152,
            151
          ]
        },
        {
          gold: [
            238,
            151,
            62
          ],
          pink: [
            220,
            153,
            152
          ]
        },
        {
          gold: [
            237,
            150,
            61
          ],
          pink: [
            220,
            153,
            152
          ]
        },
        {
          gold: [
            237,
            150,
            61
          ],
          pink: [
            218,
            151,
            149
          ]
        },
        {
          gold: [
            237,
            150,
            61
          ],
          pink: [
            218,
            151,
            149
          ]
        },
        {
          gold: [
            237,
            150,
            61
          ],
          pink: [
            219,
            151,
            150
          ]
        },
        {
          gold: [
            237,
            150,
            60
          ],
          pink: [
            217,
            150,
            149
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            219,
            153,
            152
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            218,
            150,
            149
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            217,
            152,
            150
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            218,
            152,
            150
          ]
        },
        {
          gold: [
            237,
            150,
            61
          ],
          pink: [
            217,
            151,
            149
          ]
        },
        {
          gold: [
            237,
            149,
            59
          ],
          pink: [
            218,
            152,
            151
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            218,
            152,
            151
          ]
        },
        {
          gold: [
            237,
            148,
            59
          ],
          pink: [
            218,
            150,
            150
          ]
        },
        {
          gold: [
            236,
            147,
            59
          ],
          pink: [
            217,
            151,
            149
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            220,
            152,
            151
          ]
        },
        {
          gold: [
            237,
            148,
            60
          ],
          pink: [
            217,
            150,
            149
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            218,
            151,
            151
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            220,
            151,
            150
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            219,
            151,
            150
          ]
        },
        {
          gold: [
            237,
            148,
            59
          ],
          pink: [
            219,
            152,
            151
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            219,
            151,
            150
          ]
        },
        {
          gold: [
            237,
            149,
            60
          ],
          pink: [
            219,
            152,
            150
          ]
        }
      ]
    }
  };

  // renderer-modules/desktop-frame-colors.js
  var smooth = (value, low, high) => {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  function channelMap(pivot, target) {
    return Float32Array.from({ length: 256 }, (_, value) => value <= pivot ? value * target / pivot : target + (value - pivot) * (255 - target) / (255 - pivot));
  }
  var lookups = /* @__PURE__ */ new Map();
  function correctFramePixels(pixels, width, frameWidth, frameHeight, name, rowStart = 0, rowEnd = frameHeight * 4) {
    const frames = desktop_frame_colors_default.sheets[name];
    if (!frames) return;
    if (!lookups.has(name)) lookups.set(name, frames.map((frame) => Object.fromEntries(["gold", "pink"].map((material) => [
      material,
      frame[material].map((pivot, channel) => channelMap(pivot, desktop_frame_colors_default.target[material][channel]))
    ]))));
    const maps = lookups.get(name);
    for (let y = rowStart; y < rowEnd; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (!pixels[offset + 3]) continue;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const gold = smooth(g - b, 15, 35) * smooth(r - g, 5, 16) * smooth(r, 80, 125);
      const pink = (1 - gold) * smooth(r - g, 15, 25) * (1 - smooth(Math.abs(g - b), 15, 30)) * smooth(r, 110, 150) * smooth(g, 60, 85);
      if (gold + pink < 1e-3) continue;
      const map = maps[Math.floor(y / frameHeight) * 6 + Math.floor(x / frameWidth)];
      for (let channel = 0; channel < 3; channel++) {
        const value = pixels[offset + channel];
        pixels[offset + channel] = Math.round(value + (map.gold[channel][value] - value) * gold + (map.pink[channel][value] - value) * pink);
      }
    }
  }
  async function prepareDesktopSheet(image, name) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const frameWidth = canvas.width / 6, frameHeight = canvas.height / 4;
    for (let row = 0; row < 4; row++) {
      correctFramePixels(data2.data, canvas.width, frameWidth, frameHeight, name, row * frameHeight, (row + 1) * frameHeight);
      if (row < 3) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    ctx.putImageData(data2, 0, 0);
    return canvas;
  }

  // assets/2d/frames/hq/manifest.json
  var manifest_default = {
    version: 1,
    frameSize: 512,
    columns: 4,
    rows: 4,
    pageFrames: 16,
    sheets: {
      cover: {
        duration: 1400,
        count: 84,
        pages: [
          "cover-00.webp",
          "cover-01.webp",
          "cover-02.webp",
          "cover-03.webp",
          "cover-04.webp",
          "cover-05.webp"
        ]
      },
      wave: {
        duration: 1e3,
        count: 60,
        pages: [
          "wave-00.webp",
          "wave-01.webp",
          "wave-02.webp",
          "wave-03.webp"
        ]
      },
      muyu: {
        duration: 400,
        count: 24,
        pages: [
          "muyu-00.webp",
          "muyu-01.webp"
        ]
      },
      scratch: {
        duration: 1e3,
        count: 60,
        pages: [
          "scratch-00.webp",
          "scratch-01.webp",
          "scratch-02.webp",
          "scratch-03.webp"
        ]
      },
      incense: {
        duration: 1600,
        count: 96,
        pages: [
          "incense-00.webp",
          "incense-01.webp",
          "incense-02.webp",
          "incense-03.webp",
          "incense-04.webp",
          "incense-05.webp"
        ]
      },
      clap: {
        duration: 800,
        count: 48,
        pages: [
          "clap-00.webp",
          "clap-01.webp",
          "clap-02.webp"
        ]
      },
      celebrate: {
        duration: 1e3,
        count: 60,
        pages: [
          "celebrate-00.webp",
          "celebrate-01.webp",
          "celebrate-02.webp",
          "celebrate-03.webp"
        ]
      },
      thumb: {
        duration: 1200,
        count: 72,
        pages: [
          "thumb-00.webp",
          "thumb-01.webp",
          "thumb-02.webp",
          "thumb-03.webp",
          "thumb-04.webp"
        ]
      },
      cheek: {
        duration: 1400,
        count: 84,
        pages: [
          "cheek-00.webp",
          "cheek-01.webp",
          "cheek-02.webp",
          "cheek-03.webp",
          "cheek-04.webp",
          "cheek-05.webp"
        ]
      },
      sleep: {
        duration: 2e3,
        count: 120,
        pages: [
          "sleep-00.webp",
          "sleep-01.webp",
          "sleep-02.webp",
          "sleep-03.webp",
          "sleep-04.webp",
          "sleep-05.webp",
          "sleep-06.webp",
          "sleep-07.webp"
        ]
      },
      look: {
        duration: 1600,
        count: 96,
        pages: [
          "look-00.webp",
          "look-01.webp",
          "look-02.webp",
          "look-03.webp",
          "look-04.webp",
          "look-05.webp"
        ]
      },
      nod: {
        duration: 1e3,
        count: 60,
        pages: [
          "nod-00.webp",
          "nod-01.webp",
          "nod-02.webp",
          "nod-03.webp"
        ]
      },
      stretch: {
        duration: 1600,
        count: 96,
        pages: [
          "stretch-00.webp",
          "stretch-01.webp",
          "stretch-02.webp",
          "stretch-03.webp",
          "stretch-04.webp",
          "stretch-05.webp"
        ]
      },
      lean: {
        duration: 1200,
        count: 72,
        pages: [
          "lean-00.webp",
          "lean-01.webp",
          "lean-02.webp",
          "lean-03.webp",
          "lean-04.webp"
        ]
      },
      idle: {
        duration: 2400,
        count: 144,
        pages: [
          "idle-00.webp",
          "idle-01.webp",
          "idle-02.webp",
          "idle-03.webp",
          "idle-04.webp",
          "idle-05.webp",
          "idle-06.webp",
          "idle-07.webp",
          "idle-08.webp"
        ]
      }
    },
    encoding: "lossless-webp"
  };

  // renderer-modules/desktop-hq-frames.js
  var pages = /* @__PURE__ */ new Map();
  var imageMetadata = /* @__PURE__ */ new WeakMap();
  var LIMIT = 4;
  function pageRecord(name, index, assetBase) {
    const spec = manifest_default.sheets[name];
    const url = new URL("../hq/" + spec.pages[index], new URL(assetBase, location.href)).href;
    let record = pages.get(url);
    if (record && (!record.failedAt || performance.now() - record.failedAt < 5e3)) {
      pages.delete(url);
      pages.set(url, record);
      return record;
    }
    record = { image: null, failedAt: 0 };
    record.promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try {
          await image.decode();
          record.image = image;
          imageMetadata.set(image, { name, page: index });
          resolve(image);
        } catch (error) {
          record.failedAt = performance.now() || 1;
          reject(error);
        }
      };
      image.onerror = () => {
        record.failedAt = performance.now() || 1;
        reject(new Error("\u9AD8\u6E05\u52A8\u753B\u52A0\u8F7D\u5931\u8D25"));
      };
      image.src = url;
    });
    record.promise.catch(() => {
    });
    pages.set(url, record);
    while (pages.size > LIMIT) pages.delete(pages.keys().next().value);
    return record;
  }
  function loadFirstHQPage(name, assetBase) {
    if (!manifest_default.sheets[name]) return null;
    const first = pageRecord(name, 0, assetBase);
    if (manifest_default.sheets[name].pages.length > 1) pageRecord(name, 1, assetBase);
    return first.promise;
  }
  function resolveHQDrawing(motion, frame) {
    const spec = manifest_default.sheets[frame.sheet];
    if (!spec || imageMetadata.get(motion.sheet)?.name !== frame.sheet) return null;
    const duration = motion.player.id === "muyu" ? motion.player.strokeDuration : spec.duration;
    const index = Math.min(spec.count - 1, Math.floor(frame.elapsed * spec.count / duration));
    const page = Math.floor(index / manifest_default.pageFrames);
    const record = pageRecord(frame.sheet, page, motion.assetBase);
    pageRecord(frame.sheet, (page + 1) % spec.pages.length, motion.assetBase);
    if (record.image) {
      motion.sheet = record.image;
      motion.lastHQDrawing = { image: record.image, index: index % manifest_default.pageFrames, columns: manifest_default.columns, rows: manifest_default.rows, key: "hq-" + index, name: frame.sheet };
    }
    if (motion.lastHQDrawing?.name === frame.sheet) return motion.lastHQDrawing;
    return { image: motion.sheet, index: 0, columns: manifest_default.columns, rows: manifest_default.rows, key: "hq-wait" };
  }

  // renderer-modules/desktop-crying-motion.js
  var DesktopBullMotion = class extends BullMotion {
    constructor(canvas, fallback, options = {}) {
      super(canvas, fallback, { ...options, player: new DesktopFramePlayer(), fps: 60, miniFps: 30, transitionMs: 0, breathing: false, prepareSheet: prepareDesktopSheet, highQuality: options.highQuality !== false });
      this.resizeBacking = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.min(1024, Math.max(1, Math.round(rect.width * ratio)));
        const height = Math.min(1024, Math.max(1, Math.round(rect.height * ratio)));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          this.renderKey = null;
          this.wake();
        }
      };
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(this.resizeBacking);
        this.resizeObserver.observe(canvas);
      }
      this.resizeBacking();
      window.addEventListener("resize", this.resizeBacking);
    }
    async loadMotionSheet(name) {
      if (this.highQuality) {
        try {
          const first = loadFirstHQPage(name, this.assetBase);
          if (first) return await first;
        } catch {
        }
      }
      return super.loadMotionSheet(name);
    }
    getDrawing(frame) {
      return this.highQuality && resolveHQDrawing(this, frame) || super.getDrawing(frame);
    }
    close() {
      this.resizeObserver?.disconnect();
      window.removeEventListener("resize", this.resizeBacking);
      this.lastHQDrawing = null;
      super.close();
    }
    state(id) {
      this.desktopMood = id;
      return super.state(id === "slump" ? "cover" : id);
    }
    replay(id, options) {
      this.desktopMood = id;
      return super.replay(id === "slump" ? "cover" : id, options);
    }
    interact(id) {
      return this.replay(id, { finishCurrent: true });
    }
    hasContinuousEffects() {
      return this.motion && this.player.id === "cover";
    }
    drawEffects(context, { frame, clock, x: left, y: top, width, height }) {
      if (!this.hasContinuousEffects()) return;
      const onset = Math.min(1, Math.max(0, (frame.elapsed - 280) / 180));
      const release = Math.min(1, Math.max(0, (1400 - frame.elapsed) / 200));
      context.save();
      for (const [index, x] of [0.38, 0.63].entries()) {
        const phase = ((clock - this.player.started) / 1e3 + index * 0.4) % 1;
        const y = top + height * (0.4 + phase * 0.15);
        const radius = width * 0.013;
        context.globalAlpha = Math.sin(phase * Math.PI) * 0.8 * onset * release;
        context.fillStyle = "#79c7ed";
        context.beginPath();
        context.moveTo(left + width * x, y - radius * 1.8);
        context.bezierCurveTo(left + width * x + radius * 2, y, left + width * x + radius, y + radius * 1.5, left + width * x, y + radius * 1.5);
        context.bezierCurveTo(left + width * x - radius, y + radius * 1.5, left + width * x - radius * 2, y, left + width * x, y - radius * 1.8);
        context.fill();
      }
      context.restore();
    }
  };

  // niulai-android/web/features.mjs
  var import_market_symbols = __toESM(require_market_symbols(), 1);

  // niulai-android/web/core.mjs
  var import_market_symbols2 = __toESM(require_market_symbols(), 1);
  var import_quote_parsers = __toESM(require_quote_parsers(), 1);
  var { normalizeMarketSymbol, marketForSymbol, displaySymbol, quoteProviderSymbol, parseTencentSuggestions } = import_market_symbols2.default;
  var { parseSinaQuote, parseTencentQuote } = import_quote_parsers.default;
  function position(stock, quote) {
    if (!stock?.cost || !stock?.shares || !quote || quote.code !== stock.code) return null;
    const dayPrevClose = Object.hasOwn(quote, "dayPrevClose") ? quote.dayPrevClose : quote.prevClose;
    return {
      today: Number.isFinite(dayPrevClose) ? (quote.price - dayPrevClose) * stock.shares : null,
      total: (quote.price - stock.cost) * stock.shares,
      percent: (quote.price / stock.cost - 1) * 100,
      value: quote.price * stock.shares
    };
  }
  function currency(code) {
    return { cn: "CNY", hk: "HKD", us: "USD" }[marketForSymbol(code)];
  }
  function marketSession(code, now = /* @__PURE__ */ new Date()) {
    const market = marketForSymbol(code);
    const zone = market === "us" ? "America/New_York" : "Asia/Shanghai";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
    const minute = Number(parts.hour) % 24 * 60 + Number(parts.minute);
    if (parts.weekday === "Sat" || parts.weekday === "Sun") return "\u5468\u672B\u4F11\u5E02";
    if (market === "us") return minute >= 570 && minute < 960 ? "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5" : "\u5E38\u89C4\u65F6\u6BB5\u5916";
    const close = market === "hk" ? 960 : 900;
    const lunch = market === "hk" ? 720 : 690;
    if (minute >= lunch && minute < 780) return "\u5348\u95F4\u4F11\u5E02";
    return minute >= 570 && minute < close ? "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5" : "\u5E38\u89C4\u65F6\u6BB5\u5916";
  }

  // renderer-modules/desktop-ui.js
  var import_quote_time = __toESM(require_quote_time());
  var { quoteHealth } = import_quote_time.default;
  var catalog = motion_catalog_default.map((spec) => ["cover", "slump"].includes(spec.id) ? { ...spec, action: "\u6342\u773C\u54ED\u6CE3" } : spec);
  var $ = (id) => document.getElementById(id);
  var api = window.desktopPet;
  var fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "\u2014";
  var signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${fmt(Math.abs(value), digits)}` : "\u2014";
  var tone = (value) => value > 0 ? "rise" : value < 0 ? "fall" : "neutral";
  var time = (value) => value ? new Date(value).toLocaleTimeString("zh-CN", { hour12: false }) : "\u2014";
  function quotePresentation(record, interval = 10, now = Date.now()) {
    const quote = record?.quote;
    const health = quoteHealth(record, interval, now);
    if (!quote) return { ...health, session: "", label: "", summary: health.message, compact: health.message, detail: health.message, basis: "" };
    const us = quote.market === "us" || quote.code.startsWith("gb_");
    const clock = import_quote_time.default.marketClock(quote.code, now);
    const label = us ? { pre: "\u76D8\u524D", regular: "\u5E38\u89C4", post: "\u76D8\u540E" }[quote.session] || "\u5E38\u89C4" : "";
    const provider = quote.source === "custom" ? quote.sourceName || "\u81EA\u6709\u6E90" : (quote.source === "tencent" ? "\u817E\u8BAF" : "\u65B0\u6D6A") + (quote.fallbackFrom ? "\uFF08\u81EA\u6709\u6E90\u56DE\u9000\uFF09" : "");
    const stamp = Number.isFinite(quote.quotedAt) ? new Date(quote.quotedAt).toLocaleString("zh-CN", {
      timeZone: us ? "America/New_York" : "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: quote.timePrecision === "minute" ? void 0 : "2-digit",
      hour12: false
    }) + (us ? " \u7F8E\u4E1C" : "") : quote.time || "\u65F6\u95F4\u672A\u63D0\u4F9B";
    const prefix = health.message ? health.message + " \xB7 " : "";
    const quoteText = us || quote.source === "custom" ? `${label ? label + " \xB7 " : ""}\u62A5\u4EF7 ${stamp}` : `\u83B7\u53D6\u4E8E ${time(record.received)}`;
    const currentSession = { pre: "\u76D8\u524D", regular: "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5", post: "\u76D8\u540E", closed: "\u5E38\u89C4\u65F6\u6BB5\u5916", weekend: "\u5468\u672B\u4F11\u5E02", lunch: "\u5348\u95F4\u4F11\u5E02" }[clock.phase];
    const basis = quote.session === "pre" ? "\u76D8\u524D\u6DA8\u8DCC\u8F83\u4E0A\u4E00\u5E38\u89C4\u6536\u76D8" : quote.session === "post" ? "\u76D8\u540E\u6DA8\u8DCC\u8F83\u5F53\u65E5\u5E38\u89C4\u6536\u76D8" : "\u6DA8\u8DCC\u8F83\u524D\u6536\u76D8";
    const reference = quote.regular && quote.session !== "regular" ? ` \xB7 \u5E38\u89C4\u6536\u76D8 ${fmt(quote.regular.price)}` : "";
    return {
      ...health,
      label,
      session: us ? currentSession + (label && quote.session !== clock.phase ? ` \xB7 \u6700\u8FD1${label}\u62A5\u4EF7` : "") : marketSession(quote.code),
      summary: `${prefix}${provider} \xB7 ${quoteText}`,
      compact: `${prefix}${quote.source === "custom" || quote.fallbackFrom ? provider + " \xB7 " : ""}${quoteText}`,
      detail: `${provider} \xB7 ${label || "\u5E38\u89C4"}\u62A5\u4EF7
\u62A5\u4EF7\u65F6\u95F4 ${stamp}
\u83B7\u53D6\u65F6\u95F4 ${new Date(record.received).toLocaleString("zh-CN", { hour12: false })}
${basis}${reference}
${quote.source === "custom" ? "\u884C\u60C5\u6743\u9650\u3001\u4EA4\u6613\u8303\u56F4\u4E0E\u65F6\u6548\u4EE5\u81EA\u6709\u63A5\u53E3\u4E3A\u51C6" : "\u516C\u5F00\u884C\u60C5\u53EF\u80FD\u5EF6\u8FDF\uFF0C\u4E0D\u540C\u6765\u6E90\u7684\u6210\u4EA4\u8303\u56F4\u53EF\u80FD\u4E0D\u540C"}`,
      basis: basis + reference
    };
  }
  function element(tag, value = "", className = "") {
    const node = document.createElement(tag);
    node.textContent = value;
    node.className = className;
    return node;
  }
  function makeMotion(canvas, mini2 = false) {
    const motion = new DesktopBullMotion(canvas, null, { assetBase: "assets/2d/frames/webp/" });
    motion.mini = mini2;
    return motion;
  }
  function desktopMood(base, data2, code) {
    if (!data2.state.settings.autoActions || data2.suspended || ["offline", "loading", "preopen", "closed", "weekend", "lunch"].includes(base)) return base;
    if (data2.reactions?.[code]?.crying && marketSession(code) === "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5") return data2.quotes[code]?.quote?.changePct <= -5 ? "slump" : "cover";
    return ["cover", "slump"].includes(base) ? "incense" : base;
  }
  function drawSparkline(canvas, samples, color) {
    const context = canvas.getContext("2d");
    const width = canvas.width, height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    if (samples.length < 2) return;
    const prices = samples.map((sample) => sample.price);
    const min = Math.min(...prices), max = Math.max(...prices);
    const span = max - min || Math.max(1, min * 1e-3);
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = 5 + index / (samples.length - 1) * (width - 10);
      const y = max === min ? height / 2 : height - 9 - (sample.price - min) / span * (height - 18);
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    context.stroke();
  }
  var paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    chart: '<path d="M3 17l6-6 4 3 8-9M16 5h5v5M3 21h18"/>',
    wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18M10 12v3h4v-3"/>',
    wood: '<path d="M4 16c0-4 3-7 8-7s8 3 8 7c0 3-16 3-16 0zM8 14l8-2M6 4l7 5"/>',
    desktop: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M20 10a8 8 0 10-1 7M20 3v7h-7"/>',
    pet: '<path d="M5 9L3 4l6 3m10 2 2-5-6 3M5 11c0-4 14-4 14 0v6c0 6-14 6-14 0zM8 13v1m8-1v1M9 18h6"/>',
    island: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="7" cy="12" r="1"/><path d="M12 12h5"/>',
    card: '<rect x="3" y="3" width="18" height="16" rx="3"/><path d="M7 7h5M7 12h10M7 22h10"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>'
  };
  function paintIcons(root = document) {
    for (const node of root.querySelectorAll("[data-icon]")) {
      node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[node.dataset.icon] || ""}</svg>`;
    }
  }

  // niulai-android/web/market-mood.mjs
  function sessionPhase(code, now) {
    const us = marketForSymbol(code) === "us", hk = marketForSymbol(code) === "hk";
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: us ? "America/New_York" : "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now)).map((p2) => [p2.type, p2.value]));
    const m = Number(p.hour) % 24 * 60 + Number(p.minute), day = `${p.year}-${p.month}-${p.day}`;
    let phase = "closed";
    if (p.weekday === "Sat" || p.weekday === "Sun") phase = "weekend";
    else if (m >= 555 && m < 570) phase = "preopen";
    else if (!us && m >= (hk ? 720 : 690) && m < 780) phase = "lunch";
    else if (m >= 570 && m < (us || hk ? 960 : 900)) phase = m < 573 ? "opening" : "trading";
    return { phase, key: day + ":" + phase };
  }
  var MarketMood = class {
    constructor() {
      this.reset();
    }
    reset() {
      this.key = "";
      this.samples = [];
      this.mood = "loading";
      this.since = 0;
      this.lastSample = 0;
    }
    update(q, error, now = Date.now(), interval = 10, code = q?.code || "s_sh000001") {
      const session2 = sessionPhase(code, now), key = code + ":" + session2.key;
      if (key !== this.key) {
        this.samples = [];
        this.lastSample = 0;
        this.key = key;
        this.since = 0;
      }
      let next;
      const valid = q && q.code === code && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(q.changePct);
      if (error || valid && (now - q.received > Math.max(45e3, interval * 2500) || q.received > now + 5e3)) next = "offline";
      else if (session2.phase !== "trading" && session2.phase !== "opening") next = session2.phase;
      else if (!valid) next = "loading";
      else {
        const fresh = q.received > this.lastSample;
        this.samples = this.samples.filter((s) => now - s.at <= 9e4);
        if (fresh) {
          this.samples.push({ at: q.received, price: q.price });
          this.lastSample = q.received;
          if (this.samples.length > 24) this.samples.shift();
        }
        const a = this.samples, first = a[0], span = first ? now - first.at : 0, base = first?.price || q.price;
        const min = a.reduce((v, s) => Math.min(v, s.price), q.price), max = a.reduce((v, s) => Math.max(v, s.price), q.price);
        const move = (q.price / base - 1) * 100, fromLow = (q.price / min - 1) * 100, fromHigh = (q.price / max - 1) * 100;
        if (a.length >= 3 && span >= 1e4 && (min / base - 1) * 100 <= -0.5 && fromLow >= 0.45) next = "rebound";
        else if (a.length >= 3 && span >= 1e4 && (max / base - 1) * 100 >= 0.5 && fromHigh <= -0.45) next = "pullback";
        else if (a.length >= 2 && span >= 5e3 && move >= 0.6) next = "surge";
        else if (a.length >= 2 && span >= 5e3 && move <= -0.6) next = "drop";
        else if (session2.phase === "opening") next = "opening";
        else if (a.length >= 3 && span >= 2e4 && (max / min - 1) * 100 <= 0.12) next = "flat";
        else next = q.changePct >= 5 ? "rally" : q.changePct >= 2 ? "clap" : q.changePct > 0.15 ? "rise" : q.changePct >= -0.15 ? "near" : q.changePct > -1 ? "fall" : q.changePct > -3 ? "incense" : q.changePct > -5 ? "cover" : "slump";
      }
      const immediate = ["offline", "loading", "preopen", "opening", "lunch", "closed", "weekend"].includes(next);
      if (next !== this.mood && (immediate || !this.since || now - this.since >= 8e3)) {
        this.mood = next;
        this.since = now;
      }
      return this.mood;
    }
  };

  // niulai-android/web/tap-voice.mjs
  var TapVoice = class {
    constructor(url) {
      this.url = url;
      this.volume = 0.65;
      this.lastPlayed = -Infinity;
      this.sources = /* @__PURE__ */ new Set();
    }
    async play() {
      const now = performance.now();
      if (now - this.lastPlayed < 480) return;
      this.lastPlayed = now;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.context ??= new AudioContext();
      const context = this.context;
      await context.resume();
      this.loading ??= fetch(this.url).then((response) => {
        if (!response.ok) throw new Error("\u58F0\u97F3\u52A0\u8F7D\u5931\u8D25");
        return response.arrayBuffer();
      }).then((buffer2) => context.decodeAudioData(buffer2)).catch((error) => {
        this.loading = null;
        throw error;
      });
      const epoch = this.epoch;
      const buffer = await this.loading;
      if (epoch !== this.epoch) return;
      for (const voice3 of this.sources) voice3.gain.gain.setTargetAtTime(this.volume * 0.4, context.currentTime, 0.02);
      if (this.sources.size >= 2) this.sources.values().next().value.source.stop();
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = this.volume;
      source.connect(gain);
      gain.connect(context.destination);
      const voice2 = { source, gain };
      this.sources.add(voice2);
      source.onended = () => {
        this.sources.delete(voice2);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    }
    stop() {
      this.epoch = (this.epoch || 0) + 1;
      for (const voice2 of this.sources) {
        try {
          voice2.source.stop();
        } catch {
        }
      }
      this.sources.clear();
    }
  };

  // renderer-modules/mama-voice.js
  var MamaVoice = class {
    constructor() {
      this.audio = new Audio("assets/audio/mama.mp3");
      this.epoch = 0;
    }
    async play(volume) {
      this.stop();
      const epoch = this.epoch;
      const target = Math.max(0, Math.min(1, volume)) * 0.2;
      this.audio.volume = 0;
      await this.audio.play();
      const started = performance.now();
      const fade = (now) => {
        if (epoch !== this.epoch || this.audio.paused) return;
        this.audio.volume = target * Math.min(1, (now - started) / 300);
        if (now - started < 300) this.frame = requestAnimationFrame(fade);
      };
      this.frame = requestAnimationFrame(fade);
    }
    stop() {
      this.epoch++;
      cancelAnimationFrame(this.frame);
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  };

  // renderer.js
  var import_desktop_state = __toESM(require_desktop_state());

  // renderer-modules/emotion-memory.js
  var EMOTION = Object.freeze({
    EXCITED: "excited",
    CAUTIOUS: "cautious",
    TIRED: "tired",
    FRUSTRATED: "frustrated",
    SMUG: "smug"
  });
  var EMOTION_LABELS = Object.freeze({
    [EMOTION.EXCITED]: "\u5174\u594B",
    [EMOTION.CAUTIOUS]: "\u8C28\u614E",
    [EMOTION.TIRED]: "\u75B2\u60EB",
    [EMOTION.FRUSTRATED]: "\u6CAE\u4E27",
    [EMOTION.SMUG]: "\u5F97\u610F"
  });
  var EVENT_IMPULSE = Object.freeze({
    RAPID_RISE: { excited: 18, smug: 8 },
    LIMIT_UP: { excited: 24, smug: 22 },
    RAPID_FALL: { cautious: 12, frustrated: 18 },
    LIMIT_DOWN: { cautious: 14, frustrated: 25 },
    POSITION_RECOVERED: { excited: 12, smug: 18 },
    PROFIT_EXPANDED: { smug: 13 },
    PROFIT_PULLBACK: { cautious: 11, frustrated: 10 }
  });
  function clamp(value, min = 0, max = 100) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }
  function shanghaiDayKey(date = /* @__PURE__ */ new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }
  function freshState(day = shanghaiDayKey()) {
    return {
      day,
      values: { excited: 18, cautious: 28, tired: 12, frustrated: 10, smug: 10 },
      mood: EMOTION.CAUTIOUS,
      updatedAt: 0
    };
  }
  var EmotionMemory = class {
    constructor({ enabled = false, state, now = () => Date.now() } = {}) {
      this.enabled = enabled === true;
      this.now = now;
      this.state = this.normalizeState(state);
    }
    normalizeState(state) {
      const day = shanghaiDayKey(new Date(this.now()));
      if (!state || state.day !== day) return freshState(day);
      const next = freshState(day);
      for (const key of Object.values(EMOTION)) {
        next.values[key] = clamp(state.values?.[key] ?? next.values[key]);
      }
      next.mood = Object.values(EMOTION).includes(state.mood) ? state.mood : EMOTION.CAUTIOUS;
      next.updatedAt = Number(state.updatedAt) || 0;
      return next;
    }
    configure({ enabled } = {}) {
      if (typeof enabled === "boolean") this.enabled = enabled;
    }
    ensureToday() {
      const day = shanghaiDayKey(new Date(this.now()));
      if (this.state.day !== day) this.state = freshState(day);
    }
    update({ quote, position: position2, marketOpen = false, events = [] } = {}) {
      this.ensureToday();
      if (!this.enabled) return this.snapshot();
      const values = this.state.values;
      const changePct = Number(quote?.changePct) || 0;
      const totalPct = Number(position2?.totalPct) || 0;
      const todayPnl = Number(position2?.todayPnl) || 0;
      const hour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        hour12: false,
        hourCycle: "h23"
      }).format(new Date(this.now()))) || 0;
      for (const key of Object.keys(values)) values[key] = clamp(values[key] * 0.965);
      values.excited = clamp(values.excited + Math.max(0, changePct) * 4.2 + Math.max(0, totalPct) * 0.8);
      values.smug = clamp(values.smug + Math.max(0, totalPct) * 2.2 + (todayPnl > 0 ? 1.2 : 0));
      values.cautious = clamp(values.cautious + Math.min(18, Math.abs(changePct) * 2.4) + (quote ? 0 : 4));
      values.frustrated = clamp(values.frustrated + Math.max(0, -changePct) * 4.5 + Math.max(0, -totalPct) * 1.4);
      values.tired = clamp(values.tired + (!marketOpen || hour >= 14 ? 2.4 : 0.35));
      for (const event of events) {
        const impulse = EVENT_IMPULSE[event?.type];
        if (!impulse) continue;
        for (const [key, amount] of Object.entries(impulse)) values[key] = clamp(values[key] + amount);
      }
      this.state.mood = Object.entries(values).sort((a, b) => b[1] - a[1])[0][0];
      this.state.updatedAt = this.now();
      return this.snapshot();
    }
    quips(context = "flat") {
      const mood = this.state.mood;
      const bank = {
        excited: ["\u4ECA\u5929\u725B\u8E44\u6709\u70B9\u70EB\uFF0C\u5148\u522B\u7728\u773C\uFF01", "\u884C\u60C5\u4E00\u62AC\u5934\uFF0C\u672C\u725B\u5C31\u7CBE\u795E\u4E86\u3002"],
        cautious: ["\u724C\u5B50\u770B\u6E05\u695A\uFF0C\u522B\u8BA9\u4E00\u6839\u7EBF\u9A97\u4E86\u3002", "\u5148\u89C2\u5BDF\uFF0C\u725B\u4E5F\u8BB2\u7A76\u786E\u8BA4\u4FE1\u53F7\u3002"],
        tired: ["\u76EF\u4E86\u4E00\u5929\uFF0C\u773C\u76AE\u6BD4\u6210\u4EA4\u91CF\u8FD8\u6C89\u3002", "\u6162\u4E00\u70B9\uFF0C\u672C\u725B\u6B63\u5728\u7701\u7535\u3002"],
        frustrated: ["\u8FD9\u6839\u7EFF\u7EBF\uFF0C\u672C\u725B\u8BB0\u4F4F\u4E86\u3002", "\u5148\u4F4E\u5934\uFF0C\u4E0D\u4EE3\u8868\u8BA4\u8F93\u3002"],
        smug: ["\u8FD9\u70B9\u6D6E\u76C8\uFF0C\u591F\u672C\u725B\u5F97\u610F\u4E00\u4F1A\u513F\u3002", "\u522B\u5938\uFF0C\u4E3B\u8981\u662F\u725B\u6C14\u6BD4\u8F83\u7A33\u3002"]
      };
      const fallback = context === "closed" ? ["\u6536\u5DE5\uFF0C\u660E\u5929\u518D\u548CK\u7EBF\u8BB2\u9053\u7406\u3002"] : ["\u6A2A\u76D8\u5982\u7EC7\uFF0C\u4E0D\u5982\u6478\u9C7C\u3002"];
      return bank[mood] || fallback;
    }
    idleProfile() {
      const profiles = {
        excited: { idleActions: ["idle_tail", "idle_look", "idle_scratch"], idleMultiplier: 0.72, motionScale: 1.12 },
        cautious: { idleActions: ["idle_look", "idle_breathe", "idle_tail"], idleMultiplier: 1.18, motionScale: 0.9 },
        tired: { idleActions: ["idle_yawn", "idle_breathe", "idle_look"], idleMultiplier: 1.65, motionScale: 0.72 },
        frustrated: { idleActions: ["idle_breathe", "idle_look", "idle_scratch"], idleMultiplier: 1.38, motionScale: 0.86 },
        smug: { idleActions: ["idle_tail", "idle_scratch", "idle_breathe"], idleMultiplier: 0.92, motionScale: 1.04 }
      };
      return profiles[this.state.mood] || profiles.cautious;
    }
    reactionScale(direction = 0) {
      if (!this.enabled) return 1;
      if (direction > 0 && [EMOTION.EXCITED, EMOTION.SMUG].includes(this.state.mood)) return 1.14;
      if (direction < 0 && this.state.mood === EMOTION.FRUSTRATED) return 1.12;
      if ([EMOTION.CAUTIOUS, EMOTION.TIRED].includes(this.state.mood)) return 0.82;
      return 1;
    }
    snapshot() {
      return {
        enabled: this.enabled,
        day: this.state.day,
        mood: this.state.mood,
        label: EMOTION_LABELS[this.state.mood],
        values: { ...this.state.values },
        updatedAt: this.state.updatedAt,
        profile: this.idleProfile()
      };
    }
  };

  // renderer-modules/daily-session.js
  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  function freshSession(day) {
    return {
      day,
      samples: 0,
      lastChangePct: 0,
      todayPnl: null,
      maxFloatingProfit: null,
      maxDrawdown: 0,
      peakTodayPnl: null,
      strongestMove: null,
      lastUpdatedAt: 0,
      closedAt: 0,
      shown: false
    };
  }
  var DailySessionTracker = class {
    constructor({ state, now = () => Date.now() } = {}) {
      this.now = now;
      this.state = this.normalize(state);
    }
    normalize(state) {
      const day = shanghaiDayKey(new Date(this.now()));
      if (!state || state.day !== day) return freshSession(day);
      return { ...freshSession(day), ...state, day };
    }
    ensureToday() {
      const day = shanghaiDayKey(new Date(this.now()));
      if (this.state.day !== day) this.state = freshSession(day);
    }
    reset() {
      this.state = freshSession(shanghaiDayKey(new Date(this.now())));
      return this.snapshot();
    }
    update({ quote, position: position2, marketOpen } = {}) {
      this.ensureToday();
      if (!marketOpen || !quote || quote.changePct == null || !Number.isFinite(Number(quote.changePct))) return this.snapshot();
      const nextPct = finite(quote.changePct);
      if (this.state.samples > 0) {
        const deltaPct = nextPct - this.state.lastChangePct;
        if (!this.state.strongestMove || Math.abs(deltaPct) > Math.abs(this.state.strongestMove.deltaPct)) {
          this.state.strongestMove = {
            direction: deltaPct >= 0 ? "rise" : "fall",
            deltaPct,
            at: this.now()
          };
        }
      }
      this.state.samples += 1;
      this.state.lastChangePct = nextPct;
      if (position2) {
        const pnl = finite(position2.todayPnl);
        this.state.todayPnl = pnl;
        this.state.maxFloatingProfit = this.state.maxFloatingProfit === null ? pnl : Math.max(this.state.maxFloatingProfit, pnl);
        this.state.peakTodayPnl = this.state.peakTodayPnl === null ? pnl : Math.max(this.state.peakTodayPnl, pnl);
        this.state.maxDrawdown = Math.max(this.state.maxDrawdown, this.state.peakTodayPnl - pnl);
      }
      this.state.lastUpdatedAt = this.now();
      return this.snapshot();
    }
    close() {
      this.ensureToday();
      if (this.state.samples < 1) return null;
      this.state.closedAt = this.now();
      return this.snapshot();
    }
    markShown() {
      this.state.shown = true;
    }
    summary(moodLabel = "\u8C28\u614E") {
      if (this.state.samples < 1) return null;
      const move = this.state.strongestMove;
      const comments = {
        \u5174\u594B: "\u4ECA\u5929\u7684\u7EBF\u6709\u70B9\u7CBE\u795E\uFF0C\u660E\u5929\u4E5F\u522B\u5FD8\u4E86\u770B\u98CE\u9669\u3002",
        \u8C28\u614E: "\u6536\u76D8\u5148\u8BB0\u8D26\uFF0C\u660E\u5929\u4E0D\u8DDF\u7B2C\u4E00\u6839\u7EBF\u51B2\u52A8\u3002",
        \u75B2\u60EB: "\u949F\u58F0\u4E00\u54CD\uFF0C\u672C\u725B\u548CCPU\u4E00\u8D77\u4E0B\u73ED\u3002",
        \u6CAE\u4E27: "\u4ECA\u5929\u5148\u8BA4\u8D26\uFF0C\u4E0D\u8BA4\u8F93\u3002",
        \u5F97\u610F: "\u6D6E\u76C8\u5148\u88C5\u8FDB\u53E3\u888B\uFF0C\u5F97\u610F\u53EA\u7559\u4E09\u5206\u949F\u3002"
      };
      return {
        day: this.state.day,
        changePct: this.state.lastChangePct,
        todayPnl: this.state.todayPnl,
        maxFloatingProfit: this.state.maxFloatingProfit,
        maxDrawdown: this.state.todayPnl === null ? null : this.state.maxDrawdown,
        strongestMove: move ? { ...move } : null,
        comment: comments[moodLabel] || comments.\u8C28\u614E
      };
    }
    snapshot() {
      return { ...this.state, strongestMove: this.state.strongestMove ? { ...this.state.strongestMove } : null };
    }
  };

  // renderer-modules/alert-trigger-engine.js
  var ALERT_TRIGGER_TYPE = Object.freeze({
    PRICE: "price",
    CHANGE_PCT: "change_pct",
    COST_RETURN: "cost_return",
    PNL_AMOUNT: "pnl_amount",
    RAPID_RISE: "rapid_rise",
    RAPID_FALL: "rapid_fall"
  });
  var ALERT_PRESENTATION = Object.freeze({
    CARD: "card",
    TWO_D: "2d",
    THREE_D: "3d"
  });
  var EVENT_TYPES = Object.freeze({
    [ALERT_TRIGGER_TYPE.RAPID_RISE]: "RAPID_RISE",
    [ALERT_TRIGGER_TYPE.RAPID_FALL]: "RAPID_FALL"
  });
  function normalizedComparator(value) {
    return value === "lte" ? "lte" : "gte";
  }
  function normalizeAlertTrigger(trigger = {}, index = 0) {
    const type = Object.values(ALERT_TRIGGER_TYPE).includes(trigger.type) ? trigger.type : ALERT_TRIGGER_TYPE.PRICE;
    return {
      id: String(trigger.id || `alert-${Date.now()}-${index}`),
      enabled: trigger.enabled !== false,
      type,
      comparator: normalizedComparator(trigger.comparator),
      value: Number.isFinite(Number(trigger.value)) ? Number(trigger.value) : 0,
      presentation: Object.values(ALERT_PRESENTATION).includes(trigger.presentation) ? trigger.presentation : ALERT_PRESENTATION.CARD,
      sound: trigger.sound === true,
      cooldownMs: Math.max(15e3, Number(trigger.cooldownMs) || 6e4)
    };
  }
  function normalizeAlertTriggers(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 20).map(normalizeAlertTrigger);
  }
  function crossed(current, previous, comparator, threshold) {
    if (!Number.isFinite(current)) return false;
    if (!Number.isFinite(previous)) return comparator === "gte" ? current >= threshold : current <= threshold;
    return comparator === "gte" ? previous < threshold && current >= threshold : previous > threshold && current <= threshold;
  }
  var AlertTriggerEngine = class {
    constructor({ triggers = [], now = () => Date.now() } = {}) {
      this.now = now;
      this.triggers = normalizeAlertTriggers(triggers);
      this.previous = /* @__PURE__ */ new Map();
      this.lastTriggered = /* @__PURE__ */ new Map();
    }
    configure(triggers) {
      this.triggers = normalizeAlertTriggers(triggers);
      const ids = new Set(this.triggers.map((trigger) => trigger.id));
      for (const key of this.previous.keys()) if (!ids.has(key)) this.previous.delete(key);
      for (const key of this.lastTriggered.keys()) if (!ids.has(key)) this.lastTriggered.delete(key);
      return this.snapshot();
    }
    valueFor(trigger, { quote, position: position2 } = {}) {
      if (trigger.type === ALERT_TRIGGER_TYPE.PRICE) return Number(quote?.price);
      if (trigger.type === ALERT_TRIGGER_TYPE.CHANGE_PCT) return quote?.changePct == null ? NaN : Number(quote.changePct);
      if (trigger.type === ALERT_TRIGGER_TYPE.PNL_AMOUNT) return Number(position2?.totalPnl);
      if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) return Number(position2?.totalPnl);
      return NaN;
    }
    label(trigger, current) {
      const sign = trigger.comparator === "gte" ? "\u8FBE\u5230" : "\u8DCC\u81F3";
      if (trigger.type === ALERT_TRIGGER_TYPE.PRICE) return `\u4EF7\u683C${sign} ${trigger.value.toFixed(2)}`;
      if (trigger.type === ALERT_TRIGGER_TYPE.CHANGE_PCT) return `\u6DA8\u8DCC\u5E45${sign} ${trigger.value.toFixed(2)}%`;
      if (trigger.type === ALERT_TRIGGER_TYPE.PNL_AMOUNT) return `\u7D2F\u8BA1\u76C8\u4E8F${sign} \xA5${trigger.value.toFixed(0)}`;
      if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) return "\u4EF7\u683C\u56DE\u5230\u6301\u4ED3\u6210\u672C\u9644\u8FD1";
      if (trigger.type === ALERT_TRIGGER_TYPE.RAPID_RISE) return "\u68C0\u6D4B\u5230\u5FEB\u901F\u62C9\u5347";
      if (trigger.type === ALERT_TRIGGER_TYPE.RAPID_FALL) return "\u68C0\u6D4B\u5230\u5FEB\u901F\u8DF3\u6C34";
      return `\u63D0\u9192\u89E6\u53D1 ${current}`;
    }
    evaluate(context = {}) {
      const now = this.now();
      const eventTypes = new Set((context.events || []).map((event) => event?.type));
      const hits = [];
      for (const trigger of this.triggers) {
        if (!trigger.enabled) continue;
        let hit = false;
        let current = this.valueFor(trigger, context);
        if (EVENT_TYPES[trigger.type]) {
          hit = eventTypes.has(EVENT_TYPES[trigger.type]);
        } else if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) {
          const previous = this.previous.get(trigger.id);
          const tolerance = Math.max(1, Math.abs(Number(context.quote?.price) || 0) * 1e-3);
          hit = Number.isFinite(current) && Math.abs(current) <= tolerance * Math.max(1, Number(context.position?.shares) || 1) && (!Number.isFinite(previous) || Math.abs(previous) > Math.abs(current));
        } else {
          hit = crossed(current, this.previous.get(trigger.id), trigger.comparator, trigger.value);
        }
        if (Number.isFinite(current)) this.previous.set(trigger.id, current);
        const lastAt = this.lastTriggered.get(trigger.id) || 0;
        if (!hit || now - lastAt < trigger.cooldownMs) continue;
        this.lastTriggered.set(trigger.id, now);
        const direction = trigger.type === ALERT_TRIGGER_TYPE.RAPID_FALL || trigger.comparator === "lte" ? -1 : 1;
        hits.push({ ...trigger, current, direction, label: this.label(trigger, current), triggeredAt: now });
      }
      return hits;
    }
    snapshot() {
      return this.triggers.map((trigger) => ({ ...trigger }));
    }
  };

  // renderer-modules/quiet-office.js
  function parseMinutes(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return fallback;
    const hour = Math.min(23, Math.max(0, Number(match[1])));
    const minute = Math.min(59, Math.max(0, Number(match[2])));
    return hour * 60 + minute;
  }
  function normalizeQuietOffice(value = {}) {
    return {
      enabled: value.enabled === true,
      start: /^\d{2}:\d{2}$/.test(String(value.start || "")) ? value.start : "09:30",
      end: /^\d{2}:\d{2}$/.test(String(value.end || "")) ? value.end : "11:30"
    };
  }
  function isQuietOfficeActive(config, date = /* @__PURE__ */ new Date()) {
    const normalized = normalizeQuietOffice(config);
    if (!normalized.enabled) return false;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value) || 0;
    const minute = Number(parts.find((part) => part.type === "minute")?.value) || 0;
    const nowMinutes = hour * 60 + minute;
    const start = parseMinutes(normalized.start, 570);
    const end = parseMinutes(normalized.end, 690);
    if (start === end) return true;
    return start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end;
  }

  // renderer-modules/quote-source-settings.js
  var import_market_symbols3 = __toESM(require_market_symbols());
  async function buildQuoteSourceSettings(container, { api: api2, toast: toast2, onSaved, isCurrent }) {
    container.append(element("p", "\u6B63\u5728\u8BFB\u53D6\u884C\u60C5\u914D\u7F6E\u2026", "muted"));
    let config;
    try {
      config = await api2.quoteSource("get");
    } catch (error) {
      if (isCurrent()) container.replaceChildren(element("p", error.message, "footnote"));
      return;
    }
    if (!isCurrent()) return;
    container.replaceChildren();
    const form = element("form", "", "source-form");
    form.noValidate = true;
    const controls = {};
    function input(parent, key, label, value = "", type = "text") {
      const row = element("label", "", "source-field");
      const control = document.createElement("input");
      control.type = type;
      control.id = "source-" + key;
      control.value = value;
      control.autocomplete = "off";
      control.spellcheck = false;
      row.append(element("span", label), control);
      parent.append(row);
      controls[key] = control;
      return control;
    }
    function select(parent, key, label, value, options) {
      const row = element("label", "", "source-field");
      const control = document.createElement("select");
      control.id = "source-" + key;
      for (const [id, text] of options) {
        const option = element("option", text);
        option.value = id;
        control.append(option);
      }
      control.value = value;
      row.append(element("span", label), control);
      parent.append(row);
      controls[key] = control;
      return control;
    }
    select(form, "mode", "\u884C\u60C5\u6765\u6E90", config.mode, [["public", "\u516C\u5171\u884C\u60C5 \xB7 \u65B0\u6D6A / \u817E\u8BAF"], ["custom", "\u4F7F\u7528\u81EA\u5DF1\u7684 HTTP JSON \u63A5\u53E3"]]);
    const fields = element("fieldset", "", "source-options");
    input(fields, "name", "\u6765\u6E90\u540D\u79F0", config.name);
    const address = input(fields, "url", "\u62A5\u4EF7\u63A5\u53E3\u5730\u5740", config.url);
    address.placeholder = "https://example.com/quote?symbol={symbol}";
    fields.append(element("p", "\u5730\u5740\u652F\u6301 {symbol}\u3001{ticker}\u3001{code}\u3001{market}\u3001{exchange}\u3002\u672C\u5730\u8F6C\u63A5\u670D\u52A1\u4E5F\u53EF\u4F7F\u7528 HTTP \u5730\u5740\u3002", "footnote"));
    const marketGroup = element("div", "", "source-markets");
    marketGroup.append(element("span", "\u9002\u7528\u5E02\u573A"));
    const markets = [];
    for (const [id, label] of [["cn", "A \u80A1"], ["hk", "\u6E2F\u80A1"], ["us", "\u7F8E\u80A1"]]) {
      const row = element("label"), control = document.createElement("input");
      control.type = "checkbox";
      control.value = id;
      control.checked = config.markets.includes(id);
      row.append(control, label);
      marketGroup.append(row);
      markets.push(control);
    }
    fields.append(marketGroup, element("p", "\u6240\u9009\u5E02\u573A\u4F7F\u7528\u81EA\u6709\u63A5\u53E3\uFF0C\u5176\u4F59\u5E02\u573A\u7EE7\u7EED\u4F7F\u7528\u516C\u5171\u884C\u60C5\u3002", "footnote"));
    const connectionGrid = element("div", "", "source-grid");
    select(connectionGrid, "symbolFormat", "\u80A1\u7968\u4EE3\u7801\u683C\u5F0F", config.symbolFormat, [["ticker", "\u539F\u59CB\u4EE3\u7801 \xB7 MP / 00700 / 600519"], ["yahoo", "Yahoo \u683C\u5F0F \xB7 MP / 0700.HK / 600519.SS"], ["niulai", "\u725B\u6765\u4EE3\u7801 \xB7 gb_mp / rt_hk00700"]]);
    select(connectionGrid, "interval", "\u6B64\u6A21\u5F0F\u6700\u77ED\u5237\u65B0\u95F4\u9694", String(config.interval), [[5, "5 \u79D2"], [10, "10 \u79D2"], [30, "30 \u79D2"], [60, "60 \u79D2"]]);
    select(connectionGrid, "authType", "\u9274\u6743\u65B9\u5F0F", config.authType, [["none", "\u65E0\u9700\u9274\u6743"], ["bearer", "Authorization \xB7 Bearer"], ["header", "\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934"], ["query", "URL \u67E5\u8BE2\u53C2\u6570"]]);
    input(connectionGrid, "authName", "\u8BF7\u6C42\u5934 / \u53C2\u6570\u540D\u79F0", config.authName);
    fields.append(connectionGrid);
    const token = input(fields, "token", "API \u5BC6\u94A5 / Token", "", "password");
    token.placeholder = config.hasToken ? "\u5DF2\u4FDD\u5B58\uFF0C\u7559\u7A7A\u4FDD\u7559\u73B0\u6709\u5BC6\u94A5" : "\u4EC5\u4FDD\u5B58\u5728\u8FD9\u53F0\u7535\u8111";
    const mapping = element("details", "", "source-mapping");
    mapping.append(element("summary", "JSON \u5B57\u6BB5\u4E0E\u65F6\u95F4\u8BBE\u7F6E"));
    input(mapping, "dataPath", "\u62A5\u4EF7\u5BF9\u8C61\u8DEF\u5F84\uFF0C\u9876\u5C42\u5BF9\u8C61\u7559\u7A7A", config.dataPath).placeholder = "\u4F8B\u5982 data.quote \u6216 data[0]";
    mapping.append(element("p", "\u5B57\u6BB5\u652F\u6301 price\u3001quote.price\u3001data[0].price \u6216 /Global Quote/05. price\u3002\u53EF\u9009\u5B57\u6BB5\u7559\u7A7A\u8868\u793A\u4E0D\u8BFB\u53D6\u3002", "footnote"));
    const mappingGrid = element("div", "", "source-grid");
    const labels = { price: "\u73B0\u4EF7", prevClose: "\u6DA8\u8DCC\u6BD4\u8F83\u57FA\u51C6\u4EF7", change: "\u6DA8\u8DCC\u989D", changePct: "\u6DA8\u8DCC\u5E45\uFF0C\u767E\u5206\u6570", timestamp: "\u62A5\u4EF7\u65F6\u95F4", session: "\u4EA4\u6613\u65F6\u6BB5", name: "\u80A1\u7968\u540D\u79F0", symbol: "\u80A1\u7968\u4EE3\u7801", regularPrice: "\u5E38\u89C4\u6536\u76D8\u4EF7", dayPrevClose: "\u4ECA\u65E5\u76C8\u4E8F\u57FA\u51C6\u4EF7" };
    for (const [key, label] of Object.entries(labels)) input(mappingGrid, "field-" + key, label, config.fields[key]);
    mapping.append(mappingGrid);
    const timeGrid = element("div", "", "source-grid");
    select(timeGrid, "timeZone", "\u65E0\u65F6\u533A\u65E5\u671F\u4F7F\u7528", config.timeZone, [["market", "\u80A1\u7968\u6240\u5C5E\u5E02\u573A\u65F6\u533A"], ["America/New_York", "\u7F8E\u4E1C\u65F6\u95F4"], ["Asia/Shanghai", "\u5317\u4EAC\u65F6\u95F4"], ["UTC", "UTC"]]);
    select(timeGrid, "defaultSession", "\u63A5\u53E3\u7F3A\u5C11\u4EA4\u6613\u65F6\u6BB5\u65F6", config.defaultSession, [["regular", "\u4F5C\u4E3A\u5E38\u89C4\u62A5\u4EF7"], ["auto", "\u6309\u62A5\u4EF7\u65F6\u95F4\u5224\u65AD\u76D8\u524D / \u76D8\u540E"]]);
    mapping.append(timeGrid, element("p", "\u65F6\u95F4\u652F\u6301 Unix \u79D2\u3001Unix \u6BEB\u79D2\u3001ISO 8601 \u6216\u5E74\u6708\u65E5\u65F6\u5206\u79D2\u3002\u4EA4\u6613\u65F6\u6BB5\u586B\u5199 pre\u3001regular\u3001post\u3002\u76D8\u540E\u4ECA\u65E5\u76C8\u4E8F\u57FA\u51C6\u4EF7\u5E94\u4E3A\u8BE5\u4EA4\u6613\u65E5\u7684\u524D\u6536\u76D8\u4EF7\u3002", "footnote"));
    const example = element("pre", '{\n  "symbol": "MP", "price": 37.88,\n  "previousClose": 36.73,\n  "timestamp": "2026-11-12T13:47:00Z",\n  "session": "pre"\n}', "source-example");
    mapping.append(example);
    fields.append(mapping);
    const fallback = element("label", "", "setting-row"), fallbackInput = document.createElement("input");
    fallbackInput.type = "checkbox";
    fallbackInput.id = "source-fallback";
    fallbackInput.checked = config.fallback;
    fallback.append(element("span", "\u81EA\u6709\u6E90\u5931\u8D25\u6216\u62A5\u4EF7\u8FC7\u671F\u65F6\uFF0C\u5141\u8BB8\u56DE\u9000\u516C\u5171\u884C\u60C5"), fallbackInput);
    fields.append(fallback, element("p", "\u56DE\u9000\u65F6\u4F1A\u663E\u793A\u5B9E\u9645\u91C7\u7528\u7684\u6765\u6E90\u3002\u6765\u6E90\u5207\u6362\u540E\u91CD\u65B0\u5EFA\u7ACB\u62A5\u4EF7\u91C7\u6837\u3002", "footnote"));
    input(fields, "testCode", "\u6D4B\u8BD5\u80A1\u7968", config.markets.includes("us") ? "MP" : config.markets.includes("hk") ? "00700.HK" : "600519");
    form.append(fields);
    const status = element("p", config.error || "", "source-status footnote");
    status.id = "source-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const actions = element("div", "", "source-actions");
    const test = element("button", "\u6D4B\u8BD5\u8FDE\u63A5", "button secondary");
    test.type = "button";
    test.id = "source-test";
    const save = element("button", "\u4FDD\u5B58\u5E76\u4F7F\u7528", "button primary");
    save.type = "submit";
    save.id = "source-save";
    actions.append(test, save);
    if (config.url) {
      const clear = element("button", "\u6E05\u9664\u81EA\u6709\u6E90\u914D\u7F6E", "link-button");
      clear.type = "button";
      clear.id = "source-clear";
      clear.onclick = () => run(async () => {
        await api2.quoteSource("clear");
        toast2("\u5DF2\u6E05\u9664\u81EA\u6709\u6E90\u914D\u7F6E");
        onSaved();
      });
      actions.append(clear);
    }
    form.append(status, actions);
    container.append(form);
    function updateVisibility() {
      fields.hidden = controls.mode.value !== "custom";
      test.hidden = fields.hidden;
      controls.authName.disabled = !["header", "query"].includes(controls.authType.value);
      token.disabled = controls.authType.value === "none";
    }
    controls.mode.onchange = updateVisibility;
    controls.authType.onchange = updateVisibility;
    updateVisibility();
    function payload() {
      return {
        ...Object.fromEntries(Object.entries(controls).filter(([key]) => !key.startsWith("field-")).map(([key, control]) => [key, control.value])),
        fields: Object.fromEntries(Object.keys(labels).map((key) => [key, controls["field-" + key].value])),
        markets: markets.filter((control) => control.checked).map((control) => control.value),
        fallback: fallbackInput.checked,
        testCode: import_market_symbols3.default.normalizeMarketSymbol(controls.testCode.value)
      };
    }
    async function run(task) {
      for (const button of actions.querySelectorAll("button")) button.disabled = true;
      status.textContent = "\u6B63\u5728\u5904\u7406\u2026";
      try {
        await task();
      } catch (error) {
        status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, "");
      } finally {
        for (const button of actions.querySelectorAll("button")) button.disabled = false;
      }
    }
    test.onclick = () => run(async () => {
      const result = await api2.quoteSource("test", payload());
      const presentation = quotePresentation(result, Number(controls.interval.value));
      const percent = Number.isFinite(result.quote.changePct) ? signed(result.quote.changePct) + "%" : "\u6DA8\u8DCC\u5E45\u672A\u63D0\u4F9B";
      status.textContent = `\u8FDE\u63A5\u6210\u529F \xB7 ${result.quote.name} ${fmt(result.quote.price)} \xB7 ${percent} \xB7 ${presentation.summary}`;
    });
    form.onsubmit = (event) => {
      event.preventDefault();
      run(async () => {
        const result = await api2.quoteSource("save", payload());
        toast2(result.mode === "public" ? "\u5DF2\u4F7F\u7528\u516C\u5171\u884C\u60C5" : result.storedSecurely ? "\u5DF2\u542F\u7528\u81EA\u6709\u6E90\uFF0C\u914D\u7F6E\u5DF2\u52A0\u5BC6\u4FDD\u5B58\u5728\u672C\u673A" : "\u5DF2\u542F\u7528\u81EA\u6709\u6E90\uFF0C\u672C\u673A\u5B89\u5168\u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u672C\u6B21\u8FD0\u884C\u6709\u6548");
        token.value = "";
        onSaved();
      });
    };
  }

  // renderer.js
  var data;
  var tab = "home";
  var settingsPanel = "island";
  var positionCode;
  var toastTimer;
  var searchTimer;
  var searchEpoch = 0;
  var liveMood = "loading";
  var previewUntil = 0;
  var motionPreview = "loading";
  var featureCode = "";
  var lastFeatureQuote = 0;
  var wasOpen = false;
  var emotion;
  var session;
  var alerts;
  var lastMarketScene;
  var sourceFormEpoch = 0;
  var searchComposing = false;
  var refreshRequested = false;
  var stockRows = { "home-stocks": /* @__PURE__ */ new Map(), "watch-stocks": /* @__PURE__ */ new Map() };
  var portfolioCards = /* @__PURE__ */ new Map();
  var tabScroll = /* @__PURE__ */ new Map();
  var updateStatus = { available: false, checking: false };
  function paintUpdate(value = updateStatus) {
    updateStatus = value;
    $("update-banner").hidden = !value.available;
    $("update-title").textContent = "\u725B\u6765\u76EF\u76D8 " + (value.version || "") + " \u5DF2\u53D1\u5E03";
    $("update-note").textContent = (value.notes || []).slice(0, 2).join(" \xB7 ");
    const label = $("update-status");
    if (label) label.textContent = value.checking ? "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026" : value.error || (value.available ? "\u53D1\u73B0\u65B0\u7248\u672C " + value.version : value.checkedAt ? "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C" : "\u5F53\u524D\u7248\u672C " + data.version);
    if ($("check-update")) $("check-update").disabled = value.checking;
  }
  $("update-download").onclick = () => perform(api.updates("download"));
  api.onUpdate(paintUpdate);
  var moods = new MarketMood();
  var bull = makeMotion($("bull"));
  var wood = makeMotion($("wood-canvas"));
  var gallery = makeMotion($("motion-canvas"));
  var mini;
  wood.state("muyu");
  var voice = new TapVoice("assets/audio/niulai-tap.wav");
  var mamaVoice = new MamaVoice();
  var sounds = { rise: new Audio("assets/audio/niulai.mp3"), fall: new Audio("assets/audio/mama.mp3") };
  var titles = {
    home: ["\u76EF\u76D8", ""],
    watchlist: ["\u81EA\u9009", "\u9009\u62E9\u4E00\u53EA\u80A1\u7968\uFF0C\u5F00\u59CB\u76EF\u76D8\u3002"],
    portfolio: ["\u6301\u4ED3", "\u67E5\u770B\u548C\u7BA1\u7406\u672C\u673A\u4FDD\u5B58\u7684\u6301\u4ED3\u3002"],
    muyu: ["\u6728\u9C7C", "\u6572\u4E00\u6572\uFF0C\u6B47\u4E00\u4F1A\u513F\u3002"],
    settings: ["\u8BBE\u7F6E", "\u8C03\u6574\u684C\u9762\u663E\u793A\u4E0E\u4F7F\u7528\u4E60\u60EF\u3002"]
  };
  var selectedStock = () => data.state.stocks.find((stock) => stock.code === data.state.selected);
  var settings = () => data.state.settings;
  var quiet = () => isQuietOfficeActive(settings().quietOffice);
  var currentEntry = () => data.quotes[data.state.selected];
  var money = (value) => settings().private ? "\u2022\u2022\u2022\u2022" : signed(value);
  function toast(message) {
    $("toast").textContent = String(message).replace(/^Error invoking remote method '[^']+': Error: /, "");
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").hidden = true, 3500);
  }
  async function perform(task, done) {
    try {
      const result = await task;
      done?.(result);
      return result;
    } catch (error) {
      toast(error.message);
    }
  }
  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }
  function storeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast("\u672C\u673A\u5B58\u50A8\u6682\u4E0D\u53EF\u7528");
    }
  }
  function openDialog(id) {
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    $(id).showModal();
    syncMotion();
  }
  function stopAudio() {
    voice.stop();
    mamaVoice.stop();
    for (const sound of Object.values(sounds)) {
      sound.pause();
      sound.currentTime = 0;
    }
  }
  function playPetVoice() {
    if (!settings().sound || settings().muted || quiet() || data.suspended) return;
    stopAudio();
    const sound = sounds[currentEntry()?.quote?.changePct < 0 ? "fall" : "rise"];
    sound.volume = settings().volume;
    sound.play().catch(() => toast("\u58F0\u97F3\u672A\u80FD\u64AD\u653E"));
  }
  function syncMotion() {
    if (!data) return;
    const visible = !document.hidden && !data.suspended;
    const modal = Boolean(document.querySelector("dialog[open]"));
    const moving = settings().motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const marketScene = visible && tab === "home" && !modal && moving;
    if (marketScene !== lastMarketScene) {
      lastMarketScene = marketScene;
      api.reportScene(marketScene).catch(() => {
      });
    }
    bull.configure(visible && tab === "home" && !modal, moving);
    wood.configure(visible && tab === "muyu" && !modal, moving);
    gallery.configure(visible && $("motion-dialog").open, moving);
    mini?.configure(visible && tab === "settings" && settingsPanel === "island" && !modal && settings().islandBull, moving && settings().islandMotion);
    if (!visible) stopAudio();
  }
  function updateMood() {
    if (!data) return;
    const entry = currentEntry();
    const health = quoteHealth(entry, settings().interval);
    liveMood = settings().autoActions ? moods.update(entry?.quote ? { ...entry.quote, received: entry.received } : null, entry?.error || (entry?.quote && health.warning ? health.message : null), Date.now(), settings().interval, data.state.selected) : "idle";
    liveMood = desktopMood(liveMood, data, data.state.selected);
    const spec = catalog.find((item) => item.id === liveMood);
    $("pet-state").textContent = spec.label;
    if (Date.now() > previewUntil) bull.state(liveMood);
    if (settings().muted || quiet() || data.suspended) stopAudio();
    if (!settings().mamaSound) mamaVoice.stop();
    if (!settings().muyuSound) voice.stop();
    syncMotion();
  }
  function renderPosition(container, stock, entry) {
    container.replaceChildren();
    if (!stock.cost || !stock.shares) {
      container.append(element("p", "\u5C1A\u672A\u8BBE\u7F6E\u6301\u4ED3", "position-empty"));
      return;
    }
    const result = position(stock, entry?.quote);
    if (!result) {
      container.append(element("p", "\u6301\u4ED3\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u884C\u60C5", "position-empty"));
      return;
    }
    const grid = element("div", "", "pnl-grid");
    for (const [label, value] of [["\u4ECA\u65E5\u76C8\u4E8F", result.today], ["\u7D2F\u8BA1\u76C8\u4E8F", result.total]]) {
      const cell = element("div");
      cell.append(element("small", label + " \xB7 " + currency(stock.code)), element("strong", money(value), settings().private ? "" : tone(value)));
      grid.append(cell);
    }
    container.append(grid);
  }
  function renderStocks() {
    for (const [id, full] of [["home-stocks", false], ["watch-stocks", true]]) {
      const container = $(id);
      const rows = stockRows[id];
      for (const [code, item] of rows) {
        if (!data.state.stocks.some((stock) => stock.code === code)) {
          item.row.remove();
          rows.delete(code);
        }
      }
      for (const [index, stock] of data.state.stocks.entries()) {
        const entry = data.quotes[stock.code], quote = entry?.quote;
        const presentation = quotePresentation(entry, settings().interval);
        let item = rows.get(stock.code);
        if (!item) {
          const row = element("div", "", "stock-row");
          const button = element("button", "", "stock-main");
          const name = element("div"), price = element("div");
          item = {
            row,
            button,
            price,
            name: element("strong"),
            code: element("small"),
            value: element("strong"),
            change: element("small"),
            warning: element("small"),
            percent: element("span")
          };
          name.append(item.name, item.code);
          price.append(item.value, item.change, item.warning);
          button.append(name, price);
          if (full) button.append(item.percent);
          button.onclick = () => selectStock(stock.code);
          row.append(button);
          if (full) {
            const actions = element("div", "", "row-actions");
            const edit = element("button", "\u6301\u4ED3");
            edit.onclick = () => openPosition(stock.code);
            item.remove = element("button", "\u79FB\u51FA");
            item.remove.onclick = () => confirmRemove(data.state.stocks.find((current) => current.code === stock.code));
            actions.append(edit, item.remove);
            row.append(actions);
          }
          rows.set(stock.code, item);
        }
        item.row.classList.toggle("selected", stock.code === data.state.selected);
        item.row.title = stock.name + "\n" + presentation.detail;
        item.button.setAttribute("aria-label", "\u76EF\u76D8 " + stock.name);
        item.button.setAttribute("aria-current", stock.code === data.state.selected ? "true" : "false");
        item.name.textContent = stock.name;
        item.code.textContent = displaySymbol(stock.code) + (presentation.label ? " \xB7 " + presentation.label : "");
        item.price.className = "stock-price " + tone(quote?.changePct);
        item.value.textContent = fmt(quote?.price, currency(stock.code) === "HKD" ? 3 : 2);
        item.change.textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + "%" : quote ? "\u6DA8\u8DCC\u5E45\u672A\u63D0\u4F9B" : "\u7B49\u5F85\u884C\u60C5";
        item.warning.textContent = presentation.message;
        item.warning.hidden = !quote || !presentation.warning;
        item.percent.textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + "%" : "\u2014";
        item.percent.className = "stock-pct " + tone(quote?.changePct);
        item.remove?.setAttribute("aria-label", "\u79FB\u51FA " + stock.name);
        if (container.children[index] !== item.row) container.insertBefore(item.row, container.children[index] || null);
      }
    }
    $("stock-count").textContent = data.state.stocks.length;
  }
  function renderPortfolio() {
    const container = $("portfolio-list");
    const held = data.state.stocks.filter((stock) => stock.cost > 0 && stock.shares > 0);
    for (const [code, item] of portfolioCards) {
      if (!held.some((stock) => stock.code === code)) {
        item.card.remove();
        portfolioCards.delete(code);
      }
    }
    const empty = container.querySelector(".portfolio-empty");
    if (held.length) empty?.remove();
    else if (!empty) container.append(element("p", "\u6682\u65E0\u6301\u4ED3\u8BB0\u5F55\u3002\u53EF\u4E3A\u4EFB\u4E00\u81EA\u9009\u8BBE\u7F6E\u6210\u672C\u548C\u80A1\u6570\u3002", "position-empty portfolio-empty"));
    for (const [index, stock] of held.entries()) {
      let item = portfolioCards.get(stock.code);
      if (!item) {
        const card = element("article", "", "card portfolio-item");
        const header = element("div", "", "section-heading"), title = element("div");
        item = {
          card,
          name: element("h2"),
          content: element("div"),
          details: element("div", "", "holding-details"),
          status: element("p", "", "footnote")
        };
        title.append(item.name, element("p", displaySymbol(stock.code) + " \xB7 " + currency(stock.code)));
        const edit = element("button", "\u7F16\u8F91 \u2197", "link-button");
        edit.onclick = () => openPosition(stock.code);
        header.append(title, edit);
        card.append(header, item.content, item.details, item.status);
        portfolioCards.set(stock.code, item);
      }
      const entry = data.quotes[stock.code];
      item.name.textContent = stock.name;
      renderPosition(item.content, stock, entry);
      const result = position(stock, entry?.quote);
      item.details.replaceChildren(element("span", settings().private ? "\u6210\u672C\u4E0E\u80A1\u6570\u5DF2\u9690\u85CF" : `\u6210\u672C ${fmt(stock.cost, 3)} \xB7 ${stock.shares} \u80A1`), element("span", settings().private || !result ? "" : signed(result.percent) + "%", tone(result?.percent)));
      const presentation = quotePresentation(entry, settings().interval);
      item.card.title = presentation.detail;
      item.status.textContent = presentation.summary;
      if (container.children[index] !== item.card) container.insertBefore(item.card, container.children[index] || null);
    }
  }
  function renderCounts() {
    if (!data) return;
    for (const [id, key] of [["wood-count", "session"], ["wood-today", "today"], ["wood-total", "total"]]) $(id).textContent = data.counts[key].toLocaleString("zh-CN");
  }
  function syncControls() {
    for (const control of document.querySelectorAll("[data-setting]")) {
      if (document.activeElement === control) continue;
      const value = settings()[control.dataset.setting];
      if (control.type === "checkbox") control.checked = value;
      else control.value = value;
      const output = control.closest(".setting-row")?.querySelector("output");
      if (output) output.value = control.value + (control.dataset.setting === "volume" ? "" : " px");
    }
    for (const control of document.querySelectorAll("[data-quiet]")) {
      if (control.type === "checkbox") control.checked = settings().quietOffice[control.dataset.quiet];
      else if (document.activeElement !== control) control.value = settings().quietOffice[control.dataset.quiet];
    }
    $("privacy-toggle").setAttribute("aria-pressed", String(settings().private));
    $("privacy-toggle").title = settings().private ? "\u663E\u793A\u6301\u4ED3\u91D1\u989D" : "\u9690\u85CF\u6301\u4ED3\u91D1\u989D";
  }
  function renderSettingsPreview() {
    const preview = $("island-preview");
    if (!preview) return;
    const code = settings().islandSymbol || data.state.selected;
    const quote = data.quotes[code]?.quote;
    const woodMode = settings().islandContent === "muyu";
    $("preview-name").textContent = woodMode ? "\u725B\u6765\u6728\u9C7C" : quote?.name || selectedStock().name;
    $("preview-price").textContent = woodMode ? "\u672C\u8F6E " + data.counts.session : settings().islandPrice ? fmt(quote?.price) : "\u725B\u6765";
    $("preview-pct").textContent = woodMode ? "+1" : settings().islandPercent && Number.isFinite(quote?.changePct) ? signed(quote.changePct) + "%" : "";
    $("preview-pct").className = tone(quote?.changePct);
    $("preview-canvas").hidden = !settings().islandBull;
    mini?.state(woodMode ? "muyu" : liveMood);
  }
  function renderQuoteStatus() {
    if (!data?.state) return;
    const entry = currentEntry(), quote = entry?.quote;
    const presentation = quotePresentation(entry, settings().interval);
    $("session").textContent = presentation.session || marketSession(data.state.selected);
    $("connection").className = "connection " + (presentation.warning ? "error" : quote ? "ok" : "");
    $("connection").textContent = presentation.summary;
    $("connection").title = presentation.detail;
    $("footer-status").textContent = data.suspended ? "\u7CFB\u7EDF\u4F11\u7720\uFF0C\u5DF2\u6682\u505C" : quiet() ? "\u5B89\u9759\u529E\u516C\u4E2D" : quote ? quote.market === "us" ? presentation.basis : quote.time ? "\u6E90\u65F6\u95F4 " + quote.time : "\u884C\u60C5\u6E90\u672A\u63D0\u4F9B\u6210\u4EA4\u65F6\u95F4" : "\u7B49\u5F85\u884C\u60C5";
    $("footer-status").title = presentation.detail;
    $("refresh").disabled = Boolean(data.refreshing || data.suspended);
    $("refresh").setAttribute("aria-busy", String(Boolean(data.refreshing && !data.suspended)));
    $("refresh-label").textContent = data.suspended ? "\u5DF2\u6682\u505C" : data.refreshing ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0\u884C\u60C5";
  }
  function render() {
    if (!data?.state) return;
    const stock = selectedStock(), entry = currentEntry(), quote = entry?.quote;
    document.documentElement.classList.toggle("dark", settings().theme === "dark" || settings().theme === "system" && data.dark);
    $("app-version").textContent = data.version;
    $("quote-name").textContent = stock.name;
    $("quote-code").textContent = displaySymbol(stock.code) + " \xB7 " + currency(stock.code);
    $("price").textContent = fmt(quote?.price, currency(stock.code) === "HKD" ? 3 : 2);
    $("change").textContent = signed(quote?.change);
    $("percent").textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + "%" : "\u2014";
    $("quote-number").className = "quote-number " + tone(quote?.changePct);
    renderQuoteStatus();
    renderPosition($("home-position"), stock, entry);
    renderStocks();
    renderPortfolio();
    renderCounts();
    syncControls();
    const samples = data.histories[stock.code] || [];
    $("sample-count").textContent = samples.length < 2 ? "\u7B49\u5F85\u91C7\u6837" : samples.length + " \u4E2A\u6837\u672C";
    $("sample-start").textContent = time(samples[0]?.at);
    $("sample-end").textContent = time(samples.at(-1)?.at);
    drawSparkline($("sparkline"), samples, getComputedStyle(document.documentElement).getPropertyValue(quote?.changePct < 0 ? "--fall" : "--rise"));
    updateMood();
    renderSettingsPreview();
    processFeatures();
  }
  function applySnapshot(next) {
    if (!next?.state) return;
    if (refreshRequested && next.suspended) refreshRequested = false;
    const changedStock = data?.state.selected !== next.state.selected;
    const changedStocks = JSON.stringify(data?.state.stocks.map((stock) => stock.code)) !== JSON.stringify(next.state.stocks.map((stock) => stock.code));
    data = next;
    if (changedStock) {
      moods.reset();
      featureCode = "";
      stopAudio();
    }
    if (changedStocks && tab === "settings") buildSettings();
    render();
  }
  function changeTab(next) {
    tabScroll.set(tab, window.scrollY);
    tab = next;
    for (const button of document.querySelectorAll("[data-tab]")) {
      button.classList.toggle("active", button.dataset.tab === tab);
      button.setAttribute("aria-current", button.dataset.tab === tab ? "page" : "false");
    }
    for (const view of document.querySelectorAll(".view")) view.hidden = view.id !== "view-" + tab;
    $("page-title").textContent = titles[tab][0];
    $("page-subtitle").textContent = titles[tab][1];
    $("page-subtitle").hidden = !titles[tab][1];
    if (tab === "settings") buildSettings();
    window.scrollTo(0, tabScroll.get(next) || 0);
    syncMotion();
  }
  function selectStock(code) {
    perform(api.stock("select", { code }));
  }
  function openPosition(code = data.state.selected) {
    const stock = data.state.stocks.find((item) => item.code === code);
    positionCode = code;
    $("position-title").textContent = stock.name;
    $("position-currency").textContent = currency(code);
    $("cost").value = stock.cost || "";
    $("shares").value = stock.shares || "";
    $("clear-position").hidden = !stock.cost && !stock.shares;
    openDialog("position-dialog");
  }
  function confirmRemove(stock) {
    $("confirm-title").textContent = "\u79FB\u51FA\u81EA\u9009";
    $("confirm-message").textContent = `\u5C06\u300C${stock.name}\u300D\u79FB\u51FA\u81EA\u9009${stock.cost && stock.shares ? "\uFF0C\u5E76\u6E05\u9664\u5176\u672C\u673A\u6301\u4ED3\u8BB0\u5F55" : ""}\uFF1F`;
    $("confirm-accept").onclick = () => perform(api.stock("remove", { code: stock.code }), () => $("confirm-dialog").close());
    openDialog("confirm-dialog");
  }
  function openSearch() {
    if ($("search-dialog").open) {
      $("search-input").focus();
      $("search-input").select();
      return;
    }
    ++searchEpoch;
    clearTimeout(searchTimer);
    searchComposing = false;
    $("search-input").value = "";
    $("search-results").replaceChildren();
    $("search-message").textContent = adding ? "\u6B63\u5728\u9A8C\u8BC1\u884C\u60C5\u2026" : "\u652F\u6301 A \u80A1\u3001\u6E2F\u80A1\u548C\u7F8E\u80A1";
    setSearchBusy(adding);
    openDialog("search-dialog");
    $("search-input").focus();
  }
  function searchButton(stock) {
    const button = element("button", "", "search-result");
    button.dataset.symbol = stock.code;
    const title = element("div");
    title.append(element("strong", stock.name), element("small", displaySymbol(stock.code)));
    const existing = data.state.stocks.some((item) => item.code === stock.code);
    button.append(title, element("span", existing ? "\u5DF2\u5728\u81EA\u9009 \xB7 \u76EF\u76D8" : "\uFF0B \u6DFB\u52A0", "link-button"));
    button.onclick = () => addStock(stock.code);
    return button;
  }
  var adding = false;
  function setSearchBusy(busy) {
    $("search-dialog").setAttribute("aria-busy", String(busy));
    for (const control of $("search-dialog").querySelectorAll("input, #search-form button, .quick-stocks button, .search-result")) control.disabled = busy;
  }
  async function addStock(code) {
    if (adding) return;
    adding = true;
    const epoch = ++searchEpoch;
    const existing = data.state.stocks.some((stock) => stock.code === code);
    const trigger = document.activeElement;
    clearTimeout(searchTimer);
    setSearchBusy(true);
    $("search-message").textContent = "\u6B63\u5728\u9A8C\u8BC1\u884C\u60C5\u2026";
    try {
      await api.stock("add", { code });
      if (epoch === searchEpoch) $("search-dialog").close();
      toast(existing ? "\u5DF2\u5207\u6362\u76EF\u76D8" : "\u5DF2\u52A0\u5165\u81EA\u9009");
    } catch (error) {
      if (epoch === searchEpoch) $("search-message").textContent = error.message.replace(/^.*Error: /, "");
      else toast(error.message);
    } finally {
      adding = false;
      setSearchBusy(false);
      if ($("search-dialog").open && epoch !== searchEpoch) search();
      else if ($("search-dialog").open) trigger?.focus();
    }
  }
  async function search() {
    clearTimeout(searchTimer);
    if (searchComposing || adding || !$("search-dialog").open) return;
    const epoch = ++searchEpoch;
    const query = $("search-input").value.trim();
    $("search-results").replaceChildren();
    if (!query) {
      $("search-message").textContent = "\u652F\u6301 A \u80A1\u3001\u6E2F\u80A1\u548C\u7F8E\u80A1";
      return;
    }
    const direct = normalizeMarketSymbol(query);
    if (direct) $("search-results").append(searchButton({ code: direct, name: displaySymbol(direct) }));
    $("search-message").textContent = "\u6B63\u5728\u641C\u7D22\u2026";
    try {
      const results = await api.search(query);
      if (epoch !== searchEpoch || !$("search-dialog").open) return;
      const focusedCode = document.activeElement?.closest(".search-result")?.dataset.symbol;
      $("search-results").replaceChildren(...results.map(searchButton));
      if (direct && !results.some((stock) => stock.code === direct)) $("search-results").prepend(searchButton({ code: direct, name: displaySymbol(direct) }));
      if (focusedCode) {
        const buttons = [...$("search-results").querySelectorAll(".search-result")];
        (buttons.find((button) => button.dataset.symbol === focusedCode) || buttons[0] || $("search-input")).focus();
      }
      $("search-message").textContent = results.length || direct ? "\u9009\u62E9\u80A1\u7968\u52A0\u5165\u81EA\u9009" : "\u6682\u672A\u627E\u5230\uFF0C\u8BD5\u8BD5\u5B8C\u6574\u4EE3\u7801";
    } catch {
      if (epoch === searchEpoch) $("search-message").textContent = direct ? "\u540D\u79F0\u641C\u7D22\u6682\u4E0D\u53EF\u7528\uFF0C\u53EF\u6309\u4EE3\u7801\u9A8C\u8BC1\u6DFB\u52A0" : "\u641C\u7D22\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
    }
  }
  var settingsSections = [["island", "\u60AC\u6D6E\u7A97"], ["pet", "\u684C\u5BA0"], ["muyu", "\u6728\u9C7C"], ["widget", "\u5361\u7247"], ["source", "\u884C\u60C5\u6765\u6E90"], ["general", "\u901A\u7528"], ["alerts", "\u63D0\u9192\u4E0E\u8BB0\u5F55"], ["about", "\u5173\u4E8E"]];
  function heading(title) {
    $("settings-content").append(element("h3", title));
  }
  function settingRow(label, key, type = "checkbox", options = [], note = "") {
    const row = element("label", "", "setting-row");
    const title = element("span", label, "setting-label");
    if (note) title.append(element("small", note));
    const input = document.createElement(type === "select" ? "select" : "input");
    input.dataset.setting = key;
    input.setAttribute("aria-label", label);
    if (type === "select") {
      for (const [value, name] of options) {
        const option = element("option", name);
        option.value = value;
        input.append(option);
      }
    } else {
      input.type = type;
      if (type === "checkbox") input.setAttribute("role", "switch");
      if (type === "range") [input.min, input.max, input.step] = options;
    }
    row.append(title, input);
    $("settings-content").append(row);
  }
  function settingsButton(label, action) {
    const button = element("button", label, "button secondary");
    button.onclick = action;
    $("settings-content").append(button);
  }
  function buildSettings() {
    const sourceEpoch = ++sourceFormEpoch;
    mini?.close();
    mini = null;
    const container = $("settings-content");
    container.replaceChildren();
    $("settings-nav").replaceChildren(...settingsSections.map(([key, label]) => {
      const button = element("button", label, key === settingsPanel ? "active" : "");
      button.dataset.settingsPanel = key;
      button.onclick = () => {
        settingsPanel = key;
        buildSettings();
      };
      return button;
    }));
    container.append(element("h2", settingsSections.find(([key]) => key === settingsPanel)[1]));
    const themes = [["system", "\u8DDF\u968F\u7CFB\u7EDF"], ["light", "\u6D45\u8272"], ["dark", "\u6DF1\u8272"]];
    const intervals = [[5, "\u6BCF 5 \u79D2"], [10, "\u6BCF 10 \u79D2"], [30, "\u6BCF 30 \u79D2"]];
    const modes = [["market", "\u80A1\u7968\u884C\u60C5"], ["muyu", "\u6728\u9C7C\u8BA1\u6570"]];
    if (settingsPanel === "island") {
      const preview = element("div", "", "settings-preview");
      preview.id = "island-preview";
      const canvas = document.createElement("canvas");
      canvas.id = "preview-canvas";
      canvas.width = canvas.height = 100;
      const name = element("small");
      name.id = "preview-name";
      const price = element("b");
      price.id = "preview-price";
      const values = element("div");
      values.append(name, price);
      const pct = element("span");
      pct.id = "preview-pct";
      preview.append(canvas, values, pct);
      container.append(preview);
      mini = makeMotion(canvas, true);
      container.append(element("p", "\u684C\u9762\u60AC\u6D6E\u884C\u60C5\u6761\u3002\u70B9\u51FB\u5C55\u5F00\uFF0C\u6EDA\u8F6E\u5207\u6362\u81EA\u9009\uFF0C\u62D6\u52A8\u5DE6\u4FA7\u624B\u67C4\u8C03\u6574\u4F4D\u7F6E\u3002", "muted"));
      settingRow("\u5F00\u542F\u60AC\u6D6E\u7A97", "islandEnabled");
      settingRow("\u663E\u793A\u5185\u5BB9", "islandContent", "select", modes);
      settingRow("\u663E\u793A\u80A1\u7968", "islandSymbol", "select", [["", "\u8DDF\u968F\u5F53\u524D\u81EA\u9009"], ...data.state.stocks.map((stock) => [stock.code, stock.name])]);
      settingRow("\u663E\u793A\u4EF7\u683C", "islandPrice");
      settingRow("\u663E\u793A\u6DA8\u8DCC\u5E45", "islandPercent");
      settingRow("\u5C55\u5F00\u663E\u793A\u6301\u4ED3", "islandHoldings", "checkbox", [], "\u6301\u4ED3\u91D1\u989D\u9075\u5FAA\u9690\u79C1\u5F00\u5173");
      settingRow("\u663E\u793A\u725B\u6765", "islandBull");
      settingRow("\u5C9B\u5185\u52A8\u753B", "islandMotion");
      settingRow("\u663E\u793A\u6728\u9C7C\u8BA1\u6570", "islandCount");
      settingRow("\u5916\u89C2", "islandTheme", "select", themes);
      settingRow("\u5BBD\u5EA6", "islandWidth", "range", [260, 420, 8]);
      settingRow("\u884C\u60C5\u5237\u65B0", "islandInterval", "select", intervals);
      settingRow("\u5C55\u5F00\u540E 10 \u79D2\u81EA\u52A8\u6536\u8D77", "islandAutoCollapse");
      settingRow("\u4F7F\u7528\u4E3B\u9762\u677F\u65F6\u9690\u85CF", "islandHideInApp");
    } else if (settingsPanel === "pet") {
      settingRow("\u5F00\u542F\u684C\u5BA0", "petEnabled");
      settingRow("\u684C\u5BA0\u6A21\u5F0F", "petMode", "select", [["market", "\u76EF\u76D8\u684C\u5BA0"], ["muyu", "\u725B\u6765\u6728\u9C7C"]]);
      settingRow("\u663E\u793A\u884C\u60C5\u5361", "petQuote");
      settingRow("\u6309\u884C\u60C5\u5207\u6362\u52A8\u4F5C", "autoActions");
      settingRow("\u64AD\u653E\u52A8\u753B", "motion");
      settingRow("\u70B9\u51FB\u97F3\u6548", "sound");
      settingRow("\u4E0B\u8DCC\u65F6\u64AD\u653E\u5988\u5988\u97F3\u6548", "mamaSound");
      settingRow("\u97F3\u91CF", "volume", "range", [0, 1, 0.05]);
      settingRow("\u684C\u5BA0\u5927\u5C0F", "petScale", "range", [75, 125, 5]);
      settingRow("\u4F7F\u7528\u4E3B\u9762\u677F\u65F6\u9690\u85CF", "petHideInApp");
      settingsButton("\u67E5\u770B\u52A8\u4F5C\u4E0E\u59FF\u52BF", openMotions);
      container.append(element("p", "\u62D6\u52A8\u725B\u8EAB\u79FB\u52A8\uFF0C\u5355\u51FB\u4E92\u52A8\uFF0C\u4E09\u8FDE\u51FB\u89E6\u53D1\u4E0D\u8010\u70E6\u3002\u9876\u90E8\u6309\u94AE\u6253\u5F00\u4E3B\u9762\u677F\u3001\u6536\u8D77\u6216\u5173\u95ED\u684C\u5BA0\u3002", "footnote"));
    } else if (settingsPanel === "muyu") {
      settingRow("\u6572\u51FB\u97F3\u6548", "muyuSound");
      settingRow("\u725B\u6C14\uFF0B1 \u52A8\u6548", "muyuEffects");
      settingRow("\u663E\u793A\u60AC\u6D6E\u8BA1\u6570", "muyuCount");
      settingsButton("\u6253\u5F00\u6728\u9C7C", () => changeTab("muyu"));
      container.append(element("p", "\u6240\u6709\u7A97\u53E3\u5171\u7528\u672C\u8F6E\u3001\u4ECA\u65E5\u548C\u7D2F\u8BA1\u8BA1\u6570\u3002\u5FEB\u901F\u8FDE\u70B9\u4FDD\u7559\u6BCF\u6B21\u8BA1\u6570\uFF0C\u52A8\u4F5C\u6309\u8282\u62CD\u8854\u63A5\u3002", "footnote"));
    } else if (settingsPanel === "widget") {
      container.append(element("p", "\u72EC\u7ACB\u7684\u684C\u9762\u60AC\u6D6E\u5361\u7247\uFF0C\u652F\u6301\u684C\u5BA0\u3001\u884C\u60C5\u3001\u6301\u4ED3\u4E0E\u4F11\u606F\u56DB\u4E2A\u573A\u666F\u3002", "muted"));
      settingRow("\u5F00\u542F\u684C\u9762\u5361\u7247", "widgetEnabled");
      settingRow("\u5361\u7247\u5916\u89C2", "widgetTheme", "select", themes);
      settingRow("\u663E\u793A\u6700\u8FD1\u62A5\u4EF7\u66F2\u7EBF", "widgetSparkline");
      settingRow("\u663E\u793A\u725B\u6765", "widgetBull");
      settingRow("\u9690\u85CF\u6301\u4ED3\u91D1\u989D", "private");
      settingRow("\u8DDF\u968F\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5\u5207\u6362\u573A\u666F", "smartScene");
      container.append(element("p", "\u884C\u60C5\u6765\u81EA\u5E94\u7528\u5185\u540C\u4E00\u4EFD\u6570\u636E\u3002\u5361\u7247\u6807\u8BB0\u83B7\u53D6\u65F6\u95F4\uFF0C\u5173\u95ED\u7A0B\u5E8F\u540E\u505C\u6B62\u5237\u65B0\u3002", "footnote"));
    } else if (settingsPanel === "source") {
      buildQuoteSourceSettings(container, { api, toast, onSaved: buildSettings, isCurrent: () => sourceEpoch === sourceFormEpoch && settingsPanel === "source" });
    } else if (settingsPanel === "general") {
      heading("\u7248\u672C\u66F4\u65B0");
      settingRow("\u7CFB\u7EDF\u66F4\u65B0\u63D0\u9192", "updateNotifications", "checkbox", [], "\u4EC5\u5728\u6B63\u5F0F\u53D1\u5E03\u65B0\u7248\u672C\u65F6\u63D0\u9192\u4E00\u6B21\uFF1B\u8F6F\u4EF6\u5185\u59CB\u7EC8\u663E\u793A\u66F4\u65B0\u5165\u53E3");
      const updateLabel = element("p", "", "muted");
      updateLabel.id = "update-status";
      container.append(updateLabel);
      const check = element("button", "\u68C0\u67E5\u66F4\u65B0", "button secondary");
      check.id = "check-update";
      check.onclick = () => perform(api.updates("check"), paintUpdate);
      container.append(check);
      settingsButton("\u67E5\u770B\u66F4\u65B0\u8BB0\u5F55", () => perform(api.updates("history")));
      paintUpdate();
      settingsButton("\u7CFB\u7EDF\u901A\u77E5\u8BBE\u7F6E", () => perform(api.updates("permissions")));
      heading("\u5916\u89C2\u4E0E\u4F7F\u7528");
      settingRow("\u5E94\u7528\u5916\u89C2", "theme", "select", themes);
      settingRow("\u9759\u97F3", "muted");
      settingRow("\u884C\u60C5\u5237\u65B0", "interval", "select", intervals);
      settingRow("\u64AD\u653E\u52A8\u753B", "motion");
      settingRow("\u9690\u85CF\u6301\u4ED3\u91D1\u989D", "private");
      heading("\u4F7F\u7528\u6A21\u5F0F");
      const presets = element("div", "", "preset-buttons");
      for (const [name, values] of [
        ["\u9759\u97F3", { muted: true, motion: true, interval: 30, islandInterval: 30 }],
        ["\u6807\u51C6", { muted: false, motion: true, interval: 10, islandInterval: 10 }],
        ["\u7701\u7535", { muted: true, motion: false, interval: 30, islandInterval: 30 }]
      ]) {
        const button = element("button", name);
        button.onclick = () => perform(api.settings(values), () => toast("\u5DF2\u5207\u6362\u4E3A" + name));
        presets.append(button);
      }
      container.append(presets);
      settingsButton("\u6240\u6709\u60AC\u6D6E\u7A97\u53E3\u5F52\u4F4D", () => perform(api.window("reset"), () => toast("\u60AC\u6D6E\u7A97\u53E3\u5DF2\u5F52\u4F4D")));
      heading("\u5173\u95ED\u7A0B\u5E8F");
      container.append(element("p", "\u5173\u95ED\u4E3B\u9762\u677F\u4F1A\u6536\u8D77\u5230\u6258\u76D8\uFF0C\u684C\u5BA0\u4E0E\u884C\u60C5\u7EE7\u7EED\u8FD0\u884C\u3002\u53EF\u4ECE\u6258\u76D8\u83DC\u5355\u9000\u51FA\u3002", "muted"));
      settingsButton("\u9000\u51FA\u725B\u6765", () => {
        $("confirm-title").textContent = "\u9000\u51FA\u725B\u6765";
        $("confirm-message").textContent = "\u9000\u51FA\u540E\uFF0C\u684C\u5BA0\u4E0E\u884C\u60C5\u5237\u65B0\u5C06\u4E00\u540C\u7ED3\u675F\u3002";
        $("confirm-accept").onclick = () => api.window("quit");
        openDialog("confirm-dialog");
      });
    } else if (settingsPanel === "alerts") {
      buildFeatureSettings();
    } else {
      container.append(element("p", "\u725B\u6765\u76EF\u76D8\u7535\u8111\u7248 \xB7 " + data.version, "muted"));
      for (const paragraph of [
        "\u652F\u6301 A \u80A1\u3001\u6E2F\u80A1\u548C\u7F8E\u80A1\u884C\u60C5\uFF0C\u9ED8\u8BA4\u4F7F\u7528\u65B0\u6D6A\u4E0E\u817E\u8BAF\u63A5\u53E3\uFF0C\u4E5F\u53EF\u5728\u201C\u884C\u60C5\u6765\u6E90\u201D\u4E2D\u63A5\u5165\u81EA\u5DF1\u7684 HTTP JSON \u63A5\u53E3\u3002\u7F8E\u80A1\u533A\u5206\u76D8\u524D\u3001\u5E38\u89C4\u548C\u76D8\u540E\u62A5\u4EF7\u3002\u884C\u60C5\u53EF\u80FD\u5EF6\u8FDF\u6216\u4E2D\u65AD\uFF0C\u4EA4\u6613\u65F6\u6BB5\u6309\u5468\u5386\u4F30\u7B97\uFF0C\u8282\u5047\u65E5\u4E0E\u505C\u724C\u4EE5\u4EA4\u6613\u6240\u516C\u544A\u4E3A\u51C6\u3002",
        "\u81EA\u9009\u3001\u6301\u4ED3\u3001\u6728\u9C7C\u8BA1\u6570\u548C\u8BBE\u7F6E\u4FDD\u5B58\u5728\u8FD9\u53F0\u7535\u8111\u3002\u67E5\u8BE2\u8BCD\u548C\u80A1\u7968\u4EE3\u7801\u53D1\u9001\u7ED9\u884C\u60C5\u63D0\u4F9B\u65B9\uFF0C\u6210\u672C\u3001\u80A1\u6570\u548C\u8BA1\u6570\u4EC5\u5728\u672C\u673A\u4F7F\u7528\u3002",
        "Ctrl + K \u641C\u7D22\u80A1\u7968\uFF0CCtrl + 1\u20134 \u5207\u6362\u9875\u9762\uFF0CEsc \u5173\u95ED\u5F39\u7A97\u3002\u6728\u9C7C\u9875\u9762\u652F\u6301\u7A7A\u683C\u6572\u51FB\u3002"
      ]) container.append(element("p", paragraph, "footnote"));
    }
    syncControls();
    renderSettingsPreview();
    syncMotion();
  }
  function buildFeatureSettings() {
    settingRow("\u60C5\u7EEA\u8BB0\u5FC6", "emotionMemory");
    settingRow("\u6536\u76D8\u603B\u7ED3", "closeSummary");
    const quietRow = element("label", "", "setting-row");
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.quiet = "enabled";
    enabled.setAttribute("role", "switch");
    quietRow.append(element("span", "\u5B89\u9759\u529E\u516C"), enabled);
    $("settings-content").append(quietRow);
    const times = element("div", "", "quiet-times");
    for (const key of ["start", "end"]) {
      const input = document.createElement("input");
      input.type = "time";
      input.dataset.quiet = key;
      input.setAttribute("aria-label", key === "start" ? "\u5B89\u9759\u5F00\u59CB\u65F6\u95F4" : "\u5B89\u9759\u7ED3\u675F\u65F6\u95F4");
      times.append(input);
    }
    $("settings-content").append(times, element("p", "\u5B89\u9759\u65F6\u6BB5\u6309\u5317\u4EAC\u65F6\u95F4\u6267\u884C\uFF0C\u70B9\u51FB\u4E0E\u63D0\u9192\u58F0\u97F3\u9759\u97F3\u3002", "footnote"));
    heading("\u5F53\u524D\u76EF\u76D8\u6807\u7684\u63D0\u9192");
    const form = element("form", "", "rule-form");
    const type = document.createElement("select");
    type.id = "rule-type";
    type.setAttribute("aria-label", "\u63D0\u9192\u7C7B\u578B");
    for (const [value2, label] of [["price", "\u4EF7\u683C"], ["change_pct", "\u6DA8\u8DCC\u5E45 %"], ["pnl_amount", "\u7D2F\u8BA1\u76C8\u4E8F"], ["cost_return", "\u56DE\u5230\u6210\u672C"], ["rapid_rise", "\u5FEB\u901F\u62C9\u5347"], ["rapid_fall", "\u5FEB\u901F\u8DF3\u6C34"]]) {
      const option = element("option", label);
      option.value = value2;
      type.append(option);
    }
    const comparator = document.createElement("select");
    comparator.id = "rule-comparator";
    comparator.setAttribute("aria-label", "\u63D0\u9192\u65B9\u5411");
    for (const [value2, label] of [["gte", "\u8FBE\u5230"], ["lte", "\u8DCC\u81F3"]]) {
      const option = element("option", label);
      option.value = value2;
      comparator.append(option);
    }
    const value = document.createElement("input");
    value.id = "rule-value";
    value.type = "number";
    value.step = "any";
    value.value = "0";
    value.setAttribute("aria-label", "\u63D0\u9192\u9608\u503C");
    form.append(type, comparator, value);
    const soundLabel = element("label", "", "muted");
    const sound = document.createElement("input");
    sound.type = "checkbox";
    soundLabel.append(sound, " \u63D0\u9192\u58F0\u97F3");
    const add = element("button", "\u6DFB\u52A0\u63D0\u9192", "button primary");
    add.type = "submit";
    form.append(soundLabel, add);
    form.onsubmit = (event) => {
      event.preventDefault();
      if (data.state.alerts.length >= 20) {
        toast("\u63D0\u9192\u6700\u591A 20 \u6761");
        return;
      }
      perform(api.alerts([...data.state.alerts, { id: crypto.randomUUID(), type: type.value, comparator: comparator.value, value: Number(value.value), presentation: "2d", sound: sound.checked, cooldownMs: 6e4 }]), () => buildSettings());
    };
    $("settings-content").append(form);
    const labels = { price: "\u4EF7\u683C", change_pct: "\u6DA8\u8DCC\u5E45", pnl_amount: "\u7D2F\u8BA1\u76C8\u4E8F", cost_return: "\u56DE\u5230\u6210\u672C", rapid_rise: "\u5FEB\u901F\u62C9\u5347", rapid_fall: "\u5FEB\u901F\u8DF3\u6C34" };
    for (const rule of data.state.alerts) {
      const row = element("div", "", "alert-rule");
      const label = labels[rule.type] + (["price", "change_pct", "pnl_amount"].includes(rule.type) ? ` ${rule.comparator === "lte" ? "\u2264" : "\u2265"} ${rule.value}` : "");
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = rule.enabled !== false;
      toggle.setAttribute("aria-label", "\u542F\u7528" + label);
      toggle.onchange = () => perform(api.alerts(data.state.alerts.map((item) => item.id === rule.id ? { ...item, enabled: toggle.checked } : item)));
      const remove = element("button", "\u5220\u9664", "link-button");
      remove.onclick = () => perform(api.alerts(data.state.alerts.filter((item) => item.id !== rule.id)), () => buildSettings());
      row.append(toggle, element("span", label), remove);
      $("settings-content").append(row);
    }
    $("settings-content").append(element("p", "\u4EC5\u5BF9\u5F53\u524D\u76EF\u76D8\u6807\u7684\u751F\u6548\u3002\u9608\u503C\u7A7F\u8D8A\u540E\u63D0\u9192\uFF0C\u6BCF\u6761\u81F3\u5C11\u95F4\u9694 60 \u79D2\u3002\u76C8\u4E8F\u91D1\u989D\u91C7\u7528\u6807\u7684\u539F\u5E01\u3002", "footnote"));
  }
  function processFeatures() {
    const code = data.state.selected, entry = currentEntry();
    if (featureCode !== code) {
      featureCode = code;
      lastFeatureQuote = 0;
      wasOpen = false;
      emotion = new EmotionMemory({ state: readJson("niulai:emotion-memory-v1:" + code) || readJson("niulai:emotion-memory-v1") });
      session = new DailySessionTracker({ state: readJson("niulai:daily-session-v1:" + code) });
      alerts = new AlertTriggerEngine({ triggers: data.state.alerts });
    }
    emotion.configure({ enabled: settings().emotionMemory });
    alerts.configure(data.state.alerts);
    const marketOpen = marketSession(code) === "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5";
    const sampleKey = [entry?.quote?.quotedAt ?? entry?.received, entry?.quote?.price, entry?.quote?.changePct].join(":");
    if (entry?.quote && quoteHealth(entry, settings().interval).actionable && sampleKey !== lastFeatureQuote) {
      lastFeatureQuote = sampleKey;
      const result = position(selectedStock(), entry.quote);
      const held = result ? { totalPnl: result.total, todayPnl: result.today, totalPct: result.percent, shares: selectedStock().shares } : null;
      const events = liveMood === "surge" ? [{ type: "RAPID_RISE" }] : liveMood === "drop" ? [{ type: "RAPID_FALL" }] : [];
      emotion.update({ quote: entry.quote, position: held, marketOpen, events });
      session.update({ quote: entry.quote, position: held, marketOpen });
      storeJson("niulai:emotion-memory-v1:" + code, emotion.snapshot());
      storeJson("niulai:daily-session-v1:" + code, session.snapshot());
      for (const hit of alerts.evaluate({ quote: entry.quote, position: held, events })) {
        const label = hit.type === "pnl_amount" ? `\u7D2F\u8BA1\u76C8\u4E8F${hit.comparator === "lte" ? "\u8DCC\u81F3" : "\u8FBE\u5230"} ${currency(code)} ${fmt(hit.value)}` : hit.label;
        toast(selectedStock().name + " \xB7 " + label);
        if (document.hidden && !data.suspended) api.notify(selectedStock().name + " \xB7 " + label).catch(() => {
        });
        if (hit.presentation === "2d") api.window("preview", hit.direction > 0 ? "clap" : "cover");
        if (hit.sound && !settings().muted && !quiet() && !data.suspended) {
          stopAudio();
          const sound = sounds[hit.direction > 0 ? "rise" : "fall"];
          sound.volume = settings().volume;
          sound.play().catch(() => {
          });
        }
      }
      if (settings().emotionMemory && Date.now() > previewUntil) $("pet-message").textContent = emotion.quips(marketOpen ? "flat" : "closed")[0];
    }
    if (wasOpen && !marketOpen && settings().closeSummary && !session.snapshot().shown) {
      const summary = session.summary(emotion.snapshot().label);
      if (summary) {
        const content = $("summary-content");
        content.replaceChildren(element("p", summary.day + " \xB7 " + selectedStock().name, "muted"));
        for (const [label, value] of [["\u6536\u76D8\u6DA8\u8DCC\u5E45", signed(summary.changePct) + "%"], ["\u4ECA\u65E5\u76C8\u4E8F", money(summary.todayPnl)], ["\u6700\u5927\u6D6E\u76C8", money(summary.maxFloatingProfit)], ["\u6700\u5927\u56DE\u64A4", money(summary.maxDrawdown)]]) content.append(element("p", label + "\u3000" + value, "footnote"));
        content.append(element("p", summary.comment, "footnote"));
        session.markShown();
        storeJson("niulai:daily-session-v1:" + code, session.snapshot());
        openDialog("summary-dialog");
      }
    }
    wasOpen = marketOpen;
  }
  function openMotions() {
    openDialog("motion-dialog");
    previewMotion(liveMood);
  }
  function previewMotion(id) {
    $("motion-dialog").scrollTop = 0;
    motionPreview = id;
    const spec = catalog.find((item) => item.id === id);
    $("motion-name").textContent = spec.label;
    $("motion-action").textContent = spec.action;
    gallery.replay(id);
    for (const button of document.querySelectorAll("[data-motion]")) button.classList.toggle("selected", button.dataset.motion === id);
  }
  function knock() {
    perform(api.knock());
  }
  api.onKnock(({ counts, reset }) => {
    if (!data) return;
    data.counts = counts;
    renderCounts();
    renderSettingsPreview();
    if (!reset) {
      wood.replay("muyu");
      if (tab === "muyu" && !document.hidden && settings().motion && settings().muyuEffects) {
        const layer = $("wood-feedback");
        if (layer.children.length >= 6) layer.firstChild.remove();
        const feedback = element("span", "\u725B\u6C14\uFF0B1 \u{1F4C8}", "wood-pulse");
        layer.append(feedback);
        setTimeout(() => feedback.remove(), 760);
      }
    }
  });
  api.onSnapshot(applySnapshot);
  api.onRefreshing((refreshing) => {
    if (!data) return;
    data.refreshing = refreshing;
    renderQuoteStatus();
    if (refreshRequested && !refreshing) {
      refreshRequested = false;
      const entry = currentEntry(), health = quoteHealth(entry, settings().interval);
      let message = health.warning ? "\u5DF2\u83B7\u53D6\u62A5\u4EF7\uFF0C" + health.message : "\u884C\u60C5\u5DF2\u5237\u65B0";
      if (entry?.error) message = entry.quote ? "\u5237\u65B0\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u4E0A\u6B21\u62A5\u4EF7" : "\u6682\u672A\u83B7\u53D6\u62A5\u4EF7\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      toast(message);
    }
  });
  api.onMamaVoice(({ volume }) => {
    if (data && lastMarketScene && settings().mamaSound && !settings().muted && !quiet()) {
      stopAudio();
      mamaVoice.play(volume).catch(() => {
      });
    }
  });
  for (const button of document.querySelectorAll("[data-tab]")) button.onclick = () => changeTab(button.dataset.tab);
  document.querySelector(".brand").onclick = (event) => {
    event.preventDefault();
    changeTab("home");
  };
  for (const button of document.querySelectorAll(".add-stock")) button.onclick = openSearch;
  $("all-stocks").onclick = $("select-stock").onclick = () => changeTab("watchlist");
  $("refresh").onclick = async () => {
    refreshRequested = true;
    try {
      await api.refresh();
    } catch (error) {
      refreshRequested = false;
      toast(error.message);
    }
  };
  $("privacy-toggle").onclick = () => perform(api.settings({ private: !settings().private }));
  $("hide-dashboard").onclick = () => perform(api.window("hide"));
  $("open-quote").onclick = () => perform(api.window("external"));
  $("edit-position").onclick = $("portfolio-edit").onclick = () => openPosition();
  $("reset-overlays").onclick = () => perform(api.window("reset"), () => toast("\u60AC\u6D6E\u7A97\u53E3\u5DF2\u5F52\u4F4D"));
  $("motions-open").onclick = openMotions;
  $("confirm-cancel").onclick = () => $("confirm-dialog").close();
  document.addEventListener("change", (event) => {
    const control = event.target;
    if (control.dataset.setting) {
      const key = control.dataset.setting;
      const value = control.type === "checkbox" ? control.checked : control.type === "range" || ["interval", "islandInterval"].includes(key) ? Number(control.value) : control.value;
      perform(api.settings({ [key]: value }));
    }
    if (control.dataset.quiet) {
      const value = control.type === "checkbox" ? control.checked : control.value;
      perform(api.settings({ quietOffice: { ...settings().quietOffice, [control.dataset.quiet]: value } }));
    }
  });
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.querySelector(".close-dialog").onclick = () => dialog.close();
    dialog.addEventListener("close", syncMotion);
    dialog.addEventListener("click", (event) => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
  }
  $("position-form").onsubmit = (event) => {
    event.preventDefault();
    perform(api.stock("position", { code: positionCode, cost: Number($("cost").value), shares: Number($("shares").value) }), () => {
      $("position-dialog").close();
      toast("\u6301\u4ED3\u5DF2\u4FDD\u5B58");
    });
  };
  $("clear-position").onclick = () => perform(api.stock("position", { code: positionCode, cost: 0, shares: 0 }), () => $("position-dialog").close());
  $("search-form").onsubmit = (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    search();
  };
  $("search-input").oninput = (event) => {
    ++searchEpoch;
    clearTimeout(searchTimer);
    $("search-results").replaceChildren();
    $("search-message").textContent = $("search-input").value.trim() ? "\u6B63\u5728\u641C\u7D22\u2026" : "\u652F\u6301 A \u80A1\u3001\u6E2F\u80A1\u548C\u7F8E\u80A1";
    if (!event.isComposing && !searchComposing && $("search-input").value.trim()) searchTimer = setTimeout(search, 350);
  };
  $("search-input").addEventListener("compositionstart", () => {
    searchComposing = true;
    ++searchEpoch;
    clearTimeout(searchTimer);
  });
  $("search-input").addEventListener("compositionend", () => {
    searchComposing = false;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 350);
  });
  $("search-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && !searchComposing && event.keyCode !== 229) {
      const first = $("search-results").querySelector(".search-result");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  $("search-dialog").addEventListener("keydown", (event) => {
    if (event.isComposing || searchComposing || event.altKey || event.ctrlKey || event.metaKey || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    if (event.target !== $("search-input") && !event.target.closest(".search-result")) return;
    const buttons = [...$("search-results").querySelectorAll(".search-result:not(:disabled)")];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    let next = (index + step + buttons.length) % buttons.length;
    if (index < 0) next = step > 0 ? 0 : buttons.length - 1;
    buttons[next].focus();
  });
  $("search-dialog").addEventListener("close", () => {
    ++searchEpoch;
    searchComposing = false;
    clearTimeout(searchTimer);
  });
  for (const button of document.querySelectorAll("[data-code]")) button.onclick = () => addStock(button.dataset.code);
  var taps = [];
  $("pet").onclick = () => {
    const now = Date.now();
    taps = taps.filter((at) => now - at < 1150);
    taps.push(now);
    const id = taps.length >= 3 ? "annoyed" : "wave";
    if (id === "annoyed") taps = [];
    bull.interact(id);
    previewUntil = now + 3200;
    playPetVoice();
  };
  $("wood-tap").onclick = () => {
    knock();
    if (settings().muyuSound && !settings().muted && !quiet()) {
      voice.volume = settings().volume;
      voice.play().catch(() => toast("\u58F0\u97F3\u672A\u80FD\u64AD\u653E"));
    }
  };
  $("wood-round").onclick = () => perform(api.newRound());
  $("wood-floating").onclick = () => perform(api.settings({ petEnabled: true, petMode: "muyu" }), () => toast("\u60AC\u6D6E\u6728\u9C7C\u5DF2\u5F00\u542F"));
  for (const spec of catalog) {
    const button = element("button", "", "motion-option");
    button.dataset.motion = spec.id;
    button.append(element("strong", spec.label), element("small", spec.action));
    button.onclick = () => previewMotion(spec.id);
    $("motion-list").append(button);
  }
  $("preview-floating").onclick = () => perform(api.window("preview", motionPreview));
  document.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && /^[1-4]$/.test(event.key) && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      changeTab(["home", "watchlist", "portfolio", "muyu"][Number(event.key) - 1]);
      return;
    }
    if (event.code === "Space" && tab === "muyu" && !document.querySelector("dialog[open]") && !event.target.closest("input, select, button, textarea")) {
      event.preventDefault();
      $("wood-tap").click();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAudio();
    syncMotion();
  });
  window.addEventListener("online", () => perform(api.refresh()));
  paintIcons();
  var legacyValues = {};
  for (const key of ["niulai:pet-settings", "niulai:saved-stocks-v1", "niulai:portfolio", "niulai:selected-symbol", "niulai:alert-triggers-v1"]) {
    try {
      legacyValues[key] = localStorage.getItem(key);
    } catch {
    }
  }
  api.bootstrap(import_desktop_state.default.migrateLegacy(legacyValues)).then((next) => {
    applySnapshot(next);
    api.updates("status").then(paintUpdate).catch(() => {
    });
    setInterval(() => {
      renderQuoteStatus();
      updateMood();
      processFeatures();
    }, 1e3);
    window.__NIULAI_RENDERER_READY__ = true;
  }).catch((error) => toast("\u542F\u52A8\u5931\u8D25 \xB7 " + error.message));
})();
