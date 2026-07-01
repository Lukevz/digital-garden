/**
 * Home feed — videos carousel, writing table, projects masonry, logbook stacks.
 */
(function () {
  const YT_HANDLES = ['lukevanzylofficial', 'uxwithluke'];
  const videoCache = {};

  const PROJECTS = [
    { title: 'GymBud',          desc: 'Interval timer for strength training',              tall: true  },
    { title: 'Research Garden',   desc: 'Document rabbit-hole research sessions',            tall: false },
    { title: 'Digital Garden',    desc: 'Bear-style notes in the browser',                   tall: true  },
    { title: 'Flight Board',    desc: 'Solari-style project tracker',                      tall: false },
    { title: 'Now Board',       desc: 'What I\'m focused on right now',                    tall: true  },
    { title: 'Particle Field',  desc: 'Black hole particle simulation background',         tall: false },
  ];

  const LOGBOOK_STACKS = [
    {
      id: 'books',
      label: 'Books',
      colors: ['#4a3728', '#2a1a10'],
      items: [
        { title: 'Phoebe Berman\'s Gonna Lose It', sub: 'Brooke Averick' },
        { title: 'Heir to the Empire', sub: 'Timothy Zahn' },
        { title: 'Ready Player One', sub: 'Ernest Cline' },
        { title: 'Building a Second Brain', sub: 'Tiago Forte' },
        { title: 'Steal Like an Artist', sub: 'Austin Kleon' },
      ],
    },
    {
      id: 'tv',
      label: 'TV',
      colors: ['#2a3a5c', '#141c2e'],
      items: [
        { title: 'Severance', sub: 'Season 2' },
        { title: 'The Bear', sub: 'Season 3' },
        { title: 'Andor', sub: 'Rewatch' },
        { title: 'Slow Horses', sub: 'Apple TV+' },
      ],
    },
    {
      id: 'movies',
      label: 'Movies',
      colors: ['#3d2a4a', '#1a1020'],
      items: [
        { title: 'Dune: Part Two', sub: '2024' },
        { title: 'Past Lives', sub: '2023' },
        { title: 'The Holdovers', sub: '2023' },
      ],
    },
    {
      id: 'games',
      label: 'Games',
      colors: ['#1e4a3a', '#0a2018'],
      items: [
        { title: 'Hades II', sub: 'Early access' },
        { title: 'Balatro', sub: 'Mobile' },
        { title: 'Zelda: TOTK', sub: 'Slow playthrough' },
      ],
    },
    {
      id: 'music',
      label: 'Music',
      colors: ['#4a3a1e', '#201808'],
      items: [
        { title: 'Hand Habits', sub: 'On repeat' },
        { title: 'Japanese Breakfast', sub: 'Jubilee' },
        { title: 'Khruangbin', sub: 'Live sessions' },
        { title: 'Bon Iver', sub: 'SABLE' },
      ],
    },
  ];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function filenameToSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function formatDate(iso) {
    if (!iso || iso === '1970-01-01') return '';
    const d = new Date(iso + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function cleanTitle(name) {
    return name.replace(/\.md$/, '').replace(/^B\.\s*/, '');
  }

  function cloneAppIcon(appName, target) {
    const src = document.querySelector(`.app[data-app="${appName}"] .app-icon svg`);
    if (!src || !target) return;
    const clone = src.cloneNode(true);
    const ids = [...clone.querySelectorAll('[id]')].map(el => el.id).filter(Boolean).sort((a, b) => b.length - a.length);
    const suffix = 'hf' + Date.now().toString(36);
    let html = new XMLSerializer().serializeToString(clone);
    ids.forEach(id => {
      const nid = id + suffix;
      html = html.split(`id="${id}"`).join(`id="${nid}"`);
      html = html.split(`url(#${id})`).join(`url(#${nid})`);
    });
    target.innerHTML = html;
  }

  function fetchChannelVideos(handle) {
    if (videoCache[handle]) return Promise.resolve(videoCache[handle]);
    return fetch(`/api/youtube/channel-videos?handle=${handle}`)
      .then(r => r.json())
      .then(({ videos }) => {
        videoCache[handle] = videos || [];
        return videoCache[handle];
      })
      .catch(() => []);
  }

  function fetchAllVideos() {
    return Promise.all(YT_HANDLES.map(fetchChannelVideos)).then(lists => {
      const merged = lists.flat();
      merged.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      return merged;
    });
  }

  function renderVideos(videos) {
    const el = document.getElementById('videoCarousel');
    if (!el) return;

    if (!videos.length) {
      el.innerHTML = '<p class="home-empty">No videos yet.</p>';
      return;
    }

    const hero = videos[0];
    const rest = videos.slice(1, 5);
    const heroTitle = esc(hero.title);
    const heroDate = formatDate((hero.publishedAt || '').slice(0, 10));

    let html = `<a class="video-hero" href="#videos/${hero.videoId}" aria-label="Play: ${heroTitle}">
      <div class="video-hero__bg" style="background-image:url('${esc(hero.thumbnail)}')"></div>
      <div class="video-hero__shade"></div>
      <span class="video-hero__play" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </span>
      <div class="video-hero__meta">
        <p class="video-hero__title">${heroTitle}</p>
        ${heroDate ? `<span class="video-hero__date">${heroDate}</span>` : ''}
      </div>
    </a>`;

    if (rest.length) {
      html += '<div class="video-row">';
      rest.forEach(v => {
        const t = esc(v.title);
        html += `<a class="video-thumb" href="#videos/${v.videoId}" aria-label="${t}">
          <img src="${esc(v.thumbnail)}" alt="" loading="lazy">
          <span class="video-thumb__title">${t}</span>
        </a>`;
      });
      html += '</div>';
    }

    el.innerHTML = html;
  }

  function renderWriting(items) {
    const el = document.getElementById('writingTable');
    if (!el) return;

    const posts = (items || [])
      .map(({ file, date }) => ({ title: cleanTitle(file), slug: filenameToSlug(cleanTitle(file)), date: date || '' }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    if (!posts.length) {
      el.innerHTML = '<p class="home-empty">Nothing published yet.</p>';
      return;
    }

    const rows = posts.map(p => `
      <tr>
        <td><a href="#writing/${esc(p.slug)}">${esc(p.title)}</a></td>
        <td>${esc(formatDate(p.date))}</td>
      </tr>`).join('');

    el.innerHTML = `<table class="writing-table">
      <thead><tr><th>Title</th><th>Date</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function renderProjects() {
    const el = document.getElementById('projectsMasonry');
    if (!el) return;

    el.innerHTML = PROJECTS.map(p => `
      <a class="project-card" href="#" tabindex="0" aria-label="${esc(p.title)}" style="aspect-ratio:3/${p.tall ? 4.6 : 3.6}">
        <div class="project-card__fill"></div>
        <div class="project-card__overlay">
          <p class="project-card__title">${esc(p.title)}</p>
          <p class="project-card__desc">${esc(p.desc)}</p>
        </div>
      </a>`).join('');
  }

  function renderLogbookStacks() {
    const el = document.getElementById('logbookStacks');
    if (!el) return;

    el.innerHTML = LOGBOOK_STACKS.map(stack => {
      const items = stack.items.map((item, i) => `
        <div class="logbook-item" style="transition-delay:${i * 45}ms">
          ${esc(item.title)}
          ${item.sub ? `<span class="logbook-item__sub">${esc(item.sub)}</span>` : ''}
        </div>`).join('');

      const cards = [0, 1, 2].map(() =>
        `<div class="logbook-stack__card" style="--stack-a:${stack.colors[0]};--stack-b:${stack.colors[1]}"></div>`
      ).join('');

      return `<div class="logbook-stack" data-stack="${stack.id}">
        <button type="button" class="logbook-stack__btn" aria-expanded="false" aria-controls="stack-grid-${stack.id}">
          <div class="logbook-stack__pile" aria-hidden="true">${cards}</div>
          <span class="logbook-stack__label">${esc(stack.label)} <span class="logbook-stack__count">(${stack.items.length})</span></span>
        </button>
        <div class="logbook-stack__grid" id="stack-grid-${stack.id}" hidden>${items}</div>
      </div>`;
    }).join('');

    el.querySelectorAll('.logbook-stack__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stack = btn.closest('.logbook-stack');
        const grid = stack.querySelector('.logbook-stack__grid');
        const expanded = stack.classList.toggle('is-expanded');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        grid.hidden = !expanded;

        // Collapse other stacks
        if (expanded) {
          el.querySelectorAll('.logbook-stack.is-expanded').forEach(other => {
            if (other === stack) return;
            other.classList.remove('is-expanded');
            other.querySelector('.logbook-stack__btn').setAttribute('aria-expanded', 'false');
            other.querySelector('.logbook-stack__grid').hidden = true;
          });
        }
      });
    });
  }

  function initIcons() {
    document.querySelectorAll('[data-clone-icon]').forEach(slot => {
      cloneAppIcon(slot.dataset.cloneIcon, slot);
    });
  }

  function init() {
    initIcons();
    renderProjects();
    renderLogbookStacks();

    fetchAllVideos().then(renderVideos);

    fetch('/api/content/list?category=writing')
      .then(r => r.json())
      .then(({ items, files }) => {
        const list = items || (files || []).map(f => ({ file: f, date: '1970-01-01' }));
        renderWriting(list);
      })
      .catch(() => {
        const el = document.getElementById('writingTable');
        if (el) el.innerHTML = '<p class="home-empty">Couldn\'t load posts.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.scrollToHomeSection = function (id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
