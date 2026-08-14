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
    /* Descent intro — the camera comes DOWN out of space onto the planet. */
    panHold:    900,   // ms of quiet space before the camera starts down. A
                       // breath that lets the star field register, not the
                       // 2.8s storm hold this used to be — that weather moved
                       // to the descent INTO the planet (see runDustIntro).
    panDur:     2500,  // ms of camera descent…
    panSettle:  500,   // …plus a settle back from a -1.2vh undershoot
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
    /* ── Ocean (#oceanScene) ──
       Marine snow is PARTICULATE, not haze: a high base frequency with few
       octaves gives separated specks rather than the smeared cloud the dust
       layers want, and a steep slope on a deep offset keeps only the brightest
       tips so most of the tile stays empty water. */
    /* ⚠️ `off` is the density knob and it is very sensitive. Alpha is
       roughly slope × noise + off, and fractalNoise sits around 0.5 — so at
       off ≈ -slope×0.6 only the top fifth of the field survives as specks.
       Back it off toward -slope×0.5 and the tile fills in until it reads as
       television static rather than drift. */
    snowFar:  { size: 1600, freq: 0.16, oct: 1, seed: 12, rgb: [196, 232, 240], slope: 3.4, off: -2.62 },
    snowMid:  { size: 1200, freq: 0.20, oct: 1, seed: 38, rgb: [214, 244, 250], slope: 3.6, off: -2.80 },
    snowNear: { size: 800,  freq: 0.26, oct: 1, seed: 55, rgb: [232, 250, 255], slope: 3.8, off: -2.98 },
    /* Caustics: the two-axis freq form again, but stretched the other way from
       the cloud decks — a lower Y frequency draws the long vertical shafts
       light makes coming down through a moving surface. */
    caustics: { size: 1400, freq: '0.010 0.0016', oct: 3, seed: 91, rgb: [180, 240, 252], slope: 1.5, off: -0.52 },
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

  // The ocean world's textures. Painted here rather than in a module of its
  // own so there's exactly one noise generator in the codebase — but keyed off
  // its own element, because #oceanScene is a sibling of #heroScene, not a
  // child, and the query above is scoped to the dust scene.
  const oceanScene = document.getElementById('oceanScene');
  if (oceanScene) {
    const obg = (sel, params) => {
      const el = oceanScene.querySelector(sel);
      if (el) el.style.backgroundImage = noiseURI(params);
    };
    obg('.os-snow--far .os-drift', NOISE.snowFar);
    obg('.os-snow--mid .os-drift', NOISE.snowMid);
    obg('.os-snow--near .os-drift', NOISE.snowNear);
    obg('.os-caustics .os-drift', NOISE.caustics);
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
    const billingEl = document.getElementById('introBilling');
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

    // ── The storm beat is NOT here any more ──
    // The swirls, gusts and bolts used to fill a 2.8s hold, which only worked
    // because the camera started buried below the horizon with the dust
    // covering the frame. The camera now opens in clean space ABOVE the planet,
    // where all of that would either be off-screen (the dust is masked to below
    // the horizon) or nonsense (lightning in orbit). The weather moved to the
    // one place you're actually inside it: the descent INTO the planet, driven
    // by the --w-* scroll positions in styles.css. These elements stay in the
    // markup and are simply inert until then.
    //
    // ⚠️ The intro must NOT write inline opacity on them to say so. Every one
    // of these already rests at opacity 0 in the stylesheet and is lit by a
    // calc() off --w-storm; an inline `opacity: 0` outranks that calc, so
    // parking them here left the whole storm — veil, churn and lightning —
    // permanently switched off for anyone whose intro ran. (It only looked
    // fine because the styles were later cleared by the wrap-up below, which
    // silently made the bug depend on how fast you scrolled.)

    // ── The descent ──
    // panStart is POSITIVE, so the scene begins pushed down out of frame and
    // eases UP to rest — which reads as the camera coming DOWN onto the planet.
    // The overshoot goes the other way with it: undershoot slightly past rest
    // and settle back, so the camera lands rather than stops dead.
    anime({
      targets: panEl,
      translateY: [
        { value: [panStart, '-1.2vh'], duration: PAN, easing: ease },
        { value: '0vh', duration: CFG.panSettle, easing: 'easeOutQuad' },
      ],
      delay: HOLD,
    });

    // Dust rises into frame under the limb — nearer layers travel further
    // (parallax). ⚠️ Offsets are POSITIVE: the haze is arriving from below with
    // the planet, not streaming down past the lens. It also arrives FAINT and
    // stays faint; the thick version of these layers is what the descent
    // through the atmosphere ramps up later.
    const sweeps = [
      [dustNear, '48vh', 0.04, 0.07, PAN - 300, HOLD - 100],
      [dustMid, '34vh', 0.07, 0.14, PAN, HOLD],
      [dustFar, '22vh', 0.10, 0.22, PAN + 400, HOLD + 120],
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

    // The veil stays clear — we're not in the storm; see the note above. Its
    // rest state is the stylesheet's, so there is nothing to do here.

    // Stars are the FIRST thing, not the last: the opening frame is space, so
    // the field has to be there before the camera starts moving. (It used to
    // wait until the dust cleared near the end of the pan.)
    setTimeout(() => { revealStars(); revealStatus(); }, 60);
    // ⚠️ No bloom tween. .hs-atmo-bloom is the body's CONCENTRIC rim glow now
    // and is keyed off --w-shrink, so it belongs to the passage, not the intro
    // — fading it up here left a teal ring around the hero's giant planet
    // (inline opacity again outranking the calc) until the wrap-up cleared it.

    // Gusts belong to the storm, and the storm belongs to the descent — see
    // the note above the swirls. Their rest position and opacity are the
    // stylesheet's too; these are not in `sceneEls`, so an inline style written
    // here would never be cleared and would disable them for the whole session.

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
    // Billing block lands last, like the credit line settling under a poster's
    // tagline once the rest of the lockup has landed.
    if (billingEl) {
      anime({
        targets: billingEl,
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 600,
        delay: HOLD + PAN + 750,
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
      [greeting, descEl, billingEl, avatarWrap].forEach((el) => { if (el) el.removeAttribute('style'); });
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
