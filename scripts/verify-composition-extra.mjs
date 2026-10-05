/**
 * W2 composition browser checks beyond the matrix (W6B checks 2-5). Same host rules as
 * verify-composition.mjs: run the preflight first, one browser at a time, external Vite.
 *   GT3_URL=http://127.0.0.1:5192 GT3_EXTRA=aspects,resize,fallback,joins node scripts/verify-composition-extra.mjs
 * Env: GT3_EXTRA (comma list, default all), GT3_EXTRA_COMP (default b), GT3_EXTRA_CAMS
 *      (default glide,hold,wide,soft; resize uses GT3_RESIZE_CAMS=wide,hold,soft),
 *      GT3_CAPTURE_DIR, GT3_PROGRESS (JSONL; one line per finished result, existing
 *      keys are skipped so an interrupted run resumes), GT3_WORK_DIR.
 *   aspects  16:9, 16:10, 1.5, 4:3 per camera: all-ten projected bounds at representative
 *            route points, runtime hold state, dev label text, hairpin capture, plus
 *            instant-seek determinism and a dense seek-sweep continuity test (at 16:9).
 *   resize   viewport sweep across wide's ~1.616 and hold's ~1.370 thresholds and back:
 *            runtime state, rebuild ms, longest frame, exact pose restoration.
 *   fallback ?comp=b&cam=soft&dist=30 (dev-only infeasible tube) then a valid reload.
 *   joins    top-corner / shadow-window / gate captures for wide and soft; Night
 *            chicane sequence for soft.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, appendFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
import { CARS } from '../src/data/cars.js';
import { glbFootprint } from './lib/glb-footprint.mjs';

const modelDir = process.env.GT3_MODELS || new URL('../public/models/tour/', import.meta.url).pathname;
const rosterBounds = await Promise.all(CARS.map(async car =>
  ({ id: car.id, ...(await glbFootprint(modelDir + car.modelFile)) })));
const base = (process.env.GT3_URL || 'http://127.0.0.1:5192').replace(/\/$/, '');
const comp = process.env.GT3_EXTRA_COMP || 'b';
const checks = (process.env.GT3_EXTRA || 'aspects,resize,fallback,joins').split(',').filter(Boolean);
const cams = (process.env.GT3_EXTRA_CAMS || 'glide,hold,wide,soft').split(',').filter(Boolean);
const resizeCams = (process.env.GT3_RESIZE_CAMS || 'wide,hold,soft').split(',').filter(Boolean);
const captureDir = process.env.GT3_CAPTURE_DIR || '/Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w2';
const progressFile = process.env.GT3_PROGRESS || `${captureDir}/w6b-progress.jsonl`;
const root = process.env.GT3_WORK_DIR || '/tmp/gt3-w2';
await mkdir(root, { recursive: true });
await mkdir(captureDir, { recursive: true });
const t00 = Date.now();
const phase = name => console.error(`[${((Date.now() - t00) / 1000).toFixed(0)}s] ${name}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const done = new Set();
try {
  for (const line of (await readFile(progressFile, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.extraKey) done.add(o.extraKey); } catch { /* partial line */ }
  }
} catch { /* no progress file yet */ }
const save = async (extraKey, payload) => {
  await appendFile(progressFile, JSON.stringify({ extraKey, ...payload }) + '\n');
  console.log('RESULT', extraKey);
};

const POINTS = [['start-straight', 0.02], ['hairpin-entry', 0.265], ['hairpin-apex', 0.283],
  ['hairpin-exit', 0.300], ['chicane-in', 0.335], ['chicane-mid', 0.352],
  ['chicane-out', 0.370], ['turn9', 0.465]];
const ASPECTS = [['16:9', 1600, 900], ['16:10', 1440, 900], ['1.5', 1350, 900], ['4:3', 1200, 900]];

async function openPage(browser, url, viewport) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({ type: 'pageerror', text: e.message }));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) errors.push({ type: m.type(), text: m.text().slice(0, 300) }); });
  await page.setViewport(viewport);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (process.env.GT3_DEBUG_PAGE === '1') {
    page.on('framenavigated', f => { if (f === page.mainFrame()) console.error('NAVIGATED', f.url()); });
    page.on('error', e => console.error('PAGE-CRASH', e.message));
  }
  const pending = new Map();
  page.on('request', r => pending.set(r, Date.now()));
  page.on('requestfinished', r => pending.delete(r));
  page.on('requestfailed', r => pending.delete(r));
  try {
    await page.waitForFunction(() => window.__gt3?.readiness?.status
      && window.__gt3.readiness.status !== 'loading', { timeout: 240000 });
  } catch (error) {
    // A load that never leaves 'loading' is a finding, not data: record what the page says.
    const state = await page.evaluate(() => ({ href: location.href, readyState: document.readyState,
      gt3: !!window.__gt3, readiness: window.__gt3?.readiness ? { ...window.__gt3.readiness } : null,
      canvases: document.querySelectorAll('canvas').length,
      marks: performance.getEntriesByType('mark').map(m => `${m.name}@${m.startTime.toFixed(0)}`) }))
      .catch(e => ({ evalError: String(e) }));
    state.pendingRequests = [...pending].map(([r, t]) => `${r.url().slice(0, 120)} (${Date.now() - t} ms)`).slice(0, 12);
    console.error('LOAD-TIMEOUT', JSON.stringify(state), JSON.stringify(errors));
    throw error;
  }
  const readyMs = Date.now() - t0;
  await page.mouse.wheel({ deltaY: 240 });
  await wait(1200);
  // Frame recorder for longest-frame measurements.
  await page.evaluate(() => {
    window.__x = { rec: false, dts: [], poses: [] };
    let last = performance.now();
    (function record(now) {
      if (window.__x.rec) window.__x.dts.push(now - last);
      last = now;
      requestAnimationFrame(record);
    })(performance.now());
  });
  return { page, errors, readyMs };
}

const seek = async (page, t, settleMs = 500) => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const p = await page.evaluate(async target => {
      (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant: true });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return window.__gt3.probe().progress;
    }, t);
    if (Math.abs(p - t) < 0.001) { await wait(settleMs); return p; }
    await wait(100);
  }
  throw new Error(`seek ${t} did not settle`);
};

const pose = page => page.evaluate(() => {
  const g = window.__gt3, c = g.camera;
  const rig = g.scene.getObjectByName('car-rig');
  return { t: g.probe().progress, p: c.position.toArray(), q: c.quaternion.toArray(), fov: c.fov,
    aspect: c.aspect, car: rig.position.toArray(), snaps: g.aerial.snapCount };
});
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

const runtime = page => page.evaluate(() => {
  const r = window.__gt3.aerial.rail;
  if (!r) return null;
  const { holds, ...rest } = r;
  return { ...JSON.parse(JSON.stringify(rest)), holdsCount: holds?.length ?? null,
    holdsSummary: JSON.parse(JSON.stringify(holds ?? null)),
    label: document.querySelector('.dev-comp-label')?.textContent ?? null,
    cameraAspect: window.__gt3.camera.aspect, fov: window.__gt3.camera.fov };
});

/** Resize and wait until the debounced task has applied the new aspect to camera + rail. */
async function setAspect(page, w, h) {
  await page.evaluate(() => { window.__x.dts.length = 0; window.__x.rec = true; });
  const t0 = Date.now();
  await page.setViewport({ width: w, height: h });
  let applied = false;
  while (Date.now() - t0 < 30000) {
    applied = await page.evaluate(want => {
      const g = window.__gt3;
      return Math.abs(g.camera.aspect - want) < 1e-6
        && (!g.aerial.rail || Math.abs(g.aerial.rail.requestedAspect - want) < 1e-6);
    }, w / h);
    if (applied) break;
    await wait(20);
  }
  const appliedMs = Date.now() - t0;
  await wait(1200);
  const dts = await page.evaluate(() => { window.__x.rec = false; return window.__x.dts.slice(); });
  return { applied, appliedMs, frames: dts.length, longestFrameMs: Math.max(0, ...dts),
    p50FrameMs: dts.length ? [...dts].sort((a, b) => a - b)[Math.floor(dts.length / 2)] : null };
}

// Projected bounds of all ten roster boxes at the rig's real pose (actual racing line).
const allTen = (page, rb) => page.evaluate(async rosterBounds => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const g = window.__gt3, cam = g.camera;
  const mount = g.scene.getObjectByName('car-mount'), rig = g.scene.getObjectByName('car-rig');
  mount.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(mount, true);
  const scale = mount.scale.x, s = Math.sin(THREE.MathUtils.degToRad(3.4));
  let maxX = 0, maxY = 0, worstId = null;
  const v = new THREE.Vector3();
  for (const f of rosterBounds) {
    const w = (f.width + 2 * f.height * s) * scale, l = f.length * scale, h = f.height * scale;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? w / 2 : -w / 2, 0, i & 4 ? l / 2 : -l / 2).applyQuaternion(rig.quaternion);
      v.x += rig.position.x; v.z += rig.position.z; v.y = box.min.y + (i & 2 ? h : 0);
      v.project(cam);
      if (Math.max(Math.abs(v.x), Math.abs(v.y)) > Math.max(maxX, maxY)) worstId = f.id;
      maxX = Math.max(maxX, Math.abs(v.x)); maxY = Math.max(maxY, Math.abs(v.y));
    }
  }
  const half = 2.3 * scale;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion).setY(0).normalize();
  const nose = rig.position.clone().addScaledVector(fwd, half).project(cam);
  const tail = rig.position.clone().addScaledVector(fwd, -half).project(cam);
  const heroPct = 100 * Math.hypot((nose.x - tail.x) / 2, (nose.y - tail.y) / 2 / cam.aspect);
  return { maxAbsNdcX: maxX, maxAbsNdcY: maxY, worstId, inViewport: maxX <= 1 && maxY <= 1, heroLengthPctFrameWidth: heroPct };
}, rb);

async function checkAspects(browser, cam) {
  const key = `aspects/${comp}/${cam}`;
  if (done.has(key)) { phase(`skip ${key}`); return; }
  const url = `${base}/?comp=${comp}&cam=${cam}&gate=quiet`;
  const { page, errors, readyMs } = await openPage(browser, url, { width: 1600, height: 900 });
  phase(`${key} loaded ${readyMs} ms`);
  const out = { check: 'aspects', comp, cam, readyMs, seek: {}, aspects: [] };
  // Instant-seek determinism and dense-sweep continuity at 16:9.
  const targets = [0.02, 0.265, 0.283, 0.3, 0.335, 0.352, 0.38, 0.465, 0.75];
  const det = [];
  for (const t of targets) {
    await seek(page, Math.max(0, t - 0.1), 150); const before = await pose(page);
    await seek(page, t, 350); const fromBelow = await pose(page);
    await seek(page, Math.min(1, t + 0.1), 150);
    await seek(page, t, 350); const fromAbove = await pose(page);
    det.push({ t, posDiffM: dist(fromBelow.p, fromAbove.p), quatDiff: dist(fromBelow.q, fromAbove.q),
      snapsDeltaOnSeek: fromBelow.snaps - before.snaps });
  }
  out.seek.determinism = det;
  const sweep = [];
  for (let t = 0.24; t <= 0.4001; t += 0.001) {
    const p = await page.evaluate(async target => {
      (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant: true });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = window.__gt3.camera, rig = window.__gt3.scene.getObjectByName('car-rig');
      return { t: window.__gt3.probe().progress, p: c.position.toArray(), car: rig.position.toArray() };
    }, t);
    sweep.push(p);
  }
  let maxCamStep = 0, maxCarStep = 0, maxRatio = 0, atT = null;
  const steps = [];
  for (let i = 1; i < sweep.length; i++) {
    const cs = dist(sweep[i].p, sweep[i - 1].p), rs = dist(sweep[i].car, sweep[i - 1].car);
    steps.push(cs);
    if (cs > maxCamStep) { maxCamStep = cs; atT = sweep[i].t; }
    maxCarStep = Math.max(maxCarStep, rs);
    if (rs > 0.05) maxRatio = Math.max(maxRatio, cs / rs);
  }
  // Largest step compared to the median step (a discontinuity would be many times it).
  const med = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  out.seek.sweep = { samples: sweep.length, maxCamStepM: maxCamStep, atT, maxCarStepM: maxCarStep,
    maxCamOverCarStep: maxRatio, medianCamStepM: med, maxOverMedian: med ? maxCamStep / med : null };
  phase(`${key} seek done`);
  for (const [name, w, h] of ASPECTS) {
    const resize = await setAspect(page, w, h);
    const entry = { aspect: name, w, h, resize, runtime: await runtime(page), points: [] };
    for (const [label, t] of POINTS) {
      await seek(page, t, 450);
      const m = await allTen(page, rosterBounds);
      entry.points.push({ label, t, ...m });
      if (label === 'hairpin-apex' || label === 'chicane-mid') {
        entry[`runtimeAt_${label}`] = await runtime(page);
        if (label === 'hairpin-apex') {
          await page.screenshot({ path: `${captureDir}/${comp}-${cam}_asp-${name.replace(':', 'x')}_hairpin-apex_day.jpg`,
            type: 'jpeg', quality: 80 });
        }
      }
    }
    entry.worstAbsNdcX = Math.max(...entry.points.map(p => p.maxAbsNdcX));
    entry.worstAbsNdcY = Math.max(...entry.points.map(p => p.maxAbsNdcY));
    entry.allInViewport = entry.points.every(p => p.inViewport);
    out.aspects.push(entry);
    phase(`${key} ${name} ${entry.runtime?.holdState} worst ${entry.worstAbsNdcX.toFixed(3)}/${entry.worstAbsNdcY.toFixed(3)}`);
  }
  out.errors = errors;
  await page.close();
  await save(key, out);
}

async function checkResize(browser, cam) {
  const key = `resize/${comp}/${cam}`;
  if (done.has(key)) { phase(`skip ${key}`); return; }
  const url = `${base}/?comp=${comp}&cam=${cam}&gate=quiet`;
  const { page, errors, readyMs } = await openPage(browser, url, { width: 1600, height: 900 });
  phase(`${key} loaded ${readyMs} ms`);
  const sweepW = [1600, 1550, 1480, 1460, 1450, 1400, 1350, 1250, 1240, 1220, 1200, 1350, 1450, 1460, 1600];
  const out = { check: 'resize', comp, cam, readyMs, steps: [], restoration: [] };
  const firstSeen = new Map();
  await seek(page, 0.283, 800);
  for (const w of sweepW) {
    const aspect = w / 900;
    const resize = await setAspect(page, w, 900);
    const rt = await runtime(page);
    await seek(page, 0.283, 500);
    const hairpin = await pose(page);
    await seek(page, 0.352, 500);
    const chicane = await pose(page);
    await seek(page, 0.283, 300);
    const step = { w, aspect, resize, holdState: rt?.holdState, unavailableHolds: rt?.unavailableHolds,
      cacheHit: rt?.cacheHit, attemptMs: rt?.attemptMs, buildMs: rt?.buildMs, buildAttempts: rt?.buildAttempts,
      fallback: rt?.fallback, error: rt?.error, label: rt?.label,
      hairpin: { p: hairpin.p, q: hairpin.q, fov: hairpin.fov }, chicane: { p: chicane.p, q: chicane.q, fov: chicane.fov } };
    const prior = firstSeen.get(w);
    if (prior) {
      out.restoration.push({ w, aspect, hairpinPosDiffM: dist(prior.hairpin.p, step.hairpin.p),
        hairpinQuatDiff: dist(prior.hairpin.q, step.hairpin.q), chicanePosDiffM: dist(prior.chicane.p, step.chicane.p),
        chicaneQuatDiff: dist(prior.chicane.q, step.chicane.q), cacheHit: step.cacheHit });
    } else firstSeen.set(w, step);
    out.steps.push(step);
    phase(`${key} w=${w} a=${aspect.toFixed(3)} ${step.holdState} attempt ${step.attemptMs?.toFixed(1)} ms longest ${resize.longestFrameMs.toFixed(0)} ms`);
  }
  out.errors = errors;
  await page.close();
  await save(key, out);
}

async function checkFallback(browser) {
  const key = `fallback/${comp}/soft-dist30`;
  if (done.has(key)) { phase(`skip ${key}`); return; }
  const out = { check: 'fallback', comp };
  const bad = await openPage(browser, `${base}/?comp=${comp}&cam=soft&dist=30&gate=quiet`, { width: 1600, height: 900 });
  out.badReadyMs = bad.readyMs;
  out.runtimeAtLoad = await runtime(bad.page);
  out.readiness = await bad.page.evaluate(() => ({ status: window.__gt3.readiness.status, reasons: window.__gt3.readiness.reasons }));
  const frames = await bad.page.evaluate(async () => {
    const g = window.__gt3;
    const drive = await import('/src/scroll/scrollDrive.js');
    const poses = [];
    let finite = true;
    for (let i = 0; i < 240; i++) {
      if (i % 20 === 0) drive.seekTo((i / 240) * 0.9, { instant: true });
      await new Promise(r => requestAnimationFrame(r));
      const c = g.camera;
      const v = [...c.position.toArray(), ...c.quaternion.toArray(), c.fov];
      if (!v.every(Number.isFinite)) finite = false;
      if (i % 40 === 0) poses.push(c.position.toArray());
    }
    return { finite, frames: 240, samplePoses: poses };
  });
  out.frames = frames;
  // A second aspect while the fallback is active must not retry per frame either.
  out.resizeWhileFallback = await setAspect(bad.page, 1350, 900);
  out.runtimeAfterResize = await runtime(bad.page);
  out.errorsBad = bad.errors;
  await bad.page.close();
  phase(`${key} bad done: fallback=${out.runtimeAtLoad?.fallback} attempts=${out.runtimeAtLoad?.buildAttempts} errors=${bad.errors.length}`);
  const good = await openPage(browser, `${base}/?comp=${comp}&cam=soft&gate=quiet`, { width: 1600, height: 900 });
  out.recoveryRuntime = await runtime(good.page);
  out.recoveryErrors = good.errors;
  await good.page.close();
  await save(key, out);
}

async function checkJoins(browser, cam) {
  const key = `joins/${comp}/${cam}`;
  if (done.has(key)) { phase(`skip ${key}`); return; }
  const url = `${base}/?comp=${comp}&cam=${cam}&gate=quiet`;
  const { page, errors, readyMs } = await openPage(browser, url, { width: 1600, height: 900 });
  phase(`${key} loaded ${readyMs} ms`);
  const out = { check: 'joins', comp, cam, readyMs, points: [], captures: [] };
  const joinMeasure = () => page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const g = window.__gt3, cam = g.camera;
    const rig = g.scene.getObjectByName('car-rig');
    const sun = g.scene.children.find(o => o.isDirectionalLight && o.castShadow);
    const sc = sun?.shadow.camera;
    if (sc) sc.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const lp = new THREE.Vector3(), hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -rig.position.y);
    let ground = 0, outside = 0, sky = 0, borderMax = 0, topCornerMax = 0, topCornerOutside = 0, topCornerN = 0;
    for (let iy = 0; iy < 27; iy++) for (let ix = 0; ix < 48; ix++) {
      ray.setFromCamera({ x: (ix + 0.5) / 24 - 1, y: (iy + 0.5) / 13.5 - 1 }, cam);
      if (!ray.ray.intersectPlane(plane, hit)) { sky++; continue; }
      const d = hit.distanceTo(cam.position);
      if (ix === 0 || iy === 0 || ix === 47 || iy === 26) borderMax = Math.max(borderMax, d);
      ground++;
      let out = false;
      if (sc) { lp.copy(hit).applyMatrix4(sc.matrixWorldInverse); out = Math.abs(lp.x) > sc.right || Math.abs(lp.y) > sc.top; if (out) outside++; }
      if (iy >= 22 && (ix < 8 || ix >= 40)) { topCornerN++; topCornerMax = Math.max(topCornerMax, d); if (out) topCornerOutside++; }
    }
    const fog = g.scene.fog;
    const fogFactor = d => (fog && fog.far > fog.near) ? Math.min(1, Math.max(0, (d - fog.near) / (fog.far - fog.near))) : null;
    return { shadowBoxM: sc ? sc.right : null, outsideShadowFrac: ground ? outside / ground : null,
      skyFrac: sky / (48 * 27), borderMaxHitM: borderMax, borderFogFactor: fogFactor(borderMax),
      topCornerMaxHitM: topCornerMax, topCornerFogFactor: fogFactor(topCornerMax),
      topCornerOutsideShadowFrac: topCornerN ? topCornerOutside / topCornerN : null,
      fogNear: fog?.near, fogFar: fog?.far, cameraFar: cam.far, camHeightM: cam.position.y };
  });
  // Crops are cut from a full-frame capture with sips (macOS): a puppeteer `clip` with `scale`
  // re-emulates the viewport and produced an unrepresentative frame (different layout, smear).
  const shot = async (name, clip) => {
    const file = `${captureDir}/${name}.jpg`;
    try {
      if (!clip) await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
      else {
        const full = `${file}.full.jpg`;
        await page.screenshot({ path: full, type: 'jpeg', quality: 90 });
        await execFileP('sips', ['-c', String(clip.height), String(clip.width), '--cropOffset', String(clip.y), String(clip.x), full, '--out', full]);
        await execFileP('sips', ['-z', String(clip.height * 2), String(clip.width * 2), full, '--out', file]);
        await unlink(full);
      }
      out.captures.push(file);
    } catch (error) {
      // One stalled capture (host contention) must not discard the measured data.
      (out.captureErrors ??= []).push({ name, error: String(error).slice(0, 160) });
    }
  };
  const theme = async mode => page.evaluate(async m => (await import('/src/scene/theme.js')).applyTheme(m, { instant: true }), mode);
  for (const [label, t] of [['hairpin-apex', 0.283], ['chicane-mid', 0.352], ['turn9', 0.465]]) {
    await seek(page, t, 1200);
    out.points.push({ label, t, ...(await joinMeasure()) });
    const base0 = `${comp}-${cam}_join-${label}_day`;
    await shot(base0);
    await shot(`${base0}_topleft`, { x: 0, y: 0, width: 480, height: 270, scale: 2 });
    await shot(`${base0}_topright`, { x: 1120, y: 0, width: 480, height: 270, scale: 2 });
  }
  // Gate / contact shadow at checkpoint 1: wide frame and a 2x crop around the car.
  const cp = await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_T[0]);
  await seek(page, cp, 1500);
  const car = await page.evaluate(() => {
    const g = window.__gt3, rig = g.scene.getObjectByName('car-rig');
    const v = rig.position.clone().project(g.camera);
    const shadow = g.scene.getObjectByName('contact-shadow');
    return { px: (v.x + 1) / 2 * innerWidth, py: (1 - v.y) / 2 * innerHeight, shadowScale: shadow?.scale.x ?? null,
      shadowVisible: shadow?.visible ?? null };
  });
  out.gate = { t: cp, ...car };
  const cx = Math.round(Math.min(Math.max(car.px - 200, 0), 1200)), cy = Math.round(Math.min(Math.max(car.py - 150, 0), 600));
  await shot(`${comp}-${cam}_gate-checkpoint1_day`);
  await shot(`${comp}-${cam}_gate-checkpoint1-crop_day`, { x: cx, y: cy, width: 400, height: 300, scale: 2 });
  if (cam === 'soft') {
    // Night: chicane sequence (~3 s) and the same gate crop.
    await theme('night');
    await shot(`${comp}-${cam}_gate-checkpoint1-crop_night`, { x: cx, y: cy, width: 400, height: 300, scale: 2 });
    await seek(page, 0.325, 1200);
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel({ deltaY: 36 });
      await page.screenshot({ path: `${captureDir}/${comp}-${cam}_chicane-seq-night-${String(i).padStart(2, '0')}.jpg`,
        type: 'jpeg', quality: 82 });
      await wait(70);
    }
    out.nightSequence = 10;
    await seek(page, 0.283, 1200);
    out.nightHairpin = await joinMeasure();
    await shot(`${comp}-${cam}_join-hairpin-apex_night_topleft`, { x: 0, y: 0, width: 480, height: 270, scale: 2 });
    await shot(`${comp}-${cam}_join-hairpin-apex_night_topright`, { x: 1120, y: 0, width: 480, height: 270, scale: 2 });
  }
  out.errors = errors;
  await page.close();
  await save(key, out);
}

async function checkSweep(browser, cam) {
  const key = `sweep/${comp}/${cam}`;
  if (done.has(key)) { phase(`skip ${key}`); return; }
  const url = `${base}/?comp=${comp}&cam=${cam}&gate=quiet`;
  const { page, errors, readyMs } = await openPage(browser, url, { width: 1600, height: 900 });
  const samples = [];
  for (let t = 0.24; t <= 0.4001; t += 0.0005) {
    samples.push(await page.evaluate(async target => {
      (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant: true });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const g = window.__gt3, c = g.camera, rig = g.scene.getObjectByName('car-rig');
      return { t: g.probe().progress, p: c.position.toArray(), q: c.quaternion.toArray(), car: rig.position.toArray() };
    }, t));
  }
  const rows = [];
  for (let i = 1; i < samples.length; i++) {
    rows.push({ t: samples[i].t, cam: dist(samples[i].p, samples[i - 1].p), car: dist(samples[i].car, samples[i - 1].car),
      quat: dist(samples[i].q, samples[i - 1].q) });
  }
  const top = [...rows].sort((a, b) => b.cam - a.cam).slice(0, 6).map(r => ({ t: +r.t.toFixed(4), camM: +r.cam.toFixed(2), carM: +r.car.toFixed(2) }));
  let maxDelta = 0, atT = null;
  for (let i = 1; i < rows.length; i++) {
    const d = Math.abs(rows[i].cam - rows[i - 1].cam);
    if (d > maxDelta) { maxDelta = d; atT = rows[i].t; }
  }
  const maxQuatStep = Math.max(...rows.map(r => r.quat));
  {
    await save(key, { check: 'sweep', comp, cam, readyMs, stepProgress: 0.0005, samples: samples.length,
      topCameraSteps: top, maxStepToStepChangeM: +maxDelta.toFixed(2), maxStepToStepChangeAtT: atT,
      maxQuatStep: +maxQuatStep.toFixed(5), maxCarStepM: +Math.max(...rows.map(r => r.car)).toFixed(2),
      cameraStepsM: rows.map(r => +r.cam.toFixed(2)), errors });
  }
  await page.close();
}

const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=${root}/chrome-extra-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
try {
  if (checks.includes('aspects')) for (const cam of cams) await checkAspects(browser, cam);
  if (checks.includes('resize')) for (const cam of resizeCams) await checkResize(browser, cam);
  if (checks.includes('sweep')) for (const cam of cams) await checkSweep(browser, cam);
  if (checks.includes('fallback')) await checkFallback(browser);
  if (checks.includes('joins')) for (const cam of ['wide', 'soft'].filter(c => cams.includes(c))) await checkJoins(browser, cam);
} finally {
  await browser.close();
}
