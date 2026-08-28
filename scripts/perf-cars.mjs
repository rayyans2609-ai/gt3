import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-cars', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => { const m = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: m * 0.5, behavior: 'instant' }); });
await new Promise((r) => setTimeout(r, 2500));
console.log(JSON.stringify(await p.evaluate(() => {
  const g = window.__gt3;
  const tri = (o) => Math.round((o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0) / 3);
  let inScene = 0, visMesh = 0, hidMesh = 0, visTris = 0, hidTris = 0, tinyMeshes = 0;
  const top = [];
  // A subtree is "visible" only if every ancestor is visible.
  const shown = (o) => { let n = o; while (n) { if (!n.visible) return false; n = n.parent; } return true; };
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const t = tri(o) * (o.isInstancedMesh ? o.count : 1);
    if (shown(o)) { visMesh++; visTris += t; } else { hidMesh++; hidTris += t; }
    if (t <= 20 && shown(o)) tinyMeshes++;
    if (o.castShadow && shown(o)) top.push([o.name || '?', t]);
  });
  // Count top-level car groups by convention: children of the rig / car containers.
  g.scene.traverse((o) => { if (/car|vehicle|gt3/i.test(o.name) && o.children.length) inScene++; });
  top.sort((a, c) => c[1] - a[1]);
  return { visMesh, visTris, hidMesh, hidTris, tinyVisibleMeshes: tinyMeshes,
           carGroupsMatched: inScene, topVisibleCasters: top.slice(0, 8),
           casterTrisVisible: top.reduce((a, x) => a + x[1], 0), casterCountVisible: top.length };
}), null, 1));
await b.close();
