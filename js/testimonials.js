/**
 * Testimonials — collapse long colleague quotes behind a fade, with a
 * Read more / Show less toggle.
 *
 * The CSS clamps every .testi-card__body to a fixed max-height. This script only
 * decides which cards actually overflow that clamp: those get .testi-has-overflow
 * (which reveals the fade + the toggle button); short ones show in full with no
 * button. Overflow is re-measured on resize and once web fonts settle, since
 * both change how many lines the text wraps to.
 */
(function () {
  const section = document.getElementById('homeTestimonials');
  if (!section) return;

  const cards = Array.from(section.querySelectorAll('.testi-card'));

  cards.forEach(card => {
    const body = card.querySelector('.testi-card__body');
    const btn = card.querySelector('.testi-card__more');
    if (!body || !btn) return;

    // Only meaningful while collapsed (clamped): compare full content height to
    // the clamped visible height. Once expanded we leave the flag as-is.
    const measure = () => {
      if (card.classList.contains('is-expanded')) return;
      const overflowing = body.scrollHeight - body.clientHeight > 4;
      card.classList.toggle('testi-has-overflow', overflowing);
    };

    btn.addEventListener('click', () => {
      const expanded = card.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', String(expanded));
      btn.textContent = expanded ? 'Show less' : 'Read more';
    });

    measure();
    window.addEventListener('resize', measure, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
  });
})();
