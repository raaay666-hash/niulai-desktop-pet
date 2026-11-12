import { BullMotion } from '../niulai-android/web/bull-motion.mjs';

export class DesktopBullMotion extends BullMotion {
  state(id) {
    this.desktopMood = id;
    super.state(id === 'slump' ? 'cover' : id);
  }
  replay(id) {
    this.desktopMood = id;
    super.replay(id === 'slump' ? 'cover' : id);
  }
  draw(now = performance.now()) {
    const previousFrame = this.last;
    super.draw(now);
    if (this.motion && this.last === previousFrame) return;
    if (!this.active || !this.sheet || !['cover', 'slump'].includes(this.desktopMood)) return;
    const context = this.canvas.getContext('2d');
    const width = this.canvas.width, height = this.canvas.height;
    const size = this.mini ? Math.min(width * 1.04, height * 1.08) : Math.min(width * .94, height * .96);
    const left = (width - size) / 2, top = height - size - height * .01;
    context.save();
    for (const [index, x] of [.38, .63].entries()) {
      const phase = this.motion ? (now / 1000 + index * .4) % 1 : .3;
      const y = top + size * (.40 + phase * .15);
      const radius = size * .013;
      context.globalAlpha = Math.sin(phase * Math.PI) * .8;
      context.fillStyle = '#79c7ed';
      context.beginPath();
      context.moveTo(left + size * x, y - radius * 1.8);
      context.bezierCurveTo(left + size * x + radius * 2, y, left + size * x + radius, y + radius * 1.5, left + size * x, y + radius * 1.5);
      context.bezierCurveTo(left + size * x - radius, y + radius * 1.5, left + size * x - radius * 2, y, left + size * x, y - radius * 1.8);
      context.fill();
    }
    context.restore();
  }
}
