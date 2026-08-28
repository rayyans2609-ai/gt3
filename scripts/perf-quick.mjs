/**
 * perf-quick.mjs — single-config synchronous render cost, for A/B-ing one change.
 * Same gl.finish() protocol and fixed scroll position as perf-bench.mjs so numbers
 * are directly comparable to the 32.0 ms baseline.
 * Usage: node scripts/perf-quick.mjs [label] [progress 0..1]
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'current';
const AT = parseFloat(process.argv[3] ?? '0.5');
const REPS = 7, FRAMES = 20;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-q', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate((at) => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  g.composer.render = () => {};
  const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * at, behavior: 'instant' });
  window.__bench = (n) => { const gl = g.renderer.getContext(); gl.finish();
    const t0 = performance.now(); for (let i = 0; i < n; i++) g.__realRender(0.016);
    gl.finish(); return (performance.now() - t0) / n; };
}, AT);
await new Promise((r) => setTimeout(r, 3000));
const runs = [];
for (let i = 0; i < REPS; i++) runs.push(await p.evaluate((f) => window.__bench(f), FRAMES));
runs.sort((x, y) => x - y);
const med = runs[Math.floor(runs.length / 2)];
const info = await p.evaluate(() => { const g = window.__gt3;
  g.passes.motionBlur.enabled = false; g.passes.wash.enabled = false;
  g.renderer.info.reset(); g.__realRender(0.016);
  const r = g.renderer.info;
  let casters = 0, casterTris = 0;
  const shown = (o) => { let n = o; while (n) { if (!n.visible) return false; n = n.parent; } return true; };
  g.scene.traverse((o) => { if (o.isMesh && o.castShadow && shown(o)) { casters++;
    casterTris += Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3); } });
  const sun = g.scene.children.find((c) => c.isDirectionalLight && c.castShadow);
  return { calls: r.render.calls, tris: r.render.triangles, casters, casterTris,
    map: sun ? sun.shadow.mapSize.x : 0, extent: sun ? sun.shadow.camera.right : 0 };
});
console.log(`[${LABEL}] @p=${AT}  median ${med.toFixed(1)}ms  runs ${runs.map((x) => x.toFixed(0)).join('/')}`);
console.log(`         drawCalls ${info.calls}  tris ${info.tris}  shadowCasters ${info.casters} (${info.casterTris} tris)  map ${info.map} extent ${info.extent}`);
if (errs.length) console.log('ERRORS:', errs.slice(0, 5).join(' | '));
await b.close();
