import animation from './bull-frames.json' with { type: 'json' };
export { animation };

export class FramePlayer {
  constructor() {
    this.id = 'idle';
    this.started = 0;
    this.knocking = false;
    this.queuedKnock = false;
    this.pausedAt = null;
    this.strokeDuration = 400;
    this.lastKnock = -Infinity;
  }

  state(id, now = performance.now(), replay = false) {
    if (!animation.clips[id]) id = 'loading';
    if (id === this.id && !replay) return;
    if (id === 'muyu' && this.id === id && replay && this.knocking && now - this.started < this.strokeDuration) {
      this.queuedKnock = true;
      this.lastKnock = now;
      return;
    }
    this.id = id;
    this.started = this.pausedAt ?? now;
    this.knocking = id === 'muyu' && replay;
    if (this.knocking) { this.lastKnock = now; this.strokeDuration = 400; }
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
    const clip = animation.clips[this.id];
    const sheet = animation.sheets[clip.sheet];
    let duration = this.id === 'muyu' ? this.strokeDuration : sheet.duration;
    let elapsed = Math.max(0, (this.pausedAt ?? now) - this.started);
    if (!moving || this.id === 'muyu' && !this.knocking) return { sheet: clip.sheet, index: 0, elapsed: 0 };
    if (this.id === 'muyu' && elapsed >= duration) {
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
    const time = elapsed % (duration + clip.rest);
    const index = time >= duration ? 23 : Math.min(23, Math.floor(time * 24 / duration));
    return { sheet: clip.sheet, index, elapsed: time };
  }
}
