/**
 * perf-drive.mjs — scroll frame-pacing A/B harness. THE user-facing metric.
 *
 * Measures inside the coin-free band before the first collectible (p < 0.075) on a
 * fresh load. Everything past that fires 15.6s montages that lock scrolling and render
 * through a different renderer, and driving the full route to clear them left only
 * 8-18 usable frames per scenario -- far too few to compare runs. This band is
 * montage-free, finish-free, fast, and identical between runs, so before/after numbers
 * are directly comparable.
 *
 * Input is genuine CDP wheel input. Frames are tagged with mode/lock and any frame that
 * is not free-scrolling race is discarded and counted.
 *
 * Usage: node scripts/perf-drive.mjs [label]
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'current';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-drive', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => window.__gt3?.probe && document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 7000));

await p.evaluate(() => {
  window.__perf = { on: false, rows: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    if (window.__perf.on) {
      const s = window.__gt3.probe();
      window.__perf.rows.push([now - last, s.mode === 'race' && !s.locked ? 1 : 0, s.canvasW, s.mode, s.progress]);
    }
    last = now; requestAnimationFrame(rec);
  })();
});

// Measurement band, used AFTER every coin has been collected. Well clear of the last
// coin (0.88) and of the finish (1.0), which would switch mode away from 'race'.
const LO = 0.30, HI = 0.78;
const probe = () => p.evaluate(() => window.__gt3.probe());
async function settle(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await probe();
    if (s.mode === 'race' && !s.locked) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
async function rewind() {
  await p.evaluate((lo) => { const m = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: m * lo, behavior: 'instant' }); }, LO + 0.05);
  await new Promise((r) => setTimeout(r, 800));
  await settle();
}
// Oscillate inside [LO,HI]. The direction is re-checked EVERY step: at deltaY 300 a
// single wheel event is ~0.03 of progress, so checking any less often overshoots the
// band and drags the run into a montage or the finish sequence.
async function driveBounded(delta, gap, steps) {
  let dir = 1;
  for (let i = 0; i < steps; i++) {
    const pr = (await probe()).progress;
    if (pr > HI) dir = -1; else if (pr < LO) dir = 1;
    await p.mouse.wheel({ deltaY: delta * dir });
    await new Promise((r) => setTimeout(r, gap));
  }
}
async function scenario(name, fn) {
  await rewind();
  await p.evaluate(() => { window.__perf.rows = []; window.__perf.on = true; });
  await fn();
  const rows = await p.evaluate(() => { window.__perf.on = false; return window.__perf.rows; });
  const body = rows.slice(3);
  const race = body.filter((r) => r[1] === 1).map((r) => r[0]);
  const dropped = body.length - race.length;
  const modes = [...new Set(body.filter((r) => r[1] === 0).map((r) => r[3]))];
  if (race.length < 20) { console.log(`${name.padEnd(20)} INSUFFICIENT (${race.length} race frames, ${dropped} dropped: ${modes})`); return; }
  const f = [...race].sort((x, y) => x - y);
  const q = (t) => f[Math.min(f.length - 1, Math.floor(f.length * t))];
  const mean = f.reduce((a, x) => a + x, 0) / f.length;
  const widths = [...new Set(body.filter((r) => r[1] === 1).map((r) => r[2]))].sort((a, x) => a - x);
  console.log(`${name.padEnd(20)} fps ${(1000/mean).toFixed(1).padStart(5)}  p50 ${q(0.5).toFixed(0).padStart(4)}ms  p95 ${q(0.95).toFixed(0).padStart(5)}ms  p99 ${q(0.99).toFixed(0).padStart(5)}ms  >33ms ${String(f.filter((x)=>x>33.4).length).padStart(3)}/${String(f.length).padStart(3)}  dpr-px ${widths.join('/')}  dropped ${dropped}`);
}

// Clear every coin first so no montage can fire mid-measurement. Stop short of 1.0:
// crossing the finish switches mode away from 'race' permanently.
process.stdout.write('clearing route');
for (let step = 1; step <= 46; step++) {
  await p.evaluate((t) => { const m = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: m * t, behavior: 'instant' }); }, (step / 46) * 0.92);
  await new Promise((r) => setTimeout(r, 260));
  const s = await probe();
  if (s.mode !== 'race' || s.locked) { process.stdout.write('.'); await settle(); }
}
const st = await probe();
console.log(` done — unlocked ${await p.evaluate(() => document.querySelector('.hud-unlocked__value')?.textContent.trim())}, mode=${st.mode}`);

console.log(`\n=== GT3 SCROLL [${LABEL}] — cleared route, real wheel input, race frames only ===`);
await scenario('idle at rest',   async () => { await new Promise((r) => setTimeout(r, 4000)); });
await scenario('slow forward',   () => driveBounded(40, 50, 70));
await scenario('fast forward',   () => driveBounded(300, 16, 130));
await scenario('reversals',      async () => {
  for (let k = 0; k < 7; k++) {
    for (const d of [300, -300]) for (let i = 0; i < 9; i++) {
      await p.mouse.wheel({ deltaY: d }); await new Promise((r) => setTimeout(r, 16)); }
  } });
console.log('\nerrors:', errs.length ? errs.slice(0, 4).join(' | ') : 'none');
await b.close();
