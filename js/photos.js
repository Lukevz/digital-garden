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
     • a written collection: cover banner, lede, twelve stamps
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
    liftStyle: 'flip', // 'flip' (turned over to a blank sheet) or 'crumple'
    liftDur: 800,    // a trip's cover flying from its card to the trip page's banner
    flipDur: 900,    // the photograph turned over to the blank sheet on its back
    crumpleDur: 560, // the photograph crumpling, begun while it is still settling
    paintDur: 1500,  // the illustration brushed over it
    flattenDur: 600, // the sheet smoothing back out, flat, as the illustration
    riffle: 420,     // ms a frame holds while the stamp is being hovered
    railRest: 2500,  // ms after picking a year before the year rail folds shut
    enabled: true,
  };
  const EASE = 'cubic-bezier(0.4, 0, 0.18, 1)';
  const LAND = 'cubic-bezier(0.16, 1, 0.3, 1)';   // a long, soft settle

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

  /* ── Moving between routes ─────────────────────────────────────────────
     js/paper.js owns the history (see "Back" there). Closing a day or play
     steps back to the trip rather than pushing it, and stepping day to day
     or redirecting replaces the entry, so the masthead's Back leaves the
     trip in one press instead of replaying every day that was opened. */
  const go = (how, hash) => (window.paper && window.paper[how]
    ? window.paper[how](hash) : (location.hash = hash));

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
  // `big` offers the full-size file as well, for contexts whose columns are
  // wider than the 760px thumb holds up at on a 2x screen (the day view).
  function frameHTML(f, i, big) {
    const w = f.w || 3, h = f.h || 4;
    const set = big === true && f.thumb && f.src && f.thumb !== f.src
      ? ` srcset="${esc(f.thumb)} 760w, ${esc(f.src)} 1800w" sizes="(max-width: 640px) 50vw, 320px"`
      : '';
    return `<button class="frame${f.standin ? ' frame--standin' : ''}" type="button"
      data-frame="${i}" style="--ar:${w}/${h}">
      <img src="${esc(f.thumb || f.src)}"${set} alt="${t(f.alt || '')}"
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
    const attrs = soon ? 'aria-disabled="true"' : `href="#photos/${esc(c.slug)}" data-slug="${esc(c.slug)}"`;
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

  /* The nav rests as a rail of two-digit years ("26") and opens to the full
     year on hover (photos.css, "The year rail"). The century is a span of its
     own that the rail folds to nothing, so the text is still "2026" to a
     screen reader and to copy-paste. */
  const yearLabel = y => {
    const m = /^(\d\d)(\d\d)$/.exec(y);
    if (m) return `<span class="pyear-long">${m[1]}</span>${m[2]}`;
    return `<span class="pyear-long">${t(y)}</span><span class="pyear-short" aria-hidden="true">?</span>`;
  };

  function paintIndex() {
    const years = chronology();
    if (!years.has(year)) year = years.keys().next().value || null;

    const nav = [...years].map(([y, its]) => `
      <li class="index-item${y === year ? ' is-current' : ''}">
        <button class="index-link" type="button" data-year="${esc(y)}"${y === year ? ' aria-current="true"' : ''}>
          <span class="index-title">${yearLabel(y)}</span>
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
      const trip = e.target.closest('a.ptrip[data-slug]');
      if (trip && liftTrip(trip, e)) return;
      const btn = e.target.closest('.frame');
      if (btn) openFrame(index.loose || [], +btn.dataset.frame);
    });
    // Warm the illustration while the pointer is still on its way to the
    // click, so the brush is not waiting on a download.
    card.addEventListener('pointerover', e => {
      const trip = e.target.closest('a.ptrip[data-slug]');
      const c = trip && tripMeta(trip.dataset.slug);
      if (c && c.coverArt) preload(c.coverArt);
    });
    /* On a wide sheet the nav is a rail that opens on hover (photos.css, "The
       year rail"). Picking a year folds it shut again a moment later, pointer
       or not, so the card is what's left to look at; it opens again once the
       pointer leaves and comes back, or keyboard focus moves on. */
    const pnav = scroll.querySelector('.pnav');
    clearTimeout(restTimer);
    const wake = () => { clearTimeout(restTimer); pnav.classList.remove('is-resting'); };
    pnav.addEventListener('click', e => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      showYear(btn.dataset.year);
      clearTimeout(restTimer);
      restTimer = setTimeout(() => pnav.classList.add('is-resting'), photos.railRest);
    });
    // A mouse click must not focus the year, or `:focus-within` holds the
    // panel open after the pointer has left.
    pnav.addEventListener('mousedown', e => { if (e.target.closest('[data-year]')) e.preventDefault(); });
    pnav.addEventListener('pointerleave', wake);
    // With clicks unfocusing, focus arriving is the keyboard moving on.
    pnav.addEventListener('focusin', wake);
    scroll.scrollTop = 0;
  }

  // The hot swap: the card's contents fade out, change, and fade back in; the
  // nav and the card itself stay put.
  let swapTimer = null;
  let restTimer = null;
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
      markReveal();
      watchReveal();
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
     ONE dotted line through the trip in the order it happened, laid out as
     a SERPENTINE: every other row of stamps runs right to left, so the line
     goes along a row, turns down in the margin past its last stamp, and comes
     back along the next — never backwards, and never across a caption. Each
     stamp carries its place in the route as a numbered badge, because a row
     that reads right to left needs one. A dot marks each end.

     ⚠️ Rows are built per VISUAL line (`STAMP_COLS`: four, or two under
     900px) and rebuilt when that changes. A row of four wrapping two-by-two
     inside one grid can't alternate direction line by line.

     ⚠️ Measured from the stamps themselves rather than drawn into a stretched
     viewBox: the grid is fluid, and a `preserveAspectRatio="none"` path would
     squash the U-turns, the only curves in it, into flat ellipses. */
  const STAMP_COLS = matchMedia('(max-width: 900px)');

  // An orthogonal polyline with every corner rounded (radius clamped to half
  // of either leg), which makes each turn at a row's end a clean U.
  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    const n = v => v.toFixed(1);
    let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
      if (!l1 || !l2) continue;
      const rr = Math.min(r, l1 / 2, l2 / 2);
      d += ` L${n(x1 - (x1 - x0) / l1 * rr)} ${n(y1 - (y1 - y0) / l1 * rr)}` +
           ` Q${n(x1)} ${n(y1)} ${n(x1 + (x2 - x1) / l2 * rr)} ${n(y1 + (y2 - y1) / l2 * rr)}`;
    }
    const e = pts[pts.length - 1];
    return d + ` L${n(e[0])} ${n(e[1])}`;
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

    // Each row in the order it is travelled (DOM order is chronological; a
    // reversed row is only reversed on screen). offsetWidth for the extent,
    // because the stamps are tilted and their rects are the boxes AROUND them.
    const rows = [...stamps.querySelectorAll('.stamp-row')].map(row => {
      const cards = [...row.querySelectorAll('.stamp-card')].map(c => {
        const r = c.getBoundingClientRect();
        const cx = r.left - box.left + r.width / 2, cy = r.top - box.top + r.height / 2;
        return { cx, cy, l: cx - c.offsetWidth / 2, r: cx + c.offsetWidth / 2 };
      });
      return { cards, y: cards.reduce((a, c) => a + c.cy, 0) / (cards.length || 1) };
    }).filter(r => r.cards.length);
    if (!rows.length) return;

    const gap = parseFloat(getComputedStyle(stamps.querySelector('.stamp-row')).columnGap) || 40;
    const m = Math.max(24, gap * 0.8);   // how far past a row's end the turn swings
    const pts = [];
    rows.forEach((row, i) => {
      const first = row.cards[0], last = row.cards[row.cards.length - 1];
      pts.push([first.cx, row.y]);
      const next = rows[i + 1];
      if (!next) { pts.push([last.cx, row.y]); return; }
      const edge = last.cx >= first.cx
        ? Math.max(...row.cards.map(c => c.r)) + m
        : Math.min(...row.cards.map(c => c.l)) - m;
      pts.push([edge, row.y], [edge, next.y]);
    });

    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    svg.querySelector('path').setAttribute('d', roundedPath(pts, m));
    const ends = svg.querySelectorAll('circle');
    [pts[0], pts[pts.length - 1]].forEach((p, k) => {
      ends[k].setAttribute('cx', p[0].toFixed(1));
      ends[k].setAttribute('cy', p[1].toFixed(1));
    });
  }

  function stampRowsHTML(days) {
    const per = STAMP_COLS.matches ? 2 : 4;
    let out = '';
    for (let i = 0; i < days.length; i += per) {
      const rev = (i / per) % 2 === 1;
      out += `<div class="stamp-row${rev ? ' stamp-row--rev' : ''}">${
        days.slice(i, i + per).map((d, k) => stampHTML(d, i + k)).join('')}</div>`;
    }
    return out;
  }

  // `n` is the stamp's place in the route; the bonus day, which spans the
  // whole trip, is a `+` rather than a thirteenth stop.
  function stampHTML(d, n) {
    const long = d.title.length > 22;
    return `<button class="stamp" type="button" data-key="${esc(d.key)}"
              style="--tilt:${d.tilt || 0}deg; transform:rotate(${d.tilt || 0}deg)">
      <span class="stamp-num" aria-hidden="true">${d.key === 'bonus' ? '+' : n + 1}</span>
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
        <div class="pcol-cover">
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

    scroll.innerHTML = `
      <article class="pcol">
        <div class="pcol-cover">
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
            <circle r="4.5" fill="currentColor"/><circle r="4.5" fill="currentColor"/>
          </svg>
          <div class="stamp-rows">${stampRowsHTML(days)}</div>
        </div>
        <div class="pgallery" hidden>${playDaysHTML(days)}</div>
      </article>`;

    const stamps = scroll.querySelector('.stamps');
    stamps.addEventListener('click', e => {
      const s = e.target.closest('.stamp');
      if (s) location.hash = '#photos/' + col.slug + '/' + s.dataset.key;
    });
    wireRiffle(stamps, col);

    const gallery = scroll.querySelector('.pgallery');
    gallery._days = days;
    gallery.addEventListener('click', e => {
      const f = e.target.closest('.frame');
      const sec = f && f.closest('.pgday');
      const day = sec && days.find(d => d.key === sec.dataset.key);
      if (day) openFrame(day.frames || [], +f.dataset.frame);
    });

    scroll.querySelector('[data-play]').addEventListener('click', () => {
      if (body.classList.contains('gallery')) go('closeTo', '#photos/' + col.slug);
      else location.hash = '#photos/' + col.slug + '/play';
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
    stampDays = days;

    scroll.scrollTop = 0;
  }

  let routeWatch = null, stampDays = null;

  // Four to a row or two: the rows are rebuilt, not reflowed, so the
  // serpentine still alternates line by line. Listeners live on `.stamps`.
  STAMP_COLS.addEventListener('change', () => {
    const stamps = stampDays && scroll.querySelector('.stamps');
    const rows = stamps && stamps.querySelector('.stamp-rows');
    if (!rows) return;
    if (stamps._riffleStop) stamps._riffleStop();
    rows.innerHTML = stampRowsHTML(stampDays);
    markReveal();
    watchReveal();
    requestAnimationFrame(() => drawRoute(stamps, true));
  });

  /* ── Play, a day at a time ─────────────────────────────────────────────
     The whole trip in one field, but broken at each day by a big numbered
     marker, the photos index's year rail restated: a square chip with the
     day's number in it, stuck to the top of the view for as long as that
     day is scrolling past. Each day is the day view's own grid, keepsakes
     and all (`dayItemsOf()`), so the placeholders sit among the frames of
     the moment they belong to here too. */
  const dayNum = (d, n) => (d.key === 'bonus' ? '+' : String(n + 1).padStart(2, '0'));

  function playDaysHTML(days) {
    return days.map((d, n) => {
      const items = dayItemsOf(d.frames || [], d.keepsakes || []);
      return `<section class="pgday" id="pgday-${esc(d.key)}" data-key="${esc(d.key)}">
        <div class="pgday-mark" aria-hidden="true">
          <span class="pgday-num">${dayNum(d, n)}</span>
        </div>
        <div class="pgday-body">
          ${dayHeadHTML(d).replace('class="pday-head"', 'class="pday-head pgday-head"')}
          <div class="daygrid pgday-grid">${dayColumnsHTML(items)}</div>
        </div>
      </section>`;
    }).join('');
  }

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
      if (cover) {
        const top = cover.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
        scroll.scrollTop = Math.max(0, top + cover.offsetHeight - 40);
      }
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
        // Capped: a full day is over a hundred frames, and a hover should not
        // fetch all of them.
        cycle.innerHTML = day.frames.slice(0, 5)
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

  /* The EXIF as a line of facts, the same one the lightbox prints under a
     frame: values only, no labels. Shared by both, so they can't drift. */
  function exifBits(ex) {
    ex = ex || {};
    return [ex.camera, ex.lens, ex.focal, ex.aperture, ex.shutter, ex.iso,
            ex.date, ex.dimensions].filter(Boolean);
  }

  function exifHTML(ex) {
    return exifBits(ex)
      .map((b, i) => `<span class="scan-meta-item" style="--i:${i}">${t(b)}</span>`)
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
      // On <body>, like the lightbox: the whole viewport, over the masthead.
      document.body.appendChild(dayview);
    }

    dayview.innerHTML = `
      <div class="dayview-scroll">
        <div class="scan" style="--scan-dur:${photos.scanDur}ms">
          <figure class="scan-figure">
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
            <figcaption class="scan-meta">${exifHTML(hero.exif)}</figcaption>
          </figure>
          <!-- To the right of the photograph; the photograph keeps the
               centre of the view. -->
          <div class="dayview-body">
            <header class="dayview-head">
              <h3 class="dayview-title">${t(day.title)}</h3>
              <p class="dayview-meta">${[day.day, day.dateLabel, day.place]
                .filter(Boolean).map(t).join(' / ')}</p>
            </header>
            <div class="dayview-blurb">${(day.blurb || []).map(p => `<p>${t(p)}</p>`).join('')}</div>
          </div>
        </div>
        <!-- Out of the reading measure: the frames get the width of the view,
             each at its own ratio rather than cropped to a square. -->
        <div class="daygrid" data-gallery="day">${dayGridHTML(rest, day.keepsakes || [])}</div>
      </div>
      <button class="dayview-close" type="button" data-close aria-label="Close">${ICON_X}</button>
      <button class="dayview-step dayview-step--prev" type="button" data-step="-1"
        aria-label="Previous day"${i <= 0 ? ' disabled' : ''}>${ICON_PREV}</button>
      <button class="dayview-step dayview-step--next" type="button" data-step="1"
        aria-label="Next day"${i >= days.length - 1 ? ' disabled' : ''}>${ICON_NEXT}</button>`;

    dayview.querySelector('[data-close]').addEventListener('click', () => {
      go('closeTo', '#photos/' + col.slug);
    });
    dayview.querySelectorAll('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = days[i + Number(btn.dataset.step)];
        if (next) go('replaceRoute', '#photos/' + col.slug + '/' + next.key);
      });
    });
    dayview.querySelector('[data-gallery="day"]').addEventListener('click', e => {
      const f = e.target.closest('.frame');
      if (f) openFrame(rest, +f.dataset.frame);
    });
    return dayview;
  }

  /* ── Keepsakes, in the day's own order ─────────────────────────────────
     A ticket or a receipt belongs to a moment of the day, so it is a card in
     the masonry among that moment's frames, not a row of its own. In the
     manifest a keepsake is `[kind, note]`, or an object that can also carry:

       at      "HH:MM" — placed before the first frame taken at or after it
               (off each frame's EXIF time)
       after   a frame index — placed straight after that frame
       image   a scan of it (with `w` / `h`), shown instead of the empty slot

     With neither `at` nor `after`, a day's keepsakes are spread through it
     evenly, in the order they are listed. */
  const keepsakeOf = k => (Array.isArray(k) ? { kind: k[0], note: k[1] } : k || {});

  function keepsakeHTML(k) {
    const kind = k.kind || '';
    const cls = ['keepsake'];
    if (/stub|ticket|pass/i.test(kind)) cls.push('keepsake--stub');
    if (/receipt/i.test(kind)) cls.push('keepsake--receipt');
    if (/map/i.test(kind)) cls.push('keepsake--map');
    if (k.image) cls.push('keepsake--scan');
    const img = k.image
      ? `<img src="${esc(k.image)}" alt="${t(kind + (k.note ? ', ' + k.note : ''))}"${
          k.w && k.h ? ` width="${k.w}" height="${k.h}"` : ''} loading="lazy" decoding="async">`
      : '';
    return `<div class="${cls.join(' ')}">${img}
      <span class="keepsake-kind">${t(kind)}</span>
      <span class="keepsake-note">${t(k.note || '')}</span>
    </div>`;
  }

  const keepsakeRatio = k =>
    k.image && k.w && k.h ? k.w / k.h
      : /receipt/i.test(k.kind || '') ? 5 / 8
      : /map/i.test(k.kind || '') ? 1
      : 8 / 5;

  /* ⚠️ Laid out in ROW order, not with CSS columns. `columns` fills the first
     column top to bottom before starting the second, so the day would read
     down-then-across and a keepsake would land at the foot of a column rather
     than beside the frames it belongs with. Each item goes into whichever
     column is shortest so far, off the ratios the manifest already carries —
     no measuring — which reads left to right, top to bottom, like the day. */
  const DAY_COLS = matchMedia('(max-width: 640px)');
  let dayItems = null;

  function dayGridHTML(frames, keepsakes) {
    dayItems = dayItemsOf(frames, keepsakes);
    return dayColumnsHTML(dayItems);
  }

  function dayColumnsHTML(items) {
    const n = DAY_COLS.matches ? 2 : 3;
    const cols = Array.from({ length: n }, () => ({ h: 0, html: '' }));
    for (const it of items) {
      const c = cols.reduce((a, b) => (b.h < a.h - 1e-6 ? b : a));
      c.html += it.html;
      c.h += 1 / it.ar;
    }
    return cols.map(c => `<div class="daycol">${c.html}</div>`).join('');
  }

  DAY_COLS.addEventListener('change', () => {
    const grid = dayview && dayItems && dayview.querySelector('.daygrid');
    if (grid) grid.innerHTML = dayColumnsHTML(dayItems);
    // The played-through days follow the same switch.
    const g = scroll && scroll.querySelector('.pgallery');
    if (g && g._days) g.querySelectorAll('.pgday').forEach(sec => {
      const d = g._days.find(x => x.key === sec.dataset.key);
      const col = sec.querySelector('.pgday-grid');
      if (d && col) col.innerHTML = dayColumnsHTML(dayItemsOf(d.frames || [], d.keepsakes || []));
    });
  });

  function dayItemsOf(frames, keepsakes) {
    const ks = keepsakes.map(keepsakeOf);
    const slot = (k, i) => {
      if (Number.isInteger(k.after)) return Math.min(frames.length, k.after + 1);
      if (k.at) {
        const j = frames.findIndex(f => f.exif && f.exif.time && f.exif.time >= k.at);
        return j < 0 ? frames.length : j;
      }
      return Math.round((i + 1) * frames.length / (ks.length + 1));
    };
    const before = new Map();
    ks.forEach((k, i) => {
      const s = slot(k, i);
      (before.get(s) || before.set(s, []).get(s)).push(k);
    });
    const out = [];
    for (let n = 0; n <= frames.length; n++) {
      for (const k of before.get(n) || []) out.push({ html: keepsakeHTML(k), ar: keepsakeRatio(k) });
      // `n` stays the frame's index in `frames`, which is what openFrame reads.
      if (n < frames.length) {
        const f = frames[n];
        out.push({ html: frameHTML(f, n, true), ar: (f.w || 3) / (f.h || 4) });
      }
    }
    return out;
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

  /* ══ Opening a trip ═════════════════════════════════════════════════════
     A trip whose index entry carries `coverArt` (the illustration its page
     opens on) doesn't just navigate. Its cover photograph lifts off the card
     and flies to EXACTLY where the trip page's banner is going to sit while
     the index fades off the sheet. There the paper crumples, the
     illustration is brushed over the photograph a stroke at a time, and the
     sheet smooths back out flat as the illustration. Then the page comes in
     underneath — the banner already in place, the lede and stamps fading up
     below it — and the overlay fades off, which reads as nothing more than
     the banner's title arriving.

     ⚠️ The landing box is MEASURED, not guessed. `bannerRect()` lays out a
     hidden probe with the trip page's own `.pcol > .pcol-cover` markup in the
     plates, so the flight ends on the banner's real rect; once the route has
     painted, the real banner is measured again and wins. Anything looser and
     the page shifts under the overlay at the handover.

     ⚠️ The brush is a CANVAS, not a CSS mask. Each stroke is a few dozen
     bristles drawn into a mask canvas, and the illustration is composited
     through it (`source-in`) every frame. That is what makes the strokes
     streaky and dry at the edges rather than one soft-edged sweep. */
  let lift = null;
  const tripMeta = slug => ((index && index.collections) || []).find(c => c.slug === slug);
  const warmed = new Map();
  const preload = src => {
    if (!warmed.has(src)) {
      const im = new Image();
      im.decoding = 'async';
      im.src = src;
      warmed.set(src, im);
    }
    return warmed.get(src);
  };
  const decoded = im => (im.decode ? im.decode().catch(() => {}) : Promise.resolve());
  const within = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);

  function bannerRect() {
    const probe = document.createElement('div');
    probe.className = 'tripscan-probe';
    probe.innerHTML = '<article class="pcol"><div class="pcol-cover"></div></article>';
    plates.appendChild(probe);
    const r = probe.querySelector('.pcol-cover').getBoundingClientRect();
    probe.remove();
    return r;
  }

  function liftTrip(a, e) {
    const c = tripMeta(a.dataset.slug);
    const img = a.querySelector('.ptrip-cover img');
    if (!c || !c.coverArt || !img || lift || reduced || !photos.enabled) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return false;
    e.preventDefault();

    const art = preload(c.coverArt);
    loadCollection(c.slug);   // so the page is ready to paint the moment the hash moves
    // The card's WINDOW, not its image: on hover the image is scaled up
    // inside it, and flying the image's rect would pop out by that much.
    const win = img.closest('.ptrip-cover') || img;
    const from = win.getBoundingClientRect();
    const hover = new DOMMatrix(getComputedStyle(img).transform === 'none' ? undefined : getComputedStyle(img).transform).a || 1;
    const to = bannerRect();
    if (!from.width || !to.width) { location.hash = '#photos/' + c.slug; return true; }

    // Two ways to turn it into the illustration. `flip`: the photograph is
    // turned over, and the illustration is painted onto the blank sheet on
    // its back. `crumple`: it crumples, the illustration is brushed over the
    // photograph itself, and it flattens back out.
    const flip = photos.liftStyle !== 'crumple';
    const painting = `
          <canvas class="tripscan-brush" aria-hidden="true"></canvas>
          <img class="tripscan-art" src="${esc(c.coverArt)}" alt="" decoding="async">`;
    const el = document.createElement('div');
    el.className = 'tripscan' + (flip ? ' tripscan--flip' : '');
    el.style.setProperty('--flip-dur', photos.flipDur + 'ms');
    el.style.setProperty('--crumple-dur', photos.crumpleDur + 'ms');
    el.style.setProperty('--flatten-dur', photos.flattenDur + 'ms');
    el.innerHTML = `
      <div class="tripscan-stage">
        <span class="tripscan-shade" aria-hidden="true"></span>
        <div class="tripscan-card">
          <div class="tripscan-paper">
            <img class="tripscan-photo" src="${esc(img.currentSrc || img.src)}" alt="${t(c.coverAlt || '')}">${
            flip ? '' : painting + '\n          <canvas class="tripscan-creases" aria-hidden="true"></canvas>'}
          </div>${flip ? `
          <div class="tripscan-back">${painting}
          </div>` : ''}
        </div>
      </div>`;
    plates.appendChild(el);
    const stage = el.firstElementChild;
    const paper = stage.querySelector('.tripscan-paper');
    const photo = paper.querySelector('.tripscan-photo');
    // Where the brush works: the back of the sheet, or the photograph itself.
    const surface = stage.querySelector('.tripscan-back') || paper;

    const state = lift = { el, stage, paper, surface, flip, art, slug: c.slug, to, timers: [], raf: 0 };
    state.later = (fn, ms) => state.timers.push(setTimeout(fn, ms));
    placeStage(state, to);
    el.addEventListener('click', () => skipLift(state));

    // The card holds the 1000px photograph; the full one takes over once it
    // is decoded AND the flight is down — a decode landing mid-flight is a
    // dropped frame. Same picture, so the swap is invisible.
    if (c.coverFull) {
      state.full = preload(c.coverFull);
      state.photo = photo;
      state.fullSrc = c.coverFull;
    }

    a.classList.add('is-lifted');
    scroll.classList.add('is-lifting');

    // The card crops the photograph to 21:8, the banner is 16:9: the flight
    // starts clipped to exactly the card's crop and opens out as it lands.
    const s = Math.max(from.width / to.width, from.height / to.height);
    const iv = Math.max(0, (to.height - from.height / s) / 2);
    const ih = Math.max(0, (to.width - from.width / s) / 2);
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    // A long, soft ease-out: most of the distance early, then a slow settle
    // onto the banner's rect rather than arriving at speed.
    const timing = { duration: photos.liftDur, easing: LAND, fill: 'both' };
    state.flight = [
      stage.animate([{ transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${s.toFixed(4)})` },
                     { transform: 'none' }], timing),
      paper.animate([{ clipPath: `inset(${iv.toFixed(1)}px ${ih.toFixed(1)}px round ${(6 / s).toFixed(2)}px)` },
                     { clipPath: 'inset(0px 0px round 20px)' }], timing),
    ];
    if (hover !== 1) {
      state.flight.push(photo.animate([{ transform: `scale(${hover})` }, { transform: 'none' }], timing));
    }
    Promise.all(state.flight.map(f => f.finished.catch(() => {})))
      .then(() => { if (lift === state) state.flight.forEach(f => f.cancel()); });
    // The beats OVERLAP the landing rather than waiting for it: the `LAND`
    // ease covers ~97% of the distance in the first half, and a flight that
    // settled fully before anything else happened read as a long pause after
    // the click. Timers, not `finished`, so a background tab can't stall it.
    state.later(() => prep(state), photos.liftDur * 0.55);
    state.later(() => (flip ? turnOver(state) : crumple(state)), photos.liftDur * (flip ? 0.72 : 0.8));
    return true;
  }

  function placeStage(state, r) {
    state.to = r;
    Object.assign(state.stage.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
  }

  function routeLift(state) {
    if (lift !== state || state.routed) return;
    state.routed = true;
    location.hash = '#photos/' + state.slug;
  }

  function pagePainted(state) {
    if (lift !== state) return;
    const banner = scroll.querySelector('.pcol-cover');
    if (!banner) { settleLift(); return; }
    // The banner is already on screen (it IS the stage), so it doesn't fade
    // on with the rest — and a `.sr` block sits a few pixels low until it has.
    banner.classList.remove('sr');
    state.banner = banner;
    const r = banner.getBoundingClientRect();
    if (Math.abs(r.left - state.to.left) + Math.abs(r.top - state.to.top) +
        Math.abs(r.width - state.to.width) + Math.abs(r.height - state.to.height) > 1) placeStage(state, r);
    state.pageReady = true;
    reveal(state);
  }

  // Land → crumple → brush → flatten. Each beat hands to the next on a timer
  // off the tunables, so `photos.paintDur = 6000` slows only the brush.
  /* The heavy work, done once the index has faded and the photo is all but
     landed (moving a pixel or two a frame): the route moves (the whole trip
     page paints into the invisible scroller, a ~50ms frame), the creases are
     drawn, and the photograph is swapped up to full size. Done in the fast
     part of the flight or mid-crumple, each of those was a visible hitch. */
  function prep(state) {
    if (lift !== state || state.prepped) return;
    state.prepped = true;
    routeLift(state);
    if (state.full) {
      decoded(state.full).then(() => { if (lift === state) state.photo.src = state.fullSrc; });
    }
    const cv = state.paper.querySelector('.tripscan-creases');
    if (cv) {
      cv.width = state.paper.offsetWidth;
      cv.height = state.paper.offsetHeight;
      drawCreases(cv, seeded(11));
    }
    // ⚠️ The brush draws the illustration into a canvas every frame, and a
    // plain <img> handed to drawImage() can be decoded synchronously on the
    // first draw — an intermittent ~120ms stall right as the brush started.
    // An ImageBitmap is decoded off the main thread, up front.
    state.bitmap = decoded(state.art)
      .then(() => (window.createImageBitmap && state.art.naturalWidth ? createImageBitmap(state.art) : null))
      .catch(() => null)
      .then(bmp => (state.bmp = bmp));
    // And the <img> that fades up over the last strokes, for the same reason.
    const artEl = state.surface.querySelector('.tripscan-art');
    if (artEl) decoded(artEl);
  }

  /* Turned over: the photograph flips on its vertical axis, lifting toward
     you as it goes, and the back of it is a blank sheet of watercolour
     paper the colour of the illustration's own. The brush starts as the
     turn settles, and paints the illustration onto that sheet. */
  function turnOver(state) {
    if (lift !== state || state.crumpled) return;
    state.crumpled = true;
    prep(state);
    state.el.classList.add('is-turning');
    const brush = () => {
      if (lift !== state || state.brushing) return;
      state.brushing = true;
      paintBrush(state, () => {
        state.el.classList.add('is-painted');
        state.later(() => { state.transformed = true; reveal(state); }, 380);
      });
    };
    within(state.bitmap || decoded(state.art), 1500).then(() => state.later(brush, photos.flipDur * 0.82));
  }

  function crumple(state) {
    if (lift !== state || state.crumpled) return;
    state.crumpled = true;
    prep(state);
    state.el.classList.add('is-crumpled');
    const brush = () => {
      if (lift !== state || state.brushing) return;
      state.brushing = true;
      paintBrush(state, () => {
        state.el.classList.add('is-painted', 'is-flat');
        state.later(() => { state.transformed = true; reveal(state); }, photos.flattenDur);
      });
    };
    within(state.bitmap || decoded(state.art), 1500).then(() => state.later(brush, photos.crumpleDur * 0.35));
  }

  function paintBrush(state, done) {
    const cv = state.surface.querySelector('.tripscan-brush');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(state.surface.offsetWidth * dpr);
    const H = Math.round(state.surface.offsetHeight * dpr);
    if (!W || !H || !state.art.naturalWidth) { done(); return; }
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mx = mask.getContext('2d');
    mx.strokeStyle = '#fff';
    mx.lineCap = 'round';

    const strokes = brushStrokes(W, H, seeded(29));
    const n = strokes.length, span = 0.24;
    strokes.forEach((st, i) => { st.t0 = i * (1 - span) / (n - 1); st.t1 = st.t0 + span; st.u = 0; });
    const start = performance.now();

    const frame = now => {
      if (lift !== state) return;
      const T = Math.min(1, (now - start) / photos.paintDur);
      for (const st of strokes) {
        const x = Math.min(1, Math.max(0, (T - st.t0) / (st.t1 - st.t0)));
        const u = 0.5 - 0.5 * Math.cos(Math.PI * x);   // a hand: slow on, quick across, slow off
        if (u > st.u) { drawStroke(mx, st, st.u, u, dpr); st.u = u; }
      }
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      drawCover(ctx, state.bmp || state.art, W, H);
      if (T < 1) state.raf = requestAnimationFrame(frame);
      else done();
    };
    state.raf = requestAnimationFrame(frame);
    // Floor: rAF never fires in a background tab.
    state.later(() => { if (lift === state && !state.el.classList.contains('is-painted')) done(); },
      photos.paintDur + 1500);
  }

  /* Crumpled paper is FACETS: flat planes meeting at sharp creases, each
     turned a little to the light. A jittered grid, each cell split on a
     random diagonal, each triangle shaded by a random normal against one
     light — drawn once, around mid-grey, and laid over the sheet with
     `soft-light`, so it lightens and darkens without shifting the tone.
     ⚠️ Kept faint: at full contrast the facets read as low-poly art, not paper. */
  function drawCreases(cv, rnd) {
    const W = cv.width, H = cv.height;
    if (!W || !H) return;
    const ctx = cv.getContext('2d');
    const cols = 13, rows = 8, pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const jx = i === 0 || i === cols ? 0 : (rnd() - 0.5) * 0.85;
      const jy = j === 0 || j === rows ? 0 : (rnd() - 0.5) * 0.85;
      pts.push([(i + jx) * W / cols, (j + jy) * H / rows]);
    }
    const P = (i, j) => pts[j * (cols + 1) + i];
    const L = [-0.5, -0.6, 0.62];
    const tri = (a, b, c) => {
      const nx = (rnd() - 0.5) * 1.1, ny = (rnd() - 0.5) * 1.1;
      const d = (nx * L[0] + ny * L[1] + L[2]) / Math.hypot(nx, ny, 1);
      const v = Math.max(0, Math.min(255, Math.round(128 + (d - 0.62) * 130)));
      ctx.fillStyle = ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();   // closes the antialiasing seam between neighbours
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (rnd() < 0.5) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
    }
  }

  function drawCover(ctx, im, W, H) {
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    const k = Math.max(W / iw, H / ih);
    const w = iw * k, h = ih * k;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  }

  function seeded(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Laid in the way a hand works a wash: broad diagonal strokes on a loose
     grid, each off its neighbours' angle and running either way, taken
     roughly top-left to bottom-right; then a few smaller ones over the top.
     ⚠️ Not full-width horizontal passes — that was tried, and a straight edge
     crossing the whole sheet reads as a scanner (see the erase in paper.js).
     Every stroke is a band of bristles with its own weight, wobble and dry
     breaks, which run out toward the end of the stroke as a brush does. */
  function brushStrokes(W, H, rnd) {
    const cols = 4, rows = 3, out = [];
    const stroke = (cx, cy, len, w) => {
      const ang = (rnd() - 0.5) * 0.9 + (rnd() < 0.5 ? 0 : Math.PI);
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      out.push({ ax: cx - dx, ay: cy - dy, bx: cx + dx, by: cy + dy, w,
                 key: cy + cx * 0.3 + (rnd() - 0.5) * H * 0.3 });
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      stroke((c + 0.5 + (rnd() - 0.5) * 0.5) * W / cols, (r + 0.5 + (rnd() - 0.5) * 0.4) * H / rows,
             W * (0.42 + rnd() * 0.18), H * (0.38 + rnd() * 0.1));
    }
    out.sort((a, b) => a.key - b.key);
    for (let i = 0; i < 4; i++) {
      stroke(W * (0.15 + rnd() * 0.7), H * (0.15 + rnd() * 0.7), W * (0.28 + rnd() * 0.12), H * 0.24);
    }
    for (const st of out) {
      st.len = Math.hypot(st.bx - st.ax, st.by - st.ay);
      st.nx = -(st.by - st.ay) / st.len;
      st.ny = (st.bx - st.ax) / st.len;
      st.bow = (rnd() - 0.5) * st.w * 0.7;
      st.bristles = Array.from({ length: 36 }, () => {
        const o = rnd() - 0.5;
        return {
          o,
          a: (0.45 + rnd() * 0.55) * (1 - Math.abs(o) * 0.9),
          lw: (0.025 + rnd() * 0.05) * st.w,
          ph: rnd() * 6.283,
          fr: 0.003 + rnd() * 0.008,
          dry: 0.25 + rnd() * 0.75,
        };
      });
    }
    return out;
  }

  function drawStroke(mx, st, u0, u1, dpr) {
    const step = 5 * dpr / st.len;
    const at = (b, u) => {
      const bow = st.bow * Math.sin(Math.PI * u);
      const width = st.w * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.6)));
      const off = b.o * width + Math.sin(b.ph + u * st.len * b.fr) * st.w * 0.035 + bow;
      return [st.ax + (st.bx - st.ax) * u + st.nx * off, st.ay + (st.by - st.ay) * u + st.ny * off];
    };
    // The belly of the brush: a solid core so the middle of a pass is
    // covered. Tapered in at the start and out at the end, the way a loaded
    // brush touches down and lifts off; a constant width with round caps drew
    // every stroke's first frames as a circle, which on blank paper read as
    // a blob rather than a mark.
    mx.globalAlpha = 0.9;
    const core = { o: 0, ph: 0, fr: 0 };
    const ease = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    let p = at(core, u0);
    for (let u = u0 + step; u < u1 + step; u += step) {
      const v = Math.min(u, u1);
      const q = at(core, v);
      mx.lineWidth = st.w * 0.46 * (0.18 + 0.82 * ease(0, 0.16, v)) * (1 - 0.55 * ease(0.82, 1, v));
      mx.beginPath();
      mx.moveTo(p[0], p[1]);
      mx.lineTo(q[0], q[1]);
      mx.stroke();
      p = q;
    }
    for (const b of st.bristles) {
      mx.globalAlpha = b.a;
      mx.lineWidth = b.lw;
      mx.beginPath();
      let pen = false;
      for (let u = u0; u < u1; u += step) {
        const v = Math.min(u + step, u1);
        // Dry breaks, more of them as the paint runs out.
        const h = Math.sin(b.ph * 7.1 + v * st.len * b.fr * 3.7) * 0.5 + 0.5;
        if (h < b.dry * v * v * 0.55) { pen = false; continue; }
        const q0 = at(b, u), q1 = at(b, v);
        if (!pen) { mx.moveTo(q0[0], q0[1]); pen = true; }
        mx.lineTo(q1[0], q1[1]);
      }
      mx.stroke();
    }
    mx.globalAlpha = 1;
  }

  // The page is painted and the sheet is flat: bring the page up under the
  // overlay, then fade the overlay off the identical banner.
  function reveal(state) {
    if (lift !== state || !state.transformed || !state.pageReady || state.revealing) return;
    state.revealing = true;
    const img = state.banner.querySelector('img');
    within(img ? decoded(img) : Promise.resolve(), 1500).then(() => {
      if (lift !== state) return;
      // Content fades on under the banner from the top down (and the rest as
      // it is scrolled to); the overlay goes as the first of it arrives, which
      // reads as the banner's title fading in.
      scroll.classList.remove('is-lifting');
      watchReveal();
      state.later(() => settleLift(), 200);
    });
  }

  // Click or Escape: straight to the end state, flat and painted, in place.
  function skipLift(state) {
    if (lift !== state) return;
    (state.flight || []).forEach(f => f.cancel());
    cancelAnimationFrame(state.raf);
    state.prepped = state.crumpled = state.brushing = true;
    state.el.classList.add('is-skipped', 'is-painted');
    state.el.classList.remove('is-crumpled', 'is-flat');
    if (state.flip) state.el.classList.add('is-turned');
    state.transformed = true;
    if (!state.routed) routeLift(state);
    else reveal(state);
  }

  // Done, or the route went somewhere else: take the overlay down. `instant`
  // when the whole section is being left.
  function settleLift(instant) {
    const state = lift;
    if (!state) return;
    lift = null;
    state.timers.forEach(clearTimeout);
    cancelAnimationFrame(state.raf);
    (state.flight || []).forEach(f => f.cancel());
    scroll.classList.remove('is-lifting');
    scroll.querySelectorAll('.ptrip.is-lifted').forEach(a => a.classList.remove('is-lifted'));
    if (state.bmp && state.bmp.close) state.bmp.close();
    if (instant) { state.el.remove(); return; }
    state.el.classList.add('is-out');
    setTimeout(() => state.el.remove(), 700);
  }

  /* ══ One frame, opened ═════════════════════════════════════════════════ */

  function openFrame(list, i) {
    const f = list[i];
    if (!f) return;
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.hidden = true;
      // On <body>, outside the sheet: it covers the whole viewport, masthead
      // included, rather than opening under the nav.
      document.body.appendChild(lightbox);
      lightbox.addEventListener('click', closeFrame);
    }
    lightbox.innerHTML =
      `<img src="${esc(f.src)}" alt="${t(f.alt || '')}" decoding="async">` +
      `<div class="lightbox-meta">${exifBits(f.exif).map(b => `<span>${t(b)}</span>`).join('')}</div>`;
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

  /* ── Changing page ─────────────────────────────────────────────────────
     Between the index and a trip the old page fades off (`.is-leaving`)
     before the new one is painted, and the new one then fades ON as you come
     to it: whatever is in view in order from the top, the rest as it is
     scrolled into view (`watchReveal()`). A cut from one page to the other
     read as a jump. ⚠️ Under a lift the scroller is already invisible and
     the lift does its own reveal, so the swap paints straight through. */
  let swapToken = 0;
  function swapIn(paintFn) {
    const token = ++swapToken;
    const lifting = scroll.classList.contains('is-lifting');
    if (lifting || reduced || !photos.enabled || !scroll.childElementCount) {
      paintFn();
      markReveal();
      if (!lifting) watchReveal();
      return Promise.resolve();
    }
    scroll.classList.add('is-leaving');
    return new Promise(r => setTimeout(r, 260)).then(() => {
      if (token !== swapToken) return;
      paintFn();
      markReveal();
      scroll.classList.remove('is-leaving');
      watchReveal();
    });
  }

  /* ── Fading on as you come to it ───────────────────────────────────────
     Blocks marked `.sr` start transparent and a few pixels low; each fades
     up the first time it scrolls into view, and a batch that arrives
     together (the first screen) is staggered top to bottom. `.sr--fade` is
     opacity only: the stamp rows, because the route is measured off where
     the stamps sit and a row caught mid-rise would bend it. */
  /* ⚠️ The start state goes on with transitions OFF. The paint functions
     read layout (`scrollTop = 0`), so the new page has already been styled
     fully opaque by the time it is marked — and a plain class add would
     then fade it DOWN and straight back up rather than on. */
  function markReveal() {
    const mark = (sel, cls) => [...scroll.querySelectorAll(sel)].filter(el => !el.classList.contains('sr'))
      .map(el => { el.style.transition = 'none'; el.classList.add(...cls); return el; });
    const els = [
      ...mark('.pcol-cover, .pcol-lede, .pcol-actions, .pday, .pday .frame, .pgallery .frame, .pgday-head, .pgallery .keepsake, ' +
              '.pnav, .pcard, .pchron > *', ['sr']),
      ...mark('.stamp-route, .stamp-row', ['sr', 'sr--fade']),
    ];
    if (!els.length) return;
    void scroll.offsetHeight;
    els.forEach(el => { el.style.transition = ''; });
  }

  let revealObs = null;
  function watchReveal() {
    const items = [...scroll.querySelectorAll('.sr:not(.is-shown)')];
    if (reduced || !photos.enabled || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-shown'));
      return;
    }
    if (!revealObs) {
      revealObs = new IntersectionObserver(entries => {
        entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
          .forEach((e, i) => {
            e.target.style.transitionDelay = Math.min(i, 8) * 70 + 'ms';
            e.target.classList.add('is-shown');
            revealObs.unobserve(e.target);
          });
      }, { root: scroll, rootMargin: '0px 0px -4% 0px' });
    }
    items.forEach(el => revealObs.observe(el));
  }

  function paint(rest) {
    // The lightbox is on <body> over everything, so any route (Back included)
    // has to take it down or it would sit over whatever the route opens.
    closeFrame();
    const done = route(rest);
    // Mid-lift, the lift's own route is the trip being painted under the
    // overlay; any other route (Back, a deep link) takes the overlay down.
    if (lift) {
      const state = lift;
      const mine = rest[0] === state.slug && !rest[1];
      Promise.resolve(done).then(() => (mine ? pagePainted(state) : settleLift()), () => settleLift());
    }
    return done;
  }

  function route(rest) {
    const slug = rest[0] || null;
    const leaf = rest[1] || null;

    if (!slug) {
      openKey = null;
      closeDay();
      if (view !== 'index') { view = 'index'; return loadIndex().then(() => swapIn(paintIndex)); }
      return Promise.resolve();
    }

    return loadIndex().then(() => {
      const meta = (index.collections || []).find(c => c.slug === slug);
      // A `soon` set has no page yet: a deep link goes back to the index.
      if (!meta || (meta.soon && !LOCAL)) { go('replaceRoute', '#photos'); return; }

      if (!meta.written) {
        openKey = null;
        closeDay();
        if (view !== slug) { view = slug; return swapIn(() => paintPlainSet(meta)); }
        return;
      }

      return loadCollection(slug).then(col => {
        if (!col) { go('replaceRoute', '#photos'); return; }
        const fresh = view !== slug;
        view = slug;
        return (fresh ? swapIn(() => paintCollection(col)) : Promise.resolve()).then(() => {
          if (view !== slug) return;   // routed somewhere else during the fade

          // No stamps, no day view: a day's route just scrolls to its section.
          if (!isStamped(col)) {
            openKey = null;
            closeDay();
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
    });
  }

  function leave() {
    settleLift(true);
    swapToken++;
    scroll.classList.remove('is-leaving');
    if (revealObs) { revealObs.disconnect(); revealObs = null; }
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
      // Mid-lift, Escape skips to the end of it and opens the trip.
      if (lift) { e.preventDefault(); skipLift(lift); return; }
      // One layer per press. ⚠️ preventDefault is what tells js/paper.js this
      // one is spoken for; without it the same press also unwinds the section
      // and closing a lightbox lands you back on the home sheet.
      if (frameOpen()) { e.preventDefault(); closeFrame(); return; }
      if (openKey) { e.preventDefault(); go('closeTo', '#photos/' + view); }
      return;
    }
    if (!openKey || frameOpen()) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const col = written.get(view);
    if (!col) return;
    const days = col.days || [];
    const i = days.findIndex(d => d.key === openKey);
    const next = days[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) { e.preventDefault(); go('replaceRoute', '#photos/' + view + '/' + next.key); }
  });

  window.photoSection = { paint, leave };
})();
