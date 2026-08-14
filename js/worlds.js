/**
 * World director — which biosphere the home feed is standing in.
 *
 * Home is a descent through a sequence of WORLDS. You fall into one, cross it
 * while reading its chapter of the feed, fall out the bottom through a VOID,
 * and fall into the next. Direction never reverses; what changes is scale and
 * context (the dust planet becomes a jellyfish, and so on).
 *
 * The model is deliberately thin:
 *   • A chapter is one or more consecutive `.home-section[data-world]`
 *     siblings. There is no wrapper element — `.below-fold-inner` is a flex
 *     column with a `gap`, and wrapping sections would make that gap fall
 *     between chapters instead of between sections, changing every section's
 *     spacing. Grouping is done here, at measure time, from the attribute.
 *   • A `.world-void[data-from][data-to]` is a real (empty, aria-hidden)
 *     spacer between two chapters. It gets its own element rather than being
 *     inferred from the gap between two section rects, because a measured rect
 *     is far more robust than arithmetic on the space between two others — and
 *     because it's the one place the transition needs authored length.
 *
 * Two outputs, both per frame:
 *   • the active sky, pushed through `setSky()` at the void's MIDPOINT
 *   • `--world-dim` on <html>, 0 while crossing a void (the world at its
 *     brightest, which is what makes the gap read as a reveal) ramping to 1
 *     inside a chapter (the world settling back so copy can be read over it)
 *
 * ⚠️ Loads BETWEEN js/main.js and js/grid.js. main.js has to have defined
 * `window.setSky` first; grid.js reads `body[data-sky]` once at init, before
 * its first resize(), so the world resolved here on the first frame is the sky
 * grid.js builds — no cold-load flash of the wrong world on a restored scroll
 * position deep in the page.
 */
(function () {
  'use strict';

  const feed = document.getElementById('belowFold');
  if (!feed) return;

  const reduced = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The world the hero itself stands in, and the fallback for any section that
  // hasn't been assigned one. Matches SCENES.home in js/grid.js.
  const ROOT_WORLD = 'home';

  /* ── The genie passage ────────────────────────────────────────────────
     Where the ocean ends. Instead of one world fading into the next, the
     water is SUCKED DOWN into the question bubble of the thread below it —
     the whole biosphere pours into a message, pinches to a blue dot, and
     then unfolds into the bubble the reply arrives in.

     Three acts, all cut from the same monotonic 0→1 crossing of the void:

       drain  0 → DRAIN_END   the viewport-sized sheet of water funnels down
                              to a circle the size of the bubble's height
       open   → OPEN_END      that circle unfolds into the bubble's own
                              rounded-rect silhouette
       text   → 1             the bubble's copy fades up inside it

     ⚠️ The acts must not overlap. The point of the beat is that you read one
     shape becoming the next, in order — a circle that is already showing text
     while it is still growing reads as a card animating in, which is the
     generic thing this exists instead of. */
  const GENIE = {
    drainEnd: 0.86,  // fraction of the void spent collapsing the water
    openEnd:  0.95,  // …by here the circle has become the bubble
    // How much harder the rows level with the target pinch than the rows far
    // from it. This is the whole silhouette: 0 collapses the sheet uniformly
    // (a shrinking rectangle), higher values form the neck first and drag the
    // mass through it. Above ~1 the neck closes before the mass has moved and
    // the sheet detaches.
    neck: 0.95,
    // Samples down each side of the outline. The circle, the crown arc and the
    // bubble's corner radii are all drawn by this, so too few reads as a
    // polygon. Rows are COSINE-spaced (dense at the shape's top and bottom,
    // where all the curvature lives — the crown, the corner radii), so this
    // buys smooth shoulders without paying for wasted rows down the straight
    // flanks. 40 uniform samples was visibly faceted on the crown.
    steps: 72,
    // How hard the pinch is concentrated near the target row — the exponent on
    // (1 - d) in the drain. Raw (1) the falloff is linear and the sides come
    // out dead straight: a paper cone. Higher bows the sides into a real
    // funnel. See the note in genieOutline().
    bow: 2.6,
    // Edge easing exponents. The TOP edge is what the eye reads as "how much
    // sea is left", so it holds at the frame edge and lets go late; the bottom
    // leaves early, down toward the target.
    topHold: 3.4,
    botLead: 1.7,
    // Where the crown (the rounded top of the falling drop) starts forming, as
    // drain progress. Before this the sheet's corners stay square to the frame
    // — a sheet that domes its corners while still nearly full-frame reads as
    // a window being resized, which is the generic thing this passage exists
    // instead of.
    crownFrom: 0.5,
    // Where the blue arrives. The water is navy; the bubble is iMessage blue.
    // Cross-fading late means the tint only ever lands on a shape small enough
    // that you read it as the bubble's colour rather than as the sea changing.
    tintFrom: 0.58,
  };

  // Fraction of the draining shape's rows that form its rounded crown.
  const CROWN = 0.2;

  // ── Tunables (live-pokeable via window.worlds.tune) ──
  const TUNE = {
    // Where down the viewport the "reading line" sits. The world under this
    // line is the world you're considered to be in. Above centre because the
    // eye leads the scroll.
    line: 0.42,
    // How far from a void's edge the world has fully dimmed back down, as a
    // fraction of the viewport. Larger = a longer, softer brightening as you
    // approach the gap.
    fade: 0.55,
    // How far the world dims inside a chapter. 1 = --world-dim reaches 1.
    // The consumer decides what that means (see #worldLayers in styles.css);
    // this only ever reports 0..1.
    depth: 1,
  };

  let currentSky = null;
  let ticking = false;
  let lastDim = -1;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  // Eased 0 → 1 as x crosses from a to b; flat outside. The building block for
  // every phase window in the passage.
  function ramp(x, a, b) { return smoothstep(clamp01((x - a) / (b - a))); }
  /* A single event at a point on the scroll, not on a clock: 1 at `at`, 0 by
     ±`w`, squared so it snaps rather than swells. This is what makes the
     lightning scroll-driven — stop moving and the flash stops where you left
     it, scroll back and it fires again in the same place. */
  function pulse(x, at, w) {
    const d = Math.abs(x - at) / w;
    return d >= 1 ? 0 : (1 - d) * (1 - d);
  }

  /* ── Dormancy ──
     Every view that isn't the home feed borrows the same hero and owns its own
     sky: section pages set it in openSectionPage(), the overflow pages hide the
     feed and the spacer entirely. Mirrors feedIsTheView() in js/subnav.js —
     if you add a mode there, add it here. */
  function dormant() {
    const b = document.body.classList;
    return b.contains('work-mode')
      || b.contains('section-mode')
      || b.contains('overflow-mode')
      || b.contains('places-mode')
      || b.contains('chat-overlay-open')
      || feed.hidden;
  }

  /* ── Live measurement ──
     Never cached. #homeCaseStudies and #homeEnergyBoard ship `hidden` and are
     unhidden by JS once their content loads, so a registry built at init would
     hold zero-height chapters (or miss them). offsetParent catches both
     `hidden` and display:none. */
  function voids() {
    const out = [];
    for (const el of feed.querySelectorAll('.world-void')) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 1) continue;
      out.push({
        el, r,
        to: el.dataset.to || ROOT_WORLD,
        from: el.dataset.from || ROOT_WORLD,
        // How this void hands over. Authored, not inferred: the phases below
        // are specific to one transition each, and a void that doesn't name a
        // passage gets the plain cross-fade rather than someone else's weather.
        passage: el.dataset.passage || 'fade',
      });
    }
    return out;
  }

  /* ── Layers ──
     Resolved by world name rather than by id so a passage only has to name the
     two worlds it joins. A world with no layer (`deep` — open field, nothing
     but the star canvas behind it) is a legitimate answer of null; that's what
     tells applyLive() to fade the OUTGOING layer out instead of fading an
     incoming one in. */
  function layerFor(world) {
    return document.querySelector('.world-layer[data-world="' + world + '"]');
  }

  /* The world a given void hands you INTO is authored on the element, so a
     chapter whose sections are all hidden still can't strand the sequence —
     the void either exists (and names both sides) or it doesn't. */
  function resolve() {
    const vh = window.innerHeight || document.documentElement.clientHeight || 1;
    const line = vh * TUNE.line;
    const vs = voids();

    // Sky: the last void whose MIDPOINT has passed above the reading line.
    // Midpoint rather than an edge so the swap lands with the visitor deepest
    // in the gap, where there's least content on screen to notice it.
    let sky = vs.length ? vs[0].from : firstWorld();
    for (const v of vs) {
      if (v.r.top + v.r.height / 2 <= line) sky = v.to;
    }

    /* ── The passage ──
       A void isn't a gap you scroll over; it's the transition itself. `enter`
       is the clock (0 → 1 as the reading line travels the void); every phase
       below is a window on it, so ALL of it is scroll-position — stop and it
       stops, scroll back and it plays backwards. Nothing here is on a timer.

       The shape of the beat, in order:

         push    0 → 1 → 0.  The camera dives at the limb. Deliberately AHEAD
                 of the veil so you watch yourself fly into the planet before
                 the dust takes the frame, then it settles back out.
         storm   0 → 1 → 0.  The dust closes over and opens again. Its plateau
                 is the only place anything is allowed to change identity.
         shrink  0 → 1.      The giant limb contracts to a body you can see all
                 of — d0 → dm. Entirely under the storm.
         morph   0 → 1.      The FILL cross-fades, planet surface → bell. Also
                 entirely under the storm: ⚠️ this is the one that must stay
                 hidden. Watching a planet turn into a jellyfish is a cartoon;
                 the trick is that the object never changes on screen, you just
                 have to re-read what you were already looking at.
         recede  0 → 1.      dm → bell size, IN PLAIN SIGHT. This is not a
                 transformation, it's distance: the same body getting further
                 away as you keep falling. It runs long, so it is still going
                 when the Timeline rises into frame.
         reveal  0 → 1.      Oral arms unfurl, the water shimmers. The beat
                 that lands the re-read.
         exit    0 → 1.      You fall past it: the body lifts out of the top of
                 the frame and hands off to the ocean's own scenery.

       ⚠️ shrink must COMPLETE before recede starts — styles.css interpolates
       the shared circle across three stops as (d0→dm) then (dm→d1) and reads
       `shrink - recede` for the middle one, which only holds while they don't
       overlap.

       All 0 whenever no void owns the line, so a chapter never pays for them. */
    let enter = 0, storm = 0, morph = 0, reveal = 0, into = null, active = null;
    let push = 0, shrink = 0, recede = 0, exit = 0, hand = 0, churn = 0;
    let flashA = 0, flashB = 0, enterOp = 0, leaveOp = 1, travel = 0;
    for (const v of vs) {
      if (line < v.r.top || line > v.r.bottom) continue;
      active = v;
      enter = clamp01((line - v.r.top) / Math.max(1, v.r.height));
      into = v.to;
      if (v.passage !== 'storm') {
        /* Every other passage is a plain cross-fade, and the two halves are
           deliberately not each other's inverse. The incoming world arrives
           early (there's nothing to hide behind), but the outgoing one HOLDS
           until the chapter it was lighting has left the frame — the chat room
           is the only chapter that reads dark-on-light, and copy left sitting
           over a half-faded room is unreadable in a way a fade never is. */
        enterOp = ramp(enter, 0.08, 0.55);
        leaveOp = 1 - ramp(enter, 0.45, 0.92);
        break;
      }
      push    = Math.min(ramp(enter, 0.00, 0.30), 1 - ramp(enter, 0.50, 0.72));
      storm   = Math.min(ramp(enter, 0.06, 0.30), 1 - ramp(enter, 0.56, 0.74));
      shrink  = ramp(enter, 0.24, 0.50);
      morph   = ramp(enter, 0.30, 0.52);
      recede  = ramp(enter, 0.56, 0.93);
      reveal  = ramp(enter, 0.66, 0.88);
      /* The hand-off, not an exit. The jellyfish does NOT leave — the ocean's
         own copy of it fades in underneath (`hand`) and then the dust scene
         fades out over it (`exit`), a beat later so the two always overlap and
         there is never a frame where neither is at full strength. Both windows
         sit after `recede` has settled, so nothing is still moving while they
         cross. ⚠️ Keep `exit` starting after `hand` — swap them and you get a
         visible blink at the one moment the visitor is looking straight at it. */
      hand    = ramp(enter, 0.86, 0.94);
      exit    = ramp(enter, 0.90, 0.99);
      // Churn: swirl rotation and the gust sweep, both as plain progress
      // through the void rather than a CSS animation, so the weather is
      // something you drive rather than something that plays at you.
      churn   = enter;
      /* Where the storm SHEET is, vertically. The veil is a 300vh sheet the
         camera passes through rather than a wash that fades in place: 0 = the
         whole sheet below the frame, 0.5 = covering it, 1 = gone off the top.
         Two half-ramps synced to the storm's own rise and fall, so the sheet
         is exactly centred (full cover) for the entire opacity plateau — key
         it to `enter` linearly instead and the feathered leading edge crosses
         the frame while the veil is at full strength, leaving a see-through
         band at the top of the storm. */
      travel  = 0.5 * ramp(enter, 0.06, 0.30) + 0.5 * ramp(enter, 0.56, 0.74);
      // Lightning. Placed AT scroll positions, dimmed by the storm so a bolt
      // can never fire in clear air. The two patches are offset from each
      // other so a couple can overlap without either being a frame-wide event.
      flashA  = storm * clamp01(pulse(enter, 0.14, 0.030) * 0.95
                              + pulse(enter, 0.33, 0.026) * 0.55
                              + pulse(enter, 0.52, 0.034) * 0.85);
      flashB  = storm * clamp01(pulse(enter, 0.23, 0.028) * 0.70
                              + pulse(enter, 0.42, 0.032) * 1.00
                              + pulse(enter, 0.62, 0.024) * 0.45);
      /* The incoming world's own opacity. NOT raw `enter`: it has to arrive
         UNDER the storm and be fully present by the time the dust lifts,
         otherwise you watch the water fade up over the planet — which gives
         the whole thing away before the reveal. Still direction-agnostic:
         scrolling back up it falls again and the far world recedes with it. */
      enterOp = ramp(enter, 0.20, 0.46);
      break;
    }

    /* Monotonic "have we come out the other side of the first passage yet".
       0 above it, `reveal` inside it, 1 once past — unlike the phase windows,
       which all fall back to 0 in a chapter and would hide the content they're
       supposed to be introducing. This is what the first chapter's copy fades
       in on, so the Timeline arrives already underwater.
       ⚠️ Keyed to the STORM void by name, not to vs[0]. There are three voids
       now and only that one has a reveal to settle out of. */
    let settled = 1;
    /* Monotonic in the same way, but for the HAND-OFF rather than the content.
       The dust scene's jellyfish cannot survive the void: every dimension it
       has is interpolated on a phase window, and those all fall back to 0 in a
       chapter, so the shared circle would snap back to planet size the instant
       you left. The ocean carries its own copy of the jellyfish at exactly the
       resting pose (`.os-jelly--hero`), and this is what fades that copy in
       under the original before the original goes — which is what lets the
       jellyfish stay pinned over the Timeline for the whole chapter. */
    let handoff = 1;
    const firstStorm = vs.find(v => v.passage === 'storm');
    if (firstStorm) {
      if (line < firstStorm.r.top) { settled = 0; handoff = 0; }
      else if (line <= firstStorm.r.bottom) { settled = reveal; handoff = hand; }
    }

    // Dim: 0 anywhere a void (or the open sky above the feed) owns the reading
    // line, ramping to TUNE.depth once a chapter has taken over.
    let dim = TUNE.depth;
    const feedTop = feed.getBoundingClientRect().top;
    if (feedTop > line) {
      dim = 0;                       // still in the hero / the runway above it
    } else {
      const span = Math.max(1, vh * TUNE.fade);
      for (const v of vs) {
        let d;
        if (line >= v.r.top && line <= v.r.bottom) { d = 0; }
        else d = line < v.r.top ? v.r.top - line : line - v.r.bottom;
        dim = Math.min(dim, TUNE.depth * smoothstep(clamp01(d / span)));
        if (dim === 0) break;
      }
      // The feed's own top edge is a soft boundary too — the runway above it is
      // open sky, so don't slam to full dim on the first pixel of content.
      const dTop = line - feedTop;
      dim = Math.min(dim, TUNE.depth * smoothstep(clamp01(dTop / Math.max(1, vh * TUNE.fade))));
    }
    /* ⚠️ The light room never dims. --world-dim is a wash of --bg (near black)
       over the world layers so copy can be read over a busy sky; the chat room
       is a flat fill with nothing to quiet down, and washing it dark both
       greys the room and puts near-black over the one chapter that reads
       dark-on-light. It's already 0 through both of its voids, so pinning it
       across the chapter is continuous, not a jump. */
    if (sky === 'chat') dim = 0;

    return {
      sky, dim, enter, settled, into, active,
      genie: genieState(vs, line, vh),
      phase: { push, storm, shrink, morph, recede, reveal, exit, churn, flashA, flashB, enterOp, leaveOp, travel },
      handoff,
    };
  }

  /* ── The genie ─────────────────────────────────────────────────────────
     Read-only, and read in the SAME pass as every other rect in resolve() —
     the target bubble's box has to be measured before this frame's first
     style write or the clip trails the thing it's supposed to be pouring into
     by a frame, which reads as the water missing its mark.

     Progress is monotonic across the whole page (0 above the void, 1 below),
     not just inside it, because the bubble's paint state has to be answerable
     anywhere: it is unpainted for the entire ocean chapter above and painted
     for the entire chat chapter below. */
  function genieState(vs, line, vh) {
    const v = vs.find(x => x.passage === 'genie');
    if (!v) return null;
    const p = clamp01((line - v.r.top) / Math.max(1, v.r.height));
    const g = {
      v, p,
      drain: clamp01(p / GENIE.drainEnd),
      open:  clamp01((p - GENIE.drainEnd) / (GENIE.openEnd - GENIE.drainEnd)),
      /* ⚠️ NOT the same curve as `open`, and this is the difference between a
         transform and an overlay. The real bubble is always at its full,
         final width; the clipped water is whatever width the unfold has
         reached. Fade one up across the other and you see BOTH — a solid blue
         lozenge sitting inside a pale full-width pill, which is exactly the
         "collapsed background overlaid on the bubble" read this passage is
         supposed to avoid. So the hand-off waits until the clip has all but
         finished, and then crosses between two shapes that are already the
         same shape. */
      hand:  ramp(clamp01((p - GENIE.drainEnd) / (GENIE.openEnd - GENIE.drainEnd)), 0.86, 1),
      text:  clamp01((p - GENIE.openEnd) / (1 - GENIE.openEnd)),
      tint:  ramp(p, GENIE.tintFrom, GENIE.drainEnd),
      armed: false,
      clip:  null,
    };
    if (reduced) return g;
    const layer = layerFor(v.from);
    const target = v.el.dataset.genieTarget
      && document.querySelector(v.el.dataset.genieTarget);
    if (!layer || !target) return g;
    const box = layer.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    // A bubble with no box — the feed is display:none in some modes, or the
    // thread hasn't laid out yet — leaves the passage unarmed, and the whole
    // thing degrades to the cross-fade rather than clipping to garbage.
    if (t.width < 4 || t.height < 4 || box.width < 4) return g;
    g.armed = true;
    // Only the crossing itself needs a shape. Above it the water is whole;
    // below it the layer isn't mounted at all.
    if (p > 0 && p < 1) g.clip = genieOutline(g, t, box, target);
    return g;
  }

  /* Corner radii, read off the bubble itself so the silhouette can't drift
     from the thing it becomes. Cached — this is a style read inside the
     measure pass, and the radii only change with the stylesheet. */
  let radiiFor = null, radiiEl = null;
  function bubbleRadii(el) {
    if (radiiEl === el && radiiFor) return radiiFor;
    const cs = getComputedStyle(el);
    radiiEl = el;
    radiiFor = {
      tl: parseFloat(cs.borderTopLeftRadius) || 0,
      tr: parseFloat(cs.borderTopRightRadius) || 0,
      bl: parseFloat(cs.borderBottomLeftRadius) || 0,
      br: parseFloat(cs.borderBottomRightRadius) || 0,
    };
    return radiiFor;
  }

  /* How far in from a vertical edge the rounded corner has eaten at this row. */
  function cornerInset(dyTop, dyBot, rTop, rBot) {
    if (rTop > 0 && dyTop < rTop) {
      const k = rTop - dyTop;
      return rTop - Math.sqrt(Math.max(0, rTop * rTop - k * k));
    }
    if (rBot > 0 && dyBot < rBot) {
      const k = rBot - dyBot;
      return rBot - Math.sqrt(Math.max(0, rBot * rBot - k * k));
    }
    return 0;
  }

  /* Build the clip-path polygon for this frame.
   *
   * The whole passage is one outline function sampled at N rows, which is what
   * lets the three acts chain without a seam: every act's END STATE is the next
   * one's start state, exactly, because they're all written against the same
   * parameterisation (u = 0 at the shape's top, 1 at its bottom) rather than
   * against absolute geometry.
   *
   *   drain   full viewport  →  a circle of radius R centred on the bubble
   *   open    that circle    →  the bubble's own rounded-rect silhouette
   *
   * ⚠️ The circle is parameterised by u, not by y. Solving the circle at the
   * row's actual y instead gives zero width for every row outside the circle's
   * band, so mid-drain the sheet is a rectangle with two spikes rather than a
   * funnel — and the neck never forms.
   */
  function genieOutline(g, t, box, targetEl) {
    const N = GENIE.steps;
    const vw = box.width, vh = box.height;
    // Everything is measured against the viewport, but the polygon is relative
    // to the LAYER, which may be inset by a scrollbar.
    const tx = (t.left + t.width / 2) - box.left;
    const ty = (t.top + t.height / 2) - box.top;
    const R = Math.max(6, Math.min(t.height, t.width) / 2);

    let top, bot;
    const L = [], Rt = [], Y = [];
    /* Cosine-spaced row parameter: dense where the outline curves (the crown,
       the circle's poles, the bubble's corner radii), sparse down the straight
       flanks. Uniform rows at the same N read as a faceted polygon exactly
       where the eye checks for roundness. */
    const rowU = i => (1 - Math.cos(Math.PI * i / N)) / 2;

    if (g.open <= 0) {
      /* ── Act 1: drain ──
         ⚠️ BOTH axes are eased-in, hard. A sheet that starts leaving the frame
         edges on the first pixel of scroll reads as a window being resized —
         the water has to HANG at full frame, neck, and only then go. Linear
         (or even smoothstep) here puts a grey margin around the sea a fifth of
         the way into a passage the sea is supposed to own. */
      /* ⚠️ The two edges are eased DIFFERENTLY, and that asymmetry is the
         effect. The top edge is what the eye reads as "how much sea is left",
         so it holds near the frame edge and only lets go at the end; the
         bottom leaves early, down toward the target. Ease them together and
         the sheet reads as a rectangle sliding off the bottom of the screen
         instead of as something being pulled through a hole. */
      const eh = Math.pow(g.drain, 1.8);
      top = 0 + (ty - R - 0) * Math.pow(g.drain, GENIE.topHold);
      bot = vh + (ty + R - vh) * Math.pow(g.drain, GENIE.botLead);
      /* ⚠️ The neck is measured against the SHAPE's own reach, not the
         viewport's. For most of the drain the bubble is still below the fold,
         so against the viewport every row is equally "far" from it, the neck
         term cancels out, and the whole thing collapses as a rectangle. Scaled
         to the shape, the row nearest the target always leads — which is what
         draws the spout down toward the bubble ahead of the mass. */
      const reach = Math.max(1, Math.abs(top - ty), Math.abs(bot - ty));
      /* The crown's ramp, hoisted out of the row loop. Gated to the BACK half
         of the drain (GENIE.crownFrom): while the sheet is still near frame
         size its corners stay square — doming them early reads as a window
         being resized, not water leaving. By drain = 1 it must reach exactly 1
         so act 1's end state is the drop act 2 opens from. */
      const crownAmt = ramp(g.drain, GENIE.crownFrom, 0.98);
      for (let i = 0; i <= N; i++) {
        const u = rowU(i);
        const y = top + (bot - top) * u;
        const s = Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1)));
        // Rows level with the bubble pinch first and the rest follow — this
        // one term is the entire genie silhouette.
        /* ⚠️ (1 - d) is raised to a power, not used raw. Raw, the pinch falls
           off linearly with distance and the sides come out DEAD STRAIGHT — a
           paper cone. The exponent concentrates it near the target so the
           sides bow: wide at the top, curving into the neck. The curve is the
           only thing separating this from a triangle. */
        const d = clamp01(Math.abs(y - ty) / reach);
        const w = smoothstep(clamp01(eh * (1 + GENIE.neck * Math.pow(1 - d, GENIE.bow))));
        let l = 0 + ((tx - R * s) - 0) * w;
        let r = vw + ((tx + R * s) - vw) * w;
        /* ── The crown ──
           The shape's top row is a straight horizontal cut across whatever
           width it currently has. Once the sheet is small that flat edge IS
           the silhouette — a blue lozenge with its top sliced off, floating in
           the room. So the top band of rows is drawn in toward the row's own
           centre along a circular arc, giving a DROP: rounded crown, heavy
           middle, neck.
           ⚠️ It multiplies the row's width, it does NOT add to the pinch. As an
           additive term it compounds with the neck and closes the whole upper
           body to a point — a candle flame rather than a falling drop.
           ⚠️ And it ramps on `drain`, so at rest the sheet is still square to
           the frame corners; a sea with a domed top is a bubble, not a sea. */
        if (u < CROWN) {
          const k = u / CROWN;                                  // 0 at the crown
          const arc = Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k)));
          const m = 1 - crownAmt * (1 - arc);
          const cx = (l + r) / 2;
          l = cx - (cx - l) * m;
          r = cx + (r - cx) * m;
        }
        Y.push(y);
        L.push(l);
        Rt.push(r);
      }
    } else {
      // ── Act 2: open ──
      const e = smoothstep(g.open);
      const rad = bubbleRadii(targetEl);
      const px0 = t.left - box.left, px1 = t.right - box.left;
      const py0 = t.top - box.top,   py1 = t.bottom - box.top;
      for (let i = 0; i <= N; i++) {
        const u = rowU(i);
        const s = Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1)));
        const cy = ty - R + 2 * R * u;
        const py = py0 + (py1 - py0) * u;
        const dyTop = py - py0, dyBot = py1 - py;
        const li = px0 + cornerInset(dyTop, dyBot, rad.tl, rad.bl);
        const ri = px1 - cornerInset(dyTop, dyBot, rad.tr, rad.br);
        Y.push(cy + (py - cy) * e);
        L.push((tx - R * s) + (li - (tx - R * s)) * e);
        Rt.push((tx + R * s) + (ri - (tx + R * s)) * e);
      }
    }

    // Right side top→bottom, then left side bottom→top.
    const pts = [];
    const fx = x => (x / vw * 100).toFixed(2);
    const fy = y => (y / vh * 100).toFixed(2);
    for (let i = 0; i <= N; i++) pts.push(fx(Rt[i]) + '% ' + fy(Y[i]) + '%');
    for (let i = N; i >= 0; i--) pts.push(fx(L[i]) + '% ' + fy(Y[i]) + '%');
    return 'polygon(' + pts.join(',') + ')';
  }

  // Everything a chapter should see: no storm, no morph, the world at rest.
  const AT_REST = {
    push: 0, storm: 0, shrink: 0, morph: 0, recede: 0, reveal: 0,
    exit: 0, churn: 0, flashA: 0, flashB: 0, enterOp: 0, leaveOp: 1, travel: 0,
  };

  // World of the first assigned section, so a feed with no voids at all still
  // reports something sane.
  function firstWorld() {
    const s = feed.querySelector('.home-section[data-world]');
    return (s && s.dataset.world) || ROOT_WORLD;
  }

  function applySky(name) {
    if (name === currentSky) return;
    currentSky = name;
    // ⚠️ Through setSky(), never window.grid.scene() directly — setSky writes
    // body[data-sky] FIRST and only then calls grid, which is the whole reason
    // a cold load at a restored scroll position builds the right sky instead of
    // building home and warping a frame later.
    if (typeof window.setSky === 'function') window.setSky(name);
    else document.body.dataset.sky = name;
  }

  function applyDim(dim) {
    const v = Math.round(dim * 1000) / 1000;
    if (v === lastDim) return;
    lastDim = v;
    document.documentElement.style.setProperty('--world-dim', v.toFixed(3));
  }

  function applyPassage(p, settled, handoff) {
    const root = document.documentElement.style;
    root.setProperty('--world-enter', p.enterOp.toFixed(3));
    root.setProperty('--w-push', p.push.toFixed(3));
    root.setProperty('--w-storm', p.storm.toFixed(3));
    root.setProperty('--w-shrink', p.shrink.toFixed(3));
    root.setProperty('--w-morph', p.morph.toFixed(3));
    root.setProperty('--w-recede', p.recede.toFixed(3));
    root.setProperty('--w-reveal', p.reveal.toFixed(3));
    root.setProperty('--w-exit', p.exit.toFixed(3));
    root.setProperty('--w-churn', p.churn.toFixed(3));
    root.setProperty('--w-travel', p.travel.toFixed(3));
    root.setProperty('--w-flash-a', p.flashA.toFixed(3));
    root.setProperty('--w-flash-b', p.flashB.toFixed(3));
    root.setProperty('--world-leave', p.leaveOp.toFixed(3));
    root.setProperty('--world-settled', settled.toFixed(3));
    root.setProperty('--world-handoff', handoff.toFixed(3));
  }

  /* ── The genie, applied ──
     Three writes and a clip. The bubble's own paint is deliberately NOT the
     clip's job: the water is clipped to the bubble's exact silhouette and the
     real bubble's gradient cross-fades in over it at --genie-hand, so by the
     time the layer unmounts there is nothing left to hand over — the two are
     the same shape in the same place in the same colour. Fading one out and
     the other in is what would make the seam visible. */
  function applyGenie(g) {
    const root = document.documentElement.style;
    const layer = g && layerFor(g.v.from);
    /* Unarmed — reduced motion, or a thread we couldn't measure. The bubble
       has to go back to painting itself, everywhere: leaving --genie-hand on
       the ramp would hide it against a room that is now arriving by a plain
       fade with nothing to hand it over. */
    if (!g || !g.armed) {
      root.setProperty('--w-genie', g ? g.p.toFixed(3) : '0');
      root.setProperty('--genie-tint', '0');
      root.setProperty('--genie-hand', '1');
      root.setProperty('--genie-text', '1');
      if (layer) layer.style.clipPath = '';
      return;
    }
    root.setProperty('--w-genie', g.p.toFixed(3));
    root.setProperty('--genie-tint', g.tint.toFixed(3));
    root.setProperty('--genie-hand', g.hand.toFixed(3));
    root.setProperty('--genie-text', g.text.toFixed(3));
    if (layer) layer.style.clipPath = g.clip || '';
  }

  /* Reduced motion, or a bubble we couldn't measure: there's no shape, so the
     passage can't be a collapse. It degrades to the plain cross-fade the other
     voids use — the room still arrives, it just arrives by fading. */
  function genieUsable(g) {
    return !!(g && g.armed);
  }

  /* Which DOM scenery is mounted, and in what role.
     Mid-passage BOTH of the passage's worlds are live — the one you're falling
     out of is still swelling toward the camera while the one you're falling
     into is already there behind the storm. Everywhere else it's just the
     current world, because two full-screen noise compositions is the budget.

     ⚠️ `crossing` mounts the ACTIVE VOID'S two worlds, not every layer on the
     page. It used to mean "all of them", which was indistinguishable while
     there were only two worlds and exactly one passage; with three it puts the
     dust planet back on screen underneath the ocean draining away.

     Three roles, and which one applies is the passage's decision:
       entering  fades in OVER the outgoing world  (storm / plain cross-fade)
       beneath   sits at full strength UNDER it, waiting to be uncovered
                 (the genie — the room is revealed by the water leaving, so
                 fading it in as well would just wash the water out)
       leaving   fades OUT, for a passage whose destination has no layer at all
                 (`deep` is open field: nothing to fade in, so the thing that
                 has to move is the room you're leaving) */
  function applyLive(sky, active, into, useGenie) {
    const crossing = !!active;
    /* While a void owns the reading line the pan is being transformed every
       scroll frame, so styles.css pauses the scene's ambient loops (limb
       shimmer, cloud/dust drifts) on this class — the same trick the intro's
       dust-intro-pending uses, and for the same reason: a subtree that never
       invalidates is one the compositor can move as a cached texture. Toggling
       to the same state is a no-op, so the body-class MutationObserver above
       doesn't feed back. */
    document.body.classList.toggle('is-world-crossing', crossing);
    const pair = crossing ? [active.from, active.to] : [sky];
    const genie = crossing && active.passage === 'genie' && useGenie;
    const incomingHasLayer = !!layerFor(into);
    for (const el of document.querySelectorAll('.world-layer')) {
      const w = el.dataset.world;
      el.classList.toggle('is-live', pair.indexOf(w) !== -1);
      el.classList.toggle('is-entering',
        crossing && w === into && !genie && incomingHasLayer);
      el.classList.toggle('is-beneath', genie && w === into);
      el.classList.toggle('is-leaving',
        crossing && !incomingHasLayer && w === active.from);
    }
  }

  function update() {
    ticking = false;
    // ⚠️ RESET on the way into dormancy, don't just bail. Leaving the last
    // frame's values in place strands whatever the passage was mid-way through
    // — open a section page from inside a void and you come back to the home
    // hero with the far world still mounted at 96% opacity over it. The state
    // has to be cleared by whoever stops driving it.
    if (dormant()) {
      if (lastDim !== -2) {
        lastDim = -2;
        document.body.classList.remove('is-world-crossing');
        applyPassage(AT_REST, 1, 0);
        applyGenie(null);
        for (const el of document.querySelectorAll('.world-layer')) {
          el.classList.remove('is-entering', 'is-beneath', 'is-leaving');
          el.style.clipPath = '';
        }
      }
      return;
    }
    if (lastDim === -2) lastDim = -1;   // force the next dim write through
    const { sky, dim, settled, handoff, into, active, genie, phase } = resolve();
    applySky(sky);
    applyDim(dim);
    applyPassage(phase, settled, handoff);
    applyGenie(genie);
    applyLive(sky, active, into, genieUsable(genie));
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  /* ── Wiring ──
     Same shape as js/subnav.js: re-derive from DOM state rather than being
     told. Reduced motion does NOT switch the director off — only grid.js's
     warp is skipped (it hard-cuts instead), and a dormant director would leave
     reduced-motion visitors reading ocean content under a dust planet. */
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(feed);
  new MutationObserver(schedule).observe(document.body,
    { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(schedule).observe(feed,
    { attributes: true, subtree: true, attributeFilter: ['hidden'] });

  // Resolve once synchronously so body[data-sky] is correct before js/grid.js
  // parses and reads it.
  if (!dormant()) {
    const first = resolve();
    applySky(first.sky);
    applyDim(first.dim);
    applyPassage(first.phase, first.settled, first.handoff);
    applyGenie(first.genie);
    applyLive(first.sky, first.active, first.into, genieUsable(first.genie));
  }

  window.worlds = {
    // closeSectionPage() in js/main.js asks for this instead of passing null:
    // returning from Writing while parked in the ocean chapter must not snap
    // the sky back to the dust world.
    currentSky() { return dormant() ? null : resolve().sky; },
    tune: TUNE,
    // Live knobs for the ocean→message collapse, e.g. worlds.genie.neck = 0.9
    // or worlds.genie.drainEnd = 0.7 (then scroll) to feel the acts re-time.
    genie: GENIE,
    refresh: schedule,
    reduced,
  };
})();
