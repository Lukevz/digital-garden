/**
 * Vercel Serverless Function: Content Directory Listing
 * Lists markdown files in content/[category]/ folders
 * Route: /api/content/list?category=northstar
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '../..');

function extractDate(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const dateMatch = fmMatch[1].match(/^date:\s*(.+)$/m);
      if (dateMatch) return dateMatch[1].trim();
    }
  } catch (e) { /* ignore */ }
  const stat = statSync(filePath);
  return stat.birthtime.toISOString().split('T')[0];
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

  // Photos: curated favorites pulled from the v1 gallery albums (referenced in place).
  if (category === 'photos') {
    const ALBUMS = ['2025 Snaps', '2024 Snaps', '2023 Snaps'];
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
    const galleryRoot = join(rootDir, 'v1', 'gallery');
    const images = [];
    for (const album of ALBUMS) {
      const albumDir = join(galleryRoot, album);
      if (!existsSync(albumDir)) continue;
      const base = `/v1/gallery/${encodeURIComponent(album)}/`;
      readdirSync(albumDir)
        .filter(f => IMAGE_EXTS.has(('.' + f.split('.').pop()).toLowerCase()))
        .forEach(f => {
          const hasThumb = existsSync(join(albumDir, 'thumbs', f));
          images.push({
            src: base + encodeURIComponent(f),
            thumb: hasThumb ? base + 'thumbs/' + encodeURIComponent(f) : base + encodeURIComponent(f)
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
    .map(f => ({ file: f, date: extractDate(join(dir, f)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ items, files: items.map(i => i.file) }));
}
