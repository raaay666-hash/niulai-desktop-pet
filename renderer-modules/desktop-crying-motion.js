import { BullMotion } from '../niulai-android/web/bull-motion.mjs';
import { DesktopFramePlayer } from './desktop-frame-player.js';
import { prepareDesktopSheet } from './desktop-frame-colors.js';
import { loadFirstHQPage, resolveHQDrawing } from './desktop-hq-frames.js';

export class DesktopBullMotion extends BullMotion {
  constructor(canvas, fallback, options = {}) {
    super(canvas, fallback, { ...options, player: new DesktopFramePlayer(), fps: 60, miniFps: 30, transitionMs: 0, breathing: false, prepareSheet: prepareDesktopSheet, highQuality: options.highQuality !== false });
    this.resizeBacking = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.min(1024, Math.max(1, Math.round(rect.width * ratio)));
      const height = Math.min(1024, Math.max(1, Math.round(rect.height * ratio)));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height; this.renderKey = null; this.wake();
      }
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.resizeBacking);
      this.resizeObserver.observe(canvas);
    }
    this.resizeBacking();
    window.addEventListener('resize', this.resizeBacking);
  }
  async loadMotionSheet(name) {
    if (this.highQuality) {
      try {
        const first = loadFirstHQPage(name, this.assetBase);
        if (first) return await first;
      } catch { /* Fall back to the corrected original clip when unavailable. */ }
    }
    return super.loadMotionSheet(name);
  }
  getDrawing(frame) {
    return this.highQuality && resolveHQDrawing(this, frame) || super.getDrawing(frame);
  }
  close() {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeBacking);
    this.lastHQDrawing = null;
    super.close();
  }
  state(id) {
    this.desktopMood = id;
    return super.state(id === 'slump' ? 'cover' : id);
  }
  replay(id, options) {
    this.desktopMood = id;
    return super.replay(id === 'slump' ? 'cover' : id, options);
  }
  interact(id) { return this.replay(id, { finishCurrent: true }); }
  hasContinuousEffects() { return this.motion && this.player.id === 'cover'; }
  drawEffects(context, { frame, clock, x: left, y: top, width, height }) {
    if (!this.hasContinuousEffects()) return;
    const onset = Math.min(1, Math.max(0, (frame.elapsed - 280) / 180));
    const release = Math.min(1, Math.max(0, (1400 - frame.elapsed) / 200));
    context.save();
    for (const [index, x] of [.38, .63].entries()) {
      const phase = ((clock - this.player.started) / 1000 + index * .4) % 1;
      const y = top + height * (.40 + phase * .15);
      const radius = width * .013;
      context.globalAlpha = Math.sin(phase * Math.PI) * .8 * onset * release;
      context.fillStyle = '#79c7ed';
      context.beginPath();
      context.moveTo(left + width * x, y - radius * 1.8);
      context.bezierCurveTo(left + width * x + radius * 2, y, left + width * x + radius, y + radius * 1.5, left + width * x, y + radius * 1.5);
      context.bezierCurveTo(left + width * x - radius, y + radius * 1.5, left + width * x - radius * 2, y, left + width * x, y - radius * 1.8);
      context.fill();
    }
    context.restore();
  }
}
