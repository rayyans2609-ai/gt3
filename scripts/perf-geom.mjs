/** Representative fixed-car geometry and frame-pacing measurement. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = (process.env.GT3_URL || 'http://127.0.0.1:5201').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-perf-geom';
const source = process.env.GT3_SOURCE || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const configs = (process.env.GT3_CONFIGS ?? 'look=r1').split('|');
const points = [0.012, 0.283, 0.365, 0.555, 0.645, 0.985];
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
const report = { url: base, source, tree: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
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
      window.__geomMods = { state: stateMod.state, rig: rigMod, aerial: aerialMod };
      // Startup's completed model warmup leaves the Lexus mounted. Keep that instance for all points.
      stateMod.state.activeCarIndex = 0;
      window.__geomT = 0.012;
      window.__geomSetT = t => { window.__geomT = t; };
      window.__geomPerf = { on: false, frames: [], last: performance.now() };
      const loop = now => {
        const p = window.__geomPerf;
        const s = window.__geomMods.state;
        // Run after the application's RAF callback and pin state without publishing
        // progress events, so checkpoint/morph subscribers cannot swap the Lexus.
        s.progress = window.__geomT; s.targetProgress = window.__geomT;
        s.velocity = 0; s.speed01 = 0;
        window.__geomMods.rig.update(1 / 60);
        window.__geomMods.aerial.update(1 / 60);
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
        if (!(o.isMesh || o.isInstancedMesh) || !/track|road|asphalt|curb|kerb/i.test(o.name || '')) return;
        let parent = o;
        while (parent && !parent.name) parent = parent.parent;
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
        window.__geomPerf.frames = []; window.__geomPerf.on = true;
        const start = performance.now();
        while (performance.now() - start < duration) {
          if (motionT) {
            const phase = (performance.now() - start) / duration;
            window.__geomSetT(motionT.center + Math.sin(phase * Math.PI * 6) * 0.002);
          }
          await new Promise(requestAnimationFrame);
        }
        window.__geomPerf.on = false;
        const frames = window.__geomPerf.frames.slice(3);
        return { frames: frames.length, p50Ms: quantile(frames, .5), p75Ms: quantile(frames, .75),
          p95Ms: quantile(frames, .95), over33ms: frames.filter(x => x > 33.4).length };
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
        rows.push({ requestedT, actualT: p.progress, mode: p.mode, activeCarIndex: window.__geomMods.state.activeCarIndex,
          render, idle, motion });
      }
      return { points: rows, namedTrackMeshes: namedTrack };
    }, { points });
    report.configs[config || 'default'] = { url, errors, ...result };
    await page.close();
  }
  await writeFile(`${out}/perf-geom.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: `${out}/perf-geom.json`, source, configs: Object.keys(report.configs), errors: report.configs }));
} finally {
  await browser.close();
}
