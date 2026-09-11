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

});
