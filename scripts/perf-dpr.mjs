import puppeteer from 'puppeteer-core';
const AT = parseFloat(process.argv[2] ?? '0.5');
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-dpr', '--no-first-run', '--window-size=1280,800'],
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
  window.__set = (dpr, grass) => {
    g.renderer.setPixelRatio(dpr); g.composer.setPixelRatio(dpr);
    g.composer.setSize(window.innerWidth, window.innerHeight);
    g.scene.traverse((o) => { if (o.isMesh && /grass-skirts/i.test(o.name)) o.visible = grass; });
    for (let i = 0; i < 6; i++) g.__realRender(0.016);
  };
  window.__gpu = async (n) => {
    const gl = g.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const t = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.__realRender(0.016); gl.endQuery(ext.TIME_ELAPSED_EXT);
      for (let s = 0; s < 400; s++) { await new Promise((r) => setTimeout(r, 4));
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; }
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
        t.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    return t;
  };
}, AT);
await new Promise((r) => setTimeout(r, 2500));
const DPRS = [2, 1.75, 1.5, 1.25, 1.0];
const acc = new Map();
for (let rep = 0; rep < 3; rep++) {
  const order = rep % 2 ? [...DPRS].reverse() : DPRS;
  for (const d of order) {
    await p.evaluate(([d]) => window.__set(d, true), [d]);
    await new Promise((r) => setTimeout(r, 600));
    const k = `dpr ${d}`;
    acc.set(k, [...(acc.get(k) || []), ...await p.evaluate((n) => window.__gpu(n), 12)]);
  }
}
console.log(`\n=== GPU ms/frame vs devicePixelRatio (1280x800 CSS) @p=${AT} ===`);
for (const d of DPRS) {
  const t = [...acc.get(`dpr ${d}`)].sort((x, y) => x - y);
  const m = t[Math.floor(t.length / 2)];
  const px = Math.round(1280 * d) * Math.round(800 * d) / 1e6;
  console.log(`dpr ${String(d).padEnd(5)} ${px.toFixed(1)} MPix   MEDIAN ${m.toFixed(1).padStart(6)}ms   => ${(1000/m).toFixed(0).padStart(3)} fps GPU ceiling`);
}
await b.close();
