/**
 * perf-isolate.mjs — attributes frame cost to specific render stages.
 * One page load; each config toggled at runtime and measured on the SAME scenario
 * (sustained fast forward scroll at midroute) so the numbers are directly comparable.
 */
import puppeteer from 'puppeteer-core';

const CSS_W = 1280, CSS_H = 800, DPR = 2;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-iso', '--no-first-run',
         `--window-size=${CSS_W},${CSS_H}`],
  defaultViewport: { width: CSS_W, height: CSS_H, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));

await page.evaluate(() => {
  window.__perf = { on: false, frames: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    if (window.__perf.on) window.__perf.frames.push(now - last);
    last = now; requestAnimationFrame(rec);
  })();
  const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' });
});
await new Promise((r) => setTimeout(r, 2500));

const apply = (cfg) => page.evaluate((c) => {
  const g = window.__gt3; if (!g) return 'no handles';
  g.passes.motionBlur.enabled = c.post;
  g.passes.wash.enabled = c.post;
  g.renderer.shadowMap.enabled = c.shadows;
  g.renderer.shadowMap.needsUpdate = true;
  g.scene.traverse((o) => { if (o.material) {
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
  g.renderer.setPixelRatio(c.dpr);
  g.composer.setPixelRatio(c.dpr);
  g.resizeScene(window.innerWidth, window.innerHeight);
  g.renderer.setPixelRatio(c.dpr);
  g.composer.setPixelRatio(c.dpr);
  g.composer.setSize(window.innerWidth, window.innerHeight);
  return 'ok';
}, cfg);

const info = () => page.evaluate(() => {
  const r = window.__gt3.renderer;
  return { calls: r.info.render.calls, tris: r.info.render.triangles,
           progs: r.info.programs.length, geo: r.info.memory.geometries, tex: r.info.memory.textures };
});

async function measure(name, cfg) {
  await apply(cfg);
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => { window.__perf.frames = []; window.__perf.on = true; });
  for (let i = 0; i < 70; i++) { await page.mouse.wheel({ deltaY: 300 }); await new Promise((r) => setTimeout(r, 16)); }
  const frames = await page.evaluate(() => { window.__perf.on = false; return window.__perf.frames; });
  const f = frames.slice(2).sort((a, b) => a - b);
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  const p95 = f[Math.floor(f.length * 0.95)];
  const i2 = await info();
  console.log(`${name.padEnd(34)} fps ${String((1000 / mean).toFixed(1)).padStart(5)}  p50 ${String(f[Math.floor(f.length/2)].toFixed(1)).padStart(6)}ms  p95 ${String(p95.toFixed(1)).padStart(6)}ms  calls ${String(i2.calls).padStart(4)}  tris ${String(i2.tris).padStart(7)}`);
  return 1000 / mean;
}

console.log('\n=== stage cost isolation (midroute, sustained fast scroll) ===');
console.log(`baseline config = dpr2 + post + shadows\n`);
await measure('A full (dpr2, post, shadows)',   { dpr: 2, post: true,  shadows: true  });
await measure('B dpr1, post, shadows',          { dpr: 1, post: true,  shadows: true  });
await measure('C dpr2, NO post, shadows',       { dpr: 2, post: false, shadows: true  });
await measure('D dpr2, post, NO shadows',       { dpr: 2, post: true,  shadows: false });
await measure('E dpr1, NO post, shadows',       { dpr: 1, post: false, shadows: true  });
await measure('F dpr1, NO post, NO shadows',    { dpr: 1, post: false, shadows: false });
await measure('G dpr1.5, post, shadows',        { dpr: 1.5, post: true, shadows: true });
await measure('A2 full again (drift check)',    { dpr: 2, post: true,  shadows: true  });
await browser.close();
