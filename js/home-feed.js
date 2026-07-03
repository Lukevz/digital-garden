/**
 * Home feed — case studies split (rendered in main.js), writing table,
 * videos thumbnails, photos masonry.
 */
(function () {
  const YT_HANDLES = ['lukevanzylofficial', 'uxwithluke'];
  const videoCache = {};

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
      .then(({ videos, channelTitle }) => {
        videoCache[handle] = (videos || []).map(v => ({
          ...v,
          channel: channelTitle || handle,
        }));
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

  function filmstripFrame(v) {
    const title = esc(v.title);
    const channel = esc(v.channel || '');
    return `<a class="filmstrip-frame" href="#videos/${v.videoId}" aria-label="${title}">
      <div class="filmstrip-frame__media">
        <img src="${esc(v.thumbnail)}" alt="" loading="lazy">
      </div>
      <div class="filmstrip-frame__body">
        ${channel ? `<span class="filmstrip-frame__eyebrow">${channel}</span>` : ''}
        <h3 class="filmstrip-frame__title">${title}</h3>
      </div>
    </a>`;
  }

  function renderVideos(videos) {
    const el = document.getElementById('videoFilmstrip');
    if (!el) return;

    if (!videos.length) {
      el.innerHTML = '<p class="home-empty">No videos yet.</p>';
      return;
    }

    const frames = videos.slice(0, 12).map(filmstripFrame).join('');
    el.innerHTML = `<div class="video-filmstrip__track">${frames}</div>`;
  }

  function photoTile(img) {
    const src = img.thumb || img.src;
    return `<div class="home-photo">
      <img src="${esc(src)}" alt="" loading="lazy" decoding="async">
    </div>`;
  }

  function renderPhotos(images) {
    const el = document.getElementById('homePhotosGrid');
    if (!el) return;

    if (!images.length) {
      el.innerHTML = '<p class="home-empty">No photos yet.</p>';
      return;
    }

    // Cap the count so the masonry stays ~2-3 rows tall (see .home-photos-masonry).
    const tiles = images.slice(0, 15).map(photoTile).join('');
    el.innerHTML = `<div class="home-photos-masonry">${tiles}</div>`;
  }

  function renderWriting(items) {
    const el = document.getElementById('writingTable');
    if (!el) return;

    const posts = (items || [])
      // Slug must match slugToFilename() in main.js, which slugifies the raw
      // filename (minus .md) — so build it from `file`, not the cleaned title,
      // or "B. …" book notes route to "Not found".
      .map(({ file, date }) => ({ title: cleanTitle(file), slug: filenameToSlug(file.replace(/\.md$/, '')), date: date || '' }))
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

  function initIcons() {
    document.querySelectorAll('[data-clone-icon]').forEach(slot => {
      cloneAppIcon(slot.dataset.cloneIcon, slot);
    });
  }

  function init() {
    initIcons();

    fetchAllVideos().then(renderVideos);

    fetch('/api/content/list?category=photos')
      .then(r => r.json())
      .then(({ images }) => renderPhotos(images || []))
      .catch(() => {
        const el = document.getElementById('homePhotosGrid');
        if (el) el.innerHTML = '<p class="home-empty">Couldn\'t load photos.</p>';
      });

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
