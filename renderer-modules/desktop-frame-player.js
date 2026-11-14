import { FramePlayer, animation } from '../niulai-android/web/frame-player.mjs';

// Desktop interactions may repeat while a hoof is still raised. Keep at most
// one follow-up gesture; explicit gallery previews can still restart a clip.
export class DesktopFramePlayer extends FramePlayer {
  state(id, now = performance.now(), replay = false, { finishCurrent = false } = {}) {
    if (!animation.clips[id]) id = 'loading';
    const clock = this.pausedAt ?? now;
    if (!replay && id !== 'muyu' && animation.clips[id].sheet === animation.clips[this.id].sheet) {
      if (id !== this.id) this.pendingGesture = null;
      this.id = id;
      return;
    }
    if (finishCurrent && replay && id === this.id && id !== 'muyu') {
      const duration = animation.sheets[animation.clips[id].sheet].duration;
      const elapsed = clock - this.started;
      const cycle = duration + animation.clips[id].rest;
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
      // A suspended renderer must not play stale interactions on its return.
      if (clock - pending.at < 250) super.state(pending.id, pending.at, true);
    }
    return super.frame(now, moving);
  }

  pause(value, now = performance.now()) {
    if (value) this.pendingGesture = null;
    super.pause(value, now);
  }
}
