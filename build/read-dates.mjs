#!/usr/bin/env node
/* Stamp each book in content/more/bookshelf.json with when it was read, from
   the public Goodreads RSS feed (no login, no key), and ADD any book on the
   Goodreads "read" shelf that the shelf doesn't have yet. Re-runnable; plain
   node. After it, run build/make-covers.mjs to fetch covers for new entries.

     node build/read-dates.mjs [goodreads-user-id]

   Writes `read` (YYYY-MM-DD, or null) and `readSource`:
     "read"   — Goodreads' own "date read"
     "added"  — no date read, so the day it was added: an estimate, and used
                only when that day isn't a bulk-import day (see below)
     null     — nothing usable; the shelf files it under the "before" group

   ⚠️ Goodreads' `user_read_at` is often an ESTIMATE — several sit on the 1st of
   a month, which is month precision. The shelf only uses the year, so that is
   harmless, but don't read the day off it.

   ⚠️ A day on which five or more books were added is an import, not a reading
   day (2023-06-19 is one). Falling back to it would file Six of Crows and
   Crooked Kingdom under a year they were merely typed into the list. */
import fs from 'fs';

const USER = process.argv[2] || '166896422';
const file = 'content/more/bookshelf.json';
const books = JSON.parse(fs.readFileSync(file, 'utf8'));

const xml = await (await fetch(
  `https://www.goodreads.com/review/list_rss/${USER}?shelf=%23ALL%23&per_page=200`,
  { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();

const field = (b, t) => {
  const m = b.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`));
  return m ? m[1].trim() : '';
};
const decode = t => t.replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const day = s => (s ? new Date(s).toISOString().slice(0, 10) : null);
const parse = x => [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
  title: decode(field(m[1], 'title')),
  author: decode(field(m[1], 'author_name')).replace(/\s+/g, ' '),
  isbn: field(m[1], 'isbn') || field(m[1], 'isbn13'),
  image: field(m[1], 'book_large_image_url'),
  gid: field(m[1], 'book_id'),
  rating: +field(m[1], 'user_rating') || 0,
  read: day(field(m[1], 'user_read_at')),
  added: day(field(m[1], 'user_date_added')),
}));
const items = parse(xml);
// The "read" shelf on its own: the ALL feed also holds to-read, DNF and
// currently-reading, none of which belong on a bookshelf of what's been read.
const readShelf = parse(await (await fetch(
  `https://www.goodreads.com/review/list_rss/${USER}?shelf=read&per_page=200`,
  { headers: { 'User-Agent': 'Mozilla/5.0' } })).text());

const perDay = {};
items.forEach(i => { perDay[i.added] = (perDay[i.added] || 0) + 1; });

const cleanTitle = t => t.replace(/\s*\([^)]*\)\s*$/, '').replace(/^Star Wars:\s*/, '').replace(/:.*$/, '').trim();
const seriesOf = t => { const m = t.match(/\(([^)]*?)(?:,\s*#([\d.]+))?\)\s*$/); return m ? m[1].replace(/^Star Wars:\s*/, '') + (m[2] ? ' / ' + m[2] : '') : null; };

const norm = t => t.toLowerCase().replace(/\(.*?\)/g, '').replace(/^star wars:\s*/, '')
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

for (const b of books) {
  const n = norm(b.title);
  // The read shelf only: an unread copy (to-read, DNF) must not lend its date.
  const hits = readShelf.filter(i => { const g = norm(i.title); return g.startsWith(n) || n.startsWith(g); });
  const hit = hits.find(i => i.read) || hits[0];
  b.read = null;
  b.readSource = null;
  if (hit && hit.read) { b.read = hit.read; b.readSource = 'read'; }
  else if (hit && perDay[hit.added] < 5) { b.read = hit.added; b.readSource = 'added'; }
  console.log((b.read || 'undated   ').padEnd(11), (b.readSource || '-').padEnd(6), b.title);
}

// Anything on the read shelf that the bookshelf doesn't have yet.
const has = i => books.some(b => { const n = norm(b.title), g = norm(i.title); return g.startsWith(n) || n.startsWith(g); });
for (const i of readShelf.filter(i => !has(i))) {
  const b = { title: cleanTitle(i.title), author: i.author, series: seriesOf(i.title), rating: i.rating || 0,
              isbn: i.isbn || null, image: i.image || null, gid: i.gid, source: 'goodreads' };
  if (i.read) { b.read = i.read; b.readSource = 'read'; }
  else if (perDay[i.added] < 5) { b.read = i.added; b.readSource = 'added'; }
  else { b.read = null; b.readSource = null; }
  books.push(b);
  console.log('ADDED      ', (b.read || 'undated').padEnd(10), b.title, '/', b.author);
}
fs.writeFileSync(file, JSON.stringify(books, null, 1));
