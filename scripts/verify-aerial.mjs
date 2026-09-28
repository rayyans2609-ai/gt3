/** Route camera survey, focused checks, and wheel-motion verification. Usage: GT3_URL=http://localhost:5181 node scripts/verify-aerial.mjs [branch|focused|motion|matrix] */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const mode = process.argv[2] || 'branch';
const baseline = mode === 'baseline';
const focused = mode === 'focused';
const matrix = mode === 'matrix';
const motion = mode === 'motion' || matrix;
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
async function run() {
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(allowLegacy => window.__gt3?.scene?.getObjectByName('track')
  && (allowLegacy || window.__gt3.aerial), { timeout: 120000 }, baseline);
await new Promise(r => setTimeout(r, 3500));
const integration = await page.evaluate(() => ({
  fontsStatus: document.fonts.status,
  fonts: Object.fromEntries(['Neue Haas Grotesk Text', 'Neue Haas Grotesk Display', 'Geist Mono']
    .map(family => [family, document.fonts.check(`16px "${family}"`)])),
  loaderReady: !!document.querySelector('#start-screen.is-ready'),
  loaderProgress: document.querySelector('.start-loading__value')?.textContent,
}));
console.log('INTEGRATION', JSON.stringify(integration));
await page.mouse.wheel({ deltaY: 240 });
await new Promise(r => setTimeout(r, 900));

async function goTo(t, settleMs = 420, tolerance = 0.001) {
  const start = Date.now();
  let lastProgress = null;
  let lastMovementAt = start;
  let montages = 0;
  while (Date.now() - start < 90000) {
    const status = await page.evaluate(target => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (!document.querySelector('#montage-layer.is-active')) window.scrollTo(0, target * max);
      return { progress: window.__gt3.probe().progress, mode: window.__gt3.probe().mode,
        montage: !!document.querySelector('#montage-layer.is-active'),
        locked: window.__gt3.probe().locked, speed01: window.__gt3.probe().speed01 };
    }, t);
    if (status.mode === 'finish') await page.click('.finish-replay');
    if (status.montage) { await page.keyboard.press('Escape'); montages++; }
    const distance = Math.abs(status.progress - t);
    if (!status.montage && !status.locked && (distance < tolerance
      || (status.speed01 < 0.01 && distance < 0.004))) {
      await new Promise(r => setTimeout(r, settleMs));
      return { progress: status.progress, montages };
    }
    if (lastProgress === null || Math.abs(status.progress - lastProgress) > 0.00002) {
      lastProgress = status.progress;
      lastMovementAt = Date.now();
    } else if (!status.montage && !status.locked && Date.now() - lastMovementAt > 1000) {
      // Re-issue a direct scroll target after a genuine stall. The normal loop
      // also targets the route each pass, but this makes recovery explicit when
      // a busy host has dropped scroll work for a sustained interval.
      await page.evaluate(target => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo(0, target * max);
      }, t);
      lastMovementAt = Date.now();
    }
    await new Promise(r => setTimeout(r, 90));
  }
  throw new Error(`Route failed to settle at ${t}: ${JSON.stringify(await page.evaluate(() => window.__gt3.probe()))}`);
}

if (motion) {
  const percentile = (values, fraction) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(fraction * sorted.length) - 1];
  };
  // This callback is registered after the app's rAF, so each sample sees its
  // rendered camera pose rather than the previous frame's state.
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const g = window.__gt3;
    const carRig = g.scene.getObjectByName('car-rig');
    window.__aerialMotion = { segment: null, frames: [] };
    function record() {
      const store = window.__aerialMotion;
      if (store.segment) {
        const mount = carRig.localToWorld(new THREE.Vector3(0, 1.2, 0));
        const ndc = mount.project(g.camera);
        store.frames.push({ segment: store.segment, time: performance.now(),
          progress: g.probe().progress, ndcX: ndc.x, ndcY: ndc.y,
          raceVisible: g.probe().mode === 'race' && !document.querySelector('#montage-layer.is-active'),
          correctionActive: g.aerial.correctionActive,
          correctionFrames: g.aerial.correctionFrames, snapCount: g.aerial.snapCount,
          camera: g.camera.position.toArray() });
      }
      requestAnimationFrame(record);
    }
    requestAnimationFrame(record);
  });

  const passes = [];
  const tunings = matrix ? [0.18, 0.08, 0.04, 0].flatMap(dampingSeconds =>
    [12, 0].map(lookAheadM => ({ dampingSeconds, lookAheadM }))) : [null];
  for (const tuning of tunings) {
  if (tuning) await page.evaluate(value => Object.assign(window.__gt3.aerial.TUNE, value), tuning);
  for (const [label, throttle] of [['normal', 1], ['cpu-4x', 4]]) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const sequences = (matrix ? [
      ['fast-forward', 0.18, Array(30).fill(30), 65],
      ['backward', 0.28, Array(30).fill(-30), 65],
    ] : [
      ['fast-forward', 0.18, Array(30).fill(30), 65],
      ['slow-forward', 0.18, Array(20).fill(5), 120],
      ['rapid-reversals', 0.18, Array.from({ length: 20 }, (_, i) => i % 2 ? -40 : 40), 65],
      ['backward', 0.28, Array(30).fill(-30), 65],
    ]);
    const reports = [];
    for (const [name, start, deltas, pauseMs] of sequences) {
      await goTo(start, 1800);
      const segment = `${tuning?.dampingSeconds ?? 'final'}:${tuning?.lookAheadM ?? 'final'}:${label}:${name}`;
      await page.evaluate(s => { window.__aerialMotion.segment = s; }, segment);
      let montagesSkipped = 0;
      for (const deltaY of deltas) {
        await page.mouse.wheel({ deltaY });
        await new Promise(r => setTimeout(r, pauseMs));
        if (await page.evaluate(() => !!document.querySelector('#montage-layer.is-active'))) {
          await page.keyboard.press('Escape');
          montagesSkipped++;
        }
        const position = await page.evaluate(() => window.__gt3.probe().progress);
        if ((deltaY > 0 && position > 0.6) || (deltaY < 0 && position < 0.04)) break;
      }
      await new Promise(r => setTimeout(r, 400));
      await page.evaluate(() => { window.__aerialMotion.segment = null; });
      const allFrames = await page.evaluate(s => window.__aerialMotion.frames.filter(f => f.segment === s), segment);
      const frames = allFrames.filter(f => f.raceVisible);
      const pairs = allFrames.slice(1).flatMap((frame, i) => frame.raceVisible && allFrames[i].raceVisible
        ? [{ frame, previous: allFrames[i] }] : []);
      const moving = pairs.filter(({ frame, previous }) => Math.abs(frame.progress - previous.progress) > 1e-7);
      const displacements = pairs.map(({ frame, previous }) =>
        Math.hypot(...frame.camera.map((x, j) => x - previous.camera[j])));
      const velocities = pairs.map(({ frame, previous }) => {
        const seconds = Math.max(0.001, (frame.time - previous.time) / 1000);
        return frame.camera.map((x, j) => (x - previous.camera[j]) / seconds);
      });
      const velocityChanges = velocities.slice(1).map((velocity, i) =>
        Math.hypot(...velocity.map((x, j) => x - velocities[i][j])));
      const outside = frames.filter(f => Math.abs(f.ndcX) > 1 || Math.abs(f.ndcY) > 1);
      const movingFrames = moving.map(({ frame }) => frame);
      reports.push({ name, frames: frames.length, excludedOverlayFrames: allFrames.length - frames.length,
        movingFrames: moving.length,
        startProgress: frames[0]?.progress, endProgress: frames.at(-1)?.progress,
        maxAbsNdcXMoving: Math.max(0, ...moving.map(({ frame }) => Math.abs(frame.ndcX))),
        maxAbsNdcYMoving: Math.max(0, ...moving.map(({ frame }) => Math.abs(frame.ndcY))),
        correctionActiveMovingPct: movingFrames.length
          ? 100 * movingFrames.filter(f => f.correctionActive).length / movingFrames.length : 0,
        correctionActiveFrames: frames.filter(f => f.correctionActive).length,
        correctionActivePct: frames.length ? 100 * frames.filter(f => f.correctionActive).length / frames.length : 0,
        correctionActiveCountDelta: pairs.reduce((n, { frame, previous }) =>
          n + Math.max(0, frame.correctionFrames - previous.correctionFrames), 0),
        snapCountDelta: frames.length ? frames.at(-1).snapCount - frames[0].snapCount : 0,
        snapsDuringMotion: moving.reduce((n, { frame, previous }) =>
          n + Math.max(0, frame.snapCount - previous.snapCount), 0),
        maxCameraDisplacementM: Math.max(0, ...displacements),
        maxVelocityChangeMps: Math.max(0, ...velocityChanges),
        p95VelocityChangeMps: percentile(velocityChanges, 0.95),
        outsideFrameCount: outside.length,
        outsideFrameExamples: outside.slice(0, 3).map(f => ({ progress: f.progress, x: f.ndcX, y: f.ndcY })),
        montagesSkipped });
      console.log('MOTION SEGMENT', label, JSON.stringify(reports.at(-1)));
    }
    passes.push({ tuning, label, throttle, sequences: reports });
    await cdp.detach();
  }
  }
  const summary = { mode, integration, passes, errors };
  await writeFile(`${root}/${mode}-verification.json`, JSON.stringify(summary, null, 2));
  console.log('SUMMARY', JSON.stringify(summary));
  return;
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
      projectedLengthPct: Math.hypot(front.x - back.x, (front.y - back.y) / g.camera.aspect) * 50,
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
  // Phase 3c retired Tour coins; crossing a checkpoint must no longer start a montage,
  // so montagePlayed is expected to stay false here.
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
  // Phase 3d removed the in-Tour F-key Showcase (SPEC §20): F must neither lock scroll nor
  // open a Showcase layer, and the camera must be undisturbed.
  const beforeFPose = await measure();
  await page.keyboard.press('f');
  await new Promise(r => setTimeout(r, 1650));
  const fKeyOpenedShowcase = await page.evaluate(() => window.__gt3.probe().locked
    || !!document.querySelector('#showcase-layer'));
  const afterFPose = await measure();
  const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.theme-toggle');
  await new Promise(r => setTimeout(r, 250));
  const themeAfterOne = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('.theme-toggle');
  await new Promise(r => setTimeout(r, 250));
  const themeAfterTwo = await page.evaluate(() => document.documentElement.dataset.theme);
  regression = { montagePlayed, montageCount, afterCoinProgress: afterCoin.progress,
    montageResumeFrameStepM: frameStep, montageResumeFrameProgressStep: frameProgressStep,
    fKeyOpenedShowcase,
    fKeyPoseDiffM: Math.hypot(...beforeFPose.camera.map((x, i) => x - afterFPose.camera[i])),
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
  const snapsBeforeReplay = await page.evaluate(() => window.__gt3.aerial.snapCount);
  await page.evaluate(async () => (await import('/src/scroll/scrollDrive.js')).resetToStart());
  await new Promise(r => setTimeout(r, 150));
  const seamStart = await measure();
  snapAndSeam = { seekSnapIncremented: afterSeek.snaps > snapBeforeSeek, seekProgress: afterSeek.progress,
    replaySnapIncremented: (await page.evaluate(() => window.__gt3.aerial.snapCount)) > snapsBeforeReplay,
    seamPositionDiffM: Math.hypot(...seamEnd.camera.map((x, i) => x - seamStart.camera[i])),
    seamQuaternionDiff: Math.hypot(...seamEnd.quaternion.map((x, i) => x - seamStart.quaternion[i])) };

}
const summary = baseline ? { mode, integration, errors } : focused ? { mode, integration, reversibility, regression, snapAndSeam, safetyProbe, errors } : {
  mode, integration, count: samples.length, correctionActiveSamples: samples.filter(s => s.correctionActive).length,
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
}

try {
  await run();
} finally {
  await browser.close();
}
