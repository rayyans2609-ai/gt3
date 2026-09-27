/** Route camera survey and comparison captures. Usage: GT3_URL=http://localhost:5181 node scripts/verify-aerial.mjs [branch|baseline] */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const mode = process.argv[2] || 'branch';
const baseline = mode === 'baseline';
const focused = mode === 'focused';
const base = process.env.GT3_URL || 'http://localhost:5181';
const root = '/tmp/gt3-aerial';
const shots = `${root}/shots`;
await mkdir(shots, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 120000,
  args: ['--no-sandbox', '--no-first-run', `--user-data-dir=/tmp/gt3-aerial-${mode}-chrome`,
    '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(allowLegacy => window.__gt3?.scene?.getObjectByName('track')
  && (allowLegacy || window.__gt3.aerial), { timeout: 120000 }, baseline);
await new Promise(r => setTimeout(r, 3500));
await page.mouse.wheel({ deltaY: 240 });
await new Promise(r => setTimeout(r, 900));

async function goTo(t, settleMs = 420, tolerance = 0.001) {
  const start = Date.now();
  let montages = 0;
  while (Date.now() - start < 30000) {
    const status = await page.evaluate(target => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (!document.querySelector('#montage-layer.is-active')) window.scrollTo(0, target * max);
      return { progress: window.__gt3.probe().progress,
        montage: !!document.querySelector('#montage-layer.is-active'),
        locked: window.__gt3.probe().locked };
    }, t);
    if (status.montage) { await page.keyboard.press('Escape'); montages++; }
    if (!status.montage && !status.locked && Math.abs(status.progress - t) < tolerance) {
      await new Promise(r => setTimeout(r, settleMs));
      return { progress: status.progress, montages };
    }
    await new Promise(r => setTimeout(r, 90));
  }
  throw new Error(`Route failed to settle at ${t}: ${JSON.stringify(await page.evaluate(() => window.__gt3.probe()))}`);
}

async function measure() {
  return page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { groundHeightAt } = await import('/src/scene/environment.js');
    const g = window.__gt3;
    const carRig = g.scene.getObjectByName('car-rig');
    const eye = g.camera.getWorldPosition(new THREE.Vector3());
    const car = carRig.localToWorld(new THREE.Vector3(0, 1.2, 0));
    const carNdc = car.clone().project(g.camera);
    const front = carRig.localToWorld(new THREE.Vector3(0, 1.2, -2.3)).project(g.camera);
    const back = carRig.localToWorld(new THREE.Vector3(0, 1.2, 2.3)).project(g.camera);
    const direction = g.camera.getWorldDirection(new THREE.Vector3());
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z));
    const pitch = THREE.MathUtils.radToDeg(Math.asin(-direction.y));
    const ray = new THREE.Raycaster(eye, car.clone().sub(eye).normalize(), 0.1, eye.distanceTo(car) - 1.5);
    const hits = ray.intersectObjects(g.scene.children, true).filter(hit => {
      if (!hit.object.isMesh) return false;
      for (let obj = hit.object; obj; obj = obj.parent) if (obj === carRig) return false;
      return true;
    });
    return { t: g.probe().progress, ndcX: carNdc.x, ndcY: carNdc.y,
      projectedLengthPct: Math.hypot(front.x - back.x, front.y - back.y) * 50,
      yawDeg: yaw, pitchDeg: pitch, correctionActive: !!g.aerial?.correctionActive,
      camera: eye.toArray(), quaternion: g.camera.quaternion.toArray(),
      occlusion: hits.length ? { name: hits[0].object.name || hits[0].object.parent?.name,
        distance: hits[0].distance } : null,
      clearanceM: eye.y - groundHeightAt(eye.x, eye.z) };
  });
}

const stops = [
  ['start-straight', 0.02], ['turn-1', 0.09], ['big-right', 0.28],
  ['hairpin', 0.44], ['chicane', 0.55], ['long-straight', 0.63],
  ['closing-arcs', 0.84], ['near-finish', 0.975],
];
const samples = [];
let montageCount = 0;
if (!baseline && !focused) {
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    const reached = await goTo(t, 90);
    montageCount += reached.montages;
    samples.push(await measure());
    if (i % 25 === 0) console.log('sample', i, JSON.stringify(samples.at(-1)));
  }
  for (const t of [0.63, 0.645, 0.66, 0.673, 0.70]) {
    await goTo(t, 200);
    samples.push(await measure());
  }
}
for (const [label, t] of (focused ? [] : stops)) {
  await goTo(t, 550);
  const path = `${shots}/${mode}-day-${label}.png`;
  await page.screenshot({ path });
  console.log('shot', path);
}
if (!focused) await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));
for (const [label, t] of (focused ? [] : stops.filter(([label]) => ['big-right', 'long-straight', 'closing-arcs'].includes(label)))) {
  await goTo(t, 550);
  const path = `${shots}/${mode}-night-${label}.png`;
  await page.screenshot({ path });
  console.log('shot', path);
}
let reversibility = [];
let regression = {};
let snapAndSeam = {};
let safetyProbe = {};
if (!baseline) {
  for (const t of [0.4, 0.28]) {
    await goTo(t - 0.025, 100); await goTo(t, 2200, 0.00006);
    const fromBelow = await measure();
    await goTo(t + 0.025, 100); await goTo(t, 2200, 0.00006);
    const fromAbove = await measure();
    reversibility.push({ t,
      positionDiffM: Math.hypot(...fromBelow.camera.map((x, i) => x - fromAbove.camera[i])),
      quaternionDiff: Math.hypot(...fromBelow.quaternion.map((x, i) => x - fromAbove.quaternion[i])) });
  }
  await page.evaluate(async () => (await import('/src/scene/coins.js')).resetAllCoins());
  await goTo(0.05, 500);
  await page.evaluate(() => { const max = document.documentElement.scrollHeight - innerHeight; window.scrollTo(0, max * 0.075); });
  const coinStart = Date.now();
  let montagePlayed = false;
  while (Date.now() - coinStart < 10000) {
    montagePlayed = await page.evaluate(() => !!document.querySelector('#montage-layer.is-active'));
    if (montagePlayed) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (montagePlayed) {
    await page.evaluate(() => {
      window.__aerialFrames = [];
      const start = performance.now();
      function record() {
        const g = window.__gt3;
        window.__aerialFrames.push({ time: performance.now(), progress: g.probe().progress,
          active: !!document.querySelector('#montage-layer.is-active'),
          camera: g.camera.position.toArray() });
        if (performance.now() - start < 9000) requestAnimationFrame(record);
      }
      requestAnimationFrame(record);
    });
    await new Promise(r => setTimeout(r, 2200));
  }
  if (montagePlayed) await page.waitForFunction(() => !document.querySelector('#montage-layer.is-active'), { timeout: 120000 });
  await new Promise(r => setTimeout(r, 80));
  const frames = await page.evaluate(() => window.__aerialFrames || []);
  const resumeIndex = frames.findIndex((frame, index) => index > 0 && frames[index - 1].active && !frame.active);
  const frameStep = resumeIndex > 0 ? Math.hypot(...frames[resumeIndex].camera.map((x, i) => x - frames[resumeIndex - 1].camera[i])) : null;
  const frameProgressStep = resumeIndex > 0 ? frames[resumeIndex].progress - frames[resumeIndex - 1].progress : null;
  const afterCoin = await goTo(0.075, 1000);
  await page.keyboard.press('f');
  await new Promise(r => setTimeout(r, 650));
  const showcaseOpened = await page.evaluate(() => window.__gt3.probe().locked);
  await new Promise(r => setTimeout(r, 1000));
  const showcasePose = await measure();
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 800));
  const showcaseClosed = await page.evaluate(() => !window.__gt3.probe().locked);
  const resumedPose = await measure();
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.theme-toggle');
  await new Promise(r => setTimeout(r, 250));
  const themeAfterOne = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.theme-toggle');
  await new Promise(r => setTimeout(r, 250));
  const themeAfterTwo = await page.evaluate(() => document.documentElement.dataset.theme);
  regression = { montagePlayed, montageCount, afterCoinProgress: afterCoin.progress,
    montageResumeFrameStepM: frameStep, montageResumeFrameProgressStep: frameProgressStep,
    showcaseOpened, showcaseClosed,
    showcaseResumeDiffM: Math.hypot(...showcasePose.camera.map((x, i) => x - resumedPose.camera[i])),
    themeBefore, themeAfterOne, themeAfterTwo,
    themeToggleWorked: themeBefore !== themeAfterOne && themeBefore === themeAfterTwo };

  const beforeSafety = await measure();
  const correctionFramesBefore = await page.evaluate(() => window.__gt3.aerial.correctionFrames);
  await page.evaluate(() => { window.__gt3.aerial.TUNE.safeX = 0.02; });
  await new Promise(r => setTimeout(r, 1300));
  const duringSafety = await measure();
  const correctionState = await page.evaluate(() => ({ active: window.__gt3.aerial.correctionActive,
    frames: window.__gt3.aerial.correctionFrames }));
  await page.evaluate(() => { window.__gt3.aerial.TUNE.safeX = 0.76; });
  await new Promise(r => setTimeout(r, 1300));
  const afterSafety = await measure();
  safetyProbe = { beforeX: beforeSafety.ndcX, correctedX: duringSafety.ndcX,
    restoredX: afterSafety.ndcX, active: correctionState.active,
    activeFrames: correctionState.frames - correctionFramesBefore };

  const snapBeforeSeek = await page.evaluate(async () => {
    const drive = await import('/src/scroll/scrollDrive.js');
    const before = window.__gt3.aerial.snapCount;
    drive.seekTo(0.7, { instant: true });
    return before;
  });
  await new Promise(r => setTimeout(r, 150));
  const afterSeek = await page.evaluate(() => ({ progress: window.__gt3.probe().progress, snaps: window.__gt3.aerial.snapCount }));
  await page.evaluate(async () => (await import('/src/scroll/scrollDrive.js')).seekTo(1, { instant: true }));
  await new Promise(r => setTimeout(r, 150));
  const seamEnd = await measure();
  await page.evaluate(async () => (await import('/src/scroll/scrollDrive.js')).resetToStart());
  await new Promise(r => setTimeout(r, 150));
  const seamStart = await measure();
  snapAndSeam = { seekSnapIncremented: afterSeek.snaps > snapBeforeSeek, seekProgress: afterSeek.progress,
    seamPositionDiffM: Math.hypot(...seamEnd.camera.map((x, i) => x - seamStart.camera[i])),
    seamQuaternionDiff: Math.hypot(...seamEnd.quaternion.map((x, i) => x - seamStart.quaternion[i])) };

}
const summary = baseline ? { mode, errors } : focused ? { mode, reversibility, regression, snapAndSeam, safetyProbe, errors } : {
  mode, count: samples.length, correctionSamples: samples.filter(s => s.correctionActive).length,
  occlusions: samples.filter(s => s.occlusion).map(s => ({ t: s.t, ...s.occlusion })),
  ndcX: [Math.min(...samples.map(s => s.ndcX)), Math.max(...samples.map(s => s.ndcX))],
  ndcY: [Math.min(...samples.map(s => s.ndcY)), Math.max(...samples.map(s => s.ndcY))],
  projectedLengthPct: [Math.min(...samples.map(s => s.projectedLengthPct)), Math.max(...samples.map(s => s.projectedLengthPct))],
  yawDeg: [Math.min(...samples.map(s => s.yawDeg)), Math.max(...samples.map(s => s.yawDeg))],
  pitchDeg: [Math.min(...samples.map(s => s.pitchDeg)), Math.max(...samples.map(s => s.pitchDeg))],
  clearanceM: [Math.min(...samples.map(s => s.clearanceM)), Math.max(...samples.map(s => s.clearanceM))],
  reversibility, regression, snapAndSeam, safetyProbe, errors,
};
await writeFile(`${root}/${mode}-verification.json`, JSON.stringify({ summary, samples }, null, 2));
console.log('SUMMARY', JSON.stringify(summary));
await browser.close();
