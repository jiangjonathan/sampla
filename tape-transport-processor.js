const DEFAULT_RATE_RAMP_SECONDS = 0.024;
const MOTION_EPSILON = 0.0001;
const MOTION_RATE_SCALE = 0.035;
const MOTION_GAIN_TIME_CONSTANT = 0.012;
const REPORT_FAST_FRAMES = 128;
const REPORT_STEADY_FRAMES = 512;
const MAX_FILTER_CUTOFF = 20000;
const MIN_SCRUB_FILTER_CUTOFF = 1500;
const LOOP_CROSSFADE_SECONDS = 0.005;
const DC_BLOCK_COEFFICIENT = Math.exp(-2 * Math.PI / sampleRate);

class TapeTransportProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.length = 0;
    this.position = 0;
    this.rate = 1;
    this.rateTarget = 1;
    this.rateStep = 0;
    this.rateFramesLeft = 0;
    this.startFrame = 0;
    this.endFrame = 0;
    this.active = false;
    this.loop = false;
    this.scrubbing = false;
    this.boundaryEdge = null;
    this.gain = 0;
    this.gainTarget = 0;
    this.gainFramesLeft = 0;
    this.motionGain = 1;
    this.stopping = false;
    this.reportCountdown = 0;
    this.audioTime = 0;

    // DC-blocking and anti-aliasing filter states
    this.dcPrevIn = [0, 0];
    this.dcPrevOut = [0, 0];
    this.lpfState = [0, 0];

    this.port.onmessage = (event) => this.handleMessage(event.data || {});
  }

  handleMessage(message) {
    if (message.type === "load") {
      this.channels = message.channels || [];
      this.length = this.channels[0]?.length || 0;
      this.endFrame = this.length;
      this.port.postMessage({ type: "loaded" });
      return;
    }
    if (message.type === "start") {
      this.startFrame = Math.max(0, message.startFrame || 0);
      this.endFrame = Math.min(this.length, message.endFrame ?? this.length);
      this.position = Math.max(this.startFrame, Math.min(this.endFrame - 1, message.position || 0));
      this.rate = Number.isFinite(message.rate) ? message.rate : 1;
      this.rateTarget = this.rate;
      this.rateStep = 0;
      this.rateFramesLeft = 0;
      this.loop = Boolean(message.loop);
      this.scrubbing = false;
      this.boundaryEdge = null;
      this.stopping = false;
      this.active = true;
      this.resetSignalState();
      this.setGain(1, message.fadeFrames || 1);
      this.report(true);
      return;
    }
    if (message.type === "stop") {
      this.stopping = true;
      this.setGain(0, message.fadeFrames || 1);
      return;
    }
    if (message.type === "set-rate") {
      this.scrubbing = Boolean(message.scrubbing);
      const requestedRate = Number.isFinite(message.rate) ? message.rate : 0;
      if (!this.active && this.length && requestedRate !== 0) {
        this.active = true;
        this.stopping = false;
        if (this.gain === 0) this.setGain(1, message.rampFrames || 1);
      }
      this.setRateTarget(requestedRate, message.rampFrames);
    }
  }

  setRateTarget(rate, frames) {
    this.rateTarget = rate;
    const rampFrames = Math.max(
      1,
      Math.round(frames || sampleRate * DEFAULT_RATE_RAMP_SECONDS)
    );
    if (Math.abs(this.rateTarget - this.rate) < 1e-9) {
      this.rate = this.rateTarget;
      this.rateStep = 0;
      this.rateFramesLeft = 0;
      return;
    }
    // Preserve the current rate and continue from it. Unlike restarting an
    // eased curve, this does not stall the pitch slope on every pointer sample.
    this.rateFramesLeft = rampFrames;
    this.rateStep = (this.rateTarget - this.rate) / rampFrames;
  }

  resetSignalState() {
    this.motionGain = Math.abs(this.rate) < MOTION_EPSILON ? 0 : 1;
    this.dcPrevIn.fill(0);
    this.dcPrevOut.fill(0);
    this.lpfState.fill(0);
  }

  setGain(target, frames) {
    this.gainTarget = target;
    this.gainFramesLeft = Math.max(1, Math.round(frames));
  }

  stepGain() {
    if (this.gainFramesLeft <= 0) return;
    this.gain += (this.gainTarget - this.gain) / this.gainFramesLeft;
    this.gainFramesLeft -= 1;
    if (this.gainFramesLeft === 0) this.gain = this.gainTarget;
  }

  sample(channel, position, lowerBound = 0, upperBound = this.length) {
    const data = this.channels[Math.min(channel, this.channels.length - 1)];
    if (!data || !this.length) return 0;
    const first = Math.max(0, Math.min(this.length - 1, Math.floor(lowerBound)));
    const last = Math.max(first, Math.min(this.length - 1, Math.ceil(upperBound) - 1));
    const index = Math.max(first, Math.min(last, Math.floor(position)));
    const mix = position - index;
    const p0 = data[Math.max(first, index - 1)];
    const p1 = data[index];
    const p2 = data[Math.min(last, index + 1)];
    const p3 = data[Math.min(last, index + 2)];
    // Four-point Hermite interpolation avoids the grainy/warbling edge that
    // linear interpolation produces while continuously changing tape speed.
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    return ((a * mix + b) * mix + c) * mix + p1;
  }

  loopCrossfadeFrames() {
    const span = Math.max(0, this.endFrame - this.startFrame);
    return Math.min(
      Math.round(sampleRate * LOOP_CROSSFADE_SECONDS),
      Math.floor(span / 4)
    );
  }

  report(force = false) {
    if (!force && this.reportCountdown > 0) return;
    // Keep the UI/audio anchor tight while the rate is moving, then fall back
    // to the cheaper steady-playback cadence.
    this.reportCountdown = this.scrubbing || this.rateFramesLeft > 0
      ? REPORT_FAST_FRAMES
      : REPORT_STEADY_FRAMES;
    this.port.postMessage({
      type: "position",
      position: this.position,
      rate: this.rate,
      rateTarget: this.rateTarget,
      rateFramesLeft: this.rateFramesLeft,
      active: this.active,
      audioTime: this.audioTime,
    });
  }

  finishAtBoundary(position) {
    this.position = position;
    this.active = false;
    this.gain = 0;
    this.gainFramesLeft = 0;
    this.port.postMessage({ type: "ended", position: this.position, rate: this.rate, audioTime: this.audioTime });
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const frameCount = output[0]?.length || 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      this.audioTime = (currentFrame + frame) / sampleRate;
      if (!this.active || !this.length) continue;

      if (this.position < this.startFrame || this.position >= this.endFrame) {
        if (this.scrubbing) {
          const edge = this.position < this.startFrame ? "start" : "end";
          this.position = edge === "start"
            ? this.startFrame
            : Math.max(this.startFrame, this.endFrame - 1);
          this.rate = 0;
          this.rateTarget = 0;
          this.rateStep = 0;
          this.rateFramesLeft = 0;
          if (this.boundaryEdge !== edge) {
            this.boundaryEdge = edge;
            this.port.postMessage({
              type: "scrub-boundary",
              edge,
              position: this.position,
              rate: this.rate,
              audioTime: this.audioTime,
            });
          }
        } else if (this.loop && this.rate > 0) {
          const crossfadeFrames = this.loopCrossfadeFrames();
          const loopStart = this.startFrame + crossfadeFrames;
          const loopSpan = Math.max(1, this.endFrame - loopStart);
          this.position = loopStart + ((this.position - this.endFrame) % loopSpan + loopSpan) % loopSpan;
        } else {
          this.finishAtBoundary(this.rate < 0 ? this.startFrame : this.endFrame);
          continue;
        }
      } else if (
        this.position > this.startFrame + 1
        && this.position < this.endFrame - 2
      ) {
        this.boundaryEdge = null;
      }

      this.stepGain();

      // Linear audio-rate interpolation remains continuous even when targets
      // are updated faster than the ramp duration.
      if (this.rateFramesLeft > 0) {
        this.rate += this.rateStep;
        this.rateFramesLeft -= 1;
        if (this.rateFramesLeft === 0) {
          this.rate = this.rateTarget;
          this.rateStep = 0;
        }
      }

      const absRate = Math.abs(this.rate);

      // Smooth continuous analog tape-head induction curve
      const motionTarget = absRate < MOTION_EPSILON ? 0 : Math.tanh(absRate / MOTION_RATE_SCALE);
      const motionSlew = 1 - Math.exp(-1 / (sampleRate * MOTION_GAIN_TIME_CONSTANT));
      this.motionGain += (motionTarget - this.motionGain) * motionSlew;

      // Anti-aliasing cutoff for high-speed scrub
      const antiAliasCutoff = absRate > 1.0
        ? Math.max(
          MIN_SCRUB_FILTER_CUTOFF,
          Math.min(MAX_FILTER_CUTOFF, MAX_FILTER_CUTOFF / absRate)
        )
        : MAX_FILTER_CUTOFF;
      const lpfAlpha = antiAliasCutoff < MAX_FILTER_CUTOFF
        ? 1 - Math.exp(-2 * Math.PI * antiAliasCutoff / sampleRate)
        : 1.0;

      for (let channel = 0; channel < output.length; channel += 1) {
        let rawSample = this.sample(channel, this.position, this.startFrame, this.endFrame);
        const crossfadeFrames = this.loop && this.rate > 0 && !this.scrubbing
          ? this.loopCrossfadeFrames()
          : 0;
        const crossfadeStart = this.endFrame - crossfadeFrames;
        if (crossfadeFrames > 0 && this.position >= crossfadeStart) {
          const mix = Math.min(1, Math.max(0, (this.position - crossfadeStart) / crossfadeFrames));
          const incomingPosition = this.startFrame + (this.position - crossfadeStart);
          const incomingSample = this.sample(channel, incomingPosition, this.startFrame, this.endFrame);
          rawSample += (incomingSample - rawSample) * mix;
        }

        // Apply anti-aliasing filter during fast scrub
        if (this.lpfState[channel] === undefined) this.lpfState[channel] = 0;
        if (lpfAlpha < 1.0) {
          this.lpfState[channel] += lpfAlpha * (rawSample - this.lpfState[channel]);
          rawSample = this.lpfState[channel];
        } else {
          this.lpfState[channel] = rawSample;
        }

        const gainedSample = rawSample * this.gain * this.motionGain;

        // Very-low-cut DC blocker. The previous ~6 Hz corner distorted audio
        // that had legitimately been shifted into the sub-bass by slow tape.
        if (this.dcPrevIn[channel] === undefined) this.dcPrevIn[channel] = 0;
        if (this.dcPrevOut[channel] === undefined) this.dcPrevOut[channel] = 0;
        const dcOut = gainedSample
          - this.dcPrevIn[channel]
          + DC_BLOCK_COEFFICIENT * this.dcPrevOut[channel];
        this.dcPrevIn[channel] = gainedSample;
        this.dcPrevOut[channel] = dcOut;

        output[channel][frame] = dcOut;
      }

      this.position += this.rate;

      if (this.stopping && this.gain === 0) {
        this.active = false;
        this.stopping = false;
        this.port.postMessage({ type: "stopped", position: this.position, rate: this.rate, audioTime: this.audioTime });
      }
      this.reportCountdown -= 1;
      this.report();
    }
    return true;
  }
}

registerProcessor("tape-transport-processor", TapeTransportProcessor);
