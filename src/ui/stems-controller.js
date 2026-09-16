import { MAX_SECONDS, SAMPLE_RATE } from "../audio/stem-core.js";

const overlay = document.getElementById("stem-progress-overlay");
const label = document.getElementById("stem-progress-label");
const progress = document.getElementById("stem-progress");
const cancel = document.getElementById("stem-cancel");

let worker = null;
let generation = 0;
let busy = false;

function ensureWorker() {
  worker ||= new Worker(new URL("../audio/stem-worker.js", import.meta.url), { type: "module" });
  return worker;
}

function releaseWorker() {
  worker?.terminate();
  worker = null;
}

function stableStatus(message = "") {
  if (message.startsWith("Downloading model")) return "Downloading stem model…";
  if (message.startsWith("Checking saved model")) return "Checking saved model…";
  if (message.startsWith("Checking model")) return "Verifying stem model…";
  if (message.startsWith("Loading model")) return "Loading stem model…";
  if (message.startsWith("Separated")) return "Finishing stem separation…";
  return message;
}

function setProgress(value = null) {
  const determinate = Number.isFinite(value);
  progress.classList.toggle("indeterminate", !determinate);
  if (determinate) {
    const normalized = Math.max(0, Math.min(1, value));
    progress.style.setProperty("--stem-progress", `${normalized * 100}%`);
    progress.setAttribute("aria-valuenow", String(Math.round(normalized * 100)));
  } else {
    progress.style.removeProperty("--stem-progress");
    progress.removeAttribute("aria-valuenow");
  }
}

function resetProgress() {
  setProgress();
}

function closeOverlay() {
  overlay.hidden = true;
  progress.hidden = false;
  cancel.textContent = "CANCEL";
}

function stop(message = "Stem split cancelled.") {
  generation++;
  releaseWorker();
  busy = false;
  closeOverlay();
  window.dispatchEvent(new CustomEvent("sampla:stem-split-stopped", { detail: { message } }));
}

function fail(message) {
  releaseWorker();
  busy = false;
  label.textContent = message;
  progress.hidden = true;
  cancel.textContent = "CLOSE";
  window.dispatchEvent(new CustomEvent("sampla:stem-split-stopped", { detail: { message } }));
}

async function splitSource(source) {
  if (busy) return;
  busy = true;
  const token = ++generation;
  overlay.hidden = false;
  progress.hidden = false;
  resetProgress();
  label.textContent = "Preparing waveform…";
  cancel.textContent = "CANCEL";
  window.dispatchEvent(new Event("sampla:stem-split-start"));
  try {
    const decoder = new OfflineAudioContext(2, 1, SAMPLE_RATE);
    const decoded = await decoder.decodeAudioData(await source.blob.arrayBuffer());
    if (token !== generation) return;
    // Crops are reversible until Store, so split the complete underlying
    // recording. This keeps real stem waveforms available in grey crop areas.
    const start = 0;
    const duration = decoded.duration;
    if (!(duration > 0) || duration > MAX_SECONDS) {
      throw new Error(`Stem splitting supports samples up to ${MAX_SECONDS} seconds.`);
    }
    const context = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
    const player = context.createBufferSource();
    player.buffer = decoded;
    player.connect(context.destination);
    player.start(0, start, duration);
    const rendered = await context.startRendering();
    if (token !== generation) return;
    const channels = [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()];
    ensureWorker();
    worker.onmessage = ({ data }) => {
      if (token !== generation) return;
      if (data.type === "progress") {
        const nextLabel = stableStatus(data.message);
        if (label.textContent !== nextLabel) label.textContent = nextLabel;
        if (data.message.startsWith("Downloading")) setProgress(Math.min(1, data.value / 0.4));
        else if (data.message.startsWith("Separated")) setProgress(1);
        else setProgress();
      } else if (data.type === "complete") {
        busy = false;
        // The transferred stem arrays now belong to the UI. Tear down the
        // ONNX worker immediately so its model, WASM heap and WebGPU resources
        // do not remain resident for the lifetime of the recorder tab.
        releaseWorker();
        label.textContent = "Stems ready";
        setProgress(1);
        setTimeout(() => {
          if (token !== generation) return;
          closeOverlay();
          window.dispatchEvent(new CustomEvent("sampla:stems-ready", {
            detail: {
              source,
              stems: data.stems,
              gain: data.gain,
              sampleRate: SAMPLE_RATE,
            },
          }));
        }, 180);
      } else if (data.type === "error") fail(data.message);
    };
    worker.onerror = () => fail("Stem splitting stopped. Try closing other tabs.");
    worker.postMessage({ type: "split", channels }, channels.map((channel) => channel.buffer));
  } catch (error) {
    if (token === generation) fail(error.message || "Could not split this sample.");
  }
}

window.addEventListener("sampla:open-stems", async ({ detail }) => {
  try {
    const source = detail.source || await window.SamplaStorage.get(detail.id);
    const sourceDurationMs = source?.tapeDurationMs ?? source?.durationMs;
    if (!source?.blob || sourceDurationMs <= 0 || sourceDurationMs > MAX_SECONDS * 1000) {
      throw new Error(`Stem splitting supports samples up to ${MAX_SECONDS} seconds.`);
    }
    await splitSource(source);
  } catch (error) {
    fail(error.message || "Could not open this sample.");
  }
});

cancel.addEventListener("click", () => stop());
window.addEventListener("pagehide", () => {
  releaseWorker();
});
