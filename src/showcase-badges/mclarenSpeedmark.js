import * as THREE from 'three';

/**
 * McLaren Speedmark as a sculpted, physical emblem, built procedurally (no asset file).
 *
 * Construction: the Speedmark outline (McLaren_Speedmark.svg, Wikimedia Commons) splits at its two
 * tips into an inner (concave) and an outer (convex) edge. Rays from a pole inside the pocket cut
 * both edges once each, giving "rungs" across the blade. Each rung carries a cross-section:
 *   - a crowned papaya face (dome across the rung, height tapering with the blade's width),
 *   - a thin polished bead rim on both edges (inset perpendicular to the outline),
 *   - a lower, satin-finished domed back.
 * Height scales with the local width, so the blade thins smoothly into both tips. A slight
 * spherical sweep pulls the tips back from the head so highlights travel during rotation.
 * Normals come from finite differences of the analytic surface (smooth crowns, crisp creases
 * where the crown meets the rim).
 */

// Absolute cubic segments of the SVG path (SVG units, y down). INNER: bottom tip to left tip;
// OUTER: left tip to bottom tip. Arcs were converted to cubics.
const INNER = [
  [426.74, 451.28, 430.38, 446.41, 434.06, 441.56, 437.67, 436.66],
  [437.67, 436.66, 460.12, 406.13, 480.67, 374.47, 494.28, 338.84],
  [494.28, 338.84, 500.5, 322.58, 504.79, 305.9, 505.28, 288.36],
  [505.28, 288.36, 506.11, 256.15, 492.34, 231.89, 465.39, 214.86],
  [465.39, 214.86, 444.33, 201.56, 420.81, 195.06, 396.56, 190.95],
  [396.56, 190.95, 352.37, 183.46, 307.97, 184.12, 263.56, 187.79],
  [263.56, 187.79, 191.86, 193.79, 120.96, 207.16, 52, 227.7],
  [52, 227.7, 36.07, 232.41, 20.48, 238.24, 4.73, 243.56],
  [4.73, 243.56, 3.31, 244.18, 1.73, 244.37, 0.2, 244.1],
];
const OUTER = [
  [0.2, 244.1, 11.77, 237.03, 23.29, 229.89, 34.9, 222.9],
  [34.9, 222.9, 105.02, 180.59, 178.03, 143.28, 253.4, 111.24],
  [253.4, 111.24, 347.6, 71.31, 444.06, 38.24, 544.4, 17.3],
  [544.4, 17.3, 594.51, 6.84, 645.06, -0.54, 696.45, -0.07],
  [696.45, -0.07, 723.86, 0.19, 751, 2.63, 777, 12.08],
  [777, 12.08, 789.83, 16.74, 801.67, 23.17, 810.74, 33.64],
  [810.74, 33.64, 826.25, 51.53, 826.52, 72.06, 820.23, 93.42],
  [820.23, 93.42, 813.3, 116.95, 800.37, 137.32, 785.81, 156.7],
  [785.81, 156.7, 757.64, 194.2, 724.2, 226.7, 689.2, 257.7],
  [689.2, 257.7, 626.34, 313.31, 558.8, 362.84, 489.7, 410.31],
  [489.7, 410.31, 469.13, 424.45, 448.34, 438.31, 427.2, 451.8],
];
const TIP_B = [427.2, 451.8]; // bottom tip (shared)
const POLE = [330, 425]; // inside the pocket; both edges are monotonic in angle about it

// Shape parameters, in emblem units (visible face spans 1).
export const SPEEDMARK_PARAMS = {
  rim: 0.011, // planar width of the polished bead rim
  crown: 0.040, // crown rise of the face above the rim crease (at full width)
  edge: 0.013, // height of the front crease above the mid-plane (at full width)
  edgeBack: 0.010, // depth of the back crease below the mid-plane
  backDome: 0.012, // back crown depth
  widthRef: 0.085, // thickness saturates once the blade is wider than about this
  domePower: 0.8, // below 1 broadens the crown and steepens it near the rim
  crest: 0.56, // where the face crown peaks across the blade (0 inner edge, 1 outer edge)
  rimShape: 2.3, // superellipse exponent of the rim bead (2 = elliptical)
  sweep: 0.11, // spherical sweep: tips pulled back by sweep * r^2
  head: [0.22, 0.12], // sweep centre (emblem coords)
};

const SEG = { u: 168, crown: 34, back: 16, rim: 10 };

function bez(seg, t) {
  const m = 1 - t;
  const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [a * seg[0] + b * seg[2] + c * seg[4] + d * seg[6], a * seg[1] + b * seg[3] + c * seg[5] + d * seg[7]];
}

function samplePath(segs, perUnit) {
  const pts = [];
  segs.forEach((seg, k) => {
    const len = Math.hypot(seg[6] - seg[0], seg[7] - seg[1]) + 1e-6;
    const n = Math.max(4, Math.ceil(len * perUnit));
    for (let i = k === 0 ? 0 : 1; i <= n; i++) pts.push(bez(seg, i / n));
  });
  return pts;
}

function bsearch(arr, value, hi) {
  let lo = 0;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (arr[mid] <= value) lo = mid; else hi = mid; }
  return lo;
}

/** Polyline parameterised by polar angle about POLE (monotonic), with a lookup by angle. */
function angularCurve(pts, reverse) {
  if (reverse) pts = pts.slice().reverse();
  const ang = pts.map(([x, y]) => Math.atan2(-(y - POLE[1]), x - POLE[0])); // y-up angle
  let wobble = 0;
  for (let i = 1; i < ang.length; i++) {
    while (ang[i] - ang[i - 1] > Math.PI) ang[i] -= 2 * Math.PI;
    while (ang[i] - ang[i - 1] < -Math.PI) ang[i] += 2 * Math.PI;
    if (ang[i] <= ang[i - 1]) { wobble++; ang[i] = ang[i - 1] + 1e-9; } // defensive
  }
  const last = ang.length - 1;
  return {
    a0: ang[0], a1: ang[last], wobble,
    at(a) {
      if (a <= ang[0]) return pts[0];
      if (a >= ang[last]) return pts[last];
      const lo = bsearch(ang, a, last), hi = lo + 1;
      const t = (a - ang[lo]) / (ang[hi] - ang[lo]);
      return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
    },
  };
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
function norm(a) { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }

function buildSurface(P) {
  // Edges, both running bottom tip to left tip (increasing angle about the pole).
  const innerPts = samplePath(INNER, 6);
  innerPts[0] = TIP_B.slice();
  const outerPts = samplePath(OUTER, 6);
  const inner = angularCurve(innerPts, false);
  const outer = angularCurve(outerPts, true);
  const aStart = Math.max(inner.a0, outer.a0), aEnd = Math.min(inner.a1, outer.a1);

  // Emblem frame: x right, y up, 1 unit = larger bbox side.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of innerPts.concat(outerPts)) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const toE = ([x, y]) => [(x - cx) / span, -(y - cy) / span];

  // Arc-length reparameterisation u in [0,1] to angle (mean of both edges' lengths).
  const N = 2048, table = new Float64Array(N + 1);
  let prevI = toE(inner.at(aStart)), prevO = toE(outer.at(aStart));
  for (let i = 1; i <= N; i++) {
    const a = aStart + (aEnd - aStart) * (i / N);
    const pi = toE(inner.at(a)), po = toE(outer.at(a));
    table[i] = table[i - 1] + 0.5 * (Math.hypot(pi[0] - prevI[0], pi[1] - prevI[1]) + Math.hypot(po[0] - prevO[0], po[1] - prevO[1]));
    prevI = pi; prevO = po;
  }
  const total = table[N];
  function angleOf(u) {
    const target = Math.min(1, Math.max(0, u)) * total;
    const lo = Math.min(N - 1, bsearch(table, target, N)), hi = lo + 1;
    const t = (target - table[lo]) / Math.max(1e-12, table[hi] - table[lo]);
    return aStart + (aEnd - aStart) * ((lo + t) / N);
  }

  const smoothW = (w) => 1 - Math.exp(-w / P.widthRef);
  const sweep = (x, y) => -P.sweep * ((x - P.head[0]) ** 2 + (y - P.head[1]) ** 2);

  // Rung data at u. Edge normals come from a finite difference along each edge.
  function rung(u) {
    const h = 1.5e-3;
    const a = angleOf(u), aa = angleOf(u - h), ab = angleOf(u + h);
    const I = toE(inner.at(a)), O = toE(outer.at(a));
    const dI = sub(toE(inner.at(ab)), toE(inner.at(aa))), dO = sub(toE(outer.at(ab)), toE(outer.at(aa)));
    const across = sub(O, I);
    const W = Math.hypot(across[0], across[1]);
    let nI = norm([-dI[1], dI[0]]); if (dot(nI, across) < 0) nI = [-nI[0], -nI[1]];
    let nO = norm([-dO[1], dO[0]]); if (dot(nO, across) > 0) nO = [-nO[0], -nO[1]];
    const rw = 1 / (1 / P.rim + 5 / Math.max(W, 1e-9));
    const f = smoothW(W);
    return {
      I, O, W,
      Ii: [I[0] + nI[0] * rw, I[1] + nI[1] * rw],
      Oi: [O[0] + nO[0] * rw, O[1] + nO[1] * rw],
      E: P.edge * f, Eb: P.edgeBack * f, T: P.crown * f, Tb: P.backDome * f,
    };
  }

  const dome = (s) => Math.pow(Math.max(0, 4 * s * (1 - s)), P.domePower);
  const crestK = Math.log(0.5) / Math.log(P.crest);
  const crownDome = (s) => dome(Math.pow(s, crestK));
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  function rimPoint(inset, edge, r, v) {
    const psi = v * Math.PI, e = 2 / P.rimShape;
    const o = Math.pow(Math.sin(psi), e), c = sp(Math.cos(psi), e);
    const x = inset[0] + (edge[0] - inset[0]) * o, y = inset[1] + (edge[1] - inset[1]) * o;
    const zm = (r.E - r.Eb) / 2, H = (r.E + r.Eb) / 2;
    return [x, y, zm + H * c + sweep(x, y)];
  }

  // Patch functions F(v, rungData) giving [x, y, z].
  const patches = {
    crown(s, r) {
      const x = r.Ii[0] + (r.Oi[0] - r.Ii[0]) * s, y = r.Ii[1] + (r.Oi[1] - r.Ii[1]) * s;
      return [x, y, r.E + r.T * crownDome(s) + sweep(x, y)];
    },
    back(s, r) {
      const x = r.Ii[0] + (r.Oi[0] - r.Ii[0]) * s, y = r.Ii[1] + (r.Oi[1] - r.Ii[1]) * s;
      return [x, y, -r.Eb - r.Tb * dome(s) + sweep(x, y)];
    },
    rimIn(v, r) { return rimPoint(r.Ii, r.I, r, v); },
    rimOut(v, r) { return rimPoint(r.Oi, r.O, r, v); },
  };

  return { patches, rung, wobble: inner.wobble + outer.wobble };
}

/** Builds the geometry: material groups 0 = face (crown), 1 = rim, 2 = back. */
export function buildSpeedmarkGeometry(params = {}) {
  const P = { ...SPEEDMARK_PARAMS, ...params };
  const { patches, rung } = buildSurface(P);
  const nu = SEG.u;
  const pos = [], nrm = [], idx = [];
  const groups = [];
  // Rung data on the u grid, plus neighbours for the u-derivative. Tips are degenerate (zero
  // width), so normals there are evaluated a little inside the blade.
  const du = 0.35 / nu;
  const rungs = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const ue = Math.min(1 - 2 * du, Math.max(2 * du, u));
    rungs.push({ at: rung(u), en: rung(ue), lo: rung(ue - du), hi: rung(ue + du) });
  }

  function addPatch(name, nv, outward, group) {
    const F = patches[name];
    const start = idx.length, base = pos.length / 3;
    const dv = 0.25 / nv;
    let flip = 0;
    for (let i = 0; i <= nu; i++) {
      const R = rungs[i];
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        const p = F(v, R.at);
        pos.push(p[0], p[1], p[2]);
        const pu0 = F(v, R.lo), pu1 = F(v, R.hi);
        const pv0 = F(Math.max(0, v - dv), R.en), pv1 = F(Math.min(1, v + dv), R.en);
        const a = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
        const b = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
        const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        if (i === Math.floor(nu / 2) && j === Math.floor(nv / 2)) flip = outward(n, R.at) ? 1 : -1;
        nrm.push(n[0] / l, n[1] / l, n[2] / l);
      }
    }
    // Orient normals outward and wind triangles to match.
    if (flip < 0) for (let k = base * 3; k < nrm.length; k++) nrm[k] = -nrm[k];
    const row = nv + 1;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * row + j, b = a + row, c = b + 1, d = a + 1;
        if (flip > 0) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
      }
    }
    groups.push([start, idx.length - start, group]);
  }

  addPatch('crown', SEG.crown, (n) => n[2] > 0, 0);
  addPatch('rimIn', SEG.rim, (n, r) => n[0] * (r.I[0] - r.Ii[0]) + n[1] * (r.I[1] - r.Ii[1]) > 0, 1);
  addPatch('rimOut', SEG.rim, (n, r) => n[0] * (r.O[0] - r.Oi[0]) + n[1] * (r.O[1] - r.Oi[1]) > 0, 1);
  addPatch('back', SEG.back, (n) => n[2] < 0, 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setIndex(idx);
  for (const [start, count, m] of groups) {
    const last = geometry.groups[geometry.groups.length - 1];
    if (last && last.materialIndex === m && last.start + last.count === start) last.count += count;
    else geometry.addGroup(start, count, m);
  }
  // Centre in all three axes (the planar span is 1 by construction).
  geometry.computeBoundingBox();
  const c = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, -c.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Face base colour sits a little redder than Ref 1's #FF8000 so that, after ACES tone mapping and
// the clearcoat's reflection, the rendered face reads as papaya (median about rgb(240,125,50)).
const PAPAYA = 0xff6a00;
const FINISH = {
  day: { rim: 0x8f949b, back: 0xd9600c },
  night: { rim: 0xc4c9d0, back: 0xe0680f },
};

/**
 * Standalone McLaren Speedmark. Face toward +Z, +Y up, visible face spans 1 unit, centred.
 * Returns { object, setTheme(theme), dispose() }.
 */
export function createSpeedmark({ theme = 'day' } = {}) {
  const geometry = buildSpeedmarkGeometry();
  const face = new THREE.MeshPhysicalMaterial({
    name: 'speedmark-papaya', color: PAPAYA, metalness: 0.38, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.08,
  });
  const rim = new THREE.MeshPhysicalMaterial({ name: 'speedmark-rim', color: FINISH.day.rim, metalness: 1, roughness: 0.12 });
  const back = new THREE.MeshPhysicalMaterial({ name: 'speedmark-back', color: FINISH.day.back, metalness: 0.55, roughness: 0.45 });
  const mesh = new THREE.Mesh(geometry, [face, rim, back]);
  mesh.name = 'mclaren-speedmark';
  const object = new THREE.Group();
  object.name = 'mclaren-speedmark-root';
  object.add(mesh);

  function setTheme(next) {
    const f = FINISH[next] ?? FINISH.day;
    rim.color.set(f.rim);
    back.color.set(f.back);
  }
  setTheme(theme);

  return {
    object,
    setTheme,
    dispose() {
      object.remove(mesh);
      geometry.dispose();
      face.dispose(); rim.dispose(); back.dispose();
    },
  };
}
