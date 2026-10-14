/** GPU frame cost at settled route points. */
import puppeteer from 'puppeteer-core';

const LABEL = process.argv[2] || 'current';
const STOPS = (process.argv[3] || '0.5').split(',').map(Number);
const SAMPLES = 60;
const base = process.env.GT3_URL || 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-gpu', '--no-first-run',
    '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => {
  const name = document.querySelector('.hud-identity__name');
  return name?.textContent.trim() && window.__gt3?.renderer;
}, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));

for (const at of STOPS) {
  await page.evaluate((target) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max * target, behavior: 'instant' });
  }, at);
  await page.waitForFunction((target) => {
    const progress = window.__gt3?.probe().progress;
    return Number.isFinite(progress) && Math.abs(progress - target) < 0.001;
  }, { timeout: 180000 }, at);
  await new Promise((r) => setTimeout(r, 2400));

  const result = await page.evaluate(async (samples) => {
    const g = window.__gt3;
    const gl = g.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return { error: 'no timer query' };
    const render = g.composer.render.bind(g.composer);
    g.composer.render = () => {};
    for (let i = 0; i < 8; i++) render(0.016);
    const times = [];
    let disjoint = 0;
    for (let i = 0; i < samples; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      render(0.016);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      for (let spin = 0; spin < 400; spin++) {
        await new Promise((r) => setTimeout(r, 4));
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      }
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) disjoint++;
      else if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      }
      gl.deleteQuery(q);
    }
    const motionEnabled = g.passes.motionBlur.enabled;
    const washEnabled = g.passes.wash.enabled;
    g.passes.motionBlur.enabled = false;
    g.passes.wash.enabled = false;
    g.renderer.info.reset(); render(0.016);
    const info = g.renderer.info;
    let casters = 0, casterTris = 0;
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    g.scene.traverse((o) => {
      if (o.isMesh && o.castShadow && shown(o)) {
        casters++;
        casterTris += Math.round((o.geometry?.index?.count
          ?? o.geometry?.attributes?.position?.count ?? 0) / 3);
      }
    });
    const sun = g.scene.children.find((c) => c.isDirectionalLight && c.castShadow);
    const actualProgress = g.probe().progress;
    g.passes.motionBlur.enabled = motionEnabled;
    g.passes.wash.enabled = washEnabled;
    g.composer.render = render;
    return { times, disjoint, actualProgress, calls: info.render.calls,
      triangles: info.render.triangles, casters, casterTris,
      shadowMap: sun?.shadow.mapSize.x ?? 0 };
  }, SAMPLES);
  if (result.error) throw new Error(result.error);
  const sorted = result.times.sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  console.log(JSON.stringify({ label: LABEL, requestedProgress: at,
    actualProgress: result.actualProgress, medianGpuMs: q(0.5),
    p25GpuMs: q(0.25), p90GpuMs: q(0.9), samples: sorted.length,
    disjoint: result.disjoint, drawCalls: result.calls, triangles: result.triangles,
    shadowCasters: result.casters, shadowCasterTriangles: result.casterTris,
    shadowMap: result.shadowMap }));
}
if (errors.length) console.log('PAGE_ERRORS', JSON.stringify(errors.slice(0, 5)));
await browser.close();
