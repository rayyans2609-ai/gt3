/**
 * perf-scroll.mjs — the USER-FACING metric: frame pacing during real wheel input,
 * measured ONLY on genuine race frames.
 *
 * Earlier baselines were invalid: instant-seeking across the route triggers coin
 * montages, which lock scrolling and render through a SEPARATE renderer, so those
 * runs measured montage playback rather than scrolling. This harness tags every
 * frame with mode/lock state and discards anything that is not a free-scrolling
 * race frame, reporting how many it dropped.
 *
 * Usage: node scripts/perf-scroll.mjs [label]
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'current';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-scroll', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__gt3?.probe && document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

await p.evaluate(() => {
  window.__perf = { on: false, rows: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    if (window.__perf.on) {
      const s = window.__gt3.probe();
      window.__perf.rows.push([now - last, s.mode === 'race' && !s.locked ? 1 : 0, s.canvasW, s.speed01]);
    }
    last = now; requestAnimationFrame(rec);
  })();
});

const idle = () => p.evaluate(() => { const s = window.__gt3.probe();
  return s.mode === 'race' && !s.locked; });
async function settle(maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { if (await idle()) return true; await new Promise((r) => setTimeout(r, 400)); }
  return false;
}
// Walk to a target progress with real wheel input, waiting out every montage.
async function driveTo(target) {
  for (let guard = 0; guard < 300; guard++) {
    const s = await p.evaluate(() => window.__gt3.probe());
    if (s.progress >= target) return;
    if (s.mode !== 'race' || s.locked) { await settle(); continue; }
    await spinRaw(300, 25, 12);
  }
}
const spinRaw = async (dy, n, gap) => {
  for (let i = 0; i < n; i++) { await p.mouse.wheel({ deltaY: dy }); await new Promise((r) => setTimeout(r, gap)); }
};

async function scenario(name, fn) {
  await settle();
  await p.evaluate(() => { window.__perf.rows = []; window.__perf.on = true; });
  await fn();
  const rows = await p.evaluate(() => { window.__perf.on = false; return window.__perf.rows; });
  const race = rows.slice(2).filter((r) => r[1] === 1).map((r) => r[0]);
  const dropped = rows.length - 2 - race.length;
  if (race.length < 8) { console.log(`${name.padEnd(22)} INSUFFICIENT race frames (${race.length}); dropped ${dropped}`); return; }
  const f = [...race].sort((x, y) => x - y);
  const q = (t) => f[Math.min(f.length - 1, Math.floor(f.length * t))];
  const mean = f.reduce((a, x) => a + x, 0) / f.length;
  const widths = [...new Set(rows.filter((r) => r[1] === 1).map((r) => r[2]))].sort((a, x) => a - x);
  console.log(`${name.padEnd(22)} fps ${(1000/mean).toFixed(1).padStart(5)}  p50 ${q(0.5).toFixed(0).padStart(4)}ms  p95 ${q(0.95).toFixed(0).padStart(5)}ms  p99 ${q(0.99).toFixed(0).padStart(5)}ms  >33ms ${String(f.filter((x)=>x>33.4).length).padStart(3)}/${String(f.length).padStart(3)}  canvasW ${widths.join('/')}  (montage frames dropped ${dropped})`);
}

// Phase 1: clear the route so no montage can fire during measurement. Sustained
// scrolling otherwise collects coins constantly, and each montage locks scrolling for
// ~15.6s, leaving too few genuine race frames to measure. Once a coin is collected it
// never re-triggers, so afterwards the whole route is free to scroll.
process.stdout.write('clearing route (unlocking all 10 coins)');
// Stop short of 1.0: reaching the finish line switches mode to 'finish' and stays
// there, which would disqualify every subsequent frame. The last coin sits at 0.88.
for (let step = 1; step <= 46; step++) {
  await p.evaluate((t) => { const m = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: m * t, behavior: 'instant' }); }, (step / 46) * 0.92);
  await new Promise((r) => setTimeout(r, 260));
  if (!await idle()) { process.stdout.write('.'); await settle(40000); }
}
const unlocked = await p.evaluate(() => document.querySelector('.hud-unlocked__value')?.textContent.trim());
const st = await p.evaluate(() => window.__gt3.probe());
console.log(` done — unlocked ${unlocked}, mode=${st.mode} locked=${st.locked} progress=${st.progress.toFixed(3)}`);
// Return to midroute; nothing left to collect, so scrolling is unobstructed.
await p.evaluate(() => { const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' }); });
await new Promise((r) => setTimeout(r, 2500));
await settle();

console.log(`\n=== GT3 SCROLL PERF [${LABEL}] — race frames only, real wheel input ===`);
await scenario('S1 idle at rest', async () => { await new Promise((r) => setTimeout(r, 3000)); });
const spin = async (dy, n, gap) => {
  for (let i = 0; i < n; i++) { await p.mouse.wheel({ deltaY: dy }); await new Promise((r) => setTimeout(r, gap)); }
};
await scenario('S2 slow forward', () => spin(40, 45, 50));
await scenario('S3 fast forward', () => spin(300, 80, 16));
await scenario('S4 reversals', async () => {
  for (let k = 0; k < 6; k++) { await spin(300, 12, 16); await spin(-300, 12, 16); } });
await scenario('S5 midroute sustain', () => spin(300, 80, 16));
console.log('\nerrors:', errs.length ? errs.slice(0, 4).join(' | ') : 'none');
await b.close();
