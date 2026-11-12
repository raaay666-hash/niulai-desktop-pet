/** A short shared voice with bounded overlap during rapid tapping. */
export class TapVoice {
  constructor(url) {
    this.url = url;
    this.volume = .65;
    this.lastPlayed = -Infinity;
    this.sources = new Set();
  }

  async play() {
    const now = performance.now();
    if (now - this.lastPlayed < 480) return;
    this.lastPlayed = now;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context ??= new AudioContext();
    const context = this.context;
    await context.resume();
    this.loading ??= fetch(this.url).then(response => {
      if (!response.ok) throw new Error('声音加载失败');
      return response.arrayBuffer();
    }).then(buffer => context.decodeAudioData(buffer)).catch(error => { this.loading = null; throw error; });
    const epoch = this.epoch;
    const buffer = await this.loading;
    if (epoch !== this.epoch) return;
    for (const voice of this.sources) voice.gain.gain.setTargetAtTime(this.volume * .4, context.currentTime, .02);
    if (this.sources.size >= 2) this.sources.values().next().value.source.stop();
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.volume;
    source.connect(gain); gain.connect(context.destination);
    const voice = { source, gain };
    this.sources.add(voice);
    source.onended = () => { this.sources.delete(voice); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  stop() {
    this.epoch = (this.epoch || 0) + 1;
    for (const voice of this.sources) { try { voice.source.stop(); } catch { } }
    this.sources.clear();
  }
}
