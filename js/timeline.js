/**
 * Career timeline — horizontal scroll-jacked rail.
 *
 * #tlScroll is a tall wrapper; #tlPin is its sticky (position: sticky) child.
 * While the wrapper scrolls past, the pin stays stuck in the viewport and
 * #tlTrack is translated horizontally in lockstep with how far the wrapper
 * has scrolled — so ordinary vertical scrolling reads as the rail sweeping
 * left, most-recent-role-first. Progress is derived purely from
 * #tlScroll's own getBoundingClientRect().top, so it doesn't matter what
 * else on the page is scrolling or how tall anything above it is.
 *
 * A fixed focus point ("beam") sits at the pin's horizontal center.
 * Once a node/card's center has reached it, it gains `.is-lit` (glow +
 * logo reveal on the node, a fade/rise-in on the card) — same idea as the
 * old vertical version, just read off horizontal rects instead of vertical
 * ones (no scrollY math needed: while pinned, elements' viewport-relative
 * rects already reflect their true on-screen position).
 *
 * On narrow viewports or prefers-reduced-motion, the pin never engages —
 * #tlPin instead stays a plain native horizontally-scrollable strip (see
 * the default, non-`.tl-scroll--pinned` rules in styles.css) that users
 * swipe through directly, and lighting is driven off its native `scroll`
 * event instead of the pin/translate math.
 */
(function () {
  const scrollWrap = document.getElementById('tlScroll');
  if (!scrollWrap) return;

  const pin = document.getElementById('tlPin');
  const track = document.getElementById('tlTrack');
  const railFill = document.getElementById('tlRailFill');
  const rail = pin ? pin.querySelector('.tl-rail') : null;
  if (!pin || !track || !railFill || !rail) return;

  // Minimum sticky offset (clears the fixed topBar; the CSS default for
  // --tl-pin-top). measure() then raises pinTop to vertically center the frozen
  // heading+rail block in the viewport, so it doesn't sit top-heavy with dead
  // space beneath while you scroll through it.
  const PIN_TOP_MIN = 88;
  let pinTop = PIN_TOP_MIN;
  // How far into the pin's width the focus point sits. Sourced from the CSS
  // custom property so the lead-in runway (--tl-lead-in) stays derived from the
  // same number. 0.5 = the strip's horizontal center, i.e. a node/card lights
  // exactly when it's centered on screen.
  const beamRatio = parseFloat(
    getComputedStyle(scrollWrap).getPropertyValue('--tl-beam-ratio'));
  const BEAM_RATIO = Number.isFinite(beamRatio) ? beamRatio : 0.5;

  const nodeGroups = Array.from(track.querySelectorAll('.tl-group')).map(group => ({
    group,
    node: group.querySelector('.tl-node'),
  })).filter(g => g.node);

  const cards = Array.from(track.querySelectorAll('.tl-position'));

  // Brand-color glow: same crossfade-between-companies approach as before,
  // just measured along X instead of Y.
  const glowGroups = Array.from(track.querySelectorAll('.tl-group[data-glow]')).map(el => ({
    el,
    color: el.dataset.glow.split(',').map(Number),
  }));

  function lerpColor(a, b, t) {
    return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
  }

  function updateGlow(beamX) {
    if (!glowGroups.length) return;
    const spans = glowGroups.map(g => {
      const r = g.el.getBoundingClientRect();
      return { left: r.left, right: r.left + r.width };
    });
    let color = glowGroups[0].color;
    for (let i = 0; i < spans.length; i++) {
      if (beamX < spans[i].left) {
        if (i > 0) {
          const gapLeft = spans[i - 1].right;
          const gapRight = spans[i].left;
          const t = gapRight > gapLeft
            ? Math.max(0, Math.min(1, (beamX - gapLeft) / (gapRight - gapLeft)))
            : 0;
          color = lerpColor(glowGroups[i - 1].color, glowGroups[i].color, t);
        }
        break;
      }
      color = glowGroups[i].color;
      if (beamX <= spans[i].right) break;
    }
    scrollWrap.style.setProperty('--tl-glow', color.join(', '));
  }

  function lightAll() {
    const pinRect = pin.getBoundingClientRect();
    const beamX = pinRect.left + pinRect.width * BEAM_RATIO;

    updateGlow(beamX);

    const railRect = rail.getBoundingClientRect();
    const filled = Math.max(0, Math.min(railRect.width, beamX - railRect.left));
    railFill.style.width = filled + 'px';

    for (const { node, group } of nodeGroups) {
      const r = node.getBoundingClientRect();
      const lit = r.left + r.width / 2 <= beamX;
      if (group.classList.contains('is-lit') !== lit) group.classList.toggle('is-lit', lit);
    }

    for (const card of cards) {
      const r = card.getBoundingClientRect();
      const lit = r.left + r.width / 2 <= beamX;
      if (card.classList.contains('is-lit') !== lit) card.classList.toggle('is-lit', lit);
    }
  }

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wideQuery = window.matchMedia('(min-width: 641px)');

  let maxTranslate = 0;
  let pinned = false;

  function measure() {
    // Translate far enough that the LAST node sweeps all the way to the focus
    // beam — so the rail fills 100% (and every card lights) before the pin
    // releases and vertical scroll resumes. offsetLeft is layout-based, so it's
    // unaffected by the track's current translate.
    const last = nodeGroups.length ? nodeGroups[nodeGroups.length - 1] : null;
    if (last) {
      const beamLocal = pin.clientWidth * BEAM_RATIO;
      const lastNodeLocal = last.group.offsetLeft + last.node.offsetLeft + last.node.offsetWidth / 2;
      maxTranslate = Math.max(0, lastNodeLocal - beamLocal);
    } else {
      maxTranslate = Math.max(0, track.scrollWidth - pin.clientWidth);
    }
    if (pinned) {
      // Center the frozen block vertically: raise the sticky offset so the
      // heading+cards sit mid-viewport instead of hugging the top. offsetHeight
      // is the block's own height (heading + tallest card), independent of the
      // offset, so there's no circularity.
      pinTop = Math.max(PIN_TOP_MIN, Math.round((window.innerHeight - pin.offsetHeight) / 2));
      scrollWrap.style.setProperty('--tl-pin-top', pinTop + 'px');
      scrollWrap.style.height = (maxTranslate + pin.offsetHeight) + 'px';
    }
  }

  function setPinned(on) {
    if (on === pinned) return;
    pinned = on;
    scrollWrap.classList.toggle('tl-scroll--pinned', on);
    if (on) {
      pin.scrollLeft = 0;
    } else {
      track.style.transform = '';
      scrollWrap.style.height = '';
    }
    measure();
  }

  function updatePinnedProgress() {
    if (!pinned) return;
    const wrapRect = scrollWrap.getBoundingClientRect();
    const progress = maxTranslate > 0
      ? Math.max(0, Math.min(1, (pinTop - wrapRect.top) / maxTranslate))
      : 0;
    track.style.transform = `translate3d(${(-progress * maxTranslate).toFixed(1)}px, 0, 0)`;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updatePinnedProgress();
      lightAll();
    });
  }

  // Fallback mode: the browser does the real scrolling on #tlPin itself —
  // just recompute lighting whenever that happens.
  pin.addEventListener('scroll', () => requestAnimationFrame(lightAll), { passive: true });

  function applyMode() {
    setPinned(wideQuery.matches && !reduceMotionQuery.matches);
    lightAll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { measure(); onScroll(); });
  window.addEventListener('load', () => { measure(); lightAll(); });
  if (wideQuery.addEventListener) {
    wideQuery.addEventListener('change', applyMode);
    reduceMotionQuery.addEventListener('change', applyMode);
  }

  applyMode();
})();
