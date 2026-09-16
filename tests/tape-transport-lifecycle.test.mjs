import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const popup = readFileSync(new URL('../src/ui/popup.js', import.meta.url), 'utf8');
const lifecycle = popup.slice(popup.indexOf('function dropTapeTransport()'), popup.indexOf('function stopSource('));
function harness() {
  let finishModule;
  const module = new Promise(resolve => { finishModule = resolve; });
  const nodes = [];
  const timers = [];
  class Node {
    constructor() {
      nodes.push(this);
      this.messages = [];
      this.port = {
        postMessage: message => {
          this.messages.push(message);
          if (message.type === 'load') queueMicrotask(() => this.port.onmessage?.({ data: { type: 'loaded' } }));
        },
        close: () => { this.closed = true; },
      };
    }
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const ctx = { sampleRate: 48000, destination: {}, audioWorklet: { addModule: () => module } };
  const context = vm.createContext({
    tapeTransportNode: null, tapeTransportBuffer: null, tapeTransportLoad: null,
    tapeTransportModuleLoad: null, tapeTransportGeneration: 0, resolveTapeTransportLoad: null,
    source: null, sourceGain: null, audioCtx: ctx, SCRUB_FADE_SEC: .008,
    getAudio: () => ctx, AudioWorkletNode: Node, setTimeout: fn => timers.push(fn),
  });
  vm.runInContext(lifecycle, context);
  const buffer = () => ({ numberOfChannels: 1, getChannelData: () => new Float32Array(100) });
  return { context, nodes, timers, finishModule, buffer };
}

test('concurrent transport initialization shares one processor and one buffer upload', async () => {
  const { context, nodes, finishModule, buffer } = harness();
  const audio = buffer();
  const first = context.ensureTapeTransport(audio);
  const second = context.ensureTapeTransport(audio);
  finishModule();
  assert.equal(await first, await second);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].messages.filter(m => m.type === 'load').length, 1);
});

test('changing audio during initialization cancels stale creation and disposes the old graph', async () => {
  const { context, nodes, timers, finishModule, buffer } = harness();
  const first = context.ensureTapeTransport(buffer());
  const second = context.ensureTapeTransport(buffer());
  finishModule();
  assert.equal(await first, null);
  const active = await second;
  assert.equal(nodes.length, 1);
  context.dropTapeTransport();
  assert.equal(active.messages.at(-1).type, 'dispose');
  assert.equal(context.tapeTransportNode, null);
  for (const timer of timers) timer();
  assert.equal(active.connected, false);
  assert.equal(active.closed, true);
});

test('Stop cancels Play while decoding is still pending', async () => {
  let finishDecode;
  const decoding = new Promise(resolve => { finishDecode = resolve; });
  let starts = 0;
  const context = vm.createContext({
    playbackRequest: 0, suppressAutoPlay: false, blob: {}, mode: 'idle', tapeBuffer: {},
    resetJogState() {}, getAudio: () => ({ state: 'running' }), ensureDecoded: () => decoding,
    ensureTapeTransport: async () => {}, tapeTransportNode: {}, transportBounds: () => ({ start: 0, end: 1000 }),
    playheadMs: 0, playSource: () => { starts++; return true; }, startMotion() {},
    statusEl: {}, syncTransport() {}, jogActive: false, stopSource() {}, stopMotion() {},
    armTensionHeld: false, releaseArmWithReels: false,
  });
  const play = popup.slice(popup.indexOf('function playTape()'), popup.indexOf('function wind(direction)'));
  const stop = popup.slice(popup.indexOf('function stopTransport('), popup.indexOf('// Audio Transport & Web Audio Nodes'));
  vm.runInContext(play + '\n' + stop, context);
  context.playTape();
  context.stopTransport();
  finishDecode();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts, 0);
  assert.equal(context.mode, 'idle');
});
