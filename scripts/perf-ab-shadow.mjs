/**
 * perf-ab-shadow.mjs — A/B the shadow config within ONE page load using GPU timer
 * queries, alternating configs so drift cannot be mistaken for effect.
 */
import puppeteer from 'puppeteer-core';
const AT = parseFloat(process.argv[2] ?? '0.5');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-ab', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => {
  const n = document.querySelector('.hud-identity__name');
  return n && n.textContent.trim().length > 0 && window.__gt3?.renderer;
}, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate((at) => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  g.composer.render = () => {};
  window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * at, behavior: 'instant' });
  window.__setShadow = (cfg) => {
    const sun = g.scene.children.find((c) => c.isDirectionalLight && c.castShadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.mapSize.set(cfg.map, cfg.map);
    const c = sun.shadow.camera;
    c.left = -cfg.extent; c.right = cfg.extent; c.top = cfg.extent; c.bottom = -cfg.extent;
    c.far = cfg.far; c.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
    g.scene.traverse((o) => { if (o.isMesh && /curb/i.test(o.name)) o.castShadow = cfg.curbs; });
  };
  window.__gpu = async (samples) => {
    const gl = g.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    for (let i = 0; i < 8; i++) g.__realRender(0.016);
    const times = [];
    for (let i = 0; i < samples; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      g.__realRender(0.016);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      for (let s = 0; s < 400; s++) { await new Promise((r) => setTimeout(r, 4));
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; }
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
        times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    return times;
  };
}, AT);
await new Promise((r) => setTimeout(r, 2500));

const CFG = {
  'BEFORE (map2048 ext60 curbs-cast)': { map: 2048, extent: 60, far: 260, curbs: true },
  'AFTER  (map1024 ext26 curbs-off)':  { map: 1024, extent: 26, far: 180, curbs: false },
};
const acc = { }; for (const k of Object.keys(CFG)) acc[k] = [];
for (let rep = 0; rep < 3; rep++) {
  for (const [name, cfg] of Object.entries(CFG)) {
    await p.evaluate((c) => window.__setShadow(c), cfg);
    await new Promise((r) => setTimeout(r, 900));
    acc[name].push(...await p.evaluate((n) => window.__gpu(n), 20));
  }
}
console.log(`\n=== shadow config A/B, GPU time, interleaved x3 @p=${AT} ===`);
const meds = {};
for (const [name, t] of Object.entries(acc)) {
  t.sort((x, y) => x - y);
  const q = (f) => t[Math.floor(t.length * f)];
  meds[name] = q(0.5);
  console.log(`${name.padEnd(36)} min ${t[0].toFixed(2)}  MEDIAN ${q(0.5).toFixed(2)}  p90 ${q(0.9).toFixed(2)}  n=${t.length}`);
}
const [before, after] = Object.values(meds);
console.log(`\ndelta: ${(before - after).toFixed(2)} ms/frame  (${(100 * (before - after) / before).toFixed(1)}% of render)`);
await b.close();
