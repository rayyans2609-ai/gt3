/**
 * shot.mjs — headless screenshots of the running experience.
 * Usage: node scripts/shot.mjs <outPrefix> <progress0> [progress1 ...]
 * Drives the real scroll position so what is captured is what a user would see.
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [, , prefix = 'shot', ...progresses] = process.argv;
const stops = progresses.length ? progresses.map(Number) : [0];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new', dumpio: false, protocolTimeout: 120000,
  args: [
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    '--enable-unsafe-swiftshader', '--hide-scrollbars',
    '--window-size=1600,900', '--no-sandbox', '--user-data-dir=/tmp/gt3-chrome-profile', '--disable-dev-shm-usage', '--no-first-run',
  ],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(`${process.env.GT3_URL || 'http://localhost:5173'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 9000));

for (const p of stops) {
  await page.evaluate((prog) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, prog * max);
  }, p);
  // Let the damping settle to the new target.
  await new Promise((r) => setTimeout(r, 2200));
  const out = `/tmp/${prefix}_${String(p).replace('.', 'p')}.png`;
  await page.screenshot({ path: out });
  console.log('wrote', out);
}

console.log('--- console ---');
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
