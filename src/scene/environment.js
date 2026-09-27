/**
 * environment.js — grass, sky and sparse circuit dressing. (SPEC §6, §11, §14)
 *
 * Everything in this module is built once. The broad grass surface is one mesh and
 * every dressing category is one InstancedMesh so the environment remains cheap to
 * stream past the camera for the whole route.
 */

import * as THREE from 'three';
import poly2tri from 'poly2tri/dist/poly2tri.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from './sceneSetup.js';
import * as trackSurface from './track.js';
import {
  TRACK,
  TRACK_LENGTH,
  curvatureAt,
  offsetPointAt,
  pointAt,
  tangentAt,
} from './trackCurve.js';

const GRASS_BASE = new THREE.Color('#3F6E50');
const GRASS_LIGHT = new THREE.Color('#4C7F5C');
const UP = new THREE.Vector3(0, 1, 0);
const ASPHALT_CLEARANCE = 22;

export const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
  flatShading: false,
  vertexColors: true,
});

export const skyUniforms = {
  // buildEnvironment replaces this fallback with scene.fog.color itself. Sharing
  // the Color object keeps the atmospheric join exact through time-of-day updates.
  uHorizon: { value: new THREE.Color() },
  uZenith: { value: new THREE.Color('#778796') },
  uSunDir: { value: new THREE.Vector3(-0.48, 0.66, -0.58).normalize() },
  uSunColor: { value: new THREE.Color('#F2D6AB') },
  uSunIntensity: { value: 0.34 },
};

const skyMaterial = new THREE.ShaderMaterial({
  name: 'GT3SkyGradient',
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: skyUniforms,
  vertexShader: /* glsl */ `
    varying vec3 vDirection;

    void main() {
      vDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      // Keep the dome behind the world even when its physical radius exceeds the
      // camera/fog range.
      gl_Position.z = gl_Position.w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizon;
    uniform vec3 uZenith;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    varying vec3 vDirection;

    void main() {
      vec3 direction = normalize(vDirection);
      // Exactly uHorizon at y == 0; the sky then lifts gradually into a restrained
      // cool-grey zenith rather than creating a bright stripe above the ground.
      float heightMix = smoothstep(0.0, 0.88, direction.y);
      vec3 sky = mix(uHorizon, uZenith, heightMix);
      float sunFacing = max(dot(direction, normalize(uSunDir)), 0.0);
      float broadGlow = pow(sunFacing, 10.0);
      float softCore = pow(sunFacing, 48.0) * 0.22;
      float aboveHorizon = smoothstep(0.0, 0.08, direction.y);
      sky += uSunColor * (broadGlow + softCore) * uSunIntensity * aboveHorizon;
      gl_FragColor = vec4(sky, 1.0);
    }
  `,
});

export const backgroundLayer = new THREE.Group();
backgroundLayer.name = 'environment-background-parallax';

const parallaxTarget = new THREE.Vector3();
let environmentRoot = null;
let dressingCountLogged = false;

// ---------------------------------------------------------------------------
// Public lighting/parallax hooks
// ---------------------------------------------------------------------------

export function setSky(partial = {}) {
  for (const [name, nextValue] of Object.entries(partial)) {
    const uniform = skyUniforms[name];
    if (!uniform || nextValue == null) continue;

    if (uniform.value?.isColor) {
      uniform.value.set(nextValue?.isColor ? nextValue : nextValue);
    } else if (uniform.value?.isVector3) {
      if (nextValue?.isVector3) uniform.value.copy(nextValue);
      else if (Array.isArray(nextValue)) uniform.value.fromArray(nextValue);
      else if (typeof nextValue === 'object') {
        uniform.value.set(nextValue.x, nextValue.y, nextValue.z);
      }
      if (uniform.value.lengthSq() > 0) uniform.value.normalize();
    } else if (typeof nextValue === 'number') {
      uniform.value = nextValue;
    }
  }
}

export function setGroundTint(color, amount = 0) {
  grassMaterial.color.set(0xffffff).lerp(
    color?.isColor ? color : new THREE.Color(color),
    THREE.MathUtils.clamp(amount, 0, 1),
  );
}

export function setParallax(x = 0, y = 0) {
  const cursor = new THREE.Vector2(
    THREE.MathUtils.clamp(x, -1, 1),
    THREE.MathUtils.clamp(y, -1, 1),
  );
  if (cursor.lengthSq() > 1) cursor.normalize();
  parallaxTarget.set(cursor.x * 1.2, cursor.y * 1.2, 0);
}

function updateEnvironment(dt = 1 / 60) {
  const blend = 1 - Math.exp(-Math.max(0, dt) * 3.2);
  backgroundLayer.position.lerp(parallaxTarget, blend);
}

// ---------------------------------------------------------------------------
// Deterministic value noise shared by grass shape and colour
// ---------------------------------------------------------------------------

function randomGrid(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return (value - Math.floor(value)) * 2 - 1;
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = THREE.MathUtils.lerp(randomGrid(ix, iz), randomGrid(ix + 1, iz), sx);
  const b = THREE.MathUtils.lerp(randomGrid(ix, iz + 1), randomGrid(ix + 1, iz + 1), sx);
  return THREE.MathUtils.lerp(a, b, sz);
}

function terrainNoise(x, z) {
  return valueNoise(x / 66, z / 66) * 0.72
    + valueNoise(x / 48 + 19.7, z / 48 - 8.3) * 0.28;
}

function terrainDisplacement(x, z, distanceFromAsphalt) {
  const detailFade = THREE.MathUtils.smoothstep(distanceFromAsphalt, 18, 38);
  // The original 48–66 m detail reads only once the mesh can sample it. A
  // longer wave gives the single continuous terrain the broad landform that
  // the former crossing skirts suggested through their overlapping slopes.
  const landform = valueNoise(x / 210 + 4.1, z / 210 - 2.7) * 19
    + valueNoise(x / 360 - 8.6, z / 360 + 13.4) * 9;
  // Let hills rise over a longer run than the small surface detail. Pushing a
  // 10–20 m landform through the narrow shoulder fade made a dark contour that
  // followed the road exactly, even with a well-shaped mesh.
  const landformFade = THREE.MathUtils.smoothstep(distanceFromAsphalt, 18, 110);
  return terrainNoise(x, z) * 5.2 * detailFade + landform * landformFade;
}

const groundRoute = (() => {
  const left = trackSurface?.trackEdges?.left;
  const right = trackSurface?.trackEdges?.right;
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return left.map((edge, index) => edge.clone().add(right[index]).multiplyScalar(0.5));
  }

  const samples = Math.max(800, Math.ceil(TRACK_LENGTH / 2));
  return Array.from({ length: samples + 1 }, (_, index) => {
    const point = pointAt(index / samples, new THREE.Vector3());
    point.y -= 0.03;
    return point;
  });
})();

// A static bounding-volume tree over the sampled route. Height and clearance
// queries use exact segment projections; the tree only removes distant work.
function buildRouteTree(indices) {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const i of indices) {
    const a = groundRoute[i];
    const b = groundRoute[i + 1];
    bounds.minX = Math.min(bounds.minX, a.x, b.x);
    bounds.maxX = Math.max(bounds.maxX, a.x, b.x);
    bounds.minZ = Math.min(bounds.minZ, a.z, b.z);
    bounds.maxZ = Math.max(bounds.maxZ, a.z, b.z);
  }
  if (indices.length <= 10) return { ...bounds, indices };
  const axis = bounds.maxX - bounds.minX > bounds.maxZ - bounds.minZ ? 'x' : 'z';
  indices.sort((a, b) => (
    groundRoute[a][axis] + groundRoute[a + 1][axis]
    - groundRoute[b][axis] - groundRoute[b + 1][axis]
  ));
  const middle = indices.length >> 1;
  return {
    ...bounds,
    left: buildRouteTree(indices.slice(0, middle)),
    right: buildRouteTree(indices.slice(middle)),
  };
}
const routeTree = buildRouteTree(Array.from({ length: groundRoute.length - 1 }, (_, i) => i));

function routeProjection(x, z) {
  let closestDistanceSq = Infinity;
  let closestBaseY = groundRoute[0]?.y ?? -0.03;
  function boxDistanceSq(node) {
    const dx = Math.max(node.minX - x, 0, x - node.maxX);
    const dz = Math.max(node.minZ - z, 0, z - node.maxZ);
    return dx * dx + dz * dz;
  }
  function visit(node) {
    if (boxDistanceSq(node) >= closestDistanceSq) return;
    if (node.indices) {
      for (const i of node.indices) {
        const a = groundRoute[i];
        const b = groundRoute[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSq = dx * dx + dz * dz;
        const along = lengthSq > 1e-8
          ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
          : 0;
        const offsetX = x - a.x - dx * along;
        const offsetZ = z - a.z - dz * along;
        const distanceSq = offsetX * offsetX + offsetZ * offsetZ;
        if (distanceSq < closestDistanceSq) {
          closestDistanceSq = distanceSq;
          closestBaseY = THREE.MathUtils.lerp(a.y, b.y, along);
        }
      }
      return;
    }
    const leftDistance = boxDistanceSq(node.left);
    const rightDistance = boxDistanceSq(node.right);
    if (leftDistance < rightDistance) {
      visit(node.left); visit(node.right);
    } else {
      visit(node.right); visit(node.left);
    }
  }
  visit(routeTree);
  return { distance: Math.sqrt(closestDistanceSq), baseY: closestBaseY };
}

// The nearest section changes abruptly along an infield bisector. Blend only
// beyond the shoulder so that two sections at different elevations form a
// broad slope rather than a hard, straight height crease.
const baseSampleCount = Math.ceil(TRACK_LENGTH / 25);
const baseHeightSamples = Array.from(
  { length: baseSampleCount },
  (_, i) => groundRoute[Math.floor(i * (groundRoute.length - 1) / baseSampleCount)],
);
const baseGridCell = 150;
const baseGrid = new Map();
for (const point of baseHeightSamples) {
  const ix = Math.floor(point.x / baseGridCell);
  const iz = Math.floor(point.z / baseGridCell);
  if (!baseGrid.has(ix)) baseGrid.set(ix, new Map());
  const column = baseGrid.get(ix);
  if (!column.has(iz)) column.set(iz, []);
  column.get(iz).push(point);
}

function blendedRouteBase(x, z, nearest) {
  const mix = THREE.MathUtils.smoothstep(nearest.distance, 15, 40);
  if (mix === 0) return nearest.baseY;
  let totalWeight = 0;
  let weightedY = 0;
  const radiusSq = 500 * 500;
  const cellX = Math.floor(x / baseGridCell);
  const cellZ = Math.floor(z / baseGridCell);
  for (let ix = cellX - 4; ix <= cellX + 4; ix++) {
    const column = baseGrid.get(ix);
    if (!column) continue;
    for (let iz = cellZ - 4; iz <= cellZ + 4; iz++) {
      for (const point of column.get(iz) || []) {
        const dx = x - point.x;
        const dz = z - point.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= radiusSq) continue;
        const taper = 1 - distanceSq / radiusSq;
        const weight = taper * taper / (distanceSq + 120 * 120);
        totalWeight += weight;
        weightedY += point.y * weight;
      }
    }
  }
  if (totalWeight === 0) return nearest.baseY;
  return THREE.MathUtils.lerp(nearest.baseY, weightedY / totalWeight, mix);
}

/** The rendered ground and every dressing placement use this same height field. */
export function groundHeightAt(x, z) {
  const projection = routeProjection(x, z);
  return blendedRouteBase(x, z, projection)
    + terrainDisplacement(x, z, Math.max(0, projection.distance - TRACK.halfWidth));
}

// ---------------------------------------------------------------------------
// One triangulated ground: a grass infield and an exterior with a road-shaped
// hole, combined into one mesh. There are no crossing skirts or lower plane.
// ---------------------------------------------------------------------------

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}

function buildGrassGeometry(dressingPoints = []) {
  const left = trackSurface.trackEdges.left.slice(0, -1);
  const right = trackSurface.trackEdges.right.slice(0, -1);
  const [inner, outer] = Math.abs(signedArea(left)) < Math.abs(signedArea(right))
    ? [left, right] : [right, left];
  const bounds = sampleTrackBounds();
  const margin = Math.max(1000, scene?.fog?.far ? scene.fog.far + 250 : 1000);
  const rectangle = [
    { x: bounds.min.x - margin, z: bounds.min.z - margin },
    { x: bounds.max.x + margin, z: bounds.min.z - margin },
    { x: bounds.max.x + margin, z: bounds.max.z + margin },
    { x: bounds.min.x - margin, z: bounds.max.z + margin },
  ];
  const vertices = [];
  const triangles = [];
  const shoulderRanges = [];

  // Constrained Delaunay triangulation retains every shoulder vertex while
  // allowing interior Steiner points to form short, well-shaped triangles.
  // A staggered lattice samples the 48–66 m landform wavelengths near the road;
  // its density falls off only where the production fog hides the ground.
  // Only polygon edges crossing the point's Z band can change its winding.
  // Indexing them once avoids scanning thousands of shoulder edges for every
  // lattice point while keeping the exact polygon test route-agnostic.
  const polygonBand = 36;
  function indexPolygon(polygon) {
    const bands = new Map();
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j];
      const b = polygon[i];
      if (a.z === b.z) continue;
      const first = Math.floor(Math.min(a.z, b.z) / polygonBand);
      const last = Math.floor(Math.max(a.z, b.z) / polygonBand);
      for (let band = first; band <= last; band++) {
        if (!bands.has(band)) bands.set(band, []);
        bands.get(band).push([a, b]);
      }
    }
    return bands;
  }
  const innerBands = indexPolygon(inner);
  const outerBands = indexPolygon(outer);
  function inside(point, bands) {
    let contains = false;
    for (const [a, b] of bands.get(Math.floor(point.z / polygonBand)) || []) {
      if ((a.z > point.z) !== (b.z > point.z)
        && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) {
        contains = !contains;
      }
    }
    return contains;
  }

  function appendPolygon(contour, holes, points) {
    const local = [...contour, ...holes.flat(), ...points];
    const base = vertices.length;
    if (!holes.length) shoulderRanges.push([base, base + contour.length]);
    else {
      let holeBase = base + contour.length;
      for (const hole of holes) {
        shoulderRanges.push([holeBase, holeBase + hole.length]);
        holeBase += hole.length;
      }
    }
    const references = local.map((p, i) => ({ x: p.x, y: p.z, index: base + i }));
    let offset = contour.length;
    const sweep = new poly2tri.SweepContext(references.slice(0, offset));
    for (const hole of holes) {
      sweep.addHole(references.slice(offset, offset + hole.length));
      offset += hole.length;
    }
    sweep.addPoints(references.slice(offset));
    sweep.triangulate();
    for (const p of local) vertices.push({ x: p.x, z: p.z, y: p.y });
    for (const face of sweep.getTriangles()) {
      triangles.push(face.getPoints().map((p) => p.index));
    }
  }

  const infieldPoints = [];
  const exteriorPoints = [];
  const seedBuckets = new Map();
  const bucketSize = 16;
  const bucketKey = (ix, iz) => `${ix},${iz}`;
  const nearbySeed = (x, z, radius) => {
    const ix = Math.floor(x / bucketSize);
    const iz = Math.floor(z / bucketSize);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const seed of seedBuckets.get(bucketKey(ix + dx, iz + dz)) || []) {
        if (Math.hypot(seed.x - x, seed.z - z) < radius) return true;
      }
    }
    return false;
  };
  const addPoint = (point, seed = false) => {
    if (inside(point, innerBands)) infieldPoints.push(point);
    else if (!inside(point, outerBands)) exteriorPoints.push(point);
    else return;
    if (seed) {
      const key = bucketKey(
        Math.floor(point.x / bucketSize), Math.floor(point.z / bucketSize),
      );
      if (!seedBuckets.has(key)) seedBuckets.set(key, []);
      seedBuckets.get(key).push(point);
    }
  };

  // Existing dressing bases are exact terrain vertices. Both their placement
  // and the vertex height still come from groundHeightAt.
  for (const point of dressingPoints) addPoint(point, true);

  // Road-following seed rows prevent gaps in the lattice beside concave bends.
  // These are points in the same constrained triangulation, not separate strips.
  const roadSamples = Math.ceil(TRACK_LENGTH / 8);
  const shoulderOffset = TRACK.halfWidth + TRACK.curbWidth + TRACK.shoulderWidth;
  for (let i = 0; i < roadSamples; i++) {
    const t = i / roadSamples;
    for (const side of [-1, 1]) for (const offset of [8, 16, 24, 32, 40]) {
      const p = offsetPointAt(t, side * (shoulderOffset + offset), 0, new THREE.Vector3());
      if (routeProjection(p.x, p.z).distance < shoulderOffset + 5) continue;
      if (nearbySeed(p.x, p.z, 5)) continue;
      addPoint({ x: p.x, z: p.z }, true);
    }
  }

  const latticeStep = 18;
  const rowStep = latticeStep * Math.sqrt(3) * 0.5;
  const firstRow = Math.floor(rectangle[0].z / rowStep);
  const lastRow = Math.ceil(rectangle[2].z / rowStep);
  for (let row = firstRow; row <= lastRow; row++) {
    const z = row * rowStep;
    const offset = (row & 1) * latticeStep * 0.5;
    const firstColumn = Math.floor((rectangle[0].x - offset) / latticeStep);
    const lastColumn = Math.ceil((rectangle[1].x - offset) / latticeStep);
    for (let column = firstColumn; column <= lastColumn; column++) {
      const x = column * latticeStep + offset;
      if (x <= rectangle[0].x || x >= rectangle[1].x
        || z <= rectangle[0].z || z >= rectangle[2].z) continue;
      const projection = routeProjection(x, z);
      const distanceFromShoulder = projection.distance
        - TRACK.halfWidth - TRACK.curbWidth - TRACK.shoulderWidth;
      if (distanceFromShoulder < 7) continue;
      if (nearbySeed(x, z, 8)) continue;
      if (projection.distance >= 500 && ((row % 2) || (column % 2))) continue;
      if (projection.distance >= 900 && ((row % 5) || (column % 5))) continue;
      addPoint({ x, z });
    }
  }
  appendPolygon(inner, [], infieldPoints);
  appendPolygon(rectangle, [outer], exteriorPoints);

  const positions = [];
  const colors = [];
  const indices = [];
  const grassColor = new THREE.Color();
  for (const vertex of vertices) {
    const y = vertex.y ?? groundHeightAt(vertex.x, vertex.z);
    positions.push(vertex.x, y, vertex.z);
    const noise = terrainNoise(vertex.x, vertex.z);
    const mix = THREE.MathUtils.clamp(0.5 + noise * 0.48, 0.04, 0.96);
    grassColor.copy(GRASS_BASE).lerp(GRASS_LIGHT, mix);
    colors.push(grassColor.r, grassColor.g, grassColor.b);
  }
  for (const [a, b, c] of triangles) {
    const va = vertices[a];
    const vb = vertices[b];
    const vc = vertices[c];
    const up = (vb.z - va.z) * (vc.x - va.x)
      - (vb.x - va.x) * (vc.z - va.z);
    if (up >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.shoulderRanges = shoulderRanges;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function sampleTrackBounds() {
  const bounds = new THREE.Box3();
  const sample = new THREE.Vector3();
  for (let i = 0; i <= 256; i++) bounds.expandByPoint(pointAt(i / 256, sample));
  return bounds;
}

function skyRadiusFor(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  return Math.max(6000, size.length() * 2.1, TRACK_LENGTH * 1.7);
}

// ---------------------------------------------------------------------------
// Instanced dressing helpers
// ---------------------------------------------------------------------------

function seededRandom(seed = 0x47f2c1a5) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function paintGeometry(geometry, color) {
  const count = geometry.getAttribute('position').count;
  const value = new THREE.Color(color);
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = value.r;
    data[i * 3 + 1] = value.g;
    data[i * 3 + 2] = value.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geometry;
}

function triangleCount(geometry) {
  return geometry.index
    ? geometry.index.count / 3
    : geometry.getAttribute('position').count / 3;
}

function finishInstances(mesh) {
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function groundPositionAt(t, lateral, out = new THREE.Vector3(), footprint = 0) {
  // A point can sit beside one section and on top of another. Walk outward
  // until the entire instance clears the nearest section of the complete loop.
  const sign = Math.sign(lateral) || 1;
  for (let attempt = 0; attempt < 80; attempt++) {
    offsetPointAt(t, lateral + sign * attempt * 8, 0, out);
    if (routeProjection(out.x, out.z).distance
      >= TRACK.halfWidth + ASPHALT_CLEARANCE + footprint) break;
  }
  out.y = groundHeightAt(out.x, out.z);
  return out;
}

function yawForTangent(t) {
  const tangent = tangentAt(t, new THREE.Vector3()).setY(0).normalize();
  // Align local +X (the long face of markers/stands) with the route tangent.
  return Math.atan2(-tangent.z, tangent.x);
}

function buildTreeInstances(random) {
  const indexedTrunk = new THREE.CylinderGeometry(0.42, 0.58, 2.2, 5, 1);
  const trunk = paintGeometry(
    indexedTrunk.toNonIndexed().translate(0, 1.1, 0),
    '#8A765E',
  );
  indexedTrunk.dispose();
  const canopy = paintGeometry(
    new THREE.IcosahedronGeometry(2.8, 0).scale(1, 1.28, 1).translate(0, 4.8, 0),
    '#5D8965',
  );
  const geometry = mergeGeometries([trunk, canopy], false);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.normalizeNormals();
  trunk.dispose();
  canopy.dispose();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
  });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'roadside-trees';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  // Instance colours are subtle multipliers over the already-green canopy albedo.
  // Keeping them near white preserves the trunk colour and visible sun modeling.
  const treeColors = [new THREE.Color('#D2E0D2'), new THREE.Color('#FFFFFF')];

  for (let i = 0; i < count; i++) {
    const t = THREE.MathUtils.clamp((i + 0.2 + random() * 0.6) / count, 0.002, 0.998);
    const side = random() < 0.5 ? -1 : 1;
    const distanceFromEdge = 30 + random() * 150;
    const lateral = side * (TRACK.halfWidth + distanceFromEdge);
    const uniformScale = 0.8 + random() * 0.8;
    groundPositionAt(t, lateral, position, 4.5 * uniformScale);
    scale.setScalar(uniformScale);
    quaternion.setFromAxisAngle(UP, random() * Math.PI * 2);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, treeColors[random() < 0.52 ? 0 : 1]);
  }

  return finishInstances(mesh);
}

function buildMarkerInstances() {
  const post = paintGeometry(
    new THREE.BoxGeometry(0.24, 2.8, 0.24).translate(0, 1.4, 0),
    '#D0CEC3',
  );
  const board = paintGeometry(
    new THREE.BoxGeometry(1.8, 0.82, 0.18).translate(0, 2.9, 0),
    '#B8B7AF',
  );
  const geometry = mergeGeometries([post, board], false);
  post.dispose();
  board.dispose();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const count = 24;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'distance-markers';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const t = Math.min(0.985, (i + 0.7) / count);
    const bend = curvatureAt(t);
    const side = Math.abs(bend) > 0.08 ? Math.sign(bend) : (i % 2 ? -1 : 1);
    // The nominal post is twelve metres beyond the run-off zone. The final centre
    // offset also protects the global 22 m asphalt clearance including board depth.
    const distanceFromEdge = Math.max(
      ASPHALT_CLEARANCE + 1.1,
      TRACK.curbWidth + TRACK.shoulderWidth + 12,
    );
    groundPositionAt(t, side * (TRACK.halfWidth + distanceFromEdge), position, 1.5);
    quaternion.setFromAxisAngle(UP, yawForTangent(t));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }

  return finishInstances(mesh);
}

function sharpCornerPeaks() {
  const peaks = [];
  let active = null;
  const samples = 800;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const curvature = curvatureAt(t);
    const strength = Math.abs(curvature);
    if (strength > 0.55) {
      if (!active || strength > active.strength) active = { t, curvature, strength };
    } else if (active) {
      peaks.push(active);
      active = null;
    }
  }
  if (active) peaks.push(active);
  return peaks;
}

function buildTireInstances(random) {
  const tires = [];
  for (let ring = 0; ring < 4; ring++) {
    tires.push(paintGeometry(
      new THREE.TorusGeometry(0.86, 0.27, 5, 10)
        .rotateX(Math.PI * 0.5)
        .translate(0, 0.28 + ring * 0.48, 0),
      ring % 2 ? '#151718' : '#0F1112',
    ));
  }
  const geometry = mergeGeometries(tires, false);
  tires.forEach((tire) => tire.dispose());
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const placements = [];

  const corners = sharpCornerPeaks()
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3)
    .sort((a, b) => a.t - b.t);
  for (const [cornerIndex, corner] of corners.entries()) {
    const stackCount = [4, 5, 4][cornerIndex];
    const outside = Math.sign(corner.curvature) || 1;
    for (let stack = 0; stack < stackCount; stack++) {
      const centred = stack - (stackCount - 1) * 0.5;
      placements.push({
        t: THREE.MathUtils.clamp(corner.t + centred * (4.2 / TRACK_LENGTH), 0, 1),
        lateral: outside * (
          TRACK.halfWidth + ASPHALT_CLEARANCE + 2.1 + (stack % 2) * 2.15
        ),
        scale: 0.88 + random() * 0.22,
        yaw: random() * Math.PI * 2,
      });
    }
  }

  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = 'corner-tire-stacks';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  placements.forEach((placement, index) => {
    groundPositionAt(placement.t, placement.lateral, position, 1.5 * placement.scale);
    quaternion.setFromAxisAngle(UP, placement.yaw);
    scale.setScalar(placement.scale);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });

  return finishInstances(mesh);
}

function grandstandGeometry() {
  // A low-poly wedge: lower at the track-facing edge, rising toward the rear.
  const positions = new Float32Array([
    -18, 0, -7, 18, 0, -7, 18, 0, 7, -18, 0, 7,
    -18, 1.8, -7, 18, 1.8, -7, 18, 7.4, 7, -18, 7.4, 7,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
  ];
  const seating = new THREE.BufferGeometry();
  seating.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  seating.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8 * 2), 2));
  seating.setIndex(indices);
  seating.computeVertexNormals();
  paintGeometry(seating, '#777973');

  const roof = paintGeometry(
    new THREE.BoxGeometry(40, 0.5, 18).translate(0, 9.0, 0.7),
    '#555A58',
  );
  const supportA = paintGeometry(
    new THREE.BoxGeometry(0.45, 8.5, 0.45).translate(-16, 4.25, -6),
    '#686B67',
  );
  const supportB = supportA.clone().translate(32, 0, 0);
  const geometry = mergeGeometries([seating, roof, supportA, supportB], false);
  seating.dispose();
  roof.dispose();
  supportA.dispose();
  supportB.dispose();
  return geometry;
}

function buildGrandstandInstances(random) {
  const geometry = grandstandGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });
  const locations = [
    { t: 0.205, side: -1 },
    { t: 0.635, side: 1 },
    { t: 0.825, side: -1 },
  ];
  const mesh = new THREE.InstancedMesh(geometry, material, locations.length);
  mesh.name = 'distant-grandstands';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  locations.forEach(({ t, side }, index) => {
    const distanceFromEdge = 110 + random() * 50;
    const size = 0.9 + random() * 0.16;
    groundPositionAt(t, side * (TRACK.halfWidth + distanceFromEdge), position, 23 * size);
    quaternion.setFromAxisAngle(UP, yawForTangent(t));
    scale.set(size, size, size);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });

  return finishInstances(mesh);
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildEnvironment() {
  if (environmentRoot) return environmentRoot;

  const root = new THREE.Group();
  root.name = 'environment';
  root.update = updateEnvironment;
  environmentRoot = root;

  if (scene?.fog?.color) {
    // One shared mutable Color, not matching literals: setSky(uHorizon) and
    // setAtmosphere(fogColor) now update the exact same horizon value.
    skyUniforms.uHorizon.value = scene.fog.color;
  }

  const bounds = sampleTrackBounds();
  const centre = bounds.getCenter(new THREE.Vector3());
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(skyRadiusFor(bounds), 32, 16),
    skyMaterial,
  );
  sky.name = 'afternoon-gradient-sky';
  sky.position.set(centre.x, 0, centre.z);
  sky.frustumCulled = false;
  backgroundLayer.add(sky);

  const random = seededRandom();
  const trees = buildTreeInstances(random);
  const markers = buildMarkerInstances();
  const tireStacks = buildTireInstances(random);
  const grandstands = buildGrandstandInstances(random);
  const dressing = [trees, markers, tireStacks, grandstands];
  const dressingPoints = [];
  const instanceMatrix = new THREE.Matrix4();
  for (const mesh of dressing) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, instanceMatrix);
    dressingPoints.push({
      x: instanceMatrix.elements[12],
      z: instanceMatrix.elements[14],
    });
  }
  const grass = new THREE.Mesh(buildGrassGeometry(dressingPoints), grassMaterial);
  grass.name = 'grass-skirts-and-horizon';
  grass.receiveShadow = true;
  root.add(grass);
  // Only the effectively infinite sky receives cursor parallax. Moving a grounded
  // grandstand with this layer would lift it away from its sampled terrain height.
  root.add(backgroundLayer, trees, markers, tireStacks, grandstands);

  if (!dressingCountLogged) {
    const dressingTriangles = [trees, markers, tireStacks, grandstands]
      .reduce((total, mesh) => total + triangleCount(mesh.geometry) * mesh.count, 0);
    const dressingInstances = trees.count + markers.count + tireStacks.count + grandstands.count;
    console.info(
      `GT3 environment dressing: ${dressingInstances} instances, ${dressingTriangles} triangles`,
    );
    dressingCountLogged = true;
  }

  return root;
}
