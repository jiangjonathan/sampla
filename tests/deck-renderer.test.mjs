import assert from "node:assert/strict";
import test from "node:test";

await import("../deck-geometry.js");
await import("../deck-renderer.js");

const Geometry = globalThis.SamplaDeckGeometry;
const TapeDeckRenderer = globalThis.SamplaDeckRenderer;

function stoppedTransportState(releaseArmWithReels = true) {
  return {
    moving: false,
    modeRate: 0,
    jogActive: false,
    scrubRate: 0,
    armTensionHeld: false,
    releaseArmWithReels,
    pointerCount: 0,
    transportRate: 0,
  };
}

test("tension arm releases with reel coast after Stop", () => {
  const deck = new TapeDeckRenderer({});
  deck.armCurrent = Geometry.ARM_RUN;
  deck.reelRate = 1;

  const dt = 1 / 60;
  deck.spin(dt, { moving: false, transportRate: 0, jogActive: false });
  deck.stepArm(dt, stoppedTransportState());

  const reelSlowdown = 1 - deck.reelRate;
  const armDrop = (deck.armCurrent - Geometry.ARM_RUN)
    / (Geometry.ARM_IDLE - Geometry.ARM_RUN);

  assert.ok(deck.reelRate < 1, "reels should begin decelerating");
  assert.ok(armDrop > 0, "arm should begin releasing");
  assert.ok(
    armDrop < reelSlowdown,
    "arm should not drop ahead of the reel deceleration envelope"
  );
});

test("non-playback stops do not couple the arm to reel coast", () => {
  const deck = new TapeDeckRenderer({});
  deck.armCurrent = Geometry.ARM_RUN;
  deck.reelRate = 1;

  const dt = 1 / 60;
  deck.spin(dt, { moving: false, transportRate: 0, jogActive: false });
  deck.stepArm(dt, stoppedTransportState(false));

  const reelSlowdown = 1 - deck.reelRate;
  const armDrop = (deck.armCurrent - Geometry.ARM_RUN)
    / (Geometry.ARM_IDLE - Geometry.ARM_RUN);
  assert.ok(armDrop > reelSlowdown);
});

test("moveReelsByTapeMs keeps angles normalized within [-360, 360] for high-rate precision", () => {
  const spoolLeft = { style: { transform: "" } };
  const spoolRight = { style: { transform: "" } };
  const deck = new TapeDeckRenderer({ spoolLeft, spoolRight });

  // Advance by 1,000,000 ms (1000 seconds of tape)
  for (let i = 0; i < 1000; i++) {
    deck.moveReelsByTapeMs(1000);
  }

  assert.ok(Math.abs(deck.angleLeft) <= 360, `angleLeft should be within [-360, 360], got ${deck.angleLeft}`);
  assert.ok(Math.abs(deck.angleRight) <= 360, `angleRight should be within [-360, 360], got ${deck.angleRight}`);
  assert.match(spoolLeft.style.transform, /^rotate\(-?\d+(\.\d+)?deg\)$/);
  assert.match(spoolRight.style.transform, /^rotate\(-?\d+(\.\d+)?deg\)$/);
});

test("updateTapePath caches geometry and reuses path when tension arm is steady", () => {
  let setDCount = 0;
  const tapePath = {
    setAttribute(name, val) {
      if (name === "d") setDCount++;
    },
  };
  const deck = new TapeDeckRenderer({ tapePath });

  deck.updateTapePath();
  assert.equal(setDCount, 1, "initial call must compute path");

  // Call again with unchanged geometry
  deck.updateTapePath();
  assert.equal(setDCount, 1, "unchanged geometry must not recompute path");
});

