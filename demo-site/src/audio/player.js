export class TapePlayer {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.buffer = null;
    this.source = null;
    this.playing = false;
    this.loop = false;
    this.speed = 1;
    this.range = { start: 0, end: 0 };
    this.offset = 0;
    this.originOffset = 0;
    this.startedAt = 0;
    this.onEnded = null;
  }

  async init() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
    return this.ctx;
  }

  async resume() {
    await this.init();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  setBuffer(buffer) {
    this.stop();
    this.buffer = buffer;
    this.range = { start: 0, end: buffer.duration };
    this.offset = 0;
  }

  setRange(start, end) {
    const dur = this.buffer?.duration || 0;
    const a = Math.max(0, Math.min(dur, start));
    const b = Math.max(a + 0.04, Math.min(dur, end));
    this.range = { start: a, end: b };
    if (this.source && this.loop) {
      this.source.loopStart = a;
      this.source.loopEnd = b;
    }
    if (this.offset < a || this.offset > b) this.seek(a);
  }

  setLoop(on) {
    const next = Boolean(on);
    if (next === this.loop) return;
    const pos = this.getPosition();
    this.loop = next;
    if (this.playing) this.play(pos);
  }

  setSpeed(speed) {
    const pos = this.getPosition();
    this.speed = Math.max(0.05, Math.min(8, Number(speed) || 1));
    this.offset = pos;
    this.originOffset = pos;
    this.startedAt = this.ctx?.currentTime || 0;
    if (this.source) this.source.playbackRate.value = this.speed;
  }

  duration() {
    return this.buffer?.duration || 0;
  }

  getPosition() {
    if (!this.playing || !this.ctx) return this.offset;
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.speed;
    let pos = this.originOffset + elapsed;
    const { start, end } = this.range;
    if (this.loop) {
      const span = Math.max(0.04, end - start);
      pos = start + ((pos - start) % span);
      if (pos < start) pos += span;
    } else if (pos >= end) {
      return end;
    }
    return pos;
  }

  stopSource() {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }

  stop() {
    if (this.playing) this.offset = this.getPosition();
    this.stopSource();
    this.playing = false;
  }

  seek(seconds) {
    const { start, end } = this.range;
    const next = Math.max(start, Math.min(end, seconds));
    this.offset = next;
    if (this.playing) this.play(next);
  }

  async play(from = this.getPosition()) {
    if (!this.buffer) return;
    await this.resume();
    this.stopSource();
    const { start, end } = this.range;
    const offset = Math.max(start, Math.min(from, end - 0.005));
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.speed;
    src.loop = this.loop;
    if (this.loop) {
      src.loopStart = start;
      src.loopEnd = end;
    }
    src.connect(this.gain);
    const remaining = this.loop ? 0 : Math.max(0.01, (end - offset) / this.speed);
    src.start(0, offset);
    this.source = src;
    this.playing = true;
    this.originOffset = offset;
    this.startedAt = this.ctx.currentTime;
    src.onended = () => {
      if (this.source !== src) return;
      this.playing = false;
      this.offset = this.loop ? start : end;
      this.source = null;
      this.onEnded?.();
    };
    if (!this.loop) {
      src.stop(this.ctx.currentTime + remaining);
    }
  }
}
