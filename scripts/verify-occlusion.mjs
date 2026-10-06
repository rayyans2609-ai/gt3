/** SPEC §30.6 runtime occlusion sweep with the REAL aerial camera: along the whole route (instant seek per t),
 * does terrain ('grass-skirts-and-horizon') sit between the camera and the road/car? Per t:
 *  - car ray: camera -> car centre (rig + 1 m): first terrain hit nearer than the car?
 *  - frame grid (24x14 rays through the viewport): cells whose ray hits asphalt but hits terrain at least
 *    `tol` metres nearer (road hidden by terrain).
 * Configs default: base (default camera), b+soft (candidate), b+wide (widest candidate).
 * Usage: GT3_URL=http://127.0.0.1:5194 GT3_OUT=<dir> [GT3_STEP=0.01] [GT3_CONFIGS="|comp=b&cam=soft|comp=b&cam=wide"]
 * GT3_TS=<comma list> selects a lean sweep. GT3_RESUME=1 + GT3_SOURCE=<product tree>
 * resumes atomic per-point checkpoints only for identical source/config/point inputs.
 *   node scripts/verify-occlusion.mjs   (host preflight first; one browser, one page at a time) */
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = (process.env.GT3_URL || 'http://127.0.0.1:5194').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-occlusion';
const step = Number(process.env.GT3_STEP || 0.01);
const configs = (process.env.GT3_CONFIGS ?? '|comp=b&cam=soft|comp=b&cam=wide').split('|');
const tsEnv = process.env.GT3_TS; // optional comma list of t (lean mode); otherwise 0..1 every `step`
const tList = tsEnv ? tsEnv.split(',').map(Number) : null;
const tol = 0.05;
await mkdir(out, { recursive: true });
// Resume only pinned, identical source/config/point sweeps after a host pause.
const source = process.env.GT3_SOURCE || null;
let saved = null;
if (process.env.GT3_RESUME === '1') {
  assert.ok(source, 'GT3_RESUME requires GT3_SOURCE (tested product tree)');
  try { saved = JSON.parse(await readFile(`${out}/occlusion.json`, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (saved) {
    assert.equal(saved.source, source); assert.equal(saved.base, base);
    assert.equal(saved.tol, tol); assert.equal(saved.step, step);
    assert.deepEqual(saved.requestedT, tList); assert.deepEqual(saved.requestedConfigs, configs);
  }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const report = saved || { base, source, at: new Date().toISOString(), step, tol,
  requestedT: tList, requestedConfigs: configs, configs: {} };
const checkpoint = async () => {
  await writeFile(`${out}/occlusion.tmp.json`, JSON.stringify(report, null, 1));
  await rename(`${out}/occlusion.tmp.json`, `${out}/occlusion.json`);
};
let failed = false;
try {
  for (const qFull of configs) {
    const key = qFull || 'default';
    if (report.configs[key]?.summary?.pass && report.configs[key]?.summary?.complete) {
      console.log('REUSED', key, JSON.stringify(report.configs[key].summary)); continue;
    }
    // optional "@WxH" suffix sets the viewport for that config (aspect edge cases)
    const [q, vp] = qFull.split('@');
    const page = await browser.newPage();
    if (vp) { const [w, h] = vp.split('x').map(Number); await page.setViewport({ width: w, height: h }); }
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    let curT = null;
    page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('NAV', f.url(), 't=', curT); });
    await page.setCacheEnabled(false);
    await page.goto(`${base}/${q ? `?${q}&gate=quiet` : '?gate=quiet'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    try {
      await page.waitForFunction(() => window.__gt3?.readiness?.status && window.__gt3.readiness.status !== 'loading',
        { timeout: 240000, polling: 250 });
    } catch (e) {
      const diag = await page.evaluate(() => ({ readiness: window.__gt3?.readiness ?? null, url: location.href })).catch(x => String(x));
      console.log('READY-TIMEOUT', q, JSON.stringify(diag), JSON.stringify(errors.slice(0, 5)));
      throw e;
    }
    await page.mouse.wheel({ deltaY: 240 });
    await wait(1200);
    const points = report.configs[key]?.points || [];
    errors.push(...(report.configs[key]?.errors || []));
    report.configs[key] = { points, errors, summary: { pass: false, complete: false } };
    const tIter = tList ?? Array.from({ length: Math.floor(1.0001 / step) + 1 }, (_, i) => i * step);
    for (const t of tIter) {
      const tt = Math.min(t, 0.999); curT = +tt.toFixed(3);
      if (points.some(p => Math.abs(p.requestedT - tt) < 1e-9)) continue;
      // instant seek (what Replay/restore use); retry while a finish/montage layer settles
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        const s = await page.evaluate(async target => {
          (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant: true });
          const p = window.__gt3.probe(); return { progress: p.progress, mode: p.mode };
        }, tt);
        if (s.mode === 'finish') await page.click('.finish-replay').catch(() => {});
        ok = Math.abs(s.progress - tt) < 0.002;
        if (!ok) await wait(90);
      }
      assert.ok(ok, `seek failed at ${tt}`);
      await wait(450);
      const m = await page.evaluate(async tol => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const g = window.__gt3, cam = g.camera;
        cam.updateMatrixWorld(true);
        const grass = g.scene.getObjectByName('grass-skirts-and-horizon');
        const asphalt = g.scene.getObjectByName('track-asphalt');
        const rig = g.scene.getObjectByName('car-rig');
        const ray = new THREE.Raycaster();
        const camPos = cam.getWorldPosition(new THREE.Vector3());
        const target = rig.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0));
        const toCar = target.clone().sub(camPos); const carDist = toCar.length();
        ray.set(camPos, toCar.normalize()); ray.far = carDist;
        const gh = ray.intersectObject(grass, false);
        const carRay = { distanceToCar: +carDist.toFixed(1), terrainHit: gh.length ? +gh[0].distance.toFixed(2) : null };
        let cells = 0, roadCells = 0, hidden = 0, worst = 0;
        for (let iy = 0; iy < 14; iy++) for (let ix = 0; ix < 24; ix++) {
          ray.setFromCamera({ x: (ix + 0.5) / 12 - 1, y: (iy + 0.5) / 7 - 1 }, cam);
          cells++;
          const ah = ray.intersectObject(asphalt, false);
          if (!ah.length) continue;
          roadCells++;
          const ghit = ray.intersectObject(grass, false);
          if (ghit.length && ghit[0].distance < ah[0].distance - tol) {
            hidden++; worst = Math.max(worst, ah[0].distance - ghit[0].distance);
          }
        }
        return { t: g.probe().progress, camPos: camPos.toArray().map(v => +v.toFixed(1)), carRay, cells, roadCells, hidden,
          worstMarginM: +worst.toFixed(2) };
      }, tol);
      points.push({ requestedT: tt, ...m });
      await checkpoint();
      console.log('POINT', key, curT, 'hidden', m.hidden, 'carTerrain', m.carRay.terrainHit);
    }
    const hiddenPts = points.filter(p => p.hidden > 0 || p.carRay.terrainHit !== null);
    const sum = { config: qFull || 'default', points: points.length, withRoadCells: points.filter(p => p.roadCells > 0).length,
      minRoadCells: Math.min(...points.map(p => p.roadCells)), carRayTerrainHits: points.filter(p => p.carRay.terrainHit !== null).length,
      pointsWithHiddenRoad: points.filter(p => p.hidden > 0).length, maxHiddenCells: Math.max(...points.map(p => p.hidden)),
      worstMarginM: Math.max(...points.map(p => p.worstMarginM)), errors,
      complete: points.length === tIter.length,
      pass: points.length === tIter.length && hiddenPts.length === 0 && errors.length === 0,
      failingT: hiddenPts.map(p => +p.t.toFixed(3)) };
    report.configs[qFull || 'default'] = { summary: sum, points };
    if (!sum.pass) failed = true;
    console.log(JSON.stringify(sum));
    await checkpoint();
    await page.close();
  }
} finally { await browser.close(); }
await checkpoint();
process.exit(failed ? 1 : 0);
