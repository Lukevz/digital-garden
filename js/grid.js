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
    const heroEl = document.getElementById('heroSection');
    // Cached because genieProgress() reads it every frame while scrolling.
    const heroSpacerEl = document.querySelector('.hero-spacer');
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
    // The active scene's field bundle — bodies + the pivots their theme swing
    // turns about, plus the height they were laid out against. Held as ONE
    // object (rather than three loose module vars) so a scene warp can keep the
    // outgoing bundle alive alongside the incoming one and interpolate between
    // the two. See makeBodies().
    let bodySet = null;
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
    let frameBodies = null;           // per-frame rotated body positions

    function lerp(a, b, t) { return a + (b - a) * t; }

    // Blend two #rrggbb colours. Used to morph one scene's sun into another's
    // during a warp, so the planets change colour as they travel rather than
    // cross-fading through each other.
    function mixHex(a, b, t) {
      if (!a || !b) return a || b;
      const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
      const r = Math.round(lerp((x >> 16) & 255, (y >> 16) & 255, t));
      const g = Math.round(lerp((x >> 8) & 255, (y >> 8) & 255, t));
      const bl = Math.round(lerp(x & 255, y & 255, t));
      return '#' + (((1 << 24) | (r << 16) | (g << 8) | bl).toString(16)).slice(1);
    }

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

    /* ── Skies ────────────────────────────────────────────────────────────
       The home view keeps the authored sky: a grey moon top-left and the
       Tatooine-style twin suns lower-right, over the full-viewport lattice.
       Each section page (Writing / Videos / Photos) gets its OWN compact sky
       instead — a different number of bodies in a different arrangement on its
       own palette, over a shorter, thinner field — so the pages read as their
       own places rather than a re-tint of home. Per scene:
         compact — fill the compact hero instead of the whole viewport. Its
                   height is MEASURED off the hero, so the sky tracks the
                   responsive height rather than assuming a fraction of it
         density — chance a lattice cell keeps its star (thins the field)
         scatter — how far a star wanders off its lattice point, as a fraction
                   of the pitch (0 = the old perfect grid, ~0.9 = the lattice
                   is only a distribution scaffold and reads as a real sky)
         dim     — multiplier on star alpha, if one sky wants to sit fainter
                   than the shared baseline (optional; defaults to 1)
         seed    — re-rolls star sizes/twinkle/scatter, so the thinning and
                   the brightness spread land differently on each page
       Body coordinates are in lattice pitches (SP) from the named edge, so
       every sky stays snapped to the same grid at any viewport size. */
    const SCENES = {
      home: {
        density: 0.34, scatter: 0.92, seed: 8675309,
        // Just the launchpad moon: the dust-storm hero's giant planet
        // (#heroScene) owns the lower half of the home viewport now, and the
        // old twin suns sat at h*0.66 — inside the planet. The moon stays
        // top-left, above the horizon, so ship lift-offs and warp pairing to
        // the section skies keep working.
        bodies: (w, h) => ({
          // `launchpad` marks the body ships peel off (see spawnLaunch).
          moon:     { kind: 'moon', cx: SP * 2.8, cy: SP * 2.8, r: SP * 0.66, launchpad: true },
        }),
      },
      // Writing — one big cool planet with a small moon riding high above it.
      // Sparsest of the three: mostly empty sky.
      writing: {
        compact: true, density: 0.26, scatter: 0.92, seed: 20260726,
        bodies: (w, h) => ({
          planet: { kind: 'sun', cx: w - SP * 5.2, cy: h * 0.64, r: SP * 1.15,
                    core: '#8f9bd6', edge: '#4a5378' },
          moon:   { kind: 'moon', cx: w - SP * 10.6, cy: h * 0.22, r: SP * 0.44 },
        }),
      },
      // Videos — two warm orbs clustered tight, like a projector lamp and its
      // spill. Densest field of the three, so the cluster has something to sit in.
      videos: {
        compact: true, density: 0.30, scatter: 0.92, seed: 314159,
        bodies: (w, h) => ({
          sunBig:   { kind: 'sun', cx: w - SP * 4.4, cy: h * 0.42, r: SP * 1.0,
                      core: '#f4b23c', edge: '#d1591f' },
          sunSmall: { kind: 'sun', cx: w - SP * 7.6, cy: h * 0.74, r: SP * 0.5,
                      core: '#f08a4b', edge: '#b8431c' },
        }),
      },
      // Photos — three small orbs strung along a shallow arc, reading as a
      // contact sheet of frames rather than one focal body.
      photos: {
        compact: true, density: 0.28, scatter: 0.92, seed: 271828,
        bodies: (w, h) => ({
          orbFar:  { kind: 'sun', cx: w - SP * 13.2, cy: h * 0.3, r: SP * 0.34,
                     core: '#e58fa6', edge: '#a83f5f' },
          orbMid:  { kind: 'sun', cx: w - SP * 8.4, cy: h * 0.68, r: SP * 0.5,
                     core: '#5fc9c0', edge: '#1f7a76' },
          orbNear: { kind: 'sun', cx: w - SP * 3.6, cy: h * 0.34, r: SP * 0.62,
                     core: '#7fd0c4', edge: '#2c6f86' },
        }),
      },
    };

    let scene = SCENES.home;

    // How tall the active sky is. Compact scenes stop at the bottom of the
    // (half-height) hero so their stars aren't sliced mid-field by the page
    // body that covers everything below it; the fraction is only a fallback for
    // before the hero has been laid out.
    function fieldHeightFor(sc, h) {
      if (!sc.compact) return h;
      const hero = heroEl && heroEl.getBoundingClientRect().height;
      return hero || h * 0.52;
    }
    function fieldHeight(h) { return fieldHeightFor(scene, h); }

    // Anchor a scene's bodies relative to the viewport (snapped to the lattice
    // so they nestle among the stars rather than floating off-grid). Returns a
    // self-contained bundle rather than writing module state, so a warp can
    // hold the outgoing scene's bundle and blend toward the incoming one.
    function makeBodies(sc, w, h) {
      const fieldH = fieldHeightFor(sc, h);
      return {
        scene: sc,
        bodies: sc.bodies(w, fieldH),
        // Pivot sits above the field's midline so the bodies swung in from the
        // far side land tucked up toward the top corners (matching how the moon
        // nestles into the top-left in dark mode) rather than sagging low.
        pivot: { cx: w / 2, cy: fieldH * 0.42 },
        // The moon gets its own, higher pivot: swinging it about the shared
        // pivot would land it ~75-85% down the viewport in light mode, right
        // inside the .hero-glow-track band — which paints above the star canvas
        // (z-index 8 vs. 1), hiding it completely behind the gradient. A higher
        // pivot keeps its light-mode landing spot well clear of the glow while
        // leaving the dark-mode (authored) position untouched — the rotation is
        // identity at themeBlend=1 regardless of pivot.
        moonPivot: { cx: w / 2, cy: fieldH * 0.30 },
        fieldH,
      };
    }

    function buildBodies(w, h) {
      bodySet = makeBodies(scene, w, h);
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
    // Rotate ONE scene's bodies for the current theme blend. Each entry is a
    // draw record: geometry, plus `parts` — what to actually paint there. It's
    // normally a single part at full weight; a warp that swaps a moon for a sun
    // hands back both, cross-faded. `wmax` is the strongest part's weight, used
    // to shrink the star-clearing disc of a body that's fading in or out.
    function sceneFrameBodies(set) {
      if (!set) return null;
      // Ease the swing fraction (0 dark → 1 light) rather than the raw blend, so
      // the rotation whips through the middle and settles slowly at each end.
      // Compact skies DON'T swing: the section hero's copy is left-aligned and
      // fills the left half, so a half-turn would sweep the bodies straight
      // through the title. They sit in the right margin, opposite the copy, in
      // both themes — the stars still recolour with the theme either way.
      const a = set.scene.compact ? 0 : -easeInOutExpo(1 - themeBlend) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const out = {};
      for (const key in set.bodies) {
        const b = set.bodies[key];
        const pivot = b.kind === 'moon' ? set.moonPivot : set.pivot;
        const dx = b.cx - pivot.cx, dy = b.cy - pivot.cy;
        // Spread carries kind/colours/launchpad through to the draw loop.
        out[key] = {
          ...b,
          cx: pivot.cx + dx * ca - dy * sa,
          cy: pivot.cy + dx * sa + dy * ca,
          wmax: 1,
          parts: [{ kind: b.kind, core: b.core, edge: b.edge, w: 1 }],
        };
      }
      return out;
    }

    function computeFrameBodies() {
      const to = sceneFrameBodies(bodySet);
      if (!warp || !to) return to;
      return warpFrameBodies(sceneFrameBodies(warp.fromBodies), to, warp.p, warp.e);
    }

    // Is a cell centre covered by any body at its current (rotated) position?
    // Tested per-frame in the draw loop so the cleared disc follows the swing.
    function cellUnderBody(bx, by, fb) {
      for (const key in fb) {
        const b = fb[key];
        // A body fading in or out during a warp clears a proportionally smaller
        // disc, so the stars beneath it aren't switched off in one frame.
        const clearR = (b.r + SP * 0.5) * (b.wmax === undefined ? 1 : b.wmax);
        if (clearR <= 0) continue;
        const dx = bx - b.cx, dy = by - b.cy;
        if (dx * dx + dy * dy <= clearR * clearR) return true;
      }
      return false;
    }

    function makeCells(sc, w, h) {
      const r = prng(sc.seed);
      const out = [];
      // Section scenes fill only the top of the viewport (their hero is about
      // half height); everything below is covered by the page's opaque body.
      // The LATTICE is still laid out against the full viewport so the row/col
      // insets below — and the top bar that centres on them — don't shift
      // between home and a section page; only which rows get emitted changes.
      const fieldH = fieldHeightFor(sc, h);
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
      // The lattice is a distribution scaffold, not the look: each surviving
      // star is nudged off its point by up to ±(scatter/2) of a pitch, so the
      // field spreads evenly across the viewport (no clumps, no bald patches)
      // without ever reading as rows and columns. Zero restores the old grid.
      const scatter = sc.scatter === undefined ? 0 : sc.scatter;
      const dim = sc.dim === undefined ? 1 : sc.dim;
      for (let ci = 0; ci <= cols; ci++) {
        for (let ri = 0; ri <= rows; ri++) {
          // Every sky is thinned now (home included — it used to run at
          // density 1 and skip the draw entirely). Compact skies are also
          // clipped to the hero. Both cuts are seeded, so a scene renders the
          // same sky every time at a given viewport size.
          const lx = offX + ci * SP, ly = offY + ri * SP;
          if (ly > fieldH || r() >= sc.density) continue;
          const bx = lx + (r() - 0.5) * SP * scatter;
          const by = ly + (r() - 0.5) * SP * scatter;
          // Size tiers give a natural distant-starfield spread: mostly tiny
          // pinpoints, some a touch larger, a rare few brighter still.
          const t = r();
          const tier = t < 0.7 ? 0 : t < 0.93 ? 1 : 2;
          const sz = STAR_R * (tier === 0 ? 0.28 + r() * 0.24
                             : tier === 1 ? 0.55 + r() * 0.3
                             :              0.9 + r() * 0.45);
          // Brightness tracks size instead of being one flat band, so the mass
          // of pinpoints sits near the threshold of visible and only the rare
          // large ones carry real light — depth, rather than a lit grid.
          const al = tier === 0 ? 0.12 + r() * 0.10
                   : tier === 1 ? 0.22 + r() * 0.14
                   :              0.40 + r() * 0.20;
          const cell = { bx, by, sz, al: al * dim };
          // Most stars twinkle — deep enough that they fade nearly to nothing
          // and swell back, like real stars blinking in and out.
          if (!prefersReducedMotion && r() < 0.62) {
            cell.twinkle = { phase: r() * 90000, period: 2200 + r() * 4200, depth: 0.55 + r() * 0.4 };
          }
          // A few of those get a brief bloom at their brightest instant only.
          if (cell.twinkle && r() < 0.13) cell.bright = true;
          out.push(cell);
        }
      }
      return out;
    }

    function buildCells(w, h) {
      cells = makeCells(scene, w, h);
      drawList = cells;
      warp = null;
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
    const TEXT_HOLE_SELECTORS = ['.intro-text', '.greet-text', '.section-hero__copy'];
    // .corner-status (clock + weather) and the top-right action buttons cut into
    // the field the same way — each cleared by its own box so the pattern
    // displaces around them and texture survives in the gaps between the icons.
    // Clear around each icon's 20px SVG rather than its padded button box, so an
    // icon only knocks out the one star row it sits on (the taller button box
    // would reach into the row below).
    const BOX_HOLE_SELECTORS  = ['.avatar--inline', '.app-icon', '.study-card',
                                 '.corner-status', '.topBar-actions button svg:not([hidden])',
                                 '.section-hero__icon'];
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
      // Section pages have a half-height hero, so the collapse would fire
      // almost immediately — and the field is covered by the page's opaque
      // body a moment later anyway. Leave their sky alone.
      if (b.contains('section-mode')) return 0;
      // Scaled to the hero's own rendered height (not the raw window height)
      // so the collapse stays in sync with the content rise/glow fade driven
      // by heroParallax() in main.js — the two match only when hero=100vh.
      const vh = (heroEl && heroEl.getBoundingClientRect().height) || gridLogicalH || innerHeight || 1;
      const sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      // Reversed reveal (dust hero): home rests at the document's END and the
      // feed is revealed by scrolling UP, so the collapse keys off distance
      // scrolled up from the bottom instead of down from the top.
      let dist = sy;
      if (b.contains('dust-hero')) {
        const doc = document.documentElement;
        dist = Math.max(0, (doc.scrollHeight - innerHeight) - sy);
        // .hero-spacer overhangs the viewport (styles.css) to leave a stretch
        // of open sky between the hero and the feed's edge. That stretch is
        // meant to be travelled with the field INTACT — without this offset the
        // collapse keys off raw scroll and finishes exactly as the runway ends,
        // so you arrive at the seam through an empty black sky instead of stars.
        if (heroSpacerEl) {
          dist = Math.max(0, dist - Math.max(0,
            heroSpacerEl.getBoundingClientRect().height - innerHeight));
        }
      }
      const p = dist / (vh * GENIE.range);
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
      if (b.contains('work-mode') || b.contains('chat-overlay-open') || b.contains('places-mode')
          || b.contains('section-mode')) {
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

    /* ── Scene warp (page → page) ─────────────────────────────────────
       Switching sections doesn't cut from one sky to the next — the field
       FLIES there. Every star in the outgoing sky is matched to its nearest
       star in the incoming one and travels to it, stretching into a streak in
       proportion to how fast it's moving (fastest at the midpoint, so the whole
       field reads as a short hyperspace jump and then a settle). Stars with no
       partner — the section skies are thinner and half as tall as home, so
       there are always hundreds — don't pop: they streak OUTWARD past the
       viewer from the warp focus and fade, while the incoming sky's extra stars
       stream in along the same axis. Both directions point away from the focus,
       so the mismatch reads as flying forward rather than as a cross-fade.
       Planets travel too: bodies are paired biggest-to-biggest and interpolate
       position, radius and colour, so home's twin suns become Videos' lamp pair
       rather than being swapped for it. */
    const WARP = {
      enabled: true,
      dur: 950,       // ms for the whole jump
      streak: 2.6,    // streak length as a multiple of a star's per-frame travel
      maxStreak: SP * 2.4,
      spawn: 0.45,    // where a born star starts, as a fraction of focus→rest
      exit: 2.1,      // how far past its position a partnerless star flies out
      focusY: 0.46,   // warp focus, as a fraction of the OUTGOING field height
    };
    let warp = null;
    // What the draw loop iterates: normally just `cells`, but during a warp it
    // also carries the outgoing sky's partnerless stars on their way out.
    let drawList = cells;

    // Advance the warp for this frame and stash its progress on the warp object
    // (so body blending can read it without threading it through). Returns the
    // live warp, or null once it's over.
    //   p  — raw 0→1
    //   e  — eased position fraction (smootherstep: accelerate, then settle)
    //   de — de/dp scaled to one frame, i.e. how far a star moves THIS frame as
    //        a fraction of its total trip. Drives the streak length.
    function warpTick(ts) {
      if (!warp) return null;
      const p = (ts - warp.t0) / WARP.dur;
      if (p >= 1) { endWarp(); return null; }
      warp.p = p < 0 ? 0 : p;
      warp.e = warp.p * warp.p * warp.p * (warp.p * (warp.p * 6 - 15) + 10);
      warp.de = 30 * warp.p * warp.p * (1 - warp.p) * (1 - warp.p) * (1000 / 60) / WARP.dur;
      return warp;
    }

    function endWarp() {
      if (!warp) return;
      for (const cl of cells) cl.w = null;   // drop references to the old field
      warp = null;
      drawList = cells;
    }

    // Nearest-neighbour matching, greedy over a coarse spatial hash. Targets are
    // walked top-to-bottom so the assignment is deterministic, and each source
    // star can only be claimed once — otherwise a single star would visibly
    // split into several. Searching keeps widening by one ring past the first
    // hit so the winner isn't just "first bucket that happened to contain one".
    const HASH = SP * 1.5, HASH_RINGS = 6;
    function pairCells(from, to) {
      const buckets = new Map();
      for (let i = 0; i < from.length; i++) {
        const k = Math.floor(from[i].bx / HASH) + ',' + Math.floor(from[i].by / HASH);
        const arr = buckets.get(k);
        if (arr) arr.push(i); else buckets.set(k, [i]);
      }
      const used = new Uint8Array(from.length);
      const pair = new Int32Array(to.length).fill(-1);
      const order = to.map((_, i) => i)
        .sort((a, b) => (to[a].by - to[b].by) || (to[a].bx - to[b].bx));
      for (const ti of order) {
        const t = to[ti];
        const ci = Math.floor(t.bx / HASH), cj = Math.floor(t.by / HASH);
        let best = -1, bestD = Infinity, foundRing = -1;
        for (let ring = 0; ring <= HASH_RINGS; ring++) {
          if (foundRing >= 0 && ring > foundRing) break;
          for (let i = ci - ring; i <= ci + ring; i++) {
            for (let j = cj - ring; j <= cj + ring; j++) {
              // Ring walk: only the shell, since the interior was already done.
              if (ring > 0 && Math.abs(i - ci) !== ring && Math.abs(j - cj) !== ring) continue;
              const arr = buckets.get(i + ',' + j);
              if (!arr) continue;
              for (const fi of arr) {
                if (used[fi]) continue;
                const dx = from[fi].bx - t.bx, dy = from[fi].by - t.by;
                const d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = fi; foundRing = ring; }
              }
            }
          }
        }
        if (best >= 0) { used[best] = 1; pair[ti] = best; }
      }
      return { pair, used };
    }

    // Freeze the field exactly as it looks right now — including mid-warp, so
    // clicking a third tab while the second is still flying picks up from where
    // the stars actually are instead of snapping back.
    function snapshotCells(ts) {
      const wp = warpTick(ts);
      const out = [];
      for (const cl of drawList) {
        const s = wp && cl.w;
        out.push(s ? {
          bx: lerp(s.fx, cl.bx, wp.e),
          by: lerp(s.fy, cl.by, wp.e),
          sz: lerp(s.fsz, cl.sz, wp.e),
          al: lerp(s.fal, cl.al, wp.e),
          hidden: wp.p < 0.5 ? s.fhid : cl.hidden,
        } : { bx: cl.bx, by: cl.by, sz: cl.sz, al: cl.al, hidden: cl.hidden });
      }
      // Stars already faded to nothing are dead weight in the next pairing.
      return out.filter(c => c.al > 0.02);
    }

    // Wire the freshly-built `cells` up to a snapshot of the old field. Every
    // star ends up with a `.w` (its starting state) — a matched star starts
    // where its partner was, an unmatched one starts out near the focus at zero
    // alpha — so the draw loop has ONE interpolation path for the whole field.
    function startWarp(fromCells, fromBodies, ts) {
      const focus = {
        x: gridLogicalW / 2,
        y: (fromBodies ? fromBodies.fieldH : gridLogicalH) * WARP.focusY,
      };
      const { pair, used } = pairCells(fromCells, cells);
      for (let i = 0; i < cells.length; i++) {
        const cl = cells[i];
        const fi = pair[i];
        if (fi >= 0) {
          const f = fromCells[fi];
          cl.w = { fx: f.bx, fy: f.by, fsz: f.sz, fal: f.al, fhid: !!f.hidden };
        } else {
          cl.w = {
            fx: lerp(focus.x, cl.bx, WARP.spawn),
            fy: lerp(focus.y, cl.by, WARP.spawn),
            fsz: cl.sz * 0.5,
            fal: 0,
            fhid: cl.hidden,
          };
        }
      }
      // Partnerless outgoing stars become their own draw records: same shape as
      // a cell, but their "resting" state is out past the viewer at zero alpha.
      const outs = [];
      for (let i = 0; i < fromCells.length; i++) {
        if (used[i]) continue;
        const f = fromCells[i];
        outs.push({
          bx: focus.x + (f.bx - focus.x) * WARP.exit,
          by: focus.y + (f.by - focus.y) * WARP.exit,
          sz: f.sz * 1.15,
          al: 0,
          hidden: f.hidden,
          w: { fx: f.bx, fy: f.by, fsz: f.sz, fal: f.al, fhid: !!f.hidden },
        });
      }
      warp = { t0: ts, p: 0, e: 0, de: 0, fromBodies, outs };
      drawList = outs.length ? cells.concat(outs) : cells;
    }

    // Blend the outgoing scene's bodies into the incoming ones. Paired
    // biggest-first so the eye follows the same object across the jump; a pair
    // of matching suns interpolates its colours, a moon↔sun pair cross-fades
    // the two renderings over one shared travelling position, and any leftover
    // body on either side scales and fades on its own.
    function warpFrameBodies(fromB, toB, p, e) {
      const byR = o => Object.keys(o).sort((x, y) => o[y].r - o[x].r);
      const fk = byR(fromB), tk = byR(toB);
      const n = Math.min(fk.length, tk.length);
      const out = {};
      for (let i = 0; i < n; i++) {
        const f = fromB[fk[i]], t = toB[tk[i]];
        out['p' + i] = {
          cx: lerp(f.cx, t.cx, e), cy: lerp(f.cy, t.cy, e), r: lerp(f.r, t.r, e),
          launchpad: t.launchpad, wmax: 1,
          parts: f.kind === t.kind
            ? [{ kind: t.kind, core: mixHex(f.core, t.core, e), edge: mixHex(f.edge, t.edge, e), w: 1 }]
            : [{ kind: f.kind, core: f.core, edge: f.edge, w: 1 - p },
               { kind: t.kind, core: t.core, edge: t.edge, w: p }],
        };
      }
      for (let i = n; i < fk.length; i++) {
        const f = fromB[fk[i]];
        out['o' + i] = { ...f, r: f.r * (1 - 0.4 * e), wmax: 1 - p,
                         parts: [{ ...f.parts[0], w: 1 - p }] };
      }
      for (let i = n; i < tk.length; i++) {
        const t = toB[tk[i]];
        out['i' + i] = { ...t, r: t.r * (0.6 + 0.4 * e), wmax: p,
                         parts: [{ ...t.parts[0], w: p }] };
      }
      return out;
    }

    /* ── Draw grid ── */
    function drawGrid(c, w, h, ts) {
      c.clearRect(0, 0, w, h);
      // The scroll collapse and the one-shot hyperspace entrance share the same
      // geometry, so the larger of the two drives the frame: on landing the
      // entrance holds it near 1 and eases to 0 (stars fly out); afterwards it's
      // purely scroll-driven.
      const genieP = Math.max(genieProgress(), entranceProgress(ts));
      const wp = warpTick(ts);
      frameBodies = computeFrameBodies();
      for (const cl of (wp ? drawList : cells)) {
        let x = cl.bx, y = cl.by, sz = cl.sz, al = cl.al;
        // `vis` folds in the content hole. Outside a warp it's the binary
        // switch it's always been; during one it RAMPS, so a star that ends up
        // under the incoming page's copy fades out over the jump instead of
        // vanishing the instant the new hole rects are measured.
        let vis = cl.hidden ? 0 : 1;
        let vx = 0, vy = 0;   // this frame's travel — drives the hyperspace streak
        if (wp && cl.w) {
          const s = cl.w;
          x  = lerp(s.fx, cl.bx, wp.e);
          y  = lerp(s.fy, cl.by, wp.e);
          sz = lerp(s.fsz, cl.sz, wp.e);
          al = lerp(s.fal, cl.al, wp.e);
          vis = lerp(s.fhid ? 0 : 1, cl.hidden ? 0 : 1, wp.p);
          vx = (cl.bx - s.fx) * wp.de;
          vy = (cl.by - s.fy) * wp.de;
        } else if (cl.hidden) {
          continue; // grid-snapped binary hole — cell fully off
        }
        if (vis <= 0.004 || al <= 0.004) continue;
        if (x > w + SP || y > h + SP || x < -SP || y < -SP) continue;
        // Clear stars under a body so it reads as a solid disc, not sparkles
        // poking through — using the body's rotated position for this frame.
        if (frameBodies && cellUnderBody(x, y, frameBodies)) continue;
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
          const vb = h > 0 ? y / h : 0;                     // 0 = top row … 1 = bottom row
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
        const alpha = Math.min(1, al * tw * shimmer * genieAlpha * vis);
        if (alpha < 0.004) continue;
        const R = sz * markScale;
        // ── Hyperspace streak ──
        // A star in flight trails back along its own travel vector, the trail
        // scaled to how far it moved THIS frame. Since the eased trip peaks in
        // the middle, the streaks bloom out and retract on their own — no
        // separate "warp" state to sequence.
        if (vx || vy) {
          const sp = Math.hypot(vx, vy);
          const len = Math.min(WARP.maxStreak, sp * WARP.streak);
          if (len > R * 1.4) {
            c.strokeStyle = `rgba(${gridDotRgb},${(alpha * 0.5).toFixed(3)})`;
            c.lineWidth = R * 1.6;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(x - (vx / sp) * len, y - (vy / sp) * len);
            c.lineTo(x, y);
            c.stroke();
          }
        }
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

    /* ── Celestial bodies — whatever the active scene declared ── */
    function drawBodies(c, ts, genieP) {
      const fb = frameBodies;
      if (!fb) return;
      const fade = 1 - genieP;
      if (fade <= 0.01) return;
      const bob = prefersReducedMotion ? 0 : Math.sin(ts / 4200) * 2;
      let i = 0;
      for (const key in fb) {
        const b = fb[key];
        // Each body gets its own out-of-phase shimmer signal in 0..1, so a
        // scene's bodies breathe independently rather than pulsing in unison.
        const shim = prefersReducedMotion ? 0.5
          : 0.5 + 0.5 * Math.sin(ts / (2600 + i * 700) + i * 1.5);
        // Normally one part at full weight. Mid-warp a body that's changing
        // KIND paints both renderings at the same travelling spot, cross-faded,
        // and a body with no counterpart paints at partial weight as it goes.
        // Suns are dialled back to ~55% and the (already muted) grey moon a
        // touch less, so they read as distant scenery rather than spotlights
        // competing with the hero copy.
        for (const part of b.parts) {
          if (part.w <= 0.01) continue;
          if (part.kind === 'moon') drawMoon(c, b, fade * 0.72 * part.w, bob, shim);
          else drawSun(c, b, part.core, part.edge, fade * 0.55 * part.w, shim);
        }
        i++;
      }
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

    // Moon (the Death Star): grey sphere lit from the upper-left, rim feathered
    // into the sky, with a faint cool halo and the superlaser dish inset.
    function drawMoon(c, b, fade, bob, shim) {
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

    // The scene names the body ships peel off (`launchpad`). Scenes without one
    // — the section skies — simply never launch.
    function launchpadBody() {
      if (!frameBodies) return null;
      for (const key in frameBodies) {
        if (frameBodies[key].launchpad) return frameBodies[key];
      }
      return null;
    }

    function spawnLaunch(ts) {
      const m = launchpadBody();
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
      // A scene warp flies the whole field across the viewport in under a
      // second, so it needs the full refresh rate too — at the 30fps ambient cap
      // the streaks strobe instead of trailing.
      const ripplesActive = ripples.length > 0 || launches.length > 0;
      const fullRate = ripplesActive || ENTRANCE.armed || !!warp;
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

    // js/main.js loads before this file, so if the page came up straight at a
    // section route it has already asked for that section's sky (via
    // body[data-sky]) at a point where window.grid didn't exist yet. Pick it up
    // before the first layout rather than building the home sky and swapping it
    // out a frame later.
    scene = SCENES[document.body.dataset.sky] || SCENES.home;

    resize();
    window.addEventListener('resize', () => { clearTimeout(canvas._rt); canvas._rt = setTimeout(resize, 100); });

    /* ── Public API ──
       js/main.js swaps the sky when it opens or leaves a section page. Unknown
       names fall back to home rather than throwing, so a typo degrades to the
       default sky instead of a blank canvas. */
    window.grid = {
      scene(name) {
        const next = SCENES[name] || SCENES.home;
        if (next === scene) return;
        const ts = performance.now();
        // Freeze the outgoing sky BEFORE the rebuild — including mid-flight if
        // a previous warp is still running — so the new one starts from what's
        // actually on screen.
        const fromCells = prefersReducedMotion || !WARP.enabled ? null : snapshotCells(ts);
        const fromBodies = bodySet;
        scene = next;
        // Full rebuild rather than just re-placing the bodies: field height,
        // density and seed all feed buildCells (which re-places the bodies
        // itself on the way out, and clears any in-flight warp).
        buildCells(gridLogicalW, gridLogicalH);
        updateHoleRects();
        if (fromCells) startWarp(fromCells, fromBodies, ts);
        // The warp animates, so the loop has to be running even if the ambient
        // breathing had gone idle (reduced motion aside, where there's no warp).
        if (warp) startAnim();
        else if (!animating) drawGrid(ctx, gridLogicalW, gridLogicalH, ts);
      },
      // Live knobs for tuning the jump from the console, e.g.
      // grid.warp.dur = 1400, or grid.warp.enabled = false to compare.
      warp: WARP,
    };

  })();
