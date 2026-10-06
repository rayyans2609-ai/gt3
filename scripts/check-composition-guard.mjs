/** Node-only failure/retention/recovery exercise. Run with 'first' and 'resize'. */
import assert from 'node:assert/strict';
globalThis.location = { search: process.argv[3] ? `?look=${process.argv[3]}` : '?comp=b&cam=soft' };
globalThis.window = { __gt3: {} };
const { PerspectiveCamera } = await import('three');
const { COMP } = await import('../src/scene/composition.js');
const { state } = await import('../src/core/state.js');
const aerial = await import('../src/scene/aerialCamera.js');
const { buildCompositionRail } = await import('../src/scene/compositionRail.js');
const first = process.argv[2] === 'first';
const camera = new PerspectiveCamera(COMP.fov, first ? 1.6 : 16 / 9, 0.5, 3000);
if (!first) aerial.initAerialCamera(camera);
let attempts = 0;
const aspect = 1.6;
const table = aerial.prepareCompositionRail(aspect, a => {
  attempts++;
  return buildCompositionRail(a, { distance: 30 }); // actual infeasible framing tube
});
camera.aspect = aspect;
if (first) aerial.initAerialCamera(camera);
const failed = { ...window.__gt3.comp.railRuntime };
for (let i = 0; i < 200; i++) {
  state.progress = i / 200; state.velocity = 1;
  aerial.update(1 / 60);
  assert(camera.position.toArray().every(Number.isFinite));
  assert.equal(aerial.prepareCompositionRail(aspect), table);
}
assert.equal(attempts, 1);
assert.equal(window.__gt3.aerial.rail.buildAttempts, first ? 1 : 2);
assert.equal(failed.fallback, first ? 'leg1-sector' : 'last-good');
assert.match(failed.error, /infeasible/);
assert.equal(camera.fov, first ? 32 : COMP.fov);
camera.aspect = 1.5;
aerial.update(1 / 60);
assert.equal(window.__gt3.aerial.rail.fallback, null);
assert.equal(camera.fov, COMP.fov);
assert(window.__gt3.aerial.rail.denseCheck.maxResidualM <= 0);
const recovered = window.__gt3.aerial.rail;
const buildCount = recovered.buildAttempts;
camera.aspect = first ? 1.5 : 16 / 9;
aerial.update(1 / 60);
if (!first) {
  assert.equal(window.__gt3.aerial.rail.cacheHit, true);
  assert.equal(window.__gt3.aerial.rail.buildAttempts, buildCount);
}
console.log(JSON.stringify({ mode: first ? 'first' : 'resize', failed,
  recovered, revisited: window.__gt3.aerial.rail,
  framesWithoutRethrow: 200, infeasibleAttempts: attempts }, null, 1));
