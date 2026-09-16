import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

globalThis.window = globalThis;

await import("../src/audio/audio-buffer-ops.js");
await import("../src/audio/audio-export.js");
await import("../src/ui/deck-geometry.js");
await import("../src/storage.js");
await import("../src/ui/library-controller.js");

function createBuffer(numberOfChannels, length, sampleRate = 44100) {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (i) => channels[i],
    copyToChannel: (data, i) => channels[i].set(data),
  };
}

class MemoryProvider {
  constructor() {
    this.records = new Map();
  }
  async list() {
    return Array.from(this.records.values());
  }
  async get(id) {
    return this.records.get(id) || null;
  }
  async put(record) {
    this.records.set(record.id, { ...record });
    return record;
  }
  async remove(id) {
    this.records.delete(id);
  }
}

test("SamplaStorage helper methods getStemsForParent and removeWithChildren", async () => {
  const mem = new MemoryProvider();
  const storage = globalThis.SamplaStorage.use(mem);

  await storage.put({ id: "parent-1", name: "TAPE 001", isStem: false });
  await storage.put({ id: "stem-1", parentId: "parent-1", name: "TAPE 001 [Vocals]", isStem: true, stemType: "vocals" });
  await storage.put({ id: "stem-2", parentId: "parent-1", name: "TAPE 001 [Drums]", isStem: true, stemType: "drums" });
  await storage.put({ id: "stem-3", parentId: "parent-1", name: "TAPE 001 [Bass]", isStem: true, stemType: "bass" });
  await storage.put({ id: "stem-4", parentId: "parent-1", name: "TAPE 001 [Other]", isStem: true, stemType: "other" });
  await storage.put({ id: "other-tape", name: "TAPE 002", isStem: false });

  const stems = await storage.getStemsForParent("parent-1");
  assert.equal(stems.length, 4);
  assert.deepEqual(stems.map((s) => s.stemType).sort(), ["bass", "drums", "other", "vocals"]);

  // Test cascading removal
  await storage.removeWithChildren("parent-1");
  const afterRemove = await storage.list();
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].id, "other-tape");
});

test("LibraryController stores stems and renders hierarchical tree with expand/collapse", async () => {
  const mem = new MemoryProvider();
  globalThis.SamplaStorage.use(mem);

  // Mock DOM elements
  const createdElements = [];
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: "",
      classList: {
        classes: new Set(),
        add(...c) { c.forEach((x) => this.classes.add(x)); },
        remove(...c) { c.forEach((x) => this.classes.delete(x)); },
        toggle(c, force) {
          if (force !== undefined) {
            if (force) this.classes.add(c);
            else this.classes.delete(c);
          } else {
            if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
          }
        },
        contains(c) { return this.classes.has(c) || el.className.split(" ").includes(c); },
      },
      dataset: {},
      attributes: {},
      children: [],
      textContent: "",
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = [...children]; },
      querySelectorAll(selector) {
        const matches = [];
        function walk(node) {
          if (selector === ".track-row" && node.className?.includes("track-row")) matches.push(node);
          for (const child of node.children || []) walk(child);
        }
        walk(el);
        return matches;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      addEventListener() {},
    };
    createdElements.push(el);
    return el;
  }

  const trackList = createElement("div");
  const trackNameInput = { value: "TAPE 001" };
  const audioContext = {
    sampleRate: 44100,
    createBuffer,
  };

  const controller = new globalThis.SamplaLibraryController({
    trackList,
    trackNameInput,
    getAudio: () => audioContext,
    isRecording: () => false,
  });

  // Mock document.createElement
  const origCreateElement = globalThis.document?.createElement;
  globalThis.document = { createElement };

  // 1. Put parent track
  await mem.put({
    id: "tape-1",
    name: "TAPE 001",
    durationMs: 10000,
    tapeDurationMs: 10000,
    cropStartMs: 0,
    cropEndMs: 10000,
    blob: { arrayBuffer: async () => new ArrayBuffer(44) },
    createdAt: Date.now(),
  });

  // 2. Store stems for parent
  const stemChannels = [
    [new Float32Array(44100), new Float32Array(44100)],
    [new Float32Array(44100), new Float32Array(44100)],
    [new Float32Array(44100), new Float32Array(44100)],
    [new Float32Array(44100), new Float32Array(44100)],
  ];

  await controller.storeStems({
    parentTrackId: "tape-1",
    parentName: "TAPE 001",
    stems: stemChannels,
    sampleRate: 44100,
    bpm: 120,
    durationMs: 1000,
    sourceBounds: { start: 250, end: 1250 },
    audioContext,
  });

  // Check storage contents
  const allTracks = await mem.list();
  assert.equal(allTracks.length, 5); // 1 parent + 4 stems
  const parentTrack = allTracks.find((t) => t.id === "tape-1");
  assert.equal(parentTrack.hasStems, true);
  assert.ok(parentTrack.stemIds.vocals);
  assert.ok(parentTrack.stemIds.drums);
  assert.ok(parentTrack.stemIds.bass);
  assert.ok(parentTrack.stemIds.other);
  for (const stem of allTracks.filter((track) => track.isStem)) {
    assert.equal(stem.sourceStartMs, 250);
    assert.equal(stem.sourceEndMs, 1250);
  }

  // Check rendering: parent is auto-expanded
  assert.ok(controller.expandedParentIds.has("tape-1"));
  controller.render();

  // With parent expanded: 1 parent row + 4 child rows = 5 rows in trackList
  assert.equal(trackList.children.length, 5);
  const parentRow = trackList.children[0];
  assert.equal(parentRow.dataset.id, "tape-1");
  assert.ok(parentRow.classList.contains("has-stems"));

  const childRows = trackList.children.slice(1);
  assert.equal(childRows.length, 4);
  childRows.forEach((row) => {
    assert.equal(row.dataset.parentId, "tape-1");
    assert.ok(row.classList.contains("stem-child-row"));
  });

  // 3. Collapse parent
  controller.expandedParentIds.delete("tape-1");
  controller.render();
  assert.equal(trackList.children.length, 1);
  assert.equal(trackList.children[0].dataset.id, "tape-1");

  // 4. Storing a stem mix non-destructively
  const mixBuffer = createBuffer(2, 44100, 44100);
  const mixRecord = await controller.storeStemMix({
    blob: { arrayBuffer: async () => new ArrayBuffer(44) },
    buffer: mixBuffer,
    cropBounds: { start: 0, end: 1000 },
    editMarks: [],
    bpm: 120,
    isLoop: false,
    parentId: "tape-1",
  });

  assert.ok(mixRecord);
  assert.equal(mixRecord.parentId, "tape-1");
  assert.equal(mixRecord.name, "TAPE 001 (Mix)");
  assert.equal(mixRecord.isMix, true);
  assert.equal(mixRecord.stemDerived, true);

  // Verify parent track TAPE 001 is STILL intact and STILL has stems
  const parentAfterMix = await mem.get("tape-1");
  assert.equal(parentAfterMix.name, "TAPE 001");
  assert.equal(parentAfterMix.hasStems, true);

  // 5. Cascade delete
  controller.pendingDeleteIds = ["tape-1"];
  controller.confirmDialog = { hidden: false };
  await controller.confirmDeleteSelected();

  const remaining = await mem.list();
  // Parent, all 4 stems, and the mix should be deleted
  assert.equal(remaining.length, 0);

  if (origCreateElement) globalThis.document.createElement = origCreateElement;
});

test("Stem UI adheres strictly to brutalist specs: stretched text, moving bar flush, 0 border-radius, no chips or arrows", () => {
  const popupCss = readFileSync(new URL("../styles/popup.css", import.meta.url), "utf8");

  // 1. Compact loading bar remains aligned and flush.
  assert.match(popupCss, /\.stem-progress-overlay[\s\S]*align-items:\s*center;/);
  assert.match(popupCss, /\.stem-progress-overlay[\s\S]*padding:\s*3px 7px;/);
  assert.match(popupCss, /\.stem-progress[\s\S]*height:\s*3px;/);
  // Moving thing inside progress bar has no vertical gap (fills 100% height)
  assert.match(popupCss, /\.stem-progress > span[\s\S]*height:\s*100%;/);

  // 2. Loading bar text is stretched without timer overlap
  assert.match(popupCss, /\.stem-progress-copy[\s\S]*transform:\s*scaleX\(var\(--ui-stretch\)\);/);
  assert.match(popupCss, /\.stem-progress-copy[\s\S]*max-width:\s*calc\(100% \/ var\(--ui-stretch\)\);/);
  assert.match(popupCss, /\.stem-progress-overlay button[\s\S]*transform:\s*scaleX\(var\(--ui-stretch\)\);/);

  // 3. Brutal STEM badge has NO rounded corners (border-radius: 0)
  assert.match(popupCss, /\.track-stem-badge[\s\S]*border-radius:\s*0;/);

  // 4. No chips, no expand arrow buttons, no stem tree icon
  assert.doesNotMatch(popupCss, /\.stem-type-badge/);
  assert.doesNotMatch(popupCss, /\.stem-badge-vocals/);
  assert.doesNotMatch(popupCss, /\.track-expand-btn/);
  assert.doesNotMatch(popupCss, /\.stem-tree-icon/);
  assert.match(popupCss, /\.track-row\.stem-child-row \.track-load[\s\S]*text-transform:\s*uppercase;/);
  assert.match(popupCss, /\.track-row\.stem-child-row \.child-name[\s\S]*transform:\s*scaleX\(var\(--ui-stretch\)\);/);
});

test("Opening and modifying an individual stem stores a new remix without mutating the original stem", async () => {
  const mem = new MemoryProvider();
  globalThis.SamplaStorage.use(mem);

  const origStemBlob = { arrayBuffer: async () => new ArrayBuffer(100) };
  await mem.put({ id: "parent-tape", name: "TAPE 001", hasStems: true });
  await mem.put({
    id: "stem-vocals",
    parentId: "parent-tape",
    name: "TAPE 001 [VOCALS]",
    isStem: true,
    stemType: "vocals",
    durationMs: 5000,
    tapeDurationMs: 5000,
    cropStartMs: 0,
    cropEndMs: 5000,
    blob: origStemBlob,
    createdAt: 1000,
  });

  let loadedTrack = null;
  const trackNameInput = { value: "" };
  const controller = new globalThis.SamplaLibraryController({
    trackList: { replaceChildren: () => {}, querySelectorAll: () => [], addEventListener: () => {} },
    trackNameInput,
    getAudio: () => ({ sampleRate: 44100 }),
    isRecording: () => false,
    onLoadTrack: (track) => { loadedTrack = track; },
    onExitEditMode: async () => {},
    onSwitchScreen: () => {},
    onStatus: () => {},
  });

  await controller.refresh();
  controller.selectedTrackId = "stem-vocals";
  await controller.loadSelectedTrack();

  assert.equal(loadedTrack.id, "stem-vocals");
  assert.equal(trackNameInput.value, "TAPE 001 [VOCALS]");

  // Now modify and store as a remix
  const modifiedBlob = { arrayBuffer: async () => new ArrayBuffer(200) };
  const dummyBuffer = { duration: 4.5 };
  await controller.storeTape({
    blob: modifiedBlob,
    buffer: dummyBuffer,
    cropBounds: { start: 0, end: 4500 },
    editMarks: [],
  });

  const allTracks = await mem.list();
  assert.equal(allTracks.length, 3); // parent + original stem + new remix

  const originalStem = await mem.get("stem-vocals");
  assert.equal(originalStem.id, "stem-vocals");
  assert.equal(originalStem.name, "TAPE 001 [VOCALS]");
  assert.equal(originalStem.isStem, true);
  assert.equal(originalStem.durationMs, 5000);
  assert.equal(originalStem.blob, origStemBlob);

  const remix = allTracks.find((t) => t.id !== "parent-tape" && t.id !== "stem-vocals");
  assert.ok(remix);
  assert.equal(remix.parentId, "parent-tape");
  assert.equal(remix.name, "TAPE 001 [VOCALS]");
  assert.equal(remix.isStem, false);
  assert.equal(remix.isRemix, true);
  assert.equal(remix.stemDerived, true);
  assert.equal(remix.durationMs, 4500);
});

test("storeTape hard crops audio and resets crop bounds to [0, duration]", async () => {
  const mem = new MemoryProvider();
  globalThis.SamplaStorage.use(mem);

  const rawBuffer = createBuffer(2, 44100 * 5, 44100); // 5 seconds
  const controller = new globalThis.SamplaLibraryController({
    trackList: { replaceChildren: () => {}, querySelectorAll: () => [], addEventListener: () => {} },
    trackNameInput: { value: "CROPPED TAPE" },
    getAudio: () => ({ sampleRate: 44100 }),
    isRecording: () => false,
    onLoadTrack: () => {},
    onExitEditMode: async () => {},
    onSwitchScreen: () => {},
    onStatus: () => {},
  });

  await controller.storeTape({
    blob: { arrayBuffer: async () => new ArrayBuffer(500) },
    buffer: rawBuffer,
    cropBounds: { start: 1000, end: 3000 },
    editMarks: [{ type: "gain", start: 1500, end: 2500, db: 2 }],
  });

  const stored = (await mem.list())[0];
  assert.ok(stored);
  assert.equal(stored.durationMs, 2000);
  assert.equal(stored.tapeDurationMs, 2000);
  assert.equal(stored.cropStartMs, 0);
  assert.equal(stored.cropEndMs, 2000);
  assert.equal(stored.editMarks.length, 1);
  assert.equal(stored.editMarks[0].start, 500); // 1500 - 1000
  assert.equal(stored.editMarks[0].end, 1500);  // 2500 - 1000
});
