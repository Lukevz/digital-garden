/* ──────────────────────────────────────────────────────────────────────────
   paperlike — photographs.

   The second section. js/paper.js owns the hash, the erase and the masthead
   flight; this file owns everything that happens once `#photos` has been
   routed to. It registers itself as `window.photoSection` and paper.js hands
   it the rest of the path.

   ⚠️ It has to be loaded BEFORE js/paper.js. Both are deferred, so they run in
   document order, and paper.js reads `window.photoSection` on its very first
   route() — which happens at the end of its own script.

   What is in here:

     • the index of collections, and the loose frames beneath it
     • a written collection: full-bleed cover, justified lede, twelve stamps
     • the RIFFLE: hovering a stamp flicks through the photographs it stands
       for, wiped on one after another over the engraving
     • the SCAN: opening a stamp gathers the others to the middle, flies the
       one you picked into the centre of the sheet, and repaints the engraving
       into the photograph it was drawn from — brushed on, with that frame's
       real EXIF printed beside it
     • the day itself: what happened, what is left of it, and the frames

   Routes it answers to:

     #photos                        the index
     #photos/<slug>                 a collection
     #photos/<slug>/<day>           a collection with one day open
     #photos/<slug>/play            the whole set, played through in order
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const plates = document.getElementById('plates');
  const scroll = document.getElementById('platesScroll');
  if (!plates || !scroll) return;

  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A `soon` set is locked on the live site but open on the dev server, so a
  // WIP collection can be worked on without shipping it.
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  /* ── Tunables ──────────────────────────────────────────────────────────
     Live-editable from the console, the same way `paper` is:
     `photos.scanDur = 6000` to watch the brush work, `photos.riffle = 900` to
     slow the hover down, `photos.enabled = false` to compare the whole thing
     against a hard cut. */
  const photos = window.photos = {
    scanDur: 2100,   // how long the photograph takes to paint over the engraving
    flyDur: 620,     // the stamp's flight into the middle of the sheet
    riffle: 420,     // ms a frame holds while the stamp is being hovered
    enabled: true,
  };
  const EASE = 'cubic-bezier(0.4, 0, 0.18, 1)';

  const BASE = '/content/photos/collections/';

  /* ── Text ──────────────────────────────────────────────────────────────
     Everything set in the display face has to be folded into its own
     punctuation first — see fold() in js/paper.js for why. Borrowed from
     there at call time rather than copied: paper.js defines it, and a second
     copy is a second thing to keep in step with the font's cmap. */
  const fold = s => (window.paper && window.paper.fold ? window.paper.fold(s) : s);
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESCAPES[c]);
  const t = s => esc(fold(String(s == null ? '' : s)));

  /* ── Data ──────────────────────────────────────────────────────────────
     Two static manifests, generated from the files themselves. Notably the
     EXIF: it is read off each JPEG at build time rather than at request time,
     so the scan panel needs no API and the numbers beside a photograph are
     that photograph's own. */
  let index = null;
  const written = new Map();

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch(BASE + 'index.json')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => (index = j))
      .catch(() => (index = { collections: [], loose: [] }));
  }

  function loadCollection(slug) {
    if (written.has(slug)) return Promise.resolve(written.get(slug));
    return fetch(BASE + encodeURIComponent(slug) + '.json')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => { written.set(slug, j); return j; })
      .catch(() => null);
  }

  /* ══ The index ═════════════════════════════════════════════════════════ */

  /* ⚠️ The frame's own ratio goes out as a CUSTOM PROPERTY, not as
     `aspect-ratio` itself. An inline `aspect-ratio` beats any stylesheet rule,
     so the square cells in a day's grid would silently lose to it and the grid
     would come out as ragged as the masonry. Each context picks up `--ar` if it
     wants it. */
  function frameHTML(f, i) {
    const w = f.w || 3, h = f.h || 4;
    return `<button class="frame${f.standin ? ' frame--standin' : ''}" type="button"
      data-frame="${i}" style="--ar:${w}/${h}">
      <img src="${esc(f.thumb || f.src)}" alt="${t(f.alt || '')}"
           width="${w}" height="${h}" loading="lazy" decoding="async">
    </button>`;
  }

  /* ── One chronology ────────────────────────────────────────────────────
     The index is filed by YEAR, not split into trips and loose frames. A year
     is one run: its trips land at their start date as wide plates among that
     year's loose frames, newest first, the frames in justified rows. The
     years are a nav down the left (the writing index's own rows); picking one
     swaps the white card on the right rather than scrolling to it. `year`
     outlives the paint, so coming back from a trip lands on the same year. */
  let year = null;

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CHEV = '<svg class="ico pchron-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6l-6 6"/></svg>';
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

  function chronology() {
    const items = [
      ...(index.loose || []).map((f, i) => ({ d: f.date || '', f, i })),
      ...(index.collections || []).map(c => ({ d: c.start || '', c })),
    ].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const years = new Map();
    for (const it of items) {
      const y = it.d.slice(0, 4) || 'Undated';
      (years.get(y) || years.set(y, []).get(y)).push(it);
    }
    return years;
  }

  // A year's counts, one per row, each behind its mark: a ticket stub for the
  // trips, a camera for the loose frames (Tabler `ticket` and `camera`).
  const ICO_TRIP = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l0 2"/><path d="M15 11l0 2"/><path d="M15 17l0 2"/><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2"/></svg>';
  const ICO_FRAME = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>';
  const yearCounts = its => {
    const trips = its.filter(it => it.c).length;
    const frames = its.length - trips;
    const row = (ico, text) => `<span class="pcount">${ico}<span>${t(text)}</span></span>`;
    return (trips ? row(ICO_TRIP, plural(trips, 'trip')) : '') +
      (frames ? row(ICO_FRAME, plural(frames, 'frame')) : '');
  };

  // A trip, as a plate in the run. A `soon` set is the same plate, not a link.
  function tripHTML(c) {
    const soon = !!c.soon && !LOCAL;
    const tag = soon ? 'div' : 'a';
    const attrs = soon ? 'aria-disabled="true"' : `href="#photos/${esc(c.slug)}"`;
    return `<${tag} class="ptrip${soon ? ' ptrip--soon' : ''}" ${attrs}>
      <span class="ptrip-cover">
        <img src="${esc(c.cover)}" alt="${t(c.coverAlt || '')}" loading="lazy" decoding="async">${
          soon ? '<span class="pset-badge">Coming soon</span>' : ''}
      </span>
      <span class="ptrip-cap">
        <span class="ptrip-lbl">Trip${c.unit ? ' / ' + c.count + ' ' + t(c.unit) : ''}</span>
        <span class="ptrip-name"${c.accent ? ` style="--accent:${esc(c.accent)}"` : ''}>${t(c.title)}</span>
        <span class="ptrip-lbl">${t(c.dates || '')}${soon ? '' : ' ' + CHEV}</span>
      </span>
    </${tag}>`;
  }

  function yearHTML(y, its) {
    let out = '', run = [];
    const flush = () => {
      if (run.length) out += `<div class="prow">${run.join('')}</div>`;
      run = [];
    };
    for (const it of its) {
      if (it.f) { run.push(frameHTML(it.f, it.i)); continue; }
      flush();
      out += tripHTML(it.c);
    }
    flush();
    return `
      <header class="pcard-head">
        <h2 class="page-title">${t(y)}</h2>
        <p class="page-meta pcounts">${yearCounts(its)}</p>
      </header>
      <div class="pchron">${out}</div>`;
  }

  function paintIndex() {
    const years = chronology();
    if (!years.has(year)) year = years.keys().next().value || null;

    const nav = [...years].map(([y, its]) => `
      <li class="index-item${y === year ? ' is-current' : ''}">
        <button class="index-link" type="button" data-year="${esc(y)}"${y === year ? ' aria-current="true"' : ''}>
          <span class="index-title">${t(y)}</span>
          <span class="index-date pcounts">${yearCounts(its)}</span>
        </button>
      </li>`).join('');

    scroll.innerHTML = `
      <div class="pindex pindex--chron">
        <nav class="pnav" aria-label="Years"><ul class="index-list">${nav}</ul></nav>
        <section class="pcard" aria-live="polite">
          <div class="pcard-scroll">${year ? yearHTML(year, years.get(year)) : ''}</div>
        </section>
      </div>`;

    const card = scroll.querySelector('.pcard-scroll');
    card.addEventListener('click', e => {
      const btn = e.target.closest('.frame');
      if (btn) openFrame(index.loose || [], +btn.dataset.frame);
    });
    scroll.querySelector('.pnav').addEventListener('click', e => {
      const btn = e.target.closest('[data-year]');
      if (btn) showYear(btn.dataset.year);
    });
    scroll.scrollTop = 0;
  }

  // The hot swap: the card's contents fade out, change, and fade back in; the
  // nav and the card itself stay put.
  let swapTimer = null;
  function showYear(y) {
    if (y === year) return;
    const years = chronology();
    if (!years.has(y)) return;
    year = y;
    for (const li of scroll.querySelectorAll('.pnav .index-item')) {
      const on = li.firstElementChild.dataset.year === y;
      li.classList.toggle('is-current', on);
      if (on) {
        li.firstElementChild.setAttribute('aria-current', 'true');
        // On a phone the years are a sideways row; keep the picked one on it.
        li.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
      else li.firstElementChild.removeAttribute('aria-current');
    }
    const card = scroll.querySelector('.pcard-scroll');
    if (!card) return;
    clearTimeout(swapTimer);
    const swap = () => {
      card.innerHTML = yearHTML(y, years.get(y));
      card.scrollTop = 0;
      card.classList.remove('is-out');
    };
    if (reduced) { swap(); return; }
    card.classList.add('is-out');
    swapTimer = setTimeout(swap, 180);
  }

  /* An unwritten set is a folder, not a piece: no cover, no lede, no stamps —
     just the frames it holds. */
  function paintPlainSet(c) {
    scroll.innerHTML = `
      <div class="pindex">
        <header class="pindex-head">
          <h2 class="pset-name">${t(c.title)}</h2>
          <p class="pindex-note">${c.count} frames / not written up yet</p>
        </header>
        <div class="masonry" data-gallery="set">${(c.items || []).map(frameHTML).join('')}</div>
      </div>`;
    scroll.querySelector('[data-gallery="set"]')
      ?.addEventListener('click', e => {
        const btn = e.target.closest('.frame');
        if (btn) openFrame(c.items, +btn.dataset.frame);
      });
    scroll.scrollTop = 0;
  }

  /* ══ A collection ══════════════════════════════════════════════════════ */

  /* ── The route ─────────────────────────────────────────────────────────
     ONE line for the whole sheet of stamps, not a strand per row: it runs
     along row one, sweeps back down and across to the start of row two, along
     that, and down again — the Z the comp's three separate paths only implied.

     ⚠️ Measured from the stamps themselves rather than drawn into a stretched
     viewBox. The grid is fluid and the row turns are the only real curves in
     it; a `preserveAspectRatio="none"` path squashes exactly those into flat
     ellipses while leaving the straight runs looking fine, so the distortion
     lands precisely where it shows. */

  /* Catmull-Rom through the points, converted to cubics. A polyline through
     twelve stamps reads as a folding ruler; this reads as a drawn line. */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    const n = (x, y) => x.toFixed(1) + ' ' + y.toFixed(1);
    let d = 'M' + n(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i];
      const p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + n(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6) +
           ' ' + n(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6) +
           ' ' + n(p2[0], p2[1]);
    }
    return d;
  }

  /* ⚠️ Guarded, and it has to be. This runs from a ResizeObserver and writes
     into the DOM, which is the shape of an observer loop — one redraw that
     nudges layout by a fraction schedules the next, and the tab stops
     responding. Bailing when the box has not actually changed size makes a
     loop impossible rather than merely unlikely. */
  let routeBox = '';
  function drawRoute(stamps, force) {
    const svg = stamps.querySelector('.stamp-route');
    if (!svg) return;
    const box = stamps.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const sig = box.width.toFixed(1) + 'x' + box.height.toFixed(1);
    if (!force && sig === routeBox) return;
    routeBox = sig;
    const rows = [...stamps.querySelectorAll('.stamp-row')];

    const pts = [];
    rows.forEach((row, r) => {
      const arts = [...row.querySelectorAll('.stamp-art')];
      if (!arts.length) return;
      const cards = arts.map(a => a.getBoundingClientRect());
      cards.forEach((c, i) => {
        // A touch of sag, keyed off the position rather than rolled fresh, so
        // the line is the same line every time the page is painted.
        const sag = ((r * 4 + i) % 3 - 1) * 7;
        pts.push([c.left - box.left + c.width / 2, c.top - box.top + c.height / 2 + sag]);
      });
      const next = rows[r + 1];
      if (!next) return;
      const firstNext = next.querySelector('.stamp-art');
      if (!firstNext) return;
      const last = cards[cards.length - 1];
      const nr = firstNext.getBoundingClientRect();
      const lastY = last.top - box.top + last.height / 2;
      const nextY = nr.top - box.top + nr.height / 2;
      const mid = (last.bottom - box.top + (nr.top - box.top)) / 2;
      // Out past the right edge, back across under the row, up into the next:
      // the long diagonal is the Z, and routing it below the row keeps it off
      // the captions' baseline rather than straight through them.
      pts.push([last.right - box.left + last.width * 0.34, lastY + (mid - lastY) * 0.72]);
      pts.push([nr.left - box.left - nr.width * 0.34, nextY - (nextY - mid) * 0.72]);
    });

    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    svg.querySelector('path').setAttribute('d', smoothPath(pts));
  }

  function stampHTML(d) {
    const long = d.title.length > 22;
    return `<button class="stamp" type="button" data-key="${esc(d.key)}"
              style="--tilt:${d.tilt || 0}deg; transform:rotate(${d.tilt || 0}deg)">
      <span class="stamp-card">
        <span class="stamp-art">
          <!-- ⚠️ Not lazy. There are twelve of them and they ARE the page; a
               stamp that has not arrived is a blank cream card with a caption
               under it, which reads as a missing image rather than as one on
               its way. -->
          <img src="${esc(d.stamp)}" alt="${t(d.title)}, engraved"
               width="${d.stampW || 600}" height="${d.stampH || 720}" decoding="async">
          <span class="stamp-cycle" aria-hidden="true"></span>
        </span>
      </span>
      <span class="stamp-cap">
        <span class="stamp-cap-title${long ? ' is-long' : ''}">${t(d.title)}</span>
        <span class="stamp-cap-day">${t(d.day)}${d.dateLabel ? ', ' + t(d.dateLabel) : ''}</span>
        <span class="stamp-cap-place">${t(d.place || '')}</span>
      </span>
    </button>`;
  }

  /* A collection with no engravings — nothing to draw stamps from — is laid out
     as its days, each a header over a masonry of that day's frames, on the same
     white card the loose frames sit on. No stamps means no riffle, no scan and
     no day view (those all hang off a stamp), and no play button either: the
     days already are the whole trip in one field. The lede is optional and only
     printed when the manifest carries one.

     ⚠️ This is a fallback, not a second design. It exists so a trip can be put
     up before anyone has drawn it; give the days a `stamp` and the collection
     takes the stamp path above with no other change. */
  const isStamped = col => (col.days || []).some(d => d.stamp);

  function dayHeadHTML(d) {
    return `<header class="pday-head">
      ${d.title ? `<h3 class="pday-title">${t(d.title)}</h3>` : ''}
      <p class="pday-meta">${t(d.day || '')}${d.dateLabel ? ', ' + t(d.dateLabel) : ''}${
        d.place ? ' / ' + t(d.place) : ''}</p>
    </header>`;
  }

  function paintDays(col) {
    const days = col.days || [];
    scroll.innerHTML = `
      <article class="pcol">
        <div class="pcol-cover bleed">
          <img src="${esc(col.cover)}" alt="${t(col.coverAlt || '')}" decoding="async" fetchpriority="high">
          <div class="pcol-cover-type">
            <h2 class="pcol-title">${t(col.title)}</h2>
            <p class="pcol-byline"><span class="slash">//</span> <span>${t(col.byline || col.dates || '')}</span></p>
          </div>
        </div>
        ${col.lede ? `<p class="pcol-lede">${t(col.lede)}</p>` : ''}
        <div class="pdays">
          ${days.map(d => `<section class="ploose pday" id="pday-${esc(d.key)}" data-key="${esc(d.key)}">
            ${dayHeadHTML(d)}
            <div class="masonry">${(d.frames || []).map(frameHTML).join('')}</div>
          </section>`).join('')}
        </div>
      </article>`;

    scroll.querySelectorAll('.pday').forEach(sec => {
      const day = days.find(d => d.key === sec.dataset.key);
      sec.addEventListener('click', e => {
        const btn = e.target.closest('.frame');
        if (btn) openFrame(day.frames, +btn.dataset.frame);
      });
    });
    scroll.scrollTop = 0;
  }

  function paintCollection(col) {
    if (!isStamped(col)) return paintDays(col);
    const days = col.days || [];
    const rows = [];
    for (let i = 0; i < days.length; i += 4) rows.push(days.slice(i, i + 4));
    // Every frame in the collection, in the order the days happened. This is
    // what `play` shows: the whole trip in one field, no days, no steps.
    const everything = days.flatMap(d => d.frames || []);

    scroll.innerHTML = `
      <article class="pcol">
        <div class="pcol-cover bleed">
          <img src="${esc(col.cover)}" alt="${t(col.coverAlt || '')}" decoding="async" fetchpriority="high">
          <div class="pcol-cover-type">
            <h2 class="pcol-title">${t(col.title)}</h2>
            <p class="pcol-byline"><span class="slash">//</span> <span>${t(col.byline || col.dates || '')}</span></p>
          </div>
        </div>
        <p class="pcol-lede">${t(col.lede || '')}</p>
        <div class="pcol-actions">
          <button class="playbtn" type="button" data-play>
            <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 1.2 10.4 6 2 10.8Z"/></svg>
            Play gallery
          </button>
        </div>
        <div class="stamps">
          <svg class="stamp-route" fill="none" aria-hidden="true" preserveAspectRatio="none">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${rows.map(row => `<div class="stamp-row">${row.map(stampHTML).join('')}</div>`).join('')}
        </div>
        <div class="pgallery" hidden>
          <div class="masonry" data-gallery="all">${everything.map(frameHTML).join('')}</div>
        </div>
      </article>`;

    const stamps = scroll.querySelector('.stamps');
    stamps.addEventListener('click', e => {
      const s = e.target.closest('.stamp');
      if (s) location.hash = '#photos/' + col.slug + '/' + s.dataset.key;
    });
    wireRiffle(stamps, col);

    scroll.querySelector('[data-gallery="all"]').addEventListener('click', e => {
      const f = e.target.closest('.frame');
      if (f) openFrame(everything, +f.dataset.frame);
    });

    scroll.querySelector('[data-play]').addEventListener('click', () => {
      location.hash = body.classList.contains('gallery')
        ? '#photos/' + col.slug
        : '#photos/' + col.slug + '/play';
    });

    // The route is measured off the laid-out stamps, so it is drawn after the
    // first frame and redrawn whenever the grid reflows — a reflow moves every
    // point on it. Also once the engravings land: they carry the row's height
    // until they do, and a route drawn before that is a route through boxes
    // that are about to move.
    routeBox = '';
    requestAnimationFrame(() => drawRoute(stamps, true));
    stamps.querySelectorAll('.stamp-art > img').forEach(im => {
      if (!im.complete) im.addEventListener('load', () => drawRoute(stamps, true), { once: true });
    });
    if (routeWatch) routeWatch.disconnect();
    routeWatch = new ResizeObserver(() => drawRoute(stamps));
    routeWatch.observe(stamps);

    scroll.scrollTop = 0;
  }

  let routeWatch = null;

  /* ── Play ──────────────────────────────────────────────────────────────
     Not a slideshow and not a run of modals: the page below the banner is
     cleared and the whole trip is laid out in one continuous field. The cover
     stays, because it is the thing that says which trip this is. */
  function setGallery(on) {
    body.classList.toggle('gallery', on);
    const g = scroll.querySelector('.pgallery');
    if (g) g.hidden = !on;
    const btn = scroll.querySelector('[data-play]');
    if (btn) btn.lastChild.textContent = on ? ' Back to the stamps' : ' Play gallery';
    if (on) {
      const cover = scroll.querySelector('.pcol-cover');
      // Land just under the banner rather than at the top: the point of the
      // gallery is the frames, and the cover has already been seen.
      if (cover) scroll.scrollTop = Math.max(0, cover.offsetHeight - 40);
    }
  }

  /* ── The riffle ────────────────────────────────────────────────────────
     Hover a stamp and it flicks through the frames it stands for. The images
     are built on first hover rather than at paint: twelve stamps times five
     frames is sixty photographs, and none of them are wanted until a pointer
     actually lands on one.

     ⚠️ The first frame shown is frames[0] — the photograph the engraving was
     drawn FROM. It is the one that makes the stamp legible as a stand-in for
     something real, so it leads rather than falling in the shuffle. */
  function wireRiffle(root, col) {
    const byKey = new Map((col.days || []).map(d => [d.key, d]));
    let timer = null, live = null;

    function stop() {
      clearInterval(timer);
      timer = null;
      if (live) {
        live.classList.remove('is-riffling');
        live.querySelectorAll('.stamp-cycle img').forEach(im => im.classList.remove('is-on'));
        live = null;
      }
    }

    function start(stamp) {
      const day = byKey.get(stamp.dataset.key);
      if (!day || !day.frames || !day.frames.length || !photos.enabled || reduced) return;
      const cycle = stamp.querySelector('.stamp-cycle');
      if (!cycle.childElementCount) {
        cycle.innerHTML = day.frames
          .map(f => `<img src="${esc(f.thumb || f.src)}" alt="" decoding="async">`).join('');
      }
      const imgs = [...cycle.children];
      live = stamp;
      let i = 0;
      const show = () => {
        imgs.forEach((im, n) => im.classList.toggle('is-on', n === i));
        stamp.classList.remove('is-riffling');
        void stamp.offsetWidth;          // restart the flash on every change
        stamp.classList.add('is-riffling');
        i = (i + 1) % imgs.length;
      };
      show();
      timer = setInterval(show, photos.riffle);
    }

    root.addEventListener('pointerover', e => {
      const s = e.target.closest('.stamp');
      if (!s || s === live || s.classList.contains('is-open')) return;
      stop();
      start(s);
    });
    root.addEventListener('pointerleave', stop);
    root.addEventListener('focusin', e => {
      const s = e.target.closest('.stamp');
      if (s && s !== live) { stop(); start(s); }
    });
    root.addEventListener('focusout', stop);
    root._riffleStop = stop;
  }

  /* ══ The day view ══════════════════════════════════════════════════════ */

  let dayview = null, lightbox = null;
  let openKey = null, scanTimer = null;

  const EXIF_ROWS = [
    ['camera', 'Camera'], ['lens', 'Lens'], ['focal', 'Focal'],
    ['aperture', 'Aperture'], ['shutter', 'Shutter'], ['iso', 'ISO'],
    ['date', 'Date'], ['dimensions', 'Pixels'],
  ];

  function exifHTML(ex) {
    if (!ex) return '';
    const rows = EXIF_ROWS
      .map(([k, label]) => {
        let v = ex[k];
        if (!v) return null;
        // The 35mm equivalent belongs with the focal length it qualifies, not
        // on a row of its own that reads like a second lens.
        if (k === 'focal' && ex.focal35 && ex.focal35 !== ex.focal) v = v + ' (' + ex.focal35 + ')';
        if (k === 'date' && ex.time) v = v + ' ' + ex.time;
        return `<span class="scan-meta-key">${t(label)}</span><span class="scan-meta-val">${t(v)}</span>`;
      })
      .filter(Boolean);
    return rows
      .map((r, i) => `<div class="scan-meta-row" style="--i:${i}">${r}</div>`)
      .join('');
  }

  /* Motes of light parked along the brush's path. Their positions are fixed
     per open rather than re-rolled per frame, and each one's delay falls out
     of where it sits, so the sparkle is genuinely in step with the edge. */
  function sparksHTML(n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const tt = (i + 0.5) / n + (Math.random() - 0.5) * 0.05;
      out += `<span class="scan-spark" style="--t:${Math.min(0.99, Math.max(0.01, tt)).toFixed(3)};` +
             `--y:${Math.random().toFixed(3)};--sz:${(2 + Math.random() * 3).toFixed(1)}px"></span>`;
    }
    return out;
  }

  const ICON_PREV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>';
  const ICON_X = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

  function buildDayView(col, day, i) {
    const days = col.days || [];
    const hero = (day.frames || [])[0] || {};
    const rest = day.frames || [];

    if (!dayview) {
      dayview = document.createElement('div');
      dayview.className = 'dayview';
      dayview.hidden = true;
      plates.appendChild(dayview);
    }

    dayview.innerHTML = `
      <div class="dayview-scroll">
        <div class="scan" style="--scan-dur:${photos.scanDur}ms">
          <div class="scan-stage">
            <div class="scan-plate">
              <!-- ⚠️ The photograph is UNDER the engraving. The brush takes the
                   drawing off what was always there; see photos.css for why
                   the other way round does not composite. -->
              <img class="scan-photo" src="${esc(hero.src)}" alt="${t(hero.alt || day.title)}" decoding="async">
              <img class="scan-art" src="${esc(day.stamp)}" alt="" decoding="async">
              <span class="scan-line" aria-hidden="true"></span>
              <span class="scan-sparks" aria-hidden="true">${sparksHTML(16)}</span>
            </div>
          </div>
          <aside class="scan-meta">${exifHTML(hero.exif)}</aside>
        </div>
        <div class="dayview-body">
          <header class="dayview-head">
            <h3 class="dayview-title">${t(day.title)}</h3>
            <p class="dayview-meta">${[day.day, day.dateLabel, day.place]
              .filter(Boolean).map(t).join(' / ')}</p>
          </header>
          <div class="dayview-blurb">${(day.blurb || []).map(p => `<p>${t(p)}</p>`).join('')}</div>
          <div class="keepsakes">${(day.keepsakes || []).map(([kind, note]) =>
            `<div class="keepsake${/stub|ticket|pass/i.test(kind) ? ' keepsake--stub' : ''}">
              <span class="keepsake-kind">${t(kind)}</span>
              <span class="keepsake-note">${t(note)}</span>
            </div>`).join('')}</div>
          <div class="daygrid" data-gallery="day">${rest.map(frameHTML).join('')}</div>
        </div>
      </div>
      <button class="dayview-close" type="button" data-close aria-label="Close">${ICON_X}</button>
      <button class="dayview-step dayview-step--prev" type="button" data-step="-1"
        aria-label="Previous day"${i <= 0 ? ' disabled' : ''}>${ICON_PREV}</button>
      <button class="dayview-step dayview-step--next" type="button" data-step="1"
        aria-label="Next day"${i >= days.length - 1 ? ' disabled' : ''}>${ICON_NEXT}</button>`;

    dayview.querySelector('[data-close]').addEventListener('click', () => {
      location.hash = '#photos/' + col.slug;
    });
    dayview.querySelectorAll('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = days[i + Number(btn.dataset.step)];
        if (next) location.hash = '#photos/' + col.slug + '/' + next.key;
      });
    });
    dayview.querySelector('[data-gallery="day"]').addEventListener('click', e => {
      const f = e.target.closest('.frame');
      if (f) openFrame(rest, +f.dataset.frame);
    });
    return dayview;
  }

  /* ── The ceremony ──────────────────────────────────────────────────────
     Gather, fly, paint.

     ⚠️ The stage is flown by its INVERSE: it is animated from where the stamp
     was to where it already is, rather than a clone being flown and thrown
     away. One element, so there is nothing to dispose of if the route moves
     mid-flight, and the thing that lands is the thing that gets painted. */
  function openDay(col, key) {
    const days = col.days || [];
    const i = days.findIndex(d => d.key === key);
    if (i < 0) return;
    const day = days[i];

    const stamps = scroll.querySelector('.stamps');
    const stamp = stamps && stamps.querySelector(`.stamp[data-key="${CSS.escape(key)}"]`);
    if (stamps && stamps._riffleStop) stamps._riffleStop();

    buildDayView(col, day, i);
    dayview.hidden = false;
    dayview.querySelector('.dayview-scroll').scrollTop = 0;

    const scan = dayview.querySelector('.scan');
    const stage = dayview.querySelector('.scan-stage');

    // Draw the rest of the sheet in toward the middle as they go.
    if (stamps && !reduced && photos.enabled) {
      const box = stamps.getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      stamps.querySelectorAll('.stamp').forEach(s => {
        if (s === stamp) return;
        const r = s.getBoundingClientRect();
        s.style.setProperty('--gx', ((cx - r.left - r.width / 2) * 0.34).toFixed(1) + 'px');
        s.style.setProperty('--gy', ((cy - r.top - r.height / 2) * 0.34).toFixed(1) + 'px');
      });
      stamps.classList.add('is-gathering');
    }
    if (stamp) stamp.classList.add('is-open');

    requestAnimationFrame(() => dayview.classList.add('is-in'));

    let painted = false;
    const paint = () => {
      if (painted) return;
      painted = true;
      scan.classList.add('is-painting');
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        scan.classList.add('is-painted');
        scan.classList.remove('is-painting');
      }, photos.scanDur + 60);
    };

    const card = stamp && stamp.querySelector('.stamp-card');
    if (!card || reduced || !photos.enabled) { paint(); return; }

    // Measured FLIP, both boxes read in one task with nothing painting
    // between them.
    //
    // ⚠️ Centres and offsetWidth, NOT the rects' own left/top/width. The stamp
    // is pinned on a slight angle, and getBoundingClientRect on a rotated
    // element returns the axis-aligned box AROUND it — a box a couple of
    // percent too wide, which is a couple of percent of scale error arriving
    // exactly as the flight hands over to the resting layout. The centre of
    // that box is still the centre of the element, and offsetWidth is still
    // the unrotated width, so both survive the rotation.
    const from = card.getBoundingClientRect();
    const to = stage.getBoundingClientRect();
    if (!from.width || !to.width || !stage.offsetWidth) { paint(); return; }

    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    const scale = card.offsetWidth / stage.offsetWidth;

    const flight = stage.animate(
      [{ transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` +
                    ` scale(${scale.toFixed(4)}) rotate(${day.tilt || 0}deg)` },
       { transform: 'none' }],
      { duration: photos.flyDur, easing: EASE, fill: 'both' }
    );
    flight.finished.catch(() => {}).then(() => {
      flight.cancel();
      paint();
    });
    // ⚠️ A floor under the flight, not a second timing. Animations are frozen
    // while the tab is in the background, so `finished` can be arbitrarily
    // late — and everything below it (the brush, the lamp, the EXIF) hangs off
    // that promise. Without this, opening a day and glancing at another tab
    // comes back to a stamp sitting in the middle of the sheet doing nothing.
    setTimeout(paint, photos.flyDur + 400);
  }

  function closeDay() {
    clearTimeout(scanTimer);
    const stamps = scroll.querySelector('.stamps');
    if (stamps) {
      stamps.classList.remove('is-gathering');
      stamps.querySelectorAll('.stamp').forEach(s => {
        s.classList.remove('is-open');
        s.style.removeProperty('--gx');
        s.style.removeProperty('--gy');
      });
    }
    if (!dayview) return;
    dayview.classList.remove('is-in');
    const el = dayview;
    setTimeout(() => { if (el === dayview && !openKey) el.hidden = true; }, 280);
  }

  /* ══ One frame, opened ═════════════════════════════════════════════════ */

  function openFrame(list, i) {
    const f = list[i];
    if (!f) return;
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.hidden = true;
      plates.appendChild(lightbox);
      lightbox.addEventListener('click', closeFrame);
    }
    const ex = f.exif || {};
    const bits = [ex.camera, ex.lens, ex.focal, ex.aperture, ex.shutter, ex.iso,
                  ex.date, ex.dimensions].filter(Boolean);
    lightbox.innerHTML =
      `<img src="${esc(f.src)}" alt="${t(f.alt || '')}" decoding="async">` +
      `<div class="lightbox-meta">${bits.map(b => `<span>${t(b)}</span>`).join('')}</div>`;
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add('is-in'));
  }

  function closeFrame() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.classList.remove('is-in');
    setTimeout(() => { if (lightbox) lightbox.hidden = true; }, 240);
  }

  const frameOpen = () => lightbox && !lightbox.hidden;

  /* ══ Routing ═══════════════════════════════════════════════════════════
     paper.js owns the hash; this only decides what changed since the last
     call. ⚠️ Repainting a collection on every route would restart the cover,
     the lede and the twelve stamps every time a day is opened or closed —
     so the collection is painted once and the day is opened over it. */

  let view = null;   // null | 'index' | slug

  function paint(rest) {
    const slug = rest[0] || null;
    const leaf = rest[1] || null;

    if (!slug) {
      openKey = null;
      closeDay();
      if (view !== 'index') { view = 'index'; return loadIndex().then(paintIndex); }
      return Promise.resolve();
    }

    return loadIndex().then(() => {
      const meta = (index.collections || []).find(c => c.slug === slug);
      // A `soon` set has no page yet: a deep link goes back to the index.
      if (!meta || (meta.soon && !LOCAL)) { location.hash = '#photos'; return; }

      if (!meta.written) {
        openKey = null;
        closeDay();
        if (view !== slug) { view = slug; paintPlainSet(meta); }
        return;
      }

      return loadCollection(slug).then(col => {
        if (!col) { location.hash = '#photos'; return; }
        if (view !== slug) { view = slug; paintCollection(col); }

        // No stamps, no day view: a day's route just scrolls to its section.
        if (!isStamped(col)) {
          openKey = null;
          setGallery(false);
          const sec = leaf && scroll.querySelector(`.pday[data-key="${CSS.escape(leaf)}"]`);
          if (sec) sec.scrollIntoView({ block: 'start' });
          return;
        }

        // ⚠️ `play` is not a day and it is not a run of them. It clears the
        // page under the banner and lays the whole trip out in one field —
        // no steps, no modal, nothing to page through.
        const playing = leaf === 'play';
        setGallery(playing);

        const key = playing ? null : leaf;
        if (key === openKey) return;
        openKey = key || null;
        if (!openKey) { closeDay(); return; }
        openDay(col, openKey);
      });
    });
  }

  function leave() {
    clearTimeout(scanTimer);
    const stamps = scroll.querySelector('.stamps');
    if (stamps && stamps._riffleStop) stamps._riffleStop();
    closeFrame();
    openKey = null;
    closeDay();
    if (dayview) dayview.hidden = true;
    if (routeWatch) { routeWatch.disconnect(); routeWatch = null; }
    body.classList.remove('gallery');
    view = null;
  }

  /* ── Keys ──────────────────────────────────────────────────────────────
     Escape closes one layer at a time — the frame, then the day, then the
     section — rather than dumping the visitor back on the sheet from three
     levels down. The arrows walk the days, which is what makes the played
     gallery a gallery. */
  document.addEventListener('keydown', e => {
    if (!/^#photos/.test(location.hash)) return;

    if (e.key === 'Escape') {
      // One layer per press. ⚠️ preventDefault is what tells js/paper.js this
      // one is spoken for; without it the same press also unwinds the section
      // and closing a lightbox lands you back on the home sheet.
      if (frameOpen()) { e.preventDefault(); closeFrame(); return; }
      if (openKey) { e.preventDefault(); location.hash = '#photos/' + view; }
      return;
    }
    if (!openKey || frameOpen()) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const col = written.get(view);
    if (!col) return;
    const days = col.days || [];
    const i = days.findIndex(d => d.key === openKey);
    const next = days[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) { e.preventDefault(); location.hash = '#photos/' + view + '/' + next.key; }
  });

  window.photoSection = { paint, leave };
})();
