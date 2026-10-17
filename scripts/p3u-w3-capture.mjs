/** W3 shadow/AA comparison, based on p3u-capture.mjs.
 * W3_SHADOW=legacy|stable2048|stable4096; W3 adds Night grid/gate/finish.
 * Deterministic scene + DOM captures. Usage: GT3_OUT=... [GT3_STATES=all|cars|key|name,...]
 * with-verification-server.sh node scripts/p3u-capture.mjs [base] ['?version=locked']
 * GT3_RENDER_DPR=1|1.5|2, GT3_DEVICE_DPR=1|2, GT3_CANDIDATE=env,full,aniso,msaa2,...
 * Capture clocks are frozen; timing harness never uses these modifications.
 * Viewport stays emulated for deterministic PNGs, but runs share the no-banner launch
 * (--enable-automation removed) and the same display/HUD on-screen gates as pacing. */
import { writeFile } from 'node:fs/promises';
import { launch, ready, quality, env, wait, hash } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/capture';
const { browser, page, report, releaseDisplay } = await launch('browser', out);
try {
  await page.evaluateOnNewDocument(() => {
    // Fixed pseudo-random sequence also covers procedural texture creation.
    try { sessionStorage.setItem('gt3:soundCueSeen', '1'); } catch {}
    let seed = 123456789;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__p3uFreeze || cb.name !== 'frame') cb(t); });
  });
  report.loading = await ready(page, report);
  await page.evaluate(async () => { const cars = await import('/src/scene/cars.js'); for (let i = 0; i < 10; i++) cars.getCarModel(i).traverse(o => { o.userData.__p3uRotation = o.rotation.toArray(); }); });
  await page.mouse.wheel({ deltaY: 20 }); await wait(1600);
  report.quality = await quality(page);
  report.shadowVariant = env.W3_SHADOW || 'production';
  if (env.W3_CASTERS === '1') report.extraCasters = await page.evaluate(() => {
    const names = ['furniture-concrete','furniture-steel','furniture-marshal','pit-wall'];
    const changed = [];
    window.__gt3.scene.traverse(o => { if (names.includes(o.name)) { o.castShadow = true; changed.push(o.name); } });
    return changed;
  });
  if (env.W3_SHADOW) await page.evaluate(async variant => {
    const setup = await import('/src/scene/sceneSetup.js'), shadow = setup.sun.shadow;
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const size = variant === 'stable4096' ? 4096 : 2048;
    shadow.mapSize.set(size, size); shadow.map?.dispose(); shadow.map = null;
    if (variant === 'legacy') {
      shadow.updateMatrices = new THREE.DirectionalLight().shadow.updateMatrices;
      Object.assign(shadow.camera, {left:-60,right:60,top:60,bottom:-60});
      shadow.camera.updateProjectionMatrix();
    }
  }, env.W3_SHADOW);
  await page.evaluate(() => { window.__p3uFreeze = true; });
  await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }' });
  await page.evaluate(() => document.fonts.ready);
  const cars = await page.evaluate(async () => (await import('/src/data/cars.js')).CARS.map(c => ({ id: c.id, index: c.index, name: c.displayName })));
  const states = [...cars.flatMap(c => ['day', 'night'].map(theme => ({ name: `${c.id}-${theme}`, index: c.index, theme, t: .123 }))),
    { name: 'grid', index: 0, theme: 'day', t: null }, { name: 'gate', index: 1, theme: 'day', t: .174 },
    { name: 'finish', index: 9, theme: 'day', t: 1 },
    { name: 'grid-night', index: 0, theme: 'night', t: null },
    { name: 'gate-night', index: 1, theme: 'night', t: .174 },
    { name: 'finish-night', index: 9, theme: 'night', t: 1 }];
  const selection = env.GT3_STATES || 'all';
  report.stateSet = selection; report.captures = [];
  for (const s of states.filter(s => selection === 'all' || (selection === 'cars' && s.name.includes('-'))
    || (selection === 'key' && ['lexus-day', 'lexus-night', 'bmw-day', 'lamborghini-night', 'grid', 'gate', 'finish'].includes(s.name)) || selection.split(',').includes(s.name))) {
    const facts = await page.evaluate(async s => {
      const drive = await import('/src/scroll/scrollDrive.js'), route = await import('/src/scene/trackCurve.js');
      const rig = await import('/src/scene/carRig.js'), cars = await import('/src/scene/cars.js');
      const morph = await import('/src/scene/morph.js'), camera = await import('/src/scene/aerialCamera.js');
      const theme = await import('/src/scene/theme.js'), setup = await import('/src/scene/sceneSetup.js');
      const { state, set } = await import('/src/core/state.js');
      drive.seekTo(s.t === null ? 0 : s.name.startsWith('finish') ? 1 : route.progressAtRouteT(s.t), { instant: true });
      if (s.name.startsWith('finish')) { set('unlocked', new Set(Array.from({ length: 10 }, (_, i) => i))); set('finishTailMeters', (await import('/src/scroll/finishTail.js')).FINISH_PAST_LINE_METERS); }
      set('activeCarIndex', s.index); morph.resetMorph(s.index); rig.setWheels([]);
      theme.applyTheme(s.theme, { instant: true });
      // Fixed dt, exact settled camera, zero velocity; neutralize accumulated wheel phase.
      cars.getCarModel(s.index).traverse(o => { if (!o.userData.__p3uRotation) o.userData.__p3uRotation = o.rotation.toArray(); else o.rotation.fromArray(o.userData.__p3uRotation); });
      rig.update(0); camera.snap(); setup.updateScene(0); theme.update(0);
      (await import('/src/scene/finishLine.js')).update(100);
      (await import('/src/scene/environment.js')).setParallax(0, 0);
      setup.camera.fov = (await import('/src/scene/aerialCamera.js')).TUNE.fov; setup.camera.updateProjectionMatrix();
      set('lapElapsedMs', 0); set('lapRunning', false);
      (await import('/src/ui/hud.js')).update(0);
      const g = window.__gt3;
      g.passes.wash.uniforms.uTime.value = 0; g.passes.motionBlur.uniforms.uStrength.value = 0;
      g.composer.render(0); g.composer.render(0);
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const model = cars.getCarModel(s.index), box = new THREE.Box3().setFromObject(model);
      const corners = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(g.camera); corners.push([(p.x + 1) * innerWidth / 2, (1 - p.y) * innerHeight / 2]);
      }
      const materials = new Map(), textures = new Map(); let triangles = 0;
      model.traverse(o => { if (!o.isMesh) return; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.set(m.uuid, { name: m.name, type: m.type, color: m.color?.getHexString(), roughness: m.roughness, metalness: m.metalness,
            envMap: !!m.envMap, envMapIntensity: m.envMapIntensity, normalMap: !!m.normalMap });
          for (const [slot, t] of Object.entries(m)) if (t?.isTexture) textures.set(t.uuid, { slot, width: t.image?.width, height: t.image?.height, anisotropy: t.anisotropy });
        }
      });
      return { shadow: { mapSize: setup.sun.shadow.mapSize.toArray(), normalBias: setup.sun.shadow.normalBias, bias: setup.sun.shadow.bias, camera: {left:setup.sun.shadow.camera.left,right:setup.sun.shadow.camera.right,top:setup.sun.shadow.camera.top,bottom:setup.sun.shadow.camera.bottom,near:setup.sun.shadow.camera.near,far:setup.sun.shadow.camera.far} }, probe: g.probe(), environment: !!g.scene.environment, camera: { position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov },
        carBoundsCSS: { x: Math.min(...corners.map(p => p[0])), y: Math.min(...corners.map(p => p[1])),
          width: Math.max(...corners.map(p => p[0])) - Math.min(...corners.map(p => p[0])), height: Math.max(...corners.map(p => p[1])) - Math.min(...corners.map(p => p[1])) },
        triangles, materials: [...materials.values()], textures: [...textures.values()], heap: performance.memory?.usedJSHeapSize };
    }, s);
    // Render in the screenshot's own RAF to preserve the WebGL drawing buffer.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { window.__gt3.composer.render(0); r(); })));
    const png = await page.screenshot({ path: `${out}/${s.name}.png` });
    if (env.W3_JITTER === '1' && ['lexus-day','lexus-night','grid','grid-night'].includes(s.name)) {
      facts.shadowMotion = await page.evaluate(async () => {
        const THREE = await import('/node_modules/.vite/deps/three.js');
        const {sun} = await import('/src/scene/sceneSetup.js'), g = window.__gt3;
        const oldTarget = sun.target, oldPosition = sun.position.clone();
        const target = new THREE.Object3D(); oldTarget.getWorldPosition(target.position);
        g.scene.add(target); sun.target = target;
        const start = target.position.clone(), gl = g.renderer.getContext();
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const reference = new Uint8Array(width*height*4), pixels = new Uint8Array(reference.length);
        const right = new THREE.Vector3().setFromMatrixColumn(sun.shadow.camera.matrixWorld,0);
        const texel = (sun.shadow.camera.right-sun.shadow.camera.left)/sun.shadow.mapSize.x;
        g.composer.render(0); gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,reference);
        const rows = [];
        for (const fraction of [.1,.25,.5,.75,1,2]) {
          const delta = right.clone().multiplyScalar(texel*fraction);
          target.position.copy(start).add(delta); sun.position.copy(oldPosition).add(delta);
          g.composer.render(0); gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          let changedPixels=0, maxDelta=0, absoluteDelta=0;
          for(let i=0;i<pixels.length;i+=4) { let changed=false;
            for(let c=0;c<3;c++) { const d=Math.abs(pixels[i+c]-reference[i+c]); changed ||= d!==0; maxDelta=Math.max(maxDelta,d); absoluteDelta+=d; }
            changedPixels+=Number(changed);
          }
          rows.push({fraction,translationWorld:texel*fraction,changedPixels,maxDelta,absoluteDelta});
        }
        sun.target=oldTarget; sun.position.copy(oldPosition); g.scene.remove(target); g.composer.render(0);
        return {method:'Static scene and camera; translate only light+detached target in light-space X',texel,rows};
      });
    }
    if (!report.colorPipeline) report.colorPipeline = await page.evaluate(() => {
      const g = window.__gt3, r = g.renderer, gl = r.getContext(), exposure = r.toneMappingExposure;
      const a = new Uint8Array(r.domElement.width * r.domElement.height * 4), b = new Uint8Array(a.length);
      r.toneMappingExposure = .1; g.composer.render(0); gl.readPixels(0, 0, r.domElement.width, r.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, a);
      r.toneMappingExposure = 4; g.composer.render(0); gl.readPixels(0, 0, r.domElement.width, r.domElement.height, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let changedChannels = 0, maxDelta = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) changedChannels++; maxDelta = Math.max(maxDelta, d); }
      r.toneMappingExposure = exposure; g.composer.render(0);
      return { exposureA: .1, exposureB: 4, changedChannels, maxDelta, rendererToneMapping: r.toneMapping,
        passes: g.composer.passes.map(p => ({ type: p.constructor.name, fragmentHasToneMappingCode: /TONE_MAPPING|tonemapping_fragment/.test((p.material || p._material)?.fragmentShader || '') })) };
    });
    report.captures.push({ ...s, file: `${s.name}.png`, sha256: hash(png), ...facts });
    console.log('CAPTURE', s.name);
  }
  report.conditions.visibilityEnd = await page.evaluate(() => document.visibilityState);
  await writeFile(`${out}/manifest.json`, JSON.stringify(report, null, 2) + '\n');
} catch (e) {
  report.incomplete = true; report.errors.push(e.stack);
  try { report.conditions.visibilityEnd = await page.evaluate(() => document.visibilityState); } catch { report.conditions.visibilityEnd = 'unknown'; }
  await writeFile(`${out}/failed.json`, JSON.stringify(report, null, 2)); throw e;
}
finally { releaseDisplay(); await browser.close(); }
