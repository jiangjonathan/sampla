// Sampla Tape Deck Extension - Main Coordinator
const Geometry = window.SamplaDeckGeometry;
const BufferOps = window.SamplaBufferOps;
const CustomControls = window.SamplaCustomControls;
const WaveformView = window.SamplaWaveformView;
const recordingStorage = window.SamplaStorage;
const recordingExporter = window.SamplaAudioExport;
const transportPhysics = window.SamplaTransportPhysics;

// DOM Elements
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");
const segDigits = document.getElementById("seg-digits");
const tapeLeft = document.getElementById("tape-left");
const tapeRight = document.getElementById("tape-right");
const spoolLeft = document.getElementById("spool-left");
const spoolRight = document.getElementById("spool-right");
const tapePath = document.getElementById("tape-path");
const tensionArm = document.querySelector(".tension-arm");
const tensionGuide = document.querySelector(".tension-guide");
const recordBtn = document.getElementById("record");
const revBtn = document.getElementById("rev");
const stopBtn = document.getElementById("stop");
const playBtn = document.getElementById("play");
const ffwdBtn = document.getElementById("ffwd");
const loopBtn = document.getElementById("loop");
const saveBtn = document.getElementById("save");
const playLight = document.getElementById("play-light");
const recordLight = document.getElementById("record-light");
const settingsToggle = document.getElementById("settings-toggle");
const settingsMenu = document.getElementById("settings-menu");
const liveTab = document.getElementById("live-tab");
const libraryTab = document.getElementById("library-tab");
const editToggle = document.getElementById("edit-toggle");
const editToolbar = document.getElementById("edit-toolbar");
const editRange = document.getElementById("edit-range");
const editCutBtn = document.getElementById("edit-cut");
const editCopyBtn = document.getElementById("edit-copy");
const editPasteBtn = document.getElementById("edit-paste");
const editLoopToggle = document.getElementById("edit-loop-toggle");
const editFxToggle = document.getElementById("edit-fx-toggle");
const editFxMenu = document.getElementById("edit-fx-menu");
const editReverseBtn = document.getElementById("edit-reverse");
const editSpeedCell = document.getElementById("edit-speed-cell");
const editSpeedInput = document.getElementById("edit-speed-input");
const editFadeInBtn = document.getElementById("edit-fade-in");
const editFadeOutBtn = document.getElementById("edit-fade-out");
const editQuieterBtn = document.getElementById("edit-quieter");
const editLouderBtn = document.getElementById("edit-louder");
const editUndoBtn = document.getElementById("edit-undo");
const editRedoBtn = document.getElementById("edit-redo");
const editDoneBtn = document.getElementById("edit-done");
const editContextMenu = document.getElementById("edit-context-menu");
const editContextButtons = [...editContextMenu.querySelectorAll("[data-edit-action]")];
const editLoopMenu = document.getElementById("edit-loop-menu");
const editLoopBpmBtn = document.getElementById("edit-loop-bpm-btn");
const editLoopBpmValue = document.getElementById("edit-loop-bpm-value");
const editLoopSnapBtn = document.getElementById("edit-loop-snap-btn");
const editLoop1BarBtn = document.getElementById("edit-loop-1bar");
const editLoop2BarBtn = document.getElementById("edit-loop-2bar");
const editLoop4BarBtn = document.getElementById("edit-loop-4bar");
const editLoopAutoBtn = document.getElementById("edit-loop-auto");
const editLoopCropBtn = document.getElementById("edit-loop-crop");
const editLoopAuditionBtn = document.getElementById("edit-loop-audition");
const BeatDetector = window.SamplaBeatDetector || globalThis.SamplaBeatDetector;

// Platform detection & shortcuts setup
const platformId = String(navigator.userAgentData?.platform || navigator.platform || "");
const isApplePlatform = /mac|iphone|ipad|ipod/i.test(platformId);
const isWindowsPlatform = /win/i.test(platformId);
document.documentElement.dataset.platform = isApplePlatform ? "apple" : isWindowsPlatform ? "windows" : "other";

const editShortcutLabels = {
  cut: isApplePlatform ? "⌘X" : "Ctrl+X",
  copy: isApplePlatform ? "⌘C" : "Ctrl+C",
  paste: isApplePlatform ? "⌘V" : "Ctrl+V",
  delete: isApplePlatform ? "⌫" : "Del",
};
editContextMenu.querySelectorAll("[data-shortcut]").forEach((indicator) => {
  indicator.textContent = editShortcutLabels[indicator.dataset.shortcut] || "";
});
const commandShortcut = (key) => `${isApplePlatform ? "Meta" : "Control"}+${key}`;
editCutBtn.setAttribute("aria-keyshortcuts", commandShortcut("X"));
editCopyBtn.setAttribute("aria-keyshortcuts", commandShortcut("C"));
editPasteBtn.setAttribute("aria-keyshortcuts", commandShortcut("V"));
editUndoBtn.setAttribute("aria-keyshortcuts", commandShortcut("Z"));
editRedoBtn.setAttribute(
  "aria-keyshortcuts",
  isApplePlatform ? "Meta+Shift+Z" : "Control+Shift+Z Control+Y"
);
saveBtn.setAttribute("aria-keyshortcuts", commandShortcut("S"));
for (const button of editContextButtons) {
  const action = button.dataset.editAction;
  const shortcut = action === "delete" ? "Delete Backspace" : {
    cut: commandShortcut("X"),
    copy: commandShortcut("C"),
    paste: commandShortcut("V"),
  }[action];
  if (shortcut) button.setAttribute("aria-keyshortcuts", shortcut);
}

// Panel Elements
const livePanel = document.getElementById("live-panel");
const libraryPanel = document.getElementById("library-panel");
const trackNameInput = document.getElementById("track-name");
const trackDurationEl = document.getElementById("track-duration");
const trackList = document.getElementById("track-list");
const libraryScrollbar = document.getElementById("library-scrollbar");
const libraryScrollThumb = document.getElementById("library-scroll-thumb");
const libraryLoadBtn = document.getElementById("library-load");
const libraryDeleteBtn = document.getElementById("library-delete");
const librarySaveBtn = document.getElementById("library-save");
const libraryUploadBtn = document.getElementById("library-upload");
const libraryFileInput = document.getElementById("library-file-input");

// Canvas Jam Auth Elements
const canvasStatusIndicator = document.getElementById("canvas-status-indicator");
const canvasAuthBtn = document.getElementById("canvas-auth-btn");
const canvasAuthDialog = document.getElementById("canvas-auth-dialog");
const canvasAuthMessage = document.getElementById("canvas-auth-message");
const canvasAuthError = document.getElementById("canvas-auth-error");

// Confirm Dialog Elements
const confirmDialog = document.getElementById("confirm-dialog");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmCancelBtn = document.getElementById("confirm-cancel");
const confirmDeleteBtn = document.getElementById("confirm-delete");

// Custom Selects and Switches
const recordSourceSelect = CustomControls.createCustomSelect(
  document.getElementById("record-source"),
  document.getElementById("record-source-menu")
);
const micDeviceSelect = CustomControls.createCustomSelect(
  document.getElementById("mic-device"),
  document.getElementById("mic-device-menu")
);
const recordQualitySelect = CustomControls.createCustomSelect(
  document.getElementById("record-quality"),
  document.getElementById("record-quality-menu")
);
const monitorInputToggle = CustomControls.createCustomSwitch(document.getElementById("monitor-input"));
const autoPlayRecordingToggle = CustomControls.createCustomSwitch(document.getElementById("auto-play-recording"));
const autoTrimQuietToggle = CustomControls.createCustomSwitch(document.getElementById("auto-trim-quiet"));
const recordOnClickToggle = CustomControls.createCustomSwitch(document.getElementById("record-on-click"));
const RECORD_ON_CLICK_STORAGE_KEY = "sampla-record-on-click";
const waveformZoomSelect = CustomControls.createCustomSelect(
  document.getElementById("waveform-zoom"),
  document.getElementById("waveform-zoom-menu")
);

// Waveform Canvas Setup
const waveCanvas = document.getElementById("wave");
const waveCtx = waveCanvas.getContext("2d", { alpha: false });

// Mechanical Deck Renderer
const deckRenderer = new window.SamplaDeckRenderer({
  timerEl,
  segDigits,
  tapeLeft,
  tapeRight,
  spoolLeft,
  spoolRight,
  tapePath,
  tensionArm,
  tensionGuide,
});

// Tuning Constants
const WAVE_BIN_MS = 10;
const WAVE_WINDOW_MIN = 400;
const WAVE_WINDOW_MAX = 120000;
const CROP_MIN_MS = 40;
const CROP_HIT_PX = 12;
const SCRUB_FADE_SEC = 0.008;
const SCRUB_IDLE_MS = 48;
const SCRUB_RATE_RAMP_SEC = 0.02;
const SCRUB_MIN_AUDIBLE_RATE = 0.005;
const SCRUB_STOP_RATE = 0.02;
const SCRUB_MAX_RATE = 32;
const SCRUB_WINDOW_REF_MS = 8000;
const SCRUB_INPUT_RESPONSE = 36;
const SCRUB_HOLD_FRICTION = 28;
const SCRUB_RELEASE_FRICTION = 5;
const WHEEL_RELEASE_MS = 60;
let waveWindowMs = 8000;

// Audio & Playback State
let mediaRecorder = null;
let chunks = [];
let blob = null;
let audioCtx = null;
let tapeBuffer = null;
let tapeBufferRev = null;
let decodeWait = null;
let source = null;
let sourceGain = null;
let sourceOffset = 0;
let sourceRate = 1;
let sourceRateStart = 1;
let sourceStartedAt = 0;
let sourceRateRampEndsAt = 0;
let tapeTransportNode = null;
let tapeTransportBuffer = null;
let tapeTransportLoad = null;
let tapeTransportModuleLoad = null;

// Transport & Simulation State
let mode = "idle";
let playheadMs = 0;
let tapeEndMs = 0;
let startedAt = 0;
let moving = false;
let rafId = 0;
let lastFrame = 0;
let armTensionHeld = false;
let releaseArmWithReels = false;
let wavePeaks = [];
let recInput = null;
let recAnalyser = null;
let recScratch = null;
let recWaveProcessor = null;
let recWaveSink = null;
let recWaveFrame = 0;
let recMonitorGain = null;
let recordingCleanup = null;
let isTabCaptureActive = false;
let suppressAutoPlay = false;
let lastOverlayStatusKey = "";

// Scrub & Gesture State
let jogActive = false;
let jogResume = "idle";
const wavePointers = new Map();
let pinchStartDist = 0;
let pinchStartWindow = 8000;
let lastPanX = 0;
let lastPanAt = 0;
let wheelActive = false;
let lastWheelAt = 0;
let cropStartMs = 0;
let cropEndMs = 0;
let cropPointerId = null;
let cropHandle = null;
let cropPointerMoved = false;
let hoveredCropHandle = null;
let lastWaveHoverX = null;
let cropDragOffsetMs = 0;
let loopEnabled = false;
let currentBeatData = null;
let loopSnapEnabled = true;
let snappedBeatMs = null;
let scrubRate = 0;

// Splice Edit Mode State
let editMode = false;
let editViewCenterMs = 0;
let editStartMs = null;
let editEndMs = null;
let editPointerId = null;
let editAnchorMs = 0;
let editHandle = null;
let editPointerStartX = 0;
let editPointerStartY = 0;
let editPointerMoved = false;
let hoveredEditHandle = null;
let editMarks = [];
let editClipboard = null;
let editAnimationToken = 0;
let editAnimationHeadRatio = null;
const editHistory = [];
const editRedo = [];

// Subsystem Controllers: Jam Auth & Library
const authUI = new window.SamplaCanvasAuthUI({
  canvasStatusIndicator,
  canvasAuthBtn,
  canvasAuthDialog,
  canvasAuthMessage,
  canvasAuthError,
  onStatus: (msg) => { statusEl.textContent = msg; },
});

const libraryController = new window.SamplaLibraryController({
  trackList,
  libraryScrollbar,
  libraryScrollThumb,
  libraryLoadBtn,
  libraryDeleteBtn,
  librarySaveBtn,
  libraryUploadBtn,
  libraryFileInput,
  libraryPanel,
  confirmDialog,
  confirmTitle,
  confirmMessage,
  confirmCancelBtn,
  confirmDeleteBtn,
  trackNameInput,
  getAudio,
  isRecording: () => mode === "record",
  onLoadTrack: async (track) => {
    stopTransport();
    blob = track.blob;
    tapeBuffer = null;
    tapeBufferRev = null;
    dropTapeTransport();
    decodeWait = null;
    wavePeaks = [];
    editHistory.length = 0;
    editRedo.length = 0;
    editMarks = [];
    playheadMs = 0;
    tapeEndMs = track.tapeDurationMs || track.durationMs;
    cropStartMs = track.cropStartMs || 0;
    cropEndMs = track.cropEndMs || track.durationMs;
    editMarks = Array.isArray(track.editMarks)
      ? track.editMarks.filter((mark) =>
        ["gain", "reverse", "cut", "silence", "fade-in", "fade-out", "paste", "duplicate"].includes(mark?.type) &&
        Number.isFinite(mark.start) && Number.isFinite(mark.end) &&
        (mark.type === "cut" ? mark.end >= mark.start : mark.end > mark.start)
        && (mark.type !== "gain" || Number.isFinite(mark.db))
      ).map((mark) => ({ ...mark }))
      : [];
    mode = "idle";
    setScreenView("live");
    showTime(0);
    syncTransport();
    const buffer = await ensureDecoded();
    if (buffer) {
      if (track.bpm && currentBeatData) {
        setBpm(track.bpm);
      }
      if (track.isLoop) {
        setLoopMode(true);
      }
      statusEl.textContent = "tape ready";
    } else {
      blob = null;
      libraryController.currentTrackId = null;
      tapeEndMs = 0;
      cropEndMs = 0;
      statusEl.textContent = "tape unreadable";
      syncTransport();
    }
    showTime(0);
  },
  onClearTrack: () => {
    clearLoadedTrack();
  },
  onStatus: (msg) => { statusEl.textContent = msg; },
  onSwitchScreen: (screen) => { setScreenView(screen); },
  onExitEditMode: async () => {
    if (editMode) await setEditMode(false);
  },
  openAuthSettings: () => {
    setSettingsOpen(true);
    authUI.openDialog();
  },
});

// Physics & Rate Mappings
function rateForMode(deckMode) {
  return transportPhysics.rateForMode(deckMode, Geometry.WIND_SPEED);
}

function transportRate() {
  return jogActive ? scrubRate : rateForMode(mode);
}

function tapeLimit() {
  if (tapeBuffer) return tapeBuffer.duration * 1000;
  return tapeEndMs > 0 ? tapeEndMs : Geometry.TAPE_CAPACITY_MS;
}

function cropBounds() {
  const limit = tapeLimit();
  const start = Math.max(0, Math.min(cropStartMs, Math.max(0, limit - CROP_MIN_MS)));
  const end = cropEndMs > start ? Math.min(cropEndMs, limit) : limit;
  return { start, end: Math.max(start + Math.min(CROP_MIN_MS, limit), end) };
}

function editSelectionBounds() {
  if (editStartMs === null || editEndMs === null) return null;
  const bounds = { start: 0, end: tapeLimit() };
  const start = Math.max(bounds.start, Math.min(editStartMs, editEndMs));
  const end = Math.min(bounds.end, Math.max(editStartMs, editEndMs));
  return end - start >= CROP_MIN_MS ? { start, end } : null;
}

function transportBounds() {
  if (mode === "record") return { start: 0, end: tapeLimit() };
  if (editMode) return editSelectionBounds() || { start: 0, end: tapeLimit() };
  return cropBounds();
}

// Waveform & Deck Visual Wrappers
function sizeWave() {
  WaveformView.sizeWave(waveCanvas);
}

function timeAtClientX(clientX) {
  const centerMs = editMode ? editViewCenterMs : playheadMs;
  return WaveformView.timeAtClientX(clientX, waveCanvas, waveWindowMs, centerMs);
}

function cropHandleAt(clientX) {
  if (!blob || mode === "record" || editMode) return null;
  return WaveformView.cropHandleAt(clientX, waveCanvas, waveWindowMs, playheadMs, cropBounds(), CROP_HIT_PX);
}

function editHandleAt(clientX) {
  const selection = editSelectionBounds();
  if (!editMode || !selection) return null;
  return WaveformView.editHandleAt(clientX, waveCanvas, waveWindowMs, editViewCenterMs, selection, CROP_HIT_PX);
}

function drawWave(ms) {
  WaveformView.drawWave(waveCanvas, waveCtx, {
    ms,
    waveWindowMs,
    wavePeaks,
    mode,
    editMode,
    editViewCenterMs,
    editAnimationHeadRatio,
    editSelection: editSelectionBounds(),
    editMarks,
    cropBounds: cropBounds(),
    activeCropHandle: cropHandle,
    hoveredCropHandle,
    activeEditHandle: editHandle,
    hoveredEditHandle,
    hasTape: Boolean(blob || tapeEndMs),
    beatGrid: {
      showBeats: editMode && Boolean(currentBeatData),
      beats: currentBeatData?.beats || [],
      bars: currentBeatData?.bars || [],
      snappedBeatMs,
    },
  });
}

function showTime(ms) {
  deckRenderer.setSevenSeg(Geometry.formatTime(ms));
  deckRenderer.setTapeProgress(Geometry.tapeAt(ms));
  deckRenderer.updateTapePath();
  if (mode === "record") sampleRecordPeak(ms);
  const duration = mode === "record"
    ? ms
    : blob
      ? Math.max(0, cropBounds().end - cropBounds().start)
      : 0;
  const durText = Geometry.formatTrackDuration(duration);
  if (trackDurationEl.textContent !== durText) {
    trackDurationEl.textContent = durText;
  }
  if (editMode && !editSelectionBounds()) {
    const editStatus = editStatusText(ms);
    if (editRange.textContent !== editStatus) {
      editRange.textContent = editStatus;
    }
  }
  drawWave(ms);
  reportOverlayStatus(ms);
}

function revealEditPlayhead() {
  if (!editMode) return;
  if (mode === "play" && editSelectionBounds()) return;
  const halfWindow = waveWindowMs / 2;
  if (
    playheadMs < editViewCenterMs - halfWindow ||
    playheadMs > editViewCenterMs + halfWindow
  ) {
    editViewCenterMs = playheadMs;
  }
}

function sampleRecordPeak(ms) {
  if (!recAnalyser || !recScratch) return;
  recAnalyser.getFloatTimeDomainData(recScratch);
  let max = 0;
  for (let i = 0; i < recScratch.length; i += 1) {
    const v = Math.abs(recScratch[i]);
    if (v > max) max = v;
  }
  const targetBin = Math.max(0, Math.floor(ms / WAVE_BIN_MS));
  const startBin = wavePeaks.length > 0 ? wavePeaks.length - 1 : 0;
  while (wavePeaks.length <= targetBin) wavePeaks.push(0);
  for (let b = startBin; b <= targetBin; b += 1) {
    wavePeaks[b] = Math.max(wavePeaks[b] || 0, max);
  }
}

// Splice Edit Controls & State
function syncEditControls() {
  const selection = editSelectionBounds();
  const selected = Boolean(selection);
  editCutBtn.disabled = !selected;
  editCopyBtn.disabled = !selected;
  editPasteBtn.disabled = !editClipboard;
  editFxToggle.disabled = !selected;
  editReverseBtn.disabled = !selected;
  if (editSpeedInput && editSpeedCell) {
    editSpeedInput.disabled = !selected;
    editSpeedCell.classList.toggle("disabled", !selected);
    if (!selected && document.activeElement !== editSpeedInput) {
      editSpeedInput.value = "1x";
    }
  }
  editFadeInBtn.disabled = !selected;
  editFadeOutBtn.disabled = !selected;
  editQuieterBtn.disabled = !selected;
  editLouderBtn.disabled = !selected;
  editUndoBtn.disabled = editHistory.length === 0;
  editRedoBtn.disabled = editRedo.length === 0;
  syncEditContextControls();
  updateEditLoopMenu();
  if (!selection) {
    setEditFxOpen(false);
    editRange.textContent = editStatusText(playheadMs);
    return;
  }
  const gain = BufferOps.gainAcrossSelection(editMarks, selection);
  const gainLabel = gain === "mixed" || Math.abs(gain) < 0.0001
    ? (gain === "mixed" ? " · MIX" : "")
    : ` · ${gain > 0 ? "+" : ""}${Math.round(gain)}DB`;
  editRange.textContent = `${Geometry.formatEditTime(selection.start)}—${Geometry.formatEditTime(selection.end)}${gainLabel}`;
}

function editStatusText(ms) {
  if (!editMarks.length) return Geometry.formatEditTime(ms);
  return `${Geometry.formatEditTime(ms)} · ${editMarks.length} EDIT${editMarks.length === 1 ? "" : "S"}`;
}

function syncEditContextControls() {
  const selection = Boolean(editSelectionBounds());
  for (const button of editContextButtons) {
    const action = button.dataset.editAction;
    if (["cut", "copy", "delete"].includes(action)) {
      button.disabled = !selection;
    } else if (action === "paste") {
      button.disabled = !editClipboard;
    }
  }
}

function setEditFxOpen(open) {
  const active = Boolean(open && editMode);
  if (active && editLoopMenu && !editLoopMenu.hidden) setEditLoopOpen(false);
  editFxMenu.hidden = !active;
  editFxToggle.classList.toggle("active", active);
  editFxToggle.setAttribute("aria-expanded", String(active));
}

function setEditLoopOpen(open) {
  const active = Boolean(open && editMode);
  if (active && editFxMenu && !editFxMenu.hidden) setEditFxOpen(false);
  if (editLoopMenu) editLoopMenu.hidden = !active;
  if (editLoopToggle) {
    editLoopToggle.classList.toggle("active", active);
    editLoopToggle.setAttribute("aria-expanded", String(active));
  }
  updateEditLoopMenu();
}

function setEditHandleHover(handle) {
  if (hoveredEditHandle === handle) return;
  hoveredEditHandle = handle;
  waveCanvas.classList.toggle("edit-handle-hover", Boolean(handle));
}

function setCropHover(handle) {
  if (hoveredCropHandle === handle) return;
  hoveredCropHandle = handle;
  waveCanvas.classList.toggle("crop-hover", Boolean(handle));
  drawWave(playheadMs);
}

function updateCrop(clientX) {
  if (!cropHandle) return;
  const limit = tapeLimit();
  const effectiveEnd = cropEndMs > cropStartMs ? Math.min(cropEndMs, limit) : limit;
  const requested = timeAtClientX(clientX) + cropDragOffsetMs;

  if (cropHandle === "start") {
    cropStartMs = Math.max(0, Math.min(requested, effectiveEnd - CROP_MIN_MS));
  } else {
    cropEndMs = Math.min(limit, Math.max(requested, cropStartMs + CROP_MIN_MS));
  }
  const bounds = cropBounds();
  statusEl.textContent = `crop ${Geometry.formatTime(bounds.start)} to ${Geometry.formatTime(bounds.end)}`;
  showTime(playheadMs);
  drawWave(playheadMs);
}

// Edit Operations & History
function captureEditState() {
  return {
    buffer: tapeBuffer,
    blob,
    cropStartMs,
    cropEndMs,
    playheadMs,
    editMarks: editMarks.map((mark) => ({ ...mark })),
  };
}

function pushEditHistory() {
  editHistory.push(captureEditState());
  if (editHistory.length > 10) editHistory.shift();
  editRedo.length = 0;
}

function restoreEditState(state, message) {
  stopTransport();
  tapeBuffer = state.buffer;
  tapeBufferRev = null;
  dropTapeTransport();
  decodeWait = null;
  blob = state.blob;
  tapeEndMs = tapeBuffer.duration * 1000;
  cropStartMs = state.cropStartMs;
  cropEndMs = state.cropEndMs;
  playheadMs = state.playheadMs;
  editViewCenterMs = playheadMs;
  editMarks = state.editMarks.map((mark) => ({ ...mark }));
  editStartMs = null;
  editEndMs = null;
  wavePeaks = BufferOps.peaksFromBuffer(tapeBuffer, WAVE_BIN_MS);
  showTime(playheadMs);
  syncEditControls();
  syncTransport();
  statusEl.textContent = message;
}

function undoBufferEdit() {
  const previous = editHistory.pop();
  if (!previous) return;
  editRedo.push(captureEditState());
  if (editRedo.length > 10) editRedo.shift();
  restoreEditState(previous, "edit undone");
}

function redoBufferEdit() {
  const next = editRedo.pop();
  if (!next) return;
  editHistory.push(captureEditState());
  if (editHistory.length > 10) editHistory.shift();
  restoreEditState(next, "edit redone");
}

function commitBufferEdit(operation, amount = 1) {
  const requestedOperation = operation;
  const selection = editSelectionBounds();
  if (!selection || !tapeBuffer) return;
  const startFrame = Math.max(0, Math.floor((selection.start / 1000) * tapeBuffer.sampleRate));
  const endFrame = Math.min(tapeBuffer.length, Math.ceil((selection.end / 1000) * tapeBuffer.sampleRate));
  if (endFrame <= startFrame) return;
  if (operation === "cut" && endFrame - startFrame >= tapeBuffer.length) {
    statusEl.textContent = "keep some tape";
    return;
  }
  if (operation === "normalize") {
    amount = BufferOps.normalizationAmount(tapeBuffer, startFrame, endFrame);
    if (amount === null) {
      statusEl.textContent = "selection is silent";
      return;
    }
    if (Math.abs(amount - 1) < 0.000001) {
      statusEl.textContent = "already normalized";
      return;
    }
    operation = "gain";
  }
  pushEditHistory();
  const oldBounds = cropBounds();
  const next = BufferOps.copyEditedBuffer(tapeBuffer, startFrame, endFrame, operation, amount, getAudio());
  const actualStartMs = (startFrame / tapeBuffer.sampleRate) * 1000;
  const actualEndMs = (endFrame / tapeBuffer.sampleRate) * 1000;
  stopTransport();
  tapeBuffer = next;
  tapeBufferRev = null;
  dropTapeTransport();
  decodeWait = null;
  blob = recordingExporter.toWavBlob(next);
  tapeEndMs = next.duration * 1000;
  editMarks = BufferOps.markEditedRange(
    editMarks,
    operation,
    actualStartMs,
    actualEndMs,
    operation === "gain" ? 20 * Math.log10(amount) : 0,
    tapeEndMs,
    CROP_MIN_MS
  );
  if (operation === "cut") {
    const nextCrop = BufferOps.remapCropBounds(oldBounds, actualStartMs, actualEndMs, 0, tapeEndMs);
    cropStartMs = nextCrop.start;
    cropEndMs = nextCrop.end;
    playheadMs = actualStartMs;
    editStartMs = null;
    editEndMs = null;
  }
  playheadMs = Math.max(0, Math.min(tapeEndMs, playheadMs));
  wavePeaks = BufferOps.peaksFromBuffer(next, WAVE_BIN_MS);
  showTime(playheadMs);
  syncEditControls();
  syncTransport();
  const messages = {
    cut: "selection cut",
    reverse: "selection reversed",
    silence: "selection silenced",
    "fade-in": "fade in applied",
    "fade-out": "fade out applied",
  };
  statusEl.textContent = requestedOperation === "normalize"
    ? "selection normalized"
    : messages[operation] || (amount < 1 ? "selection quieter" : "selection louder");
}

function commitAudioReplacement(startMs, endMs, replacement, type, customMessage) {
  if (!tapeBuffer || !replacement) return;
  const sampleRate = tapeBuffer.sampleRate;
  const startFrame = Math.max(0, Math.min(tapeBuffer.length, Math.round((startMs / 1000) * sampleRate)));
  const endFrame = Math.max(startFrame, Math.min(tapeBuffer.length, Math.round((endMs / 1000) * sampleRate)));
  const insert = BufferOps.adaptBufferFormat(replacement, tapeBuffer.numberOfChannels, sampleRate, getAudio());
  const oldBounds = cropBounds();
  pushEditHistory();
  const next = BufferOps.replaceBufferRange(tapeBuffer, startFrame, endFrame, insert, getAudio());
  const actualStartMs = (startFrame / sampleRate) * 1000;
  const actualEndMs = (endFrame / sampleRate) * 1000;
  const insertedMs = (insert.length / sampleRate) * 1000;
  stopTransport();
  tapeBuffer = next;
  tapeBufferRev = null;
  dropTapeTransport();
  decodeWait = null;
  blob = recordingExporter.toWavBlob(next);
  tapeEndMs = next.duration * 1000;
  editMarks = BufferOps.remapMarksForReplacement(editMarks, actualStartMs, actualEndMs, insertedMs, type);
  const nextCrop = BufferOps.remapCropBounds(oldBounds, actualStartMs, actualEndMs, insertedMs, tapeEndMs);
  cropStartMs = nextCrop.start;
  cropEndMs = nextCrop.end;
  playheadMs = actualStartMs;
  editStartMs = actualStartMs;
  editEndMs = actualStartMs + insertedMs;
  wavePeaks = BufferOps.peaksFromBuffer(next, WAVE_BIN_MS);
  showTime(playheadMs);
  syncEditControls();
  syncTransport();
  statusEl.textContent = customMessage || (type === "paste" ? "audio pasted" : "audio updated");
}

function applySelectionSpeed(rawValue) {
  const selection = editSelectionBounds();
  if (!selection || !tapeBuffer) return;
  const speed = BufferOps.parsePlaybackSpeed(rawValue);
  if (speed === null) {
    statusEl.textContent = "enter positive speed (e.g. 0.5, 2)";
    if (editSpeedInput) editSpeedInput.value = editSpeedInput.dataset.appliedValue || "1x";
    return;
  }
  if (speed < 0.05 || speed > 20) {
    statusEl.textContent = "speed must be between 0.05 and 20";
    if (editSpeedInput) editSpeedInput.value = editSpeedInput.dataset.appliedValue || "1x";
    return;
  }
  const formatted = BufferOps.formatPlaybackSpeed(speed);
  if (editSpeedInput && editSpeedInput.dataset.appliedValue === formatted) {
    return;
  }
  if (Math.abs(speed - 1) < 0.0001) {
    statusEl.textContent = "speed unchanged (1x)";
    if (editSpeedInput) {
      editSpeedInput.value = "1x";
      editSpeedInput.dataset.appliedValue = "1x";
    }
    return;
  }
  const startFrame = Math.max(0, Math.floor((selection.start / 1000) * tapeBuffer.sampleRate));
  const endFrame = Math.min(tapeBuffer.length, Math.ceil((selection.end / 1000) * tapeBuffer.sampleRate));
  if (endFrame <= startFrame) return;

  const clip = BufferOps.copyBufferRange(tapeBuffer, startFrame, endFrame, getAudio());
  const resampled = BufferOps.resampleBufferSpeed(clip, speed, getAudio());
  commitAudioReplacement(
    selection.start,
    selection.end,
    resampled,
    "speed",
    `speed ${formatted} applied`
  );
  if (editSpeedInput) {
    editSpeedInput.value = formatted;
    editSpeedInput.dataset.appliedValue = formatted;
  }
}

function copyEditSelection() {
  const selection = editSelectionBounds();
  if (!selection || !tapeBuffer) return;
  const startFrame = Math.max(0, Math.floor((selection.start / 1000) * tapeBuffer.sampleRate));
  const endFrame = Math.min(tapeBuffer.length, Math.ceil((selection.end / 1000) * tapeBuffer.sampleRate));
  if (endFrame <= startFrame) return;
  editClipboard = BufferOps.copyBufferRange(tapeBuffer, startFrame, endFrame, getAudio());
  syncEditControls();
  statusEl.textContent = "selection copied";
}

function cutEditSelection() {
  if (!editSelectionBounds()) return;
  copyEditSelection();
  commitBufferEdit("cut");
}

function pasteEditClipboard() {
  if (!editClipboard || !tapeBuffer) return;
  const selection = editSelectionBounds();
  const start = selection ? selection.start : playheadMs;
  const end = selection ? selection.end : playheadMs;
  commitAudioReplacement(start, end, editClipboard, "paste");
}

function cropTrackHard(startMs, endMs) {
  if (!tapeBuffer) return;
  const sampleRate = tapeBuffer.sampleRate;
  const startFrame = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
  const endFrame = Math.min(tapeBuffer.length, Math.ceil((endMs / 1000) * sampleRate));
  const minFrames = Math.floor((CROP_MIN_MS / 1000) * sampleRate);
  if (endFrame - startFrame < minFrames) return;
  if (startFrame === 0 && endFrame >= tapeBuffer.length) return;

  pushEditHistory();
  const next = BufferOps.copyBufferRange(tapeBuffer, startFrame, endFrame, getAudio());
  stopTransport();
  tapeBuffer = next;
  tapeBufferRev = null;
  dropTapeTransport();
  decodeWait = null;
  blob = recordingExporter.toWavBlob(next);
  tapeEndMs = next.duration * 1000;
  cropStartMs = 0;
  cropEndMs = tapeEndMs;
  playheadMs = 0;
  wavePeaks = BufferOps.peaksFromBuffer(next, WAVE_BIN_MS);
  updateBeatAnalysis(next);

  const removedStartMs = (startFrame / sampleRate) * 1000;
  const newDurationMs = tapeEndMs;
  editMarks = editMarks
    .filter((mark) => mark.type === "cut"
      ? mark.start >= startMs && mark.start <= endMs
      : mark.end > startMs && mark.start < endMs)
    .map((mark) => ({
      ...mark,
      start: Math.max(0, mark.start - removedStartMs),
      end: mark.type === "cut" && mark.end <= mark.start
        ? Math.max(0, mark.start - removedStartMs)
        : Math.min(newDurationMs, mark.end - removedStartMs),
    }));

  editStartMs = null;
  editEndMs = null;
  syncEditControls();
  syncTransport();
  showTime(playheadMs);
  statusEl.textContent = "track cropped";
}

function applyAutoTrimQuiet(buffer) {
  const next = BufferOps.quietEdgeBounds(buffer, WAVE_BIN_MS, CROP_MIN_MS);
  if (next.end > next.start && (next.start > 0 || next.end < buffer.duration * 1000 - 8)) {
    cropTrackHard(next.start, next.end);
    statusEl.textContent = "quiet ends trimmed";
  } else {
    cropStartMs = 0;
    cropEndMs = tapeLimit();
    playheadMs = 0;
    showTime(playheadMs);
    drawWave(playheadMs);
  }
}

// Edit Mode Loop & Beat Detection System
function updateEditLoopMenu() {
  if (!editLoopMenu) return;
  const hasBpm = currentBeatData && Number.isFinite(currentBeatData.bpm);
  if (editLoopBpmValue) {
    editLoopBpmValue.textContent = hasBpm ? `${currentBeatData.bpm.toFixed(1)} BPM` : "--- BPM";
  }
  if (editLoopBpmBtn) editLoopBpmBtn.disabled = !hasBpm;
  const hasTape = Boolean(blob || tapeEndMs);
  const disabled = !hasTape || !currentBeatData;
  if (editLoop1BarBtn) editLoop1BarBtn.disabled = disabled;
  if (editLoop2BarBtn) editLoop2BarBtn.disabled = disabled;
  if (editLoop4BarBtn) editLoop4BarBtn.disabled = disabled;
  if (editLoopAutoBtn) editLoopAutoBtn.disabled = disabled;
  const selection = editSelectionBounds();
  if (editLoopCropBtn) editLoopCropBtn.disabled = !selection;
  if (editLoopAuditionBtn) {
    editLoopAuditionBtn.disabled = !hasTape;
    editLoopAuditionBtn.classList.toggle("active", mode === "play");
  }
  if (editLoopSnapBtn) {
    editLoopSnapBtn.classList.toggle("active", loopSnapEnabled);
    editLoopSnapBtn.setAttribute("aria-pressed", String(loopSnapEnabled));
  }
}

function updateBeatAnalysis(buffer) {
  if (!buffer || !BeatDetector) {
    currentBeatData = null;
    updateEditLoopMenu();
    return;
  }
  currentBeatData = BeatDetector.detectBeats(buffer);
  updateEditLoopMenu();
}

function setBpm(newBpm) {
  if (!currentBeatData) return;
  currentBeatData.bpm = Number(newBpm.toFixed(1));
  currentBeatData.beatIntervalMs = (60 / currentBeatData.bpm) * 1000;
  currentBeatData.barIntervalMs = currentBeatData.beatIntervalMs * 4;
  const duration = tapeLimit();
  const beats = [];
  const bars = [];
  const startMs = currentBeatData.downbeatMs || 0;
  for (let t = startMs; t <= duration; t += currentBeatData.beatIntervalMs) {
    beats.push(Math.round(t));
  }
  for (let t = startMs - currentBeatData.beatIntervalMs; t >= 0; t -= currentBeatData.beatIntervalMs) {
    beats.unshift(Math.round(t));
  }
  for (let i = 0; i < beats.length; i += 4) {
    bars.push(beats[i]);
  }
  currentBeatData.beats = beats;
  currentBeatData.bars = bars;
  updateEditLoopMenu();
}

function cycleLoopBpm() {
  if (!currentBeatData || !currentBeatData.bpm) return;
  if (!currentBeatData.originalBpm) currentBeatData.originalBpm = currentBeatData.bpm;
  const orig = currentBeatData.originalBpm;
  if (Math.abs(currentBeatData.bpm - orig) < 0.5) {
    setBpm(orig * 2);
    statusEl.textContent = `tempo: ${currentBeatData.bpm.toFixed(1)} BPM (2x)`;
  } else if (Math.abs(currentBeatData.bpm - orig * 2) < 0.5) {
    setBpm(orig * 0.5);
    statusEl.textContent = `tempo: ${currentBeatData.bpm.toFixed(1)} BPM (1/2x)`;
  } else {
    setBpm(orig);
    statusEl.textContent = `tempo: ${currentBeatData.bpm.toFixed(1)} BPM`;
  }
  drawWave(playheadMs);
}

function applyEditBarPreset(barCount) {
  if (!tapeBuffer || !BeatDetector) return;
  if (!currentBeatData) updateBeatAnalysis(tapeBuffer);
  if (!currentBeatData) return;

  const selection = editSelectionBounds();
  const startAnchor = selection ? selection.start : playheadMs;
  const loop = BeatDetector.getBarLoop(startAnchor, barCount, currentBeatData, tapeLimit());
  editStartMs = BeatDetector.snapToZeroCrossing(tapeBuffer, loop.start, 10);
  editEndMs = BeatDetector.snapToZeroCrossing(tapeBuffer, loop.end, 10);
  playheadMs = editStartMs;
  syncEditControls();
  showTime(playheadMs);
  drawWave(playheadMs);
  statusEl.textContent = `${barCount} ${barCount === 1 ? "bar" : "bars"} loop (${currentBeatData.bpm.toFixed(1)} BPM)`;
}

function applyEditAutoLoop() {
  if (!tapeBuffer || !BeatDetector) return;
  if (!currentBeatData) updateBeatAnalysis(tapeBuffer);
  if (!currentBeatData) return;

  const loop = BeatDetector.autoDetectLoop(currentBeatData, tapeLimit(), 2);
  editStartMs = BeatDetector.snapToZeroCrossing(tapeBuffer, loop.start, 10);
  editEndMs = BeatDetector.snapToZeroCrossing(tapeBuffer, loop.end, 10);
  playheadMs = editStartMs;
  syncEditControls();
  showTime(playheadMs);
  drawWave(playheadMs);
  statusEl.textContent = `auto-loop: ${loop.barCount} bars (${currentBeatData.bpm.toFixed(1)} BPM)`;
}

function applyEditLoopCrop() {
  if (!tapeBuffer) return;
  const selection = editSelectionBounds();
  if (!selection || selection.end - selection.start < CROP_MIN_MS) {
    statusEl.textContent = "select a region to crop";
    return;
  }
  cropTrackHard(selection.start, selection.end);
  statusEl.textContent = "cropped to loop";
}

function toggleEditAudition() {
  if (!blob) return;
  if (mode === "play") {
    stopAll();
    statusEl.textContent = "audition stopped";
  } else {
    const selection = editSelectionBounds();
    if (selection) {
      playheadMs = selection.start;
    }
    loopEnabled = true;
    loopBtn.classList.add("active");
    loopBtn.setAttribute("aria-pressed", "true");
    playTape();
    statusEl.textContent = "auditioning loop";
  }
  updateEditLoopMenu();
}

// Edit Mode UI Animation
function randomizeEditBootStagger() {
  const items = [editRange, ...editToolbar.querySelectorAll(".edit-actions button")];
  const delays = items.map((_, index) => index * 8);
  for (let index = delays.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [delays[index], delays[swap]] = [delays[swap], delays[index]];
  }
  items.forEach((item, index) => {
    item.style.setProperty("--edit-stagger", `${delays[index]}ms`);
  });
  return delays.length ? Math.max(...delays) : 0;
}

function easeEditHeadToCenter(token, startRatio, durationMs) {
  if (durationMs <= 0 || Math.abs(startRatio - 0.5) < 0.0001) {
    editAnimationHeadRatio = 0.5;
    drawWave(playheadMs);
    return;
  }
  const startedAt = performance.now();
  const step = (now) => {
    if (token !== editAnimationToken) return;
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = 1 - (1 - progress) ** 3;
    editAnimationHeadRatio = startRatio + (0.5 - startRatio) * eased;
    drawWave(playheadMs);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function animateEditModeUI(active, headRatio = 0.5) {
  const token = ++editAnimationToken;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const resizeMs = reducedMotion ? 0 : 220;
  const fadeMs = reducedMotion ? 0 : 90;
  editAnimationHeadRatio = headRatio;
  if (active) {
    const staggerMs = reducedMotion ? 0 : randomizeEditBootStagger();
    editToolbar.hidden = false;
    editToolbar.classList.remove("edit-toolbar-visible");
    requestAnimationFrame(() => {
      if (token !== editAnimationToken) return;
      livePanel.classList.add("editing");
      setTimeout(() => {
        if (token !== editAnimationToken) return;
        editToolbar.classList.add("edit-toolbar-visible");
        sizeWave();
        drawWave(playheadMs);
        setTimeout(() => {
          if (token !== editAnimationToken) return;
          editViewCenterMs = playheadMs;
          editAnimationHeadRatio = null;
          drawWave(playheadMs);
        }, fadeMs + staggerMs);
      }, resizeMs);
    });
    return;
  }
  editToolbar.classList.remove("edit-toolbar-visible");
  setTimeout(() => {
    if (token !== editAnimationToken) return;
    livePanel.classList.remove("editing");
    easeEditHeadToCenter(token, headRatio, resizeMs);
    setTimeout(() => {
      if (token !== editAnimationToken) return;
      editToolbar.hidden = true;
      editAnimationHeadRatio = null;
      sizeWave();
      drawWave(playheadMs);
    }, resizeMs);
  }, fadeMs);
}

async function setEditMode(active) {
  if (active) {
    if (!blob || mode === "record") return;
    const buffer = await ensureDecoded();
    if (!buffer || !blob) return;
    if (!currentBeatData) updateBeatAnalysis(buffer);
  }
  const transitionHeadRatio = !active && editMode
    ? 0.5 + (playheadMs - editViewCenterMs) / waveWindowMs
    : 0.5;
  editMode = Boolean(active);
  if (editMode) editViewCenterMs = playheadMs;
  closeEditContextMenu();
  setEditFxOpen(false);
  setEditLoopOpen(false);
  editStartMs = null;
  editEndMs = null;
  editPointerId = null;
  editHandle = null;
  hoveredEditHandle = null;
  waveCanvas.classList.remove("edit-handle-hover");
  animateEditModeUI(editMode, transitionHeadRatio);
  editToggle.classList.toggle("active", editMode);
  editToggle.setAttribute("aria-pressed", String(editMode));
  editToggle.setAttribute("aria-label", editMode ? "Exit splice edit mode" : "Enter splice edit mode");
  waveCanvas.setAttribute(
    "aria-label",
    editMode ? "Waveform editor. Drag to select a region" : "Tape waveform with draggable crop handles"
  );
  syncEditControls();
  syncTransport();
  requestAnimationFrame(() => {
    sizeWave();
    drawWave(playheadMs);
  });
  statusEl.textContent = editMode ? "splice mode" : "tape ready";
}

async function finishEdits() {
  if (!editMode) return;
  const bounds = cropBounds();
  cropTrackHard(bounds.start, bounds.end);
  editMarks = [];
  editHistory.length = 0;
  editRedo.length = 0;
  await libraryController.persistCurrentTape({
    blob,
    buffer: tapeBuffer,
    cropBounds: cropBounds(),
    editMarks,
    bpm: currentBeatData?.bpm || null,
    isLoop: loopEnabled,
  });
  await setEditMode(false);
  statusEl.textContent = "edits applied";
}

// Transport Simulation Loop
function frame(now) {
  const dt = lastFrame ? Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000)) : 1 / 120;
  lastFrame = now;
  const scrubbingAtFrameStart = jogActive;
  if (moving) advancePlayhead(dt);
  const spinning = scrubbingAtFrameStart ? false : deckRenderer.spin(dt, {
    moving,
    transportRate: transportRate(),
    jogActive,
  });
  const settling = deckRenderer.stepArm(dt, {
    moving,
    modeRate: rateForMode(mode),
    jogActive,
    scrubRate,
    armTensionHeld,
    releaseArmWithReels,
    pointerCount: wavePointers.size,
    transportRate: transportRate(),
  });
  if (moving) showTime(playheadMs);
  else if (settling) deckRenderer.updateTapePath();
  if (moving || settling || spinning) rafId = requestAnimationFrame(frame);
}

function startMotion() {
  moving = true;
  releaseArmWithReels = false;
  lastFrame = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function stopMotion() {
  moving = false;
  lastFrame = performance.now();
  cancelAnimationFrame(rafId);
  showTime(playheadMs);
  rafId = requestAnimationFrame(frame);
}

function livePlayheadMs() {
  if (!source || !audioCtx) return playheadMs;
  return sourceStateAt(audioCtx.currentTime).offset * 1000;
}

function sourceStateAt(now) {
  const elapsed = Math.max(0, now - sourceStartedAt);
  const rampDuration = Math.max(0, sourceRateRampEndsAt - sourceStartedAt);
  if (rampDuration <= 0 || elapsed >= rampDuration) {
    const rampDistance = rampDuration * (sourceRateStart + sourceRate) / 2;
    return {
      offset: sourceOffset + rampDistance + sourceRate * Math.max(0, elapsed - rampDuration),
      rate: sourceRate,
    };
  }
  const acceleration = (sourceRate - sourceRateStart) / rampDuration;
  return {
    offset: sourceOffset + sourceRateStart * elapsed + acceleration * elapsed * elapsed / 2,
    rate: sourceRateStart + acceleration * elapsed,
  };
}

function acceptTapeTransportReport(message, ctx, node) {
  if (!Number.isFinite(message.position)) return;
  const reportTime = Number.isFinite(message.audioTime) ? message.audioTime : ctx.currentTime;
  if (reportTime + 0.001 < sourceStartedAt) return;

  const reportedRate = Number.isFinite(message.rate) ? message.rate : sourceRate;
  const targetRate = Number.isFinite(message.rateTarget) ? message.rateTarget : reportedRate;
  const rampFramesLeft = Number.isFinite(message.rateFramesLeft) ? Math.max(0, message.rateFramesLeft) : 0;
  sourceOffset = message.position / ctx.sampleRate;
  sourceRateStart = reportedRate;
  sourceRate = targetRate;
  sourceStartedAt = reportTime;
  sourceRateRampEndsAt = reportTime + rampFramesLeft / ctx.sampleRate;
}

function goingBackward() {
  if (source) return sourceRate < 0;
  return transportRate() < 0;
}

function stopAtTapeEnd(ms) {
  const { start, end } = transportBounds();
  if (goingBackward() && ms < start + 50) {
    playheadMs = start;
    haltWind();
    return true;
  }
  if (ms <= start) {
    playheadMs = Math.max(0, ms);
    return false;
  }
  if (ms >= end) {
    if (mode === "play" && loopEnabled && cropPointerId !== null) {
      playheadMs = Math.min(ms, tapeLimit());
      return false;
    }
    if (mode === "play" && loopEnabled && tapeBuffer) {
      stopSource({ keepPlayhead: true });
      playheadMs = start;
      playSource(1);
      return false;
    }
    playheadMs = end;
    if (!goingBackward()) {
      haltWind();
      return true;
    }
    return false;
  }
  playheadMs = ms;
  return false;
}

function advancePlayhead(dt) {
  if (mode === "record") {
    playheadMs = Date.now() - startedAt;
    return;
  }
  if (jogActive) {
    advanceScrub(dt);
    return;
  }
  if (source) {
    stopAtTapeEnd(livePlayheadMs());
  } else if (mode === "play" || mode === "ffwd" || mode === "rev") {
    stopAtTapeEnd(playheadMs + transportRate() * dt * 1000);
  }
  revealEditPlayhead();
}

function zoomScrubMaxRate() {
  return SCRUB_MAX_RATE * Math.max(
    WAVE_WINDOW_MIN / SCRUB_WINDOW_REF_MS,
    waveWindowMs / SCRUB_WINDOW_REF_MS
  );
}

function clampScrubRate(rate) {
  const max = zoomScrubMaxRate();
  return Math.max(-max, Math.min(max, rate));
}

function advanceScrubPosition(dt, visualRate = scrubRate) {
  const bounds = cropBounds();
  const previousMs = playheadMs;
  playheadMs = transportPhysics.nextScrubPosition({
    currentMs: previousMs,
    rate: visualRate,
    dt,
    startMs: bounds.start,
    endMs: bounds.end,
    audioPositionMs: source && audioCtx ? livePlayheadMs() : null,
  });
  deckRenderer.moveReelsByTapeMs(playheadMs - previousMs);
}

function finishScrubIfAtBoundary() {
  const bounds = cropBounds();
  if (playheadMs <= bounds.start && scrubRate < 0) {
    finishScrubAtBoundary("start");
    return true;
  }
  if (playheadMs >= bounds.end && scrubRate > 0) {
    finishScrubAtBoundary("end");
    return true;
  }
  return false;
}

function advanceScrub(dt) {
  const now = performance.now();
  const pointerHeld = wavePointers.size > 0;
  const wheelReceiving = wheelActive && now - lastWheelAt < WHEEL_RELEASE_MS;

  if (pointerHeld) {
    if (now - lastPanAt >= SCRUB_IDLE_MS) {
      scrubRate *= Math.exp(-SCRUB_HOLD_FRICTION * dt);
      if (Math.abs(scrubRate) < SCRUB_STOP_RATE) scrubRate = 0;
    }
    auditionScrub(scrubRate);
    advanceScrubPosition(dt);
    finishScrubIfAtBoundary();
    return;
  }

  if (wheelReceiving) {
    auditionScrub(scrubRate);
    advanceScrubPosition(dt);
    finishScrubIfAtBoundary();
    return;
  }
  wheelActive = false;

  const restRate = rateForMode(jogResume);
  const oldRate = scrubRate;
  scrubRate = restRate + (scrubRate - restRate) * Math.exp(-SCRUB_RELEASE_FRICTION * dt);
  auditionScrub(scrubRate);
  advanceScrubPosition(dt, (oldRate + scrubRate) / 2);
  if (finishScrubIfAtBoundary()) return;

  if (Math.abs(scrubRate - restRate) < SCRUB_STOP_RATE) {
    scrubRate = restRate;
    endJog();
  }
}

function haltWind() {
  const shouldHoldTension = Boolean(blob) && (jogActive || rateForMode(mode) !== 0);
  resetJogState();
  stopSource({ keepPlayhead: true });
  mode = "idle";
  moving = false;
  armTensionHeld = shouldHoldTension;
  statusEl.textContent = blob ? "tape ready" : "idle";
  showTime(playheadMs);
  syncTransport();
}

function stopTransport({ keepPlayhead = false, coastPlaybackArm = false } = {}) {
  const wasJogging = jogActive;
  resetJogState();
  stopSource({ keepPlayhead: keepPlayhead || wasJogging });
  mode = "idle";
  armTensionHeld = false;
  releaseArmWithReels = coastPlaybackArm;
  stopMotion();
  syncTransport();
}

// Audio Transport & Web Audio Nodes
function getAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext({ latencyHint: "interactive" });
    ensureWaveWorklet(audioCtx);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function dropTapeTransport() {
  if (tapeTransportNode) {
    try {
      tapeTransportNode.port.onmessage = null;
      tapeTransportNode.disconnect();
    } catch {}
  }
  if (source === tapeTransportNode) {
    source = null;
    sourceGain = null;
  }
  tapeTransportNode = null;
  tapeTransportBuffer = null;
  tapeTransportLoad = null;
}

async function ensureTapeTransport(buffer) {
  if (!buffer) return null;
  if (tapeTransportNode && tapeTransportBuffer === buffer) {
    await tapeTransportLoad;
    return tapeTransportNode;
  }
  dropTapeTransport();
  const ctx = getAudio();
  if (!tapeTransportModuleLoad) {
    const url = typeof chrome !== "undefined" && chrome?.runtime?.getURL
      ? chrome.runtime.getURL("tape-transport-processor.js")
      : "tape-transport-processor.js";
    tapeTransportModuleLoad = ctx.audioWorklet.addModule(url).catch((error) => {
      tapeTransportModuleLoad = null;
      throw error;
    });
  }
  await tapeTransportModuleLoad;
  const node = new AudioWorkletNode(ctx, "tape-transport-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [buffer.numberOfChannels],
  });
  node.connect(ctx.destination);
  tapeTransportNode = node;
  tapeTransportBuffer = buffer;
  tapeTransportLoad = new Promise((resolve) => {
    node.port.onmessage = (event) => {
      if (tapeTransportNode !== node) return;
      const message = event.data || {};
      if (message.type === "loaded") {
        resolve();
        return;
      }
      if (message.type === "scrub-boundary" && source === node && jogActive) {
        acceptTapeTransportReport(message, ctx, node);
        finishScrubAtBoundary(message.edge);
        return;
      }
      acceptTapeTransportReport(message, ctx, node);
      if (message.type === "ended" && source === node) {
        playheadMs = Math.max(
          0,
          Math.min(tapeLimit(), (message.position / ctx.sampleRate) * 1000)
        );
        source = null;
        sourceGain = null;
        haltWind();
      }
    };
  });
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel).slice()
  );
  node.port.postMessage({ type: "load", channels }, channels.map((channel) => channel.buffer));
  await tapeTransportLoad;
  return node;
}

function stopSource(opts = {}) {
  if (!source) return;
  if (source === tapeTransportNode) {
    if (!opts.keepPlayhead) {
      playheadMs = Math.max(0, Math.min(tapeLimit(), livePlayheadMs()));
    }
    const fadeFrames = opts.immediate
      ? 1
      : Math.max(1, Math.round((audioCtx?.sampleRate || 48000) * SCRUB_FADE_SEC));
    tapeTransportNode.port.postMessage({ type: "stop", fadeFrames });
    source = null;
    sourceGain = null;
    return;
  }
  if (!opts.keepPlayhead && !jogActive) playheadMs = Math.max(0, Math.min(tapeLimit(), livePlayheadMs()));
  const oldSource = source;
  const oldGain = sourceGain;
  const now = audioCtx ? audioCtx.currentTime : 0;
  source = null;
  sourceGain = null;
  oldSource.onended = () => {
    oldSource.disconnect();
    if (oldGain) oldGain.disconnect();
  };
  try {
    if (opts.immediate) {
      oldSource.stop();
    } else if (oldGain && audioCtx) {
      if (typeof oldGain.gain.cancelAndHoldAtTime === "function") {
        oldGain.gain.cancelAndHoldAtTime(now);
      } else {
        const currentGain = oldGain.gain.value;
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(currentGain, now);
      }
      oldGain.gain.linearRampToValueAtTime(0, now + SCRUB_FADE_SEC);
      oldSource.stop(now + SCRUB_FADE_SEC);
    } else {
      oldSource.stop();
    }
  } catch {}
}

function playSource(rate, options = {}) {
  stopSource({ keepPlayhead: true, immediate: options.immediateTransition });
  if (!tapeBuffer || !rate) return false;
  const ctx = getAudio();
  const duration = tapeBuffer.duration;
  const bounded = options.bounded !== false;
  const bounds = bounded ? transportBounds() : { start: 0, end: duration * 1000 };
  const offset = Math.min(Math.max(bounds.start / 1000, playheadMs / 1000), bounds.end / 1000);
  if (rate < 0 && offset <= bounds.start / 1000) return false;
  if (rate > 0 && offset >= bounds.end / 1000) return false;
  if (tapeTransportNode && tapeTransportBuffer === tapeBuffer) {
    const fadeFrames = options.immediateTransition
      ? 1
      : Math.max(1, Math.round(ctx.sampleRate * SCRUB_FADE_SEC));
    sourceOffset = offset;
    sourceRateStart = rate;
    sourceRate = rate;
    sourceStartedAt = ctx.currentTime;
    sourceRateRampEndsAt = ctx.currentTime;
    source = tapeTransportNode;
    sourceGain = null;
    tapeTransportNode.port.postMessage({
      type: "start",
      position: offset * ctx.sampleRate,
      rate,
      startFrame: (bounds.start / 1000) * ctx.sampleRate,
      endFrame: (bounds.end / 1000) * ctx.sampleRate,
      loop: bounded && mode === "play" && loopEnabled,
      fadeFrames,
    });
    return true;
  }
  const reverse = rate < 0;
  if (reverse && !tapeBufferRev) tapeBufferRev = BufferOps.invertBuffer(tapeBuffer, ctx);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = reverse ? tapeBufferRev : tapeBuffer;
  src.playbackRate.value = Math.abs(rate);
  if (options.immediateTransition) {
    gain.gain.setValueAtTime(1, ctx.currentTime);
  } else {
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + SCRUB_FADE_SEC);
  }
  src.connect(gain);
  gain.connect(ctx.destination);
  sourceOffset = offset;
  sourceRateStart = rate;
  sourceRate = rate;
  sourceStartedAt = ctx.currentTime;
  sourceRateRampEndsAt = ctx.currentTime;
  source = src;
  sourceGain = gain;
  src.onended = () => {
    src.disconnect();
    gain.disconnect();
    if (source !== src) return;
    const endedRate = sourceRate;
    source = null;
    sourceGain = null;
    if (jogActive) return;
    const finalBounds = transportBounds();
    if (endedRate > 0 && mode === "play" && loopEnabled) {
      if (cropPointerId !== null) {
        playheadMs = duration * 1000;
        return;
      }
      playheadMs = finalBounds.start;
      if (playSource(1)) {
        startMotion();
        return;
      }
    }
    playheadMs = endedRate < 0 ? finalBounds.start : finalBounds.end;
    haltWind();
  };
  const startAt = reverse ? Math.max(0, duration - offset) : offset;
  const span = reverse ? offset : duration - offset;
  if (span <= 0) {
    source = null;
    sourceGain = null;
    src.disconnect();
    gain.disconnect();
    return false;
  }
  try {
    src.start(0, startAt, span);
  } catch {
    source = null;
    sourceGain = null;
    src.disconnect();
    gain.disconnect();
    return false;
  }
  return true;
}

function ensureDecoded() {
  if (!blob) return Promise.resolve(null);
  if (tapeBuffer) return Promise.resolve(tapeBuffer);
  if (decodeWait) return decodeWait;
  decodeWait = blob
    .arrayBuffer()
    .then((bytes) => getAudio().decodeAudioData(bytes.slice(0)))
    .then(async (buf) => {
      tapeBuffer = buf;
      tapeBufferRev = null;
      dropTapeTransport();
      tapeEndMs = buf.duration * 1000;
      cropEndMs = cropEndMs > 0 ? Math.min(cropEndMs, tapeEndMs) : tapeEndMs;
      if (!wavePeaks.length) wavePeaks = BufferOps.peaksFromBuffer(buf, WAVE_BIN_MS);
      else wavePeaks.length = Math.min(wavePeaks.length, Math.max(1, Math.ceil(tapeEndMs / WAVE_BIN_MS)));
      updateBeatAnalysis(buf);
      drawWave(playheadMs);
      try {
        await ensureTapeTransport(buf);
      } catch (error) {
        console.warn("Sample-level tape transport unavailable; using fallback playback", error);
        dropTapeTransport();
      }
      return buf;
    })
    .catch(() => {
      decodeWait = null;
      return null;
    });
  return decodeWait;
}

function syncTransport() {
  const recording = mode === "record";
  const hasTape = Boolean(blob);
  const playing = mode === "play" && Boolean(source);
  recordBtn.disabled = recording;
  revBtn.disabled = recording || !hasTape;
  stopBtn.disabled = mode === "idle";
  playBtn.disabled = recording || !hasTape || mode === "play";
  ffwdBtn.disabled = recording || !hasTape;
  loopBtn.disabled = recording || !hasTape;
  saveBtn.disabled = !hasTape;
  editToggle.disabled = recording || !hasTape;
  libraryTab.disabled = recording;
  trackNameInput.disabled = !recording && !hasTape;
  playLight.classList.toggle("lit", playing);
  recordLight.classList.toggle("lit", recording);
  updateSourceControls();
  libraryController.syncActions();
  updateEditLoopMenu();
}

function playTape() {
  suppressAutoPlay = false;
  if (!blob) return;
  resetJogState();
  const ctx = getAudio();
  const resumed = ctx.state === "running" ? Promise.resolve() : ctx.resume();
  Promise.all([ensureDecoded(), resumed]).then(async () => {
    if (mode === "record" || !tapeBuffer) return;
    try {
      await ensureTapeTransport(tapeBuffer);
    } catch (error) {
      console.warn("Sample-level tape transport unavailable; using fallback playback", error);
      dropTapeTransport();
    }
    if (!tapeTransportNode && !tapeBufferRev) tapeBufferRev = BufferOps.invertBuffer(tapeBuffer, ctx);
    const bounds = transportBounds();
    if (playheadMs < bounds.start || playheadMs >= bounds.end - 1) playheadMs = bounds.start;
    mode = "play";
    if (!playSource(1)) {
      mode = "idle";
      statusEl.textContent = blob ? "tape ready" : "idle";
      syncTransport();
      return;
    }
    startMotion();
    statusEl.textContent = "playing";
    syncTransport();
  });
}

function wind(direction) {
  if (mode === "record" || !blob) return;
  const { start, end } = transportBounds();
  if (direction > 0 && playheadMs >= end - 20) {
    playheadMs = end;
    showTime(playheadMs);
    haltWind();
    return;
  }
  if (direction < 0 && playheadMs <= start + 80) {
    playheadMs = start;
    showTime(start);
    haltWind();
    return;
  }
  const go = () => {
    stopSource();
    mode = direction < 0 ? "rev" : "ffwd";
    startMotion();
    statusEl.textContent = direction < 0 ? "reverse" : "ffwd";
    syncTransport();
  };
  go();
}

function resumeTransport(resume) {
  stopSource({ keepPlayhead: true });
  if (resume === "play" && blob) {
    mode = "play";
    if (!playSource(1)) {
      haltWind();
      return;
    }
    startMotion();
    statusEl.textContent = "playing";
    syncTransport();
    return;
  }
  if (resume === "ffwd") {
    wind(1);
    return;
  }
  if (resume === "rev") {
    wind(-1);
    return;
  }
  mode = "idle";
  statusEl.textContent = blob ? "tape ready" : "idle";
  syncTransport();
  stopMotion();
}

// Scrubbing & Jog Shuttle
function beginJog() {
  if (mode === "record") return false;
  const starting = !jogActive;
  if (!jogActive) {
    const enteringRate = source && audioCtx
      ? sourceStateAt(audioCtx.currentTime).rate
      : transportRate();
    if (source) {
      playheadMs = Math.max(0, Math.min(tapeLimit(), livePlayheadMs()));
    }
    jogResume = mode;
    jogActive = true;
    scrubRate = enteringRate;
    deckRenderer.reelRate = 0;
    if (mode !== "play") stopSource({ keepPlayhead: true });
  }
  if (starting) {
    startMotion();
    syncTransport();
  }
  return true;
}

function resetWheelScrub() {
  wheelActive = false;
  lastWheelAt = 0;
}

function resetJogState() {
  jogActive = false;
  jogResume = "idle";
  scrubRate = 0;
  resetWheelScrub();
  wavePointers.clear();
}

function endJog() {
  const resume = jogResume;
  if (!jogActive) return;
  if (source && audioCtx) {
    playheadMs = Math.max(0, Math.min(tapeLimit(), livePlayheadMs()));
  }
  const shouldResumePlaying = resume === "play" && mode === "play";
  resetJogState();
  armTensionHeld = Boolean(blob);
  deckRenderer.reelRate = shouldResumePlaying ? 1 : 0;
  if (shouldResumePlaying && source === tapeTransportNode) {
    auditionScrub(1, { scrubbing: false });
    statusEl.textContent = "playing";
    syncTransport();
    showTime(playheadMs);
    return;
  }
  resumeTransport(shouldResumePlaying ? "play" : resume);
}

function finishScrubAtBoundary(edge) {
  const bounds = cropBounds();
  playheadMs = edge === "start" ? bounds.start : bounds.end;
  resetWheelScrub();
  scrubRate = 0;
  if (wavePointers.size > 0) {
    if (mode === "play") auditionScrub(0);
    showTime(playheadMs);
    return;
  }
  if (edge === "start" && mode === "play" && jogResume === "play") {
    endJog();
    showTime(playheadMs);
    return;
  }
  haltWind();
}

function auditionScrub(rate, { scrubbing = true } = {}) {
  if (mode !== "play") {
    stopSource({ keepPlayhead: true });
    return;
  }
  const r = Number.isFinite(rate) ? rate : 0;
  if (!tapeBuffer) {
    stopSource({ keepPlayhead: true });
    return;
  }
  if (source === tapeTransportNode) {
    const effectiveRate = Math.abs(r) < 0.00001 ? 0 : r;
    const now = audioCtx.currentTime;
    const state = sourceStateAt(now);
    sourceOffset = state.offset;
    sourceRateStart = state.rate;
    sourceRate = effectiveRate;
    sourceStartedAt = now;
    sourceRateRampEndsAt = now + SCRUB_RATE_RAMP_SEC;
    tapeTransportNode.port.postMessage({
      type: "set-rate",
      rate: effectiveRate,
      rampFrames: Math.max(1, Math.round(audioCtx.sampleRate * SCRUB_RATE_RAMP_SEC)),
      scrubbing,
    });
    return;
  }
  const effectiveRate = r === 0
    ? 0
    : Math.abs(r) < SCRUB_MIN_AUDIBLE_RATE
      ? Math.sign(r) * SCRUB_MIN_AUDIBLE_RATE
      : r;
  if (effectiveRate === 0) {
    stopSource({ keepPlayhead: true });
    return;
  }
  playSource(effectiveRate, { immediateTransition: true });
}

function updateScrubInputRate(measuredRate, dt) {
  const alpha = 1 - Math.exp(-SCRUB_INPUT_RESPONSE * dt);
  scrubRate += (measuredRate - scrubRate) * alpha;
}

function gestureMsPerPx() {
  const width = Math.max(1, waveCanvas._cssWidth || waveCanvas.clientWidth);
  return waveWindowMs / width;
}

function scrubTapeByMs(deltaMs, dtSec) {
  if (!beginJog()) return;
  const dt = Math.max(1 / 120, Math.min(0.05, dtSec || 0.016));
  updateScrubInputRate(clampScrubRate(deltaMs / dt / 1000), dt);
  auditionScrub(scrubRate);
  showTime(playheadMs);
}

function nudgeTape(deltaPx, dtSec) {
  return scrubTapeByMs(-deltaPx * gestureMsPerPx(), dtSec);
}

function queueWheelScrub(deltaPx, nativeMomentum = false) {
  if (mode === "record" || (!blob && !wavePeaks.length)) return;
  if (nativeMomentum) {
    resetWheelScrub();
    return;
  }
  const now = performance.now();
  const dt = lastWheelAt ? Math.max(1 / 120, (now - lastWheelAt) / 1000) : 1 / 60;
  scrubTapeByMs(deltaPx * gestureMsPerPx(), dt);
  wheelActive = true;
  lastWheelAt = now;
}

function zoomWave(scale) {
  waveWindowMs = Math.min(WAVE_WINDOW_MAX, Math.max(WAVE_WINDOW_MIN, waveWindowMs * scale));
  drawWave(playheadMs);
}

function panEditWave(deltaPx) {
  if (!editMode) return;
  editViewCenterMs = Math.max(
    0,
    Math.min(tapeLimit(), editViewCenterMs + deltaPx * gestureMsPerPx())
  );
  drawWave(playheadMs);
}

function pointerDistance() {
  const pts = [...wavePointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

// Audio Recording & Capture
function microphoneConstraints() {
  const deviceId = micDeviceSelect.value;
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

async function getMicrophoneStream() {
  return navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });
}

const extensionRuntime = typeof chrome !== "undefined" ? chrome.runtime : null;
if (extensionRuntime?.onMessage?.addListener) {
  extensionRuntime.onMessage.addListener((msg) => {
    if (msg?.type === "SAMPLA_TAB_PEAK" && mode === "record" && isTabCaptureActive) {
      const targetBin = Math.max(0, Math.floor(playheadMs / WAVE_BIN_MS));
      const startBin = wavePeaks.length > 0 ? wavePeaks.length - 1 : 0;
      while (wavePeaks.length <= targetBin) wavePeaks.push(0);
      for (let b = startBin; b <= targetBin; b += 1) {
        wavePeaks[b] = Math.max(wavePeaks[b] || 0, msg.peak);
      }
    } else if (msg?.type === "SAMPLA_CAPTURE_ENDED" && isTabCaptureActive) {
      stopAll();
    }
  });
}

async function getSystemAudioStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    const error = new Error("Screen and window audio capture is unavailable in this browser.");
    error.code = "system-audio-unsupported";
    throw error;
  }
  const displayMediaOptions = {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    systemAudio: "include",
    surfaceSwitching: "include",
    selfBrowserSurface: "include",
  };
  const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
  const audioTracks = displayStream.getAudioTracks();
  displayStream.getVideoTracks().forEach((track) => track.stop());
  if (!audioTracks.length) {
    displayStream.getTracks().forEach((track) => track.stop());
    const error = new Error("The shared source did not include audio. Please check 'Share tab audio' or 'Share system audio'.");
    error.code = "system-audio-missing";
    throw error;
  }
  return new MediaStream(audioTracks);
}

async function acquireRecordingInput() {
  const method = recordSourceSelect.value;
  if (method === "mic") {
    const stream = await getMicrophoneStream();
    return { stream, cleanup: () => stream.getTracks().forEach((track) => track.stop()) };
  }
  const stream = await getSystemAudioStream();
  return {
    stream,
    cleanup: () => stream.getTracks().forEach((track) => track.stop()),
  };
}

let waveWorkletLoaded = false;
let waveWorkletPromise = null;

async function ensureWaveWorklet(ctx) {
  if (waveWorkletLoaded) return true;
  if (!ctx || !ctx.audioWorklet) return false;
  if (!waveWorkletPromise) {
    const url = typeof chrome !== "undefined" && chrome?.runtime?.getURL
      ? chrome.runtime.getURL("wave-processor.js")
      : "wave-processor.js";
    waveWorkletPromise = ctx.audioWorklet
      .addModule(url)
      .then(() => {
        waveWorkletLoaded = true;
        return true;
      })
      .catch((err) => {
        console.warn("Failed to load wave-processor AudioWorklet:", err);
        waveWorkletPromise = null;
        return false;
      });
  }
  return waveWorkletPromise;
}

async function hookMeter(stream) {
  const ctx = getAudio();
  if (ctx.state === "suspended") await ctx.resume();
  recInput = ctx.createMediaStreamSource(stream);
  recAnalyser = ctx.createAnalyser();
  recAnalyser.fftSize = 512;
  recScratch = new Float32Array(recAnalyser.fftSize);
  recInput.connect(recAnalyser);
  recWaveFrame = 0;

  const workletReady = await ensureWaveWorklet(ctx);
  if (workletReady) {
    try {
      recWaveProcessor = new AudioWorkletNode(ctx, "wave-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { binMs: WAVE_BIN_MS },
      });
      recWaveSink = ctx.createGain();
      recWaveSink.gain.value = 0;
      recWaveProcessor.port.onmessage = (event) => {
        const { startBin, peaks, currentBin, currentPeak } = event.data;
        if (peaks && peaks.length) {
          for (let i = 0; i < peaks.length; i += 1) {
            const b = startBin + i;
            wavePeaks[b] = Math.max(wavePeaks[b] || 0, peaks[i]);
          }
        }
        if (typeof currentBin === "number" && typeof currentPeak === "number") {
          wavePeaks[currentBin] = Math.max(wavePeaks[currentBin] || 0, currentPeak);
        }
      };
      recInput.connect(recWaveProcessor);
      recWaveProcessor.connect(recWaveSink);
      recWaveSink.connect(ctx.destination);
    } catch (err) {
      console.warn("Failed to initialize AudioWorkletNode:", err);
      recWaveProcessor = null;
    }
  } else if (ctx.createScriptProcessor) {
    recWaveProcessor = ctx.createScriptProcessor(2048, 1, 1);
    recWaveSink = ctx.createGain();
    recWaveSink.gain.value = 0;
    recWaveProcessor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const channels = Array.from(
        { length: input.numberOfChannels },
        (_, channel) => input.getChannelData(channel)
      );
      const framesPerBin = (input.sampleRate * WAVE_BIN_MS) / 1000;
      for (let frame = 0; frame < input.length; frame += 1) {
        const bin = Math.floor(recWaveFrame / framesPerBin);
        let peak = wavePeaks[bin] || 0;
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame]));
        wavePeaks[bin] = peak;
        recWaveFrame += 1;
      }
    };
    recInput.connect(recWaveProcessor);
    recWaveProcessor.connect(recWaveSink);
    recWaveSink.connect(ctx.destination);
  }

  if (monitorInputToggle.checked && recordSourceSelect.value !== "tab") {
    recMonitorGain = ctx.createGain();
    recMonitorGain.gain.setValueAtTime(0, ctx.currentTime);
    recMonitorGain.gain.linearRampToValueAtTime(0.65, ctx.currentTime + 0.012);
    recInput.connect(recMonitorGain);
    recMonitorGain.connect(ctx.destination);
  }
}

function fadeOutInputMonitor() {
  if (!recMonitorGain || !audioCtx || audioCtx.state === "closed") return Promise.resolve();
  const now = audioCtx.currentTime;
  const gain = recMonitorGain.gain;
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

function dropMeter() {
  if (recInput) recInput.disconnect();
  if (recAnalyser) {
    try { recAnalyser.disconnect(); } catch {}
  }
  if (recMonitorGain) recMonitorGain.disconnect();
  if (recWaveProcessor) {
    if (recWaveProcessor.port) recWaveProcessor.port.onmessage = null;
    recWaveProcessor.onaudioprocess = null;
    try { recWaveProcessor.disconnect(); } catch {}
  }
  if (recWaveSink) {
    try { recWaveSink.disconnect(); } catch {}
  }
  recInput = null;
  recAnalyser = null;
  recScratch = null;
  recMonitorGain = null;
  recWaveProcessor = null;
  recWaveSink = null;
}

function mediaRecorderOptions() {
  const audioBitsPerSecond = Number(recordQualitySelect.value) || 128000;
  const preferredTypes = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  const mimeType = preferredTypes.find(
    (type) => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(type)
  );
  return mimeType ? { mimeType, audioBitsPerSecond } : { audioBitsPerSecond };
}

async function startRecording() {
  suppressAutoPlay = false;
  setScreenView("live");
  if (editMode) await setEditMode(false);

  const method = recordSourceSelect.value;
  if (method === "tab" || method === "mix") {
    stopTransport();
    chunks = [];
    blob = null;
    libraryController.currentTrackId = null;
    trackNameInput.value = libraryController.nextTrackName();
    tapeBuffer = null;
    tapeBufferRev = null;
    dropTapeTransport();
    decodeWait = null;
    wavePeaks = [];
    editHistory.length = 0;
    editRedo.length = 0;
    editMarks = [];
    cropStartMs = 0;
    cropEndMs = 0;
    tapeEndMs = 0;
    playheadMs = 0;
    showTime(0);

    isTabCaptureActive = true;
    try {
      const res = await chrome.runtime.sendMessage({
        type: "SAMPLA_START_TAB_CAPTURE",
        quality: recordQualitySelect.value,
        includeMic: method === "mix",
      });
      if (!res || !res.ok) {
        isTabCaptureActive = false;
        throw new Error(res?.error || "Tab capture failed");
      }
      startedAt = Date.now();
      mode = "record";
      setScreenView("live");
      startMotion();
      statusEl.textContent = "recording";
      syncTransport();
      refreshMicrophones();
    } catch (error) {
      isTabCaptureActive = false;
      stopMotion();
      syncTransport();
      throw error;
    }
    return;
  }

  const input = await acquireRecordingInput();
  const { stream } = input;
  recordingCleanup = input.cleanup;
  try {
    stopTransport();
    chunks = [];
    blob = null;
    libraryController.currentTrackId = null;
    trackNameInput.value = libraryController.nextTrackName();
    tapeBuffer = null;
    tapeBufferRev = null;
    dropTapeTransport();
    decodeWait = null;
    wavePeaks = [];
    editHistory.length = 0;
    editRedo.length = 0;
    editMarks = [];
    cropStartMs = 0;
    cropEndMs = 0;
    tapeEndMs = 0;
    playheadMs = 0;
    showTime(0);
    mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions());
    await hookMeter(stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      playheadMs = Math.max(playheadMs, Date.now() - startedAt);
      await fadeOutInputMonitor();
      if (recordingCleanup) recordingCleanup();
      recordingCleanup = null;
      dropMeter();
      blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      tapeEndMs = playheadMs;
      cropStartMs = 0;
      cropEndMs = 0;
      mode = "idle";
      stopMotion();
      statusEl.textContent = "tape ready";
      syncTransport();
      const ready = ensureDecoded();
      ready.then((buffer) => {
        if (!buffer || !blob) return;
        if (autoTrimQuietToggle.checked) applyAutoTrimQuiet(buffer);
        maybeAutoPlayRecording();
      });
    };
    mediaRecorder.start();
    startedAt = Date.now();
    mode = "record";
    setScreenView("live");
    startMotion();
    statusEl.textContent = "recording";
    syncTransport();
    refreshMicrophones();
  } catch (error) {
    if (recordingCleanup) recordingCleanup();
    recordingCleanup = null;
    dropMeter();
    throw error;
  }
}

function maybeAutoPlayRecording() {
  if (suppressAutoPlay) return;
  if (autoPlayRecordingToggle.checked && mode === "idle") playTape();
}

async function stopAll() {
  if (isTabCaptureActive) {
    isTabCaptureActive = false;
    statusEl.textContent = "saving...";
    stopMotion();
    try {
      const res = await chrome.runtime.sendMessage({ type: "SAMPLA_STOP_TAB_CAPTURE" });
      if (res && res.ok && res.dataUrl) {
        const fetchRes = await fetch(res.dataUrl);
        blob = await fetchRes.blob();
        playheadMs = Math.max(playheadMs, Date.now() - startedAt);
        tapeEndMs = playheadMs;
        cropStartMs = 0;
        cropEndMs = 0;
        mode = "idle";
        statusEl.textContent = "tape ready";
        syncTransport();
        const ready = ensureDecoded();
        ready.then((buffer) => {
          if (!buffer || !blob) return;
          if (autoTrimQuietToggle.checked) applyAutoTrimQuiet(buffer);
          maybeAutoPlayRecording();
        });
        return;
      } else {
        throw new Error(res?.error || "Failed to stop tab capture");
      }
    } catch (err) {
      console.error("Failed to stop tab capture:", err);
      mode = "idle";
      statusEl.textContent = "capture error";
      syncTransport();
      return;
    }
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }
  const wasIdle = mode === "idle";
  const wasPlaying = mode === "play";
  stopTransport({ coastPlaybackArm: wasPlaying });
  if (wasIdle) return;
  statusEl.textContent = blob ? "tape ready" : "idle";
}

function haltWhenClosed() {
  suppressAutoPlay = true;
  const capturing = isTabCaptureActive || (mediaRecorder && mediaRecorder.state !== "inactive");
  stopAll();
  if (capturing) {
    dropMeter();
    return;
  }
  stopTransport({ keepPlayhead: true });
  dropMeter();
}

function resumeAfterOpen() {
  suppressAutoPlay = false;
  try {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
  sizeWave();
  drawWave(playheadMs);
  reportOverlayStatus(playheadMs);
  if (moving || mode === "record" || mode === "play" || mode === "ffwd" || mode === "rev") {
    startMotion();
  }
}

function setScreenView(view) {
  const showLibrary = view === "library";
  if (showLibrary && (mode === "record" || editMode)) return;
  livePanel.hidden = showLibrary;
  libraryPanel.hidden = !showLibrary;
  if (showLibrary) requestAnimationFrame(() => libraryController.updateScrollbar());
  else {
    requestAnimationFrame(() => {
      sizeWave();
      drawWave(playheadMs);
    });
  }
}

function clearLoadedTrack() {
  stopTransport();
  blob = null;
  tapeBuffer = null;
  tapeBufferRev = null;
  dropTapeTransport();
  decodeWait = null;
  wavePeaks = [];
  editHistory.length = 0;
  editRedo.length = 0;
  editMarks = [];
  playheadMs = 0;
  tapeEndMs = 0;
  cropStartMs = 0;
  cropEndMs = 0;
  mode = "idle";
  trackNameInput.value = "";
  showTime(0);
  syncTransport();
}

// Settings & Preferences
function setSettingsOpen(open) {
  CustomControls.closeCustomSelects();
  settingsMenu.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", String(open));
  settingsToggle.setAttribute("aria-label", open ? "Close settings" : "Open settings");
  if (open) refreshMicrophones();
}

function readSetting(name, fallback) {
  try {
    return localStorage.getItem(`sampla-${name}`) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(name, value) {
  try {
    localStorage.setItem(`sampla-${name}`, String(value));
  } catch {}
}

function persistRecordOnClick(enabled) {
  writeSetting("record-on-click", enabled);
  try {
    chrome.storage?.local?.set({ [RECORD_ON_CLICK_STORAGE_KEY]: Boolean(enabled) });
  } catch {}
}

let autoRecordStartPending = false;
function maybeStartRecordingFromClick() {
  if (mode === "record" || autoRecordStartPending) return;
  autoRecordStartPending = true;
  startRecording()
    .catch((error) => {
      if (error.code === "system-audio-missing") statusEl.textContent = "share audio to record";
      else if (error.code === "system-audio-unsupported") statusEl.textContent = "system audio unavailable";
      else statusEl.textContent = recordSourceSelect.value === "mic" ? "mic blocked" : "capture blocked";
    })
    .finally(() => {
      autoRecordStartPending = false;
    });
}

function updateSourceControls() {
  const recording = mode === "record";
  const src = recordSourceSelect.value;
  recordSourceSelect.disabled = recording;
  micDeviceSelect.disabled = recording || (src !== "mic" && src !== "mix");
  recordQualitySelect.disabled = recording;
  monitorInputToggle.disabled = recording;
}

async function refreshMicrophones() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const selected = micDeviceSelect.value || readSetting("mic-device", "");
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput"
    );
    const options = [{ label: "System default", value: "" }];
    devices.forEach((device, index) => {
      options.push({ label: device.label || `Microphone ${index + 1}`, value: device.deviceId });
    });
    micDeviceSelect.replaceOptions(options);
    if (options.some((option) => option.value === selected)) micDeviceSelect.value = selected;
  } catch {}
}

// Keyboard Navigation & Shortcuts
function seekFromKeyboard(nextMs) {
  if (!blob || mode === "record") return;
  if (mode !== "idle") stopTransport();
  const bounds = editMode ? { start: 0, end: tapeLimit() } : cropBounds();
  playheadMs = Math.max(bounds.start, Math.min(bounds.end, nextMs));
  revealEditPlayhead();
  if (editMode) syncEditControls();
  showTime(playheadMs);
  syncTransport();
  statusEl.textContent = `seek ${Geometry.formatTime(playheadMs)}`;
}

function adjustEditSelection(side, deltaMs) {
  if (!editMode || !blob) return;
  const limit = tapeLimit();
  const selection = editSelectionBounds();
  if (!selection) {
    const other = Math.max(0, Math.min(limit, playheadMs + deltaMs));
    editStartMs = Math.min(playheadMs, other);
    editEndMs = Math.max(playheadMs, other);
  } else if (side === "start") {
    editStartMs = Math.max(0, Math.min(selection.end - CROP_MIN_MS, selection.start + deltaMs));
    editEndMs = selection.end;
  } else {
    editStartMs = selection.start;
    editEndMs = Math.min(limit, Math.max(selection.start + CROP_MIN_MS, selection.end + deltaMs));
  }
  syncEditControls();
  drawWave(playheadMs);
  statusEl.textContent = editSelectionBounds() ? "selection adjusted" : "extend selection";
}

function toggleKeyboardPlayback() {
  if (!blob || mode === "record") return;
  setScreenView("live");
  if (mode === "play" || mode === "ffwd" || mode === "rev") stopAll();
  else playTape();
}

function openEditFxFromKeyboard() {
  if (editFxToggle.disabled) return;
  const open = editFxMenu.hidden;
  setEditFxOpen(open);
  if (open) editFxMenu.querySelector("button:not(:disabled)")?.focus();
  else waveCanvas.focus();
}

function selectAllForEdit() {
  if (!editMode || !blob) return;
  editStartMs = 0;
  editEndMs = tapeLimit();
  playheadMs = 0;
  syncEditControls();
  showTime(playheadMs);
  statusEl.textContent = "all selected";
}

function closeEditContextMenu() {
  editContextMenu.hidden = true;
}

function placeEditPlayhead(clientX, preserveSelection = false) {
  if (!editMode || !blob) return;
  if (mode !== "idle") {
    stopSource({ keepPlayhead: true });
    mode = "idle";
    stopMotion();
  }
  const at = Math.max(0, Math.min(tapeLimit(), timeAtClientX(clientX)));
  const selection = editSelectionBounds();
  playheadMs = at;
  if (!preserveSelection || !selection || at < selection.start || at > selection.end) {
    editStartMs = null;
    editEndMs = null;
  }
  syncEditControls();
  showTime(playheadMs);
  syncTransport();
  statusEl.textContent = `cursor ${Geometry.formatTime(playheadMs)}`;
}

function openEditContextMenu(clientX, clientY) {
  CustomControls.closeCustomSelects();
  setEditFxOpen(false);
  syncEditContextControls();
  editContextMenu.hidden = false;
  editContextMenu.style.visibility = "hidden";
  editContextMenu.style.left = "0px";
  editContextMenu.style.top = "0px";
  const rect = editContextMenu.getBoundingClientRect();
  const left = Math.max(4, Math.min(window.innerWidth - rect.width - 4, clientX));
  const top = Math.max(4, Math.min(window.innerHeight - rect.height - 4, clientY));
  editContextMenu.style.left = `${left}px`;
  editContextMenu.style.top = `${top}px`;
  editContextMenu.style.visibility = "visible";
  editContextButtons.find((button) => !button.disabled)?.focus();
}

function runEditAction(action) {
  if (action === "cut") cutEditSelection();
  else if (action === "copy") copyEditSelection();
  else if (action === "paste") pasteEditClipboard();
  else if (action === "delete") commitBufferEdit("cut");
}

function releaseWavePointer(event) {
  if (editMode && event.pointerId === editPointerId) {
    const clicked = event.type === "pointerup" && !editPointerMoved;
    const preserveSelection = Boolean(editHandle);
    editPointerId = null;
    editHandle = null;
    editPointerMoved = false;
    snappedBeatMs = null;
    if (clicked) {
      placeEditPlayhead(event.clientX, preserveSelection);
    } else if (loopSnapEnabled && tapeBuffer && BeatDetector && editSelectionBounds()) {
      editStartMs = BeatDetector.snapToZeroCrossing(tapeBuffer, editStartMs, 10);
      editEndMs = BeatDetector.snapToZeroCrossing(tapeBuffer, editEndMs, 10);
    }
    setEditHandleHover(editHandleAt(event.clientX));
    syncEditControls();
    drawWave(playheadMs);
    statusEl.textContent = clicked
      ? "cursor placed"
      : editSelectionBounds() ? "selection ready" : "cursor unchanged";
    try {
      if (waveCanvas.hasPointerCapture(event.pointerId)) waveCanvas.releasePointerCapture(event.pointerId);
    } catch {}
    return;
  }
  if (event.pointerId === cropPointerId) {
    cropPointerId = null;
    cropHandle = null;
    cropPointerMoved = false;
    cropDragOffsetMs = 0;
    snappedBeatMs = null;
    lastWaveHoverX = event.clientX;
    setCropHover(cropHandleAt(event.clientX));
    try {
      if (waveCanvas.hasPointerCapture(event.pointerId)) waveCanvas.releasePointerCapture(event.pointerId);
    } catch {}
    const bounds = cropBounds();
    if (playheadMs < bounds.start || playheadMs > bounds.end) {
      playheadMs = Math.max(bounds.start, Math.min(bounds.end, playheadMs));
    }
    showTime(playheadMs);
    drawWave(playheadMs);
    statusEl.textContent = "tape ready";
    return;
  }
  if (!wavePointers.has(event.pointerId)) return;
  wavePointers.delete(event.pointerId);
  try {
    if (waveCanvas.hasPointerCapture(event.pointerId)) waveCanvas.releasePointerCapture(event.pointerId);
  } catch {}
  if (wavePointers.size === 1) {
    const left = [...wavePointers.values()][0];
    lastPanX = left.x;
    lastPanAt = performance.now();
    return;
  }
  if (wavePointers.size === 0 && jogActive) {
    const releasedWhileMoving = performance.now() - lastPanAt < 50;
    if (!releasedWhileMoving) scrubRate = 0;
    else scrubRate = clampScrubRate(scrubRate);
  }
}

// Event Listeners Wiring
settingsToggle.addEventListener("click", () => setSettingsOpen(settingsMenu.hidden));
liveTab.addEventListener("click", () => setScreenView("live"));
libraryTab.addEventListener("click", () => setScreenView("library"));
editToggle.addEventListener("click", () => setEditMode(!editMode));
editDoneBtn.addEventListener("click", () => {
  finishEdits().catch(() => setEditMode(false));
});
editCutBtn.addEventListener("click", cutEditSelection);
editCopyBtn.addEventListener("click", copyEditSelection);
editPasteBtn.addEventListener("click", pasteEditClipboard);
editFxToggle.addEventListener("click", () => setEditFxOpen(editFxMenu.hidden));
editReverseBtn.addEventListener("click", () => commitBufferEdit("reverse"));

if (editSpeedCell && editSpeedInput) {
  editSpeedCell.addEventListener("click", () => {
    if (editSpeedInput.disabled) return;
    if (document.activeElement !== editSpeedInput) {
      editSpeedInput.focus();
      editSpeedInput.select();
    }
  });
  editSpeedInput.addEventListener("focus", () => editSpeedInput.select());
  editSpeedInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applySelectionSpeed(editSpeedInput.value);
      editSpeedInput.blur();
      waveCanvas.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editSpeedInput.value = editSpeedInput.dataset.appliedValue || "1x";
      editSpeedInput.blur();
      waveCanvas.focus();
    }
  });
  editSpeedInput.addEventListener("change", () => {
    if (!editSpeedInput.disabled) applySelectionSpeed(editSpeedInput.value);
  });
}

editFadeInBtn.addEventListener("click", () => commitBufferEdit("fade-in"));
editFadeOutBtn.addEventListener("click", () => commitBufferEdit("fade-out"));
editQuieterBtn.addEventListener("click", () => commitBufferEdit("gain", 10 ** (-3 / 20)));
editLouderBtn.addEventListener("click", () => commitBufferEdit("gain", 10 ** (3 / 20)));
editUndoBtn.addEventListener("click", undoBufferEdit);
editRedoBtn.addEventListener("click", redoBufferEdit);

editContextMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.editAction;
  closeEditContextMenu();
  runEditAction(action);
  waveCanvas.focus();
});

editContextMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeEditContextMenu();
    waveCanvas.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const enabled = editContextButtons.filter((button) => !button.disabled);
  if (!enabled.length) return;
  const current = enabled.indexOf(document.activeElement);
  let next = 0;
  if (event.key === "End") next = enabled.length - 1;
  else if (event.key === "ArrowUp") next = current <= 0 ? enabled.length - 1 : current - 1;
  else if (event.key === "ArrowDown") next = current < 0 || current === enabled.length - 1 ? 0 : current + 1;
  enabled[next].focus();
});

recordSourceSelect.addEventListener("change", () => {
  writeSetting("record-source", recordSourceSelect.value);
  updateSourceControls();
});
micDeviceSelect.addEventListener("change", () => {
  writeSetting("mic-device", micDeviceSelect.value);
});
recordQualitySelect.addEventListener("change", () => {
  writeSetting("record-quality", recordQualitySelect.value);
});
monitorInputToggle.addEventListener("change", () => {
  writeSetting("monitor-input", monitorInputToggle.checked);
});
autoPlayRecordingToggle.addEventListener("change", () => {
  writeSetting("auto-play-recording", autoPlayRecordingToggle.checked);
});
autoTrimQuietToggle.addEventListener("change", () => {
  writeSetting("auto-trim-quiet", autoTrimQuietToggle.checked);
});
recordOnClickToggle.addEventListener("change", () => {
  persistRecordOnClick(recordOnClickToggle.checked);
});
waveformZoomSelect.addEventListener("change", () => {
  waveWindowMs = Number(waveformZoomSelect.value);
  writeSetting("waveform-zoom", waveformZoomSelect.value);
  drawWave(playheadMs);
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", refreshMicrophones);
}

document.addEventListener("click", (event) => {
  if (!editContextMenu.hidden && !event.target.closest?.("#edit-context-menu")) {
    closeEditContextMenu();
  }
  if (!event.target.closest?.(".custom-select")) CustomControls.closeCustomSelects();
  if (!editFxMenu.hidden && !event.target.closest?.("#edit-fx-menu, #edit-fx-toggle")) {
    setEditFxOpen(false);
  }
  if (editLoopMenu && !editLoopMenu.hidden && !event.target.closest?.("#edit-loop-menu, #edit-loop-toggle")) {
    setEditLoopOpen(false);
  }
  if (
    !settingsMenu.hidden &&
    !settingsMenu.contains(event.target) &&
    !settingsToggle.contains(event.target)
  ) {
    setSettingsOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cropPointerId !== null) {
    event.preventDefault();
    const pid = cropPointerId;
    cropPointerId = null;
    cropHandle = null;
    cropPointerMoved = false;
    cropDragOffsetMs = 0;
    cropStartMs = 0;
    cropEndMs = tapeLimit();
    setCropHover(null);
    try {
      if (waveCanvas.hasPointerCapture(pid)) waveCanvas.releasePointerCapture(pid);
    } catch {}
    showTime(playheadMs);
    statusEl.textContent = "crop cancelled";
    return;
  }
  if (event.key === "Escape" && !editContextMenu.hidden) {
    event.preventDefault();
    closeEditContextMenu();
    waveCanvas.focus();
    return;
  }
  if (event.key === "Escape" && !settingsMenu.hidden) {
    event.preventDefault();
    setSettingsOpen(false);
    settingsToggle.focus();
    return;
  }
  if (!confirmDialog.hidden) return;
  const target = event.target instanceof Element ? event.target : null;
  const typing = Boolean(target?.matches("input, textarea, select, [contenteditable='true']"));
  const key = event.key.toLowerCase();
  const command = event.metaKey || event.ctrlKey;

  if (command && key === "s") {
    if (!blob || mode === "record") return;
    event.preventDefault();
    if (tapeBuffer) {
      libraryController.storeTape({
        blob,
        buffer: tapeBuffer,
        cropBounds: cropBounds(),
        editMarks,
      });
    }
    return;
  }
  if (typing) return;
  if (target?.matches("button") && [" ", "enter", "arrowleft", "arrowright", "home", "end"].includes(key)) return;

  if (event.key === " ") {
    event.preventDefault();
    toggleKeyboardPlayback();
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (!blob || mode === "record") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    if (editMode && (event.altKey || event.shiftKey)) {
      adjustEditSelection(event.altKey ? "start" : "end", direction * 10);
    } else {
      seekFromKeyboard(playheadMs + direction * (event.shiftKey ? 1000 : 100));
    }
    return;
  }
  if ((event.key === "Home" || event.key === "End") && blob && mode !== "record") {
    event.preventDefault();
    const bounds = editMode ? { start: 0, end: tapeLimit() } : cropBounds();
    seekFromKeyboard(event.key === "Home" ? bounds.start : bounds.end);
    return;
  }

  if (editMode && event.key === "Escape") {
    event.preventDefault();
    if (editLoopMenu && !editLoopMenu.hidden) {
      setEditLoopOpen(false);
      editLoopToggle?.focus();
    } else if (!editFxMenu.hidden) {
      setEditFxOpen(false);
      editFxToggle.focus();
    } else if (editSelectionBounds()) {
      editStartMs = null;
      editEndMs = null;
      syncEditControls();
      drawWave(playheadMs);
      statusEl.textContent = "selection cleared";
    } else setEditMode(false);
  } else if (editMode && !command && key === "l") {
    event.preventDefault();
    if (editLoopToggle) setEditLoopOpen(editLoopMenu ? editLoopMenu.hidden : false);
  } else if (editMode && command && key === "a") {
    event.preventDefault();
    selectAllForEdit();
  } else if (editMode && command && key === "x") {
    event.preventDefault();
    cutEditSelection();
  } else if (editMode && command && key === "c") {
    event.preventDefault();
    copyEditSelection();
  } else if (editMode && command && key === "v") {
    event.preventDefault();
    pasteEditClipboard();
  } else if (editMode && (event.key === "Delete" || event.key === "Backspace")) {
    event.preventDefault();
    commitBufferEdit("cut");
  } else if (editMode && !command && key === "r") {
    event.preventDefault();
    commitBufferEdit("reverse");
  } else if (command && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redoBufferEdit();
    else undoBufferEdit();
  } else if (command && key === "y") {
    event.preventDefault();
    redoBufferEdit();
  } else if (editMode && !command && key === "f") {
    event.preventDefault();
    openEditFxFromKeyboard();
  } else if (editMode && !command && (key === "s" || key === "n")) {
    event.preventDefault();
    if (editFxMenu.hidden) setEditFxOpen(true);
    if (editSpeedInput && !editSpeedInput.disabled) {
      editSpeedInput.focus();
      editSpeedInput.select();
    }
  } else if (editMode && !command && key === "i") {
    event.preventDefault();
    commitBufferEdit("fade-in");
  } else if (editMode && !command && key === "o") {
    event.preventDefault();
    commitBufferEdit("fade-out");
  } else if (editMode && !command && (event.key === "-" || event.key === "_")) {
    event.preventDefault();
    commitBufferEdit("gain", 10 ** (-3 / 20));
  } else if (editMode && !command && (event.key === "+" || event.key === "=")) {
    event.preventDefault();
    commitBufferEdit("gain", 10 ** (3 / 20));
  } else if (!editMode && !command && key === "r") {
    event.preventDefault();
    if (mode === "record") stopAll();
    else recordBtn.click();
  } else if (!editMode && !command && key === "s") {
    event.preventDefault();
    stopAll();
  } else if (!editMode && !command && key === "e" && blob && mode !== "record") {
    event.preventDefault();
    setScreenView("live");
    setEditMode(true).then(() => waveCanvas.focus());
  } else if (!editMode && !command && key === "b" && mode !== "record") {
    event.preventDefault();
    setScreenView(libraryPanel.hidden ? "library" : "live");
  } else if (!editMode && !command && key === "o" && blob && mode !== "record") {
    event.preventDefault();
    loopBtn.click();
  }
});

recordBtn.addEventListener("click", () => {
  startRecording().catch((error) => {
    if (error.code === "system-audio-missing") statusEl.textContent = "share audio to record";
    else if (error.code === "system-audio-unsupported") statusEl.textContent = "system audio unavailable";
    else statusEl.textContent = recordSourceSelect.value === "mic" ? "mic blocked" : "capture blocked";
  });
});
stopBtn.addEventListener("click", stopAll);
revBtn.addEventListener("click", () => wind(-1));
playBtn.addEventListener("click", playTape);
ffwdBtn.addEventListener("click", () => wind(1));
saveBtn.addEventListener("click", async () => {
  if (!blob) return;
  const buffer = await ensureDecoded();
  if (buffer) {
    libraryController.storeTape({
      blob,
      buffer,
      cropBounds: cropBounds(),
      editMarks,
      bpm: currentBeatData?.bpm || null,
      isLoop: loopEnabled,
    });
  }
});
loopBtn.addEventListener("click", () => {
  loopEnabled = !loopEnabled;
  loopBtn.classList.toggle("active", loopEnabled);
  loopBtn.setAttribute("aria-pressed", String(loopEnabled));
  statusEl.textContent = loopEnabled ? "loop on" : "loop off";
});

if (editLoopToggle) {
  editLoopToggle.addEventListener("click", () => setEditLoopOpen(editLoopMenu ? editLoopMenu.hidden : false));
}
if (editLoopBpmBtn) editLoopBpmBtn.addEventListener("click", cycleLoopBpm);
if (editLoopSnapBtn) {
  editLoopSnapBtn.addEventListener("click", () => {
    loopSnapEnabled = !loopSnapEnabled;
    editLoopSnapBtn.classList.toggle("active", loopSnapEnabled);
    editLoopSnapBtn.setAttribute("aria-pressed", String(loopSnapEnabled));
    statusEl.textContent = loopSnapEnabled ? "snap to beat on" : "snap to beat off";
    drawWave(playheadMs);
  });
}
if (editLoop1BarBtn) editLoop1BarBtn.addEventListener("click", () => applyEditBarPreset(1));
if (editLoop2BarBtn) editLoop2BarBtn.addEventListener("click", () => applyEditBarPreset(2));
if (editLoop4BarBtn) editLoop4BarBtn.addEventListener("click", () => applyEditBarPreset(4));
if (editLoopAutoBtn) editLoopAutoBtn.addEventListener("click", applyEditAutoLoop);
if (editLoopCropBtn) editLoopCropBtn.addEventListener("click", applyEditLoopCrop);
if (editLoopAuditionBtn) editLoopAuditionBtn.addEventListener("click", toggleEditAudition);

waveCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (mode === "record" || (!blob && !wavePeaks.length)) return;
  event.preventDefault();
  closeEditContextMenu();
  getAudio();
  if (blob) ensureDecoded();
  try {
    waveCanvas.setPointerCapture(event.pointerId);
  } catch {}
  if (editMode) {
    setEditFxOpen(false);
    editPointerId = event.pointerId;
    editHandle = editHandleAt(event.clientX);
    editAnchorMs = Math.max(0, Math.min(tapeLimit(), timeAtClientX(event.clientX)));
    editPointerStartX = event.clientX;
    editPointerStartY = event.clientY;
    editPointerMoved = false;
    hoveredEditHandle = editHandle;
    setEditHandleHover(editHandle);
    drawWave(playheadMs);
    return;
  }
  const hit = cropHandleAt(event.clientX);
  lastWaveHoverX = event.clientX;
  if (hit) {
    cropPointerId = event.pointerId;
    cropHandle = hit;
    cropPointerMoved = false;
    hoveredCropHandle = hit;
    const bounds = cropBounds();
    cropDragOffsetMs = bounds[hit] - timeAtClientX(event.clientX);
    waveCanvas.classList.add("crop-hover");
    drawWave(playheadMs);
    return;
  }
  setCropHover(null);
  wavePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  lastPanX = event.clientX;
  lastPanAt = performance.now();
  if (wavePointers.size === 1 && mode === "play") {
    if (jogActive) {
      resetWheelScrub();
    } else {
      beginJog();
      scrubRate = 0;
      auditionScrub(0);
    }
  }
  if (wavePointers.size === 2) {
    pinchStartDist = pointerDistance();
    pinchStartWindow = waveWindowMs;
  }
});

waveCanvas.addEventListener("pointermove", (event) => {
  if (editMode && event.pointerId === editPointerId) {
    event.preventDefault();
    if (!editPointerMoved) {
      editPointerMoved = Math.hypot(
        event.clientX - editPointerStartX,
        event.clientY - editPointerStartY
      ) >= 3;
      if (!editPointerMoved) return;
    }
    const bounds = { start: 0, end: tapeLimit() };
    let at = Math.max(bounds.start, Math.min(bounds.end, timeAtClientX(event.clientX)));
    snappedBeatMs = null;
    if (loopSnapEnabled && currentBeatData?.beats?.length) {
      const msPerPx = waveWindowMs / Math.max(1, waveCanvas.width);
      const snapDistanceMs = msPerPx * 14;
      const snapResult = BeatDetector?.snapToBeat(at, currentBeatData.beats, snapDistanceMs);
      if (snapResult && snapResult.beatIndex >= 0) {
        at = snapResult.timeMs;
        snappedBeatMs = at;
      }
    }
    if (editHandle === "start") {
      editStartMs = Math.min(editEndMs - CROP_MIN_MS, at);
    } else if (editHandle === "end") {
      editEndMs = Math.max(editStartMs + CROP_MIN_MS, at);
    } else {
      editStartMs = Math.min(editAnchorMs, at);
      editEndMs = Math.max(editAnchorMs, at);
    }
    syncEditControls();
    drawWave(playheadMs);
    return;
  }
  if (editMode) {
    setEditHandleHover(editHandleAt(event.clientX));
    drawWave(playheadMs);
    return;
  }
  if (event.pointerId === cropPointerId) {
    event.preventDefault();
    cropPointerMoved = true;
    updateCrop(event.clientX);
    return;
  }
  if (!wavePointers.has(event.pointerId)) {
    lastWaveHoverX = event.clientX;
    setCropHover(cropHandleAt(event.clientX));
    return;
  }
  wavePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (wavePointers.size >= 2) {
    const dist = pointerDistance();
    if (pinchStartDist > 4 && dist > 4) {
      waveWindowMs = Math.min(
        WAVE_WINDOW_MAX,
        Math.max(WAVE_WINDOW_MIN, pinchStartWindow * (pinchStartDist / dist))
      );
      drawWave(playheadMs);
    }
    return;
  }
  const dx = event.clientX - lastPanX;
  if (Math.abs(dx) < 0.01) return;
  const now = performance.now();
  nudgeTape(dx, (now - lastPanAt) / 1000);
  lastPanX = event.clientX;
  lastPanAt = now;
});

waveCanvas.addEventListener("pointerup", releaseWavePointer);
waveCanvas.addEventListener("pointercancel", releaseWavePointer);
waveCanvas.addEventListener("lostpointercapture", releaseWavePointer);
window.addEventListener("pointerup", releaseWavePointer);
window.addEventListener("pointercancel", releaseWavePointer);
waveCanvas.addEventListener("pointerleave", () => {
  if (editMode && editPointerId === null) {
    setEditHandleHover(null);
    drawWave(playheadMs);
    return;
  }
  if (cropPointerId === null) {
    lastWaveHoverX = null;
    setCropHover(null);
  }
});

waveCanvas.addEventListener("contextmenu", (event) => {
  if (!editMode || !blob || mode === "record") return;
  event.preventDefault();
  openEditContextMenu(event.clientX, event.clientY);
});

waveCanvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (mode === "record" || (!blob && !wavePeaks.length)) return;
    if (event.ctrlKey || event.metaKey) {
      zoomWave(2 ** (event.deltaY * 0.01));
      return;
    }
    if (!Number.isFinite(event.deltaX)) return;
    const pixelScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? Math.max(1, waveCanvas._cssWidth || waveCanvas.clientWidth)
        : 1;
    if (editMode) {
      panEditWave(event.deltaX * pixelScale);
      return;
    }
    if (wavePointers.size > 0) return;
    const nativeMomentum = event.momentum === true || Boolean(Number(
      event.webkitMomentumPhase ?? event.momentumPhase ?? 0
    ));
    if (nativeMomentum) {
      queueWheelScrub(0, true);
      return;
    }
    if (Math.abs(event.deltaX) < 0.01) return;
    queueWheelScrub(event.deltaX * pixelScale);
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  sizeWave();
  drawWave(playheadMs);
  libraryController.updateScrollbar();
});
if (typeof ResizeObserver !== "undefined") {
  const waveResizeObserver = new ResizeObserver(() => {
    sizeWave();
    drawWave(playheadMs);
  });
  waveResizeObserver.observe(waveCanvas);
}

// Initial Settings Load
const savedSource = readSetting("record-source", "tab");
const validSources = ["tab", "pick", "mic", "mix"];
recordSourceSelect.value = validSources.includes(savedSource) ? savedSource : "tab";

const savedQuality = readSetting("record-quality", "128000");
if ([...recordQualitySelect.options].some((option) => option.value === savedQuality)) {
  recordQualitySelect.value = savedQuality;
}
monitorInputToggle.checked = readSetting("monitor-input", "false") === "true";
autoPlayRecordingToggle.checked = readSetting("auto-play-recording", "false") === "true";
autoTrimQuietToggle.checked = readSetting("auto-trim-quiet", "true") === "true";
recordOnClickToggle.checked = readSetting("record-on-click", "false") === "true";
try {
  chrome.storage?.local?.get(RECORD_ON_CLICK_STORAGE_KEY, (items) => {
    if (typeof items?.[RECORD_ON_CLICK_STORAGE_KEY] === "boolean") {
      recordOnClickToggle.checked = items[RECORD_ON_CLICK_STORAGE_KEY];
      writeSetting("record-on-click", recordOnClickToggle.checked);
    } else {
      persistRecordOnClick(recordOnClickToggle.checked);
    }
  });
} catch {}

const savedZoom = readSetting("waveform-zoom", "8000");
if ([...waveformZoomSelect.options].some((option) => option.value === savedZoom)) {
  waveformZoomSelect.value = savedZoom;
  waveWindowMs = Number(savedZoom);
}

updateSourceControls();
refreshMicrophones();
libraryController.refresh().catch(() => {
  statusEl.textContent = "library unavailable";
});

// Initialization
sizeWave();
showTime(0);
syncTransport();

try {
  chrome.runtime.sendMessage({ type: "SAMPLA_ENSURE_OFFSCREEN" }).catch(() => {});
} catch {}

try {
  const autoRecordFromUrl = new URLSearchParams(location.search).get("autoRecord") === "1";
  if (autoRecordFromUrl) maybeStartRecordingFromClick();
} catch {}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "SAMPLA_AUTO_RECORD") maybeStartRecordingFromClick();
  if (event.data?.type === "SAMPLA_SHUTDOWN") haltWhenClosed();
  if (event.data?.type === "SAMPLA_RESUME") resumeAfterOpen();
});

try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "SAMPLA_AUTO_RECORD") maybeStartRecordingFromClick();
  });
} catch {}

// Report deck height to floating iframe container
function reportDeckSize() {
  if (window.parent === window) return;
  const deck = document.querySelector(".deck");
  if (!deck) return;
  const height = Math.ceil(deck.getBoundingClientRect().height);
  if (height > 0) {
    window.parent.postMessage({ type: "SAMPLA_RESIZE", height }, "*");
  }
}

function reportOverlayStatus(ms = playheadMs) {
  if (window.parent === window) return;
  let activity = "IDLE";
  let color = "#3b82ff";
  if (mode === "record") {
    activity = "REC";
    color = "#ff0000";
  } else if (mode === "play") {
    activity = "PLAY";
    color = "#00d26a";
  } else if (mode === "ffwd") {
    activity = "FFWD";
    color = "#3b82ff";
  } else if (mode === "rev") {
    activity = "REV";
    color = "#3b82ff";
  } else if (editMode) {
    activity = "EDIT";
    color = "#ffd400";
  } else if (jogActive) {
    activity = "SCRUB";
    color = "#3b82ff";
  } else if (blob) {
    activity = "READY";
    color = "#3b82ff";
  }
  const time = Geometry.formatTime(ms);
  const key = `${time}|${activity}|${color}`;
  if (key === lastOverlayStatusKey) return;
  lastOverlayStatusKey = key;
  const payload = { type: "SAMPLA_STATUS", time, activity, color };
  try {
    window.parent.postMessage(payload, "*");
  } catch {}
  try {
    chrome.runtime.sendMessage(payload);
  } catch {}
}

if (window.parent !== window) {
  try {
    const ro = new ResizeObserver(() => reportDeckSize());
    const deck = document.querySelector(".deck");
    if (deck) ro.observe(deck);
  } catch {}
  window.addEventListener("load", () => {
    reportDeckSize();
    reportOverlayStatus();
  });
  reportDeckSize();
  reportOverlayStatus();
  setInterval(() => {
    if (mode === "record") playheadMs = Date.now() - startedAt;
    else if (source && audioCtx && (mode === "play" || mode === "ffwd" || mode === "rev")) {
      playheadMs = livePlayheadMs();
    }
    reportOverlayStatus(playheadMs);
  }, 50);
}
