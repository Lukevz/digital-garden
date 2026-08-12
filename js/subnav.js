/* Sub nav — the second bar under #modeTab (see #subNav in _index.html).
 *
 * Scoped to the Career/home view for now. Once you've scrolled past the hero,
 * the bar hinges down on the same rotateX fold as the overflow panel
 * and shows this page's section anchors as a single static row, spaced
 * across the full width of the bar (space-between) so the first anchor sits
 * flush left, the last sits flush right, and there's no dead space at either
 * edge. The section you're actually in is darkened; everything else stays
 * greyed back.
 *
 * Its left/top/width are measured off #modeTab every frame it's visible, so
 * the two bars stay exactly the same width at any viewport.
 */
(function () {
  'use strict';

  const nav       = document.getElementById('subNav');
  const track     = document.getElementById('subNavTrack');
  const modeTab   = document.getElementById('modeTab');
  const belowFold = document.getElementById('belowFold');
  if (!nav || !track || !modeTab || !belowFold) return;

  const progress      = document.getElementById('subNavProgress');
  const heroSpacer    = document.querySelector('.hero-spacer');
  const overflowPanel = document.getElementById('overflowPanel');
  const sModal        = document.getElementById('sModal');
  const goo           = document.getElementById('navGoo');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Tunables ──
  // Viewport line that counts as "what you're reading" — a section is active
  // once its top has crossed this line.
  const ANCHOR   = 0.35;
  // The bar stays away until you've scrolled PAST the hero, and that can't be
  // measured off the feed. Home uses the reversed reveal (see _index.html):
  // .hero-spacer is the LAST thing in the document and the page opens pinned to
  // the end, so the feed sits ABOVE the hero and you scroll up into it. Any
  // "has a section risen up the viewport" test is therefore true from the first
  // paint, which is what put the bar over the hero.
  //
  // So measure the hero itself: show once the spacer overlaps no more than this
  // fraction of the viewport, i.e. the screen is essentially all feed. Works
  // whichever end of the document the hero is on.
  const HERO_LEFT = 0.15;
  const GAP      = 8;   // px between the bottom of #modeTab and the sub nav
  // #navGoo's <circle> centres are fixed at local y = 6 / 10 / 14 (see
  // _index.html) so its middle blob lands exactly halfway across GAP —
  // these two must stay in lockstep with that markup.
  const GOO_HALF_W     = 13;  // half of navGoo's 26px width
  const GOO_TOP_MARGIN = 6;   // local y of its top blob's centre

  let sections = [];    // section elements, in document order
  let buttons  = [];    // buttons[i] = the anchor button for section i
  let builtKey = '';    // section-id signature the current strip was built from
  let activeIndex = -1;
  let open = false, running = false;

  function labelFor(section) {
    if (section.dataset.navLabel) return section.dataset.navLabel;
    const title = section.querySelector('.home-section-title');
    return title ? title.textContent.trim() : '';
  }

  // Sections currently on the page. `hidden` ones (case studies / goals, which
  // JS unhides once their content loads) are skipped and picked up later by the
  // observer below.
  function visibleSections() {
    return Array.from(belowFold.querySelectorAll('.home-section'))
      .filter(s => !s.hidden && s.offsetParent !== null && labelFor(s));
  }

  // Land the section heading clear of the two fixed bars rather than tucked
  // under them, which is where a plain scrollIntoView({block:'start'}) puts it.
  function goTo(section) {
    const clearance = nav.getBoundingClientRect().bottom + 24;
    window.scrollTo({
      top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - clearance),
      behavior: reduced ? 'auto' : 'smooth'
    });
  }

  // Rebuilds the strip when the set of sections changes. Returns true if it did.
  function build() {
    const list = visibleSections();
    const key  = list.map(s => s.id || labelFor(s)).join('|');
    if (key === builtKey) return false;
    builtKey = key;

    sections = list;
    track.textContent = '';
    // Separators are extra flex children rather than decoration on the
    // buttons — space-between gives every gap (button↔sep and sep↔button)
    // the same width, so each dot lands centred between its neighbours.
    buttons = sections.map((section, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'subnav__sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '·';
        track.appendChild(sep);
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'subnav__item';
      el.textContent = labelFor(section);
      el.addEventListener('click', () => goTo(section));
      track.appendChild(el);
      return el;
    });

    activeIndex = -1;
    return true;
  }

  // How far down the whole document you are, 0 → 1. Drives the gradient bar on
  // the sub nav's bottom border.
  function scrollProgress() {
    const doc = document.documentElement;
    const max = (doc.scrollHeight || 0) - (window.innerHeight || doc.clientHeight || 0);
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, (window.scrollY || doc.scrollTop || 0) / max));
  }

  // Index of the section you're actually in — the last one whose top has
  // crossed the reading-head line.
  function readingHead() {
    const doc = document.documentElement;
    const vh  = window.innerHeight || doc.clientHeight || 1;

    // A short final section may never push its top up to the anchor line —
    // the page runs out of scroll room first, so the anchor test alone would
    // leave the previous section stuck "active" forever. Once you've hit the
    // bottom of the document, the last section is the one you're in, full stop.
    const atBottom = (window.scrollY || doc.scrollTop || 0) + vh >= (doc.scrollHeight || 0) - 2;
    if (atBottom) return sections.length - 1;

    const anchor = vh * ANCHOR;
    let idx = 0;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= anchor) idx = i;
      else break;
    }
    return idx;
  }

  // Every surface that isn't the home feed — a section page, work mode, the
  // overflow panel, an open modal — owns the screen itself, so the hero gate
  // doesn't apply and the chrome is always live.
  function feedIsTheView() {
    const b = document.body.classList;
    if (b.contains('work-mode') || b.contains('section-mode')
      || b.contains('overflow-mode') || b.contains('places-mode')
      || b.contains('chat-overlay-open')) return false;
    if (overflowPanel && overflowPanel.classList.contains('open')) return false;
    if (sModal && sModal.classList.contains('sm-open')) return false;
    return !belowFold.hidden;
  }

  // True while the hero is still the screen. Measured off .hero-spacer, which
  // carries the hero's scroll length (.hero itself is fixed), so this holds
  // whichever end of the document the reversed reveal puts it at.
  function heroOwnsScreen() {
    if (!feedIsTheView()) return false;
    if (!heroSpacer || heroSpacer.offsetParent === null) return false;
    const vh = window.innerHeight || document.documentElement.clientHeight || 1;
    const r = heroSpacer.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return overlap > vh * HERO_LEFT;
  }

  function shouldShow(onHero) {
    if (sections.length < 2) return false;
    if (!feedIsTheView()) return false;
    if (onHero) return false;
    // No spacer laid out to measure — fall back to the feed itself.
    if (!heroSpacer || heroSpacer.offsetParent === null) {
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      return sections[0].getBoundingClientRect().top < vh * 0.5;
    }
    return true;
  }

  // Keep the bar pinned under the top nav at exactly its width.
  function syncBox() {
    const r = modeTab.getBoundingClientRect();
    if (r.width < 1) return;
    nav.style.left  = r.left + 'px';
    nav.style.width = r.width + 'px';
    nav.style.top   = (r.bottom + GAP) + 'px';
    if (goo) {
      goo.style.left = (r.left + r.width / 2 - GOO_HALF_W) + 'px';
      goo.style.top  = (r.bottom - GOO_TOP_MARGIN) + 'px';
    }
  }

  function setActive(i) {
    if (i === activeIndex) return;
    if (buttons[activeIndex]) buttons[activeIndex].classList.remove('active');
    if (buttons[i]) buttons[i].classList.add('active');
    activeIndex = i;
  }

  function setOpen(next) {
    if (next === open) return;
    open = next;
    nav.classList.toggle('open', open);
    nav.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (goo) goo.classList.toggle('open', open);
  }

  function frame() {
    running = false;

    build();

    // The whole top bar — clock, weather, nav pill, theme/social/power — is
    // held back while the hero is the screen, so the hero lands uninterrupted.
    // A class on <body> rather than inline styles, because js/hero-entrance.js
    // owns the inline opacity of #topBar's three children during the intro;
    // this fades their common parent instead and the two never fight.
    const onHero = heroOwnsScreen();
    if (onHero !== document.body.classList.contains('hero-owns-screen')) {
      document.body.classList.toggle('hero-owns-screen', onHero);
    }

    const show = shouldShow(onHero);
    // Size/place the bar BEFORE it unfolds, so it never flips down at a stale
    // width and snaps afterwards.
    if (show) syncBox();
    setOpen(show);
    if (!open) return;

    setActive(readingHead());

    if (progress) {
      progress.style.transform = 'scaleX(' + scrollProgress().toFixed(4) + ')';
    }
  }

  function schedule() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(schedule);
  }

  // Mode switches, section pages, the overflow panel and the modal all show up
  // as class changes on <body> / the panels; sections unhide themselves once
  // their content loads. Watch for both rather than polling.
  new MutationObserver(schedule).observe(document.body, {
    attributes: true, attributeFilter: ['class']
  });
  new MutationObserver(schedule).observe(belowFold, {
    attributes: true, subtree: true, attributeFilter: ['hidden']
  });
  if (overflowPanel) {
    new MutationObserver(schedule).observe(overflowPanel, {
      attributes: true, attributeFilter: ['class']
    });
  }
  if (sModal) {
    new MutationObserver(schedule).observe(sModal, {
      attributes: true, attributeFilter: ['class']
    });
  }

  schedule();
})();
