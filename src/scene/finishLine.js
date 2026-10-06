/** A bounded racing gantry, approach signals and the painted checker strip. */
import * as THREE from 'three';
import { state } from '../core/state.js';
import { groundHeightAt } from './environment.js';
import {
  FINISH_T,
  TRACK,
  TRACK_LENGTH,
  offsetPointAt,
  pointAt,
  tangentAt,
} from './trackCurve.js';

const UP = new THREE.Vector3(0, 1, 0);
const TRUSS_DEPTH = 1.4;
const POST_LATERAL = TRACK.halfWidth + TRACK.curbWidth + 1.25;
const BANNER_HEIGHT = 0.85;
const CLEARANCE = 8.6;
const APPROACH_T = 120 / TRACK_LENGTH;
const STRIP_LENGTH = 2.0;
const STRIP_COLUMNS = 14;
const STRIP_ROWS = 2;

let finishRoot = null;
let lampMaterial = null;
let signalLevel = 0;

function checkerTexture() {
  const columns = 14;
  const rows = 2;
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = columns * cell;
  canvas.height = rows * cell;
  const context = canvas.getContext('2d');

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? '#DDD9D1' : '#202124';
      context.fillRect(column * cell, row * cell, cell, cell);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'finish-banner-checkers';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function addTriangle(positions, colors, a, b, c, color) {
  for (const point of [a, b, c]) {
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
  }
}

function buildPaintedStrip(root) {
  const positions = [];
  const colors = [];
  const light = new THREE.Color('#DEDAD2');
  const dark = new THREE.Color('#292A2D');
  const halfLength = STRIP_LENGTH * 0.5;

  // Duplicate the vertices per square so every checker has an exact, hard edge.
  for (let row = 0; row < STRIP_ROWS; row += 1) {
    const fromDistance = -halfLength + (row / STRIP_ROWS) * STRIP_LENGTH;
    const toDistance = -halfLength + ((row + 1) / STRIP_ROWS) * STRIP_LENGTH;
    const t0 = (FINISH_T + fromDistance / TRACK_LENGTH + 1) % 1;
    const t1 = (FINISH_T + toDistance / TRACK_LENGTH + 1) % 1;

    for (let column = 0; column < STRIP_COLUMNS; column += 1) {
      const x0 = -TRACK.halfWidth + (column / STRIP_COLUMNS) * TRACK.halfWidth * 2;
      const x1 = -TRACK.halfWidth + ((column + 1) / STRIP_COLUMNS) * TRACK.halfWidth * 2;
      const a = root.worldToLocal(offsetPointAt(t0, x0, 0.045, new THREE.Vector3()));
      const b = root.worldToLocal(offsetPointAt(t0, x1, 0.045, new THREE.Vector3()));
      const c = root.worldToLocal(offsetPointAt(t1, x1, 0.045, new THREE.Vector3()));
      const d = root.worldToLocal(offsetPointAt(t1, x0, 0.045, new THREE.Vector3()));
      const color = (row + column) % 2 === 0 ? light : dark;
      addTriangle(positions, colors, a, c, b, color);
      addTriangle(positions, colors, a, d, c, color);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const strip = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  strip.name = 'start-finish-painted-strip';
  strip.receiveShadow = true;
  strip.frustumCulled = false; // Draw/upload at boot, even with a restored route.
  strip.renderOrder = 2;
  root.add(strip);
}

// Reuse one unit box for all scaled uprights, rails and diagonal braces.
function structure(root, ground, bottom, top, material) {
  const matrix = new THREE.Object3D();
  const parts = [];
  const add = (x, y, z, sx, sy, sz, angle = 0) => {
    matrix.position.set(x, y, z);
    matrix.scale.set(sx, sy, sz);
    matrix.rotation.set(0, 0, angle);
    matrix.updateMatrix();
    parts.push(matrix.matrix.clone());
  };
  for (let side = 0; side < 2; side++) {
    const x = side ? POST_LATERAL : -POST_LATERAL;
    const height = top - ground[side];
    add(x, ground[side] + height / 2, 0, 0.55, height, 0.85);
    add(x, ground[side] + 0.15, 0, 1.1, 0.3, 1.25);
  }
  const span = POST_LATERAL * 2;
  const trussHeight = top - bottom;
  for (const z of [-TRUSS_DEPTH / 2, TRUSS_DEPTH / 2]) {
    for (const y of [bottom, top]) add(0, y, z, span + 0.55, 0.16, 0.16);
    const cells = 10;
    const width = span / cells;
    for (let i = 0; i < cells; i++) {
      const dx = width;
      const dy = (i % 2 ? -1 : 1) * trussHeight;
      add(-POST_LATERAL + (i + 0.5) * width, (bottom + top) / 2, z,
        Math.hypot(dx, dy), 0.105, 0.105, Math.atan2(dy, dx));
    }
  }
  for (const x of [-POST_LATERAL, 0, POST_LATERAL]) {
    for (const y of [bottom, top]) add(x, y, 0, 0.14, 0.14, TRUSS_DEPTH);
  }
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, parts.length);
  frame.name = 'finish-gantry-truss';
  parts.forEach((part, i) => frame.setMatrixAt(i, part));
  frame.instanceMatrix.needsUpdate = true;
  frame.frustumCulled = false;
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);
}

function signals(root, height) {
  const housingMaterial = new THREE.MeshStandardMaterial({
    color: 0x202629, roughness: 0.7, metalness: 0.3,
  });
  lampMaterial = new THREE.MeshStandardMaterial({
    color: 0x08150c, emissive: 0x68df8a, emissiveIntensity: 0,
    roughness: 0.35, metalness: 0.1,
  });
  // Five hooded lamp pods on each face: readable from either camera/reverse travel.
  const housings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.82, 0.82, 0.52), housingMaterial, 10);
  const lenses = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.055, 16), lampMaterial, 10);
  housings.name = 'finish-signal-pods';
  lenses.name = 'finish-signal-lamps';
  const instance = new THREE.Object3D();
  for (let face = 0; face < 2; face++) for (let i = 0; i < 5; i++) {
    const sign = face ? 1 : -1;
    const index = face * 5 + i;
    instance.position.set((i - 2) * 1.15, height, sign * (TRUSS_DEPTH / 2 + 0.24));
    instance.rotation.set(0, 0, 0);
    instance.updateMatrix();
    housings.setMatrixAt(index, instance.matrix);
    instance.position.z += sign * 0.28;
    instance.rotation.x = Math.PI / 2;
    instance.updateMatrix();
    lenses.setMatrixAt(index, instance.matrix);
  }
  for (const mesh of [housings, lenses]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false; // All programs/buffers are exercised by boot draws.
    root.add(mesh);
  }
}

export function buildFinishLine() {
  if (finishRoot) return finishRoot;
  const center = pointAt(FINISH_T, new THREE.Vector3());
  const forward = tangentAt(FINISH_T, new THREE.Vector3()).setY(0).normalize();
  const right = offsetPointAt(FINISH_T, 1, 0, new THREE.Vector3()).sub(center).setY(0).normalize();
  finishRoot = new THREE.Group();
  finishRoot.name = 'finish-line-gate'; // Preserve the existing diagnostic handle.
  finishRoot.position.set(center.x, 0, center.z);
  finishRoot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, UP, forward));
  finishRoot.updateMatrixWorld(true);

  const ground = [-POST_LATERAL, POST_LATERAL].map(lateral => {
    const p = offsetPointAt(FINISH_T, lateral, 0, new THREE.Vector3());
    return groundHeightAt(p.x, p.z);
  });
  const bottom = Math.max(...ground) + CLEARANCE;
  const top = bottom + 1.45;
  const metal = new THREE.MeshStandardMaterial({ color: 0x949b9e, roughness: 0.58, metalness: 0.55 });
  structure(finishRoot, ground, bottom, top, metal);
  signals(finishRoot, (bottom + top) / 2);

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(POST_LATERAL * 2 - 0.55, BANNER_HEIGHT),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), color: 0xffffff,
      roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
  banner.name = 'finish-gate-checkered-banner';
  banner.position.set(0, bottom - BANNER_HEIGHT / 2, 0);
  banner.frustumCulled = false;
  finishRoot.add(banner);
  buildPaintedStrip(finishRoot);
  finishRoot.updateMatrixWorld(true);
  update(0);
  return finishRoot;
}

/** Static infrastructure; only the already-resident lamp emissive uniform changes. */
export function update(dt) {
  if (!lampMaterial) return;
  const approaching = state.progress >= FINISH_T - APPROACH_T;
  // Simple 150 ms intensity ramp; reversing out and replay both return lamps off.
  const target = approaching ? (state.theme === 'night' ? 1.8 : 1.2) : 0;
  signalLevel += (target - signalLevel) * (1 - Math.exp(-Math.max(0, dt) / 0.15));
  lampMaterial.emissiveIntensity = signalLevel;
  finishRoot.userData.signalling = approaching;
}
