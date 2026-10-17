/** W6 per-car GPU cost: opaque vs crossfade (cached fade materials at opacity .5) at the
 * fixed steady pose (route t=.123), headful product resolution, app loop held.
 * Also records each car's material facts (transmission, sides, transparent meshes, triangles).
 *   GT3_VARIANTS=opaque,fade  (extra: fadeNoEnv = fade materials without envMap)
 */
import { writeFile } from 'node:fs/promises';
import { launch, ready, env, wait } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/w6/carfade';
const variants = (env.GT3_VARIANTS || 'opaque,fade').split(','), frames = +(env.GT3_FRAMES || 40), reps = +(env.GT3_REPS || 2);
const { browser, page, report, releaseDisplay } = await launch('perf', out, env.GT3_HEADLESS !== '1');
Object.assign(report, { harness: 'p3u-w6-carfade', variants, frames, reps, rows: [] });
try {
  await page.evaluateOnNewDocument(() => {
    const raf = requestAnimationFrame.bind(window);
    const wrapped = cb => raf(ts => { if (cb.name === 'frame' && window.__w6Hold) return wrapped(cb); return cb(ts); });
    window.requestAnimationFrame = wrapped;
  });
  report.loading = await ready(page, report);
  report.cars = await page.evaluate(async () => {
    const cars = await import('/src/scene/cars.js'), facts = [];
    for (let i = 0; i < 10; i++) {
      const f = { i, meshes: 0, tris: 0, transmission: 0, physical: 0, doubleSide: 0, transparent: 0, alphaTest: 0, envMap: 0, maxTexture: 0 };
      cars.getCarModel(i).traverse(o => { if (!o.isMesh) return; f.meshes++;
        const g = o.geometry; f.tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
        for (const m of [o.material].flat()) { if (m.transmission > 0) f.transmission++; if (m.isMeshPhysicalMaterial) f.physical++; if (m.side === 2) f.doubleSide++; if (m.transparent) f.transparent++; if (m.alphaTest > 0) f.alphaTest++; if (m.envMap) f.envMap++;
          for (const v of Object.values(m)) if (v?.isTexture && v.image) f.maxTexture = Math.max(f.maxTexture, v.image.width || 0); } });
      facts.push(f);
    }
    return facts;
  });
  await page.evaluate(async () => {
    window.__w6Hold = true;
    const M = window.__w6 = { drive: await import('/src/scroll/scrollDrive.js'), route: await import('/src/scene/trackCurve.js'), rig: await import('/src/scene/carRig.js'),
      cars: await import('/src/scene/cars.js'), morph: await import('/src/scene/morph.js'), aerial: await import('/src/scene/aerialCamera.js'), setup: await import('/src/scene/sceneSetup.js') };
    M.drive.seekTo(M.route.progressAtRouteT(.123), { instant: true }); M.rig.update(0); M.aerial.snap(); M.setup.updateScene(0);
  });
  await wait(1000);
  for (let rep = 0; rep < reps; rep++) for (let car = 0; car < 10; car++) for (const variant of variants) {
    const row = await page.evaluate(async ({ car, variant, frames }) => {
      const M = window.__w6, g = window.__gt3, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const frame = () => new Promise(r => requestAnimationFrame(r)), model = M.cars.getCarModel(car);
      M.rig.setCarModel(model); M.rig.update(0);
      const saved = [];
      if (variant !== 'opaque') {
        M.morph.beginWarmFade(model);
        if (variant === 'fadeNoEnv') model.traverse(o => { if (o.isMesh) for (const m of [o.material].flat()) if (m.envMap) { saved.push([m, m.envMap]); m.envMap = null; m.needsUpdate = true; } });
      }
      const pending = [], gpu = [];
      for (let k = 0; k < frames + 8; k++) {
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); g.composer.render(0); gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({ q, k });
        await frame();
        for (let i = pending.length - 1; i >= 0; i--) if (gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT_AVAILABLE)) {
          if (pending[i].k >= 8 && !gl.getParameter(ext.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(pending[i].q); pending.splice(i, 1); }
      }
      for (const [m, e] of saved) { m.envMap = e; m.needsUpdate = true; }
      if (variant !== 'opaque') M.morph.endWarmFade(model);
      gpu.sort((a, b) => a - b);
      return { car, variant, n: gpu.length, p50: gpu[gpu.length >> 1], p90: gpu[Math.floor(gpu.length * .9)] };
    }, { car, variant, frames });
    row.rep = rep; report.rows.push(row);
    console.log('CAR', car, variant, rep, row.p50?.toFixed(2), row.p90?.toFixed(2));
  }
} catch (e) { report.incomplete = true; report.errors.push(e.stack); process.exitCode = 1; }
finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1) + '\n');
  releaseDisplay(); await browser.close().catch(() => {});
}
