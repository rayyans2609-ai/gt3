/** Matched route-relative camera views; GT3_URL and GT3_METRES select checkout. */
import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://localhost:5173';
const tag = process.env.GT3_TAG || 'current';
const metres = (process.env.GT3_METRES || '40,300,1410,2000').split(',').map(Number);
const names = (process.env.GT3_SCENES || 'start,right,hairpin,sweep').split(',');
const requestedPitches = (process.env.GT3_PITCHES || '45,55,60,30').split(',').map(Number);
const views = [
  { pitch: 45, distance: 80, yaw: 155 },
  { pitch: 55, distance: 95, yaw: 155 },
  { pitch: 60, distance: 110, yaw: 155 },
  { pitch: 30, distance: 95, yaw: 125 },
].filter((view) => requestedPitches.includes(view.pitch));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', `--user-data-dir=/tmp/gt3-compare-${tag}`,
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig'),
  { timeout: 180000 });
const length = await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).TRACK_LENGTH);
await new Promise((resolve) => setTimeout(resolve, 4500));
await page.mouse.wheel({ deltaY: 240 });
await new Promise((resolve) => setTimeout(resolve, 1000));

for (let sceneIndex = 0; sceneIndex < metres.length; sceneIndex++) {
  const target = metres[sceneIndex] / length;
  await page.evaluate((t) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: t * max, behavior: 'instant' });
  }, target);
  let actual = 0;
  for (let attempt = 0; attempt < 250; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const status = await page.evaluate(() => ({
      metres: Number((document.querySelector('.hud-telemetry__number')?.textContent || '')
        .replace(/[^0-9]/g, '')),
      montage: !!document.querySelector('#montage-layer.is-active'),
    }));
    if (status.montage) { await page.keyboard.press('Escape'); continue; }
    actual = status.metres;
    if (Math.abs(actual - metres[sceneIndex]) < 6) break;
    if (attempt % 30 === 29) {
      await page.evaluate((t) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: t * max, behavior: 'instant' });
      }, target);
    }
  }
  if (Math.abs(actual - metres[sceneIndex]) >= 6) {
    throw new Error(`Could not settle ${names[sceneIndex]} at ${metres[sceneIndex]} m; got ${actual}`);
  }
  for (const view of views) {
    await page.evaluate(async ({ t, pitch, distance, yaw }) => {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const track = await import('/src/scene/trackCurve.js');
      const g = window.__gt3;
      const camera = g.camera;
      const rig = g.scene.getObjectByName('car-rig');
      if (camera.parent !== g.scene) g.scene.attach(camera);
      const forward = track.tangentAt(t, new THREE.Vector3()).setY(0).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const azimuth = yaw * Math.PI / 180;
      const elevation = pitch * Math.PI / 180;
      const offset = right.multiplyScalar(Math.sin(azimuth))
        .add(forward.multiplyScalar(Math.cos(azimuth)))
        .multiplyScalar(Math.cos(elevation) * distance);
      camera.position.set(rig.position.x + offset.x,
        rig.position.y + Math.sin(elevation) * distance,
        rig.position.z + offset.z);
      camera.lookAt(rig.position.x, rig.position.y, rig.position.z);
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }, { t: target, ...view });
    await new Promise((resolve) => setTimeout(resolve, 650));
    const path = `/tmp/gt3-cmp-${tag}-${names[sceneIndex]}-${view.pitch}.png`;
    await page.screenshot({ path });
    console.log('shot', path, 'actualMetres', actual);
  }
}
console.log('errors', JSON.stringify(errors));
await browser.close();
