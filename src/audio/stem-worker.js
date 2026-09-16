import * as gpuOrt from "../../assets/vendor/onnxruntime/ort.webgpu.min.mjs";
import * as wasmOrt from "../../assets/vendor/onnxruntime/ort.wasm.min.mjs";
import { separateStems, sessionOptions, SEGMENT_FRAMES, SAMPLE_RATE } from "./stem-core.js";

export const MODEL_URL = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/d54ed9eb60e258ea82131c6ee14578628816456a/htdemucs_fp16weights.onnx";
const MODEL_BYTES = 165612636;
const MODEL_SHA256 = "d05c269d0178d2a72ad484b10b11dd370193fc923201c3b27a99f848745db70a";
const VERIFIED_HEADER = "X-Sampla-Verified-SHA256";
const CACHE = "sampla-stem-model-v1";
const QUALITY_SHIFTS = [0];
const progress = (message, value) => postMessage({ type: "progress", message, value });
const runtimeUrl = (file) => new URL(`../../assets/vendor/onnxruntime/${file}`, import.meta.url).href;

// ONNX Runtime cannot reliably infer companion WASM URLs from an extension
// module worker. Pin them to chrome-extension:// URLs instead of allowing it
// to guess a CDN-style path.
gpuOrt.env.wasm.wasmPaths = {
  mjs: runtimeUrl("ort-wasm-simd-threaded.jsep.mjs"),
  wasm: runtimeUrl("ort-wasm-simd-threaded.jsep.wasm"),
};
wasmOrt.env.wasm.wasmPaths = {
  mjs: runtimeUrl("ort-wasm-simd-threaded.mjs"),
  wasm: runtimeUrl("ort-wasm-simd-threaded.wasm"),
};
gpuOrt.env.wasm.numThreads = 1;
gpuOrt.env.wasm.proxy = false;
wasmOrt.env.wasm.numThreads = 1;
wasmOrt.env.wasm.proxy = false;

async function validModel(bytes) {
  if (bytes.byteLength !== MODEL_BYTES) return false;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("") === MODEL_SHA256;
}

async function loadModel({ cachedOnly = false, silent = false } = {}) {
  let cache;
  try { cache = await caches.open(CACHE); } catch { /* Storage may be full; separation can still run. */ }
  const cached = await cache?.match(MODEL_URL);
  if (cached) {
    if (!silent) progress("Checking saved model…", 0.1);
    const bytes = await cached.arrayBuffer();
    if (bytes.byteLength === MODEL_BYTES && cached.headers.get(VERIFIED_HEADER) === MODEL_SHA256) return bytes;
    if (await validModel(bytes)) {
      try {
        await cache.put(MODEL_URL, new Response(bytes, { headers: { [VERIFIED_HEADER]: MODEL_SHA256 } }));
      } catch { /* The verified model remains usable if metadata cannot be updated. */ }
      return bytes;
    }
    await cache.delete(MODEL_URL);
  }
  if (cachedOnly) return null;
  progress("Downloading model · 0%", 0);
  const response = await fetch(MODEL_URL, { credentials: "omit" });
  if (!response.ok || !response.body) throw new Error("Model download failed. Check your connection and try again.");
  const bytes = new Uint8Array(MODEL_BYTES);
  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > bytes.length) throw new Error("Unexpected model download size.");
      bytes.set(value, received);
      received += value.length;
      const downloaded = received / MODEL_BYTES;
      progress(`Downloading model · ${Math.floor(downloaded * 100)}%`, downloaded * 0.4);
    }
  } finally { await reader.cancel().catch(() => {}); }
  progress("Checking model…", 0.42);
  if (received !== MODEL_BYTES || !await validModel(bytes)) throw new Error("Model download was incomplete or corrupted. Try again.");
  try {
    await cache?.put(MODEL_URL, new Response(bytes, { headers: { [VERIFIED_HEADER]: MODEL_SHA256 } }));
  } catch { /* Cache is optional. */ }
  return bytes.buffer;
}

let running = false;
let session;
let sessionLoad;
let sessionBackend = "wasm";
let runtime = wasmOrt;

async function createSession(model, { silent = false } = {}) {
  if (navigator.gpu) {
    try {
      if (!silent) progress("Loading model on GPU…", 0.46);
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
        || await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("Chrome did not provide a WebGPU adapter");
      gpuOrt.env.webgpu.adapter = adapter;
      const gpuSession = await gpuOrt.InferenceSession.create(model, sessionOptions(["webgpu"]));
      runtime = gpuOrt;
      sessionBackend = "webgpu";
      return gpuSession;
    } catch (error) {
      console.warn("WebGPU stem session unavailable; using WASM", error);
    }
  }
  if (!silent) progress("Loading model on CPU…", 0.46);
  runtime = wasmOrt;
  sessionBackend = "wasm";
  return wasmOrt.InferenceSession.create(model, sessionOptions(["wasm"]));
}

async function ensureSession({ cachedOnly = false, silent = false } = {}) {
  if (session) return session;
  if (sessionLoad) {
    await sessionLoad;
    if (session || cachedOnly) return session;
  }
  sessionLoad = (async () => {
    let model = await loadModel({ cachedOnly, silent });
    if (!model) return null;
    session = await createSession(model, { silent });
    model = null;
    return session;
  })();
  try {
    return await sessionLoad;
  } finally {
    sessionLoad = null;
  }
}

async function fallBackToWasm() {
  try { await session?.release?.(); } catch {}
  session = null;
  const model = await loadModel({ silent: true });
  runtime = wasmOrt;
  sessionBackend = "wasm";
  session = await wasmOrt.InferenceSession.create(model, sessionOptions(["wasm"]));
}

async function infer(input) {
  const run = async () => {
    const tensor = new runtime.Tensor("float32", input, [1, 2, SEGMENT_FRAMES]);
    try {
      const output = await session.run({ mix: tensor });
      return output.stems;
    } finally {
      tensor.dispose();
    }
  };
  try {
    return await run();
  } catch (error) {
    if (sessionBackend !== "webgpu") throw error;
    progress("GPU unavailable · continuing on CPU…", 0.48);
    console.warn("WebGPU stem inference failed; retrying with WASM", error);
    await fallBackToWasm();
    return run();
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === "warmup") {
    ensureSession({ cachedOnly: true, silent: true }).catch(() => {});
    return;
  }
  if (running || data.type !== "split") return;
  running = true;
  try {
    // Keep the runtime single-threaded: enabling SharedArrayBuffer isolation
    // interferes with the extension's tab-capture/offscreen recording flow.
    await ensureSession();
    progress("Separating stems · standard…", 0.5);
    const result = await separateStems(data.channels, infer, {
      shifts: QUALITY_SHIFTS,
      onProgress: (value, detail) => {
        const overall = 0.5 + value * 0.5;
        if (detail?.running) progress(`Separating · chunk ${detail.chunk} of ${detail.count}`, overall);
        else progress(`Separated · ${Math.round(value * 100)}%`, overall);
      },
    });

    postMessage({ type: "complete", ...result }, result.stems.flat().map((channel) => channel.buffer));
  } catch (error) {
    const memoryError = /alloc|memory|Aborted/i.test(error.message || "");
    postMessage({ type: "error", message: memoryError
      ? "Not enough memory to separate this recording. Close other tabs or try a shorter crop."
      : error.message || "Stem separation failed. Try again." });
  } finally {
    running = false;
  }
};
