/** A restrained, real-circuit finish gate and painted checker strip. */
import * as THREE from 'three';
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
const POST_RADIUS = 0.16;
const POST_LATERAL = TRACK.halfWidth + TRACK.curbWidth + 0.72;
const BANNER_HEIGHT = 1.55;
const CLEARANCE = 7.1;
const STRIP_LENGTH = 2.0;
const STRIP_COLUMNS = 14;
const STRIP_ROWS = 2;

let finishRoot = null;

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
    const t0 = THREE.MathUtils.clamp(FINISH_T + fromDistance / TRACK_LENGTH, 0, 1);
    const t1 = THREE.MathUtils.clamp(FINISH_T + toDistance / TRACK_LENGTH, 0, 1);

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
  strip.renderOrder = 2;
  root.add(strip);
}

function addPost(root, lateral, groundY, postTop, material) {
  const height = postTop - groundY;
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS * 1.08, height, 10),
    material,
  );
  post.name = lateral < 0 ? 'finish-gate-post-left' : 'finish-gate-post-right';
  post.position.set(lateral, groundY + height * 0.5, 0);
  post.castShadow = true;
  post.receiveShadow = true;
  root.add(post);
}

export function buildFinishLine() {
  if (finishRoot) return finishRoot;

  const center = pointAt(FINISH_T, new THREE.Vector3());
  const forward = tangentAt(FINISH_T, new THREE.Vector3()).setY(0).normalize();
  const right = offsetPointAt(FINISH_T, 1, 0, new THREE.Vector3())
    .sub(center)
    .setY(0)
    .normalize();

  finishRoot = new THREE.Group();
  finishRoot.name = 'finish-line-gate';
  finishRoot.position.set(center.x, 0, center.z);
  finishRoot.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, UP, forward),
  );
  finishRoot.updateMatrixWorld(true);

  const leftWorld = offsetPointAt(FINISH_T, -POST_LATERAL, 0, new THREE.Vector3());
  const rightWorld = offsetPointAt(FINISH_T, POST_LATERAL, 0, new THREE.Vector3());
  const leftGround = groundHeightAt(leftWorld.x, leftWorld.z);
  const rightGround = groundHeightAt(rightWorld.x, rightWorld.z);
  const highestGround = Math.max(leftGround, rightGround);
  const bannerBottom = highestGround + CLEARANCE;
  const bannerTop = bannerBottom + BANNER_HEIGHT;
  const postTop = bannerTop + 0.18;

  const metal = new THREE.MeshStandardMaterial({
    color: '#777A79',
    roughness: 0.64,
    metalness: 0.42,
  });
  addPost(finishRoot, -POST_LATERAL, leftGround, postTop, metal);
  addPost(finishRoot, POST_LATERAL, rightGround, postTop, metal);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(POST_LATERAL * 2, BANNER_HEIGHT),
    new THREE.MeshStandardMaterial({
      map: checkerTexture(),
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );
  banner.name = 'finish-gate-checkered-banner';
  banner.position.set(0, bannerBottom + BANNER_HEIGHT * 0.5, 0);
  banner.castShadow = true;
  finishRoot.add(banner);

  // Two hair-thin rails keep the banner reading as a taut physical sheet without
  // introducing signage, a chunky frame or game-like ornament.
  const railGeometry = new THREE.BoxGeometry(POST_LATERAL * 2 + 0.16, 0.075, 0.075);
  for (const y of [bannerBottom, bannerTop]) {
    const rail = new THREE.Mesh(railGeometry, metal);
    rail.position.set(0, y, 0);
    rail.castShadow = true;
    finishRoot.add(rail);
  }

  buildPaintedStrip(finishRoot);
  finishRoot.updateMatrixWorld(true);
  return finishRoot;
}

/** Static architecture; retained for the main loop's uniform scene-module contract. */
export function update(_dt) {}
