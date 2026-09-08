(() => {
  if (window.__samplaWindowInjected) return;
  window.__samplaWindowInjected = true;

  let hostElement = null;
  let shadowRoot = null;
  let container = null;
  let iframe = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let windowStartX = 0;
  let windowStartY = 0;
  let isMinimized = false;
  let pendingAutoRecord = false;
  let statusTime = null;
  let statusMode = null;
  let statusDot = null;

  function applyOverlayStatus(data) {
    if (!statusTime || !statusMode || !statusDot || !data) return;
    if (typeof data.time === "string") statusTime.textContent = data.time;
    if (typeof data.activity === "string") statusMode.textContent = data.activity;
    if (typeof data.color === "string") {
      statusDot.style.background = data.color;
      statusTime.style.color = data.color;
      statusMode.style.color = data.color;
    }
    statusDot.dataset.live = data.activity === "REC" ? "rec" : "";
  }

  async function loadOverlayFonts(root) {
    const faces = [
      ["fonts/IBMPlexMono-Regular.woff2", "400"],
      ["fonts/IBMPlexMono-Medium.woff2", "500"],
    ];
    await Promise.all(faces.map(async ([path, weight]) => {
      const face = new FontFace("IBM Plex Mono", `url(${chrome.runtime.getURL(path)})`, {
        weight,
        style: "normal",
        display: "swap",
      });
      const loaded = await face.load();
      if (root.fonts?.add) root.fonts.add(loaded);
      document.fonts.add(loaded);
    }));
  }

  function createFloatingWindow() {
    hostElement = document.createElement("div");
    hostElement.id = "sampla-root-host";
    hostElement.style.cssText = "all: initial; position: absolute; z-index: 2147483647;";

    shadowRoot = hostElement.attachShadow({ mode: "open" });

    const fontRegular = chrome.runtime.getURL("fonts/IBMPlexMono-Regular.woff2");
    const fontMedium = chrome.runtime.getURL("fonts/IBMPlexMono-Medium.woff2");
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      @font-face {
        font-family: "IBM Plex Mono";
        src: url("${fontRegular}") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "IBM Plex Mono";
        src: url("${fontMedium}") format("woff2");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
      .sampla-header-btn {
        width: 24px;
        height: 20px;
        background: transparent;
        border: none;
        border-radius: 0;
        color: #ff0000;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .sampla-header-btn:hover {
        color: #ffffff;
      }
      .sampla-header-btn:active {
        color: #ff4d4d;
      }
      .sampla-header-btn:focus-visible {
        outline: 1px solid #ffffff;
        outline-offset: -1px;
      }
      .sampla-header-btn svg {
        display: block;
        width: 14px;
        height: 14px;
        pointer-events: none;
      }
      .sampla-header-status {
        display: none;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
        pointer-events: none;
      }
      .sampla-header-status.is-visible {
        display: flex;
      }
      .sampla-status-dot {
        width: 6px;
        height: 6px;
        flex: 0 0 6px;
        border-radius: 50%;
        background: #3b82ff;
      }
      .sampla-status-dot[data-live="rec"] {
        animation: sampla-rec-pulse 1s steps(1, end) infinite;
      }
      @keyframes sampla-rec-pulse {
        50% { opacity: 0.2; }
      }
      .sampla-status-time,
      .sampla-status-mode {
        display: block;
        font-family: "IBM Plex Mono";
        font-size: 10px;
        font-weight: 400;
        font-stretch: expanded;
        letter-spacing: 0.08em;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
        transform: scaleX(1.1);
        transform-origin: left center;
        color: #3b82ff;
      }
    `;
    shadowRoot.append(styleEl);

    container = document.createElement("div");
    container.id = "sampla-floating-host";
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      width: 392px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      background: #000000;
      border: 1px solid #ff0000;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85);
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      color: #ff0000;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
      overflow: hidden;
      transform: translate3d(0, 0, 0);
    `;

    // Drag Bar
    const header = document.createElement("div");
    header.style.cssText = `
      height: 28px;
      background: #080808;
      border-bottom: 1px solid #ff0000;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 0 6px;
      cursor: grab;
      touch-action: none;
      box-sizing: border-box;
    `;

    const status = document.createElement("div");
    status.className = "sampla-header-status";
    statusDot = document.createElement("span");
    statusDot.className = "sampla-status-dot";
    statusTime = document.createElement("span");
    statusTime.className = "sampla-status-time";
    statusTime.textContent = "00:00";
    statusMode = document.createElement("span");
    statusMode.className = "sampla-status-mode";
    statusMode.textContent = "IDLE";
    status.append(statusDot, statusTime, statusMode);
    loadOverlayFonts(shadowRoot).catch(() => {});

    const controls = document.createElement("div");
    controls.style.cssText = "display: flex; align-items: center; gap: 2px; margin-bottom: 1px;";

    const MINUS_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;
    const PLUS_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/><line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;
    const CLOSE_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;

    const minBtn = document.createElement("button");
    minBtn.type = "button";
    minBtn.className = "sampla-header-btn";
    minBtn.setAttribute("aria-label", "Minimize");
    minBtn.innerHTML = MINUS_ICON;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sampla-header-btn";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = CLOSE_ICON;

    minBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    closeBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

    controls.append(minBtn, closeBtn);
    header.append(status, controls);

    // Iframe embedding popup.html
    iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("popup.html");
    iframe.allow = "microphone; display-capture; autoplay; camera";
    iframe.style.cssText = `
      width: 390px;
      height: 494px;
      border: none;
      background: #000000;
      display: block;
      margin: 0 auto;
    `;

    const iframeShell = document.createElement("div");
    iframeShell.style.cssText = `
      overflow: hidden;
      width: 390px;
      height: auto;
      flex: 0 0 auto;
    `;
    iframeShell.append(iframe);

    container.append(header, iframeShell);
    shadowRoot.append(container);
    document.documentElement.append(hostElement);

    // Listen for dynamic size updates from popup
    window.addEventListener("message", (event) => {
      if (event.data?.type === "SAMPLA_RESIZE" && typeof event.data.height === "number") {
        if (iframe && !isMinimized && event.data.height > 100) {
          iframe.style.height = `${event.data.height}px`;
        }
      }
      if (event.data?.type === "SAMPLA_STATUS") applyOverlayStatus(event.data);
    });

    iframe.addEventListener("load", () => {
      if (pendingAutoRecord) {
        pendingAutoRecord = false;
        requestAutoRecord();
      }
    });

    // Dragging logic
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      header.style.cursor = "grabbing";
      header.setPointerCapture(e.pointerId);
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = container.getBoundingClientRect();
      windowStartX = rect.left;
      windowStartY = rect.top;
      // Disable pointer events on iframe while dragging to prevent lag/stuck mouse
      iframe.style.pointerEvents = "none";
    });

    header.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newX = Math.max(8, Math.min(window.innerWidth - container.offsetWidth - 8, windowStartX + dx));
      const newY = Math.max(8, Math.min(window.innerHeight - container.offsetHeight - 8, windowStartY + dy));
      container.style.left = `${newX}px`;
      container.style.top = `${newY}px`;
      container.style.right = "auto";
    });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      header.style.cursor = "grab";
      try {
        if (header.hasPointerCapture(e.pointerId)) {
          header.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      iframe.style.pointerEvents = "auto";
    }

    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);

    // Minimize button toggle
    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isMinimized = !isMinimized;
      iframeShell.style.height = isMinimized ? "0px" : "auto";
      iframe.style.pointerEvents = isMinimized ? "none" : "auto";
      header.style.borderBottom = isMinimized ? "none" : "1px solid #ff0000";
      header.style.justifyContent = isMinimized ? "space-between" : "flex-end";
      status.classList.toggle("is-visible", isMinimized);
      minBtn.innerHTML = isMinimized ? PLUS_ICON : MINUS_ICON;
      minBtn.setAttribute("aria-label", isMinimized ? "Restore" : "Minimize");
      if (!isMinimized) {
        try {
          iframe.contentWindow.postMessage({ type: "SAMPLA_RESUME" }, "*");
        } catch {}
      }
    });

    // Close button toggle
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVisibility(false);
    });
  }

  function requestAutoRecord() {
    if (!iframe?.contentWindow) {
      pendingAutoRecord = true;
      return;
    }
    try {
      iframe.contentWindow.postMessage({ type: "SAMPLA_AUTO_RECORD" }, "*");
    } catch {
      pendingAutoRecord = true;
    }
  }

  function toggleVisibility(force, options = {}) {
    if (!hostElement || !container) {
      if (options.autoRecord) pendingAutoRecord = true;
      createFloatingWindow();
      return;
    }
    const shouldShow = typeof force === "boolean" ? force : hostElement.style.display === "none";
    hostElement.style.display = shouldShow ? "block" : "none";
    if (!shouldShow) {
      try {
        iframe.contentWindow.postMessage({ type: "SAMPLA_SHUTDOWN" }, "*");
      } catch {}
    } else {
      try {
        iframe.contentWindow.postMessage({ type: "SAMPLA_RESUME" }, "*");
      } catch {}
      if (options.autoRecord) requestAutoRecord();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SAMPLA_TOGGLE_WINDOW") {
      toggleVisibility(undefined, { autoRecord: Boolean(message.autoRecord) });
      sendResponse({ visible: hostElement?.style.display !== "none" });
    }
    if (message?.type === "SAMPLA_STATUS") applyOverlayStatus(message);
  });
})();
