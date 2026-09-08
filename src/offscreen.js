let mediaStream = null;
let micStream = null;
let audioContext = null;
let playbackGain = null;
let mediaRecorder = null;
let recordedChunks = [];
let peakInterval = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OFFSCREEN_START_CAPTURE") {
    (async () => {
      try {
        cleanupCapture();

        // Have the output clock running before tabCapture takes ownership of
        // the tab's audio. This minimizes the native-output handoff gap.
        audioContext = new AudioContext({ latencyHint: "interactive" });
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: message.streamId,
            },
          },
          video: false,
        });
        mediaStream = stream;

        const tabSource = audioContext.createMediaStreamSource(stream);
        playbackGain = audioContext.createGain();
        playbackGain.gain.setValueAtTime(0, audioContext.currentTime);
        playbackGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.012);
        // Route captured tab audio back to the speakers with a click-free
        // handoff; the recording branch remains at unity throughout.
        tabSource.connect(playbackGain);
        playbackGain.connect(audioContext.destination);

        stream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            cleanupCapture();
            chrome.runtime.sendMessage({ type: "SAMPLA_CAPTURE_ENDED" }).catch(() => {});
          };
        });

        let recordStream = stream;
        let micSource = null;
        if (message.includeMic) {
          try {
            micStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
            });
            micSource = audioContext.createMediaStreamSource(micStream);
            const mixedDest = audioContext.createMediaStreamDestination();
            tabSource.connect(mixedDest);
            micSource.connect(mixedDest);
            recordStream = mixedDest.stream;
          } catch (micErr) {
            console.warn("Microphone access failed in offscreen, recording tab only:", micErr);
          }
        }

        // Live peak metering to feed waveform in popup
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        tabSource.connect(analyser);
        if (micSource) {
          micSource.connect(analyser);
        }
        const scratch = new Float32Array(analyser.fftSize);

        let binIndex = 0;
        peakInterval = setInterval(() => {
          analyser.getFloatTimeDomainData(scratch);
          let peak = 0;
          for (let i = 0; i < scratch.length; i++) {
            const v = Math.abs(scratch[i]);
            if (v > peak) peak = v;
          }
          chrome.runtime.sendMessage({
            type: "SAMPLA_TAB_PEAK",
            bin: binIndex,
            peak: peak,
          }).catch(() => {});
          binIndex++;
        }, 20);

        recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const bps = Number(message.quality) || 128000;
        mediaRecorder = new MediaRecorder(recordStream, {
          mimeType,
          audioBitsPerSecond: bps,
        });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
          }
        };
        mediaRecorder.start(100);

        sendResponse({ ok: true });
      } catch (err) {
        console.error("Failed to start tab capture in offscreen document:", err);
        cleanupCapture();
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (message?.type === "OFFSCREEN_STOP_CAPTURE") {
    (async () => {
      try {
        if (peakInterval) {
          clearInterval(peakInterval);
          peakInterval = null;
        }

        const handleStop = async (blob, mime) => {
          await fadeOutPlayback();
          cleanupCapture();
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ ok: true, dataUrl: reader.result, mimeType: mime });
          };
          reader.onerror = () => {
            sendResponse({ ok: false, error: "Failed to serialize recorded audio" });
          };
          reader.readAsDataURL(blob);
        };

        if (!mediaRecorder || mediaRecorder.state === "inactive") {
          const mime = "audio/webm";
          const blob = new Blob(recordedChunks, { type: mime });
          handleStop(blob, mime);
          return;
        }

        mediaRecorder.onstop = () => {
          const mime = mediaRecorder?.mimeType || "audio/webm";
          const blob = new Blob(recordedChunks, { type: mime });
          handleStop(blob, mime);
        };

        mediaRecorder.stop();
      } catch (err) {
        cleanupCapture();
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

function fadeOutPlayback() {
  if (!playbackGain || !audioContext || audioContext.state === "closed") return Promise.resolve();
  const now = audioContext.currentTime;
  const gain = playbackGain.gain;
  if (typeof gain.cancelAndHoldAtTime === "function") {
    gain.cancelAndHoldAtTime(now);
  } else {
    const current = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
  }
  gain.linearRampToValueAtTime(0, now + 0.012);
  return new Promise((resolve) => setTimeout(resolve, 16));
}

function cleanupCapture() {
  if (peakInterval) {
    clearInterval(peakInterval);
    peakInterval = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  if (audioContext && audioContext.state !== "closed") {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
  playbackGain = null;
  mediaRecorder = null;
}
