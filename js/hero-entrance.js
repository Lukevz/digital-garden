/* Hero entrance — the "For All Mankind" dust-storm launch intro.
 *
 * First visit each session, the home page paints fully inside a tan dust
 * storm (body.dust-intro-pending, applied by an inline gate script in
 * _index.html before first paint), holds a beat, then the camera tilts up
 * (#heroScenePan translateY) until it's level with the planet horizon —
 * stars and status chrome fade in as the dust clears, and the HELLO lockup
 * tracks in where the rocket would be. Approved values live in
 * _reference/hero-prototype.html (direction B, "Tempest").
 *
 * Returning visitors this session, reduced-motion users, and section-page
 * deep links skip the pan (the gate never adds the class, so the end-state
 * composition is the first paint) and get the original quick fade-on.
 */
(function () {
  'use strict';

  /* ── Hero variant B toggle ──
   * Shorter (65vh) hero + a perspective-style starfield (see body.hero-v2 in
   * styles.css and the perspective branch in grid.js), kept alongside the
   * original so the two can be compared live. `hero.variant(true)` switches
   * to the short/perspective version, `hero.variant(false)` back to the
   * original; both persist via localStorage and reload (the class is read at
   * load by grid.js's cell build, so it isn't hot-swappable in place). Matches
   * the ?chatmock=1 / chat.mock() pattern in js/chat.js. */
  window.hero = {
    variant: function (v2) {
      try {
        if (v2) localStorage.setItem('heroVariant', 'v2');
        else localStorage.removeItem('heroVariant');
      } catch (e) {}
      location.reload();
    },
    /* Re-run the dust-storm intro (tuning aid). */
    replay: function () {
      try { sessionStorage.removeItem('heroIntroPlayed'); } catch (e) {}
      location.reload();
    },
  };

  /* ── Tunables ─────────────────────────────────────────── */
  const CFG = {
    startDelay: 60,    // ms after DOM ready before the reveal kicks off
    heroFade:   750,   // ms for the hero photo + text to fade on (skip path)
    heroStagger:420,   // ms the copy trails the photo when fading on
    heroDelay:  260,   // ms the hero reveal waits after the stars begin
    starsFade:  700,   // ms for the starfield canvas to light up
    statusFade: 1400,  // ms for the status bar to fade in with the stars
    /* Dust intro (Tempest timings from the approved prototype) */
    panHold:    2800,  // ms fully inside the storm before the camera moves —
                       // long enough for the swirls to turn and the cloud to
                       // strike three times (see STRIKES in runDustIntro).
                       // Shorten this and the strike table shortens with it.
    panDur:     2500,  // ms of camera tilt…
    panSettle:  500,   // …plus a settle back from a 1.4vh overshoot
    panEase:    [0.6, 0.02, 0.16, 1],
  };

  /* ── Procedural noise (SVG feTurbulence baked into data URIs) ──
   * Tint is baked in via feColorMatrix (slope/off shape the alpha curve);
   * stitchTiles makes the tile seamless so the CSS drift loops can travel
   * exactly one tile with no visible wrap. Params are the approved
   * "Tempest" set from the prototype's DIRS.B. */
  function noiseURI(p) {
    const size = p.size || 900;
    const rgb = p.rgb.map((v) => (v / 255).toFixed(3));
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "'>" +
      "<filter id='f' x='0' y='0' width='100%' height='100%'>" +
      "<feTurbulence type='fractalNoise' baseFrequency='" + p.freq + "' numOctaves='" + p.oct + "' seed='" + p.seed + "' stitchTiles='stitch'/>" +
      "<feColorMatrix type='matrix' values='0 0 0 0 " + rgb[0] + " 0 0 0 0 " + rgb[1] + " 0 0 0 0 " + rgb[2] + " " + p.slope + " 0 0 0 " + p.off + "'/>" +
      "</filter><rect width='" + size + "' height='" + size + "' filter='url(%23f)'/></svg>";
    return 'url("data:image/svg+xml,' + svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E') + '")';
  }
  const NOISE = {
    near:    { freq: 0.0045, oct: 5, seed: 19, rgb: [206, 164, 120], slope: 1.5,  off: -0.26 },
    mid:     { freq: 0.0033, oct: 5, seed: 44, rgb: [166, 124, 86],  slope: 1.35, off: -0.28 },
    far:     { freq: 0.0022, oct: 4, seed: 3,  rgb: [110, 78, 52],   slope: 1.1,  off: -0.34 },
    /* Warm mid-tone, not the near-black it used to be: on the pale apricot
       planet a dark soft-light mottle reads as dirt rather than terrain. */
    surface: { freq: 0.0026, oct: 5, seed: 9,  rgb: [138, 102, 70],  slope: 1.45, off: -0.32 },
    grain:   { size: 280, freq: 0.9, oct: 2, seed: 2, rgb: [255, 255, 255], slope: 0.9, off: -0.3 },
    /* Cloud decks. `freq` takes SVG's two-axis form here: a LOWER X frequency
       than Y stretches the features horizontally, which is what turns blobby
       fractal noise into latitude bands. Warm near-white so they read as lit
       cloud over the tan surface under mix-blend-mode: screen. */
    clouds:  { size: 1600, freq: '0.0016 0.0085', oct: 5, seed: 27, rgb: [255, 250, 242], slope: 1.5, off: -0.38 },
    wisps:   { size: 1100, freq: '0.0029 0.0145', oct: 4, seed: 61, rgb: [255, 253, 249], slope: 1.35, off: -0.44 },
    /* Storm wash texture — highest-contrast set in the scene (steep slope,
       shallow offset) because it sits under a 70%-opacity veil and an
       overlay blend, both of which flatten it out again. */
    veilTex: { size: 1200, freq: '0.0026 0.0058', oct: 5, seed: 77, rgb: [236, 202, 158], slope: 1.6, off: -0.18 },
  };

  const heroScene = document.getElementById('heroScene');
  if (heroScene) {
    const bg = (sel, params) => {
      const el = heroScene.querySelector(sel);
      if (el) el.style.backgroundImage = noiseURI(params);
    };
    bg('.hs-dust--near .hs-drift', NOISE.near);
    bg('.hs-dust--mid .hs-drift', NOISE.mid);
    bg('.hs-dust--far .hs-drift', NOISE.far);
    bg('.hs-planet-surface', NOISE.surface);
    bg('.hs-planet-clouds', NOISE.clouds);
    bg('.hs-planet-wisps', NOISE.wisps);
    bg('.hs-veil-tex', NOISE.veilTex);
    bg('.hs-grain', NOISE.grain);
  }

  /* Respect reduced-motion: leave every element at its resting opacity (the
   * gate script never adds dust-intro-pending under reduced motion, so the
   * scene is already at its end state too). */
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  /* Only run on a page that actually has the hero. */
  if (!document.getElementById('heroSection')) return;

  /* The dust intro runs when the gate script armed it AND the pieces exist.
   * If anime.js failed to load (CDN), fall back to the end state + quick
   * fades rather than stranding the page inside the storm. */
  let dustIntro = document.body.classList.contains('dust-intro-pending');
  if (dustIntro && (!heroScene || !window.anime)) {
    document.body.classList.remove('dust-intro-pending');
    dustIntro = false;
  }

  /* ── Hero photo + copy: hidden now, revealed in two beats ──
   * (Skip path only — during the dust intro the copy is start-state hidden
   * by the pending class and revealed by the anime timeline instead.) */
  // Empty during the dust intro for the same reason as heroTextEls below: the
  // avatar rides in on the anime timeline (as part of .clock-hero-wrap), and an
  // inline opacity:0 that nothing on that path ever clears would strand it.
  const heroPhotoEls = dustIntro ? [] : [document.getElementById('avatarImg')].filter(Boolean);
  const introCopy = document.querySelector('.intro-copy');
  const dustHero = document.body.classList.contains('dust-hero');
  // The typewriter belongs to the old lockup; the dust hero's copy fades
  // (skip path) or tracks in via the intro timeline instead.
  const typeTarget = !dustHero && introCopy && introCopy.querySelector('.description') ? introCopy : null;
  const heroTextEls = dustIntro ? [] : [
    typeTarget ? null : introCopy,
    document.querySelector('.greet-text'),
  ].filter(Boolean);
  const heroFadeEls = heroPhotoEls.concat(heroTextEls);
  heroFadeEls.concat(typeTarget ? [typeTarget] : []).forEach((n) => {
    n.style.transition = 'none';
    n.style.opacity = '0';
  });

  /* Chat dock: collapse to just the circular send button now (snapped, with no
   * transition so it doesn't animate down from the full pill), then bloom it
   * out from the center at the end of the entrance (see revealDock). */
  const chatDock = document.getElementById('chatDock');
  if (chatDock) {
    chatDock.classList.add('dock-enter');
    chatDock.style.transition = 'none';
    void chatDock.offsetWidth;   // lock the collapsed state before the bloom
    chatDock.style.transition = '';
  }

  /* Blinking caret used while the copy types on. */
  if (typeTarget) {
    const caretStyle = document.createElement('style');
    caretStyle.textContent =
      '.type-caret{display:inline-block;width:.06em;min-width:2px;height:1em;' +
      'background:currentColor;margin-left:.06em;vertical-align:-0.12em;' +
      'border-radius:1px;animation:typeBlink 1s steps(1) infinite}' +
      '@keyframes typeBlink{0%,49%{opacity:.85}50%,100%{opacity:0}}';
    document.head.appendChild(caretStyle);
  }

  /* Type the copy on. We measure the full block height first (while still
   * opacity:0) and pin it as min-height so typing doesn't reflow the layout,
   * then clear the greeting/description spans and fill them a char at a time.
   * Punctuation gets a slightly longer pause for a natural cadence. */
  function runTypewriter(el, onNearDone) {
    const segs = [];
    const greetSpan = el.querySelector('.intro-greeting');
    const descSpan = el.querySelector('.description');
    if (greetSpan) segs.push({ span: greetSpan, text: greetSpan.textContent });
    if (descSpan) segs.push({ span: descSpan, text: descSpan.textContent });
    if (!segs.length) {
      el.style.transition = ''; el.style.opacity = '';
      if (onNearDone) onNearDone();
      return;
    }

    // Fire onNearDone with ~this many chars still to type, so the dock's bloom
    // (~0.5s) lands right as the copy finishes rather than after it. If the
    // final segment is shorter than this, it fires at the segment's start.
    const NEAR_LEAD = 16;
    let nearFired = false;
    const fireNearDone = () => {
      if (nearFired) return;
      nearFired = true;
      if (onNearDone) onNearDone();
    };

    el.style.minHeight = el.offsetHeight + 'px';   // measured while full + hidden
    segs.forEach((s) => { s.span.textContent = ''; });
    const caret = document.createElement('span');
    caret.className = 'type-caret';
    el.style.transition = 'none';
    el.style.opacity = '1';                         // snap visible; chars reveal it

    let si = 0;
    (function typeSeg() {
      if (si >= segs.length) {
        fireNearDone();   // safety net if the lead threshold never tripped
        // Let the caret blink a moment, then tidy up so scroll opacity resumes.
        setTimeout(() => {
          if (caret.parentNode) caret.remove();
          el.style.minHeight = '';
          el.style.transition = '';
          el.style.opacity = '';
        }, 900);
        return;
      }
      const seg = segs[si];
      const isLast = si === segs.length - 1;
      let i = 0;
      seg.span.appendChild(caret);
      (function tick() {
        i += 1;
        seg.span.textContent = seg.text.slice(0, i);
        seg.span.appendChild(caret);
        if (isLast && i >= seg.text.length - NEAR_LEAD) fireNearDone();
        if (i >= seg.text.length) { si += 1; setTimeout(typeSeg, 60); return; }
        const ch = seg.text.charAt(i - 1);
        let d = 4 + Math.random() * 8;
        if (ch === ',') d += 40;
        if (ch === '.' || ch === '!' || ch === '?') d += 70;
        setTimeout(tick, d);
      })();
    })();
  }

  /* Bloom the dock out from the collapsed send button into the full pill. Gets
   * its own longer, eased transition; we clear it afterwards so the dock's
   * normal in-place grow (while the user types) keeps its snappy 0.2s timing. */
  let dockRevealed = false;
  function revealDock() {
    if (dockRevealed || !chatDock) return;
    dockRevealed = true;
    chatDock.style.transition =
      'width 0.5s cubic-bezier(0.16,1,0.3,1), ' +
      'transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease';
    // The pill's padding lives on the compose row, so the bloom has to slow
    // that down too or the row snaps open in 0.2s ahead of the width.
    const row = chatDock.querySelector('#chatDockRow');
    if (row) row.style.transition = 'padding 0.5s cubic-bezier(0.16,1,0.3,1)';
    requestAnimationFrame(() => { chatDock.classList.remove('dock-enter'); });
    setTimeout(() => {
      chatDock.style.transition = '';
      if (row) row.style.transition = '';
    }, 640);
  }

  /* The hero lockup is display:none on a section page (#writing / #videos /
   * #photos), so a deep link lands with nothing to reveal — and the scene is
   * hidden there too. Skip straight to the resting state and put the dock on
   * screen. */
  function heroHidden() {
    return !introCopy || introCopy.getClientRects().length === 0;
  }

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    if (heroHidden()) {
      heroFadeEls.concat(typeTarget ? [typeTarget] : []).forEach((n) => {
        n.style.transition = ''; n.style.opacity = '';
      });
      revealDock();
      return;
    }
    // hold a beat, then photo, then the copy types on (or fades)
    setTimeout(() => {
      heroPhotoEls.forEach((n) => {
        n.style.transition = 'opacity ' + CFG.heroFade + 'ms ease';
        n.style.opacity = '1';
      });
      setTimeout(() => {
        heroTextEls.forEach((n) => {
          n.style.transition = 'opacity ' + CFG.heroFade + 'ms ease';
          n.style.opacity = '1';
        });
        if (typeTarget) runTypewriter(typeTarget, revealDock);
        else setTimeout(revealDock, CFG.heroFade);
      }, CFG.heroStagger);
    }, CFG.heroDelay);
    const total = CFG.heroDelay + CFG.heroStagger + CFG.heroFade + 60;
    setTimeout(() => {
      heroFadeEls.forEach((n) => { n.style.transition = ''; n.style.opacity = ''; });
    }, total);
  }

  /* ── Starfield: hidden now, faded in over a long ramp ── */
  const starCanvas = document.getElementById('dotGrid');
  if (starCanvas) {
    // Start blank with NO transition (snap to invisible), attach the long fade
    // only at reveal so the stars purely fade ON. Inline (not just the pending
    // class) so the reveal transition has an inline 0 to animate away from.
    starCanvas.style.transition = 'none';
    starCanvas.style.opacity = '0';
  }
  let starsRevealed = false;
  function revealStars() {
    if (starsRevealed || !starCanvas) return;
    starsRevealed = true;
    starCanvas.style.transition = 'opacity ' + CFG.starsFade + 'ms ease';
    starCanvas.style.opacity = '1';
    setTimeout(() => {
      starCanvas.style.transition = '';
      starCanvas.style.opacity = '';
    }, CFG.starsFade + 60);
  }

  /* ── Status bar (clock / temp / action icons): hidden now, faded in
   * alongside the stars. During the dust intro the pending class holds them
   * at 0 instead, and the same reveal transitions them up when the camera
   * levels. */
  const statusEls = [
    document.querySelector('.corner-status'),
    document.querySelector('.topBar-actions'),
    document.querySelector('.topBar-center'),
  ].filter(Boolean);
  statusEls.forEach((n) => {
    n.style.transition = 'none';
    n.style.opacity = '0';
  });
  let statusRevealed = false;
  function revealStatus() {
    if (statusRevealed) return;
    statusRevealed = true;
    statusEls.forEach((n) => {
      n.style.transition = 'opacity ' + CFG.statusFade + 'ms ease';
      // Clear the inline opacity so it animates up to its stylesheet value.
      n.style.removeProperty('opacity');
    });
    setTimeout(() => {
      statusEls.forEach((n) => { n.style.transition = ''; });
    }, CFG.statusFade + 60);
  }

  /* ── The dust-storm intro timeline ────────────────────────────────────
   * The pending class holds the start state (camera down in the storm, veil
   * opaque, text/chrome/stars at 0). anime drives every scene layer to its
   * rest values, then the class is removed and all inline styles cleared so
   * the stylesheet owns the resting composition again. */
  function runDustIntro() {
    const panEl = document.getElementById('heroScenePan');
    const veil = heroScene.querySelector('.hs-veil');
    const bloom = heroScene.querySelector('.hs-atmo-bloom');
    const dustNear = heroScene.querySelector('.hs-dust--near');
    const dustMid = heroScene.querySelector('.hs-dust--mid');
    const dustFar = heroScene.querySelector('.hs-dust--far');
    const greeting = introCopy && introCopy.querySelector('.intro-greeting');
    const descEl = introCopy && introCopy.querySelector('.description');
    const avatarWrap = document.querySelector('.clock-hero-wrap');
    // The camera's start height lives in CSS (--pan-start on #heroScene) so it
    // can be tuned alongside --horizon; both must move together or the storm
    // stops covering the horizon at the start of the hold.
    const panStart = getComputedStyle(heroScene).getPropertyValue('--pan-start').trim() || '-65vh';
    const HOLD = CFG.panHold, PAN = CFG.panDur;
    const ease = 'cubicBezier(' + CFG.panEase.join(',') + ')';
    const swirls = Array.prototype.slice.call(heroScene.querySelectorAll('.hs-swirl'));
    const bolts = [document.getElementById('hsBolt1'), document.getElementById('hsBolt2')]
      .filter(Boolean);
    const sceneEls = [panEl, veil, bloom, dustNear, dustMid, dustFar]
      .concat(swirls, bolts);

    // ── Storm beat ──
    // The hold used to be dead air: an opaque tan wash sitting still. Now it
    // has weather in it — but weather watched from orbit, where nothing
    // happens fast. The whole beat is detail you notice rather than events
    // that grab you.
    //
    // Swirls turn only ~15° across the whole beat. Each turns a different
    // amount in a different direction — matched rotation across all three
    // would read as one disc spinning behind a mask.
    //
    // They're fully faded out BY the time the camera moves, rather than
    // riding into the pan as they used to. Three rotating full-viewport
    // layers on top of the pan (which is already moving the planet, three
    // dust sheets and the gusts) was more than a frame's budget, and the
    // churn has done its job by then anyway — the veil is going with it.
    const SWIRL_OUT = 900;   // ms of fade, landing on the pan's first frame
    swirls.forEach((el, i) => {
      const dir = i % 2 ? -1 : 1;
      anime({
        targets: el,
        rotate: [dir * -7, dir * (15 + i * 5)],
        scale: [0.95 + i * 0.02, 1.05],
        opacity: [
          { value: 0.34 - i * 0.07, duration: 1000, easing: 'easeOutQuad' },
          // Keyframe delays are relative to the previous keyframe's end, so
          // this lands every swirl's fade-out on HOLD regardless of its
          // stagger. Clamped in case panHold is tuned down below the beat.
          { value: 0, duration: SWIRL_OUT, delay: Math.max(0, HOLD - SWIRL_OUT - 1000 - i * 260), easing: 'easeInQuad' },
        ],
        // Trimmed by the stagger so every swirl completes exactly on HOLD.
        duration: Math.max(0, HOLD - i * 260),
        delay: i * 260,
        easing: 'linear',
        // Take the layer out of the tree the moment it's done. They carry
        // `will-change` (see styles.css) which pins a promoted layer per
        // swirl; leaving three of those parked at opacity 0 through the pan
        // costs GPU memory for nothing. The end-of-intro cleanup strips this
        // inline style along with the rest.
        complete: function () { el.style.display = 'none'; },
      });
    });

    // Distant discharges. `at` is ms into the hold; they alternate between the
    // two patches so a couple can overlap. Faint and irregular on purpose —
    // the far one is barely there, and no two share a brightness.
    const GLIMMERS = [
      { at: 560,  x: '26vw', y: '34vh', peak: 0.72 },
      { at: 1180, x: '69vw', y: '20vh', peak: 0.4 },
      { at: 1880, x: '44vw', y: '47vh', peak: 0.9 },
      { at: 2480, x: '15vw', y: '24vh', peak: 0.34 },
    ];
    // Bloom → settle → long fade, ~1.3s end to end. Still NOT the hard
    // attack/dip/re-strike envelope real lightning has: at this distance the
    // cloud diffuses all of that, and the sharp version reads as a strobe.
    // Brightness is what makes these register, not speed — so the peaks are
    // roughly doubled while the shape of the pulse stays soft.
    function glimmerKeys(peak) {
      return [
        { value: peak, duration: 240, easing: 'easeOutQuad' },
        { value: peak * 0.5, duration: 220, easing: 'easeInOutQuad' },
        { value: 0, duration: 860, easing: 'easeInOutQuad' },
      ];
    }
    if (bolts.length) {
      GLIMMERS.forEach((g, i) => {
        const el = bolts[i % bolts.length];
        setTimeout(() => {
          el.style.left = g.x;
          el.style.top = g.y;
          anime({ targets: el, opacity: glimmerKeys(g.peak) });
        }, g.at);
      });
    }

    // Camera tilt with a 1.4vh settle overshoot.
    anime({
      targets: panEl,
      translateY: [
        { value: [panStart, '1.4vh'], duration: PAN, easing: ease },
        { value: '0vh', duration: CFG.panSettle, easing: 'easeOutQuad' },
      ],
      delay: HOLD,
    });

    // Dust sweeps past the camera — nearer layers travel further (parallax).
    const sweeps = [
      [dustNear, '-88vh', 1, 0.07, PAN - 300, HOLD - 100],
      [dustMid, '-55vh', 0.9, 0.14, PAN, HOLD],
      [dustFar, '-30vh', 0.8, 0.22, PAN + 400, HOLD + 120],
    ];
    sweeps.forEach(([el, fromY, o0, o1, dur, delay]) => {
      if (!el) return;
      anime({
        targets: el,
        translateY: [fromY, '0vh'],
        opacity: [o0, o1],
        duration: dur,
        delay: Math.max(0, delay),
        easing: ease,
      });
    });

    // Storm veil thins away over ~75% of the pan.
    anime({ targets: veil, opacity: [0.7, 0], duration: PAN * 0.75, delay: HOLD, easing: 'easeInOutQuad' });

    // Sky comes alive as the dust clears; atmosphere blooms at the horizon.
    setTimeout(() => { revealStars(); revealStatus(); }, HOLD + PAN - 900);
    anime({ targets: bloom, opacity: [0.35, 1], duration: 1400, delay: HOLD + PAN - 500, easing: 'easeOutQuad' });

    // Two wind gusts whip across mid-pan (Tempest signature).
    [['hsGust1', HOLD + 300, '18vh'], ['hsGust2', HOLD + 900, '38vh']].forEach(([id, delay, top]) => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.top = top;
      anime({
        targets: g,
        translateX: ['0vw', '190vw'],
        opacity: [{ value: 0.85, duration: 275 }, { value: 0, duration: 825 }],
        duration: 1100,
        delay,
        easing: 'cubicBezier(0.3,0.1,0.3,1)',
      });
    });

    // Avatar lands first, then HELLO tracks in under it, then the subtitle.
    if (avatarWrap) {
      anime({
        targets: avatarWrap,
        opacity: [0, 1],
        translateY: [16, 0],
        scale: [0.86, 1],
        duration: 900,
        delay: HOLD + PAN - 420,
        easing: 'cubicBezier(0.16,1,0.3,1)',
      });
    }
    // HELLO tracks in as the camera levels; the subtitle follows.
    if (greeting) {
      anime({
        targets: greeting,
        opacity: [0, 1],
        letterSpacing: ['1.5em', '0.99em'],
        translateY: [14, 0],
        duration: 900,
        delay: HOLD + PAN - 150,
        easing: 'cubicBezier(0.16,1,0.3,1)',
      });
    }
    if (descEl) {
      anime({
        targets: descEl,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 700,
        delay: HOLD + PAN + 450,
        easing: 'cubicBezier(0.16,1,0.3,1)',
      });
    }

    // Wrap up: dock blooms, the pending class drops (releases will-change),
    // and inline styles are cleared so the stylesheet owns the rest state.
    setTimeout(() => {
      revealDock();
      try { sessionStorage.setItem('heroIntroPlayed', '1'); } catch (e) {}
      document.body.classList.remove('dust-intro-pending');
      sceneEls.forEach((el) => { if (el) el.removeAttribute('style'); });
      [greeting, descEl, avatarWrap].forEach((el) => { if (el) el.removeAttribute('style'); });
    }, HOLD + PAN + 1600);
  }

  /* ── Kick off ──
   * Wait for the browser to paint the start state (a couple of frames), then
   * a short beat, so everything animates up from its held state. */
  function start() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => {
        if (dustIntro && !heroHidden()) runDustIntro();
        else {
          if (dustIntro) {
            // Deep link straight to a section page: no visible hero to pan.
            document.body.classList.remove('dust-intro-pending');
          }
          revealStars(); revealStatus(); revealHero();
        }
      }, CFG.startDelay);
    }));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
