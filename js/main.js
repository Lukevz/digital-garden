// ── Markdown → HTML (for case study bodies from Bear) ──
    function stripYamlFrontmatter(text) {
      const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
      return m ? text.slice(m[0].length).replace(/^\uFEFF?/, '') : text;
    }

    function mdToHTML(md) {
      if (!md) return '';
      md = stripYamlFrontmatter(md.trim());
      const lines = md.split('\n');
      let html = '';
      let inUL = false;
      let ulIsTask = false;
      let inOL = false;
      let inBQ = false;

      function closeUL() {
        if (inUL) {
          html += '</ul>';
          inUL = false;
          ulIsTask = false;
        }
      }
      function closeOL() { if (inOL) { html += '</ol>'; inOL = false; } }
      function closeBQ() { if (inBQ) { html += '</blockquote>'; inBQ = false; } }

      function inline(t) {
        return t
          .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      }

      let inHTMLBlock = false;
      let htmlBlockBuf = '';
      const HTML_BLOCK_TAGS = /^<(iframe|div|figure|video|audio|script|style)[\s>]/i;
      const HTML_CLOSE_TAGS = /<\/(iframe|div|figure|video|audio|script|style)>/i;

      for (const line of lines) {
        const t = line.trim();

        // Accumulate multi-line HTML blocks
        if (inHTMLBlock) {
          htmlBlockBuf += '\n' + line;
          if (HTML_CLOSE_TAGS.test(t)) {
            html += htmlBlockBuf;
            htmlBlockBuf = '';
            inHTMLBlock = false;
          }
          continue;
        }

        // Detect start of an HTML block
        if (HTML_BLOCK_TAGS.test(t)) {
          closeUL(); closeOL(); closeBQ();
          if (HTML_CLOSE_TAGS.test(t)) {
            html += line; // single-line block
          } else {
            htmlBlockBuf = line;
            inHTMLBlock = true;
          }
          continue;
        }

        if (!t) { closeUL(); closeOL(); closeBQ(); continue; }

        if (/^#{1} /.test(t))       { closeUL(); closeOL(); closeBQ(); html += `<h1>${inline(t.slice(2))}</h1>`; }
        else if (/^## /.test(t))    { closeUL(); closeOL(); closeBQ(); html += `<h2>${inline(t.slice(3))}</h2>`; }
        else if (/^### /.test(t))   { closeUL(); closeOL(); closeBQ(); html += `<h3>${inline(t.slice(4))}</h3>`; }
        else if (/^#### /.test(t))  { closeUL(); closeOL(); closeBQ(); html += `<h4>${inline(t.slice(5))}</h4>`; }
        else if (/^---+$/.test(t))  { closeUL(); closeOL(); closeBQ(); html += '<hr>'; }
        else if (/^> /.test(line))  {
          closeUL(); closeOL();
          if (!inBQ) { html += '<blockquote>'; inBQ = true; }
          const bqContent = t.slice(2);
          html += bqContent ? `<p>${inline(bqContent)}</p>` : '';
        }
        else if (/^[-*] /.test(t))  {
          closeOL(); closeBQ();
          const rest = t.slice(2);
          const taskM = rest.match(/^\[([ xX])\]\s*(.*)$/);
          const isTask = !!taskM;
          if (inUL && ulIsTask !== isTask) closeUL();
          if (!inUL) {
            inUL = true;
            ulIsTask = isTask;
            html += isTask ? '<ul class="task-list">' : '<ul>';
          }
          if (taskM) {
            const checked = taskM[1].toLowerCase() === 'x';
            html += `<li class="task-list-item"><input type="checkbox" disabled${checked ? ' checked' : ''} aria-readonly="true"> <span>${inline(taskM[2])}</span></li>`;
          } else {
            html += `<li>${inline(rest)}</li>`;
          }
        }
        else if (/^\d+\. /.test(t)) {
          closeUL(); closeBQ();
          if (!inOL) { html += '<ol>'; inOL = true; }
          html += `<li>${inline(t.replace(/^\d+\. /, ''))}</li>`;
        }
        else { closeUL(); closeOL(); closeBQ(); html += `<p>${inline(t)}</p>`; }
      }
      if (inHTMLBlock && htmlBlockBuf) html += htmlBlockBuf;

      closeUL(); closeOL(); closeBQ();
      return html;
    }

    // ── Heading char animation helpers ──
    function splitChars(el) {
      // Split on ANY HTML tag, preserving tags intact; only wrap text nodes
      const parts = el.innerHTML.split(/(<[^>]+>)/gi);
      el.innerHTML = parts.map(part => {
        if (/^</.test(part)) return part; // keep tags as-is
        return part.split(/( +)/).map(seg => {
          if (!seg) return seg;
          if (/^ +$/.test(seg)) return seg.replace(/ /g, '<span class="char">\u00a0</span>');
          return `<span class="word">${[...seg].map(ch => `<span class="char">${ch}</span>`).join('')}</span>`;
        }).join('');
      }).join('');
      return Array.from(el.querySelectorAll('.char'));
    }

    function animateHeadingIn(el, startDelay = 0) {
      const reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const chars = splitChars(el);
      const logo = el.querySelector('.instinct-inline-logo');
      if (logo && !reducedMotion) {
        logo.style.opacity = '0';
      }
      chars.forEach(c => { c.style.opacity = '0'; c.style.transform = 'translateY(22px)'; });
      function fadeInInstinctLogo() {
        if (!logo || !el.contains(logo) || reducedMotion) return;
        anime({
          targets: logo,
          opacity: 1,
          duration: 420,
          easing: 'cubicBezier(0.16,1,0.3,1)'
        });
      }
      if (!chars.length) {
        fadeInInstinctLogo();
        return;
      }
      anime({
        targets: chars,
        opacity:    1,
        translateY: 0,
        duration: 700,
        easing: 'cubicBezier(0.16,1,0.3,1)',
        delay: anime.stagger(22, { start: startDelay }),
        complete: fadeInInstinctLogo
      });
    }

    function animateHeadingOut(el, cb) {
      const logo = el.querySelector('.instinct-inline-logo');
      if (logo) logo.style.opacity = '0';
      const chars = Array.from(el.querySelectorAll('.char'));
      if (!chars.length) { cb(); return; }
      anime({
        targets: chars,
        opacity:    0,
        translateY: -12,
        duration: 180,
        easing: 'easeInQuad',
        delay: anime.stagger(8, { from: 'last' }),
        complete: cb
      });
    }

    // ── Restructure app buttons: wrap icon + label into app-card-left ──
    document.querySelectorAll('.app').forEach(btn => {
      const icon  = btn.querySelector('.app-icon');
      const right = btn.querySelector('.app-card-right');
      const appName = btn.dataset.app;

      const left = document.createElement('div');
      left.className = 'app-card-left';

      const label = document.createElement('span');
      label.className = 'app-label';
      label.textContent = appName;
      label.setAttribute('aria-hidden', 'true');

      left.appendChild(icon);
      left.appendChild(label);

      if (btn.classList.contains('app--coming-soon')) {
        label.style.position = 'relative';
        const badge = document.createElement('span');
        badge.className = 'app-coming-soon-badge';
        badge.textContent = 'Coming Soon';
        label.appendChild(badge);
      }

      btn.prepend(left);
    });

    // ── Entrance ──
    animateHeadingIn(document.querySelector('h1'), 80);

    anime({
      targets: '.app',
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 900,
      easing: 'cubicBezier(0.16,1,0.3,1)',
      delay: anime.stagger(70, { start: 420 })
    });

    // ── Panel ──
    const backdrop   = document.getElementById('panelBackdrop');
    const panel      = document.getElementById('panel');
    const panelTitle = document.getElementById('panelTitle');
    const panelBack  = document.getElementById('panelBack');
    let panelOpen = false;

    function openPanel(btn, originEl) {
      if (panelOpen) return;
      panelOpen = true;

      const r  = originEl.getBoundingClientRect();
      const ox = (r.left + r.width  / 2) - window.innerWidth  / 2;
      const oy = (r.top  + r.height / 2) - window.innerHeight / 2;
      panel.style.transformOrigin = `calc(50% + ${ox}px) calc(50% + ${oy}px)`;

      panelTitle.textContent = btn.dataset.app || panelTitle.textContent;
      backdrop.style.pointerEvents = 'all';

      anime.remove([backdrop, panel]);
      anime({ targets: backdrop, opacity: [0, 1], duration: 550, easing: 'easeOutQuad' });
      anime({ targets: panel, scale: [0.04, 1], opacity: [0, 1], duration: 700, easing: 'cubicBezier(0.16,1,0.3,1)' });
    }

    // App buttons handled by hash router below

    // ── Case study cards — loaded from content/case-studies/ ──
    const panelContent = document.getElementById('panelContent');

    function parseFrontmatter(md) {
      const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
      if (!match) return { meta: {}, body: md };
      const meta = {};
      match[1].split('\n').forEach(line => {
        const i = line.indexOf(':');
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      return { meta, body: match[2] };
    }

    function escHtml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function caseStudyCardBlurb(body) {
      const t = (body || '').trim();
      if (!t) return '';
      let para = t.split(/\n\n+/)[0].replace(/^#{1,6}\s+.*$/gm, '').trim();
      if (para.length > 300) para = `${para.slice(0, 297)}…`;
      return para;
    }

    const CS_TAG_ICON_SVG = '<svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>';

    function renderCaseStudyTagChips(tagStr) {
      if (!tagStr || !String(tagStr).trim()) return '';
      const parts = String(tagStr).split(/\s*·\s*/).map(s => s.trim()).filter(Boolean);
      if (!parts.length) return '';
      const chips = parts.map(p => `<span class="cs-tag-chip">${CS_TAG_ICON_SVG}<span class="cs-tag-chip__text">${escHtml(p)}</span></span>`).join('');
      return `<div class="cs-tags" aria-label="Focus areas">${chips}</div>`;
    }

    function buildStudyCard(meta, body) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study';
      const jobTitle = meta.job || meta.role || meta.title || 'Untitled';
      const company = meta.company || '';
      const timeline = meta.timeline || '';
      const rightCol = (company || timeline)
        ? `<div class="cs-meta-col">
            ${company ? `<span class="cs-company">${escHtml(company)}</span>` : ''}
            ${timeline ? `<span class="cs-dates">${escHtml(timeline)}</span>` : ''}
          </div>`
        : '';
      const blurb = caseStudyCardBlurb(body);
      const tagsHtml = renderCaseStudyTagChips(meta.tag);
      btn.innerHTML = `
        <div class="study-card">
          <div class="cs-row">
            <span class="cs-job-title">${escHtml(jobTitle)}</span>
            ${rightCol}
          </div>
          ${blurb ? `<p class="cs-card-headline">${escHtml(blurb)}</p>` : ''}
          ${tagsHtml}
        </div>`;
      btn.addEventListener('click', () => {
        panelTitle.textContent = meta.title || '';
        const metaRows = ['company', 'role', 'timeline', 'tools']
          .filter(k => meta[k])
          .map(k => `<div class="cs-meta-item"><span class="cs-meta-label">${k.charAt(0).toUpperCase()+k.slice(1)}</span><span class="cs-meta-value">${meta[k]}</span></div>`)
          .join('');
        panelContent.innerHTML = `
          ${metaRows ? `<div class="cs-meta">${metaRows}</div>` : ''}
          <div class="cs-body">${mdToHTML(body)}</div>`;
        openPanel(btn, btn.querySelector('.study-card'));
      });
      return btn;
    }

    let loadedStudies = [];

    function buildPrevCard(meta, body, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'study';
      const jobTitle = meta.job || meta.role || meta.title || 'Untitled';
      const company = meta.company || '';
      const timeline = meta.timeline || '';
      const rightCol = (company || timeline)
        ? `<div class="cs-meta-col">
            ${company ? `<span class="cs-company">${escHtml(company)}</span>` : ''}
            ${timeline ? `<span class="cs-dates">${escHtml(timeline)}</span>` : ''}
          </div>`
        : '';
      const blurb = meta.headline || caseStudyCardBlurb(body);
      const tagsHtml = renderCaseStudyTagChips(meta.tag);
      btn.innerHTML = `
        <div class="study-card">
          <div class="cs-row">
            <span class="cs-job-title">${escHtml(jobTitle)}</span>
            ${rightCol}
          </div>
          ${blurb ? `<p class="cs-card-headline">${escHtml(blurb)}</p>` : ''}
          ${tagsHtml}
        </div>`;
      btn.addEventListener('click', () => {
        renderPrevDetail(idx);
        openSModal();
      });
      return btn;
    }

    fetch('/api/content/list?category=case-studies')
      .then(r => r.json())
      .then(({ items = [] }) => Promise.all(
        items.map(({ file }) =>
          fetch(`/content/case-studies/${encodeURIComponent(file)}`)
            .then(r => r.text())
            .then(md => { const { meta, body } = parseFrontmatter(md); return { meta, body }; })
            .catch(() => null)
        )
      ))
      .then(studies => {
        loadedStudies = studies.filter(Boolean).filter(s => s.meta.title);
        const prevGrid = document.getElementById('prevGrid');
        if (prevGrid && loadedStudies.length) {
          prevGrid.innerHTML = '';
          loadedStudies.forEach(({ meta, body }, i) => {
            prevGrid.appendChild(buildPrevCard(meta, body, i));
          });
        }
      })
      .catch(() => {});

    function closePanel() {
      if (!panelOpen) return;
      panelOpen = false;
      backdrop.style.pointerEvents = 'none';

      anime.remove([backdrop, panel]);
      anime({
        targets: backdrop,
        opacity: 0,
        duration: 450,
        easing: 'easeInQuad'
      });
      anime({
        targets: panel,
        scale:   0.04,
        opacity: 0,
        duration: 500,
        easing: 'cubicBezier(0.7,0,0.84,0)'
      });
    }

    panelBack.addEventListener('click', closePanel);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closePanel(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

    // ── Mode tab (Life / Work) ──
    const modeTab      = document.getElementById('modeTab');
    const tabPill      = modeTab.querySelector('.tab-pill');
    const tabOpts      = modeTab.querySelectorAll('.tab-opt');
    const overflowBtn  = document.getElementById('overflowBtn');
    const overflowPanel = document.getElementById('overflowPanel');
    const overflowItems = overflowPanel.querySelectorAll('.overflow-item');
    const avatarImg    = document.getElementById('avatarImg');
    const launchpad    = document.querySelector('.launchpad');
    const portfolioGrid = document.getElementById('portfolioGrid');
    const heading      = document.querySelector('h1');
    // Captured before splitText mutates innerHTML
    const defaultHeadline = "Hi, I'm Luke";
    const workHeadline    = 'Designing <span class="vet-preview-wrap">software for veterinarians at <a href="https://instinct.vet/" target="_blank" rel="noopener" class="vet-link vet-link--logo"><span class="instinct-inline-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 38" fill="none" class="instinct-inline-logo__img instinct-inline-logo__img--light" aria-hidden="true" focusable="false"><path d="M55.3876 27.1048H60.434V9.61596H55.3876V27.1048ZM73.664 18.5356H73.6141L66.4435 9.61632H61.9464V27.1051H66.9672V17.9107H67.0178L74.3887 27.1051H78.6606V9.61632H73.664V18.5356ZM43.4656 11.969C43.4392 11.9558 43.1802 11.8875 43.1436 11.515C42.9631 9.7003 41.3135 6.5088 38.4323 4.89219C36.8531 4.00621 35.103 3.49709 33.2927 3.50005C32.2042 3.50076 31.2272 3.61152 30.5113 3.85865C30.2751 3.94013 30.1607 3.80296 30.1409 3.78755C28.4707 2.51719 25.4487 0.804408 21.2575 0.810318C19.1809 0.812556 17.0472 1.25255 14.9156 2.11659C9.69167 4.23498 7.35915 7.93479 6.32127 10.6678C5.90904 11.7636 5.62444 12.9006 5.47039 14.0587C5.42199 14.4226 5.2122 14.735 4.89094 14.9125C2.97138 15.9709 1.13177 17.4307 0.371857 20.1878C0.354262 20.2517 0.335191 20.3147 0.318313 20.3793C0.298525 20.4497 0.282363 20.5223 0.263292 20.5942C0.0967953 21.2411 -0.000756656 21.9152 4.42053e-06 22.6142C4.42053e-06 22.6604 0.00658551 22.7052 0.00730177 22.7507C0.00586917 22.8057 0.000720683 22.8578 0.000720683 22.9135C0.00954018 29.9272 6.7819 31.4815 9.25817 31.4778C9.38142 31.4778 9.84863 31.4683 10.5968 31.4683C11.0758 31.4683 11.166 31.5467 11.3274 31.6905C12.1328 32.4079 14.7477 35.2076 16.4325 36.6725C17.2423 37.3773 18.4401 37.3685 19.2484 36.663L24.2458 31.7052C24.4203 31.5527 24.644 31.4631 24.8766 31.4654C27.4819 31.4874 30.7431 31.469 33.3565 31.4874C36.9785 31.5138 40.2727 30.7275 43.3416 28.7587C46.7216 26.5912 48.5362 23.7438 48.647 20.4827C48.6572 20.1761 48.658 19.8666 48.6382 19.5526C48.4145 16.07 46.4656 13.5101 43.4656 11.969ZM92.0863 17.4737C91.3117 16.9984 90.2504 16.6031 88.9015 16.2869C87.8848 16.0199 87.1396 15.8087 86.6643 15.6488C86.1912 15.4911 85.8824 15.3459 85.7416 15.2124C85.5985 15.0789 85.5281 14.93 85.5281 14.7627C85.5281 14.4122 85.7027 14.1598 86.0533 13.9999C86.4025 13.8422 86.9526 13.7623 87.7022 13.7623C88.4526 13.7623 89.0973 13.7806 89.6386 13.8128C90.1792 13.8474 90.6421 13.8884 91.0257 13.9383L93.1741 14.1634L93.898 10.3647L92.599 10.0155C91.8003 9.81527 90.9912 9.6627 90.1755 9.55346C89.3592 9.44566 88.5677 9.39131 87.8027 9.39131C86.4024 9.39131 85.1416 9.57907 84.0171 9.95244C82.8934 10.3273 82.0095 10.9155 81.3692 11.7144C80.7266 12.5145 80.4068 13.5547 80.4068 14.8376C80.4068 15.8703 80.5726 16.716 80.9064 17.3739C81.2393 18.0312 81.8093 18.5857 82.6183 19.0354C83.4259 19.485 84.5203 19.9177 85.9029 20.3337C86.8352 20.6175 87.5107 20.8464 87.9274 21.021C88.3433 21.1962 88.6051 21.3546 88.7144 21.4963C88.8223 21.637 88.8758 21.8 88.8758 21.9841C88.8758 22.2665 88.7306 22.4872 88.4393 22.6448C88.1482 22.804 87.6597 22.8825 86.9783 22.8825C86.178 22.8825 85.391 22.8495 84.6164 22.7827C83.8425 22.716 83.1721 22.6413 82.6051 22.5576L80.5572 22.2833L79.757 26.1305L81.2812 26.5552C82.2142 26.8061 83.1296 26.9975 84.0296 27.1295C84.9289 27.2631 85.82 27.3297 86.7032 27.3297C88.102 27.3297 89.368 27.1178 90.5005 26.6931C91.633 26.2676 92.5323 25.6177 93.1983 24.7435C93.8651 23.8691 94.1973 22.7579 94.1973 21.4081C94.1973 20.5427 94.0396 19.7894 93.7235 19.1469C93.4066 18.5065 92.8624 17.9476 92.0863 17.4737ZM152.338 9.59832V14.0205H157.76V27.0871H162.78V14.0205H168.152V9.59832H152.338ZM94.8578 14.0385H100.279V27.1051H105.3V14.0385H110.672V9.61632H94.8578V14.0385ZM149.648 22.3573C148.915 22.4579 148.236 22.5415 147.612 22.6082C146.986 22.6749 146.416 22.708 145.9 22.708C144.951 22.708 144.164 22.5671 143.54 22.2833C142.914 22.0009 142.445 21.538 142.127 20.8962C141.812 20.2552 141.653 19.3934 141.653 18.3099C141.653 17.261 141.824 16.4212 142.166 15.7867C142.506 15.1544 143.006 14.6923 143.664 14.4011C144.322 14.1092 145.117 13.9632 146.05 13.9632C146.65 13.9632 147.245 13.9926 147.837 14.0505C148.427 14.1092 149.056 14.1876 149.723 14.2882L150.347 14.3622L151.197 10.4402L150.972 10.3647C150.172 10.0654 149.331 9.82405 148.449 9.64067C147.566 9.45801 146.675 9.36561 145.775 9.36561C144.476 9.36561 143.265 9.55857 142.14 9.94071C141.016 10.3236 140.029 10.8935 139.18 11.6512C138.33 12.4104 137.667 13.3463 137.193 14.4627C136.718 15.5783 136.481 16.8701 136.481 18.3356C136.481 20.3505 136.869 22.0251 137.643 23.3578C138.417 24.6899 139.487 25.6845 140.853 26.3431C142.218 27.0011 143.793 27.3297 145.575 27.3297C146.475 27.3297 147.404 27.2388 148.362 27.0546C149.318 26.8728 150.223 26.6146 151.073 26.2808L151.497 26.1062L150.722 22.2084L149.648 22.3573ZM130.198 18.5356H130.147L122.977 9.61632H118.479V27.1051H123.5V17.9107H123.551L130.922 27.1051H135.194V9.61632H130.198V18.5356ZM112.029 27.1048H117.075V9.61596H112.029V27.1048Z" fill="currentColor"></path><path d="M32.6438 22.7121C32.4296 22.3769 32.1201 22.1099 31.7497 21.9551L33.7529 14.0392C33.8174 14.0451 33.8798 14.0583 33.9458 14.0583C34.2715 14.0583 34.5737 13.9717 34.8436 13.8309L38.2492 18.5231C37.8869 18.8781 37.6609 19.3718 37.6609 19.9189C37.6609 20.1016 37.694 20.2739 37.7402 20.4412L32.6438 22.7121ZM17.7714 28.4488L11.1986 23.1302C11.3908 22.9307 11.5382 22.6938 11.6321 22.4304L19.1049 23.2783C19.1247 23.8901 19.4247 24.4277 19.8817 24.7732L17.7714 28.4488ZM17.7824 9.96464L22.9558 14.5453C22.7556 14.8519 22.6367 15.2172 22.6367 15.6111C22.6367 15.7688 22.6602 15.9199 22.6954 16.0666L11.3753 20.6356C11.2015 20.3957 10.98 20.1969 10.7203 20.0576L17.7824 9.96464ZM32.0358 12.5128L26.2976 14.6649C25.9631 14.0641 25.3294 13.6534 24.5937 13.6534C24.1155 13.6534 23.6827 13.8324 23.3423 14.1177L18.6626 9.97346L31.9932 12.0867C31.9932 12.0925 31.9918 12.0984 31.9918 12.1042C31.9918 12.2444 32.0079 12.3808 32.0358 12.5128ZM30.9964 21.804C30.6436 21.804 30.3172 21.9045 30.0311 22.0681L26.013 16.9519C26.3446 16.6013 26.5514 16.1312 26.5514 15.6111C26.5514 15.4703 26.5345 15.3338 26.5067 15.2018L32.2455 13.0497C32.4583 13.4304 32.7869 13.7378 33.1925 13.9072L31.1893 21.8231C31.1248 21.8172 31.0624 21.804 30.9964 21.804ZM22.1629 21.6038L24.0531 17.483C24.2255 17.5329 24.4052 17.5681 24.5937 17.5681C24.9465 17.5681 25.2729 17.4676 25.559 17.304L29.5764 22.4201C29.3314 22.6798 29.1524 23.004 29.0783 23.3671L22.9947 23.0326C22.9389 22.4407 22.6279 21.9236 22.1629 21.6038ZM11.7472 21.8649C11.7524 21.7497 11.7516 21.6338 11.7362 21.5157C11.7186 21.3874 11.6878 21.2649 11.6482 21.1468L22.914 16.5998C23.0673 16.8602 23.2741 17.0832 23.5265 17.2483L21.6414 21.358C21.4558 21.2994 21.2614 21.259 21.0561 21.259C20.1516 21.259 19.3991 21.8752 19.1739 22.7077L11.7472 21.8649ZM39.6179 17.962C39.2915 17.962 38.9886 18.0492 38.7179 18.1908L35.3123 13.4986C35.6739 13.1437 35.9005 12.6507 35.9005 12.1042C35.9005 11.0253 35.0255 10.1502 33.9458 10.1502C33.0722 10.1502 32.3409 10.7275 32.0908 11.5189L17.7766 9.2495L17.7318 9.53409L17.4957 9.36903L10.1541 19.861C9.95456 19.8243 9.74771 19.8082 9.53501 19.8368C8.46409 19.9813 7.71226 20.9671 7.85675 22.038C8.00126 23.1096 8.98634 23.8608 10.0572 23.7162C10.3015 23.6832 10.526 23.6025 10.7299 23.4911L17.9335 29.3202L20.3863 25.0483C20.5961 25.1246 20.8191 25.173 21.0561 25.173C22.0022 25.173 22.7922 24.5011 22.9734 23.6084L29.0578 23.9429C29.1502 24.9375 29.9776 25.718 30.9964 25.718C32.0768 25.718 32.9534 24.8422 32.9534 23.761C32.9534 23.5791 32.9204 23.406 32.8742 23.2395L37.9705 20.9678C38.3182 21.5128 38.924 21.8766 39.6179 21.8766C40.6991 21.8766 41.5749 21.0001 41.5749 19.9189C41.5749 18.8385 40.6991 17.962 39.6179 17.962Z" fill="white"></path><path d="M19.7273 7.29592C18.7458 6.51104 17.4356 7.18592 17.3336 8.41683C16.5465 7.81973 15.7741 8.10579 15.3941 8.50705C14.524 9.42478 15.2261 10.6784 16.2391 11.0673C17.0857 11.3922 17.9924 11.6658 18.891 11.8676C19.2189 11.2499 19.4786 10.7393 19.6957 10.3579C20.7022 8.58921 20.1095 7.6011 19.7273 7.29592Z" fill="#FABB00"></path></svg><img src="/src/img/instinct-icon-dark.svg" alt="" class="instinct-inline-logo__img instinct-inline-logo__img--dark" decoding="async" aria-hidden="true" /></span></a><span class="vet-preview" aria-hidden="true"><img src="/src/img/instinct-site-preview.png" alt="" decoding="async" loading="eager" width="800" height="520" /></span></span>';
    const descEl          = document.querySelector('.description');
    const defaultDesc     = descEl.innerHTML;
    const workDesc        = `I think in systems, design in details, and am always chasing the pattern that makes something complicated feel completely obvious.`;
    let currentMode    = 'life';

    const modeTabInset = 6; /* keep in sync with #modeTab padding in styles.css */

    function positionTabPill(btn) {
      tabPill.style.width  = btn.offsetWidth + 'px';
      tabPill.style.transform = `translateX(${btn.offsetLeft - modeTabInset}px)`;
    }

    // Init pill on the active tab
    requestAnimationFrame(() => positionTabPill(modeTab.querySelector('.tab-opt.active')));

    // ── Bookshelf ──
    const bookshelfView  = document.getElementById('bookshelfView');
    const gearView       = document.getElementById('gearView');
    const appStackView   = document.getElementById('appStackView');
    const placesView     = document.getElementById('placesView');
    const chatView       = document.getElementById('chatView');
    const chatInputBar   = document.getElementById('chatInputBar');
    const introEl = document.querySelector('.intro');

    const BOOKS = [
      // ── Most recently read first ──
      {
        title: 'Phoebe Berman\'s Gonna Lose It', author: 'Brooke Averick', series: null,
        desc: 'A neurotic twenty-something\'s very modern quest to finally have sex leads her somewhere she never expected — a hilarious and heartfelt debut about love, anxiety, and knowing yourself.',
        rating: 0, bg: '#180410', c2: '#c83880', c3: '#3a0820', fg: '#d04888',
        lbg: '#f8e5ef', lc2: '#b82070', lc3: '#f0b0d0', lfg: '#680a38',
        amazon: 'https://www.amazon.com/dp/B0FNVHR7CL',
      },
      {
        title: 'Heir to the Empire', author: 'Timothy Zahn', series: 'Thrawn Trilogy · I',
        desc: 'Five years after Endor, Grand Admiral Thrawn emerges from the Unknown Regions with a plan to restore the Empire — the novel that reignited the entire Star Wars Expanded Universe.',
        rating: 0, bg: '#040c10', c2: '#1898a0', c3: '#0a2030', fg: '#28a8b0',
        lbg: '#ddf0f2', lc2: '#0a8898', lc3: '#a8e0e8', lfg: '#065068',
        amazon: 'https://www.amazon.com/dp/0553296124',
      },
      {
        title: 'Dark Force Rising', author: 'Timothy Zahn', series: 'Thrawn Trilogy · II',
        desc: 'Thrawn\'s campaign intensifies as Luke discovers a hidden fleet of warships from the Clone Wars — with Mara Jade closing in on her mission and the New Republic stretched to its limits.',
        rating: 0, bg: '#060810', c2: '#405890', c3: '#0e1428', fg: '#5068a0',
        lbg: '#e4e8f2', lc2: '#304880', lc3: '#b8c4e0', lfg: '#162050',
        amazon: 'https://www.amazon.com/dp/0553560719',
      },
      {
        title: 'Ready Player One', author: 'Ernest Cline', series: null,
        desc: 'In a dystopian 2045, an obsessed teenager hunts for a billionaire\'s Easter egg hidden inside a vast virtual universe — the ultimate tribute to eighties pop culture and geek mythology.',
        rating: 0, bg: '#020810', c2: '#00c0e8', c3: '#041830', fg: '#10d0f0',
        lbg: '#ddf6ff', lc2: '#0098c0', lc3: '#a0e4f8', lfg: '#004870',
        amazon: 'https://www.amazon.com/dp/0307887448',
      },
      {
        title: 'Ready Player Two', author: 'Ernest Cline', series: null,
        desc: 'After claiming Halliday\'s fortune and control of the OASIS, Wade discovers a new set of hidden challenges — but the stakes are now real-world survival, not just a game.',
        rating: 0, bg: '#070415', c2: '#b018e8', c3: '#120828', fg: '#c028f8',
        lbg: '#f5e8ff', lc2: '#9000d0', lc3: '#e0b0ff', lfg: '#4a0070',
        amazon: 'https://www.amazon.com/dp/1524761338',
      },
      {
        title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', series: null,
        desc: 'Two childhood friends reunite to make video games together over three decades — a sweeping novel about love, ambition, creativity, and the complicated ways we shape each other\'s lives.',
        rating: 0, bg: '#0c0618', c2: '#a840d0', c3: '#180c2c', fg: '#b850e0',
        lbg: '#f2e8ff', lc2: '#8828c0', lc3: '#d8b8f8', lfg: '#3c1078',
        amazon: 'https://www.amazon.com/dp/0593321200',
      },
      {
        title: 'Tress of the Emerald Sea', author: 'Brandon Sanderson', series: null,
        desc: 'To rescue the man she loves from a deadly pirate captain, Tress sets sail on a spore-covered sea that turns to glass at a single drop of water — a fairytale adventure from the Cosmere.',
        rating: 0, bg: '#030e0a', c2: '#08ac78', c3: '#082018', fg: '#18bc88',
        lbg: '#ddf5ee', lc2: '#08906a', lc3: '#a8e8d4', lfg: '#055040',
        amazon: 'https://www.amazon.com/dp/1250899656',
      },
      {
        title: 'The Midnight Library', author: 'Matt Haig', series: null,
        desc: 'Nora Seed finds a library between life and death where every book holds an alternative version of her life — a beautiful meditation on regret, possibility, and what makes a life worth living.',
        rating: 0, bg: '#050418', c2: '#5850d8', c3: '#0c0830', fg: '#6860e8',
        lbg: '#ece8ff', lc2: '#4038c8', lc3: '#c8c0f0', lfg: '#1a1080',
        amazon: 'https://www.amazon.com/dp/0525559477',
      },
      {
        title: 'Six of Crows', author: 'Leigh Bardugo', series: 'Six of Crows · I',
        desc: 'A criminal prodigy assembles a crew of dangerous misfits for an impossible heist at the most heavily guarded location in the world — dark, witty, and utterly gripping fantasy.',
        rating: 0, bg: '#080604', c2: '#d09820', c3: '#160e04', fg: '#e0a830',
        lbg: '#f8f2e0', lc2: '#b88010', lc3: '#f0d8a0', lfg: '#604010',
        amazon: 'https://www.amazon.com/dp/125007696X',
      },
      {
        title: 'Crooked Kingdom', author: 'Leigh Bardugo', series: 'Six of Crows · II',
        desc: 'Kaz Brekker and his crew have been betrayed and left with nothing — now they must stage a deadly comeback against the most powerful criminals in Ketterdam in the thrilling conclusion.',
        rating: 0, bg: '#0c0402', c2: '#c05818', c3: '#200804', fg: '#d06828',
        lbg: '#f8ece0', lc2: '#a04810', lc3: '#f0c8a8', lfg: '#582008',
        amazon: 'https://www.amazon.com/dp/1627792139',
      },
      {
        title: 'Dark Matter', author: 'Blake Crouch', series: null,
        desc: 'A physicist wakes up in a life that isn\'t his — same face, different family, different career — and must navigate a mind-bending multiverse of alternate choices to find his way home.',
        rating: 0, bg: '#060408', c2: '#7820b8', c3: '#100808', fg: '#8830c8',
        lbg: '#f2e8f8', lc2: '#6010a0', lc3: '#d8b0f0', lfg: '#3a0868',
        amazon: 'https://www.amazon.com/dp/1524763241',
      },
      {
        title: 'Artemis', author: 'Andy Weir', series: null,
        desc: 'Jazz Bashara lives on the first city on the moon, scraping by as a smuggler — until a seemingly simple heist pulls her into a conspiracy that threatens all of Artemis.',
        rating: 3, bg: '#070d1c', c2: '#d4c8a8', c3: '#2a3a5c', fg: '#d4c8a8',
        lbg: '#e8edf5', lc2: '#8a9cb8', lc3: '#c8d4e8', lfg: '#2a3a5c',
        amazon: 'https://www.amazon.com/dp/0553448145',
      },
      {
        title: 'Ruthless Vows', author: 'Rebecca Ross', series: 'Letters of Enchantment · II',
        desc: 'The stunning conclusion to the Letters of Enchantment duology — as war and ancient magic collide, Roman and Iris must choose between duty and each other.',
        rating: 4, bg: '#140820', c2: '#c8921e', c3: '#4a1850', fg: '#c8921e',
        lbg: '#f5eedf', lc2: '#c8821e', lc3: '#d4c0e8', lfg: '#6a3010',
        amazon: 'https://www.amazon.com/dp/1250883180',
      },
      {
        title: 'Divine Rivals', author: 'Rebecca Ross', series: 'Letters of Enchantment · I',
        desc: 'Two rival journalists at a war-torn newspaper discover each other\'s secret letters — a dark fantasy romance where gods walk among soldiers and love is written in ink.',
        rating: 0, bg: '#1a0c06', c2: '#c88020', c3: '#5a2010', fg: '#c88020',
        lbg: '#f8f0e0', lc2: '#c87020', lc3: '#f0d8b8', lfg: '#6a3010',
        amazon: 'https://www.amazon.com/dp/1250883164',
      },
      {
        title: 'Atomic Habits', author: 'James Clear', series: null,
        desc: 'Tiny changes, remarkable results — a proven system for building good habits and breaking bad ones through small improvements that compound relentlessly over time.',
        rating: 4, bg: '#0c0c0c', c2: '#f0b000', c3: '#d07000', fg: '#f0c000',
        lbg: '#fff8e0', lc2: '#f0a000', lc3: '#f8d870', lfg: '#7a5000',
        amazon: 'https://www.amazon.com/dp/0735211299',
      },
      {
        title: 'Project Hail Mary', author: 'Andy Weir', series: null,
        desc: 'A lone astronaut wakes up deep in space with no memory — his mission may be humanity\'s last hope, and his only ally is an alien from a completely different world.',
        rating: 5, bg: '#020810', c2: '#20d0c0', c3: '#0a3050', fg: '#30c0b0',
        lbg: '#e0f5f3', lc2: '#20a0a0', lc3: '#b0e0e0', lfg: '#0a5858',
        amazon: 'https://www.amazon.com/dp/0593135202',
      },
      {
        title: 'The Hero of Ages', author: 'Brandon Sanderson', series: 'Mistborn · III',
        desc: 'The ultimate fate of the Final Empire is decided as ash swallows the sky and mists devour the land — the gripping conclusion to the original Mistborn trilogy.',
        rating: 3, bg: '#060810', c2: '#9ab8cc', c3: '#1a2840', fg: '#8ab8cc',
        lbg: '#e8eff5', lc2: '#6090b0', lc3: '#c0d8e8', lfg: '#1a4870',
        amazon: 'https://www.amazon.com/dp/0765356147',
      },
      {
        title: 'The Well of Ascension', author: 'Brandon Sanderson', series: 'Mistborn · II',
        desc: 'With the Lord Ruler defeated, Vin and Elend struggle to hold a crumbling kingdom together while prophecy, politics, and an ancient secret close in from all sides.',
        rating: 4, bg: '#040810', c2: '#7aaccc', c3: '#182038', fg: '#80b0cc',
        lbg: '#e5ecf3', lc2: '#5088b0', lc3: '#b8cce0', lfg: '#1a4870',
        amazon: 'https://www.amazon.com/dp/0765356139',
      },
      {
        title: 'Mistborn: The Final Empire', author: 'Brandon Sanderson', series: 'Mistborn · I',
        desc: 'In an empire where ash falls from the sky and a dark Lord Ruler reigns eternal, a crew of thieves plans the ultimate heist — to steal an entire empire.',
        rating: 0, bg: '#040608', c2: '#6a9ab8', c3: '#0e1828', fg: '#80b0c8',
        lbg: '#e0eaf2', lc2: '#4888b0', lc3: '#b0c8e0', lfg: '#1a4068',
        amazon: 'https://www.amazon.com/dp/0765350386',
      },
      {
        title: 'Iron Flame', author: 'Rebecca Yarros', series: 'The Empyrean · II',
        desc: 'Violet Sorrengail returns to Basgiath War College for another brutal year — but the secrets buried in its walls run deeper than any dragon\'s fire.',
        rating: 0, bg: '#0a0408', c2: '#b87020', c3: '#3a1008', fg: '#a07888',
        lbg: '#f0e8e5', lc2: '#a06018', lc3: '#f0d0c0', lfg: '#5a2838',
        amazon: 'https://www.amazon.com/dp/1649374528',
      },
      {
        title: 'Show Your Work!', author: 'Austin Kleon', series: null,
        desc: 'Ten ways to share your creativity without selling out — a manifesto for getting discovered by doing the work you love and sharing the process openly.',
        rating: 0, bg: '#0e0e0e', c2: '#e0e0e0', c3: '#3a3a3a', fg: '#e8e8e8',
        lbg: '#f5f5f5', lc2: '#888888', lc3: '#d8d8d8', lfg: '#181818',
        amazon: 'https://www.amazon.com/dp/076116093X',
      },
      {
        title: 'Steal Like an Artist', author: 'Austin Kleon', series: null,
        desc: 'Nothing is truly original — the best creative work builds on what came before. An inspiring manifesto about influence, theft, and finding your own voice.',
        rating: 4, bg: '#141414', c2: '#d0d0d0', c3: '#404040', fg: '#d8d8d8',
        lbg: '#ebebeb', lc2: '#909090', lc3: '#d5d5d5', lfg: '#1a1a1a',
        amazon: 'https://www.amazon.com/dp/0761169253',
      },
      {
        title: 'The Ride of a Lifetime', author: 'Robert Iger', series: null,
        desc: 'Leadership lessons from twenty years transforming Disney — how optimism, decisiveness, and creative courage can reshape an iconic company and an entire industry.',
        rating: 4, bg: '#0c1230', c2: '#c0a830', c3: '#1a2a60', fg: '#9098c8',
        lbg: '#eaecf8', lc2: '#c09020', lc3: '#d0d8f5', lfg: '#1a2878',
        amazon: 'https://www.amazon.com/dp/0399592091',
      },
      {
        title: 'Rogue Protocol', author: 'Martha Wells', series: 'Murderbot Diaries · III',
        desc: 'Murderbot pursues a new lead on the company trying to destroy it — going undercover, reluctant as ever, and still just trying to watch its shows in peace.',
        rating: 3, bg: '#060e18', c2: '#208898', c3: '#0a2838', fg: '#30a8c8',
        lbg: '#e0f0f5', lc2: '#207888', lc3: '#b0d8e8', lfg: '#0a5068',
        amazon: 'https://www.amazon.com/dp/1250191700',
      },
      {
        title: 'The Speed of Trust', author: 'Stephen M.R. Covey', series: null,
        desc: 'Trust is not a soft skill — it\'s a hard economic driver. High-trust organizations move faster, spend less, and outperform low-trust ones in every measurable way.',
        rating: 4, bg: '#080f28', c2: '#4888c8', c3: '#0a2050', fg: '#508ac8',
        lbg: '#e8f0f8', lc2: '#3060b8', lc3: '#c0d8f0', lfg: '#0a2868',
        amazon: 'https://www.amazon.com/dp/1982141066',
      },
      {
        title: 'Fourth Wing', author: 'Rebecca Yarros', series: 'The Empyrean · I',
        desc: 'Violet Sorrengail is forced into the most brutal division of war college — Riders Quadrant — where dragons choose their riders or let them die trying.',
        rating: 4, bg: '#100408', c2: '#9a1818', c3: '#2a0a18', fg: '#a82020',
        lbg: '#f8e8e5', lc2: '#a81818', lc3: '#f0c8c0', lfg: '#6a1010',
        amazon: 'https://www.amazon.com/dp/1649374178',
      },
      {
        title: "Harry Potter and the Philosopher's Stone", author: 'J.K. Rowling', series: 'Harry Potter · I',
        desc: 'An orphaned boy discovers he\'s the son of two powerful wizards and is famous in a world he never knew existed — an invitation to Hogwarts changes everything.',
        rating: 0, bg: '#200608', c2: '#d4980a', c3: '#102828', fg: '#c89028',
        lbg: '#f8f0e0', lc2: '#c08010', lc3: '#e8f0d8', lfg: '#6a3808',
        amazon: 'https://www.amazon.com/dp/059035342X',
      },
      {
        title: "Harry Potter and the Chamber of Secrets", author: 'J.K. Rowling', series: 'Harry Potter · II',
        desc: 'A hidden chamber beneath Hogwarts has been opened and something is petrifying students — Harry, Ron, and Hermione must uncover the monster before the school is closed forever.',
        rating: 0, bg: '#030a04', c2: '#2a9830', c3: '#081808', fg: '#3aaa40',
        lbg: '#e2f5e4', lc2: '#188020', lc3: '#b0e8b8', lfg: '#0c4010',
        amazon: 'https://www.amazon.com/dp/0439064872',
      },
      {
        title: "Harry Potter and the Prisoner of Azkaban", author: 'J.K. Rowling', series: 'Harry Potter · III',
        desc: 'A dangerous prisoner has escaped from Azkaban and seems to be hunting Harry — but Sirius Black\'s true connection to Harry\'s past holds a secret that will change everything.',
        rating: 0, bg: '#060a12', c2: '#6070a8', c3: '#101828', fg: '#7080b8',
        lbg: '#e8eaf5', lc2: '#4058a0', lc3: '#c0c8ec', lfg: '#1a3070',
        amazon: 'https://www.amazon.com/dp/0439136369',
      },
      {
        title: "Harry Potter and the Goblet of Fire", author: 'J.K. Rowling', series: 'Harry Potter · IV',
        desc: 'Harry is mysteriously entered into a deadly magical tournament between three schools — but the real danger has nothing to do with the competition and everything to do with Voldemort\'s return.',
        rating: 0, bg: '#140600', c2: '#e07010', c3: '#301400', fg: '#f08020',
        lbg: '#fef0e0', lc2: '#c86000', lc3: '#f8d0a0', lfg: '#702800',
        amazon: 'https://www.amazon.com/dp/0439139600',
      },
      {
        title: "Harry Potter and the Order of the Phoenix", author: 'J.K. Rowling', series: 'Harry Potter · V',
        desc: 'The wizarding world refuses to believe Voldemort has returned — Harry must form a secret student army while battling a prophecy that places him at the center of the coming war.',
        rating: 0, bg: '#060810', c2: '#4860b0', c3: '#0e1428', fg: '#5870c0',
        lbg: '#e5eaf5', lc2: '#2848a0', lc3: '#b8c8ec', lfg: '#0c1878',
        amazon: 'https://www.amazon.com/dp/0439358078',
      },
      {
        title: "Harry Potter and the Half-Blood Prince", author: 'J.K. Rowling', series: 'Harry Potter · VI',
        desc: 'Dumbledore takes Harry on a private mission to discover Voldemort\'s greatest secret — and Harry inherits a mysterious annotated potions textbook that changes his sixth year completely.',
        rating: 0, bg: '#0c0800', c2: '#b07020', c3: '#201400', fg: '#c08030',
        lbg: '#f5f0e0', lc2: '#9c6010', lc3: '#e8d8a8', lfg: '#5a3008',
        amazon: 'https://www.amazon.com/dp/0439784549',
      },
      {
        title: "Harry Potter and the Deathly Hallows", author: 'J.K. Rowling', series: 'Harry Potter · VII',
        desc: 'Harry, Ron, and Hermione abandon Hogwarts to hunt down and destroy Voldemort\'s Horcruxes — a final hunt that leads back to the school and the greatest battle the wizarding world has ever seen.',
        rating: 0, bg: '#060608', c2: '#9890a0', c3: '#101018', fg: '#a8a0b0',
        lbg: '#f0eff2', lc2: '#686080', lc3: '#d8d4e0', lfg: '#282038',
        amazon: 'https://www.amazon.com/dp/0545010225',
      },
      {
        title: 'Artificial Condition', author: 'Martha Wells', series: 'Murderbot Diaries · II',
        desc: 'Murderbot hitches a ride on a research A.I. to investigate a massacre in its past — a past it only partially remembers and suspects it caused.',
        rating: 4, bg: '#040e12', c2: '#18a898', c3: '#083030', fg: '#20a898',
        lbg: '#e0f5f2', lc2: '#189080', lc3: '#b0e8e0', lfg: '#0a5850',
        amazon: 'https://www.amazon.com/dp/1250186927',
      },
      {
        title: 'All Systems Red', author: 'Martha Wells', series: 'Murderbot Diaries · I',
        desc: 'A part-human, part-robot security unit has secretly hacked its own governor module — now it just wants to watch TV shows and avoid talking to the humans it keeps saving.',
        rating: 4, bg: '#060c16', c2: '#2888b0', c3: '#0a2040', fg: '#3090b8',
        lbg: '#e0ecf5', lc2: '#1868a0', lc3: '#b8d4e8', lfg: '#0a4070',
        amazon: 'https://www.amazon.com/dp/1250185440',
      },
      {
        title: 'Recursion', author: 'Blake Crouch', series: null,
        desc: 'A neuroscientist\'s memory-preservation technology seems to give people back their lost loved ones — until it begins rewriting reality and trapping the world in recursive timelines.',
        rating: 5, bg: '#030814', c2: '#3870d0', c3: '#0a1840', fg: '#4880d8',
        lbg: '#e5ecf8', lc2: '#2858c0', lc3: '#c0d0f0', lfg: '#102868',
        amazon: 'https://www.amazon.com/dp/1984820613',
      },
      {
        title: 'Creativity, Inc.', author: 'Ed Catmull', series: null,
        desc: 'The inside story of how Pixar built a culture of creative excellence — a blueprint for leading teams through fear, failure, and the relentless pursuit of originality.',
        rating: 5, bg: '#1a0828', c2: '#d870f8', c3: '#4a0870', fg: '#d880f8',
        lbg: '#f8e8ff', lc2: '#b040e0', lc3: '#e8c8f8', lfg: '#5a1080',
        amazon: 'https://www.amazon.com/dp/0812998960',
      },
      {
        title: 'The Chalice of the Gods', author: 'Rick Riordan', series: 'Percy Jackson: Senior Year · I',
        desc: 'Percy Jackson needs three impossible letters of recommendation from the gods to get into college — and of course each one requires a perilous new quest.',
        rating: 3, bg: '#061820', c2: '#20a0c0', c3: '#0a3848', fg: '#28a8c0',
        lbg: '#e0f0f8', lc2: '#1880a0', lc3: '#b0d8e8', lfg: '#0a5070',
        amazon: 'https://www.amazon.com/dp/1368078796',
      },
      {
        title: 'The Last Olympian', author: 'Rick Riordan', series: 'Percy Jackson · V',
        desc: 'The ultimate battle for Olympus has arrived — Percy leads his friends to defend New York City as the Titan lord Kronos and his army launch their final assault.',
        rating: 4, bg: '#0a0c08', c2: '#d0b818', c3: '#2a2808', fg: '#c8b020',
        lbg: '#f5f2d5', lc2: '#c0a010', lc3: '#e8e0b0', lfg: '#6a5808',
        amazon: 'https://www.amazon.com/dp/1423101480',
      },
      {
        title: 'The Battle of the Labyrinth', author: 'Rick Riordan', series: 'Percy Jackson · IV',
        desc: 'Percy and his friends must navigate Daedalus\'s infinite labyrinth before Luke\'s army can use it to invade the last safe haven for half-bloods.',
        rating: 4, bg: '#160e04', c2: '#c87820', c3: '#3a2008', fg: '#c07828',
        lbg: '#f8edd8', lc2: '#c06818', lc3: '#f0d8b0', lfg: '#5a3008',
        amazon: 'https://www.amazon.com/dp/1423101472',
      },
      {
        title: 'Feel-Good Productivity', author: 'Ali Abdaal', series: null,
        desc: 'Forget hustle culture — discover how joy, play, and positive energy make you not just happier but genuinely more productive, creative, and effective.',
        rating: 4, bg: '#061808', c2: '#28c060', c3: '#0a3818', fg: '#30c068',
        lbg: '#e5f5ec', lc2: '#1a9840', lc3: '#b8e8cc', lfg: '#0a5028',
        amazon: 'https://www.amazon.com/dp/0063349336',
      },
      {
        title: "The Titan's Curse", author: 'Rick Riordan', series: 'Percy Jackson · III',
        desc: 'Percy must rescue Annabeth and the goddess Artemis with the help of the Hunters — but an ancient monster and a chilling prophecy stand in the way.',
        rating: 4, bg: '#0e0618', c2: '#8848c8', c3: '#240a48', fg: '#8848c8',
        lbg: '#f0e8fc', lc2: '#6830b0', lc3: '#dcc0f0', lfg: '#3a0a90',
        amazon: 'https://www.amazon.com/dp/1423101456',
      },
      {
        title: 'The Sea of Monsters', author: 'Rick Riordan', series: 'Percy Jackson · II',
        desc: 'Percy races to the Sea of Monsters — the Bermuda Triangle — to rescue his best friend Grover from the cyclops Polyphemus and restore the magical borders of Camp Half-Blood.',
        rating: 3, bg: '#060c18', c2: '#1080b0', c3: '#082838', fg: '#1890c0',
        lbg: '#ddf0f8', lc2: '#1070a0', lc3: '#b0d8e8', lfg: '#0a4870',
        amazon: 'https://www.amazon.com/dp/1423103349',
      },
      {
        title: 'Building a Second Brain', author: 'Tiago Forte', series: null,
        desc: 'A method for externalizing your thinking and organizing information so your past learning is available whenever you need it — a trusted system that never forgets.',
        rating: 5, bg: '#100620', c2: '#9840e0', c3: '#2e0860', fg: '#8840d8',
        lbg: '#f0e8ff', lc2: '#7820c8', lc3: '#d8b8f8', lfg: '#4808a0',
        amazon: 'https://www.amazon.com/dp/1982167386',
      },
      {
        title: 'The Lightning Thief', author: 'Rick Riordan', series: 'Percy Jackson · I',
        desc: 'A troubled twelve-year-old discovers he\'s the son of a Greek god, is accused of stealing Zeus\'s master lightning bolt, and must journey across America to prevent an Olympian war.',
        rating: 4, bg: '#060c20', c2: '#4878e0', c3: '#0a1840', fg: '#5088e8',
        lbg: '#e8eef8', lc2: '#3060d0', lc3: '#c0d0f0', lfg: '#0a2888',
        amazon: 'https://www.amazon.com/dp/0786838655',
      },
    ];

    function hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const COVER_GLOW_POS = [
      ['80% 20%', '20% 75%'], ['15% 20%', '85% 80%'],
      ['75% 15%', '25% 80%'], ['90% 40%', '15% 65%'],
      ['50% 10%', '55% 90%'], ['25% 25%', '75% 75%'],
    ];
    function coverGradient(book, idx, mode) {
      const [p1, p2] = COVER_GLOW_POS[idx % COVER_GLOW_POS.length];
      const bg = mode === 'light' ? book.lbg : book.bg;
      const c2 = mode === 'light' ? book.lc2 : book.c2;
      const c3 = mode === 'light' ? book.lc3 : book.c3;
      return [
        `radial-gradient(ellipse at ${p1}, ${hexToRgba(c2, 0.38)} 0%, transparent 58%)`,
        `radial-gradient(ellipse at ${p2}, ${hexToRgba(c3, 0.22)} 0%, transparent 55%)`,
        bg
      ].join(', ');
    }
    function buildCoverHTML(book) {
      return `
        <div class="book-cover-author">${book.author}</div>
        <div class="book-cover-title-wrap">
          <div class="book-cover-title">${book.title}</div>
        </div>
        <div class="book-cover-series">${book.series || ''}</div>
      `;
    }

    function starsHTML(rating) {
      return Array.from({ length: 5 }, (_, i) => {
        const filled = i < rating;
        return `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:${filled ? '#f59e0b' : 'var(--text-muted)'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      }).join('');
    }

    let bookshelfRendered = false;
    function renderBookshelf() {
      if (bookshelfRendered) return;
      bookshelfRendered = true;
      ensureGardenSlugSet();
      const grid = document.createElement('div');
      grid.className = 'bookshelf-grid';
      BOOKS.forEach((book, i) => {
        const btn = document.createElement('button');
        btn.className = 'book-card';
        btn.dataset.bookIdx = i;
        const cover = document.createElement('div');
        cover.className = 'book-cover';
        cover.style.setProperty('--book-bg-dark', coverGradient(book, i, 'dark'));
        cover.style.setProperty('--book-bg-light', coverGradient(book, i, 'light'));
        cover.style.setProperty('--ba-dark', book.fg);
        cover.style.setProperty('--ba-light', book.lfg);
        cover.innerHTML = buildCoverHTML(book);
        btn.appendChild(cover);
        btn.addEventListener('click', () => openBookModal(i));
        grid.appendChild(btn);
      });
      bookshelfView.appendChild(grid);
    }

    // ── Gear ──
    const GEAR = [
      // Prefer model-specific vendor/retailer images over generic product silhouettes.
      { name: 'BenQ MA270S',           detail: '27" 5K Monitor',            img: 'https://image.benq.com/is/image/benqco/ma270s-thumbnail-right45?$ResponsivePreset$' },
      { name: 'MacBook Pro 14"',       detail: 'M3 Pro · Space Black',      img: '/images/gear-macbook-pro-14.png' },
      { name: 'Fujifilm X-S20',        detail: 'Mirrorless Camera',         img: 'https://fujifilm-x.b-cdn.net/wp-content/uploads/2023/05/dwga_x-s20_thum.jpg?resize=150,150&width=150&height=150' },
      { name: 'XF 18–55mm f/2.8–4',    detail: 'Fujifilm Lens',             img: '/images/gear-xf-18-55mm.png' },
      { name: 'XF 70–300mm f/4.5–5.6', detail: 'Fujifilm Lens',             img: 'https://fujifilm-x.b-cdn.net/wp-content/uploads/2021/01/xf70-300mmf45-56-r-lm-ois-wr_anim_11.png?width=1000&height=563' },
      { name: 'Shure MV7',             detail: 'USB Microphone',            img: '/images/gear-shure-mv7.png' },
      { name: 'Bose QC Ultra',         detail: 'Headphones · Lunar Blue',   img: 'https://www.worldwidestereo.com/cdn/shop/files/1_0df5c049-5361-4790-bd0e-5f5400a3351b.jpg?v=1742307135' },
      { name: 'MX Master 4',           detail: 'Wireless Mouse',            img: 'https://resource.logitech.com/c_fill,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/mice/mx-master-4/gallery/mx-master-4-graphite-front-3qtr-angle-gallery-10.png' },
      { name: 'iPad mini',             detail: '7th Gen · Space Gray',      img: 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/ipad-mini-select-wifi-spacegray-202410?wid=940&hei=1112&fmt=png-alpha&.v=NmJhVkxMSzd4RmRrSjJwN2s4VWJVKzlBaHA1THNMUXlDa1dRMU1wTGcxYlRKc3dEODNneTBSZFNTOGZoVVpTaURPUU9BWmJWRXFZMEJicERYSS9tMXZ3UU5uUUpBVE5PT3lEMWJHa3h5c29tYUg4SmtKcW5xSGI3YTdpRVdNejg' },
      { name: 'iPhone 17 Pro',         detail: 'Silver',                    img: '/images/gear-iphone-17-pro-silver.png' },
      { name: 'Apple Watch Series 11', detail: '42mm · Silver',              img: 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/watch-case-42-aluminum-silver-nc-s11_VW_PF?wid=752&hei=752&fmt=png-alpha&qlt=90' },
      { name: 'Oura Ring 4',           detail: 'Silver',                    img: '/images/gear-oura-ring-4-silver.png' },
      { name: 'Kindle Paperwhite',     detail: 'E-Reader',                  img: 'https://target.scene7.com/is/image/Target/GUEST_8608ea59-7cd0-4700-9575-7624d4dc5a89?wid=1200&hei=1200&qlt=80' },
      { name: 'Sonos Beam',            detail: 'Gen 2 · Soundbar',          img: 'https://media.sonos.com/images/znqtjj88/production/c79156fe93547d1b0a993dc1fb7b381d8773737a-3000x1834.png?q=75&fit=clip&auto=format' },
      { name: 'Dreame H12 Pro',        detail: 'Wet & Dry Vacuum',          img: 'https://global.dreametech.com/cdn/shop/products/20220815140236_6fe97919-7f6d-4448-b2d8-855328f93a99_600x.png?v=1663898275' },
      { name: 'Philips Wake-Up Light', detail: 'HF3670/1',                  img: 'https://images.philips.com/is/image/philipsconsumer/20c2088667884c1a9881adb801170b95?$pnglarge$&wid=960' },
    ];

    let gearRendered = false;
    function renderGear() {
      if (gearRendered) return;
      gearRendered = true;
      const grid = document.createElement('div');
      grid.className = 'gear-grid';
      GEAR.forEach(item => {
        const card = document.createElement('div');
        card.className = 'gear-card' + (item.darkBg ? ' gear-card--dark-bg' : '');
        const img = document.createElement('img');
        img.className = 'gear-img';
        img.alt = item.name;
        img.loading = 'lazy';
        img.src = item.img;
        img.onerror = () => { img.style.display = 'none'; };
        const name = document.createElement('div');
        name.className = 'gear-name';
        name.textContent = item.name;
        const detail = document.createElement('div');
        detail.className = 'gear-detail';
        detail.textContent = item.detail;
        card.append(img, name, detail);
        grid.appendChild(card);
      });
      gearView.appendChild(grid);
    }

    // ── App Stack ──
    const APP_STACK = [
      { name: 'Cursor',        detail: 'AI Code Editor',          img: '/images/app-stack-cursor.png',                                                                                                                                   url: 'https://cursor.com' },
      { name: 'CleanShot X',   detail: 'Screenshot & Recording',  img: '/images/app-stack-cleanshotx.png',                                                                                                                               url: 'https://cleanshot.com' },
      { name: 'Raycast',       detail: 'Launcher & Productivity', img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/85/69/31/8569314a-3114-1691-d952-7b950c41a9ca/AppIcon-Release-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', url: 'https://raycast.com' },
      { name: 'MyMind',        detail: 'Visual Bookmarking',      img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2e/57/10/2e571035-f756-32fb-d29d-52f9f40f84be/AppIcon-Release-1x_U007epad-0-1-sRGB-85-220-0.png/512x512bb.jpg',     url: 'https://mymind.com' },
      { name: 'Bear',          detail: 'Notes & Writing',         img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/7a/25/bb/7a25bb6c-49d8-e236-86e5-ccad3a5bf8c2/AppIcon-26-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-85-220.png/512x512bb.jpg', url: 'https://bear.app' },
      { name: 'Things 3',      detail: 'Task Manager',            img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/d0/1e/fe/d01efe6f-a09d-713e-0b02-b75c2865c215/AppIcon-0-0-1x_U007ephone-0-0-0-1-0-0-85-220.png/512x512bb.jpg',      url: 'https://culturedcode.com/things' },
      { name: 'Claude',        detail: 'AI Assistant',            img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/82/9a/02/829a027f-3afc-0b36-a50a-d58dfc38d49b/AppIcon-0-0-1x_U007epad-0-1-85-220.png/512x512bb.jpg',                  url: 'https://claude.ai' },
      { name: 'Apple Journal', detail: 'Daily Journaling',        img: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/dc/8d/af/dc8daf9c-9da1-03f3-c341-c6c3eccd817e/journal-0-0-1x_U007epad-0-1-sRGB-85-220.png/512x512bb.jpg',             url: 'https://apps.apple.com/app/id6447391597' },
    ];

    let appStackRendered = false;
    function renderAppStack() {
      if (appStackRendered) return;
      appStackRendered = true;
      const grid = document.createElement('div');
      grid.className = 'app-stack-grid';
      APP_STACK.forEach(item => {
        const card = document.createElement('a');
        card.className = 'app-stack-card';
        card.href = item.url;
        card.target = '_blank';
        card.rel = 'noopener';
        const img = document.createElement('img');
        img.className = 'app-stack-img';
        img.alt = item.name;
        img.loading = 'lazy';
        img.src = item.img;
        img.onerror = () => { img.style.display = 'none'; };
        const name = document.createElement('div');
        name.className = 'gear-name';
        name.textContent = item.name;
        const detail = document.createElement('div');
        detail.className = 'gear-detail';
        detail.textContent = item.detail;
        card.append(img, name, detail);
        grid.appendChild(card);
      });
      appStackView.appendChild(grid);
    }

    // ── Places (Mapbox) ──
    let placesMapInstance = null;
    let placesRendered    = false;
    let placesGeojson     = null;
    let placesMarkers     = [];
    // Mapbox style URLs. Defaults use Mapbox's built-in minimal styles (free).
    // Replace with your own Mapbox Studio style URLs for full custom basemap control:
    //   mapbox://styles/YOUR_USERNAME/YOUR_STYLE_ID
    const MAPBOX_STYLE_DARK  = 'mapbox://styles/mapbox/dark-v11';
    const MAPBOX_STYLE_LIGHT = 'mapbox://styles/mapbox/light-v11';

    function placesCurrentStyle() {
      return isDarkTheme() ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT;
    }

    function placesAddLayers(map) {
      if (!placesGeojson) return;

      // Clean up any legacy DOM markers
      placesMarkers.forEach(m => m.remove());
      placesMarkers = [];

      // Remove existing cluster layers/source if present (e.g. after a style reload)
      ['unclustered-point', 'cluster-count', 'clusters'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource('places-source')) map.removeSource('places-source');

      const dark          = isDarkTheme();
      const pinColor      = dark ? 'rgba(255,255,255,0.92)' : 'rgba(25,25,25,0.88)';
      const clusterFill   = dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,20,0.07)';
      const clusterStroke = dark ? 'rgba(255,255,255,0.45)' : 'rgba(20,20,20,0.30)';
      const textColor     = dark ? '#ffffff'                : '#1a1a1a';

      map.addSource('places-source', {
        type: 'geojson',
        data: placesGeojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'places-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': clusterFill,
          'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 15, 30],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': clusterStroke,
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'places-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': textColor },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'places-source',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': pinColor,
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)',
        },
      });

      // Register map event handlers once per map instance
      if (!map._placesEventsAttached) {
        map._placesEventsAttached = true;

        map.on('click', 'clusters', e => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          if (!features.length) return;
          const clusterId = features[0].properties.cluster_id;
          map.getSource('places-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 0.5 });
          });
        });

        map.on('click', 'unclustered-point', async e => {
          const feature = e.features[0];
          const props   = feature.properties;
          const coords  = feature.geometry.coordinates.slice();
          while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
            coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
          }

          function buildPopupHTML(locationLine) {
            let photosHTML = '';
            try {
              const photos = JSON.parse(props.photos || '[]');
              if (photos.length) {
                photosHTML = `<div class="places-popup__photos">${photos.map(src =>
                  `<img class="places-popup__photo" src="${src}" alt="" loading="lazy">`
                ).join('')}</div>`;
              }
            } catch (_) {}
            const locText  = locationLine      ? `<p class="places-popup__location">${locationLine}</p>` : '';
            const dateText = props.date        ? `<p class="places-popup__date">${props.date}</p>` : '';
            const descText = props.description ? `<p class="places-popup__desc">${props.description}</p>` : '';
            return `<div class="places-popup">
              <p class="places-popup__name">${props.name || 'Place'}</p>
              ${locText}${dateText}${descText}${photosHTML}
            </div>`;
          }

          const popup = new mapboxgl.Popup({ offset: [0, -8], closeButton: true, maxWidth: '300px' })
            .setLngLat(coords)
            .setHTML(buildPopupHTML(null))
            .addTo(map);

          try {
            const gc = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?types=place&access_token=${mapboxgl.accessToken}`
            );
            if (gc.ok) {
              const data = await gc.json();
              const context = data.features?.[0]?.context || [];
              let region = null, country = null, countryCode = null;
              for (const ctx of context) {
                if (ctx.id.startsWith('region.'))  region = ctx.text;
                if (ctx.id.startsWith('country.')) { country = ctx.text; countryCode = ctx.short_code?.toUpperCase(); }
              }
              const locationLine = countryCode === 'US' ? region : country;
              if (locationLine && popup.isOpen()) popup.setHTML(buildPopupHTML(locationLine));
            }
          } catch (_) {}
        });

        map.on('mouseenter', 'clusters',          () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters',          () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
      }
    }

    const PLACES_CACHE_KEY    = 'places-geojson-cache-v1';
    const PLACES_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

    function loadCachedPlaces() {
      try {
        const raw = localStorage.getItem(PLACES_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.ts || !parsed.data) return null;
        if (Date.now() - parsed.ts > PLACES_CACHE_TTL_MS) return null;
        return parsed.data;
      } catch (_) { return null; }
    }

    function savePlacesCache(data) {
      try {
        localStorage.setItem(PLACES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch (_) {}
    }

    async function fetchPlacesData() {
      try {
        const res = await fetch('/api/places');
        if (!res.ok) throw new Error(`places API ${res.status}`);
        const data = await res.json();
        placesGeojson = data;
        savePlacesCache(data);
      } catch (err) {
        console.warn('Places: failed to fetch pins', err);
        if (!placesGeojson) placesGeojson = { type: 'FeatureCollection', features: [] };
      }
    }

    function loadMapboxScript() {
      return new Promise((resolve, reject) => {
        if (window.mapboxgl) { resolve(); return; }
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.5.1/mapbox-gl.css';
        document.head.appendChild(css);
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.5.1/mapbox-gl.js';
        script.onload  = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function resolveMapboxToken() {
      let token = window.MAPBOX_TOKEN;
      if (token && token !== 'pk.your_public_token_here') return token;
      try {
        const tr = await fetch('/api/mapbox-token');
        if (tr.ok) { const td = await tr.json(); return td.token || null; }
      } catch (_) {}
      return null;
    }

    // Kick off Mapbox script + token + places data in parallel. Safe to call
    // multiple times — work happens at most once. Called eagerly on idle so
    // the first Places click is near-instant.
    let placesPreloadStarted = false;
    let placesScriptPromise  = null;
    let placesTokenPromise   = null;
    let placesDataPromise    = null;
    function preloadPlaces() {
      if (placesPreloadStarted) return;
      placesPreloadStarted = true;
      const cached = loadCachedPlaces();
      if (cached) placesGeojson = cached;
      placesScriptPromise = loadMapboxScript();
      placesTokenPromise  = resolveMapboxToken();
      placesDataPromise   = fetchPlacesData();
    }

    /* Basemap tuning — background layer = ocean base, land layers drawn on top */
    const PLACES_LAND_DARK   = '#191c28';
    const PLACES_OCEAN_DARK  = '#000000';

    const LAND_LAYERS = [
      'land', 'landcover', 'landuse', 'land-structure-polygon', 'national-park',
    ];

    const WATER_COLOR_LIGHT  = '#cce8f2';

    function stripMapBackground(map) {
      const dark = isDarkTheme();

      // Background layer = canvas base = ocean color
      if (map.getLayer('background')) {
        if (dark) {
          map.setPaintProperty('background', 'background-color', PLACES_OCEAN_DARK);
          map.setPaintProperty('background', 'background-opacity', 1);
        } else {
          map.setPaintProperty('background', 'background-color', 'rgba(0,0,0,0)');
          map.setPaintProperty('background', 'background-opacity', 0);
        }
      }

      // Land layers
      for (const id of LAND_LAYERS) {
        if (!map.getLayer(id)) continue;
        const type = map.getLayer(id).type;
        if (type === 'fill') {
          if (dark) {
            map.setPaintProperty(id, 'fill-color', PLACES_LAND_DARK);
            map.setPaintProperty(id, 'fill-opacity', 1);
          } else {
            map.setPaintProperty(id, 'fill-opacity', 0);
          }
        }
      }

      // Water: scan ALL style layers and override any that contain 'water' in their ID.
      const waterColor = dark ? PLACES_OCEAN_DARK : WATER_COLOR_LIGHT;
      const style = map.getStyle();
      if (style && style.layers) {
        for (const layer of style.layers) {
          if (!layer.id.includes('water')) continue;
          try {
            if (layer.type === 'fill') {
              map.setPaintProperty(layer.id, 'fill-pattern', null);
              map.setPaintProperty(layer.id, 'fill-color', waterColor);
              map.setPaintProperty(layer.id, 'fill-opacity', 1);
            } else if (layer.type === 'line') {
              map.setPaintProperty(layer.id, 'line-color', waterColor);
              map.setPaintProperty(layer.id, 'line-opacity', 1);
            } else if (layer.type === 'background') {
              map.setPaintProperty(layer.id, 'background-color', waterColor);
              map.setPaintProperty(layer.id, 'background-opacity', 1);
            }
          } catch (_) {}
        }
      }
    }

    // Road/highway layer ID patterns to hide — covers motorways, trunks, primary/secondary
    // roads, shields, and road labels from both dark-v11 and light-v11 styles.
    const ROAD_LAYER_PATTERNS = [
      /^road/,
      /^highway/,
      /^motorway/,
      /^trunk/,
      /^tunnel/,
      /^bridge/,
      /^turning/,
      /^path/,
      /^ferry/,
      /^aerialway/,
      /^airport/,
    ];

    function hideRoadLayers(map) {
      const style = map.getStyle();
      if (!style || !style.layers) return;
      for (const layer of style.layers) {
        const id = layer.id;
        if (ROAD_LAYER_PATTERNS.some(re => re.test(id))) {
          try {
            if (layer.type === 'line') {
              map.setPaintProperty(id, 'line-opacity', 0);
            } else if (layer.type === 'symbol') {
              map.setLayoutProperty(id, 'visibility', 'none');
            } else if (layer.type === 'fill') {
              map.setPaintProperty(id, 'fill-opacity', 0);
            }
          } catch (_) {}
        }
      }
    }

    async function renderPlaces() {
      if (placesRendered) {
        // Trigger a resize in case the container was hidden and resized
        if (placesMapInstance) placesMapInstance.resize();
        return;
      }
      placesRendered = true;

      preloadPlaces(); // no-op if already started on idle

      await placesScriptPromise;
      const mapboxToken = await placesTokenPromise;
      if (!mapboxToken) {
        console.warn('Places: no Mapbox token found. Set MAPBOX_PUBLIC_TOKEN in Vercel env vars.');
        placesRendered = false; // allow retry
        return;
      }
      mapboxgl.accessToken = mapboxToken;

      const mapContainer = document.getElementById('placesMap');
      mapContainer.style.opacity = '0';

      placesMapInstance = new mapboxgl.Map({
        container: 'placesMap',
        style: placesCurrentStyle(),
        center: [-83.5, 32.7],
        zoom: 3,
        projection: 'equirectangular',
        cooperativeGestures: true,
        attributionControl: false,
        logoPosition: 'bottom-right',
      });

      placesMapInstance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      placesMapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

      const revealMap = () => {
        if (mapContainer.dataset.revealed === '1') return;
        mapContainer.dataset.revealed = '1';
        requestAnimationFrame(() => {
          mapContainer.style.transition = 'opacity 0.4s ease';
          mapContainer.style.opacity = '1';
        });
      };

      placesMapInstance.on('load', async () => {
        placesMapInstance.resize();
        stripMapBackground(placesMapInstance);
        hideRoadLayers(placesMapInstance);

        // Render cached pins immediately if we have them
        const hadCachedPins = !!(placesGeojson && placesGeojson.features && placesGeojson.features.length);
        if (hadCachedPins) {
          placesAddLayers(placesMapInstance);
          revealMap();
        }

        // Wait for the (possibly in-flight) fresh fetch and refresh layers
        await placesDataPromise;
        if (placesGeojson) {
          placesAddLayers(placesMapInstance);
          revealMap();
        }
      });

      // Swap style on theme change, then re-add layers
      let placesIsDark = isDarkTheme();
      document.addEventListener('themeblend', e => {
        if (!placesMapInstance) return;
        const dark = e.detail.blend > 0.5;
        if (dark === placesIsDark) return;
        placesIsDark = dark;
        mapContainer.style.transition = 'opacity 0.15s ease';
        mapContainer.style.opacity = '0';
        placesMapInstance.setStyle(dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT);
        placesMapInstance.once('style.load', () => {
          stripMapBackground(placesMapInstance);
          hideRoadLayers(placesMapInstance);
          placesAddLayers(placesMapInstance);
          requestAnimationFrame(() => {
            mapContainer.style.transition = 'opacity 0.4s ease';
            mapContainer.style.opacity = '1';
          });
        });
      });

    }

    // Book modal
    const bookModal = document.getElementById('bookModal');
    const bookModalClose = document.getElementById('bookModalClose');
    const bookModalCover = document.getElementById('bookModalCover');
    const bookModalTitle = document.getElementById('bookModalTitle');
    const bookModalDesc  = document.getElementById('bookModalDesc');
    const bookModalActions = document.getElementById('bookModalActions');
    const bookModalNotes = document.getElementById('bookModalNotes');
    const bookModalAmazon = document.getElementById('bookModalAmazon');
    let bookModalOpen = false;

    async function openBookModal(idx) {
      if (bookModalOpen) return;
      bookModalOpen = true;
      const book = BOOKS[idx];
      bookModalCover.style.setProperty('--book-bg-dark', coverGradient(book, idx, 'dark'));
      bookModalCover.style.setProperty('--book-bg-light', coverGradient(book, idx, 'light'));
      bookModalCover.style.setProperty('--ba-dark', book.fg);
      bookModalCover.style.setProperty('--ba-light', book.lfg);
      bookModalCover.innerHTML = buildCoverHTML(book);
      bookModalTitle.textContent = book.title;
      bookModalDesc.textContent  = book.desc;
      if (bookModalAmazon) bookModalAmazon.href = book.amazon || '#';
      if (bookModalNotes) {
        bookModalNotes.hidden = true;
        bookModalNotes.removeAttribute('data-garden-slug');
      }
      if (bookModalActions) bookModalActions.classList.add('book-modal-actions--solo');
      bookModal.style.pointerEvents = 'all';
      bookModal.classList.add('bm-open');

      try {
        const slugSet = await ensureGardenSlugSet();
        if (!bookModalOpen || !bookModalNotes || !bookModalActions) return;
        const gardenSlug = filenameToSlug(`B. ${book.title}`);
        const hasNote = slugSet.has(gardenSlug);
        bookModalNotes.hidden = !hasNote;
        if (hasNote) bookModalNotes.dataset.gardenSlug = gardenSlug;
        bookModalActions.classList.toggle('book-modal-actions--solo', !hasNote);
      } catch (_) {
        if (bookModalOpen && bookModalActions) bookModalActions.classList.add('book-modal-actions--solo');
      }
    }

    function closeBookModal() {
      if (!bookModalOpen) return;
      bookModalOpen = false;
      bookModal.classList.remove('bm-open');
      bookModal.style.pointerEvents = 'none';
    }

    bookModalClose.addEventListener('click', closeBookModal);
    bookModal.addEventListener('click', e => { if (e.target === bookModal) closeBookModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && bookModalOpen) closeBookModal(); });

    bookModalNotes?.addEventListener('click', (e) => {
      e.preventDefault();
      const slug = bookModalNotes.dataset.gardenSlug;
      if (!slug) return;
      closeBookModal();
      setMode('life');
      location.hash = `#writing/${slug}`;
    });

    function setMode(mode) {
      if (mode === currentMode) return;
      const prevMode = currentMode;
      currentMode = mode;

      const isBookshelfMode  = mode === 'bookshelf';
      const isGearMode       = mode === 'gear';
      const isAppStackMode   = mode === 'appstack';
      const isPlacesMode     = mode === 'places';
      const isSpecialMode    = isBookshelfMode || isGearMode || isAppStackMode || isPlacesMode;
      tabPill.style.opacity = isSpecialMode ? '0' : '1';
      overflowBtn.classList.toggle('active', isSpecialMode);
      overflowItems.forEach(item => item.classList.toggle('active', item.dataset.mode === mode));
      closeOverflowPanel();

      tabOpts.forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('active', active);
        if (active) positionTabPill(btn);
      });

      const isWork      = mode === 'work';
      const isBookshelf = mode === 'bookshelf';
      const isGear      = mode === 'gear';
      const isAppStack  = mode === 'appstack';
      const isPlaces    = mode === 'places';
      const isChat      = mode === 'chat';
      const isSpecial   = isBookshelf || isGear || isAppStack || isPlaces;
      const urlSuffix   = isWork ? '?work' : isBookshelf ? '?bookshelf' : isGear ? '?gear' : isAppStack ? '?appstack' : isPlaces ? '?places' : isChat ? '?chat' : location.pathname;
      history.pushState(null, '', urlSuffix);
      // Defer work-mode removal when transitioning work→life to avoid a layout
      // jump: removing it early changes body from padding-top centering to
      // justify-content:center while portfolioGrid is still visible (and tall),
      // which makes the content snap from top to center once portfolioGrid hides.
      const deferWorkModeRemoval = prevMode === 'work' && !isWork && !isSpecial;
      if (!deferWorkModeRemoval) {
        document.body.classList.toggle('work-mode', isWork);
      }
      document.body.classList.toggle('places-mode', isPlaces);
      if (!isWork && !isSpecial) window.scrollTo({ top: 0 });

      const prevIsSpecial = prevMode === 'bookshelf' || prevMode === 'gear' || prevMode === 'appstack' || prevMode === 'places';
      const prevIsChat = prevMode === 'chat';
      // Headline/avatar should only animate when the work/non-work status actually changes
      const workStatusChanged = isWork !== (prevMode === 'work');

      // Headshot + headline only swap between life ↔ work
      if (!isSpecial && !prevIsSpecial && workStatusChanged) {
        if (avatarImg) {
          avatarImg.src = isWork ? '/src/img/headshot-work.jpg' : '/src/img/headshot-personal.jpg';
        }
        animateHeadingOut(heading, () => {
          heading.innerHTML = isWork ? workHeadline : defaultHeadline;
          animateHeadingIn(heading);
        });
        anime({
          targets: descEl,
          opacity: 0,
          duration: 180,
          easing: 'easeInQuad',
          complete: () => {
            descEl.innerHTML = isWork ? workDesc : defaultDesc;
            anime({ targets: descEl, opacity: 1, duration: 350, easing: 'easeOutQuad' });
          }
        });
      }

      // Show/hide now strip
      const nowStripEl = document.getElementById('nowStrip');
      if (nowStripEl) nowStripEl.style.display = (isWork || isSpecial || isChat) ? 'none' : '';

      // Show/hide cert badges strip (work page only)
      const certBadgesEl = document.getElementById('certBadgesRow');
      if (certBadgesEl) certBadgesEl.style.display = isWork ? '' : 'none';

      // Show/hide chat input bar; toggle a body class for theming hooks
      if (chatInputBar) chatInputBar.style.display = isChat ? 'flex' : 'none';
      document.body.classList.toggle('chat-mode', isChat);

      // Helper: get the currently-visible special view element
      function prevSpecialView() {
        if (prevMode === 'bookshelf') return bookshelfView;
        if (prevMode === 'gear')      return gearView;
        if (prevMode === 'appstack')  return appStackView;
        if (prevMode === 'places')    return placesView;
        return null;
      }

      // Helper: fade out any view then run callback
      function fadeOutSpecial(view, cb) {
        anime({ targets: view, opacity: 0, scale: 0.97, duration: 220, easing: 'easeInQuad',
          complete: () => { view.style.display = 'none'; cb(); } });
      }

      // Helper: hide all views except the one about to be shown
      function hideAllViews(except) {
        if (except !== launchpad)     launchpad.style.display = 'none';
        if (except !== portfolioGrid) portfolioGrid.style.display = 'none';
        if (except !== bookshelfView) bookshelfView.style.display = 'none';
        if (except !== gearView)      gearView.style.display = 'none';
        if (except !== appStackView)  appStackView.style.display = 'none';
        if (except !== placesView)    placesView.style.display = 'none';
        if (chatView && except !== chatView) chatView.style.display = 'none';
        if (introEl && except !== introEl) introEl.style.display = 'none';
      }

      if (isBookshelf) {
        const prevView = prevIsSpecial ? prevSpecialView() : (isWork ? portfolioGrid : launchpad);
        const targets  = [prevIsSpecial ? prevSpecialView() : prevView, introEl].filter(Boolean);
        anime({
          targets,
          opacity: 0, scale: 0.97,
          duration: 220, easing: 'easeInQuad',
          complete: () => {
            hideAllViews(bookshelfView);
            renderBookshelf();
            bookshelfView.style.opacity = '0';
            bookshelfView.style.display = 'flex';
            anime({ targets: '.book-card', opacity: [0, 1], translateY: [14, 0], duration: 500,
              easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(30) });
            anime({ targets: bookshelfView, opacity: [0, 1], duration: 300, easing: 'easeOutQuad' });
          }
        });
      } else if (isGear) {
        const prevView = prevIsSpecial ? prevSpecialView() : (prevMode === 'work' ? portfolioGrid : launchpad);
        anime({
          targets: [prevView, introEl].filter(Boolean),
          opacity: 0, scale: 0.97,
          duration: 220, easing: 'easeInQuad',
          complete: () => {
            hideAllViews(gearView);
            renderGear();
            gearView.style.opacity = '0';
            gearView.style.display = 'flex';
            anime({ targets: '.gear-card', opacity: [0, 1], translateY: [14, 0], duration: 500,
              easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(25) });
            anime({ targets: gearView, opacity: [0, 1], duration: 300, easing: 'easeOutQuad' });
          }
        });
      } else if (isAppStack) {
        const prevView = prevIsSpecial ? prevSpecialView() : (prevMode === 'work' ? portfolioGrid : launchpad);
        anime({
          targets: [prevView, introEl].filter(Boolean),
          opacity: 0, scale: 0.97,
          duration: 220, easing: 'easeInQuad',
          complete: () => {
            hideAllViews(appStackView);
            renderAppStack();
            appStackView.style.opacity = '0';
            appStackView.style.display = 'flex';
            anime({ targets: '.app-stack-card', opacity: [0, 1], translateY: [14, 0], duration: 500,
              easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(25) });
            anime({ targets: appStackView, opacity: [0, 1], duration: 300, easing: 'easeOutQuad' });
          }
        });
      } else if (isPlaces) {
        const prevView = prevIsSpecial ? prevSpecialView() : (prevMode === 'work' ? portfolioGrid : launchpad);
        anime({
          targets: [prevView, introEl].filter(Boolean),
          opacity: 0, scale: 0.97,
          duration: 220, easing: 'easeInQuad',
          complete: () => {
            hideAllViews(placesView);
            placesView.style.opacity = '0';
            placesView.style.display = 'flex';
            renderPlaces();
            anime({ targets: placesView, opacity: [0, 1], duration: 300, easing: 'easeOutQuad' });
          }
        });
      } else if (isChat) {
        const prevView = prevIsSpecial ? prevSpecialView() : (prevMode === 'work' ? portfolioGrid : launchpad);
        anime({
          targets: [prevView, introEl].filter(Boolean),
          opacity: 0, scale: 0.97,
          duration: 220, easing: 'easeInQuad',
          complete: () => {
            hideAllViews(chatView);
            chatView.style.opacity = '0';
            chatView.style.display = 'flex';
            anime({ targets: chatView, opacity: [0, 1], duration: 300, easing: 'easeOutQuad' });
            if (window.chat && typeof window.chat.init === 'function') window.chat.init();
            if (window.chat && typeof window.chat.focus === 'function') window.chat.focus();
          }
        });
      } else if (isWork) {
        if (prevIsChat && chatView) chatView.style.display = 'none';
        if (prevIsSpecial) {
          const prevSpecial = prevSpecialView();
          if (avatarImg) avatarImg.src = '/src/img/headshot-work.jpg';
          heading.innerHTML = workHeadline;
          descEl.innerHTML  = workDesc;
          fadeOutSpecial(prevSpecial, () => {
            if (introEl) { introEl.style.removeProperty('display'); introEl.style.opacity = ''; introEl.style.transform = ''; }
            portfolioGrid.style.opacity = '';
            portfolioGrid.style.transform = '';
            portfolioGrid.style.display = 'grid';
            anime({ targets: '.work-launchpad .app, .study, .kpi', opacity: [0, 1], translateY: [14, 0], duration: 600,
              easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(40) });
          });
        } else if (prevIsChat) {
          if (introEl) { introEl.style.removeProperty('display'); introEl.style.opacity = ''; introEl.style.transform = ''; }
          portfolioGrid.style.opacity = '';
          portfolioGrid.style.transform = '';
          portfolioGrid.style.display = 'grid';
          anime({ targets: '.work-launchpad .app, .study, .kpi', opacity: [0, 1], translateY: [14, 0], duration: 600,
            easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(40) });
        } else {
          anime({
            targets: launchpad,
            opacity: 0, scale: 0.95,
            duration: 280, easing: 'easeInQuad',
            complete: () => {
              launchpad.style.display = 'none';
              portfolioGrid.style.opacity = '';
              portfolioGrid.style.transform = '';
              portfolioGrid.style.display = 'grid';
              anime({ targets: '.work-launchpad .app, .study, .kpi', opacity: [0, 1], translateY: [14, 0], duration: 600,
                easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(40) });
            }
          });
        }
      } else {
        // life mode
        if (prevIsChat && chatView) chatView.style.display = 'none';
        if (prevIsSpecial) {
          const prevSpecial = prevSpecialView();
          if (avatarImg) avatarImg.src = '/src/img/headshot-personal.jpg';
          heading.innerHTML = defaultHeadline;
          descEl.innerHTML  = defaultDesc;
          fadeOutSpecial(prevSpecial, () => {
            if (introEl) { introEl.style.removeProperty('display'); introEl.style.opacity = ''; introEl.style.transform = ''; }
            launchpad.style.opacity = '';
            launchpad.style.transform = '';
            launchpad.style.display = 'flex';
            anime({ targets: '.app', opacity: [0, 1], translateY: [14, 0], duration: 600,
              easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(55) });
          });
        } else if (prevIsChat) {
          if (introEl) { introEl.style.removeProperty('display'); introEl.style.opacity = ''; introEl.style.transform = ''; }
          launchpad.style.opacity = '';
          launchpad.style.transform = '';
          launchpad.style.display = 'flex';
          anime({ targets: '.app', opacity: [0, 1], translateY: [14, 0], duration: 600,
            easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(55) });
        } else {
          anime({
            targets: portfolioGrid,
            opacity: 0, scale: 0.95,
            duration: 280, easing: 'easeInQuad',
            complete: () => {
              document.body.classList.remove('work-mode');
              portfolioGrid.style.display = 'none';
              launchpad.style.opacity = '';
              launchpad.style.transform = '';
              launchpad.style.display = 'flex';
              anime({ targets: '.app', opacity: [0, 1], translateY: [14, 0], duration: 600,
                easing: 'cubicBezier(0.16,1,0.3,1)', delay: anime.stagger(55) });
            }
          });
        }
      }
    }

    tabOpts.forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    // ── Overflow panel ──
    let overflowOpen = false;

    function closeOverflowPanel() {
      if (!overflowOpen) return;
      overflowOpen = false;
      overflowPanel.classList.remove('open');
      overflowBtn.setAttribute('aria-expanded', 'false');
      overflowPanel.setAttribute('aria-hidden', 'true');
    }

    overflowBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (overflowOpen) {
        closeOverflowPanel();
      } else {
        overflowPanel.style.width = modeTab.offsetWidth + 'px';
        overflowOpen = true;
        overflowPanel.classList.add('open');
        overflowBtn.setAttribute('aria-expanded', 'true');
        overflowPanel.setAttribute('aria-hidden', 'false');
      }
    });

    overflowItems.forEach(item => {
      item.addEventListener('click', () => setMode(item.dataset.mode));
    });

    document.addEventListener('click', e => {
      if (overflowOpen && !overflowPanel.contains(e.target)) closeOverflowPanel();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overflowOpen) closeOverflowPanel();
    });

    // ── Power → fade to black → version ──
    const powerBtn      = document.getElementById('powerBtn');
    const powerFade     = document.getElementById('powerFade');
    const versionScreen = document.getElementById('versionScreen');

    // Generate star field
    const tmBg = document.querySelector('.tm-bg');
    for (let i = 0; i < 120; i++) {
      const s = document.createElement('div');
      const size = Math.random() < 0.15 ? 2 : 1;
      s.style.cssText = `
        position:absolute;
        width:${size}px;height:${size}px;
        border-radius:50%;
        background:#fff;
        left:${Math.random()*100}%;
        top:${Math.random()*100}%;
        opacity:${(Math.random()*0.5+0.1).toFixed(2)};
      `;
      tmBg.appendChild(s);
    }

    // ── Version screen state ──
    let vCurrentIdx = 0; // 0 = v2 (present) front, 1 = v1 (past) front
    let vScrollLocked = false;
    const vCard1 = versionScreen.querySelector('.tm-card.v1');
    const vCard2 = versionScreen.querySelector('.tm-card.v2');
    const tmVersionsPanel = document.getElementById('tmVersionsPanel');
    const tmCreditsPanel  = document.getElementById('tmCreditsPanel');
    const tmReturnBtn     = document.getElementById('tmReturnBtn');

    function resetVersionCards() {
      vCurrentIdx = 0;
      vScrollLocked = false;
      anime.remove([vCard1, vCard2]);
      ['left','opacity','transform','zIndex'].forEach(p => {
        vCard1.style[p] = '';
        vCard2.style[p] = '';
      });
    }

    function setVersionFront(idx) {
      if (vScrollLocked || idx === vCurrentIdx) return;
      vScrollLocked = true;
      vCurrentIdx = idx;
      const front = idx === 0 ? vCard2 : vCard1;
      const back  = idx === 0 ? vCard1 : vCard2;
      front.style.zIndex = '2';
      back.style.zIndex  = '1';
      anime({ targets: front, left: '0px', scale: 1, translateY: 0, opacity: 1,
        duration: 850, easing: 'cubicBezier(0.16,1,0.3,1)' });
      anime({ targets: back,  left: '36px', scale: 0.82, translateY: -48, opacity: 0.45,
        duration: 850, easing: 'cubicBezier(0.16,1,0.3,1)',
        complete: () => { vScrollLocked = false; } });
    }

    // Wheel scroll between versions (versions panel only)
    tmVersionsPanel.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.deltaY > 20 && vCurrentIdx === 0) setVersionFront(1);
      else if (e.deltaY < -20 && vCurrentIdx === 1) setVersionFront(0);
    }, { passive: false });

    // Tab switching
    const tmTabBtns = versionScreen.querySelectorAll('.tm-tab');
    tmTabBtns.forEach(tab => {
      tab.addEventListener('click', () => {
        tmTabBtns.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        const isVersions = tab.dataset.tab === 'versions';
        tmVersionsPanel.hidden = !isVersions;
        tmCreditsPanel.hidden  = isVersions;
      });
    });

    function closeVersionScreen() {
      if (!versionScreen.classList.contains('visible')) return;
      powerFade.style.pointerEvents = 'all';
      anime({
        targets: powerFade,
        opacity: [0, 1],
        duration: 600,
        easing: 'easeInQuad',
        complete: () => {
          versionScreen.classList.remove('visible');
          history.replaceState(null, '', location.pathname + location.search);
          const content = versionScreen.querySelector('.tm-content');
          if (content) { content.style.opacity = ''; content.style.transform = ''; }
          tmTabBtns.forEach((t, i) => {
            t.classList.toggle('is-active', i === 0);
            t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
          });
          tmVersionsPanel.hidden = false;
          tmCreditsPanel.hidden  = true;
          resetVersionCards();
          anime({
            targets: powerFade,
            opacity: 0,
            duration: 700,
            easing: 'easeOutQuad',
            complete: () => { powerFade.style.pointerEvents = 'none'; }
          });
        }
      });
    }

    // Return button
    tmReturnBtn.addEventListener('click', closeVersionScreen);

    // Click dark background to close
    versionScreen.addEventListener('click', e => {
      if (e.target === versionScreen || e.target.classList.contains('tm-bg')) closeVersionScreen();
    });

    powerBtn.addEventListener('click', () => {
      powerFade.style.pointerEvents = 'all';
      anime({
        targets: powerFade,
        opacity: [0, 1],
        duration: 900,
        easing: 'easeInQuad',
        complete: () => {
          resetVersionCards();
          versionScreen.classList.add('visible');
          history.replaceState(null, '', '#versions');
          anime({
            targets: '.tm-content',
            opacity: [0, 1],
            translateY: [16, 0],
            duration: 700,
            easing: 'cubicBezier(0.16,1,0.3,1)',
            delay: 100
          });
          anime({
            targets: powerFade,
            opacity: 0,
            duration: 600,
            delay: 200,
            easing: 'easeOutQuad',
            complete: () => { powerFade.style.pointerEvents = 'none'; }
          });
        }
      });
    });

    // ── Social links panel ──
    const socialBtn   = document.getElementById('socialBtn');
    const socialPanel = document.getElementById('socialPanel');
    let socialOpen = false;

    function closeSocialPanel() {
      if (!socialOpen) return;
      socialOpen = false;
      socialBtn.classList.remove('open');
      socialPanel.classList.remove('open');
      socialBtn.setAttribute('aria-expanded', 'false');
      socialPanel.setAttribute('aria-hidden', 'true');
    }

    socialBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (socialOpen) {
        closeSocialPanel();
      } else {
        socialOpen = true;
        socialBtn.classList.add('open');
        socialPanel.classList.add('open');
        socialBtn.setAttribute('aria-expanded', 'true');
        socialPanel.setAttribute('aria-hidden', 'false');
      }
    });

    document.addEventListener('click', e => {
      if (
        socialOpen &&
        !socialPanel.contains(e.target) &&
        !socialBtn.contains(e.target)
      ) {
        closeSocialPanel();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && socialOpen) closeSocialPanel();
    });

    // ── Theme toggle (session-only override; never persisted) ──
    const themeToggle = document.getElementById('themeToggle');
    const themeMoon = themeToggle?.querySelector('.theme-icon-moon');
    const themeSun  = themeToggle?.querySelector('.theme-icon-sun');
    let themeSessionOverride = null;

    function systemPrefersDark() {
      return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function isDarkTheme() {
      if (themeSessionOverride === true) return true;
      if (themeSessionOverride === false) return false;
      return systemPrefersDark();
    }

    function updateThemeToggleUi(dark) {
      if (!themeToggle) return;
      themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
      const hint = ' Shift-click: return to system appearance.';
      themeToggle.removeAttribute('aria-disabled');
      themeToggle.setAttribute('title', (dark ? 'Light mode' : 'Dark mode') + hint);
      themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      themeMoon?.toggleAttribute('hidden', dark);
      themeSun?.toggleAttribute('hidden', !dark);
    }

    function applyThemeSystem() {
      themeSessionOverride = null;
      document.documentElement.removeAttribute('data-theme');
      updateThemeToggleUi(isDarkTheme());
    }

    function applyThemeDom(dark) {
      themeSessionOverride = dark;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      updateThemeToggleUi(dark);
    }

    function initThemeOnLoad() {
      applyThemeSystem();
      document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: isDarkTheme() ? 1 : 0 } }));
    }

    const themeTransitionEl = document.getElementById('themeTransition');
    const themeArc = themeTransitionEl?.querySelector('.theme-transition__arc');
    let themeWipeBusy = false;
    const THEME_WIPE_MS = 1200;

    function themePrefersReducedMotion() {
      return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function runThemeWipe(targetDark) {
      if (!themeTransitionEl || !themeArc || themeWipeBusy) return;
      if (isDarkTheme() === targetDark) return;
      themeWipeBusy = true;
      anime.remove(themeArc);
      themeTransitionEl.classList.remove('theme-transition--to-dark', 'theme-transition--to-light');
      themeTransitionEl.classList.add(targetDark ? 'theme-transition--to-dark' : 'theme-transition--to-light');
      const rotFrom = targetDark ? '-90deg' : '90deg';
      const rotTo   = targetDark ? '90deg' : '-90deg';
      themeArc.style.transform = `rotate(${rotFrom})`;
      themeTransitionEl.classList.add('is-active');
      themeTransitionEl.setAttribute('aria-hidden', 'false');

      anime({
        targets: themeArc,
        rotate: [rotFrom, rotTo],
        duration: THEME_WIPE_MS,
        easing: 'cubicBezier(0.38, 0.02, 0.22, 1)',
        update(anim) {
          const t = anim.progress / 100;
          const blend = targetDark ? t : (1 - t);
          document.documentElement.style.setProperty('--theme-blend', String(blend));
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend } }));
        },
        complete() {
          applyThemeDom(targetDark);
          document.documentElement.style.removeProperty('--theme-blend');
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: targetDark ? 1 : 0 } }));
          themeArc.style.transform = '';
          themeTransitionEl.classList.remove('is-active', 'theme-transition--to-dark', 'theme-transition--to-light');
          themeTransitionEl.setAttribute('aria-hidden', 'true');
          themeWipeBusy = false;
        }
      });
    }

    function runThemeWipeToSystem(targetDark) {
      if (!themeTransitionEl || !themeArc || themeWipeBusy) return;
      if (isDarkTheme() === targetDark) {
        applyThemeSystem();
        document.documentElement.style.removeProperty('--theme-blend');
        document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: targetDark ? 1 : 0 } }));
        return;
      }
      themeWipeBusy = true;
      anime.remove(themeArc);
      themeTransitionEl.classList.remove('theme-transition--to-dark', 'theme-transition--to-light');
      themeTransitionEl.classList.add(targetDark ? 'theme-transition--to-dark' : 'theme-transition--to-light');
      const rotFrom = targetDark ? '-90deg' : '90deg';
      const rotTo   = targetDark ? '90deg' : '-90deg';
      themeArc.style.transform = `rotate(${rotFrom})`;
      themeTransitionEl.classList.add('is-active');
      themeTransitionEl.setAttribute('aria-hidden', 'false');

      anime({
        targets: themeArc,
        rotate: [rotFrom, rotTo],
        duration: THEME_WIPE_MS,
        easing: 'cubicBezier(0.38, 0.02, 0.22, 1)',
        update(anim) {
          const t = anim.progress / 100;
          const blend = targetDark ? t : (1 - t);
          document.documentElement.style.setProperty('--theme-blend', String(blend));
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend } }));
        },
        complete() {
          applyThemeSystem();
          document.documentElement.style.removeProperty('--theme-blend');
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: targetDark ? 1 : 0 } }));
          themeArc.style.transform = '';
          themeTransitionEl.classList.remove('is-active', 'theme-transition--to-dark', 'theme-transition--to-light');
          themeTransitionEl.setAttribute('aria-hidden', 'true');
          themeWipeBusy = false;
        }
      });
    }

    initThemeOnLoad();

    if (themeToggle) {
      updateThemeToggleUi(isDarkTheme());
      themeToggle.addEventListener('click', e => {
        e.stopPropagation();
        if (e.shiftKey) {
          const sysDark = systemPrefersDark();
          if (themePrefersReducedMotion() || isDarkTheme() === sysDark) {
            applyThemeSystem();
            document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: sysDark ? 1 : 0 } }));
          } else {
            runThemeWipeToSystem(sysDark);
          }
          return;
        }
        const next = !isDarkTheme();
        if (themePrefersReducedMotion()) {
          applyThemeDom(next);
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: next ? 1 : 0 } }));
          return;
        }
        runThemeWipe(next);
      });
    }

    try {
      if (typeof matchMedia === 'function') {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (ev) => {
          if (themeSessionOverride !== null) return;
          applyThemeSystem();
          document.dispatchEvent(new CustomEvent('themeblend', { detail: { blend: ev.matches ? 1 : 0 } }));
        });
      }
    } catch (err) { /* ignore */ }

    /** Time Machine (#versionScreen) — open without power animation (e.g. direct link to #versions) */
    function showVersionScreenFromHash() {
      if (!versionScreen) return;
      if (versionScreen.classList.contains('visible')) return;
      resetVersionCards();
      versionScreen.classList.add('visible');
      anime.remove('.tm-content');
      anime({
        targets: '.tm-content',
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 500,
        easing: 'cubicBezier(0.16,1,0.3,1)',
      });
      if (powerFade) {
        powerFade.style.pointerEvents = 'none';
        powerFade.style.opacity = '0';
      }
    }

    function hideVersionScreenIfNeeded() {
      if (!versionScreen || !versionScreen.classList.contains('visible')) return;
      anime.remove('.tm-content');
      versionScreen.classList.remove('visible');
      const content = versionScreen.querySelector('.tm-content');
      if (content) { content.style.opacity = ''; content.style.transform = ''; }
      resetVersionCards();
    }

    // ── Icon stroke-draw on hover (accent swatches) ──
    const appColors = {
      'Videos':       '#00BFD9', /* Neon Cyan */
      'Photos':       '#FFE100', /* Digital Yellow */
      'Writing':      '#E6007F', /* Hot Magenta */
      'Labs':         '#FF8C00', /* Solar Orange */
      'Portfolio':    '#7B61FF',
      'Case Studies': '#00C896',
      'Career':       '#FF7043',
      'Resume':       '#42A5F5'
    };

    document.querySelectorAll('.app').forEach(btn => {
      const color   = appColors[btn.dataset.app] || '#888';
      const svg     = btn.querySelector('.app-icon svg');
      const srcPath = svg.querySelector('[data-glass="blur"]');
      if (!srcPath) return;

      const outline = srcPath.cloneNode(false);
      ['filter', 'fill', 'data-glass', 'clip-path', 'mask'].forEach(a => outline.removeAttribute(a));
      outline.setAttribute('fill', 'none');
      outline.setAttribute('stroke', color);
      outline.setAttribute('stroke-width', '1');
      outline.setAttribute('stroke-linecap', 'round');
      outline.setAttribute('stroke-linejoin', 'round');
      outline.classList.add('outline-path');
      svg.querySelector('g').appendChild(outline);

      let pathLen = 0;
      requestAnimationFrame(() => {
        pathLen = outline.getTotalLength();
        outline.style.strokeDasharray  = pathLen;
        outline.style.strokeDashoffset = pathLen;
      });

      btn.addEventListener('mouseenter', () => {
        anime.remove(outline);
        anime({ targets: outline, strokeDashoffset: 0, duration: 700, easing: 'cubicBezier(0.16,1,0.3,1)' });
      });
      btn.addEventListener('mouseleave', () => {
        anime.remove(outline);
        anime({ targets: outline, strokeDashoffset: pathLen, duration: 450, easing: 'easeInQuad' });
      });
    });

    // ── Section Modal & Hash Routing ──
    const sModal      = document.getElementById('sModal');
    const sModalFrame = document.getElementById('sModalFrame');
    const sModalTitle = document.getElementById('sModalTitle');
    const sModalBack  = document.getElementById('sModalBack');
    const sModalClose = document.getElementById('sModalClose');
    const sModalBody  = document.getElementById('sModalBody');
    const nowStrip    = document.getElementById('nowStrip');

    // Capture strip rect for expansion animation
    let _nowStripRect = null;
    if (nowStrip) {
      nowStrip.addEventListener('click', () => {
        _nowStripRect = nowStrip.getBoundingClientRect();
      }, { capture: true });
    }

    const SECTION_SLUGS = {
      'Videos':       'videos',
      'Photos':       'photos',
      'Writing':      'writing',
      'Labs':         'labs',
      'Portfolio':    'portfolio',
      'Case Studies': 'case-studies',
      'Career':       'career',
      'Resume':       'resume'
    };

    const SECTIONS = {
      'videos':       { label: 'Videos' },
      'photos':       { label: 'Photos' },
      'writing':      { label: 'Writing' },
      'labs':         { label: 'Labs' },
      'portfolio':    { label: 'Portfolio' },
      'case-studies': { label: 'Case Studies' },
      'career':       { label: 'Career' },
      'resume':       { label: 'Resume' }
    };

    const SECTION_APP_BY_SLUG = {
      videos:          'Videos',
      photos:          'Photos',
      writing:         'Writing',
      labs:            'Labs',
      portfolio:       'Portfolio',
      'case-studies':  'Case Studies',
      career:          'Career',
      resume:          'Resume'
    };

    /** Same artwork as launchpad icons, without the hover stroke-trace (.outline-path). */
    function cloneLaunchpadSectionIconSvgForModal(appName) {
      const btn = document.querySelector(`.app[data-app="${appName}"]`);
      const src = btn && btn.querySelector('.app-icon svg');
      if (!src) return null;
      const clone = src.cloneNode(true);
      clone.querySelectorAll('.outline-path').forEach(n => n.remove());

      const ids = [...clone.querySelectorAll('[id]')]
        .map(el => el.id)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      const suffix = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      let serialized = new XMLSerializer().serializeToString(clone);
      for (const id of ids) {
        const nid = id + suffix;
        serialized = serialized.split(`id="${id}"`).join(`id="${nid}"`);
        serialized = serialized.split(`url(#${id})`).join(`url(#${nid})`);
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = serialized;
      return wrap.querySelector('svg');
    }

    function clearModalSectionIcon() {
      const el = document.getElementById('sModalSectionIcon');
      if (!el) return;
      el.innerHTML = '';
      el.classList.remove('is-visible');
    }

    function showModalSectionIconFromSlug(sectionSlug) {
      const el = document.getElementById('sModalSectionIcon');
      if (!el) return;
      const appName = SECTION_APP_BY_SLUG[sectionSlug];
      if (!appName) {
        clearModalSectionIcon();
        return;
      }
      const svg = cloneLaunchpadSectionIconSvgForModal(appName);
      if (!svg) {
        clearModalSectionIcon();
        return;
      }
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '22');
      svg.setAttribute('aria-hidden', 'true');
      el.innerHTML = '';
      el.appendChild(svg);
      el.classList.add('is-visible');
    }

    function showModalPreviouslyIcon() {
      const el = document.getElementById('sModalSectionIcon');
      if (!el) return;
      el.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/></svg>';
      el.classList.add('is-visible');
    }

    // Map filename (without .md) to URL-safe slug
    function filenameToSlug(name) {
      return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    let gardenSlugSetPromise = null;
    function ensureGardenSlugSet() {
      if (!gardenSlugSetPromise) {
        gardenSlugSetPromise = fetch('/api/content/list?category=writing')
          .then(r => r.json())
          .then(({ items, files }) => {
            const list = items || (files || []).map(file => ({ file }));
            return new Set(list.map(({ file }) => filenameToSlug(file.replace(/\.md$/, ''))));
          })
          .catch(() => new Set());
      }
      return gardenSlugSetPromise;
    }

    // Reverse: find the matching filename from slug in a list of files
    function slugToFilename(slug, files) {
      return files.find(f => filenameToSlug(f.replace(/\.md$/, '')) === slug) || null;
    }

    // Extract title from markdown: first H1, fallback to filename
    function extractTitle(md, fallback) {
      const m = md.match(/^#\s+(.+)$/m);
      return m ? m[1].trim() : fallback;
    }

    // Extract date/subtitle hint from markdown frontmatter or first non-H1 line
    function extractSub(md) {
      // Try frontmatter date
      const fm = md.match(/^---[\s\S]*?date:\s*(.+?)[\s\n][\s\S]*?---/m);
      if (fm) return fm[1].trim();
      return '';
    }

    function parseHash() {
      const h = location.hash.slice(1);
      if (!h) return null;
      const [section, item] = h.split('/');
      return { section, item: item || null };
    }

    let indexScrollPos = 0;
    let modalIsOpen = false;
    const videoCache = {};

    // YouTube handle(s) per section. Videos combines both channels.
    const SECTION_YT_HANDLES = {
      'videos': ['lukevanzylofficial', 'uxwithluke']
    };

    function sectionHandles(section) {
      const h = SECTION_YT_HANDLES[section];
      return Array.isArray(h) ? h : (h ? [h] : []);
    }

    // Experimental projects shown in the Labs section (thumbnails from v1).
    const LABS = [
      { title: 'GymBud',          desc: 'Simple interval timer for strength training',                   thumb: '/v1/labs/images/gymbud.png',         url: 'https://gym.lukevanzyl.com' },
      { title: 'Research Garden', desc: 'Document your rabbit-hole research sessions for all your interests', thumb: '/v1/labs/images/research garden.png', url: 'https://research-garden.vercel.app/' }
    ];

    function fetchSectionMarkdownItems(section) {
      return fetch(`/api/content/list?category=${section}`)
        .then(r => r.json())
        .then(({ items, files }) => items || (files || []).map(file => ({ file })))
        .catch(() => []);
    }

    function fetchChannelVideos(handle) {
      if (videoCache[handle]) return Promise.resolve(videoCache[handle]);
      return fetch(`/api/youtube/channel-videos?handle=${handle}`)
        .then(r => r.json())
        .then(({ videos }) => { videoCache[handle] = videos || []; return videoCache[handle]; })
        .catch(() => []);
    }

    // Fetch and merge videos across all handles for a section.
    function fetchSectionVideos(section) {
      const handles = sectionHandles(section);
      if (!handles.length) return Promise.resolve([]);
      return Promise.all(handles.map(fetchChannelVideos)).then(lists => lists.flat());
    }

    function setSectionCount(appName, count, label) {
      const btn = document.querySelector(`.app[data-app="${appName}"]`);
      if (!btn) return;
      const el = btn.querySelector('.app-count');
      if (!el) return;
      el.textContent = `${count} ${label}${count !== 1 ? 's' : ''}`;
    }

    function populateSectionCounts() {
      Object.entries(SECTION_SLUGS).forEach(([appName, slug]) => {
        if (slug === 'photos') {
          fetch('/api/content/list?category=photos')
            .then(r => r.json())
            .then(({ images }) => setSectionCount(appName, (images || []).length, 'photo'))
            .catch(() => {});
          return;
        }
        if (slug === 'labs') {
          setSectionCount(appName, LABS.length, 'project');
          return;
        }

        const handles = sectionHandles(slug);
        const mdFetch = fetchSectionMarkdownItems(slug);
        const videosFetch = fetchSectionVideos(slug);

        Promise.allSettled([mdFetch, videosFetch]).then(([mdResult, videosResult]) => {
          const hasData = mdResult.status === 'fulfilled' || videosResult.status === 'fulfilled';
          if (!hasData) return;

          const mdCount = mdResult.status === 'fulfilled' ? mdResult.value.length : 0;
          const videoCount = videosResult.status === 'fulfilled' ? videosResult.value.length : 0;
          const total = mdCount + videoCount;
          const label = handles.length ? 'item' : 'post';

          setSectionCount(appName, total, label);
        });
      });
    }

    populateSectionCounts();

    function attachRowClicks() {
      setTimeout(() => {
        sModalBody.scrollTop = indexScrollPos;
        sModalBody.querySelectorAll('.sm-row').forEach(btn => {
          btn.addEventListener('click', () => {
            indexScrollPos = sModalBody.scrollTop;
            location.hash = `#${btn.dataset.section}/${btn.dataset.slug}`;
          });
        });
      }, 140);
    }

    function renderMixedIndex(section) {
      fadeSwap(`<div class="sm-list sm-fade sm-loading"><span style="color:var(--text-secondary);font-size:0.85rem">Loading…</span></div>`);

      const videosFetch = fetchSectionVideos(section);
      const mdFetch = fetch(`/api/content/list?category=${section}`)
        .then(r => r.json())
        .then(({ items, files }) => items || (files || []).map(f => ({ file: f, date: '1970-01-01' })))
        .catch(() => []);

      Promise.all([videosFetch, mdFetch]).then(([videos, mdItems]) => {
        const allItems = [];

        videos.forEach(v => allItems.push({
          type: 'video', slug: v.videoId, title: v.title, thumbnail: v.thumbnail, date: v.publishedAt
        }));

        mdItems.forEach(({ file, date }) => {
          const name = file.replace(/\.md$/, '');
          allItems.push({ type: 'md', slug: filenameToSlug(name), title: name, date: date || '1970-01-01' });
        });

        allItems.sort((a, b) => b.date.localeCompare(a.date));

        if (!allItems.length) {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic;margin-top:8px">Nothing here yet.</p></div>`);
          return;
        }

        const rows = allItems.map(item => {
          if (item.type === 'video') {
            const safeTitle = item.title.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<button class="sm-row sm-row--video" data-section="${section}" data-slug="${item.slug}">
              <div class="sm-row-thumb-glow" style="background-image:url('${item.thumbnail}')"></div>
              <span class="sm-row-info">
                <span class="sm-row-title">${safeTitle}</span>
                <span class="sm-row-sub">${item.date}</span>
              </span>
              <div class="sm-row-thumb-wrap"><img class="sm-row-thumb" src="${item.thumbnail}" alt="" loading="lazy"></div>
            </button>`;
          } else {
            const safeTitle = item.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<button class="sm-row sm-row--article" data-section="${section}" data-slug="${item.slug}">
              <span class="sm-row-title">${safeTitle}</span>
              <span class="sm-row-sub">${item.date}</span>
            </button>`;
          }
        }).join('');

        fadeSwap(`<div class="sm-mixed-grid sm-fade">${rows}</div>`);
        attachRowClicks();
      });
    }

    function renderVideoItem(section, videoId) {
      fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-size:0.85rem">Loading…</p></div>`);
      fetchSectionVideos(section).then(videos => {
        const video = videos.find(v => v.videoId === videoId);
        if (!video) {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Video not found.</p></div>`);
          return;
        }
        const safeTitle = video.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const desc = video.description
          ? `<p style="color:var(--text-secondary);font-size:16px;line-height:1.6;white-space:pre-wrap">${video.description.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 600)}${video.description.length > 600 ? '…' : ''}</p>`
          : '';
        const iframe = `<div class="fn-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" title="${video.title.replace(/"/g, '&quot;')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
        fadeSwap(`<div class="sm-fade cs-body"><h1>${safeTitle}</h1>${iframe}${desc}</div>`);
        setTimeout(() => { sModalBody.scrollTop = 0; }, 140);
      }).catch(() => {
        fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load video.</p></div>`);
      });
    }

    function openSModal() {
      if (modalIsOpen) return;
      modalIsOpen = true;
      sModal.style.pointerEvents = 'all';
      sModal.classList.add('sm-open');
    }

    let prevNavMode = false;

    function closeSModal() {
      if (!modalIsOpen) return;
      prevNavMode = false;
      sModalBack.onclick = null;
      modalIsOpen = false;
      clearModalSectionIcon();
      sModal.classList.remove('sm-open', 'sm-now');
      sModal.style.pointerEvents = 'none';
      history.pushState(null, '', location.pathname + location.search);
    }

    function fadeSwap(newHTML) {
      const current = sModalBody.firstElementChild;
      if (current && modalIsOpen) {
        current.style.transition = 'opacity 0.12s ease';
        current.style.opacity = '0';
        setTimeout(() => { sModalBody.innerHTML = newHTML; }, 130);
      } else {
        sModalBody.innerHTML = newHTML;
      }
    }

    // ── Previously button — opens case studies in sModal ──
    function renderPrevList() {
      prevNavMode = true;
      sModalTitle.textContent = 'Previously';
      showModalPreviouslyIcon();
      sModalBack.style.display = 'none';
      sModalBack.onclick = null;
      const rows = loadedStudies.map(({ meta }, i) => `
        <button class="sm-row" data-prev-idx="${i}">
          <span class="sm-row-title">${(meta.title || '').replace(/</g, '&lt;')}</span>
          <span class="sm-row-sub">${(meta.company || '').replace(/</g, '&lt;')}${meta.timeline ? ' · ' + meta.timeline : ''}</span>
        </button>`).join('');
      fadeSwap(`<div class="sm-list sm-fade">${rows || '<p style="color:var(--text-secondary);font-style:italic;margin-top:8px">Nothing here yet.</p>'}</div>`);
      setTimeout(() => {
        sModalBody.querySelectorAll('[data-prev-idx]').forEach(btn => {
          btn.addEventListener('click', () => renderPrevDetail(+btn.dataset.prevIdx));
        });
      }, 140);
    }

    function renderPrevDetail(idx) {
      const { meta, body } = loadedStudies[idx];
      sModalTitle.textContent = meta.title || '';
      clearModalSectionIcon();
      sModalBack.style.display = 'flex';
      sModalBack.onclick = () => renderPrevList();
      const metaRows = ['company', 'role', 'timeline', 'tools']
        .filter(k => meta[k])
        .map(k => `<div class="cs-meta-item"><span class="cs-meta-label">${k.charAt(0).toUpperCase() + k.slice(1)}</span><span class="cs-meta-value">${meta[k]}</span></div>`)
        .join('');
      fadeSwap(`<div class="sm-fade cs-body">
        ${metaRows ? `<div class="cs-meta">${metaRows}</div>` : ''}
        ${mdToHTML(body)}
      </div>`);
      setTimeout(() => { sModalBody.scrollTop = 0; }, 140);
    }

    function renderPortfolioGrid() {
      sModalTitle.textContent = 'Portfolio';
      showModalSectionIconFromSlug('portfolio');
      sModalBack.style.display = 'none';
      fadeSwap(`<div class="sm-list sm-fade sm-loading"><span style="color:var(--text-secondary);font-size:0.85rem">Loading…</span></div>`);
      fetch('/api/content/list?category=portfolio')
        .then(r => r.json())
        .then(({ images }) => {
          if (!images || !images.length) {
            fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic;margin-top:8px">No images yet — drop files into /content/portfolio/ to get started.</p></div>`);
            return;
          }
          const items = images.map(({ file, link }) => {
            const src = `/content/portfolio/${encodeURIComponent(file)}`;
            const safeAlt = file.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            if (link) {
              return `<a href="${link}" target="_blank" rel="noopener noreferrer" class="portfolio-img-item"><img src="${src}" alt="${safeAlt}" loading="lazy"></a>`;
            }
            return `<div class="portfolio-img-item"><img src="${src}" alt="${safeAlt}" loading="lazy"></div>`;
          }).join('');
          const portfolioTagsHtml = `<div class="portfolio-meta-tags cs-tags" role="group" aria-label="Practice areas"><span class="portfolio-meta-tag-wrap"><button type="button" class="cs-tag-chip portfolio-meta-tag-btn" aria-describedby="pmt-tip-ds"><svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg><span class="cs-tag-chip__text">Design systems</span></button><span id="pmt-tip-ds" class="portfolio-meta-tag-tip" role="tooltip">I’ve built and evolved design systems end to end: libraries, tokens, and how we document them, and I’ve stayed paired with engineering until those patterns were really living in the product—not just living in a file.</span></span><span class="portfolio-meta-tag-wrap"><button type="button" class="cs-tag-chip portfolio-meta-tag-btn" aria-describedby="pmt-tip-figma"><svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg><span class="cs-tag-chip__text">Figma</span></button><span id="pmt-tip-figma" class="portfolio-meta-tag-tip" role="tooltip">I’ve built three entire design systems from scratch in Figma and I’ve helped two organizations migrate onto it. I wrote curriculum and documentation for designers, engineers, and product managers on how to work in the tool, hand off cleanly, archive work, and keep docs useful so people actually felt confident using it.</span></span><span class="portfolio-meta-tag-wrap"><button type="button" class="cs-tag-chip portfolio-meta-tag-btn" aria-describedby="pmt-tip-a11y"><svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg><span class="cs-tag-chip__text">Accessibility</span></button><span id="pmt-tip-a11y" class="portfolio-meta-tag-tip" role="tooltip">In the systems and products I’ve touched, I’ve treated accessibility as part of the design spec: I’ve defined keyboard flows, contrast, and motion in components so teams weren’t scrambling to retrofit accessibility only when something broke in QA.</span></span><span class="portfolio-meta-tag-wrap"><button type="button" class="cs-tag-chip portfolio-meta-tag-btn" aria-describedby="pmt-tip-mentor"><svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg><span class="cs-tag-chip__text">Mentoring</span></button><span id="pmt-tip-mentor" class="portfolio-meta-tag-tip" role="tooltip">I’ve mentored three designers for multiple years through ongoing 1:1s: craft, how they tell the story of their work, and how they steer through messy product and stakeholder situations.</span></span><span class="portfolio-meta-tag-wrap"><button type="button" class="cs-tag-chip portfolio-meta-tag-btn" aria-describedby="pmt-tip-workshops"><svg class="cs-tag-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg><span class="cs-tag-chip__text">Workshops</span></button><span id="pmt-tip-workshops" class="portfolio-meta-tag-tip" role="tooltip">At PwC I led the effort that upskilled 120+ designers in Figma: I built the curriculum and the roadmap that moved our whole design department from Sketch to Figma in nine months.</span></span></div>`;
          fadeSwap(`<div class="sm-fade">${portfolioTagsHtml}<div class="portfolio-masonry">${items}</div></div>`);
        })
        .catch(() => {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load portfolio images.</p></div>`);
        });
    }

    // ── Photos: immersive curated grid with lightbox ──
    let photoLightbox = null;
    function ensurePhotoLightbox() {
      if (photoLightbox) return photoLightbox;
      const ov = document.createElement('div');
      ov.className = 'photo-lightbox';
      ov.innerHTML =
        '<button class="photo-lb-btn photo-lb-close" aria-label="Close">' +
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
        '</button>' +
        '<button class="photo-lb-btn photo-lb-prev" aria-label="Previous">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
        '</button>' +
        '<img class="photo-lb-img" alt="">' +
        '<button class="photo-lb-btn photo-lb-next" aria-label="Next">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
        '</button>';
      document.body.appendChild(ov);
      const state = { el: ov, img: ov.querySelector('.photo-lb-img'), list: [], idx: 0 };
      photoLightbox = state;

      const show = (i) => {
        if (!state.list.length) return;
        state.idx = (i + state.list.length) % state.list.length;
        state.img.src = state.list[state.idx];
      };
      const close = () => { ov.classList.remove('is-open'); state.img.src = ''; };
      state.open = (list, i) => { state.list = list; ov.classList.add('is-open'); show(i); };

      ov.querySelector('.photo-lb-close').addEventListener('click', close);
      ov.querySelector('.photo-lb-prev').addEventListener('click', (e) => { e.stopPropagation(); show(state.idx - 1); });
      ov.querySelector('.photo-lb-next').addEventListener('click', (e) => { e.stopPropagation(); show(state.idx + 1); });
      ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
      document.addEventListener('keydown', (e) => {
        if (!ov.classList.contains('is-open')) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(state.idx - 1);
        else if (e.key === 'ArrowRight') show(state.idx + 1);
      });
      return state;
    }

    function renderPhotosGrid() {
      sModalTitle.textContent = 'Photos';
      showModalSectionIconFromSlug('photos');
      sModalBack.style.display = 'none';
      fadeSwap(`<div class="sm-list sm-fade sm-loading"><span style="color:var(--text-secondary);font-size:0.85rem">Loading…</span></div>`);
      fetch('/api/content/list?category=photos')
        .then(r => r.json())
        .then(({ images }) => {
          if (!images || !images.length) {
            fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic;margin-top:8px">No photos yet.</p></div>`);
            return;
          }
          const items = images.map((img, i) =>
            `<button class="photo-item" data-idx="${i}"><img src="${escHtml(img.thumb || img.src)}" alt="" loading="lazy"></button>`
          ).join('');
          fadeSwap(`<div class="sm-fade"><div class="photos-masonry">${items}</div></div>`);
          setTimeout(() => {
            sModalBody.scrollTop = 0;
            const fulls = images.map(img => img.src);
            sModalBody.querySelectorAll('.photo-item').forEach(btn => {
              btn.addEventListener('click', () => ensurePhotoLightbox().open(fulls, +btn.dataset.idx));
            });
          }, 140);
        })
        .catch(() => {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load photos.</p></div>`);
        });
    }

    function renderLabsGrid() {
      sModalTitle.textContent = 'Labs';
      showModalSectionIconFromSlug('labs');
      sModalBack.style.display = 'none';
      const arrow = '<svg class="lab-card-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';
      const cards = LABS.map(l => `
        <a class="lab-card" href="${escHtml(l.url)}" target="_blank" rel="noopener noreferrer">
          <div class="lab-card-thumb"><img src="${encodeURI(l.thumb)}" alt="${escHtml(l.title)}" loading="lazy"></div>
          <div class="lab-card-info">
            <span class="lab-card-title">${escHtml(l.title)}${arrow}</span>
            <span class="lab-card-desc">${escHtml(l.desc)}</span>
          </div>
        </a>`).join('');
      fadeSwap(`<div class="sm-fade"><div class="labs-grid">${cards}</div></div>`);
      setTimeout(() => { sModalBody.scrollTop = 0; }, 140);
    }

    function parseCareerMd(md) {
      const body = md.replace(/^---[\s\S]*?---\n?/, '');
      const sections = body.split(/^## /m).filter(s => s.trim());
      if (!sections.length) return mdToHTML(body);

      return sections.map(section => {
        const lines = section.split('\n');
        const titleLine = lines[0].trim();

        const meta = {};
        const bullets = [];
        const bodyLines = [];

        lines.slice(1).forEach(line => {
          const metaM = line.match(/^\*\*([^*]+):\*\*\s*(.+)/);
          if (metaM) {
            meta[metaM[1].trim()] = metaM[2].trim();
          } else if (line.startsWith('- ')) {
            bullets.push(line.slice(2));
          } else if (line.startsWith('---') || line.startsWith('___')) {
            // skip horizontal rules
          } else if (line.trim()) {
            bodyLines.push(line.trim());
          }
        });

        const metaParts = [meta['Company'], meta['Period'], meta['Location']]
          .filter(Boolean)
          .map(s => escHtml(s));
        const metaHtml = metaParts.length ? `<div class="career-meta">${metaParts.join(' · ')}</div>` : '';

        const bodyText = bodyLines.filter(l => !l.startsWith('#')).join(' ').trim();
        const bodyHtml = bodyText ? `<p class="career-body">${escHtml(bodyText)}</p>` : '';

        const bulletsHtml = bullets.length
          ? `<ul class="career-bullets">${bullets.map(b => `<li>${escHtml(b)}</li>`).join('')}</ul>`
          : '';

        const focus = meta['Focus areas'];
        const tagsHtml = focus
          ? `<div class="career-tags">${focus.split(/\s*[·•]\s*/).map(t => `<span class="cs-tag-chip"><span class="cs-tag-chip__text">${escHtml(t.trim())}</span></span>`).join('')}</div>`
          : '';

        return `<div class="career-entry">
          <div class="career-dot"></div>
          <div class="career-content">
            <div class="career-title">${escHtml(titleLine)}</div>
            ${metaHtml}${bodyHtml}${bulletsHtml}${tagsHtml}
          </div>
        </div>`;
      }).join('');
    }

    function renderCareerTimeline() {
      sModalTitle.textContent = 'Career';
      showModalSectionIconFromSlug('career');
      sModalBack.style.display = 'none';
      fadeSwap(`<div class="sm-list sm-fade sm-loading"><span style="color:var(--text-secondary);font-size:0.85rem">Loading…</span></div>`);
      fetch('/content/career.md')
        .then(r => {
          if (!r.ok) throw new Error('not found');
          return r.text();
        })
        .then(md => {
          const html = parseCareerMd(md);
          fadeSwap(`<div class="career-timeline sm-fade">${html}</div>`);
          setTimeout(() => { sModalBody.scrollTop = 0; }, 140);
        })
        .catch(() => {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load career timeline.</p></div>`);
        });
    }

    function renderResumeEmbed() {
      sModalTitle.textContent = 'Resume';
      showModalSectionIconFromSlug('resume');
      sModalBack.style.display = 'none';
      const fileId = '12z8vaL3zClS4kFtPt13BdA91uxpIo91H';
      const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      fadeSwap(`<div class="resume-embed-wrap sm-fade">
        <div class="resume-pdf-clip">
          <iframe class="resume-pdf-frame" src="${previewUrl}" title="Resume PDF" allow="autoplay" loading="lazy"></iframe>
        </div>
        <div class="resume-actions">
          <a class="resume-download-btn" href="${downloadUrl}" target="_blank" rel="noopener noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download PDF
          </a>
        </div>
      </div>`);
    }

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (modalIsOpen) return;
        renderPrevList();
        openSModal();
      });
    }

    function renderIndex(section) {
      const data = SECTIONS[section];
      if (!data) return;
      sModalTitle.textContent = data.label;
      showModalSectionIconFromSlug(section);
      sModalBack.style.display = 'none';

      if (section === 'portfolio') { renderPortfolioGrid(); return; }
      if (section === 'career')    { renderCareerTimeline(); return; }
      if (section === 'resume')    { renderResumeEmbed(); return; }
      if (section === 'photos')    { renderPhotosGrid(); return; }
      if (section === 'labs')      { renderLabsGrid(); return; }

      if (section === 'videos') {
        renderMixedIndex(section);
        return;
      }

      // Dynamic markdown-based sections
      fadeSwap(`<div class="sm-list sm-fade sm-loading"><span style="color:var(--text-secondary);font-size:0.85rem">Loading…</span></div>`);
      fetch(`/api/content/list?category=${section}`)
        .then(r => r.json())
        .then(({ items, files }) => {
          const mdItems = items || (files || []).map(f => ({ file: f, date: '1970-01-01' }));
          mdItems.sort((a, b) => b.date.localeCompare(a.date));
          if (!mdItems.length) {
            fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic;margin-top:8px">Nothing here yet.</p></div>`);
            return;
          }
          const rows = mdItems.map(({ file, date }) => {
            const name = file.replace(/\.md$/, '');
            const slug = filenameToSlug(name);
            return `<button class="sm-row" data-section="${section}" data-slug="${slug}">
              <span class="sm-row-title">${name}</span>
              <span class="sm-row-sub">${date}</span>
            </button>`;
          }).join('');
          fadeSwap(`<div class="sm-list sm-fade">${rows}</div>`);
          setTimeout(() => {
            sModalBody.scrollTop = indexScrollPos;
            sModalBody.querySelectorAll('.sm-row').forEach(btn => {
              btn.addEventListener('click', () => {
                indexScrollPos = sModalBody.scrollTop;
                location.hash = `#${btn.dataset.section}/${btn.dataset.slug}`;
              });
            });
          }, 140);
        })
        .catch(() => {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic;margin-top:8px">Couldn't load content.</p></div>`);
        });
    }

    function renderItem(section, slug) {
      const data = SECTIONS[section];
      if (!data) return;
      sModalTitle.textContent = data.label;
      clearModalSectionIcon();
      sModalBack.style.display = 'flex';

      if (section === 'videos') {
        // YouTube video IDs are 11 chars of base64url
        if (/^[A-Za-z0-9_-]{11}$/.test(slug)) {
          renderVideoItem(section, slug);
          return;
        }
        // Markdown article in content/[section]/
        fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-size:0.85rem">Loading…</p></div>`);
        fetch(`/api/content/list?category=${section}`)
          .then(r => r.json())
          .then(({ items, files }) => {
            const fileList = items ? items.map(i => i.file) : (files || []);
            const filename = slugToFilename(slug, fileList);
            if (!filename) { fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Not found.</p></div>`); return null; }
            return fetch(`/content/${section}/${encodeURIComponent(filename)}`).then(r => r.text());
          })
          .then(md => { if (md) { fadeSwap(`<div class="sm-fade cs-body">${mdToHTML(md)}</div>`); setTimeout(() => { sModalBody.scrollTop = 0; }, 140); } })
          .catch(() => { fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load content.</p></div>`); });
        return;
      }

      // Markdown-based sections: fetch file list to resolve slug → filename, then fetch markdown
      fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-size:0.85rem">Loading…</p></div>`);
      fetch(`/api/content/list?category=${section}`)
        .then(r => r.json())
        .then(({ items, files }) => {
          const fileList = items ? items.map(i => i.file) : (files || []);
          const filename = slugToFilename(slug, fileList);
          if (!filename) {
            fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Not found.</p></div>`);
            return;
          }
          return fetch(`/content/${section}/${encodeURIComponent(filename)}`).then(r => r.text());
        })
        .then(md => {
          if (!md) return;
          fadeSwap(`<div class="sm-fade cs-body">${mdToHTML(md)}</div>`);
          setTimeout(() => { sModalBody.scrollTop = 0; }, 140);
        })
        .catch(() => {
          fadeSwap(`<div class="sm-fade"><p style="color:var(--text-secondary);font-style:italic">Couldn't load content.</p></div>`);
        });
    }

    function renderNowBoard() {
      sModal.classList.add('sm-now');
      sModalTitle.textContent = 'Now';
      clearModalSectionIcon();
      sModalBack.style.display = 'none';

      const board = document.createElement('div');
      board.className = 'now-modal-board';
      board.innerHTML =
        '<div class="now-board-head">' +
          '<div class="now-board-head-left">' +
            '<span class="now-board-wordmark">NOW</span>' +
          '</div>' +
        '</div>' +
        '<div class="now-board-rows" id="nbRows"></div>' +
        '<div class="now-board-foot">' +
          '<span class="now-board-foot-label">UPDATED</span>' +
          '<div class="now-board-foot-cells" id="nbFootCells"></div>' +
        '</div>';

      sModalBody.innerHTML = '';
      sModalBody.appendChild(board);

      // Expansion animation from now strip
      if (_nowStripRect) {
        const stripRect = _nowStripRect;
        _nowStripRect = null;
        const frameW = window.innerWidth * 0.68;
        const frameH = window.innerHeight * 0.85;
        const tx = (stripRect.left + stripRect.width / 2) - window.innerWidth / 2;
        const ty = (stripRect.top + stripRect.height / 2) - window.innerHeight / 2;
        const sx = stripRect.width / frameW;
        const sy = stripRect.height / frameH;
        sModalFrame.animate([
          { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`, borderRadius: '12px', opacity: '0.7' },
          { transform: 'translate(0, 0) scale(1)', borderRadius: '20px', opacity: '1' }
        ], { duration: 520, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'none' });
      }

      function makeNbCell(parent) {
        const el = document.createElement('div');
        el.className = 'nb-cell';
        el.innerHTML =
          '<div class="ct"><div class="cw"> </div></div>' +
          '<div class="cb"><div class="cw"> </div></div>' +
          '<div class="ft"><div class="cw"> </div></div>' +
          '<div class="fb"><div class="cw"> </div></div>';
        const ct = el.querySelector('.ct .cw');
        const cb = el.querySelector('.cb .cw');
        const ftEl = el.querySelector('.ft');
        const fbEl = el.querySelector('.fb');
        const ft = ftEl.querySelector('.cw');
        const fb = fbEl.querySelector('.cw');
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
            return Promise.resolve();
          }
          const old = cur;
          cur = nc;
          return new Promise(resolve => {
            ct.textContent = nc;
            ft.textContent = old;
            fb.textContent = nc;
            fbEl.style.transition = 'none';
            fbEl.style.transform = 'rotateX(90deg)';
            void fbEl.offsetWidth;
            ftEl.style.transition = 'transform 120ms ease-in';
            ftEl.style.transform = 'rotateX(-90deg)';
            setTimeout(() => {
              fbEl.style.transition = 'transform 120ms ease-out';
              fbEl.style.transform = 'rotateX(0deg)';
            }, 60);
            setTimeout(() => {
              cb.textContent = nc;
              fbEl.style.transition = 'none'; fbEl.style.transform = 'rotateX(90deg)';
              ftEl.style.transition = 'none'; ftEl.style.transform = 'rotateX(0deg)';
              ft.textContent = nc;
              resolve();
            }, 192);
          });
        }
        parent.appendChild(el);
        return { el, setChar };
      }

      const MAX = 24;
      function makeNbRow(parent, label) {
        const row = document.createElement('div');
        row.className = 'now-board-row';
        const lbl = document.createElement('div');
        lbl.className = 'now-board-label';
        lbl.textContent = label;
        const cellsWrap = document.createElement('div');
        cellsWrap.className = 'now-board-cells';
        const cells = [];
        for (let i = 0; i < MAX; i++) cells.push(makeNbCell(cellsWrap));
        row.appendChild(lbl);
        row.appendChild(cellsWrap);
        parent.appendChild(row);
        function setValue(val, animate, baseDelay) {
          baseDelay = baseDelay || 0;
          const padded = (val || '').toUpperCase().padEnd(MAX, ' ').slice(0, MAX);
          const promises = [];
          for (let i = 0; i < MAX; i++) {
            const ch = padded[i];
            if (animate) {
              const d = baseDelay + i * 75;
              promises.push(new Promise(r => setTimeout(() => cells[i].setChar(ch, true).then(r), d)));
            } else {
              cells[i].setChar(ch, false);
            }
          }
          return Promise.all(promises);
        }
        function startTicker(fullVal) {
          const val = (fullVal || '').toUpperCase();
          const padded = val + '   ';
          if (padded.length <= MAX) return;
          let offset = 0;
          let tid;
          function advance() {
            offset = (offset + 1) % padded.length;
            const slice = (padded + padded).slice(offset, offset + MAX);
            for (let i = 0; i < MAX; i++) cells[i].setChar(slice[i] || ' ', true);
            // Long pause when the full string has cycled back to the start
            tid = setTimeout(advance, offset === 0 ? 5000 : 340);
          }
          // Hold the initial view for 1.4s (matching now-strip's PAUSE_AFTER_LOAD)
          // before the first scroll begins
          tid = setTimeout(advance, 1400);
        }
        return { row, setValue, startTicker };
      }

      const LABELS = ['READING','LISTENING','BUILDING','WRITING','WATCHING','THINKING','LOCATION'];
      const ROW_STAGGER = 162;
      const rowsEl = board.querySelector('#nbRows');
      const footCellsEl = board.querySelector('#nbFootCells');

      const rows = LABELS.map(lbl => makeNbRow(rowsEl, lbl));
      rows.forEach(r => r.setValue('–'.repeat(MAX), false));

      function renderFooterDate(dateStr) {
        footCellsEl.textContent = dateStr;
      }

      fetch('/src/data/now.json')
        .then(res => res.json())
        .then(data => {
          data.items.forEach((item, i) => {
            if (item.note && rows[i]) {
              rows[i].row.classList.add('has-note');
              const noteEl = document.createElement('div');
              noteEl.className = 'now-board-row-note';
              noteEl.textContent = item.note;
              rows[i].row.appendChild(noteEl);
            }
          });
          renderFooterDate(data.updatedAt || '');
          data.items.forEach((item, i) => {
            if (rows[i]) {
              rows[i].setValue(item.value, true, i * ROW_STAGGER);
              // Start ticker after the row's flip-in finishes + 1s reading pause
              const tickerDelay = i * ROW_STAGGER + (MAX - 1) * 75 + 192 + 1000;
              setTimeout(() => rows[i].startTicker(item.value), tickerDelay);
            }
          });
        })
        .catch(() => {
          const defaults = [
            { value: 'Piranesi' },
            { value: 'Hand Habits' },
            { value: 'Axon Labs' },
            { value: 'WFH systems' },
            { value: 'Severance S2' },
            { value: 'Slow attention' },
            { value: 'Atlanta, GA' }
          ];
          renderFooterDate('2026-03-14');
          defaults.forEach((item, i) => {
            if (rows[i]) {
              rows[i].setValue(item.value, true, i * ROW_STAGGER);
              const tickerDelay = i * ROW_STAGGER + (MAX - 1) * 75 + 192 + 1000;
              setTimeout(() => rows[i].startTicker(item.value), tickerDelay);
            }
          });
        });
    }

    function handleHash() {
      const parsed = parseHash();

      if (parsed && parsed.section === 'versions' && !parsed.item) {
        closeSModal();
        showVersionScreenFromHash();
        return;
      }

      hideVersionScreenIfNeeded();

      if (!parsed) { closeSModal(); return; }

      if (parsed.section === 'now') {
        openSModal();
        renderNowBoard();
        return;
      }

      if (!SECTIONS[parsed.section]) {
        closeSModal();
        return;
      }
      openSModal();
      if (parsed.item) {
        renderItem(parsed.section, parsed.item);
      } else {
        indexScrollPos = 0;
        renderIndex(parsed.section);
      }
    }

    // App icon clicks → hash
    document.querySelectorAll('.app').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = SECTION_SLUGS[btn.dataset.app];
        if (slug) { indexScrollPos = 0; location.hash = `#${slug}`; }
      });
    });

    // Back → section index
    sModalBack.addEventListener('click', () => {
      const parsed = parseHash();
      if (parsed) { location.hash = `#${parsed.section}`; }
    });

    // Close
    function doClose() { closeSModal(); }
    sModalClose.addEventListener('click', doClose);
    sModal.addEventListener('click', e => { if (e.target === sModal) doClose(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalIsOpen) doClose(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && versionScreen && versionScreen.classList.contains('visible')) closeVersionScreen();
    });

    window.addEventListener('hashchange', handleHash);

    // Restore mode from URL query param
    if (location.search === '?work') setMode('work');
    else if (location.search === '?bookshelf') setMode('bookshelf');
    else if (location.search === '?gear') setMode('gear');
    else if (location.search === '?appstack') setMode('appstack');
    else if (location.search === '?places') setMode('places');
    else if (location.search === '?chat') setMode('chat');

    // Deep link on load
    handleHash();

    // Warm up Places (Mapbox script + token + pins) on idle so the first
    // click is near-instant. Falls back to setTimeout for Safari.
    const schedulePreload = window.requestIdleCallback
      ? cb => window.requestIdleCallback(cb, { timeout: 3000 })
      : cb => setTimeout(cb, 1500);
    schedulePreload(() => { try { preloadPlaces(); } catch (_) {} });

    window.setMode = setMode;
