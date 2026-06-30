/**
 * Records a video walkthrough of the bento layout.
 * Uses Puppeteer to drive Chrome and ffmpeg to capture frames via x11grab.
 *
 * Run: DISPLAY=:99 node build/record-walkthrough.js
 */

const puppeteer = require('puppeteer');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const DISPLAY  = process.env.DISPLAY || ':99';
const WIDTH    = 1280;
const HEIGHT   = 800;
const FPS      = 30;
const BASE_URL = 'http://localhost:3001/_index.html';
const OUT_DIR  = path.join(__dirname, '../artifacts/walkthrough');
const RAW_FILE = path.join(OUT_DIR, 'raw.mp4');
const OUT_FILE = path.join(OUT_DIR, 'bento-walkthrough.mp4');

fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function smoothScroll(page, targetY, durationMs = 600) {
  const steps = Math.round(durationMs / 16);
  const startY = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i++) {
    const y = startY + (targetY - startY) * (i / steps);
    await page.evaluate(y => window.scrollTo(0, y), y);
    await sleep(16);
  }
}

async function clickTab(page, label) {
  const btn = await page.$(`button.tab[aria-label*="${label}"], button.tab::-p-text(${label}), .tab-pill button`);
  // Use evaluate to find the tab by text
  await page.evaluate((text) => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const tab = tabs.find(b => b.textContent.trim() === text || b.getAttribute('data-mode') === text.toLowerCase());
    if (tab) tab.click();
  }, label);
}

(async () => {
  console.log('Launching browser on', DISPLAY);
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: false,
    args: [
      `--display=${DISPLAY}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--window-position=0,0',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  // Start ffmpeg capture
  console.log('Starting ffmpeg capture...');
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'x11grab',
    '-r', String(FPS),
    '-s', `${WIDTH}x${HEIGHT}`,
    '-i', `${DISPLAY}`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    RAW_FILE,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stderr.on('data', d => process.stdout.write('.'));
  await sleep(1000); // let ffmpeg warm up

  try {
    // ── Scene 1: Load, let the page animate in ──
    console.log('\nScene 1: Loading page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(3200);

    // ── Scene 2: Hover each Life tile to demo lift effect ──
    console.log('Scene 2: Hovering Life tiles...');
    const lifeTiles = await page.$$('.bento .app:not([disabled])');
    console.log(`  Found ${lifeTiles.length} enabled tiles`);
    for (const tile of lifeTiles) {
      const box = await tile.boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await sleep(600);
    }
    // Also hover the coming-soon tile briefly
    const allLifeTiles = await page.$$('.bento .app');
    if (allLifeTiles.length > lifeTiles.length) {
      const cs = allLifeTiles[allLifeTiles.length - 1];
      const box = await cs.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await sleep(500);
      }
    }
    // Park mouse top-center
    await page.mouse.move(WIDTH / 2, 40, { steps: 10 });
    await sleep(700);

    // ── Scene 3: Switch to Work tab ──
    console.log('Scene 3: Switching to Work tab...');
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-mode]')];
      const work = tabs.find(t => t.dataset.mode === 'work');
      if (work) work.click();
    });
    await sleep(2800);

    // Hover work tiles
    const workTiles = await page.$$('.bento .app:not([disabled])');
    console.log(`  Found ${workTiles.length} work tiles`);
    for (const tile of workTiles) {
      const box = await tile.boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await sleep(550);
    }
    await page.mouse.move(WIDTH / 2, 40, { steps: 10 });
    await sleep(700);

    // ── Scene 4: Responsive — shrink to mobile width ──
    console.log('Scene 4: Responsive resize...');
    // Smoothly animate the viewport narrowing
    for (let w = WIDTH; w >= 420; w -= 20) {
      await page.setViewport({ width: w, height: HEIGHT });
      await sleep(18);
    }
    await sleep(1800);
    // Widen back
    for (let w = 420; w <= WIDTH; w += 20) {
      await page.setViewport({ width: w, height: HEIGHT });
      await sleep(18);
    }
    await sleep(1000);

    // ── Scene 5: Back to Life tab ──
    console.log('Scene 5: Back to Life tab...');
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-mode]')];
      const life = tabs.find(t => t.dataset.mode === 'life');
      if (life) life.click();
    });
    await sleep(2500);

    // Final: slow mouse drift across the bento grid
    await page.mouse.move(200, 400, { steps: 20 });
    await sleep(300);
    await page.mouse.move(700, 350, { steps: 25 });
    await sleep(300);
    await page.mouse.move(WIDTH / 2, 60, { steps: 15 });
    await sleep(1000);

  } finally {
    // Stop ffmpeg
    console.log('\nStopping capture...');
    ffmpeg.stdin?.end();
    ffmpeg.kill('SIGINT');
    await sleep(2000);
    await browser.close();
  }

  // Post-process: add fade-in/out, scale to even dimensions
  console.log('Post-processing...');
  execSync(
    `ffmpeg -y -i "${RAW_FILE}" \
      -vf "fade=t=in:st=0:d=0.6,fade=t=out:st=28:d=0.8,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
      -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p \
      "${OUT_FILE}"`,
    { stdio: 'inherit' }
  );

  console.log('\nDone:', OUT_FILE);
  fs.unlinkSync(RAW_FILE);
})();
