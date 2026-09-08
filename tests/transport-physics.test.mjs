import assert from "node:assert/strict";
import test from "node:test";

await import("../src/audio/transport-physics.js");
const { rateForMode, nextScrubPosition } = globalThis.SamplaTransportPhysics;

test("deck modes map to one natural transport rate", () => {
  assert.equal(rateForMode("idle", 8), 0);
  assert.equal(rateForMode("play", 8), 1);
  assert.equal(rateForMode("record", 8), 1);
  assert.equal(rateForMode("ffwd", 8), 8);
  assert.equal(rateForMode("rev", 8), -8);
});

test("playback scrubbing has exactly one position clock", () => {
  const common = {
    currentMs: 3000,
    rate: -12,
    dt: 1 / 60,
    startMs: 0,
    endMs: 10000,
  };

  assert.equal(nextScrubPosition({ ...common, audioPositionMs: 2875 }), 2875);
  assert.equal(nextScrubPosition({ ...common, audioPositionMs: null }), 2800);
});
