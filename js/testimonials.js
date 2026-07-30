/**
 * Testimonials — a group-chat thread (see .testi-chat in styles.css). The
 * opening bubble is static; each colleague's "received" bubble holds a short
 * teaser + "Read more" that opens #testiModal with that person's full quote,
 * pulled from the matching <template data-testi-full="..."> sibling — nothing
 * is duplicated into JS.
 *
 * The modal is self-contained (own focus trap / Escape / backdrop-click)
 * rather than wired into main.js's shared modal plumbing, since main.js's
 * helpers are private to its own closure.
 */
(function () {
  const section = document.getElementById('homeTestimonials');
  const chat = document.getElementById('testiChat');
  const modal = document.getElementById('testiModal');
  if (!section || !modal) return;

  const closeBtn = document.getElementById('testiModalClose');
  const frame = document.getElementById('testiModalFrame');
  const avatarEl = document.getElementById('testiModalAvatar');
  const nameEl = document.getElementById('testiModalName');
  const roleEl = document.getElementById('testiModalRole');
  const bodyEl = document.getElementById('testiModalBody');
  const caseStudyEl = document.getElementById('testiModalCaseStudy');

  const A11Y_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let returnFocusEl = null;
  let open = false;

  function getFocusable() {
    return Array.from(frame.querySelectorAll(A11Y_FOCUSABLE))
      .filter(el => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function openModal(trigger) {
    const row = trigger.closest('.testi-chat__row');
    const key = trigger.dataset.testi;
    const template = section.querySelector(`template[data-testi-full="${key}"]`);
    if (!row || !template) return;

    const avatarImg = row.querySelector('.testi-chat__avatar-img');
    const name = row.querySelector('.testi-chat__name')?.textContent?.trim() || '';
    const role = row.querySelector('.testi-chat__tip')?.textContent?.trim() || '';

    if (avatarImg) {
      avatarEl.src = avatarImg.src;
      avatarEl.alt = avatarImg.alt;
      avatarEl.hidden = false;
    } else {
      avatarEl.hidden = true;
    }
    nameEl.textContent = name;
    roleEl.textContent = role;
    bodyEl.innerHTML = template.innerHTML;

    // Only shown when this person's trigger names a case study — see
    // data-study on .testi-chat__more above. Disabled either way for now
    // (case-study pages aren't live yet); data-study is just carried along
    // for when they are.
    const study = trigger.dataset.study || '';
    if (study) {
      caseStudyEl.dataset.study = study;
      caseStudyEl.hidden = false;
    } else {
      delete caseStudyEl.dataset.study;
      caseStudyEl.hidden = true;
    }

    if (window.lockBodyScroll) window.lockBodyScroll();
    returnFocusEl = trigger;
    open = true;
    modal.classList.add('tm-open');
    modal.style.pointerEvents = 'all';
    bodyEl.scrollTop = 0;

    setTimeout(() => {
      try { closeBtn.focus({ preventScroll: true }); } catch (_) {}
    }, 60);
  }

  function closeModal() {
    if (!open) return;
    open = false;
    if (window.unlockBodyScroll) window.unlockBodyScroll();
    modal.classList.remove('tm-open');
    modal.style.pointerEvents = 'none';
    if (returnFocusEl && document.contains(returnFocusEl)) {
      try { returnFocusEl.focus({ preventScroll: true }); } catch (_) {}
    }
    returnFocusEl = null;
  }

  section.addEventListener('click', e => {
    const trigger = e.target.closest('.testi-chat__more');
    if (trigger) openModal(trigger);
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab') {
      const f = getFocusable();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (!frame.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Each row is revealed independently as it reaches the middle of the
  // viewport — not a pre-scripted sequence that plays once the thread first
  // appears. The question bubble just fades/slides in; each reply's avatar +
  // typing dots land first, pause like someone actually typing, then swap for
  // the real message. Reduced motion skips the pause and shows the text right
  // away.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TYPING_MS = reducedMotion ? 0 : 900;

  function revealRow(row) {
    row.classList.add('is-in');
    if (!row.classList.contains('testi-chat__row--in')) return;
    const typing = row.querySelector('.testi-chat__typing');
    const text = row.querySelector('.testi-chat__text');
    const more = row.querySelector('.testi-chat__more');
    setTimeout(() => {
      if (typing) typing.hidden = true;
      if (text) { text.hidden = false; text.classList.add('testi-chat__bubble--pop'); }
      if (more) { more.hidden = false; more.classList.add('testi-chat__bubble--pop'); }
    }, TYPING_MS);
  }

  // Reveal on the centre line, measured against the row's FINISHED height.
  //
  // An IntersectionObserver threshold can't express this: a row is only a
  // typing bubble tall while it's waiting, so several of them sit on screen at
  // once and all cross any given threshold on the same scroll — the thread
  // fired as one block instead of one message at a time. So each row is
  // measured in its revealed state and reveals when the middle of *that* box
  // reaches the middle of the viewport.
  if (chat) {
    const rows = Array.from(chat.querySelectorAll('.testi-chat__row'));
    const pending = new Set(rows);
    const heights = new Map();

    // Trigger a little below dead centre (i.e. slightly early), because the
    // typing beat still has to play out — that lands the actual text near the
    // middle rather than well past it. Reduced motion has no beat to cover.
    const TRIGGER = reducedMotion ? 0.5 : 0.58;
    // A jump-scroll (anchor link, keyboard End, trackpad fling) can satisfy
    // several rows in one pass; walk them in instead of dumping them together.
    const STAGGER_MS = reducedMotion ? 0 : 260;

    // Measure a row as it will look once the message has landed: unhide, read,
    // restore — all synchronously, so the browser never paints the in-between
    // state. A row whose message is already showing is measured as-is.
    function measureRevealed(row) {
      const typing = row.querySelector('.testi-chat__typing');
      const text = row.querySelector('.testi-chat__text');
      const more = row.querySelector('.testi-chat__more');
      if (!text || !text.hidden) return row.offsetHeight;
      const wasTyping = typing ? typing.hidden : false;
      const scrollBefore = window.scrollY;
      if (typing) typing.hidden = true;
      text.hidden = false;
      if (more) more.hidden = false;
      const h = row.offsetHeight;
      text.hidden = true;
      if (more) more.hidden = true;
      if (typing) typing.hidden = wasTyping;
      // Growing the page mid-measure can nudge the scroll position (scroll
      // anchoring); put it back before anyone notices.
      if (window.scrollY !== scrollBefore) window.scrollTo(0, scrollBefore);
      return h;
    }

    let queued = 0;
    function check() {
      queued = 0;
      const vh = window.innerHeight;
      const line = vh * TRIGGER;
      const doc = document.documentElement;
      const atBottom = window.scrollY + vh >= doc.scrollHeight - 2;
      // Every message still to land grows its row, pushing everything below it
      // down the page. Without carrying that forward, one coarse scroll tick
      // sees the whole collapsed thread — barely half a viewport tall — sitting
      // above the centre line and fires all of it. Walking the rows in order and
      // accumulating the growth places each one where it will actually be.
      let shift = 0;
      let batch = 0;

      rows.forEach(row => {
        const rect = row.getBoundingClientRect();
        // The whole feed is display:none in some modes — nothing to place yet.
        if (!rect.height && !rect.width) return;
        let full = heights.get(row);
        if (!full) { full = measureRevealed(row); heights.set(row, full); }

        if (pending.has(row)) {
          const top = rect.top + shift;
          // A row parked at the very bottom of the page can never climb to the
          // centre line, so once there's no scroll left, show what's in view.
          if (top + full / 2 <= line || (atBottom && top < vh)) {
            pending.delete(row);
            const delay = batch++ * STAGGER_MS;
            if (delay) setTimeout(() => revealRow(row), delay);
            else revealRow(row);
          }
        }

        // Already expanded rows are their full height, so they add nothing.
        shift += Math.max(0, full - rect.height);
      });

      if (!pending.size) {
        document.removeEventListener('scroll', queue, true);
        document.removeEventListener('visibilitychange', queue);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('load', onResize);
      }
    }

    function queue() {
      if (!queued) queued = requestAnimationFrame(check);
    }

    function onResize() {
      heights.clear();
      queue();
    }

    // Capture phase: the feed scrolls with the window today, but a scroll on an
    // ancestor container wouldn't bubble here otherwise.
    document.addEventListener('scroll', queue, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    // Late-arriving avatars and webfonts reflow the bubbles, which moves both
    // the rows and their measured heights.
    window.addEventListener('load', onResize);
    // requestAnimationFrame is suspended in a background tab, so a page that
    // loaded (or was restored) already scrolled to the thread wouldn't place
    // its rows until the next scroll. Re-check when the tab comes back.
    document.addEventListener('visibilitychange', queue);
    queue();
  }
})();
