import { createLiveGraph } from "../audio/sample.js";
import { peaksFromBuffer } from "../audio/wav.js";

const TAPE_MIN = 26;
const TAPE_MAX = 78;
const WIND = 5;
const LEFT = { x: 96, y: 92 };
const RIGHT = { x: 294, y: 92 };

const ICONS = {
  rev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6 3 12l9 6v-6l9 6V6l-9 6V6Z" fill="currentColor"/></svg>`,
  ffwd: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 9 6V6l9 6-9 6v-6l-9 6V6Z" fill="currentColor"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6 10 6-10 6V6Z" fill="currentColor"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg>`,
  loop: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h14V2l5 5-5 5V9H7v3H3V5Zm18 14H7v3l-5-5 5-5v3h10v-3h4v7Z" fill="currentColor"/></svg>`,
  rec: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>`,
};

function formatTime(ms) {
  const t = Math.max(0, ms);
  if (t < 60000) {
    const s = String(Math.floor(t / 1000)).padStart(2, "0");
    const h = String(Math.floor(t / 10) % 100).padStart(2, "0");
    return `${s}:${h}`;
  }
  const total = Math.floor(t / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function packRadii(progress) {
  const p = Math.max(0, Math.min(1, progress));
  return {
    left: TAPE_MAX - (TAPE_MAX - TAPE_MIN) * p,
    right: TAPE_MIN + (TAPE_MAX - TAPE_MIN) * p,
  };
}

function tapeD(leftR, rightR, armTilt) {
  const lx = LEFT.x;
  const ly = LEFT.y + leftR - 1;
  const rx = RIGHT.x;
  const ry = RIGHT.y + rightR - 1;
  const rail = 221 + armTilt * 2;
  return [
    `M ${lx} ${ly}`,
    `C ${lx} ${ly + 34}, 86 198, 86 ${rail}`,
    `L 148 ${rail}`,
    `L 242 ${rail}`,
    `C 280 ${rail}, ${rx} ${ry + 32}, ${rx} ${ry}`,
  ].join(" ");
}

export function mountTapeDeck(root, { player, reducedMotion, onBuffer } = {}) {
  root.innerHTML = `
    <div class="deck-embed" data-deck tabindex="0" role="region" aria-label="Tape deck demo">
      <svg class="machine" viewBox="0 0 390 248" fill="none" aria-hidden="true">
        <circle class="tape-pack" data-pack="left" cx="${LEFT.x}" cy="${LEFT.y}" r="${TAPE_MAX}" />
        <circle class="tape-pack" data-pack="right" cx="${RIGHT.x}" cy="${RIGHT.y}" r="${TAPE_MIN}" />
        <path class="tape-path" data-tape-path d="" />
        <g class="spool" data-spool="left" transform="translate(${LEFT.x} ${LEFT.y})">
          <circle r="84" />
          <circle r="16" />
          <path d="M0 -16 V16 M-13.9 -8 L13.9 8 M-13.9 8 L13.9 -8" />
        </g>
        <g class="spool" data-spool="right" transform="translate(${RIGHT.x} ${RIGHT.y})">
          <circle r="84" />
          <circle r="16" />
          <path d="M0 -16 V16 M-13.9 -8 L13.9 8 M-13.9 8 L13.9 -8" />
        </g>
        <g class="chassis">
          <path d="M148 196.5H242C244.8 196.5 246.9 199 246.4 201.7L238.4 248H151.6L143.6 201.7C143.1 199 145.2 196.5 148 196.5Z" />
          <circle class="pulley" cx="80" cy="222" r="8" />
          <circle class="pulley" cx="120" cy="208" r="12" />
          <circle class="pulley" cx="268" cy="208" r="8" />
        </g>
        <path class="tension-arm" data-arm d="M294 188 V236" />
        <text class="timer-text" data-timer x="195" y="232">00:00</text>
      </svg>
      <nav class="transport" aria-label="Transport">
        ${transportButton("rev", "Rewind", "REW")}
        ${transportButton("ffwd", "Fast forward", "FFWD")}
        ${transportButton("play", "Play", "PLAY", "play")}
        ${transportButton("stop", "Stop", "STOP")}
        ${transportButton("loop", "Loop", "LOOP")}
        ${transportButton("rec", "Record", "REC", "record")}
      </nav>
      <p class="deck-status" data-status aria-live="polite">idle — original 8s loop</p>
      <p class="sr-only">
        Space plays or stops. R starts a live recording. L toggles loop.
        Hold rewind or fast-forward to wind the tape.
      </p>
    </div>
  `;

  const embed = root.querySelector("[data-deck]");
  const packL = root.querySelector('[data-pack="left"]');
  const packR = root.querySelector('[data-pack="right"]');
  const path = root.querySelector("[data-tape-path]");
  const spoolL = root.querySelector('[data-spool="left"]');
  const spoolR = root.querySelector('[data-spool="right"]');
  const arm = root.querySelector("[data-arm]");
  const timer = root.querySelector("[data-timer]");
  const status = root.querySelector("[data-status]");
  const playBtn = root.querySelector('[data-key="play"]');
  const loopBtn = root.querySelector('[data-key="loop"]');
  const recBtn = root.querySelector('[data-key="rec"]');
  const playLight = root.querySelector("[data-light='play']");
  const recLight = root.querySelector("[data-light='record']");

  let angleL = 0;
  let angleR = 0;
  let wind = 0;
  let raf = 0;
  let last = 0;
  let recording = false;
  let recProc = null;
  let recLive = null;
  let recMute = null;
  let recData = null;
  let recOffset = 0;
  let recStarted = 0;

  function progress() {
    const dur = player.duration() || 1;
    return player.getPosition() / dur;
  }

  function render(dt) {
    const p = recording ? Math.min(1, recOffset / (recData?.length || 1)) : progress();
    const { left, right } = packRadii(p);
    packL.setAttribute("r", String(left));
    packR.setAttribute("r", String(right));
    const running = player.playing || wind !== 0 || recording;
    const tilt = running ? 1 : 0;
    path.setAttribute("d", tapeD(left, right, tilt));
    if (!reducedMotion && running) {
      const rate = recording || player.playing ? 1 : wind;
      angleL += dt * 1.6 * rate * (TAPE_MAX / left);
      angleR += dt * 1.6 * rate * (TAPE_MAX / right);
    }
    spoolL.setAttribute("transform", `translate(${LEFT.x} ${LEFT.y}) rotate(${angleL})`);
    spoolR.setAttribute("transform", `translate(${RIGHT.x} ${RIGHT.y}) rotate(${angleR})`);
    arm.setAttribute("transform", `rotate(${tilt ? -8 : 0} 294 236)`);
    const ms = recording
      ? ((performance.now() - recStarted) )
      : player.getPosition() * 1000;
    timer.textContent = formatTime(ms);
    playLight.classList.toggle("lit", player.playing);
    recLight.classList.toggle("lit", recording);
    playBtn.classList.toggle("active", player.playing);
    recBtn.classList.toggle("active", recording);
    loopBtn.classList.toggle("active", player.loop);
    loopBtn.setAttribute("aria-pressed", String(player.loop));
  }

  function tick(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (wind !== 0 && !recording) {
      const dur = player.duration();
      player.seek(player.getPosition() + wind * WIND * dt);
      if (player.getPosition() <= 0 || player.getPosition() >= dur) wind = 0;
    }
    render(dt);
    if (player.playing || wind !== 0 || recording) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
      last = 0;
      render(0);
    }
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  player.onEnded = () => {
    status.textContent = player.loop ? "loop" : "stop";
    kick();
  };

  async function play() {
    if (recording) return;
    await player.play();
    status.textContent = player.loop ? "play · loop" : "play";
    kick();
  }

  function stop() {
    if (recording) stopRecord();
    player.stop();
    wind = 0;
    status.textContent = "stop";
    render(0);
  }

  async function startRecord() {
    if (recording) return;
    player.stop();
    await player.resume();
    const ctx = player.ctx;
    recData = new Float32Array(Math.floor(ctx.sampleRate * 8));
    recOffset = 0;
    recStarted = performance.now();
    recLive = createLiveGraph(ctx);
    recProc = ctx.createScriptProcessor(2048, 1, 1);
    recMute = ctx.createGain();
    recMute.gain.value = 0;
    recLive.output.connect(ctx.destination);
    recLive.output.connect(recProc);
    recProc.connect(recMute);
    recMute.connect(ctx.destination);
    recProc.onaudioprocess = (event) => {
      if (!recording || !recData) return;
      const input = event.inputBuffer.getChannelData(0);
      const n = Math.min(recData.length - recOffset, input.length);
      recData.set(input.subarray(0, n), recOffset);
      recOffset += n;
      if (recOffset >= recData.length) queueMicrotask(() => stopRecord());
    };
    recording = true;
    recLive.start();
    status.textContent = "rec · live oscillator take";
    kick();
  }

  function stopRecord() {
    if (!recording) return;
    recording = false;
    recLive?.stop();
    recLive?.dispose();
    recLive = null;
    recProc?.disconnect();
    recProc = null;
    recMute?.disconnect();
    recMute = null;
    const ctx = player.ctx;
    if (!recOffset) {
      recData = null;
      status.textContent = "record cancelled";
      render(0);
      return;
    }
    const buffer = ctx.createBuffer(1, recOffset, ctx.sampleRate);
    buffer.copyToChannel(recData.subarray(0, recOffset), 0);
    player.setBuffer(buffer);
    onBuffer?.({ buffer, peaks: peaksFromBuffer(buffer) });
    recData = null;
    recOffset = 0;
    status.textContent = "recorded · take on tape";
    render(0);
  }

  root.querySelector('[data-key="rev"]').addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (recording) return;
    player.stop();
    wind = -1;
    status.textContent = "rew";
    kick();
  });
  root.querySelector('[data-key="ffwd"]').addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (recording) return;
    player.stop();
    wind = 1;
    status.textContent = "ffwd";
    kick();
  });
  window.addEventListener("pointerup", () => {
    if (wind !== 0) {
      wind = 0;
      status.textContent = "stop";
      render(0);
    }
  });

  playBtn.addEventListener("click", () => {
    if (player.playing) {
      player.stop();
      status.textContent = "pause";
      render(0);
    } else {
      play();
    }
  });
  root.querySelector('[data-key="stop"]').addEventListener("click", stop);
  loopBtn.addEventListener("click", () => {
    player.setLoop(!player.loop);
    status.textContent = player.loop ? "loop on" : "loop off";
    render(0);
  });
  recBtn.addEventListener("click", () => {
    if (recording) stopRecord();
    else startRecord();
  });

  embed.addEventListener("keydown", (event) => {
    if (event.target.closest("button, select, input")) return;
    if (event.code === "Space") {
      event.preventDefault();
      playBtn.click();
    } else if (event.key === "s" || event.key === "S") {
      stop();
    } else if (event.key === "r" || event.key === "R") {
      recBtn.click();
    } else if (event.key === "l" || event.key === "L") {
      loopBtn.click();
    }
  });

  render(0);
}

function transportButton(id, label, caption, light) {
  const lightHtml = light
    ? `<span class="control-light ${light}-light" data-light="${light}" aria-hidden="true"></span>`
    : `<span class="control-light-spacer"></span>`;
  const pressed = id === "loop" ? ` aria-pressed="false"` : "";
  return `<div class="transport-control">${lightHtml}<button type="button" class="key" data-key="${id}" aria-label="${label}"${pressed}>${ICONS[id]}</button><span class="key-label">${caption}</span></div>`;
}
