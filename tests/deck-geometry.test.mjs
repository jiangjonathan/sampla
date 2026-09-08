import assert from "node:assert/strict";
import test from "node:test";

await import("../src/ui/deck-geometry.js");
const {
  formatTime,
  formatTrackDuration,
  formatEditTime,
  packRadius,
  tapeAt,
  circleTangents,
  pointTangents,
  computeTapePath,
} = globalThis.SamplaDeckGeometry;

test("time formatting converts millisecond offsets accurately", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(1250), "01:25");
  assert.equal(formatTime(59990), "59:99");
  assert.equal(formatTime(60000), "01:00");
  assert.equal(formatTime(65000), "01:05");
  assert.equal(formatTime(125000), "02:05");
});

test("formatTrackDuration formats seconds, minutes, and hours", () => {
  assert.equal(formatTrackDuration(0), "00:00");
  assert.equal(formatTrackDuration(45000), "00:45");
  assert.equal(formatTrackDuration(125000), "02:05");
  assert.equal(formatTrackDuration(3665000), "1:01:05");
});

test("formatEditTime displays centisecond resolution", () => {
  assert.equal(formatEditTime(0), "00.00");
  assert.equal(formatEditTime(1540), "01.54");
  assert.equal(formatEditTime(61230), "1:01.23");
});

test("packRadius scales monotonically between min and max radius", () => {
  const min = 24;
  const max = 89;
  assert.equal(packRadius(0, min, max), min);
  assert.equal(packRadius(1, min, max), max);
  const mid = packRadius(0.5, min, max);
  assert.ok(mid > min && mid < max);
});

test("tapeAt clamps and maps progress across capacity", () => {
  const cap = 480000;
  assert.equal(tapeAt(-100, cap, 0.18), 0.18);
  assert.equal(tapeAt(0, cap, 0.18), 0.18);
  assert.equal(tapeAt(cap, cap, 0.18), 1.18);
});

test("circleTangents and pointTangents produce valid tangent pairs", () => {
  const tangents = circleTangents(0, 0, 10, 50, 0, 10);
  assert.equal(tangents.length, 2);
  assert.ok(Number.isFinite(tangents[0].a.x));
  assert.ok(Number.isFinite(tangents[0].b.y));

  const ptTangents = pointTangents(0, 0, 10, 20, 0);
  assert.equal(ptTangents.length, 2);
  assert.ok(Number.isFinite(ptTangents[0].x));
  assert.ok(Number.isFinite(ptTangents[0].angle));
});

test("computeTapePath generates valid SVG path data", () => {
  const path = computeTapePath(40, 60, { x: 291, y: 204, r: 1.5 });
  assert.ok(path.startsWith("M "));
  assert.ok(path.includes(" A "));
  assert.ok(path.includes(" L "));
});
