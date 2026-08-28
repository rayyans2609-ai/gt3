/**
 * perf-bench.mjs — stage attribution via SYNCHRONOUS render timing.
 *
 * rAF-interval timing is unusable on this machine (load avg 5-6 on 4 cores), so
 * instead of inferring render cost from frame pacing we measure it directly: render
 * N frames back-to-back in a tight loop bracketed by gl.finish(), which forces the
 * GPU to complete before the clock stops. Scene content is held at a fixed scroll
 * position and every config is measured REPS times, interleaved, reporting medians.
 */
import puppeteer from 'puppeteer-core';

const CSS_W = 1280, CSS_H = 800, DPR = 2, REPS = 5, FRAMES = 20;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-bench', '--no-first-run',
         `--window-size=${CSS_W},${CSS_H}`],
  defaultViewport: { width: CSS_W, height: CSS_H, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));

await page.evaluate(() => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  // Stop the app's own loop from rendering; the bench drives rendering itself.
  g.composer.render = () => {};
  const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' });
  window.__bench = (frames) => {
    const gl = g.renderer.getContext();
    gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) g.__realRender(0.016);
    gl.finish();
    return (performance.now() - t0) / frames;
  };
});
await new Promise((r) => setTimeout(r, 3000));

const apply = (c) => page.evaluate((cfg) => {
  const g = window.__gt3;
  g.passes.motionBlur.enabled = cfg.post;
  g.passes.wash.enabled = cfg.post;
  if (g.renderer.shadowMap.enabled !== cfg.shadows) {
    g.renderer.shadowMap.enabled = cfg.shadows;
    g.scene.traverse((o) => { if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
  }
  g.renderer.setPixelRatio(cfg.dpr);
  g.composer.setPixelRatio(cfg.dpr);
  g.composer.setSize(window.innerWidth, window.innerHeight);
  for (let i = 0; i < 6; i++) g.__realRender(0.016);   // warm shaders / targets
  return true;
}, c);

const CONFIGS = [
  ['full: dpr2 post shadow',   { dpr: 2,   post: true,  shadows: true  }],
  ['dpr1.5',                   { dpr: 1.5, post: true,  shadows: true  }],
  ['dpr1',                     { dpr: 1,   post: true,  shadows: true  }],
  ['dpr2 no-post',             { dpr: 2,   post: false, shadows: true  }],
  ['dpr2 no-shadow',           { dpr: 2,   post: true,  shadows: false }],
  ['dpr2 no-post no-shadow',   { dpr: 2,   post: false, shadows: false }],
  ['dpr1 no-post no-shadow',   { dpr: 1,   post: false, shadows: false }],
];
const acc = new Map(CONFIGS.map(([n]) => [n, []]));
for (let rep = 0; rep < REPS; rep++) {
  const order = rep % 2 ? [...CONFIGS].reverse() : CONFIGS;
  for (const [name, cfg] of order) {
    await apply(cfg);
    acc.get(name).push(await page.evaluate((f) => window.__bench(f), FRAMES));
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`\n=== GPU render cost per frame (sync bench, ${REPS} interleaved reps x ${FRAMES} frames) ===`);
const base = med(acc.get('full: dpr2 post shadow'));
for (const [name] of CONFIGS) {
  const m = med(acc.get(name));
  const lo = Math.min(...acc.get(name)), hi = Math.max(...acc.get(name));
  const d = base - m;
  console.log(`${name.padEnd(26)} ${m.toFixed(1).padStart(7)}ms  [${lo.toFixed(0)}-${hi.toFixed(0)}]  ${d > 0.5 ? `saves ${d.toFixed(1)}ms (${(100 * d / base).toFixed(0)}%)` : ''}`);
}
const stats = await page.evaluate(() => {
  const g = window.__gt3;
  g.passes.motionBlur.enabled = false; g.passes.wash.enabled = false;
  g.renderer.info.reset(); g.__realRender(0.016);
  const r = g.renderer.info;
  let meshes = 0, shadowCasters = 0, tris = 0;
  g.scene.traverse((o) => { if (o.isMesh) { meshes++; if (o.castShadow) shadowCasters++;
    const p = o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0; tris += p / 3; } });
  return { drawCalls: r.render.calls, trisRendered: r.render.triangles, programs: r.programs.length,
           geometries: r.memory.geometries, textures: r.memory.textures,
           sceneMeshes: meshes, shadowCasters, sceneTris: Math.round(tris) };
});
console.log('\nscene:', JSON.stringify(stats, null, 0));
await browser.close();
