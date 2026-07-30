/**
 * Vercel Serverless Function: Content Directory Listing
 * Lists markdown files in content/[category]/ folders
 * Route: /api/content/list?category=northstar
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readExifCached } from '../_lib/exif.js';
import { estimateReadingMinutes } from '../_lib/reading-time.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

// Reads frontmatter for `date` (same as before) plus a reading-time estimate
// off the remaining body — one read serves both, since the content is
// already in memory here.
function extractMeta(filePath) {
  let content = '';
  try { content = readFileSync(filePath, 'utf8'); } catch (e) { /* ignore */ }
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  let date = null;
  if (fmMatch) {
    const dateMatch = fmMatch[1].match(/^date:\s*(.+)$/m);
    if (dateMatch) date = dateMatch[1].trim();
  }
  if (!date) {
    try { date = statSync(filePath).birthtime.toISOString().split('T')[0]; } catch (e) { date = ''; }
  }
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  return { date, minutes: estimateReadingMinutes(body) };
}

export default function handler(req, res) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const category = url.searchParams.get('category');

  if (!category || /[./\\]/.test(category)) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid category' }));
    return;
  }

  // Photos: single curated grid from content/photos/ (newest first).
  // Drop image files into content/photos/; optional matching previews in content/photos/thumbs/.
  //
  // Ordering: a `YYYY-MM-DD ` filename prefix wins, then mtime. Git does not
  // preserve mtimes, so on a fresh Vercel clone every file stats within the same
  // second and mtime alone gives arbitrary order — dated names are the only
  // ordering that survives a deploy. The Instagram sync always writes them
  // (.github/scripts/instagram-sync.mjs); undated legacy files fall back to
  // mtime and sort below the dated ones.
  if (category === 'photos') {
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
    const photosDir = join(rootDir, 'content', 'photos');
    const images = [];
    if (existsSync(photosDir)) {
      const base = '/content/photos/';
      const thumbsDir = join(photosDir, 'thumbs');
      readdirSync(photosDir)
        .filter(f => IMAGE_EXTS.has(('.' + f.split('.').pop()).toLowerCase()))
        .map(f => {
          // `YYYY-MM-DD ` or `YYYY-MM-DD HHMM ` — the time is optional and only
          // matters for ordering several posts from the same day.
          const dated = f.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ _-](\d{2})(\d{2}))?[ _-]/);
          return {
            f,
            dated: dated ? 1 : 0,
            // Parse as UTC so the ordering does not shift with the server's zone.
            d: dated
              ? Date.UTC(+dated[1], +dated[2] - 1, +dated[3], +(dated[4] || 0), +(dated[5] || 0))
              : 0,
            m: statSync(join(photosDir, f)).mtimeMs
          };
        })
        .sort((a, b) =>
          (b.dated - a.dated) ||     // dated filenames first
          (b.d - a.d) ||             // newest date first
          (b.m - a.m) ||             // then mtime (undated legacy files)
          a.f.localeCompare(b.f)     // stable tiebreak for same-day posts
        )
        .forEach(({ f, dated, d }) => {
          const hasThumb = existsSync(join(thumbsDir, f));
          // Camera EXIF, where the file still has it — Instagram strips it, so
          // synced photos fall back to the date already encoded in the filename.
          const exif = readExifCached(join(photosDir, f)) || {};
          if (!exif.date && dated) exif.date = new Date(d).toISOString().slice(0, 10);
          images.push({
            src: base + encodeURIComponent(f),
            thumb: hasThumb ? base + 'thumbs/' + encodeURIComponent(f) : base + encodeURIComponent(f),
            exif
          });
        });
    }
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ images, items: [], files: [] }));
    return;
  }

  const dir = join(rootDir, 'content', category);
  if (!existsSync(dir)) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ files: [] }));
    return;
  }

  if (category === 'portfolio') {
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
    let links = {};
    try {
      const linksPath = join(dir, 'links.json');
      if (existsSync(linksPath)) links = JSON.parse(readFileSync(linksPath, 'utf8'));
    } catch (e) { /* ignore */ }
    const images = readdirSync(dir)
      .filter(f => IMAGE_EXTS.has(('.' + f.split('.').pop()).toLowerCase()))
      .map(f => ({ file: f, link: links[f] || null }));
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ images, items: [], files: [] }));
    return;
  }

  const items = readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ file: f, ...extractMeta(join(dir, f)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ items, files: items.map(i => i.file) }));
}
