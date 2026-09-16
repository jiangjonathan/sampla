import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
await import('../src/audio/audio-buffer-ops.js');
const popup = readFileSync(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../popup.html', import.meta.url), 'utf8');
const stemsController = readFileSync(new URL('../src/ui/stems-controller.js', import.meta.url), 'utf8');
const stemWorker = readFileSync(new URL('../src/audio/stem-worker.js', import.meta.url), 'utf8');
const popupCss = readFileSync(new URL('../styles/popup.css', import.meta.url), 'utf8');
const libraryController = readFileSync(new URL('../src/ui/library-controller.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const functions = popup.slice(popup.indexOf('function stemMixChannels'), popup.indexOf('function renderStemControls'));
function createBuffer(numberOfChannels, length, sampleRate) {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return { numberOfChannels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => channels[i], copyToChannel: (data, i) => channels[i].set(data) };
}
test('stem mix uses the transport sample rate and preserves source timeline, crop and position', () => {
  const originalBuffer = createBuffer(2, 144000, 48000);
  originalBuffer.getChannelData(0).fill(.2);
  const session = {
    stems: [[new Float32Array(44100).fill(.5), new Float32Array(44100).fill(.5)]],
    enabled: [true], viewingStems: true, sampleRate: 44100,
    originalBuffer, originalBlob: {}, originalPeaks: [.2], sourceBounds: { start: 1000, end: 2000 },
  };
  const context = vm.createContext({
    stemSession: session, mode: 'idle', BufferOps: globalThis.SamplaBufferOps,
    getAudio: () => ({ sampleRate: 48000, createBuffer }), stopTransport() {},
    dropTapeTransport() {}, recordingExporter: { toWavBlob: () => ({}) },
    showTime() {}, syncTransport() {}, playTape() {}, requestAnimationFrame() {},
    tapeBuffer: null, tapeBufferRev: null, tapeTransportNode: null,
    tapeTransportBuffer: null, source: null, decodeWait: null, blob: null,
    tapeEndMs: 3000, cropStartMs: 1000, cropEndMs: 2000, playheadMs: 1500, wavePeaks: [],
  });
  vm.runInContext(functions + '\napplyStemMix();', context);
  assert.equal(context.tapeBuffer.sampleRate, 48000);
  assert.equal(context.tapeBuffer.duration, 3);
  assert.equal(context.playheadMs, 1500);
  assert.equal(context.cropStartMs, 1000);
  assert.equal(context.cropEndMs, 2000);
  assert.ok(Math.abs(context.tapeBuffer.getChannelData(0)[47999] - .2) < 1e-6);
  assert.equal(context.tapeBuffer.getChannelData(0)[48000], .5);
  assert.equal(context.tapeBuffer.getChannelData(0)[95999], .5);
  assert.ok(Math.abs(context.tapeBuffer.getChannelData(0)[96000] - .2) < 1e-6);
  session.viewingStems = false;
  vm.runInContext('applyStemMix()', context);
  assert.equal(context.tapeBuffer, originalBuffer);
  assert.equal(context.blob, session.originalBlob);
});

test('stem audio cannot extend a destructively cropped parent timeline', () => {
  const originalBuffer = createBuffer(2, 48000, 48000);
  const staleStem = new Float32Array(48000 * 2).fill(.5);
  const session = {
    stems: [[staleStem, staleStem.slice()]],
    enabled: [true], viewingStems: true, sampleRate: 48000,
    originalBuffer, originalBlob: {}, originalPeaks: [], sourceBounds: { start: 0, end: 2000 },
  };
  const context = vm.createContext({
    stemSession: session, mode: 'idle', BufferOps: globalThis.SamplaBufferOps,
    getAudio: () => ({ sampleRate: 48000, createBuffer }), stopTransport() {},
    dropTapeTransport() {}, recordingExporter: { toWavBlob: () => ({}) },
    showTime() {}, syncTransport() {}, playTape() {}, requestAnimationFrame() {},
    tapeBuffer: null, tapeBufferRev: null, tapeTransportNode: null,
    tapeTransportBuffer: null, source: null, decodeWait: null, blob: null,
    tapeEndMs: 1000, cropStartMs: 0, cropEndMs: 1000, playheadMs: 0, wavePeaks: [],
  });
  vm.runInContext(functions + '\napplyStemMix();', context);
  assert.equal(context.tapeBuffer.length, originalBuffer.length);
  assert.equal(context.tapeBuffer.duration, originalBuffer.duration);
});

test('entering Edit overlaps its regular transition with the stem collapse and retains split choices', async () => {
  const session = { viewingStems: true, stems: ['cached audio'], enabled: [false, true, true, true] };
  let finishMorph;
  let decoded = false;
  const context = vm.createContext({
    stemSession: session, blob: {}, mode: 'idle', currentBeatData: {},
    window: { matchMedia: () => ({ matches: true }) },
    animateStemView: (show, duration) => new Promise((resolve) => {
      assert.equal(show, false);
      assert.equal(duration, undefined);
      finishMorph = () => { session.viewingStems = false; resolve(); };
    }),
    ensureDecoded: async () => { decoded = true; return {}; },
  });
  // Exercise the actual asynchronous entry path, before unrelated editor DOM setup.
  const entry = popup.slice(popup.indexOf('async function setEditMode(active)'), popup.indexOf('  const transitionHeadRatio = !active && editMode'));
  const entering = vm.runInContext(entry + '}\nsetEditMode(true)', context);
  await Promise.resolve();
  assert.equal(decoded, true);
  finishMorph();
  await entering;
  assert.equal(decoded, true);
  assert.equal(context.stemSession, session);
  assert.deepEqual(session.stems, ['cached audio']);
  assert.equal(session.enabled[0], false);
});

test('starting a stem split leaves active playback running', () => {
  const handler = popup.slice(
    popup.indexOf('stemToggle?.addEventListener("click"'),
    popup.indexOf('editToggle.addEventListener', popup.indexOf('stemToggle?.addEventListener("click"')),
  );
  assert.doesNotMatch(handler, /stopTransport/);
  assert.match(handler, /sampla:open-stems/);
  assert.match(handler, /if \(editMode\)[\s\S]*await setEditMode\(false\)/);
});

test('the stem button remains available in Edit for new and existing stems', () => {
  const sync = popup.slice(popup.indexOf('function syncTransport()'), popup.indexOf('function playTape()'));
  assert.match(sync, /const canNavigateToStems = Boolean\(stemSession \|\| trackHasSavedStems\)/);
  assert.doesNotMatch(sync, /editMode && !canNavigateToStems/);
});

test('entering Edit preserves a pending soft crop', () => {
  const editModeHandler = popup.slice(
    popup.indexOf('async function setEditMode(active)'),
    popup.indexOf('async function finishEdits()'),
  );
  assert.doesNotMatch(editModeHandler, /cropTrackHard/);
});

test('stem progress is truthful, active during opaque work, and absent from the Library', () => {
  assert.doesNotMatch(popupHtml, /id="library-stems"/);
  assert.match(stemsController, /setProgress\(Math\.min\(1, data\.value \/ 0\.4\)\)/);
  assert.doesNotMatch(stemWorker, /progress\([^\n]*, null\)/);
  assert.match(stemWorker, /0\.5 \+ value \* 0\.5/);
  assert.match(stemsController, /progress\.classList\.toggle\("indeterminate"/);
  assert.match(popupCss, /animation: stem-progress-scan/);
  assert.match(popupCss, /\.stem-lane-controls[\s\S]*width: 40px/);
  assert.doesNotMatch(popupCss, /#116d74/);
});

test('stem mixes retain provenance and cannot be split a second time', () => {
  assert.match(libraryController, /stemDerived: Boolean\(stemDerived\) \|\| Boolean\(existing\?\.stemDerived\)/);
  assert.match(popup, /stemDerivedTrack = Boolean\(track\.stemDerived \|\| track\.isRemix \|\| track\.isMix \|\| track\.isStem\)/);
  assert.match(popup, /stemDerivedTrack && !stemSession/);
  assert.match(popup, /already a stem mix/);
});

test('stem separation processes the full reversible tape rather than only its crop', () => {
  assert.match(stemsController, /const start = 0;/);
  assert.match(stemsController, /const duration = decoded\.duration;/);
  assert.doesNotMatch(stemsController, /source\.cropStartMs/);
  assert.doesNotMatch(stemsController, /source\.cropEndMs/);
});

test('stem startup uses verified models without retaining an idle inference runtime', () => {
  assert.equal(manifest.cross_origin_embedder_policy, undefined);
  assert.match(stemWorker, /gpuOrt\.env\.wasm\.numThreads = 1/);
  assert.match(stemWorker, /wasmOrt\.env\.wasm\.numThreads = 1/);
  assert.match(stemWorker, /VERIFIED_HEADER/);
  assert.match(stemWorker, /cachedOnly: true, silent: true/);
  assert.doesNotMatch(stemsController, /postMessage\(\{ type: "warmup" \}\)/);
  assert.match(stemsController, /data\.type === "complete"[\s\S]*releaseWorker\(\)/);
  assert.match(stemWorker, /const QUALITY_SHIFTS = \[0\]/);
});

test('stem inference prefers WebGPU and retains automatic WASM fallback', () => {
  assert.match(stemWorker, /ort\.webgpu\.min\.mjs/);
  assert.match(stemWorker, /ort\.wasm\.min\.mjs/);
  assert.match(stemWorker, /gpuOrt\.InferenceSession\.create\(model, sessionOptions\(\["webgpu"\]\)\)/);
  assert.match(stemWorker, /ort-wasm-simd-threaded\.jsep\.wasm/);
  assert.match(stemWorker, /navigator\.gpu\.requestAdapter/);
  assert.match(stemWorker, /wasmOrt\.InferenceSession\.create\(model, sessionOptions\(\["wasm"\]\)\)/);
  assert.match(stemWorker, /sessionBackend !== "webgpu"/);
  assert.match(stemWorker, /fallBackToWasm/);
});

test('every interactive stem button state stays in the teal palette', () => {
  assert.match(popupCss, /\.stem-toggle\.active[\s\S]*color: #32e6f4/);
  assert.match(popupCss, /\.stem-toggle\.pending:disabled[\s\S]*color: #32e6f4/);
  assert.doesNotMatch(popupCss, /\.stem-toggle[^}]*#ff0000/);
});

test('stem button exposes stable active, processing, and transition states', () => {
  const sync = popup.slice(popup.indexOf('function syncTransport()'), popup.indexOf('function playTape()'));
  assert.match(sync, /const stemPending = stemSplitBusy \|\| stemViewTransitioning/);
  assert.match(sync, /classList\.toggle\("pending", stemPending\)/);
  assert.match(sync, /setAttribute\("aria-pressed", String\(viewingStems\)\)/);
  assert.match(sync, /setAttribute\("aria-busy", String\(stemSplitBusy\)\)/);
});

test('cut, copy, and paste are offered only in the edit context menu', () => {
  assert.doesNotMatch(popupHtml, /id="edit-(?:cut|copy|paste)"/);
  assert.match(popupHtml, /data-edit-action="cut"/);
  assert.match(popupHtml, /data-edit-action="copy"/);
  assert.match(popupHtml, /data-edit-action="paste"/);
  assert.doesNotMatch(popup, /editMode && command && key === "[xcv]"/);
});

test('stem lane control buttons display centered ALL CAPS and wide labels', () => {
  assert.match(popup, /const names = \["VOCALS", "DRUMS", "BASS", "OTHER"\];/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*justify-content: center;/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*align-items: center;/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*text-align: center;/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*text-transform: uppercase;/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*transform: scaleX\(var\(--ui-stretch\)\);/);
  assert.match(popupCss, /\.stem-lane-controls button[\s\S]*font-stretch: expanded;/);
  assert.doesNotMatch(popupCss, /\.stem-lane-controls button\[aria-pressed="false"\][\s\S]*line-through;/);
});
