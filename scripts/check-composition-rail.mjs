/** Pure Node solver independence check. No renderer or browser.
 * node scripts/check-composition-rail.mjs [comp=b] [cam=glide] [aspect=16/9] [beta=1e-4]
 */
import assert from 'node:assert/strict';
const [comp = 'b', cam = 'glide', aspectText = String(16 / 9), betaText = '0.0001', settingsText = '{}'] = process.argv.slice(2);
globalThis.location = { search: comp.startsWith('r') ? `?look=${comp}` : `?comp=${comp}&cam=${cam}` };
const { Vector3 } = await import('three');
const { buildCompositionRail } = await import('../src/scene/compositionRail.js');
const { TRACK_LENGTH } = await import('../src/scene/trackCurve.js');
const { pathPointAt } = await import('../src/scene/racingLine.js');
const aspect = Number(aspectText), beta = Number(betaText);
const settings = JSON.parse(settingsText);
const stopped = buildCompositionRail(aspect, { ...settings, beta });
// Frontier-only runs need no repeated independence test for every parameter.
const longer = settings.frontier ? null : buildCompositionRail(aspect, { ...settings, beta, stop: false,
  maxIterations: 3 * stopped.solver.iterations });
const a = new Vector3(), b = new Vector3();
let maxDifferenceM = longer ? 0 : null;
if (longer) for (let i = 0; i < 4096; i++) maxDifferenceM = Math.max(maxDifferenceM,
  stopped.at(i / 4096, a).distanceTo(longer.at(i / 4096, b)));
assert(stopped.solver.converged);
if (longer) assert(maxDifferenceM <= 0.5, `iteration-dependent rail: ${maxDifferenceM} m`);
const cornerRatios = [];
for (const [from, to] of [[0.263, 0.302], [0.328, 0.376]]) {
  let cameraTravel = 0, carTravel = 0;
  const prev = new Vector3(), prevCar = new Vector3(), car = new Vector3();
  for (let i = 0; i <= 400; i++) {
    const t = from + (to - from) * i / 400;
    stopped.at(t, a); pathPointAt(t, car);
    if (i) { cameraTravel += a.distanceTo(prev); carTravel += car.distanceTo(prevCar); }
    prev.copy(a); prevCar.copy(car);
  }
  cornerRatios.push(cameraTravel / carTravel);
}
const count = Math.ceil(TRACK_LENGTH / 0.5), h = TRACK_LENGTH / count;
const poses = Array.from({ length: count }, (_, i) => stopped.at(i / count, new Vector3()));
let speed = 0, acceleration = 0, jerk = 0;
for (let i = 0; i < count; i++) {
  const a = poses[(i - 1 + count) % count], b = poses[i], c = poses[(i + 1) % count], d = poses[(i + 2) % count];
  speed = Math.max(speed, c.clone().sub(a).length() / (2 * h) * 50);
  acceleration = Math.max(acceleration, c.clone().add(a).addScaledVector(b, -2).length() / h ** 2 * 50 ** 2);
  jerk = Math.max(jerk, d.clone().addScaledVector(c, -3).addScaledVector(b, 3).sub(a).length() / h ** 3 * 50 ** 3);
}
console.log(JSON.stringify({ comp, cam, aspect, settings, cornerRatios, motionProxy: { speed, acceleration, jerk }, stopped: stopped.solver,
  independenceChecked: Boolean(longer), longer: longer?.solver ?? null, maxDifferenceM,
  buildMs: stopped.buildMs, longerBuildMs: longer?.buildMs ?? null }, null, 1));
