#!/usr/bin/env node
/* Fetch a real cover for every book in content/more/bookshelf.json and save it
   under content/more/covers/. Not a committed build step — `sharp` is
   deliberately absent from package.json (npm install --no-save sharp first).

   The ISBN is the ASIN in the book's Amazon link, so Amazon's own image host
   comes first: it is the exact edition the row links to. ⚠️ Open Library was
   tried first and is NOT to be trusted by ISBN — it returned the wrong book for
   several of the Percy Jackson titles and a box set for Fourth Wing. It stays as
   the fallback. A response under ~4KB is a placeholder, not a cover.

   Re-running skips any book that already has a file; delete `cover` from an
   entry (and the file) to fetch it again. */
import fs from 'fs';
import sharp from 'sharp';

const file = 'content/more/bookshelf.json';
const books = JSON.parse(fs.readFileSync(file, 'utf8'));
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function grab(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 4000) return null;
    const m = await sharp(buf).metadata();
    return m.width >= 150 ? buf : null;
  } catch { return null; }
}

/* Second and third chances for the ones the ISBN lookup misses (an edition
   with no scan): Google Books by ISBN, then an Open Library search by title. */
async function google(id) {
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${id}`);
    const v = (await r.json()).items?.[0]?.volumeInfo?.imageLinks;
    const u = v && (v.extraLarge || v.large || v.medium || v.thumbnail);
    return u ? grab(u.replace('http:', 'https:').replace('zoom=1', 'zoom=3').replace('&edge=curl', '')) : null;
  } catch { return null; }
}
async function search(b) {
  try {
    const q = new URLSearchParams({ title: b.title, author: b.author, limit: '5', fields: 'cover_i' });
    const r = await fetch('https://openlibrary.org/search.json?' + q);
    for (const d of (await r.json()).docs || []) {
      if (!d.cover_i) continue;
      const buf = await grab(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false`);
      if (buf) return buf;
    }
  } catch {}
  return null;
}

/* ⚠️ The Amazon links in the v2 data are wrong for a few titles — the "Iron
   Flame" ASIN is a Fourth Wing box set, the "Fourth Wing" one is Iron Flame,
   and the Percy Jackson ISBNs are shuffled (Last Olympian shows Titan's Curse).
   Those are pinned to an Open Library cover id chosen by eye instead. */
const PINNED = {
  'The Last Olympian': 6624107,
  'The Battle of the Labyrinth': 6274739,
  'Fourth Wing': 14407898,
};
// …and the two Yarros ASINs are simply swapped: 1649374178 is Iron Flame.
// Amazon's image for this one is a 3D pile of the special edition.
const OL_FIRST = new Set(['Tomorrow, and Tomorrow, and Tomorrow']);
// These came back as scans of a library copy (barcode label and all) from the ISBN
// lookups; Goodreads' own image is the clean edition.
const IMAGE_FIRST = new Set(['Foundryside', 'Animal Farm', 'Looking for Alaska']);
const ISBN_FIX = { 'Iron Flame': '1649374178' };
// This one's source is a small image floating in a white field.
const TRIM = new Set(['The Chalice of the Gods']);

let missing = [];
for (const [i, b] of books.entries()) {
  if (b.cover && fs.existsSync(b.cover.slice(1))) continue;
  // Entries added from Goodreads have an `isbn` and an `image`, not an Amazon link.
  const id = ISBN_FIX[b.title] || b.isbn || (b.url && b.url.split('/dp/')[1]);
  const out = `content/more/covers/${slug(b.title)}.webp`;
  const buf =
    (IMAGE_FIRST.has(b.title) && b.image && (await grab(b.image.replace(/\._S[XY]\d+_/, '')))) ||
    (PINNED[b.title] && (await grab(`https://covers.openlibrary.org/b/id/${PINNED[b.title]}-L.jpg?default=false`))) ||
    (OL_FIRST.has(b.title) && (await grab(`https://covers.openlibrary.org/b/isbn/${id}-L.jpg?default=false`))) ||
    (id && (await grab(`https://m.media-amazon.com/images/P/${id}.01.LZZZZZZZ.jpg`))) ||
    (id && (await grab(`https://covers.openlibrary.org/b/isbn/${id}-L.jpg?default=false`))) ||
    (id && (await google(id))) ||
    (await search(b)) ||
    (b.image && (await grab(b.image.replace(/\._S[XY]\d+_/, ''))));
  if (!buf) { missing.push(b.title); delete b.cover; console.log('MISS', b.title); continue; }
  const img = (TRIM.has(b.title) ? sharp(await sharp(buf).trim({ threshold: 18 }).toBuffer()) : sharp(buf)).resize({ width: 320, withoutEnlargement: true });
  await img.webp({ quality: 82 }).toFile(out);
  const m = await sharp(out).metadata();
  b.cover = '/' + out;
  b.ratio = +(m.width / m.height).toFixed(3);
  console.log('ok  ', String(i).padStart(2), b.title, m.width + 'x' + m.height);
}
fs.writeFileSync(file, JSON.stringify(books, null, 1));
console.log('missing:', missing.length, missing);
