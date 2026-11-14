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
          let code2 = null;
          if (prefix === "sh" || prefix === "sz") code2 = `s_${prefix}${rawCode}`;
          else if (prefix === "hk") code2 = `rt_hk${String(rawCode).padStart(5, "0")}`;
          else if (prefix === "us") {
            const ticker = String(rawCode).replace(/\.(oq|o|n|a|ps|k)$/i, "").toLowerCase();
            code2 = `gb_${ticker}`;
          }
          if (!code2 || !allowed.includes(marketForSymbol2(code2)) || seen.has(code2)) continue;
          seen.add(code2);
          results.push({
            code: code2,
            name: name || displaySymbol2(code2),
            market: marketForSymbol2(code2),
            marketLabel: MARKET_LABEL[marketForSymbol2(code2)],
            displayCode: displaySymbol2(code2)
          });
          if (results.length >= 12) break;
        }
        return results;
      }
      function externalQuoteUrl(symbol) {
        const code2 = normalizeMarketSymbol2(symbol);
        if (!code2) return null;
        const market = marketForSymbol2(code2);
        if (market === MARKET.HK) return `https://gu.qq.com/hk${code2.slice(5)}/gp`;
        if (market === MARKET.US) return `https://gu.qq.com/us${code2.slice(3).toUpperCase()}/gp`;
        return `https://gu.qq.com/${code2.replace(/^s_/, "")}/gp`;
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
      function marketClock(code2, now = Date.now()) {
        const market = marketForSymbol2(code2);
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
      function wallTime(year, month, day, hour, minute, second, code2) {
        const wanted = Date.UTC(year, month, day, hour, minute, second);
        if (!Number.isFinite(wanted)) return null;
        let timestamp = wanted;
        for (let attempt = 0; attempt < 2; attempt++) {
          const actual2 = marketClock(code2, timestamp);
          const represented = Date.UTC(Number(actual2.year), Number(actual2.month) - 1, Number(actual2.day), Number(actual2.hour), Number(actual2.minute), Number(actual2.second));
          timestamp += wanted - represented;
        }
        const actual = marketClock(code2, timestamp);
        return Number(actual.year) === year && Number(actual.month) - 1 === month && Number(actual.day) === day && Number(actual.hour) === hour && Number(actual.minute) === minute ? timestamp : null;
      }
      function parseQuoteTime(value, code2, reference = Date.now()) {
        const text = String(value || "").trim();
        const numeric = /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
        if (numeric) {
          const [, year2, month2, day2, hour2, minute2, second] = numeric.map(Number);
          return wallTime(year2, month2 - 1, day2, hour2, minute2, second, code2);
        }
        if (marketForSymbol2(code2) !== "us") return null;
        const american = /^([a-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(AM|PM)(?:\s+(EST|EDT))?$/i.exec(text);
        if (!american) return null;
        const month = MONTHS.indexOf(american[1].toLowerCase());
        const day = Number(american[2]), rawHour = Number(american[3]), minute = Number(american[4]);
        if (month < 0 || rawHour < 1 || rawHour > 12 || minute > 59 || day < 1 || day > 31) return null;
        const hour = rawHour % 12 + (american[5].toUpperCase() === "PM" ? 12 : 0);
        const year = Number(marketClock(code2, reference).year);
        const candidates = [year - 1, year, year + 1].map((candidate) => {
          if (american[6]) {
            const offset = american[6].toUpperCase() === "EDT" ? 4 : 5;
            const timestamp = Date.UTC(candidate, month, day, hour + offset, minute);
            const clock = marketClock(code2, timestamp);
            return Number(clock.month) - 1 === month && Number(clock.day) === day && Number(clock.hour) === hour ? timestamp : null;
          }
          return wallTime(candidate, month, day, hour, minute, 0, code2);
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
  function currency(code2) {
    return { cn: "CNY", hk: "HKD", us: "USD" }[marketForSymbol(code2)];
  }
  function marketSession(code2, now = /* @__PURE__ */ new Date()) {
    const market = marketForSymbol(code2);
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
  function desktopMood(base, data2, code2) {
    if (!data2.state.settings.autoActions || data2.suspended || ["offline", "loading", "preopen", "closed", "weekend", "lunch"].includes(base)) return base;
    if (data2.reactions?.[code2]?.crying && marketSession(code2) === "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5") return data2.quotes[code2]?.quote?.changePct <= -5 ? "slump" : "cover";
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

  // niulai-android/web/market-mood.mjs
  function sessionPhase(code2, now) {
    const us = marketForSymbol(code2) === "us", hk = marketForSymbol(code2) === "hk";
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
    update(q, error, now = Date.now(), interval = 10, code2 = q?.code || "s_sh000001") {
      const session = sessionPhase(code2, now), key = code2 + ":" + session.key;
      if (key !== this.key) {
        this.samples = [];
        this.lastSample = 0;
        this.key = key;
        this.since = 0;
      }
      let next;
      const valid = q && q.code === code2 && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(q.changePct);
      if (error || valid && (now - q.received > Math.max(45e3, interval * 2500) || q.received > now + 5e3)) next = "offline";
      else if (session.phase !== "trading" && session.phase !== "opening") next = session.phase;
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
        else if (session.phase === "opening") next = "opening";
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

  // overlay.js
  var kind = new URLSearchParams(location.search).get("kind");
  var shell = $("overlay");
  shell.dataset.kind = kind;
  document.title = "\u725B\u6765" + { pet: "\u684C\u5BA0", island: "\u60AC\u6D6E\u7A97", widget: "\u684C\u9762\u5361\u7247" }[kind];
  var bull = makeMotion($("pet-canvas"));
  var mini = makeMotion($("mini-canvas"), true);
  var moods = new MarketMood();
  var voice = new TapVoice("assets/audio/niulai-tap.wav");
  var mamaVoice = new MamaVoice();
  var sounds = { rise: new Audio("assets/audio/niulai.mp3"), fall: new Audio("assets/audio/mama.mp3") };
  var data;
  var collapsed = kind === "island";
  var collapseTimer;
  var previewUntil = 0;
  var wheelAt = 0;
  var manualSceneUntil = 0;
  var calmEnd = 0;
  var taps = [];
  var pointer;
  var pointerStart;
  var dragged = false;
  var lastMarketScene;
  function code() {
    return kind === "island" && data.state.settings.islandSymbol || data.state.selected;
  }
  function settings() {
    return data.state.settings;
  }
  function entry() {
    return data.quotes[code()];
  }
  function isWood() {
    return (kind === "island" ? settings().islandContent : settings().petMode) === "muyu" && kind !== "widget";
  }
  function stopAudio() {
    voice.stop();
    mamaVoice.stop();
    for (const sound of Object.values(sounds)) {
      sound.pause();
      sound.currentTime = 0;
    }
  }
  function syncMotion() {
    if (!data) return;
    const visible = !document.hidden && !data.suspended;
    const moving = settings().motion && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const marketScene = visible && moving && !isWood() && (kind === "pet" || kind === "widget" && settings().scene === 0 && settings().widgetBull || kind === "island" && settings().islandBull && settings().islandMotion);
    if (marketScene !== lastMarketScene) {
      lastMarketScene = marketScene;
      api.reportScene(marketScene).catch(() => {
      });
    }
    bull.configure(visible && kind !== "island" && (kind === "pet" || settings().scene === 0 && settings().widgetBull), moving);
    mini.configure(visible && kind === "island" && settings().islandBull, moving && settings().islandMotion);
    if (!visible || settings().muted || isQuietOfficeActive(settings().quietOffice)) stopAudio();
    if (!settings().mamaSound) mamaVoice.stop();
  }
  function renderCounts() {
    $("overlay-count-value").textContent = data.counts.session.toLocaleString("zh-CN");
    $("overlay-total").textContent = `\u4ECA\u65E5 ${data.counts.today.toLocaleString("zh-CN")} \xB7 \u7D2F\u8BA1 ${data.counts.total.toLocaleString("zh-CN")}`;
    if (isWood()) {
      $("compact-name").textContent = "\u725B\u6765\u6728\u9C7C";
      $("compact-price").textContent = settings().islandCount ? "\u672C\u8F6E " + data.counts.session.toLocaleString("zh-CN") : "\u8F7B\u89E6\u6572\u51FB";
      $("compact-percent").textContent = "+1";
    }
  }
  function render() {
    if (!data?.state) return;
    const quote = entry()?.quote, stock = data.state.stocks.find((item) => item.code === code());
    const presentation = quotePresentation(entry(), settings().interval);
    const theme = kind === "widget" ? settings().widgetTheme : kind === "island" ? settings().islandTheme : settings().theme;
    const dark = theme === "dark" || theme === "system" && data.dark;
    document.documentElement.classList.toggle("dark", dark);
    shell.classList.toggle("light-island", !dark);
    shell.classList.toggle("collapsed", collapsed);
    shell.classList.toggle("wood-mode", isWood());
    $("overlay-title").textContent = isWood() ? "\u725B\u6765\u6728\u9C7C" : { pet: "\u725B\u6765\u684C\u5BA0", widget: "\u725B\u6765\u5361\u7247", island: "\u725B\u6765\u60AC\u6D6E\u7A97" }[kind];
    const name = quote?.name || stock?.name || displaySymbol(code());
    $("overlay-name").textContent = name;
    $("compact-name").textContent = name + (presentation.label ? " \xB7 " + presentation.label : "") + (quote && presentation.warning ? " \xB7 \u5F85\u66F4\u65B0" : "");
    $("overlay-code").textContent = displaySymbol(code()) + " \xB7 " + currency(code()) + (presentation.label ? " \xB7 " + presentation.label : "");
    $("overlay-price").textContent = $("compact-price").textContent = fmt(quote?.price, currency(code()) === "HKD" ? 3 : 2);
    $("overlay-percent").textContent = $("compact-percent").textContent = Number.isFinite(quote?.changePct) ? signed(quote.changePct) + "%" : "\u2014";
    $("overlay-numbers").className = $("compact-percent").className = tone(quote?.changePct);
    if (kind === "island" && !isWood()) {
      $("compact-price").hidden = !settings().islandPrice;
      $("compact-percent").hidden = !settings().islandPercent;
    } else {
      $("compact-price").hidden = $("compact-percent").hidden = false;
    }
    $("overlay-status").textContent = presentation.compact;
    $("overlay-status").title = presentation.detail;
    shell.classList.toggle("quote-warning", Boolean(quote && presentation.warning && !isWood()));
    shell.title = presentation.detail;
    $("compact-island").setAttribute("aria-label", name + " \xB7 " + presentation.compact);
    $("compact-island").hidden = kind !== "island";
    $("overlay-content").hidden = kind === "island" && collapsed;
    $("mini-canvas").hidden = !settings().islandBull;
    $("scene-tabs").hidden = kind !== "widget";
    $("overlay-quote").hidden = isWood() || kind === "pet" && !settings().petQuote;
    $("overlay-count").hidden = !isWood() || !settings().muyuCount;
    $("island-expanded").hidden = kind !== "island" || collapsed;
    $("overlay-pet").hidden = kind === "island" || kind === "widget" && (settings().scene !== 0 || !settings().widgetBull);
    for (const [id, scene] of [["market-scene", 1], ["position-scene", 2], ["calm-scene", 3]]) $(id).hidden = kind !== "widget" || settings().scene !== scene;
    for (const button of document.querySelectorAll("[data-scene]")) {
      button.classList.toggle("active", Number(button.dataset.scene) === settings().scene);
      button.setAttribute("aria-pressed", String(Number(button.dataset.scene) === settings().scene));
    }
    const held = stock && position(stock, quote);
    const holdingText = held ? settings().private ? "\u6301\u4ED3\u91D1\u989D\u5DF2\u9690\u85CF" : `\u4ECA\u65E5 ${signed(held.today)} \xB7 \u7D2F\u8BA1 ${signed(held.total)} ${currency(code())}` : "\u5C1A\u672A\u8BBE\u7F6E\u6301\u4ED3";
    $("island-position").textContent = settings().islandHoldings && !isWood() ? holdingText : isWood() ? "\u4ECA\u65E5 " + data.counts.today + " \xB7 \u7D2F\u8BA1 " + data.counts.total : presentation.session || marketSession(code());
    const positionContainer = $("overlay-position");
    positionContainer.replaceChildren();
    if (held) {
      const grid = element("div", "", "pnl-grid");
      for (const [label, value] of [["\u4ECA\u65E5\u76C8\u4E8F", held.today], ["\u7D2F\u8BA1\u76C8\u4E8F", held.total]]) {
        const cell = element("div");
        cell.append(element("small", label + " \xB7 " + currency(code())), element("strong", settings().private ? "\u2022\u2022\u2022\u2022" : signed(value), settings().private ? "" : tone(value)));
        grid.append(cell);
      }
      positionContainer.append(grid);
    } else positionContainer.append(element("p", "\u5C1A\u672A\u8BBE\u7F6E\u6301\u4ED3", "position-empty"));
    const samples = data.histories[code()] || [];
    $("overlay-chart").hidden = !settings().widgetSparkline;
    drawSparkline($("overlay-chart"), samples, getComputedStyle(document.documentElement).getPropertyValue(quote?.changePct < 0 ? "--fall" : "--rise"));
    $("chart-description").textContent = samples.length > 1 ? `\u672C\u6B21\u8FD0\u884C ${samples.length} \u4E2A\u6837\u672C \xB7 ${time(samples[0].at)}\u2013${time(samples.at(-1).at)}` : "\u672C\u6B21\u8FD0\u884C\u91C7\u6837\uFF0C\u7B49\u5F85\u66F4\u591A\u62A5\u4EF7";
    renderCounts();
    updateMood();
  }
  function updateMood() {
    if (!data) return;
    const record = entry();
    const health = quoteHealth(record, settings().interval);
    const base = isWood() ? "muyu" : settings().autoActions ? moods.update(record?.quote ? { ...record.quote, received: record.received } : null, record?.error || (record?.quote && health.warning ? health.message : null), Date.now(), settings().interval, code()) : "idle";
    const mood = isWood() ? base : desktopMood(base, data, code());
    if (Date.now() > previewUntil) {
      bull.state(mood);
      mini.state(mood);
    }
    syncMotion();
    if (kind === "widget" && settings().scene === 3 && calmEnd) {
      const remaining = Math.max(0, Math.ceil((calmEnd - Date.now()) / 1e3));
      $("calm-time").textContent = remaining ? remaining + " \u79D2" : "\u4F11\u606F\u7ED3\u675F";
      if (!remaining) {
        calmEnd = 0;
        $("calm-start").textContent = "\u518D\u4F11\u606F\u4E00\u4F1A\u513F";
      }
    }
    if (kind === "widget" && settings().smartScene && Date.now() > manualSceneUntil) {
      const recommended = marketSession(code()) === "\u5E38\u89C4\u4EA4\u6613\u65F6\u6BB5" ? 1 : 0;
      if (settings().scene !== recommended) api.settings({ scene: recommended });
    }
  }
  async function switchStock(direction) {
    const stocks = data.state.stocks;
    const index = stocks.findIndex((stock) => stock.code === code());
    const next = stocks[(index + direction + stocks.length) % stocks.length].code;
    try {
      if (kind === "island" && settings().islandSymbol) await api.settings({ islandSymbol: next });
      else await api.stock("select", { code: next });
    } catch (error) {
      $("overlay-status").textContent = error.message;
    }
  }
  async function interact() {
    if (!data || data.suspended) return;
    const quiet = isQuietOfficeActive(settings().quietOffice);
    if (isWood()) {
      api.knock().catch((error) => $("overlay-status").textContent = error.message);
      if (settings().muyuSound && !settings().muted && !quiet) {
        voice.volume = settings().volume;
        voice.play().catch(() => {
        });
      }
      return;
    }
    const now = Date.now();
    taps = taps.filter((at) => now - at < 1150);
    taps.push(now);
    const mood = taps.length >= 3 ? "annoyed" : "wave";
    if (mood === "annoyed") taps = [];
    bull.interact(mood);
    previewUntil = now + 3200;
    if (settings().sound && !settings().muted && !quiet) {
      stopAudio();
      const sound = sounds[entry()?.quote?.changePct < 0 ? "fall" : "rise"];
      sound.volume = settings().volume;
      sound.play().catch(() => {
      });
    }
  }
  function autoCollapse() {
    clearTimeout(collapseTimer);
    if (!collapsed && settings().islandAutoCollapse) collapseTimer = setTimeout(() => {
      if (!collapsed) api.window("collapse");
    }, 1e4);
  }
  api.onSnapshot((next) => {
    data = next;
    render();
  });
  api.onMamaVoice(({ volume }) => {
    if (data && lastMarketScene && settings().mamaSound && !settings().muted && !isQuietOfficeActive(settings().quietOffice)) {
      stopAudio();
      mamaVoice.play(volume).catch(() => {
      });
    }
  });
  api.onCollapsed((value) => {
    collapsed = value;
    render();
    autoCollapse();
  });
  api.onPreview((id) => {
    if (!catalog.some((spec) => spec.id === id)) return;
    previewUntil = Date.now() + 6e3;
    bull.replay(id);
    mini.replay(id);
  });
  api.onKnock(({ counts, reset }) => {
    if (!data) return;
    data.counts = counts;
    renderCounts();
    if (isWood() && !reset) {
      bull.replay("muyu");
      mini.replay("muyu");
      if (settings().muyuEffects && settings().motion && kind === "pet") {
        const layer = $("overlay-feedback");
        if (layer.children.length >= 6) layer.firstChild.remove();
        const pulse = element("span", "\u725B\u6C14\uFF0B1 \u{1F4C8}", "wood-pulse");
        layer.append(pulse);
        setTimeout(() => pulse.remove(), 760);
      }
    }
  });
  $("open-dashboard").onclick = $("edit-position").onclick = () => api.window("dashboard");
  $("close-overlay").onclick = () => api.window("close");
  $("collapse-overlay").onclick = () => api.window("collapse");
  $("compact-island").onclick = () => {
    if (isWood()) interact();
    else {
      api.window("collapse");
    }
  };
  $("compact-island").ondblclick = () => {
    if (isWood()) api.window("collapse");
  };
  $("previous-stock").onclick = () => {
    switchStock(-1);
    autoCollapse();
  };
  $("next-stock").onclick = () => {
    switchStock(1);
    autoCollapse();
  };
  shell.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (Date.now() - wheelAt < 350) return;
    wheelAt = Date.now();
    switchStock(event.deltaY > 0 ? 1 : -1);
    autoCollapse();
  }, { passive: false });
  function beginPointer(event) {
    if (event.button !== 0) return;
    pointer = event.pointerId;
    pointerStart = { x: event.screenX, y: event.screenY };
    dragged = false;
    event.currentTarget.setPointerCapture(pointer);
  }
  function movePointer(event) {
    if (pointer !== event.pointerId || kind !== "pet" && event.currentTarget.id !== "drag-handle") return;
    if (!dragged && Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) > 4) {
      dragged = true;
      api.beginDrag(pointerStart);
    }
  }
  function endPointer(event) {
    if (pointer !== event.pointerId) return;
    pointer = null;
    api.endDrag();
    if (!dragged && event.currentTarget.id === "overlay-pet") interact();
  }
  for (const target of [$("drag-handle"), $("overlay-pet")]) {
    target.onpointerdown = beginPointer;
    target.onpointermove = movePointer;
    target.onpointerup = endPointer;
    target.onpointercancel = () => {
      pointer = null;
      api.endDrag();
    };
    target.onlostpointercapture = () => {
      if (pointer !== null) {
        pointer = null;
        api.endDrag();
      }
    };
  }
  $("overlay-pet").addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.key === "Enter") {
      event.preventDefault();
      interact();
    }
  });
  for (const button of document.querySelectorAll("[data-scene]")) button.onclick = () => {
    manualSceneUntil = Date.now() + 36e5;
    api.settings({ scene: Number(button.dataset.scene) });
  };
  $("calm-start").onclick = () => {
    calmEnd = Date.now() + 2e4;
    $("calm-time").textContent = "20 \u79D2";
    $("calm-start").textContent = "\u91CD\u65B0\u8BA1\u65F6";
  };
  document.addEventListener("visibilitychange", syncMotion);
  api.bootstrap().then((next) => {
    data = next;
    render();
    setInterval(updateMood, 1e3);
    window.__NIULAI_RENDERER_READY__ = true;
  });
})();
