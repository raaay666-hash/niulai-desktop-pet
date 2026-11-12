export class MamaVoice {
  constructor() {
    this.audio = new Audio('assets/audio/mama.mp3');
    this.epoch = 0;
  }
  async play(volume) {
    this.stop();
    const epoch = this.epoch;
    const target = Math.max(0, Math.min(1, volume)) * .2;
    this.audio.volume = 0;
    await this.audio.play();
    const started = performance.now();
    const fade = now => {
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
}
