(function installAudioBufferOps(root) {
  const DEFAULT_BIN_MS = 10;
  const DEFAULT_CROP_MIN_MS = 40;

  function createBuffer(channels, length, sampleRate, audioCtx) {
    if (audioCtx && typeof audioCtx.createBuffer === "function") {
      return audioCtx.createBuffer(channels, length, sampleRate);
    }
    const safeLen = Math.max(1, length);
    const channelData = Array.from({ length: channels }, () => new Float32Array(safeLen));
    return {
      numberOfChannels: channels,
      length: safeLen,
      sampleRate,
      duration: safeLen / sampleRate,
      getChannelData(c) {
        return channelData[c];
      },
    };
  }

  function invertBuffer(buffer, audioCtx) {
    const output = createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate, audioCtx);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const input = buffer.getChannelData(channel);
      const result = output.getChannelData(channel);
      result.set(input);
      result.reverse();
    }
    return output;
  }

  function copyBufferRange(buffer, startFrame, endFrame, audioCtx) {
    const len = Math.max(1, endFrame - startFrame);
    const output = createBuffer(buffer.numberOfChannels, len, buffer.sampleRate, audioCtx);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      output.getChannelData(channel).set(buffer.getChannelData(channel).subarray(startFrame, endFrame));
    }
    return output;
  }

  function adaptBufferFormat(buffer, channels, sampleRate, audioCtx) {
    if (buffer.numberOfChannels === channels && buffer.sampleRate === sampleRate) return buffer;
    const length = Math.max(1, Math.round(buffer.duration * sampleRate));
    const output = createBuffer(channels, length, sampleRate, audioCtx);
    const ratio = buffer.sampleRate / sampleRate;
    for (let channel = 0; channel < channels; channel += 1) {
      const input = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
      const result = output.getChannelData(channel);
      for (let frame = 0; frame < length; frame += 1) {
        const at = Math.min(input.length - 1, frame * ratio);
        const left = Math.floor(at);
        const right = Math.min(input.length - 1, left + 1);
        const mix = at - left;
        result[frame] = input[left] * (1 - mix) + input[right] * mix;
      }
    }
    return output;
  }

  function replaceBufferRange(buffer, startFrame, endFrame, replacement, audioCtx) {
    const outputLength = startFrame + replacement.length + (buffer.length - endFrame);
    const output = createBuffer(buffer.numberOfChannels, outputLength, buffer.sampleRate, audioCtx);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const input = buffer.getChannelData(channel);
      const insert = replacement.getChannelData(channel);
      const result = output.getChannelData(channel);
      result.set(input.subarray(0, startFrame));
      result.set(insert, startFrame);
      result.set(input.subarray(endFrame), startFrame + replacement.length);
    }
    return output;
  }

  function copyEditedBuffer(buffer, startFrame, endFrame, operation, amount = 1, audioCtx) {
    const removedFrames = operation === "cut" ? endFrame - startFrame : 0;
    const output = createBuffer(
      buffer.numberOfChannels,
      buffer.length - removedFrames,
      buffer.sampleRate,
      audioCtx
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const input = buffer.getChannelData(channel);
      const result = output.getChannelData(channel);
      if (operation === "cut") {
        result.set(input.subarray(0, startFrame));
        result.set(input.subarray(endFrame), startFrame);
        const fadeFrames = Math.min(
          Math.round(buffer.sampleRate * 0.003),
          startFrame,
          result.length - startFrame
        );
        for (let frame = 0; frame < fadeFrames; frame += 1) {
          result[startFrame - fadeFrames + frame] *= (fadeFrames - frame) / fadeFrames;
          result[startFrame + frame] *= (frame + 1) / fadeFrames;
        }
        continue;
      }
      result.set(input);
      if (operation === "reverse") {
        for (let left = startFrame, right = endFrame - 1; left < right; left += 1, right -= 1) {
          const value = result[left];
          result[left] = result[right];
          result[right] = value;
        }
      } else if (operation === "gain") {
        for (let frame = startFrame; frame < endFrame; frame += 1) {
          result[frame] *= amount;
        }
      } else if (operation === "silence") {
        result.fill(0, startFrame, endFrame);
      } else if (operation === "fade-in" || operation === "fade-out") {
        const span = Math.max(1, endFrame - startFrame - 1);
        for (let frame = startFrame; frame < endFrame; frame += 1) {
          const progress = (frame - startFrame) / span;
          result[frame] *= operation === "fade-in" ? progress : 1 - progress;
        }
      }
    }
    return output;
  }

  function normalizationAmount(buffer, startFrame, endFrame) {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        peak = Math.max(peak, Math.abs(data[frame]));
      }
    }
    return peak > 0.000001 ? 10 ** (-1 / 20) / peak : null;
  }

  function resampleBufferSpeed(buffer, speed, audioCtx) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const inputLength = buffer.length;
    const outputLength = Math.max(1, Math.round(inputLength / speed));
    const output = createBuffer(channels, outputLength, sampleRate, audioCtx);
    const ratio = inputLength / outputLength;
    for (let channel = 0; channel < channels; channel += 1) {
      const input = buffer.getChannelData(channel);
      const result = output.getChannelData(channel);
      for (let frame = 0; frame < outputLength; frame += 1) {
        const at = Math.min(inputLength - 1, frame * ratio);
        const left = Math.floor(at);
        const right = Math.min(inputLength - 1, left + 1);
        const mix = at - left;
        result[frame] = input[left] * (1 - mix) + input[right] * mix;
      }
    }
    return output;
  }

  function parsePlaybackSpeed(raw) {
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    const clean = String(raw).trim().replace(/x$/i, "").trim();
    if (!clean) return null;
    const speed = parseFloat(clean);
    if (!Number.isFinite(speed) || speed <= 0) return null;
    return speed;
  }

  function formatPlaybackSpeed(speed) {
    const rounded = Number(speed.toFixed(3));
    return `${rounded}x`;
  }

  function peaksFromBuffer(buffer, binMs = DEFAULT_BIN_MS) {
    const durationMs = buffer.duration * 1000;
    const n = Math.max(1, Math.ceil(durationMs / binMs));
    const peaks = new Array(n);
    const sr = buffer.sampleRate;
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, channel) => buffer.getChannelData(channel)
    );
    for (let i = 0; i < n; i += 1) {
      const start = Math.floor((i * binMs * sr) / 1000);
      const end = Math.min(buffer.length, Math.floor(((i + 1) * binMs * sr) / 1000));
      let max = 0;
      for (let frame = start; frame < end; frame += 1) {
        for (let channel = 0; channel < channels.length; channel += 1) {
          const value = Math.abs(channels[channel][frame]);
          if (value > max) max = value;
        }
      }
      peaks[i] = max;
    }
    return peaks;
  }

  const PEAK_EPSILON = 1e-5;

  function peakInRange(peaks, startMs, endMs, binMs = DEFAULT_BIN_MS) {
    if (!peaks?.length || endMs <= 0 || startMs >= peaks.length * binMs) return 0;
    const first = Math.max(0, Math.floor((startMs + PEAK_EPSILON) / binMs));
    const last = Math.max(first, Math.min(peaks.length - 1, Math.ceil((endMs - PEAK_EPSILON) / binMs) - 1));
    let peak = 0;
    for (let i = first; i <= last; i += 1) {
      if ((peaks[i] || 0) > peak) peak = peaks[i];
    }
    return peak;
  }

  function quietEdgeBounds(buffer, binMs = DEFAULT_BIN_MS, minMs = DEFAULT_CROP_MIN_MS) {
    const durationMs = buffer.duration * 1000;
    const peaks = peaksFromBuffer(buffer, binMs);
    let loudest = 0;
    for (let i = 0; i < peaks.length; i += 1) {
      if (peaks[i] > loudest) loudest = peaks[i];
    }
    if (loudest < 0.015) return { start: 0, end: 0 };
    const threshold = Math.max(0.005, loudest * 0.04);
    let first = 0;
    while (first < peaks.length && peaks[first] < threshold) first += 1;
    let last = peaks.length - 1;
    while (last > first && peaks[last] < threshold) last -= 1;
    const padMs = 80;
    const start = Math.max(0, first * binMs - padMs);
    const end = Math.min(durationMs, (last + 1) * binMs + padMs);
    if (start <= 0 && end >= durationMs - 8) return { start: 0, end: 0 };
    if (end - start < minMs) return { start: 0, end: 0 };
    return { start, end };
  }

  function editMarkLabel(mark) {
    if (mark.type === "fade-in") return "FADE IN";
    if (mark.type === "fade-out") return "FADE OUT";
    if (mark.type === "gain") return `${mark.db > 0 ? "+" : ""}${Math.round(mark.db)}DB`;
    if (mark.type === "reverse") return "REV";
    if (mark.type === "speed") return "SPEED";
    if (mark.type === "paste") return "PASTE";
    if (mark.type === "cut") return "CUT";
    if (mark.type === "silence") return "SILENCE";
    return "EDIT";
  }

  function isPointMark(mark) {
    return mark?.type === "cut";
  }

  function rangeHasEdit(marks, start, end) {
    return marks.some((mark) => !isPointMark(mark) && end > mark.start && start < mark.end);
  }

  function gainAcrossSelection(marks, selection) {
    const gainMarks = marks.filter(
      (mark) => mark.type === "gain" && mark.end > selection.start && mark.start < selection.end
    );
    const points = [...new Set([
      selection.start,
      selection.end,
      ...gainMarks.flatMap((mark) => [
        Math.max(selection.start, mark.start),
        Math.min(selection.end, mark.end),
      ]),
    ])].sort((a, b) => a - b);
    const values = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const middle = (points[index] + points[index + 1]) / 2;
      values.push(gainMarks.reduce(
        (sum, mark) => sum + (middle >= mark.start && middle < mark.end ? mark.db : 0),
        0
      ));
    }
    return values.every((value) => Math.abs(value - values[0]) < 0.0001) ? (values[0] || 0) : "mixed";
  }

  function addGainMark(marks, start, end, db) {
    const gainMarks = marks.filter((mark) => mark.type === "gain");
    const otherMarks = marks.filter((mark) => mark.type !== "gain");
    const points = [...new Set([
      start,
      end,
      ...gainMarks.flatMap((mark) => [mark.start, mark.end]),
    ])].sort((a, b) => a - b);
    const next = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      if (right <= left) continue;
      const middle = (left + right) / 2;
      const previousDb = gainMarks.reduce(
        (sum, mark) => sum + (middle >= mark.start && middle < mark.end ? mark.db : 0),
        0
      );
      const nextDb = previousDb + (middle >= start && middle < end ? db : 0);
      if (Math.abs(nextDb) < 0.0001) continue;
      const prior = next[next.length - 1];
      if (prior && Math.abs(prior.db - nextDb) < 0.0001 && Math.abs(prior.end - left) < 0.01) {
        prior.end = right;
      } else {
        next.push({ type: "gain", start: left, end: right, db: nextDb });
      }
    }
    return [...otherMarks, ...next];
  }

  function markEditedRange(marks, operation, start, end, amount, tapeEndMs, minMs = DEFAULT_CROP_MIN_MS) {
    if (operation === "gain") {
      return addGainMark(marks, start, end, amount);
    }
    if (operation === "reverse") {
      const inverse = marks.findIndex((mark) =>
        mark.type === "reverse" && Math.abs(mark.start - start) < 0.01 && Math.abs(mark.end - end) < 0.01
      );
      const copy = [...marks];
      if (inverse >= 0) copy.splice(inverse, 1);
      else copy.push({ type: "reverse", start, end });
      return copy;
    }
    if (operation !== "cut") {
      return [...marks, { type: operation, start, end }];
    }
    const removedMs = end - start;
    const shifted = [];
    for (const mark of marks) {
      const markEnd = isPointMark(mark) ? mark.start : mark.end;
      if (markEnd <= start) shifted.push({ ...mark });
      else if (mark.start >= end) shifted.push({ ...mark, start: mark.start - removedMs, end: mark.end - removedMs });
      else if (!isPointMark(mark)) {
        if (mark.start < start) shifted.push({ ...mark, end: start });
        if (mark.end > end) shifted.push({ ...mark, start, end: mark.end - removedMs });
      }
    }
    const seam = Math.max(0, Math.min(tapeEndMs, start));
    return [
      ...shifted.filter((mark) => !(isPointMark(mark) && Math.abs(mark.start - seam) < 0.5)),
      { type: "cut", start: seam, end: seam },
    ];
  }

  function remapMarksForReplacement(marks, start, end, insertedMs, type) {
    const removedMs = end - start;
    const delta = insertedMs - removedMs;
    const shifted = [];
    for (const mark of marks) {
      if (mark.end <= start) shifted.push({ ...mark });
      else if (mark.start >= end) shifted.push({ ...mark, start: mark.start + delta, end: mark.end + delta });
      else {
        if (mark.start < start) shifted.push({ ...mark, end: start });
        if (mark.end > end) {
          shifted.push({ ...mark, start: start + insertedMs, end: mark.end + delta });
        }
      }
    }
    if (insertedMs > 0) shifted.push({ type, start, end: start + insertedMs });
    return shifted.filter((mark) => isPointMark(mark) || mark.end - mark.start >= 0.01);
  }

  function remapCropBounds(bounds, start, end, insertedMs, tapeEndMs) {
    const delta = insertedMs - (end - start);
    const mapStart = (value) => {
      if (value <= start) return value;
      if (value >= end) return value + delta;
      return start;
    };
    const mapEnd = (value) => {
      if (value < start) return value;
      if (value >= end) return value + delta;
      return start + insertedMs;
    };
    const nextStart = Math.max(0, mapStart(bounds.start));
    const nextEnd = Math.min(tapeEndMs, Math.max(nextStart, mapEnd(bounds.end)));
    return { start: nextStart, end: nextEnd };
  }

  root.SamplaBufferOps = Object.freeze({
    createBuffer,
    invertBuffer,
    copyBufferRange,
    adaptBufferFormat,
    replaceBufferRange,
    copyEditedBuffer,
    normalizationAmount,
    resampleBufferSpeed,
    parsePlaybackSpeed,
    formatPlaybackSpeed,
    peaksFromBuffer,
    peakInRange,
    quietEdgeBounds,
    editMarkLabel,
    isPointMark,
    rangeHasEdit,
    gainAcrossSelection,
    addGainMark,
    markEditedRange,
    remapMarksForReplacement,
    remapCropBounds,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
