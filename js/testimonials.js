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

  // Each row is revealed independently as it scrolls into view — not a
  // pre-scripted sequence that plays once the thread first appears. The
  // question bubble just fades/slides in; each reply's avatar + typing dots
  // land first, pause like someone actually typing, then swap for the real
  // message. Reduced motion skips the pause and shows the text right away.
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

  if (chat) {
    const rows = Array.from(chat.querySelectorAll('.testi-chat__row'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          revealRow(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    rows.forEach(row => observer.observe(row));
  }
})();
