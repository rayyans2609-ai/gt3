/**
 * W2 pure-node numeric checks (no Vite, no browser, no GPU). One candidate per process:
 *   node scripts/check-composition-math.mjs [base|a|b|c] [aspect=1.7778]
 * Reports racing-line amplitude/rate/clearance for all ten roster footprints (static
 * GLB accessor bounds), gate/finish post clearance, settled-rail framing (car bounds in
 * NDC), seam/reversibility of the deterministic pose, and the hairpin/chicane corner test.
 */
const comp = process.argv[2] || 'base';
const aspect = Number(process.argv[3] || 16 / 9);
globalThis.location = { search: `?comp=${comp}`, hash: '' };
globalThis.window = { __gt3: {} };

const THREE = await import('three');
const { COMP } = await import('../src/scene/composition.js');
const curveModule = await import('../src/scene/trackCurve.js');
const { TRACK, TRACK_LENGTH, CHECKPOINT_T, FINISH_T, tangentAt } = curveModule;
const line = await import('../src/scene/racingLine.js');
const aerialModule = await import('../src/scene/aerialCamera.js');
const { state } = await import('../src/core/state.js');
const { CARS } = await import('../src/data/cars.js');
const { glbFootprint } = await import('./lib/glb-footprint.mjs');

const modelDir = process.env.GT3_MODELS || new URL('../public/models/tour/', import.meta.url).pathname;
const footprints = await Promise.all(CARS.map(async car =>
  ({ id: car.id, ...(await glbFootprint(modelDir + car.modelFile)) })));
const hero = COMP.hero;
const round = (v, d = 3) => Number(v.toFixed(d));

// ---- racing line -----------------------------------------------------------
const N = 4096;
const p = new THREE.Vector3(), q = new THREE.Vector3(), tan = new THREE.Vector3();
const ptan = new THREE.Vector3(), fd = new THREE.Vector3();
let maxLateral = 0, maxRate = 0, maxYawDeg = 0, maxHeadingErrDeg = 0;
const perModelMinEdgeGap = Object.fromEntries(footprints.map(f => [f.id, Infinity]));
const ds = TRACK_LENGTH / N;
for (let i = 0; i < N; i++) {
  const t = i / N;
  const lateral = line.lateralAt(t);
  const rate = Math.abs(line.lateralAt(t + 1 / N) - line.lateralAt(t - 1 / N)) / (2 * ds);
  maxLateral = Math.max(maxLateral, Math.abs(lateral));
  maxRate = Math.max(maxRate, rate);
  tangentAt(t, tan).setY(0).normalize();
  line.pathTangentAt(t, ptan);
  const yaw = Math.acos(Math.min(1, ptan.clone().setY(0).normalize().dot(tan)));
  maxYawDeg = Math.max(maxYawDeg, THREE.MathUtils.radToDeg(yaw));
  // Heading the rig uses vs the path's own finite-difference tangent (crab check).
  line.pathPointAt(Math.max(0, t - 0.1 / TRACK_LENGTH), p);
  line.pathPointAt(Math.min(1, t + 0.1 / TRACK_LENGTH), q);
  fd.subVectors(q, p).normalize();
  if (i > 0) maxHeadingErrDeg = Math.max(maxHeadingErrDeg,
    THREE.MathUtils.radToDeg(Math.acos(Math.min(1, fd.dot(ptan)))));
  for (const f of footprints) {
    const halfW = f.width * hero / 2, halfL = f.length * hero / 2;
    const extent = Math.abs(lateral) + halfW * Math.cos(yaw) + halfL * Math.sin(yaw);
    perModelMinEdgeGap[f.id] = Math.min(perModelMinEdgeGap[f.id], TRACK.halfWidth - extent);
  }
}
const minEdgeGap = Math.min(...Object.values(perModelMinEdgeGap));

// ---- gate and finish post clearance at the actual crossing -------------------
const widest = footprints.reduce((a, b) => (a.width > b.width ? a : b));
const postGap = (t, postLateral, postHalf) => {
  const lateral = Math.abs(line.lateralAt(t));
  return postLateral - postHalf - (lateral + widest.width * hero / 2);
};
const gateLateral = TRACK.halfWidth + TRACK.curbWidth + 1.0;
const gateClearance = Math.min(...CHECKPOINT_T.map(t => postGap(t, gateLateral, 0.17)));
const finishClearance = postGap(FINISH_T, TRACK.halfWidth + TRACK.curbWidth + 0.72, 0.17);
const beamLength = gateLateral * 2 + 0.6;

// ---- camera: settled pose per t (snap), car bounds in NDC ----------------------
const camera = new THREE.PerspectiveCamera(COMP.fov, aspect, 0.5, 3000);
camera.updateProjectionMatrix();
aerialModule.initAerialCamera(camera);
const poseAt = t => {
  state.progress = t;
  state.velocity = 0;
  aerialModule.snap();
  return { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
};
const car = new THREE.Vector3();
const ndcStats = { maxReach: 0, overEngage: 0, overHard: 0, maxX: 0, maxY: 0 };
const camPath = [];
const SAMPLES = 2000;
const engage = COMP.engageZone || { x: 0.76, y: 0.72 };
for (let i = 0; i <= SAMPLES; i++) {
  const t = Math.min(1, i / SAMPLES);
  const pose = poseAt(t);
  camPath.push(pose.position);
  line.pathPointAt(t, car);
  car.y += 0.7 * hero;
  const depth = car.clone().sub(pose.position).length();
  const halfH = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const r = 2.7 * hero;
  const ndc = car.clone().project(camera);
  const rx = r / (halfH * aspect), ry = r / halfH;
  const reach = Math.max((Math.abs(ndc.x) + rx), (Math.abs(ndc.y) + ry));
  ndcStats.maxReach = Math.max(ndcStats.maxReach, reach);
  ndcStats.maxX = Math.max(ndcStats.maxX, Math.abs(ndc.x) + rx);
  ndcStats.maxY = Math.max(ndcStats.maxY, Math.abs(ndc.y) + ry);
  if (Math.abs(ndc.x) + rx > engage.x || Math.abs(ndc.y) + ry > engage.y) ndcStats.overEngage++;
  if (reach > 0.85) ndcStats.overHard++;
}
const seam = poseAt(0).position.distanceTo(poseAt(1).position);
const before = poseAt(0.44).position.clone();
poseAt(0.6); poseAt(0.3);
const reversibilityM = poseAt(0.44).position.distanceTo(before);

// Fixed route spans covering turn 5 and turns 6–7. Validate their identity below
// with the car's measured heading sweep; camera heading is a separate quantity.
// Sum 3D path lengths, never divide endpoint displacements (a chicane can cancel).
const cornerTest = (from, to) => {
  let camTravel = 0, carTravel = 0;
  let carHeadingSweep = 0, carHeadingNet = 0, cameraHeadingSweep = 0;
  let peakCamPerRouteM = 0, peakCarPerRouteM = 0;
  const steps = 400;
  let prevCam = null; const prevCar = new THREE.Vector3(); const c = new THREE.Vector3();
  let prevHeading, prevCamHeading;
  let firstCam, firstCar;
  const bounds = new THREE.Box3();
  const direction = new THREE.Vector3();
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  for (let i = 0; i <= steps; i++) {
    const t = from + (to - from) * i / steps;
    const pose = poseAt(t);
    const cam = pose.position;
    line.pathPointAt(t, c);
    bounds.expandByPoint(c);
    line.pathTangentAt(t, direction);
    const heading = Math.atan2(direction.x, -direction.z);
    direction.set(0, 0, -1).applyQuaternion(pose.quaternion);
    const camHeading = Math.atan2(direction.x, -direction.z);
    if (prevCam) {
      const dc = cam.distanceTo(prevCam), dp = c.distanceTo(prevCar);
      const routeStep = (to - from) * TRACK_LENGTH / steps;
      camTravel += dc; carTravel += dp;
      peakCamPerRouteM = Math.max(peakCamPerRouteM, dc / routeStep);
      peakCarPerRouteM = Math.max(peakCarPerRouteM, dp / routeStep);
      const turn = angleDelta(heading, prevHeading);
      carHeadingSweep += Math.abs(turn); carHeadingNet += turn;
      cameraHeadingSweep += Math.abs(angleDelta(camHeading, prevCamHeading));
    } else { firstCam = cam.clone(); firstCar = c.clone(); }
    prevCam = cam; prevCar.copy(c);
    prevHeading = heading; prevCamHeading = camHeading;
  }
  const extent = bounds.getSize(new THREE.Vector3());
  return { tRange: [from, to], cameraToCarPathLength: round(camTravel / carTravel),
    cameraPathM: round(camTravel), carPathM: round(carTravel),
    cameraNetDisplacementM: round(prevCam.distanceTo(firstCam)),
    carNetDisplacementM: round(prevCar.distanceTo(firstCar)),
    carSpatialExtentXZ: [round(extent.x), round(extent.z)],
    peakCameraSpeedToPeakCarSpeed: round(peakCamPerRouteM / peakCarPerRouteM),
    cameraHeadingSweepDeg: round(THREE.MathUtils.radToDeg(cameraHeadingSweep), 6),
    carHeadingNetDeg: round(THREE.MathUtils.radToDeg(carHeadingNet), 2),
    carHeadingSweepDeg: round(THREE.MathUtils.radToDeg(carHeadingSweep), 2) };
};
const hairpin = cornerTest(0.263, 0.302);
const chicane = cornerTest(0.328, 0.376);

// Presentation numbers (indicative; runtime raycast coverage is leg 2).
const frameWidthAtTarget = 2 * COMP.distance * Math.tan(THREE.MathUtils.degToRad(COMP.fov / 2)) * aspect;
const widths = footprints.map(f => f.width).sort((a, b) => a - b);
const medianWidth = widths[5];
console.log(JSON.stringify({
  comp: COMP.name, aspect: round(aspect), values: { distance: COMP.distance, pitch: COMP.pitchDeg,
    fov: COMP.fov, hero, halfWidth: TRACK.halfWidth, racingLineM: round(COMP.racingLineM),
    fogScale: round(COMP.fogScale), shadowScale: round(COMP.shadowScale) },
  footprints: footprints.map(f => ({ id: f.id, width: round(f.width), height: round(f.height) })),
  racingLine: { maxLateralM: round(maxLateral), maxRateMPerM: round(maxRate, 4),
    maxPathYawVsRoadDeg: round(maxYawDeg, 2), maxHeadingVsPathTangentDeg: round(maxHeadingErrDeg, 3),
    minEdgeGapM: round(minEdgeGap), perModelMinEdgeGapM: Object.fromEntries(
      Object.entries(perModelMinEdgeGap).map(([k, v]) => [k, round(v)])) },
  gates: { beamLengthM: round(beamLength), minPostClearanceM: round(gateClearance),
    finishPostClearanceM: round(finishClearance), widestModel: widest.id },
  framingSettled: { maxReachNdc: round(ndcStats.maxReach), maxX: round(ndcStats.maxX),
    maxY: round(ndcStats.maxY), pctOverEngageZone: round(100 * ndcStats.overEngage / (SAMPLES + 1), 2),
    pctOverHardZone: round(100 * ndcStats.overHard / (SAMPLES + 1), 2),
    railClampActiveFraction: window.__gt3.aerial?.rail?.clampActiveFraction ?? null },
  seamPositionDiffM: round(seam, 4), reversibilityPositionDiffM: round(reversibilityM, 6),
  cornerTest: { hairpin, chicane },
  presentation: { carLengthPctOfFrameWidth: round(100 * 4.6 * hero / frameWidthAtTarget, 2),
    roadInMedianHeroWidths: round(2 * TRACK.halfWidth / (medianWidth * hero), 2),
    roadInWidestHeroWidths: round(2 * TRACK.halfWidth / (widest.width * hero), 2),
    frameWidthAtTargetM: round(frameWidthAtTarget, 1) },
}, null, 1));
