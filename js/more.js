/* ──────────────────────────────────────────────────────────────────────────
   paperlike — More.

   Two jobs, both behind the third item in the nav:

     • the ROW. More is a toggle, and opening it drops a second row of links
       underneath the first, the way the macOS menu bar's hidden icons drop
       into a bar of their own (Bartender). Only the class and `inert` change
       here; the motion is more.css.
     • the PAGES it links to — `#bookshelf`, `#gear`, `#appstack`, `#places` —
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

  const head = (title, meta) => `
    <header class="folio-head">
      <h2 class="page-title">${txt(title)}</h2>
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

  const PAGES = {
    bookshelf: { title: 'Bookshelf', data: '/content/more/bookshelf.json', render: renderBooks },
    gear:      { title: 'Gear',      data: '/content/more/gear.json',      render: renderGear },
    appstack:  { title: 'App stack', data: '/content/more/appstack.json',  render: renderApps },
    places:    { title: 'Places',    map: true,                             render: renderPlaces },
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
      current = key;
      scroll.className = 'folio-scroll' + (page.map ? ' folio-scroll--map' : '');
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
    });
  }

  // The surface has been closed, or handed to another section.
  function leave() {
    token++;
    current = null;
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
