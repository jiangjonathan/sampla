(function installDeckGeometry(root) {
  const TAPE_MIN_R = 24;
  const TAPE_MAX_R = 89;
  const TAPE_START = 0.18;
  const TAPE_CAPACITY_MS = 8 * 60 * 1000;
  const TAPE_SPEED = 140;
  const WIND_SPEED = 5;

  const SUPPLY = Object.freeze({ x: 96, y: 96 });
  const TAKEUP = Object.freeze({ x: 294, y: 96 });
  const PULLEY_1 = Object.freeze({ x: 81, y: 244, r: 7.5 });
  const PULLEY_2 = Object.freeze({ x: 119.5, y: 230.5, r: 12 });
  const PULLEY_3 = Object.freeze({ x: 260, y: 230, r: 7.5 });
  const ARM_AXLE = Object.freeze({ x: 291, y: 248 });
  const ARM_GUIDE0 = Object.freeze({ x: 291, y: 204 });
  const ARM_IDLE = 36;
  const ARM_STATIC_TENSION = 28;
  const ARM_RUN = 19;
  const ARM_WOBBLE = 0.55;
  const ARM_OMEGA = 22;
  const ARM_ZETA = 0.55;
  const REEL_ACCEL = 6;
  const REEL_DECEL = 3.2;

  const WINDOW_LEFT = Object.freeze([
    Object.freeze({ x: 146.464, y: 202.74 }),
    Object.freeze({ x: 154.797, y: 252.74 }),
  ]);
  const WINDOW_RIGHT = Object.freeze([
    Object.freeze({ x: 243.536, y: 202.74 }),
    Object.freeze({ x: 235.203, y: 252.74 }),
  ]);
  const HEAD_ENTRY_Y = 236;

  // DSEG7 Classic Italic glyph outlines, scaled from their native 1000-unit grid.
  const SEG_GLYPHS = Object.freeze({
    0: "M90 45 62 76 98 490H125L129 485 185 424 157 107ZM131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893ZM631 31 597 0H132L103 31 171 93H574Z",
    1: "M684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893Z",
    2: "M90 45 62 76 98 490H125L129 485 185 424 157 107ZM185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM726 955 754 924 718 510H691L687 514 631 575 659 893ZM631 31 597 0H132L103 31 171 93H574Z",
    3: "M185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893ZM631 31 597 0H132L103 31 171 93H574Z",
    4: "M131 515 127 510H100L136 924 170 955 226 893 198 576ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893Z",
    5: "M131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM631 31 597 0H132L103 31 171 93H574Z",
    6: "M90 45 62 76 98 490H125L129 485 185 424 157 107ZM131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM631 31 597 0H132L103 31 171 93H574Z",
    7: "M131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893Z",
    8: "M90 45 62 76 98 490H125L129 485 185 424 157 107ZM131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893ZM631 31 597 0H132L103 31 171 93H574Z",
    9: "M131 515 127 510H100L136 924 170 955 226 893 198 576ZM185 969 219 1000H684L713 969 645 907H242ZM671 499 620 453V454H188V453L144 500 196 547V546H628ZM684 485 689 489H716L680 76 646 45 590 107 618 424ZM726 955 754 924 718 510H691L687 514 631 575 659 893ZM631 31 597 0H132L103 31 171 93H574Z",
    colon: "M61 717Q66 728 74 736Q84 745 94 750Q103 754 118 754Q133 754 142 750Q152 745 162 736Q170 728 175 717Q180 705 180 693Q180 681 175 669Q170 657 162 649Q154 641 142 636Q130 631 118 631Q106 631 94 636Q82 641 74 649Q66 657 61 669Q56 681 56 693Q56 705 61 717ZM25 305Q30 316 38 324Q48 334 58 338Q67 342 82 342Q97 342 106 338Q116 334 126 324Q134 316 139 305Q144 293 144 281Q144 269 139 257Q134 245 126 237Q118 229 106 224Q94 219 82 219Q70 219 58 224Q46 229 38 237Q30 245 25 257Q20 269 20 281Q20 293 25 305Z",
  });

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

  function formatTrackDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return hours
      ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
      : `${String(minutes).padStart(2, "0")}:${seconds}`;
  }

  function formatEditTime(ms) {
    const centiseconds = Math.max(0, Math.floor(ms / 10));
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, "0");
    const fraction = String(centiseconds % 100).padStart(2, "0");
    return minutes ? `${minutes}:${seconds}.${fraction}` : `${seconds}.${fraction}`;
  }

  function packRadius(amount, minR = TAPE_MIN_R, maxR = TAPE_MAX_R) {
    const fill = Math.min(1, Math.max(0, amount));
    const minA = minR * minR;
    const maxA = maxR * maxR;
    return Math.sqrt(minA + fill * (maxA - minA));
  }

  function tapeAt(ms, capacityMs = TAPE_CAPACITY_MS, startRatio = TAPE_START) {
    return startRatio + Math.max(0, ms) / capacityMs;
  }

  function circleTangents(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return [];
    const vx = dx / dist;
    const vy = dy / dist;
    const c = (r1 - r2) / dist;
    if (Math.abs(c) > 1) return [];
    const h = Math.sqrt(Math.max(0, 1 - c * c));
    return [1, -1].map((side) => {
      const nx = vx * c - side * h * vy;
      const ny = vy * c + side * h * vx;
      const a = { x: x1 + r1 * nx, y: y1 + r1 * ny };
      const b = { x: x2 + r2 * nx, y: y2 + r2 * ny };
      a.angle = Math.atan2(a.y - y1, a.x - x1);
      b.angle = Math.atan2(b.y - y2, b.x - x2);
      return { a, b };
    });
  }

  function pointTangents(cx, cy, r, px, py) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist <= r) return [];
    const base = Math.atan2(dy, dx);
    const off = Math.acos(r / dist);
    return [base + off, base - off].map((angle) => ({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle,
    }));
  }

  function pickMin(items, score) {
    let best = null;
    let bestScore = Infinity;
    for (const item of items) {
      const value = score(item);
      if (value < bestScore) {
        best = item;
        bestScore = value;
      }
    }
    return best;
  }

  function fmt(p) {
    return `${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  }

  function windowX(edge, y) {
    const t = (y - edge[0].y) / (edge[1].y - edge[0].y);
    return edge[0].x + t * (edge[1].x - edge[0].x);
  }

  function wrapArc(cx, cy, r, a0, a1, prefer) {
    const tau = Math.PI * 2;
    const inc = (a1 - a0 + tau) % tau;
    const dec = (a0 - a1 + tau) % tau;
    const yInc = cy + r * Math.sin(a0 + inc / 2);
    const yDec = cy + r * Math.sin(a0 - dec / 2);
    const increasing = prefer === "bottom" ? yInc >= yDec : yInc <= yDec;
    const delta = increasing ? inc : dec;
    const to = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
    const large = delta > Math.PI ? 1 : 0;
    const sweep = increasing ? 1 : 0;
    return `A ${r} ${r} 0 ${large} ${sweep} ${fmt(to)}`;
  }

  function tapeSide(from, rFrom, pickFrom, mid, rMid, pickMid, to, rTo, wrapMid, wrapTo, head, pickExit) {
    const a = pickMin(circleTangents(from.x, from.y, rFrom, mid.x, mid.y, rMid), pickFrom);
    const b = pickMin(circleTangents(mid.x, mid.y, rMid, to.x, to.y, rTo), pickMid);
    const exit = pickMin(pointTangents(to.x, to.y, Math.abs(rTo), head.x, head.y), pickExit);
    if (!a || !b || !exit) return "";
    return [
      `M ${fmt(a.a)}`,
      `L ${fmt(a.b)}`,
      wrapArc(mid.x, mid.y, rMid, a.b.angle, b.a.angle, wrapMid),
      `L ${fmt(b.b)}`,
      wrapArc(to.x, to.y, Math.abs(rTo), b.b.angle, exit.angle, wrapTo),
      `L ${fmt(head)}`,
    ].join(" ");
  }

  function computeTapePath(packLeft, packRight, tensionPos) {
    const leftHead = { x: windowX(WINDOW_LEFT, HEAD_ENTRY_Y), y: HEAD_ENTRY_Y };
    const rightHead = { x: windowX(WINDOW_RIGHT, HEAD_ENTRY_Y), y: HEAD_ENTRY_Y };
    const left = tapeSide(
      SUPPLY, packLeft, (t) => t.a.x,
      PULLEY_1, PULLEY_1.r, (t) => t.b.y - t.a.y,
      PULLEY_2, -PULLEY_2.r, "bottom", "top",
      leftHead, (p) => p.y
    );
    const right = tapeSide(
      TAKEUP, packRight, (t) => -t.a.x,
      tensionPos, tensionPos.r || 1.5, (t) => -(t.a.y + t.b.y),
      PULLEY_3, PULLEY_3.r, "bottom", "bottom",
      rightHead, (p) => -p.y
    );
    return left && right ? `${left} ${right}` : "";
  }

  root.SamplaDeckGeometry = Object.freeze({
    TAPE_MIN_R,
    TAPE_MAX_R,
    TAPE_START,
    TAPE_CAPACITY_MS,
    TAPE_SPEED,
    WIND_SPEED,
    SUPPLY,
    TAKEUP,
    PULLEY_1,
    PULLEY_2,
    PULLEY_3,
    ARM_AXLE,
    ARM_GUIDE0,
    ARM_IDLE,
    ARM_STATIC_TENSION,
    ARM_RUN,
    ARM_WOBBLE,
    ARM_OMEGA,
    ARM_ZETA,
    REEL_ACCEL,
    REEL_DECEL,
    WINDOW_LEFT,
    WINDOW_RIGHT,
    HEAD_ENTRY_Y,
    SEG_GLYPHS,
    formatTime,
    formatTrackDuration,
    formatEditTime,
    packRadius,
    tapeAt,
    circleTangents,
    pointTangents,
    pickMin,
    fmt,
    windowX,
    wrapArc,
    tapeSide,
    computeTapePath,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
