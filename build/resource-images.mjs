#!/usr/bin/env node
/* Give every link in content/more/resources.json a picture, saved under
   content/more/resources/ as a WebP no wider than 1000px, and write its `image`,
   `w`, `h` and `tone` (the picture's dominant colour, the card's placeholder
   while it loads) back into the entry. Not a committed build step — `sharp` is
   deliberately absent from package.json (npm install --no-save sharp first).

     node build/resource-images.mjs                  every entry with no picture yet
     node build/resource-images.mjs --force          every entry, again
     node build/resource-images.mjs --from "<name>" <file or url>
                                                     this picture for that entry

   Where the picture comes from, in order: `--from`, the entry's own
   `imageFrom` (a URL, kept so --force can fetch it again), then the page's
   og:image. LinkedIn posts do serve their image as og:image (entity-encoded,
   hence the `&amp;` decode). ⚠️ X serves nothing to a script — read the
   pbs.twimg.com address off the post in a browser and put it in `imageFrom`
   (`?format=jpg&name=large` for the full size; a video's poster is the
   `amplify_video_thumb` one). Many sites publish no og:image, or a logo card or
   an SVG that says nothing about the page: take a screenshot of the site and
   hand it over with --from. An entry left without a picture is a text card. */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const FILE = 'content/more/resources.json';
const DIR = 'content/more/resources';
const WIDTH = 1000;

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const items = data.categories.flatMap(c => c.items);
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const args = process.argv.slice(2);
const force = args.includes('--force');
const fromAt = args.indexOf('--from');
const only = fromAt >= 0 ? { name: args[fromAt + 1], src: args[fromAt + 2] } : null;

async function load(src) {
  if (!/^https?:/.test(src)) return fs.readFileSync(src);
  const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} for ${src}`);
  return Buffer.from(await r.arrayBuffer());
}

async function ogImage(url) {
  try {
    const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' } })).text();
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? new URL(m[1].replace(/&amp;/g, '&'), url).href : null;
  } catch { return null; }
}

const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

async function save(item, buf) {
  const out = path.join(DIR, slug(item.name) + '.webp');
  const img = sharp(buf).rotate().resize({ width: WIDTH, withoutEnlargement: true });
  const info = await img.clone().webp({ quality: 82 }).toFile(out);
  const { dominant } = await img.clone().stats();
  item.image = '/' + out;
  item.w = info.width;
  item.h = info.height;
  item.tone = hex(dominant);
  console.log(`  ${item.name} → ${out} (${info.width}×${info.height}, ${Math.round(info.size / 1024)}KB)`);
}

fs.mkdirSync(DIR, { recursive: true });

if (only) {
  const item = items.find(i => i.name === only.name);
  if (!item || !only.src) throw new Error(`usage: --from "<entry name>" <file or url>; no entry named "${only.name}"`);
  await save(item, await load(only.src));
} else {
  for (const item of items) {
    if (item.image && !force && fs.existsSync('.' + item.image)) continue;
    const src = item.imageFrom || await ogImage(item.url);
    if (!src || /\.svg(\?|$)/i.test(src)) { console.log(`  ${item.name}: no picture found, needs --from`); continue; }
    try { await save(item, await load(src)); }
    catch (e) { console.log(`  ${item.name}: ${e.message}`); }
  }
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
