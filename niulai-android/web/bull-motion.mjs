import { FramePlayer, animation } from './frame-player.mjs';
import catalog from './motion-catalog.json' with { type: 'json' };
export { catalog };

const sheets = new Map();
function loadSheet(name, assetBase) {
  const key = assetBase + name;
  if (sheets.has(key)) {
    const promise = sheets.get(key);
    sheets.delete(key);
    sheets.set(key, promise);
    return promise;
  }
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { sheets.delete(key); reject(new Error('动画加载失败')); };
    image.src = assetBase + animation.sheets[name].file;
  });
  sheets.set(key, promise);
  if (sheets.size > 4) sheets.delete(sheets.keys().next().value);
  return promise;
}

export class BullMotion {
  constructor(canvas, fallback, { assetBase = 'assets/frames/' } = {}) {
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
    this.state('idle');
  }

  async select(id, replay) {
    if (!animation.clips[id]) id = 'loading';
    const name = animation.clips[id].sheet;
    const request = ++this.requested;
    try {
      const image = this.sheetName === name ? this.sheet : await loadSheet(name, this.assetBase);
      if (request !== this.requested) return;
      this.sheet = image;
      this.sheetName = name;
      this.player.state(id, performance.now(), replay);
      this.wake();
    } catch (error) { console.error(error); }
  }

  state(id) { if (this.target === id) return; this.target = id; this.select(id, false); }
  replay(id) { this.target = id; this.select(id, true); }

  configure(active, motion) {
    if (this.active === active && this.motion === motion) return;
    this.active = active;
    this.motion = motion;
    this.player.pause(!active || !motion);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (active) this.draw();
  }

  wake() { if (this.active && !this.raf) this.draw(); }

  draw(now = performance.now()) {
    this.raf = 0;
    if (!this.active) return;
    const interval = 1000 / (this.mini ? 30 : 60);
    const elapsed = now - this.last;
    if (this.motion && elapsed < interval - .5) { this.raf = requestAnimationFrame(this.draw); return; }
    this.last = this.motion && elapsed >= interval && elapsed < interval * 3 ? now - elapsed % interval : now;
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const size = this.mini ? Math.min(w * 1.04, h * 1.08) : Math.min(w * .94, h * .96);
    const x = (w - size) / 2, y = h - size - h * .01;
    if (this.sheet) {
      const frame = this.player.frame(now, this.motion);
      const sw = this.sheet.naturalWidth / 6, sh = this.sheet.naturalHeight / 4;
      ctx.drawImage(this.sheet, frame.index % 6 * sw, Math.floor(frame.index / 6) * sh, sw, sh, x, y, size, size);
    } else if (this.fallback) ctx.drawImage(this.fallback, x, y, size, size);
    if (this.motion) this.raf = requestAnimationFrame(this.draw);
  }

  close() { this.active = false; this.requested++; cancelAnimationFrame(this.raf); this.sheet = null; }
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
