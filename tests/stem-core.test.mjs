import assert from "node:assert/strict";
import test from "node:test";
import { separateStems, MAX_SECONDS, SAMPLE_RATE } from "../src/audio/stem-core.js";

function fakeModel(segmentFrames, factors = [.2, .1, .3, .4]) {
  return async (input) => ({ data: Float32Array.from({ length: 8 * segmentFrames }, (_, i) =>
    input[i % (2 * segmentFrames)] * factors[Math.floor(i / (2 * segmentFrames))]) });
}

for (const length of [1, 7, 8, 9, 14, 15, 31]) {
  test(`stem overlap preserves stereo, endpoints and exact length (${length} frames)`, async () => {
    const left = Float32Array.from({ length }, (_, i) => .1 + i / 100);
    const right = Float32Array.from(left, (n) => -n / 2);
    const updates = [];
    const { stems, gain } = await separateStems([left, right], fakeModel(8), {
      segmentFrames: 8, onProgress: (n) => updates.push(n),
    });
    assert.equal(gain, 1);
    assert.equal(stems.length, 4);
    assert.equal(updates.at(-1), 1);
    for (let c = 0; c < 2; c++) for (let i = 0; i < length; i++) {
      const expected = [left, right][c][i];
      assert.equal(stems[0][c].length, length);
      assert.ok(Math.abs(stems[0][c][i] - expected * .4) < 1e-6);
      assert.ok(Math.abs(stems[1][c][i] - expected * .2) < 1e-6);
      assert.ok(Math.abs(stems[2][c][i] - expected * .1) < 1e-6);
      assert.ok(Math.abs(stems[3][c][i] - expected * .3) < 1e-6);
      assert.ok(Math.abs(stems.reduce((sum, stem) => sum + stem[c][i], 0) - expected) < 1e-6);
    }
  });
}

test("shared attenuation prevents clipping and preserves relative levels", async () => {
  const channel = new Float32Array(9).fill(.8);
  const { stems, gain } = await separateStems([channel, channel], fakeModel(8, [4, 0, 0, 0]), { segmentFrames: 8 });
  assert.ok(gain < 1);
  assert.ok(Math.abs(stems[1][0][0] - .99) < 1e-6);
  assert.ok(Math.abs(stems.reduce((sum, stem) => sum + stem[0][0], 0) - .8 * gain) < 1e-6);
});

test("mixture consistency makes recombined floating-point stems match the source", async () => {
  const left = Float32Array.from([.1, -.2, .3, -.4]);
  const right = Float32Array.from([-.05, .1, -.15, .2]);
  const { stems, gain } = await separateStems([left, right], fakeModel(8, [.1, .1, .1, .1]), {
    segmentFrames: 8,
  });
  assert.equal(gain, 1);
  for (let c = 0; c < 2; c++) for (let i = 0; i < left.length; i++) {
    const recombined = stems.reduce((sum, stem) => sum + stem[c][i], 0);
    assert.ok(Math.abs(recombined - [left, right][c][i]) < 1e-6);
  }
});

test("quality shifts are aligned and averaged", async () => {
  const channel = Float32Array.from({ length: 6 }, (_, i) => (i + 1) / 20);
  let calls = 0;
  const infer = async (input) => {
    calls++;
    return fakeModel(8)(input);
  };
  const { stems } = await separateStems([channel, channel], infer, {
    segmentFrames: 8,
    shifts: [0, 2],
  });
  assert.equal(calls, 2);
  for (let i = 0; i < channel.length; i++) {
    assert.ok(Math.abs(stems[0][0][i] - channel[i] * .4) < 1e-6);
  }
});

test("quality shifts require a valid unshifted pass", async () => {
  const channel = new Float32Array(2);
  await assert.rejects(
    separateStems([channel, channel], fakeModel(8), { segmentFrames: 8, shifts: [2] }),
    /unshifted pass/
  );
});

test("invalid model output is rejected and disposed", async () => {
  const channel = new Float32Array(1);
  let disposed = false;
  await assert.rejects(separateStems([channel, channel], async () => ({
    data: new Float32Array(64).fill(NaN), dispose() { disposed = true; },
  }), { segmentFrames: 8 }), /invalid audio/);
  assert.equal(disposed, true);
});

test("empty, mismatched, nonfinite and oversized input is rejected before inference", async () => {
  const never = () => { throw new Error("Should not infer"); };
  for (const channels of [[], [new Float32Array(1), new Float32Array(2)],
    [new Float32Array([NaN]), new Float32Array(1)],
    [new Float32Array(SAMPLE_RATE * MAX_SECONDS + 1), new Float32Array(SAMPLE_RATE * MAX_SECONDS + 1)]]) {
    await assert.rejects(separateStems(channels, never), /valid stereo recording/);
  }
});
