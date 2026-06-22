(function () {
  const strip = document.getElementById('nowStrip');
  if (!strip) return;

  const CELL_COUNT   = 10;
  const ITEM_STAGGER = 150;  // ms between items on initial load
  const CHAR_STAGGER = 55;   // ms between chars within an item
  const TICK_INTERVAL = 340; // ms between each one-char scroll advance
  const PAUSE_AFTER_LOAD = 1400; // ms to hold before scrolling starts

  /* ── Split-flap cell ─────────────────────────────────── */
  function makeCell(parent) {
    const el = document.createElement('div');
    el.className = 'ns-cell';
    el.innerHTML =
      '<div class="ct"><div class="cw"> </div></div>' +
      '<div class="cb"><div class="cw"> </div></div>' +
      '<div class="ft"><div class="cw"> </div></div>' +
      '<div class="fb"><div class="cw"> </div></div>';

    const ct   = el.querySelector('.ct .cw');
    const cb   = el.querySelector('.cb .cw');
    const ftEl = el.querySelector('.ft');
    const fbEl = el.querySelector('.fb');
    const ft   = ftEl.querySelector('.cw');
    const fb   = fbEl.querySelector('.cw');

    ftEl.style.transform = 'rotateX(0deg)';
    fbEl.style.transform = 'rotateX(90deg)';

    let cur = ' ';

    function setChar(nc, animate) {
      nc = nc || ' ';
      if (!animate || nc === cur) {
        cur = nc;
        ct.textContent = nc; cb.textContent = nc;
        ft.textContent = nc; fb.textContent = nc;
        ftEl.style.transition = ''; ftEl.style.transform = 'rotateX(0deg)';
        fbEl.style.transition = ''; fbEl.style.transform = 'rotateX(90deg)';
        return;
      }
      const old = cur;
      cur = nc;

      ct.textContent = nc;
      ft.textContent = old;
      fb.textContent = nc;

      fbEl.style.transition = 'none';
      fbEl.style.transform  = 'rotateX(90deg)';
      void fbEl.offsetWidth;

      ftEl.style.transition = 'transform 120ms ease-in';
      ftEl.style.transform  = 'rotateX(-90deg)';

      setTimeout(() => {
        fbEl.style.transition = 'transform 120ms ease-out';
        fbEl.style.transform  = 'rotateX(0deg)';
      }, 60);

      setTimeout(() => {
        cb.textContent = nc;
        fbEl.style.transition = 'none';
        fbEl.style.transform  = 'rotateX(90deg)';
        ftEl.style.transition = 'none';
        ftEl.style.transform  = 'rotateX(0deg)';
        ft.textContent = nc;
      }, 190);
    }

    parent.appendChild(el);
    return { setChar };
  }

  /* ── Ticker (scroll one char at a time) ─────────────── */
  function startTicker(cells, val) {
    const padded = val + '   '; // trailing spaces before loop
    if (padded.length <= CELL_COUNT) return; // fits — no scrolling needed

    let offset = 0;

    function advance() {
      offset = (offset + 1) % padded.length;
      const slice = (padded + padded).slice(offset, offset + CELL_COUNT);
      for (let i = 0; i < CELL_COUNT; i++) {
        cells[i].setChar(slice[i] || ' ', true);
      }
      // Pause 3s after completing a full cycle (Spotify-style)
      setTimeout(advance, offset === 0 ? 3000 : TICK_INTERVAL);
    }

    setTimeout(advance, TICK_INTERVAL);
  }

  /* ── Fetch & render ──────────────────────────────────── */
  fetch('/src/data/now.json')
    .then(r => r.json())
    .then(data => {
      const items = (data.items || []).slice(0, 3);
      if (!items.length) { strip.style.display = 'none'; return; }

      const wrap = document.createElement('div');
      wrap.className = 'ns-items';

      const itemCells = [];

      items.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'ns-item';

        const lbl = document.createElement('span');
        lbl.className = 'ns-lbl';
        lbl.textContent = item.label;
        itemEl.appendChild(lbl);

        const cellsEl = document.createElement('div');
        cellsEl.className = 'ns-cells';

        // Full value (uppercase), first CELL_COUNT chars shown initially
        const fullVal = (item.value || '').toUpperCase();
        const initVal = fullVal.slice(0, CELL_COUNT).padEnd(CELL_COUNT, ' ');

        const cells = [];
        for (let i = 0; i < CELL_COUNT; i++) cells.push(makeCell(cellsEl));

        itemEl.appendChild(cellsEl);
        wrap.appendChild(itemEl);
        itemCells.push({ cells, initVal, fullVal });
      });

      strip.appendChild(wrap);
      // Only show on the Life tab (may have loaded after setMode ran)
      const search = location.search;
      const isLife = !search.includes('work') && !search.includes('bookshelf')
        && !search.includes('gear') && !search.includes('appstack') && !search.includes('places')
        && !search.includes('chat');
      if (isLife) {
        strip.style.display = 'inline-flex';
      }

      // Staggered flip-in, then start tickers for overflowing values
      itemCells.forEach(({ cells, initVal, fullVal }, itemIdx) => {
        const itemDelay = itemIdx * ITEM_STAGGER;
        cells.forEach((cell, i) => {
          setTimeout(() => cell.setChar(initVal[i], true), itemDelay + i * CHAR_STAGGER);
        });

        // After the initial animation settles, start the ticker if needed
        const loadDone = itemIdx * ITEM_STAGGER + CELL_COUNT * CHAR_STAGGER + PAUSE_AFTER_LOAD;
        setTimeout(() => startTicker(cells, fullVal), loadDone);
      });
    })
    .catch(() => { /* stays hidden */ });
}());
