class WaveProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const binMs = (options && options.processorOptions && options.processorOptions.binMs) || 10;
    this.framesPerBin = (sampleRate * binMs) / 1000;
    this.binSampleCount = 0;
    this.currentBin = 0;
    this.currentPeak = 0;
    this.pendingStartBin = 0;
    this.pendingPeaks = [];
    this.quantumCount = 0;

    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this.flush();
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const channelCount = input.length;
    const frameCount = input[0].length;

    for (let frame = 0; frame < frameCount; frame += 1) {
      let peak = 0;
      for (let ch = 0; ch < channelCount; ch += 1) {
        const val = Math.abs(input[ch][frame]);
        if (val > peak) peak = val;
      }
      if (peak > this.currentPeak) {
        this.currentPeak = peak;
      }

      this.binSampleCount += 1;
      if (this.binSampleCount >= this.framesPerBin) {
        if (this.pendingPeaks.length === 0) {
          this.pendingStartBin = this.currentBin;
        }
        this.pendingPeaks.push(this.currentPeak);
        this.currentBin += 1;
        this.currentPeak = 0;
        this.binSampleCount -= this.framesPerBin;
      }
    }

    this.quantumCount += 1;
    // Batch updates every ~20ms (~8 quantums at 128 frames) or whenever we have at least 2 bins
    if (this.quantumCount >= 8 || this.pendingPeaks.length >= 2) {
      this.flush();
    }

    return true;
  }

  flush() {
    this.quantumCount = 0;
    if (this.pendingPeaks.length > 0 || this.currentPeak > 0) {
      this.port.postMessage({
        startBin: this.pendingStartBin,
        peaks: this.pendingPeaks,
        currentBin: this.currentBin,
        currentPeak: this.currentPeak,
      });
      this.pendingPeaks = [];
      this.pendingStartBin = this.currentBin;
    }
  }
}

registerProcessor("wave-processor", WaveProcessor);
