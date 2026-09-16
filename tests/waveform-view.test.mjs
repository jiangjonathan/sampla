import assert from "node:assert/strict";
import test from "node:test";

await import("../src/audio/audio-buffer-ops.js");
await import("../src/ui/deck-geometry.js");
await import("../src/ui/waveform-view.js");

const WaveformView = globalThis.SamplaWaveformView;
const BufferOps = globalThis.SamplaBufferOps;

function createMockCanvas(width = 780, height = 200, clientWidth = 390, clientHeight = 100) {
  const drawCalls = [];
  const ctx = {
    fillStyle: "",
    font: "",
    textBaseline: "",
    fillRect(x, y, w, h) {
      drawCalls.push({ type: "fillRect", x, y, w, h, fillStyle: this.fillStyle });
    },
    fillText(text, x, y) {
      drawCalls.push({ type: "fillText", text, x, y });
    },
    measureText(text) {
      return { width: text.length * 6 };
    },
    fill(path) {
      drawCalls.push({ type: "fill", path, fillStyle: this.fillStyle });
    },
    textAlign: "start",
  };

  const canvas = {
    width,
    height,
    clientWidth,
    clientHeight,
    _cssWidth: clientWidth,
    _cssHeight: clientHeight,
    _columnWidth: Math.max(1, Math.round(width / clientWidth)),
    getContext() {
      return ctx;
    },
    drawCalls,
  };
  return { canvas, ctx, drawCalls };
}

test("sizeWave sets dimensions and cached geometry metrics", () => {
  const canvas = {
    clientWidth: 390,
    clientHeight: 100,
    width: 0,
    height: 0,
  };
  globalThis.window = { devicePixelRatio: 2 };

  WaveformView.sizeWave(canvas);
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 200);
  assert.equal(canvas._cssWidth, 390);
  assert.equal(canvas._cssHeight, 100);
  assert.equal(canvas._columnWidth, 2);
});

test("waveRenderCenterMs quantizes center time to column grid using cached metrics", () => {
  const { canvas } = createMockCanvas(780, 200, 390, 100);
  // w=780, columnWidth=2 -> msPerColumn = (8000 / 780) * 2 = 20.512820512820515
  const waveWindowMs = 8000;
  const msPerColumn = (8000 / 780) * 2;

  const centerA = 1000;
  const renderMsA = WaveformView.waveRenderCenterMs(centerA, canvas, waveWindowMs);
  const expectedA = Math.round(centerA / msPerColumn) * msPerColumn;
  assert.equal(renderMsA, expectedA);

  const centerB = centerA + 5; // < half column, should stay on same column
  const renderMsB = WaveformView.waveRenderCenterMs(centerB, canvas, waveWindowMs);
  assert.equal(renderMsB, renderMsA);
});

test("wheel deltas normalize pixel, line, and page input consistently", () => {
  assert.deepEqual(
    WaveformView.normalizeWheelDeltas({ deltaMode: 0, deltaX: 7, deltaY: -9 }, 390),
    { x: 7, y: -9 }
  );
  assert.deepEqual(
    WaveformView.normalizeWheelDeltas({ deltaMode: 1, deltaX: 0, deltaY: 3 }, 390),
    { x: 0, y: 48 }
  );
  assert.deepEqual(
    WaveformView.normalizeWheelDeltas({ deltaMode: 2, deltaX: -1, deltaY: 1 }, 390),
    { x: -390, y: 390 }
  );
});

test("mouse-wheel zoom is bounded while retaining smooth trackpad precision", () => {
  assert.equal(WaveformView.wheelZoomScale(100), 2);
  assert.equal(WaveformView.wheelZoomScale(1000), 2);
  assert.equal(WaveformView.wheelZoomScale(-1000), 0.5);
  assert.ok(WaveformView.wheelZoomScale(1) > 1);
  assert.ok(WaveformView.wheelZoomScale(1) < 1.01);
});

test("drawWave skips redundant repaints when visual state is unchanged", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  const peaks = new Float32Array([0.2, 0.5, 0.8, 0.3, 0.1]);

  const options = {
    ms: 1000,
    waveWindowMs: 8000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: false,
    editViewCenterMs: 0,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [],
    cropBounds: { start: 0, end: 5000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
  };

  WaveformView.drawWave(canvas, ctx, options);
  const callsFirst = drawCalls.length;
  assert.ok(callsFirst > 0, "first draw must produce canvas calls");

  // Redraw with identical state (same column time)
  WaveformView.drawWave(canvas, ctx, options);
  assert.equal(drawCalls.length, callsFirst, "second draw with identical state must be skipped");

  // Minor advance within the same column time grid (k remains 49 for both 1000ms and 1002ms)
  WaveformView.drawWave(canvas, ctx, { ...options, ms: 1002 });
  assert.equal(drawCalls.length, callsFirst, "draw within same column grid must be skipped");
});

test("drawWave renders four stem lanes on the normal waveform canvas", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas(780, 200, 390, 100);
  globalThis.window = { devicePixelRatio: 2 };
  const peaks = new Float32Array(1000).fill(.6);
  WaveformView.drawWave(canvas, ctx, {
    ms: 4000,
    waveWindowMs: 8000,
    wavePeaks: peaks,
    stemLanes: [0, 1, 2, 3].map(() => ({ peaks, enabled: true })),
    stemTransition: 1,
    mode: "idle",
    editMode: false,
    editViewCenterMs: 0,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [],
    cropBounds: { start: 0, end: 8000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
  });
  const lit = drawCalls.find((call) => call.type === "fill" && call.fillStyle === "#ffffff");
  assert.ok(lit?.path?.ops?.length, "stem waveform bars should be painted");
  const yValues = lit.path.ops.filter((_, index) => index % 4 === 1);
  for (let lane = 0; lane < 4; lane++) {
    assert.ok(yValues.some((y) => y >= lane * 50 && y < (lane + 1) * 50), `lane ${lane + 1} should contain waveform bars`);
  }
});

test("playback transitions across all zoom levels are flicker-free", () => {
  const peaks = new Float32Array(5000);
  for (let i = 0; i < peaks.length; i++) {
    peaks[i] = (Math.sin(i * 0.3) > 0.6 ? 0.9 : 0.1) * (i % 5 === 0 ? 1.0 : 0.25);
  }

  const zoomLevels = [400, 800, 1000, 2000, 4000, 8000, 16000, 30000, 60000, 120000];
  const { canvas } = createMockCanvas(780, 200, 390, 100);

  for (const waveWindowMs of zoomLevels) {
    const msPerDevicePx = waveWindowMs / canvas.width;
    const columnWidth = canvas._columnWidth;
    const msPerColumn = msPerDevicePx * columnWidth;
    const headX = Math.round(canvas.width / 2);
    const headCol = headX / columnWidth;

    let flickers = 0;
    let checks = 0;

    let prevBars = null;
    let prevK = null;

    // Simulate playback at 120fps (8.33ms per frame) over 60 frames
    for (let f = 0; f < 60; f++) {
      const time = 3000 + f * (1000 / 120);
      const k = Math.round(time / msPerColumn);

      const bars = [];
      for (let x = 0; x < canvas.width; x += columnWidth) {
        const colIndex = Math.round(x / columnWidth);
        const colStart = (k + colIndex - headCol) * msPerColumn;
        const colEnd = colStart + msPerColumn;
        bars.push(BufferOps.peakInRange(peaks, colStart, colEnd));
      }

      if (prevBars && prevK !== null && prevK !== k) {
        const colShift = k - prevK;
        for (let i = 0; i < bars.length - colShift; i++) {
          const oldBar = prevBars[i + colShift];
          const newBar = bars[i];
          checks++;
          if (Math.abs(oldBar - newBar) > 0.0001) {
            flickers++;
          }
        }
      }
      prevBars = bars;
      prevK = k;
    }

    assert.equal(flickers, 0, `Waveform bar height must not flicker at zoom ${waveWindowMs}ms (checked ${checks} shifts)`);
  }
});

test("drawWave renders a cut as one line with CUT at the bottom", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  const peaks = new Float32Array(20);
  peaks.fill(0.4);

  WaveformView.drawWave(canvas, ctx, {
    ms: 4000,
    waveWindowMs: 8000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: true,
    editViewCenterMs: 4000,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [{ type: "cut", start: 4000, end: 4000 }],
    cropBounds: { start: 0, end: 8000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
  });

  const labels = drawCalls.filter((call) => call.type === "fillText").map((call) => call.text);
  assert.deepEqual(labels, ["CUT"]);
  const cutLines = drawCalls.filter((call) =>
    call.type === "fillRect" && call.fillStyle === "#ff4d6d" && call.h === canvas.height
  );
  assert.equal(cutLines.length, 1);
});

test("drawWave renders beat ticks and bar indicators when showBeats is true", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  const peaks = new Float32Array(20);
  peaks.fill(0.3);

  WaveformView.drawWave(canvas, ctx, {
    ms: 2000,
    waveWindowMs: 8000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: false,
    editViewCenterMs: 0,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [],
    cropBounds: { start: 0, end: 8000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
    beatGrid: {
      showBeats: true,
      beats: [1000, 1500, 2000, 2500, 3000],
      bars: [1000, 3000],
      snappedBeatMs: 2000,
    },
  });

  const barCalls = drawCalls.filter((c) => c.fillStyle === "#ff8c37");
  assert.ok(barCalls.length >= 2, "Should render bar indicators");

  const snappedCalls = drawCalls.filter((c) => c.fillStyle === "rgba(255, 140, 55, 0.4)");
  assert.equal(snappedCalls.length, 1, "Should render 1 snapped beat guide column");
});

test("drawWave renders bar numbers without transient dot artifacts in edit mode", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  const peaks = new Float32Array(20);
  peaks.fill(0.3);

  WaveformView.drawWave(canvas, ctx, {
    ms: 2000,
    waveWindowMs: 8000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: true,
    editViewCenterMs: 2000,
    editAnimationHeadRatio: null,
    editSelection: { start: 2000, end: 4000 },
    editMarks: [],
    cropBounds: { start: 0, end: 8000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
    beatGrid: {
      showBeats: true,
      beats: [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000],
      bars: [0, 2000, 4000],
      transients: [500, 1500, 2500],
      snappedBeatMs: null,
    },
  });

  const barTextCalls = drawCalls.filter((c) => c.type === "fillText" && ["1", "2", "3"].includes(c.text));
  assert.ok(barTextCalls.length >= 1, "Should render numeric bar badges");

  const transientCalls = drawCalls.filter((c) => c.fillStyle === "rgba(255, 212, 0, 0.3)");
  assert.equal(transientCalls.length, 0, "Transient analysis dots should not cover the waveform");
});

test("stem morph begins at the original waveform and converges without an endpoint jump", () => {
  const peaks = new Float32Array(100).fill(.8);
  const stemPeaks = new Float32Array(100).fill(.1);
  function rectangles(transition, stems = true) {
    const { canvas, ctx, drawCalls } = createMockCanvas();
    WaveformView.drawWave(canvas, ctx, {
      ms: 500, waveWindowMs: 1000, wavePeaks: peaks, mode: 'idle', editMode: false,
      editViewCenterMs: 0, editAnimationHeadRatio: null, editSelection: null,
      editMarks: [], cropBounds: { start: 0, end: 1000 }, hasTape: true,
      stemLanes: stems ? Array.from({ length: 4 }, () => ({ peaks: stemPeaks, enabled: true })) : null,
      stemTransition: transition,
    });
    return drawCalls.find((call) => call.type === 'fill' && call.fillStyle === '#ffffff').path.ops;
  }
  assert.deepEqual(rectangles(0), rectangles(0, false));
  const original = rectangles(0);
  const near = rectangles(.00001);
  // All four lanes start with the full waveform shape, then separate continuously.
  assert.equal(near.length, original.length * 4);
  for (let i = 0; i < original.length; i++) assert.ok(Math.abs(near[i] - original[i]) < .01);
});

test("drawWave ignores transient markers, beats, and cut marks located beyond cropBounds.end", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  const peaks = new Float32Array(50).fill(0.5);

  // Track was cut to 2000ms, but beatGrid still has stale transients at 3000ms, 4000ms
  // and editMarks has a cut mark at 3000ms
  WaveformView.drawWave(canvas, ctx, {
    ms: 1000,
    waveWindowMs: 6000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: true,
    editViewCenterMs: 1000,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [{ type: "cut", start: 3000, end: 3000 }],
    cropBounds: { start: 0, end: 2000 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
    beatGrid: {
      showBeats: true,
      beats: [500, 1000, 1500, 3000, 4000],
      bars: [500],
      transients: [3000, 4000], // Stale transients beyond bounds.end
      snappedBeatMs: null,
    },
  });

  // Stale transients at 3000 and 4000 must NOT be drawn
  const transientCalls = drawCalls.filter((c) => c.fillStyle === "rgba(255, 212, 0, 0.3)");
  assert.equal(transientCalls.length, 0);

  // Cut marks at 3000 must NOT be drawn
  const labels = drawCalls.filter((c) => c.type === "fillText" && c.text === "CUT");
  assert.equal(labels.length, 0);
});

test("drawWave in editMode keeps cropped audio dimmed without crop handles", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas();
  globalThis.window = { devicePixelRatio: 1 };
  const peaks = new Float32Array(50).fill(0.5);

  WaveformView.drawWave(canvas, ctx, {
    ms: 1000,
    waveWindowMs: 4000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: true,
    editViewCenterMs: 1000,
    editAnimationHeadRatio: null,
    editSelection: null,
    editMarks: [],
    cropBounds: { start: 500, end: 1500 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    activeEditHandle: null,
    hoveredEditHandle: null,
    hasTape: true,
  });

  // The crop remains a reversible preview while editing.
  const dimCalls = drawCalls.filter((c) => c.type === "fill" && c.fillStyle === "#3a3a3a");
  assert.ok(dimCalls.length > 0);

  // Crop handle bars (yellow / #555555 full height lines) must NOT be drawn in editMode
  const cropHandleBars = drawCalls.filter((c) =>
    c.type === "fillRect" && (c.fillStyle === "#ffd400" || c.fillStyle === "#555555") && c.h === canvas.height
  );
  assert.equal(cropHandleBars.length, 0);
});

test("drawWave keeps audio outside the crop dimmed throughout the stem transition", () => {
  const { canvas, ctx, drawCalls } = createMockCanvas(780, 200, 390, 100);
  globalThis.window = { devicePixelRatio: 2 };
  const peaks = new Float32Array(1000).fill(.9);
  const stemPeaks = [new Float32Array(1000).fill(.1), new Float32Array(1000).fill(.1), new Float32Array(1000).fill(.1), new Float32Array(1000).fill(.1)];

  WaveformView.drawWave(canvas, ctx, {
    stemLanes: stemPeaks.map((p) => ({ peaks: p, enabled: true, offsetMs: 0 })),
    stemTransition: 1,
    ms: 1000,
    waveWindowMs: 4000,
    wavePeaks: peaks,
    mode: "idle",
    editMode: false,
    editViewCenterMs: 1000,
    cropBounds: { start: 500, end: 1500 },
    activeCropHandle: null,
    hoveredCropHandle: null,
    hasTape: true,
  });

  const croppedCalls = drawCalls.filter((c) => c.type === "fill" && c.fillStyle === "#3a3a3a");
  assert.ok(croppedCalls.length > 0, "audio outside the crop should remain visible as a reversible preview");
  assert.doesNotMatch(
    String(WaveformView.drawWave),
    /outsideCrop[\s\S]*originalPeak/,
    "grey crop regions must not substitute original peaks for stem peaks",
  );

  const cropHandleBars = drawCalls.filter((c) =>
    c.type === "fillRect" && (c.fillStyle === "#ffd400" || c.fillStyle === "#555555") && c.h === canvas.height
  );
  assert.equal(cropHandleBars.length, 2, "crop handles must be drawn in stem split mode");
});

test("crop handles do not jump at waveform sampling boundaries during playback", () => {
  globalThis.window = { devicePixelRatio: 2 };
  const peaks = new Float32Array(1000).fill(.4);
  function cropHandleXs(ms) {
    const { canvas, ctx, drawCalls } = createMockCanvas(780, 200, 390, 100);
    WaveformView.drawWave(canvas, ctx, {
      ms, waveWindowMs: 4000, wavePeaks: peaks, mode: "play", editMode: false,
      editViewCenterMs: 0, editAnimationHeadRatio: null, editSelection: null,
      editMarks: [], cropBounds: { start: 800, end: 1200 }, hasTape: true,
    });
    return drawCalls
      .filter((call) => call.type === "fillRect" && call.fillStyle === "#555555" && call.h === canvas.height)
      .map((call) => call.x);
  }
  const before = cropHandleXs(1004);
  const after = cropHandleXs(1006);
  assert.equal(before.length, 2);
  assert.equal(after.length, 2);
  assert.ok(before.every((x, index) => Math.abs(x - after[index]) <= 1));
});
