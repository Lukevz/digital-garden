/**
 * Fills a WRITTEN collection's days with frames from a folder of originals.
 *
 *   npm install --no-save sharp        # deliberately NOT in package.json
 *   node build/fill-collection.mjs italy-2026 "~/Desktop/Italy Selects (V1)"
 *
 * The sibling of make-collection.mjs, for a collection whose manifest is hand
 * written (stamps, blurbs, keepsakes, tilt) and so cannot be regenerated from
 * a spec. It touches only `frames`:
 *
 *   • each day keeps frames[0], the photograph its stamp was drawn from (or
 *     the select that is the same frame, as the newer edit of it)
 *   • every other frame is replaced by the originals whose EXIF date is that
 *     day's `date`, in the order they were taken
 *   • photos/ at 1800px with EXIF (GPS stripped), thumbs/ at 760px without
 *   • files in photos/ and thumbs/ the new manifest no longer names are removed
 *
 * Re-run it with a new folder (V2 selects) and the days are rebuilt from that
 * folder; frames already encoded are reused unless `--force` is passed.
 *
 * ⚠️ The day comes from the camera's own date. The Italy bodies were left on
 * Atlanta time, six hours behind, and none of the selects was taken late
 * enough for the shift to cross midnight, so the dates stand as written. Check
 * that again for a new folder: a frame after 18:00 on a camera clock is the
 * next day in Italy.
 *
 * ⚠️ Every JPEG is written BASELINE (see make-collection.mjs). The trellis /
 * quant-table options are mozjpeg's savings without its progressive scans:
 * about a quarter smaller than plain libjpeg at the same quality, and no
 * visible difference at 1:1.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { cpus, homedir } from 'os';
import { readExif } from '../api/_lib/exif.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { default: sharp } = await import('sharp').catch(() => {
  console.error('sharp is not installed: run `npm install --no-save sharp` first.');
  process.exit(1);
});

const [slug, sourceArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const force = process.argv.includes('--force');
if (!slug || !sourceArg) {
  console.error('usage: node build/fill-collection.mjs <slug> <folder of originals> [--force]');
  process.exit(1);
}
const source = resolve(sourceArg.replace(/^~(?=\/)/, homedir()));

const collectionsDir = join(root, 'content', 'photos', 'collections');
const manifestPath = join(collectionsDir, slug + '.json');
const outDir = join(collectionsDir, slug);
const URL_BASE = `/content/photos/collections/${slug}`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const d of ['photos', 'thumbs']) mkdirSync(join(outDir, d), { recursive: true });

const jpeg = (img, q) => img.jpeg({
  quality: q, progressive: false, mozjpeg: false, chromaSubsampling: '4:2:0',
  trellisQuantisation: true, overshootDeringing: true, optimiseCoding: true, quantisationTable: 3,
});

/* ⚠️ `keepExif()` keeps the GPS block, and these are published. The GPS IFD
   is emptied in place: its entries and the values they point at are zeroed
   and its count set to 0, so the pointer to it leads nowhere. */
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
function stripGps(buf) {
  let p = 2;
  while (p + 4 < buf.length && buf[p] === 0xff) {
    const marker = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
      const t = p + 10, le = buf.toString('latin1', t, t + 2) === 'II';
      const u16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
      const u32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      const ifd0 = t + u32(t + 4);
      for (let i = 0, n = u16(ifd0); i < n; i++) {
        const e = ifd0 + 2 + i * 12;
        if (u16(e) !== 0x8825) continue;
        const gps = t + u32(e + 8);
        const count = u16(gps);
        for (let j = 0; j < count; j++) {
          const g = gps + 2 + j * 12;
          const size = (TYPE_SIZE[u16(g + 2)] || 0) * u32(g + 4);
          if (size > 4) buf.fill(0, t + u32(g + 8), t + u32(g + 8) + size);
          buf.fill(0, g, g + 12);
        }
        buf.fill(0, gps, gps + 2);
        return true;
      }
      return false;
    }
    if (marker === 0xda) break;
    p += 2 + len;
  }
  return false;
}

/* ── Sort the originals into days ───────────────────────────────────────── */
const files = readdirSync(source).filter(f => /\.jpe?g$/i.test(f)).sort();
const byDate = new Map(manifest.days.map(d => [d.date, d]));
const hero = d => d.frames && d.frames[0] && !d.frames[0].standin ? d.frames[0] : null;
const same = (a, b) => a && b && a.camera === b.camera && a.date === b.date && a.time === b.time;

/* EXIF time is to the minute and a burst shares it, so a matching clock only
   makes a frame a CANDIDATE for being the stamp's photograph. The pictures are
   then compared at 32px by CORRELATION, not difference: the selects are a
   later edit of the same frames (a brighter grade), which a plain difference
   reads as a different photograph. Same frame scores > 0.99, the next frame
   of a burst < 0.7. */
const print = async file => {
  const a = [...await sharp(file).rotate().resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer()];
  const mu = a.reduce((s, v) => s + v, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length) || 1;
  return a.map(v => (v - mu) / sd);
};
async function isHero(day, file, exif) {
  const h = hero(day);
  if (!h || !same(h.exif, exif)) return false;
  const [a, b] = await Promise.all([print(join(root, h.src)), print(join(source, file))]);
  return a.reduce((s, v, i) => s + v * b[i], 0) / a.length > 0.95;
}

// A select that IS the stamp's photograph takes over the lead: it is the
// newer edit of the same frame. Days with no such select keep the old export.
const incoming = new Map(manifest.days.map(d => [d.key, []]));
const leads = new Map();
const unplaced = [];
for (const file of files) {
  const exif = readExif(join(source, file));
  const day = exif && byDate.get(exif.date);
  if (!day) { unplaced.push(`${file} (${exif ? exif.date : 'no EXIF date'})`); continue; }
  const job = { file, date: exif.date, time: exif.time || '' };
  if (await isHero(day, file, exif)) leads.set(day.key, job);
  else incoming.get(day.key).push(job);
}

/* ── Encode ─────────────────────────────────────────────────────────────── */
async function encode({ file }) {
  const name = basename(file).replace(/\.jpe?g$/i, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const photoOut = join(outDir, 'photos', name + '.jpg');
  const thumbOut = join(outDir, 'thumbs', name + '.jpg');
  if (force || !existsSync(photoOut)) {
    const buf = await jpeg(sharp(join(source, file)).rotate()
      .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).keepExif(), 82).toBuffer();
    stripGps(buf);
    writeFileSync(photoOut, buf);
  }
  if (force || !existsSync(thumbOut)) {
    await jpeg(sharp(join(source, file)).rotate()
      .resize(760, 760, { fit: 'inside', withoutEnlargement: true }), 78).toFile(thumbOut);
  }
  const meta = await sharp(photoOut).metadata();
  return {
    src: `${URL_BASE}/photos/${name}.jpg`,
    thumb: `${URL_BASE}/thumbs/${name}.jpg`,
    w: meta.width,
    h: meta.height,
    exif: readExif(photoOut) || null,
    alt: '',
  };
}

const jobs = [...leads.values(), ...incoming.values()].flat();
const done = new Map();
let next = 0, n = 0;
await Promise.all(Array.from({ length: Math.max(2, Math.min(6, cpus().length - 2)) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    done.set(job.file, await encode(job));
    if (++n % 25 === 0 || n === jobs.length) console.log(`  ${n} / ${jobs.length}`);
  }
}));

/* ── Manifest ───────────────────────────────────────────────────────────── */
for (const day of manifest.days) {
  const frames = incoming.get(day.key)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.file.localeCompare(b.file))
    .map(f => done.get(f.file));
  const lead = leads.has(day.key) ? done.get(leads.get(day.key).file) : hero(day);
  day.frames = [...(lead ? [lead] : []), ...frames];
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

// Anything on disk the manifest no longer names goes.
const named = new Set(manifest.days.flatMap(d => d.frames).flatMap(f => [f.src, f.thumb]));
let removed = 0;
for (const d of ['photos', 'thumbs']) {
  for (const f of readdirSync(join(outDir, d))) {
    if (!named.has(`${URL_BASE}/${d}/${f}`)) { rmSync(join(outDir, d, f)); removed++; }
  }
}

console.log(`${slug}: ${jobs.length} frames from ${basename(source)}, ${removed} stale files removed`);
for (const d of manifest.days) {
  const lead = leads.get(d.key);
  console.log(`  ${d.key}  ${d.date}  ${d.frames.length}${lead ? `  (leads with ${lead.file})` : ''}`);
}
if (unplaced.length) console.warn(`not placed (no day on that date):\n  ${unplaced.join('\n  ')}`);
