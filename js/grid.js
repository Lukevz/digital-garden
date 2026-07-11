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
    // ── Starfield lattice ──
    // A uniform, centred grid of 4-point sparkles (a "star chart"), with a
    // Death Star top-left and Tatooine-style twin suns on the right. Deep-space
    // palette (pale stars on a dark sky) per the reference; celestial bodies and
    // a fraction of stars breathe subtly. The pitch also drives the content
    // hole-clearing reach below.
    const SP = 40;                    // star pitch (uniform) — denser field
    const STAR_R = SP * 0.085;        // base star radius — small crisp points
    // Stars take the theme-aware grid mark colour (see gridDotRgb below): dark
    // marks on a light sky, pale marks on a dark sky.
    // Convert #rrggbb → rgba() with alpha.
    function hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    let bodies = null; // { deathStar, sunBig, sunSmall } — set per layout
    const useFinePointer = typeof matchMedia !== 'undefined' &&
      matchMedia('(hover: hover) and (pointer: fine)').matches;
    // Respect the user's reduced-motion preference: keep the dot grid static
    // (no ambient breathing/rotation) for those who ask for less motion.
    const prefersReducedMotion = typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cells = [];

    const GRID_RGB_LIGHT = [58, 61, 69];
    const GRID_RGB_DARK = [178, 186, 202];
    let gridDotRgb = '58,61,69';
    // 1 = dark (constellation as authored), 0 = light (half-turned sky). The
    // theme wipe ramps this 0↔1, so the celestial swing animates with it.
    let themeBlend = 1;
    let bodyPivot = { cx: 0, cy: 0 }; // centre the sky rotates about
    let frameBodies = null;           // per-frame rotated body positions

    function setGridDotBlend(blend) {
      const t = Math.max(0, Math.min(1, blend));
      themeBlend = t;
      const r = Math.round(GRID_RGB_LIGHT[0] + (GRID_RGB_DARK[0] - GRID_RGB_LIGHT[0]) * t);
      const g = Math.round(GRID_RGB_LIGHT[1] + (GRID_RGB_DARK[1] - GRID_RGB_LIGHT[1]) * t);
      const b = Math.round(GRID_RGB_LIGHT[2] + (GRID_RGB_DARK[2] - GRID_RGB_LIGHT[2]) * t);
      gridDotRgb = `${r},${g},${b}`;
      // Expose the exact grid mark color as a CSS var so DOM-based effects
      // (e.g. the clock-dial hero) can visually match the canvas pattern.
      document.documentElement.style.setProperty('--grid-mark-rgb', gridDotRgb);
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

    let ambientAnim = false;

    // Anchor the twin suns and Death Star relative to the viewport (snapped to
    // the lattice so they nestle among the stars rather than floating off-grid).
    function buildBodies(w, h) {
      const sunBig = { cx: w - SP * 3.4, cy: h * 0.66, r: SP * 0.95 };
      bodies = {
        deathStar: { cx: SP * 2.8, cy: SP * 2.8, r: SP * 0.66 },
        sunBig,
        sunSmall: { cx: sunBig.cx - SP * 1.9, cy: sunBig.cy - SP * 2.15, r: SP * 0.42 },
      };
      // Pivot sits above the viewport midline so the bodies swung in from the
      // far side land tucked up toward the top corners (matching how the moon
      // nestles into the top-left in dark mode) rather than sagging low.
      bodyPivot = { cx: w / 2, cy: h * 0.42 };
    }

    // Snappy ease for the celestial swing: near-flat and slow at both ends, a
    // fast whip through the middle — reads as a slow wind-up, an abrupt spin,
    // then a soft landing. Symmetric, so it mirrors cleanly on the way back.
    function easeInOutExpo(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return x < 0.5
        ? Math.pow(2, 20 * x - 10) / 2
        : (2 - Math.pow(2, -20 * x + 10)) / 2;
    }

    // The night sky rotates a half-turn between themes. In dark mode the bodies
    // sit where they're authored (moon top-left, twin suns lower-right); as the
    // theme wipes to light the whole constellation swings 180° about the
    // viewport centre — the big sun rises over the top to the upper-left, the
    // smaller sun trails down-and-right of it, and the moon sets toward the
    // bottom-right. The negative angle sweeps the right-side suns up over the
    // top (a sunrise arc) rather than down under. themeBlend drives the swing
    // (1 = dark/authored, 0 = light/half-turned), so it animates with the
    // toggle at no extra cost.
    function computeFrameBodies() {
      if (!bodies) return null;
      // Ease the swing fraction (0 dark → 1 light) rather than the raw blend, so
      // the rotation whips through the middle and settles slowly at each end.
      const a = -easeInOutExpo(1 - themeBlend) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const out = {};
      for (const key in bodies) {
        const b = bodies[key];
        const dx = b.cx - bodyPivot.cx, dy = b.cy - bodyPivot.cy;
        out[key] = {
          cx: bodyPivot.cx + dx * ca - dy * sa,
          cy: bodyPivot.cy + dx * sa + dy * ca,
          r: b.r,
        };
      }
      return out;
    }

    // Is a cell centre covered by any body at its current (rotated) position?
    // Tested per-frame in the draw loop so the cleared disc follows the swing.
    function cellUnderBody(bx, by, fb) {
      for (const key in fb) {
        const b = fb[key];
        const clearR = b.r + SP * 0.5;
        const dx = bx - b.cx, dy = by - b.cy;
        if (dx * dx + dy * dy <= clearR * clearR) return true;
      }
      return false;
    }

    function buildCells(w, h) {
      const r = prng(8675309);
      cells = [];
      // Uniform, centred lattice so the field reads as a symmetric star chart:
      // whole columns/rows fill the viewport with equal margins on each side.
      // Carry one extra ring vs. what fits with a half-cell margin so the
      // outermost dots sit ~one pitch from the edge — i.e. the gap to the
      // viewport edge matches the gap between dots, instead of the wider
      // (~1.5·pitch) inset the half-cell centring used to leave.
      const cols = Math.max(1, Math.round(w / SP));
      const rows = Math.max(1, Math.round(h / SP));
      const offX = (w - cols * SP) / 2;
      const offY = (h - rows * SP) / 2;
      // The outermost ring hugs the very edge (reads as the margin), so the
      // first *visible* row is one pitch in. Expose its Y so fixed UI (the top
      // bar) can centre on it — keeping the clock/weather + icons on the first
      // star row. Recomputed here on every (re)build, i.e. on resize.
      let firstRowY = offY;
      while (firstRowY < SP * 0.5) firstRowY += SP;
      document.documentElement.style.setProperty('--grid-first-row-y', firstRowY.toFixed(1) + 'px');
      // Same for the first visible column. The lattice is centred, so the last
      // visible column is its mirror (w − inset) — the top bar uses this one
      // value to sit the clock's left edge on the left dot and the power
      // button's right edge on the right dot.
      let firstColX = offX;
      while (firstColX < SP * 0.5) firstColX += SP;
      document.documentElement.style.setProperty('--grid-col-inset', firstColX.toFixed(1) + 'px');
      for (let ci = 0; ci <= cols; ci++) {
        for (let ri = 0; ri <= rows; ri++) {
          const bx = offX + ci * SP;
          const by = offY + ri * SP;
          // Size tiers give a natural distant-starfield spread: mostly tiny
          // pinpoints, some a touch larger, a rare few brighter still.
          const t = r();
          const sz = STAR_R * (t < 0.7 ? 0.28 + r() * 0.24
                             : t < 0.93 ? 0.55 + r() * 0.3
                             :            0.9 + r() * 0.45);
          const cell = { bx, by, sz, al: 0.3 + r() * 0.24 };
          // Most stars twinkle — deep enough that they fade nearly to nothing
          // and swell back, like real stars blinking in and out.
          if (!prefersReducedMotion && r() < 0.62) {
            cell.twinkle = { phase: r() * 90000, period: 2200 + r() * 4200, depth: 0.55 + r() * 0.4 };
          }
          // A few of those get a brief bloom at their brightest instant only.
          if (cell.twinkle && r() < 0.13) cell.bright = true;
          cells.push(cell);
        }
      }
      buildBodies(w, h);
      ambientAnim = !prefersReducedMotion; // twinkle + celestial pulse
    }

    /* ── Ripples ── */
    const RPDUR = 1800, RPSPD = 180, RPAMP = 1.8;
    let ripples = [], lastRp = 0;

    /* ── Hole (content clearing) ──────────────────────────────────────
       The pattern is cleared around the on-screen content so the text and
       icons stay clean. The clearing is QUANTIZED TO THE GRID and BINARY:
       every 28px cell is either fully drawn or fully hidden — never faded.
       A cell is hidden when its 28px square overlaps any content atom (plus
       a small pad); otherwise it draws at full strength. Because whole cells
       switch off, the cleared negative space always has hard edges that run
       exactly along grid lines, and no drawn mark can overlap the body — a
       shown cell's square never touches content, and its mark stays inside
       its own square. Texture still survives in the gaps between atoms (hero
       ↔ icon row, between icons), and it adapts across modes (life launchpad
       vs work portfolio) since both reuse these atoms. */
    const HOLE_PAD = 6;   // px of breathing room added around each content atom
    // The content atoms the pattern clears around. We clear two kinds of shape:
    //   • TEXT atoms — we trace the actual rendered *lines* of text (one rect
    //     per line, via Range), not the element's bounding box, so the cleared
    //     cells follow the text silhouette and texture flows back in to the
    //     right of short lines instead of a big dead rectangle.
    //   • BOX atoms — the avatar, the launchpad icon tiles, and the case-study
    //     cards, each cleared by its bounding box.
    const TEXT_HOLE_SELECTORS = ['.intro-text', '.greet-text'];
    // .corner-status (clock + weather) and the top-right action buttons cut into
    // the field the same way — each cleared by its own box so the pattern
    // displaces around them and texture survives in the gaps between the icons.
    // Clear around each icon's 20px SVG rather than its padded button box, so an
    // icon only knocks out the one star row it sits on (the taller button box
    // would reach into the row below).
    const BOX_HOLE_SELECTORS  = ['.avatar--inline', '.app-icon', '.study-card',
                                 '.corner-status', '.topBar-actions button svg:not([hidden])'];
    // The clock-dial hero replaces background cells 1:1 (its dial lattice is
    // snapped onto this same 28px grid by js/clock-hero.js), so its cells are
    // hidden by exact center-in-rect cover — no pad, no AABB reach. The
    // surrounding texture runs right up to the dial field with no cleared
    // border, which is what lets the dials read as the background itself.
    const EXACT_HOLE_SELECTORS = ['.clock-hero'];

    let holeRects = [];

    function pushRect(out, r, exact) {
      if (r.width < 1 || r.height < 1) return; // hidden / collapsed / empty line
      out.push({
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        hw: r.width / 2,
        hh: r.height / 2,
        exact: !!exact,
      });
    }

    // Trace each rendered line of text in `el` as its own clear rect. Range
    // client rects hug the glyph run per line (including the line-box height),
    // so the clear zone follows the text silhouette rather than the block box.
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
      for (const sel of EXACT_HOLE_SELECTORS) {
        for (const el of document.querySelectorAll(sel)) pushRect(next, el.getBoundingClientRect(), true);
      }
      holeRects = next;
      computeCellMask();
    }

    // Binary per-cell mask. A cell is hidden when its 28px square overlaps any
    // content atom (padded); otherwise it draws at full strength — no fade.
    // Recomputed only when the content rects change (resize / scroll / mode
    // switch) and cached on each cell as `hidden`, so the draw loop is a single
    // boolean check. SP/2 is added to each content half-extent because the test
    // is the cell's *square* against the content rect (AABB overlap).
    function computeCellMask() {
      const reach = SP / 2 + HOLE_PAD;
      for (const cl of cells) {
        let hidden = false;
        for (const r of holeRects) {
          // Exact rects (clock hero) hide a cell only when its CENTER falls
          // inside — the dial grid replaces those cells one-for-one.
          const rx = r.exact ? 0 : reach;
          if (Math.abs(cl.bx - r.cx) <= r.hw + rx &&
              Math.abs(cl.by - r.cy) <= r.hh + rx) {
            hidden = true;
            break;
          }
        }
        // NB: stars sitting under a celestial body are cleared per-frame in
        // the draw loop (see cellUnderBody), not here — the bodies rotate with
        // the theme swing, so their cleared discs must follow them each frame.
        cl.hidden = hidden;
      }
    }

    /* ── Genie collapse ──────────────────────────────────────────────
       As you scroll off the hero, the pattern gets "sucked" toward the
       bottom-center of the glow — but NOT all at once: the bottom rows go
       first and each row above follows slightly later, so the collapse
       sweeps upward like a genie. Driven per-cell here (a single CSS
       transform on the canvas can't stagger rows). Home view only. */
    const GENIE = {
      range:   0.5,   // fraction of one viewport of scroll over which it completes
                      // (lower = warp triggers sooner, with less scrolling)
      stagger: 0.5,   // bottom→top delay spread (0 = all together, →1 = very sequential)
      scale:   0.5,   // mark shrink at full collapse (marks halve, then vanish)
      funnel:  0.25,  // horizontal migration toward center at full collapse (0..1)
      drop:    0.35,  // downward migration into the glow at full collapse (0..1)
      fade:    1.0,   // alpha falloff (1 = fully gone by the end)
    };

    function genieProgress() {
      if (prefersReducedMotion) return 0;
      const b = document.body.classList;
      if (b.contains('work-mode') || b.contains('chat-overlay-open') || b.contains('places-mode')) return 0;
      const vh = gridLogicalH || innerHeight || 1;
      const sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      const p = sy / (vh * GENIE.range);
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    /* ── Hyperspace entrance ──────────────────────────────────────────
       On first landing the field starts fully collapsed at the genie's
       vanishing point (bottom-center) and flies back out to rest — the scroll
       collapse run in reverse, so the page arrives like a ship dropping out of
       hyperspace. One-shot: it disarms itself once the stars have settled, and
       never fires if we didn't load into the home view. */
    const ENTRANCE = {
      armed: !prefersReducedMotion,
      hold:  160,    // ms held fully collapsed before release
      dur:   2100,   // ms to fly out from collapsed → resting
    };
    let entranceStart = -1;   // ts of the first frame after arming; -1 = not yet
    function entranceProgress(ts) {
      if (!ENTRANCE.armed) return 0;
      // If the page came up in another mode, the entrance would fly over the
      // wrong layout — skip it entirely rather than play it hidden.
      const b = document.body.classList;
      if (b.contains('work-mode') || b.contains('chat-overlay-open') || b.contains('places-mode')) {
        ENTRANCE.armed = false; return 0;
      }
      if (entranceStart < 0) entranceStart = ts;
      const t = ts - entranceStart - ENTRANCE.hold;
      if (t <= 0) return 1;                                 // held fully collapsed
      const p = t / ENTRANCE.dur;
      if (p >= 1) { ENTRANCE.armed = false; return 0; }     // settled — disarm
      // Smootherstep (eases in AND out) so the field glides out — no hard burst
      // at the start, a soft settle at the end.
      const e = p * p * p * (p * (p * 6 - 15) + 10);
      return 1 - e;                                          // collapse amount 1 → 0
    }

    /* ── Draw grid ── */
    function drawGrid(c, w, h, ts) {
      c.clearRect(0, 0, w, h);
      // The scroll collapse and the one-shot hyperspace entrance share the same
      // geometry, so the larger of the two drives the frame: on landing the
      // entrance holds it near 1 and eases to 0 (stars fly out); afterwards it's
      // purely scroll-driven.
      const genieP = Math.max(genieProgress(), entranceProgress(ts));
      frameBodies = computeFrameBodies();
      for (const cl of cells) {
        if (cl.hidden) continue; // grid-snapped binary hole — cell fully off
        if (cl.bx > w + SP || cl.by > h + SP) continue;
        // Clear stars under a body so it reads as a solid disc, not sparkles
        // poking through — using the body's rotated position for this frame.
        if (frameBodies && cellUnderBody(cl.bx, cl.by, frameBodies)) continue;
        let x = cl.bx, y = cl.by;
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
        // ── Genie collapse (bottom rows lead, each row above follows) ──
        let markScale = 1, genieAlpha = 1;
        if (genieP > 0) {
          const vb = h > 0 ? cl.by / h : 0;                 // 0 = top row … 1 = bottom row
          const delay = (1 - vb) * GENIE.stagger;           // bottom rows ≈ no delay
          let cp = (genieP - delay) / (1 - GENIE.stagger);
          cp = cp < 0 ? 0 : cp > 1 ? 1 : cp;
          if (cp > 0) {
            const e = cp * cp;                              // ease-in: linger, then draw in
            x += (w / 2 - x) * e * GENIE.funnel;            // migrate toward horizontal center
            y += (h - y) * e * GENIE.drop;                  // sink toward the bottom / glow
            markScale = 1 - e * (1 - GENIE.scale);
            genieAlpha = 1 - e * GENIE.fade;
            if (genieAlpha <= 0.004) continue;              // fully sucked in
          }
        }
        // ── Twinkle (opacity + size breathe) + a slow diagonal shimmer wave
        //    sweeping across the whole field, so the sky gently glimmers. ──
        let tw = 1;
        if (cl.twinkle) {
          const { phase, period, depth } = cl.twinkle;
          const u = ((ts + phase) % period) / period;
          tw = 1 - depth * (0.5 - 0.5 * Math.cos(u * 2 * Math.PI));
        }
        const shimmer = prefersReducedMotion ? 1
          : 1 + 0.07 * Math.sin((cl.bx + cl.by) * 0.006 - ts * 0.0007);
        const alpha = Math.min(1, cl.al * tw * shimmer * genieAlpha);
        if (alpha < 0.004) continue;
        const R = cl.sz * markScale;
        // Transient bloom: only near a twinkle's brightest instant does a bright
        // star flare a soft halo — it grows and vanishes with the peak, so it's
        // never a permanent border. Below the threshold there's no halo at all.
        if (cl.bright && tw > 0.74) {
          const b = (tw - 0.74) / 0.26;            // 0 → 1 across the peak
          const gr = R * (2.4 + b * 1.8);
          const g = c.createRadialGradient(x, y, R * 0.5, x, y, gr);
          g.addColorStop(0, `rgba(${gridDotRgb},${(alpha * 0.42 * b).toFixed(3)})`);
          g.addColorStop(1, `rgba(${gridDotRgb},0)`);
          c.fillStyle = g;
          c.beginPath(); c.arc(x, y, gr, 0, 6.2832); c.fill();
        }
        // The star itself is always a crisp anti-aliased point.
        c.fillStyle = `rgba(${gridDotRgb},${alpha.toFixed(3)})`;
        c.beginPath(); c.arc(x, y, R, 0, 6.2832); c.fill();
      }
      // Celestial bodies sit above the stars and fade out as the field collapses.
      if (frameBodies) drawBodies(c, ts, genieP);
      // Ship lift-offs ride above everything. Schedule the first lazily, then
      // fire on cadence — only when the moon is actually on-screen (not fading
      // out under a scroll/entrance collapse).
      if (!prefersReducedMotion) {
        if (nextLaunchTs < 0) {
          scheduleLaunch(ts);
        } else if (ts >= nextLaunchTs) {
          if (frameBodies && (1 - genieP) > 0.5) spawnLaunch(ts);
          scheduleLaunch(ts);
        }
        drawLaunches(c, ts, genieP);
      }
    }

    /* ── Celestial bodies (Death Star + Tatooine twin suns) ── */
    function drawBodies(c, ts, genieP) {
      const fb = frameBodies;
      if (!fb) return;
      const fade = 1 - genieP;
      if (fade <= 0.01) return;
      const bob = prefersReducedMotion ? 0 : Math.sin(ts / 4200) * 2;
      // Two out-of-phase shimmer signals in 0..1 so each body breathes its own way.
      const shimA = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(ts / 2600);
      const shimB = prefersReducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(ts / 3300 + 1.5);
      // Dial the bodies back so they read as distant scenery, not spotlights
      // competing with the hero copy: suns to ~55%, the (already muted) grey
      // Death Star a touch less.
      drawSun(c, fb.sunBig, '#efd23f', '#e6a028', fade * 0.55, shimA);
      drawSun(c, fb.sunSmall, '#f0a032', '#df7d1c', fade * 0.55, shimB);
      drawDeathStar(c, fb.deathStar, fade * 0.72, bob, shimB);
    }

    // Twin suns: a shaded orb whose rim feathers into the sky (no hard circle),
    // wrapped in a soft corona that breathes with the shimmer.
    function drawSun(c, b, core, edge, fade, shim) {
      const cx = b.cx, cy = b.cy, r = b.r * (1 + (shim - 0.5) * 0.04);
      c.save();
      // Outer corona that breathes in radius + intensity.
      const cr = r * (2.0 + shim * 0.5);
      const glow = c.createRadialGradient(cx, cy, r * 0.5, cx, cy, cr);
      glow.addColorStop(0, hexA(core, 0.42 * (0.62 + shim * 0.38) * fade));
      glow.addColorStop(1, hexA(core, 0));
      c.fillStyle = glow;
      c.beginPath(); c.arc(cx, cy, cr, 0, 6.2832); c.fill();
      // Disc, lit from the upper-left, feathering to transparent at the rim.
      c.globalAlpha = fade;
      const g = c.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.1, cx, cy, r * 1.06);
      g.addColorStop(0, core);
      g.addColorStop(0.55, edge);
      g.addColorStop(0.82, hexA(edge, 0.85));
      g.addColorStop(1, hexA(edge, 0));
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r * 1.06, 0, 6.2832); c.fill();
      c.restore();
    }

    // Death Star: grey sphere lit from the upper-left, rim feathered into the
    // sky, with a faint cool halo and the superlaser dish inset.
    function drawDeathStar(c, b, fade, bob, shim) {
      const cx = b.cx, cy = b.cy + bob, r = b.r;
      c.save();
      // Faint cool halo that gently shimmers.
      const hr = r * (1.7 + shim * 0.2);
      const halo = c.createRadialGradient(cx, cy, r * 0.8, cx, cy, hr);
      halo.addColorStop(0, 'rgba(150,170,205,' + ((0.09 + shim * 0.06) * fade).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(150,170,205,0)');
      c.fillStyle = halo;
      c.beginPath(); c.arc(cx, cy, hr, 0, 6.2832); c.fill();
      c.globalAlpha = fade;
      const dx = cx + r * 0.34, dy = cy - r * 0.3, dr = r * 0.24;
      // Sphere, feathering to transparent at the rim.
      const g = c.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r * 1.06);
      g.addColorStop(0, '#c3c7ce');
      g.addColorStop(0.5, '#888d96');
      g.addColorStop(0.82, 'rgba(65,69,77,0.85)');
      g.addColorStop(1, 'rgba(65,69,77,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r * 1.06, 0, 6.2832); c.fill();
      // Superlaser dish — a smaller, darker inset disc toward the upper-right.
      const dg = c.createRadialGradient(dx - dr * 0.35, dy - dr * 0.35, dr * 0.1, dx, dy, dr);
      dg.addColorStop(0, 'rgba(112,116,124,0.9)');
      dg.addColorStop(1, 'rgba(47,50,58,0)');
      c.fillStyle = dg;
      c.beginPath(); c.arc(dx, dy, dr, 0, 6.2832); c.fill();
      c.restore();
    }

    /* ── Ship lift-offs (blurred shimmers peeling off the moon) ──────────
       Every ~15–30s a small soft shimmer lifts off the moon's surface and
       shoots away into open sky — quick off the pad, then easing out and
       fading as it coasts, like a ship breaking orbit. Deliberately subtle
       background scenery: a faint blurred streak, never a spotlight. Skipped
       entirely under reduced-motion. */
    const launches = [];
    const LAUNCH_MIN_GAP = 15000, LAUNCH_MAX_GAP = 30000; // ms between lift-offs
    const LAUNCH_DUR = 2600;                              // ms lift-off → gone
    let nextLaunchTs = -1;                                // scheduled next one; set lazily

    function scheduleLaunch(ts) {
      nextLaunchTs = ts + LAUNCH_MIN_GAP + Math.random() * (LAUNCH_MAX_GAP - LAUNCH_MIN_GAP);
    }

    function spawnLaunch(ts) {
      const m = frameBodies && frameBodies.deathStar;
      if (!m) return;
      // Fly away from the moon toward the open interior of the sky, with a bit
      // of spread so successive ships don't all trace the same line.
      const toCenter = Math.atan2(gridLogicalH * 0.5 - m.cy, gridLogicalW * 0.5 - m.cx);
      const ang = toCenter + (Math.random() - 0.5) * 1.1;
      launches.push({
        t0: ts,
        // Lift off the surface, not the dead centre of the disc.
        x0: m.cx + Math.cos(ang) * m.r,
        y0: m.cy + Math.sin(ang) * m.r,
        ang,
        dist: SP * (4.2 + Math.random() * 4.6),          // how far it coasts before fading
        size: SP * (0.10 + Math.random() * 0.06),
      });
    }

    function drawLaunches(c, ts, genieP) {
      if (prefersReducedMotion || !launches.length) return;
      const fade = 1 - genieP;
      for (let i = launches.length - 1; i >= 0; i--) {
        const L = launches[i];
        const p = (ts - L.t0) / LAUNCH_DUR;
        if (p >= 1) { launches.splice(i, 1); continue; }
        // Fast off the pad, easing out as it coasts (ease-out cubic on distance).
        const e = 1 - Math.pow(1 - p, 3);
        const x = L.x0 + Math.cos(L.ang) * L.dist * e;
        const y = L.y0 + Math.sin(L.ang) * L.dist * e;
        // Quick bloom on, long fade off — and it never gets loud (peak ~0.5).
        const a = (p < 0.14 ? p / 0.14 : 1 - (p - 0.14) / 0.86) * fade * 0.55;
        if (a <= 0.01) continue;
        const gr = L.size * 3.4;
        // Elongate the soft glow along the travel axis so it reads as a blurred
        // streak trailing back toward the moon rather than a round dot. Build
        // the gradient in the rotated/scaled local frame (origin at the head).
        c.save();
        c.translate(x, y);
        c.rotate(L.ang);
        c.scale(1.9, 0.68);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, gr);
        g.addColorStop(0,   `rgba(${gridDotRgb},${(a * 0.9).toFixed(3)})`);
        g.addColorStop(0.4, `rgba(${gridDotRgb},${(a * 0.32).toFixed(3)})`);
        g.addColorStop(1,   `rgba(${gridDotRgb},0)`);
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, gr, 0, 6.2832); c.fill();
        c.restore();
        // Bright little core at the head of the streak.
        c.fillStyle = `rgba(${gridDotRgb},${a.toFixed(3)})`;
        c.beginPath(); c.arc(x, y, L.size * 0.75, 0, 6.2832); c.fill();
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
    if (useFinePointer && cursorEl) {
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
      // Coalesce rapid mousemove events into a single transform write per frame.
      // mousemove can fire faster than the display refreshes, so doing the DOM
      // write + closest() lookup once per frame avoids redundant work and keeps
      // the cursor on the compositor.
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
    // The ambient "breathing"/rotation drift runs on multi-second periods, so
    // redrawing the whole grid at the full refresh rate is wasted work. Cap the
    // ambient-only loop to ~30fps (imperceptible at these speeds) but keep
    // ripples — which move fast — at the full frame rate. This roughly halves
    // the steady-state main-thread + paint cost behind the glass UI.
    const AMBIENT_FRAME_MS = 1000 / 30;
    let lastDrawTs = 0;

    function startAnim() {
      if (animating) return;
      animating = true;
      requestAnimationFrame(tick);
    }

    function tick(ts) {
      ripples = ripples.filter(r => ts - r.t0 < RPDUR);
      // Ripples and ship lift-offs move fast enough to want the full refresh
      // rate; the slow ambient breathing is fine at the capped 30fps. The
      // one-shot hyperspace entrance also flies out fast, so it must run at the
      // full rate while armed — otherwise the 30fps cap makes it look choppy.
      const ripplesActive = ripples.length > 0 || launches.length > 0;
      const fullRate = ripplesActive || ENTRANCE.armed;
      if (fullRate || ts - lastDrawTs >= AMBIENT_FRAME_MS) {
        lastDrawTs = ts;
        drawGrid(ctx, gridLogicalW, gridLogicalH, ts);
      }
      if (fullRate || ambientAnim) {
        requestAnimationFrame(tick);
      } else {
        animating = false;
        drawGrid(ctx, gridLogicalW, gridLogicalH, ts);
      }
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
      updateHoleRects();
      if (ambientAnim) startAnim();
      else if (!animating) drawGrid(ctx, gridLogicalW, gridLogicalH, 0);
    }

    /* Keep the clear zones tracking the content as it moves: mode switches
       (life/work/chat) swap which blocks are visible, and work mode scrolls.
       Recompute the rects then redraw if the ambient loop isn't already. */
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
    // Drive the genie collapse: force a redraw each frame while scrolling so the
    // staggered per-row shrink stays smooth even when the ambient loop is idle.
    let genieRaf = 0;
    function scheduleGenieDraw() {
      if (genieRaf) return;
      genieRaf = requestAnimationFrame(() => {
        genieRaf = 0;
        if (gridLogicalW) drawGrid(ctx, gridLogicalW, gridLogicalH, performance.now());
      });
    }
    window.addEventListener('scroll', scheduleGenieDraw, { passive: true });
    // Mode switches toggle classes on <body>; re-measure when they do.
    new MutationObserver(scheduleHoleRefresh)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Re-measure once fonts/async content (e.g. post counts) settle.
    window.addEventListener('load', refreshHoles);
    setTimeout(refreshHoles, 600);

    resize();
    window.addEventListener('resize', () => { clearTimeout(canvas._rt); canvas._rt = setTimeout(resize, 100); });

  })();
