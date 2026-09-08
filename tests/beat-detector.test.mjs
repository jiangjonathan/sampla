import assert from "node:assert/strict";
import test from "node:test";

await import("../audio-buffer-ops.js");
await import("../beat-detector.js");

const BeatDetector = globalThis.SamplaBeatDetector;
const BufferOps = globalThis.SamplaBufferOps;

function createPulseBuffer(bpm, durationSec = 4, sampleRate = 44100) {
  const numSamples = Math.round(durationSec * sampleRate);
  const buffer = BufferOps.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);
  const intervalSamples = Math.round((60 / bpm) * sampleRate);

  // Generate percussive pulses with low-frequency thump and attack
  for (let start = 0; start < numSamples; start += intervalSamples) {
    const pulseLen = Math.min(numSamples - start, Math.round(0.04 * sampleRate)); // 40ms pulse
    for (let i = 0; i < pulseLen; i += 1) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 80);
      // 80 Hz kick tone + fast click
      const sig = Math.sin(2 * Math.PI * 80 * t) * decay + (i < 20 ? 0.8 : 0);
      data[start + i] = sig;
    }
  }

  return buffer;
}

test("detectBeats handles empty and silent buffers gracefully", () => {
  const resultNull = BeatDetector.detectBeats(null);
  assert.equal(resultNull.bpm, BeatDetector.DEFAULT_BPM);
  assert.equal(resultNull.confidence, 0);

  const silentBuffer = BufferOps.createBuffer(1, 44100, 44100);
  const resultSilent = BeatDetector.detectBeats(silentBuffer);
  assert.ok(resultSilent.bpm >= BeatDetector.MIN_BPM && resultSilent.bpm <= BeatDetector.MAX_BPM);
});

test("detectBeats accurately estimates 120 BPM pulse", () => {
  const buffer = createPulseBuffer(120, 5, 44100);
  const result = BeatDetector.detectBeats(buffer);

  assert.ok(
    Math.abs(result.bpm - 120) <= 2.5,
    `Detected BPM ${result.bpm} should be close to 120`
  );
  assert.ok(result.beats.length >= 8, "Should find at least 8 beats in 5s at 120 BPM");
  assert.ok(result.bars.length >= 2, "Should find bar markers in 5s at 120 BPM");
});

test("detectBeats accurately estimates 90 BPM pulse", () => {
  const buffer = createPulseBuffer(90, 6, 44100);
  const result = BeatDetector.detectBeats(buffer);

  assert.ok(
    Math.abs(result.bpm - 90) <= 2.5,
    `Detected BPM ${result.bpm} should be close to 90`
  );
});

test("snapToBeat snaps within threshold and flags bar starts", () => {
  const beats = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];

  const snappedNear = BeatDetector.snapToBeat(520, beats, 100);
  assert.equal(snappedNear.timeMs, 500);
  assert.equal(snappedNear.beatIndex, 1);
  assert.equal(snappedNear.isBarStart, false);

  const snappedBar = BeatDetector.snapToBeat(1980, beats, 100);
  assert.equal(snappedBar.timeMs, 2000);
  assert.equal(snappedBar.beatIndex, 4);
  assert.equal(snappedBar.isBarStart, true);

  const missed = BeatDetector.snapToBeat(750, beats, 100);
  assert.equal(missed.timeMs, 750);
  assert.equal(missed.beatIndex, -1);
});

test("getBarLoop computes accurate 1-bar and 2-bar loop boundaries", () => {
  const beatData = {
    bpm: 120,
    beatIntervalMs: 500,
    barIntervalMs: 2000,
    bars: [0, 2000, 4000, 6000],
    beats: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  };

  const oneBar = BeatDetector.getBarLoop(0, 1, beatData, 6000);
  assert.equal(oneBar.start, 0);
  assert.equal(oneBar.end, 2000);
  assert.equal(oneBar.durationMs, 2000);

  const twoBars = BeatDetector.getBarLoop(50, 2, beatData, 6000);
  assert.equal(twoBars.start, 0);
  assert.equal(twoBars.end, 4000);
  assert.equal(twoBars.durationMs, 4000);

  // Exceeding track length shifts to fit within total duration
  const clamped = BeatDetector.getBarLoop(5000, 2, beatData, 6000);
  assert.ok(clamped.end <= 6000);
  assert.equal(clamped.durationMs, 4000);
});

test("snapToZeroCrossing aligns to clean positive slope", () => {
  const sampleRate = 1000; // 1 sample = 1 ms
  const buffer = BufferOps.createBuffer(1, 100, sampleRate);
  const data = buffer.getChannelData(0);

  // Create sine wave: zero crossings at 0, 10, 20, 30...
  for (let i = 0; i < 100; i += 1) {
    data[i] = Math.sin((2 * Math.PI * i) / 20);
  }

  // Sample index 22 is slightly past 20. Target 22ms:
  const snapped = BeatDetector.snapToZeroCrossing(buffer, 22, 10);
  assert.equal(Math.round(snapped), 20);
});
