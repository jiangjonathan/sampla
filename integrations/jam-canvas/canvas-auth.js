(() => {
  const JAM_CONFIG = globalThis.SamplaJamConfig || {};
  const STORAGE_KEY = "sampla-canvas-auth";
  const DEFAULT_API_BASE = JAM_CONFIG.apiBaseUrl || "";
  const DEFAULT_AUTH_PAGE_URL = JAM_CONFIG.authPageUrl || "";

  function authError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getApiBase() {
    try {
      return localStorage.getItem("sampla-canvas-api-base") || DEFAULT_API_BASE;
    } catch {
      return DEFAULT_API_BASE;
    }
  }

  function setApiBase(url) {
    try {
      if (url) localStorage.setItem("sampla-canvas-api-base", url.replace(/\/+$/, ""));
      else localStorage.removeItem("sampla-canvas-api-base");
    } catch {
      /* ignore */
    }
  }

  function getAuthPageUrl() {
    try {
      return localStorage.getItem("sampla-jam-auth-page") || DEFAULT_AUTH_PAGE_URL;
    } catch {
      return DEFAULT_AUTH_PAGE_URL;
    }
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === "string" && parsed.token.length > 0) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore storage access restrictions */
    }
    try {
      if (chrome?.storage?.local) {
        if (session) {
          chrome.storage.local.set({ [STORAGE_KEY]: session });
        } else {
          chrome.storage.local.remove([STORAGE_KEY]);
        }
      }
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("sampla-canvas-auth-changed", { detail: session }));
  }

  function clearSession() {
    saveSession(null);
  }

  // Restore session from extension storage if iframe localStorage is restricted or cleared
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get([STORAGE_KEY], (items) => {
        const saved = items?.[STORAGE_KEY];
        if (saved && !getSession()) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          } catch {}
          window.dispatchEvent(new CustomEvent("sampla-canvas-auth-changed", { detail: saved }));
        }
      });
    }
  } catch {
    /* ignore */
  }

  // A Jam sign-in tab can finish while the popup is still open. Mirror the
  // background worker's stored session into this page immediately.
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      const session = changes[STORAGE_KEY].newValue || null;
      try {
        if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      window.dispatchEvent(new CustomEvent("sampla-canvas-auth-changed", { detail: session }));
    });
  } catch {
    /* ignore */
  }

  async function apiFetch(url, options = {}) {
    if (chrome?.runtime?.sendMessage) {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "SAMPLA_API_FETCH",
            url,
            method: options.method || "GET",
            headers: options.headers || {},
            body: options.body || null,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { ok: false, status: 0, error: "Empty response from background" });
            }
          }
        );
      });
      if (!res.ok) {
        const errorMsg =
          (typeof res.data === "object" && (res.data?.error || res.data?.message)) ||
          res.error ||
          `HTTP ${res.status}`;
        const error = new Error(errorMsg);
        error.status = res.status;
        error.data = res.data;
        throw error;
      }
      return res.data;
    }

    const res = await fetch(url, options);
    let data;
    try {
      data = await res.json();
    } catch {
      data = await res.text().catch(() => "");
    }
    if (!res.ok) {
      const errorMsg =
        (typeof data === "object" && (data?.error || data?.message)) || data || `HTTP ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function startJamLink(authPageUrl = getAuthPageUrl()) {
    return new Promise((resolve, reject) => {
      if (!authPageUrl) {
        reject(authError("Jam phone sign-in has not been configured.", "JAM_NOT_CONFIGURED"));
        return;
      }
      if (!chrome?.runtime?.sendMessage) {
        reject(authError("Jam linking requires the Sampla browser extension.", "EXTENSION_REQUIRED"));
        return;
      }
      chrome.runtime.sendMessage(
        { type: "SAMPLA_START_JAM_LINK", authPageUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(authError(chrome.runtime.lastError.message, "LINK_TAB_FAILED"));
            return;
          }
          if (!response?.ok) {
            reject(authError(response?.error || "Jam sign-in could not be opened.", "LINK_TAB_FAILED"));
            return;
          }
          resolve(response);
        }
      );
    });
  }

  async function loginWithToken(token, apiBase = getApiBase()) {
    let trimmed = (token || "").trim();
    if (!trimmed) throw new Error("Token cannot be empty");

    let parsedUsername = "";
    if (trimmed.includes("#username=")) {
      const parts = trimmed.split("#username=");
      trimmed = parts[0].trim();
      parsedUsername = decodeURIComponent(parts[1] || "").trim();
    } else if (trimmed.includes("?username=")) {
      const parts = trimmed.split("?username=");
      trimmed = parts[0].trim();
      parsedUsername = decodeURIComponent(parts[1] || "").trim();
    }

    if (!parsedUsername) {
      try {
        const dotParts = trimmed.split(".");
        if (dotParts.length >= 2) {
          const base64 = dotParts[1].replace(/-/g, "+").replace(/_/g, "/");
          const decoded = atob(base64);
          const payload = JSON.parse(decoded);
          parsedUsername = payload.username || payload.displayName || payload.name || "";
        }
      } catch {
        /* not a parseable JWT payload */
      }
    }

    try {
      await apiFetch(`${apiBase}/canvas/me/created-objects`, {
        headers: {
          Authorization: `Bearer ${trimmed}`,
        },
      });
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        throw new Error("Invalid or expired Jam token.");
      }
      console.warn("Token verification fallback:", err);
    }

    let userId = "";
    if (!parsedUsername) {
      try {
        const meData = await apiFetch(`${apiBase}/canvas/auth/me`, {
          headers: { Authorization: `Bearer ${trimmed}` },
        });
        if (meData?.user?.username) parsedUsername = meData.user.username;
        if (meData?.user?.id) userId = meData.user.id;
      } catch {
        /* ignore */
      }
    }

    const session = {
      token: trimmed,
      userId,
      username: parsedUsername,
      signedInAt: Date.now(),
    };
    saveSession(session);
    return session;
  }

  window.SamplaCanvasAuth = {
    getApiBase,
    setApiBase,
    getAuthPageUrl,
    getSession,
    saveSession,
    clearSession,
    startJamLink,
    loginWithToken,
    apiFetch,
  };
})();
