import { downloadWav } from "../audio/wav.js";

function formatTime(ms) {
  const t = Math.max(0, ms);
  const s = String(Math.floor(t / 1000)).padStart(2, "0");
  const h = String(Math.floor(t / 10) % 100).padStart(2, "0");
  return `${s}:${h}`;
}

function sizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, canvas.clientWidth);
  const cssH = Math.max(1, canvas.clientHeight);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas._cssWidth = cssW;
  return { w, h, dpr, cssW };
}

function xToTime(x, cssW, duration) {
  return Math.max(0, Math.min(duration, (x / cssW) * duration));
}

function timeToX(t, cssW, duration) {
  return (t / Math.max(0.001, duration)) * cssW;
}

export function mountWaveform(root, { player, peaks, reducedMotion } = {}) {
  let wavePeaks = peaks;

  root.innerHTML = `
    <div class="deck-embed wave-shell" data-wave tabindex="0" role="region" aria-label="Waveform trim demo">
      <div class="wave-meta">
        <span data-title>UNTITLED</span>
        <output data-clock>00:00</output>
        <span class="wave-range" data-range></span>
      </div>
      <canvas class="wave-canvas" data-canvas aria-label="Tape waveform with draggable crop handles"></canvas>
      <div class="wave-toolbar">
        <button type="button" class="key" data-act="play">PLAY</button>
        <button type="button" class="key" data-act="loop" aria-pressed="false">LOOP</button>
        <label class="speed-field">
          SPEED
          <select data-speed aria-label="Playback speed">
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <button type="button" class="key" data-act="export">WAV</button>
      </div>
      <p class="deck-status" data-status aria-live="polite">drag handles to crop · export writes 16-bit WAV</p>
      <p class="sr-only" id="wave-help">
        Space plays or stops. Arrow keys seek. Shift plus arrows move the out point.
        Alt plus arrows move the in point.
      </p>
    </div>
  `;

  const canvas = root.querySelector("[data-canvas]");
  const clock = root.querySelector("[data-clock]");
  const rangeEl = root.querySelector("[data-range]");
  const status = root.querySelector("[data-status]");
  const playBtn = root.querySelector('[data-act="play"]');
  const loopBtn = root.querySelector('[data-act="loop"]');
  const embed = root.querySelector("[data-wave]");
  const ctx2d = canvas.getContext("2d");

  let drag = null;
  let hover = null;
  let raf = 0;

  const crop = () => player.range;

  function draw() {
    const styles = getComputedStyle(embed);
    const line = styles.getPropertyValue("--line").trim() || "#ff0000";
    const dim = styles.getPropertyValue("--dim").trim() || "#7a1010";
    const edit = styles.getPropertyValue("--edit").trim() || "#ffd400";
    const bg = styles.getPropertyValue("--bg").trim() || "#000";
    const { w, h, dpr, cssW } = sizeCanvas(canvas);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, cssW, h / dpr);
    ctx2d.fillStyle = bg;
    ctx2d.fillRect(0, 0, cssW, h / dpr);

    const cssH = h / dpr;
    const mid = cssH / 2;
    const dur = player.duration() || 1;
    const { start, end } = crop();
    const peaks = wavePeaks || [];
    const cols = Math.max(1, Math.floor(cssW));
    const peaksPerCol = peaks.length / cols;

    for (let x = 0; x < cols; x += 1) {
      const t = (x / cols) * dur;
      const i = Math.min(peaks.length - 1, Math.floor(x * peaksPerCol));
      const amp = peaks[i] || 0;
      const mag = Math.max(1, amp * (cssH * 0.42));
      const inside = t >= start && t <= end;
      ctx2d.fillStyle = inside ? line : dim;
      ctx2d.fillRect(x, mid - mag, 1, mag * 2);
    }

    const x0 = timeToX(start, cssW, dur);
    const x1 = timeToX(end, cssW, dur);
    ctx2d.fillStyle = "rgba(255, 212, 0, 0.08)";
    ctx2d.fillRect(x0, 0, Math.max(1, x1 - x0), cssH);

    const playX = timeToX(player.getPosition(), cssW, dur);
    ctx2d.fillStyle = line;
    ctx2d.fillRect(playX, 0, 1, cssH);

    const handles = [
      { x: x0, kind: "start" },
      { x: x1, kind: "end" },
    ];
    for (const handle of handles) {
      const active = drag === handle.kind || hover === handle.kind;
      ctx2d.fillStyle = edit;
      ctx2d.fillRect(handle.x - 1, 0, 2, cssH);
      ctx2d.beginPath();
      ctx2d.arc(handle.x, mid, active ? 6 : 4.5, 0, Math.PI * 2);
      ctx2d.fill();
    }

    clock.textContent = formatTime(player.getPosition() * 1000);
    rangeEl.textContent = `IN ${formatTime(start * 1000)}  OUT ${formatTime(end * 1000)}`;
    playBtn.classList.toggle("active", player.playing);
    playBtn.textContent = player.playing ? "STOP" : "PLAY";
    loopBtn.classList.toggle("active", player.loop);
    loopBtn.setAttribute("aria-pressed", String(player.loop));
  }

  function loop() {
    draw();
    if (player.playing && !reducedMotion) raf = requestAnimationFrame(loop);
    else if (player.playing) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function handleAt(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const dur = player.duration();
    const x0 = timeToX(crop().start, rect.width, dur);
    const x1 = timeToX(crop().end, rect.width, dur);
    const hit = 10;
    const d0 = Math.abs(x - x0);
    const d1 = Math.abs(x - x1);
    if (d0 <= hit && d0 <= d1) return "start";
    if (d1 <= hit) return "end";
    return null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    const kind = handleAt(event.clientX);
    const rect = canvas.getBoundingClientRect();
    const t = xToTime(event.clientX - rect.left, rect.width, player.duration());
    if (kind) {
      drag = kind;
      hover = kind;
    } else {
      player.seek(t);
      status.textContent = "seek";
    }
    draw();
  });

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const t = xToTime(event.clientX - rect.left, rect.width, player.duration());
    if (drag) {
      if (drag === "start") player.setRange(t, crop().end);
      else player.setRange(crop().start, t);
      status.textContent = drag === "start" ? "in point" : "out point";
      draw();
      return;
    }
    hover = handleAt(event.clientX);
    canvas.style.cursor = hover ? "ew-resize" : "crosshair";
    draw();
  });

  canvas.addEventListener("pointerup", () => {
    drag = null;
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = null;
  });

  playBtn.addEventListener("click", async () => {
    if (player.playing) {
      player.stop();
      status.textContent = "stop";
      draw();
    } else {
      await player.play();
      status.textContent = player.loop ? "play · loop crop" : "play crop";
      kick();
    }
  });

  loopBtn.addEventListener("click", () => {
    player.setLoop(!player.loop);
    status.textContent = player.loop ? "loop on — plays the crop only" : "loop off";
    draw();
  });

  root.querySelector("[data-speed]").addEventListener("change", (event) => {
    player.setSpeed(Number(event.target.value));
    status.textContent = `speed ${event.target.value}× (demo playback rate; extension resamples)`;
    draw();
  });

  root.querySelector('[data-act="export"]').addEventListener("click", () => {
    downloadWav(player.buffer, {
      start: crop().start,
      end: crop().end,
      name: "sampla-clip",
    });
    status.textContent = "exported 16-bit PCM WAV";
  });

  embed.addEventListener("keydown", (event) => {
    if (event.target.closest("button, select, input")) return;
    const step = event.shiftKey || event.altKey ? 0.05 : 0.15;
    if (event.code === "Space") {
      event.preventDefault();
      playBtn.click();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (event.shiftKey) player.setRange(crop().start, crop().end + step);
      else if (event.altKey) player.setRange(crop().start + step, crop().end);
      else player.seek(player.getPosition() + step);
      draw();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (event.shiftKey) player.setRange(crop().start, crop().end - step);
      else if (event.altKey) player.setRange(crop().start - step, crop().end);
      else player.seek(player.getPosition() - step);
      draw();
    }
  });

  player.onEnded = () => {
    status.textContent = "end of crop";
    draw();
  };

  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);
  document.addEventListener("sampla-tokens", draw);

  draw();
  // Default crop: a middle loop so handles are obvious.
  const dur = player.duration();
  player.setRange(dur * 0.18, dur * 0.62);
  player.setLoop(true);
  draw();

  return {
    setPeaks(next) {
      wavePeaks = next;
      draw();
    },
    redraw: draw,
  };
}
