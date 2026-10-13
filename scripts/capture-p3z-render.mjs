/** Bounded Phase 3 render evidence. Restart Vite after product edits before running. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { installGpuCounters } from './lib/gpu-counters.mjs';

const base = process.env.GT3_URL || 'http://127.0.0.1:5211';
const out = process.env.GT3_OUT || '/tmp/gt3-p3z-run/captures';
const trials = process.env.GT3_TRIALS === '1';
const trialOnly = process.env.GT3_TRIAL_ONLY === '1';
const duration = Number(process.env.GT3_DURATION || 4000);
const wait = ms => new Promise(r => setTimeout(r, ms));
const report = { base, startedAt: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), captures: [], errors: [], performance: [] };
await mkdir(out, { recursive: true });
try { await access('/tmp/gt3-p3z-run/STOP_HEAVY'); throw new Error('Host stop marker present before browser launch.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 180000, protocolTimeout: 180000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=/tmp/gt3-p3z-run/chrome-${process.pid}`],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
await writeFile(`${out}/browser.pid`, String(browser.process().pid));
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const healthy = async () => {
  try { await access('/tmp/gt3-p3z-run/STOP_HEAVY'); }
  catch { return; }
  throw new Error('Host monitor requested heavy-work stop; preserve partial evidence.');
};
try {
  const session = await browser.target().createCDPSession();
  report.gpu = (await session.send('SystemInfo.getInfo')).gpu;
  report.browser = await browser.version();
  const page = await browser.newPage();
  await installGpuCounters(page);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(`${base}/${process.env.GT3_QUERY ?? '?props=full'}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
  const seek = async t => {
    await healthy();
    await page.evaluate(async t => {
      const route = await import('/src/scene/trackCurve.js');
      (await import('/src/scroll/scrollDrive.js')).seekTo(t === null ? 0 : route.progressAtRouteT(t), { instant: true });
    }, t);
    await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing(), { timeout: 15000 });
    await wait(1000);
  };
  const settings = () => page.evaluate(() => {
    const g = window.__gt3, renderer = g.renderer, gl = renderer.getContext();
    const saved = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    const canvasSamples = gl.getParameter(gl.SAMPLES);
    const targets = [g.composer.renderTarget1, g.composer.renderTarget2].map(target => {
      renderer.setRenderTarget(target);
      return { width: target.width, height: target.height, type: target.texture.type,
        requestedSamples: target.samples, actualSamples: gl.getParameter(gl.SAMPLES) };
    });
    renderer.setRenderTarget(saved);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { probe: g.probe(), css: { width: innerWidth, height: innerHeight },
      devicePixelRatio, contextAntialias: gl.getContextAttributes().antialias, canvasSamples,
      maxSamples: gl.getParameter(gl.MAX_SAMPLES), halfFloatSamples: [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES)],
      gpu: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), targets,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      memory: { ...renderer.info.memory }, jsHeap: performance.memory?.usedJSHeapSize };
  });
  const capture = async name => {
    await healthy();
    const path = `${out}/${name}.png`;
    await page.screenshot({ path });
    report.captures.push({ name, path, at: new Date().toISOString(), settings: await settings(), camera: await page.evaluate(() => ({
      position: window.__gt3.camera.position.toArray(), quaternion: window.__gt3.camera.quaternion.toArray(),
      fov: window.__gt3.camera.fov, rig: window.__gt3.scene.getObjectByName('car-rig').position.toArray(),
    })) });
    console.log('CAPTURE', name);
  };
  report.baselineSettings = await settings();
  console.log('SETTINGS', JSON.stringify(report.baselineSettings));
  report.modelFacts = await page.evaluate(async () => {
    const { getCarModel } = await import('/src/scene/cars.js');
    return [0, 3, 8].map(index => {
      let meshes = 0, triangles = 0, missingNormals = 0; const materials = new Map();
      getCarModel(index).traverse(o => {
        if (!o.isMesh) return; meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        if (!o.geometry.attributes.normal) missingNormals++;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.set(m.uuid, {
          name: m.name, roughness: m.roughness, metalness: m.metalness, flatShading: m.flatShading,
          normalMap: !!m.normalMap, map: !!m.map,
        });
      }); return { index, meshes, triangles, missingNormals, materials: [...materials.values()] };
    });
  });
  report.boardShader = await page.evaluate(() => {
    const g = window.__gt3, m = g.scene.getObjectByName('braking-150-100-50').material;
    const p = g.renderer.properties.get(m).currentProgram;
    const shader = p && g.renderer.getContext().getShaderSource(p.fragmentShader);
    return { hasInstanceAtlasSampling: !!shader?.includes('(vMapUv.x + vBoardColumn) / 3.0'), shader };
  });
  if (!trialOnly) {
  await capture('grid-parked');
  await page.mouse.wheel({ deltaY: 20 }); await wait(1500); await seek(null);
  for (const [name, t] of [['grid', null], ['edge-corner', .123], ['runoff-barrier', .283],
    ['checkpoint', .18], ['braking-boards', .254 - 100 / 5006.8196682221], ['control', .53]]) {
    await seek(t); await capture(name);
  }
  // Same physical pose and camera for all three models; route progression is untouched.
  await seek(.123);
  for (const [name, index] of [['lexus-dark', 0], ['bmw-bright', 3], ['lamborghini', 8]]) {
    await page.evaluate(async index => {
      const cars = await import('/src/scene/cars.js'), rig = await import('/src/scene/carRig.js');
      rig.setCarModel(cars.getCarModel(index)); rig.setWheels([]);
    }, index);
    await wait(600); await capture(name);
  }
  await page.evaluate(async () => {
    const cars = await import('/src/scene/cars.js'), rig = await import('/src/scene/carRig.js');
    const { state } = await import('/src/core/state.js'); rig.setCarModel(cars.getCarModel(state.activeCarIndex));
  });
  await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));
  await seek(.123); await capture('night-edge-spot');
  await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('day', { instant: true }));

  // Exact alignment and screen-size facts for each actual swap threshold.
  report.checkpoints = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const route = await import('/src/scene/trackCurve.js');
    const profile = await import('/src/scene/trackProfile.js');
    const g = window.__gt3, positions = g.scene.getObjectByName('checkpoint-road-stripes').geometry.attributes.position;
    const posts = g.scene.getObjectByName('checkpoint-posts');
    return route.CHECKPOINT_ROUTE_T.map((t, i) => {
      const c = new THREE.Vector3();
      for (let j = 0; j < 6; j++) c.add(new THREE.Vector3().fromBufferAttribute(positions, i * 6 + j));
      c.divideScalar(6);
      const expected = route.offsetPointAt(t, (profile.profileAt(t).left - profile.profileAt(t).right) / 2, profile.CROSS_SECTION.asphaltY + .01);
      const matrix = new THREE.Matrix4(); posts.getMatrixAt(i * 2, matrix);
      const post = new THREE.Vector3().setFromMatrixPosition(matrix);
      return { gate: i + 1, t, progress: route.CHECKPOINT_T[i], stripeCenterErrorM: c.distanceTo(expected), postPosition: post.toArray() };
    });
  });
  for (const [i, t] of (await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_ROUTE_T)).entries()) {
    await seek(t - .006); await capture(`gate-${i + 1}`);
  }
  report.inventory = await page.evaluate(() => {
    const g = window.__gt3, furniture = g.scene.getObjectByName('trackside-furniture');
    return { trees: !!g.scene.getObjectByName('roadside-trees'), variant: furniture.userData.variant,
      furniture: furniture.children.map(o => ({ name: o.name, instances: o.count })),
      boards: furniture.userData.boards, glCalls: { ...window.__gt3GlCalls } };
  });
  }
  const setAA = async mode => page.evaluate(async mode => {
    const g = window.__gt3, c = g.composer;
    for (const pass of c.passes.filter(p => p.__trialAA)) { c.removePass(pass); pass.dispose(); }
    for (const [i, rt] of [c.renderTarget1, c.renderTarget2].entries()) {
      rt.dispose(); rt.samples = mode.endsWith('scene') && i === 0 ? 0 : Number(mode.match(/^msaa(\d)/)?.[1] || 0);
    }
    if (mode === 'fxaa' || mode === 'smaa') {
      const { trialPass } = await import('/scripts/lib/render-aa-trials.js');
      const p = trialPass(mode, c.renderTarget1.width, c.renderTarget1.height);
      p.__trialAA = true; c.insertPass(p, c.passes.length - 1);
    }
  }, mode);
  const timed = async (label, motion) => {
    await healthy(); await seek(motion ? .105 : .123);
    const startedAt = new Date().toISOString();
    await page.evaluate(() => {
      const g = window.__gt3, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const original = g.composer.render;
      const autoReset = g.renderer.info.autoReset; g.renderer.info.autoReset = false;
      const m = window.__p3zTiming = { gpu: [], raf: [], cpu: [], draws: [], queries: [], probes: [], ext: !!ext, previous: null };
      g.composer.render = function (...args) {
        const now = performance.now();
        if (m.previous !== null) m.raf.push(now - m.previous);
        m.previous = now;
        m.probes.push(g.probe());
        for (let i = m.queries.length - 1; i >= 0; i--) if (gl.getQueryParameter(m.queries[i], gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) m.gpu.push(gl.getQueryParameter(m.queries[i], gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(m.queries.splice(i, 1)[0]);
        }
        const q = ext ? gl.createQuery() : null;
        if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        g.renderer.info.reset();
        const start = performance.now(); original.apply(this, args); m.cpu.push(performance.now() - start);
        m.draws.push({ calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles });
        if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); m.queries.push(q); }
      };
      window.__p3zTiming.restore = () => { g.composer.render = original; g.renderer.info.autoReset = autoReset; };
    });
    if (motion) {
      const end = Date.now() + duration;
      while (Date.now() < end) { await page.mouse.wheel({ deltaY: 70 }); await wait(70); }
    } else await wait(duration);
    const result = await page.evaluate(() => {
      const m = window.__p3zTiming; m.restore();
      const gl = window.__gt3.renderer.getContext(); m.queries.forEach(q => gl.deleteQuery(q));
      const stats = values => {
        const s = values.sort((a, b) => a - b); return { n: s.length,
          p50: s[Math.floor(s.length * .5)] ?? null, p95: s[Math.floor(s.length * .95)] ?? null,
          max: s.at(-1), over100: s.filter(v => v > 100).length };
      };
      return { gpu: stats(m.gpu), raf: stats(m.raf), cpu: stats(m.cpu), timerQuery: m.ext,
        draws: m.draws.at(-1),
        ratioRange: [...new Set(m.probes.map(p => p.ratio))], progressRange: [m.probes[0]?.progress, m.probes.at(-1)?.progress] };
    });
    const row = { label, motion, startedAt, endedAt: new Date().toISOString(), ...result, settings: await settings() };
    report.performance.push(row); console.log('TIMING', JSON.stringify(row));
  };
  // Owner reference captures are 1600x900 DPR 1; the host's native CSS/DPR perf condition is separate.
  const modes = trials ? (process.env.GT3_MODES || 'none,msaa2,msaa4,fxaa,smaa').split(',') : ['shipped'];
  for (const mode of modes) {
    if (trials) await setAA(mode);
    await seek(.123); await capture(`aa-${mode}-edge`);
    if (trials) {
      await page.evaluate(async () => {
        const cars = await import('/src/scene/cars.js'), rig = await import('/src/scene/carRig.js');
        rig.setCarModel(cars.getCarModel(8));
      });
      await wait(400); await capture(`aa-${mode}-lamborghini`);
      await page.evaluate(async () => {
        const cars = await import('/src/scene/cars.js'), rig = await import('/src/scene/carRig.js');
        const { state } = await import('/src/core/state.js'); rig.setCarModel(cars.getCarModel(state.activeCarIndex));
      });
    }
    await timed(`${mode}-1600x900-dpr1-rest`, false);
    await timed(`${mode}-1600x900-dpr1-motion`, true);
  }
  if (trials) await setAA('none');
  if (process.env.GT3_SKIP_NATIVE !== '1') {
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 }); await wait(1000);
  await timed('native-1280x800-dpr2-rest', false);
  await timed('native-1280x800-adaptive-motion', true);
  }
  report.pass = report.errors.length === 0;
} catch (e) { report.pass = false; report.failure = e.stack; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log('REPORT', `${out}/report.json`, 'pass', report.pass, report.failure || '');
}
