/**
 * perf-isolate2.mjs — stage attribution at a FIXED scroll position.
 *
 * Position is held constant so every config renders identical scene content, and
 * configs are interleaved (measured twice, in opposite order) so thermal/background
 * drift cancels instead of being attributed to whichever config ran last.
 *
 * The decisive split is "updates only": composer.render is replaced with a no-op, so
 * the remaining cost is purely the JS per-frame update loop. Everything above that
 * line is rendering.
 */
import puppeteer from 'puppeteer-core';

const CSS_W = 1280, CSS_H = 800, DPR = 2;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-iso2', '--no-first-run',
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
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' });
});
await new Promise((r) => setTimeout(r, 3000));

const apply = (c) => page.evaluate((cfg) => {
  const g = window.__gt3;
  g.composer.render = cfg.render ? g.__realRender : () => {};
  g.passes.motionBlur.enabled = cfg.post;
  g.passes.wash.enabled = cfg.post;
  if (g.renderer.shadowMap.enabled !== cfg.shadows) {
    g.renderer.shadowMap.enabled = cfg.shadows;
    g.scene.traverse((o) => { if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
  }
  g.renderer.shadowMap.needsUpdate = true;
  g.renderer.setPixelRatio(cfg.dpr);
  g.composer.setPixelRatio(cfg.dpr);
  g.composer.setSize(window.innerWidth, window.innerHeight);
  return true;
}, c);

async function run(cfg, ms = 2600) {
  await apply(cfg);
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => { window.__perf.frames = []; window.__perf.on = true; });
  await new Promise((r) => setTimeout(r, ms));
  const frames = await page.evaluate(() => { window.__perf.on = false; return window.__perf.frames; });
  const f = frames.slice(3).sort((a, b) => a - b);
  return f.reduce((a, b) => a + b, 0) / f.length;
}

const CONFIGS = [
  ['1 updates only (no GL)',      { render: false, dpr: 2,   post: true,  shadows: true  }],
  ['2 full: dpr2 post shadow',    { render: true,  dpr: 2,   post: true,  shadows: true  }],
  ['3 dpr1',                      { render: true,  dpr: 1,   post: true,  shadows: true  }],
  ['4 dpr0.5',                    { render: true,  dpr: 0.5, post: true,  shadows: true  }],
  ['5 dpr2 no-post',              { render: true,  dpr: 2,   post: false, shadows: true  }],
  ['6 dpr2 no-shadow',            { render: true,  dpr: 2,   post: true,  shadows: false }],
  ['7 dpr1 no-post no-shadow',    { render: true,  dpr: 1,   post: false, shadows: false }],
];

const acc = new Map(CONFIGS.map(([n]) => [n, []]));
for (const pass of [0, 1]) {
  const order = pass === 0 ? CONFIGS : [...CONFIGS].reverse();
  for (const [name, cfg] of order) acc.get(name).push(await run(cfg));
}

console.log('\n=== stage attribution @ fixed midroute position (2 interleaved passes) ===');
const base = (acc.get('2 full: dpr2 post shadow').reduce((a, b) => a + b, 0)) / 2;
for (const [name] of CONFIGS) {
  const v = acc.get(name);
  const mean = (v[0] + v[1]) / 2;
  const spread = Math.abs(v[0] - v[1]);
  const saved = base - mean;
  console.log(`${name.padEnd(30)} ${mean.toFixed(1).padStart(7)}ms  (${(1000 / mean).toFixed(1).padStart(5)} fps)  runs ${v.map((x) => x.toFixed(0)).join('/')}  spread ${spread.toFixed(1).padStart(5)}ms  vs-full ${saved >= 0 ? '-' : '+'}${Math.abs(saved).toFixed(1)}ms`);
}
const stats = await page.evaluate(() => {
  const g = window.__gt3; g.composer.render = g.__realRender;
  g.passes.motionBlur.enabled = false; g.passes.wash.enabled = false;
  g.renderer.info.reset(); g.__realRender(0.016);
  const r = g.renderer.info;
  let meshes = 0, verts = 0;
  g.scene.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry?.attributes?.position?.count ?? 0; } });
  return { calls: r.render.calls, tris: r.render.triangles, programs: r.programs.length,
           geometries: r.memory.geometries, textures: r.memory.textures, sceneMeshes: meshes, sceneVerts: verts };
});
console.log('\nscene:', JSON.stringify(stats));
await browser.close();
