export const SAMPLE_RATE = 44100;
export const SEGMENT_FRAMES = 343980;
export const MAX_SECONDS = 30;
export const STEM_NAMES = ["vocals", "drums", "bass", "other"];
const MODEL_STEM_INDEX = [3, 0, 1, 2];

// The default optimizer/prepacking path exhausts WASM memory when loading
// this model. These settings are also exercised by the real-model smoke test.
export function sessionOptions(executionProviders = ["wasm"]) {
  return {
    executionProviders,
    graphOptimizationLevel: "disabled",
    enableCpuMemArena: false,
    enableMemPattern: false,
    extra: { session: { disable_prepacking: "1" } },
  };
}

// Infer one fixed-size segment at a time. HTDemucs rows are drums, bass,
// other, vocals; the public order keeps vocals first for Sampla's UI.
export async function separateStems(channels, infer, {
  segmentFrames = SEGMENT_FRAMES,
  shifts = [0],
  onProgress = () => {},
} = {}) {
  const frames = channels?.[0]?.length;
  if (channels?.length !== 2 || !frames || channels[1].length !== frames ||
      frames > SAMPLE_RATE * MAX_SECONDS || channels.some((c) => !c.every(Number.isFinite))) {
    throw new Error(`Choose a valid stereo recording up to ${MAX_SECONDS} seconds.`);
  }
  const inferenceShifts = [...new Set(shifts)].filter((shift) =>
    Number.isInteger(shift) && shift >= 0 && shift < segmentFrames
  );
  if (!inferenceShifts.length || inferenceShifts[0] !== 0) {
    throw new Error("Stem inference must include an unshifted pass.");
  }
  const overlap = Math.floor(segmentFrames / 4);
  const stride = segmentFrames - overlap;
  const count = Math.max(1, Math.ceil((frames - segmentFrames) / stride) + 1);
  const stems = STEM_NAMES.map(() => [new Float32Array(frames), new Float32Array(frames)]);
  const weights = new Float32Array(frames);
  const input = new Float32Array(segmentFrames * 2);
  for (let chunk = 0; chunk < count; chunk++) {
    const start = chunk * stride;
    const length = Math.min(segmentFrames, frames - start);
    for (const shift of inferenceShifts) {
      const usable = Math.min(length, segmentFrames - shift);
      input.fill(0);
      for (let c = 0; c < 2; c++) {
        input.set(channels[c].subarray(start, start + usable), c * segmentFrames + shift);
      }
      onProgress((chunk * inferenceShifts.length + inferenceShifts.indexOf(shift)) /
        (count * inferenceShifts.length), { chunk: chunk + 1, count, running: true });
      const prediction = await infer(input);
      try {
        if (prediction.data.length !== 8 * segmentFrames) throw new Error("Unexpected stem model output.");
        for (let i = 0; i < usable; i++) {
          const validPasses = inferenceShifts.reduce((sum, candidate) =>
            sum + Number(i + candidate < segmentFrames), 0);
          // Positive endpoint weights preserve the very first and last samples.
          const weight = Math.min(1, (i + 1) / Math.max(1, overlap), (segmentFrames - i) / Math.max(1, overlap));
          weights[start + i] += weight / validPasses;
          for (let c = 0; c < 2; c++) {
            const at = c * segmentFrames + i + shift;
            for (let stem = 0; stem < STEM_NAMES.length; stem++) {
              const value = prediction.data[MODEL_STEM_INDEX[stem] * 2 * segmentFrames + at];
              if (!Number.isFinite(value)) throw new Error("The model returned invalid audio.");
              stems[stem][c][start + i] += value * weight / validPasses;
            }
          }
        }
      } finally {
        prediction.dispose?.();
      }
      onProgress((chunk * inferenceShifts.length + inferenceShifts.indexOf(shift) + 1) /
        (count * inferenceShifts.length));
    }
  }
  // Project the model outputs back onto the source mixture. This is the
  // least-squares correction that makes the four floating-point stems sum
  // exactly to the input before export gain and PCM rounding.
  for (const stem of stems) for (const channel of stem) for (let i = 0; i < frames; i++) {
    channel[i] /= weights[i];
  }
  for (let c = 0; c < 2; c++) for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (const stem of stems) sum += stem[c][i];
    const correction = (channels[c][i] - sum) / stems.length;
    for (const stem of stems) stem[c][i] += correction;
  }
  let peak = 0;
  for (const stem of stems) for (const channel of stem) for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(channel[i]));
  }
  // One shared gain avoids WAV clipping without changing relative stem levels.
  const gain = peak > 1 ? 0.99 / peak : 1;
  if (gain < 1) for (const stem of stems) for (const channel of stem) {
    for (let i = 0; i < frames; i++) channel[i] *= gain;
  }
  return { stems, gain };
}
