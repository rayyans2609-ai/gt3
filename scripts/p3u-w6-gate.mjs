/** W6 gate-crossing GPU attribution. Headful product page (product DPR), app RAF loop held;
 * the production update order is stepped at fixed dt=1/60 through a gate at constant speed,
 * one composer.render per vsync, each timed with one GPU elapsed query.
 * Conditions toggle one factor at a time; each is repeated GT3_REPS times in rotation.
 *   GT3_GATES=4,6,2 (checkpoint indices; car index = gate + 1)  GT3_SPEED=0.5
 *   GT3_CONDITIONS=full,noMorph,noGates,noShadowUpdate,noCar  GT3_THEME=day|night
 *   Transmission: 'stock' (three default: scale 1, 4x MSAA), trsNN (scale NN%), tms0 (single sample);
 *   any other condition keeps the page's product transmission settings.
 *   Ablations: shadow2048, noShadowUpdate (no shadow-map render), noSMAA, noBlur, aniso1, dprNNN.
 * Output: report.json (per-condition per-frame GPU arrays + summaries).
 */
import { writeFile } from 'node:fs/promises';
import { launch, ready, env, wait } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/w6/gate';
const gates = (env.GT3_GATES || '4,6,2').split(',').map(Number);
const conditions = (env.GT3_CONDITIONS || 'full,noMorph,noGates,noShadowUpdate,noCar').split(',');
const reps = +(env.GT3_REPS || 2), speed = +(env.GT3_SPEED || 0.5), span = +(env.GT3_SPAN || 0.012);
const { browser, page, report, releaseDisplay } = await launch('perf', out, env.GT3_HEADLESS !== '1');
Object.assign(report, { harness: 'p3u-w6-gate', gates, conditions, reps, speed, span, theme: env.GT3_THEME || 'day', runs: [] });
try {
  await page.evaluateOnNewDocument(() => {
    const raf = requestAnimationFrame.bind(window);
    const wrapped = cb => raf(ts => { if (cb.name === 'frame' && window.__w6Hold) return wrapped(cb); return cb(ts); });
    window.requestAnimationFrame = wrapped;
  });
  report.loading = await ready(page, report);
  await page.evaluate(async () => {
    const M = window.__w6 = {
      drive: await import('/src/scroll/scrollDrive.js'), route: await import('/src/scene/trackCurve.js'),
      rig: await import('/src/scene/carRig.js'), morph: await import('/src/scene/morph.js'), aerial: await import('/src/scene/aerialCamera.js'),
      theme: await import('/src/scene/theme.js'), setup: await import('/src/scene/sceneSetup.js'), st: await import('/src/core/state.js'),
      cp: await import('/src/scene/checkpoints.js'), finish: await import('/src/scene/finishLine.js'),
    };
    window.__w6Hold = true;
    const g = window.__gt3, gl = g.renderer.getContext();
    M.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); M.gl = gl;
  });
  if ((env.GT3_THEME || 'day') === 'night') await page.evaluate(() => window.__w6.theme.applyTheme('night', { instant: true }));
  await wait(1500);
  for (let rep = 0; rep < reps; rep++) for (const gate of gates) for (const condition of conditions) {
    const run = await page.evaluate(async ({ gate, condition, speed, span }) => {
      const M = window.__w6, g = window.__gt3, gl = M.gl, ext = M.ext, st = M.st;
      const T = (await import('/src/scene/trackCurve.js')).CHECKPOINT_T;
      const frame = () => new Promise(r => requestAnimationFrame(r));
      const checkpoints = g.scene.getObjectByName('checkpoints'), mount = M.rig.carMount;
      const p0 = T[gate] - span, p1 = T[gate] + span, car = gate;
      // Settle at the start pose with the outgoing car, then drive through.
      M.drive.seekTo(p0, { instant: true }); M.cp.restoreAtProgress(p0); st.set('activeCarIndex', car); M.morph.resetMorph(car);
      M.rig.update(0); M.aerial.snap(); M.setup.updateScene(0);
      checkpoints.visible = condition !== 'noGates'; mount.visible = condition !== 'noCar';
      // Transmission variants: trsNN = transmissionResolutionScale NN%; 'tms0' = single-sample transmission target.
      // 'stock' = three's default (scale 1, 4x MSAA); other conditions keep the page's product value.
      M.productTRS ??= g.renderer.transmissionResolutionScale;
      const trs = /trs(\d+)/.exec(condition); g.renderer.transmissionResolutionScale = trs ? +trs[1] / 100 : condition.includes('stock') ? 1 : M.productTRS;
      const proto = Object.getPrototypeOf(g.composer.readBuffer);
      if (!proto.__w6SetSize) { proto.__w6SetSize = proto.setSize; proto.setSize = function (...a) {
        const want = window.__w6TransmissionSamples;
        if (want != null && this.texture.generateMipmaps && this.resolveDepthBuffer === false && this.samples !== want) { this.samples = want; this.dispose(); }
        return proto.__w6SetSize.apply(this, a); }; }
      window.__w6TransmissionSamples = condition.includes('tms0') ? 0 : condition.includes('stock') ? 4 : null;
      // Feature ablations (harness-only, restored after the pass).
      const setup = await import('/src/scene/sceneSetup.js'), undo = [];
      const resize = dpr => { g.renderer.setPixelRatio(dpr); g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setPixelRatio(dpr); g.composer.setSize(innerWidth, innerHeight); };
      if (condition === 'shadow2048') { setup.sun.shadow.mapSize.set(2048, 2048); setup.sun.shadow.map?.dispose(); setup.sun.shadow.map = null;
        undo.push(() => { setup.sun.shadow.mapSize.set(4096, 4096); setup.sun.shadow.map?.dispose(); setup.sun.shadow.map = null; }); }
      if (condition === 'noSMAA') { g.passes.antialias.enabled = false; undo.push(() => { g.passes.antialias.enabled = true; }); }
      if (condition === 'noBlur') { const pass = g.passes.motionBlur, u = pass.uniforms.uStrength; const d = Object.getOwnPropertyDescriptor(u, 'value');
        Object.defineProperty(u, 'value', { get: () => 0, set: () => {}, configurable: true }); undo.push(() => { delete u.value; u.value = d.value; }); }
      if (condition === 'aniso1') { const cars = await import('/src/scene/cars.js'), seen = [];
        for (let i = 0; i < 10; i++) cars.getCarModel(i).traverse(o => { for (const m of [o.material].flat()) if (m) for (const t of Object.values(m)) if (t?.isTexture && t.anisotropy > 1) { seen.push([t, t.anisotropy]); t.anisotropy = 1; t.needsUpdate = true; } });
        undo.push(() => { for (const [t, a] of seen) { t.anisotropy = a; t.needsUpdate = true; } }); }
      const dprMatch = /^dpr(\d+)$/.exec(condition);
      if (dprMatch) { const was = g.renderer.getPixelRatio(); resize(+dprMatch[1] / 100); undo.push(() => resize(was)); }
      M.undo = undo;
      g.renderer.shadowMap.autoUpdate = true;
      for (let i = 0; i < 20; i++) { g.composer.render(1 / 60); await frame(); }
      if (condition === 'noShadowUpdate') g.renderer.shadowMap.autoUpdate = false;
      const dp = speed * 0.09 * 3472.646166835742 / 60 / M.route.TOUR_LENGTH, pending = [], rows = [];
      let p = p0, k = 0;
      while (p < p1 + dp * 30) {
        const dt = 1 / 60; p = Math.min(1, p + (p < p1 ? dp : dp * 0.5));
        st.set('progress', p); st.set('velocity', speed); st.set('speed01', speed);
        const c0 = performance.now();
        M.rig.update(dt); M.aerial.update(dt); M.cp.updateCheckpoints(); M.cp.updateGateResponse(dt);
        if (condition !== 'noMorph') M.morph.morphTo(st.state.activeCarIndex);
        M.morph.updateMorph(dt); M.theme.update(dt); M.finish.update(dt); M.setup.updateScene(dt);
        const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        g.composer.render(dt);
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        const row = { k: k++, p, morph: M.morph.isMorphing(), cpu: performance.now() - c0, gpu: null };
        rows.push(row); pending.push({ q, row });
        for (let i = pending.length - 1; i >= 0; i--) if (gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) pending[i].row.gpu = gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(pending[i].q); pending.splice(i, 1);
        }
        await frame();
      }
      for (let n = 0; n < 30 && pending.length; n++) { await frame(); for (let i = pending.length - 1; i >= 0; i--) if (gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT_AVAILABLE)) {
        pending[i].row.gpu = gl.getQueryParameter(pending[i].q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(pending[i].q); pending.splice(i, 1); } }
      checkpoints.visible = true; mount.visible = true; g.renderer.shadowMap.autoUpdate = true;
      for (const fn of M.undo.reverse()) fn();
      if (M.morph.isMorphing()) for (let i = 0; i < 60; i++) M.morph.updateMorph(1 / 60);
      const cross = rows.findIndex(r => r.p >= T[gate]);
      const gpu = rows.map(r => r.gpu).filter(Number.isFinite), before = rows.slice(0, cross).map(r => r.gpu).filter(Number.isFinite).sort((a, b) => a - b);
      const after = rows.slice(cross, cross + 12).map(r => r.gpu).filter(Number.isFinite);
      const sorted = [...gpu].sort((a, b) => a - b);
      return { gate, condition, cross, mean: gpu.reduce((a, b) => a + b, 0) / gpu.length, p50: sorted[sorted.length >> 1], p90: sorted[Math.floor(sorted.length * .9)], beforeMedian: before[before.length >> 1], crossingMax: Math.max(...after), crossingSeq: after.map(v => +v.toFixed(2)), max: Math.max(...gpu), rows };
    }, { gate, condition, speed, span });
    run.rep = rep; report.runs.push(run);
    console.log('GATE', gate, condition, rep, 'mean', run.mean.toFixed(2), 'p90', run.p90.toFixed(2), 'before', run.beforeMedian?.toFixed(2), 'crossMax', run.crossingMax.toFixed(2), run.crossingSeq.slice(0, 8).join(' '));
  }
} catch (e) { report.incomplete = true; report.errors.push(e.stack); process.exitCode = 1; }
finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1) + '\n');
  releaseDisplay(); await browser.close().catch(() => {});
}
