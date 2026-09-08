import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const SAMPLE_RATE = 48000;
let Processor;

globalThis.sampleRate = SAMPLE_RATE;
globalThis.currentFrame = 0;
globalThis.AudioWorkletProcessor = class {
  constructor() {
    this.messages = [];
    this.port = {
      onmessage: null,
      postMessage: (message) => this.messages.push(message),
    };
  }
};
globalThis.registerProcessor = (_name, processor) => {
  Processor = processor;
};

const processorSource = fs.readFileSync(
  new URL("../tape-transport-processor.js", import.meta.url),
  "utf8"
);
new Function(processorSource)();

function makeTone(seconds = 8, frequency = 440) {
  const samples = new Float32Array(SAMPLE_RATE * seconds);
  for (let frame = 0; frame < samples.length; frame += 1) {
    samples[frame] = Math.sin(2 * Math.PI * frequency * frame / SAMPLE_RATE) * 0.5;
  }
  return samples;
}

function makeTransport() {
  globalThis.currentFrame = 0;
  const processor = new Processor();
  const tone = makeTone();
  processor.handleMessage({ type: "load", channels: [tone] });
  processor.handleMessage({
    type: "start",
    position: SAMPLE_RATE * 2,
    rate: 1,
    startFrame: 0,
    endFrame: tone.length,
    fadeFrames: 1,
  });
  return processor;
}

function render(processor, frames, destination = null) {
  const channel = new Float32Array(frames);
  processor.process([], [[channel]]);
  globalThis.currentFrame += frames;
  if (destination) destination.push(...channel);
  return channel;
}

function maxAdjacentDelta(samples, start = 1) {
  let maximum = 0;
  for (let index = Math.max(1, start); index < samples.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(samples[index] - samples[index - 1]));
  }
  return maximum;
}

test("rapid gesture updates remain sample-continuous through the 1x handoff", () => {
  const processor = makeTransport();
  const rendered = [];

  for (let block = 0; block < 20; block += 1) render(processor, 128, rendered);
  processor.handleMessage({ type: "set-rate", rate: 0, rampFrames: 960, scrubbing: true });
  for (let block = 0; block < 8; block += 1) render(processor, 128, rendered);

  for (let update = 0; update < 90; update += 1) {
    const rate = -0.045 + Math.sin(update * 0.31) * 0.009;
    processor.handleMessage({ type: "set-rate", rate, rampFrames: 960, scrubbing: true });
    render(processor, update % 3 === 0 ? 256 : 384, rendered);
  }

  const handoffFrame = rendered.length;
  processor.handleMessage({ type: "set-rate", rate: 1, rampFrames: 960, scrubbing: false });

  const handoffRates = [];
  for (let block = 0; block < 28; block += 1) {
    render(processor, 128, rendered);
    handoffRates.push(processor.rate);
  }

  for (let index = 1; index < handoffRates.length; index += 1) {
    assert.ok(handoffRates[index] >= handoffRates[index - 1] - 1e-8);
  }
  assert.equal(processor.rate, 1);

  const handoffAudio = rendered.slice(handoffFrame - 1, handoffFrame + 2400);
  assert.ok(maxAdjacentDelta(handoffAudio) < 0.04);
});

test("a stopped tape head settles to silence instead of emitting a frozen sample", () => {
  const processor = makeTransport();
  processor.handleMessage({ type: "set-rate", rate: 0, rampFrames: 960, scrubbing: true });

  // The 1 Hz DC blocker intentionally has a long, inaudible decay tail.
  for (let block = 0; block < 600; block += 1) render(processor, 128);
  const settled = render(processor, 1024);

  assert.ok(Math.max(...settled.map(Math.abs)) < 1e-4);
});

test("starting transport clears filter history from the previous run", () => {
  const processor = makeTransport();
  processor.dcPrevIn[0] = 0.8;
  processor.dcPrevOut[0] = -0.4;
  processor.lpfState[0] = 0.7;

  processor.handleMessage({
    type: "start",
    position: SAMPLE_RATE,
    rate: 1,
    startFrame: 0,
    endFrame: SAMPLE_RATE * 8,
    fadeFrames: 384,
  });

  assert.deepEqual(processor.dcPrevIn, [0, 0]);
  assert.deepEqual(processor.dcPrevOut, [0, 0]);
  assert.deepEqual(processor.lpfState, [0, 0]);
});

test("loop boundaries crossfade instead of popping across a discontinuous crop", () => {
  const processor = new Processor();
  const samples = new Float32Array(SAMPLE_RATE);
  samples.fill(0.75, 0, SAMPLE_RATE / 2);
  samples.fill(-0.75, SAMPLE_RATE / 2);
  processor.handleMessage({ type: "load", channels: [samples] });
  processor.handleMessage({
    type: "start",
    position: samples.length - 300,
    rate: 1,
    startFrame: 0,
    endFrame: samples.length,
    loop: true,
    fadeFrames: 1,
  });

  const rendered = render(processor, 700);

  assert.ok(maxAdjacentDelta(rendered) < 0.02);
  assert.equal(processor.active, true);
  assert.ok(processor.position > 240 && processor.position < 700);
});
