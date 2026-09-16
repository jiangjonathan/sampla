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
  new URL("../src/audio/tape-transport-processor.js", import.meta.url),
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

test("live loop-bound edits take effect without restarting transport", () => {
  const processor = makeTransport();
  processor.loop = true;
  processor.position = SAMPLE_RATE * 3;

  processor.handleMessage({
    type: "set-bounds",
    startFrame: SAMPLE_RATE,
    endFrame: SAMPLE_RATE * 2,
    loop: true,
  });

  assert.equal(processor.startFrame, SAMPLE_RATE);
  assert.equal(processor.endFrame, SAMPLE_RATE * 2);
  assert.equal(processor.position, SAMPLE_RATE);
  assert.equal(processor.loop, true);
  assert.equal(processor.active, true);
  assert.equal(processor.messages.at(-1).type, "position");

  processor.handleMessage({
    type: "set-bounds",
    position: SAMPLE_RATE * 1.5,
  });
  assert.equal(processor.position, SAMPLE_RATE * 1.5);
});

test("turning looping off updates the active transport", () => {
  const processor = makeTransport();
  processor.loop = true;

  processor.handleMessage({ type: "set-bounds", loop: false });

  assert.equal(processor.loop, false);
});

test("replacing the tape buffer keeps playback active at the same position", () => {
  const processor = makeTransport();
  render(processor, 1024);
  const position = processor.position;
  const replacement = new Float32Array(SAMPLE_RATE * 8).fill(0.25);

  processor.handleMessage({ type: "replace", channels: [replacement] });

  assert.equal(processor.active, true);
  assert.equal(processor.position, position);
  assert.equal(processor.channels[0], replacement);
  assert.equal(processor.messages.at(-1).type, "replaced");
  const output = render(processor, 512);
  assert.ok(maxAdjacentDelta(output) < 0.04);
  assert.ok(processor.replacementFramesLeft > 0, "replacement should crossfade the two moving streams");
});

test("rapid restarts and live seeks smooth discontinuities instead of popping", () => {
  const processor = new Processor();
  const samples = new Float32Array(SAMPLE_RATE);
  samples.fill(.8, 0, SAMPLE_RATE / 2);
  samples.fill(-.8, SAMPLE_RATE / 2);
  processor.handleMessage({ type: 'load', channels: [samples] });
  processor.handleMessage({ type: 'start', position: 1000, rate: 1, fadeFrames: 384 });
  const audio = [...render(processor, 500)];
  for (let i = 0; i < 20; i++) {
    const position = i % 2 ? 1000 : 30000;
    processor.handleMessage(i % 3
      ? { type: 'set-bounds', position }
      : { type: 'start', position, rate: 1, fadeFrames: 384 });
    render(processor, 128, audio);
  }
  assert.ok(maxAdjacentDelta(audio) < .02);
});

test("stop fades the DC filter tail as well as the input signal", () => {
  const processor = new Processor();
  processor.handleMessage({ type: 'load', channels: [new Float32Array(SAMPLE_RATE).fill(.8)] });
  processor.handleMessage({ type: 'start', rate: 1, fadeFrames: 384 });
  const audio = [...render(processor, 6000)];
  processor.handleMessage({ type: 'stop', fadeFrames: 384 });
  render(processor, 600, audio);
  assert.ok(maxAdjacentDelta(audio) < .01);
  assert.equal(audio.at(-1), 0);
});

test("disposed processors fade out, release sample storage and stop processing", () => {
  const processor = makeTransport();
  render(processor, 500);
  processor.handleMessage({ type: 'dispose', fadeFrames: 384 });
  processor.handleMessage({ type: 'set-rate', rate: 1 });
  const output = new Float32Array(512);
  assert.equal(processor.process([], [[output]]), false);
  assert.equal(processor.length, 0);
  assert.deepEqual(processor.channels, []);
  assert.equal(output.at(-1), 0);
});
