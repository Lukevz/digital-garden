#!/usr/bin/env node
/**
 * Records a walkthrough video of the Travel Log feature.
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../artifacts/walkthrough');
const BASE = process.env.WALKTHROUGH_URL || 'http://localhost:3000';

mkdirSync(OUT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1280, height: 800 },
    },
    colorScheme: 'light',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  console.log('1. Open homepage…');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await sleep(1200);

  console.log('2. Open overflow menu…');
  await page.click('#overflowBtn');
  await sleep(900);

  console.log('3. Navigate to Travel Log…');
  await page.click('.overflow-item[data-mode="travellog"]');
  await page.waitForSelector('.travel-stamp', { timeout: 20000 });
  await sleep(1500);

  console.log('4. Scroll stamps into view…');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
  await page.evaluate(() => {
    const grid = document.querySelector('.travel-stamp-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await sleep(1200);

  console.log('5. Open Gibsons trip modal…');
  const gibsons = page.locator('.travel-stamp').filter({ hasText: 'Gibsons' }).first();
  await gibsons.click();
  await page.waitForSelector('#travelModal.tm-open', { timeout: 10000 });
  await sleep(1200);

  console.log('6. Scroll itinerary — day cards and polaroid clusters…');
  await page.evaluate(() => {
    const body = document.getElementById('travelModalBody');
    if (body) body.scrollTo({ top: 0, behavior: 'instant' });
  });
  await sleep(700);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const body = document.getElementById('travelModalBody');
      if (body) body.scrollBy({ top: 250, behavior: 'smooth' });
    });
    await sleep(1200);
  }
  await sleep(900);

  console.log('7. Close modal…');
  await page.click('#travelModalClose');
  await sleep(1000);

  console.log('8. Open Disney World trip…');
  const disney = page.locator('.travel-stamp').filter({ hasText: 'Orlando' }).first();
  await disney.click();
  await page.waitForSelector('#travelModal.tm-open');
  await sleep(1500);
  await page.evaluate(() => {
    const body = document.getElementById('travelModalBody');
    if (body) body.scrollBy({ top: 200, behavior: 'smooth' });
  });
  await sleep(1200);

  console.log('9. Close and finish…');
  await page.keyboard.press('Escape');
  await sleep(1000);

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) throw new Error('No video recorded');

  const rawPath = await video.path();
  const webmPath = join(OUT_DIR, 'travel-log-walkthrough.webm');
  const mp4Path = join(OUT_DIR, 'travel-log-walkthrough.mp4');

  if (existsSync(rawPath)) renameSync(rawPath, webmPath);

  console.log('10. Convert to MP4…');
  execSync(
    `ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`,
    { stdio: 'inherit' }
  );

  console.log(`\nDone:\n  ${mp4Path}\n  ${webmPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
