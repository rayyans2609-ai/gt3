/**
 * Static track geometry generated from the shared route spline.
 *
 * Four materials deliberately map to four merged meshes: asphalt, shoulders,
 * painted markings, and vertex-coloured curbs. Nothing in this module rebuilds
 * geometry during the render loop.
 */
import * as THREE from 'three';
import {
  TRACK,
  TRACK_LENGTH,
  curvatureAt,
  distanceToT,
  offsetPointAt,
  pointAt,
  tangentAt,
} from './trackCurve.js';
import { COMP } from './composition.js';

const TARGET_SAMPLE_STEP = 1.1;
const TRACK_SEGMENT_COUNT = Math.ceil(TRACK_LENGTH / TARGET_SAMPLE_STEP);
const SAMPLE_STEP = TRACK_LENGTH / TRACK_SEGMENT_COUNT;
const UP = new THREE.Vector3(0, 1, 0);

export const TRACK_SAMPLE_COUNT = TRACK_SEGMENT_COUNT + 1;
export const sampledT = new Float32Array(TRACK_SAMPLE_COUNT);
// A descriptive alias for consumers which prefer the subject before the unit.
export const trackSampleT = sampledT;

const sampleCenters = new Array(TRACK_SAMPLE_COUNT);
const sampleRights = new Array(TRACK_SAMPLE_COUNT);
const sampleNormals = new Array(TRACK_SAMPLE_COUNT);
const sampleCurvatures = new Float32Array(TRACK_SAMPLE_COUNT);

const tempOffset = new THREE.Vector3();
for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
  const t = i / TRACK_SEGMENT_COUNT;
  sampledT[i] = t;

  const center = pointAt(t, new THREE.Vector3());
  const tangent = tangentAt(t, new THREE.Vector3());
  const right = offsetPointAt(t, 1, 0, tempOffset).clone().sub(center).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, right).normalize();
  if (normal.dot(UP) < 0) normal.negate();

  sampleCenters[i] = center;
  sampleRights[i] = right;
  sampleNormals[i] = normal;
  sampleCurvatures[i] = curvatureAt(t);
}

function smoothstep(edge0, edge1, value) {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function nearestStraightIndex(targetDistance) {
  const target = Math.round(targetDistance / SAMPLE_STEP);
  let bestIndex = target;
  let bestDelta = Infinity;

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    if (Math.abs(sampleCurvatures[i]) >= 0.14) continue;
    const delta = Math.abs(i - target);
    if (delta < bestDelta) {
      bestIndex = i;
      bestDelta = delta;
    }
  }
  return bestIndex;
}

// Three route-even targets are snapped to their nearest genuine straight.
const accentDistances = [1, 2, 3].map((quarter) => (
  nearestStraightIndex((TRACK_LENGTH * quarter) / 4) * SAMPLE_STEP
));

const curbWidthsRaw = new Float32Array(TRACK_SAMPLE_COUNT);
for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
  const distance = Math.min(i * SAMPLE_STEP, TRACK_LENGTH);
  let wideAmount = smoothstep(0.18, 0.68, Math.abs(sampleCurvatures[i]));

  for (const corner of COMP.curbCorners || []) {
    const separation = Math.abs(distance - corner.t * TRACK_LENGTH);
    // Full-width support throughout the event + wheelbase and smoothing halo.
    wideAmount = Math.max(wideAmount, 1 - smoothstep(corner.radiusM + 24, corner.radiusM + 52, separation));
  }

  for (const accentDistance of accentDistances) {
    const separation = Math.abs(distance - accentDistance);
    // A broad full-width core survives the moving average, with long tapered ends.
    const accentAmount = 1 - smoothstep(18, 48, separation);
    wideAmount = Math.max(wideAmount, accentAmount);
  }

  curbWidthsRaw[i] = THREE.MathUtils.lerp(
    TRACK.curbWidth,
    TRACK.curbWidthWide,
    wideAmount,
  );
}

// A centred 25-sample moving average turns all curb-width changes into ramps.
const CURB_SMOOTH_RADIUS = 12;
const curbWidths = new Float32Array(TRACK_SAMPLE_COUNT);
for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
  let sum = 0;
  let count = 0;
  const from = Math.max(0, i - CURB_SMOOTH_RADIUS);
  const to = Math.min(TRACK_SAMPLE_COUNT - 1, i + CURB_SMOOTH_RADIUS);
  for (let j = from; j <= to; j += 1) {
    sum += curbWidthsRaw[j];
    count += 1;
  }
  curbWidths[i] = sum / count;
}

function sampledPoint(index, lateral, height = 0) {
  return sampleCenters[index].clone()
    .addScaledVector(sampleRights[index], lateral)
    .addScaledVector(UP, height);
}

/** Outer shoulder edges consumed by the environment's grass geometry. */
export const trackEdges = { left: [], right: [] };
for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
  const outerLateral = TRACK.halfWidth + curbWidths[i] + TRACK.shoulderWidth;
  trackEdges.left.push(sampledPoint(i, -outerLateral, -0.03));
  trackEdges.right.push(sampledPoint(i, outerLateral, -0.03));
}

function setCommonAttributes(geometry, positions, normals, uvs, colors = null) {
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function pushVector(array, vector) {
  array.push(vector.x, vector.y, vector.z);
}

function buildAsphaltGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const across = [-1, -0.5, 0, 0.5, 1];
  const brightness = [0.82, 0.94, 1, 0.94, 0.82];

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    const distance = Math.min(i * SAMPLE_STEP, TRACK_LENGTH);
    for (let j = 0; j < across.length; j += 1) {
      pushVector(positions, sampledPoint(i, across[j] * TRACK.halfWidth, -0.02));
      pushVector(normals, sampleNormals[i]);
      uvs.push(j / (across.length - 1), distance / 4);
      colors.push(brightness[j], brightness[j], brightness[j]);
    }
  }

  for (let i = 0; i < TRACK_SEGMENT_COUNT; i += 1) {
    const row = i * across.length;
    const nextRow = (i + 1) * across.length;
    for (let j = 0; j < across.length - 1; j += 1) {
      const a = row + j;
      const b = a + 1;
      const c = nextRow + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = setCommonAttributes(
    new THREE.BufferGeometry(), positions, normals, uvs, colors,
  );
  geometry.setIndex(indices);
  return geometry;
}

function buildShoulderGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    const curbOuter = TRACK.halfWidth + curbWidths[i];
    const laterals = [
      -curbOuter - TRACK.shoulderWidth,
      -curbOuter,
      curbOuter,
      curbOuter + TRACK.shoulderWidth,
    ];
    const distance = Math.min(i * SAMPLE_STEP, TRACK_LENGTH);
    for (let j = 0; j < laterals.length; j += 1) {
      pushVector(positions, sampledPoint(i, laterals[j], -0.03));
      pushVector(normals, sampleNormals[i]);
      uvs.push(j === 0 || j === 2 ? 0 : 1, distance / 4);
    }
  }

  for (let i = 0; i < TRACK_SEGMENT_COUNT; i += 1) {
    const row = i * 4;
    const nextRow = row + 4;
    for (const j of [0, 2]) {
      const a = row + j;
      const b = a + 1;
      const c = nextRow + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = setCommonAttributes(new THREE.BufferGeometry(), positions, normals, uvs);
  geometry.setIndex(indices);
  return geometry;
}

function createTriangleWriter(positions, normals, uvs, colors = null) {
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  return function writeTriangle(a, b, c, desiredNormal, color = null, triUvs = null) {
    edgeA.subVectors(b, a);
    edgeB.subVectors(c, a);
    faceNormal.crossVectors(edgeA, edgeB).normalize();

    let second = b;
    let third = c;
    if (faceNormal.dot(desiredNormal) < 0) {
      second = c;
      third = b;
      faceNormal.negate();
    }

    pushVector(positions, a);
    pushVector(positions, second);
    pushVector(positions, third);
    for (let i = 0; i < 3; i += 1) pushVector(normals, faceNormal);

    if (triUvs) {
      const uvOrder = second === b ? [0, 1, 2] : [0, 2, 1];
      for (const uvIndex of uvOrder) uvs.push(...triUvs[uvIndex]);
    } else {
      uvs.push(0, 0, 1, 0, 0, 1);
    }

    if (colors && color) {
      for (let i = 0; i < 3; i += 1) colors.push(color.r, color.g, color.b);
    }
  };
}

function buildCurbGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const writeTriangle = createTriangleWriter(positions, normals, uvs, colors);
  const red = new THREE.Color('#B22A2A');
  const white = new THREE.Color('#D8D4CC');
  const blockLength = 2.4;

  for (let i = 0; i < TRACK_SEGMENT_COUNT; i += 1) {
    const distance0 = i * SAMPLE_STEP;
    const distance1 = Math.min((i + 1) * SAMPLE_STEP, TRACK_LENGTH);
    const color = Math.floor(((distance0 + distance1) * 0.5) / blockLength) % 2
      ? white
      : red;

    for (const side of [-1, 1]) {
      const inner0 = sampledPoint(i, side * TRACK.halfWidth, 0.005);
      const inner1 = sampledPoint(i + 1, side * TRACK.halfWidth, 0.005);
      const outer0 = sampledPoint(i, side * (TRACK.halfWidth + curbWidths[i]), 0.105);
      const outer1 = sampledPoint(
        i + 1,
        side * (TRACK.halfWidth + curbWidths[i + 1]),
        0.105,
      );
      const outerBottom0 = sampledPoint(
        i,
        side * (TRACK.halfWidth + curbWidths[i]),
        -0.03,
      );
      const outerBottom1 = sampledPoint(
        i + 1,
        side * (TRACK.halfWidth + curbWidths[i + 1]),
        -0.03,
      );
      const topNormal = sampleNormals[i].clone().add(sampleNormals[i + 1]).normalize();
      const outward = sampleRights[i].clone()
        .add(sampleRights[i + 1])
        .multiplyScalar(side)
        .normalize();
      const v0 = distance0 / 4;
      const v1 = distance1 / 4;

      writeTriangle(
        inner0, inner1, outer0, topNormal, color,
        [[0, v0], [0, v1], [1, v0]],
      );
      writeTriangle(
        outer0, inner1, outer1, topNormal, color,
        [[1, v0], [0, v1], [1, v1]],
      );
      writeTriangle(
        outerBottom0, outer0, outerBottom1, outward, color,
        [[0, v0], [1, v0], [0, v1]],
      );
      writeTriangle(
        outerBottom1, outer0, outer1, outward, color,
        [[0, v1], [1, v0], [1, v1]],
      );
    }
  }

  return setCommonAttributes(
    new THREE.BufferGeometry(), positions, normals, uvs, colors,
  );
}

function buildMarkingGeometry() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const writeTriangle = createTriangleWriter(positions, normals, uvs);
  const surfaceHeight = 0.012;

  function pointAtDistance(distance, lateral) {
    return offsetPointAt(
      distanceToT(THREE.MathUtils.clamp(distance, 0, TRACK_LENGTH)),
      lateral,
      surfaceHeight,
      new THREE.Vector3(),
    );
  }

  function normalAtDistance(distance) {
    const t = distanceToT(THREE.MathUtils.clamp(distance, 0, TRACK_LENGTH));
    const tangent = tangentAt(t, new THREE.Vector3());
    const center = pointAt(t, new THREE.Vector3());
    const right = offsetPointAt(t, 1, 0, new THREE.Vector3()).sub(center).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return normal.dot(UP) < 0 ? normal.negate() : normal;
  }

  function addSurfaceQuad(a, b, c, d, normal) {
    writeTriangle(a, b, c, normal, null, [[0, 0], [0, 1], [1, 0]]);
    writeTriangle(c, b, d, normal, null, [[1, 0], [0, 1], [1, 1]]);
  }

  function addTrackQuad(distance0, distance1, lateral, halfWidth0, halfWidth1 = halfWidth0) {
    if (halfWidth0 <= 0.0001 && halfWidth1 <= 0.0001) return;
    const a = pointAtDistance(distance0, lateral - halfWidth0);
    const b = pointAtDistance(distance1, lateral - halfWidth1);
    const c = pointAtDistance(distance0, lateral + halfWidth0);
    const d = pointAtDistance(distance1, lateral + halfWidth1);
    addSurfaceQuad(a, b, c, d, normalAtDistance((distance0 + distance1) * 0.5));
  }

  // Four metres of paint followed by five metres of open asphalt.
  for (let distance = 0; distance < TRACK_LENGTH; distance += 9) {
    addTrackQuad(distance, Math.min(distance + 4, TRACK_LENGTH), 0, 0.14);
  }

  // The straight-only edge accents taper geometrically to a point at |curvature|=.2.
  const accentLateral = TRACK.halfWidth - 0.9;
  const straightWidth = (curvature) => (
    Math.abs(curvature) >= 0.2
      ? 0
      : 0.11 * (1 - smoothstep(0.1, 0.2, Math.abs(curvature)))
  );
  for (let i = 0; i < TRACK_SEGMENT_COUNT; i += 1) {
    const width0 = straightWidth(sampleCurvatures[i]);
    const width1 = straightWidth(sampleCurvatures[i + 1]);
    if (width0 <= 0.0001 && width1 <= 0.0001) continue;
    const distance0 = i * SAMPLE_STEP;
    const distance1 = Math.min((i + 1) * SAMPLE_STEP, TRACK_LENGTH);
    addTrackQuad(distance0, distance1, -accentLateral, width0, width1);
    addTrackQuad(distance0, distance1, accentLateral, width0, width1);
  }

  // Legacy turn-direction chevrons were removed (SPEC §18: no legacy racing cues).

  return setCommonAttributes(new THREE.BufferGeometry(), positions, normals, uvs);
}

function makeStaticMesh(name, geometry, material, castsShadow = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = castsShadow;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

let builtTrack = null;

// ALBEDO NOTE: the design-system hexes (#26262A asphalt, #E8C33A yellow) describe how
// these surfaces should LOOK on screen once lit. Feeding them in as PBR albedo renders
// them near-black, because #26262A is only 0.018 in linear space. The albedos below are
// lifted so that the LIT result lands on the intended tone.
export function buildTrack() {
  if (builtTrack) return builtTrack;

  const group = new THREE.Group();
  group.name = 'track';
  const asphaltMaterial = new THREE.MeshStandardMaterial({
    color: '#4E4E55',
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: '#33333A',
    roughness: 0.96,
    metalness: 0,
  });

  group.add(makeStaticMesh(
    'track-asphalt',
    buildAsphaltGeometry(),
    asphaltMaterial,
  ));

  group.add(makeStaticMesh(
    'track-shoulders',
    buildShoulderGeometry(),
    shoulderMaterial,
  ));

  group.add(makeStaticMesh(
    'track-markings',
    buildMarkingGeometry(),
    new THREE.MeshStandardMaterial({
      color: '#F2D45C',
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.7,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  ));

  group.add(makeStaticMesh(
    'track-curbs',
    buildCurbGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
    }),
    false,
  ));

  group.matrixAutoUpdate = false;
  group.updateMatrix();
  // Kept as part of the scene-module contract even though today's materials are static.
  group.update = function update(_dt) {};

  let triangleCount = 0;
  for (const child of group.children) {
    const { geometry } = child;
    triangleCount += geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute('position').count / 3;
  }
  console.info(
    `[track] built ${TRACK_SAMPLE_COUNT} spline rings, ${Math.round(triangleCount).toLocaleString()} triangles, ${group.children.length} meshes`,
  );

  builtTrack = group;
  return group;
}
