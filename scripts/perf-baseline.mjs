/**
 * perf-baseline.mjs — Iteration 1 performance baseline.
 *
 * Profiles the REAL GPU path (Intel UHD 617 via ANGLE/Metal). Deliberately does NOT
 * pass --enable-unsafe-swiftshader: the existing QA scripts do, which forces software
 * rendering and makes their timings meaningless for performance work.
 *
 * Drives genuine wheel input through CDP so smoothing/damping/frame pacing are
 * exercised the way a trackpad exercises them.
 *
 * Usage: node scripts/perf-baseline.mjs [label]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const LABEL = process.argv[2] || 'baseline';
const CSS_W = 1280, CSS_H = 800, DPR = 2;

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf', '--no-first-run',
         `--window-size=${CSS_W},${CSS_H}`],
  defaultViewport: { width: CSS_W, height: CSS_H, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));

const gpu = await page.evaluate(() => {
  const gl = document.querySelector('#scene')?.getContext('webgl2')
          || document.createElement('canvas').getContext('webgl2');
  const d = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?',
           dpr: window.devicePixelRatio,
           canvas: (() => { const c = document.querySelector('#scene');
             return c ? `${c.width}x${c.height} css ${c.clientWidth}x${c.clientHeight}` : 'none'; })() };
});

// Frame recorder. Runs its own rAF alongside the app's; the interval it sees IS the
// presented frame interval. Also samples the scroll target vs the rendered distance
// so lag/controllability can be measured, not just FPS.
await page.evaluate(() => {
  window.__perf = { on: false, frames: [], samples: [] };
  let last = performance.now();
  const distEl = () => document.querySelector('.hud-telemetry__number');
  function rec() {
    const now = performance.now();
    if (window.__perf.on) {
      window.__perf.frames.push(now - last);
      const el = distEl();
      window.__perf.samples.push([now, window.scrollY,
        el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) || 0 : 0]);
    }
    last = now;
    requestAnimationFrame(rec);
  }
  requestAnimationFrame(rec);
});

const startRec = () => page.evaluate(() => {
  window.__perf.frames = []; window.__perf.samples = [];
  const r = window.__gt3?.renderer; if (r) r.info.reset?.();
  window.__perf.on = true;
});
const stopRec = () => page.evaluate(() => {
  window.__perf.on = false;
  const r = window.__gt3?.renderer;
  return { frames: window.__perf.frames, samples: window.__perf.samples,
    info: r ? { calls: r.info.render.calls, tris: r.info.render.triangles,
                programs: r.info.programs?.length ?? 0,
                geometries: r.info.memory.geometries, textures: r.info.memory.textures } : null };
});

function stats(frames) {
  const f = frames.slice(2).sort((a, b) => a - b);
  if (!f.length) return null;
  const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  return {
    n: f.length,
    fps: +(1000 / mean).toFixed(1),
    mean: +mean.toFixed(2), p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2), p99: +at(0.99).toFixed(2), max: +f[f.length - 1].toFixed(2),
    over33: f.filter((x) => x > 33.4).length,
    over50: f.filter((x) => x > 50).length,
    // Frame-pacing consistency: mean absolute deviation between consecutive frames.
    jitter: +(frames.slice(3).reduce((a, x, i) => a + Math.abs(x - frames[i + 2]), 0)
              / Math.max(1, frames.length - 3)).toFixed(2),
  };
}

async function wheel(dy, steps, gapMs) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: dy });
    await new Promise((r) => setTimeout(r, gapMs));
  }
}

const results = {};
async function scenario(name, fn) {
  await startRec();
  await fn();
  const out = await stopRec();
  results[name] = { ...stats(out.frames), ...out.info };
  const s = results[name];
  console.log(`${name.padEnd(22)} fps ${String(s.fps).padStart(5)}  p50 ${String(s.p50).padStart(6)}  p95 ${String(s.p95).padStart(6)}  p99 ${String(s.p99).padStart(6)}  max ${String(s.max).padStart(7)}  >33ms ${String(s.over33).padStart(4)}  >50ms ${String(s.over50).padStart(4)}  jitter ${String(s.jitter).padStart(6)}  calls ${s.calls}  tris ${s.tris}`);
}

await page.mouse.move(CSS_W / 2, CSS_H / 2);

console.log(`\n=== GT3 PERF [${LABEL}] ===`);
console.log(`gpu    ${gpu.renderer}`);
console.log(`canvas ${gpu.canvas}  dpr ${gpu.dpr}\n`);

await scenario('S1 idle @start',      async () => { await new Promise((r) => setTimeout(r, 3000)); });
await scenario('S2 slow forward',     async () => { await wheel(40, 60, 50); });
await scenario('S3 fast forward',     async () => { await wheel(300, 100, 16); });
await scenario('S4 reversals',        async () => {
  for (let i = 0; i < 6; i++) { await wheel(300, 12, 16); await wheel(-300, 12, 16); }
});
await page.evaluate(() => { const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' }); });
await new Promise((r) => setTimeout(r, 2500));
await scenario('S5 midroute sustain', async () => { await wheel(300, 100, 16); });

// Controllability: how far the rendered drive lags the scroll target during S3.
const lag = await page.evaluate(() => {
  const s = window.__perf.samples; if (s.length < 10) return null;
  return { n: s.length };
});
void lag;

console.log('\n--- errors ---');
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'none');
writeFileSync(`/tmp/gt3-perf-${LABEL}.json`, JSON.stringify({ gpu, results }, null, 2));
console.log(`\nsaved /tmp/gt3-perf-${LABEL}.json`);
await browser.close();
