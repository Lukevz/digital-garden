/**
 * Travel Log — stamp grid, metrics, and itinerary modal.
 */

import { parseTravel } from './travel-parser.js';

/** @type {object[]} */
let trips = [];
/** @type {Map<string, { thumbs: string[], images: string[] }>} */
let albumMap = new Map();
let rendered = false;
let modalOpen = false;
let pendingTripSlug = null;

/** @type {object} */
let deps = {};

function galleryUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return path;
  return `/v1/${path}`;
}
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filenameToCaption(path) {
  const base = path.split('/').pop() || path;
  return base.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}

function formatDateRange(start, end) {
  if (!start && !end) return '';
  if (start && end) {
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    if (start.slice(0, 4) === end.slice(0, 4)) {
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', opts)}`;
    }
    return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
  }
  return start || end;
}

function formatMetric(num) {
  if (num >= 1000) return num.toLocaleString('en-US');
  return String(num);
}

function getAlbumPhotos(trip) {
  if (!trip.galleryAlbum) return [];
  const album = albumMap.get(trip.galleryAlbum);
  if (!album) return [];
  return album.thumbs.length ? album.thumbs : album.images;
}

function getCoverPhoto(trip) {
  const photos = getAlbumPhotos(trip);
  return photos[0] || null;
}

function computeAggregates() {
  const countries = new Set(trips.map(t => t.country).filter(Boolean));
  return {
    totalTrips: trips.length,
    totalDays: trips.reduce((sum, t) => sum + (t.daysAbroad || 0), 0),
    totalMiles: trips.reduce((sum, t) => sum + (t.miles || 0), 0),
    countries: countries.size,
  };
}

function createMetricCard(label, value) {
  const card = document.createElement('div');
  card.className = 'travel-metric-card';
  card.innerHTML = `
    <span class="travel-metric-card__value">${escapeHtml(value)}</span>
    <span class="travel-metric-card__label">${escapeHtml(label)}</span>
  `;
  return card;
}

function createStampCard(trip) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'travel-stamp';
  btn.dataset.slug = trip.slug;
  btn.style.setProperty('--stamp-color', trip.stampColor);
  btn.setAttribute('aria-label', `Open ${trip.city} trip`);

  const cover = getCoverPhoto(trip);
  const art = document.createElement('div');
  art.className = 'travel-stamp__art';
  if (cover) {
    const img = document.createElement('img');
    img.src = galleryUrl(cover);
    img.alt = '';
    img.loading = 'lazy';
    art.appendChild(img);
  } else {
    const initial = document.createElement('span');
    initial.className = 'travel-stamp__initial';
    initial.textContent = (trip.city || '?').charAt(0).toUpperCase();
    art.appendChild(initial);
  }

  const city = document.createElement('span');
  city.className = 'travel-stamp__city';
  city.textContent = trip.city;

  const dates = document.createElement('span');
  dates.className = 'travel-stamp__dates';
  dates.textContent = formatDateRange(trip.startDate, trip.endDate);

  btn.append(art, city, dates);
  btn.addEventListener('click', () => openTravelModal(trip.slug));
  return btn;
}

function renderMarkdownBody(text) {
  const wrap = document.createElement('div');
  wrap.className = 'travel-modal__notes';
  text.split(/\n\n+/).forEach(para => {
    if (!para.trim()) return;
    const p = document.createElement('p');
    p.textContent = para.trim();
    wrap.appendChild(p);
  });
  return wrap;
}

function createPolaroid(src, caption, rotation) {
  const figure = document.createElement('figure');
  figure.className = 'travel-polaroid';
  figure.style.setProperty('--polaroid-rotate', `${rotation}deg`);

  const photo = document.createElement('div');
  photo.className = 'travel-polaroid__photo';
  const img = document.createElement('img');
  img.src = galleryUrl(src);
  img.alt = caption;
  img.loading = 'lazy';
  photo.appendChild(img);

  const cap = document.createElement('figcaption');
  cap.className = 'travel-polaroid__caption';
  cap.textContent = caption;

  figure.append(photo, cap);
  return figure;
}

function buildItinerary(trip) {
  const container = document.createElement('div');
  container.className = 'travel-itinerary';

  const photos = getAlbumPhotos(trip);
  const route = trip.route.length ? trip.route : ['No itinerary notes yet.'];
  const rotations = [-2.5, 1.8, -1.2, 2.4, -1.8, 0.6];

  route.forEach((stop, i) => {
    const item = document.createElement('div');
    item.className = 'travel-itinerary__item';

    const marker = document.createElement('span');
    marker.className = 'travel-itinerary__marker';
    marker.textContent = String(i + 1);

    const text = document.createElement('p');
    text.className = 'travel-itinerary__text';
    text.textContent = stop;

    item.append(marker, text);
    container.appendChild(item);

    if (photos.length) {
      const photoSrc = photos[i % photos.length];
      const polaroid = createPolaroid(
        photoSrc,
        filenameToCaption(photoSrc),
        rotations[i % rotations.length]
      );
      container.appendChild(polaroid);
    }
  });

  return container;
}

export function openTravelModal(slug) {
  const trip = trips.find(t => t.slug === slug);
  if (!trip || !deps.travelModal) return;

  const modal = deps.travelModal;
  const titleEl = document.getElementById('travelModalTitle');
  const metricsEl = document.getElementById('travelModalMetrics');
  const bodyEl = document.getElementById('travelModalBody');
  const closeBtn = document.getElementById('travelModalClose');

  if (titleEl) titleEl.textContent = trip.title;
  if (metricsEl) {
    metricsEl.replaceChildren();
    const photoCount = getAlbumPhotos(trip).length;
    metricsEl.append(
      createMetricCard('Dates', formatDateRange(trip.startDate, trip.endDate) || '—'),
      createMetricCard('Miles', formatMetric(trip.miles || 0)),
      createMetricCard('Days abroad', String(trip.daysAbroad || 0)),
      createMetricCard('Photos', String(photoCount))
    );
  }

  if (bodyEl) {
    bodyEl.replaceChildren();
    bodyEl.appendChild(buildItinerary(trip));
    if (trip.body) bodyEl.appendChild(renderMarkdownBody(trip.body));
  }

  modalOpen = true;
  modal.style.pointerEvents = 'all';
  modal.classList.add('tm-open');
  document.body.style.overflow = 'hidden';
  if (deps.activateModalFocus) deps.activateModalFocus(modal, closeBtn);

  history.replaceState(null, '', `?travellog&trip=${encodeURIComponent(slug)}`);
}

export function closeTravelModal() {
  if (!modalOpen || !deps.travelModal) return;
  modalOpen = false;
  deps.travelModal.classList.remove('tm-open');
  deps.travelModal.style.pointerEvents = 'none';
  document.body.style.overflow = '';
  if (deps.restoreModalFocus) deps.restoreModalFocus(deps.travelModal);

  history.replaceState(null, '', '?travellog');
}

async function loadGalleryAlbums() {
  try {
    const mod = await import('/v1/gallery.js');
    const albums = mod.default || [];
    albumMap = new Map(
      albums.map(a => [a.folder, { thumbs: a.thumbs || [], images: a.images || [] }])
    );
  } catch {
    albumMap = new Map();
  }
}

async function loadTrips() {
  const res = await fetch('/api/content/list?category=travel');
  if (!res.ok) throw new Error('Failed to load travel list');
  const data = await res.json();
  const files = data.files || [];

  const loaded = await Promise.all(
    files.map(async file => {
      const r = await fetch(`/content/travel/${encodeURIComponent(file)}`);
      if (!r.ok) return null;
      const content = await r.text();
      return parseTravel(content, file);
    })
  );

  trips = loaded
    .filter(Boolean)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

function renderPage(view) {
  view.replaceChildren();

  const agg = computeAggregates();

  const header = document.createElement('header');
  header.className = 'travel-log-header';
  header.innerHTML = `
    <p class="travel-log-eyebrow">Expeditions</p>
    <h1 class="travel-log-title">Stamps</h1>
    <p class="travel-log-subtitle">Collected (${agg.totalTrips}/${agg.totalTrips}) — Cities I've been</p>
  `;

  const metricsRow = document.createElement('div');
  metricsRow.className = 'travel-log-metrics';
  metricsRow.append(
    createMetricCard('Trips', String(agg.totalTrips)),
    createMetricCard('Days abroad', formatMetric(agg.totalDays)),
    createMetricCard('Miles traveled', formatMetric(agg.totalMiles)),
    createMetricCard('Countries', String(agg.countries))
  );

  const section = document.createElement('section');
  section.className = 'travel-log-section';
  const sectionHead = document.createElement('h2');
  sectionHead.className = 'travel-log-section__title';
  sectionHead.textContent = 'City stamps';

  const grid = document.createElement('div');
  grid.className = 'travel-stamp-grid';
  trips.forEach(trip => grid.appendChild(createStampCard(trip)));

  section.append(sectionHead, grid);
  view.append(header, metricsRow, section);
}

let modalWired = false;

function wireModal() {
  if (modalWired) return;
  modalWired = true;
  const modal = deps.travelModal;
  const closeBtn = document.getElementById('travelModalClose');
  const overlay = document.getElementById('travelModalOverlay');

  closeBtn?.addEventListener('click', closeTravelModal);
  overlay?.addEventListener('click', closeTravelModal);

  modal?.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOpen) {
      e.preventDefault();
      closeTravelModal();
    }
    if (deps.trapModalTab) deps.trapModalTab(modal, e);
  });
}

/**
 * @param {object} options
 * @param {HTMLElement} options.view
 * @param {HTMLElement} options.travelModal
 * @param {Function} [options.activateModalFocus]
 * @param {Function} [options.restoreModalFocus]
 * @param {Function} [options.trapModalTab]
 * @param {string} [options.tripSlug]
 */
export async function initTravelLog(options) {
  deps = options;
  if (!deps.view) return;

  wireModal();

  if (!rendered) {
    await Promise.all([loadTrips(), loadGalleryAlbums()]);
    renderPage(deps.view);
    rendered = true;
  }

  const slug = options.tripSlug || pendingTripSlug;
  if (slug) {
    pendingTripSlug = null;
    const trip = trips.find(t => t.slug === slug);
    if (trip) openTravelModal(slug);
  }
}

export function setPendingTripSlug(slug) {
  pendingTripSlug = slug;
}

export async function renderTravelLog(options) {
  return initTravelLog(options);
}
