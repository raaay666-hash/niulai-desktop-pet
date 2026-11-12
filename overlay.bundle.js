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

  // main-modules/quote-parsers.js
  var require_quote_parsers = __commonJS({
    "main-modules/quote-parsers.js"(exports, module) {
      var {
        MARKET,
        marketForSymbol: marketForSymbol2,
        quoteProviderSymbol: quoteProviderSymbol2
      } = require_market_symbols();
      function parseSinaQuote2(text, symbol) {
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
        return {
          code: symbol,
          name: parts[layout.name] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ""),
          price,
          change,
          prevClose: Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
          changePct,
          volume: parts[layout.volume] || "",
          amount: parts[layout.amount] || "",
          time: [parts[layout.date], parts[layout.time]].filter(Boolean).join(" "),
          market
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
        return {
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
  function loadSheet(name, assetBase) {
    const key = assetBase + name;
    if (sheets.has(key)) {
      const promise2 = sheets.get(key);
      sheets.delete(key);
      sheets.set(key, promise2);
      return promise2;
    }
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        sheets.delete(key);
        reject(new Error("\u52A8\u753B\u52A0\u8F7D\u5931\u8D25"));
      };
      image.src = assetBase + bull_frames_default.sheets[name].file;
    });
    sheets.set(key, promise);
    if (sheets.size > 4) sheets.delete(sheets.keys().next().value);
    return promise;
  }
  var BullMotion = class {
    constructor(canvas, fallback, { assetBase = "assets/frames/" } = {}) {
      this.canvas = canvas;
      this.fallback = fallback;
      this.assetBase = assetBase;
      this.player = new FramePlayer();
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
    async select(id, replay) {
      if (!bull_frames_default.clips[id]) id = "loading";
      const name = bull_frames_default.clips[id].sheet;
      const request = ++this.requested;
      try {
        const image = this.sheetName === name ? this.sheet : await loadSheet(name, this.assetBase);
        if (request !== this.requested) return;
        this.sheet = image;
        this.sheetName = name;
        this.player.state(id, performance.now(), replay);
        this.wake();
      } catch (error) {
        console.error(error);
      }
    }
    state(id) {
      if (this.target === id) return;
      this.target = id;
      this.select(id, false);
    }
    replay(id) {
      this.target = id;
      this.select(id, true);
    }
    configure(active, motion) {
      if (this.active === active && this.motion === motion) return;
      this.active = active;
      this.motion = motion;
      this.player.pause(!active || !motion);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (active) this.draw();
    }
    wake() {
      if (this.active && !this.raf) this.draw();
    }
    draw(now = performance.now()) {
      this.raf = 0;
      if (!this.active) return;
      const interval = 1e3 / (this.mini ? 30 : 60);
      const elapsed = now - this.last;
      if (this.motion && elapsed < interval - 0.5) {
        this.raf = requestAnimationFrame(this.draw);
        return;
      }
      this.last = this.motion && elapsed >= interval && elapsed < interval * 3 ? now - elapsed % interval : now;
      const ctx = this.canvas.getContext("2d");
      const w = this.canvas.width, h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      const size = this.mini ? Math.min(w * 1.04, h * 1.08) : Math.min(w * 0.94, h * 0.96);
      const x = (w - size) / 2, y = h - size - h * 0.01;
      if (this.sheet) {
        const frame = this.player.frame(now, this.motion);
        const sw = this.sheet.naturalWidth / 6, sh = this.sheet.naturalHeight / 4;
        ctx.drawImage(this.sheet, frame.index % 6 * sw, Math.floor(frame.index / 6) * sh, sw, sh, x, y, size, size);
      } else if (this.fallback) ctx.drawImage(this.fallback, x, y, size, size);
      if (this.motion) this.raf = requestAnimationFrame(this.draw);
    }
    close() {
      this.active = false;
      this.requested++;
      cancelAnimationFrame(this.raf);
      this.sheet = null;
    }
  };

  // renderer-modules/desktop-crying-motion.js
  var DesktopBullMotion = class extends BullMotion {
    state(id) {
      this.desktopMood = id;
      super.state(id === "slump" ? "cover" : id);
    }
    replay(id) {
      this.desktopMood = id;
      super.replay(id === "slump" ? "cover" : id);
    }
    draw(now = performance.now()) {
      const previousFrame = this.last;
      super.draw(now);
      if (this.motion && this.last === previousFrame) return;
      if (!this.active || !this.sheet || !["cover", "slump"].includes(this.desktopMood)) return;
      const context = this.canvas.getContext("2d");
      const width = this.canvas.width, height = this.canvas.height;
      const size = this.mini ? Math.min(width * 1.04, height * 1.08) : Math.min(width * 0.94, height * 0.96);
      const left = (width - size) / 2, top = height - size - height * 0.01;
      context.save();
      for (const [index, x] of [0.38, 0.63].entries()) {
        const phase = this.motion ? (now / 1e3 + index * 0.4) % 1 : 0.3;
        const y = top + size * (0.4 + phase * 0.15);
        const radius = size * 0.013;
        context.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
        context.fillStyle = "#79c7ed";
        context.beginPath();
        context.moveTo(left + size * x, y - radius * 1.8);
        context.bezierCurveTo(left + size * x + radius * 2, y, left + size * x + radius, y + radius * 1.5, left + size * x, y + radius * 1.5);
        context.bezierCurveTo(left + size * x - radius, y + radius * 1.5, left + size * x - radius * 2, y, left + size * x, y - radius * 1.8);
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
    return {
      today: (quote.price - quote.prevClose) * stock.shares,
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
  var catalog = motion_catalog_default.map((spec) => ["cover", "slump"].includes(spec.id) ? { ...spec, action: "\u6342\u773C\u54ED\u6CE3" } : spec);
  var $ = (id) => document.getElementById(id);
  var api = window.desktopPet;
  var fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "\u2014";
  var signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${fmt(Math.abs(value), digits)}` : "\u2014";
  var tone = (value) => value > 0 ? "rise" : value < 0 ? "fall" : "neutral";
  var time = (value) => value ? new Date(value).toLocaleTimeString("zh-CN", { hour12: false }) : "\u2014";
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
    const theme = kind === "widget" ? settings().widgetTheme : kind === "island" ? settings().islandTheme : settings().theme;
    const dark = theme === "dark" || theme === "system" && data.dark;
    document.documentElement.classList.toggle("dark", dark);
    shell.classList.toggle("light-island", !dark);
    shell.classList.toggle("collapsed", collapsed);
    shell.classList.toggle("wood-mode", isWood());
    $("overlay-title").textContent = isWood() ? "\u725B\u6765\u6728\u9C7C" : { pet: "\u725B\u6765\u684C\u5BA0", widget: "\u725B\u6765\u5361\u7247", island: "\u725B\u6765\u60AC\u6D6E\u7A97" }[kind];
    const name = quote?.name || stock?.name || displaySymbol(code());
    $("overlay-name").textContent = $("compact-name").textContent = name;
    $("overlay-code").textContent = displaySymbol(code()) + " \xB7 " + currency(code());
    $("overlay-price").textContent = $("compact-price").textContent = fmt(quote?.price, currency(code()) === "HKD" ? 3 : 2);
    $("overlay-percent").textContent = $("compact-percent").textContent = quote ? signed(quote.changePct) + "%" : "\u2014";
    $("overlay-numbers").className = $("compact-percent").className = tone(quote?.changePct);
    if (kind === "island" && !isWood()) {
      $("compact-price").hidden = !settings().islandPrice;
      $("compact-percent").hidden = !settings().islandPercent;
    } else {
      $("compact-price").hidden = $("compact-percent").hidden = false;
    }
    const delayed = entry()?.error || entry()?.received && Date.now() - entry().received > Math.max(45e3, settings().interval * 2500);
    $("overlay-status").textContent = quote ? `${delayed ? "\u66F4\u65B0\u5EF6\u8FDF \xB7 " : ""}\u83B7\u53D6\u4E8E ${time(entry().received)}` : entry()?.error || "\u6B63\u5728\u8FDE\u63A5\u884C\u60C5\u2026";
    shell.title = quote?.time ? "\u6E90\u65F6\u95F4 " + quote.time : "\u6E90\u672A\u63D0\u4F9B\u65F6\u95F4\uFF0C\u83B7\u53D6\u65F6\u95F4\u4E0D\u4EE3\u8868\u6210\u4EA4\u65F6\u95F4";
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
    $("island-position").textContent = settings().islandHoldings && !isWood() ? holdingText : isWood() ? "\u4ECA\u65E5 " + data.counts.today + " \xB7 \u7D2F\u8BA1 " + data.counts.total : marketSession(code());
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
    const base = isWood() ? "muyu" : settings().autoActions ? moods.update(record?.quote ? { ...record.quote, received: record.received } : null, record?.error, Date.now(), settings().interval, code()) : "idle";
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
    bull.replay(mood);
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
