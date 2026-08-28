/**
 * coins.js — car-bearing collectibles, approach telegraph and pixel dissolve.
 *
 * This module owns only the world-space coin presentation and its collection/reset
 * lifecycle. Audio, HUD and montage code subscribe through onCoinCollected().
 */

import * as THREE from 'three';
import { state } from '../core/state.js';
import { CARS } from '../data/cars.js';
import {
  COIN_APPROACH_T,
  COIN_HEIGHT,
  COIN_T,
  COIN_TRIGGER_T,
  offsetPointAt,
  tangentAt,
} from './trackCurve.js';

const GOLD = new THREE.Color('#FFDE6E');
const PLACE_POSITION = new THREE.Vector3();
const PLACE_TANGENT = new THREE.Vector3();

const COIN_RADIUS = 1.7;
const COIN_THICKNESS = 0.28;
const SPIN_RATE = 0.9;
const BOB_AMOUNT = 0.28;
const BOB_RATE = 1.35;
const BASE_EMISSIVE = 0.12;
const APPROACH_EMISSIVE = 0.35;
const DISSOLVE_DURATION = 0.75;
const PARTICLE_DURATION = 0.9;
const RESET_FADE_DURATION = 0.38;
const PARTICLE_COUNT = 90;
const GRAVITY = 7.4;

// Shared by all ten coins. The cylinder axis is rotated from Y to Z so its broad
// faces are vertical in local XY, with the face normal pointing along the track.
const COIN_GEOMETRY = new THREE.CylinderGeometry(
  COIN_RADIUS,
  COIN_RADIUS,
  COIN_THICKNESS,
  64,
  6,
  false,
);
COIN_GEOMETRY.rotateX(Math.PI * 0.5);
const EMBLEM_GEOMETRY = new THREE.PlaneGeometry(2.15, 0.72, 18, 6);
const BEAM_GEOMETRY = new THREE.CylinderGeometry(1.5, 1.5, 9, 32, 1, true);

const BODY_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  uniform float uDissolve;
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  float cellRandom(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vUv = uv;
    vec2 cell = floor(uv * vec2(24.0, 14.0));
    float threshold = cellRandom(cell);
    float alive = step(uDissolve, threshold);
    float scatter = uDissolve * alive;
    vec3 jitter = vec3(
      cellRandom(cell + vec2(17.0, 3.0)) - 0.5,
      cellRandom(cell + vec2(5.0, 29.0)) - 0.5,
      cellRandom(cell + vec2(41.0, 11.0)) - 0.5
    );
    vec3 displaced = position
      + normal * scatter * (0.10 + threshold * 0.32)
      + jitter * scatter * 0.12;
    vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const BODY_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uGold;
  uniform vec3 uBrandColor;
  uniform float uMetalness;
  uniform float uRoughness;
  uniform float uEmissiveIntensity;
  uniform float uDissolve;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  float cellRandom(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 cell = floor(vUv * vec2(24.0, 14.0));
    if (uDissolve > cellRandom(cell)) discard;

    vec3 normal = normalize(vViewNormal);
    vec3 viewDirection = normalize(vViewPosition);
    vec3 keyDirection = normalize(vec3(-0.32, 0.76, 0.56));
    float diffuse = 0.55 + max(dot(normal, keyDirection), 0.0) * 0.42;
    vec3 halfDirection = normalize(keyDirection + viewDirection);
    float specularPower = mix(96.0, 18.0, uRoughness);
    float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower);
    vec3 reflectance = mix(vec3(0.04), uGold, uMetalness);
    vec3 color = uGold * diffuse + reflectance * specular * (1.15 - uRoughness);
    float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 2.5);
    color += uBrandColor * uEmissiveIntensity * (0.35 + fresnel * 2.2);

    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const EMBLEM_VERTEX_SHADER = /* glsl */ `
  precision highp float;

  uniform float uDissolve;
  varying vec2 vUv;

  float cellRandom(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vUv = uv;
    vec2 cell = floor(uv * vec2(16.0, 6.0));
    float threshold = cellRandom(cell);
    float alive = step(uDissolve, threshold);
    vec3 displaced = position + normal * uDissolve * alive * (0.04 + threshold * 0.12);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const EMBLEM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform float uDissolve;
  uniform float uOpacity;
  varying vec2 vUv;

  float cellRandom(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 cell = floor(vUv * vec2(16.0, 6.0));
    if (uDissolve > cellRandom(cell)) discard;
    vec4 mark = texture2D(uMap, vUv);
    if (mark.a < 0.02) discard;
    gl_FragColor = vec4(mark.rgb, mark.a * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BEAM_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float lowerFade = smoothstep(0.0, 0.17, vUv.y);
    float upperFade = 1.0 - smoothstep(0.68, 1.0, vUv.y);
    float wrapped = abs(fract(vUv.x + 0.5) - 0.5) * 2.0;
    float lateralSoftness = 1.0 - smoothstep(0.56, 1.0, wrapped);
    float alpha = uOpacity * lowerFade * upperFade * (0.38 + lateralSoftness * 0.62);
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  uniform float uPointScale;
  attribute vec3 aPixelColor;
  varying vec3 vColor;

  void main() {
    vColor = aPixelColor;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uPointScale * (260.0 / max(1.0, -viewPosition.z)), 3.0, 11.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;

  void main() {
    // The untouched point primitive is deliberately square: these are pixels,
    // not circular sparkles or texture sprites.
    gl_FragColor = vec4(vColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

let coinGroup = null;
let elapsed = 0;
let previousProgress = state.progress;
let approachActive = false;
const approachResult = { index: -1, proximity: 0 };
const coins = [];
const collectionCallbacks = [];

function smooth01(value) {
  return value * value * (3 - 2 * value);
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function brandCssValue(value) {
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`;
  return value;
}

function manufacturerMark(manufacturer) {
  const words = manufacturer.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length > 1) {
    let result = '';
    const count = Math.min(3, words.length);
    for (let i = 0; i < count; i++) result += words[i][0];
    return result;
  }
  return words[0].slice(0, 3);
}

function makeEmblemTexture(car) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('[coins] Canvas 2D context is required for coin emblems.');

  const mark = manufacturerMark(car.manufacturer);
  const tracking = 18;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '500 72px "DM Sans", sans-serif';
  context.textBaseline = 'middle';
  context.fillStyle = brandCssValue(car.brandColor);

  let width = 0;
  for (let i = 0; i < mark.length; i++) width += context.measureText(mark[i]).width;
  width += Math.max(0, mark.length - 1) * tracking;
  let x = (canvas.width - width) * 0.5;
  for (let i = 0; i < mark.length; i++) {
    context.fillText(mark[i], x, canvas.height * 0.51);
    x += context.measureText(mark[i]).width + tracking;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `coin-emblem-${car.id}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeBodyMaterial(brandColor) {
  const uniforms = {
    uGold: { value: GOLD },
    uBrandColor: { value: brandColor },
    uMetalness: { value: 0.85 },
    uRoughness: { value: 0.28 },
    uEmissiveIntensity: { value: BASE_EMISSIVE },
    uDissolve: { value: 0 },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'CoinPixelDissolve',
    uniforms,
    vertexShader: BODY_VERTEX_SHADER,
    fragmentShader: BODY_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
  });

  // Mirror the familiar standard-material fields for inspection/debug tooling;
  // the custom shader reads the matching uniforms above.
  material.metalness = 0.85;
  material.roughness = 0.28;
  material.emissive = brandColor;
  material.emissiveIntensity = BASE_EMISSIVE;
  return material;
}

function makeEmblemMaterial(texture, bodyUniforms) {
  return new THREE.ShaderMaterial({
    name: 'CoinEmblemPixelDissolve',
    uniforms: {
      uMap: { value: texture },
      uDissolve: bodyUniforms.uDissolve,
      uOpacity: bodyUniforms.uOpacity,
    },
    vertexShader: EMBLEM_VERTEX_SHADER,
    fragmentShader: EMBLEM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

function makeBeamMaterial(brandColor) {
  return new THREE.ShaderMaterial({
    name: 'CoinApproachBeam',
    uniforms: {
      uColor: { value: brandColor },
      uOpacity: { value: 0 },
    },
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function makeParticleBurst(index, brandColor) {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const initialPositions = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = new Float32Array(PARTICLE_COUNT * 3);
  const initialVelocities = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = i * 3;
    const angle = seededRandom(index * 401 + i * 7 + 1) * Math.PI * 2;
    const radius = Math.sqrt(seededRandom(index * 409 + i * 11 + 2)) * COIN_RADIUS;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = (seededRandom(index * 419 + i * 13 + 3) - 0.5) * COIN_THICKNESS;
    const speed = 2.4 + seededRandom(index * 421 + i * 17 + 4) * 3.2;
    const zDirection = (seededRandom(index * 431 + i * 19 + 5) - 0.5) * 1.8;
    const length = Math.sqrt(x * x + y * y + zDirection * zDirection) || 1;

    initialPositions[p] = x;
    initialPositions[p + 1] = y;
    initialPositions[p + 2] = z;
    initialVelocities[p] = (x / length) * speed;
    initialVelocities[p + 1] = (y / length) * speed + 1.35;
    initialVelocities[p + 2] = (zDirection / length) * speed;

    const brandMix = seededRandom(index * 433 + i * 23 + 6);
    colors[p] = GOLD.r + (brandColor.r - GOLD.r) * brandMix;
    colors[p + 1] = GOLD.g + (brandColor.g - GOLD.g) * brandMix;
    colors[p + 2] = GOLD.b + (brandColor.b - GOLD.b) * brandMix;
  }
  positions.set(initialPositions);
  velocities.set(initialVelocities);

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aPixelColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    name: 'CoinSquarePixelBurst',
    uniforms: {
      uPointScale: { value: 0.62 },
      uOpacity: { value: 0 },
    },
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = `coin-${index + 1}-pixel-burst`;
  points.frustumCulled = false;
  points.visible = false;

  return {
    points,
    material,
    positionAttribute,
    positions,
    initialPositions,
    velocities,
    initialVelocities,
  };
}

function validateRoster() {
  if (!Array.isArray(CARS) || CARS.length !== COIN_T.length) {
    throw new Error(`[coins] Expected CARS to contain exactly ${COIN_T.length} entries.`);
  }
  for (let i = 0; i < CARS.length; i++) {
    const car = CARS[i];
    if (!car || !car.id || !car.manufacturer || !car.displayName || car.brandColor == null) {
      throw new Error(`[coins] CARS[${i}] is missing id, manufacturer, displayName, or brandColor.`);
    }
  }
}

/** Build and return the group containing all ten track coins. */
export function buildCoins() {
  if (coinGroup) return coinGroup;
  validateRoster();

  coinGroup = new THREE.Group();
  coinGroup.name = 'car-coins';
  elapsed = 0;
  previousProgress = state.progress;

  for (let i = 0; i < COIN_T.length; i++) {
    const car = CARS[i];
    const brandColor = new THREE.Color(car.brandColor);
    const root = new THREE.Group();
    const visual = new THREE.Group();
    root.name = `coin-${i + 1}-${car.id}`;
    visual.name = `coin-${i + 1}-spinning-body`;

    offsetPointAt(COIN_T[i], 0, COIN_HEIGHT, PLACE_POSITION);
    tangentAt(COIN_T[i], PLACE_TANGENT);
    root.position.copy(PLACE_POSITION);
    root.rotation.y = Math.atan2(PLACE_TANGENT.x, PLACE_TANGENT.z);

    const bodyMaterial = makeBodyMaterial(brandColor);
    const body = new THREE.Mesh(COIN_GEOMETRY, bodyMaterial);
    body.name = `coin-${i + 1}-disc`;
    body.castShadow = true;
    body.receiveShadow = true;
    visual.add(body);

    const emblemTexture = makeEmblemTexture(car);
    const emblemMaterial = makeEmblemMaterial(emblemTexture, bodyMaterial.uniforms);
    const frontEmblem = new THREE.Mesh(EMBLEM_GEOMETRY, emblemMaterial);
    const backEmblem = new THREE.Mesh(EMBLEM_GEOMETRY, emblemMaterial);
    frontEmblem.name = `coin-${i + 1}-emblem-front`;
    backEmblem.name = `coin-${i + 1}-emblem-back`;
    frontEmblem.position.z = COIN_THICKNESS * 0.5 + 0.012;
    backEmblem.position.z = -COIN_THICKNESS * 0.5 - 0.012;
    backEmblem.rotation.y = Math.PI;
    visual.add(frontEmblem, backEmblem);

    const beamMaterial = makeBeamMaterial(brandColor);
    const beam = new THREE.Mesh(BEAM_GEOMETRY, beamMaterial);
    beam.name = `coin-${i + 1}-approach-beam`;
    beam.position.y = 0.3;
    beam.renderOrder = -1;
    beam.visible = false;

    const burst = makeParticleBurst(i, brandColor);
    root.add(beam, visual, burst.points);
    coinGroup.add(root);

    coins.push({
      index: i,
      root,
      visual,
      bodyMaterial,
      beam,
      beamMaterial,
      burst,
      phase: (i / COIN_T.length) * Math.PI * 2,
      collected: false,
      dissolveElapsed: 0,
      particleElapsed: PARTICLE_DURATION,
      fadeElapsed: RESET_FADE_DURATION,
    });
  }

  return coinGroup;
}

function beginBurst(coin) {
  const burst = coin.burst;
  burst.positions.set(burst.initialPositions);
  burst.velocities.set(burst.initialVelocities);
  burst.positionAttribute.needsUpdate = true;
  burst.material.uniforms.uOpacity.value = 1;
  burst.points.position.y = coin.visual.position.y;
  burst.points.visible = true;
  coin.particleElapsed = 0;
}

function collectCoin(coin) {
  coin.collected = true;
  coin.dissolveElapsed = 0;
  coin.fadeElapsed = RESET_FADE_DURATION;
  coin.visual.visible = true;
  coin.bodyMaterial.uniforms.uDissolve.value = 0;
  coin.bodyMaterial.uniforms.uOpacity.value = 1;
  beginBurst(coin);

  for (let i = 0; i < collectionCallbacks.length; i++) {
    collectionCallbacks[i](coin.index);
  }
}

function restoreCoin(coin) {
  coin.collected = false;
  coin.dissolveElapsed = 0;
  coin.fadeElapsed = 0;
  coin.visual.visible = true;
  coin.bodyMaterial.uniforms.uDissolve.value = 0;
  coin.bodyMaterial.uniforms.uOpacity.value = 0;
  coin.beamMaterial.uniforms.uOpacity.value = 0;
  coin.beam.visible = false;
  coin.burst.points.visible = false;
  coin.burst.material.uniforms.uOpacity.value = 0;
  coin.particleElapsed = PARTICLE_DURATION;
}

function updateBurst(coin, dt) {
  if (coin.particleElapsed >= PARTICLE_DURATION) return;
  coin.particleElapsed = Math.min(PARTICLE_DURATION, coin.particleElapsed + dt);
  const burst = coin.burst;
  const positions = burst.positions;
  const velocities = burst.velocities;

  for (let p = 0; p < positions.length; p += 3) {
    positions[p] += velocities[p] * dt;
    positions[p + 1] += velocities[p + 1] * dt;
    positions[p + 2] += velocities[p + 2] * dt;
    velocities[p + 1] -= GRAVITY * dt;
  }
  burst.positionAttribute.needsUpdate = true;

  const life = coin.particleElapsed / PARTICLE_DURATION;
  burst.material.uniforms.uOpacity.value = 1 - smooth01(life);
  if (coin.particleElapsed >= PARTICLE_DURATION) burst.points.visible = false;
}

/**
 * Advance animation, collection and reverse-reset state. This function performs no
 * per-frame object/array/typed-array allocation; all scratch and effect buffers are
 * created at module/build time.
 */
export function updateCoins(dt = 0) {
  if (!coinGroup) return;

  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const progress = state.progress;
  const movingForward = progress > previousProgress;
  elapsed += safeDt;
  approachActive = false;
  let nearestDistance = Infinity;

  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    const coinT = COIN_T[i];

    if (coin.collected && progress < coinT - COIN_TRIGGER_T) restoreCoin(coin);

    // Swept threshold test: a large progress step still collects every crossed coin,
    // while equality/no movement and all reverse movement remain inert.
    if (
      !coin.collected
      && movingForward
      && previousProgress < coinT + COIN_TRIGGER_T
      && progress >= coinT - COIN_TRIGGER_T
    ) {
      collectCoin(coin);
    }

    const distanceT = coinT - progress;
    let proximity = 0;
    if (!coin.collected && distanceT > 0 && distanceT < COIN_APPROACH_T) {
      proximity = 1 - distanceT / COIN_APPROACH_T;
      if (distanceT < nearestDistance) {
        nearestDistance = distanceT;
        approachResult.index = i;
        approachResult.proximity = proximity;
        approachActive = true;
      }
    }

    const easedProximity = smooth01(proximity);
    const approachScale = 1 + easedProximity * 0.18;
    coin.visual.scale.setScalar(approachScale);
    coin.bodyMaterial.uniforms.uEmissiveIntensity.value =
      BASE_EMISSIVE + easedProximity * (APPROACH_EMISSIVE - BASE_EMISSIVE);
    coin.bodyMaterial.emissiveIntensity = coin.bodyMaterial.uniforms.uEmissiveIntensity.value;
    coin.beamMaterial.uniforms.uOpacity.value = easedProximity * 0.32;
    coin.beam.visible = proximity > 0;

    coin.visual.rotation.y += SPIN_RATE * safeDt;
    coin.visual.position.y = Math.sin(elapsed * BOB_RATE + coin.phase) * BOB_AMOUNT;

    if (coin.collected) {
      coin.dissolveElapsed = Math.min(
        DISSOLVE_DURATION,
        coin.dissolveElapsed + safeDt,
      );
      coin.bodyMaterial.uniforms.uDissolve.value =
        coin.dissolveElapsed / DISSOLVE_DURATION;
      if (coin.dissolveElapsed >= DISSOLVE_DURATION) coin.visual.visible = false;
    } else if (coin.fadeElapsed < RESET_FADE_DURATION) {
      coin.fadeElapsed = Math.min(RESET_FADE_DURATION, coin.fadeElapsed + safeDt);
      const fade = coin.fadeElapsed / RESET_FADE_DURATION;
      coin.bodyMaterial.uniforms.uOpacity.value = smooth01(fade);
    } else {
      coin.bodyMaterial.uniforms.uOpacity.value = 1;
    }

    updateBurst(coin, safeDt);
  }

  previousProgress = progress;
}

/** Return the nearest upcoming, uncollected coin cue, or null. */
export function getApproach() {
  return approachActive ? approachResult : null;
}

/** Register a collection listener. Returns an unsubscribe function. */
export function onCoinCollected(fn) {
  if (typeof fn !== 'function') throw new TypeError('[coins] Collection listener must be a function.');
  collectionCallbacks.push(fn);
  return () => {
    const index = collectionCallbacks.indexOf(fn);
    if (index !== -1) collectionCallbacks.splice(index, 1);
  };
}

/** Restore one coin with the short reset fade, making it collectable immediately. */
export function resetCoin(index) {
  if (!Number.isInteger(index) || index < 0 || index >= COIN_T.length) {
    throw new RangeError(`[coins] Coin index must be between 0 and ${COIN_T.length - 1}.`);
  }
  if (!coinGroup) return;
  restoreCoin(coins[index]);
}

/** Restore every coin with the short reset fade. */
export function resetAllCoins() {
  if (!coinGroup) return;
  for (let i = 0; i < coins.length; i++) restoreCoin(coins[i]);
}
