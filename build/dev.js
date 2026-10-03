#!/usr/bin/env node
/**
 * Dev server: serves the site statically and runs the api/ handlers it uses locally
 */

import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { URL } from 'url';
import { readExifCached } from '../api/_lib/exif.js';
import { estimateReadingMinutes } from '../api/_lib/reading-time.js';
import chatHandler from '../api/chat.js';
import chatInsightsHandler from '../api/chat-insights.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Load .env.local if it exists (gitignored local overrides, no package needed)
const envLocalPath = join(rootDir, '.env.local');
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#\s=][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const devPublicHost = HOST === '127.0.0.1' || HOST === '0.0.0.0' ? 'localhost' : HOST;
const DEV_ORIGIN = `http://${devPublicHost}:${PORT}`;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.qta': 'audio/quicktime'
};

// ── KML → GeoJSON parser (mirrors api/places.js for local dev) ──
function parseKmlToGeoJSON(kml) {
  const features = [];
  const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let m;
  while ((m = placemarkRe.exec(kml)) !== null) {
    const block = m[1];
    const coordsMatch = block.match(/<coordinates>\s*([\-\d.]+),([\-\d.]+)(?:,[\-\d.]*)?\s*<\/coordinates>/);
    if (!coordsMatch) continue;
    const lng = parseFloat(coordsMatch[1]), lat = parseFloat(coordsMatch[2]);
    if (isNaN(lng) || isNaN(lat)) continue;
    const name = extractKmlText(block, 'name') || 'Unnamed place';
    const rawDesc = extractKmlCdata(block, 'description') || extractKmlText(block, 'description') || '';
    const cleanDesc = stripKmlHtml(rawDesc).trim();
    const photos = extractKmlPhotos(block, rawDesc);
    const date = extractKmlDate(cleanDesc);
    const displayDesc = cleanDesc.replace(date || '', '').replace(/^\s*\n/, '').trim();
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { name, description: displayDesc || null, photos: JSON.stringify(photos), date: date || null } });
  }
  return { type: 'FeatureCollection', features };
}
function extractKmlText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}
function extractKmlCdata(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'));
  return m ? m[1] : null;
}
function stripKmlHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}
function extractKmlPhotos(block, rawDesc) {
  const photos = [];
  const ml = block.match(/<Data\s+name=["']gx_media_links["'][^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>/i);
  if (ml) { ml[1].split(/\s+/).filter(u => u.startsWith('http')).forEach(u => photos.push(u)); }
  if (!photos.length) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/gi; let im;
    while ((im = imgRe.exec(rawDesc)) !== null) photos.push(im[1]);
  }
  return photos;
}
function extractKmlDate(text) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const months = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  const my = text.match(new RegExp(`\\b(${months})\\s+(\\d{4})\\b`, 'i'));
  return my ? `${my[1]} ${my[2]}` : null;
}


// API endpoints the site uses (mirrors api/ for local dev)
async function handleAPIProxy(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return true;
  }

  // AI chat endpoint — delegates to the Vercel handler so dev and prod stay in sync
  if (path === '/api/chat') {
    try {
      await chatHandler(req, res);
    } catch (err) {
      console.error('chat handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        try { res.end(); } catch (_) {}
      }
    }
    return true;
  }

  // Chat insights (private) — delegates to the Vercel handler so dev and prod stay in sync
  if (path === '/api/chat-insights') {
    try {
      await chatInsightsHandler(req, res);
    } catch (err) {
      console.error('chat-insights handler error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        try { res.end(); } catch (_) {}
      }
    }
    return true;
  }

  // Content directory listing endpoint
  if (path === '/api/content/list' && req.method === 'GET') {
    const category = url.searchParams.get('category');
    if (!category || /[./\\]/.test(category)) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid category' }));
      return true;
    }
    // Photos: single curated grid from content/photos/ (newest first).
    // Drop image files into content/photos/; optional matching previews in content/photos/thumbs/.
    //
    // Keep this ordering identical to api/content/list.js — that is the handler
    // production actually runs, and a mismatch means the grid reorders on deploy.
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
            const dated = f.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ _-](\d{2})(\d{2}))?[ _-]/);
            return {
              f,
              dated: dated ? 1 : 0,
              d: dated
                ? Date.UTC(+dated[1], +dated[2] - 1, +dated[3], +(dated[4] || 0), +(dated[5] || 0))
                : 0,
              m: statSync(join(photosDir, f)).mtimeMs
            };
          })
          .sort((a, b) =>
            (b.dated - a.dated) ||
            (b.d - a.d) ||
            (b.m - a.m) ||
            a.f.localeCompare(b.f)
          )
          .forEach(({ f, dated, d }) => {
            const hasThumb = existsSync(join(thumbsDir, f));
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
      return true;
    }

    const dir = join(rootDir, 'content', category);
    if (!existsSync(dir)) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files: [] }));
      return true;
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
      return true;
    }

    const items = readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = join(dir, f);
        let date;
        let content = '';
        try { content = readFileSync(filePath, 'utf8'); } catch (e) { /* ignore */ }
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const dateMatch = fmMatch[1].match(/^date:\s*(.+)$/m);
          if (dateMatch) date = dateMatch[1].trim();
        }
        if (!date) {
          const stat = statSync(filePath);
          date = stat.birthtime.toISOString().split('T')[0];
        }
        const body = fmMatch ? content.slice(fmMatch[0].length) : content;
        return { file: f, date, minutes: estimateReadingMinutes(body) };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items, files: items.map(i => i.file) }));
    return true;
  }

  // Mapbox public token endpoint
  if (path === '/api/mapbox-token' && req.method === 'GET') {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    if (!token) {
      // Token is likely already set via mapbox-config.js — return empty so browser uses that
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: null }));
    } else {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token }));
    }
    return true;
  }

  // Places endpoint — proxy Google My Maps KML and convert to GeoJSON
  if (path === '/api/places' && req.method === 'GET') {
    const mapId = process.env.GOOGLE_MY_MAPS_ID;
    if (!mapId) {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'FeatureCollection', features: [] }));
      console.log('\x1b[90m  Note: GOOGLE_MY_MAPS_ID env var not set — returning empty places\x1b[0m');
      return true;
    }
    try {
      const kmlUrl = `https://www.google.com/maps/d/kml?forcekml=1&mid=${encodeURIComponent(mapId)}`;
      const kmlRes = await fetch(kmlUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; lukevz-places/1.0)' }
      });
      if (!kmlRes.ok) throw new Error(`KML fetch failed: ${kmlRes.status}`);
      const kml = await kmlRes.text();
      const geojson = parseKmlToGeoJSON(kml);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(geojson));
    } catch (err) {
      console.error('Places proxy error:', err.message);
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }


  return false;
}

// Simple static server
const server = createServer(async (req, res) => {
  // Handle API proxy endpoints first
  const handled = await handleAPIProxy(req, res);
  if (handled) return;

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const decodedPath = decodeURIComponent(reqUrl.pathname);
  const pathRel = decodedPath === '/' || decodedPath === '' ? 'index.html' : decodedPath.replace(/^\//, '');
  let filePath = join(rootDir, pathRel);
  // Serve index.html for directory requests; try path.html for extensionless routes
  if (filePath.endsWith('/') || !extname(filePath)) {
    const indexPath = join(filePath.endsWith('/') ? filePath : filePath + '/', 'index.html');
    const htmlPath  = filePath + '.html';
    try { await readFile(indexPath); filePath = indexPath; } catch {
      try { await readFile(htmlPath); filePath = htmlPath; } catch {}
    }
  }
  const ext = extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(500);
      res.end('Server error');
    }
  }
});

// Auto-add frontmatter dates to content markdown files that lack them
function ensureFrontmatterDates() {
  const contentDir = join(rootDir, 'content');
  if (!existsSync(contentDir)) return;
  let updated = 0;
  for (const category of readdirSync(contentDir)) {
    const catDir = join(contentDir, category);
    if (!statSync(catDir).isDirectory()) continue;
    for (const file of readdirSync(catDir)) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(catDir, file);
      const content = readFileSync(filePath, 'utf8');
      const hasFrontmatter = /^---\s*\n[\s\S]*?\n---/.test(content);
      if (hasFrontmatter) {
        // Check if frontmatter has a date field
        const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (fm && /^date:/m.test(fm[1])) continue;
        // Frontmatter exists but no date — inject date into it
        if (fm) {
          const date = statSync(filePath).birthtime.toISOString().split('T')[0];
          const newFm = fm[1].trimEnd() + `\ndate: ${date}`;
          const newContent = content.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${newFm}\n---`);
          writeFileSync(filePath, newContent);
          updated++;
          continue;
        }
      }
      // No frontmatter at all — prepend it
      const date = statSync(filePath).birthtime.toISOString().split('T')[0];
      const newContent = `---\ndate: ${date}\n---\n\n${content}`;
      writeFileSync(filePath, newContent);
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`\x1b[90m  Added frontmatter dates to ${updated} file${updated > 1 ? 's' : ''}\x1b[0m`);
  }
}

ensureFrontmatterDates();

server.listen(PORT, HOST, () => {
  console.log(`\n\x1b[1m  Digital Garden\x1b[0m`);
  console.log(`\x1b[90m  ─────────────────────────\x1b[0m`);
  console.log(`  \x1b[36m➜\x1b[0m  ${DEV_ORIGIN}`);
  console.log(`\x1b[90m  ─────────────────────────\x1b[0m\n`);
});
