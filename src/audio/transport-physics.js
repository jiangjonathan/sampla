(function installTransportPhysics(root) {
  function rateForMode(mode, windSpeed) {
    if (mode === "ffwd") return windSpeed;
    if (mode === "rev") return -windSpeed;
    if (mode === "play" || mode === "record") return 1;
    return 0;
  }

  function nextScrubPosition(options) {
    const candidateMs = Number.isFinite(options.audioPositionMs)
      ? options.audioPositionMs
      : options.currentMs + options.rate * options.dt * 1000;
    return Math.max(options.startMs, Math.min(options.endMs, candidateMs));
  }

  root.SamplaTransportPhysics = Object.freeze({ rateForMode, nextScrubPosition });
})(globalThis);
