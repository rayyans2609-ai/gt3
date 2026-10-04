/**
 * W2 composition-candidate verification (real-GPU headless Chrome; host rules apply:
 * run the preflight first, one browser at a time, external Vite only).
 *   GT3_URL=http://127.0.0.1:5192 GT3_COMPS=base,a,b,c node scripts/verify-composition.mjs
 * Env: GT3_CAPTURE_DIR (review stills/sequence; default ~/Desktop/gt3-review-2026-10-04/w2),
 *      GT3_NO_CAPTURE=1, GT3_SOFTWARE_GL=1.
 * Per candidate: yaw/pitch constancy, snaps, seam, deterministic + settled reversibility,
 * hairpin/chicane corner test, correction %, car NDC range (scaled Box3), road coverage
 * (48×27 raycast), car on-screen size, all-ten footprint clearance to road edge and
 * gate/finish posts, exposed-world-edge rays, indicative frame time. Representative
 * evidence only (W2 item 4); the exhaustive matrix belongs to W6.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = (process.env.GT3_URL || 'http://127.0.0.1:5192').replace(/\/$/, '');
const comps = (process.env.GT3_COMPS || 'base,a,b,c').split(',').filter(Boolean);
const captureDir = process.env.GT3_CAPTURE_DIR
  || '/Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w2';
const capture = process.env.GT3_NO_CAPTURE !== '1';
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
const root = '/tmp/gt3-w2';
await mkdir(root, { recursive: true });
if (capture) await mkdir(captureDir, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, f) => values.length
  ? [...values].sort((a, b) => a - b)[Math.ceil(f * values.length) - 1] : null;

// Representative route points (t from the curvature table; see check-composition-math).
const POINTS = [['start-straight', 0.02], ['hairpin-entry', 0.265], ['hairpin-apex', 0.283],
  ['hairpin-exit', 0.300], ['chicane-in', 0.335], ['chicane-mid', 0.352],
  ['chicane-out', 0.370], ['turn9', 0.465]];

async function runCandidate(browser, comp) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = comp === 'base' ? `${base}/?gate=quiet` : `${base}/?comp=${comp}&gate=quiet`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__gt3?.readiness?.status
    && window.__gt3.readiness.status !== 'loading', { timeout: 180000 });
  const readiness = await page.evaluate(() => ({ status: window.__gt3.readiness.status,
    reasons: window.__gt3.readiness.reasons, comp: window.__gt3.comp }));
  await page.mouse.wheel({ deltaY: 240 });
  await wait(1200);

  async function goTo(t, settleMs = 600) {
    const start = Date.now();
    while (Date.now() - start < 90000) {
      const s = await page.evaluate(target => {
        const max = document.documentElement.scrollHeight - innerHeight;
        window.scrollTo(0, target * max);
        const p = window.__gt3.probe();
        return { progress: p.progress, speed01: p.speed01, mode: p.mode };
      }, t);
      if (s.mode === 'finish') await page.click('.finish-replay').catch(() => {});
      if (Math.abs(s.progress - t) < 0.001 || (s.speed01 < 0.01 && Math.abs(s.progress - t) < 0.004)) {
        await wait(settleMs);
        return s.progress;
      }
      await wait(90);
    }
    throw new Error(`route did not settle at ${t}`);
  }

  // Everything measured in-page from the rendered pose.
  const measure = () => page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const curve = await import('/src/scene/trackCurve.js');
    const cars = await import('/src/scene/cars.js');
    const g = window.__gt3;
    const t = g.probe().progress;
    const cam = g.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const mount = g.scene.getObjectByName('car-mount');
    const rig = g.scene.getObjectByName('car-rig');
    mount.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(mount, true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z).project(cam);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    // Road coverage + world edge: one raycast grid through the frame.
    const ray = new THREE.Raycaster();
    const asphalt = g.scene.getObjectByName('track-asphalt');
    const all = g.scene.children.filter(o => o.name !== 'car-rig');
    let road = 0, cells = 0, exposed = 0;
    for (let iy = 0; iy < 27; iy++) for (let ix = 0; ix < 48; ix++) {
      ray.setFromCamera({ x: (ix + 0.5) / 24 - 1, y: (iy + 0.5) / 13.5 - 1 }, cam);
      cells++;
      if (ray.intersectObject(asphalt, false).length) road++;
      const edgeCell = ix === 0 || iy === 0 || ix === 47 || iy === 26;
      if (edgeCell) {
        const hits = ray.intersectObjects(all, true).filter(h => h.object.isMesh && h.object.visible);
        if (!hits.length && ray.ray.direction.y < 0) exposed++;
      }
    }
    // All-ten footprint clearance at this t with the rig's real pose.
    const centre = curve.pointAt(t, new THREE.Vector3());
    const left = curve.offsetPointAt(t, 1, 0, new THREE.Vector3()).sub(centre).setY(0).normalize();
    const scale = mount.scale.x;
    const footprints = [];
    for (let i = 0; i < 10; i++) {
      const model = cars.getCarModel(i);
      const size = new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3());
      // Model may be mounted (world scale applied) — normalise by its own world scale.
      const s = model.parent ? model.getWorldScale(new THREE.Vector3()).x / model.scale.x : 1;
      footprints.push({ w: size.x / s * scale, l: size.z / s * scale });
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion).setY(0).normalize();
    const lateral = rig.position.clone().sub(centre).setY(0).dot(left);
    const cosYaw = Math.abs(fwd.dot(new THREE.Vector3(-left.z, 0, left.x)));
    const sinYaw = Math.sqrt(Math.max(0, 1 - cosYaw * cosYaw));
    const extent = Math.max(...footprints.map(f => Math.abs(lateral) + f.w / 2 * cosYaw + f.l / 2 * sinYaw));
    return { t, yawDeg: THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)),
      pitchDeg: THREE.MathUtils.radToDeg(Math.asin(-dir.y)),
      camera: cam.position.toArray(), quaternion: cam.quaternion.toArray(),
      carNdc: { minX, maxX, minY, maxY }, carWidthPctOfFrame: (maxX - minX) * 50,
      roadCoverage: road / cells, exposedEdgeRays: exposed,
      lateralM: lateral, worstFootprintExtentM: extent,
      roadEdgeGapM: curve.TRACK.halfWidth - extent,
      gatePostGapM: curve.TRACK.halfWidth + curve.TRACK.curbWidth + 1 - 0.17 - extent,
      finishPostGapM: curve.TRACK.halfWidth + curve.TRACK.curbWidth + 0.72 - 0.17 - extent,
      correctionActive: !!g.aerial.correctionActive, snapCount: g.aerial.snapCount,
      hero: scale, shadowScale: g.scene.getObjectByName('contact-shadow')?.scale.x };
  });

  const out = { comp, url, readiness, points: [], gates: [], reversibility: [], motion: [], errors };
  for (const [label, t] of POINTS) {
    await goTo(t);
    out.points.push({ label, ...(await measure()) });
    if (capture && ['hairpin-apex', 'chicane-mid'].includes(label)) {
      await page.screenshot({ path: `${captureDir}/${comp}_${label}_day.png` });
    }
  }
  const { thresholds, finish } = await page.evaluate(async () => {
    const m = await import('/src/scene/trackCurve.js');
    return { thresholds: m.CHECKPOINT_T, finish: m.FINISH_T };
  });
  for (const t of [...thresholds, finish]) {
    await goTo(t, 450);
    const m = await measure();
    out.gates.push({ t, roadEdgeGapM: m.roadEdgeGapM, gatePostGapM: m.gatePostGapM,
      finishPostGapM: m.finishPostGapM, carNdc: m.carNdc, exposedEdgeRays: m.exposedEdgeRays });
  }
  // Reversibility: deterministic rail pose (sector) and settled pose from both sides.
  for (const t of [0.283, 0.352]) {
    const rail = await page.evaluate(async t => {
      const a = await import('/src/scene/aerialCamera.js');
      return [a.railPoseAt?.(t), a.railPoseAt?.(t)];
    }, t);
    await goTo(t - 0.02, 200); await goTo(t, 2500);
    const below = await measure();
    await goTo(t + 0.02, 200); await goTo(t, 2500);
    const above = await measure();
    out.reversibility.push({ t, railDeterministic: JSON.stringify(rail[0]) === JSON.stringify(rail[1]),
      settledPositionDiffM: Math.hypot(...below.camera.map((x, i) => x - above.camera[i])),
      settledQuaternionDiff: Math.hypot(...below.quaternion.map((x, i) => x - above.quaternion[i])) });
  }
  // Motion through the hairpin and chicane, forward and back, real wheel input.
  await page.evaluate(() => {
    const g = window.__gt3;
    window.__w2 = { segment: null, frames: [] };
    let last = performance.now();
    (function record(now) {
      if (window.__w2.segment) {
        const rig = g.scene.getObjectByName('car-rig');
        const ndc = rig.position.clone().project(g.camera);
        window.__w2.frames.push({ segment: window.__w2.segment, dt: now - last,
          progress: g.probe().progress, camera: g.camera.position.toArray(),
          car: rig.position.toArray(), ndcX: ndc.x, ndcY: ndc.y,
          correction: !!g.aerial.correctionActive, snaps: g.aerial.snapCount });
      }
      last = now;
      requestAnimationFrame(record);
    })(performance.now());
  });
  for (const [name, start, delta, stopAt] of [['fwd-hairpin-chicane', 0.25, 30, 0.385],
    ['back-chicane-hairpin', 0.385, -30, 0.25]]) {
    await goTo(start, 1500);
    await page.evaluate(s => { window.__w2.segment = s; }, name);
    for (let i = 0; i < 80; i++) {
      await page.mouse.wheel({ deltaY: delta });
      await wait(65);
      const p = await page.evaluate(() => window.__gt3.probe().progress);
      if ((delta > 0 && p >= stopAt) || (delta < 0 && p <= stopAt)) break;
    }
    await wait(1500);
    await page.evaluate(() => { window.__w2.segment = null; });
    const frames = await page.evaluate(s => window.__w2.frames.filter(f => f.segment === s), name);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let camTravel = 0, carTravel = 0, maxProgressJump = 0;
    for (let i = 1; i < frames.length; i++) {
      camTravel += dist(frames[i].camera, frames[i - 1].camera);
      carTravel += dist(frames[i].car, frames[i - 1].car);
      maxProgressJump = Math.max(maxProgressJump, Math.abs(frames[i].progress - frames[i - 1].progress));
    }
    const dts = frames.slice(1).map(f => f.dt);
    out.motion.push({ name, frames: frames.length,
      cameraToCarTranslation: carTravel ? camTravel / carTravel : null,
      correctionActivePct: frames.length ? 100 * frames.filter(f => f.correction).length / frames.length : 0,
      ndcX: [Math.min(...frames.map(f => f.ndcX)), Math.max(...frames.map(f => f.ndcX))],
      ndcY: [Math.min(...frames.map(f => f.ndcY)), Math.max(...frames.map(f => f.ndcY))],
      snapsDuringMotion: frames.length ? frames.at(-1).snaps - frames[0].snaps : 0,
      maxProgressJump, frameMsP50: percentile(dts, 0.5), frameMsP95: percentile(dts, 0.95) });
  }
  // Seam: end of lap vs replayed start (both snap paths).
  const seam = await page.evaluate(async () => {
    const drive = await import('/src/scroll/scrollDrive.js');
    const g = window.__gt3;
    drive.seekTo(1, { instant: true });
    await new Promise(r => setTimeout(r, 200));
    const end = g.camera.position.toArray();
    drive.resetToStart();
    await new Promise(r => setTimeout(r, 200));
    const start = g.camera.position.toArray();
    return Math.hypot(...end.map((x, i) => x - start[i]));
  });
  out.seamPositionDiffM = seam;
  if (capture) {
    // Chicane frame sequence (~3 s) and one Night still at the hairpin apex.
    await goTo(0.325, 1200);
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel({ deltaY: 12 });
      await page.screenshot({ path: `${captureDir}/${comp}_chicane-seq-${String(i).padStart(2, '0')}_day.png` });
      await wait(70);
    }
    await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));
    await goTo(0.283, 900);
    await page.screenshot({ path: `${captureDir}/${comp}_hairpin-apex_night.png` });
  }
  await page.close();
  return out;
}

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=${root}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const results = [];
try {
  for (const comp of comps) {
    const result = await runCandidate(browser, comp);
    results.push(result);
    const yaws = result.points.map(p => p.yawDeg), pitches = result.points.map(p => p.pitchDeg);
    console.log('CANDIDATE', comp, JSON.stringify({ readiness: result.readiness.status,
      yawSpreadDeg: Math.max(...yaws) - Math.min(...yaws),
      pitchSpreadDeg: Math.max(...pitches) - Math.min(...pitches),
      roadCoverage: result.points.map(p => +p.roadCoverage.toFixed(3)),
      carWidthPctOfFrame: result.points.map(p => +p.carWidthPctOfFrame.toFixed(2)),
      minRoadEdgeGapM: Math.min(...result.points.map(p => p.roadEdgeGapM), ...result.gates.map(g => g.roadEdgeGapM)),
      minGatePostGapM: Math.min(...result.gates.map(g => g.gatePostGapM)),
      exposedEdgeRays: [...result.points, ...result.gates].reduce((n, p) => n + p.exposedEdgeRays, 0),
      reversibility: result.reversibility, motion: result.motion, seam: result.seamPositionDiffM,
      errors: result.errors.length }));
  }
} finally {
  await browser.close();
  await writeFile(`${root}/composition-verification.json`, JSON.stringify(results, null, 2));
}
