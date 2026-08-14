/**
 * Serves the homepage.
 *
 * This used to pick a theme-aware OG image from Sec-CH-Prefers-Color-Scheme.
 * The site is dark-only for now, so the dark card is the only correct one and
 * the response no longer varies by client hint.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'lukevz.com';
  const base = `https://${host}`;

  // The site is dark-only for now (THEME_LOCK_DARK in js/main.js), so the card
  // always shows the dark shot regardless of what the client prefers. When light
  // mode comes back, restore the Sec-CH-Prefers-Color-Scheme sniff (falling back
  // to time-of-day in Eastern Time, dark 7pm–7am) and pick the image from it.
  const ogImage = `${base}/images/og_dark.png`;

  let html;
  try {
    html = readFileSync(join(__dirname, '..', '_index.html'), 'utf-8');
  } catch (err) {
    res.status(500).send('Error loading page');
    return;
  }

  // Replace og:image and twitter:image with theme-appropriate URL
  html = html.replace(
    /content="https:\/\/lukevz\.com\/images\/og_(?:light|dark)\.png"/g,
    `content="${ogImage}"`
  );

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
