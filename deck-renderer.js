(function installDeckRenderer(root) {
  const Geometry = root.SamplaDeckGeometry || window.SamplaDeckGeometry;

  class TapeDeckRenderer {
    constructor(elements) {
      this.timerEl = elements.timerEl;
      this.segDigits = elements.segDigits;
      this.tapeLeft = elements.tapeLeft;
      this.tapeRight = elements.tapeRight;
      this.spoolLeft = elements.spoolLeft;
      this.spoolRight = elements.spoolRight;
      this.tapePath = elements.tapePath;
      this.tensionArm = elements.tensionArm;
      this.tensionGuide = elements.tensionGuide;

      this.armCurrent = Geometry.ARM_IDLE;
      this.armVel = 0;
      this.armWobblePhase = 0;
      this.angleLeft = 0;
      this.angleRight = 0;
      this.reelRate = 0;
      this.packLeft = Geometry.TAPE_MIN_R;
      this.packRight = Geometry.TAPE_MIN_R;
      this.tension = { x: 291, y: 204, r: 1.5 };
      this.lastPackProgress = Number.NaN;
      this.lastTapeGeometry = null;
      this.lastSegText = "";

      if (this.segDigits) this.buildSevenSeg();
      this.setArm(Geometry.ARM_IDLE);
    }

    buildSevenSeg() {
      if (!this.segDigits) return;
      const ns = "http://www.w3.org/2000/svg";
      const slots = [0, 1, "colon", 2, 3];
      let x = 0;
      this.segDigits.replaceChildren();
      for (const slot of slots) {
        const group = document.createElementNS(ns, "g");
        group.setAttribute("transform", `translate(${x} 0)`);
        const off = document.createElementNS(ns, "path");
        const on = document.createElementNS(ns, "path");
        off.setAttribute("class", "timer-glyph timer-glyph-off");
        on.setAttribute("class", "timer-glyph");
        off.setAttribute("d", slot === "colon" ? Geometry.SEG_GLYPHS.colon : Geometry.SEG_GLYPHS[8]);
        on.setAttribute("d", slot === "colon" ? Geometry.SEG_GLYPHS.colon : Geometry.SEG_GLYPHS[0]);
        if (slot !== "colon") on.dataset.digit = String(slot);
        group.append(off, on);
        this.segDigits.append(group);
        x += slot === "colon" ? 200 : 816;
      }
    }

    setSevenSeg(text) {
      if (text === this.lastSegText) return;
      this.lastSegText = text;
      if (this.timerEl) this.timerEl.setAttribute("aria-label", text);
      if (!this.segDigits) return;
      const digits = text.replace(":", "");
      this.segDigits.querySelectorAll("[data-digit]").forEach((path, index) => {
        path.setAttribute("d", Geometry.SEG_GLYPHS[digits[index]] || "");
      });
    }

    setTapeProgress(progress) {
      const p = Math.min(1, Math.max(0, progress));
      if (Math.abs(p - this.lastPackProgress) < 1 / 6000) return;
      this.lastPackProgress = p;
      this.packLeft = Geometry.packRadius(1 - p);
      this.packRight = Geometry.packRadius(p);
      if (this.tapeLeft) this.tapeLeft.setAttribute("r", String(this.packLeft));
      if (this.tapeRight) this.tapeRight.setAttribute("r", String(this.packRight));
    }

    setArm(deg) {
      const rot = `rotate(${deg}deg)`;
      if (this.tensionArm) this.tensionArm.style.transform = rot;
      if (this.tensionGuide) this.tensionGuide.style.transform = rot;
      const rad = (deg * Math.PI) / 180;
      const dx = Geometry.ARM_GUIDE0.x - Geometry.ARM_AXLE.x;
      const dy = Geometry.ARM_GUIDE0.y - Geometry.ARM_AXLE.y;
      this.tension.x = Geometry.ARM_AXLE.x + dx * Math.cos(rad) - dy * Math.sin(rad);
      this.tension.y = Geometry.ARM_AXLE.y + dx * Math.sin(rad) + dy * Math.cos(rad);
    }

    stepArm(dt, {
      moving,
      modeRate,
      jogActive,
      scrubRate,
      armTensionHeld,
      releaseArmWithReels,
      pointerCount,
      transportRate,
    }) {
      const transportEngaged = moving && modeRate !== 0;
      const tensioned = jogActive || transportEngaged || armTensionHeld;
      const visibleRate = jogActive
        ? scrubRate
        : transportEngaged || releaseArmWithReels ? this.reelRate : 0;
      const lift = pointerCount > 0 ? 1 : Math.min(1, Math.abs(visibleRate));
      const rest = tensioned ? Geometry.ARM_STATIC_TENSION : Geometry.ARM_IDLE;
      const target = rest + (Geometry.ARM_RUN - rest) * lift;
      const acc = Geometry.ARM_OMEGA * Geometry.ARM_OMEGA * (target - this.armCurrent)
        - 2 * Geometry.ARM_ZETA * Geometry.ARM_OMEGA * this.armVel;
      this.armVel += acc * dt;
      this.armCurrent += this.armVel * dt;
      let deg = this.armCurrent;
      const spd = Math.abs(transportRate);
      if (lift > 0.82 && spd > 0.35 && Math.abs(this.armCurrent - target) < 3 && Math.abs(this.armVel) < 8) {
        this.armWobblePhase += 14 * Math.max(1, spd) * dt;
        if (this.armWobblePhase > Math.PI * 2000) this.armWobblePhase -= Math.PI * 2000;
        const wob = Geometry.ARM_WOBBLE * lift;
        deg += Math.sin(this.armWobblePhase) * wob + Math.sin(this.armWobblePhase * (23 / 14)) * wob * 0.4;
      }
      this.setArm(deg);
      return Math.abs(this.armCurrent - target) > 0.08 || Math.abs(this.armVel) > 0.4;
    }

    moveReelsByTapeMs(deltaMs) {
      const dir = Math.sign(deltaMs);
      if (!dir) return;
      const toDeg = (180 / Math.PI) * (Math.abs(deltaMs) / 1000);
      this.angleLeft = (this.angleLeft - (Geometry.TAPE_SPEED / this.packLeft) * toDeg * dir) % 360;
      this.angleRight = (this.angleRight - (Geometry.TAPE_SPEED / this.packRight) * toDeg * dir) % 360;
      if (this.spoolLeft) this.spoolLeft.style.transform = `rotate(${this.angleLeft}deg)`;
      if (this.spoolRight) this.spoolRight.style.transform = `rotate(${this.angleRight}deg)`;
    }

    spin(dt, { moving, transportRate, jogActive }) {
      if (jogActive) {
        this.reelRate = 0;
        return false;
      }
      const target = moving ? transportRate : 0;
      const slew = Math.abs(target) > Math.abs(this.reelRate) ? Geometry.REEL_ACCEL : Geometry.REEL_DECEL;
      this.reelRate += (target - this.reelRate) * (1 - Math.exp(-dt * slew));
      if (Math.abs(this.reelRate) < 0.002) {
        this.reelRate = 0;
        return false;
      }
      this.moveReelsByTapeMs(this.reelRate * dt * 1000);
      return true;
    }

    updateTapePath() {
      if (!this.tapePath) return;
      const { packLeft: pl, packRight: pr, tension: t, lastTapeGeometry: g } = this;
      if (g && Math.abs(pl - g[0]) < 0.02 && Math.abs(pr - g[1]) < 0.02 && Math.abs(t.x - g[2]) < 0.02 && Math.abs(t.y - g[3]) < 0.02) return;
      this.lastTapeGeometry = [pl, pr, t.x, t.y];
      const path = Geometry.computeTapePath(pl, pr, t);
      if (path) this.tapePath.setAttribute("d", path);
    }
  }

  root.SamplaDeckRenderer = TapeDeckRenderer;
})(typeof globalThis !== "undefined" ? globalThis : this);
