/* Hero entrance — layered fade-on for the home page.
 *
 * On load the hero starts blank and its pieces fade on in sequence: the
 * starfield and status bar (clock/temp/icons) ramp in first, the avatar
 * photo follows, and the intro copy trails it a beat later. Pure opacity
 * transitions, so it behaves identically in every browser.
 *
 * (This is the fade-on that used to live inside the tabled rocket-favicon
 * animation, lifted out so the entrance survives on its own — see the
 * rocket-favicon-archive branch for the original.)
 */
(function () {
  'use strict';

  /* ── Tunables ─────────────────────────────────────────── */
  const CFG = {
    startDelay: 60,    // ms after DOM ready before the reveal kicks off
    heroFade:   750,   // ms for the hero photo + text to fade on
    heroStagger:420,   // ms the copy trails the photo when fading on
    heroDelay:  260,   // ms the hero reveal waits after the stars begin
    starsFade:  700,   // ms for the starfield canvas to light up (the stars
                       // themselves fly out via the hyperspace-entrance in
                       // grid.js, so this is just the stage light coming up)
    statusFade: 1400,  // ms for the status bar to fade in with the stars
  };

  /* Respect reduced-motion: leave every element at its resting opacity. */
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  /* Only run on a page that actually has the hero. */
  if (!document.getElementById('heroSection')) return;

  /* ── Hero photo + copy: hidden now, revealed in two beats ──
   * The avatar photo fades on first. A beat later the intro copy *types* on
   * (greeting then description, char by char), while any classic-layout greeting
   * (`.greet-text`) simply fades. Fading each element's own opacity multiplies
   * with the scroll-driven container opacity, so we clear the inline styles
   * afterwards to leave scroll behaviour untouched. */
  const heroPhotoEls = [document.getElementById('avatarImg')].filter(Boolean);
  // `.intro-copy` (the h1) is the copy we type on; `.greet-text` is the classic
  // layout's duplicate greeting (hidden in starfield) — it only fades.
  const introCopy = document.querySelector('.intro-copy');
  const typeTarget = introCopy && introCopy.querySelector('.description') ? introCopy : null;
  const heroTextEls = [
    typeTarget ? null : introCopy,
    document.querySelector('.greet-text'),
  ].filter(Boolean);
  const heroFadeEls = heroPhotoEls.concat(heroTextEls);
  // Start blank with NO transition so they snap to invisible instead of
  // animating a visible fade-off — the fade transition is attached only at
  // reveal time, so these purely fade ON. The type target is hidden the same
  // way; its text is cleared and typed at reveal (see runTypewriter).
  heroFadeEls.concat(typeTarget ? [typeTarget] : []).forEach((n) => {
    n.style.transition = 'none';
    n.style.opacity = '0';
  });

  /* Chat dock: collapse to just the circular send button now (snapped, with no
   * transition so it doesn't animate down from the full pill), then bloom it
   * out from the center as the copy finishes typing (see revealDock). */
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
        if (i >= seg.text.length) { si += 1; setTimeout(typeSeg, 140); return; }
        const ch = seg.text.charAt(i - 1);
        let d = 14 + Math.random() * 24;
        if (ch === ',') d += 110;
        if (ch === '.' || ch === '!' || ch === '?') d += 200;
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
      'width 0.5s cubic-bezier(0.16,1,0.3,1), padding 0.5s cubic-bezier(0.16,1,0.3,1), ' +
      'transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease';
    requestAnimationFrame(() => { chatDock.classList.remove('dock-enter'); });
    setTimeout(() => { chatDock.style.transition = ''; }, 640);
  }

  let heroRevealed = false;
  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    // hold a beat, then photo, then the copy types on (or fades, classic layout)
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
        // Classic layout (no typing): the copy just fades, so bloom the dock in
        // once that fade is roughly complete.
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
    // only at reveal so the stars purely fade ON.
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
   * alongside the stars. We fade the containers, then clear the inline styles
   * so each element returns to its own resting opacity (the clock rests dim at
   * 0.42, the icons at their own values) — untouched afterwards. */
  const statusEls = [
    document.querySelector('.corner-status'),
    document.querySelector('.topBar-actions'),
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

  /* ── Kick off ──
   * Wait for the browser to paint the blank state (a couple of frames), then a
   * short beat, so the fades animate up from 0 instead of snapping. */
  function start() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => { revealStars(); revealStatus(); revealHero(); }, CFG.startDelay);
    }));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
