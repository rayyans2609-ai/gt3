/**
 * Real-app assets for the Claude Design canvas (Phase 4 design <-> code loop).
 *   - car-<theme>.png      : the McLaren at rest, cropped from the live Landing (overlay hidden, motion
 *                            frozen so the pose is reproducible), 2x pixels.
 *   - still-<theme>-<p>.jpg: whole-viewport Landing frames at fixed transition progress (reference only).
 * The runtime stays the authority: this only photographs what GT3 renders.
 *
 *   GT3_PORT=5252 GT3_SERVER_LOG=$PWD/local/evidence/design/capture.log \
 *     scripts/with-verification-server.sh node scripts/capture-design-assets.mjs [outDir]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.GT3_URL || 'http://127.0.0.1:5252';
const out = path.resolve(process.argv[2] || 'local/design-canvas/assets');
const wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
const W = 1440, H = 900;
// Crop around the resting car (centre ~ 50 % / 64.2 % of the viewport) incl. its ground shadow.
const CROP = { x: 507, y: 453, width: 426, height: 265 };
const STILLS = [0.2, 0.4, 0.55, 0.7, 0.8, 0.88];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000,
  args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${path.resolve('local/tmp', `gt3-design-assets-${process.pid}`)}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const written = [];
try {
  for (const theme of ['day', 'night']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.evaluateOnNewDocument(theme => {
      try { sessionStorage.setItem('gt3.session.v1', JSON.stringify({ theme })); } catch { /* ignore */ }
    }, theme);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gt3?.landing?.tuning, { timeout: 120000, polling: 20 });
    await page.evaluate(() => { const t = window.__gt3.landing.tuning; t.idleDegPerSecond = 0; t.bobAmplitude = 1e-9; });
    await page.waitForFunction(() => window.__gt3.landing.loaded(), { timeout: 120000, polling: 150 });
    await wait(2000);

    // Reference stills first (overlay visible), downscaled by capturing at 1x as JPEG.
    for (const p of STILLS) {
      await page.evaluate(p => window.__gt3.landing.seek(p), p);
      await wait(600);
      const file = path.join(out, `still-${theme}-${String(p).replace('.', '')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
      written.push(file);
    }

    // The resting car: overlay hidden, 2x pixels, tight crop.
    await page.evaluate(() => window.__gt3.landing.seek(0));
    await wait(800);
    await page.addStyleTag({ content: '#overlay, #landing, #hub { visibility: hidden !important; }' });
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
    await wait(1200);
    const file = path.join(out, `car-${theme}.png`);
    await page.screenshot({ path: file, clip: CROP });
    written.push(file);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, crop: CROP, written: written.map(f => path.basename(f)) }, null, 1));
