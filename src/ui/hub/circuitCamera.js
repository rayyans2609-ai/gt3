/** Pure camera math. Poses contain plain arrays; no DOM, scene or state imports. */
import { Vector3, Quaternion, Matrix4, PerspectiveCamera, MathUtils } from 'three';
const lerp = (a, b, z) => a + (b - a) * z;
const vec = p => Array.isArray(p) ? new Vector3().fromArray(p) : new Vector3(p.x, p.y, p.z);
const copy = pose => structuredClone(pose);

export function orientation(yawDeg, pitchDeg) {
  const yaw = MathUtils.degToRad(yawDeg), pitch = MathUtils.degToRad(pitchDeg);
  // Explicit basis retains yaw at exactly 90 degrees (lookAt's world-up is singular there).
  const right = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const forward = new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const up = new Vector3().crossVectors(right, forward);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward.negate())).toArray();
}
function cameraFor(pose) {
  const camera = new PerspectiveCamera(pose.fov, pose.aspect, pose.near, pose.far);
  camera.position.fromArray(pose.position);
  camera.quaternion.fromArray(pose.quaternion);
  camera.zoom = pose.zoom ?? 1;
  camera.filmGauge = pose.filmGauge ?? 35;
  camera.filmOffset = pose.filmOffset ?? 0;
  camera.view = pose.view ? { ...pose.view } : null;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] -= pose.shift?.[0] ?? 0;
  camera.projectionMatrix.elements[9] -= pose.shift?.[1] ?? 0;
  camera.updateMatrixWorld();
  return camera;
}
/** Project with the same perspective/view-offset convention as THREE.Camera. Null = behind near. */
export function project(points, pose, viewport) {
  const camera = cameraFor(pose);
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const view = camera.matrixWorldInverse.elements;
  const w = viewport.width, h = viewport.height;
  return points.map(p => {
    const x = p[0] ?? p.x, y = p[1] ?? p.y, z = p[2] ?? p.z;
    const depth = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
    if (depth < pose.near) return null;
    const cw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return { x: ((matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / cw + 1) * w / 2,
      y: (1 - (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / cw) * h / 2, depth };
  });
}
export function projectedBounds(points) {
  const valid = points.filter(Boolean);
  return { minX: Math.min(...valid.map(p => p.x)), maxX: Math.max(...valid.map(p => p.x)),
    minY: Math.min(...valid.map(p => p.y)), maxY: Math.max(...valid.map(p => p.y)) };
}
/** Fit distance by bisection, then solve principal-point shift in CSS pixels. */
export function restPose({ points, slot, viewport, variant = 'a', yawDeg = 75, pitchDeg = 52 }) {
  const bounds = new Vector3(Infinity, Infinity, Infinity), upper = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of points) { bounds.min(vec(p)); upper.max(vec(p)); }
  const target = bounds.add(upper).multiplyScalar(0.5);
  const quaternion = orientation(yawDeg, variant === 'a' ? 90 : pitchDeg);
  const back = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(quaternion));
  const radius = Math.max(...points.map(p => vec(p).distanceTo(target)));
  const pose = { position: [], quaternion, target: target.toArray(), distance: 0,
    fov: variant === 'a' ? 3 : 12, aspect: viewport.width / viewport.height,
    near: 0.1, far: 1e7, shift: [0, 0], view: null };
  const at = distance => { pose.distance = distance; pose.position = target.clone().addScaledVector(back, distance).toArray();
    return projectedBounds(project(points, pose, viewport)); };
  let lo = radius + 1, hi = Math.max(lo * 2, 1);
  const fits = b => b.maxX - b.minX <= slot.width && b.maxY - b.minY <= slot.height;
  while (!fits(at(hi))) hi *= 2;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (fits(at(mid))) hi = mid; else lo = mid; }
  const b = at(hi);
  pose.shift = [2 * (slot.left + slot.width / 2 - (b.minX + b.maxX) / 2) / viewport.width,
    -2 * (slot.top + slot.height / 2 - (b.minY + b.maxY) / 2) / viewport.height];
  return pose;
}
/**
 * Logarithmic dolly, quaternion slerp, linearly moving optical target, FOV and principal point.
 * Endpoints return exact snapshots (including view offset). z is eased by the caller, never here.
 */
export function poseAt(z, rest, live) {
  if (z <= 0) return copy(rest);
  if (z >= 1) return copy(live);
  const a = new Quaternion().fromArray(rest.quaternion), b = new Quaternion().fromArray(live.quaternion);
  const quaternion = a.clone().slerp(b, z);
  const d0 = rest.distance ?? 1, d1 = live.distance ?? 1;
  const targetOf = (p, q, d) => p.target ? vec(p.target) : vec(p.position).addScaledVector(new Vector3(0, 0, -1).applyQuaternion(q), d);
  const target = targetOf(rest, a, d0).lerp(targetOf(live, b, d1), z);
  const distance = Math.exp(lerp(Math.log(d0), Math.log(d1), z));
  // View offsets, film offset and zoom are represented by their effective frustum values.
  const ca = cameraFor(rest), cb = cameraFor(live);
  const pa = ca.projectionMatrix.elements, pb = cb.projectionMatrix.elements;
  const fov = lerp(MathUtils.radToDeg(2 * Math.atan(1 / pa[5])), MathUtils.radToDeg(2 * Math.atan(1 / pb[5])), z);
  return { position: target.clone().addScaledVector(new Vector3(0, 0, 1).applyQuaternion(quaternion), distance).toArray(),
    quaternion: quaternion.toArray(), target: target.toArray(), distance,
    fov, aspect: lerp(pa[5] / pa[0], pb[5] / pb[0], z),
    near: lerp(rest.near, live.near, z), far: lerp(rest.far, live.far, z),
    shift: [-lerp(pa[8], pb[8], z), -lerp(pa[9], pb[9], z)], view: null };
}
