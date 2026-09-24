/* Prototype harness for the #photos index. Throwaway: not linked from the site.
   Waits for js/photos.js to paint the real index, then re-lays the SAME nodes
   (the loose frames keep their click listener, so the lightbox still works). */
(function () {
  'use strict';

  const VARIANTS = [
    { label: 'Current', note: 'As shipped: featured card, three trip cards, one masonry card of loose frames.' },
    { label: 'Filed by year', note: 'Closest to current. Trip cards untouched; loose frames split into years, in justified rows instead of masonry. Tradeoff: fixes the grab-bag, keeps the portfolio-template top.' },
    { label: 'One chronology', note: 'No split. Every year is one run down a rail; a trip lands at its date as a wide plate among that year’s loose frames. Tradeoff: trips lose top billing, and Italy is only first because it is newest.' },
    { label: 'Register', note: 'A catalogue. Trips are ruled ledger rows with a strip of their frames; loose frames become numbered square plates. Tradeoff: text-led and quiet, and square crops cut the photographs.' },
    { label: 'Contact sheets', note: 'Every trip is a roll: a strip of real frames, numbered. Loose frames are Roll 00, a full contact sheet. Tradeoff: shows what is IN a trip before you open it; everything is small.' },
    { label: 'Spread', note: 'The writing layout. Trips and years form a sticky index on the left; the loose frames run large, one at a time, with their EXIF. Tradeoff: loose frames become the main event, and it is a long scroll.' },
  ];

  const qs = new URLSearchParams(location.search);
  let v = +(qs.get('v') ?? sessionStorage.getItem('protoV') ?? 0) || 0;
  const HIDE = qs.has('clean');

  const scroll = document.getElementById('platesScroll');
  if (!scroll) return;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const t = s => esc(window.paper && window.paper.fold ? window.paper.fold(String(s ?? '')) : String(s ?? ''));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${+dd} ${MON[+m - 1]} ${y}`; };
  const monYr = d => { if (!d) return ''; const [y, m] = d.split('-'); return `${MON[+m - 1]} ${y}`; };
  const chev = '<svg class="ico pv-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6l-6 6"/></svg>';

  /* ── Data ── */
  let data = null;
  const trips = new Map();
  const ready = fetch('/content/photos/collections/index.json').then(r => r.json()).then(j => {
    data = j;
    return Promise.all(j.collections.map(c =>
      fetch(`/content/photos/collections/${c.slug}.json`).then(r => r.json()).then(x => trips.set(c.slug, x)).catch(() => {})));
  });

  function tripFrames(slug) {
    const x = trips.get(slug);
    if (!x) return [];
    return x.days.flatMap(d => d.frames).filter(f => !f.standin);
  }
  function spread(arr, n) {
    if (arr.length <= n) return arr.map((f, i) => [f, i]);
    return Array.from({ length: n }, (_, k) => { const i = Math.round(k * (arr.length - 1) / (n - 1)); return [arr[i], i]; });
  }

  /* ── The real index, captured once per paint ── */
  let orig = null;
  function capture(p) {
    const L = p.querySelector('[data-gallery="loose"]');
    orig = {
      p, L,
      section: L.parentNode,
      feature: p.querySelector('.pset--feature'),
      row: p.querySelector('.pset-row'),
      frames: [...L.children],
    };
    p.dataset.proto = '0';
  }

  function restore() {
    const o = orig;
    o.L.className = 'masonry';
    o.L.replaceChildren(...o.frames);
    o.frames.forEach(f => { f.style.removeProperty('--n'); });
    o.section.replaceChildren(o.L);
    o.p.replaceChildren(...[o.feature, o.row, o.section].filter(Boolean));
  }

  /* Build markup with <i data-f=n> / <i data-node=x> placeholders, then swap
     the real nodes in. */
  function mount(html, looseHTML, looseClass) {
    const o = orig;
    const np = document.createElement('div');
    np.className = `pindex pv pv${v}`;
    np.dataset.proto = String(v);
    np.innerHTML = html;
    o.L.className = looseClass;
    o.L.innerHTML = looseHTML;
    o.L.querySelectorAll('i[data-f]').forEach(i => i.replaceWith(o.frames[+i.dataset.f]));
    np.querySelector('i[data-node="loose"]').replaceWith(o.L);
    np.querySelectorAll('i[data-node="feature"]').forEach(i => i.replaceWith(o.feature));
    np.querySelectorAll('i[data-node="row"]').forEach(i => i.replaceWith(o.row));
    scroll.replaceChildren(np);
    return np;
  }

  const loose = () => data.loose.map((f, i) => ({ f, i }));
  function byYear() {
    const m = new Map();
    loose().forEach(x => { const y = (x.f.date || '').slice(0, 4) || 'Undated'; (m.get(y) || m.set(y, []).get(y)).push(x); });
    return m;
  }
  const settings = f => {
    const e = f.exif || {};
    return [fmt(f.date), e.camera, e.focal35 || e.focal, (e.aperture || '').replace('ƒ', 'F'), e.shutter, e.iso]
      .filter(Boolean).map(t).join(' / ');
  };
  const accent = c => (c.accent ? ` style="--accent:${esc(c.accent)}"` : '');
  const cols = () => data.collections;

  /* ── 1. Filed by year ── */
  function v1() {
    const years = [...byYear()].map(([y, xs]) => `
      <section class="pv-year" data-anchor="y${y}">
        <header class="pv-yearhead"><h3>${t(y)}</h3><span>${xs.length} frames</span></header>
        <div class="pv-jr">${xs.map(x => `<i data-f="${x.i}"></i>`).join('')}</div>
      </section>`).join('');
    mount(`<i data-node="feature"></i><i data-node="row"></i><i data-node="loose"></i>`, years, 'pv-years');
  }

  /* ── 2. One chronology ── */
  function v2() {
    const items = [
      ...loose().map(x => ({ d: x.f.date || '0000', kind: 'f', x })),
      ...cols().map(c => ({ d: c.start, kind: 't', c })),
    ].sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    const years = new Map();
    items.forEach(it => { const y = it.d.slice(0, 4); (years.get(y) || years.set(y, []).get(y)).push(it); });
    const html = [...years].map(([y, its]) => {
      let out = '', run = [];
      const flush = () => { if (run.length) out += `<div class="pv-jr">${run.join('')}</div>`; run = []; };
      its.forEach(it => {
        if (it.kind === 'f') { run.push(`<i data-f="${it.x.i}"></i>`); return; }
        flush();
        const c = it.c;
        out += `<a class="pv-trip" href="#photos/${esc(c.slug)}">
          <span class="pv-trip-cover"><img src="${esc(c.cover)}" alt="${t(c.coverAlt)}" loading="lazy"></span>
          <span class="pv-trip-cap">
            <span class="pv-lbl">Trip / ${c.count} ${t(c.unit)}</span>
            <span class="pv-trip-name"${accent(c)}>${t(c.title)}</span>
            <span class="pv-lbl">${t(c.dates)} ${chev}</span>
          </span></a>`;
      });
      flush();
      const nf = its.filter(i => i.kind === 'f').length, nt = its.length - nf;
      return `<section class="pv-cy" data-anchor="y${y}">
        <header class="pv-cy-head"><h3>${t(y)}</h3>
          <span class="pv-lbl">${nt ? `${nt} trip${nt > 1 ? 's' : ''} / ` : ''}${nf} frames</span></header>
        <div class="pv-cy-body">${out}</div></section>`;
    }).join('');
    mount(`<i data-node="loose"></i>`, html, 'pv-chron');
  }

  /* ── 3. Register ── */
  function v3() {
    const rows = cols().map((c, k) => {
      const fr = spread(tripFrames(c.slug), 5);
      const n = tripFrames(c.slug).length;
      return `<a class="pv-reg" href="#photos/${esc(c.slug)}">
        <span class="pv-lbl pv-reg-no">${String(k + 1).padStart(2, '0')}</span>
        <span class="pv-reg-name"${accent(c)}>${t(c.title)}</span>
        <span class="pv-lbl pv-reg-dates">${t(c.dates)} ${t((c.start || '').slice(0, 4))}</span>
        <span class="pv-lbl pv-reg-count">${c.count} ${t(c.unit)} / ${n} frames</span>
        <span class="pv-reg-strip">${fr.map(([f]) => `<img src="${esc(f.thumb)}" alt="" loading="lazy" style="--ar:${f.w}/${f.h}">`).join('')}</span>
        ${chev}
      </a>`;
    }).join('');
    const plates = loose().map(x => `<figure class="pv-plate"><i data-f="${x.i}"></i>
      <figcaption class="pv-lbl"><span>Pl. ${String(x.i + 1).padStart(2, '0')}</span><span>${t(monYr(x.f.date))}</span></figcaption></figure>`).join('');
    mount(`
      <header class="pv-reghead" data-anchor="trips"><h3>Trips</h3><span class="pv-lbl">${cols().length} sets</span></header>
      <div class="pv-regrows">${rows}</div>
      <header class="pv-reghead" data-anchor="loose"><h3>Loose frames</h3><span class="pv-lbl">${data.loose.length} plates</span></header>
      <i data-node="loose"></i>`, plates, 'pv-plates');
  }

  /* ── 4. Contact sheets ── */
  function v4() {
    const n = cols().length;
    const rolls = cols().map((c, k) => {
      const all = tripFrames(c.slug);
      const fr = spread(all, 10);
      return `<a class="pv-roll" href="#photos/${esc(c.slug)}">
        <header class="pv-roll-head">
          <span class="pv-lbl">Roll ${String(n - k).padStart(2, '0')}</span>
          <span class="pv-roll-name"${accent(c)}>${t(c.title)}</span>
          <span class="pv-lbl pv-roll-meta">${t(c.dates)} / ${c.count} ${t(c.unit)} / ${all.length} frames ${chev}</span>
        </header>
        <span class="pv-strip">${fr.map(([f, i]) => `<span class="pv-cell"><span class="pv-cell-img"><img src="${esc(f.thumb)}" alt="" loading="lazy"></span><span class="pv-num">${i + 1}</span></span>`).join('')}</span>
      </a>`;
    }).join('');
    const sheet = loose().map(x => `<span class="pv-cell"><i data-f="${x.i}"></i><span class="pv-num">${x.i + 1}</span></span>`).join('');
    mount(`${rolls}
      <section class="pv-roll pv-roll--loose" data-anchor="loose">
        <header class="pv-roll-head">
          <span class="pv-lbl">Roll 00</span>
          <span class="pv-roll-name">Loose frames</span>
          <span class="pv-lbl pv-roll-meta">2023 - 2026 / ${data.loose.length} frames</span>
        </header>
        <i data-node="loose"></i>
      </section>`, sheet, 'pv-sheet');
  }

  /* ── 5. Spread ── */
  function v5() {
    const ys = [...byYear()];
    const idx = `<aside class="pv-idx">
      <p class="pv-lbl pv-idx-h">Trips</p>
      ${cols().map(c => `<a class="pv-idx-item" href="#photos/${esc(c.slug)}">
        <img src="${esc(c.cover)}" alt="" loading="lazy">
        <span><span class="pv-idx-name">${t(c.title)}</span><span class="pv-lbl">${t(c.dates)} ${t((c.start || '').slice(0, 4))}</span></span>
      </a>`).join('')}
      <p class="pv-lbl pv-idx-h">Loose frames</p>
      <nav class="pv-idx-years">${ys.map(([y, xs]) => `<a href="#" data-jump="y${y}"><span>${t(y)}</span><span class="pv-lbl">${xs.length}</span></a>`).join('')}</nav>
    </aside>`;
    const main = ys.map(([y, xs]) => `
      <h3 class="pv-bigyear" data-anchor="y${y}" id="pv-y${y}">${t(y)}</h3>
      ${xs.map(x => `<figure class="pv-big" style="--ar:${x.f.w || 3}/${x.f.h || 4}"><i data-f="${x.i}"></i>
        <figcaption class="pv-lbl">${settings(x.f)}</figcaption></figure>`).join('')}`).join('');
    const np = mount(`${idx}<div class="pv-main"><i data-node="loose"></i></div>`, main, 'pv-bigs');
    np.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const el = np.querySelector(`[data-anchor="${a.dataset.jump}"]`);
      scroll.scrollTo({ top: el.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 8, behavior: 'smooth' });
    }));
  }

  const RENDER = [null, v1, v2, v3, v4, v5];

  /* ── Scroll anchoring: keep the same loose frame (or section) under the eye ── */
  function anchorNow() {
    const top = scroll.getBoundingClientRect().top;
    const f = orig.frames.find(el => { const r = el.getBoundingClientRect(); return r.bottom > top + 40 && r.height; });
    if (f && f.getBoundingClientRect().top < top + scroll.clientHeight) return { el: f, off: f.getBoundingClientRect().top - top };
    return null;
  }
  function render(next) {
    const a = scroll.scrollTop > 0 ? anchorNow() : null;
    const tripsTop = !a && scroll.scrollTop;
    v = next;
    sessionStorage.setItem('protoV', v);
    restore();
    if (v === 0) scroll.replaceChildren(orig.p);
    else RENDER[v]();
    if (a) {
      const top = scroll.getBoundingClientRect().top;
      scroll.scrollTop += a.el.getBoundingClientRect().top - top - a.off;
    } else scroll.scrollTop = tripsTop || 0;
    paintSwitch();
  }

  new MutationObserver(() => {
    const p = scroll.querySelector(':scope > .pindex');
    if (!p || p.dataset.proto || !p.querySelector('[data-gallery="loose"]')) return;
    capture(p);
    ready.then(() => { if (orig.p === p) render(v); });
  }).observe(scroll, { childList: true });

  /* ── Switcher (shadow DOM, fixed, no layout shift) ── */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>
    :host{all:initial}
    .w{font:12px/1.4 -apple-system,system-ui,sans-serif;color:#fff;background:rgba(20,20,22,.92);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;width:min(720px,calc(100vw - 32px));box-sizing:border-box;box-shadow:0 8px 30px rgba(0,0,0,.25)}
    .b{display:flex;gap:6px;flex-wrap:wrap}
    button{all:unset;cursor:pointer;padding:5px 9px;border-radius:7px;background:rgba(255,255,255,.08);color:#ddd;font-size:12px}
    button[aria-pressed=true]{background:#fff;color:#111}
    button:focus-visible{outline:2px solid #6af;outline-offset:1px}
    .n{color:#bbb}.k{color:#888;margin-left:auto;align-self:center}
    .hid{display:none}
  </style><div class="w"><div class="b"></div><div class="n"></div></div>`;
  const bar = sh.querySelector('.b'), note = sh.querySelector('.n'), w = sh.querySelector('.w');
  function paintSwitch() {
    bar.innerHTML = VARIANTS.map((x, i) => `<button data-i="${i}" aria-pressed="${i === v}">${i} ${x.label}</button>`).join('') +
      '<span class="k">0-5 / arrows / H hides</span>';
    note.textContent = VARIANTS[v].note;
  }
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b && orig) render(+b.dataset.i); });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName) || !orig) return;
    if (!/^#photos\/?$/.test(location.hash)) return;
    if (/^[0-5]$/.test(e.key)) render(+e.key);
    else if (e.key === 'ArrowRight') render((v + 1) % VARIANTS.length);
    else if (e.key === 'ArrowLeft') render((v + VARIANTS.length - 1) % VARIANTS.length);
    else if (e.key === 'h' || e.key === 'H') w.classList.toggle('hid');
    else return;
    e.preventDefault();
  });
  const showIf = () => { host.style.display = !HIDE && /^#photos\/?$/.test(location.hash) ? '' : 'none'; };
  addEventListener('hashchange', showIf);
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(host); showIf(); paintSwitch(); });
})();
