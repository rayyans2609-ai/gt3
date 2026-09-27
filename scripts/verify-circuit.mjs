/** Deterministic route geometry and browser terrain probes. GT3_URL defaults to 5173. */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { TRACK_LENGTH, pointAt, tangentAt, curvatureAt } from '../src/scene/trackCurve.js';
import { trackEdges } from '../src/scene/track.js';

const base = process.env.GT3_URL || 'http://localhost:5173';
const step = 5;
const separateSectionsAfterMetres = 250;
// main @ 66ba94c, sampled at 1 m and excluding the open end derivatives.
const oldPeakPhysicalCurvature = 0.017656143207258803;
const count = Math.ceil(TRACK_LENGTH / step);
const points = Array.from({ length: count }, (_, i) => pointAt(i / count));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function intersects(a, b, c, d) {
  return cross(a, b, c) * cross(a, b, d) < 0
    && cross(c, d, a) * cross(c, d, b) < 0;
}
let minimum = Infinity;
let closestPair = [];
let crossings = 0;
for (let i = 0; i < count; i++) {
  const a = points[i], b = points[(i + 1) % count];
  for (let j = i + 1; j < count; j++) {
    const arc = Math.min(j - i, count - j) * TRACK_LENGTH / count;
    const c = points[j], d = points[(j + 1) % count];
    if (arc >= 10 && intersects(a, b, c, d)) crossings++;
    if (arc >= separateSectionsAfterMetres) {
      const gap = Math.min(distance(a, c), distance(a, d), distance(b, c), distance(b, d));
      if (gap < minimum) { minimum = gap; closestPair = [i / count, j / count]; }
    }
  }
}
let low = Infinity, high = -Infinity, peak = 0;
for (let i = 0; i < count; i++) {
  const t = i / count;
  low = Math.min(low, points[i].y); high = Math.max(high, points[i].y);

}
for (let i = 0, n = Math.ceil(TRACK_LENGTH); i < n; i++) {
  const t = i / n;
  const a = tangentAt((t - 2 / TRACK_LENGTH + 1) % 1).setY(0).normalize();
  const b = tangentAt((t + 2 / TRACK_LENGTH) % 1).setY(0).normalize();
  peak = Math.max(peak, a.angleTo(b) / 4);
}
const seam = pointAt(0).distanceTo(pointAt(1));
const tangentGap = tangentAt(0).angleTo(tangentAt(1)) * 180 / Math.PI;
const curvatureGap = Math.abs(curvatureAt(0) - curvatureAt(1));
const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minZ = Math.min(...zs), maxZ = Math.max(...zs);
const scale = 900 / Math.max(maxX - minX, maxZ - minZ);
const path = points.map((p, i) => `${i ? 'L' : 'M'}${(50 + (p.x - minX) * scale).toFixed(2)},${(50 + (p.z - minZ) * scale).toFixed(2)}`).join(' ') + ' Z';
fs.writeFileSync('/tmp/gt3-route-after.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="#f5f5f2"/><path d="${path}" fill="none" stroke="#252528" stroke-width="7"/><circle cx="${50 - minX * scale}" cy="${50 - minZ * scale}" r="11" fill="#cb3030"/></svg>`);
console.log('GEOMETRY', JSON.stringify({ length: TRACK_LENGTH, closureGap: seam, seamTangentDegrees: tangentGap,
  seamCurvatureDifference: curvatureGap, nonAdjacentMinimum: minimum,
  minimumArcExclusionMetres: separateSectionsAfterMetres, closestPair, crossings,
  elevationRange: [low, high], peakPhysicalCurvature: peak, oldPeakPhysicalCurvature }));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--no-first-run', '--user-data-dir=/tmp/gt3-circuit-verify',
    '--window-size=1280,800', '--enable-gpu', '--use-gl=angle', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('grass-skirts-and-horizon'),
  { timeout: 120000 });
const route = points.map((p) => [p.x, p.y, p.z]);
const shoulderSamples = [];
for (let i = 0; i < 20; i++) {
  const at = Math.floor(i * (trackEdges.left.length - 1) / 20);
  const left = trackEdges.left[at], right = trackEdges.right[at];
  const centreX = (left.x + right.x) * 0.5;
  const centreZ = (left.z + right.z) * 0.5;
  for (const edge of [left, right]) {
    const dx = edge.x - centreX, dz = edge.z - centreZ;
    const length = Math.hypot(dx, dz);
    shoulderSamples.push([edge.x + dx / length * 2, edge.z + dz / length * 2]);
  }
}
const checks = await page.evaluate(async ({ route, bounds, shoulderSamples }) => {
  const THREE = await import('/node_modules/.vite/deps/three.js');
  const root = window.__gt3.scene;
  const grass = root.getObjectByName('grass-skirts-and-horizon');
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const grid = { rays: 0, multiple: 0, none: 0, maximum: 0, emptyPositions: [] };
  const stepX = (bounds.maxX - bounds.minX + 100) / 12;
  const stepZ = (bounds.maxZ - bounds.minZ + 100) / 12;
  for (let ix = 0; ix < 12; ix++) for (let iz = 0; iz < 12; iz++) {
    const x = bounds.minX - 50 + (ix + 0.37) * stepX;
    const z = bounds.minZ - 50 + (iz + 0.61) * stepZ;
    ray.set(new THREE.Vector3(x, 1000, z), down);
    const n = ray.intersectObject(grass, false).length;
    grid.rays++; grid.maximum = Math.max(grid.maximum, n);
    if (n > 1) grid.multiple++;
    if (!n) { grid.none++; grid.emptyPositions.push([x, z]); }
  }
  const dressing = ['roadside-trees', 'distance-markers', 'corner-tire-stacks', 'distant-grandstands']
    .map((name) => root.getObjectByName(name)).filter(Boolean);
  const nearest = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < route.length; i++) {
      const a = route[i], b = route[(i + 1) % route.length];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - a[0] - u * dx, z - a[2] - u * dz));
    }
    return best;
  };
  const footprints = { 'roadside-trees': 4.5, 'distance-markers': 1.5,
    'corner-tire-stacks': 1.5, 'distant-grandstands': 23 };
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const clearance = { instances: 0, violations: [], minimumMargin: Infinity };
  for (const mesh of dressing) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale);
    const margin = nearest(position.x, position.z) - (7 + 22 + footprints[mesh.name] * scale.x);
    clearance.instances++; clearance.minimumMargin = Math.min(clearance.minimumMargin, margin);
    if (margin < -0.1) clearance.violations.push({ mesh: mesh.name, i, margin });
  }
  const occlusion = { rays: 0, terrainHits: [], dressingHits: 0 };
  for (let i = 0; i < 20; i++) {
    const p = route[Math.floor(i * route.length / 20)];
    const target = new THREE.Vector3(p[0], p[1] + 2.5, p[2]);
    for (const pitch of [45, 60]) for (const length of [65, 115]) for (const yaw of [0, 90, 180, 270]) {
      const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180;
      const camera = target.clone().add(new THREE.Vector3(
        Math.cos(a) * Math.cos(b) * length, Math.sin(b) * length,
        Math.sin(a) * Math.cos(b) * length));
      const direction = target.clone().sub(camera).normalize();
      ray.set(camera, direction); ray.far = length - 3;
      const hits = ray.intersectObject(grass, false);
      occlusion.rays++;
      if (hits.length) occlusion.terrainHits.push({ t: i / 20, pitch, length, yaw, distance: hits[0].distance });
      if (ray.intersectObjects(dressing, false).length) occlusion.dressingHits++;
    }
  }
  grid.uncoveredOffRoad = grid.emptyPositions.filter(([x, z]) => nearest(x, z) > 13).length;
  const environment = await import('/src/scene/environment.js');
  const heightAgreement = { samples: 0, maximumError: 0, missing: 0 };
  for (const [x, z] of shoulderSamples) {
    ray.set(new THREE.Vector3(x, 1000, z), down); ray.far = Infinity;
    const hit = ray.intersectObject(grass, false)[0];
    if (!hit) { heightAgreement.missing++; continue; }
    const error = Math.abs(hit.point.y - environment.groundHeightAt(x, z));
    heightAgreement.maximumError = Math.max(heightAgreement.maximumError, error);
    heightAgreement.samples++;
  }
  const grassTriangles = grass.geometry.index.count / 3;
  return { grid, occlusion, clearance, heightAgreement, grassTriangles,
    dressingCounts: dressing.map((m) => [m.name, m.count]) };
}, { route, shoulderSamples, bounds: { minX, maxX, minZ, maxZ } });
console.log('TERRAIN', JSON.stringify(checks));
console.log('CONSOLE_ERRORS', JSON.stringify(errors));
await browser.close();
