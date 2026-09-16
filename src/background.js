const RECORD_ON_CLICK_STORAGE_KEY = "sampla-record-on-click";

async function recordOnClickEnabled() {
  try {
    const stored = await chrome.storage.local.get(RECORD_ON_CLICK_STORAGE_KEY);
    return stored[RECORD_ON_CLICK_STORAGE_KEY] === true;
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  waitForOffscreenReady().catch(() => {});
  if (!tab?.id) return;
  const autoRecord = await recordOnClickEnabled();
  const url = tab.url || "";
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("edge://") || url.startsWith("devtools://")) {
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
    } catch (error) {
      // Chrome blocks content-script injection on protected pages (including
      // the Web Store and its built-in viewers). Keep the action a no-op there
      // instead of replacing the requested overlay with a standalone tab.
      console.debug("Sampla overlay is unavailable on this page:", error);
    }
  }
});

let creatingOffscreenPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendToOffscreen(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(res);
      }
    });
  });
}

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

async function waitForOffscreenReady() {
  await ensureOffscreenDocument();
  const deadline = Date.now() + 2500;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await sendToOffscreen({ type: "OFFSCREEN_PING" });
      if (res?.ok) return;
      lastError = new Error("Offscreen recorder did not respond");
    } catch (error) {
      lastError = error;
    }
    await sleep(40);
  }
  throw lastError || new Error("Offscreen recorder is not ready");
}

function getTabCaptureStreamId(opts) {
  return new Promise((resolve, reject) => {
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
}

async function resolveCaptureTabId(message, sender) {
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
  return tabId;
}

async function obtainTabStreamId(tabId) {
  try {
    return await getTabCaptureStreamId(tabId ? { targetTabId: tabId } : {});
  } catch (idErr) {
    if (tabId) return getTabCaptureStreamId({});
    throw idErr;
  }
}

async function startTabCapture(message, sender) {
  await waitForOffscreenReady();
  const tabId = await resolveCaptureTabId(message, sender);
  const quality = message.quality || "128000";
  const includeMic = Boolean(message.includeMic);

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const streamId = await obtainTabStreamId(tabId);
      const offscreenRes = await sendToOffscreen({
        type: "OFFSCREEN_START_CAPTURE",
        streamId,
        quality,
        includeMic,
      });
      if (offscreenRes?.ok) return offscreenRes;
      lastError = new Error(offscreenRes?.error || "Tab capture failed");
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await waitForOffscreenReady();
  }
  throw lastError || new Error("Failed to start tab capture");
}

chrome.runtime.onInstalled.addListener(() => {
  waitForOffscreenReady().catch(() => {});
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

  if (message?.type === "SAMPLA_ENSURE_OFFSCREEN") {
    waitForOffscreenReady()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === "SAMPLA_START_TAB_CAPTURE") {
    startTabCapture(message, sender)
      .then((offscreenRes) => sendResponse(offscreenRes || { ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message || "Failed to start tab capture" }));
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
        waitForOffscreenReady().catch(() => {});
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

});
