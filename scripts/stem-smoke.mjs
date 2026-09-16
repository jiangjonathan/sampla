// Optional real-model regression check; no download or network access.
// npm run stems:smoke -- /path/to/htdemucs_fp16weights.onnx
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as ort from "../assets/vendor/onnxruntime/ort.wasm.min.mjs";
import { separateStems, sessionOptions, SEGMENT_FRAMES } from "../src/audio/stem-core.js";

if (!process.argv[2]) throw new Error("Pass the local htdemucs_fp16weights.onnx path.");
const model = new Uint8Array(await readFile(process.argv[2]));
assert.equal(createHash("sha256").update(model).digest("hex"),
  "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a");
ort.env.wasm.numThreads = 1;
let session;
try {
  console.time("Model load");
  session = await ort.InferenceSession.create(model, sessionOptions());
  console.timeEnd("Model load");
  const channels = [440, 330].map((frequency) => Float32Array.from({ length: 44100 },
    (_, i) => .15 * Math.sin(2 * Math.PI * frequency * i / 44100)));
  console.time("Separation");
  const { stems } = await separateStems(channels, async (input) => {
    const tensor = new ort.Tensor("float32", input, [1, 2, SEGMENT_FRAMES]);
    try { return (await session.run({ mix: tensor })).stems; }
    finally { tensor.dispose(); }
  });
  console.timeEnd("Separation");
  for (const stem of stems) for (const channel of stem) {
    assert.equal(channel.length, 44100);
    assert.ok(channel.every(Number.isFinite));
  }
  assert.ok(stems[3][0].some((sample) => Math.abs(sample) > .01));
  console.log("PASS: four finite stereo stems, exact duration, non-silent other stem.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await session?.release(); }
