/* ──────────────────────────────────────────────────────────────────────────
   paperlike — sections.

   The landing page is script-free and stays that way: everything below runs
   only once a section is routed to. With JS off, `/` renders exactly as it
   always has — the name, the bio, the social row and the dog-ear — and the
   nav's hash links simply don't resolve, which is where they started.

   What this file owns:

     • the hash router (`#writing`, `#photos`, `#<section>/<slug>`, else → home)
     • the ERASE: leaving the sheet doesn't cut, it gets swept clean
     • the masthead FLIP: the name is the one thing never erased — it travels
       out of the centre and shrinks into the top-left corner, and clicking it
       is the way back
     • the reading spread: index of titles left, the open piece right
     • markdown → HTML, including a transliteration pass the typeface needs

   ⚠️ There are now THREE surfaces a section can open onto — `.spread`, which
   is writing's two-column layout, `.plates`, which is photographs' single
   scroller (js/photos.js), and `.folio`, the plain page behind More
   (js/more.js: bookshelf, gear, app stack, places — four routes, one
   surface). Everything above is shared: the erase, the flight and the
   masthead do not care which one is coming up behind them. Only `surface()`
   knows the difference.

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
  const letterhead = document.querySelector('.letterhead');
  const links      = document.querySelector('.links');
  const backLink   = $('back');
  const expandBtn  = $('expand');
  const expandLbl  = $('expandLabel');
  const spread     = $('spread');
  const plates     = $('plates');
  const folio      = $('folio');
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

  /* ── The dog-ear's toggle ──────────────────────────────────────────────
     Touch and narrow screens only (styles.css, "No hover to give"): the ear
     rests small with an "@" on it and a tap curls it open. Everywhere else
     `.is-open` has no CSS attached and the hover does the job. */
  const curl = document.querySelector('.curl');
  const curlBtn = $('curlToggle');
  function setCurl(on) {
    if (!curl || !curlBtn) return;
    curl.classList.toggle('is-open', on);
    curlBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  // The sections' accounts: the same marks, flat, at the right of the masthead
  // where the expand control used to be. Cloned from the dog-ear's so there is
  // one list to keep.
  const mastLinks = $('mastLinks');
  if (mastLinks && curl) {
    curl.querySelectorAll('.curl-links a').forEach(a => mastLinks.appendChild(a.cloneNode(true)));
  }

  if (curl) {
    curl.addEventListener('click', e => {
      if (e.target.closest('.curl-links a')) return;
      setCurl(!curl.classList.contains('is-open'));
    });
    document.addEventListener('pointerdown', e => { if (!curl.contains(e.target)) setCurl(false); });
    window.addEventListener('hashchange', () => setCurl(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setCurl(false); });
  }

  /* ── Tunables ──────────────────────────────────────────────────────────
     Live-editable from the console the way the v2 site's warp was
     (`grid.warp.dur = 1400`): `paper.dur = 2600` to watch the rubber work in
     slow motion, `paper.flyDelay` to re-time the name's exit, or
     `paper.enabled = false` to compare the whole thing against a hard cut. */
  const paper = window.paper = {
    dur: 780,        // how long the rubber takes to cross all the copy
    flyDelay: 400,   // ms before the name lifts clear of the rubber
    enabled: true,
    // Published so js/photos.js can set its captions in the display face
    // without keeping a second copy of the font's cmap in step with this one.
    fold,
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

    /* A YouTube link that is the WHOLE line becomes an embed; the same link
       inside a sentence stays a link. Posts open with the video they were made
       from, written as a plain markdown link (`[Title](https://youtu.be/ID)`),
       so the markdown stays readable anywhere and only this render turns it
       into a player.

       ⚠️ Built here and not written into the markdown as an <iframe>: inline()
       runs fold(), which turns every straight `"` into a curly one, and an
       attribute in curly quotes is not an attribute. nocookie so a visitor who
       never presses play is never tracked. A `t=` start time is honoured. */
    function youtubeEmbed(href, label) {
      let u;
      try { u = new URL(href); } catch (e) { return ''; }
      const host = u.hostname.replace(/^www\./, '');
      const id = host === 'youtu.be' ? u.pathname.slice(1)
        : host === 'youtube.com' && u.pathname === '/watch' ? u.searchParams.get('v') : '';
      if (!/^[\w-]{11}$/.test(id || '')) return '';
      const start = parseInt(u.searchParams.get('t'), 10);
      const title = (label || 'YouTube video').replace(/"/g, '&quot;');
      return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}${start > 0 ? '?start=' + start : ''}" title="${title}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
    }

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
      else {
        closeAll();
        const link = t.match(/^\[([^\]]*)\]\((https?:[^)\s]+)\)$/) || t.match(/^()(https?:\/\/\S+)$/);
        const embed = link ? youtubeEmbed(link[2], link[1]) : '';
        html += embed || `<p>${inline(t)}</p>`;
      }
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
    // ⚠️ Not text under `[inert]`. That is the More row while it is folded
    // away: its labels are laid out (visibility, not display) but nothing of
    // them is on screen, and a mark for each would put a line of type under
    // the nav for the rubber to travel along.
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && n.parentElement.closest('[inert]')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
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
    /* ⚠️ An icon is a mark like any other. The walker above sees TEXT nodes
       only and an <svg> has none, so without this the nav's labels rub out
       on schedule and the five glyphs beside them stay behind on a clean
       sheet. They need no .ch wrapper — the class only exists to make an
       inline box transformable, and an svg is replaced-inline already. */
    root.querySelectorAll('.ico').forEach(el => { if (!el.closest('[inert]')) out.push(el); });
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

  /* ══ The letterhead's flight ═══════════════════════════════════════════
     The monogram is never rubbed out and it is never faded off — it TRAVELS.
     At home it is printed across the head of the sheet; in a section it is
     the mark in the masthead corner. Those are one object, so it flies
     between the two the way the name does, and flies back when you leave.

     ⚠️ Its own FLIP rather than a second pass of flyName(). They cross the
     page together but they are different boxes with different ends: the name
     goes from a hidden hero to a transparent masthead line, the monogram
     from the centre of the sheet to a corner a fifth of its size.

     ⚠️ `transform-origin: 0 0` and the resting `translateX(-50%)` KEPT at the
     head of the transform list. The mark is centred by that translate, so the
     rect it is measured at already includes it; scaling about the element's
     own top-left then makes the extra translate exactly the distance the mark
     travels, with no scale-induced offset folded in. Drop the -50% and it
     jumps half its own width before it moves. */
  const CENTRED = 'translateX(-50%)';

  /* `from` is where the mark is on screen now and `to` is where the layout the
     flight is heading for will put it — both are the letterhead's own rect,
     read with and without `body.reading` (see measureAs). The flight is the
     same either way, so it does not care which direction it is going: at home
     the mark is printed across the head of the sheet, in a section it is the
     smaller one centred in the masthead. */
  function flyLetterhead(from, to) {
    if (!letterhead || reduced || !paper.enabled) return null;
    if (!from.width || !to.width) return null;

    letterhead.style.transformOrigin = '0 0';
    return letterhead.animate([
      { transform: CENTRED },
      { transform: CENTRED +
        ' translate(' + (to.left - from.left).toFixed(2) + 'px, ' + (to.top - from.top).toFixed(2) + 'px)' +
        ' scale(' + (to.width / from.width).toFixed(4) + ')' }
    ], { duration: paper.dur - paper.flyDelay + 180, delay: paper.flyDelay, easing: EASE, fill: 'both' });
  }

  function landLetterhead(anim) {
    if (anim) anim.cancel();
    letterhead.style.transformOrigin = '';
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
    const el = surface();
    const was = body.classList.contains('reading');
    const wasHidden = el.hidden;
    body.classList.toggle('reading', readingOn);
    el.hidden = !readingOn;
    const out = fn();
    body.classList.toggle('reading', was);
    el.hidden = wasHidden;
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

  /* ══ Surfaces ══════════════════════════════════════════════════════════
     A section opens onto one of these. They are siblings inside the sheet and
     only one is ever unhidden, so the masthead, the flight and the erase can
     stay ignorant of which section is actually being routed to. */
  /* Five of the routes are one surface: `#bookshelf`, `#gear`, `#appstack`,
     `#places` and `#career` all open the folio, and js/more.js decides which page to put in
     it. `surfaceKey` is the ROUTE, so the router knows which page to paint. */
  const FOLIO = ['bookshelf', 'gear', 'appstack', 'places', 'career'];
  const SURFACES = { writing: spread, photos: plates };
  FOLIO.forEach(k => { SURFACES[k] = folio; });
  let surfaceKey = 'writing';
  const surface = () => SURFACES[surfaceKey] || spread;
  const photoSection = () => window.photoSection || null;
  const moreSection = () => window.moreSection || null;
  const inFolio = () => FOLIO.includes(surfaceKey);

  /* ══ Routing ═══════════════════════════════════════════════════════════ */

  let items = null;          // the writing index, newest first
  let indexPainted = false;
  let current = null;        // slug on screen
  let token = 0;             // guards against a slow fetch landing after a nav

  /* `rest` is everything after the section. Writing only ever needs the first
     segment; photographs route three deep (`#photos/italy-2026/day-03`), so
     the tail is handed on whole rather than being flattened to one item. */
  function parseHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return null;
    const parts = h.split('/').filter(Boolean);
    return { section: parts[0], item: parts[1] || null, rest: parts.slice(1) };
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

  /* On a narrow screen the spread is two panes and `.is-post` is which one
     is showing (styles.css, "Narrow screens"). It is set from the ROUTE, so
     the class means "the URL names a piece" and carries no meaning on a wide
     sheet, where both columns are always there. */
  const narrow = matchMedia('(max-width: 640px)');

  function setPostOpen(on) {
    spread.classList.toggle('is-post', on);
  }

  /* ══ Back ══════════════════════════════════════════════════════════════
     Back is the browser's back, for as long as the previous entry is one of
     ours: out of a gallery to Photos, out of a piece to wherever you came to
     it from. Each entry is stamped with its depth in `history.state` the
     first time the router sees it, so depth 0 is the page the visitor landed
     on — and there, Back goes UP a level instead of off the site: a day to
     its trip, a trip to Photos, a narrow piece to the list, the rest home.

     ⚠️ The step up REPLACES the entry rather than pushing one. Pushed, the
     parent would be depth 1, and the next Back would history.back() straight
     into the page it just left. Anything else that rewrites the URL has to
     carry `history.state` along, or the stamp is lost. The stamp also keeps
     the hash the entry was reached FROM (`prev`), which is how closing a
     layer knows whether stepping back lands on its parent. */
  let depth = null;
  let lastHash = null;
  function stampDepth() {
    const st = history.state;
    if (st && typeof st.depth === 'number') depth = st.depth;
    else {
      depth = depth == null ? 0 : depth + 1;
      history.replaceState(Object.assign({}, st, { depth, prev: lastHash }), '');
    }
    lastHash = location.hash;
  }

  // Move to a route in place of the current entry, not on top of it.
  function replaceRoute(hash) {
    history.replaceState(history.state, '', hash || location.pathname + location.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  /* A layer closing (a day, play) goes to its parent by stepping BACK when
     that is where the visitor came from. Pushed instead, the parent would sit
     on top of the layer, and the next Back would open it again. */
  function closeTo(hash) {
    const st = history.state;
    if (depth > 0 && st && st.prev === hash) history.back();
    else replaceRoute(hash);
  }

  function parentRoute() {
    const p = parseHash();
    if (!p || !p.rest.length) return '';
    if (p.section === 'writing') return narrow.matches ? '#writing' : '';
    return '#' + [p.section].concat(p.rest.slice(0, -1)).join('/');
  }

  function goBack() {
    if (depth > 0) history.back();
    else replaceRoute(parentRoute());
  }
  Object.assign(paper, { back: goBack, closeTo, replaceRoute });

  /* Two more pieces under the rule: the ones that follow this one in the index
     (older), wrapping round to the newest so the last post still has somewhere
     to send you. */
  const readNext = $('readNext');
  function paintReadNext(item) {
    if (!readNext) return;
    const at = items.findIndex(i => i.slug === item.slug);
    const picks = [];
    for (let k = 1; k < items.length && picks.length < 2; k++) {
      picks.push(items[(at + k) % items.length]);
    }
    readNext.textContent = '';
    if (!picks.length) { readNext.hidden = true; return; }
    const head = document.createElement('h3');
    head.className = 'read-next-title';
    head.textContent = 'Read next';
    const list = document.createElement('div');
    list.className = 'read-next-list';
    picks.forEach(it => {
      const a = document.createElement('a');
      a.className = 'read-next-item';
      a.href = '#writing/' + it.slug;
      const d = document.createElement('span');
      d.className = 'read-next-date';
      d.textContent = it.date;
      const t = document.createElement('span');
      t.className = 'read-next-name';
      t.textContent = it.title;
      a.append(d, t);
      list.appendChild(a);
    });
    readNext.append(head, list);
    readNext.hidden = false;
  }

  function showPost(item) {
    if (current === item.slug) return;
    if (readNext) readNext.hidden = true;
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
        paintReadNext(item);
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

  function showSurface() {
    const el = surface();
    // The expand control collapses the INDEX, and only writing has one.
    expandBtn.hidden = surfaceKey !== 'writing';
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-in'));
  }

  function hideSurface() {
    Object.values(SURFACES).forEach(el => {
      if (!el) return;
      el.hidden = true;
      el.classList.remove('is-in');
    });
    if (photoSection()) photoSection().leave();
    if (moreSection()) moreSection().leave();
    expandBtn.hidden = true;
    setPostOpen(false);
    current = null;
  }

  /* Moving from one section straight into another, without going home first.
     The name is already in the corner and the copy is already off the sheet,
     so nothing needs to fly — only the surface under the masthead changes
     hands, and it does it as a cross-fade rather than a cut. */
  function swapSurface() {
    const el = surface();
    if (!el.hidden) return Promise.resolve();
    const others = Object.values(SURFACES).filter(s => s && s !== el && !s.hidden);
    if (!others.length || reduced || !paper.enabled) {
      others.forEach(s => { s.hidden = true; s.classList.remove('is-in'); });
      if (photoSection() && surfaceKey !== 'photos') photoSection().leave();
      if (moreSection() && !inFolio()) moreSection().leave();
      showSurface();
      return Promise.resolve();
    }
    others.forEach(s => s.classList.remove('is-in'));
    return fadeOut(others).then(() => {
      restore(others);
      others.forEach(s => { s.hidden = true; s.classList.remove('is-in'); });
      if (photoSection() && surfaceKey !== 'photos') photoSection().leave();
      if (moreSection() && !inFolio()) moreSection().leave();
      current = null;
      showSurface();
    });
  }

  /* ══ The zoom ══════════════════════════════════════════════════════════
     A section isn't a page the sheet navigates to — it is the same sheet,
     opened. So the paper zooms up to the edges of the screen and the frame
     goes with it: `body.full` in styles.css takes the inset to nothing and
     squares the corners off, and the whole viewport becomes the reading.

     ⚠️ It runs AFTER the flight, not under it, and `full` is deliberately a
     different class from `reading`. Every flight here is a measured FLIP and
     `measureAs()` reads its target by applying `reading` for one task — fold
     the geometry into that class and the name and the monogram are measured
     against the sheet they'll only occupy once the zoom is over, which is a
     frame-width away from where they actually have to land. Toggling `full`
     in the same task as `reading`, at the end, keeps every measurement and
     every flight inside one geometry and makes the zoom the beat behind it.

     ⚠️ `instant` is a cold load straight onto a section URL, or reduced
     motion. There was no framed sheet on screen to leave, so the geometry has
     to be right on the first frame rather than zooming out of one nobody saw;
     `no-zoom` parks the transition for the length of the toggle. */
  function setFull(on, instant) {
    if (instant || reduced || !paper.enabled) {
      body.classList.add('no-zoom');
      body.classList.toggle('full', on);
      void sheet.offsetWidth; // flush the new geometry with the transition off
      body.classList.remove('no-zoom');
      return;
    }
    // Kept in step with the rest of the choreography, so `paper.dur = 2600`
    // slows the zoom down with everything else instead of leaving it behind.
    sheet.style.setProperty('--zoom-dur', Math.round(paper.dur * 0.67) + 'ms');
    body.classList.toggle('full', on);
  }

  // `instant` skips the choreography entirely: landing straight on a section
  // URL has no home page to erase — the lockup would flash up for one frame
  // just to be swept away — and reduced-motion wants the same short path.
  function enterReading(instant) {
    if (body.classList.contains('reading')) return swapSurface();
    // The home sheet's intro is over the moment it is left: letting it stand
    // would replay the monogram's etching when the letterhead comes back.
    body.classList.add('intro-spent');
    if (instant || reduced || !paper.enabled) {
      body.classList.add('reading');
      setFull(true, true);
      // No erase to restore from, but More may still be out.
      if (moreSection()) moreSection().reset();
      showSurface();
      return Promise.resolve();
    }

    const from = nameLink.getBoundingClientRect();
    const to = measureAs(true, () => nameLink.getBoundingClientRect());

    // The monogram's own two ends, measured in the same pass.
    const markFrom = letterhead ? letterhead.getBoundingClientRect() : null;
    const markTo = markFrom && measureAs(true, () => letterhead.getBoundingClientRect());

    const sweep = rubOut([bio, links]);
    const fly = flyName(from, to);
    const mark = markFrom && flyLetterhead(markFrom, markTo);

    return Promise.all([sweep, fly.finished.catch(() => {})]).then(() => {
      // Class first, then drop the transforms: reading-mode CSS now holds the
      // monogram exactly where the flight left it, so the handover is
      // invisible.
      body.classList.add('reading');
      fly.cancel();
      nameEl.style.transformOrigin = '';
      landLetterhead(mark);
      restore([bio, links]);
      // The restore put back the nav as it was when the erase began — with the
      // More row out, if it was. It is folded away again for the way home.
      if (moreSection()) moreSection().reset();
      // Everything has landed in the framed geometry it was measured in, so
      // the sheet is free to push out to the edges behind the arriving
      // surface. Same task as the class above: nothing paints in between.
      setFull(true);
      showSurface();
    });
  }

  function leaveReading(instant) {
    if (!body.classList.contains('reading')) {
      // A cold load that parked the sheet at full bleed for a section it then
      // couldn't open (#photos with js/photos.js missing) still has to come
      // back to its frame.
      if (body.classList.contains('full')) setFull(false, true);
      return Promise.resolve();
    }
    if (instant || reduced || !paper.enabled) {
      body.classList.remove('reading');
      setFull(false, true);
      hideSurface();
      return Promise.resolve();
    }

    const from = nameLink.getBoundingClientRect();
    const to = measureAs(false, () => nameLink.getBoundingClientRect());

    const markFrom = letterhead ? letterhead.getBoundingClientRect() : null;
    const markTo = markFrom && measureAs(false, () => letterhead.getBoundingClientRect());
    const mark = markFrom && flyLetterhead(markFrom, markTo);

    // The back link goes with the surface: it only exists in a section, and
    // would otherwise blink off at the end of the flight.
    const leaving = surface();
    leaving.classList.remove('is-in');
    const sweep = fadeOut([leaving, backLink, mastLinks]);
    const fly = flyName(from, to);

    return Promise.all([sweep, fly.finished.catch(() => {})]).then(() => {
      body.classList.remove('reading');
      // ...and the paper draws back into its frame, under the copy settling
      // on. The lockup is centred in a row whose own centre doesn't move as
      // the sheet shrinks, so the name — which has just landed there — sits
      // still through it; the letterhead and the social row ride the edges
      // in, from exactly where they were measured.
      setFull(false);
      fly.cancel();
      nameEl.style.transformOrigin = '';
      landLetterhead(mark);
      restore([leaving, backLink, mastLinks]);
      hideSurface();
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

  /* ⚠️ …and a cold load that is already on a section gets NO INTRO. The
     sequence in intro.css is the home sheet introducing itself; run over an
     article it draws rulers and registration marks around a page of prose,
     then wipes them off again. `no-intro` gates every rule in that file.

     Decided here, synchronously, and not inside route(): route() only reaches
     enterReading() after the index fetch resolves, and the first mark is due
     250ms in. This runs the instant the deferred script does, which is before
     any of the sequence has started. */
  const landed = parseHash();
  if (landed && SURFACES[landed.section]) {
    body.classList.add('no-intro');
    /* ⚠️ …and the sheet is parked at full bleed here, synchronously, rather
       than left to setFull() when the section finally opens. route() only
       reaches enterReading() after the index fetch resolves, so the framed
       sheet would sit on screen for the length of that request and then snap
       to full bleed with no zoom to cover it. A deep link should paint the
       geometry it is going to keep. If the section turns out not to be
       openable, leaveReading() takes it back. */
    body.classList.add('full');
  }

  function route() {
    stampDepth();
    if (busy) { queued = true; return; }
    const parsed = parseHash();
    const instant = cold;
    cold = false;
    // The hash this run is acting on. A transition takes the better part of a
    // second, and the URL can move during it.
    const routedAt = location.hash;

    // Anything unrecognised (`#more` included — that is a toggle now, not a
    // route) goes back to the sheet rather than opening an empty surface. Photographs are js/photos.js's from the moment the name is in
    // the corner; everything before that is shared.
    const section = parsed && SURFACES[parsed.section] ? parsed.section : null;
    let done;

    if (!section) {
      done = leaveReading(instant);
    } else if (section === 'photos') {
      if (!photoSection()) {
        done = leaveReading(instant);
      } else {
        surfaceKey = 'photos';
        done = enterReading(instant).then(() => photoSection().paint(parsed.rest));
      }
    } else if (FOLIO.includes(section)) {
      if (!moreSection() || !moreSection().has(section)) {
        done = leaveReading(instant);
      } else {
        surfaceKey = section;
        done = enterReading(instant).then(() => moreSection().paint(section));
      }
    } else {
      surfaceKey = 'writing';
      done = loadIndex().then(list => {
          if (!list.length) return;
          const found = parsed.item && list.find(i => i.slug === parsed.item);
          // Narrow screens: bare `#writing` is the list of titles, not the
          // newest piece. Wide screens always have a piece open beside it.
          const asList = narrow.matches && !found;
          const target = found || list[0];
          paintIndex();
          setPostOpen(!asList);
          return enterReading(instant).then(() => {
            if (asList) { markCurrent(current); return; }
            showPost(target);
            // Landing on bare #writing opens the newest piece, so put its
            // route in the bar — the URL should say what's on screen.
            // ⚠️ Only if the URL hasn't moved since. This write lands a full
            // transition after the route began, and without the check it
            // clobbers a newer hash — click Writing and then pick a post from
            // the index before the erase finishes, and this would drag you
            // back to the newest piece.
            if (!parsed.item && location.hash === routedAt) {
              history.replaceState(history.state, '', '#writing/' + target.slug);
            }
          });
        });
    }

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

  // Widening past the breakpoint with the bare list showing: the wide layout
  // has no such state, so open a piece beside it.
  narrow.addEventListener('change', () => {
    if (!narrow.matches && items && items.length && surfaceKey === 'writing' &&
        !spread.hidden && !spread.classList.contains('is-post')) {
      const target = items.find(i => i.slug === current) || items[0];
      setPostOpen(true);
      showPost(target);
      history.replaceState(history.state, '', '#writing/' + target.slug);
    } else {
      setPostOpen(spread.classList.contains('is-post'));
    }
  });

  backLink.addEventListener('click', e => {
    // Modified clicks keep the href (home) for a new tab.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    goBack();
  });

  document.addEventListener('keydown', e => {
    // ⚠️ js/photos.js listens first (it loads first) and calls preventDefault
    // when Escape closed a layer of its own. Without this guard the same press
    // also unwinds the section, so shutting a lightbox drops the visitor all
    // the way back to the home sheet.
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && body.classList.contains('reading')) goBack();
  });

  /* ══ The fades under overflowing content ══════════════════════════════
     styles.css draws them; this decides when. Each scroller you can actually
     see gets its own: the index (`.spread.is-fade-index`), the piece
     (`.page.is-fade`). Only the writing spread has them: Photos and the More
     pages are standalone and get no fade.
     ⚠️ On a narrow screen the spread's two panes are both laid out (the
     hidden one has only slid away), so only the pane that is showing counts. */
  const pageEl = pageScroll && pageScroll.parentElement;
  const isPostOpen = () => spread.classList.contains('is-post');
  const fadeTargets = [
    { host: spread,  cls: 'is-fade-index', scroller: indexEl,    on: () => !narrow.matches || !isPostOpen() },
    { host: pageEl,  cls: 'is-fade',       scroller: pageScroll, on: () => !narrow.matches || isPostOpen() },
  ];
  let fadeQueued = false;
  function updateFade() {
    fadeQueued = false;
    fadeTargets.forEach(({ host, cls, scroller, on }) => {
      if (!host || !scroller) return;
      const shown = !host.closest('[hidden]') && on();
      const more = shown && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 4;
      host.classList.toggle(cls, more);
    });
  }
  const queueFade = () => {
    if (fadeQueued) return;
    fadeQueued = true;
    setTimeout(updateFade, 30);
  };
  // `scroll` doesn't bubble and `load` (an image landing and changing the
  // height) doesn't either; capturing on the document catches both.
  document.addEventListener('scroll', queueFade, { capture: true, passive: true });
  document.addEventListener('load', queueFade, true);
  // The glass under the piece: its bands of light travel with the scroll.
  if (pageScroll && pageEl) {
    pageScroll.addEventListener('scroll', () => {
      const max = pageScroll.scrollHeight - pageScroll.clientHeight;
      pageEl.style.setProperty('--glass-pos', (max > 0 ? (pageScroll.scrollTop / max) * 100 : 0).toFixed(1) + '%');
    }, { passive: true });
  }
  window.addEventListener('resize', queueFade);
  window.addEventListener('hashchange', queueFade);
  const fadeObserver = new MutationObserver(queueFade);
  [pageScroll, indexEl].forEach(el => {
    if (el) fadeObserver.observe(el, { childList: true, subtree: true });
  });
  if (spread) fadeObserver.observe(spread, { attributes: true, attributeFilter: ['hidden', 'class'] });

  window.addEventListener('hashchange', route);
  route();
})();
