/* ──────────────────────────────────────────────────────────────────────────
   paperlike — More.

   Two jobs, both behind the third item in the nav:

     • the ROW. More is a toggle, and opening it drops a second row of links
       underneath the first, the way the macOS menu bar's hidden icons drop
       into a bar of their own (Bartender). Only the class and `inert` change
       here; the motion is more.css.
     • the PAGES it links to — `#bookshelf`, `#gear`, `#appstack`, `#places` —
       and `#career`, which is not behind More but rides the same surface —
       painted into `#folio`, the plainest of the sheet's surfaces: a title and
       a list. Registers itself as `window.moreSection`, and js/paper.js hands
       it the route once the sheet has opened, exactly as it does photographs.

   ⚠️ Loads BEFORE js/paper.js, for the same reason js/photos.js does: both are
   deferred, paper.js reads `window.moreSection` on its very first route(), and
   swapping the two tags silently sends a `#gear` URL back to the home sheet.

   ⚠️ The toggle is DELEGATED off `.links`. The erase (rubOut in js/paper.js)
   swaps that element's innerHTML back in when it restores the copy, which
   replaces every node inside it — a listener on the button itself would be
   attached to a node that no longer exists.

   The data is static JSON in content/more/, extracted from the v2 site's own
   arrays (`git show 8bda88c:js/main.js`), and fetched once per page.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const body = document.body;
  const links = document.querySelector('.links');
  const folio = $('folio');
  const scroll = $('folioScroll');

  if (!links || !folio || !scroll) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;

  // The face has no em dash, en dash, middle dot or straight quote. paper.js
  // publishes its transliteration; until then (it loads second) fall through.
  const fold = t => (window.paper && window.paper.fold ? window.paper.fold(String(t)) : String(t));
  const esc = t => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const txt = t => esc(fold(t));

  /* ══ The row ═══════════════════════════════════════════════════════════ */

  let open = false;

  // The row's height, for the nav to ride up by when the sheet's bottom
  // padding is too shallow to hold it (see `.links.is-more` in more.css).
  function measure() {
    const row = $('moreRow');
    if (row) links.style.setProperty('--more-h', row.offsetHeight + 'px');
  }

  function setOpen(on) {
    open = on;
    links.classList.toggle('is-more', on);
    // Looked up each time: the erase swaps these nodes for fresh copies.
    const row = $('moreRow');
    const toggle = links.querySelector('.more-toggle');
    if (row) row.toggleAttribute('inert', !on);
    if (toggle) toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    measure();
  }

  links.addEventListener('click', e => {
    if (e.target.closest('.more-toggle')) setOpen(!open);
  });

  // Put it away by touching anything else, the way a menu bar is.
  document.addEventListener('click', e => {
    if (open && !links.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !open || body.classList.contains('reading')) return;
    setOpen(false);
    const toggle = links.querySelector('.more-toggle');
    if (toggle) toggle.focus();
  });

  window.addEventListener('resize', measure);
  measure();

  /* ══ The pages ═════════════════════════════════════════════════════════ */

  const cache = {};
  function getJSON(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(r => (r.ok ? r.json() : Promise.reject(r.status)));
      // A failed fetch must not be remembered, or the page stays broken until
      // a reload even after the network is back.
      cache[url].catch(() => { delete cache[url]; });
    }
    return cache[url];
  }

  // `action` is an optional control set inline with the title, far right
  // (Career's resume download). The meta line drops below both.
  const head = (title, meta, action) => `
    <header class="folio-head${action ? ' folio-head--action' : ''}">
      <h2 class="page-title">${txt(title)}</h2>
      ${action || ''}
      <p class="page-meta" id="folioMeta">${txt(meta || '')}</p>
    </header>`;

  const row = (i, inner, tag, attrs) => tag === 'a'
    ? `<li class="entry" style="--i:${i}"><a class="entry-in ${attrs.cls || ''}" href="${esc(attrs.href)}" target="_blank" rel="noopener">${inner}</a></li>`
    : `<li class="entry" style="--i:${i}"><div class="entry-in ${attrs.cls || ''}">${inner}</div></li>`;

  /* Bookshelf: covers and nothing else, grouped by the year each was read,
     newest year first and, inside a year, newest read first.

     The dates are content/more/bookshelf.json's `read` (build/read-dates.mjs
     stamps them from Goodreads). Some are estimates and some books have none:
     those are filed last under "< <oldest year we can date>" — the chevron is
     the site's own back mark, because the face has no "<" glyph and a fallback
     font's would be the one wrong character on the page.

     ⚠️ Each image carries its own aspect ratio so the shelf doesn't jump as
     they arrive, and they are NOT cropped to one shape: a couple of these
     books are square, and a 2:3 crop would take the sides off them. */
  const CHEVRON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6l6 6"/></svg>';

  function groupByYear(books) {
    const dated = books.filter(b => b.read).sort((a, b) => b.read.localeCompare(a.read));
    const undated = books.filter(b => !b.read);
    const groups = [];
    dated.forEach(b => {
      const year = b.read.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.books.push(b);
      else groups.push({ year, books: [b] });
    });
    if (undated.length) {
      const oldest = groups.length ? groups[groups.length - 1].year : '';
      groups.push({ year: oldest, before: true, books: undated });
    }
    return groups;
  }

  function renderBooks(books) {
    let n = 0;
    return head('Bookshelf', books.length + ' books') + '<div class="years">' + groupByYear(books).map(g => `
      <section class="year">
        <header class="year-head">
          <h3 class="year-label"${g.before ? ` aria-label="Before ${esc(g.year)}"` : ''}>${g.before ? CHEVRON : ''}<span>${esc(g.year)}</span></h3>
          <span class="year-count">${g.books.length} ${g.books.length === 1 ? 'book' : 'books'}</span>
        </header>
        <ul class="shelf">${g.books.map(b => `
          <li class="shelf-item" style="--i:${n++}">
            <img class="book" src="${esc(b.cover)}" alt="${esc(fold(b.title))}, ${esc(fold(b.author))}"
                 title="${esc(fold(b.title))}, ${esc(fold(b.author))}" loading="lazy"
                 style="aspect-ratio:${b.ratio || 0.66}">
          </li>`).join('')}
        </ul>
      </section>`).join('') + '</div>';
  }

  function renderGear(items) {
    return head('Gear', 'What I use every day') + `<ul class="entries">${items.map((g, i) => row(i, `
      <span class="entry-mark entry-mark--gear"><img src="${esc(g.img)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>
      <span class="entry-text">
        <span class="entry-name">${txt(g.name)}</span>
        <span class="entry-detail">${txt(g.detail)}</span>
      </span>`, 'div', {})).join('')}</ul>`;
  }

  function renderApps(items) {
    return head('App stack', 'What I open every day') + `<ul class="entries">${items.map((a, i) => row(i, `
      <span class="entry-mark entry-mark--app"><img src="${esc(a.img)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>
      <span class="entry-text">
        <span class="entry-name">${txt(a.name)}</span>
        <span class="entry-detail">${txt(a.detail)}</span>
      </span>`, 'a', { href: a.url })).join('')}</ul>`;
  }

  function renderPlaces() {
    return head('Places', '') + `
      <div class="map" id="placesMap" role="application" aria-label="Map of places I recommend"></div>
      <p class="map-note" id="mapNote" hidden></p>`;
  }

  /* Career: a nav of anchors in the left gutter, then three sections — the
     timeline, the principles, the case studies. All of it is
     content/career.json.

     The timeline runs SIDEWAYS, newest first: a horizontal rail with a dot per
     role, the period above it and the role hanging below. It is the one thing
     on the page wider than the measure — it spills into the right gutter,
     where the roles blur and fade — and the page's own scroll drives it: see
     "Career: the timeline's lock", below. The current role's dot is filled.

     The principles are the A -> X lockup rebuilt from the old site: a struck
     "UX" over a display "A -> X", the headline, and six traits. The lockup is
     live type and the arrow is drawn (the face has no arrow glyph).

     ⚠️ The face has no `%` or `~`, so the copy says "percent" and "about". */
  const TRAIT_ICONS = {
    adaptability: '<circle cx="8.6" cy="12" r="5.9"/><circle cx="15.4" cy="12" r="5.9"/>',
    boldness: '<path d="M13.5 2L4 13.5h6L9 22l10-11.5h-6.2L13.5 2z"/>',
    inclusivity: '<circle cx="7.2" cy="5.4" r="1.9"/><path d="M4 10.3a3.2 3.2 0 0 1 6.4 0"/><circle cx="16.8" cy="5.4" r="1.9"/><path d="M13.6 10.3a3.2 3.2 0 0 1 6.4 0"/><circle cx="7.2" cy="14.4" r="1.9"/><path d="M4 19.3a3.2 3.2 0 0 1 6.4 0"/><circle cx="16.8" cy="14.4" r="1.9"/><path d="M13.6 19.3a3.2 3.2 0 0 1 6.4 0"/>',
    articulation: '<path d="M21 14.5a2 2 0 0 1-2 2H8l-5 4.5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.5z"/>',
    curiosity: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
    resilience: '<path d="M12 21.5c4.6-2.1 7-5.6 7-10.2V4.8L12 2.5 5 4.8v6.5c0 4.6 2.4 8.1 7 10.2z"/>',
  };
  const ico = key => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${TRAIT_ICONS[key] || ''}</svg>`;

  // A case study with no `image` gets the placeholder plate; one with a `url`
  // is a link. One with no `url` isn't written yet and carries a "Coming soon"
  // badge over its plate, the way an unopened trip does on the photos index.
  // With no items at all the section is one "Coming soon" card.
  const PHOTO_ICO = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>';
  const caseCard = (c, i) => {
    const tag = c.url ? 'a' : 'div';
    const href = c.url ? ` href="${esc(c.url)}" target="_blank" rel="noopener"` : '';
    const img = c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : PHOTO_ICO;
    return `
      <li class="case-item" style="--i:${i}"><${tag} class="case"${href}>
        <span class="case-img${c.image ? '' : ' case-img--empty'}">${img}${c.url ? '' : '<span class="case-badge">Coming soon</span>'}</span>
        <span class="case-title">${txt(c.title)}</span>
        ${c.company ? `<span class="case-meta">${txt(c.company)}</span>` : ''}
      </${tag}></li>`;
  };

  // The nav's anchors. Buttons, not `#` links: the hash is the router's.
  const CAREER_SECTIONS = [
    ['careerTimeline', 'Timeline'],
    ['careerPrinciples', 'Principles'],
    ['careerCases', 'Case studies'],
  ];

  function renderCareer(d) {
    const roles = d.timeline.map((r, i) => `
      <li class="role${r.now ? ' role--now' : ''}" style="--i:${i}">
        <p class="role-period">${txt(r.period)}</p>
        <div class="role-body">
          <h4 class="role-title">${txt(r.role)}</h4>
          <p class="role-company">${txt(r.company)}</p>
          <p class="role-summary">${txt(r.summary)}</p>
          <ul class="role-notes">${r.highlights.map(h => `<li>${txt(h)}</li>`).join('')}</ul>
        </div>
      </li>`).join('');

    const p = d.principles;
    const traits = p.traits.map((t, i) => `
      <li class="trait" style="--i:${i}">
        ${ico(t.icon)}
        <h4 class="trait-title">${txt(t.title)}</h4>
        <p class="trait-text">${txt(t.text)}</p>
      </li>`).join('');

    const resume = d.resume ? `
      <a class="resume-btn" href="${esc(d.resume.url)}" target="_blank" rel="noopener">
        <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/></svg>
        <span>${txt(d.resume.label)}</span>
      </a>` : '';

    const c = d.cases;
    const sections = CAREER_SECTIONS.filter(([id]) => id !== 'careerCases' || c);
    const nav = `
      <nav class="career-nav" aria-label="On this page">
        <ul>${sections.map(([id, label], i) => `
          <li><button type="button" data-jump="${id}"${i ? '' : ' class="is-current" aria-current="true"'}>${txt(label)}</button></li>`).join('')}
        </ul>
      </nav>`;

    return `<div class="career">` + head('Career', d.span, resume) + nav + `
      <section class="career-sec" id="careerTimeline" aria-labelledby="timelineTitle">
        <h3 class="career-label" id="timelineTitle">Timeline</h3>
        <div class="tl">
          <div class="tl-scroll" tabindex="0" role="group" aria-label="Timeline, scrolls sideways">
            <ol class="roles">${roles}</ol>
          </div>
        </div>
      </section>

      <section class="career-sec principles" id="careerPrinciples" aria-labelledby="principlesTitle">
        <h3 class="career-label" id="principlesTitle">${txt(p.title)}</h3>
        <div class="ax" role="img" aria-label="From UX to A, Ask, to X, Experience">
          <span class="ax-ux" aria-hidden="true">UX</span>
          <span class="ax-mark" aria-hidden="true">
            <span class="ax-letter">A</span>
            <svg class="ax-arrow" viewBox="0 0 100 40"><path d="M0 20H93M77 5l16 15l-16 15"/></svg>
            <span class="ax-letter">X</span>
          </span>
        </div>
        <h3 class="principles-headline">${txt(p.headline)}</h3>
        <p class="principles-intro">${txt(p.intro)}</p>
        <p class="principles-lead">${txt(p.lead)}</p>
        <ul class="traits">${traits}</ul>
      </section>
      ${c ? `
      <section class="career-sec" id="careerCases" aria-labelledby="casesTitle">
        <h3 class="career-label" id="casesTitle">${txt(c.title)}</h3>
        ${c.items.length
          ? `<ul class="cases">${c.items.map(caseCard).join('')}</ul>`
          : `<div class="cases-soon">${PHOTO_ICO}<span>Coming soon</span></div>`}
      </section>` : ''}
    </div>`;
  }

  /* ══ Career: the timeline's lock ═══════════════════════════════════════════
     Scrolling DOWN the page stops at the timeline and moves it sideways until
     its last role is in, then the page carries on; scrolling back UP rewinds
     it the same way. The timeline is still an ordinary horizontal scroller, so
     a sideways swipe, shift-wheel, a touch drag or the arrow keys (it takes
     focus) all move it directly.

     The PIN is the scroll position the page holds while the timeline moves.
     It is the top of the page whenever the timeline starts in the upper half
     of the view there (it is the first section, so in practice always): the
     first scroll on landing drives it sideways, with no step down first, even
     if a short window cuts off the foot of the roles. Otherwise it is the
     section's bottom on the bottom of the view if it fits, else its top on
     the top.

     ⚠️ Two paths, and both are needed. `wheel` is the smooth one: the event is
     cancelled and its delta is spent sideways, so the page never moves. But
     Chrome only lets the FIRST wheel event of a gesture be cancelled — a flick
     that starts above the pin arrives there non-cancelable — and keys, the
     scrollbar and touch never fire `wheel` at all. So `scroll` checks whether
     the page crossed the pin while the timeline still had room, puts it back
     on the pin and spends the overshoot sideways.

     On a touch screen there is no lock (`touch`): the timeline snaps role by
     role under the finger instead (career.css).

     ⚠️ A nav jump sets `jumping` so the smooth scroll it starts can pass the
     timeline; otherwise the second path would catch it half-way. */

  let tl = null;          // the timeline's scroller, while #career is painted
  let lastTop = 0;
  let jumping = 0;
  // A touch screen gets no lock: a sideways swipe is already the gesture, and
  // a vertical one can't be cancelled, only fought frame by frame.
  const touch = matchMedia('(hover: none)');

  const tlMax = () => tl.scrollWidth - tl.clientWidth;

  function pinTop() {
    const sec = $('careerTimeline');
    const top = sec.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    if (top < scroll.clientHeight / 2) return 0;
    const pad = 16;
    const fitBottom = top + sec.offsetHeight + pad - scroll.clientHeight;
    const pin = Math.min(fitBottom, top - pad);
    return Math.max(0, Math.min(pin, scroll.scrollHeight - scroll.clientHeight));
  }

  function onCareerWheel(e) {
    if (!tl || touch.matches || e.ctrlKey || jumping || !e.cancelable) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= scroll.clientHeight;
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;     // a sideways swipe is the timeline's own
    const max = tlMax();
    const down = dy > 0;
    if (max <= 1 || (down ? tl.scrollLeft >= max - 1 : tl.scrollLeft <= 1)) return;
    const pin = pinTop();
    // How far the page still has to travel, in this direction, to reach the pin.
    const reach = down ? pin - scroll.scrollTop : scroll.scrollTop - pin;
    if (reach > Math.abs(dy) || reach < -2) return;           // not there yet, or already past it
    e.preventDefault();
    const spent = Math.max(reach, 0);
    scroll.scrollTop = pin;
    lastTop = scroll.scrollTop;
    tl.scrollLeft += down ? dy - spent : dy + spent;
  }

  function onCareerScroll() {
    if (!tl) return;
    const now = scroll.scrollTop;
    const prev = lastTop;
    if (!jumping && !touch.matches && now !== prev) {
      const pin = pinTop();
      const max = tlMax();
      if (now > prev && prev <= pin + 1 && now > pin + 1 && tl.scrollLeft < max - 1) {
        const take = Math.min(now - pin, max - tl.scrollLeft);
        tl.scrollLeft += take;
        scroll.scrollTop = now - take;
      } else if (now < prev && prev >= pin - 1 && now < pin - 1 && tl.scrollLeft > 1) {
        const take = Math.min(pin - now, tl.scrollLeft);
        tl.scrollLeft -= take;
        scroll.scrollTop = now + take;
      }
    }
    lastTop = scroll.scrollTop;
    spyCareer();
  }

  /* Past the measure the roles go soft: each one's `--out` is how far it has
     crossed the edge of the column (0 inside, 1 well out), and career.css
     turns that into blur and fade. The gutter's own mask does the rest. */
  function paintTimeline() {
    if (!tl) return;
    const box = tl.getBoundingClientRect();
    const col = $('careerTimeline').getBoundingClientRect();
    const right = box.right - Math.max(box.right - col.right, 48);
    const left = box.left;
    for (const li of tl.querySelectorAll('.role')) {
      const r = li.getBoundingClientRect();
      const over = Math.max(r.right - right, left - r.left, 0) / r.width;
      const t = Math.min(1, Math.max(0, (over - 0.15) / 0.7));
      li.style.setProperty('--out', t.toFixed(3));
    }
    tl.parentElement.classList.toggle('is-scrolled', tl.scrollLeft > 1);
  }

  // The nav marks the last section whose top has passed a third of the way
  // down the view — or the last one outright once the page is at its end.
  function spyCareer() {
    const nav = scroll.querySelector('.career-nav');
    if (!nav) return;
    const btns = [...nav.querySelectorAll('[data-jump]')];
    const line = scroll.getBoundingClientRect().top + scroll.clientHeight / 3;
    let on = btns[0];
    for (const b of btns) {
      const sec = $(b.dataset.jump);
      if (sec && sec.getBoundingClientRect().top <= line) on = b;
    }
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) on = btns[btns.length - 1];
    for (const b of btns) {
      b.classList.toggle('is-current', b === on);
      if (b === on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  }

  function jumpTo(id) {
    const sec = $(id);
    if (!sec) return;
    const top = sec.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 16;
    clearTimeout(jumping);
    jumping = setTimeout(() => { jumping = 0; lastTop = scroll.scrollTop; }, reduced ? 50 : 1200);
    scroll.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
  }

  function mountCareer() {
    tl = scroll.querySelector('.tl-scroll');
    if (!tl) return;
    lastTop = scroll.scrollTop;
    tl.addEventListener('scroll', paintTimeline, { passive: true });
    paintTimeline();
    spyCareer();
  }

  scroll.addEventListener('wheel', onCareerWheel, { passive: false });
  scroll.addEventListener('scroll', onCareerScroll, { passive: true });
  scroll.addEventListener('scrollend', () => {
    if (!jumping) return;
    clearTimeout(jumping);
    jumping = 0;
    lastTop = scroll.scrollTop;
  });
  scroll.addEventListener('click', e => {
    const b = e.target.closest('[data-jump]');
    if (b) jumpTo(b.dataset.jump);
  });
  window.addEventListener('resize', paintTimeline);

  const PAGES = {
    bookshelf: { title: 'Bookshelf', data: '/content/more/bookshelf.json', render: renderBooks },
    gear:      { title: 'Gear',      data: '/content/more/gear.json',      render: renderGear },
    appstack:  { title: 'App stack', data: '/content/more/appstack.json',  render: renderApps },
    places:    { title: 'Places',    map: true,                             render: renderPlaces },
    career:    { title: 'Career',    data: '/content/career.json',         render: renderCareer, wide: true, mount: mountCareer },
  };

  let current = null;   // the page on screen
  let token = 0;        // guards a slow fetch landing after a navigation

  /* ══ Places (Mapbox) ═══════════════════════════════════════════════════════
     The old page's map, on the paper. The pins are a public Google My Map
     (api/places.js), the basemap is Mapbox's own light/dark style with the
     roads stripped and the land and sea re-coloured so the sheet shows
     through — the map is a plate on the paper, not a window over a page.

     ⚠️ Everything Mapbox is loaded on the FIRST visit to this page and not
     before: the script is ~700KB and nothing else on the site needs it. */

  const MB_VERSION = 'v3.5.1';
  let map = null;
  let mapScript = null;

  function loadMapbox() {
    if (window.mapboxgl) return Promise.resolve();
    if (mapScript) return mapScript;
    mapScript = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `https://api.mapbox.com/mapbox-gl-js/${MB_VERSION}/mapbox-gl.css`;
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = `https://api.mapbox.com/mapbox-gl-js/${MB_VERSION}/mapbox-gl.js`;
      s.onload = resolve;
      s.onerror = () => { mapScript = null; reject(new Error('mapbox script')); };
      document.head.appendChild(s);
    });
    return mapScript;
  }

  /* Vercel serves the token from an env var; a local checkout has the
     gitignored mapbox-config.js instead, which sets `window.MAPBOX_TOKEN`. */
  async function mapboxToken() {
    const ok = t => t && t !== 'pk.your_public_token_here';
    if (ok(window.MAPBOX_TOKEN)) return window.MAPBOX_TOKEN;
    try {
      const r = await fetch('/api/mapbox-token');
      if (r.ok) { const { token } = await r.json(); if (ok(token)) return token; }
    } catch (_) {}
    await new Promise(resolve => {
      const s = document.createElement('script');
      s.src = '/mapbox-config.js';
      s.onload = s.onerror = resolve;
      document.head.appendChild(s);
    });
    return ok(window.MAPBOX_TOKEN) ? window.MAPBOX_TOKEN : null;
  }

  const PLACES_CACHE = 'places-geojson-cache-v1';
  function cachedPlaces() {
    try {
      const c = JSON.parse(localStorage.getItem(PLACES_CACHE));
      return c && Date.now() - c.ts < 3600e3 ? c.data : null;
    } catch (_) { return null; }
  }
  function placesData() {
    return fetch('/api/places')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(data => {
        try { localStorage.setItem(PLACES_CACHE, JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
        return data;
      });
  }

  const STYLE = { dark: 'mapbox://styles/mapbox/dark-v11', light: 'mapbox://styles/mapbox/light-v11' };

  /* The basemap, thinned to what a page of pins needs. Land is taken off
     entirely so the paper is the land; the sea is a wash a shade off the
     sheet, which is all that draws the coasts. Roads go — at this scale they
     are only noise. */
  const LAND = ['land', 'landcover', 'landuse', 'land-structure-polygon', 'national-park'];
  const ROADS = [/^road/, /^highway/, /^motorway/, /^trunk/, /^tunnel/, /^bridge/, /^turning/, /^path/, /^ferry/, /^aerialway/, /^airport/];

  function thinBasemap(m) {
    const sea = dark() ? 'rgba(0,0,0,0.30)' : 'rgba(84,99,108,0.16)';
    const set = (id, prop, v) => { try { m.setPaintProperty(id, prop, v); } catch (_) {} };
    if (m.getLayer('background')) set('background', 'background-opacity', 0);
    LAND.forEach(id => { if (m.getLayer(id) && m.getLayer(id).type === 'fill') set(id, 'fill-opacity', 0); });
    const style = m.getStyle();
    (style && style.layers || []).forEach(l => {
      if (l.id.includes('water')) {
        if (l.type === 'fill') { set(l.id, 'fill-pattern', null); set(l.id, 'fill-color', sea); set(l.id, 'fill-opacity', 1); }
        else if (l.type === 'line') { set(l.id, 'line-color', sea); }
      }
      if (ROADS.some(re => re.test(l.id))) {
        try {
          if (l.type === 'line') set(l.id, 'line-opacity', 0);
          else if (l.type === 'fill') set(l.id, 'fill-opacity', 0);
          else if (l.type === 'symbol') m.setLayoutProperty(l.id, 'visibility', 'none');
        } catch (_) {}
      }
    });
  }

  function addPins(m, geo) {
    ['unclustered-point', 'cluster-count', 'clusters'].forEach(id => { if (m.getLayer(id)) m.removeLayer(id); });
    if (m.getSource('places-source')) m.removeSource('places-source');

    const d = dark();
    const pin = d ? 'rgba(255,255,255,0.92)' : 'rgba(25,25,25,0.88)';
    const fill = d ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,20,0.07)';
    const edge = d ? 'rgba(255,255,255,0.45)' : 'rgba(20,20,20,0.30)';
    const ink = d ? '#ffffff' : '#1a1a1a';

    m.addSource('places-source', { type: 'geojson', data: geo, cluster: true, clusterMaxZoom: 14, clusterRadius: 40 });
    m.addLayer({
      id: 'clusters', type: 'circle', source: 'places-source', filter: ['has', 'point_count'],
      paint: {
        'circle-color': fill, 'circle-stroke-width': 1.5, 'circle-stroke-color': edge,
        'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 15, 30],
      },
    });
    m.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'places-source', filter: ['has', 'point_count'],
      layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'], 'text-size': 12 },
      paint: { 'text-color': ink },
    });
    m.addLayer({
      id: 'unclustered-point', type: 'circle', source: 'places-source', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': pin, 'circle-radius': 5, 'circle-stroke-width': 1.5,
        'circle-stroke-color': d ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)',
      },
    });
  }

  function popupHTML(p, where) {
    let photos = '';
    try {
      const list = JSON.parse(p.photos || '[]');
      if (list.length) {
        photos = `<div class="pop-photos">${list.map(src =>
          `<img src="${esc(src)}" alt="Photo of ${esc(p.name || 'this place')}" loading="lazy">`).join('')}</div>`;
      }
    } catch (_) {}
    const meta = [where, p.date].filter(Boolean).map(txt).join(' / ');
    return `<div>
      <p class="pop-name">${txt(p.name || 'Place')}</p>
      ${meta ? `<p class="pop-meta">${meta}</p>` : ''}
      ${p.description ? `<p class="pop-desc">${txt(p.description)}</p>` : ''}
      ${photos}
    </div>`;
  }

  function wireMap(m) {
    m.on('click', 'clusters', e => {
      const f = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
      if (!f) return;
      m.getSource('places-source').getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
        if (!err) m.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.5 });
      });
    });

    m.on('click', 'unclustered-point', async e => {
      const f = e.features[0];
      const p = f.properties;
      const at = f.geometry.coordinates.slice();
      while (Math.abs(e.lngLat.lng - at[0]) > 180) at[0] += e.lngLat.lng > at[0] ? 360 : -360;

      const popup = new mapboxgl.Popup({ offset: [0, -8], closeButton: true, maxWidth: '300px' })
        .setLngLat(at).setHTML(popupHTML(p, null)).addTo(m);

      // Which state or country it is in, worked out from the coordinates — the
      // pins carry a name and a note but no address.
      try {
        const g = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${at[0]},${at[1]}.json?types=place&access_token=${mapboxgl.accessToken}`);
        if (!g.ok) return;
        const ctx = ((await g.json()).features || [])[0];
        let region = null, country = null, code = null;
        ((ctx && ctx.context) || []).forEach(c => {
          if (c.id.startsWith('region.')) region = c.text;
          if (c.id.startsWith('country.')) { country = c.text; code = (c.short_code || '').toUpperCase(); }
        });
        const where = code === 'US' ? region : country;
        if (where && popup.isOpen()) popup.setHTML(popupHTML(p, where));
      } catch (_) {}
    });

    ['clusters', 'unclustered-point'].forEach(layer => {
      m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
    });
  }

  function destroyMap() {
    if (map) { map.remove(); map = null; }
  }

  async function paintMap(my) {
    const el = $('placesMap');
    const note = $('mapNote');
    const meta = $('folioMeta');
    const fail = msg => {
      if (my !== token || !note) return;
      note.textContent = fold(msg);
      note.hidden = false;
      if (el) el.hidden = true;
    };

    let geo = cachedPlaces();
    const fresh = placesData().then(d => (geo = d)).catch(() => null);

    try {
      await loadMapbox();
      const key = await mapboxToken();
      if (my !== token) return;
      if (!key) return fail('The map needs a token that is not set here.');
      mapboxgl.accessToken = key;

      map = new mapboxgl.Map({
        container: el,
        style: dark() ? STYLE.dark : STYLE.light,
        center: [-83.5, 32.7],
        zoom: 3,
        projection: 'equirectangular',
        cooperativeGestures: true,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
      wireMap(map);

      const dress = () => {
        thinBasemap(map);
        if (geo) addPins(map, geo);
      };
      map.on('load', async () => {
        dress();
        el.classList.add('is-in');
        await fresh;
        if (my !== token || !map) return;
        if (geo) {
          addPins(map, geo);
          if (meta) meta.textContent = fold((geo.features || []).length + ' places');
        }
      });

      // The basemap follows the system theme, and a new style drops every
      // layer added to the old one.
      const scheme = matchMedia('(prefers-color-scheme: dark)');
      const onScheme = () => {
        if (!map) return;
        map.setStyle(dark() ? STYLE.dark : STYLE.light);
        map.once('style.load', dress);
      };
      scheme.addEventListener('change', onScheme);
      map.once('remove', () => scheme.removeEventListener('change', onScheme));
    } catch (_) {
      fail('The map wouldn’t load.');
    }
  }

  /* ══ The surface ═══════════════════════════════════════════════════════════ */

  function paint(key) {
    const page = PAGES[key];
    if (!page) return Promise.resolve();
    if (current === key && scroll.querySelector('.folio-body')) return Promise.resolve();
    const my = ++token;

    // Whatever is on screen goes first: a page hands over to another page by
    // fading, and never passes through the home sheet on the way.
    const old = scroll.querySelector('.folio-body');
    let out = Promise.resolve();
    if (old) {
      old.classList.remove('is-in');
      if (!reduced) out = new Promise(r => setTimeout(r, 240));
    }

    const data = page.data ? getJSON(page.data) : Promise.resolve(null);
    return Promise.all([out, data.catch(() => undefined)]).then(([, rows]) => {
      if (my !== token) return;
      destroyMap();
      tl = null;
      current = key;
      scroll.className = 'folio-scroll' + (page.map ? ' folio-scroll--map' : '')
        + (page.wide && rows !== undefined ? ' folio-scroll--wide' : '');
      scroll.scrollTop = 0;

      if (rows === undefined) {
        scroll.innerHTML = head(page.title) + '<div class="folio-body"><p class="prose-empty">That one wouldn’t load.</p></div>';
      } else {
        scroll.innerHTML = '<div class="folio-body">' + page.render(rows) + '</div>';
        // The head sits inside the body wrapper so the whole page fades as one.
      }
      requestAnimationFrame(() => {
        const b = scroll.querySelector('.folio-body');
        if (b) b.classList.add('is-in');
      });
      if (page.map && rows !== undefined) paintMap(my);
      if (page.mount && rows !== undefined) page.mount();
    });
  }

  // The surface has been closed, or handed to another section.
  function leave() {
    token++;
    current = null;
    tl = null;
    destroyMap();
    scroll.innerHTML = '';
  }

  window.moreSection = {
    has: key => Object.prototype.hasOwnProperty.call(PAGES, key),
    paint,
    leave,
    // js/paper.js calls this once the copy has been rubbed out and restored:
    // the restore brings back the innerHTML it snapshotted, which — if More
    // was open when the erase began — has the row in its OPEN state.
    reset: () => setOpen(false),
  };
})();
