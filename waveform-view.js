(function installWaveformView(root) {
  const BufferOps = root.SamplaBufferOps || (typeof window !== "undefined" ? window.SamplaBufferOps : null);
  const P2D = typeof Path2D !== "undefined" ? Path2D : class {
    rect(x, y, w, h) { (this.ops = this.ops || []).push(x, y, w, h); }
  };

  function fillBatch(ctx, path, style) {
    ctx.fillStyle = style;
    if (path.ops && !ctx.fill) {
      for (let i = 0; i < path.ops.length; i += 4) {
        ctx.fillRect(path.ops[i], path.ops[i + 1], path.ops[i + 2], path.ops[i + 3]);
      }
    } else {
      ctx.fill(path);
    }
  }

  function sizeWave(canvas) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    canvas._cssWidth = cssW;
    canvas._cssHeight = cssH;
    canvas._columnWidth = Math.max(1, Math.round(w / cssW));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas._lastRenderKey = null;
    }
  }

  function waveRenderCenterMs(centerMs, canvas, waveWindowMs) {
    const width = Math.max(1, canvas.width);
    const colW = canvas._columnWidth || Math.max(1, Math.round(width / Math.max(1, canvas._cssWidth || canvas.clientWidth || width)));
    const msPerCol = (waveWindowMs / width) * colW;
    return Math.round(centerMs / msPerCol) * msPerCol;
  }

  function timeAtClientX(clientX, canvas, waveWindowMs, centerMs) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const renderMs = waveRenderCenterMs(centerMs, canvas, waveWindowMs);
    return renderMs + (x - canvas.width / 2) * (waveWindowMs / canvas.width);
  }

  function findHandleAt(clientX, canvas, waveWindowMs, centerMs, range, hitPx = 12) {
    if (!range) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    const hit = hitPx * (window.devicePixelRatio || 1);
    const msPerPx = waveWindowMs / canvas.width;
    const headX = canvas.width / 2;
    const renderMs = waveRenderCenterMs(centerMs, canvas, waveWindowMs);
    const dStart = Math.abs(x - (headX + (range.start - renderMs) / msPerPx));
    const dEnd = Math.abs(x - (headX + (range.end - renderMs) / msPerPx));
    return Math.min(dStart, dEnd) > hit ? null : dStart <= dEnd ? "start" : "end";
  }

  function drawWave(canvas, ctx, options) {
    const {
      ms, waveWindowMs, wavePeaks, mode, editMode, editViewCenterMs,
      editAnimationHeadRatio, editSelection, editMarks, cropBounds,
      activeCropHandle, hoveredCropHandle, activeEditHandle, hoveredEditHandle, hasTape,
      beatGrid,
    } = options;

    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    const mid = Math.round(h / 2);
    const headX = Math.round(w / 2);
    const columnWidth = canvas._columnWidth || Math.max(1, Math.round(w / Math.max(1, canvas._cssWidth || canvas.clientWidth || w)));
    const markerWidth = columnWidth;
    const msPerPx = waveWindowMs / w;
    const msPerCol = msPerPx * columnWidth;

    const anchoredHeadX = editAnimationHeadRatio === null
      ? null
      : Math.abs(editAnimationHeadRatio - 0.5) < 0.001
        ? headX
        : Math.round(editAnimationHeadRatio * w);
    const viewCenterMs = anchoredHeadX === null
      ? (editMode ? editViewCenterMs : ms)
      : ms - (anchoredHeadX - headX) * msPerPx;

    const k = Math.round(viewCenterMs / msPerCol);
    const renderMs = k * msPerCol;
    const headCol = headX / columnWidth;
    const recording = mode === "record";
    const playheadX = anchoredHeadX ?? (editMode ? headX + (ms - viewCenterMs) / msPerPx : headX);
    const playheadLeft = Math.round(playheadX - markerWidth / 2);
    const waveformRight = recording ? playheadLeft : w;
    const bounds = cropBounds;

    const marksKey = (editMarks || []).map((mark) => `${mark.type}:${mark.start}:${mark.end}`).join("|");
    const beatKey = beatGrid?.showBeats ? `${beatGrid.beats?.length}:${beatGrid.snappedBeatMs}` : "";
    const renderKey = `${w},${h},${renderMs},${waveWindowMs},${wavePeaks.length},${mode},${editMode},${playheadLeft},${waveformRight},${bounds.start},${bounds.end},${activeCropHandle},${hoveredCropHandle},${activeEditHandle},${hoveredEditHandle},${editSelection ? editSelection.start + ":" + editSelection.end : ""},${marksKey},${hasTape},${beatKey}`;
    if (!recording && canvas._lastRenderKey === renderKey) return;
    canvas._lastRenderKey = renderKey;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    if (editSelection) {
      const selL = Math.max(0, headX + (editSelection.start - renderMs) / msPerPx);
      const selR = Math.min(w, headX + (editSelection.end - renderMs) / msPerPx);
      ctx.fillStyle = "#261f00";
      ctx.fillRect(selL, 0, Math.max(0, selR - selL), h);
    }

    if (editMode && editMarks?.length) {
      ctx.fillStyle = "rgba(255, 77, 109, 0.18)";
      for (const mark of editMarks) {
        if (BufferOps.isPointMark?.(mark) || mark.type === "cut") continue;
        const left = Math.max(0, Math.round(headX + (mark.start - renderMs) / msPerPx));
        const right = Math.min(w, Math.round(headX + (mark.end - renderMs) / msPerPx));
        if (right > left) ctx.fillRect(left, 0, right - left, h);
      }
    }

    if (wavePeaks.length || recording) {
      const ampScale = h * 0.42;
      const cropStartL = Math.round(headX + (bounds.start - renderMs) / msPerPx - markerWidth / 2);
      const cropStartR = cropStartL + markerWidth;
      const cropEndL = Math.round(headX + (bounds.end - renderMs) / msPerPx - markerWidth / 2);
      const cropEndR = cropEndL + markerWidth;

      const pDim = new P2D();
      const pLit = new P2D();
      const pSel = editMode ? new P2D() : null;
      const pMod = editMode ? new P2D() : null;

      for (let x = 0; x < waveformRight; x += columnWidth) {
        const colStart = (k + Math.round(x / columnWidth) - headCol) * msPerCol;
        const colEnd = colStart + msPerCol;
        let peak = BufferOps.peakInRange(wavePeaks, colStart, colEnd);
        if (recording && colEnd > 0 && colStart <= renderMs) peak = Math.max(peak, 0.002);
        if (peak <= 0) continue;

        const amp = Math.max(1, Math.round(peak * ampScale));
        const top = Math.max(0, mid - amp);
        const barH = Math.min(h, mid + amp) - top;
        const barW = Math.min(columnWidth, waveformRight - x);
        const colR = x + barW;
        const inCropPaint = (sx, sy, sw, sh) => {
          if (editMode) {
            if (BufferOps.rangeHasEdit(editMarks || [], colStart, colEnd)) pMod.rect(sx, sy, sw, sh);
            else if (editSelection && colEnd > editSelection.start && colStart < editSelection.end) pSel.rect(sx, sy, sw, sh);
            else pLit.rect(sx, sy, sw, sh);
          } else {
            pLit.rect(sx, sy, sw, sh);
          }
        };

        if (colR <= cropStartL || x >= cropEndR) {
          pDim.rect(x, top, barW, barH);
        } else if (x >= cropStartR && colR <= cropEndL) {
          inCropPaint(x, top, barW, barH);
        } else if (x < cropStartR && colR > cropStartL) {
          if (x < cropStartL) pDim.rect(x, top, cropStartL - x, barH);
          const wR = Math.min(colR, cropEndL);
          if (wR > cropStartR) inCropPaint(cropStartR, top, wR - cropStartR, barH);
        } else if (x < cropEndR && colR > cropEndL) {
          if (x < cropEndL) inCropPaint(x, top, cropEndL - x, barH);
          if (colR > cropEndR) pDim.rect(cropEndR, top, colR - cropEndR, barH);
        } else {
          inCropPaint(x, top, barW, barH);
        }
      }

      fillBatch(ctx, pDim, "#3a3a3a");
      fillBatch(ctx, pLit, "#ffffff");
      if (editMode) {
        fillBatch(ctx, pSel, "#ffd400");
        fillBatch(ctx, pMod, "#ff4d6d");
      }
    }

    if (editMode && editMarks?.length) {
      const dpr = window.devicePixelRatio || 1;
      const railH = Math.max(2, Math.round(3 * dpr));
      ctx.font = `${Math.max(8, Math.round(7 * dpr))}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = "center";
      for (const mark of editMarks) {
        const isCut = BufferOps.isPointMark?.(mark) || mark.type === "cut";
        if (isCut) {
          const x = Math.round(headX + (mark.start - renderMs) / msPerPx - markerWidth / 2);
          if (x + markerWidth < 0 || x > w) continue;
          ctx.fillStyle = "#ff4d6d";
          ctx.fillRect(x, 0, markerWidth, h);
          const label = BufferOps.editMarkLabel(mark);
          const lw = ctx.measureText(label).width;
          const lx = x + markerWidth / 2;
          const ly = h - 2 * dpr;
          ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
          ctx.fillRect(lx - lw / 2 - dpr, ly - 9 * dpr, lw + 2 * dpr, 10 * dpr);
          ctx.fillStyle = "#ff8aa1";
          ctx.fillText(label, lx, ly);
          continue;
        }
        const left = Math.max(0, Math.round(headX + (mark.start - renderMs) / msPerPx));
        const right = Math.min(w, Math.round(headX + (mark.end - renderMs) / msPerPx));
        if (right <= left) continue;
        ctx.fillStyle = "#ff4d6d";
        ctx.fillRect(left, h - railH, Math.max(1, right - left), railH);
        ctx.fillRect(left, 0, Math.max(1, markerWidth), h);
        ctx.fillRect(Math.max(left, right - markerWidth), 0, Math.max(1, markerWidth), h);
        const label = BufferOps.editMarkLabel(mark);
        const lw = ctx.measureText(label).width;
        if (right - left >= lw + 6 * dpr) {
          const lx = left + 3 * dpr;
          const ly = h - railH - 2 * dpr;
          ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
          ctx.fillRect(lx - dpr, ly - 9 * dpr, lw + 2 * dpr, 10 * dpr);
          ctx.fillStyle = "#ff8aa1";
          ctx.textAlign = "left";
          ctx.fillText(label, lx, ly);
          ctx.textAlign = "center";
        }
      }
      ctx.textAlign = "start";
    }

    if (hasTape && beatGrid?.showBeats && beatGrid.beats?.length) {
      const dpr = window.devicePixelRatio || 1;
      const barSet = new Set(beatGrid.bars || []);
      const tickH = Math.max(3, Math.round(4 * dpr));
      const barTickH = Math.max(6, Math.round(8 * dpr));
      const snappedMs = beatGrid.snappedBeatMs;

      for (let i = 0; i < beatGrid.beats.length; i += 1) {
        const beatMs = beatGrid.beats[i];
        const bx = Math.round(headX + (beatMs - renderMs) / msPerPx - markerWidth / 2);
        if (bx + markerWidth < 0 || bx > w) continue;

        const isBar = barSet.has(beatMs);
        const isSnapped = snappedMs !== null && Math.abs(beatMs - snappedMs) < 1;

        if (isSnapped) {
          ctx.fillStyle = "rgba(255, 140, 55, 0.4)";
          ctx.fillRect(bx, 0, markerWidth, h);
          ctx.fillStyle = "#ff8c37";
          ctx.fillRect(bx, 0, markerWidth, barTickH);
          ctx.fillRect(bx, h - barTickH, markerWidth, barTickH);
        } else if (isBar) {
          ctx.fillStyle = "rgba(255, 140, 55, 0.15)";
          ctx.fillRect(bx, 0, markerWidth, h);
          ctx.fillStyle = "#ff8c37";
          ctx.fillRect(bx, 0, markerWidth, barTickH);
          ctx.fillRect(bx, h - barTickH, markerWidth, barTickH);
        } else {
          ctx.fillStyle = "#555555";
          ctx.fillRect(bx, 0, markerWidth, tickH);
          ctx.fillRect(bx, h - tickH, markerWidth, tickH);
        }
      }
    }

    if (hasTape) {
      const cropStartL = Math.round(headX + (bounds.start - renderMs) / msPerPx - markerWidth / 2);
      const cropEndL = Math.round(headX + (bounds.end - renderMs) / msPerPx - markerWidth / 2);
      for (const [handle, barL] of [["start", cropStartL], ["end", cropEndL]]) {
        if (barL + markerWidth < 0 || barL > w) continue;
        ctx.fillStyle = handle === activeCropHandle || (mode === "idle" && handle === hoveredCropHandle) ? "#ffd400" : "#555555";
        ctx.fillRect(barL, 0, markerWidth, h);
      }
    }

    if (editSelection) {
      for (const [handle, val] of [["start", editSelection.start], ["end", editSelection.end]]) {
        const x = headX + (val - renderMs) / msPerPx;
        if (x < 0 || x > w) continue;
        ctx.fillStyle = activeEditHandle === handle || hoveredEditHandle === handle ? "#ffffff" : "#ffd400";
        ctx.fillRect(Math.round(x - markerWidth / 2), 0, markerWidth, h);
      }
    }

    if (playheadX >= 0 && playheadX <= w) {
      ctx.fillStyle = recording ? "#ff0000" : mode === "play" ? "#00d26a" : "#3b82ff";
      ctx.fillRect(playheadLeft, 0, markerWidth, h);
    }
  }

  root.SamplaWaveformView = Object.freeze({
    sizeWave,
    waveRenderCenterMs,
    timeAtClientX,
    cropHandleAt: findHandleAt,
    editHandleAt: findHandleAt,
    drawWave,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
