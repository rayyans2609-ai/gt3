/** Representative fixed-car geometry and frame-pacing measurement. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = (process.env.GT3_URL || 'http://127.0.0.1:5201').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-perf-geom';
const source = process.env.GT3_SOURCE || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const configs = (process.env.GT3_CONFIGS ?? 'look=r1').split('|');
const points = (process.env.GT3_POINTS || '0.012,0.283,0.365,0.616,0.645,0.985').split(',').map(Number);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
};
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 180000, protocolTimeout: 180000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const report = { method: 'controlled scene RAF; fixed Lexus; adaptive resolution; no swap; 2s idle/3s motion', url: base, source, tree: process.env.GT3_TREE ?? execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, configs: {}, at: new Date().toISOString() };
try {
  for (const config of configs) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    const url = `${base}/?${config ? `${config}&` : ''}gate=quiet`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__gt3?.readiness?.status && window.__gt3.readiness.status !== 'loading'
      && window.__gt3?.renderer, { timeout: 240000, polling: 250 });
    await page.evaluate(async () => {
      const stateMod = await import('/src/core/state.js');
      const rigMod = await import('/src/scene/carRig.js');
      const aerialMod = await import('/src/scene/aerialCamera.js');
      const setup = await import('/src/scene/sceneSetup.js');
      const cars = await import('/src/scene/cars.js');
      const route = await import('/src/scene/trackCurve.js');
      // Stop only the named app frame loop after startup. One final pending app
      // frame may execute; subsequent measurements render controlled state directly.
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = fn => fn.name === 'frame' ? 0 : raf(fn);
      await new Promise(resolve => raf(() => raf(resolve)));
      rigMod.setCarModel(cars.getCarModel(0));
      rigMod.setWheels([]);
      stateMod.state.mode = 'race';
      window.__geomRoute = route;
      window.__geomMods = { state: stateMod.state, rig: rigMod, aerial: aerialMod, setup };
      // Startup's completed model warmup leaves the Lexus mounted. Keep that instance for all points.
      stateMod.state.activeCarIndex = 0;
      window.__geomT = 0.012;
      window.__geomSetT = t => { window.__geomT = t; };
      window.__geomPerf = { on: false, frames: [], last: performance.now() };
      const loop = now => {
        const p = window.__geomPerf;
        const s = window.__geomMods.state;
        // Controlled scene RAF: no checkpoint/morph work or unrelated page input.
        s.progress = route.progressAtRouteT ? route.progressAtRouteT(window.__geomT) : window.__geomT; s.targetProgress = s.progress;
        s.velocity = p.motion ? .2 : 0; s.speed01 = p.motion ? .5 : 0;
        window.__geomMods.rig.update(1 / 60);
        window.__geomMods.aerial.update(1 / 60);
        window.__geomMods.setup.updateScene(1 / 60);
        window.__geomMods.setup.render(1 / 60);
        if (p.on) p.frames.push(now - p.last);
        p.last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await wait(2000); // allow the initial point and startup rendering to settle
    const result = await page.evaluate(async ({ points }) => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const g = window.__gt3;
      const tri = o => Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3);
      const namedTrack = [];
      g.scene.traverse(o => {
        if (!(o.isMesh || o.isInstancedMesh)) return;
        let parent = o;
        while (parent && !parent.name) parent = parent.parent;
        if (!/track|road|asphalt|curb|kerb/i.test(parent?.name || o.name || '')) return;
        namedTrack.push({ name: o.name || parent?.name || '(unnamed)', ancestor: parent?.name || null,
          triangles: tri(o) * (o.isInstancedMesh ? o.count : 1), visible: o.visible });
      });
      const sampleRenderer = async () => {
        const info = g.renderer.info, was = info.autoReset;
        info.autoReset = false; info.reset();
        await new Promise(requestAnimationFrame);
        const sample = { calls: info.render.calls, triangles: info.render.triangles,
          geometries: info.memory.geometries, textures: info.memory.textures };
        info.autoReset = was; info.reset();
        return sample;
      };
      const measure = async (duration, motionT) => {
        window.__geomPerf.frames = []; window.__geomPerf.on = true; window.__geomPerf.motion = Boolean(motionT);
        const start = performance.now();
        while (performance.now() - start < duration) {
          if (motionT) {
            const phase = (performance.now() - start) / duration;
            window.__geomSetT(motionT.center + Math.sin(phase * Math.PI * 6) * 0.002);
          }
          await new Promise(requestAnimationFrame);
        }
        window.__geomPerf.on = false; window.__geomPerf.motion = false;
        const frames = window.__geomPerf.frames.slice(3);
        return { frames: frames.length, p50Ms: quantile(frames, .5), p75Ms: quantile(frames, .75),
          p95Ms: quantile(frames, .95), over33ms: frames.filter(x => x > 33.4).length,
          over33ExactMs: frames.filter(x => x > 33).length };
      };
      const quantile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
      const rows = [];
      for (const requestedT of points) {
        window.__geomSetT(requestedT);
        await wait(1000);
        const render = await sampleRenderer();
        const idle = await measure(2000, null);
        const motion = await measure(3000, { center: requestedT });
        const p = g.probe();
        rows.push({ requestedT, actualT: window.__geomRoute.routeTAt ? window.__geomRoute.routeTAt(p.progress) : p.progress, actualProgress:p.progress, mode: p.mode, activeCarIndex: window.__geomMods.state.activeCarIndex,
          render, idle, motion });
      }
      return { points: rows, namedTrackMeshes: namedTrack, renderer: g.renderer.getContext().getParameter(g.renderer.getContext().RENDERER) };
    }, { points });
    report.configs[config || 'default'] = { url, errors, ...result };
    // Preserve completed comparisons if the strict host monitor stops a later one.
    await writeFile(`${out}/perf-geom.json`, JSON.stringify(report, null, 2));
    await page.screenshot({ path: `${out}/${config.replace(/[^a-z0-9-]/gi, '-') || 'default'}.png` });
    await page.close();
  }
  await writeFile(`${out}/perf-geom.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: `${out}/perf-geom.json`, source, configs: report.configs }));
} finally {
  await browser.close();
}
