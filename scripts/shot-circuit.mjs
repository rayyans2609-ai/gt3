/** Capture settled camera frames across the loop, skipping the legacy montage layer. */
// Usage: GT3_URL=http://localhost:5174 node scripts/shot-circuit.mjs
import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://localhost:5173';
const stops = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 120000,
  args: [
    '--no-sandbox', '--no-first-run', '--user-data-dir=/tmp/gt3-shot-circuit',
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1600,900',
  ],
  defaultViewport: { width: 1600, height: 900 },
});
async function run() {
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('track'),
  { timeout: 120000 });
await new Promise((resolve) => setTimeout(resolve, 4000));
await page.mouse.wheel({ deltaY: 240 });
await new Promise((resolve) => setTimeout(resolve, 1000));

for (const at of stops) {
  await page.evaluate((target) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, target * max);
  }, at);
  let actual = 0;
  let montage = false;
  for (let i = 0; i < 200; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    ({ actual, montage } = await page.evaluate(() => ({
      actual: window.__gt3.probe().progress,
      montage: !!document.querySelector('#montage-layer.is-active'),
    })));
    if (montage) { await page.keyboard.press('Escape'); continue; }
    if (Math.abs(actual - at) < 0.001) break;
  }
  if (montage || Math.abs(actual - at) >= 0.001) {
    throw new Error(`Route did not settle at ${at}: actual ${actual}, montage ${montage}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const path = `/tmp/gt3-legacy-${String(at).replace('.', 'p')}.png`;
  await page.screenshot({ path });
  console.log('shot', path, 'actual', actual, 'montage', montage);
}
console.log('errors', JSON.stringify(errors));
}

try {
  await run();
} finally {
  await browser.close();
}
