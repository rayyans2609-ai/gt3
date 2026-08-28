import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-inv', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
await page.evaluate(() => { const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' }); });
await new Promise((r) => setTimeout(r, 2500));
const inv = await page.evaluate(() => {
  const g = window.__gt3;
  const rows = {};
  const tri = (o) => Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3);
  g.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
    // Attribute each mesh to its nearest named ancestor so counts are readable.
    let n = o, name = o.name || '(unnamed)';
    while (n && (!n.name || n.name === '')) n = n.parent;
    if (n && n.name) name = n.name;
    const key = `${name}${o.isInstancedMesh ? ` [instanced x${o.count}]` : ''}`;
    rows[key] = rows[key] || { meshes: 0, tris: 0, casters: 0, receivers: 0, visible: 0, frustumCulled: 0 };
    const r = rows[key];
    r.meshes++; r.tris += tri(o) * (o.isInstancedMesh ? o.count : 1);
    if (o.castShadow) r.casters++;
    if (o.receiveShadow) r.receivers++;
    if (o.visible) r.visible++;
    if (o.frustumCulled) r.frustumCulled++;
  });
  const sun = g.scene.children.find((c) => c.isDirectionalLight && c.castShadow);
  return { rows, shadow: sun ? { mapSize: [sun.shadow.mapSize.x, sun.shadow.mapSize.y],
      cam: { l: sun.shadow.camera.left, r: sun.shadow.camera.right, t: sun.shadow.camera.top,
             b: sun.shadow.camera.bottom, near: sun.shadow.camera.near, far: sun.shadow.camera.far },
      autoUpdate: g.renderer.shadowMap.autoUpdate, type: g.renderer.shadowMap.type } : null,
    fog: g.scene.fog ? { near: g.scene.fog.near, far: g.scene.fog.far } : null,
    cameraFar: g.camera.far, cameraFov: g.camera.fov };
});
const sorted = Object.entries(inv.rows).sort((a, b) => b[1].tris - a[1].tris);
console.log('group                              meshes     tris  casters  recv  culled');
let tm = 0, tt = 0, tc = 0;
for (const [k, v] of sorted) {
  tm += v.meshes; tt += v.tris; tc += v.casters;
  console.log(`${k.slice(0, 34).padEnd(34)} ${String(v.meshes).padStart(6)} ${String(v.tris).padStart(8)} ${String(v.casters).padStart(8)} ${String(v.receivers).padStart(5)} ${String(v.frustumCulled).padStart(7)}`);
}
console.log(`${'TOTAL'.padEnd(34)} ${String(tm).padStart(6)} ${String(tt).padStart(8)} ${String(tc).padStart(8)}`);
console.log('\nshadow:', JSON.stringify(inv.shadow));
console.log('fog:', JSON.stringify(inv.fog), 'cameraFar:', inv.cameraFar, 'fov:', inv.cameraFov);
await browser.close();
