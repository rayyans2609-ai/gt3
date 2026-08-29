// End-to-end acceptance probe. Unlike qa.mjs (which scrolls on fixed timers and therefore
// races the montage), this walks the route and WAITS for each montage to finish before
// scrolling on, so all ten collection events are actually observed.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-chrome-accept', '--no-first-run',
         '--window-size=1600,900', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errs = [];
const failed = [];
page.on('pageerror', e => errs.push(`[PAGEERROR] ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`[console.error] ${m.text()}`); });
page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url()}`));
page.on('response', r => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`); });

const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = n => page.screenshot({ path: `/tmp/acc_${n}.png` });

const probe = () => page.evaluate(() => ({
  scrollY: window.scrollY,
  maxScroll: document.documentElement.scrollHeight - window.innerHeight,
  unlocked: document.querySelector('.hud-unlocked__value')?.textContent?.trim() ?? '?',
  carName: document.querySelector('#hud-topleft')?.textContent?.trim().replace(/\s+/g, ' ') ?? '?',
  montage: !!document.querySelector('#montage-layer.is-active'),
  showcase: !!document.querySelector('#showcase-layer.is-open'),
  fullcard: !!document.querySelector('#fullscreen-card.is-open'),
  finish: (() => { const f = document.querySelector('#finish-screen');
    return !!f && f.children.length > 0 && getComputedStyle(f).visibility !== 'hidden'; })(),
  voiceNote: document.querySelector('.showcase-voice__note')?.textContent?.trim() ?? null,
}));

// Wait until no montage is playing (or give up).
async function settle(maxMs = 32000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await probe();
    if (!s.montage) return s;
    await wait(700);
  }
  return probe();
}

async function scrollToProgress(p) {
  await page.evaluate((prog) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * prog, behavior: 'instant' });
  }, p);
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await wait(11000);
let s = await probe();
console.log('START      ', JSON.stringify(s));
await shot('01_start');

// Audio is now started ONLY by the explicit Sound On control (scroll no longer unlocks
// it), so the harness has to click it or every audio assertion below is vacuous.
const soundOn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /sound/i.test(x.textContent));
  if (!b) return 'control missing';
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (typeof soundOn === 'object') {
  await page.mouse.click(soundOn.x, soundOn.y);
  await wait(2500);
  const label = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /sound/i.test(x.textContent));
    return b ? b.textContent.trim() : '?';
  });
  console.log(`SOUND ON    clicked -> "${label}"`);
} else {
  console.log('SOUND ON    FAILED:', soundOn);
}

// Kick the handoff.
await page.mouse.wheel({ deltaY: 240 });
await wait(2000);

const seen = [];
// Walk the route in small steps so no coin is skipped, settling after each.
for (let p = 0.02; p <= 1.0001; p += 0.02) {
  await scrollToProgress(Math.min(p, 1));
  await wait(900);
  s = await settle();
  const n = parseInt(s.unlocked, 10);
  if (!Number.isNaN(n) && n > seen.length) {
    seen.push({ at: +p.toFixed(2), unlocked: s.unlocked, car: s.carName });
    console.log(`UNLOCK #${n}  p=${p.toFixed(2)}  ${s.unlocked}  ${s.carName}`);
    if (n === 1) await shot('02_first_unlock');
    if (n === 5) await shot('03_fifth_unlock');
  }
}

s = await probe();
console.log('AFTER WALK ', JSON.stringify(s));
await shot('04_end_of_route');

// Showcase Mode + narration.
await page.keyboard.press('f');
await wait(3500);
s = await probe();
console.log('SHOWCASE   ', JSON.stringify(s));
await shot('05_showcase');
await page.keyboard.press('Escape');
await wait(1800);
s = await probe();
console.log('AFTER ESC  ', JSON.stringify(s));
await shot('06_after_escape');

// Drive to the very end for the finish sequence.
await scrollToProgress(1);
await wait(2000);
s = await settle();
await wait(4000);
s = await probe();
console.log('FINISH     ', JSON.stringify(s));
await shot('07_finish');

console.log('\n--- unlocks observed ---');
console.log(`${seen.length} / 10`);
for (const u of seen) console.log(' ', JSON.stringify(u));
console.log('\n--- page/console errors ---');
console.log(errs.length ? [...new Set(errs)].slice(0, 25).join('\n') : 'none');
console.log('\n--- failed/4xx requests ---');
console.log(failed.length ? [...new Set(failed)].slice(0, 25).join('\n') : 'none');

await browser.close();
