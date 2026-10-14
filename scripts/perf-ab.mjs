/**
 * perf-ab.mjs — like-for-like scroll frame pacing, BEFORE vs AFTER.
 *
 * Constrained to the band before the first checkpoint (p<0.065) and oscillated
 * with a per-step bound, so no morph or finish can fire.
 *
 * Usage: node scripts/perf-ab.mjs <label>
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'run';
const LO = 0.006, HI = 0.062;      // first checkpoint is beyond this band
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', `--user-data-dir=/tmp/gt3-ab-${LABEL}`, '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 14000));   // let all 10 GLBs land

await p.evaluate(() => {
  window.__perf = { on: false, rows: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    if (window.__perf.on) {
      const busy = window.__gt3?.probe().mode !== 'race';
      window.__perf.rows.push([now - last, busy ? 0 : 1, document.querySelector('#scene')?.width ?? 0]);
    }
    last = now; requestAnimationFrame(rec);
  })();
});
const prog = () => p.evaluate(() => {
  const m = document.documentElement.scrollHeight - window.innerHeight;
  return m > 0 ? window.scrollY / m : 0; });

async function osc(delta, gap, steps) {
  let dir = 1;
  for (let i = 0; i < steps; i++) {
    const pr = await prog();
    if (pr > HI) dir = -1; else if (pr < LO) dir = 1;
    await p.mouse.wheel({ deltaY: delta * dir });
    await new Promise((r) => setTimeout(r, gap));
  }
}
async function scenario(name, fn) {
  await p.evaluate((lo) => { const m = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: m * lo, behavior: 'instant' }); }, (LO + HI) / 2);
  await new Promise((r) => setTimeout(r, 900));
  await p.evaluate(() => { window.__perf.rows = []; window.__perf.on = true; });
  await fn();
  const rows = await p.evaluate(() => { window.__perf.on = false; return window.__perf.rows; });
  const body = rows.slice(3);
  const good = body.filter((r) => r[1] === 1).map((r) => r[0]);
  const f = [...good].sort((x, y) => x - y);
  if (f.length < 15) { console.log(`${name.padEnd(16)} INSUFFICIENT (${f.length})`); return; }
  const q = (t) => f[Math.min(f.length - 1, Math.floor(f.length * t))];
  const widths = [...new Set(body.filter((r) => r[1] === 1).map((r) => r[2]))].sort((a, x) => a - x);
  console.log(`${name.padEnd(16)} p50 ${q(0.5).toFixed(0).padStart(4)}ms  p75 ${q(0.75).toFixed(0).padStart(4)}ms  p95 ${q(0.95).toFixed(0).padStart(5)}ms  >33ms ${String(f.filter((x)=>x>33.4).length).padStart(3)}/${String(f.length).padStart(3)} (${(100*f.filter((x)=>x>33.4).length/f.length).toFixed(0)}%)  canvas ${widths.join('/')}  dropped ${body.length - f.length}`);
}
console.log(`\n--- [${LABEL}] checkpoint-free band, real wheel input ---`);
await scenario('idle',         async () => { await new Promise((r) => setTimeout(r, 4000)); });
await scenario('slow scroll',  () => osc(30, 50, 45));
await scenario('fast scroll',  () => osc(130, 16, 90));
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
await b.close();
