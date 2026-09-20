/**
 * Builds one photo collection from a folder of originals.
 *
 *   npm install --no-save sharp        # deliberately NOT in package.json
 *   node build/make-collection.mjs build/collections/montana-2024.json
 *
 * Not part of `npm run build`: it needs sharp (a ~30MB native dep Vercel would
 * install for nothing) and the originals live in Drive. It is a tool you run,
 * and what it writes is committed.
 *
 * Reads a spec (see build/collections/*.json), then:
 *   • photos/  the kept frames at 1800px, EXIF kept (the scan panel prints it)
 *   • thumbs/  760px, no EXIF
 *   • cover.jpg (2000px) and cover-sm.jpg (1000px)
 *   • <slug>.json  the collection manifest: days grouped by each frame's own
 *     EXIF date, frames in the order they were taken
 *   • an upsert of its entry in collections/index.json, `accent` computed from
 *     the cover, the list re-sorted newest trip first
 *
 * ⚠️ Every JPEG is written BASELINE. mozjpeg's preset writes progressive scans
 * and a large progressive cover would not rasterise in Chrome at all.
 *
 * ⚠️ There is no copy in here. Titles, captions and the lede come from the
 * spec or are left empty; nothing is generated.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readExif } from '../api/_lib/exif.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { default: sharp } = await import('sharp').catch(() => {
  console.error('sharp is not installed: run `npm install --no-save sharp` first.');
  process.exit(1);
});

const specPath = process.argv[2];
if (!specPath) { console.error('usage: node build/make-collection.mjs <spec.json>'); process.exit(1); }
const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));

const URL_BASE = `/content/photos/collections/${spec.slug}`;
const outDir = join(root, 'content', 'photos', 'collections', spec.slug);
const collectionsDir = join(root, 'content', 'photos', 'collections');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const dateLabel = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const dayNumber = iso => Math.round((Date.parse(iso) - Date.parse(spec.start)) / 86400000) + 1;

// Fresh output every run, so a frame dropped from the spec leaves the repo.
rmSync(outDir, { recursive: true, force: true });
for (const d of ['photos', 'thumbs']) mkdirSync(join(outDir, d), { recursive: true });

const jpeg = (img, q) => img.jpeg({ quality: q, progressive: false, mozjpeg: false, chromaSubsampling: '4:2:0' });

/* ── Frames ─────────────────────────────────────────────────────────────── */
const frames = [];
for (const file of spec.keep) {
  const src = join(spec.source, file);
  const name = basename(file, '.jpg').toLowerCase();
  const photoOut = join(outDir, 'photos', name + '.jpg');
  const thumbOut = join(outDir, 'thumbs', name + '.jpg');

  await jpeg(sharp(src).rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).keepExif(), 82)
    .toFile(photoOut);
  await jpeg(sharp(src).rotate().resize(760, 760, { fit: 'inside', withoutEnlargement: true }), 78)
    .toFile(thumbOut);

  // Read back from what is being served, so `dimensions` describes that file.
  const exif = readExif(photoOut) || null;
  const meta = await sharp(photoOut).metadata();
  frames.push({
    file,
    date: exif && exif.date,
    time: exif && exif.time,
    frame: {
      src: `${URL_BASE}/photos/${name}.jpg`,
      thumb: `${URL_BASE}/thumbs/${name}.jpg`,
      w: meta.width,
      h: meta.height,
      exif,
      alt: (spec.alts && spec.alts[file]) || '',
    },
  });
}

/* ── Days ───────────────────────────────────────────────────────────────── */
const days = spec.days.map(d => ({
  key: d.key,
  title: d.title,
  day: `Day ${dayNumber(d.date)}`,
  // A day may span several calendar dates (`dates`) when a trip's shooting is
  // sparse; its label then comes from the spec instead of from one date.
  dateLabel: d.dateLabel || dateLabel(d.date),
  place: d.place || '',
  date: d.date,
  dates: d.dates || [d.date],
  frames: [],
}));
for (const f of frames) {
  const day = days.find(d => d.dates.includes(f.date));
  if (!day) { console.error(`${f.file}: EXIF date ${f.date} is not in any day of the spec`); process.exit(1); }
  day._f = (day._f || []).concat(f);
}
for (const day of days) {
  day.frames = (day._f || [])
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.file.localeCompare(b.file))
    .map(f => f.frame);
  delete day._f;
  delete day.dates;
}
const written = days.filter(d => d.frames.length);
for (const d of days) if (!d.frames.length) console.warn(`note: ${d.date} has no frames and is left out`);

/* ── Cover ──────────────────────────────────────────────────────────────── */
const coverSrc = join(spec.source, spec.cover);
await jpeg(sharp(coverSrc).rotate().resize({ width: 2000, withoutEnlargement: true }), 82).toFile(join(outDir, 'cover.jpg'));
await jpeg(sharp(coverSrc).rotate().resize({ width: 1000, withoutEnlargement: true }), 80).toFile(join(outDir, 'cover-sm.jpg'));

/* ⚠️ The accent is a saturation-weighted mean of the cover's non-white,
   non-black pixels, so it is the photograph's own dominant hue and not a grey
   average of everything in it. Recompute (re-run this) if the cover changes. */
async function accentOf(file) {
  const { data } = await sharp(file).rotate().resize(64, 64, { fit: 'inside' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += 3) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    if (max > 235 || max < 24) continue;
    const sat = max ? (max - min) / max : 0;
    r += R * sat; g += G * sat; b += B * sat; w += sat;
  }
  if (!w) return null;
  return '#' + [r, g, b].map(v => Math.round(v / w).toString(16).padStart(2, '0')).join('');
}
const accent = await accentOf(coverSrc);

/* ── Manifest ───────────────────────────────────────────────────────────── */
const manifest = {
  slug: spec.slug,
  title: spec.title,
  byline: spec.byline,
  dates: spec.dates,
  cover: `${URL_BASE}/cover.jpg`,
  coverSmall: `${URL_BASE}/cover-sm.jpg`,
  coverAlt: spec.coverAlt,
  ...(spec.lede ? { lede: spec.lede } : {}),
  days: written,
};
writeFileSync(join(collectionsDir, spec.slug + '.json'), JSON.stringify(manifest, null, 1) + '\n');

/* ── Index ──────────────────────────────────────────────────────────────── */
const indexPath = join(collectionsDir, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { collections: [], loose: [] };
const entry = {
  slug: spec.slug,
  title: spec.index.title,
  dates: spec.index.dates,
  kicker: spec.index.kicker,
  count: written.length,
  unit: 'days',
  cover: `${URL_BASE}/cover-sm.jpg`,
  coverFull: `${URL_BASE}/cover.jpg`,
  coverAlt: spec.coverAlt,
  feature: !!spec.index.feature,
  written: true,
  ...(accent ? { accent } : {}),
  start: spec.start,
};
const at = index.collections.findIndex(c => c.slug === spec.slug);
if (at >= 0) index.collections[at] = entry; else index.collections.push(entry);
// Newest trip first. `start` is the sort key; an entry without one sinks.
index.collections.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');

console.log(`${spec.slug}: ${frames.length} frames over ${written.length} days, accent ${accent}`);
for (const d of written) console.log(`  ${d.date}  ${d.frames.length}`);
