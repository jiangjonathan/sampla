(() => {
  function toWavBlob(buffer, startMs = 0, endMs = buffer?.duration * 1000) {
    if (!buffer) throw new TypeError("Audio buffer is required");
    const safeStartMs = Number.isFinite(startMs) ? Math.max(0, startMs) : 0;
    const safeEndMs = Number.isFinite(endMs)
      ? Math.max(safeStartMs, Math.min(buffer.duration * 1000, endMs))
      : buffer.duration * 1000;
    const startFrame = Math.max(0, Math.floor((safeStartMs / 1000) * buffer.sampleRate));
    const endFrame = Math.min(buffer.length, Math.ceil((safeEndMs / 1000) * buffer.sampleRate));
    const frames = Math.max(0, endFrame - startFrame);
    const channels = buffer.numberOfChannels;
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
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, dataSize, true);
    const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([output], { type: "audio/wav" });
  }

  function filename(name) {
    const safe = (name || "sampla-recording")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "sampla-recording";
    return `${safe}.wav`;
  }

  async function save(record, audioContext) {
    const bytes = await record.blob.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(bytes.slice(0));
    const start = Math.max(0, record.cropStartMs || 0);
    const end = Math.min(buffer.duration * 1000, record.cropEndMs || buffer.duration * 1000);
    const url = URL.createObjectURL(toWavBlob(buffer, start, end));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename(record.name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.SamplaAudioExport = { save, toWavBlob };
})();
