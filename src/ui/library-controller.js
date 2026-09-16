(function installLibraryController(root) {
  const Geometry = root.SamplaDeckGeometry || window.SamplaDeckGeometry;
  const storage = root.SamplaStorage || window.SamplaStorage;
  const exporter = root.SamplaAudioExport || window.SamplaAudioExport;
  const BufferOps = root.SamplaBufferOps || window.SamplaBufferOps;

  class LibraryController {
    constructor({
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
      isRecording,
      onLoadTrack,
      onClearTrack,
      onStatus,
      onSwitchScreen,
      onExitEditMode,
      openAuthSettings,
    }) {
      this.trackList = trackList;
      this.libraryScrollbar = libraryScrollbar;
      this.libraryScrollThumb = libraryScrollThumb;
      this.libraryLoadBtn = libraryLoadBtn;
      this.libraryDeleteBtn = libraryDeleteBtn;
      this.librarySaveBtn = librarySaveBtn;
      this.libraryUploadBtn = libraryUploadBtn;
      this.libraryFileInput = libraryFileInput;
      this.libraryPanel = libraryPanel;
      this.confirmDialog = confirmDialog;
      this.confirmTitle = confirmTitle;
      this.confirmMessage = confirmMessage;
      this.confirmCancelBtn = confirmCancelBtn;
      this.confirmDeleteBtn = confirmDeleteBtn;
      this.trackNameInput = trackNameInput;

      this.getAudio = getAudio;
      this.isRecording = isRecording;
      this.onLoadTrack = onLoadTrack;
      this.onClearTrack = onClearTrack;
      this.onStatus = onStatus || (() => {});
      this.onSwitchScreen = onSwitchScreen || (() => {});
      this.onExitEditMode = onExitEditMode || (() => {});
      this.openAuthSettings = openAuthSettings || (() => {});

      this.savedTracks = [];
      this.selectedTrackId = null;
      this.currentTrackId = null;
      this.checkedTrackIds = new Set();
      this.expandedParentIds = new Set();
      this.pendingDeleteIds = [];
      this.confirmReturnFocus = null;
      this.scrollbarPointerId = null;
      this.scrollbarDragOffset = 0;

      this.init();
    }

    init() {
      this.trackList?.addEventListener("click", (event) => {
        const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
        const toggleBtn = target?.closest?.(".track-stem-badge");
        if (toggleBtn) {
          event.stopPropagation();
          event.preventDefault();
          this.toggleParentExpansion(toggleBtn.dataset.id);
          return;
        }
        const loadButton = target?.closest?.(".track-load");
        if (loadButton) {
          this.setSelectedTrack(loadButton.dataset.id);
          this.loadSelectedTrack();
        }
      });

      this.trackList?.addEventListener("change", (event) => {
        const check = event.target.closest(".track-check");
        if (!check) return;
        if (check.checked) this.checkedTrackIds.add(check.dataset.id);
        else this.checkedTrackIds.delete(check.dataset.id);
        this.syncActions();
      });

      if (this.libraryLoadBtn && this.libraryFileInput) {
        this.libraryLoadBtn.addEventListener("click", () => this.libraryFileInput.click());
        this.libraryFileInput.addEventListener("change", async () => {
          await this.loadAudioFiles(this.libraryFileInput.files);
          this.libraryFileInput.value = "";
        });
      }

      if (this.libraryPanel) {
        this.libraryPanel.addEventListener("dragover", (event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        });
        this.libraryPanel.addEventListener("drop", async (event) => {
          event.preventDefault();
          if (event.dataTransfer?.files?.length) {
            await this.loadAudioFiles(event.dataTransfer.files);
          }
        });
      }

      this.libraryDeleteBtn?.addEventListener("click", () => this.requestDeleteSelected());
      this.librarySaveBtn?.addEventListener("click", () => this.saveSelectedTracks());
      if (typeof BroadcastChannel !== "undefined") {
        this.libraryUpdates = new BroadcastChannel("sampla-library");
        this.libraryUpdates.unref?.();
        this.libraryUpdates.onmessage = () => this.refresh().catch(() => this.onStatus("library refresh failed"));
      }
      this.libraryUploadBtn?.addEventListener("click", () => this.uploadSelectedTracksToJam());

      this.confirmCancelBtn?.addEventListener("click", () => this.closeDeleteConfirmation());
      this.confirmDeleteBtn?.addEventListener("click", () => this.confirmDeleteSelected());

      this.confirmDialog?.addEventListener("click", (event) => {
        if (event.target === this.confirmDialog) this.closeDeleteConfirmation();
      });

      this.confirmDialog?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.closeDeleteConfirmation();
        } else if (event.key === "Tab") {
          const movingBack = event.shiftKey && document.activeElement === this.confirmCancelBtn;
          const movingForward = !event.shiftKey && document.activeElement === this.confirmDeleteBtn;
          if (movingBack || movingForward) {
            event.preventDefault();
            (movingBack ? this.confirmDeleteBtn : this.confirmCancelBtn).focus();
          }
        }
      });

      this.trackList?.addEventListener("scroll", () => this.updateScrollbar(), { passive: true });

      if (this.libraryScrollbar && this.libraryScrollThumb) {
        this.libraryScrollbar.addEventListener("pointerdown", (event) => {
          if (this.libraryScrollbar.classList.contains("inactive")) return;
          event.preventDefault();
          this.scrollbarPointerId = event.pointerId;
          const thumbRect = this.libraryScrollThumb.getBoundingClientRect();
          this.scrollbarDragOffset = event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom
            ? event.clientY - thumbRect.top
            : thumbRect.height / 2;
          this.libraryScrollbar.setPointerCapture(event.pointerId);
          const rail = this.libraryScrollbar.getBoundingClientRect();
          const maxTop = Math.max(1, rail.height - thumbRect.height);
          const top = Math.max(0, Math.min(maxTop, event.clientY - rail.top - this.scrollbarDragOffset));
          this.trackList.scrollTop = (top / maxTop) * Math.max(0, this.trackList.scrollHeight - this.trackList.clientHeight);
        });

        this.libraryScrollbar.addEventListener("pointermove", (event) => {
          if (event.pointerId !== this.scrollbarPointerId) return;
          event.preventDefault();
          const rail = this.libraryScrollbar.getBoundingClientRect();
          const thumbHeight = this.libraryScrollThumb.getBoundingClientRect().height;
          const maxTop = Math.max(1, rail.height - thumbHeight);
          const top = Math.max(0, Math.min(maxTop, event.clientY - rail.top - this.scrollbarDragOffset));
          this.trackList.scrollTop = (top / maxTop) * Math.max(0, this.trackList.scrollHeight - this.trackList.clientHeight);
        });

        const release = (event) => {
          if (event.pointerId !== this.scrollbarPointerId) return;
          this.scrollbarPointerId = null;
          try { this.libraryScrollbar.releasePointerCapture(event.pointerId); } catch {}
        };
        this.libraryScrollbar.addEventListener("pointerup", release);
        this.libraryScrollbar.addEventListener("pointercancel", release);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      }
    }

    nextTrackName() {
      const used = this.savedTracks.reduce((max, track) => {
        const match = /^TAPE\s+(\d+)$/i.exec(track.name || "");
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);
      return `TAPE ${String(used + 1).padStart(3, "0")}`;
    }

    nextRemixName(track) {
      return (track.name || "STEM").replace(/\s+\(Remix(?:\s+\d+)?\)$/i, "").trim();
    }

    setSelectedTrack(id) {
      this.selectedTrackId = this.savedTracks.some((track) => track.id === id) ? id : null;
      const selected = this.savedTracks.find((track) => track.id === id);
      if (selected?.parentId) {
        this.expandedParentIds.add(selected.parentId);
      }
      this.trackList.querySelectorAll(".track-row").forEach((row) => {
        const current = row.dataset.id === this.selectedTrackId;
        row.classList.toggle("current", current);
        row.querySelector(".track-load")?.setAttribute("aria-current", current ? "true" : "false");
      });
    }

    syncActions() {
      const rec = this.isRecording();
      const selectedCount = this.checkedTrackIds.size;
      if (this.libraryLoadBtn) this.libraryLoadBtn.disabled = rec;
      if (this.libraryDeleteBtn) this.libraryDeleteBtn.disabled = rec || selectedCount === 0;
      if (this.librarySaveBtn) this.librarySaveBtn.disabled = rec || selectedCount === 0;
      if (this.libraryUploadBtn) this.libraryUploadBtn.disabled = rec || selectedCount === 0;
    }

    toggleParentExpansion(id) {
      if (!id) return;
      if (this.expandedParentIds.has(id)) {
        this.expandedParentIds.delete(id);
      } else {
        this.expandedParentIds.add(id);
      }
      this.render();
    }

    render() {
      const parentTracks = [];
      const childrenByParent = new Map();
      const allIds = new Set(this.savedTracks.map((t) => t.id));

      for (const track of this.savedTracks) {
        if (track.parentId && allIds.has(track.parentId)) {
          if (!childrenByParent.has(track.parentId)) {
            childrenByParent.set(track.parentId, []);
          }
          childrenByParent.get(track.parentId).push(track);
        } else {
          parentTracks.push(track);
        }
      }

      const stemOrder = { vocals: 0, drums: 1, bass: 2, other: 3 };
      const rows = [];

      for (const parent of parentTracks) {
        const isCurrent = parent.id === this.selectedTrackId;
        const children = childrenByParent.get(parent.id) || [];
        const stemChildren = children.filter((c) => c.isStem);
        const hasChildren = children.length > 0 || parent.hasStems;
        const isExpanded = this.expandedParentIds.has(parent.id);

        const parentRow = document.createElement("div");
        parentRow.className = "track-row";
        if (isCurrent) parentRow.classList.add("current");
        if (hasChildren) parentRow.classList.add("has-stems");
        parentRow.setAttribute("role", "listitem");
        parentRow.dataset.id = parent.id;

        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "track-check";
        check.dataset.id = parent.id;
        check.checked = this.checkedTrackIds.has(parent.id);
        check.setAttribute("aria-label", `Select ${parent.name}`);

        const load = document.createElement("button");
        load.type = "button";
        load.className = "track-load";
        load.dataset.id = parent.id;
        load.setAttribute("aria-label", `Load ${parent.name}`);

        const nameContainer = document.createElement("span");
        nameContainer.className = "track-row-name";

        const nameText = document.createElement("span");
        nameText.className = "track-name-text";
        nameText.textContent = parent.name;
        nameContainer.append(nameText);

        if (hasChildren) {
          const badge = document.createElement("span");
          badge.className = "track-stem-badge";
          if (isExpanded) badge.classList.add("active");
          badge.dataset.id = parent.id;
          badge.setAttribute("role", "button");
          badge.setAttribute("tabindex", "0");
          badge.setAttribute("aria-expanded", isExpanded ? "true" : "false");
          badge.setAttribute("aria-label", isExpanded ? `Collapse stems for ${parent.name}` : `Expand stems for ${parent.name}`);
          badge.textContent = `${stemChildren.length || 4} STEMS`;

          const handleToggle = (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.toggleParentExpansion(parent.id);
          };
          badge.addEventListener("click", handleToggle);
          badge.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
          });
          badge.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              handleToggle(e);
            }
          });

          nameContainer.append(badge);
        }

        const duration = document.createElement("span");
        duration.className = "track-row-duration";
        duration.textContent = Geometry.formatTrackDuration(parent.durationMs);

        load.append(nameContainer, duration);
        parentRow.append(check, load);
        rows.push(parentRow);

        if (isExpanded && children.length > 0) {
          const sortedChildren = [...children].sort((a, b) => {
            if (a.isStem && b.isStem) {
              return (stemOrder[a.stemType] ?? 99) - (stemOrder[b.stemType] ?? 99);
            }
            if (a.isStem && !b.isStem) return -1;
            if (!a.isStem && b.isStem) return 1;
            return a.createdAt - b.createdAt;
          });

          for (const child of sortedChildren) {
            const childRow = document.createElement("div");
            childRow.className = "track-row stem-child-row";
            childRow.setAttribute("role", "listitem");
            childRow.dataset.id = child.id;
            childRow.dataset.parentId = parent.id;

            const childCheck = document.createElement("input");
            childCheck.type = "checkbox";
            childCheck.className = "track-check";
            childCheck.dataset.id = child.id;
            childCheck.checked = this.checkedTrackIds.has(child.id);
            childCheck.setAttribute("aria-label", `Select ${child.name}`);

            const childLoad = document.createElement("button");
            childLoad.type = "button";
            childLoad.className = "track-load";
            childLoad.dataset.id = child.id;
            childLoad.setAttribute("aria-label", `Load ${child.name}`);

            const childNameContainer = document.createElement("span");
            childNameContainer.className = "track-row-name child-name";

            const childNameText = document.createElement("span");
            childNameText.className = "track-name-text";
            childNameText.textContent = (child.isStem && child.stemType
              ? child.stemType
              : child.name).toUpperCase();
            childNameContainer.append(childNameText);

            const childDuration = document.createElement("span");
            childDuration.className = "track-row-duration";
            childDuration.textContent = Geometry.formatTrackDuration(child.durationMs);

            childLoad.append(childNameContainer, childDuration);
            childRow.append(childCheck, childLoad);
            rows.push(childRow);
          }
        }
      }

      this.trackList.replaceChildren(...rows);
      this.setSelectedTrack(this.currentTrackId);
      this.syncActions();
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(() => this.updateScrollbar());
      }
    }

    async refresh() {
      const records = await storage.list();
      this.savedTracks = records.sort((a, b) => b.createdAt - a.createdAt);
      const availableIds = new Set(this.savedTracks.map((track) => track.id));
      for (const id of this.checkedTrackIds) {
        if (!availableIds.has(id)) this.checkedTrackIds.delete(id);
      }
      this.render();
    }

    updateScrollbar() {
      if (!this.trackList || !this.libraryScrollbar || !this.libraryScrollThumb) return;
      const viewport = this.trackList.clientHeight;
      const content = this.trackList.scrollHeight;
      const maxScroll = Math.max(0, content - viewport);
      const trackHeight = this.libraryScrollbar.clientHeight;
      const thumbHeight = maxScroll ? Math.max(16, (viewport / content) * trackHeight) : trackHeight;
      const maxTop = Math.max(0, trackHeight - thumbHeight);
      const top = maxScroll ? (this.trackList.scrollTop / maxScroll) * maxTop : 0;
      this.libraryScrollThumb.style.height = `${thumbHeight}px`;
      this.libraryScrollThumb.style.transform = `translateY(${top}px)`;
      this.libraryScrollbar.classList.toggle("inactive", maxScroll === 0);
    }

    async persistCurrentTape({ blob, buffer, cropBounds, editMarks, bpm, isLoop, stemDerived }) {
      if (!this.currentTrackId || !blob || !buffer) return false;
      const existing = this.savedTracks.find((track) => track.id === this.currentTrackId);
      if (existing?.isStem) {
        const remixName = this.trackNameInput.value.trim() || this.nextRemixName(existing);
        const newId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const record = {
          id: newId,
          parentId: existing.parentId || existing.id,
          name: remixName,
          durationMs: cropBounds.end - cropBounds.start,
          tapeDurationMs: buffer.duration * 1000,
          cropStartMs: cropBounds.start,
          cropEndMs: cropBounds.end,
          editMarks: (editMarks || []).map((mark) => ({ ...mark })),
          bpm: bpm !== undefined ? bpm : existing?.bpm || null,
          isLoop: isLoop !== undefined ? Boolean(isLoop) : Boolean(existing?.isLoop),
          isStem: false,
          isRemix: true,
          stemDerived: true,
          blob,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        try {
          await storage.put(record);
          this.currentTrackId = newId;
          this.trackNameInput.value = remixName;
          if (existing.parentId) this.expandedParentIds.add(existing.parentId);
          await this.refresh();
          return true;
        } catch {
          this.onStatus("library unavailable");
          return false;
        }
      }
      const name = this.trackNameInput.value.trim() || existing?.name || this.nextTrackName();
      const record = {
        id: this.currentTrackId,
        name,
        durationMs: cropBounds.end - cropBounds.start,
        tapeDurationMs: buffer.duration * 1000,
        cropStartMs: cropBounds.start,
        cropEndMs: cropBounds.end,
        editMarks: (editMarks || []).map((mark) => ({ ...mark })),
        bpm: bpm !== undefined ? bpm : existing?.bpm || null,
        isLoop: isLoop !== undefined ? Boolean(isLoop) : Boolean(existing?.isLoop),
        stemDerived: Boolean(stemDerived) || Boolean(existing?.stemDerived),
        blob,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await storage.put(record);
        this.trackNameInput.value = name;
        await this.refresh();
        return true;
      } catch {
        this.onStatus("library unavailable");
        return false;
      }
    }

    _hardCropIfNeeded({ buffer, blob, cropBounds, editMarks }) {
      if (!buffer || !cropBounds) return { buffer, blob, cropBounds, editMarks: editMarks || [] };
      const durationMs = (buffer.duration || 0) * 1000;
      const startMs = Math.max(0, Math.min(cropBounds.start ?? 0, durationMs));
      const endMs = Math.max(startMs, Math.min(cropBounds.end ?? durationMs, durationMs));
      if (startMs <= 1 && endMs >= durationMs - 1) {
        return { buffer, blob, cropBounds: { start: 0, end: durationMs }, editMarks: editMarks || [] };
      }
      const croppedDurationMs = Math.max(0, endMs - startMs);
      let croppedBuffer = buffer;
      let croppedBlob = blob;
      if (buffer.numberOfChannels && buffer.sampleRate && BufferOps && typeof BufferOps.copyBufferRange === "function") {
        try {
          const audioCtx = this.getAudio?.();
          const startFrame = Math.max(0, Math.floor((startMs / 1000) * buffer.sampleRate));
          const endFrame = Math.min(buffer.length, Math.ceil((endMs / 1000) * buffer.sampleRate));
          croppedBuffer = BufferOps.copyBufferRange(buffer, startFrame, endFrame, audioCtx);
          if (exporter && typeof exporter.toWavBlob === "function") {
            croppedBlob = exporter.toWavBlob(croppedBuffer);
          }
        } catch {}
      } else if (typeof buffer.duration === "number") {
        croppedBuffer = { ...buffer, duration: croppedDurationMs / 1000 };
      }
      const remappedMarks = (editMarks || [])
        .filter((mark) => (mark.type === "cut" ? mark.start >= startMs && mark.start <= endMs : mark.end > startMs && mark.start < endMs))
        .map((mark) => ({
          ...mark,
          start: Math.max(0, mark.start - startMs),
          end: Math.min(croppedDurationMs, mark.end - startMs),
        }));
      return {
        buffer: croppedBuffer,
        blob: croppedBlob,
        cropBounds: { start: 0, end: croppedDurationMs },
        editMarks: remappedMarks,
      };
    }

    async storeTape({ blob, buffer, cropBounds, editMarks, bpm, isLoop, stemDerived }) {
      if (!blob || !buffer) return;
      const cropped = this._hardCropIfNeeded({ buffer, blob, cropBounds, editMarks });
      buffer = cropped.buffer;
      blob = cropped.blob;
      cropBounds = cropped.cropBounds;
      editMarks = cropped.editMarks;
      const existing = this.savedTracks.find((track) => track.id === this.currentTrackId);
      if (existing?.isStem) {
        const remixName = this.trackNameInput.value.trim() || this.nextRemixName(existing);
        const newId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const record = {
          id: newId,
          parentId: existing.parentId || existing.id,
          name: remixName,
          durationMs: cropBounds.end - cropBounds.start,
          tapeDurationMs: buffer.duration * 1000,
          cropStartMs: cropBounds.start,
          cropEndMs: cropBounds.end,
          editMarks: editMarks.map((mark) => ({ ...mark })),
          bpm: bpm !== undefined ? bpm : existing?.bpm || null,
          isLoop: isLoop !== undefined ? Boolean(isLoop) : Boolean(existing?.isLoop),
          isStem: false,
          isRemix: true,
          stemDerived: true,
          blob,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        try {
          await storage.put(record);
          this.currentTrackId = newId;
          this.trackNameInput.value = remixName;
          if (existing.parentId) this.expandedParentIds.add(existing.parentId);
          await this.refresh();
          await this.onExitEditMode();
          this.onSwitchScreen("library");
          this.onStatus("recording stored");
        } catch {
          this.onStatus("library unavailable");
        }
        return;
      }
      const id = this.currentTrackId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      const name = this.trackNameInput.value.trim() || this.nextTrackName();
      const record = {
        id,
        name,
        durationMs: cropBounds.end - cropBounds.start,
        tapeDurationMs: buffer.duration * 1000,
        cropStartMs: cropBounds.start,
        cropEndMs: cropBounds.end,
        editMarks: editMarks.map((mark) => ({ ...mark })),
        bpm: bpm !== undefined ? bpm : existing?.bpm || null,
        isLoop: isLoop !== undefined ? Boolean(isLoop) : Boolean(existing?.isLoop),
        stemDerived: Boolean(stemDerived) || Boolean(existing?.stemDerived),
        blob,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await storage.put(record);
        this.currentTrackId = id;
        this.trackNameInput.value = name;
        await this.refresh();
        await this.onExitEditMode();
        this.onSwitchScreen("library");
        this.onStatus(existing ? "recording updated" : "recording stored");
      } catch {
        this.onStatus("library unavailable");
      }
    }

    async loadSelectedTrack() {
      const id = this.selectedTrackId;
      if (!this.savedTracks.some((item) => item.id === id) || this.isRecording()) return;
      this.onStatus("loading tape");
      let track;
      try {
        track = await storage.get(id);
      } catch {
        this.onStatus("storage unavailable");
        return;
      }
      if (!track || this.selectedTrackId !== id) return;
      this.currentTrackId = track.id;
      this.trackNameInput.value = track.isStem ? this.nextRemixName(track) : track.name;
      this.onLoadTrack(track);
    }

    async saveSelectedTracks() {
      const ids = [...this.checkedTrackIds].filter((id) => this.savedTracks.some((track) => track.id === id));
      if (!ids.length) return;
      this.onStatus(ids.length === 1 ? "downloading recording" : `downloading ${ids.length} recordings`);
      let saved = 0;
      for (const id of ids) {
        try {
          const track = await storage.get(id);
          if (!track) continue;
          await exporter.save(track, this.getAudio());
          saved += 1;
        } catch {}
      }
      this.onStatus(saved === ids.length
        ? (saved === 1 ? "recording downloaded" : `${saved} recordings downloaded`)
        : `${saved} of ${ids.length} recordings downloaded`);
    }

    async uploadSelectedTracksToJam() {
      let ids = [...this.checkedTrackIds].filter((id) => this.savedTracks.some((track) => track.id === id));
      if (!ids.length) {
        const fallbackId = this.selectedTrackId || this.currentTrackId || (this.savedTracks[0] && this.savedTracks[0].id);
        if (fallbackId && this.savedTracks.some((t) => t.id === fallbackId)) {
          ids = [fallbackId];
        }
      }

      if (!ids.length) {
        alert("No recordings found in library to upload. Please record or save a sample first!");
        return;
      }

      const session = window.SamplaCanvasAuth?.getSession();
      if (!session?.token) {
        this.onSwitchScreen("live");
        this.openAuthSettings();
        alert("Please link your Jam account first in Settings.");
        return;
      }

      const span = this.libraryUploadBtn?.querySelector("span");
      const originalText = span ? span.textContent : "To Jam";
      if (this.libraryUploadBtn) this.libraryUploadBtn.disabled = true;
      if (span) span.textContent = "Uploading...";
      this.onStatus(ids.length === 1 ? "uploading to jam" : `uploading ${ids.length} recordings to jam`);

      let uploaded = 0;
      let lastError = null;
      for (const id of ids) {
        try {
          const track = await storage.get(id);
          if (!track) continue;
          await window.SamplaCanvasApi.uploadTrackToJam(track, this.getAudio(), {
            bpm: track.bpm,
            isLoop: track.isLoop,
          });
          uploaded += 1;
        } catch (err) {
          console.error("Jam upload failed", id, err);
          lastError = err;
        }
      }

      if (uploaded === ids.length) {
        if (span) span.textContent = "Uploaded! ✓";
        this.onStatus(uploaded === 1 ? "sample added to jam" : `${uploaded} samples added to jam`);
      } else {
        if (span) span.textContent = "Failed";
        const msg = lastError?.message || "Upload failed";
        if (msg.includes("Failed to fetch")) {
          alert("Upload failed due to CORS/network restrictions in your preview. Please make sure Sampla is loaded as an unpacked extension in chrome://extensions.");
        } else {
          alert("Upload to Jam failed: " + msg);
        }
      }

      setTimeout(() => {
        if (span) span.textContent = originalText;
        if (this.libraryUploadBtn) this.libraryUploadBtn.disabled = false;
        this.syncActions();
      }, 2500);
    }

    async loadAudioFiles(files) {
      if (!files || !files.length || this.isRecording()) return;
      const audioFiles = Array.from(files).filter((file) =>
        file.type.startsWith("audio/") || /\.(wav|wave|aif|aiff|mp3|m4a|aac|flac|ogg|webm)$/i.test(file.name)
      );
      if (!audioFiles.length) {
        this.onStatus("unsupported file format");
        return;
      }
      this.onStatus(audioFiles.length === 1 ? "loading tape" : `loading ${audioFiles.length} files`);
      const ctx = this.getAudio();
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch {}
      }

      let lastTrackId = null;
      let loadedCount = 0;

      for (const file of audioFiles) {
        try {
          const bytes = await file.arrayBuffer();
          const decodedBuffer = await ctx.decodeAudioData(bytes.slice(0));
          const durationMs = decodedBuffer.duration * 1000;
          const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
          const cleanName = (file.name || "").replace(/\.[^/.]+$/, "").trim() || this.nextTrackName();
          const name = cleanName.slice(0, 48);
          const audioBlob = (file.type === "audio/wav" || file.name.toLowerCase().endsWith(".wav"))
            ? new Blob([bytes], { type: "audio/wav" })
            : exporter.toWavBlob(decodedBuffer);
          const record = {
            id,
            name,
            durationMs,
            tapeDurationMs: durationMs,
            cropStartMs: 0,
            cropEndMs: durationMs,
            editMarks: [],
            blob: audioBlob,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await storage.put(record);
          lastTrackId = id;
          loadedCount += 1;
        } catch (err) {
          console.error("Failed to load audio file", file.name, err);
        }
      }

      if (loadedCount > 0) {
        await this.refresh();
        if (lastTrackId) {
          await this.onExitEditMode();
          this.selectedTrackId = lastTrackId;
          this.setSelectedTrack(lastTrackId);
          await this.loadSelectedTrack();
        }
      } else {
        this.onStatus("tape unreadable");
      }
    }

    closeDeleteConfirmation() {
      this.confirmDialog.hidden = true;
      this.pendingDeleteIds = [];
      this.confirmReturnFocus?.focus();
      this.confirmReturnFocus = null;
    }

    requestDeleteSelected() {
      if (this.isRecording()) return;
      this.pendingDeleteIds = [...this.checkedTrackIds].filter((id) => this.savedTracks.some((track) => track.id === id));
      if (!this.pendingDeleteIds.length) return;
      this.confirmReturnFocus = document.activeElement;
      this.confirmTitle.textContent = this.pendingDeleteIds.length === 1 ? "Delete recording?" : "Delete recordings?";
      this.confirmMessage.textContent = this.pendingDeleteIds.length === 1
        ? "Delete the selected recording? This cannot be undone."
        : `Delete ${this.pendingDeleteIds.length} selected recordings? This cannot be undone.`;
      this.confirmDialog.hidden = false;
      this.confirmDeleteBtn.focus();
    }

    async confirmDeleteSelected() {
      const ids = this.pendingDeleteIds;
      if (!ids.length) return;
      this.confirmDialog.hidden = true;
      this.pendingDeleteIds = [];
      this.onStatus("deleting recording");
      const childIdsToDelete = [];
      for (const id of ids) {
        const children = this.savedTracks.filter((t) => t.parentId === id);
        for (const child of children) {
          if (!ids.includes(child.id)) childIdsToDelete.push(child.id);
        }
      }
      const allIdsToDelete = [...ids, ...childIdsToDelete];
      const results = await Promise.allSettled(allIdsToDelete.map((id) => storage.remove(id)));
      const deletedIds = allIdsToDelete.filter((id, index) => results[index].status === "fulfilled");
      deletedIds.forEach((id) => this.checkedTrackIds.delete(id));
      if (deletedIds.includes(this.currentTrackId)) {
        this.currentTrackId = null;
        this.onClearTrack?.();
      }
      if (deletedIds.includes(this.selectedTrackId)) this.selectedTrackId = null;
      try {
        await this.refresh();
        this.onStatus(ids.length === 1
          ? "recording deleted"
          : `${ids.length} recordings deleted`);
      } catch {
        this.onStatus(deletedIds.length ? "recordings deleted; refresh failed" : "delete failed");
      }
      this.libraryDeleteBtn?.focus();
      this.confirmReturnFocus = null;
    }

    async storeStemMix({ blob, buffer, cropBounds, editMarks, bpm, isLoop, parentId }) {
      if (!blob || !buffer) return null;
      const cropped = this._hardCropIfNeeded({ buffer, blob, cropBounds, editMarks });
      buffer = cropped.buffer;
      blob = cropped.blob;
      cropBounds = cropped.cropBounds;
      editMarks = cropped.editMarks;
      const parent = this.savedTracks.find((t) => t.id === parentId) || this.savedTracks.find((t) => t.id === this.currentTrackId);
      const baseName = parent?.name || this.trackNameInput.value.trim() || "TAPE";
      const name = `${baseName} (Mix)`.slice(0, 48);
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const record = {
        id,
        parentId: parent?.id || this.currentTrackId,
        name,
        durationMs: cropBounds.end - cropBounds.start,
        tapeDurationMs: buffer.duration * 1000,
        cropStartMs: cropBounds.start,
        cropEndMs: cropBounds.end,
        editMarks: (editMarks || []).map((mark) => ({ ...mark })),
        bpm: bpm !== undefined ? bpm : parent?.bpm || null,
        isLoop: isLoop !== undefined ? Boolean(isLoop) : Boolean(parent?.isLoop),
        stemDerived: true,
        isMix: true,
        blob,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await storage.put(record);
        if (parent?.id) this.expandedParentIds.add(parent.id);
        await this.refresh();
        this.onStatus("stem mix stored");
        return record;
      } catch {
        this.onStatus("library unavailable");
        return null;
      }
    }

    async storeStems({ parentTrackId, parentName, stems, sampleRate, bpm, durationMs, sourceBounds, audioContext }) {
      if (!parentTrackId || !stems?.length || !audioContext) return;
      const stemTypes = ["vocals", "drums", "bass", "other"];
      const stemTitles = ["VOCALS", "DRUMS", "BASS", "OTHER"];
      const stemIds = {};
      for (let i = 0; i < stems.length; i++) {
        const stem = stems[i];
        const frames = stem[0].length;
        const buffer = audioContext.createBuffer(2, frames, sampleRate);
        buffer.getChannelData(0).set(stem[0]);
        buffer.getChannelData(1).set(stem[1]);
        const stemBlob = exporter.toWavBlob(buffer);
        const stemId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const stemRecord = {
          id: stemId,
          parentId: parentTrackId,
          stemType: stemTypes[i],
          isStem: true,
          name: `${parentName} [${stemTitles[i]}]`,
          durationMs,
          tapeDurationMs: durationMs,
          cropStartMs: 0,
          cropEndMs: durationMs,
          sourceStartMs: sourceBounds?.start ?? 0,
          sourceEndMs: sourceBounds?.end ?? durationMs,
          editMarks: [],
          bpm: bpm || null,
          blob: stemBlob,
          createdAt: Date.now() + i,
          updatedAt: Date.now() + i,
        };
        await storage.put(stemRecord);
        stemIds[stemTypes[i]] = stemId;
      }
      const parent = await storage.get(parentTrackId);
      if (parent) {
        parent.hasStems = true;
        parent.stemIds = stemIds;
        parent.updatedAt = Date.now();
        await storage.put(parent);
      }
      this.expandedParentIds.add(parentTrackId);
      await this.refresh();
    }

    async replaceStoredStems({ parentTrackId, stems, sampleRate, sourceBounds, audioContext }) {
      if (!parentTrackId || !stems?.length || !audioContext) return;
      const records = await storage.getStemsForParent(parentTrackId);
      if (!records?.length) return;
      const byType = new Map(records.map((record) => [record.stemType, record]));
      const stemTypes = ["vocals", "drums", "bass", "other"];
      for (let index = 0; index < stems.length; index++) {
        const record = byType.get(stemTypes[index]);
        if (!record) continue;
        const channels = stems[index];
        const frames = channels[0]?.length || 0;
        if (!frames) continue;
        const buffer = audioContext.createBuffer(2, frames, sampleRate);
        buffer.getChannelData(0).set(channels[0]);
        buffer.getChannelData(1).set(channels[1] || channels[0]);
        const durationMs = (frames / sampleRate) * 1000;
        await storage.put({
          ...record,
          durationMs,
          tapeDurationMs: durationMs,
          cropStartMs: 0,
          cropEndMs: durationMs,
          sourceStartMs: sourceBounds.start,
          sourceEndMs: sourceBounds.end,
          blob: exporter.toWavBlob(buffer),
          updatedAt: Date.now(),
        });
      }
      await this.refresh();
    }
  }

  root.SamplaLibraryController = LibraryController;
})(typeof globalThis !== "undefined" ? globalThis : this);
