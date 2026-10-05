/**
 * W2 pure-node numeric checks (no Vite, no browser, no GPU). One candidate per process:
 *   node scripts/check-composition-math.mjs [base|a|b|c] [aspect=1.7778] [cam=leg1|glide|hold|wide|soft]
 * Reports racing-line amplitude/rate/clearance for all ten roster footprints (static
 * GLB accessor bounds), gate/finish post clearance, settled-rail framing (car bounds in
 * NDC), seam/reversibility of the deterministic pose, and the hairpin/chicane corner test.
 */
const comp = process.argv[2] || 'base';
const aspect = Number(process.argv[3] || 16 / 9);
const cam = process.argv[4] || 'leg1';
globalThis.location = { search: `?comp=${comp}&cam=${cam}`, hash: '' };
globalThis.window = { __gt3: {} };

const THREE = await import('three');
const { COMP } = await import('../src/scene/composition.js');
const curveModule = await import('../src/scene/trackCurve.js');
const { TRACK, TRACK_LENGTH, CHECKPOINT_T, FINISH_T, tangentAt, pointAt, offsetPointAt } = curveModule;
const line = await import('../src/scene/racingLine.js');
const aerialModule = await import('../src/scene/aerialCamera.js');
const { state } = await import('../src/core/state.js');
const { CARS } = await import('../src/data/cars.js');
const { glbFootprint } = await import('./lib/glb-footprint.mjs');
const { CORNER_SPANS, framingPlanes, framingRadiusM, clipPolygon, cameraBasis } =
  await import('../src/scene/compositionRail.js');

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
    const halfW = (f.width / 2 + f.height * Math.sin(THREE.MathUtils.degToRad(3.4))) * hero;
    const halfL = f.length * hero / 2;
    const extent = Math.abs(lateral) + halfW * Math.cos(yaw) + halfL * Math.sin(yaw);
    perModelMinEdgeGap[f.id] = Math.min(perModelMinEdgeGap[f.id], TRACK.halfWidth - extent);
  }
}
const minEdgeGap = Math.min(...Object.values(perModelMinEdgeGap));

// ---- gate and finish post clearance at the actual crossing -------------------
const widest = footprints.reduce((a, b) => (a.width > b.width ? a : b));
const postGap = (t, postLateral, postHalf, stress = false) => {
  tangentAt(t, tan).setY(0).normalize();
  line.pathTangentAt(t, ptan).setY(0).normalize();
  const yaw = Math.acos(THREE.MathUtils.clamp(tan.dot(ptan), -1, 1));
  const lateral = stress ? COMP.racingLineM : Math.abs(line.lateralAt(t));
  const extent = Math.max(...footprints.map(f => hero / 2
    * ((f.width + 2 * f.height * Math.sin(THREE.MathUtils.degToRad(3.4))) * Math.cos(yaw)
      + f.length * Math.sin(yaw))));
  return postLateral - postHalf - lateral - extent;
};
const gateLateral = TRACK.halfWidth + TRACK.curbWidth + 1.0;
const gateClearance = Math.min(...CHECKPOINT_T.map(t => postGap(t, gateLateral, 0.17)));
const finishClearance = postGap(FINISH_T, TRACK.halfWidth + TRACK.curbWidth + 0.72, 0.17);
const gateStressClearance = Math.min(...CHECKPOINT_T.map(t => postGap(t, gateLateral, 0.17, true)));
const finishStressClearance = postGap(FINISH_T, TRACK.halfWidth + TRACK.curbWidth + 0.72, 0.17, true);
const beamLength = gateLateral * 2 + 0.6;

// ---- camera: settled pose per t (snap), car bounds in NDC ----------------------
const camera = new THREE.PerspectiveCamera(COMP.fov, aspect, 0.5, 3000);
camera.updateProjectionMatrix();
const initStarted = performance.now();
aerialModule.initAerialCamera(camera);
const railInitMs = performance.now() - initStarted;
const poseAt = t => {
  state.progress = t;
  state.velocity = 0;
  aerialModule.snap();
  return { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
};
const car = new THREE.Vector3();
const ndcStats = { maxReach: 0, overEngage: 0, overHard: 0, maxX: 0, maxY: 0,
  overFrame: 0, perModel: Object.fromEntries(footprints.map(f => [f.id, 0])) };
const camPath = [];
const SAMPLES = 2000;
const engage = COMP.camera === 'corridor' ? COMP.railZone : COMP.engageZone || { x: 0.76, y: 0.72 };
const local = new THREE.Vector3(), projectedCorner = new THREE.Vector3();
const rigMatrix = new THREE.Matrix4(), rigQuaternion = new THREE.Quaternion();
const rollQuaternion = new THREE.Quaternion(), rollAxis = new THREE.Vector3(0, 0, 1);
const center = new THREE.Vector3(), left = new THREE.Vector3(), aim = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
// Full accessor AABB, oriented like carRig, grounded, with roll/bob envelopes.
// Stress offsets ±FULL amplitude at every t, as well as the actual authored line.
function projectFullCars(t) {
  pointAt(t, center);
  offsetPointAt(t, 1, 0, left).sub(center).setY(0).normalize();
  line.pathTangentAt(t, ptan);
  aim.copy(center).add(ptan);
  rigMatrix.lookAt(center, aim, up);
  rigQuaternion.setFromRotationMatrix(rigMatrix);
  let maxX = 0, maxY = 0;
  for (const offset of new Set([line.lateralAt(t), -COMP.racingLineM, COMP.racingLineM])) {
    car.copy(center).addScaledVector(left, offset);
    for (const f of footprints) {
      let modelReach = 0;
      for (const roll of [-3.4, 0, 3.4]) {
        rollQuaternion.setFromAxisAngle(rollAxis, THREE.MathUtils.degToRad(roll));
        for (let corner = 0; corner < 8; corner++) {
          local.set((corner & 1 ? 1 : -1) * f.width * hero / 2,
            corner & 2 ? f.height * hero : 0,
            (corner & 4 ? 1 : -1) * f.length * hero / 2)
            .applyQuaternion(rollQuaternion);
          // Expand each vertical face by the full bob amplitude.
          local.y += (corner & 2 ? 1 : -1) * 0.035 * hero;
          projectedCorner.copy(local).applyQuaternion(rigQuaternion).add(car).project(camera);
          const x = Math.abs(projectedCorner.x), y = Math.abs(projectedCorner.y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          modelReach = Math.max(modelReach, x, y);
        }
      }
      ndcStats.perModel[f.id] = Math.max(ndcStats.perModel[f.id], modelReach);
    }
  }
  return { maxX, maxY };
}
for (let i = 0; i <= SAMPLES; i++) {
  const t = Math.min(1, i / SAMPLES);
  const pose = poseAt(t);
  camPath.push(pose.position);
  const { maxX, maxY } = projectFullCars(t);
  const reach = Math.max(maxX, maxY);
  ndcStats.maxReach = Math.max(ndcStats.maxReach, reach);
  ndcStats.maxX = Math.max(ndcStats.maxX, maxX);
  ndcStats.maxY = Math.max(ndcStats.maxY, maxY);
  if (maxX > engage.x || maxY > engage.y) ndcStats.overEngage++;
  if (reach > 0.85) ndcStats.overHard++;
  if (reach > 1) ndcStats.overFrame++;
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
const hairpin = cornerTest(...CORNER_SPANS.hairpin);
const chicane = cornerTest(...CORNER_SPANS.chicane);

// Can ONE fixed camera frame the whole named interval? Convex intersection of
// exact perspective sphere constraints; binary-search distance (same FOV/pitch).
const basis = cameraBasis();
// Match the rail's 1024-sample height plane, rather than the control-point mean.
const targetY = Array.from({ length: 1024 }, (_, i) => pointAt(i / 1024).y)
  .reduce((s, y) => s + y, 0) / 1024 + 1.066 * hero;
const feasibleAt = (from, to, distance, zone) => {
  let polygon = [[-10000, -10000], [10000, -10000], [10000, 10000], [-10000, 10000]];
  for (let i = 0; i <= 400 && polygon.length; i++) {
    const p = pointAt(from + (to - from) * i / 400);
    polygon = clipPolygon(polygon, framingPlanes(p, targetY, aspect, distance, zone));
  }
  return polygon.length > 0;
};
const zone = COMP.railZone || { x: 0.76, y: 0.72 };
const feasibility = Object.fromEntries(Object.entries({ ...CORNER_SPANS, complex: [CORNER_SPANS.hairpin[0], CORNER_SPANS.chicane[1]] }).map(([name, [from, to]]) => {
  let lo = 0, hi = 2000;
  for (let i = 0; i < 35; i++) {
    const mid = (lo + hi) / 2;
    if (feasibleAt(from, to, mid, zone)) hi = mid; else lo = mid;
  }
  const projectedMin = [Infinity, Infinity], projectedMax = [-Infinity, -Infinity];
  for (let i = 0; i <= 400; i++) {
    const p = pointAt(from + (to - from) * i / 400);
    [p.dot(basis.right), p.dot(basis.ground)].forEach((v, j) => {
      projectedMin[j] = Math.min(projectedMin[j], v); projectedMax[j] = Math.max(projectedMax[j], v);
    });
  }
  return [name, { groundExtentRightForwardM: projectedMax.map((v, j) => round(v - projectedMin[j])),
    stationaryFeasible: feasibleAt(from, to, COMP.distance, zone),
    conservativeMinStationaryDistanceM: round(hi, 1) }];
}));
const tanHalf = Math.tan(THREE.MathUtils.degToRad(COMP.fov / 2));
feasibility.safeGroundHalfExtentAtTargetM = [
  round(zone.x * COMP.distance * tanHalf * aspect - framingRadiusM()),
  round((zone.y * COMP.distance * tanHalf - framingRadiusM()) / basis.sin),
];

// Smoothness is a SPATIAL proxy converted at a declared constant route speed,
// not an observation of the scroll model or frame time. C2 does not mean low jerk.
function smoothness(stepM) {
  const count = Math.ceil(TRACK_LENGTH / stepM), h = TRACK_LENGTH / count;
  const poses = Array.from({ length: count }, (_, i) => poseAt(i / count).position);
  let speed = 0, acceleration = 0, jerk = 0;
  let speedT = 0, accelerationT = 0, jerkT = 0;
  const referenceMps = 50;
  for (let i = 0; i < count; i++) {
    const a = poses[(i - 1 + count) % count], b = poses[i];
    const c = poses[(i + 1) % count], d = poses[(i + 2) % count];
    const v = c.clone().sub(a).length() / (2 * h) * referenceMps;
    const acc = c.clone().add(a).addScaledVector(b, -2).length() / h ** 2 * referenceMps ** 2;
    const j = d.clone().addScaledVector(c, -3).addScaledVector(b, 3).sub(a).length()
      / h ** 3 * referenceMps ** 3;
    if (v > speed) { speed = v; speedT = i/count; }
    if (acc > acceleration) { acceleration = acc; accelerationT = i/count; }
    if (j > jerk) { jerk = j; jerkT = i/count; }
  }
  return { routeSpeedMps: referenceMps, sampleStepM: round(h, 4),
    cameraSpeedPeakMps: round(speed, 2), accelerationPeakMps2: round(acceleration, 2),
    jerkPeakMps3: round(jerk, 2), speedPeakT: round(speedT, 5),
    accelerationPeakT: round(accelerationT, 5), jerkPeakT: round(jerkT, 5) };
}
const motionProxy = smoothness(0.5);
// Continuous update path (no seeks): forward/back samples must equal direct pose.
const snapStart = window.__gt3.aerial.snapCount;
let livePoseDiffM = 0;
state.velocity = 1;
for (const direction of [1, -1]) for (let i = 0; i <= 400; i++) {
  const t = direction > 0 ? 0.25 + i * 0.00035 : 0.39 - i * 0.00035;
  state.progress = t;
  aerialModule.update(1 / 60);
  if (COMP.camera === 'corridor') {
    const expected = aerialModule.railPoseAt(t).position;
    livePoseDiffM = Math.max(livePoseDiffM, camera.position.distanceTo(new THREE.Vector3(...expected)));
  }
}
motionProxy.updatePoseDiffM = round(livePoseDiffM, 8);
motionProxy.snapsDuringContinuousUpdates = window.__gt3.aerial.snapCount - snapStart;

// Outer terrain rectangle matches environment.js: built BEFORE theme scaling,
// initial fog far=570 => margin=max(1000,570+250)=1000. Test all edge/corner rays
// against both extrema of a conservative relief envelope (noise 5.2+19+9 m).
const trackBounds = new THREE.Box3();
for (let i = 0; i <= 256; i++) trackBounds.expandByPoint(pointAt(i / 256));
const terrain = { minX: trackBounds.min.x - 1000, maxX: trackBounds.max.x + 1000,
  minZ: trackBounds.min.z - 1000, maxZ: trackBounds.max.z + 1000 };
const representative = [0.02, 0.265, 0.283, 0.300, 0.335, 0.352, 0.370, 0.465,
  ...CHECKPOINT_T, FINISH_T];
const raycaster = new THREE.Raycaster();
let worldExposed = 0, worldMargin = Infinity, farExposed = 0;
const worldPoints = representative.map(t => {
  poseAt(t);
  let exposed = 0, margin = Infinity, maxRayM = 0;
  for (const [x, y] of [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]]) {
    raycaster.setFromCamera({ x, y }, camera);
    const { origin, direction } = raycaster.ray;
    if (direction.y >= 0) continue; // sky above horizon
    for (const height of [trackBounds.min.y - 33.23, trackBounds.max.y + 33.2]) {
      const distance = (height - origin.y) / direction.y;
      const hit = origin.clone().addScaledVector(direction, distance);
      const gap = Math.min(hit.x - terrain.minX, terrain.maxX - hit.x,
        hit.z - terrain.minZ, terrain.maxZ - hit.z);
      margin = Math.min(margin, gap); maxRayM = Math.max(maxRayM, distance);
      if (gap < 0) exposed++;
      if (distance > camera.far) farExposed++;
    }
  }
  worldExposed += exposed; worldMargin = Math.min(worldMargin, margin);
  return { t, exposed, minBoundaryGapM: round(margin), maxCornerRayM: round(maxRayM) };
});

// Non-occluded asphalt silhouette proxy: project the same 1.1 m road rings as
// track.js and rasterize triangle containment at 48x27 cell centres. No GPU,
// scenery occlusion, lighting, fog, markings or perceived legibility involved.
const rings = Math.ceil(TRACK_LENGTH / 1.1);
const strip = Array.from({ length: rings + 1 }, (_, i) => [
  offsetPointAt(i / rings, -TRACK.halfWidth, 0), offsetPointAt(i / rings, TRACK.halfWidth, 0) ]);
function roadCoverage(t) {
  poseAt(t);
  const vertices = strip.map(r => r.map(p => p.clone().project(camera)));
  const cells = new Uint8Array(48 * 27);
  const cross = (a, b, x, y) => (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  function triangle(a, b, c) {
    if ([a,b,c].some(v => v.z < -1 || v.z > 1)) return;
    const x0 = Math.max(0, Math.ceil((Math.min(a.x,b.x,c.x) + 1) * 24 - 0.5));
    const x1 = Math.min(47, Math.floor((Math.max(a.x,b.x,c.x) + 1) * 24 - 0.5));
    const y0 = Math.max(0, Math.ceil((Math.min(a.y,b.y,c.y) + 1) * 13.5 - 0.5));
    const y1 = Math.min(26, Math.floor((Math.max(a.y,b.y,c.y) + 1) * 13.5 - 0.5));
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const x = (ix + 0.5) / 24 - 1, y = (iy + 0.5) / 13.5 - 1;
      const signs = [cross(a,b,x,y), cross(b,c,x,y), cross(c,a,x,y)];
      if (signs.every(v => v >= 0) || signs.every(v => v <= 0)) cells[iy * 48 + ix] = 1;
    }
  }
  for (let i = 0; i < rings; i++) {
    triangle(...vertices[i], vertices[i+1][0]);
    triangle(vertices[i][1], ...vertices[i+1]);
  }
  return cells.reduce((sum, v) => sum + v, 0) / cells.length;
}
const coverage = representative.map(t => ({ t, fraction: round(roadCoverage(t), 4) }));
const projectedLengths = [];
for (const t of representative) {
  poseAt(t);
  line.pathPointAt(t, car); line.pathTangentAt(t, ptan);
  rigMatrix.lookAt(car, car.clone().add(ptan), up);
  rigQuaternion.setFromRotationMatrix(rigMatrix);
  for (const f of footprints) {
    const ends = [-1, 1].map(sign => new THREE.Vector3(0, f.height * hero / 2,
      sign * f.length * hero / 2).applyQuaternion(rigQuaternion).add(car).project(camera));
    projectedLengths.push(50 * Math.hypot(ends[0].x - ends[1].x,
      (ends[0].y - ends[1].y) / aspect));
  }
}

// Presentation numbers (indicative; runtime raycast coverage is leg 2).
const frameWidthAtTarget = 2 * COMP.distance * Math.tan(THREE.MathUtils.degToRad(COMP.fov / 2)) * aspect;
const widths = footprints.map(f => f.width).sort((a, b) => a - b);
const medianWidth = widths[5];
console.log(JSON.stringify({
  comp: COMP.name, cam: COMP.cameraVariant, aspect: round(aspect), values: { distance: COMP.distance, pitch: COMP.pitchDeg,
    fov: COMP.fov, hero, halfWidth: TRACK.halfWidth, racingLineM: round(COMP.racingLineM),
    fogScale: round(COMP.fogScale), shadowScale: round(COMP.shadowScale) },
  footprints: footprints.map(f => ({ id: f.id, width: round(f.width), height: round(f.height) })),
  racingLine: { maxLateralM: round(maxLateral), maxRateMPerM: round(maxRate, 4),
    maxPathYawVsRoadDeg: round(maxYawDeg, 2), maxHeadingVsPathTangentDeg: round(maxHeadingErrDeg, 3),
    minEdgeGapM: round(minEdgeGap), perModelMinEdgeGapM: Object.fromEntries(
      Object.entries(perModelMinEdgeGap).map(([k, v]) => [k, round(v)])) },
  gates: { beamLengthM: round(beamLength), minPostClearanceM: round(gateClearance),
    finishPostClearanceM: round(finishClearance), widestModel: widest.id,
    maxOffsetMinPostClearanceM: round(gateStressClearance), maxOffsetFinishClearanceM: round(finishStressClearance) },
  framingSettled: { maxReachNdc: round(ndcStats.maxReach), maxX: round(ndcStats.maxX),
    maxY: round(ndcStats.maxY), pctOverEngageZone: round(100 * ndcStats.overEngage / (SAMPLES + 1), 2),
    pctOverHardZone: round(100 * ndcStats.overHard / (SAMPLES + 1), 2),
    pctOverFrame: round(100 * ndcStats.overFrame / (SAMPLES + 1), 2),
    perModelMaxReachNdc: Object.fromEntries(Object.entries(ndcStats.perModel).map(([k,v]) => [k,round(v)])),
    railClampActiveFraction: window.__gt3.aerial?.rail?.clampActiveFraction ?? null },
  seamPositionDiffM: round(seam, 4), reversibilityPositionDiffM: round(reversibilityM, 6),
  cornerTest: { hairpin, chicane },
  feasibility, motionProxy,
  worldExtent: { marginM: 1000, requiredWorldSizeChangeM: 0, exposedRays: worldExposed,
    minBoundaryGapM: round(worldMargin), beyondCameraFar: farExposed, representative: worldPoints },
  railInitMs: round(railInitMs, 1),
  railSolver: window.__gt3.aerial.rail?.solver,
  railHolds: window.__gt3.aerial.rail?.holds,
  unavailableHolds: window.__gt3.aerial.rail?.unavailableHolds,
  railHoldState: window.__gt3.aerial.rail?.holdState,
  presentation: { carLengthPctOfFrameWidth: round(100 * 4.6 * hero / frameWidthAtTarget, 2),
    projectedCarLengthPctRange: [round(Math.min(...projectedLengths), 2), round(Math.max(...projectedLengths), 2)],
    roadInMedianHeroWidths: round(2 * TRACK.halfWidth / (medianWidth * hero), 2),
    roadInWidestHeroWidths: round(2 * TRACK.halfWidth / (widest.width * hero), 2),
    roadCoverageMedian: round(coverage.map(v => v.fraction).sort((a,b) => a-b)[Math.floor(coverage.length/2)], 4),
    roadCoverageMax: Math.max(...coverage.map(v => v.fraction)), roadCoveragePoints: coverage,
    frameWidthAtTargetM: round(frameWidthAtTarget, 1) },
}, null, 1));
