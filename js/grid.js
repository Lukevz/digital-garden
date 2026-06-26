(function () {

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

       Motion is choreographed against the wall clock, ClockClock-style: the
       hands HOLD the readable time for most of the minute, then in the final
       stretch glide to the next minute's arrangement, arriving — and easing to
       a stop — exactly as the clock rolls over. So the time is legible nearly
       all the time, with one graceful synchronised sweep per minute. */
    const REST_ANGLE = -Math.PI / 4;   // diagonal resting field ('/')
    const HOUR_12 = true;              // true = 12h (no leading zero), false = 24h HH:MM
    const HOLD_MS = 6000;              // brief readable hold at the top of each minute
    const MIN_MS = 60000;
    const GUTTER = 22;                 // px kept clear of the nav / now-bar (never touching)
    const SEG_H = 0, SEG_V = Math.PI / 2;

    // Which 7-segment segments are lit for each digit 0–9.
    //   aaa
    //  f   b
    //  f   b
    //   ggg
    //  e   c
    //  e   c
    //   ddd
    const DIGIT_SEGS = {
      0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
      5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    };

    const HAND_LEN = SP * 0.44;      // length of one clock hand (full segment line ≈ 2× this)
    const REST_ALPHA = 0.075;        // faint resting field
    const ACTIVE_ALPHA = 0.50;       // lit digit segment

    /* ── Grid of mini two-hand clocks, addressable by integer (col,row) ───
       Like ClockClock 24: every grid point is a little clock with TWO hands
       pivoting from a shared centre. A straight segment is drawn by the two
       hands pointing opposite (a full line through the centre); a resting clock
       overlaps both hands on the diagonal (a short idle tick). The two hands
       slowly rotate, splitting apart and closing, to arrange into each digit.
       Each digit is a fixed template of grid CELLS placed at integer column/row
       offsets, so every "1" is pixel-identical and neighbours line up. */
    let NX = 0, NY = 0;
    let cellGrid = [];               // cellGrid[col][row] -> clock
    function buildCells(w, h) {
      NX = Math.ceil((w + SP) / SP);
      NY = Math.ceil((h + SP) / SP);
      cells = [];
      cellGrid = [];
      for (let i = 0; i < NX; i++) {
        cellGrid[i] = [];
        for (let j = 0; j < NY; j++) {
          const cell = {
            bx: SP / 2 + i * SP, by: SP / 2 + j * SP,
            restAlpha: REST_ALPHA, activeAlpha: ACTIVE_ALPHA,
            clk: null,
            // two hands: A and B, each with this-minute (M) / next-minute (M1) target
            aAM: REST_ANGLE, aAM1: REST_ANGLE,
            aBM: REST_ANGLE, aBM1: REST_ANGLE,
            oM: REST_ALPHA, oM1: REST_ALPHA,
          };
          cellGrid[i][j] = cell;
          cells.push(cell);
        }
      }
    }

    // ── Digit template — which (col,row) cells of a DCOLS×DROWS digit form
    //    each 7-segment, and the hand orientation there. Rebuilt per layout.
    let DCOLS = 0, DROWS = 0;
    let segCells = {};
    function buildDigitTemplate(cols, rows) {
      DCOLS = cols; DROWS = rows;
      const mid = (rows - 1) >> 1;
      const hCols = [], topRows = [], botRows = [];
      for (let c = 1; c <= cols - 2; c++) hCols.push(c);
      for (let r = 1; r <= mid - 1; r++) topRows.push(r);
      for (let r = mid + 1; r <= rows - 2; r++) botRows.push(r);
      segCells = {
        a: hCols.map(c => ({ col: c, row: 0,        orient: SEG_H })),
        g: hCols.map(c => ({ col: c, row: mid,      orient: SEG_H })),
        d: hCols.map(c => ({ col: c, row: rows - 1, orient: SEG_H })),
        f: topRows.map(r => ({ col: 0,        row: r, orient: SEG_V })),
        b: topRows.map(r => ({ col: cols - 1, row: r, orient: SEG_V })),
        e: botRows.map(r => ({ col: 0,        row: r, orient: SEG_V })),
        c: botRows.map(r => ({ col: cols - 1, row: r, orient: SEG_V })),
      };
    }

    function colonCols() { return Math.max(2, Math.round(DCOLS * 0.5)); }
    const GAP_COLS = 2;              // grid columns between adjacent digits

    // Measure the gap between the top chrome and the bottom now-bar (px).
    function measureBand(w, h) {
      let top = 0;
      for (const sel of ['#modeTab', '.corner-status']) {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.height >= 1 && r.bottom > top) top = r.bottom;
        }
      }
      let bottom = h;
      for (const el of document.querySelectorAll('#nowStrip')) {
        const r = el.getBoundingClientRect();
        if (r.height < 1) continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (r.top < bottom) bottom = r.top;
      }
      return { top: top + GUTTER, bottom: bottom - GUTTER };
    }

    // Size the digit template (rows from the band height, cols condensed to fit
    // the viewport width) and find the row the digits start on. Independent of
    // how many digits show, so the size stays constant when 9 → 10 etc.
    let rowOffset = 0;
    function sizeTemplate(w, h) {
      const band = measureBand(w, h);
      const firstRow = Math.max(0, Math.ceil((band.top - SP / 2) / SP));
      const lastRow = Math.min(NY - 1, Math.floor((band.bottom - SP / 2) / SP));
      let availRows = lastRow - firstRow + 1;
      if (availRows < 7) availRows = 7;
      const rows = availRows % 2 ? availRows : availRows - 1; // odd → centred middle bar

      const sideCols = Math.max(1, Math.round(Math.min(48, w * 0.05) / SP));
      const availCols = NX - 2 * sideCols;
      let cols = Math.max(3, Math.round(rows * 0.46));
      // Always size for the widest case (4 digits) so digits don't resize when
      // the hour crosses 9→10; condense cols until HH:MM fits the width.
      while (cols > 3) {
        const cc = Math.max(2, Math.round(cols * 0.5));
        if (4 * cols + 2 * GAP_COLS + cc <= availCols) break;
        cols--;
      }
      buildDigitTemplate(cols, rows);
      rowOffset = firstRow + Math.floor((availRows - rows) / 2);
    }

    // Place N grid-aligned digits (+ colon) centred horizontally.
    let digitCols = [];
    let colon = null;
    function placeDigits(n) {
      const cc = colonCols();
      const totalCols = n * DCOLS + (n - 2) * GAP_COLS + cc;
      let col = Math.round((NX - totalCols) / 2);
      digitCols = [];
      const hourCount = n - 2;       // digits before the colon
      let colonCenterCol = 0;
      for (let d = 0; d < n; d++) {
        digitCols.push(col);
        col += DCOLS;
        if (d === hourCount - 1) { colonCenterCol = col + cc / 2; col += cc; }
        else if (d < n - 1) { col += GAP_COLS; }
      }
      const r1 = rowOffset + Math.round(DROWS * 0.34);
      const r2 = rowOffset + Math.round(DROWS * 0.66);
      colon = {
        cx: SP / 2 + colonCenterCol * SP,
        y1: SP / 2 + r1 * SP, y2: SP / 2 + r2 * SP,
        r: Math.max(1.8, SP * 0.1),
      };
    }

    // Stamp the current digit layout onto the grid: every segment cell of every
    // placed digit claims its hand. Cleared first, so unused hands rest.
    function assignClockTargets() {
      for (const cl of cells) cl.clk = null;
      for (let d = 0; d < digitCols.length; d++) {
        const c0 = digitCols[d];
        for (const seg in segCells) {
          for (const sc of segCells[seg]) {
            const gi = c0 + sc.col, gj = rowOffset + sc.row;
            if (gi >= 0 && gi < NX && gj >= 0 && gj < NY) {
              cellGrid[gi][gj].clk = { digit: d, seg, orient: sc.orient };
            }
          }
        }
      }
    }

    // The digits to display: 3 cells (H:MM) for a single-digit 12h hour, else 4.
    function displayDigits(ms) {
      const d = new Date(ms);
      let h = d.getHours();
      const m = d.getMinutes();
      const mt = Math.floor(m / 10), mu = m % 10;
      if (HOUR_12) {
        h = h % 12; if (h === 0) h = 12;
        return h < 10 ? [h, mt, mu] : [1, h % 10, mt, mu];
      }
      return [Math.floor(h / 10), h % 10, mt, mu];
    }

    // Compute both hands' target angles + alpha for a given minute, stashed on
    // `key` ('M' = current minute, 'M1' = next minute). A lit horizontal segment
    // points the hands left/right, a vertical one up/down (a full line through
    // the centre); a resting clock overlaps both hands on the diagonal.
    function computeArrangement(ms, key) {
      const digits = displayDigits(ms);
      for (const cl of cells) {
        let aA = REST_ANGLE, aB = REST_ANGLE, active = false;
        if (cl.clk) {
          const dv = digits[cl.clk.digit];
          if (dv != null && DIGIT_SEGS[dv].indexOf(cl.clk.seg) !== -1) {
            active = true;
            if (cl.clk.orient === SEG_H) { aA = 0; aB = Math.PI; }            // ← →
            else { aA = Math.PI / 2; aB = -Math.PI / 2; }                     // ↑ ↓
          }
        }
        cl['aA' + key] = aA;
        cl['aB' + key] = aB;
        cl['o' + key] = active ? cl.activeAlpha : cl.restAlpha;
      }
    }

    let curMinute = null, laidOutN = 0;
    function refreshMinute(now) {
      const idx = Math.floor(now / MIN_MS);
      if (idx === curMinute) return;
      curMinute = idx;
      const nCur = displayDigits(idx * MIN_MS).length;
      if (nCur !== laidOutN) { placeDigits(nCur); assignClockTargets(); laidOutN = nCur; }
      computeArrangement(idx * MIN_MS, 'M');
      const nNext = displayDigits((idx + 1) * MIN_MS).length;
      if (nNext === nCur) computeArrangement((idx + 1) * MIN_MS, 'M1');
      // Count change (9→10, 12→1) twice a day: just snap at the rollover.
      else for (const cl of cells) { cl.aAM1 = cl.aAM; cl.aBM1 = cl.aBM; cl.oM1 = cl.oM; }
    }

    // Hold the readable time briefly at the top of the minute, then move slowly
    // and directly toward the next minute's arrangement over the rest of it,
    // easing to a stop exactly as the clock rolls over — never past the target.
    function minuteEase(now) {
      const into = now % MIN_MS;
      if (into <= HOLD_MS) return 0;
      const t = (into - HOLD_MS) / (MIN_MS - HOLD_MS);
      return t * t * (3 - 2 * t); // smoothstep — eases out into the next hold
    }

    // Shortest-path interpolation for a directed hand (period = 2*PI).
    function lerpHand(a, b, t) {
      let d = (b - a) % (2 * Math.PI);
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      return a + d * t;
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
      // Pattern-preview mode hides the content, so don't punch any holes —
      // show the field unobstructed.
      if (document.body.classList.contains('pattern-preview')) { holeRects = []; return; }
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
      c.lineWidth = 1.4;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (const cl of cells) {
        if (cl.bx > w + SP || cl.by > h + SP) continue;
        const [x, y] = applyRipples(cl.bx, cl.by, ts);

        // Lit digit segments keep a faint floor *through* the content so the
        // big clock reads as a continuous shadow/watermark behind it; the
        // resting field still clears fully so text stays clean.
        const lit = cl.oM > cl.restAlpha * 1.5 || cl.oM1 > cl.restAlpha * 1.5;
        const hf = holeFade(x, y);
        const eff = lit ? 0.30 + 0.70 * hf : hf;
        const alpha = (cl.oM + (cl.oM1 - cl.oM) * eased) * eff;
        if (alpha < 0.004) continue;

        // The two hands each rotate the short way toward their target — so the
        // clock arranges into the digit and stops there, never spinning past.
        const aA = lerpHand(cl.aAM, cl.aAM1, eased);
        const aB = lerpHand(cl.aBM, cl.aBM1, eased);
        c.strokeStyle = `rgba(${gridDotRgb},${alpha})`;
        // Both hands in one stroke so an overlapping (resting) clock doesn't
        // double its alpha.
        c.beginPath();
        c.moveTo(x, y); c.lineTo(x + Math.cos(aA) * HAND_LEN, y + Math.sin(aA) * HAND_LEN);
        c.moveTo(x, y); c.lineTo(x + Math.cos(aB) * HAND_LEN, y + Math.sin(aB) * HAND_LEN);
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
      relayoutClock();
      updateHoleRects();
      startAnim();
    }

    // Re-measure the chrome band, re-size the digit template, and re-stamp the
    // current time onto the grid. Used on resize and on structural changes.
    function relayoutClock() {
      if (!gridLogicalW) return;
      sizeTemplate(gridLogicalW, gridLogicalH);
      laidOutN = 0;       // force placeDigits + assignClockTargets on refresh
      curMinute = null;   // force re-stamp of the current minute
      refreshMinute(Date.now());
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
    // Structural changes (mode switch shows/hides the now-bar, async now-bar
    // load, font settling) move the chrome the digits size themselves against —
    // re-measure the digit band, then refresh the holes.
    function refreshStructure() {
      if (!gridLogicalW) return;
      relayoutClock();
      refreshHoles();
    }
    let structRaf = 0;
    function scheduleStructureRefresh() {
      if (structRaf) return;
      structRaf = requestAnimationFrame(() => { structRaf = 0; refreshStructure(); });
    }
    window.addEventListener('scroll', scheduleHoleRefresh, { passive: true });
    new MutationObserver(scheduleStructureRefresh)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('load', refreshStructure);
    setTimeout(refreshStructure, 600);
    setTimeout(refreshStructure, 1800); // after the now-bar's split-flap load settles

    /* ── Pattern-preview toggle ──────────────────────────────────────
       Hides the body content and drops the hole-punch so the bare clock
       field can be inspected. The body-class observer above re-runs the
       hole + layout refresh automatically when the class flips. */
    const peekBtn = document.getElementById('patternPeek');
    if (peekBtn) {
      peekBtn.addEventListener('click', () => {
        const on = document.body.classList.toggle('pattern-preview');
        peekBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        peekBtn.title = on ? 'Show content' : 'Preview pattern (hide content)';
      });
    }

    resize();
    window.addEventListener('resize', () => { clearTimeout(canvas._rt); canvas._rt = setTimeout(resize, 100); });

  })();
