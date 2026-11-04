/** Node-only camera contract checks; no browser, DOM or scene construction. */
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildCircuitGeometry, routePosition } from '../src/ui/hub/circuitGeometry.js';
import { restPose, poseAt, project, projectedBounds, orientation } from '../src/ui/hub/circuitCamera.js';

const geometry = buildCircuitGeometry();
const points = [...geometry.left, ...geometry.right];
let checked = 0;
for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
  const slot = { left: viewport.width * .08, top: viewport.height * .24,
    width: viewport.width * .84, height: viewport.height * .47 };
  for (const variant of ['a', 'b']) for (const progress of [0, .42, 1]) {
    const rest = restPose({ points, slot, viewport, variant });
    const target = routePosition(progress).position;
    const camera = new PerspectiveCamera(32, viewport.width / viewport.height, .1, 9000);
    camera.quaternion.fromArray(orientation(75, 52));
    camera.position.fromArray(target).addScaledVector(new Vector3(0, 0, 1).applyQuaternion(camera.quaternion), 140);
    // Exercise the settled camera's off-axis projection, zoom and film-offset too.
    camera.zoom = 1.1; camera.filmOffset = 0.4;
    camera.setViewOffset(viewport.width, viewport.height, 12, 8, viewport.width - 24, viewport.height - 16);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const live = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far, distance: 140,
      zoom: camera.zoom, filmOffset: camera.filmOffset, filmGauge: camera.filmGauge, view: { ...camera.view } };
    assert.deepEqual(poseAt(0, rest, live), rest);
    assert.deepEqual(poseAt(1, rest, live), live);
    const box = projectedBounds(project(points, rest, viewport));
    assert(box.minX >= slot.left - 1e-5 && box.maxX <= slot.left + slot.width + 1e-5);
    assert(box.minY >= slot.top - 1e-5 && box.maxY <= slot.top + slot.height + 1e-5);
    // Compare to THREE's own projection, separately from the camera module.
    const testPoints = [target, geometry.left[Math.round(progress * (geometry.left.length - 1))]];
    const final = project(testPoints, poseAt(1, rest, live), viewport);
    testPoints.forEach((p, i) => {
      const v = new Vector3().fromArray(p).project(camera);
      if (final[i]) assert(Math.hypot(final[i].x - (v.x + 1) * viewport.width / 2,
        final[i].y - (1 - v.y) * viewport.height / 2) < 1e-7);
    });
    // Infinitesimal steps at 101 locations, including both endpoint seams. Points
    // very close to the near plane are excluded because clipping is discontinuous by design.
    for (let i = 0; i <= 100; i++) {
      const z = i / 100, z2 = Math.min(1, z + 1e-7);
      const a = poseAt(z, rest, live), b = poseAt(z2, rest, live);
      assert(a.position.every(Number.isFinite) && b.position.every(Number.isFinite));
      const probes = [target, ...geometry.left.filter((_, index) => index % 190 === 0)];
      const pa = project(probes, a, viewport), pb = project(probes, b, viewport);
      const half = project(probes, poseAt((z + z2) / 2, rest, live), viewport);
      for (let k = 0; k < pa.length; k++) if (pa[k] && pb[k] && pa[k].depth > 10 && pb[k].depth > 10) {
        const delta = Math.hypot(pa[k].x - pb[k].x, pa[k].y - pb[k].y);
        const halfDelta = Math.hypot(pa[k].x - half[k].x, pa[k].y - half[k].y);
        // Distant off-screen points can move many pixels near the perspective pole.
        // Halving the step must halve displacement, even there: a true jump would not.
        assert(Number.isFinite(delta) && halfDelta <= delta * .55 + 1e-5,
          `projection jump at ${variant}:${progress}:${z}:${k}`);
        if (Math.abs(pa[k].x) < viewport.width * 2 && Math.abs(pa[k].y) < viewport.height * 2) {
          assert(delta < .1, `visible projection jump at ${variant}:${progress}:${z}:${k}`);
        }
      }
    }
    // Check the approach to the exact view-offset endpoint from the interior.
    const before = project([target], poseAt(1 - 1e-9, rest, live), viewport)[0];
    assert(Math.hypot(before.x - final[0].x, before.y - final[0].y) < 1e-3);
    checked++;
  }
}
console.log(JSON.stringify({ pass: true, poses: checked, asphaltEdgePoints: points.length }));
