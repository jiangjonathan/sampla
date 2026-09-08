(function installLibraryController(root) {
  const Geometry = root.SamplaDeckGeometry || window.SamplaDeckGeometry;
  const storage = root.SamplaStorage || window.SamplaStorage;
  const exporter = root.SamplaAudioExport || window.SamplaAudioExport;

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
      this.pendingDeleteIds = [];
      this.confirmReturnFocus = null;
      this.scrollbarPointerId = null;
      this.scrollbarDragOffset = 0;

      this.init();
    }

    init() {
      this.trackList?.addEventListener("click", (event) => {
        const loadButton = event.target.closest(".track-load");
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

    setSelectedTrack(id) {
      this.selectedTrackId = this.savedTracks.some((track) => track.id === id) ? id : null;
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

    render() {
      const rows = this.savedTracks.map((track) => {
        const row = document.createElement("div");
        row.className = "track-row";
        row.setAttribute("role", "listitem");
        row.dataset.id = track.id;
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "track-check";
        check.dataset.id = track.id;
        check.checked = this.checkedTrackIds.has(track.id);
        check.setAttribute("aria-label", `Select ${track.name}`);
        const load = document.createElement("button");
        load.type = "button";
        load.className = "track-load";
        load.dataset.id = track.id;
        load.setAttribute("aria-label", `Load ${track.name}`);
        const name = document.createElement("span");
        name.className = "track-row-name";
        name.textContent = track.name;
        const duration = document.createElement("span");
        duration.className = "track-row-duration";
        duration.textContent = Geometry.formatTrackDuration(track.durationMs);
        load.append(name, duration);
        row.append(check, load);
        return row;
      });
      this.trackList.replaceChildren(...rows);
      this.setSelectedTrack(this.currentTrackId);
      this.syncActions();
      requestAnimationFrame(() => this.updateScrollbar());
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

    async persistCurrentTape({ blob, buffer, cropBounds, editMarks, bpm, isLoop }) {
      if (!this.currentTrackId || !blob || !buffer) return false;
      const existing = this.savedTracks.find((track) => track.id === this.currentTrackId);
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

    async storeTape({ blob, buffer, cropBounds, editMarks, bpm, isLoop }) {
      if (!blob || !buffer) return;
      const existing = this.savedTracks.find((track) => track.id === this.currentTrackId);
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
      this.trackNameInput.value = track.name;
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
      const results = await Promise.allSettled(ids.map((id) => storage.remove(id)));
      const deletedIds = ids.filter((id, index) => results[index].status === "fulfilled");
      deletedIds.forEach((id) => this.checkedTrackIds.delete(id));
      if (deletedIds.includes(this.currentTrackId)) {
        this.currentTrackId = null;
        this.onClearTrack();
      }
      if (deletedIds.includes(this.selectedTrackId)) this.selectedTrackId = null;
      try {
        await this.refresh();
        this.onStatus(deletedIds.length === ids.length
          ? (deletedIds.length === 1 ? "recording deleted" : `${deletedIds.length} recordings deleted`)
          : `${deletedIds.length} of ${ids.length} recordings deleted`);
      } catch {
        this.onStatus(deletedIds.length ? "recordings deleted; refresh failed" : "delete failed");
      }
      this.libraryDeleteBtn?.focus();
      this.confirmReturnFocus = null;
    }
  }

  root.SamplaLibraryController = LibraryController;
})(typeof globalThis !== "undefined" ? globalThis : this);
