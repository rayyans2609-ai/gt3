import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 120000,
  args: ['--enable-gpu','--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader',
         '--hide-scrollbars','--window-size=1600,900','--no-sandbox',
         '--user-data-dir=/tmp/gt3-chrome-profile','--no-first-run'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/#debug', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => { const m = document.documentElement.scrollHeight - innerHeight; scrollTo(0, 0.25*m); });
await new Promise(r => setTimeout(r, 2000));

const info = await page.evaluate(() => {
  const g = window.__gt3; if (!g) return 'no __gt3';
  const out = { exposure: g.renderer.toneMappingExposure, shadows: g.renderer.shadowMap.enabled, lights: [], casters: 0, receivers: 0 };
  g.scene.traverse(o => {
    if (o.isLight) out.lights.push({ type: o.type, i: o.intensity, pos: o.position.toArray().map(n=>+n.toFixed(1)) });
    if (o.isMesh && o.castShadow) out.casters++;
    if (o.isMesh && o.receiveShadow) out.receivers++;
  });
  out.cam = { fov: g.camera.fov, world: [g.camera.matrixWorld.elements[12], g.camera.matrixWorld.elements[13], g.camera.matrixWorld.elements[14]].map(n=>+n.toFixed(1)) };
  return JSON.parse(JSON.stringify(out));
});
console.log('INFO', JSON.stringify(info, null, 1));

// Experiment A: shadows off
await page.evaluate(() => { window.__gt3.renderer.shadowMap.enabled = false; window.__gt3.scene.traverse(o=>{if(o.isMesh)o.receiveShadow=false;}); });
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/diag_noshadow.png' });

// Experiment B: shadows off + exposure up
await page.evaluate(() => { window.__gt3.renderer.toneMappingExposure = 1.9; });
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: '/tmp/diag_bright.png' });
console.log('done');
await browser.close();
