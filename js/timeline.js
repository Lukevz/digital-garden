/**
 * Career timeline — scroll-lit rail.
 *
 * The left rail (.tl-rail__fill) behaves like a live scroll indicator: it fills
 * down to a "beam" line pinned near the viewport center. Every node dot and
 * highlight dot whose center the beam has passed gets `.is-lit` (a soft blue
 * glow). Purely scroll-driven — no looping animation — so it stays calm and
 * plays nicely with prefers-reduced-motion (only CSS transitions are gated).
 */
(function () {
  const timeline = document.getElementById('careerTimeline');
  if (!timeline) return;

  const fill = document.getElementById('tlRailFill');
  const rail = timeline.querySelector('.tl-rail');
  // Everything that lights up, paired with the "group" element that should also
  // gain .is-lit (a company node also brightens its whole group / logo).
  const lightables = [];
  timeline.querySelectorAll('.tl-node').forEach(node => {
    lightables.push({ el: node, group: node.closest('.tl-group') });
  });
  timeline.querySelectorAll('.tl-position').forEach(pos => {
    lightables.push({ el: pos.querySelector('.tl-pos-marker') || pos, group: pos });
  });

  // Beam sits at 52% of the viewport height — a touch below center so items
  // light up right as they settle into the comfortable reading zone.
  const BEAM_RATIO = 0.52;

  let ticking = false;

  function update() {
    ticking = false;
    const beamY = window.scrollY + window.innerHeight * BEAM_RATIO;

    // Rail fill: clamp the beam to the rail's own span.
    if (fill && rail) {
      const railRect = rail.getBoundingClientRect();
      const railTop = railRect.top + window.scrollY;
      const filled = Math.max(0, Math.min(railRect.height, beamY - railTop));
      fill.style.height = filled + 'px';
    }

    for (const item of lightables) {
      const rect = item.el.getBoundingClientRect();
      const center = rect.top + window.scrollY + rect.height / 2;
      const lit = center <= beamY;
      if (item.el.classList.contains('is-lit') !== lit) {
        item.el.classList.toggle('is-lit', lit);
        if (item.group) item.group.classList.toggle('is-lit', lit);
      }
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // Recompute once fonts/layout settle.
  window.addEventListener('load', update);
  update();
})();
