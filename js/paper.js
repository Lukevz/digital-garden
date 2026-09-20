/* ──────────────────────────────────────────────────────────────────────────
   paperlike — sections.

   The landing page is script-free and stays that way: everything below runs
   only once a section is routed to. With JS off, `/` renders exactly as it
   always has — the name, the bio, the social row and the dog-ear — and the
   nav's hash links simply don't resolve, which is where they started.

   What this file owns:

     • the hash router (`#writing`, `#writing/<slug>`, anything else → home)
     • the ERASE: leaving the sheet doesn't cut, it gets swept clean
     • the masthead FLIP: the name is the one thing never erased — it travels
       out of the centre and shrinks into the top-left corner, and clicking it
       is the way back
     • the reading spread: index of titles left, the open piece right
     • markdown → HTML, including a transliteration pass the typeface needs

   ⚠️ Two scroll containers live in here (`.index` and `.page-scroll`), which
   is a deliberate departure from the landing page's "no scroll container
   anywhere" rule. The rule exists so a stray overflow can't start scrolling
   the SHEET; these two scroll their own column and the sheet still can't
   move, which keeps the intent while letting an article be longer than the
   screen. `html, body { overflow: hidden }` is untouched.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  const sheet      = document.querySelector('.sheet');
  const lockup     = document.querySelector('.lockup');
  const nameEl     = document.querySelector('.name');
  const nameLink   = document.querySelector('.name-home');
  const bio        = document.querySelector('.bio');
  const links      = document.querySelector('.links');
  const expandBtn  = $('expand');
  const expandLbl  = $('expandLabel');
  const spread     = $('spread');
  const indexEl    = $('index');
  const indexList  = $('indexList');
  const pageScroll = $('pageScroll');
  const pageTitle  = $('pageTitle');
  const pageMeta   = $('pageMeta');
  const prose      = $('prose');
  const rubber     = $('rubber');

  if (!sheet || !nameEl || !spread) return;

  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Tunables ──────────────────────────────────────────────────────────
     Live-editable from the console the way the v2 site's warp was
     (`grid.warp.dur = 1400`): `paper.dur = 2600` to watch the rubber work in
     slow motion, `paper.flyDelay` to re-time the name's exit, or
     `paper.enabled = false` to compare the whole thing against a hard cut. */
  const paper = window.paper = {
    dur: 780,        // how long the rubber takes to cross all the copy
    flyDelay: 400,   // ms before the name lifts clear of the rubber
    enabled: true,
  };
  // ⚠️ NOT the curl's easing. That curve is ~80% done in its first quarter,
  // which is right for a corner springing open and wrong for something
  // crossing the page — the name arrived in the corner before the eraser had
  // reached where it started. This one eases out of rest and settles.
  const EASE = 'cubic-bezier(0.5, 0, 0.2, 1)';

  /* ══ Markdown ══════════════════════════════════════════════════════════
     Ported from the v2 site's renderer (`git show main:js/main.js`), which
     was written against this exact content — Bear's export dialect: setext-
     free headings, task lists, and image paths relative to the post's own
     sibling folder. Trimmed to what `content/writing/` actually uses.
     ────────────────────────────────────────────────────────────────────── */

  function stripYamlFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    return m ? text.slice(m[0].length).replace(/^\uFEFF?/, '') : text;
  }

  /* ⚠️ TAY Wingman has no em dash, en dash, ellipsis, arrow, pipe or straight
     double quote (it does have lowercase, and all four curly quotes). The set
     below was derived by diffing the font's cmap against everything in
     content/writing/, not guessed. Emoji are deliberately NOT folded — those
     should fall through to the emoji font, which is where they belong.
     Every post uses at least one of the missing glyphs, and
     an unmapped glyph doesn't fail loudly — it silently falls through to
     `ui-sans-serif` and sets one character of the sentence in a different
     typeface. So the prose is transliterated into the font's own set on the
     way in rather than the content being rewritten: the markdown stays
     correct, and only what's rendered is folded down. */
  function fold(t) {
    return t
      .replace(/\u2014/g, ' - ')       // — em dash, usually set tight in Bear
      .replace(/\u2013/g, '-')         // – en dash
      .replace(/\u2026/g, '...')       // … ellipsis
      .replace(/\u00b7/g, '/')         // · middle dot
      .replace(/\u2192/g, '->')        // → arrow; both halves the face does have
      .replace(/\|/g, '/')            // | turns up inside a YouTube title
      // A straight double quote has no glyph but both curly ones do, so this
      // is a free typographic upgrade rather than a substitution: opening if
      // it follows whitespace or starts the run, closing otherwise.
      .replace(/(^|[\s(\[])"/g, '$1\u201c')
      .replace(/"/g, '\u201d');
  }

  /* Bear writes image paths relative to a folder named after the post
     ("The search for the best todo app/shot.png"), so they only resolve
     against the section's own directory. */
  function assetUrl(src) {
    return /^(https?:|data:|\/)/.test(src) ? src : '/content/writing/' + src;
  }

  function mdToHTML(md) {
    if (!md) return '';
    md = stripYamlFrontmatter(md.trim());
    let html = '';
    let inUL = false, ulIsTask = false, inOL = false, inBQ = false;

    const closeUL = () => { if (inUL) { html += '</ul>'; inUL = false; ulIsTask = false; } };
    const closeOL = () => { if (inOL) { html += '</ol>'; inOL = false; } };
    const closeBQ = () => { if (inBQ) { html += '</blockquote>'; inBQ = false; } };
    const closeAll = () => { closeUL(); closeOL(); closeBQ(); };

    function inline(t) {
      return fold(t)
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
          (m, alt, src) => `<img src="${assetUrl(src)}" alt="${alt}" loading="lazy">`)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
          (m, label, href) => `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        // ⚠️ Bear writes strikethrough with a SINGLE tilde, and wraps whole
        // links in it (`~[Blot](url)~`). Dropping this rule doesn't just lose
        // the styling — the bare tildes survive into the page, and the face
        // has no glyph for one. It has to run after the link rule, or the
        // tildes are still outside the markup it produces.
        .replace(/~([^~]+)~/g, '<del>$1</del>');
    }

    for (const line of md.split('\n')) {
      const t = line.trim();
      if (!t) { closeAll(); continue; }

      if (/^#{1} /.test(t))      { closeAll(); html += `<h1>${inline(t.slice(2))}</h1>`; }
      else if (/^## /.test(t))   { closeAll(); html += `<h2>${inline(t.slice(3))}</h2>`; }
      else if (/^### /.test(t))  { closeAll(); html += `<h3>${inline(t.slice(4))}</h3>`; }
      else if (/^#### /.test(t)) { closeAll(); html += `<h4>${inline(t.slice(5))}</h4>`; }
      else if (/^---+$/.test(t)) { closeAll(); html += '<hr>'; }
      else if (/^> /.test(t)) {
        closeUL(); closeOL();
        if (!inBQ) { html += '<blockquote>'; inBQ = true; }
        const c = t.slice(2);
        if (c) html += `<p>${inline(c)}</p>`;
      }
      else if (/^[-*] /.test(t)) {
        closeOL(); closeBQ();
        const rest = t.slice(2);
        const task = rest.match(/^\[([ xX])\]\s*(.*)$/);
        if (inUL && ulIsTask !== !!task) closeUL();
        if (!inUL) { inUL = true; ulIsTask = !!task; html += task ? '<ul class="task-list">' : '<ul>'; }
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          html += `<li class="task-item"><input type="checkbox" disabled${checked ? ' checked' : ''}> <span>${inline(task[2])}</span></li>`;
        } else {
          html += `<li>${inline(rest)}</li>`;
        }
      }
      else if (/^\d+\. /.test(t)) {
        closeUL(); closeBQ();
        if (!inOL) { html += '<ol>'; inOL = true; }
        html += `<li>${inline(t.replace(/^\d+\. /, ''))}</li>`;
      }
      else { closeAll(); html += `<p>${inline(t)}</p>`; }
    }
    closeAll();
    return html;
  }

  /* ⚠️ Same slug function the v2 site used, character for character. The
     second-brain vault hard-codes these routes in prose (see `Site MOC.md`)
     and the chat hands them to visitors verbatim, so a "tidier" slug here
     would silently 404 every link the bot has ever given out. Note it does
     NOT collapse runs: "7 habits  routines" has a double space and therefore
     a double hyphen. */
  function filenameToSlug(name) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /* ══ The erase ═══════════════════════════════════════════════════════════
     The copy is RUBBED OUT — not wiped, not faded. A rubber tip travels along
     each line of type, left to right and then down to the next, and the
     letters it passes lift off the page: they go pale, blur, tip off their
     baseline by a degree or two and are gone.

     ⚠️ An earlier version swept one soft-edged band down the whole sheet. It
     reads as a scanner, not an eraser — a full-bleed horizontal edge is a
     machine's gesture, and it crosses acres of blank paper that had nothing
     on them to remove. The erasure has to be SCOPED TO THE INK: it follows
     the lines of type, so it only ever happens where there is something to
     take away.

     The letters and the rubber are driven off one polyline — a segment per
     line of text — so a letter goes exactly when the tip reaches it rather
     than on a timer that merely looks synchronised.
     ────────────────────────────────────────────────────────────────────── */

  /* Wrap every non-space character in its own span so each can leave
     separately. Walks text nodes rather than rewriting innerHTML, so the
     markup around them (the bio's <br>s, the social row's <a>s) survives.
     Spaces stay as bare text, which is what keeps line-breaking unchanged. */
  function splitChars(root) {
    const out = [];
    const texts = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) texts.push(walk.currentNode);
    for (const node of texts) {
      if (!node.nodeValue.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const chr of node.nodeValue) {
        if (chr === ' ' || chr === '\n' || chr === '\t') {
          frag.appendChild(document.createTextNode(chr));
          continue;
        }
        const span = document.createElement('span');
        span.className = 'ch';
        span.textContent = chr;
        frag.appendChild(span);
        out.push(span);
      }
      node.parentNode.replaceChild(frag, node);
    }
    return out;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ink = new Map();   // element → its markup before it was split up

  function rubOut(els) {
    els = els.filter(Boolean);
    if (!els.length) return Promise.resolve();
    if (reduced || !paper.enabled) {
      els.forEach(el => { el.style.opacity = '0'; });
      return Promise.resolve();
    }

    // Keep the originals — coming home has to put the words back. Held in a
    // Map rather than a data- attribute: it is the whole bio's markup, and it
    // has no business being readable in the DOM.
    els.forEach(el => { if (!ink.has(el)) ink.set(el, el.innerHTML); });

    const chars = [];
    els.forEach(el => splitChars(el).forEach(c => chars.push(c)));
    if (!chars.length) return Promise.resolve();

    const sheetBox = sheet.getBoundingClientRect();
    const marks = chars.map(c => {
      const r = c.getBoundingClientRect();
      return { c, x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
    });

    // Group into lines of type. Anything within half a line-height of the
    // same baseline is one line — that's what makes the tip travel ALONG a
    // line instead of diagonally across the block.
    marks.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const m of marks) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(m.y - last.y) < Math.max(10, m.h * 0.6)) {
        last.marks.push(m);
        last.y = (last.y * (last.marks.length - 1) + m.y) / last.marks.length;
      } else {
        lines.push({ y: m.y, marks: [m] });
      }
    }
    lines.forEach(l => l.marks.sort((a, b) => a.x - b.x));

    // One path over every line, so distance along it is the clock. The tip
    // over-runs each line's ends by a nub's width, the way a hand does.
    const LEAD = 34;
    let total = 0;
    for (const l of lines) {
      l.x0 = l.marks[0].x - LEAD;
      l.x1 = l.marks[l.marks.length - 1].x + LEAD;
      l.at = total;
      total += l.x1 - l.x0;
    }

    // Each letter's moment is where it sits along that path.
    for (const l of lines) {
      for (const m of l.marks) m.t = (l.at + (m.x - l.x0)) / total;
    }

    const dur = paper.dur;
    const LIFT = 190;   // ms a single letter takes to leave
    marks.forEach(m => {
      m.c.animate(
        [{ opacity: 1, filter: 'blur(0px)', transform: 'none' },
         { opacity: 0, filter: 'blur(2.6px)',
           transform: `translate(${rnd(-2, 2).toFixed(1)}px, ${rnd(-3, 4).toFixed(1)}px) rotate(${rnd(-9, 9).toFixed(1)}deg) scale(0.84)` }],
        { duration: LIFT,
          delay: Math.max(0, m.t * (dur - LIFT)),
          easing: 'cubic-bezier(0.4, 0, 0.9, 0.55)',
          fill: 'forwards' }
      );
    });

    body.classList.add('is-erasing');

    return new Promise(resolve => {
      const t0 = performance.now();
      (function frame(now) {
        const p = Math.min(1, (now - t0) / dur);
        const along = p * total;
        let l = lines[0];
        for (const cand of lines) { if (along >= cand.at) l = cand; else break; }
        const x = l.x0 + (along - l.at);
        rubber.style.transform =
          `translate3d(${(x - sheetBox.left).toFixed(1)}px, ${(l.y - sheetBox.top).toFixed(1)}px, 0)`;
        // On at the start, off at the very end — the hand lifts away.
        rubber.style.opacity = (Math.min(1, p * 8) * (1 - Math.max(0, (p - 0.88) / 0.12))).toFixed(3);
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      })(performance.now());
    });
  }

  /* A whole page of prose is not something you rub out letter by letter — it
     is just cleared. Going home lifts the spread off instead. */
  function fadeOut(els) {
    els = els.filter(Boolean);
    if (reduced || !paper.enabled) {
      els.forEach(el => { el.style.opacity = '0'; });
      return Promise.resolve();
    }
    const anims = els.map(el => el.animate(
      [{ opacity: 1, filter: 'blur(0px)', transform: 'none' },
       { opacity: 0, filter: 'blur(4px)', transform: 'translateY(-10px)' }],
      { duration: Math.round(paper.dur * 0.62), easing: 'cubic-bezier(0.4, 0, 0.9, 0.6)', fill: 'forwards' }
    ));
    return Promise.all(anims.map(a => a.finished.catch(() => {})));
  }

  function restore(els) {
    body.classList.remove('is-erasing');
    rubber.style.opacity = '0';
    els.filter(Boolean).forEach(el => {
      el.getAnimations().forEach(a => a.cancel());
      if (ink.has(el)) { el.innerHTML = ink.get(el); ink.delete(el); }
      el.style.opacity = '';
      el.style.filter = '';
      el.style.transform = '';
    });
  }

  /* ══ The masthead flip ═════════════════════════════════════════════════
     The name is never erased. It flies from the centre of the sheet into the
     top-left corner and shrinks, and in a section that small version is the
     way home.

     Measured FLIP rather than transitioned type: `font-size` is on a
     `clamp()` at both ends, and transitioning it reflows the line every
     frame. A transform can't be measured against a layout that doesn't exist
     yet, so `measureAs()` applies the target class, reads, and reverts inside
     one task — two forced layouts, nothing painted.

     ⚠️ The scale factor is the ratio of the two TEXT widths, which only
     equals the font-size ratio while the tracking is identical at both ends.
     That's why the masthead keeps `.name`'s 0.1em letter-spacing instead of
     opening up the way a small caps line normally would: give the two states
     different tracking and the glyphs land at the right overall width but the
     wrong internal rhythm, and the swap at the end of the flight pops.

     ⚠️ Measure the <a>, not the <h1>. In reading mode the heading stretches to
     the sheet's width, so its box width is the column, not the word. */
  function measureAs(readingOn, fn) {
    const was = body.classList.contains('reading');
    const wasHidden = spread.hidden;
    body.classList.toggle('reading', readingOn);
    spread.hidden = !readingOn;
    const out = fn();
    body.classList.toggle('reading', was);
    spread.hidden = wasHidden;
    return out;
  }

  function flyName(from, to) {
    if (reduced || !paper.enabled) return { finished: Promise.resolve(), cancel() {} };

    const host = nameEl.getBoundingClientRect();
    const scale = to.width / from.width;
    // Scale about the word's own top-left corner so the translate is just the
    // distance the word travels, with no scale-induced offset folded into it.
    nameEl.style.transformOrigin = `${(from.left - host.left).toFixed(2)}px ${(from.top - host.top).toFixed(2)}px`;

    const anim = nameEl.animate(
      [{ transform: 'none' },
       { transform: `translate(${(to.left - from.left).toFixed(2)}px, ${(to.top - from.top).toFixed(2)}px) scale(${scale.toFixed(4)})` }],
      { duration: paper.dur - paper.flyDelay + 180, delay: paper.flyDelay, easing: EASE, fill: 'both' }
    );
    return anim;
  }

  /* ══ Routing ═══════════════════════════════════════════════════════════ */

  let items = null;          // the writing index, newest first
  let indexPainted = false;
  let current = null;        // slug on screen
  let token = 0;             // guards against a slow fetch landing after a nav

  function parseHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return null;
    const [section, item] = h.split('/');
    return { section, item: item || null };
  }

  function loadIndex() {
    if (items) return Promise.resolve(items);
    return fetch('/api/content/list?category=writing')
      .then(r => r.json())
      .then(({ items: list = [], files = [] }) => {
        const rows = list.length ? list : files.map(file => ({ file, date: '' }));
        items = rows
          .map(({ file, date, minutes }) => {
            const title = file.replace(/\.md$/, '').replace(/\s+/g, ' ').trim();
            return { file, date: date || '', minutes, title, slug: filenameToSlug(file.replace(/\.md$/, '')) };
          })
          .sort((a, b) => b.date.localeCompare(a.date));
        return items;
      })
      .catch(() => (items = []));
  }

  function paintIndex() {
    if (indexPainted) return;
    indexList.innerHTML = items.map((it, i) => `
      <li class="index-item" data-slug="${it.slug}" style="--i:${i}">
        <button class="index-link" type="button" data-slug="${it.slug}">
          <span class="index-date">${it.date}</span>
          <span class="index-title">${it.title}</span>
        </button>
      </li>`).join('');
    indexList.addEventListener('click', e => {
      const btn = e.target.closest('.index-link');
      if (btn) location.hash = '#writing/' + btn.dataset.slug;
    });
    indexPainted = true;
  }

  function markCurrent(slug) {
    indexList.querySelectorAll('.index-item').forEach(li => {
      const on = li.dataset.slug === slug;
      li.classList.toggle('is-current', on);
      const btn = li.querySelector('.index-link');
      if (btn) btn.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  function showPost(item) {
    if (current === item.slug) return;
    current = item.slug;
    const mine = ++token;

    markCurrent(item.slug);
    pageTitle.textContent = item.title;
    // ⚠️ No middle dot in this face; the separator has to come from its own
    // punctuation set.
    pageMeta.textContent = [item.date, Number.isFinite(item.minutes) ? item.minutes + ' min read' : '']
      .filter(Boolean).join(' / ');
    prose.classList.remove('is-in');

    fetch('/content/writing/' + encodeURIComponent(item.file))
      .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
      .then(md => {
        if (mine !== token) return;
        prose.innerHTML = mdToHTML(md);
        // The header already carries the title, so the body's own H1 is a
        // second printing of it.
        const h1 = prose.querySelector('h1');
        if (h1) h1.remove();
        pageScroll.scrollTop = 0;
        requestAnimationFrame(() => prose.classList.add('is-in'));
      })
      .catch(() => {
        if (mine !== token) return;
        prose.innerHTML = '<p class="prose-empty">That one wouldn’t load.</p>';
        prose.classList.add('is-in');
      });
  }

  /* ── One transition at a time ──────────────────────────────────────────
     ⚠️ The lock is claimed HERE, synchronously in route(), and not inside the
     two transitions. It used to live in enterReading(), which route() only
     reaches after awaiting the index fetch — so two hashes arriving inside
     that window both sailed past the guard and ran over each other, and the
     page could end up on the home layout with a section URL and the erase
     left switched on.

     A route that lands mid-flight is remembered rather than dropped, or
     clicking Writing while the page is still folding back home would go
     nowhere. The timeout lets the running transition's own chain (which
     paints the post) finish before the replay re-reads the hash. */
  let busy = null;
  let queued = false;

  function settle() {
    busy = null;
    if (queued) { queued = false; setTimeout(route, 0); }
  }

  function showSpread() {
    expandBtn.hidden = false;
    spread.hidden = false;
    requestAnimationFrame(() => spread.classList.add('is-in'));
  }

  function hideSpread() {
    spread.hidden = true;
    spread.classList.remove('is-in');
    expandBtn.hidden = true;
    current = null;
  }

  // `instant` skips the choreography entirely: landing straight on a section
  // URL has no home page to erase — the lockup would flash up for one frame
  // just to be swept away — and reduced-motion wants the same short path.
  function enterReading(instant) {
    if (body.classList.contains('reading')) return Promise.resolve();
    if (instant || reduced || !paper.enabled) {
      body.classList.add('reading');
      showSpread();
      return Promise.resolve();
    }

    const from = nameLink.getBoundingClientRect();
    const to = measureAs(true, () => nameLink.getBoundingClientRect());

    const sweep = rubOut([bio, links]);
    const fly = flyName(from, to);

    return Promise.all([sweep, fly.finished.catch(() => {})]).then(() => {
      // Class first, then drop the transform: reading-mode CSS now holds the
      // name exactly where the flight left it, so the handover is invisible.
      body.classList.add('reading');
      fly.cancel();
      nameEl.style.transformOrigin = '';
      restore([bio, links]);
      showSpread();
    });
  }

  function leaveReading(instant) {
    if (!body.classList.contains('reading')) return Promise.resolve();
    if (instant || reduced || !paper.enabled) {
      body.classList.remove('reading');
      hideSpread();
      return Promise.resolve();
    }

    const from = nameLink.getBoundingClientRect();
    const to = measureAs(false, () => nameLink.getBoundingClientRect());

    spread.classList.remove('is-in');
    const sweep = fadeOut([spread]);
    const fly = flyName(from, to);

    return Promise.all([sweep, fly.finished.catch(() => {})]).then(() => {
      body.classList.remove('reading');
      fly.cancel();
      nameEl.style.transformOrigin = '';
      restore([spread]);
      hideSpread();
      // Let the bio and the social row settle back on rather than snapping —
      // the same entrance they get on a cold load. Restarting a CSS animation
      // needs the class off, a reflow, then the class back.
      [bio, links].forEach(el => {
        el.classList.remove('is-settling');
        void el.offsetWidth;
        el.classList.add('is-settling');
      });
    });
  }

  // Only the router's very first run is a cold load; everything after it is a
  // real navigation and gets the full erase.
  let cold = true;

  function route() {
    if (busy) { queued = true; return; }
    const parsed = parseHash();
    const instant = cold;
    cold = false;
    // The hash this run is acting on. A transition takes the better part of a
    // second, and the URL can move during it.
    const routedAt = location.hash;

    // Writing is the only section that exists. Photos and More are still the
    // placeholders the dog-ear shipped with, so they fall back to the sheet
    // rather than opening an empty spread.
    const done = (!parsed || parsed.section !== 'writing')
      ? leaveReading(instant)
      : loadIndex().then(list => {
          if (!list.length) return;
          const target = (parsed.item && list.find(i => i.slug === parsed.item)) || list[0];
          paintIndex();
          return enterReading(instant).then(() => {
            showPost(target);
            // Landing on bare #writing opens the newest piece, so put its
            // route in the bar — the URL should say what's on screen.
            // ⚠️ Only if the URL hasn't moved since. This write lands a full
            // transition after the route began, and without the check it
            // clobbers a newer hash — click Writing and then pick a post from
            // the index before the erase finishes, and this would drag you
            // back to the newest piece.
            if (!parsed.item && location.hash === routedAt) {
              history.replaceState(null, '', '#writing/' + target.slug);
            }
          });
        });

    busy = Promise.resolve(done).catch(() => {}).then(settle);
  }

  /* ══ Controls ══════════════════════════════════════════════════════════ */

  // Collapsing the index leaves the page as the only thing on the sheet.
  // Remembered, because it's a reading preference rather than a per-visit one.
  const SOLO_KEY = 'paperSolo';
  function setSolo(on) {
    body.classList.toggle('solo', on);
    expandBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    expandLbl.textContent = on ? 'Show the index' : 'Hide the index';
    try { localStorage.setItem(SOLO_KEY, on ? '1' : '0'); } catch (e) {}
  }
  try { if (localStorage.getItem(SOLO_KEY) === '1') setSolo(true); } catch (e) {}

  expandBtn.addEventListener('click', () => setSolo(!body.classList.contains('solo')));

  nameLink.addEventListener('click', e => {
    // At home the name is just the name; only in a section is it a way back.
    if (!body.classList.contains('reading')) { e.preventDefault(); return; }
    if (!location.hash) { e.preventDefault(); leaveReading(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && body.classList.contains('reading')) location.hash = '';
  });

  window.addEventListener('hashchange', route);
  route();
})();
