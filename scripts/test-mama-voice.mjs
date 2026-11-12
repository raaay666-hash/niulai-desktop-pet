import assert from 'node:assert/strict';
let now = 0;
let nextFrame;
globalThis.Audio = class {
  constructor(url) { this.src = url; this.paused = true; this.volume = 1; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
};
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
globalThis.cancelAnimationFrame = () => { nextFrame = undefined; };
const { MamaVoice } = await import('../renderer-modules/mama-voice.js');
const voice = new MamaVoice();
await voice.play(.8);
assert.equal(voice.audio.src, 'assets/audio/mama.mp3');
assert.equal(voice.audio.volume, 0);
now = 150; nextFrame(now);
assert.ok(Math.abs(voice.audio.volume - .08) < 1e-9);
now = 300; nextFrame(now);
assert.ok(Math.abs(voice.audio.volume - .16) < 1e-9);
voice.stop();
assert.equal(voice.audio.paused, true);
assert.equal(voice.audio.currentTime, 0);
assert.equal(nextFrame, undefined);
await voice.play(2);
now += 300; nextFrame(now);
assert.equal(voice.audio.volume, .2);
voice.stop();
console.log('Mama voice uses original audio, starts silently, fades in and caps volume at 20%');
