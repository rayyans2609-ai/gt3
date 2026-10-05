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

// Roster accessor bounds: 4.6 × <=2.823 × <=2.132 m after normalization.
// A sphere about y=1.066 covers that box, ±3.4° body roll and ±0.035 m bob.
// Adding the FULL racing-line amplitude protects every lateral position, not
// only the actual line. Exact all-ten projected boxes are checked in node.
export const framingRadiusM = () => 3.05 * COMP.hero + COMP.racingLineM;

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
  const basis = cameraBasis();
  const points = Array.from({ length: N }, (_, i) => curve.getPointAt(i / N));
  const targetY = points.reduce((sum, p) => sum + p.y, 0) / N + 1.066 * COMP.hero;
  // 0.025 NDC slack for interpolation between constraint samples.
  const zone = { x: COMP.railZone.x - 0.025, y: COMP.railZone.y - 0.025 };
  const planes = points.map(p => framingPlanes(p, targetY, aspect, COMP.distance, zone));
  const corridors = planes.map(p => clipPolygon(initialPolygon(), p));
  let r = smooth(points.map(p => p.dot(basis.right)), COMP.railSigmaM);
  let g = smooth(points.map(p => p.dot(basis.ground)), COMP.railSigmaM);
  const seedR = r.slice(), seedG = g.slice();
  const locked = new Map();
  const holds = [];
  const unavailableHolds = [];
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
      // Interior anchor reserves entry/exit room. Choosing the closest boundary
      // pair used up that reserve and forced acceleration just outside the hold.
      const point = polygon.reduce((s, p) => [s[0] + p[0] / polygon.length,
        s[1] + p[1] / polygon.length], [0, 0]);
      holds.push({ name, first, last, polygon, point });
    }
    // If the combined complex also fits, keep one observation point through the
    // connecting downhill run. Avoid transferring motion into the inter-corner gap.
    let complex = holds.length === 2 ? initialPolygon() : [];
    if (holds.length === 2) for (let i = holds[0].first - guard; i <= holds[1].last + guard; i++) {
      complex = clipPolygon(complex, planes[wrap(i)]);
    }
    if (complex.length) {
      const anchor = complex.reduce((s, p) => [s[0] + p[0] / complex.length,
        s[1] + p[1] / complex.length], [0, 0]);
      holds[0].point = anchor; holds[1].point = anchor;
      for (let i = holds[0].first; i <= holds[1].last; i++) locked.set(wrap(i), anchor);
    } else {
      for (const h of holds) for (let i = h.first; i <= h.last; i++) locked.set(wrap(i), h.point);
    }
  }
  let active = 0;
  // Minimize bending + beta * squared distance to the Gaussian seed, under the
  // framing constraints. The tether removes the translation nullspace and makes
  // the minimizer unique. This is not a camera/car ratio objective.
  const beta = options.beta ?? 1e-4, lipschitz = 16 + beta;
  const maxIterations = options.maxIterations ?? 12000;
  const convergenceM = options.convergenceM ?? 0.05;
  if (!(beta > 0)) throw new Error('W2 rail seed tether must be positive');
  const gradient = (values, seed, i) => 6 * values[i]
    - 4 * (values[wrap(i - 1)] + values[wrap(i + 1)])
    + values[wrap(i - 2)] + values[wrap(i + 2)] + beta * (values[i] - seed[i]);
  // A projected-gradient residual gives a conservative Euclidean distance bound
  // to the unique solution: ||x - P(x - grad/L)|| * L/beta. Check the feasible
  // iterate, not FISTA's extrapolation. Options support longer diagnostic runs.
  let iterations = 0, restarts = 0, errorBoundM = Infinity, converged = false;
  let yr = Float64Array.from(r), yg = Float64Array.from(g), momentum = 1;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const nr = new Float64Array(N), ng = new Float64Array(N);
    active = 0; let restartDot = 0;
    for (let i = 0; i < N; i++) {
      const p = [yr[i] - gradient(yr, seedR, i) / lipschitz,
        yg[i] - gradient(yg, seedG, i) / lipschitz];
      const q = locked.get(i) || nearest(corridors[i], p);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) active++;
      [nr[i], ng[i]] = q;
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
    r = nr; g = ng; momentum = nextMomentum;
    iterations = iteration + 1;
    if (iterations % 50 === 0 || iterations === maxIterations) {
      let residual2 = 0;
      for (let i = 0; i < N; i++) {
        const p = [r[i] - gradient(r, seedR, i) / lipschitz,
          g[i] - gradient(g, seedG, i) / lipschitz];
        const q = locked.get(i) || nearest(corridors[i], p);
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
  return { aspect, targetY, activeFraction: active / N, unavailableHolds,
    buildMs: performance.now() - started,
    solver: { beta, iterations, restarts, errorBoundM, converged },
    holds: holds.map(h => ({ name: h.name, groundAnchor: h.point })),
    at(t, out) {
      return out.copy(basis.right).multiplyScalar(spline(r, t))
        .addScaledVector(basis.ground, spline(g, t)).setY(targetY);
    } };
}
