(() => {
  const JAM_CONFIG = globalThis.SamplaJamConfig || {};

  function configuredApiBase(override) {
    const base = override || window.SamplaCanvasAuth?.getApiBase() || JAM_CONFIG.apiBaseUrl;
    if (!base) throw new Error("Jam uploads have not been configured.");
    return base.replace(/\/+$/, "");
  }

  async function uploadAudioBlob(blob, filename, apiBase) {
    if (!blob) throw new Error("No audio blob provided for upload");
    const base = configuredApiBase(apiBase);

    // Use background service worker proxy if available (avoids CORS and declarativeNetRequest)
    if (chrome?.runtime?.sendMessage) {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result;
          const b64 = typeof res === "string" ? res.split(",")[1] : "";
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "SAMPLA_API_UPLOAD",
            url: `${base}/library/upload`,
            base64Data,
            filename: filename || "sampla-sample.wav",
            directory: "canvas-object-audio",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { ok: false, error: "Empty response from background worker" });
            }
          }
        );
      });

      if (!res.ok || !res.data?.publicUrl) {
        throw new Error(res.error || "Audio upload failed");
      }
      return res.data.publicUrl;
    }

    const formData = new FormData();
    formData.append("directory", "canvas-object-audio");
    formData.append("keepOriginalName", "true");
    formData.append("file", blob, filename || "sampla-sample.wav");

    const res = await fetch(`${base}/library/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}): ${errText || res.statusText}`);
    }

    const data = await res.json();
    if (!data.publicUrl) {
      throw new Error("Upload response missing publicUrl");
    }
    return data.publicUrl;
  }

  async function registerSoundObject({
    kind,
    title,
    subtitle = "Sampla recording",
    collection = "Sampla",
    assetKey = "object-loop-rhythm-box",
    audioKey,
    category = "soundEffects",
    bpm = null,
    token,
    apiBase,
  }) {
    const base = configuredApiBase(apiBase);
    const session = window.SamplaCanvasAuth?.getSession();
    const authToken = token || session?.token;
    if (!authToken) throw new Error("You must be signed in to Canvas / Jam to add sounds.");

    const payload = {
      kind,
      title: (title || "UNTITLED").trim() || "UNTITLED",
      subtitle,
      collection,
      assetKey,
      audioKey,
      audioGain: 1.0,
      bpm: bpm && Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      accentHex: "#FF8C37",
      category,
      source: "import",
    };

    if (window.SamplaCanvasAuth?.apiFetch) {
      return await window.SamplaCanvasAuth.apiFetch(`${base}/canvas/me/created-objects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
    }

    const res = await fetch(`${base}/canvas/me/created-objects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Failed to register sound in Jam library (${res.status}): ${errText || res.statusText}`);
    }

    return await res.json();
  }

  function filename(name) {
    const safe = (name || "sampla-sample")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "sampla-sample";
    return `${safe}.wav`;
  }

  async function uploadTrackToJam(track, audioContext, options = {}) {
    if (!track?.blob) throw new Error("Recording has no audio data");
    const session = window.SamplaCanvasAuth?.getSession();
    if (!session?.token) {
      throw new Error("Not signed in to Canvas");
    }

    const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    const bytes = await track.blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));

    const start = Math.max(0, track.cropStartMs || 0);
    const end = Math.min(buffer.duration * 1000, track.cropEndMs || buffer.duration * 1000);
    const wavBlob = window.SamplaAudioExport.toWavBlob(buffer, start, end);

    const safeFilename = filename(track.name);
    const publicUrl = await uploadAudioBlob(wavBlob, safeFilename, options.apiBase);

    const isLoop = options.isLoop === true || (track.durationMs && track.isLoop);
    const kind = isLoop ? `sampla-loop-${track.id}` : `sampla-sound-${track.id}`;

    const registered = await registerSoundObject({
      kind,
      title: track.name || "UNTITLED",
      subtitle: "Sampla recording",
      collection: "Sampla",
      assetKey: isLoop ? "object-loop-rhythm-box" : "beat-default",
      audioKey: publicUrl,
      category: isLoop ? "loops" : "soundEffects",
      bpm: options.bpm || null,
      token: session.token,
      apiBase: options.apiBase,
    });

    return {
      publicUrl,
      kind,
      registered,
    };
  }

  window.SamplaCanvasApi = {
    uploadAudioBlob,
    registerSoundObject,
    uploadTrackToJam,
  };
})();
