/**
 * environment.js — grass, sky and sparse circuit dressing. (SPEC §6, §11, §14)
 *
 * Everything in this module is built once. The broad grass surface is one mesh and
 * every dressing category is one InstancedMesh so the environment remains cheap to
 * stream past the camera for the whole route.
 */

import * as THREE from 'three';
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
  const shoulderFade = THREE.MathUtils.smoothstep(distanceFromAsphalt, 18, 38);
  return terrainNoise(x, z) * 5.2 * shoulderFade;
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

/**
 * Height of the displaced grass at an arbitrary world-space XZ coordinate.
 * The closest route segment supplies both the local track elevation and distance
 * from asphalt; terrainNoise remains the single source of rolling displacement.
 */
export function groundHeightAt(x, z) {
  let closestDistanceSq = Infinity;
  let closestBaseY = groundRoute[0]?.y ?? -0.03;

  for (let i = 0; i < groundRoute.length - 1; i++) {
    const a = groundRoute[i];
    const b = groundRoute[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const along = lengthSq > 1e-8
      ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1)
      : 0;
    const nearestX = a.x + dx * along;
    const nearestZ = a.z + dz * along;
    const offsetX = x - nearestX;
    const offsetZ = z - nearestZ;
    const distanceSq = offsetX * offsetX + offsetZ * offsetZ;

    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestBaseY = THREE.MathUtils.lerp(a.y, b.y, along);
    }
  }

  const distanceFromAsphalt = Math.max(
    0,
    Math.sqrt(closestDistanceSq) - TRACK.halfWidth,
  );
  return closestBaseY + terrainDisplacement(x, z, distanceFromAsphalt);
}

// ---------------------------------------------------------------------------
// Grass geometry
// ---------------------------------------------------------------------------

function interpolatedTrackEdge(side, t, out) {
  const edges = trackSurface?.trackEdges;
  const samples = edges?.[side];
  if (Array.isArray(samples) && samples.length > 1) {
    const sample = THREE.MathUtils.clamp(t, 0, 1) * (samples.length - 1);
    const a = Math.floor(sample);
    const b = Math.min(samples.length - 1, a + 1);
    return out.copy(samples[a]).lerp(samples[b], sample - a);
  }

  // Namespace import intentionally tolerates track.js temporarily omitting the
  // concurrent trackEdges export.
  const outerShoulder = TRACK.halfWidth + TRACK.curbWidth + TRACK.shoulderWidth;
  const lateral = side === 'left' ? -outerShoulder : outerShoulder;
  return offsetPointAt(t, lateral, -0.03, out);
}

function buildGrassGeometry() {
  const positions = [];
  const colors = [];
  const indices = [];
  const bounds = sampleTrackBounds();
  const horizonY = bounds.min.y - 0.08;
  const sharedEdgeCount = Math.min(
    trackSurface?.trackEdges?.left?.length ?? 0,
    trackSurface?.trackEdges?.right?.length ?? 0,
  );
  // Matching track.js's ring count makes the shared shoulder/grass seam exact.
  const alongSegments = sharedEdgeCount > 1
    ? sharedEdgeCount - 1
    : Math.max(700, Math.ceil(TRACK_LENGTH / 2));
  // Stay fine enough to resolve the 48-66 m terrain wavelengths in the visible
  // field, then widen only once linear fog has substantially hidden the surface.
  const outwardSteps = [
    0, 10, 22, 36, 52, 70, 90, 112, 136, 162, 190,
    220, 254, 290, 330, 374, 422, 474, 530, 590, 654, 722,
  ];
  const rows = outwardSteps.length;
  const centre = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const grassColor = new THREE.Color();

  for (const side of ['left', 'right']) {
    const baseVertex = positions.length / 3;

    for (let i = 0; i <= alongSegments; i++) {
      const t = i / alongSegments;
      pointAt(t, centre);
      interpolatedTrackEdge(side, t, edge);
      outward.subVectors(edge, centre).setY(0);
      let shoulderEdgeDistance = outward.length() - TRACK.halfWidth;

      // A malformed/empty concurrent edge array should never poison the ground.
      if (outward.lengthSq() < 1e-6) {
        tangentAt(t, outward).cross(UP);
        if (side === 'left') outward.negate();
      }
      outward.normalize();
      shoulderEdgeDistance = Math.max(
        0,
        Number.isFinite(shoulderEdgeDistance)
          ? shoulderEdgeDistance
          : TRACK.curbWidth + TRACK.shoulderWidth,
      );

      for (const outwardStep of outwardSteps) {
        const distanceFromAsphalt = shoulderEdgeDistance + outwardStep;
        const x = edge.x + outward.x * outwardStep;
        const z = edge.z + outward.z * outwardStep;
        const noise = terrainNoise(x, z);
        // Far skirts can cross a later, lower stretch of road; do not carry this
        // edge's elevation hundreds of metres into the horizon.
        const baseY = THREE.MathUtils.lerp(
          edge.y, horizonY, THREE.MathUtils.smoothstep(outwardStep, 240, 530),
        );
        const y = baseY + terrainDisplacement(x, z, distanceFromAsphalt);
        positions.push(x, y, z);

        const colorMix = THREE.MathUtils.clamp(0.5 + noise * 0.48, 0.04, 0.96);
        grassColor.copy(GRASS_BASE).lerp(GRASS_LIGHT, colorMix);
        colors.push(grassColor.r, grassColor.g, grassColor.b);
      }
    }

    for (let i = 0; i < alongSegments; i++) {
      for (let row = 0; row < rows - 1; row++) {
        const a = baseVertex + i * rows + row;
        const b = a + rows;
        if (side === 'left') {
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        } else {
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }

  // Continue the displaced surface beyond both open ends of the route. Without
  // these caps, the final skirt ring reveals the lower horizon plane as a straight
  // geometric step when the camera reaches the run to the flag.
  const capAlongSteps = [0, 12, 28, 48, 72, 100, 132, 168, 208, 252, 300, 352, 408, 468, 532, 600, 672, 748];
  const capAcrossSteps = [];
  for (let lateral = -748; lateral <= 748; lateral += 22) capAcrossSteps.push(lateral);
  if (capAcrossSteps.at(-1) !== 748) capAcrossSteps.push(748);
  const capTangent = new THREE.Vector3();
  const capRight = new THREE.Vector3();
  const capCentre = new THREE.Vector3();
  const capOffset = new THREE.Vector3();

  for (const t of [0, 1]) {
    const baseVertex = positions.length / 3;
    pointAt(t, capCentre);
    tangentAt(t, capTangent).setY(0).normalize();
    if (t === 0) capTangent.negate();
    offsetPointAt(t, 1, 0, capOffset);
    capRight.subVectors(capOffset, capCentre).setY(0).normalize();

    for (const along of capAlongSteps) {
      for (const lateral of capAcrossSteps) {
        const x = capCentre.x + capTangent.x * along + capRight.x * lateral;
        const z = capCentre.z + capTangent.z * along + capRight.z * lateral;
        const noise = terrainNoise(x, z);
        positions.push(x, groundHeightAt(x, z), z);
        const colorMix = THREE.MathUtils.clamp(0.5 + noise * 0.48, 0.04, 0.96);
        grassColor.copy(GRASS_BASE).lerp(GRASS_LIGHT, colorMix);
        colors.push(grassColor.r, grassColor.g, grassColor.b);
      }
    }

    const columns = capAcrossSteps.length;
    const upwardWinding = capTangent.clone().cross(capRight).dot(UP) > 0;
    for (let row = 0; row < capAlongSteps.length - 1; row++) {
      for (let column = 0; column < columns - 1; column++) {
        const a = baseVertex + row * columns + column;
        const b = a + columns;
        const c = a + 1;
        const d = b + 1;
        if (upwardWinding) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }

  // A single low plane below the sculpted skirts guarantees that no camera angle
  // can expose the clear colour beyond the generated terrain.
  const horizonRadius = skyRadiusFor(bounds);
  const planeBase = positions.length / 3;
  // Extend past both the camera far plane and sky dome's projected edge. Linear fog
  // reaches full strength long before this geometry can terminate on screen.
  const planeHalfSize = horizonRadius * 1.35;
  const cx = (bounds.min.x + bounds.max.x) * 0.5;
  const cz = (bounds.min.z + bounds.max.z) * 0.5;
  positions.push(
    cx - planeHalfSize, horizonY, cz - planeHalfSize,
    cx + planeHalfSize, horizonY, cz - planeHalfSize,
    cx + planeHalfSize, horizonY, cz + planeHalfSize,
    cx - planeHalfSize, horizonY, cz + planeHalfSize,
  );
  for (let i = 0; i < 4; i++) colors.push(GRASS_BASE.r, GRASS_BASE.g, GRASS_BASE.b);
  indices.push(planeBase, planeBase + 2, planeBase + 1, planeBase, planeBase + 3, planeBase + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // Positions are fully displaced before this call so the directional sun models
  // the hills instead of lighting the grass as an undeformed plane.
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

function groundPositionAt(t, lateral, out = new THREE.Vector3()) {
  offsetPointAt(t, lateral, 0, out);
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
    groundPositionAt(t, lateral, position);
    const uniformScale = 0.8 + random() * 0.8;
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
  const count = Math.floor(TRACK_LENGTH / 140);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'distance-markers';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const t = Math.min(0.985, ((i + 0.7) * 140) / TRACK_LENGTH);
    const bend = curvatureAt(t);
    const side = Math.abs(bend) > 0.08 ? Math.sign(bend) : (i % 2 ? -1 : 1);
    // The nominal post is twelve metres beyond the run-off zone. The final centre
    // offset also protects the global 22 m asphalt clearance including board depth.
    const distanceFromEdge = Math.max(
      ASPHALT_CLEARANCE + 1.1,
      TRACK.curbWidth + TRACK.shoulderWidth + 12,
    );
    groundPositionAt(t, side * (TRACK.halfWidth + distanceFromEdge), position);
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

  for (const corner of sharpCornerPeaks()) {
    const stackCount = 3 + Math.floor(random() * 3);
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
    groundPositionAt(placement.t, placement.lateral, position);
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
    groundPositionAt(t, side * (TRACK.halfWidth + distanceFromEdge), position);
    quaternion.setFromAxisAngle(UP, yawForTangent(t));
    const size = 0.9 + random() * 0.16;
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

  const grass = new THREE.Mesh(buildGrassGeometry(), grassMaterial);
  grass.name = 'grass-skirts-and-horizon';
  grass.receiveShadow = true;
  root.add(grass);

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
