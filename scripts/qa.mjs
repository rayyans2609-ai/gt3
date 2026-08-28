import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000,
  args: ['--enable-gpu','--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader',
         '--hide-scrollbars','--no-sandbox','--user-data-dir=/tmp/gt3-chrome-profile','--no-first-run',
         '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`[PAGEERROR] ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`[console.error] ${m.text()}`); });

const shot = async (name) => { await page.screenshot({ path: `/tmp/qa_${name}.png` }); console.log('shot', name); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const scrollTo = async p => page.evaluate(v => {
  window.scrollTo(0, v * (document.documentElement.scrollHeight - window.innerHeight));
}, p);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 90000 });
await wait(10000);
await shot('01_start');            // start screen, pre-scroll

await scrollTo(0.03); await wait(2500);
await shot('02_handoff');          // start screen dismissed, race begun

await scrollTo(0.055); await wait(2500);
await shot('03_approach');         // coin approach telegraph

// Roll into the first coin and let the montage run.
await scrollTo(0.072); await wait(2000);
await shot('04_montage_early');
await wait(4000);  await shot('05_montage_mid');
await wait(5000);  await shot('06_montage_late');
await wait(6000);  await shot('07_after_montage');

// Showcase Mode
await page.keyboard.press('f'); await wait(2500);
await shot('08_showcase');
await page.keyboard.press('Escape'); await wait(1500);

// Deeper into the route + a corner
await scrollTo(0.26); await wait(2600);
await shot('09_corner');
await scrollTo(0.51); await wait(2600);
await shot('10_mid_route');

// Finish
await scrollTo(1.0); await wait(4000);
await shot('11_finish');

const st = await page.evaluate(() => ({
  mode: window.__gt3 ? 'debug-on' : 'n/a',
  scrollY: window.scrollY,
}));
console.log('state', JSON.stringify(st));
console.log('--- errors ---');
console.log(errs.length ? errs.slice(0, 25).join('\n') : 'none');
await browser.close();
