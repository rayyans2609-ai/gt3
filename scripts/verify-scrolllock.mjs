/**
 * verify-scrolllock.mjs — the non-passive wheel/touchmove swallowers now attach only
 * while the scroll is locked. If attach/detach is wrong, scrolling would leak during a
 * montage (or stay dead after one). This proves both directions.
 */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-lock', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 14000));
const y = () => p.evaluate(() => window.scrollY);
const montage = () => p.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
let pass = true;

// 1. Unlocked: wheel must scroll.
const y0 = await y();
for (let i = 0; i < 5; i++) { await p.mouse.wheel({ deltaY: 100 }); await new Promise((r) => setTimeout(r, 40)); }
const y1 = await y();
console.log(`unlocked scroll: ${y0} -> ${y1}  ${y1 > y0 ? 'PASS' : 'FAIL'}`);
if (!(y1 > y0)) pass = false;

// 2. Drive into the first coin to trigger a montage, then confirm scroll is held.
for (let i = 0; i < 60 && !(await montage()); i++) {
  await p.mouse.wheel({ deltaY: 200 }); await new Promise((r) => setTimeout(r, 60));
}
const inMontage = await montage();
console.log(`montage triggered: ${inMontage ? 'yes' : 'NO — could not test lock'}`);
if (inMontage) {
  const lockY = await y();
  for (let i = 0; i < 12; i++) { await p.mouse.wheel({ deltaY: 400 }); await new Promise((r) => setTimeout(r, 30)); }
  const afterY = await y();
  const held = Math.abs(afterY - lockY) <= 2;
  console.log(`locked during montage: ${lockY} -> ${afterY}  ${held ? 'PASS (held)' : 'FAIL (leaked)'}`);
  if (!held) pass = false;
  // 3. After the montage ends, scrolling must work again.
  for (let i = 0; i < 80 && (await montage()); i++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 1200));
  const y2 = await y();
  for (let i = 0; i < 6; i++) { await p.mouse.wheel({ deltaY: 150 }); await new Promise((r) => setTimeout(r, 50)); }
  const y3 = await y();
  console.log(`unlocked again: ${y2} -> ${y3}  ${y3 > y2 ? 'PASS' : 'FAIL'}`);
  if (!(y3 > y2)) pass = false;
} else pass = false;
console.log(pass ? '\nRESULT: PASS' : '\nRESULT: FAIL');
await b.close();
