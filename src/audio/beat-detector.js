(function installBeatDetector(root) {
  const MIN_BPM = 60;
  const MAX_BPM = 195;
  const DEFAULT_BPM = 120;
  const HOP_MS = 5;
  const FRAME_MS = 10;
  const SNAP_THRESHOLD_MS = 120;

  function createBiquadCoefficients(type, cutoffHz, sampleRate, q = 0.7071) {
    const omega = (2 * Math.PI * cutoffHz) / sampleRate;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2 * q);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    const a0 = 1 + alpha;
    const a1 = -2 * cosOmega;
    const a2 = 1 - alpha;

    if (type === "lowpass") {
      b0 = (1 - cosOmega) / 2;
      b1 = 1 - cosOmega;
      b2 = (1 - cosOmega) / 2;
    } else if (type === "highpass") {
      b0 = (1 + cosOmega) / 2;
      b1 = -(1 + cosOmega);
      b2 = (1 + cosOmega) / 2;
    }

    return {
      b0: b0 / a0,
      b1: b1 / a0,
      b2: b2 / a0,
      a1: a1 / a0,
      a2: a2 / a0,
    };
  }

  function applyBiquad(data, coeffs) {
    const len = data.length;
    const out = new Float32Array(len);
    const { b0, b1, b2, a1, a2 } = coeffs;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let i = 0; i < len; i += 1) {
      const x0 = data[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    return out;
  }

  function downmixMono(buffer) {
    if (!buffer || !buffer.length) return new Float32Array(0);
    const channels = buffer.numberOfChannels || 1;
    const len = buffer.length;
    const mono = new Float32Array(len);

    if (channels === 1) {
      mono.set(buffer.getChannelData(0));
      return mono;
    }

    const c0 = buffer.getChannelData(0);
    const c1 = buffer.getChannelData(1);
    for (let i = 0; i < len; i += 1) {
      mono[i] = (c0[i] + c1[i]) * 0.5;
    }
    return mono;
  }

  function computeOnsetCurve(mono, sampleRate) {
    const hopSamples = Math.max(1, Math.round((sampleRate * HOP_MS) / 1000));
    const frameSamples = Math.max(hopSamples, Math.round((sampleRate * FRAME_MS) / 1000));
    const numFrames = Math.max(1, Math.floor((mono.length - frameSamples) / hopSamples));

    // Low-pass (<180 Hz) for kick/bass pulse and high-pass (>1200 Hz) for snares/percussion
    const lpCoeffs = createBiquadCoefficients("lowpass", 180, sampleRate);
    const hpCoeffs = createBiquadCoefficients("highpass", 1200, sampleRate);

    const lowSignal = applyBiquad(mono, lpCoeffs);
    const highSignal = applyBiquad(mono, hpCoeffs);

    const lowEnergy = new Float32Array(numFrames);
    const highEnergy = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f += 1) {
      const start = f * hopSamples;
      let sumLow = 0;
      let sumHigh = 0;
      for (let s = 0; s < frameSamples; s += 1) {
        const idx = start + s;
        const lVal = lowSignal[idx];
        const hVal = highSignal[idx];
        sumLow += lVal * lVal;
        sumHigh += hVal * hVal;
      }
      lowEnergy[f] = Math.sqrt(sumLow / frameSamples);
      highEnergy[f] = Math.sqrt(sumHigh / frameSamples);
    }

    // Half-wave rectified flux
    const flux = new Float32Array(numFrames);
    for (let f = 1; f < numFrames; f += 1) {
      const dLow = Math.max(0, lowEnergy[f] - lowEnergy[f - 1]);
      const dHigh = Math.max(0, highEnergy[f] - highEnergy[f - 1]);
      flux[f] = 0.65 * dLow + 0.35 * dHigh;
    }

    // Adaptive threshold: subtract local running mean (window ~160 ms = 32 frames)
    const normalized = new Float32Array(numFrames);
    const halfWin = 16;
    let maxFlux = 0;
    for (let f = 0; f < numFrames; f += 1) {
      let localSum = 0;
      let count = 0;
      const wStart = Math.max(0, f - halfWin);
      const wEnd = Math.min(numFrames, f + halfWin + 1);
      for (let w = wStart; w < wEnd; w += 1) {
        localSum += flux[w];
        count += 1;
      }
      const mean = count > 0 ? localSum / count : 0;
      const val = Math.max(0, flux[f] - mean);
      normalized[f] = val;
      if (val > maxFlux) maxFlux = val;
    }

    if (maxFlux > 1e-6) {
      for (let f = 0; f < numFrames; f += 1) {
        normalized[f] /= maxFlux;
      }
    }

    return {
      onsetCurve: normalized,
      lowEnergy,
      hopSamples,
      frameSamples,
      hopRate: sampleRate / hopSamples,
    };
  }

  function estimateTempo(onsetCurve, hopRate) {
    const numFrames = onsetCurve.length;
    if (numFrames < 40) {
      return { bpm: DEFAULT_BPM, confidence: 0 };
    }

    const minLag = Math.max(2, Math.floor((hopRate * 60) / MAX_BPM));
    const maxLag = Math.min(numFrames - 2, Math.ceil((hopRate * 60) / MIN_BPM));
    if (maxLag <= minLag) {
      return { bpm: DEFAULT_BPM, confidence: 0 };
    }

    const autocorr = new Float32Array(maxLag + 1);
    let bestLag = minLag;
    let bestVal = -Infinity;
    let sumEnergy = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let sum = 0;
      const span = numFrames - lag;
      for (let i = 0; i < span; i += 1) {
        sum += onsetCurve[i] * onsetCurve[i + lag];
      }
      const val = span > 0 ? sum / span : 0;
      autocorr[lag] = val;
      sumEnergy += val;

      // Broad musical prior weighting around 120 BPM (preferring 85-145 BPM)
      const bpmCandidate = (60 * hopRate) / lag;
      const prior = Math.exp(-0.5 * (((bpmCandidate - 120) / 45) ** 2));
      const weighted = val * (0.65 + 0.35 * prior);

      if (weighted > bestVal) {
        bestVal = weighted;
        bestLag = lag;
      }
    }

    // Check octave multiples (half / double tempo preference)
    const doubleLag = Math.round(bestLag / 2);
    if (doubleLag >= minLag) {
      const doubleVal = autocorr[doubleLag] || 0;
      const currentBpm = (60 * hopRate) / bestLag;
      // If current tempo is very slow (<75) and double tempo is strong, prefer double
      if (currentBpm < 75 && doubleVal > autocorr[bestLag] * 0.75) {
        bestLag = doubleLag;
      }
    }

    // Parabolic interpolation for fractional lag
    let refinedLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const alpha = autocorr[bestLag - 1];
      const beta = autocorr[bestLag];
      const gamma = autocorr[bestLag + 1];
      const denom = alpha - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-6) {
        const delta = (alpha - gamma) / (2 * denom);
        if (Math.abs(delta) < 1) {
          refinedLag = bestLag + delta;
        }
      }
    }

    const rawBpm = (60 * hopRate) / refinedLag;
    const clampedBpm = Math.min(MAX_BPM, Math.max(MIN_BPM, rawBpm));
    const roundedBpm = Number(clampedBpm.toFixed(1));
    const avgVal = sumEnergy / Math.max(1, maxLag - minLag + 1);
    const confidence = avgVal > 0 ? Math.min(1, Math.max(0, (autocorr[bestLag] - avgVal) / (autocorr[bestLag] + 1e-5))) : 0;

    return { bpm: roundedBpm, confidence };
  }

  function findBeatGrid(onsetCurve, lowEnergy, hopRate, bpm, durationMs) {
    const beatIntervalSec = 60 / bpm;
    const beatIntervalMs = beatIntervalSec * 1000;
    const beatIntervalFrames = beatIntervalSec * hopRate;
    const numFrames = onsetCurve.length;

    // Search phase offset phi within [0, beatIntervalFrames)
    const phaseSteps = Math.min(Math.round(beatIntervalFrames), 40);
    let bestPhase = 0;
    let maxPhaseScore = -1;

    for (let s = 0; s < phaseSteps; s += 1) {
      const phi = (s / phaseSteps) * beatIntervalFrames;
      let score = 0;
      let count = 0;
      for (let f = phi; f < numFrames; f += beatIntervalFrames) {
        const idx = Math.round(f);
        if (idx < numFrames) {
          score += onsetCurve[idx];
          count += 1;
        }
      }
      if (count > 0 && score > maxPhaseScore) {
        maxPhaseScore = score;
        bestPhase = phi;
      }
    }

    // Generate initial beat positions
    const beats = [];
    const searchFrameRadius = Math.max(1, Math.round(0.025 * hopRate)); // +/-25 ms

    for (let f = bestPhase; f < numFrames; f += beatIntervalFrames) {
      const centerFrame = Math.round(f);
      let peakFrame = centerFrame;
      let peakVal = onsetCurve[centerFrame] || 0;

      const rStart = Math.max(0, centerFrame - searchFrameRadius);
      const rEnd = Math.min(numFrames - 1, centerFrame + searchFrameRadius);
      for (let k = rStart; k <= rEnd; k += 1) {
        if (onsetCurve[k] > peakVal) {
          peakVal = onsetCurve[k];
          peakFrame = k;
        }
      }

      const beatMs = (peakFrame / hopRate) * 1000;
      if (beatMs <= durationMs) {
        beats.push(Math.round(beatMs));
      }
    }

    if (beats.length === 0) {
      beats.push(0);
    }

    // Determine Bar 1 downbeat (assuming 4/4 meter): find which beat phase has highest low-end kick energy
    let bestBarPhase = 0;
    let maxKickScore = -1;
    for (let p = 0; p < 4; p += 1) {
      let kickScore = 0;
      let count = 0;
      for (let b = p; b < beats.length; b += 4) {
        const fIdx = Math.min(lowEnergy.length - 1, Math.round((beats[b] / 1000) * hopRate));
        kickScore += lowEnergy[fIdx] || 0;
        count += 1;
      }
      if (count > 0 && kickScore > maxKickScore) {
        maxKickScore = kickScore;
        bestBarPhase = p;
      }
    }

    const bars = [];
    for (let b = bestBarPhase; b < beats.length; b += 4) {
      bars.push(beats[b]);
    }

    return {
      beats,
      bars,
      downbeatMs: bars[0] !== undefined ? bars[0] : beats[0] || 0,
      beatIntervalMs,
      barIntervalMs: beatIntervalMs * 4,
    };
  }

  function extractTransients(onsetCurve, hopRate, maxTransients = 64) {
    const transients = [];
    const len = onsetCurve ? onsetCurve.length : 0;
    if (len < 3) return transients;

    const threshold = 0.22;
    for (let i = 1; i < len - 1; i += 1) {
      const val = onsetCurve[i];
      if (val > threshold && val >= onsetCurve[i - 1] && val >= onsetCurve[i + 1]) {
        const timeMs = Math.round((i / hopRate) * 1000);
        transients.push({ timeMs, strength: val });
      }
    }

    transients.sort((a, b) => b.strength - a.strength);
    const top = transients.slice(0, maxTransients);
    top.sort((a, b) => a.timeMs - b.timeMs);
    return top.map((t) => t.timeMs);
  }

  function detectBeats(buffer) {
    if (!buffer || !buffer.length) {
      return {
        bpm: DEFAULT_BPM,
        confidence: 0,
        beatIntervalMs: 500,
        barIntervalMs: 2000,
        downbeatMs: 0,
        beats: [0],
        bars: [0],
        transients: [],
      };
    }

    const sampleRate = buffer.sampleRate || 44100;
    const durationMs = (buffer.length / sampleRate) * 1000;
    const mono = downmixMono(buffer);

    const { onsetCurve, lowEnergy, hopRate } = computeOnsetCurve(mono, sampleRate);
    const { bpm, confidence } = estimateTempo(onsetCurve, hopRate);
    const grid = findBeatGrid(onsetCurve, lowEnergy, hopRate, bpm, durationMs);
    const transients = extractTransients(onsetCurve, hopRate);

    return {
      bpm,
      confidence,
      beatIntervalMs: grid.beatIntervalMs,
      barIntervalMs: grid.barIntervalMs,
      downbeatMs: grid.downbeatMs,
      beats: grid.beats,
      bars: grid.bars,
      transients,
      durationMs,
    };
  }

  function snapToBeat(timeMs, beats, thresholdMs = SNAP_THRESHOLD_MS) {
    if (!beats || !beats.length || !Number.isFinite(timeMs)) {
      return { timeMs, beatIndex: -1, isBarStart: false };
    }

    let closestIdx = 0;
    let minDelta = Math.abs(timeMs - beats[0]);

    for (let i = 1; i < beats.length; i += 1) {
      const delta = Math.abs(timeMs - beats[i]);
      if (delta < minDelta) {
        minDelta = delta;
        closestIdx = i;
      }
    }

    if (minDelta <= thresholdMs) {
      return {
        timeMs: beats[closestIdx],
        beatIndex: closestIdx,
        isBarStart: closestIdx % 4 === 0,
      };
    }

    return { timeMs, beatIndex: -1, isBarStart: false };
  }

  function snapToZeroCrossing(buffer, timeMs, searchWindowMs = 15) {
    if (!buffer || !buffer.length || !Number.isFinite(timeMs)) {
      return Math.max(0, timeMs || 0);
    }
    const sampleRate = buffer.sampleRate || 44100;
    const totalFrames = buffer.length;
    const targetFrame = Math.max(0, Math.min(totalFrames - 1, Math.round((timeMs / 1000) * sampleRate)));
    const radiusFrames = Math.max(1, Math.round((searchWindowMs / 1000) * sampleRate));

    const channelData = buffer.getChannelData(0);
    const start = Math.max(1, targetFrame - radiusFrames);
    const end = Math.min(totalFrames - 1, targetFrame + radiusFrames);

    let bestCrossing = null;
    let minDistance = Infinity;

    for (let i = start; i <= end; i += 1) {
      if ((channelData[i - 1] <= 0 && channelData[i] > 0) || (channelData[i - 1] < 0 && channelData[i] >= 0)) {
        const crossingFrame = Math.abs(channelData[i - 1]) <= Math.abs(channelData[i]) ? i - 1 : i;
        const dist = Math.abs(crossingFrame - targetFrame);
        if (dist < minDistance) {
          minDistance = dist;
          bestCrossing = crossingFrame;
        }
      }
    }

    const finalFrame = bestCrossing !== null ? bestCrossing : targetFrame;
    return (finalFrame / sampleRate) * 1000;
  }

  function getBarLoop(startMs, barCount, beatData, totalDurationMs = Infinity) {
    const bars = beatData?.bars || [];
    const beats = beatData?.beats || [];
    const barIntervalMs = beatData?.barIntervalMs || (60000 / (beatData?.bpm || 120)) * 4;

    // Find nearest bar or beat to startMs
    let start = Math.max(0, startMs || 0);
    if (bars.length > 0) {
      const snap = snapToBeat(start, bars, barIntervalMs * 0.75);
      if (snap.beatIndex >= 0) {
        start = snap.timeMs;
      } else if (beats.length > 0) {
        const beatSnap = snapToBeat(start, beats, barIntervalMs * 0.25);
        if (beatSnap.beatIndex >= 0) start = beatSnap.timeMs;
      }
    }

    const duration = barCount * barIntervalMs;
    let end = start + duration;

    // If end exceeds track length, shift backwards to fit
    if (Number.isFinite(totalDurationMs) && end > totalDurationMs) {
      end = totalDurationMs;
      start = Math.max(0, end - duration);
      // Re-snap start to nearest bar if possible
      if (bars.length > 0) {
        const snap = snapToBeat(start, bars, barIntervalMs * 0.4);
        if (snap.beatIndex >= 0) {
          start = snap.timeMs;
          end = Math.min(totalDurationMs, start + duration);
        }
      }
    }

    return {
      start: Math.round(start),
      end: Math.round(end),
      durationMs: Math.round(end - start),
      barCount,
    };
  }

  function findPrevBeat(timeMs, beats) {
    if (!beats || !beats.length) return 0;
    const target = Number.isFinite(timeMs) ? timeMs : 0;
    for (let i = beats.length - 1; i >= 0; i -= 1) {
      if (beats[i] < target - 2) return beats[i];
    }
    return beats[0];
  }

  function findNextBeat(timeMs, beats) {
    if (!beats || !beats.length) return 0;
    const target = Number.isFinite(timeMs) ? timeMs : 0;
    for (let i = 0; i < beats.length; i += 1) {
      if (beats[i] > target + 2) return beats[i];
    }
    return beats[beats.length - 1];
  }

  function formatMusicalLength(durationMs, beatIntervalMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !beatIntervalMs || beatIntervalMs <= 0) {
      return "";
    }
    const barIntervalMs = beatIntervalMs * 4;
    const bars = durationMs / barIntervalMs;
    const roundedBars = Math.round(bars * 10) / 10;
    if (Math.abs(bars - Math.round(bars)) < 0.08) {
      const wholeBars = Math.round(bars);
      return wholeBars === 1 ? "1 BAR" : `${wholeBars} BARS`;
    }
    const totalBeats = Math.round(durationMs / beatIntervalMs);
    if (totalBeats > 0 && Math.abs(durationMs - totalBeats * beatIntervalMs) < beatIntervalMs * 0.15) {
      const wholeBars = Math.floor(totalBeats / 4);
      const remBeats = totalBeats % 4;
      if (wholeBars > 0 && remBeats > 0) {
        return `${wholeBars} BAR ${remBeats}b`;
      }
      return `${totalBeats} BEATS`;
    }
    return `${roundedBars.toFixed(1)} BARS`;
  }

  function autoDetectLoop(beatData, totalDurationMs, preferredBars = 2, candidateIndex = 0) {
    const bars = beatData?.bars || [];
    const barIntervalMs = beatData?.barIntervalMs || (60000 / (beatData?.bpm || 120)) * 4;
    const dur = Number.isFinite(totalDurationMs) ? totalDurationMs : bars[bars.length - 1] || 10000;

    // Pick how many bars can fit
    let barCount = preferredBars;
    if (barCount * barIntervalMs > dur && barCount > 1) {
      barCount = barCount >= 4 ? 2 : 1;
    }
    if (barCount * barIntervalMs > dur) {
      barCount = 1;
    }

    if (bars.length === 0) {
      return getBarLoop(0, barCount, beatData, dur);
    }

    // Filter candidate bars that can fit barCount within track duration
    const validCandidates = [];
    for (let i = 0; i < bars.length; i += 1) {
      if (bars[i] + barCount * barIntervalMs <= dur + barIntervalMs * 0.25) {
        validCandidates.push(bars[i]);
      }
    }

    const pool = validCandidates.length > 0 ? validCandidates : bars;
    const index = Math.abs(Math.floor(candidateIndex || 0)) % pool.length;
    const start = pool[index];
    return getBarLoop(start, barCount, beatData, dur);
  }

  root.SamplaBeatDetector = Object.freeze({
    detectBeats,
    estimateTempo,
    findBeatGrid,
    snapToBeat,
    snapToZeroCrossing,
    getBarLoop,
    autoDetectLoop,
    findPrevBeat,
    findNextBeat,
    formatMusicalLength,
    extractTransients,
    MIN_BPM,
    MAX_BPM,
    DEFAULT_BPM,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
