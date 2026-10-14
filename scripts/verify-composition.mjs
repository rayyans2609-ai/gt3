/**
 * W2 composition-candidate verification (real-GPU headless Chrome; host rules apply:
 * run the preflight first, one browser at a time, external Vite only).
 *   GT3_URL=http://127.0.0.1:5192 GT3_COMPS=base,a,b,c GT3_CAMS=leg1 node scripts/verify-composition.mjs
 * Independent camera matrix: GT3_COMPS=a,b,c GT3_CAMS=glide,hold,wide,soft
 * Env: GT3_CAPTURE_DIR (review stills/sequence; default ~/Desktop/gt3-review-2026-10-04/w2),
 *      GT3_NO_CAPTURE=1, GT3_SOFTWARE_GL=1. GT3_LOOKS=r1,r2,r3 selects visual presets;
 *      GT3_LEAN=1 limits those runs to three review frames (24×14 edge grid),
 *      two gates, forward/back hairpin-curb wheel motion and two desktop aspects.
 *      GT3_RECHECK_POSES=<JSON> reuses valid same-source frame/gate/wheel evidence;
 *      GT3_READ_RESULT=<JSON> asserts a completed artifact without a browser.
 * Per candidate: yaw/pitch constancy, snaps, seam, deterministic + settled reversibility,
 * hairpin/chicane corner test, correction %, car NDC range (scaled Box3), road coverage
 * (48×27 raycast), car on-screen size, all-ten footprint clearance to road edge and
 * gate/finish posts, exposed-world-edge rays, indicative frame time. Representative
 * evidence only (W2 item 4); the exhaustive matrix belongs to W6.
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CARS } from '../src/data/cars.js';
import { glbFootprint } from './lib/glb-footprint.mjs';

const modelDir = process.env.GT3_MODELS || new URL('../public/models/tour/', import.meta.url).pathname;
const rosterBounds = await Promise.all(CARS.map(async car =>
  ({ id: car.id, ...(await glbFootprint(modelDir + car.modelFile)) })));

const base = (process.env.GT3_URL || 'http://127.0.0.1:5192').replace(/\/$/, '');
const looks = process.env.GT3_LOOKS?.split(',').filter(Boolean);
const leanLooks = Boolean(looks && process.env.GT3_LEAN === '1');
const comps = looks || (process.env.GT3_COMPS || 'base,a,b,c').split(',').filter(Boolean);
const cameraCandidates = ['leg1', 'glide', 'hold', 'wide', 'soft'];
const cams = (process.env.GT3_CAMS || 'leg1').split(',').filter(Boolean);
if (cams.some(cam => !cameraCandidates.includes(cam))) throw new Error(`GT3_CAMS must use ${cameraCandidates.join(',')}`);
const captureDir = process.env.GT3_CAPTURE_DIR
  || '/Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w2';
const capture = process.env.GT3_NO_CAPTURE !== '1';
// 10-frame chicane sequences are recorded for these comps only (disk budget).
const seqComps = (process.env.GT3_SEQ_COMPS || 'base,b').split(',');
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
const root = process.env.GT3_WORK_DIR || '/tmp/gt3-w2';
const t00 = Date.now();
const phase = name => console.error(`[${((Date.now() - t00) / 1000).toFixed(0)}s] ${name}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, f) => values.length
  ? [...values].sort((a, b) => a - b)[Math.ceil(f * values.length) - 1] : null;

// Representative route points (t from the curvature table; see check-composition-math).
const POINTS = [['start-straight', 0.02], ['hairpin-entry', 0.265], ['hairpin-apex', 0.283],
  ['hairpin-exit', 0.300], ['chicane-in', 0.335], ['chicane-mid', 0.352],
  ['chicane-out', looks ? 0.365 : 0.370], ['turn9', 0.465]];

async function runCandidate(browser, comp, cam) {
  const key = cam === 'leg1' ? comp : `${comp}-${cam}`;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (process.env.GT3_DEBUG_PAGE === '1') {
    // Diagnostics for pages that vanish mid-run (navigation, renderer crash, context loss).
    const tag = `[${key}]`;
    page.on('framenavigated', f => { if (f === page.mainFrame()) console.error(tag, 'NAVIGATED', f.url()); });
    page.on('error', e => console.error(tag, 'PAGE-CRASH', e.message));
    page.on('close', () => console.error(tag, 'PAGE-CLOSE'));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', e => console.error(tag, 'NAV-REQUEST', e.reason, e.disposition, e.url));
    cdp.on('Inspector.targetCrashed', () => console.error(tag, 'TARGET-CRASHED'));
    page.on('requestfailed', r => { if (r.isNavigationRequest()) console.error(tag, 'NAV-REQ-FAILED', r.url()); });
    page.on('console', m => { if (['warning', 'error'].includes(m.type())) console.error(tag, 'console.' + m.type(), m.text().slice(0, 240)); });
  }
  const reviewUrl = new URL(`${base}/`);
  if (comp !== 'base') reviewUrl.searchParams.set(looks ? 'look' : 'comp', comp);
  if (cam !== 'leg1') reviewUrl.searchParams.set('cam', cam);
  reviewUrl.searchParams.set('gate', 'quiet');
  const url = reviewUrl.href;
  const loadStart = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__gt3?.readiness?.status
    && window.__gt3.readiness.status !== 'loading', { timeout: 180000 });
  const readyMs = Date.now() - loadStart;
  const readiness = await page.evaluate(() => ({ status: window.__gt3.readiness.status,
    reasons: window.__gt3.readiness.reasons, comp: window.__gt3.comp }));
  readiness.readyMs = readyMs;
  await page.mouse.wheel({ deltaY: 240 });
  await wait(1200);

  // Default: real instant seek (state.progress set directly, no scroll-law glide), which
  // is what Replay/restore use and costs one frame. `slow` uses the public non-instant seek
  // to reach the same target through the bounded glide from either side. Raw scrollTo
  // is input, not a target under capped pace, so it cannot test same-progress reversal.
  // A wheel-driven glide across a quarter lap
  // took minutes on the loaded host, which is why static measurement points seek.
  async function goTo(t, settleMs = 600, slow = false) {
    const start = Date.now();
    while (Date.now() - start < 90000) {
      const s = await page.evaluate(async (target, instant) => {
        (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant });
        const p = window.__gt3.probe();
        return { progress: p.progress, speed01: p.speed01, mode: p.mode };
      }, t, !slow);
      if (s.mode === 'finish') await page.click('.finish-replay').catch(() => {});
      if (slow ? Math.abs(s.progress - t) < 1e-7 && s.speed01 < 0.001
        : Math.abs(s.progress - t) < 0.001 || (s.speed01 < 0.01 && Math.abs(s.progress - t) < 0.004)) {
        await wait(settleMs);
        return s.progress;
      }
      await wait(90);
    }
    throw new Error(`route did not settle at ${t}`);
  }

  // Everything measured in-page from the rendered pose.
  const measure = (fullScene = true) => page.evaluate(async (rosterBounds, fullScene, lean) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const curve = await import('/src/scene/trackCurve.js');
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
    let road = 0, cells = 0, exposed = 0, roadOutsideShadow = 0;
    const sunCam = g.scene.children.find(o => o.isDirectionalLight && o.castShadow)?.shadow.camera;
    if (sunCam) sunCam.updateMatrixWorld();
    const sunLp = new THREE.Vector3();
    const columns = lean ? 24 : 48, rows = lean ? 14 : 27;
    if (fullScene) for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < columns; ix++) {
      ray.setFromCamera({ x: (ix + 0.5) * 2 / columns - 1, y: (iy + 0.5) * 2 / rows - 1 }, cam);
      cells++;
      const ah = ray.intersectObject(asphalt, false);
      if (ah.length) {
        road++;
        if (sunCam) {
          sunLp.copy(ah[0].point).applyMatrix4(sunCam.matrixWorldInverse);
          if (Math.abs(sunLp.x) > sunCam.right || Math.abs(sunLp.y) > sunCam.top) roadOutsideShadow++;
        }
      }
      const edgeCell = ix === 0 || iy === 0 || ix === columns - 1 || iy === rows - 1;
      if (edgeCell) {
        const hits = ray.intersectObjects(all, true).filter(h => h.object.isMesh && h.object.visible);
        if (!hits.length && ray.ray.direction.y < 0) exposed++;
      }
    }
    // Hero nose-to-tail screen length (% of frame width), as the node diagnostic defines it.
    const fwdLen = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion).setY(0).normalize();
    const half = 2.3 * mount.scale.x;
    const nose = rig.position.clone().addScaledVector(fwdLen, half).project(cam);
    const tail = rig.position.clone().addScaledVector(fwdLen, -half).project(cam);
    const carLengthPctOfFrame = 100 * Math.hypot((nose.x - tail.x) / 2, (nose.y - tail.y) / 2 / cam.aspect);
    // Shadow-box and fog joins on the same grid, analytic (ray vs the plane through the
    // car; scene raycasts here cost minutes): ground points outside the cast-shadow
    // box (light space), farthest border distance vs fog, and sky fraction.
    const sun = g.scene.children.find(o => o.isDirectionalLight && o.castShadow);
    const sc = sun?.shadow.camera;
    if (sc) sc.updateMatrixWorld();
    const lp = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -rig.position.y);
    const hitPoint = new THREE.Vector3();
    let groundHits = 0, outsideShadow = 0, sky = 0, borderMaxDist = 0;
    const fog = g.scene.fog;
    for (let iy = 0; iy < 27; iy++) for (let ix = 0; ix < 48; ix++) {
      ray.setFromCamera({ x: (ix + 0.5) / 24 - 1, y: (iy + 0.5) / 13.5 - 1 }, cam);
      if (!ray.ray.intersectPlane(plane, hitPoint)) { sky++; continue; }
      if (ix === 0 || iy === 0 || ix === 47 || iy === 26) {
        borderMaxDist = Math.max(borderMaxDist, hitPoint.distanceTo(cam.position));
      }
      if (!sc) continue;
      groundHits++;
      lp.copy(hitPoint).applyMatrix4(sc.matrixWorldInverse);
      if (Math.abs(lp.x) > sc.right || Math.abs(lp.y) > sc.top) outsideShadow++;
    }
    // All-ten footprint clearance at this t with the rig's real pose.
    const centre = curve.pointAt(t, new THREE.Vector3());
    const left = curve.offsetPointAt(t, 1, 0, new THREE.Vector3()).sub(centre).setY(0).normalize();
    const scale = mount.scale.x;
    // Accessor bounds in canonical model space. Dividing a world AABB by scale
    // cannot recover width/length after the mounted rig has turned.
    const footprints = rosterBounds.map(f => ({
      w: (f.width + 2 * f.height * Math.sin(THREE.MathUtils.degToRad(3.4))) * scale,
      l: f.length * scale,
    }));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion).setY(0).normalize();
    const lateral = rig.position.clone().sub(centre).setY(0).dot(left);
    const cosYaw = Math.abs(fwd.dot(new THREE.Vector3(-left.z, 0, left.x)));
    const sinYaw = Math.sqrt(Math.max(0, 1 - cosYaw * cosYaw));
    const footprintHalf = Math.max(...footprints.map(f => f.w / 2 * cosYaw + f.l / 2 * sinYaw));
    const extent = Math.abs(lateral) + footprintHalf;
    const maxOffsetExtent = g.comp.racingLineM + footprintHalf;
    return { t, yawDeg: THREE.MathUtils.radToDeg(Math.atan2(dir.x, -dir.z)),
      pitchDeg: THREE.MathUtils.radToDeg(Math.asin(-dir.y)),
      camera: cam.position.toArray(), quaternion: cam.quaternion.toArray(),
      carNdc: { minX, maxX, minY, maxY }, carWidthPctOfFrame: (maxX - minX) * 50,
      roadCoverage: fullScene ? road / cells : null, exposedEdgeRays: fullScene ? exposed : null,
      edgeSweepIncluded: fullScene, sceneRayGrid: [columns, rows], carLengthPctOfFrame,
      shadowBoxM: sc ? sc.right : null, outsideShadowFrac: groundHits ? outsideShadow / groundHits : null,
      roadOutsideShadowCells: roadOutsideShadow, skyFrac: sky / (48 * 27),
      borderMaxHitM: borderMaxDist, fogNear: fog?.near, fogFar: fog?.far,
      cameraFar: cam.far, cameraHeightM: cam.position.y,
      lateralM: lateral, worstFootprintExtentM: extent,
      roadEdgeGapM: curve.TRACK.halfWidth - extent,
      maxOffsetRoadEdgeGapM: curve.TRACK.halfWidth - maxOffsetExtent,
      gatePostGapM: curve.TRACK.halfWidth + curve.TRACK.curbWidth + 1 - 0.17 - extent,
      finishPostGapM: curve.TRACK.halfWidth + curve.TRACK.curbWidth + 0.72 - 0.17 - extent,
      correctionActive: !!g.aerial.correctionActive, snapCount: g.aerial.snapCount,
      hero: scale, shadowScale: g.scene.getObjectByName('contact-shadow')?.scale.x,
      railHolds: g.aerial.rail?.holds, unavailableHolds: g.aerial.rail?.unavailableHolds };
  }, rosterBounds, fullScene, leanLooks);

  const prior = process.env.GT3_RECHECK_POSES
    ? JSON.parse(await readFile(process.env.GT3_RECHECK_POSES, 'utf8'))[0] : null;
  if (prior) {
    assert.equal(prior.readiness.comp.look, comp);
    for (const k of ['distance', 'pitchDeg', 'fov', 'hero', 'halfWidth', 'racingLineM', 'curbLateralM']) {
      assert.equal(prior.readiness.comp[k], readiness.comp[k]);
    }
  }
  const out = { comp, cam: readiness.comp.cameraVariant, requestedCam: cam, url, readiness,
    points: [], gates: [], reversibility: [], motion: [], errors };
  // A completed prior run can retain unchanged frame/gate/wheel evidence while
  // correcting only the pose/resize harness. Caller must pin identical product source.
  if (prior) {
    out.points = prior.points; out.gates = prior.gates; out.motion = prior.motion;
    errors.push(...prior.errors);
    out.reusedEvidence = { path: process.env.GT3_RECHECK_POSES, scopes: ['points', 'gates', 'motion'] };
  }
  phase(`${key} loaded readyMs=${readyMs}`);
  const reviewLabels = comp === 'r3' ? ['start-straight', 'hairpin-apex', 'chicane-out']
    : ['start-straight', 'hairpin-entry', 'hairpin-apex'];
  for (const [label, t] of prior ? [] : leanLooks ? POINTS.filter(([label]) => reviewLabels.includes(label)) : POINTS) {
    await goTo(t); phase(`${key} point ${label}`);
    out.points.push({ label, ...(await measure()) });
    if (capture && (!looks || (comp === 'r3' ? ['start-straight', 'hairpin-apex', 'chicane-out'] : ['start-straight', 'hairpin-entry', 'hairpin-apex']).includes(label))) {
      await page.screenshot({ path: `${captureDir}/${key}_${label}_day.png` });
    }
  }
  const { thresholds, finish } = await page.evaluate(async () => {
    const m = await import('/src/scene/trackCurve.js');
    return { thresholds: m.CHECKPOINT_T, finish: m.FINISH_T };
  });
  // Gate clearances are camera-independent geometry: sample 4 gates + finish (all with GT3_ALL_GATES=1).
  const gateTs = leanLooks ? [thresholds[3], finish] : process.env.GT3_ALL_GATES === '1' ? [...thresholds, finish]
    : [thresholds[0], thresholds[3], thresholds[6], thresholds[8], finish];
  phase(`${key} gates`);
  for (const t of prior ? [] : gateTs) {
    await goTo(t, 450);
    const m = await measure(!leanLooks);
    if (capture && !looks && t === thresholds[0]) {
      await page.screenshot({ path: `${captureDir}/${key}_checkpoint1_day.png` });
    }
    out.gates.push({ t, roadEdgeGapM: m.roadEdgeGapM, gatePostGapM: m.gatePostGapM,
      finishPostGapM: m.finishPostGapM, carNdc: m.carNdc, exposedEdgeRays: m.exposedEdgeRays,
      edgeSweepIncluded: m.edgeSweepIncluded });
  }
  phase(`${key} reversibility`);
  // Reversibility: deterministic rail pose (sector) and settled pose from both sides.
  for (const t of [0.283, 0.352]) {
    const rail = await page.evaluate(async t => {
      const a = await import('/src/scene/aerialCamera.js');
      return [a.railPoseAt?.(t), a.railPoseAt?.(t)];
    }, t);
    await goTo(t - 0.02, 200); await goTo(t, 2500, true);
    const below = await measure(!leanLooks);
    await goTo(t + 0.02, 200); await goTo(t, 2500, true);
    const above = await measure(!leanLooks);
    out.reversibility.push({ t, railDeterministic: JSON.stringify(rail[0]) === JSON.stringify(rail[1]),
      progressFromBelow: below.t, progressFromAbove: above.t,
      settledPositionDiffM: Math.hypot(...below.camera.map((x, i) => x - above.camera[i])),
      settledQuaternionDiff: Math.hypot(...below.quaternion.map((x, i) => x - above.quaternion[i])) });
  }
  phase(`${key} motion`);
  // Motion through the hairpin and chicane, forward and back, real wheel input.
  await page.evaluate(() => {
    const g = window.__gt3;
    window.__w2 = { segment: null, frames: [] };
    let last = performance.now();
    (function record(now) {
      if (window.__w2.segment) {
        const rig = g.scene.getObjectByName('car-rig');
        const ndc = rig.position.clone().project(g.camera);
        const carDir = rig.position.clone().set(0, 0, -1).applyQuaternion(rig.quaternion);
        const camDir = g.camera.getWorldDirection(carDir.clone());
        window.__w2.frames.push({ segment: window.__w2.segment, dt: now - last, now,
          progress: g.probe().progress, camera: g.camera.position.toArray(),
          car: rig.position.toArray(), ndcX: ndc.x, ndcY: ndc.y,
          carYaw: Math.atan2(carDir.x, -carDir.z), cameraYaw: Math.atan2(camDir.x, -camDir.z),
          correction: !!g.aerial.correctionActive, snaps: g.aerial.snapCount });
      }
      last = now;
      requestAnimationFrame(record);
    })(performance.now());
  });
  const motionSpans = leanLooks
    ? [['fwd-curb-hairpin', 0.273, 30, 0.293], ['back-curb-hairpin', 0.293, -30, 0.273]]
    : [['fwd-hairpin-chicane', 0.25, 30, 0.385], ['back-chicane-hairpin', 0.385, -30, 0.25]];
  for (const [name, start, delta, stopAt] of prior ? [] : motionSpans) {
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
    const corners = Object.fromEntries([['hairpin', 0.263, 0.302], ['chicane', 0.328, 0.376]]
      .map(([corner, from, to]) => {
        const selected = frames.filter(f => f.progress >= from && f.progress <= to);
        let carPathM = 0, cameraPathM = 0, carHeadingSweepDeg = 0, cameraHeadingSweepDeg = 0;
        const sweep = (a, b) => Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b))) * 180 / Math.PI;
        for (let i = 1; i < selected.length; i++) {
          cameraPathM += dist(selected[i].camera, selected[i-1].camera);
          carPathM += dist(selected[i].car, selected[i-1].car);
          carHeadingSweepDeg += sweep(selected[i].carYaw, selected[i-1].carYaw);
          cameraHeadingSweepDeg += sweep(selected[i].cameraYaw, selected[i-1].cameraYaw);
        }
        return [corner, { frames: selected.length, cameraPathM, carPathM,
          cameraToCarPathLength: carPathM ? cameraPathM / carPathM : null,
          cameraHeadingSweepDeg, carHeadingSweepDeg }];
      }));
    const dts = frames.slice(1).map(f => f.dt);
    // Real-input smoothness from frame timestamps (indicative at ~30 fps and dominated by
    // the scroll law's own jitter), so the camera is always reported next to the CAR
    // measured the same way: the camera/car ratio isolates what the camera adds.
    // Reversals = frames where the camera path doubles back while the input is monotonic.
    const derive = key => {
      const vel = [];
      for (let i = 1; i < frames.length; i++) {
        const h = Math.max(1, frames[i].now - frames[i - 1].now) / 1000;
        vel.push({ h, v: [0, 1, 2].map(k => (frames[i][key][k] - frames[i - 1][key][k]) / h) });
      }
      const acc = [], jerk = [];
      for (let i = 1; i < vel.length; i++) {
        const h = (vel[i].h + vel[i - 1].h) / 2;
        acc.push({ h, a: [0, 1, 2].map(k => (vel[i].v[k] - vel[i - 1].v[k]) / h) });
      }
      for (let i = 1; i < acc.length; i++) {
        jerk.push(Math.hypot(...[0, 1, 2].map(k => (acc[i].a[k] - acc[i - 1].a[k]) / ((acc[i].h + acc[i - 1].h) / 2))));
      }
      let reversals = 0;
      for (let i = 1; i < frames.length - 1; i++) {
        const d0 = [0, 1, 2].map(k => frames[i][key][k] - frames[i - 1][key][k]);
        const d1 = [0, 1, 2].map(k => frames[i + 1][key][k] - frames[i][key][k]);
        const m0 = Math.hypot(...d0), m1 = Math.hypot(...d1);
        if (m0 > 0.05 && m1 > 0.05 && (d0[0] * d1[0] + d0[1] * d1[1] + d0[2] * d1[2]) / (m0 * m1) < -0.2) reversals++;
      }
      const speeds = vel.map(x => Math.hypot(...x.v)), accs = acc.map(x => Math.hypot(...x.a));
      return { peakSpeedMs: Math.max(0, ...speeds), p99AccMs2: percentile(accs, 0.99),
        p99JerkMs3: percentile(jerk, 0.99), reversals };
    };
    const smooth = { camera: derive('camera'), car: derive('car') };
    out.motion.push({ name, corners, frames: frames.length, smooth,
      cameraToCarTranslation: carTravel ? camTravel / carTravel : null,
      correctionActivePct: frames.length ? 100 * frames.filter(f => f.correction).length / frames.length : 0,
      ndcX: [Math.min(...frames.map(f => f.ndcX)), Math.max(...frames.map(f => f.ndcX))],
      ndcY: [Math.min(...frames.map(f => f.ndcY)), Math.max(...frames.map(f => f.ndcY))],
      snapsDuringMotion: frames.length ? frames.at(-1).snaps - frames[0].snaps : 0,
      maxProgressJump, frameMsP50: percentile(dts, 0.5), frameMsP95: percentile(dts, 0.95) });
  }
  phase(`${key} seam`);
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
  phase(`${key} captures`);
  if (capture && !looks) {
    // Chicane frame sequence (~3 s) and one Night still at the hairpin apex.
    if (seqComps.includes(comp)) {
      await goTo(0.325, 1200);
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel({ deltaY: 36 });
        await page.screenshot({ path: `${captureDir}/${key}_chicane-seq-${String(i).padStart(2, '0')}_day.jpg`,
          type: 'jpeg', quality: 82 });
        await wait(70);
      }
    }
    await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));
    await goTo(0.283, 900);
    await page.screenshot({ path: `${captureDir}/${key}_hairpin-apex_night.png` });
  }
  // Resize: rail solve cost (pure rebuild per aspect) and the real frame-time spike while
  // the viewport changes aspect (the normal debounced resize task prepares the rail).
  out.resize = await page.evaluate(async lean => {
    const rail = {};
    try {
      const comp = window.__gt3.comp;
      const solve = comp.camera === 'corridor'
        ? (await import('/src/scene/compositionRail.js')).buildCompositionRail
        : comp.camera === 'sector' ? (await import('/src/scene/aerialCamera.js')).buildSectorRail : null;
      if (solve) for (const [k, a] of (lean ? [['16:9', 16 / 9], ['4:3', 4 / 3]] : [['16:9', 16 / 9], ['16:10', 1.6], ['1.5', 1.5], ['4:3', 4 / 3], ['21:9', 21 / 9], ['9:16', 9 / 16]])) {
        const t0 = performance.now(); solve(a); rail[k] = +(performance.now() - t0).toFixed(1);
      }
    } catch (e) { rail.error = String(e); }
    return rail;
  }, leanLooks);
  await goTo(0.283, 600);
  out.resizeFrames = [];
  for (const [name, w, h] of [['to-4:3', 1280, 960], ['to-16:9', 1600, 900]]) {
    await page.evaluate(s => { window.__w2.frames.length = 0; window.__w2.segment = s; }, name);
    await page.setViewport({ width: w, height: h });
    await wait(2500);
    const r = await page.evaluate(() => {
      const f = window.__w2.frames; window.__w2.segment = null;
      return { dts: f.map(x => x.dt), aspect: window.__gt3.camera.aspect, rail: window.__gt3.aerial.rail
        ? { aspect: window.__gt3.aerial.rail.aspect, holdState: window.__gt3.aerial.rail.holdState,
          unavailableHolds: window.__gt3.aerial.rail.unavailableHolds } : null };
    });
    out.resizeFrames.push({ name, frames: r.dts.length, maxFrameMs: Math.max(0, ...r.dts),
      p50FrameMs: percentile(r.dts, 0.5), aspect: r.aspect, rail: r.rail });
    if (name === 'to-4:3' && capture && comp === 'b') {
      await page.screenshot({ path: `${captureDir}/${key}_hairpin-apex-4x3_day.jpg`, type: 'jpeg', quality: 82 });
    }
  }
  out.routeHero = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { railPoseAt } = await import('/src/scene/aerialCamera.js');
    const { pathPointAt, pathTangentAt } = await import('/src/scene/racingLine.js');
    const cam = window.__gt3.camera.clone();
    const values = [];
    for (let i = 0; i <= 500; i++) {
      const t = i / 500, pose = railPoseAt(t);
      cam.position.fromArray(pose.position); cam.quaternion.fromArray(pose.quaternion); cam.updateMatrixWorld(true);
      const p = pathPointAt(t), fwd = pathTangentAt(t).setY(0).normalize();
      const half = 2.3 * window.__gt3.comp.hero;
      const nose = p.clone().addScaledVector(fwd, half).project(cam);
      const tail = p.clone().addScaledVector(fwd, -half).project(cam);
      values.push(50 * Math.hypot(nose.x - tail.x, (nose.y - tail.y) / cam.aspect));
    }
    return { samples: values.length, metric: '4.6m nose-to-tail projected length / frame width',
      minPct: Math.min(...values), maxPct: Math.max(...values) };
  });
  phase(`${key} done`);
  await page.close();
  return out;
}

function assertLookResult(result, expectedLook = result.comp) {
  const comp = result.readiness.comp.look;
  assert.equal(result.readiness.status, 'ready');
  assert.equal(comp, expectedLook);
  assert.ok(['r1', 'r2', 'r3'].includes(comp));
  assert.equal(result.readiness.comp.railRuntime.fallback, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.resize.error, undefined);
  assert.ok(result.seamPositionDiffM < 1e-9);
  assert.ok(result.points.length >= 3);
  assert.ok(result.gates.length >= 2);
  assert.equal(result.reversibility.length, 2);
  assert.equal(result.motion.length, 2);
  assert.equal(result.routeHero.samples, 501);
  assert.ok(Number.isFinite(result.routeHero.minPct) && result.routeHero.minPct > 0);
  assert.ok(result.routeHero.maxPct >= result.routeHero.minPct);
  assert.equal(result.resizeFrames.length, 2);
  for (const r of result.resizeFrames) {
    assert.ok(Math.abs(r.rail.aspect - r.aspect) < 1e-9);
    assert.equal(r.rail.holdState, 'none');
    assert.equal(r.rail.unavailableHolds.length, 0);
  }
  for (const p of result.points) {
    assert.equal(p.exposedEdgeRays, 0);
    assert.ok(Object.values(p.carNdc).every(v => Math.abs(v) < 0.85));
    assert.ok(Math.abs(p.yawDeg - result.readiness.comp.yawDeg) < 1e-8);
    assert.ok(Math.abs(p.pitchDeg - result.readiness.comp.pitchDeg) < 1e-8);
  }
  // Each approach stops within 1e-7 progress: allow 2 mm of route/camera
  // sampling difference, rather than demanding micron equality at different t.
  for (const r of result.reversibility) {
    assert.ok(r.railDeterministic);
    assert.ok(Math.abs(r.progressFromBelow - r.t) < 1e-7);
    assert.ok(Math.abs(r.progressFromAbove - r.t) < 1e-7);
    assert.ok(r.settledPositionDiffM < 0.002);
    assert.ok(r.settledQuaternionDiff < 1e-9);
  }
  for (const m of result.motion) {
    assert.ok(m.frames > 0);
    assert.equal(m.snapsDuringMotion, 0);
    assert.equal(m.correctionActivePct, 0);
  }
  console.log('PASS', comp, 'visual composition assertions');
}

// Re-check completed artifacts after a harness-only assertion correction, without
// rerunning unaffected GPU evidence. This mode never launches a browser.
if (process.env.GT3_READ_RESULT) {
  const saved = JSON.parse(await readFile(process.env.GT3_READ_RESULT, 'utf8'));
  assert.ok(saved.length > 0);
  for (const result of saved) assertLookResult(result);
  process.exit(0);
}

await mkdir(root, { recursive: true });
if (capture) await mkdir(captureDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=${root}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
process.once('SIGTERM', async () => { await browser.close(); process.exit(143); });
const results = [];
try {
  for (const comp of comps) for (const cam of cams) {
    const result = await runCandidate(browser, comp, cam);
    results.push(result);
    if (looks) assertLookResult(result, comp);
    const yaws = result.points.map(p => p.yawDeg), pitches = result.points.map(p => p.pitchDeg);
    console.log('CANDIDATE', comp, cam, JSON.stringify({ readiness: result.readiness.status,
      yawSpreadDeg: Math.max(...yaws) - Math.min(...yaws),
      pitchSpreadDeg: Math.max(...pitches) - Math.min(...pitches),
      roadCoverage: result.points.map(p => +p.roadCoverage.toFixed(3)),
      carWidthPctOfFrame: result.points.map(p => +p.carWidthPctOfFrame.toFixed(2)),
      carLengthPctOfFrame: result.points.map(p => +p.carLengthPctOfFrame.toFixed(2)),
      outsideShadowFrac: result.points.map(p => p.outsideShadowFrac == null ? null : +p.outsideShadowFrac.toFixed(3)),
      roadOutsideShadowCells: result.points.map(p => p.roadOutsideShadowCells),
      skyFrac: result.points.map(p => +p.skyFrac.toFixed(3)),
      borderMaxHitM: result.points.map(p => Math.round(p.borderMaxHitM)),
      fog: [result.points[0].fogNear, result.points[0].fogFar, result.points[0].cameraFar],
      resize: result.resize, resizeFrames: result.resizeFrames, readyMs: result.readiness.readyMs,
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
