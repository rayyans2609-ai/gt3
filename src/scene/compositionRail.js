/** W2 review rail: precomputed convex framing corridors, optional corner holds.
 * No time state or live car correction. A periodic cubic B-spline is C2, including
 * the seam. All work below runs at load/resize; evaluation reads four samples.
 */
import * as THREE from 'three';
import { COMP } from './composition.js';
import { curve, TRACK_LENGTH } from './trackCurve.js';

// Same measured route intervals as the node/browser harnesses. A hold covers the
// entire interval, not only its apex. Entry/exit motion remains separately visible.
export const CORNER_SPANS = { hairpin: [0.263, 0.302], chicane: [0.328, 0.376] };
const N = 1024;
const wrap = i => (i % N + N) % N;
const prev = Uint16Array.from({ length: N }, (_, i) => wrap(i - 1));
const next = Uint16Array.from({ length: N }, (_, i) => wrap(i + 1));
const prev2 = Uint16Array.from({ length: N }, (_, i) => wrap(i - 2));
const next2 = Uint16Array.from({ length: N }, (_, i) => wrap(i + 2));

// Roster accessor bounds: 4.6 × <=2.823 × <=2.132 m after normalization.
// A sphere about y=1.066 covers that box, ±3.4° body roll and ±0.035 m bob.
// Adding the FULL racing-line amplitude protects every lateral position, not
// only the actual line. Exact all-ten projected boxes are checked in node.
export const framingRadiusM = () => 3.05 * COMP.hero + (COMP.racingLineMaxM ?? COMP.racingLineM);

export function cameraBasis() {
  const yaw = THREE.MathUtils.degToRad(COMP.yawDeg);
  const pitch = THREE.MathUtils.degToRad(COMP.pitchDeg);
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const ground = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  return { right, ground, sin, cos,
    forward: ground.clone().multiplyScalar(cos).setY(-sin) };
}

/** Four exact perspective halfplanes in ground (right, forward) coordinates.
 * Sphere support includes depth variation; the old radius/depth approximation
 * underestimated the projected bounds. Each plane is a*r + b*g <= c.
 */
export function framingPlanes(point, targetY, aspect, distance = COMP.distance,
  zone = COMP.railZone, radius = framingRadiusM()) {
  const { right, ground, sin, cos } = cameraBasis();
  const r = point.dot(right), g = point.dot(ground);
  const y = point.y + 1.066 * COMP.hero - targetY;
  const tan = Math.tan(THREE.MathUtils.degToRad(COMP.fov / 2));
  const kx = zone.x * aspect * tan, ky = zone.y * tan;
  return [-1, 1].flatMap(sign => [
    { a: -sign, b: kx * cos,
      c: kx * (distance + cos * g - sin * y) - sign * r - radius * Math.hypot(1, kx) },
    { a: 0, b: -sign * sin + ky * cos,
      c: ky * (distance + cos * g - sin * y) - sign * (sin * g + cos * y)
        - radius * Math.hypot(1, ky) },
  ]);
}

export function clipPolygon(polygon, planes) {
  for (const { a, b, c } of planes) {
    const next = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
      if (dp <= 1e-9) next.push(p);
      if ((dp < 0) !== (dq < 0)) {
        const f = dp / (dp - dq);
        next.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
      }
    }
    polygon = next;
    if (!polygon.length) break;
  }
  return polygon;
}

const initialPolygon = () => [[-10000, -10000], [10000, -10000],
  [10000, 10000], [-10000, 10000]];

// Convex polygon distance is attained by a vertex and its projection onto an
// opposite edge (or by a shared point). Minimize the required hold transfer;
// centroid placement can spend hundreds of metres of unnecessary pan.
function closestPair(a, b) {
  const intersection = clipPolygon(a, b.map((p, i) => {
    const q = b[(i + 1) % b.length];
    return { a: q[1] - p[1], b: p[0] - q[0], c: (q[1] - p[1]) * p[0] + (p[0] - q[0]) * p[1] };
  }));
  if (intersection.length) return [intersection[0], intersection[0]];
  let pair, distance2 = Infinity;
  for (const [vertices, polygon, reversed] of [[a, b, false], [b, a, true]]) {
    for (const p of vertices) {
      const q = nearest(polygon, p), d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < distance2) { distance2 = d; pair = reversed ? [q, p] : [p, q]; }
    }
  }
  return pair;
}

function nearest(polygon, point) {
  if (!polygon.length) throw new Error('W2 camera framing corridor is infeasible');
  let inside = true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) < -1e-8) {
      inside = false; break;
    }
  }
  if (inside) return point;
  let best, bestD = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const f = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx
      + (point[1] - a[1]) * dy) / Math.max(1e-20, dx * dx + dy * dy)));
    const q = [a[0] + f * dx, a[1] + f * dy];
    const d = (q[0] - point[0]) ** 2 + (q[1] - point[1]) ** 2;
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

// Pack static corridor edges once; the hot projection loop reuses one result.
function packCorridor(polygon) {
  if (!polygon.length) throw new Error('W2 camera framing corridor is infeasible');
  return Float64Array.from(polygon.flatMap((p, i) => {
    const q = polygon[(i + 1) % polygon.length], dx = q[0] - p[0], dy = q[1] - p[1];
    return [p[0], p[1], dx, dy, Math.max(1e-20, dx * dx + dy * dy)];
  }));
}

function projectPacked(edges, x, y, out) {
  let inside = true;
  for (let k = 0; k < edges.length; k += 5) {
    if (edges[k + 2] * (y - edges[k + 1]) - edges[k + 3] * (x - edges[k]) < -1e-8) {
      inside = false; break;
    }
  }
  out[0] = x; out[1] = y;
  if (inside) return;
  let bestD = Infinity;
  for (let k = 0; k < edges.length; k += 5) {
    const f = Math.max(0, Math.min(1, ((x - edges[k]) * edges[k + 2]
      + (y - edges[k + 1]) * edges[k + 3]) / edges[k + 4]));
    const qx = edges[k] + f * edges[k + 2], qy = edges[k + 1] + f * edges[k + 3];
    const d = (qx - x) ** 2 + (qy - y) ** 2;
    if (d < bestD) { bestD = d; out[0] = qx; out[1] = qy; }
  }
}

function smooth(values, sigmaM) {
  const sigma = sigmaM * N / TRACK_LENGTH, radius = Math.ceil(3 * sigma);
  const weights = Array.from({ length: 2 * radius + 1 }, (_, i) =>
    Math.exp(-0.5 * ((i - radius) / sigma) ** 2));
  const sum = weights.reduce((a, b) => a + b, 0);
  return Float64Array.from(values, (_, i) => {
    let v = 0;
    for (let k = -radius; k <= radius; k++) v += values[wrap(i + k)] * weights[k + radius];
    return v / sum;
  });
}

export function buildCompositionRail(aspect, options = {}) {
  const started = performance.now();
  const distance = options.distance ?? COMP.distance;
  const basis = cameraBasis();
  const points = Array.from({ length: N }, (_, i) => curve.getPointAt(i / N));
  const targetY = points.reduce((sum, p) => sum + p.y, 0) / N + 1.066 * COMP.hero;
  // 0.025 NDC slack for interpolation between constraint samples.
  const zone = { x: COMP.railZone.x - 0.025, y: COMP.railZone.y - 0.025 };
  const planes = points.map(p => framingPlanes(p, targetY, aspect, distance, zone));
  const corridors = planes.map(p => clipPolygon(initialPolygon(), p));
  const packed = corridors.map(packCorridor);
  let r = smooth(points.map(p => p.dot(basis.right)), COMP.railSigmaM);
  let g = smooth(points.map(p => p.dot(basis.ground)), COMP.railSigmaM);
  const seedR = r.slice(), seedG = g.slice();
  const locked = new Map();
  const holds = [];
  const unavailableHolds = [];
  let combinedHold = false;
  if (COMP.anchorCorners) {
    const guard = Math.ceil(10 * N / TRACK_LENGTH);
    for (const [name, [from, to]] of Object.entries(CORNER_SPANS)) {
      // Two-sample halo makes B-spline support constant throughout the span.
      const first = Math.floor(from * N) - 2, last = Math.ceil(to * N) + 2;
      let polygon = initialPolygon();
      for (let i = first - guard; i <= last + guard; i++) polygon = clipPolygon(polygon, planes[wrap(i)]);
      // A narrow desktop viewport or dev override can make a stationary sector
      // impossible. Keep a framed deterministic rail and expose the missed hold;
      // never crash or silently change FOV/distance while scrolling.
      if (!polygon.length) {
        unavailableHolds.push(name);
        continue;
      }
      // A single hold minimizes its seed-tether cost within the guarded polygon.
      // The 0.025 NDC constraint slack, not distance from the polygon edge,
      // reserves interpolation/framing room. All-ten entry/exit checks are separate.
      let sr = 0, sg = 0;
      for (let i = first; i <= last; i++) { sr += seedR[wrap(i)]; sg += seedG[wrap(i)]; }
      const point = nearest(polygon, [sr / (last - first + 1), sg / (last - first + 1)]);
      holds.push({ name, first, last, polygon, point });
    }
    // If the combined complex also fits, keep one observation point through the
    // connecting downhill run. Avoid transferring motion into the inter-corner gap.
    let complex = holds.length === 2 ? initialPolygon() : [];
    if (holds.length === 2) for (let i = holds[0].first - guard; i <= holds[1].last + guard; i++) {
      complex = clipPolygon(complex, planes[wrap(i)]);
    }
    if (complex.length) {
      combinedHold = true;
      let sr = 0, sg = 0;
      for (let i = holds[0].first; i <= holds[1].last; i++) { sr += seedR[i]; sg += seedG[i]; }
      const count = holds[1].last - holds[0].first + 1;
      const anchor = nearest(complex, [sr / count, sg / count]);
      holds[0].point = anchor; holds[1].point = anchor;
      for (let i = holds[0].first; i <= holds[1].last; i++) locked.set(wrap(i), anchor);
    } else {
      if (holds.length === 2) [holds[0].point, holds[1].point] = closestPair(holds[0].polygon, holds[1].polygon);
      for (const h of holds) for (let i = h.first; i <= h.last; i++) locked.set(wrap(i), h.point);
    }
  }
  let active = 0;
  // Minimize bending + beta * squared distance to the Gaussian seed, under the
  // framing constraints. The tether removes the translation nullspace and makes
  // the minimizer unique. This is not a camera/car ratio objective.
  const beta = options.beta ?? 1e-4;
  const speedWeight = options.speedWeight ?? COMP.speedWeight ?? 0;
  const cornerWeight = options.cornerWeight ?? COMP.cornerWeight ?? 1;
  const easeM = options.cornerEaseM ?? COMP.cornerEaseM ?? 40;
  // Edge weights are 1 outside the corner approaches, cornerWeight in each
  // curvature-core span, and raised-cosine eased over easeM on both sides.
  // Soft observation points use no hard locks or stationary-feasibility branch.
  const edgeWeights = Float64Array.from({ length: N }, (_, i) => {
    const t = (i + 0.5) / N;
    let strength = 0;
    for (const [from, to] of Object.values(CORNER_SPANS)) {
      const gapM = Math.max(from - t, t - to, 0) * TRACK_LENGTH;
      if (gapM < easeM) strength = Math.max(strength, (1 + Math.cos(Math.PI * gapM / easeM)) / 2);
    }
    return 1 + (cornerWeight - 1) * strength;
  });
  const lipschitz = 16 + beta + 4 * speedWeight * cornerWeight;
  const maxIterations = options.maxIterations ?? 12000;
  const convergenceM = options.convergenceM ?? 0.05;
  if (!(beta > 0)) throw new Error('W2 rail seed tether must be positive');
  const gradient = (values, seed, i) => 6 * values[i]
    - 4 * (values[prev[i]] + values[next[i]])
    + values[prev2[i]] + values[next2[i]] + beta * (values[i] - seed[i])
    + speedWeight * (edgeWeights[i] * (values[i] - values[next[i]])
      + edgeWeights[prev[i]] * (values[i] - values[prev[i]]));
  // A projected-gradient residual gives a conservative Euclidean distance bound
  // to the unique solution: ||x - P(x - grad/L)|| * L/beta. Check the feasible
  // iterate, not FISTA's extrapolation. Options support longer diagnostic runs.
  let iterations = 0, restarts = 0, errorBoundM = Infinity, converged = false;
  let yr = Float64Array.from(r), yg = Float64Array.from(g), momentum = 1;
  let nr = new Float64Array(N), ng = new Float64Array(N);
  const lockFlags = new Uint8Array(N), lockR = new Float64Array(N), lockG = new Float64Array(N);
  for (const [i, p] of locked) { lockFlags[i] = 1; lockR[i] = p[0]; lockG[i] = p[1]; }
  const q = new Float64Array(2);
  const project = (i, x, y) => {
    if (lockFlags[i]) { q[0] = lockR[i]; q[1] = lockG[i]; }
    else projectPacked(packed[i], x, y, q);
  };
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    active = 0; let restartDot = 0;
    for (let i = 0; i < N; i++) {
      const x = yr[i] - gradient(yr, seedR, i) / lipschitz;
      const y = yg[i] - gradient(yg, seedG, i) / lipschitz;
      project(i, x, y);
      if ((x - q[0]) ** 2 + (y - q[1]) ** 2 > 1e-10) active++;
      nr[i] = q[0]; ng[i] = q[1];
      restartDot += (yr[i] - nr[i]) * (nr[i] - r[i])
        + (yg[i] - ng[i]) * (ng[i] - g[i]);
    }
    // Adaptive gradient restart discards momentum when it points uphill.
    const nextMomentum = restartDot > 0 ? 1 : (1 + Math.sqrt(1 + 4 * momentum ** 2)) / 2;
    if (restartDot > 0) restarts++;
    const gain = (momentum - 1) / nextMomentum;
    for (let i = 0; i < N; i++) {
      yr[i] = nr[i] + (restartDot > 0 ? 0 : gain * (nr[i] - r[i]));
      yg[i] = ng[i] + (restartDot > 0 ? 0 : gain * (ng[i] - g[i]));
    }
    const oldR = r, oldG = g;
    r = nr; nr = oldR; g = ng; ng = oldG; momentum = nextMomentum;
    iterations = iteration + 1;
    if (iterations % 50 === 0 || iterations === maxIterations) {
      let residual2 = 0;
      for (let i = 0; i < N; i++) {
        project(i, r[i] - gradient(r, seedR, i) / lipschitz,
          g[i] - gradient(g, seedG, i) / lipschitz);
        residual2 += (r[i] - q[0]) ** 2 + (g[i] - q[1]) ** 2;
      }
      errorBoundM = Math.sqrt(residual2) * lipschitz / beta;
      converged = errorBoundM <= convergenceM;
      if (converged && options.stop !== false) break;
    }
  }
  if (!converged && options.stop !== false) throw new Error(`W2 rail did not converge: ${errorBoundM.toFixed(3)} m bound`);
  const spline = (values, t) => {
    const u = ((t % 1 + 1) % 1) * N, i = Math.floor(u), f = u - i;
    const weights = [(1 - f) ** 3, 3 * f ** 3 - 6 * f * f + 4,
      -3 * f ** 3 + 3 * f * f + 3 * f + 1, f ** 3];
    return weights.reduce((sum, w, k) => sum + w * values[wrap(i + k - 1)] / 6, 0);
  };
  const rail = { aspect, targetY, activeFraction: active / N, unavailableHolds,
    holdState: !COMP.anchorCorners ? (speedWeight > 0 ? 'soft' : 'none')
      : combinedHold ? 'strict-complex' : `strict:${holds.map(h => h.name).join('+') || 'unavailable'}`,
    solver: { beta, speedWeight, cornerWeight, iterations, restarts, errorBoundM, converged },
    holds: holds.map(h => ({ name: h.name, groundAnchor: h.point })),
    at(t, out) {
      return out.copy(basis.right).multiplyScalar(spline(r, t))
        .addScaledVector(basis.ground, spline(g, t)).setY(targetY);
    } };
  // Dev and Node builds check the interpolated rail, not just its table knots.
  // The sphere includes every roster model, roll/bob and FULL lateral amplitude.
  if (options.assertDense ?? (import.meta.env?.DEV ?? true)) {
    let maxResidualM = -Infinity;
    const target = new THREE.Vector3();
    for (let i = 0; i < 4096; i++) {
      const t = i / 4096;
      rail.at(t, target);
      const r = target.dot(basis.right), g = target.dot(basis.ground);
      for (const p of framingPlanes(curve.getPointAt(t), targetY, aspect, distance)) {
        maxResidualM = Math.max(maxResidualM, (p.a * r + p.b * g - p.c) / Math.hypot(p.a, p.b));
      }
    }
    rail.denseCheck = { samples: 4096, maxResidualM };
    if (!(maxResidualM <= 1e-5)) throw new Error(`W2 dense framing residual: ${maxResidualM.toFixed(3)} m`);
  }
  rail.buildMs = performance.now() - started;
  return rail;
}
