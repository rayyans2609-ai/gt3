import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', `--user-data-dir=/tmp/gt3-terrain-${process.pid}`,
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error('PAGE_ERROR', error.message));
page.on('console', (message) => { if (message.type() === 'error') console.error('CONSOLE_ERROR', message.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('grass-skirts-and-horizon'),
  { timeout: 30000 });
const stats = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const terrain = await import('/src/scene/environment.js');
  const tc = await import('/src/scene/trackCurve.js');
  const grass = window.__gt3.scene.getObjectByName('grass-skirts-and-horizon');
  const ray = new THREE.Raycaster();
  const points = [];
  const angles = [];
  const routeCount = Math.ceil(tc.TRACK_LENGTH / 10);
  const route = Array.from({ length: routeCount + 1 },
    (_, i) => tc.pointAt(i / routeCount));
  for (let i = 0; i < 50; i++) {
    const t = (i + 0.37) / 50;
    for (const side of [-1, 1]) for (const offset of [45, 70, 100, 150, 200, 250, 300]) {
      const p = tc.offsetPointAt(t, side * offset);
      const x = p.x;
      const z = p.z;
      let nearest = Infinity;
      let baseY = 0;
      for (const centre of route) {
        const d = Math.hypot(centre.x - x, centre.z - z);
        if (d < nearest) { nearest = d; baseY = centre.y; }
      }
      if (nearest < 40 || nearest > 300) continue;
      ray.set(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(grass, false)[0];
      if (!hit) continue;
      points.push(hit.point.y - baseY);
      angles.push(Math.acos(Math.max(-1, Math.min(1, hit.face.normal.y))) * 180 / Math.PI);
    }
  }
  const mean = points.reduce((a,b) => a+b, 0) / points.length;
  const std = Math.sqrt(points.reduce((a,b) => a+(b-mean)**2, 0) / points.length);
  const normalMean = angles.reduce((a,b) => a+b, 0) / angles.length;
  const normalStd = Math.sqrt(angles.reduce((a,b) => a+(b-normalMean)**2, 0) / angles.length);
  const start = performance.now();
  const result = terrain.buildEnvironment();
  const buildMs = performance.now() - start;
  return { buildMs, grassTriangles: grass.geometry.index?.count / 3,
    relief: { samples: points.length, std, mean,
      normalMeanDegrees: normalMean, normalStdDegrees: normalStd },
    extraRoot: result?.name };
});
console.log(JSON.stringify({ base, ...stats }));
await browser.close();
