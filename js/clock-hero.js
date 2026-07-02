(function () {

  const wrap      = document.querySelector('.clock-hero-wrap');
  const container = document.getElementById('clockHero');
  const srLive    = document.getElementById('clockHeroSr');
  if (!wrap || !container) return;

  /* ── Deterministic PRNG (same generator family as grid.js) ── */
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s ^ s >>> 15, s | 1);
      s ^= s + Math.imul(s ^ s >>> 7, s | 61);
      return ((s ^ s >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ── 3×5 clock-hand font ─────────────────────────────────────────────
     Each letter is a 3-wide × 5-tall block of dials. '1' = a lit dial.
     A lit dial spells a stroke by pointing its two hands along the stroke
     that passes through its cell; the solver below turns the on/off bitmap
     into explicit per-hand angles + reaches so the letterforms come out as
     clean, connected, rectilinear strokes on a consistent grid (rather than
     the field guessing at diagonals). Diagonal-only cells (K/N legs, D's
     soft corners, R's kick) are specified explicitly in DIAG. */
  const FONT = {
    A: ['111', '101', '111', '101', '101'],
    C: ['111', '100', '100', '100', '111'],
    D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '111', '100', '111'],
    G: ['111', '100', '101', '101', '111'],
    H: ['101', '101', '111', '101', '101'],
    I: ['111', '010', '010', '010', '111'],
    K: ['100', '110', '100', '110', '100'],
    L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '101', '101', '101'],
    N: ['101', '101', '111', '101', '101'],
    O: ['111', '101', '101', '101', '111'],
    P: ['111', '101', '111', '100', '100'],
    R: ['111', '101', '111', '110', '101'],
    S: ['111', '100', '111', '001', '111'],
    T: ['111', '010', '010', '010', '010'],
    U: ['101', '101', '101', '101', '111'],
    Y: ['000', '010', '010', '010', '010'],
  };

  /* Explicit diagonal cells — override the orthogonal solver for a specific
     letter-local cell. Value: [[angleA, reachA], [angleB, reachB]] where a
     reach of 1.0 spans one full cell (to the next dial's centre). Every
     diagonal runs centre-to-centre so its endpoints land exactly on the dials
     it joins: a 45° cell-diagonal needs reach √2 (1.4142), half of one is
     0.7071, and a 1-across/2-down slash needs √5 (2.2361) at
     atan(1/2) = 26.565° off vertical. */
  const DIAG = {
    // D: 45° chamfers joining the top/bottom bars to the right stem's ends.
    D: { '0,1': [[270, 0.5], [135, 1.4142]], '4,1': [[270, 0.5], [45, 1.4142]] },
    // K: legs run corner-to-corner through the arm cells into the stem at (2,0).
    K: { '1,1': [[45, 1.4142], [225, 1.4142]], '3,1': [[135, 1.4142], [315, 1.4142]] },
    // M: the centre cell forks up into both stem tops (same technique as Y's
    // fork, mirrored) instead of running a flat cross-bar — without this it
    // reads as an H with a high bar rather than an M.
    M: { '1,1': [[315, 1.4142], [45, 1.4142]] },
    // N: one full-height slash from the top of the left stem to the foot of
    // the right stem — it passes exactly through this centre cell.
    N: { '2,1': [[153.435, 2.2361], [333.435, 2.2361]] },
    // R: 45° leg from the stem/bowl junction at (2,0) to the baseline corner,
    // split across the two cells it passes through (they meet at a cell edge).
    R: { '3,1': [[315, 1.4142], [135, 0.7071]], '4,2': [[315, 0.7071], [315, 0.7071]] },
    // Y: two 45° arms fork from the stem's top cell out to the (unlit) top
    // corners — same corner-to-empty-corner technique as K's legs. The cell
    // just below bridges fully up into the fork point so the stem reads as
    // continuous from the fork down to the baseline.
    Y: { '1,1': [[315, 1.4142], [45, 1.4142]], '2,1': [[0, 1.0], [180, 0.5]] },
  };

  const LETTER_W = 3;
  const LETTER_H = 5;
  const LETTER_GAP = 1; // columns between letters
  const LINE_GAP = 2;   // rows between the two word lines
  const OVERREACH = 1.0; // dead-end arms run exactly to the junction dial's centre; round caps close the join

  const PHRASES = [
    ['PRODUCT', 'DESIGNER'],
    ['DIGITAL', 'TINKERER'],
    ['SYSTEMS', 'THINKER'],
  ];

  /* ── Choreography (ms / deg) ──
     Hands only ever rotate FORWARD (like real clock motors). Each phrase
     change sweeps the field left→right, every hand decelerating into its
     letterform; the phrase then holds long enough to read while the off
     dials keep up a slow ambient sway (matching the background's pendulum
     slashes), so the field never fully freezes. */
  const SWEEP_MS        = 3400;  // base per-dial sweep duration
  const SWEEP_JITTER_MS = 1000;  // per-dial extra duration (seeded random)
  const COL_STAGGER_MS  = 42;    // left→right assembly wave
  const DIAL_JITTER_MS  = 320;   // per-dial start scatter
  const DWELL_MS        = 4600;  // readable hold after the last dial lands
  const REDUCED_SWAP_MS = 9000;  // reduced-motion: instant swap cadence
  const MIN_TRAVEL_DEG  = 150;   // never a tiny nudge — always a real sweep
  const SWAY_RAMP_MS    = 2600;  // sway eases in after a dial settles

  /* ── Field texture ──
     The dial lattice pitch locks to the background grid (SP in grid.js) so
     dial marks land exactly where background marks would; off dials get
     seeded lengths/alphas drawn from the same ranges as the background's
     slashes, so at rest the matrix is statistically the background. */
  const BG_SP      = 28;    // must match SP in js/grid.js
  const REST_W     = 1.25;  // must match the slash lineWidth in js/grid.js
  const LIT_ALPHA  = 0.92;
  // Pixel length of a lit hand for a given reach (in cells). Strokes are cut
  // exactly centre-to-centre; the round lineCap adds the half-width bulge that
  // fuses abutting segments, so no overlap fudge is added (it would push
  // every terminal past the shared cap height / baseline).
  function handLen(reach) { return reach * pitch; }
  function litWidth(p) { return Math.max(1.8, p * 0.095); }

  const MAX_WORD_LEN = PHRASES.reduce(
    (m, [w1, w2]) => Math.max(m, w1.length, w2.length), 0
  );
  // Minimum columns the widest phrase needs. The actual dial field (`cols`)
  // is wider — it spans the whole viewport so it reads as a seamless slab of
  // the background, with the words lit and centred inside it.
  const LETTER_COLS = MAX_WORD_LEN * LETTER_W + (MAX_WORD_LEN - 1) * LETTER_GAP;
  const ROWS = LETTER_H * 2 + LINE_GAP;
  let cols = LETTER_COLS; // set per-layout to the full-width column count

  const prefersReducedMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Glyph → hand-angle solver ──────────────────────────────────────
     Orthogonal-first: a lit cell connects to its up/down/left/right lit
     neighbours only. The two hands trace the stroke through the cell —
     a straight through-line, an L-corner, or (at a T/cross junction) the
     main spine. Arm cells that dead-end into a junction bridge into it so
     the join closes; free terminals stop at their own centre so every glyph
     shares one exact bounding box (2×4 cells, centre-to-centre) — bars,
     stems and diagonals all end on the same cap line and baseline.
     Diagonals are never inferred — they're opt-in via DIAG — which is what
     keeps the letters clean and consistent. */
  const ODIRS = [
    { dr: -1, dc: 0, a: 0 }, { dr: 0, dc: 1, a: 90 },
    { dr: 1, dc: 0, a: 180 }, { dr: 0, dc: -1, a: 270 },
  ];

  function neighbors(on, r, c) {
    const out = [];
    for (const d of ODIRS) {
      const rr = r + d.dr, cc = c + d.dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < cols && on[rr][cc]) out.push(d);
    }
    return out;
  }
  function degree(on, r, c) { return neighbors(on, r, c).length; }

  function solveCell(on, r, c) {
    const ns = neighbors(on, r, c);
    const isJunc = (rr, cc) =>
      rr >= 0 && rr < ROWS && cc >= 0 && cc < cols && on[rr][cc] && degree(on, rr, cc) >= 3;
    if (ns.length === 0) return [[0, 0.5], [180, 0.5]]; // lone dot → tiny vertical tick
    if (ns.length === 1) {
      const d = ns[0];
      // Dead-ends into a junction bridge into it; free terminals stop AT the
      // cell centre (both hands fold toward the neighbour) so stem tips never
      // poke past the cap height / baseline that the bars establish.
      if (isJunc(r + d.dr, c + d.dc)) return [[d.a, OVERREACH], [d.a, 0.5]];
      return [[d.a, 0.5], [d.a, 0.5]];
    }
    const opp = [];
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++)
        if (Math.abs(ns[i].a - ns[j].a) === 180) opp.push([ns[i], ns[j]]);
    if (ns.length === 2) {
      const pair = opp.length ? opp[0] : ns;
      const reach = (d) => isJunc(r + d.dr, c + d.dc) ? OVERREACH : 0.5;
      return [[pair[0].a, reach(pair[0])], [pair[1].a, reach(pair[1])]];
    }
    // Junction: keep the spine (a through pair when one exists) continuous;
    // the arms connect from their own cells via the dead-end overreach above.
    const pair = opp.length ? opp[0] : [ns[0], ns[1]];
    return [[pair[0].a, 0.5], [pair[1].a, 0.5]];
  }

  function stampWord(on, owner, word, rowOffset) {
    const wordCols = word.length * LETTER_W + (word.length - 1) * LETTER_GAP;
    const startCol = Math.max(0, Math.floor((cols - wordCols) / 2));
    for (let i = 0; i < word.length; i++) {
      const glyph = FONT[word[i]];
      if (!glyph) continue;
      const colBase = startCol + i * (LETTER_W + LETTER_GAP);
      for (let r = 0; r < LETTER_H; r++) {
        for (let c = 0; c < LETTER_W; c++) {
          if (glyph[r][c] !== '1') continue;
          on[rowOffset + r][colBase + c] = true;
          owner[rowOffset + r][colBase + c] = [word[i], r, c];
        }
      }
    }
  }

  // grid[r][c] = null (off) | [[angleA, reachA], [angleB, reachB]] (lit)
  const angleCache = [];
  function phraseAngles(idx) {
    if (angleCache[idx]) return angleCache[idx];
    const on = Array.from({ length: ROWS }, () => new Array(cols).fill(false));
    const owner = Array.from({ length: ROWS }, () => new Array(cols).fill(null));
    stampWord(on, owner, PHRASES[idx][0], 0);
    stampWord(on, owner, PHRASES[idx][1], LETTER_H + LINE_GAP);
    const out = Array.from({ length: ROWS }, () => new Array(cols).fill(null));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        if (!on[r][c]) continue;
        const o = owner[r][c];
        const diag = o && DIAG[o[0]] && DIAG[o[0]][o[1] + ',' + o[2]];
        out[r][c] = diag || solveCell(on, r, c);
      }
    }
    angleCache[idx] = out;
    return out;
  }

  /* ── Dial field state ───────────────────────────────────────────── */

  let canvas = null, ctx = null;
  const dials = [];
  let pitch = BG_SP, W = 0, H = 0;
  let enabled = false, raf = 0, reducedTimer = null;
  let phraseIdx = -1, dwellUntil = 0, activeUntil = 0, pausedAt = 0, lastDraw = 0;

  function ensureField() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    container.appendChild(canvas);
  }

  // (Re)build the dial lattice for a given column count. The field spans the
  // whole viewport, so `cols` changes with the window; rebuilding re-seeds from
  // the same constant, so the resting texture is stable across resizes.
  function buildField(newCols) {
    cols = newCols;
    dials.length = 0;
    angleCache.length = 0;
    const seed = prng(8675309);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const rest = (r + c) % 2 === 0 ? 45 : 135;
        // At rest a dial is NOT a clock — it's an ordinary background mark, so
        // the field is statistically identical to grid.js's dot/square/slash
        // mix (same probabilities, sizes, alpha). Only when a dial lights does
        // it grow hands. That's what dissolves the old rectangular "patch": the
        // resting matrix simply IS the background, and letters bloom out of it.
        const rv = seed();
        const restType = rv < 0.50 ? 0 : rv < 0.78 ? 1 : 2; // 0 dot, 1 sq, 2 slash
        const dial = {
          r, c, lit: false, restType, restAngle: rest,
          restAlpha: (0.20 + seed() * 0.12) * 0.9,      // grid.js alpha range
          restDotSz: 0.8 + seed() * 0.7,                // grid.js dot size
          restSqSz:  1.6 + seed() * 1.0,                // grid.js square size
          restLenBase: 2.6 + seed() * 2.3,              // grid.js slash half-extent
          swayAmp: 10 + seed() * 13,
          swayW: 2 * Math.PI / (14000 + seed() * 18000),
          swayPhase: seed() * 90000,
          // Only a slash-type mark sways (like the background's pendulum
          // slashes); dots and squares sit still, so the field doesn't shimmer.
          sways: restType === 2 && seed() < 0.5,
          t0: 0, t1: 1,
          // Each hand tracks its own angle AND length (reach), so an arm can
          // overreach into a junction while its partner stays short.
          h: [
            { a: rest,       start: rest,       end: rest,       reach: 1, lenFrom: 0, lenTo: 0 },
            { a: rest + 180, start: rest + 180, end: rest + 180, reach: 1, lenFrom: 0, lenTo: 0 },
          ],
        };
        // Two independent alpha tracks cross-fade a dial between its background
        // mark (restA) and its lit clock hands (handA).
        dial.fromRA = dial.toRA = dial.restAlpha; // rest-mark alpha
        dial.fromHA = dial.toHA = 0;              // hand alpha
        dial.fromW = dial.toW = REST_W;
        dial.h[0].lenFrom = dial.h[0].lenTo = dial.restLenBase;
        dial.h[1].lenFrom = dial.h[1].lenTo = dial.restLenBase;
        dials.push(dial);
      }
    }
  }

  function layout() {
    // Pitch is chosen so the widest phrase fits the viewport (dropping to a
    // clean fraction of the 28px grid only on narrow screens). The field then
    // spans the FULL viewport width at that pitch — it's a seamless slab of the
    // background lattice, with the words lit and centred inside — so there's no
    // rectangular patch and nothing to mis-centre.
    const vw = Math.max(innerWidth || wrap.clientWidth || 0, 280);
    const availW = vw - 8;
    pitch = LETTER_COLS * BG_SP <= availW ? BG_SP
          : LETTER_COLS * (BG_SP / 2) <= availW ? BG_SP / 2
          : BG_SP / 4;
    // One cell shy of the viewport so flex-centring leaves ~½ cell each side —
    // room to absorb the grid-snap nudge below without spilling into a scrollbar.
    const fullCols = Math.max(LETTER_COLS, Math.floor(vw / pitch) - 1);
    const rebuilt = fullCols !== cols || dials.length === 0;
    if (rebuilt) buildField(fullCols);
    W = cols * pitch;
    H = ROWS * pitch;
    const dpr = Math.min(typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    container.style.transform = 'none';
    const rect = canvas.getBoundingClientRect();
    const docL = rect.left + (window.pageXOffset || 0);
    const docT = rect.top + (window.pageYOffset || 0);
    // Snap the whole lattice onto the background's 28px cells (both axes) so
    // every dial centre lands exactly on a background mark position — the
    // letters are pixel-locked to the grid. Because the field is full-width,
    // this ≤14px nudge only shifts which sliver sits at the very edges; the
    // words (centred by whole columns) stay centred.
    let dx = -(((docL % BG_SP) + BG_SP) % BG_SP);
    let dy = -(((docT % BG_SP) + BG_SP) % BG_SP);
    if (dx < -BG_SP / 2) dx += BG_SP;
    if (dy < -BG_SP / 2) dy += BG_SP;
    container.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
    refreshVisualTargets();
    // A rebuild (window crossed a width threshold) reset every dial to rest;
    // if we're mid-phrase, re-light the current words instantly on the new
    // lattice so they don't blink out, then let the loop resume sweeping.
    if (rebuilt && enabled && !prefersReducedMotion && phraseIdx >= 0) {
      applyStatic(phraseIdx);
      const now = performance.now();
      activeUntil = now;
      dwellUntil = now + DWELL_MS;
    }
  }

  function restLenAt(d) {
    return Math.max(1.1, d.restLenBase * (pitch / BG_SP));
  }

  function refreshVisualTargets() {
    const now = performance.now();
    for (const d of dials) {
      d.toW = d.lit ? litWidth(pitch) : REST_W;
      for (let h = 0; h < 2; h++) {
        const hd = d.h[h];
        hd.lenTo = d.lit ? handLen(hd.reach) : restLenAt(d);
        if (now >= d.t1) { hd.lenFrom = hd.lenTo; }
      }
      if (now >= d.t1) { d.fromW = d.toW; d.fromRA = d.toRA; d.fromHA = d.toHA; }
    }
  }

  function easeInOutCubic(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function beginTransition(ts, idx) {
    phraseIdx = idx;
    const angles = phraseAngles(idx);
    let maxEnd = ts;
    for (const d of dials) {
      const rr = prng(((d.r * cols + d.c + 1) * 2654435761) ^ ((idx + 1) * 40503));
      // Snapshot the dial mid-flight so a retarget never jumps.
      const dur = d.t1 - d.t0;
      let u = dur > 0 ? (ts - d.t0) / dur : 1;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const e = easeInOutCubic(u);
      d.fromRA = d.fromRA + (d.toRA - d.fromRA) * e;
      d.fromHA = d.fromHA + (d.toHA - d.fromHA) * e;
      d.fromW = d.fromW + (d.toW - d.fromW) * e;

      const target = angles[d.r][d.c];
      d.lit = !!target;
      let ta;
      if (target) {
        ta = target;
      } else {
        // Off dials re-aim at the ambient diagonal; the diagonal flips with
        // every phrase so even the background field turns over each cycle.
        const diag = (d.r + d.c + idx) % 2 === 0 ? 45 : 135;
        ta = [[diag, null], [(diag + 180) % 360, null]];
      }
      d.t0 = ts + d.c * COL_STAGGER_MS + rr() * DIAL_JITTER_MS;
      d.t1 = d.t0 + SWEEP_MS + rr() * SWEEP_JITTER_MS;
      if (d.t1 > maxEnd) maxEnd = d.t1;
      for (let h = 0; h < 2; h++) {
        const hd = d.h[h];
        hd.lenFrom = hd.lenFrom + (hd.lenTo - hd.lenFrom) * e;
        hd.reach = target ? ta[h][1] : 1;
        hd.lenTo = d.lit ? handLen(hd.reach) : restLenAt(d);
        hd.start = hd.a;
        let travel = (((ta[h][0] - hd.a) % 360) + 360) % 360;
        if (travel < MIN_TRAVEL_DEG) travel += 360;
        if (rr() < (d.lit ? 0.45 : 0.22)) travel += 360; // occasional extra full turn
        hd.end = hd.start + travel;
      }
      d.toRA = d.lit ? 0 : d.restAlpha;      // lit dials hide their rest mark
      d.toHA = d.lit ? LIT_ALPHA : 0;        // off dials hide their hands
      d.toW = d.lit ? litWidth(pitch) : REST_W;
    }
    activeUntil = maxEnd;
    dwellUntil = maxEnd + DWELL_MS;
    if (srLive) srLive.textContent = PHRASES[idx][0] + ' ' + PHRASES[idx][1];
  }

  function drawFrame(ts) {
    const rgb = (document.documentElement.style.getPropertyValue('--grid-mark-rgb') || '').trim() || '58,61,69';
    const scale = pitch / BG_SP;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (const d of dials) {
      const dur = d.t1 - d.t0;
      let u = dur > 0 ? (ts - d.t0) / dur : 1;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const e = easeInOutCubic(u);
      const restA = d.fromRA + (d.toRA - d.fromRA) * e;
      const handA = d.fromHA + (d.toHA - d.fromHA) * e;
      const cx = d.c * pitch + pitch / 2;
      const cy = d.r * pitch + pitch / 2;

      // ── Resting background mark (dot / square / slash) ──
      if (restA > 0.004) {
        const a = 'rgba(' + rgb + ',' + restA.toFixed(3) + ')';
        if (d.restType === 0) {
          ctx.fillStyle = a;
          ctx.beginPath();
          ctx.arc(cx, cy, d.restDotSz * scale, 0, 6.2832);
          ctx.fill();
        } else if (d.restType === 1) {
          ctx.fillStyle = a;
          const s = d.restSqSz * scale;
          ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
        } else {
          let sway = 0;
          if (d.sways && !prefersReducedMotion && u >= 1) {
            const ramp = Math.min(1, (ts - d.t1) / SWAY_RAMP_MS);
            sway = d.swayAmp * Math.sin((ts + d.swayPhase) * d.swayW) * ramp * ramp;
          }
          const rad = (d.restAngle + sway) * Math.PI / 180;
          const hl = restLenAt(d);
          ctx.strokeStyle = a;
          ctx.lineWidth = REST_W;
          ctx.beginPath();
          ctx.moveTo(cx - Math.sin(rad) * hl, cy + Math.cos(rad) * hl);
          ctx.lineTo(cx + Math.sin(rad) * hl, cy - Math.cos(rad) * hl);
          ctx.stroke();
        }
      }

      // ── Clock hands (only while lighting / lit) ──
      if (handA > 0.004) {
        const width = d.fromW + (d.toW - d.fromW) * e;
        ctx.strokeStyle = 'rgba(' + rgb + ',' + handA.toFixed(3) + ')';
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let h = 0; h < 2; h++) {
          const hd = d.h[h];
          const a = hd.start + (hd.end - hd.start) * e;
          hd.a = a;
          const len = hd.lenFrom + (hd.lenTo - hd.lenFrom) * e;
          const rad = a * Math.PI / 180;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.sin(rad) * len, cy - Math.cos(rad) * len);
        }
        ctx.stroke();
      }
    }
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (ts >= dwellUntil) beginTransition(ts, (phraseIdx + 1) % PHRASES.length);
    // Full frame rate while hands sweep; ~30fps for the ambient sway
    // (matches the background canvas's ambient cadence).
    if (ts >= activeUntil && ts - lastDraw < 33) return;
    lastDraw = ts;
    drawFrame(ts);
  }

  /* ── Reduced motion: same phrases, instant swaps, no sweeps/sway ── */
  function applyStatic(idx) {
    phraseIdx = idx;
    const angles = phraseAngles(idx);
    const now = performance.now();
    for (const d of dials) {
      const target = angles[d.r][d.c];
      d.lit = !!target;
      const diag = (d.r + d.c) % 2 === 0 ? 45 : 135;
      const ta = target || [[diag, null], [(diag + 180) % 360, null]];
      for (let h = 0; h < 2; h++) {
        const hd = d.h[h];
        hd.a = hd.start = hd.end = ta[h][0];
        hd.reach = target ? ta[h][1] : 1;
        hd.lenFrom = hd.lenTo = d.lit ? handLen(hd.reach) : restLenAt(d);
      }
      d.t0 = 0; d.t1 = 1;
      d.fromRA = d.toRA = d.lit ? 0 : d.restAlpha;
      d.fromHA = d.toHA = d.lit ? LIT_ALPHA : 0;
      d.fromW = d.toW = d.lit ? litWidth(pitch) : REST_W;
    }
    drawFrame(now);
    if (srLive) srLive.textContent = PHRASES[idx][0] + ' ' + PHRASES[idx][1];
  }

  /* ── Pause/resume (tab hidden, hero scrolled away) ──
     The timeline runs on performance.now(); shifting every dial's window by
     the paused span means motion resumes exactly where it left off instead
     of snapping to wherever the clock ran ahead to. */
  function pauseAnim() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!pausedAt) pausedAt = performance.now();
  }

  function resumeAnim() {
    if (!enabled || prefersReducedMotion || raf) return;
    if (pausedAt) {
      const dt = performance.now() - pausedAt;
      for (const d of dials) { d.t0 += dt; d.t1 += dt; }
      dwellUntil += dt;
      activeUntil += dt;
      pausedAt = 0;
    }
    raf = requestAnimationFrame(tick);
  }

  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      if (!enabled || prefersReducedMotion) return;
      if (entries[0].isIntersecting) resumeAnim();
      else pauseAnim();
    }).observe(wrap);
  }
  document.addEventListener('visibilitychange', () => {
    if (!enabled || prefersReducedMotion) return;
    if (document.hidden) pauseAnim();
    else resumeAnim();
  });

  /* ── Always on ──────────────────────────────────────────────────── */

  function enable() {
    enabled = true;
    document.body.classList.add('clock-hero-mode');
    container.hidden = false;
    container.setAttribute('aria-hidden', 'false');
    ensureField();
    layout();
    pausedAt = 0;
    if (prefersReducedMotion) {
      applyStatic(Math.max(0, phraseIdx));
      if (!reducedTimer) {
        reducedTimer = setInterval(() => {
          applyStatic((phraseIdx + 1) % PHRASES.length);
        }, REDUCED_SWAP_MS);
      }
    } else {
      dwellUntil = 0; // sweep into the next phrase from the current field
      activeUntil = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    }
  }

  let resizeT = 0;
  window.addEventListener('resize', () => {
    if (!enabled) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      layout();
      if (prefersReducedMotion && phraseIdx >= 0) applyStatic(phraseIdx);
    }, 120);
  });

  enable();

})();
