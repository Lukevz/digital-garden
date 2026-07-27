/**
 * Instagram → content/photos sync — runs in GitHub Actions (see instagram-sync.yml).
 *
 * Pulls recent posts from the Instagram Graph API, downloads any photo we have
 * not seen before, resizes it to the site's conventions (2048px full / 800px
 * thumb) and writes it into content/photos/. The workflow then opens a PR so
 * new photos get a visual review before they land on the site.
 *
 * Why sync-and-commit rather than a live API call: the photos grid keeps
 * working if Instagram is down or the token lapses, images are self-hosted
 * (Instagram's CDN URLs are signed and expire), and you can curate what shows.
 *
 * Idempotency: content/photos/instagram-sync.json records every post shortcode
 * already handled. A post is downloaded once, ever. That means DELETING a photo
 * from the repo is permanent — the sync will not re-add it — which is what makes
 * curating the grid possible. To deliberately re-pull a post, remove its entry
 * from that manifest.
 *
 * Env:
 *   INSTAGRAM_ACCESS_TOKEN  (required) long-lived Instagram token
 *   IG_CAROUSEL_MODE        'all' (default) | 'first' — slides to take from albums
 *   IG_MAX_POSTS            how many recent posts to consider (default 50)
 *   IG_TOKEN_OUT            file path to write a refreshed token to (optional)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('INSTAGRAM_ACCESS_TOKEN missing');
  process.exit(1);
}

const ROOT = process.cwd();
const PHOTOS_DIR = join(ROOT, 'content', 'photos');
const THUMBS_DIR = join(PHOTOS_DIR, 'thumbs');
const MANIFEST_PATH = join(PHOTOS_DIR, 'instagram-sync.json');

const FULL_MAX = 2048;
const THUMB_MAX = 800;
const FULL_QUALITY = 85;
const THUMB_QUALITY = 80;

const CAROUSEL_MODE = (process.env.IG_CAROUSEL_MODE || 'all').toLowerCase();
const MAX_POSTS = Number(process.env.IG_MAX_POSTS || 50);

const GRAPH = 'https://graph.instagram.com';
const FIELDS = [
  'id', 'caption', 'media_type', 'media_url', 'permalink', 'timestamp',
  'children{id,media_type,media_url}'
].join(',');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Instagram permalinks look like https://www.instagram.com/p/<code>/ */
function shortcodeOf(permalink) {
  const m = String(permalink || '').match(/\/(?:p|reel|tv)\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * Turn a caption into a few words usable in a filename. Instagram captions are
 * free-form (emoji, hashtags, @mentions, newlines), so this is deliberately
 * conservative and falls back to the shortcode when nothing usable survives.
 */
function slugFromCaption(caption) {
  const cleaned = String(caption || '')
    .replace(/[#@][\w.]+/g, ' ')          // drop hashtags and mentions
    .replace(/https?:\/\/\S+/g, ' ')      // drop URLs
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')    // drop emoji and punctuation
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const words = cleaned.split(' ').slice(0, 4);
  // Drop a trailing article/preposition so truncation doesn't read as unfinished
  // ("Golden hour on the" → "Golden hour on").
  const DANGLING = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'with', 'my']);
  while (words.length > 1 && DANGLING.has(words[words.length - 1].toLowerCase())) words.pop();
  const slug = words.join(' ').slice(0, 40).trim();
  return slug || null;
}

/** `YYYY-MM-DD HHMM` in the post's own UTC timestamp — see api/content/list.js. */
function datePrefix(timestamp) {
  const d = new Date(timestamp);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

/** Strip characters that make filenames awkward on disk or in URLs. */
function safeName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim();
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return { posts: {} };
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.posts ? parsed : { posts: {} };
  } catch (e) {
    // A corrupt manifest would make the sync re-download everything and open a
    // PR full of duplicates. Refuse rather than guess.
    console.error(`Could not parse ${MANIFEST_PATH}: ${e.message}`);
    process.exit(1);
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/** Walk /me/media pages until we have MAX_POSTS or run out. */
async function fetchRecentMedia() {
  const posts = [];
  let url = `${GRAPH}/me/media?fields=${encodeURIComponent(FIELDS)}` +
            `&limit=25&access_token=${encodeURIComponent(TOKEN)}`;
  while (url && posts.length < MAX_POSTS) {
    const page = await fetchJson(url);
    posts.push(...(page.data || []));
    url = page.paging?.next || null;
  }
  return posts.slice(0, MAX_POSTS);
}

/** The image URLs a post contributes to the grid. Videos and reels are skipped. */
function imageUrlsFor(post) {
  if (post.media_type === 'IMAGE') return post.media_url ? [post.media_url] : [];
  if (post.media_type === 'CAROUSEL_ALBUM') {
    const kids = (post.children?.data || []).filter(c => c.media_type === 'IMAGE' && c.media_url);
    const chosen = CAROUSEL_MODE === 'first' ? kids.slice(0, 1) : kids;
    return chosen.map(c => c.media_url);
  }
  return []; // VIDEO
}

async function writeImage(buf, filename) {
  // `fit: 'inside'` caps the long edge without distorting or upscaling.
  await sharp(buf)
    .rotate() // honour any EXIF orientation before we strip metadata
    .resize(FULL_MAX, FULL_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: FULL_QUALITY })
    .toFile(join(PHOTOS_DIR, filename));

  await sharp(buf)
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toFile(join(THUMBS_DIR, filename));
}

/**
 * Long-lived tokens last ~60 days. Refreshing returns a NEW token — the value is
 * only useful if it gets persisted, so we hand it to the workflow via a file
 * (never stdout, which lands in public build logs).
 */
async function refreshToken() {
  try {
    const res = await fetchJson(
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token` +
      `&access_token=${encodeURIComponent(TOKEN)}`
    );
    const days = Math.round((res.expires_in || 0) / 86400);
    const outPath = process.env.IG_TOKEN_OUT;
    if (res.access_token && outPath) writeFileSync(outPath, res.access_token, 'utf8');
    return { ok: true, days, persisted: Boolean(res.access_token && outPath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function summarise(lines) {
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

mkdirSync(PHOTOS_DIR, { recursive: true });
mkdirSync(THUMBS_DIR, { recursive: true });

const manifest = readManifest();
let posts;
try {
  posts = await fetchRecentMedia();
} catch (e) {
  console.error(`Instagram API request failed: ${e.message}`);
  process.exit(1);
}

const added = [];
const skippedVideo = [];

// Oldest first, so a batch of new posts lands in chronological order.
for (const post of [...posts].reverse()) {
  const code = shortcodeOf(post.permalink);
  if (!code || manifest.posts[code]) continue;

  const urls = imageUrlsFor(post);
  if (!urls.length) {
    // Record videos too, so we don't re-examine them on every run.
    manifest.posts[code] = { id: post.id, timestamp: post.timestamp, type: post.media_type, files: [] };
    skippedVideo.push(code);
    continue;
  }

  const prefix = datePrefix(post.timestamp);
  const slug = slugFromCaption(post.caption) || `ig ${code}`;
  const files = [];

  for (const [i, url] of urls.entries()) {
    const suffix = urls.length > 1 ? ` ${i + 1}` : '';
    const filename = safeName(`${prefix} ${slug}${suffix}.jpg`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeImage(Buffer.from(await res.arrayBuffer()), filename);
      files.push(filename);
    } catch (e) {
      // Leave the post out of the manifest entirely so the next run retries it,
      // rather than recording a half-imported album.
      console.error(`  ! ${code} slide ${i + 1}: ${e.message}`);
    }
  }

  if (files.length !== urls.length) {
    // Roll the album back. Without this the downloaded slides sit in
    // content/photos/ untracked by the manifest, and the workflow's
    // `git add content/photos` would sweep them into the PR anyway.
    console.error(`  ! ${code}: ${files.length}/${urls.length} slides — rolling back, will retry next run`);
    for (const f of files) {
      rmSync(join(PHOTOS_DIR, f), { force: true });
      rmSync(join(THUMBS_DIR, f), { force: true });
    }
    continue;
  }

  manifest.posts[code] = {
    id: post.id,
    timestamp: post.timestamp,
    type: post.media_type,
    permalink: post.permalink,
    files
  };
  added.push({ code, permalink: post.permalink, files });
}

if (added.length || skippedVideo.length) {
  manifest.syncedAt = new Date().toISOString();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

const photoCount = added.reduce((n, a) => n + a.files.length, 0);
const lines = [`### Instagram sync`, ''];
if (added.length) {
  lines.push(`Added **${photoCount}** photo(s) from ${added.length} post(s):`, '');
  for (const a of added) for (const f of a.files) lines.push(`- \`${f}\` — ${a.permalink}`);
} else {
  lines.push('No new photos.');
}
if (skippedVideo.length) lines.push('', `Skipped ${skippedVideo.length} video post(s).`);

const refresh = await refreshToken();
if (refresh.ok) {
  lines.push('', `Token refreshed — valid ~${refresh.days} more days.`);
  if (!refresh.persisted) {
    lines.push('> Not persisted (no `IG_PAT` secret). Re-mint the token manually before it expires.');
  }
} else {
  lines.push('', `⚠️ Token refresh failed: ${refresh.error}`);
}
summarise(lines);

// Consumed by the workflow to decide whether to open a PR.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `added=${photoCount}\n`);
}
