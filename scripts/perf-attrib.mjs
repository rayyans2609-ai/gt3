/**
 * perf-attrib.mjs — stage attribution using GPU TIMER QUERIES (authoritative).
 * Supersedes the wall-clock gl.finish() attribution, which was contaminated by CPU
 * contention on this 4-core machine and wrongly blamed shadows.
 */
import puppeteer from 'puppeteer-core';
const AT = parseFloat(process.argv[2] ?? '0.5');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-at', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => { const n = document.querySelector('.hud-identity__name');
  return n && n.textContent.trim().length > 0 && window.__gt3?.renderer; }, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate((at) => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  g.composer.render = () => {};
  window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * at, behavior: 'instant' });
  window.__apply = (cfg) => {
    g.passes.motionBlur.enabled = cfg.post; g.passes.wash.enabled = cfg.post;
    if (g.renderer.shadowMap.enabled !== cfg.shadows) {
      g.renderer.shadowMap.enabled = cfg.shadows;
      g.scene.traverse((o) => { if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    g.renderer.setPixelRatio(cfg.dpr); g.composer.setPixelRatio(cfg.dpr);
    g.composer.setSize(window.innerWidth, window.innerHeight);
    if (cfg.grassHidden !== undefined)
      g.scene.traverse((o) => { if (o.isMesh && /grass-skirts/i.test(o.name)) o.visible = !cfg.grassHidden; });
    for (let i = 0; i < 6; i++) g.__realRender(0.016);
  };
  window.__gpu = async (n) => {
    const gl = g.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const times = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.__realRender(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT);
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

const CONFIGS = [
  ['full (dpr2, post, shadows)', { dpr: 2, post: true,  shadows: true,  grassHidden: false }],
  ['no post',                    { dpr: 2, post: false, shadows: true,  grassHidden: false }],
  ['no shadows',                 { dpr: 2, post: true,  shadows: false, grassHidden: false }],
  ['dpr 1',                      { dpr: 1, post: true,  shadows: true,  grassHidden: false }],
  ['grass hidden',               { dpr: 2, post: true,  shadows: true,  grassHidden: true  }],
  ['no post + no shadows',       { dpr: 2, post: false, shadows: false, grassHidden: false }],
];
const acc = new Map(CONFIGS.map(([n]) => [n, []]));
for (let rep = 0; rep < 3; rep++) {
  const order = rep % 2 ? [...CONFIGS].reverse() : CONFIGS;
  for (const [name, cfg] of order) {
    await p.evaluate((c) => window.__apply(c), cfg);
    await new Promise((r) => setTimeout(r, 700));
    acc.get(name).push(...await p.evaluate((n) => window.__gpu(n), 14));
  }
}
console.log(`\n=== GPU-timer stage attribution @p=${AT} (3 interleaved reps) ===`);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const base = med(acc.get('full (dpr2, post, shadows)'));
for (const [name] of CONFIGS) {
  const t = [...acc.get(name)].sort((x, y) => x - y);
  const m = med(t), d = base - m;
  console.log(`${name.padEnd(30)} min ${t[0].toFixed(1).padStart(6)}  MEDIAN ${m.toFixed(1).padStart(6)}  p90 ${t[Math.floor(t.length*0.9)].toFixed(1).padStart(6)}  ${Math.abs(d) > 1 ? `${d > 0 ? 'saves' : 'COSTS'} ${Math.abs(d).toFixed(1)}ms (${(100*Math.abs(d)/base).toFixed(0)}%)` : ''}`);
}
await b.close();
