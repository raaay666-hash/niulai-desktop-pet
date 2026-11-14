import { FramePlayer, animation } from './frame-player.mjs';
import catalog from './motion-catalog.json' with { type: 'json' };
export { catalog };

const sheets = new Map();
const preparedCaches = new WeakMap();
function loadSheet(name, assetBase, prepareSheet) {
  let cache = sheets;
  if (prepareSheet) {
    if (!preparedCaches.has(prepareSheet)) preparedCaches.set(prepareSheet, new Map());
    cache = preparedCaches.get(prepareSheet);
  }
  const key = assetBase + name;
  if (cache.has(key)) {
    const promise = cache.get(key);
    cache.delete(key);
    cache.set(key, promise);
    return promise;
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try { resolve(prepareSheet ? await prepareSheet(image, name) : image); }
      catch (error) { cache.delete(key); reject(error); }
    };
    image.onerror = () => { cache.delete(key); reject(new Error('动画加载失败')); };
    image.src = assetBase + animation.sheets[name].file;
  });
  cache.set(key, promise);
  if (cache.size > 4) cache.delete(cache.keys().next().value);
  return promise;
}

export class BullMotion {
  constructor(canvas, fallback, { assetBase = 'assets/frames/', player = new FramePlayer(), fps = 60, miniFps = 30, transitionMs = 0, breathing = false, prepareSheet = null, highQuality = false } = {}) {
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
    this.state('idle');
  }

  async select(id, replay, options) {
    if (!animation.clips[id]) id = 'loading';
    const name = animation.clips[id].sheet;
    const request = ++this.requested;
    try {
      const image = this.sheetName === name ? this.sheet : await this.loadMotionSheet(name);
      if (request !== this.requested) return;
      const now = performance.now();
      if (this.transitionMs && this.sheet && this.sheetName !== name && this.active && this.motion) {
        const snapshot = document.createElement('canvas');
        snapshot.width = this.canvas.width;
        snapshot.height = this.canvas.height;
        snapshot.getContext('2d').drawImage(this.canvas, 0, 0);
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

  state(id) { if (this.target === id) return this.pending; this.target = id; return this.pending = this.select(id, false); }
  replay(id, options) { this.target = id; return this.pending = this.select(id, true, options); }
  loadMotionSheet(name) { return loadSheet(name, this.assetBase, this.prepareSheet); }
  getDrawing(frame) { return { image: this.sheet, index: frame.index, columns: animation.columns, rows: animation.rows, key: frame.index }; }

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
    if (active) { this.last = -Infinity; this.draw(now); }
  }

  wake() { if (this.active && !this.raf) this.draw(); }

  draw(now = performance.now()) {
    this.raf = 0;
    if (!this.active) return;
    const rate = this.player.id === 'muyu' && this.player.knocking ? (this.mini ? 30 : 60) : (this.mini ? this.miniFps : this.fps);
    const interval = 1000 / rate;
    const elapsed = now - this.last;
    if (this.motion && elapsed < interval - .5) { this.raf = requestAnimationFrame(this.draw); return; }
    this.last = this.motion && elapsed >= interval && elapsed < interval * 3 ? now - elapsed % interval : now;
    const w = this.canvas.width, h = this.canvas.height;
    const size = this.mini ? Math.min(w * 1.04, h * 1.08) : Math.min(w * .94, h * .96);
    const frame = this.player.frame(now, this.motion);
    const drawing = this.getDrawing(frame);
    const clock = this.player.pausedAt ?? now;
    const clip = animation.clips[this.player.id];
    const duration = animation.sheets[clip.sheet].duration;
    const smooth = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
    const restWeight = this.player.id === 'idle' ? 1 : smooth((frame.elapsed - duration) / 180) * smooth((duration + clip.rest - frame.elapsed) / 180);
    const breath = this.breathing && this.motion && this.player.id !== 'muyu'
      ? (1 - Math.cos((clock - this.player.started) * Math.PI * 2 / 4200)) * .5 * restWeight : 0;
    const width = size * (1 + breath * .003), height = size * (1 + breath * .008);
    const x = (w - width) / 2, y = h - height - h * .01;
    const blend = this.transition ? smooth((clock - this.transition.started) / this.transitionMs) : 1;
    if (blend >= 1) this.transition = null;
    const continuous = breath > 0 || this.transition || this.hasContinuousEffects();
    const key = [this.sheetName, frame.index, w, h, this.mini, this.motion, continuous ? clock : 0, drawing.key].join(':');
    const ticking = this.motion && (this.player.id !== 'muyu' || this.player.knocking || this.transition);
    if (key === this.renderKey) { if (ticking) this.raf = requestAnimationFrame(this.draw); return; }
    this.renderKey = key;
    const ctx = this.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.highQuality ? 'high' : 'low';
    ctx.clearRect(0, 0, w, h);
    let target = ctx;
    if (this.transition) {
      this.layer ||= document.createElement('canvas');
      if (this.layer.width !== w) this.layer.width = w;
      if (this.layer.height !== h) this.layer.height = h;
      target = this.layer.getContext('2d');
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
      // Add premultiplied layers so the character does not turn translucent
      // halfway through a transition on the transparent desktop window.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = blend;
      ctx.drawImage(this.layer, 0, 0);
      ctx.restore();
    }
    if (ticking) this.raf = requestAnimationFrame(this.draw);
  }

  hasContinuousEffects() { return false; }
  drawEffects() {}

  close() { this.active = false; this.requested++; cancelAnimationFrame(this.raf); this.raf = 0; this.sheet = null; this.transition = null; this.layer = null; }
}

export function cropSprite(canvas) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let left = w, top = h, right = 0, bottom = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[(y * w + x) * 4 + 3] > 20) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const sprite = document.createElement('canvas');
  sprite.width = 420;
  sprite.height = Math.round(420 * (bottom - top + 3) / (right - left + 3));
  sprite.getContext('2d').drawImage(canvas, left, top, right - left + 3, bottom - top + 3, 0, 0, sprite.width, sprite.height);
  return sprite;
}
