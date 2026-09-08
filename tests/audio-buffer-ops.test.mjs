import assert from "node:assert/strict";
import test from "node:test";

await import("../audio-buffer-ops.js");
const {
  createBuffer,
  invertBuffer,
  copyBufferRange,
  copyEditedBuffer,
  normalizationAmount,
  resampleBufferSpeed,
  parsePlaybackSpeed,
  formatPlaybackSpeed,
  peaksFromBuffer,
  peakInRange,
  quietEdgeBounds,
  addGainMark,
  gainAcrossSelection,
  markEditedRange,
  remapMarksForReplacement,
  remapCropBounds,
} = globalThis.SamplaBufferOps;

test("parsePlaybackSpeed parses decimal and format string accurately", () => {
  assert.equal(parsePlaybackSpeed("1"), 1);
  assert.equal(parsePlaybackSpeed("1.5x"), 1.5);
  assert.equal(parsePlaybackSpeed("0.75"), 0.75);
  assert.equal(parsePlaybackSpeed("2X"), 2);
  assert.equal(parsePlaybackSpeed("0"), null);
  assert.equal(parsePlaybackSpeed("-1"), null);
  assert.equal(parsePlaybackSpeed("abc"), null);
  assert.equal(formatPlaybackSpeed(1.5), "1.5x");
  assert.equal(formatPlaybackSpeed(0.666666), "0.667x");
});

test("AudioBuffer operations (create, invert, copy, edit)", () => {
  const buf = createBuffer(1, 10, 1000);
  const data = buf.getChannelData(0);
  for (let i = 0; i < 10; i += 1) data[i] = i;

  const inverted = invertBuffer(buf);
  assert.equal(inverted.getChannelData(0)[0], 9);
  assert.equal(inverted.getChannelData(0)[9], 0);

  const sliced = copyBufferRange(buf, 2, 5);
  assert.equal(sliced.length, 3);
  assert.equal(sliced.getChannelData(0)[0], 2);
  assert.equal(sliced.getChannelData(0)[2], 4);

  const gained = copyEditedBuffer(buf, 2, 5, "gain", 2);
  assert.equal(gained.getChannelData(0)[2], 4);
  assert.equal(gained.getChannelData(0)[1], 1);
});

test("resampleBufferSpeed changes length inversely with speed", () => {
  const buf = createBuffer(1, 100, 1000);
  buf.getChannelData(0).fill(0.5);

  const doubleSpeed = resampleBufferSpeed(buf, 2);
  assert.equal(doubleSpeed.length, 50);

  const halfSpeed = resampleBufferSpeed(buf, 0.5);
  assert.equal(halfSpeed.length, 200);
});

test("normalizationAmount calculates headroom to 1.0 (-1 dBFS peak)", () => {
  const buf = createBuffer(1, 10, 1000);
  buf.getChannelData(0)[5] = 0.5;
  const amount = normalizationAmount(buf, 0, 10);
  assert.ok(amount > 1.5 && amount < 1.9);
});

test("edit marks calculations and gain aggregation", () => {
  let marks = [];
  marks = addGainMark(marks, 100, 500, 3);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].db, 3);

  const across = gainAcrossSelection(marks, { start: 150, end: 400 });
  assert.equal(across, 3);

  marks = addGainMark(marks, 200, 300, 3);
  const mixed = gainAcrossSelection(marks, { start: 100, end: 500 });
  assert.equal(mixed, "mixed");
});

test("remapCropBounds correctly offsets bounds when audio is removed or inserted", () => {
  const bounds = { start: 1000, end: 4000 };

  const afterCut = remapCropBounds(bounds, 2000, 3000, 0, 10000);
  assert.equal(afterCut.start, 1000);
  assert.equal(afterCut.end, 3000);

  const afterPaste = remapCropBounds(bounds, 500, 500, 500, 10000);
  assert.equal(afterPaste.start, 1500);
  assert.equal(afterPaste.end, 4500);
});

test("cut marks are stored as a single seam point and kept when remapping", () => {
  const marks = markEditedRange([], "cut", 2000, 3000, 0, 9000);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].type, "cut");
  assert.equal(marks[0].start, 2000);
  assert.equal(marks[0].end, 2000);

  const kept = remapMarksForReplacement(marks, 4000, 4500, 200, "paste");
  const cut = kept.find((mark) => mark.type === "cut");
  assert.ok(cut);
  assert.equal(cut.start, 2000);
  assert.equal(cut.end, 2000);
});

test("peakInRange extracts maximum peak and handles boundary floating-point stability", () => {
  const peaks = [0.1, 0.8, 0.3, 0.95, 0.05]; // bins: [0-10], [10-20], [20-30], [30-40], [40-50]

  assert.equal(peakInRange(peaks, 0, 10), 0.1);
  assert.equal(peakInRange(peaks, 10, 20), 0.8);
  assert.equal(peakInRange(peaks, 0, 20), 0.8);
  assert.equal(peakInRange(peaks, 20, 40), 0.95);
  assert.equal(peakInRange(peaks, 0, 0), 0);
  assert.equal(peakInRange(peaks, -10, 0), 0);
  assert.equal(peakInRange(peaks, 50, 100), 0);

  // Boundary floating-point stability around 10ms boundary
  assert.equal(peakInRange(peaks, 10.0000001, 20.0000001), 0.8);
  assert.equal(peakInRange(peaks, 9.9999999, 19.9999999), 0.8);

  // Sub-bin intervals
  assert.equal(peakInRange(peaks, 32, 34), 0.95);
});

