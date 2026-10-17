/** T5 controlled tone/reflection/encoding and silhouette captures. Harness-only overrides.
 * Deterministic scene + DOM captures. Usage: GT3_OUT=... [GT3_STATES=all|cars|key|name,...]
 * GT3_QUERY='?version=unlocked&tone=neutral&carspec=quarter&nightcar=toe'
 * GT3_PORT=5231 GT3_SERVER_LOG=... scripts/with-verification-server.sh node scripts/p3u-diagnosis.mjs
 * GT3_RENDER_DPR=1|1.5|2, GT3_DEVICE_DPR=1|2, GT3_CANDIDATE=env,full,aniso,msaa2,...
 * Capture clocks are frozen; timing harness never uses these modifications. */
import { writeFile } from 'node:fs/promises';
import { launch, ready, quality, env, wait, hash } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/t5/capture';
const { browser, page, report } = await launch('browser', out);
try {
  if (report.profile !== 'unlocked' || !report.query.includes('carspec=quarter')) throw Error('Diagnosis requires unlocked &carspec=quarter (shader instrumentation)');
  page.on('console', m => { if(m.type()==='error') report.errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => {
    // Fixed pseudo-random sequence also covers procedural texture creation.
    try { sessionStorage.setItem('gt3:soundCueSeen', '1'); } catch {}
    let seed = 123456789;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__p3uFreeze || cb.name !== 'frame') cb(t); });
  });
  report.loading = await ready(page);
  await page.evaluate(async () => { const cars = await import('/src/scene/cars.js'); for (let i = 0; i < 10; i++) cars.getCarModel(i).traverse(o => { o.userData.__p3uRotation = o.rotation.toArray(); }); });
  await page.mouse.wheel({ deltaY: 20 }); await wait(1600);
  report.quality = await quality(page);
  await page.evaluate(() => { window.__p3uFreeze = true; });
  await page.addStyleTag({ content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }' });
  await page.evaluate(() => document.fonts.ready);
  const cars = await page.evaluate(async () => (await import('/src/data/cars.js')).CARS.map(c => ({ id: c.id, index: c.index, name: c.displayName })));
  const states = [...cars.flatMap(c => ['day', 'night'].map(theme => ({ name: `${c.id}-${theme}`, index: c.index, theme, t: .123 }))),
    { name: 'grid', index: 0, theme: 'day', t: null }, { name: 'gate', index: 1, theme: 'day', t: .174 },
    { name: 'finish', index: 9, theme: 'day', t: 1 }];
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
      drive.seekTo(s.t === null ? 0 : s.name === 'finish' ? 1 : route.progressAtRouteT(s.t), { instant: true });
      if (s.name === 'finish') { set('unlocked', new Set(Array.from({ length: 10 }, (_, i) => i))); set('finishTailMeters', (await import('/src/scroll/finishTail.js')).FINISH_PAST_LINE_METERS); }
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
      return { probe: g.probe(), environment: !!g.scene.environment, camera: { position: g.camera.position.toArray(), quaternion: g.camera.quaternion.toArray(), fov: g.camera.fov },
        carBoundsCSS: { x: Math.min(...corners.map(p => p[0])), y: Math.min(...corners.map(p => p[1])),
          width: Math.max(...corners.map(p => p[0])) - Math.min(...corners.map(p => p[0])), height: Math.max(...corners.map(p => p[1])) - Math.min(...corners.map(p => p[1])) },
        triangles, materials: [...materials.values()], textures: [...textures.values()], heap: performance.memory?.usedJSHeapSize };
    }, s);
    // Exact projected silhouette, depth-tested against the world. Diagnostic only.
    const mask = await page.evaluate(async s => {
      const g = window.__gt3, THREE = await import('/node_modules/.vite/deps/three.js');
      const model = (await import('/src/scene/cars.js')).getCarModel(s.index);
      const carMeshes = new Set(); model.traverse(o => { if(o.isMesh) carMeshes.add(o); });
      const black = new THREE.MeshBasicMaterial({color:0, toneMapped:false, side:THREE.DoubleSide});
      const white = new THREE.MeshBasicMaterial({color:0xffffff, toneMapped:false, side:THREE.DoubleSide});
      const saved = []; g.scene.traverse(o => { if(o.material) {saved.push([o,o.material]);o.material=carMeshes.has(o)?white:black;} });
      const fog=g.scene.fog, background=g.scene.background;g.scene.fog=null;g.scene.background=new THREE.Color(0);
      g.renderer.setRenderTarget(null); g.renderer.render(g.scene,g.camera);
      const png=g.renderer.domElement.toDataURL();
      for(const [o,m] of saved)o.material=m;g.scene.fog=fog;g.scene.background=background;
      black.dispose();white.dispose();return png;
    },s);
    await writeFile(`${out}/${s.name}-mask.png`,Buffer.from(mask.split(',')[1],'base64'));
    for (const variant of ['off','low','mid','high','fix', ...(s.name === 'ferrari-day' && report.query.includes('tone=neutral') ? ['raw','srgb','linear','aces035','agx035'] : [])]) {
      const treatment = await page.evaluate(async ({s,variant}) => {
        const g=window.__gt3, cars=await import('/src/scene/cars.js');
        const strengths=s.theme==='day'?{off:0,low:.35,mid:.7,high:1.4,fix:.7}:{off:0,low:.07,mid:.14,high:.28,fix:.28};
        (await import('/src/scene/carEnvironment.js')).setCarReflectionStrength(strengths[variant] ?? 0);
        const wash=g.passes.wash.material;
        wash.userData.t5Original ??= wash.fragmentShader;
        let shader=wash.userData.t5Original;
        if(variant==='aces035'||variant==='agx035')shader=shader.replace('NeutralToneMapping(color.rgb)',variant==='aces035'?'ACESFilmicToneMapping(color.rgb)':'AgXToneMapping(color.rgb)');
        if(['raw','srgb','linear'].includes(variant)) {
          shader=shader.replace('color.rgb = NeutralToneMapping(color.rgb);', variant==='linear'?'color.rgb *= toneMappingExposure;':'');
          if(variant==='raw')shader=shader.replace('color = sRGBTransferOETF(color);','');
        }
        if(wash.fragmentShader!==shader){wash.fragmentShader=shader;wash.needsUpdate=true;}
        let uniforms=0;
        for(let i=0;i<10;i++)cars.getCarModel(i).traverse(o=>{
          for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]) {
            const u=g.renderer.properties.get(m).uniforms;
            if(u?.uCarSpecular){u.uCarSpecular.value=variant==='fix'&&s.theme==='day'?.25:1;u.uCarToe.value=variant==='fix'&&s.theme==='night'&&new URLSearchParams(location.search).get('tone')==='neutral'?1:0;uniforms++;}
          }
        });
        if (!uniforms) throw Error('Car review uniforms missing');
        return {strength:strengths[variant] ?? 0,exposure:g.renderer.toneMappingExposure,variant,uniforms};
      },{s,variant});
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { window.__gt3.composer.render(0); r(); })));
      const file=`${s.name}-${variant}.png`, png=await page.screenshot({path:`${out}/${file}`});
      report.captures.push({...s,name:`${s.name}-${variant}`,file,sha256:hash(png),...facts,treatment,mask:`${s.name}-mask.png`});
      console.log('CAPTURE',s.name,variant);
    }
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(report, null, 2) + '\n');
} catch (e) { report.incomplete = true; report.errors.push(e.stack); await writeFile(`${out}/failed.json`, JSON.stringify(report, null, 2)); throw e; }
finally { await browser.close(); }
