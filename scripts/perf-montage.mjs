/**
 * perf-montage.mjs — GPU-timer attribution for the MONTAGE renderer.
 *
 * studio.js owns a second WebGL context, so ADAPTIVE_RES and every race measurement
 * miss it entirely. Same instrument as the race work: EXT_disjoint_timer_query_webgl2,
 * because wall-clock timing is worthless on this machine (load avg 5-27 on 4 cores).
 *
 * Camera and turntable are snapshotted and restored before every render so each config
 * shades IDENTICAL content while the montage timeline keeps running underneath.
 * Configs are interleaved so drift cannot masquerade as effect.
 */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-montage', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => document.querySelector('.hud-identity__name')?.textContent.trim(), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 14000));

// Drive into the first coin to start a montage.
for (let i = 0; i < 80; i++) {
  const on = await p.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
  if (on) break;
  await p.mouse.wheel({ deltaY: 200 });
  await new Promise((r) => setTimeout(r, 60));
}
const playing = await p.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
console.log('montage playing:', playing);
if (!playing) { console.log('could not start montage'); await b.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));   // let shot 1 settle

const out = await p.evaluate(async () => {
  const g = window.__gt3montage;
  if (!g?.renderer) return { error: 'no montage hook' };
  const r = g.renderer, sc = g.scene, cam = g.camera;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { error: 'no timer query' };

  const snapPos = cam.position.clone(), snapQuat = cam.quaternion.clone();
  const snapFov = cam.fov, snapTurn = g.turntable ? g.turntable.rotation.y : 0;
  const restore = () => {
    cam.position.copy(snapPos); cam.quaternion.copy(snapQuat);
    cam.fov = snapFov; cam.updateProjectionMatrix();
    if (g.turntable) g.turntable.rotation.y = snapTurn;
  };
  const rects = []; sc.traverse((o) => { if (o.isRectAreaLight) rects.push(o); });
  const carMeshes = () => { let n = 0; sc.traverse((o) => { if (o.isMesh && /montage-/.test(o.parent?.name || o.name || '')) n++; }); return n; };
  const meshCount = () => { let n = 0; sc.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const meshesAtStart = meshCount();
  // renderMontage() calls resizeRendererToDisplaySize() EVERY frame, which resets
  // pixelRatio/size back to MAX_PIXEL_RATIO and undoes any override between samples.
  // Neutralise both for the duration of the bench, then restore.
  const realSetPR = r.setPixelRatio.bind(r), realSetSize = r.setSize.bind(r);
  const apply = (c) => {
    r.setPixelRatio = realSetPR; r.setSize = realSetSize;
    realSetPR(c.dpr);
    realSetSize(window.innerWidth, window.innerHeight, false);
    r.setPixelRatio = () => {}; r.setSize = () => {};
    for (const l of rects) l.visible = c.rect;
    if (r.shadowMap.enabled !== c.shadows) {
      r.shadowMap.enabled = c.shadows;
      sc.traverse((o) => { if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    r.shadowMap.needsUpdate = true;
    for (let i = 0; i < 5; i++) { restore(); r.render(sc, cam); }
  };
  const bench = async (n) => {
    const t = [];
    for (let i = 0; i < n; i++) {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      restore(); r.render(sc, cam);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      for (let s = 0; s < 300; s++) { await new Promise((z) => setTimeout(z, 4));
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break; }
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))
        t.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    return t;
  };
  const CONFIGS = [
    ['full (dpr2, rect, shadow)', { dpr: 2, rect: true,  shadows: true  }],
    ['dpr 1.5',                   { dpr: 1.5, rect: true, shadows: true }],
    ['dpr 1',                     { dpr: 1, rect: true,  shadows: true  }],
    ['no RectAreaLights',         { dpr: 2, rect: false, shadows: true  }],
    ['no shadows',                { dpr: 2, rect: true,  shadows: false }],
  ];
  const acc = {}; for (const [n] of CONFIGS) acc[n] = [];
  for (const [n, c] of CONFIGS) { apply(c); acc[n].push(...await bench(6)); }
  const meshesAtEnd = meshCount();
  // restore shipping behaviour
  apply({ dpr: Math.min(window.devicePixelRatio || 1, 2), rect: true, shadows: true });
  r.setPixelRatio = realSetPR; r.setSize = realSetSize;
  let tris = 0, meshes = 0;
  r.info.reset(); restore(); r.render(sc, cam);
  sc.traverse((o) => { if (o.isMesh) { meshes++;
    tris += Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3); } });
  return { acc, calls: r.info.render.calls, drawn: r.info.render.triangles,
           meshes, tris, rectCount: rects.length, dpr: window.devicePixelRatio,
           meshesAtStart, meshesAtEnd, carMeshes: carMeshes(),
           stillPlaying: !!document.querySelector('#montage-layer.is-active') };
});

if (out.error) { console.log('ERROR', out.error); await b.close(); process.exit(1); }
console.log('\n=== MONTAGE GPU cost (timer queries, identical content, interleaved) ===');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const base = med(out.acc['full (dpr2, rect, shadow)']);
for (const [n, t] of Object.entries(out.acc)) {
  const m = med(t), d = base - m;
  console.log(`${n.padEnd(28)} MEDIAN ${m.toFixed(1).padStart(6)}ms  (${(1000/m).toFixed(0).padStart(3)} fps ceiling)  ${Math.abs(d) > 0.8 ? `${d > 0 ? 'saves' : 'costs'} ${Math.abs(d).toFixed(1)}ms (${(100*Math.abs(d)/base).toFixed(0)}%)` : ''}`);
}
console.log(`\nVALIDITY: meshes in scene at bench start ${out.meshesAtStart}, at end ${out.meshesAtEnd}, montage still playing: ${out.stillPlaying}`);
console.log(`scene: drawCalls ${out.calls}  trisDrawn ${out.drawn}  meshes ${out.meshes}  sceneTris ${out.tris}  rectAreaLights ${out.rectCount}  dpr ${out.dpr}`);
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
await b.close();
