import assert from "node:assert/strict";
import test from "node:test";

await import("../src/audio/audio-buffer-ops.js");
await import("../src/audio/beat-detector.js");

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

test("findPrevBeat and findNextBeat navigate through beat arrays", () => {
  const beats = [0, 500, 1000, 1500, 2000, 2500];

  assert.equal(BeatDetector.findPrevBeat(1200, beats), 1000);
  assert.equal(BeatDetector.findPrevBeat(1000, beats), 500);
  assert.equal(BeatDetector.findPrevBeat(100, beats), 0);
  assert.equal(BeatDetector.findPrevBeat(0, beats), 0);

  assert.equal(BeatDetector.findNextBeat(700, beats), 1000);
  assert.equal(BeatDetector.findNextBeat(1000, beats), 1500);
  assert.equal(BeatDetector.findNextBeat(2400, beats), 2500);
  assert.equal(BeatDetector.findNextBeat(2500, beats), 2500);
});

test("formatMusicalLength returns concise bar and beat labels", () => {
  const beatIntervalMs = 500; // 120 BPM: 1 beat = 500ms, 1 bar = 2000ms

  assert.equal(BeatDetector.formatMusicalLength(2000, beatIntervalMs), "1 BAR");
  assert.equal(BeatDetector.formatMusicalLength(4000, beatIntervalMs), "2 BARS");
  assert.equal(BeatDetector.formatMusicalLength(8000, beatIntervalMs), "4 BARS");
  assert.equal(BeatDetector.formatMusicalLength(2500, beatIntervalMs), "1 BAR 1b");
  assert.equal(BeatDetector.formatMusicalLength(1000, beatIntervalMs), "2 BEATS");
  assert.equal(BeatDetector.formatMusicalLength(0, beatIntervalMs), "");
});

test("autoDetectLoop cycles through candidate bars when requested", () => {
  const beatData = {
    bpm: 120,
    beatIntervalMs: 500,
    barIntervalMs: 2000,
    bars: [0, 2000, 4000, 6000, 8000],
    beats: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000],
  };

  const cand0 = BeatDetector.autoDetectLoop(beatData, 10000, 2, 0);
  assert.equal(cand0.start, 0);
  assert.equal(cand0.end, 4000);

  const cand1 = BeatDetector.autoDetectLoop(beatData, 10000, 2, 1);
  assert.equal(cand1.start, 2000);
  assert.equal(cand1.end, 6000);

  const cand2 = BeatDetector.autoDetectLoop(beatData, 10000, 2, 2);
  assert.equal(cand2.start, 4000);
  assert.equal(cand2.end, 8000);
});

test("detectBeats populates transients array for rhythmic attacks", () => {
  const buffer = createPulseBuffer(120, 3, 44100);
  const result = BeatDetector.detectBeats(buffer);
  assert.ok(Array.isArray(result.transients), "Result should contain transients array");
  assert.ok(result.transients.length > 0, "Should detect transient onset peaks in pulse buffer");
});
