if (typeof importScripts === "function") {
  importScripts("../integrations/jam-canvas/hosted/sampla-auth/config.js");
}

const JAM_CONFIG = globalThis.SamplaJamConfig || {};
const JAM_AUTH_STORAGE_KEY = "sampla-canvas-auth";
const JAM_AUTH_PENDING_KEY = "sampla-jam-auth-pending";
const JAM_AUTH_PAGE_URL = JAM_CONFIG.authPageUrl || "";
const JAM_API_BASE = (JAM_CONFIG.apiBaseUrl || "").replace(/\/+$/, "");
const JAM_AUTH_TIMEOUT_MS = JAM_CONFIG.authRequestTtlMs || 10 * 60 * 1000;
const JAM_AUTH_ORIGINS = new Set(JAM_CONFIG.authAllowedOrigins || []);
const JAM_API_ORIGIN = JAM_API_BASE ? new URL(JAM_API_BASE).origin : "";

function allowedJamAuthUrl(rawUrl) {
  if (!rawUrl && !JAM_AUTH_PAGE_URL) throw new Error("Jam phone sign-in has not been configured.");
  const url = new URL(rawUrl || JAM_AUTH_PAGE_URL);
  if (url.protocol !== "https:" || !JAM_AUTH_ORIGINS.has(url.origin)) {
    throw new Error("Untrusted Jam sign-in page.");
  }
  return url;
}

async function beginJamAccountLink(rawUrl) {
  const authUrl = allowedJamAuthUrl(rawUrl);
  const requestId = crypto.randomUUID();
  authUrl.searchParams.set("requestId", requestId);
  authUrl.searchParams.set("extensionId", chrome.runtime.id);

  const pending = { requestId, origin: authUrl.origin, expiresAt: Date.now() + JAM_AUTH_TIMEOUT_MS };
  await chrome.storage.session.set({ [JAM_AUTH_PENDING_KEY]: pending });
  let tab;
  try {
    tab = await chrome.tabs.create({ url: authUrl.toString(), active: true });
  } catch (error) {
    await chrome.storage.session.remove(JAM_AUTH_PENDING_KEY);
    throw error;
  }
  pending.tabId = tab.id;
  await chrome.storage.session.set({ [JAM_AUTH_PENDING_KEY]: pending });
  return { requestId, tabId: tab.id };
}

async function finishJamAccountLink(firebaseToken) {
  if (!JAM_API_BASE) throw new Error("The Jam API has not been configured.");
  const response = await fetch(`${JAM_API_BASE}/canvas/auth/login-with-firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebaseToken }),
  });
  const data = await response.json().catch(() => ({}));
  const responseSession = data?.session || data;
  if (!response.ok || !data?.success || !responseSession?.success || !responseSession?.token) {
    throw new Error(data?.error || data?.message || "Jam could not complete the connection.");
  }

  const session = {
    token: responseSession.token,
    userId: responseSession.userId,
    username: responseSession.username,
    profile: responseSession.profile,
    signedInAt: Date.now(),
  };
  await chrome.storage.local.set({ [JAM_AUTH_STORAGE_KEY]: session });
  await chrome.storage.session.remove(JAM_AUTH_PENDING_KEY);
  return session;
}

const RECORD_ON_CLICK_STORAGE_KEY = "sampla-record-on-click";

async function recordOnClickEnabled() {
  try {
    const stored = await chrome.storage.local.get(RECORD_ON_CLICK_STORAGE_KEY);
    return stored[RECORD_ON_CLICK_STORAGE_KEY] === true;
  } catch {
    return false;
  }
}

function popupUrl(autoRecord) {
  const url = chrome.runtime.getURL("popup.html");
  return autoRecord ? `${url}?autoRecord=1` : url;
}

chrome.action.onClicked.addListener(async (tab) => {
  ensureOffscreenDocument().catch(() => {});
  if (!tab?.id) return;
  const autoRecord = await recordOnClickEnabled();
  const url = tab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("edge://") || url.startsWith("devtools://")) {
    chrome.tabs.create({ url: popupUrl(autoRecord) });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "SAMPLA_TOGGLE_WINDOW", autoRecord });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "SAMPLA_TOGGLE_WINDOW", autoRecord });
    } catch (e) {
      console.error("Failed to inject Sampla window, opening in tab:", e);
      chrome.tabs.create({ url: popupUrl(autoRecord) });
    }
  }
});

let creatingOffscreenPromise = null;

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;

  if (creatingOffscreenPromise) {
    return creatingOffscreenPromise;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Capture and play tab audio through speakers without feedback loop",
  }).finally(() => {
    creatingOffscreenPromise = null;
  });

  return creatingOffscreenPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreenDocument().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SAMPLA_STATUS") {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {});
      return;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (id) chrome.tabs.sendMessage(id, message).catch(() => {});
    });
    return;
  }

  if (message?.type === "SAMPLA_START_JAM_LINK") {
    beginJamAccountLink(message.authPageUrl)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Jam sign-in could not be opened." }));
    return true;
  }

  if (message?.type === "SAMPLA_ENSURE_OFFSCREEN") {
    ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === "SAMPLA_START_TAB_CAPTURE") {
    (async () => {
      try {
        let tabId = message.tabId || sender.tab?.id;
        if (!tabId || sender.tab?.url?.startsWith("chrome-extension://")) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTab && !activeTab.url?.startsWith("chrome-extension://") && !activeTab.url?.startsWith("chrome://")) {
            tabId = activeTab.id;
          } else {
            const allTabs = await chrome.tabs.query({ active: true });
            const nonExt = allTabs.find((t) => !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("chrome://"));
            if (nonExt) tabId = nonExt.id;
            else if (activeTab) tabId = activeTab.id;
          }
        }

        const getStreamIdPromise = (opts) =>
          new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId(opts, (streamId) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (!streamId) {
                reject(new Error("Unable to obtain tab media stream ID."));
              } else {
                resolve(streamId);
              }
            });
          });

        let streamId = null;
        try {
          streamId = await getStreamIdPromise(tabId ? { targetTabId: tabId } : {});
        } catch (idErr) {
          if (tabId) {
            // Fallback without targetTabId (defaults to active tab)
            streamId = await getStreamIdPromise({});
          } else {
            throw idErr;
          }
        }

        await ensureOffscreenDocument();

        chrome.runtime.sendMessage(
          {
            type: "OFFSCREEN_START_CAPTURE",
            streamId,
            quality: message.quality || "128000",
            includeMic: Boolean(message.includeMic),
          },
          (offscreenRes) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse(offscreenRes || { ok: true });
            }
          }
        );
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Failed to start tab capture" });
      }
    })();
    return true;
  }

  if (message?.type === "SAMPLA_STOP_TAB_CAPTURE") {
    chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP_CAPTURE" }, (offscreenRes) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse(offscreenRes || { ok: true });
      }
    });
    return true;
  }

  if (message?.type === "SAMPLA_GET_TAB_STREAM_ID") {
    (async () => {
      try {
        ensureOffscreenDocument().catch(() => {});
        let tabId = message?.tabId || sender.tab?.id;
        if (!tabId || sender.tab?.url?.startsWith("chrome-extension://")) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTab && !activeTab.url?.startsWith("chrome-extension://") && !activeTab.url?.startsWith("chrome://")) {
            tabId = activeTab.id;
          } else {
            const allTabs = await chrome.tabs.query({ active: true });
            const nonExt = allTabs.find((t) => !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("chrome://"));
            if (nonExt) tabId = nonExt.id;
            else if (activeTab) tabId = activeTab.id;
          }
        }
        if (!tabId) {
          sendResponse({ ok: false, error: "No active browser tab found to capture." });
          return;
        }
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else if (!streamId) {
            sendResponse({ ok: false, error: "Unable to obtain tab media stream ID." });
          } else {
            sendResponse({ ok: true, streamId, tabId });
          }
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Failed to get tab capture stream" });
      }
    })();
    return true; // Keep message channel open for async callback
  }

  if (message?.type === "SAMPLA_API_FETCH") {
    (async () => {
      try {
        const { url, method = "GET", headers = {}, body = null } = message;
        if (!url || typeof url !== "string") {
          sendResponse({ ok: false, status: 400, error: "Missing or invalid URL" });
          return;
        }

        // Do not let extension messages turn the worker into an open network proxy.
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "https:" || parsedUrl.origin !== JAM_API_ORIGIN) {
          sendResponse({ ok: false, status: 403, error: "Forbidden API target" });
          return;
        }

        const fetchOpts = {
          method,
          headers: { ...headers },
        };
        if (body) {
          fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
        }

        const res = await fetch(url, fetchOpts);
        const text = await res.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {
          /* keep text */
        }

        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          data,
        });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: err.message || "Network request failed" });
      }
    })();
    return true;
  }

  if (message?.type === "SAMPLA_API_UPLOAD") {
    (async () => {
      try {
        const { url, base64Data, filename, directory } = message;
        const targetUrl = url || `${JAM_API_BASE}/library/upload`;
        const parsedUrl = new URL(targetUrl);
        if (parsedUrl.protocol !== "https:" || parsedUrl.origin !== JAM_API_ORIGIN) {
          sendResponse({ ok: false, status: 403, error: "Forbidden upload target" });
          return;
        }

        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const wavBlob = new Blob([bytes], { type: "audio/wav" });
        const formData = new FormData();
        formData.append("directory", directory || "canvas-object-audio");
        formData.append("keepOriginalName", "true");
        formData.append("file", wavBlob, filename || "sampla-sample.wav");

        const res = await fetch(targetUrl, {
          method: "POST",
          body: formData,
        });
        const text = await res.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {
          /* keep text */
        }

        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          data,
        });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: err.message || "Upload failed" });
      }
    })();
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SAMPLA_JAM_AUTH_COMPLETE") return false;

  (async () => {
    try {
      const senderOrigin = sender.origin || new URL(sender.url || "").origin;
      const stored = await chrome.storage.session.get(JAM_AUTH_PENDING_KEY);
      const pending = stored[JAM_AUTH_PENDING_KEY];
      if (
        !pending ||
        message.requestId !== pending.requestId ||
        senderOrigin !== pending.origin ||
        sender.tab?.id !== pending.tabId ||
        Date.now() > pending.expiresAt
      ) {
        throw new Error("This Jam sign-in request is no longer valid. Start again from Sampla.");
      }
      if (typeof message.firebaseToken !== "string" || message.firebaseToken.length < 100) {
        throw new Error("Jam returned an invalid sign-in token.");
      }

      const session = await finishJamAccountLink(message.firebaseToken);
      sendResponse({ ok: true, username: session.username || "" });
      if (sender.tab?.id) {
        setTimeout(() => chrome.tabs.remove(sender.tab.id).catch(() => {}), 900);
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Jam sign-in failed." });
    }
  })();
  return true;
});
