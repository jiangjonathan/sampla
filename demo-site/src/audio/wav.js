export function encodeWav(buffer, startSec = 0, endSec = buffer.duration) {
  const start = Math.max(0, startSec);
  const end = Math.max(start, Math.min(buffer.duration, endSec));
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const startFrame = Math.floor(start * sampleRate);
  const endFrame = Math.ceil(end * sampleRate);
  const frames = Math.max(0, endFrame - startFrame);
  const dataSize = frames * channels * 2;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

export function downloadWav(buffer, { start = 0, end = buffer.duration, name = "sampla-clip" } = {}) {
  const blob = encodeWav(buffer, start, end);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safe = (name || "sampla-clip").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "sampla-clip";
  link.href = url;
  link.download = `${safe}.wav`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function peaksFromBuffer(buffer, binMs = 10) {
  const data = buffer.getChannelData(0);
  const binSize = Math.max(1, Math.floor((buffer.sampleRate * binMs) / 1000));
  const peaks = new Float32Array(Math.ceil(data.length / binSize));
  for (let i = 0, p = 0; i < data.length; i += binSize, p += 1) {
    let peak = 0;
    const end = Math.min(data.length, i + binSize);
    for (let j = i; j < end; j += 1) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks[p] = peak;
  }
  return peaks;
}
