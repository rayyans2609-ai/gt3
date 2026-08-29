/**
 * perf-montage-start.mjs — how long does the coin -> montage transition stall for,
 * and when do the montage card's reference images actually finish loading?
 */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-start', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 15000));
await p.evaluate(() => {
  window.__s = { frames: [], activeAt: null, imgs: [] };
  let last = performance.now(), wasActive = false;
  (function rec() {
    const now = performance.now();
    const on = !!document.querySelector('#montage-layer.is-active');
    window.__s.frames.push([now, now - last, on ? 1 : 0]);
    if (on && !wasActive) {
      window.__s.activeAt = now;
      // Watch the card's reference images from the instant the montage opens.
      for (const img of document.querySelectorAll('#montage-layer img')) {
        const t = performance.now();
        if (img.complete && img.naturalWidth) window.__s.imgs.push(['cached', 0]);
        else img.addEventListener('load', () => window.__s.imgs.push(['loaded', performance.now() - t]), { once: true });
      }
    }
    wasActive = on; last = now; requestAnimationFrame(rec);
  })();
});
const active = () => p.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
// Approach speed is a variable: the prewarm needs wall-clock time during the approach
// to compile programs and drip-feed texture uploads. FAST=1 reproduces a hard charge at
// the coin, the worst case for prewarm.
const FAST = process.argv[2] === 'fast';
const [dy, gap] = FAST ? [200, 60] : [55, 110];
for (let i = 0; i < 400 && !(await active()); i++) {
  await p.mouse.wheel({ deltaY: dy }); await new Promise((r) => setTimeout(r, gap)); }
while (await active()) await new Promise((r) => setTimeout(r, 200));
const d = await p.evaluate(() => window.__s);
const i = d.frames.findIndex((f) => f[2] === 1);
console.log('\n=== coin -> montage transition ===');
if (i > 3) {
  console.log('frame intervals around the transition (ms):');
  for (let k = i - 3; k <= Math.min(i + 3, d.frames.length - 1); k++)
    console.log(`   ${k === i ? '>> ' : '   '}${d.frames[k][1].toFixed(1).padStart(7)}  ${d.frames[k][2] ? 'montage' : 'race'}`);
  const pre = d.frames.slice(Math.max(0, i - 12), i).map((f) => f[1]).sort((a, c) => a - c);
  console.log(`   typical race frame before transition: ${pre[Math.floor(pre.length/2)].toFixed(1)}ms`);
  console.log(`   TRANSITION FRAME: ${d.frames[i][1].toFixed(1)}ms  (stall = ${(d.frames[i][1] - pre[Math.floor(pre.length/2)]).toFixed(1)}ms)`);
}
console.log('\n=== montage card images ===');
console.log(d.imgs.length ? d.imgs.map(([s, t]) => `${s} ${t.toFixed(0)}ms`).join(', ') : 'none observed');
await b.close();
