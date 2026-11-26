/** Pure projection helpers for the Hub plan's dive; no renderer or animation clock. */

/** Least-squares similarity, used for the early, flat part of the dive. */
export function fitSimilarity(planPts, screenPts) {
  const n = planPts.length;
  let px = 0; let py = 0; let qx = 0; let qy = 0;
  for (let i = 0; i < n; i++) { px += planPts[i].x; py += planPts[i].y; qx += screenPts[i].x; qy += screenPts[i].y; }
  px /= n; py /= n; qx /= n; qy /= n;
  let a = 0; let b = 0; let d = 0;
  for (let i = 0; i < n; i++) {
    const ux = planPts[i].x - px; const uy = planPts[i].y - py;
    const vx = screenPts[i].x - qx; const vy = screenPts[i].y - qy;
    a += ux * vx + uy * vy; b += ux * vy - uy * vx; d += ux * ux + uy * uy;
  }
  const s = Math.hypot(a, b) / d;
  const r = Math.atan2(b, a);
  const c = Math.cos(r) * s; const sn = Math.sin(r) * s;
  return { s, r, x: qx - (c * px - sn * py), y: qy - (sn * px + c * py) };
}

/** Perspective resolves only in the last part of the existing eased zoom. */
export function perspectiveMix(z) {
  const t = Math.max(0, Math.min(1, (z - 0.55) / 0.45));
  return t * t * (3 - 2 * t);
}

/**
 * Cache homogeneous endpoint coordinates in the target similarity's local space. Unlike a
 * planar homography, per-vertex depth also preserves the route's elevation and varying road
 * width. At mix=0 the original drawing is exact; at mix=1 it is the live camera projection.
 * All route sampling and camera work happens once, before the tween, never on each frame.
 */
export function preparePerspective(planPts, projected, target, depthOrigin) {
  const points = new Float64Array(planPts.length * 5);
  const c = Math.cos(target.r) / target.s;
  const s = Math.sin(target.r) / target.s;
  for (let i = 0; i < planPts.length; i++) {
    const p = planPts[i], q = projected[i], k = i * 5;
    const d = q.depth / depthOrigin;
    const x = q.x - target.x, y = q.y - target.y;
    points[k] = p.x; points[k + 1] = p.y;
    points[k + 2] = (c * x + s * y) * d;
    points[k + 3] = (-s * x + c * y) * d;
    points[k + 4] = d;
  }
  return points;
}

/** Reuse the caller's result while interpolating in homogeneous space (before division). */
export function perspectivePoint(points, index, mix, out) {
  const k = index * 5, flat = 1 - mix;
  const w = flat + mix * points[k + 4];
  // Do not connect road behind the camera across the image. The omitted near-plane span
  // is outside the viewport; the SVG viewport clips the remaining, very distant endpoints.
  if (w <= 0.01) return false;
  out.x = (flat * points[k] + mix * points[k + 2]) / w;
  out.y = (flat * points[k + 1] + mix * points[k + 3]) / w;
  return true;
}

/** Only the SVG path string is rebuilt per update; points and scratch objects are reused. */
export function perspectivePath(points, mix, scratch, closed = false) {
  let d = '', connected = false, complete = true;
  for (let i = 0; i < points.length / 5; i++) {
    if (!perspectivePoint(points, i, mix, scratch)) { connected = false; complete = false; continue; }
    d += `${connected ? 'L' : 'M'}${scratch.x.toFixed(3)} ${scratch.y.toFixed(3)}`;
    connected = true;
  }
  return complete && closed ? `${d}Z` : d;
}
