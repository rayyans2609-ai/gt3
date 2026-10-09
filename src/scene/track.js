/**
 * Static track geometry generated from the shared route spline.
 *
 * Five materials deliberately map to five merged meshes: asphalt, shoulders,
 * paved runoff, painted markings, and vertex-coloured curbs. Nothing in this module rebuilds
 * geometry during the render loop.
 */
import * as THREE from 'three';
import {
  TRACK_LENGTH,
  offsetPointAt,
  pointAt,
  tangentAt,
} from './trackCurve.js';
import { profileAt, CURB_SEGMENTS, CROSS_SECTION } from './trackProfile.js';

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
const sampleProfiles = new Array(TRACK_SAMPLE_COUNT);
const tempOffset = new THREE.Vector3();
for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
  const t = i / TRACK_SEGMENT_COUNT;
  sampledT[i] = t;
  const center = pointAt(t, new THREE.Vector3());
  const tangent = tangentAt(t, new THREE.Vector3());
  const left = offsetPointAt(t, 1, 0, tempOffset).clone().sub(center).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, left).normalize();
  if (normal.dot(UP) < 0) normal.negate();
  sampleCenters[i] = center;
  sampleRights[i] = left; // historical buffer name; +lateral is left
  sampleNormals[i] = normal;
  sampleProfiles[i] = profileAt(t);
}

function sampledPoint(index, lateral, height = 0) {
  return sampleCenters[index].clone()
    .addScaledVector(sampleRights[index], lateral)
    .addScaledVector(UP, height);
}

/** Outer shoulder edges consumed by the environment's grass geometry. */
export const trackEdges = { left: [], right: [] };
for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
  const p = sampleProfiles[i];
  // Preserve contour ordering expected by environment.js (negative/positive).
  trackEdges.left.push(sampledPoint(i, -p.outerRight, CROSS_SECTION.vergeY));
  trackEdges.right.push(sampledPoint(i, p.outerLeft, CROSS_SECTION.vergeY));
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
      pushVector(positions, sampledPoint(i, across[j] * (across[j] < 0 ? sampleProfiles[i].right : sampleProfiles[i].left), CROSS_SECTION.asphaltY));
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

function buildExteriorGeometry(runoff = false) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i < TRACK_SAMPLE_COUNT; i++) {
    const p = sampleProfiles[i];
    const right = p.right + p.curbRight, left = p.left + p.curbLeft;
    const laterals = runoff ? [-p.outerRight, -right - p.shoulder, left + p.shoulder, p.outerLeft]
      : [-right - p.shoulder, -right, left, left + p.shoulder];
    for (let j = 0; j < 4; j++) {
      pushVector(positions, sampledPoint(i, laterals[j], CROSS_SECTION.vergeY));
      pushVector(normals, sampleNormals[i]);
      uvs.push(j % 2, i * SAMPLE_STEP / 4);
    }
  }
  for (let i = 0; i < TRACK_SEGMENT_COUNT; i++) for (const j of [0, 2]) {
    if (runoff) {
      const key = j === 0 ? 'runoffRight' : 'runoffLeft';
      if (sampleProfiles[i][key] === 0 && sampleProfiles[i + 1][key] === 0) continue;
    }
    const a = i * 4 + j, b = a + 1, c = a + 4, d = c + 1;
    indices.push(a, c, b, b, c, d);
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
  const positions = [], normals = [], uvs = [], colors = [], blocks = [];
  const writeTriangle = createTriangleWriter(positions, normals, uvs, colors);
  const red = new THREE.Color('#B22A2A'), white = new THREE.Color('#D8D4CC');
  const blockLength = CROSS_SECTION.curbBlockLength;
  for (const segment of CURB_SEGMENTS) {
    const count = Math.ceil((segment.to - segment.from) * TRACK_LENGTH / TARGET_SAMPLE_STEP);
    const rows = [];
    let distance = 0;
    for (let i = 0; i <= count; i++) {
      const t = segment.from + (segment.to - segment.from) * i / count;
      const p = profileAt(t), side = segment.side;
      const edge = side > 0 ? p.left : p.right;
      const width = side > 0 ? p.curbLeft : p.curbRight;
      const inner = offsetPointAt(t, side * edge, CROSS_SECTION.curbInnerY);
      const outerY = CROSS_SECTION.curbInnerY + (CROSS_SECTION.curbOuterY - CROSS_SECTION.curbInnerY) * width / segment.width;
      const outer = offsetPointAt(t, side * (edge + width), outerY);
      const bottom = offsetPointAt(t, side * (edge + width), CROSS_SECTION.vergeY);
      if (i) distance += inner.distanceTo(rows[i - 1].inner);
      rows.push({ s: distance, inner, outer, bottom, width });
    }
    // Split at EVERY physical inner-edge 2.4 m boundary. Geometry sample edges
    // cannot quantise paint cadence; only the terminal block may be shorter.
    for (let i = 0; i < count; i++) {
      const a = rows[i], b = rows[i + 1];
      const cuts = [a.s];
      for (let s = (Math.floor(a.s / blockLength) + 1) * blockLength; s < b.s - 1e-9; s += blockLength) cuts.push(s);
      cuts.push(b.s);
      const rowAt = s => {
        const f = (s - a.s) / (b.s - a.s);
        return { inner: a.inner.clone().lerp(b.inner, f), outer: a.outer.clone().lerp(b.outer, f),
          bottom: a.bottom.clone().lerp(b.bottom, f) };
      };
      for (let k = 0; k < cuts.length - 1; k++) {
        const s0 = cuts[k], s1 = cuts[k + 1], r0 = rowAt(s0), r1 = rowAt(s1);
        const color = Math.floor((s0 + s1) / (2 * blockLength)) % 2 ? white : red;
        const outward = r0.outer.clone().sub(r0.inner).setY(0).normalize();
        writeTriangle(r0.inner, r1.inner, r0.outer, UP, color);
        writeTriangle(r0.outer, r1.inner, r1.outer, UP, color);
        writeTriangle(r0.bottom, r0.outer, r1.bottom, outward, color);
        writeTriangle(r1.bottom, r0.outer, r1.outer, outward, color);
      }
    }
    for (let s = 0; s < distance; s += blockLength) blocks.push({ segment: segment.id, fromM: s, toM: Math.min(s + blockLength, distance), terminal: s + blockLength >= distance });
  }
  const geometry = setCommonAttributes(new THREE.BufferGeometry(), positions, normals, uvs, colors);
  geometry.userData.blocks = blocks;
  return geometry;
}

function buildMarkingGeometry() {
  const positions = [], normals = [], uvs = [];
  const writeTriangle = createTriangleWriter(positions, normals, uvs);
  const half = CROSS_SECTION.edgeLineWidth / 2;
  for (let i = 0; i < TRACK_SEGMENT_COUNT; i++) for (const side of [-1, 1]) {
    const p0 = sampleProfiles[i], p1 = sampleProfiles[i + 1];
    const edge0 = side > 0 ? p0.left : p0.right;
    const edge1 = side > 0 ? p1.left : p1.right;
    const x0 = side * (edge0 - CROSS_SECTION.edgeLineInset);
    const x1 = side * (edge1 - CROSS_SECTION.edgeLineInset);
    const a = sampledPoint(i, x0 - half, CROSS_SECTION.asphaltY + .003);
    const b = sampledPoint(i + 1, x1 - half, CROSS_SECTION.asphaltY + .003);
    const c = sampledPoint(i, x0 + half, CROSS_SECTION.asphaltY + .003);
    const d = sampledPoint(i + 1, x1 + half, CROSS_SECTION.asphaltY + .003);
    writeTriangle(a, b, c, UP); writeTriangle(c, b, d, UP);
  }
  // Circuits have no centre dashed line.
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

// ALBEDO NOTE: the design-system hexes describe how
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
    buildExteriorGeometry(),
    shoulderMaterial,
  ));

  group.add(makeStaticMesh('track-runoff', buildExteriorGeometry(true),
    new THREE.MeshStandardMaterial({ color: '#777872', roughness: 1, metalness: 0 })));

  group.add(makeStaticMesh(
    'track-markings',
    buildMarkingGeometry(),
    new THREE.MeshStandardMaterial({
      color: '#E8E6DF',
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
