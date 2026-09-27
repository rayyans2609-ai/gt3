/** Production-fog terrain views around the full route, independent of legacy montages. */
import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', `--user-data-dir=/tmp/gt3-inspect-${process.pid}`,
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('grass-skirts-and-horizon'),
  { timeout: 180000 });
await new Promise((resolve) => setTimeout(resolve, 2500));
for (const progress of [0, 0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99]) {
  for (const pitch of [45, 60]) {
    await page.evaluate(async ({ progress, pitch }) => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const track = await import('/src/scene/trackCurve.js');
      const g = window.__gt3;
      const camera = g.camera;
      if (camera.parent !== g.scene) g.scene.attach(camera);
      const target = track.pointAt(progress, new THREE.Vector3());
      const forward = track.tangentAt(progress, new THREE.Vector3()).setY(0).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const yaw = 155 * Math.PI / 180;
      const elevation = pitch * Math.PI / 180;
      const distance = pitch === 45 ? 90 : 115;
      const horizontal = right.multiplyScalar(Math.sin(yaw))
        .add(forward.multiplyScalar(Math.cos(yaw)))
        .multiplyScalar(Math.cos(elevation) * distance);
      camera.position.set(target.x + horizontal.x,
        target.y + Math.sin(elevation) * distance,
        target.z + horizontal.z);
      camera.lookAt(target.x, target.y, target.z);
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }, { progress, pitch });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const path = `/tmp/gt3-inspect-${String(progress).replace('.', 'p')}-${pitch}.png`;
    await page.screenshot({ path });
    console.log('shot', path);
  }
}
console.log('errors', JSON.stringify(errors));
await browser.close();
