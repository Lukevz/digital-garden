#!/usr/bin/env node
/**
 * Dev server with auto-rebuild
 * Watches /posts, /thought-train, /labs, /sounds folders and regenerates manifest files on changes
 */

import { writeFileSync, readFileSync, watch, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { URL } from 'url';
import { buildPostsManifest, buildThoughtTrainsManifest, buildLabsManifest, buildSoundsManifest, buildGalleryManifest, buildCoversManifest, buildFlightsManifest } from '../v1/js/build/manifest-builder.js';
import chatHandler from '../api/chat.js';
import chatInsightsHandler from '../api/chat-insights.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const v1Dir = join(rootDir, 'v1');

// Load .env.local if it exists (gitignored local overrides, no package needed)
const envLocalPath = join(rootDir, '.env.local');
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#\s=][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const postsDir = join(v1Dir, 'posts');
const thoughtTrainDir = join(v1Dir, 'thought-train');
const labsDir = join(v1Dir, 'labs');
const soundsDir = join(v1Dir, 'sounds');
const galleryDir = join(v1Dir, 'gallery');
const coversDir = join(v1Dir, 'covers');
const flightsPath = join(rootDir, 'flights.md');
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
  '.svg': 'image/svg+xml',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.qta': 'audio/quicktime'
};

// Build posts.js
function buildPosts() {
  const posts = buildPostsManifest(postsDir);
  const content = `/**
 * Posts Manifest (auto-generated)
 * Using object format with created dates from filesystem
 * Run 'node build/build.js' to regenerate after adding new posts
 */

export default ${JSON.stringify(posts, null, 2)};
`;
  writeFileSync(join(v1Dir, 'posts.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt posts.js (${posts.length} posts)`);
}

// Build thought-trains.js
function buildThoughtTrains() {
  const thoughtTrains = buildThoughtTrainsManifest(thoughtTrainDir);
  const content = `/**
 * Thought Trains Manifest (auto-generated)
 * Using object format with created dates from filesystem
 * Run 'node build/build.js' to regenerate after adding new thought trains
 */

export default ${JSON.stringify(thoughtTrains, null, 2)};
`;
  writeFileSync(join(v1Dir, 'thought-trains.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt thought-trains.js (${thoughtTrains.length} thought trains)`);
}

// Build labs.js
function buildLabs() {
  if (!existsSync(labsDir)) return;

  const labs = buildLabsManifest(labsDir);
  const content = `/**
 * Labs Manifest (auto-generated)
 * Run 'node build/build.js' to regenerate after adding new labs
 */

export default ${JSON.stringify(labs, null, 2)};
`;
  writeFileSync(join(v1Dir, 'labs.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt labs.js (${labs.length} labs)`);
}

// Build sounds.js
function buildSounds() {
  if (!existsSync(soundsDir)) return;

  const sounds = buildSoundsManifest(soundsDir);
  const content = `/**
 * Sounds Manifest (auto-generated)
 * Lists all audio files in the sounds/ directory
 * Run 'node build/build.js' to regenerate after adding new sounds
 */

export default ${JSON.stringify(sounds, null, 2)};
`;
  writeFileSync(join(v1Dir, 'sounds.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt sounds.js (${sounds.length} sounds)`);
}

// Build gallery.js
function buildGallery() {
  if (!existsSync(galleryDir)) return;

  const gallery = buildGalleryManifest(galleryDir);
  const content = `/**
 * Gallery Manifest (auto-generated)
 * Lists all photo albums in the gallery/ directory
 * Run 'node build/build.js' to regenerate after adding new albums
 */

export default ${JSON.stringify(gallery, null, 2)};
`;
  writeFileSync(join(v1Dir, 'gallery.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt gallery.js (${gallery.length} albums)`);
}

// Build covers.js (async - downloads missing covers)
let booksApiKey = null;
async function loadBooksApiKey() {
  if (booksApiKey !== null) return booksApiKey;
  try {
    const configPath = join(v1Dir, 'books-config.js');
    if (existsSync(configPath)) {
      const configModule = await import(pathToFileURL(configPath).href);
      booksApiKey = configModule.default?.googleBooks?.apiKey || null;
    }
  } catch {
    booksApiKey = null;
  }
  return booksApiKey;
}

async function buildCovers() {
  const apiKey = await loadBooksApiKey();
  const covers = await buildCoversManifest(postsDir, coversDir, apiKey);
  const content = `/**
 * Book Covers Manifest (auto-generated)
 * Maps book files to their cover images
 * Run 'node build/build.js' to regenerate and download missing covers
 */

export default ${JSON.stringify(covers, null, 2)};
`;
  writeFileSync(join(v1Dir, 'covers.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt covers.js (${covers.length} books)`);
}

function buildFlights() {
  const flights = buildFlightsManifest(flightsPath);
  const content = `/**
 * Flights Manifest (auto-generated)
 * Run 'node build/build.js' to regenerate after editing flights.md
 */

export default ${JSON.stringify(flights, null, 2)};
`;
  writeFileSync(join(rootDir, 'flights.js'), content);
  console.log(`\x1b[32m✓\x1b[0m Rebuilt flights.js (${flights.length} flights)`);
}

const v1Mode = process.argv.includes('--v1');

if (v1Mode) {
  // Initial build
  buildPosts();
  buildThoughtTrains();
  buildLabs();
  buildSounds();
  buildGallery();
  buildCovers();
  buildFlights();

  // Watch for changes in posts
  console.log(`\x1b[90m◉ Watching /posts for changes...\x1b[0m`);
  watch(postsDir, { recursive: true }, (eventType, filename) => {
    if (filename?.endsWith('.md')) {
      console.log(`\x1b[90m  Changed: ${filename}\x1b[0m`);
      buildPosts();
      // Rebuild covers if it's a book file
      if (filename.toLowerCase().startsWith('b.')) {
        buildCovers();
      }
    }
  });

  // Watch for changes in thought-train
  console.log(`\x1b[90m◉ Watching /thought-train for changes...\x1b[0m`);
  watch(thoughtTrainDir, { recursive: true }, (eventType, filename) => {
    if (filename?.endsWith('.md')) {
      console.log(`\x1b[90m  Changed: ${filename}\x1b[0m`);
      buildThoughtTrains();
    }
  });

  // Watch for changes in labs
  if (existsSync(labsDir)) {
    console.log(`\x1b[90m◉ Watching /labs for changes...\x1b[0m`);
    watch(labsDir, { recursive: true }, (eventType, filename) => {
      if (filename?.endsWith('.md')) {
        console.log(`\x1b[90m  Changed: ${filename}\x1b[0m`);
        buildLabs();
      }
    });
  }

  // Watch for changes in sounds
  if (existsSync(soundsDir)) {
    console.log(`\x1b[90m◉ Watching /sounds for changes...\x1b[0m`);
    const audioExtensions = ['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.flac', '.webm', '.qta'];
    watch(soundsDir, { recursive: true }, (eventType, filename) => {
      if (filename && audioExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
        console.log(`\x1b[90m  Changed: ${filename}\x1b[0m`);
        buildSounds();
      }
    });
  }

  // Watch for changes in gallery
  if (existsSync(galleryDir)) {
    console.log(`\x1b[90m◉ Watching /gallery for changes...\x1b[0m`);
    watch(galleryDir, { recursive: true }, (eventType, filename) => {
      // Rebuild on any change: images, folder renames, deletions, etc.
      if (filename) {
        console.log(`\x1b[90m  Changed: ${filename}\x1b[0m`);
        buildGallery();
      }
    });
  }
}

if (existsSync(flightsPath)) {
  if (!v1Mode) buildFlights();
  console.log(`\x1b[90m◉ Watching flights.md for changes...\x1b[0m`);
  watch(flightsPath, () => {
    console.log(`\x1b[90m  Changed: flights.md\x1b[0m`);
    buildFlights();
  });
}

// Load music config for API proxy (lazy load)
let musicConfig = null;
let musicConfigPromise = null;

async function loadMusicConfig() {
  if (musicConfig !== null) return musicConfig;
  if (musicConfigPromise) return musicConfigPromise;

  musicConfigPromise = (async () => {
    try {
      const configPath = join(v1Dir, 'music-config.js');
      if (existsSync(configPath)) {
        const configUrl = pathToFileURL(configPath).href;
        const configModule = await import(configUrl);
        musicConfig = configModule.default;
        return musicConfig;
      }
    } catch (err) {
      console.log('\x1b[90m  Note: music-config.js not found or invalid:\x1b[0m', err.message);
    }
    // Fallback: check YOUTUBE_API_KEY env var
    if (process.env.YOUTUBE_API_KEY) {
      musicConfig = { youtube: { apiKey: process.env.YOUTUBE_API_KEY } };
      return musicConfig;
    }
    musicConfig = false; // Mark as attempted
    return null;
  })();

  return musicConfigPromise;
}

// Load books config for API proxy (lazy load)
let booksConfig = null;
let booksConfigPromise = null;

async function loadBooksConfig() {
  if (booksConfig !== null) return booksConfig;
  if (booksConfigPromise) return booksConfigPromise;

  booksConfigPromise = (async () => {
    try {
      const configPath = join(v1Dir, 'books-config.js');
      if (existsSync(configPath)) {
        const configUrl = pathToFileURL(configPath).href;
        const configModule = await import(configUrl);
        booksConfig = configModule.default;
        return booksConfig;
      }
    } catch (err) {
      console.log('\x1b[90m  Note: books-config.js not found or invalid:\x1b[0m', err.message);
    }
    booksConfig = false; // Mark as attempted
    return null;
  })();

  return booksConfigPromise;
}

// Parse ISO 8601 duration string → seconds
function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

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

// In-memory storage for guestbook (development only)
const guestbookStars = [];

// API proxy endpoints (Spotify + YouTube)
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
    // Photos: single curated grid from content/photos/ (newest by mtime first).
    // Drop image files into content/photos/; optional matching previews in content/photos/thumbs/.
    if (category === 'photos') {
      const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
      const photosDir = join(rootDir, 'content', 'photos');
      const images = [];
      if (existsSync(photosDir)) {
        const base = '/content/photos/';
        const thumbsDir = join(photosDir, 'thumbs');
        readdirSync(photosDir)
          .filter(f => IMAGE_EXTS.has(('.' + f.split('.').pop()).toLowerCase()))
          .map(f => ({ f, m: statSync(join(photosDir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m)
          .forEach(({ f }) => {
            const hasThumb = existsSync(join(thumbsDir, f));
            images.push({
              src: base + encodeURIComponent(f),
              thumb: hasThumb ? base + 'thumbs/' + encodeURIComponent(f) : base + encodeURIComponent(f)
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
        try {
          const content = readFileSync(filePath, 'utf8');
          const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const dateMatch = fmMatch[1].match(/^date:\s*(.+)$/m);
            if (dateMatch) date = dateMatch[1].trim();
          }
        } catch (e) { /* ignore */ }
        if (!date) {
          const stat = statSync(filePath);
          date = stat.birthtime.toISOString().split('T')[0];
        }
        return { file: f, date };
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

  // YouTube playlist endpoint (query parameter format)
  if (path === '/api/youtube/playlist' && req.method === 'GET') {
    const playlistId = url.searchParams.get('id');

    if (!playlistId) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter "id" is required' }));
      return true;
    }

    const config = await loadMusicConfig();
    if (!config || !config.youtube || !config.youtube.apiKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'YouTube API key not configured' }));
      return true;
    }

    try {
      // Fetch all playlist items with pagination
      let allItems = [];
      let nextPageToken = null;
      const maxResultsPerPage = 50;

      do {
        let playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?` +
          `part=snippet,contentDetails&maxResults=${maxResultsPerPage}&playlistId=${playlistId}&key=${config.youtube.apiKey}`;

        if (nextPageToken) {
          playlistUrl += `&pageToken=${nextPageToken}`;
        }

        const response = await fetch(playlistUrl);
        const data = await response.json();

        if (!response.ok) {
          res.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return true;
        }

        if (data.items) {
          allItems = allItems.concat(data.items);
        }

        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      // Return in format expected by app.js
      const result = {
        items: allItems,
        pageInfo: {
          totalResults: allItems.length,
          resultsPerPage: allItems.length
        }
      };

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // Spotify token endpoint
  if (path === '/api/spotify/token' && req.method === 'POST') {
    const config = await loadMusicConfig();
    if (!config || !config.spotify) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Spotify config not found' }));
      return true;
    }

    try {
      const credentials = Buffer.from(
        `${config.spotify.clientId}:${config.spotify.clientSecret}`
      ).toString('base64');

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      const data = await response.json();

      if (!response.ok) {
        res.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return true;
      }

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // Spotify playlist endpoint
  if (path.startsWith('/api/spotify/playlist/') && req.method === 'GET') {
    const playlistId = path.split('/api/spotify/playlist/')[1];
    const token = url.searchParams.get('token');

    if (!token) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token required' }));
      return true;
    }

    try {
      // Fetch playlist details
      const playlistResponse = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const playlistData = await playlistResponse.json();

      if (!playlistResponse.ok) {
        res.writeHead(playlistResponse.status, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(playlistData));
        return true;
      }

      // Fetch all tracks (handle pagination)
      let allTracks = [];
      let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

      while (nextUrl) {
        const tracksResponse = await fetch(nextUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!tracksResponse.ok) {
          const errorData = await tracksResponse.json();
          res.writeHead(tracksResponse.status, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errorData));
          return true;
        }

        const tracksData = await tracksResponse.json();
        allTracks = allTracks.concat(tracksData.items);
        nextUrl = tracksData.next;
      }

      // Format tracks
      const tracks = allTracks
        .filter(item => item.track && !item.track.is_local)
        .map(item => ({
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists.map(a => a.name),
          album: item.track.album.name,
          duration_ms: item.track.duration_ms,
          spotify_url: item.track.external_urls.spotify,
          image: item.track.album.images[0]?.url
        }));

      const result = {
        name: playlistData.name,
        description: playlistData.description,
        tracks: tracks
      };

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // YouTube search endpoint
  if (path === '/api/youtube/search' && req.method === 'GET') {
    const config = await loadMusicConfig();
    if (!config || !config.youtube || !config.youtube.apiKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'YouTube API key not found in config' }));
      return true;
    }

    const query = url.searchParams.get('q');
    const maxResults = url.searchParams.get('maxResults') || '5';
    const preferOfficial = url.searchParams.get('preferOfficial') === 'true';
    const artists = url.searchParams.get('artists') || '';

    if (!query) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameter "q" is required' }));
      return true;
    }

    try {
      const youtubeUrl = `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${config.youtube.apiKey}`;

      const response = await fetch(youtubeUrl, {
        headers: {
          'Referer': `${DEV_ORIGIN}/`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        res.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return true;
      }

      if (!data.items || data.items.length === 0) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [] }));
        return true;
      }

      // Prefer official content if requested
      let selectedVideo = null;
      if (preferOfficial && artists) {
        const artistList = artists.split(',').map(a => a.trim().toLowerCase());
        const officialMarkers = ['official', 'vevo', 'topic', ...artistList];

        selectedVideo = data.items.find(item => {
          const title = item.snippet.title.toLowerCase();
          const channel = item.snippet.channelTitle.toLowerCase();
          return officialMarkers.some(marker => title.includes(marker) || channel.includes(marker));
        });
      }

      // Use first result if no official found
      if (!selectedVideo && data.items.length > 0) {
        selectedVideo = data.items[0];
      }

      if (selectedVideo) {
        const result = {
          videoId: selectedVideo.id.videoId,
          title: selectedVideo.snippet.title,
          thumbnail: selectedVideo.snippet.thumbnails.high?.url || selectedVideo.snippet.thumbnails.default?.url
        };
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(null));
      }
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // YouTube playlist endpoint (legacy path-based format, kept for compatibility)
  if (path.startsWith('/api/youtube/playlist/') && req.method === 'GET') {
    const playlistId = path.split('/api/youtube/playlist/')[1].split('?')[0];
    const config = await loadMusicConfig();

    if (!config || !config.youtube || !config.youtube.apiKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'YouTube API key not found in config' }));
      return true;
    }

    try {
      // Fetch all playlist items with pagination
      let allItems = [];
      let nextPageToken = null;
      const maxResultsPerPage = 50; // YouTube API max

      do {
        let playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?` +
          `part=snippet,contentDetails&maxResults=${maxResultsPerPage}&playlistId=${playlistId}&key=${config.youtube.apiKey}`;

        if (nextPageToken) {
          playlistUrl += `&pageToken=${nextPageToken}`;
        }

        const response = await fetch(playlistUrl, {
          headers: {
            'Referer': `${DEV_ORIGIN}/`
          }
        });
        const data = await response.json();

        if (!response.ok) {
          res.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return true;
        }

        if (data.items) {
          allItems = allItems.concat(data.items);
        }

        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      // Transform to track format matching existing structure
      // Filter out deleted/private videos
      const tracks = allItems
        .filter(item =>
          item.snippet &&
          item.contentDetails &&
          item.snippet.title !== 'Deleted video' &&
          item.snippet.title !== 'Private video'
        )
        .map(item => ({
          videoId: item.contentDetails.videoId,
          title: item.snippet.title,
          artist: item.snippet.videoOwnerChannelTitle || 'YouTube',
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          url: `https://www.youtube.com/watch?v=${item.contentDetails.videoId}`,
          position: item.snippet.position
        }));

      const result = {
        playlistId: playlistId,
        tracks: tracks,
        totalCount: tracks.length
      };

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // Google Books API endpoint
  if (path === '/api/books/search' && req.method === 'GET') {
    const title = url.searchParams.get('title');
    const author = url.searchParams.get('author');

    if (!title || !author) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Query parameters "title" and "author" are required' }));
      return true;
    }

    const config = await loadBooksConfig();
    if (!config || !config.googleBooks || !config.googleBooks.apiKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Google Books API key not configured' }));
      return true;
    }

    try {
      const query = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
      const apiUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&key=${config.googleBooks.apiKey}`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        res.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return true;
      }

      // Extract cover image from first result
      const result = {
        cover: null,
        isbn: null
      };

      if (data.items && data.items.length > 0) {
        const book = data.items[0];
        if (book.volumeInfo.imageLinks) {
          result.cover = book.volumeInfo.imageLinks.thumbnail || book.volumeInfo.imageLinks.smallThumbnail;
          // Use HTTPS
          if (result.cover) {
            result.cover = result.cover.replace('http://', 'https://');
          }
        }
        if (book.volumeInfo.industryIdentifiers) {
          const isbn13 = book.volumeInfo.industryIdentifiers.find(id => id.type === 'ISBN_13');
          if (isbn13) result.isbn = isbn13.identifier;
        }
      }

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return true;
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
      return true;
    }
  }

  // GET /api/guestbook/stars?page=1
  if (path === '/api/guestbook/stars' && req.method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const itemsPerPage = 100;

    // Sort by newest first
    const sortedStars = [...guestbookStars].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    const totalPages = Math.ceil(sortedStars.length / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const stars = sortedStars.slice(startIndex, endIndex);

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      stars,
      page,
      totalPages,
      totalStars: sortedStars.length
    }));
    return true;
  }

  // POST /api/guestbook/stars
  if (path === '/api/guestbook/stars' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // Validate
        if (!data.imageData || !data.imageData.startsWith('data:image/png;base64,')) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid image data' }));
          return;
        }

        // Create star object
        const star = {
          id: Date.now().toString(),
          imageData: data.imageData,
          width: data.width || 800,
          height: data.height || 600,
          createdAt: new Date().toISOString(),
          userAgent: req.headers['user-agent'] || 'unknown'
        };

        guestbookStars.push(star);
        console.log(`\x1b[32m✓\x1b[0m Star saved (total: ${guestbookStars.length})`);

        res.writeHead(201, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: star.id }));
      } catch (error) {
        console.error('Error saving star:', error);
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request failed' }));
    });

    return true;
  }

  // YouTube channel videos endpoint
  if (path === '/api/youtube/channel-videos' && req.method === 'GET') {
    const handle = url.searchParams.get('handle') || 'lukevanzylofficial';
    const config = await loadMusicConfig();

    if (!config || !config.youtube || !config.youtube.apiKey) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'YouTube API key not found in config' }));
      return true;
    }

    try {
      // Get channel's uploads playlist ID
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&forHandle=${handle}&key=${config.youtube.apiKey}`
      );
      const channelData = await channelRes.json();

      if (!channelData.items?.length) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Channel @${handle} not found` }));
        return true;
      }

      const channel = channelData.items[0];
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
      const channelTitle = channel.snippet.title;

      // Paginate through uploads playlist
      const videos = [];
      let pageToken = null;

      do {
        let playlistUrl =
          `https://www.googleapis.com/youtube/v3/playlistItems?` +
          `part=snippet&maxResults=50&playlistId=${uploadsPlaylistId}&key=${config.youtube.apiKey}`;
        if (pageToken) playlistUrl += `&pageToken=${pageToken}`;

        const pageRes = await fetch(playlistUrl);
        const pageData = await pageRes.json();

        for (const item of pageData.items || []) {
          const sn = item.snippet;
          if (sn.title === 'Private video' || sn.title === 'Deleted video') continue;
          videos.push({
            videoId: sn.resourceId.videoId,
            title: sn.title,
            description: sn.description,
            publishedAt: sn.publishedAt.split('T')[0],
            thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || ''
          });
        }

        pageToken = pageData.nextPageToken || null;
      } while (pageToken);

      // Filter out Shorts: batch-fetch durations, drop videos < 3 minutes
      const allIds = videos.map(v => v.videoId);
      const durationMap = {};
      for (let i = 0; i < allIds.length; i += 50) {
        const batch = allIds.slice(i, i + 50).join(',');
        const detailRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batch}&key=${config.youtube.apiKey}`
        );
        const detailData = await detailRes.json();
        for (const item of detailData.items || []) {
          durationMap[item.id] = parseDuration(item.contentDetails.duration);
        }
      }
      const longform = videos.filter(v => (durationMap[v.videoId] || 0) >= 180);

      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ videos: longform, channelTitle }));
    } catch (error) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return true;
  }

  return false;
}

// Dev rewrites — mirrors vercel.json for local dev
const DEV_REWRITES = [
  { pattern: /^\/$/, dest: '_index.html' },
  { pattern: /^\/work$/, dest: 'work.html' },
  { pattern: /^\/about$/, dest: 'about.html' },
  // Deep-link topic routes → serve the new homepage (_index.html)
  { pattern: /^\/life(\/.*)?$/, dest: '_index.html' },
  { pattern: /^\/work\/.+$/, dest: '_index.html' },
];

// Simple static server
const server = createServer(async (req, res) => {
  // Handle API proxy endpoints first
  const handled = await handleAPIProxy(req, res);
  if (handled) return;

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const decodedPath = decodeURIComponent(reqUrl.pathname);

  // Apply dev rewrites before static file resolution
  let rewrittenPath = null;
  for (const { pattern, dest } of DEV_REWRITES) {
    if (pattern.test(decodedPath)) { rewrittenPath = dest; break; }
  }

  const pathRel = rewrittenPath
    ? rewrittenPath
    : (decodedPath === '/' || decodedPath === '' ? '_index.html' : decodedPath.replace(/^\//, ''));
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
