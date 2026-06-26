(function () {

    /* ── PRNG ── */
    function prng(seed) {
      let s = seed >>> 0;
      return () => {
        s = Math.imul(s ^ s >>> 15, s | 1);
        s ^= s + Math.imul(s ^ s >>> 7, s | 61);
        return ((s ^ s >>> 14) >>> 0) / 4294967296;
      };
    }

    /* ── Grid canvas ── */
    const canvas = document.getElementById('dotGrid');
    const ctx    = canvas.getContext('2d');
    let gridLogicalW = 0;
    let gridLogicalH = 0;
    let gridDpr = 1;
    const SP = 28;
    const useFinePointer = typeof matchMedia !== 'undefined' &&
      matchMedia('(hover: hover) and (pointer: fine)').matches;
    let cells = [];

    const GRID_RGB_LIGHT = [58, 61, 69];
    const GRID_RGB_DARK = [178, 186, 202];
    let gridDotRgb = '58,61,69';

    function setGridDotBlend(blend) {
      const t = Math.max(0, Math.min(1, blend));
      const r = Math.round(GRID_RGB_LIGHT[0] + (GRID_RGB_DARK[0] - GRID_RGB_LIGHT[0]) * t);
      const g = Math.round(GRID_RGB_LIGHT[1] + (GRID_RGB_DARK[1] - GRID_RGB_LIGHT[1]) * t);
      const b = Math.round(GRID_RGB_LIGHT[2] + (GRID_RGB_DARK[2] - GRID_RGB_LIGHT[2]) * t);
      gridDotRgb = `${r},${g},${b}`;
    }

    function readGridDotRgb() {
      const t = document.documentElement.getAttribute('data-theme');
      let dark = t === 'dark';
      if (t !== 'dark' && t !== 'light') {
        dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
      }
      setGridDotBlend(dark ? 1 : 0);
    }
    readGridDotRgb();

    /* ── Clock field ──────────────────────────────────────────────────
       The pattern is a field of identical short "hands" (line segments),
       à la ClockClock 24. Every minute the hands that fall inside the
       footprint of the four big 7-segment digits (HH:MM) rotate to trace
       that digit's lit segments — horizontal bars lie flat, vertical bars
       stand up — while the rest of the field rests on a uniform diagonal.

       Motion is choreographed against the wall clock: at the top of each
       minute the hands HOLD the freshly-formed time for a few seconds (the
       "landing"), then spend the remainder of the minute easing toward the
       NEXT minute's arrangement, arriving — and slowing to a near-stop —
       exactly as the clock rolls over. So the time is most legible right at
       each minute boundary and dissolves into abstraction in between, which
       is the intent: lean abstract, not a literal readout. */
    const REST_ANGLE = -Math.PI / 4;   // diagonal resting field ('/')
    const HOUR_12 = false;             // false = 24h HH:MM, true = 12h (no leading zero)
    const HOLD_MS = 7000;              // hold the landed time at the top of each minute
    const MIN_MS = 60000;

    // 7-segment geometry, normalised inside a digit box (x→right, y→down).
    // Each segment is a bar with an orientation: 0 = horizontal, PI/2 = vertical.
    const SEGMENTS = {
      a: { x1: 0.18, y1: 0.07, x2: 0.82, y2: 0.07, o: 0 },
      g: { x1: 0.18, y1: 0.50, x2: 0.82, y2: 0.50, o: 0 },
      d: { x1: 0.18, y1: 0.93, x2: 0.82, y2: 0.93, o: 0 },
      f: { x1: 0.12, y1: 0.10, x2: 0.12, y2: 0.46, o: Math.PI / 2 },
      b: { x1: 0.88, y1: 0.10, x2: 0.88, y2: 0.46, o: Math.PI / 2 },
      e: { x1: 0.12, y1: 0.54, x2: 0.12, y2: 0.90, o: Math.PI / 2 },
      c: { x1: 0.88, y1: 0.54, x2: 0.88, y2: 0.90, o: Math.PI / 2 },
    };
    // Which segments are lit for each digit 0–9.
    const DIGIT_SEGS = {
      0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
      5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    };

    let digitBoxes = [];   // {x,y,w,h} for the 4 digits, set on resize
    let colon = null;      // {cx, y1, y2, r}

    function layoutDigits(w, h) {
      const DH = Math.min(h * 0.46, 380);
      const DW = DH * 0.50;
      const gap = DW * 0.30;
      const colonW = DW * 0.46;
      const totalW = 4 * DW + 2 * gap + colonW;
      const x0 = (w - totalW) / 2;
      const y0 = (h - DH) / 2;
      const xs = [
        x0,
        x0 + DW + gap,
        x0 + 2 * DW + gap + colonW,
        x0 + 3 * DW + 2 * gap + colonW,
      ];
      digitBoxes = xs.map(x => ({ x, y: y0, w: DW, h: DH }));
      const colonCx = x0 + 2 * DW + gap + colonW / 2;
      colon = { cx: colonCx, y1: y0 + DH * 0.37, y2: y0 + DH * 0.63, r: Math.max(1.8, DW * 0.022) };
    }

    // Distance from point (px,py) to a segment bar (absolute px coords).
    function distToBar(px, py, ax, ay, bx, by) {
      const vx = bx - ax, vy = by - ay;
      const wx = px - ax, wy = py - ay;
      const len2 = vx * vx + vy * vy || 1;
      let t = (wx * vx + wy * vy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
      return Math.sqrt(dx * dx + dy * dy);
    }

    // For each line cell, find the nearest 7-segment bar (across all four
    // digit boxes) within tolerance. Time-independent, so compute once per
    // layout; only which segments are *lit* changes per minute.
    function assignClockTargets() {
      const tol = Math.max(SP * 0.62, digitBoxes.length ? digitBoxes[0].w * 0.135 : SP);
      for (const cl of cells) {
        if (cl.tp !== 2) continue;
        cl.clk = null;
        let best = tol;
        for (let di = 0; di < digitBoxes.length; di++) {
          const box = digitBoxes[di];
          for (const seg in SEGMENTS) {
            const s = SEGMENTS[seg];
            const d = distToBar(
              cl.bx, cl.by,
              box.x + s.x1 * box.w, box.y + s.y1 * box.h,
              box.x + s.x2 * box.w, box.y + s.y2 * box.h,
            );
            if (d < best) { best = d; cl.clk = { digit: di, seg, orient: s.o }; }
          }
        }
      }
    }

    function digitsForMs(ms) {
      const d = new Date(ms);
      let h = d.getHours();
      if (HOUR_12) { h = h % 12; if (h === 0) h = 12; }
      const m = d.getMinutes();
      return [
        HOUR_12 && h < 10 ? -1 : Math.floor(h / 10), // -1 → blank tens digit in 12h
        h % 10,
        Math.floor(m / 10),
        m % 10,
      ];
    }

    // Compute every line cell's resting/active angle + alpha for a given minute
    // and stash it on `key` ('M' = current minute, 'M1' = next minute).
    function computeArrangement(ms, key) {
      const digits = digitsForMs(ms);
      for (const cl of cells) {
        if (cl.tp !== 2) continue;
        let active = false;
        if (cl.clk) {
          const dv = digits[cl.clk.digit];
          active = dv >= 0 && DIGIT_SEGS[dv].indexOf(cl.clk.seg) !== -1;
        }
        cl['a' + key] = active ? cl.clk.orient : cl.rest;
        cl['o' + key] = active ? cl.activeAlpha : cl.restAlpha;
      }
    }

    let curMinute = null;
    function refreshMinute(now) {
      const idx = Math.floor(now / MIN_MS);
      if (idx === curMinute) return;
      curMinute = idx;
      computeArrangement(idx * MIN_MS, 'M');
      computeArrangement((idx + 1) * MIN_MS, 'M1');
    }

    // Hold at the current minute for HOLD_MS, then smoothstep to the next.
    function minuteEase(now) {
      const into = now % MIN_MS;
      if (into <= HOLD_MS) return 0;
      const t = (into - HOLD_MS) / (MIN_MS - HOLD_MS);
      return t * t * (3 - 2 * t);
    }

    // Shortest-path interpolation for *undirected* lines (period = PI).
    function lerpLine(a, b, t) {
      let d = ((b - a + Math.PI * 2.5) % Math.PI) - Math.PI / 2;
      return a + d * t;
    }

    function buildCells(w, h) {
      const r = prng(8675309);
      cells = [];
      for (let bx = SP / 2; bx < w + SP; bx += SP) {
        for (let by = SP / 2; by < h + SP; by += SP) {
          const roll = r();
          // Mostly identical hands (the clock), a sparse scatter of dots for
          // texture, and a little empty space for breathing room.
          if (roll < 0.07) continue;                    // whitespace
          if (roll < 0.18) {                            // sparse dot
            const al = (0.18 + r() * 0.12) * 0.9;
            const cell = { bx, by, tp: 0, al, sz: 0.8 + r() * 0.7 };
            if (r() < 0.10) {
              cell.fadeBreath = { phase: r() * 90000, period: 22000 + r() * 34000, peak: 0.35 + r() * 0.45 };
            }
            cells.push(cell);
            continue;
          }
          // Line / clock hand. Resting hands stay faint (so the field reads as
          // airy whitespace); hands that form a lit digit segment darken and
          // lengthen, so the number pops out of the diagonal field when landed.
          const cell = {
            bx, by, tp: 2,
            h: 8.5 + r() * 2.2,
            rest: REST_ANGLE + (r() - 0.5) * 0.18,    // gentle organic jitter at rest
            restAlpha: 0.06 + r() * 0.05,
            activeAlpha: 0.34 + r() * 0.13,
            clk: null,
            aM: REST_ANGLE, aM1: REST_ANGLE, oM: 0.09, oM1: 0.09,
          };
          cells.push(cell);
        }
      }
    }

    /* ── Ripples ── */
    const RPDUR = 1800, RPSPD = 180, RPAMP = 1.8;
    let ripples = [], lastRp = 0;

    /* ── Hole (content clearing) ──────────────────────────────────────
       The pattern fades out around the on-screen content so the text and
       icons stay legible, then returns to full strength in the surrounding
       field. Rather than stamp one big ellipse over the whole center — which
       left a dead "solid" oval spanning the empty gap between the hero and
       the row beneath it — we trace the actual content blocks. Each visible
       cluster gets a soft rounded-rect clear zone, so the pattern flows
       around the content silhouette and survives in the gaps between blocks. */
    const HOLE_PAD  = 10;   // px around each block kept fully clear
    const HOLE_FADE = 32;   // px transition from clear → full pattern (short = tight halo)
    const TEXT_HOLE_SELECTORS = ['.intro-text'];
    const BOX_HOLE_SELECTORS  = ['.avatar-col', '.app-card-left', '.cs-card'];

    let holeRects = [];

    function pushRect(out, r) {
      if (r.width < 1 || r.height < 1) return; // hidden / collapsed / empty line
      out.push({
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        hw: r.width / 2,
        hh: r.height / 2,
      });
    }

    const lineRange = typeof document.createRange === 'function' ? document.createRange() : null;
    function pushTextLineRects(out, el) {
      if (!lineRange) { pushRect(out, el.getBoundingClientRect()); return; }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node, any = false;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        lineRange.selectNodeContents(node);
        for (const r of lineRange.getClientRects()) { pushRect(out, r); any = true; }
      }
      if (!any) pushRect(out, el.getBoundingClientRect()); // fallback (e.g. no text node yet)
    }

    function updateHoleRects() {
      const next = [];
      for (const sel of TEXT_HOLE_SELECTORS) {
        for (const el of document.querySelectorAll(sel)) pushTextLineRects(next, el);
      }
      for (const sel of BOX_HOLE_SELECTORS) {
        for (const el of document.querySelectorAll(sel)) pushRect(next, el.getBoundingClientRect());
      }
      holeRects = next;
    }

    function holeFade(x, y) {
      if (!holeRects.length) return 1;
      let min = 1;
      for (const r of holeRects) {
        const dx = Math.max(Math.abs(x - r.cx) - (r.hw + HOLE_PAD), 0);
        const dy = Math.max(Math.abs(y - r.cy) - (r.hh + HOLE_PAD), 0);
        if (dx === 0 && dy === 0) return 0; // inside a padded block
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < HOLE_FADE) {
          const t = d / HOLE_FADE;
          const f = t * t * (3 - 2 * t); // smoothstep
          if (f < min) min = f;
        }
      }
      return min;
    }

    // Ripple displacement applied to a cell centre (interaction effect).
    function applyRipples(x, y, ts) {
      for (const rp of ripples) {
        const dt = (ts - rp.t0) / 1000;
        const d  = Math.hypot(x - rp.x, y - rp.y);
        const dW = d - dt * RPSPD;
        const dc = Math.max(0, 1 - (ts - rp.t0) / RPDUR);
        if (Math.abs(dW) < 36 && dc > 0) {
          const str = Math.sin(dW * 0.13) * RPAMP * dc;
          const ang = Math.atan2(y - rp.y, x - rp.x);
          x += Math.cos(ang) * str;
          y += Math.sin(ang) * str;
        }
      }
      return [x, y];
    }

    /* ── Draw grid ── */
    function drawGrid(c, w, h, ts) {
      c.clearRect(0, 0, w, h);
      const now = Date.now();
      const eased = minuteEase(now);
      c.lineWidth = 1.25;
      c.lineCap = 'round';
      for (const cl of cells) {
        if (cl.bx > w + SP || cl.by > h + SP) continue;
        let [x, y] = applyRipples(cl.bx, cl.by, ts);

        if (cl.tp === 0) {
          // Sparse ambient dot
          let breathMult = 1;
          if (cl.fadeBreath) {
            const { phase, period, peak } = cl.fadeBreath;
            const u = ((now + phase) % period) / period;
            breathMult = peak * (0.5 - 0.5 * Math.cos(u * 2 * Math.PI));
          }
          const alpha = cl.al * breathMult * holeFade(x, y);
          if (alpha < 0.004) continue;
          c.fillStyle = `rgba(${gridDotRgb},${alpha})`;
          c.beginPath();
          c.arc(x, y, cl.sz, 0, 6.2832);
          c.fill();
          continue;
        }

        // Clock hand: interpolate angle + alpha between this minute and next.
        const angle = lerpLine(cl.aM, cl.aM1, eased);
        const alpha = (cl.oM + (cl.oM1 - cl.oM) * eased) * holeFade(x, y);
        if (alpha < 0.004) continue;
        const dx = Math.cos(angle) * cl.h;
        const dy = Math.sin(angle) * cl.h;
        c.strokeStyle = `rgba(${gridDotRgb},${alpha})`;
        c.beginPath();
        c.moveTo(x - dx, y - dy);
        c.lineTo(x + dx, y + dy);
        c.stroke();
      }

      // Colon between HH and MM — two softly pulsing dots.
      if (colon) {
        const pulse = 0.14 + 0.12 * (0.5 + 0.5 * Math.cos(now / 900));
        c.fillStyle = `rgba(${gridDotRgb},${pulse})`;
        for (const cy of [colon.y1, colon.y2]) {
          const f = holeFade(colon.cx, cy);
          if (f < 0.004) continue;
          c.globalAlpha = f;
          c.beginPath();
          c.arc(colon.cx, cy, colon.r, 0, 6.2832);
          c.fill();
        }
        c.globalAlpha = 1;
      }
    }

    /* ── Lens ── */
    const lens       = document.getElementById('lens');
    const lensCanvas = document.getElementById('lensCanvas');
    const lc         = lensCanvas.getContext('2d');
    const LZ = 2.2, LD = 128;
    lensCanvas.width = lensCanvas.height = LD;

    function drawLens(mx, my) {
      const sw = LD / LZ;
      lc.clearRect(0, 0, LD, LD);
      const sx = (mx - sw / 2) * gridDpr;
      const sy = (my - sw / 2) * gridDpr;
      const sSize = sw * gridDpr;
      lc.drawImage(canvas, sx, sy, sSize, sSize, 0, 0, LD, LD);
    }

    /* ── Custom cursor ── */
    const cursorEl = document.getElementById('customCursor');

    const PSVG = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none"><path d="M2 8.4C2 6.15979 2 5.03969 2.43597 4.18404C2.81947 3.43139 3.43139 2.81947 4.18404 2.43597C5.03969 2 6.15979 2 8.4 2H15.6C17.8402 2 18.9603 2 19.816 2.43597C20.5686 2.81947 21.1805 3.43139 21.564 4.18404C22 5.03969 22 6.15979 22 8.4V15.6C22 17.8402 22 18.9603 21.564 19.816C21.1805 20.5686 20.5686 21.1805 19.816 21.564C18.9603 22 17.8402 22 15.6 22H8.4C6.15979 22 5.03969 22 4.18404 21.564C3.43139 21.1805 2.81947 20.5686 2.43597 19.816C2 18.9603 2 17.8402 2 15.6V8.4Z" fill="url(#dq_bg)" mask="url(#dq_mask)"></path><path d="M2 8.4C2 6.15979 2 5.03969 2.43597 4.18404C2.81947 3.43139 3.43139 2.81947 4.18404 2.43597C5.03969 2 6.15979 2 8.4 2H15.6C17.8402 2 18.9603 2 19.816 2.43597C20.5686 2.81947 21.1805 3.43139 21.564 4.18404C22 5.03969 22 6.15979 22 8.4V15.6C22 17.8402 22 18.9603 21.564 19.816C21.1805 20.5686 20.5686 21.1805 19.816 21.564C18.9603 22 17.8402 22 15.6 22H8.4C6.15979 22 5.03969 22 4.18404 21.564C3.43139 21.1805 2.81947 20.5686 2.43597 19.816C2 18.9603 2 17.8402 2 15.6V8.4Z" fill="url(#dq_bg)" filter="url(#dq_blur)" clip-path="url(#dq_cp)"></path><path d="M8.24247 10.4549C7.78665 9.087 9.08838 7.78527 10.4563 8.24109L21.7466 12.0045C23.319 12.529 23.3487 14.7428 21.7907 15.3094L17.0385 17.0371L15.3108 21.7894C14.7442 23.3473 12.5304 23.3177 12.0059 21.7452L8.24247 10.4549Z" fill="url(#dq_glass)"></path><path d="M8.2424 10.4549C7.78659 9.08699 9.08833 7.78524 10.4563 8.24106L21.7463 12.0047C23.3188 12.5292 23.3482 14.7429 21.7903 15.3094L17.0383 17.037L15.3108 21.7889L15.2531 21.9305C14.6286 23.2985 12.6473 23.2718 12.0598 21.8875L12.0061 21.745L8.2424 10.4549ZM10.219 8.95297C9.43731 8.69254 8.69388 9.43597 8.95432 10.2176L12.717 21.5077C13.0167 22.406 14.2818 22.4233 14.6057 21.5331L16.3332 16.7811L16.3664 16.7049C16.4515 16.5328 16.6 16.3982 16.7824 16.3319L21.5344 14.6043C22.4247 14.2805 22.4074 13.0153 21.509 12.7157L10.219 8.95297Z" fill="url(#dq_shine)"></path><defs><linearGradient id="dq_bg" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(87,87,87,1)"></stop><stop offset="1" stop-color="rgba(21,21,21,1)"></stop></linearGradient><linearGradient id="dq_glass" x1="8.665" y1="8.664" x2="18.672" y2="18.67" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(227,227,229,0.6)"></stop><stop offset="1" stop-color="rgba(187,187,192,0.6)"></stop></linearGradient><linearGradient id="dq_shine" x1="15.546" y1="8.148" x2="15.546" y2="16.715" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(255,255,255,1)"></stop><stop offset="1" stop-color="rgba(255,255,255,0)"></stop></linearGradient><filter id="dq_blur" x="-100%" y="-100%" width="400%" height="400%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2" in="SourceGraphic" edgeMode="none"></feGaussianBlur></filter><clipPath id="dq_cp"><path d="M8.24247 10.4549C7.78665 9.087 9.08838 7.78527 10.4563 8.24109L21.7466 12.0045C23.319 12.529 23.3487 14.7428 21.7907 15.3094L17.0385 17.0371L15.3108 21.7894C14.7442 23.3473 12.5304 23.3177 12.0059 21.7452L8.24247 10.4549Z"></path></clipPath><mask id="dq_mask"><rect width="100%" height="100%" fill="#FFF"></rect><path d="M8.24247 10.4549C7.78665 9.087 9.08838 7.78527 10.4563 8.24109L21.7466 12.0045C23.319 12.529 23.3487 14.7428 21.7907 15.3094L17.0385 17.0371L15.3108 21.7894C14.7442 23.3473 12.5304 23.3177 12.0059 21.7452L8.24247 10.4549Z" fill="#000"></path></mask></defs></g></svg>`;

    const CSVG = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none"><path d="M12 19.5C12.5522 19.5001 13 19.9478 13 20.5V23C13 23.5522 12.5522 23.9999 12 24C11.4477 24 11 23.5523 11 23V20.5C11 19.9477 11.4477 19.5 12 19.5ZM12 6.5C15.0376 6.5 17.5 8.96243 17.5 12C17.5 15.0375 15.0375 17.5 12 17.5C8.96245 17.5 6.50003 15.0375 6.5 12C6.5 8.96243 8.96243 6.5 12 6.5ZM3.60742 11C4.11155 11.0513 4.50488 11.4774 4.50488 11.9951C4.50482 12.5127 4.11152 12.9389 3.60742 12.9902L3.50488 12.9951H1.00488C0.452639 12.9951 0.00494878 12.5473 0.00488281 11.9951C0.00488281 11.4428 0.452598 10.9951 1.00488 10.9951H3.50488L3.60742 11ZM23.1074 11C23.6115 11.0513 24.0049 11.4774 24.0049 11.9951C24.0048 12.5127 23.6115 12.9389 23.1074 12.9902L23.0049 12.9951H20.5049C19.9526 12.9951 19.5049 12.5473 19.5049 11.9951C19.5049 11.4428 19.9526 10.9951 20.5049 10.9951H23.0049L23.1074 11ZM12 0C12.5522 6.59659e-05 13 0.447756 13 1V3.5C13 4.05224 12.5522 4.49993 12 4.5C11.4477 4.5 11 4.05228 11 3.5V1C11 0.447715 11.4477 0 12 0Z" fill="url(#csvg_parts)" mask="url(#csvg_mask)"></path><path d="M12 19.5C12.5522 19.5001 13 19.9478 13 20.5V23C13 23.5522 12.5522 23.9999 12 24C11.4477 24 11 23.5523 11 23V20.5C11 19.9477 11.4477 19.5 12 19.5ZM12 6.5C15.0376 6.5 17.5 8.96243 17.5 12C17.5 15.0375 15.0375 17.5 12 17.5C8.96245 17.5 6.50003 15.0375 6.5 12C6.5 8.96243 8.96243 6.5 12 6.5ZM3.60742 11C4.11155 11.0513 4.50488 11.4774 4.50488 11.9951C4.50482 12.5127 4.11152 12.9389 3.60742 12.9902L3.50488 12.9951H1.00488C0.452639 12.9951 0.00494878 12.5473 0.00488281 11.9951C0.00488281 11.4428 0.452598 10.9951 1.00488 10.9951H3.50488L3.60742 11ZM23.1074 11C23.6115 11.0513 24.0049 11.4774 24.0049 11.9951C24.0048 12.5127 23.6115 12.9389 23.1074 12.9902L23.0049 12.9951H20.5049C19.9526 12.9951 19.5049 12.5473 19.5049 11.9951C19.5049 11.4428 19.9526 10.9951 20.5049 10.9951H23.0049L23.1074 11ZM12 0C12.5522 6.59659e-05 13 0.447756 13 1V3.5C13 4.05224 12.5522 4.49993 12 4.5C11.4477 4.5 11 4.05228 11 3.5V1C11 0.447715 11.4477 0 12 0Z" fill="url(#csvg_parts)" filter="url(#csvg_blur)" clip-path="url(#csvg_cp)"></path><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8Z" fill="url(#csvg_glass)"></path><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75Z" fill="url(#csvg_shine)"></path><defs><linearGradient id="csvg_parts" x1="12.005" y1="0" x2="12.005" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(87,87,87,1)"></stop><stop offset="1" stop-color="rgba(21,21,21,1)"></stop></linearGradient><linearGradient id="csvg_glass" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(227,227,229,0.6)"></stop><stop offset="1" stop-color="rgba(187,187,192,0.6)"></stop></linearGradient><linearGradient id="csvg_shine" x1="12" y1="2" x2="12" y2="13.582" gradientUnits="userSpaceOnUse"><stop stop-color="rgba(255,255,255,1)"></stop><stop offset="1" stop-color="rgba(255,255,255,0)"></stop></linearGradient><filter id="csvg_blur" x="-100%" y="-100%" width="400%" height="400%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2" in="SourceGraphic" edgeMode="none"></feGaussianBlur></filter><clipPath id="csvg_cp"><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8Z"></path></clipPath><mask id="csvg_mask"><rect width="100%" height="100%" fill="#FFF"></rect><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8Z" fill="#000"></path></mask></defs></g></svg>`;

    let cMode = '';
    // Icon offset baked into the position transform so movement stays on the
    // compositor (GPU) instead of triggering layout via left/top.
    let curOffX = -8, curOffY = -9;
    function setCursor(mode) {
      if (!useFinePointer || !cursorEl) return;
      if (mode === cMode) return;
      cMode = mode;
      cursorEl.innerHTML = mode === 'cross' ? CSVG : PSVG;
      curOffX = mode === 'cross' ? -12 : -8;
      curOffY = mode === 'cross' ? -12 : -9;
    }
    if (useFinePointer) {
      setCursor('pointer');
      cursorEl.style.transform = 'translate3d(-100px,-100px,0)';
    }

    /* ── State ── */
    let mx = -300, my = -300, animating = false;

    document.addEventListener('themeblend', e => {
      const b = e.detail?.blend;
      if (typeof b === 'number' && Number.isFinite(b)) {
        setGridDotBlend(b);
        if (gridLogicalW) drawGrid(ctx, gridLogicalW, gridLogicalH, performance.now());
      }
    });

    new MutationObserver(() => {
      readGridDotRgb();
      if (gridLogicalW) drawGrid(ctx, gridLogicalW, gridLogicalH, performance.now());
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /* ── Mouse (custom cursor follows pointer on fine-pointer devices only) ── */
    if (useFinePointer && cursorEl) {
      let curTarget = null, curRaf = false;
      function flushCursor() {
        curRaf = false;
        if (curTarget) {
          const inter = curTarget.closest('button,a,input,select,[role=button]');
          setCursor(inter ? 'cross' : 'pointer');
        }
        cursorEl.style.transform =
          'translate3d(' + (mx + curOffX) + 'px,' + (my + curOffY) + 'px,0)';
        cursorEl.style.opacity = '1';
      }
      document.addEventListener('mousemove', e => {
        mx = e.clientX; my = e.clientY;
        curTarget = e.target;
        if (!curRaf) { curRaf = true; requestAnimationFrame(flushCursor); }
      }, { passive: true });

      document.addEventListener('mouseleave', () => { cursorEl.style.opacity = '0'; });
      document.addEventListener('mouseenter', () => { cursorEl.style.opacity = '1'; });
    }

    /* ── Animation loop ── */
    // The clock hands ease across the whole minute, so the field is always
    // (slowly) in motion. Cap to ~30fps — imperceptible at these speeds — and
    // keep ripples, which move fast, at the full frame rate.
    const AMBIENT_FRAME_MS = 1000 / 30;
    let lastDrawTs = 0;

    function startAnim() {
      if (animating) return;
      animating = true;
      requestAnimationFrame(tick);
    }

    function tick(ts) {
      ripples = ripples.filter(r => ts - r.t0 < RPDUR);
      const ripplesActive = ripples.length > 0;
      refreshMinute(Date.now());
      if (ripplesActive || ts - lastDrawTs >= AMBIENT_FRAME_MS) {
        lastDrawTs = ts;
        drawGrid(ctx, gridLogicalW, gridLogicalH, ts);
      }
      requestAnimationFrame(tick);
    }

    /* ── Resize ── */
    function resize() {
      gridLogicalW = innerWidth;
      gridLogicalH = innerHeight;
      gridDpr = Math.min(typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, 2.5);
      canvas.width = Math.max(1, Math.round(gridLogicalW * gridDpr));
      canvas.height = Math.max(1, Math.round(gridLogicalH * gridDpr));
      canvas.style.width = gridLogicalW + 'px';
      canvas.style.height = gridLogicalH + 'px';
      ctx.setTransform(gridDpr, 0, 0, gridDpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if (typeof ctx.imageSmoothingQuality === 'string') ctx.imageSmoothingQuality = 'high';
      readGridDotRgb();
      buildCells(gridLogicalW, gridLogicalH);
      layoutDigits(gridLogicalW, gridLogicalH);
      assignClockTargets();
      curMinute = null;
      refreshMinute(Date.now());
      updateHoleRects();
      startAnim();
    }

    /* Keep the clear zones tracking the content as it moves. */
    function refreshHoles() {
      updateHoleRects();
      if (!animating && gridLogicalW) drawGrid(ctx, gridLogicalW, gridLogicalH, performance.now());
    }
    let holeRaf = 0;
    function scheduleHoleRefresh() {
      if (holeRaf) return;
      holeRaf = requestAnimationFrame(() => { holeRaf = 0; refreshHoles(); });
    }
    window.addEventListener('scroll', scheduleHoleRefresh, { passive: true });
    new MutationObserver(scheduleHoleRefresh)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('load', refreshHoles);
    setTimeout(refreshHoles, 600);

    resize();
    window.addEventListener('resize', () => { clearTimeout(canvas._rt); canvas._rt = setTimeout(resize, 100); });

  })();
