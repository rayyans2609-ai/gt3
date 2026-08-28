/**
 * perf-gpu.mjs — TRUE GPU time per frame via EXT_disjoint_timer_query_webgl2.
 *
 * Wall-clock timing is unusable on this machine (load avg 5-6 on 4 cores; repeated
 * runs of an identical config spanned 17-85 ms). A GPU timer query measures only the
 * time the GPU spent executing the frame, so CPU scheduling noise cannot inflate it.
 * Disjoint frames (where the GPU timer was interrupted) are discarded outright.
 *
 * Usage: node scripts/perf-gpu.mjs [label] [progress 0..1]
 */
import puppeteer from 'puppeteer-core';
const LABEL = process.argv[2] || 'current';
const AT = parseFloat(process.argv[3] ?? '0.5');
const SAMPLES = 60;

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-gpu', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });

// Wait for the car models to actually be resident; benchmarking during GLB upload
// measures driver stalls, not steady-state cost.
await p.waitForFunction(() => {
  const n = document.querySelector('.hud-identity__name');
  return n && n.textContent.trim().length > 0 && window.__gt3?.renderer;
}, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

await p.evaluate((at) => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  g.composer.render = () => {};
  const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * at, behavior: 'instant' });
}, AT);
await new Promise((r) => setTimeout(r, 3000));

const out = await p.evaluate(async (samples) => {
  const g = window.__gt3;
  const gl = g.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { error: 'no timer query' };
  for (let i = 0; i < 8; i++) g.__realRender(0.016);   // warm
  const times = [];
  let disjoint = 0;
  for (let i = 0; i < samples; i++) {
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    g.__realRender(0.016);
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    // Wait for this query to resolve before issuing the next.
    for (let spin = 0; spin < 400; spin++) {
      await new Promise((r) => setTimeout(r, 4));
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    }
    const dj = gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (dj) { disjoint++; gl.deleteQuery(q); continue; }
    if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
      times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);   // ns -> ms
    }
    gl.deleteQuery(q);
  }
  g.passes.motionBlur.enabled = false; g.passes.wash.enabled = false;
  g.renderer.info.reset(); g.__realRender(0.016);
  const r = g.renderer.info;
  let casters = 0, casterTris = 0;
  const shown = (o) => { let n = o; while (n) { if (!n.visible) return false; n = n.parent; } return true; };
  g.scene.traverse((o) => { if (o.isMesh && o.castShadow && shown(o)) { casters++;
    casterTris += Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3); } });
  const sun = g.scene.children.find((c) => c.isDirectionalLight && c.castShadow);
  return { times, disjoint, calls: r.render.calls, tris: r.render.triangles,
    casters, casterTris, map: sun ? sun.shadow.mapSize.x : 0, extent: sun ? sun.shadow.camera.right : 0 };
}, SAMPLES);

if (out.error) { console.log('ERROR', out.error); await b.close(); process.exit(1); }
const t = out.times.sort((x, y) => x - y);
const q = (f) => t[Math.min(t.length - 1, Math.floor(t.length * f))];
console.log(`[${LABEL}] @p=${AT}  GPU ms/frame:  min ${t[0].toFixed(2)}  p25 ${q(0.25).toFixed(2)}  MEDIAN ${q(0.5).toFixed(2)}  p90 ${q(0.9).toFixed(2)}  max ${t[t.length-1].toFixed(2)}   (n=${t.length}, disjoint ${out.disjoint})`);
console.log(`        drawCalls ${out.calls}  tris ${out.tris}  shadowCasters ${out.casters} (${out.casterTris} tris)  shadowMap ${out.map} extent ${out.extent}`);
if (errs.length) console.log('        page errors:', errs.slice(0, 3).join(' | '));
await b.close();
