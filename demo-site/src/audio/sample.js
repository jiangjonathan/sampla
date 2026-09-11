import { peaksFromBuffer } from "./wav.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBuffer(ctx, seconds = 1) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function scheduleKick(ctx, dest, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.09);
  gain.gain.setValueAtTime(0.85, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.22);
}

function scheduleNoiseHit(ctx, dest, noise, time, { duration, gain, hp }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + duration);
  src.connect(filter).connect(g).connect(dest);
  src.start(time);
  src.stop(time + duration + 0.02);
}

function scheduleTone(ctx, dest, time, { freq, duration, type, gain, attack = 0.01 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

/**
 * Original 8-bar-ish loop at 120 BPM. Not a cover of anything —
 * a dry kick/hat grid, a minor-pentatonic bass, and a sparse lead.
 */
export async function createSample({ duration = 8, sampleRate = 44100, seed = 1 } = {}) {
  const ctx = new OfflineAudioContext(1, Math.floor(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  master.connect(compressor).connect(ctx.destination);

  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuffer(ctx, duration);
  hiss.loop = true;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.018;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = "highpass";
  hissFilter.frequency.value = 1800;
  hiss.connect(hissFilter).connect(hissGain).connect(master);
  hiss.start(0);

  const noise = noiseBuffer(ctx, 0.4);
  const bpm = 120;
  const beat = 60 / bpm;
  const bass = [65.41, 65.41, 77.78, 87.31, 98.0, 87.31, 77.78, 65.41];
  const lead = [261.63, 311.13, 349.23, 392.0, 466.16, 392.0, 349.23, 311.13];
  const rand = mulberry32(seed);

  for (let step = 0; step < 16; step += 1) {
    const t = step * beat;
    if (t >= duration) break;
    scheduleKick(ctx, master, t);
    if (step % 2 === 1) {
      scheduleNoiseHit(ctx, master, noise, t, { duration: 0.12, gain: 0.22, hp: 900 });
    }
    scheduleNoiseHit(ctx, master, noise, t, { duration: 0.045, gain: 0.08 + rand() * 0.04, hp: 6000 });
    scheduleTone(ctx, master, t, {
      freq: bass[step % bass.length],
      duration: beat * 0.9,
      type: "triangle",
      gain: 0.22,
      attack: 0.02,
    });
    if (step % 2 === 0) {
      scheduleTone(ctx, master, t + beat * 0.5, {
        freq: lead[(step + Math.floor(rand() * 3)) % lead.length],
        duration: beat * 0.35,
        type: "sine",
        gain: 0.11,
        attack: 0.005,
      });
    }
  }

  const buffer = await ctx.startRendering();
  return { buffer, peaks: peaksFromBuffer(buffer), duration: buffer.duration };
}

export function createLiveGraph(ctx) {
  const gain = ctx.createGain();
  gain.gain.value = 0.0;

  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  oscA.type = "sawtooth";
  oscB.type = "square";
  lfo.type = "sine";
  oscA.frequency.value = 110;
  oscB.frequency.value = 165;
  lfo.frequency.value = 2;
  lfoGain.gain.value = 12;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  lfo.connect(lfoGain).connect(filter.frequency);
  oscA.connect(filter);
  oscB.connect(filter);
  const pulse = ctx.createGain();
  pulse.gain.value = 0.18;
  filter.connect(pulse).connect(gain);

  oscA.start();
  oscB.start();
  lfo.start();

  return {
    output: gain,
    start(time = ctx.currentTime) {
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.35, time + 0.04);
    },
    stop(time = ctx.currentTime) {
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    },
    dispose() {
      try {
        oscA.stop();
        oscB.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
      oscA.disconnect();
      oscB.disconnect();
      lfo.disconnect();
      filter.disconnect();
      pulse.disconnect();
      gain.disconnect();
    },
  };
}
