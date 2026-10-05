/** Pure Node solver independence check. No renderer or browser.
 * node scripts/check-composition-rail.mjs [comp=b] [cam=glide] [aspect=16/9] [beta=1e-4]
 */
import assert from 'node:assert/strict';
const [comp = 'b', cam = 'glide', aspectText = String(16 / 9), betaText = '0.0001'] = process.argv.slice(2);
globalThis.location = { search: `?comp=${comp}&cam=${cam}` };
const { Vector3 } = await import('three');
const { buildCompositionRail } = await import('../src/scene/compositionRail.js');
const aspect = Number(aspectText), beta = Number(betaText);
const stopped = buildCompositionRail(aspect, { beta });
const longer = buildCompositionRail(aspect, { beta, stop: false,
  maxIterations: 3 * stopped.solver.iterations });
const a = new Vector3(), b = new Vector3();
let maxDifferenceM = 0;
for (let i = 0; i < 4096; i++) maxDifferenceM = Math.max(maxDifferenceM,
  stopped.at(i / 4096, a).distanceTo(longer.at(i / 4096, b)));
assert(stopped.solver.converged);
assert(maxDifferenceM <= 0.5, `iteration-dependent rail: ${maxDifferenceM} m`);
console.log(JSON.stringify({ comp, cam, aspect, stopped: stopped.solver,
  longer: longer.solver, maxDifferenceM, buildMs: stopped.buildMs, longerBuildMs: longer.buildMs }, null, 1));
