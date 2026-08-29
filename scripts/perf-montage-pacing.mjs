/**
 * perf-montage-pacing.mjs — frame pacing DURING montage playback (user-facing metric).
 * Records only frames where #montage-layer.is-active, so nothing else contaminates it.
 * DOM-only detection, so the same script runs against older commits.
 * Usage: node scripts/perf-montage-pacing.mjs <label>
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'run';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', `--user-data-dir=/tmp/gt3-mp-${LABEL}`, '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 14000));

await p.evaluate(() => {
  window.__mp = { rows: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    const on = !!document.querySelector('#montage-layer.is-active');
    if (on) window.__mp.rows.push([now - last, document.querySelector('#montage-canvas, #montage-layer canvas')?.width ?? 0]);
    last = now; requestAnimationFrame(rec);
  })();
});

const active = () => p.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
for (let i = 0; i < 90 && !(await active()); i++) {
  await p.mouse.wheel({ deltaY: 200 }); await new Promise((r) => setTimeout(r, 60));
}
if (!(await active())) { console.log('could not trigger montage'); await b.close(); process.exit(1); }
const t0 = Date.now();
while (await active()) { await new Promise((r) => setTimeout(r, 300)); if (Date.now() - t0 > 40000) break; }
const wall = (Date.now() - t0) / 1000;

const rows = await p.evaluate(() => window.__mp.rows);
const f = rows.map((r) => r[0]).slice(3).sort((x, y) => x - y);
const widths = [...new Set(rows.map((r) => r[1]))].filter(Boolean);
const q = (t) => f[Math.min(f.length - 1, Math.floor(f.length * t))];
const mean = f.reduce((a, x) => a + x, 0) / f.length;
console.log(`\n[${LABEL}] montage playback`);
console.log(`  duration (wall clock, trigger -> layer inactive): ${wall.toFixed(1)}s`);
console.log(`  frames ${f.length}   fps ${(1000 / mean).toFixed(1)}   p50 ${q(0.5).toFixed(0)}ms   p95 ${q(0.95).toFixed(0)}ms   worst ${f[f.length-1].toFixed(0)}ms`);
console.log(`  frames slower than 33ms: ${f.filter((x) => x > 33.4).length}/${f.length} (${(100*f.filter((x)=>x>33.4).length/f.length).toFixed(0)}%)`);
console.log(`  montage canvas width(s): ${widths.join('/') || 'n/a'}`);
console.log(`  errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`);
await b.close();
