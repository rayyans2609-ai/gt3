/**
 * Load and normalise the ten shipped GT3 models.
 *
 * The canonical pose is intentionally enforced here, once, so every consumer
 * (race rig, morph and montage) sees the same dimensions and orientation.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CARS } from '../data/cars.js';

export const CANONICAL_LENGTH = 4.6;

const EXPECTED_CAR_COUNT = 10;
const DRACO_DECODER_PATH =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const WHEEL_NAME = /wheel|tyre|tire|rim/i;
const NON_WHEEL_NAME = /brake|caliper|disc|rotor|arch|well/i;
const EPSILON = 1e-7;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _vertex = new THREE.Vector3();
const _instanceMatrix = new THREE.Matrix4();
const _vertexMatrix = new THREE.Matrix4();

let loadedCars = null;
let completedCount = 0;
let preloadPromise = null;
const progressListeners = new Set();

function assertRoster() {
  if (!Array.isArray(CARS)) {
    throw new Error(
      '[cars] src/data/cars.js must export CARS; car preloading cannot continue.',
    );
  }
  if (CARS.length !== EXPECTED_CAR_COUNT) {
    throw new Error(
      `[cars] Expected ${EXPECTED_CAR_COUNT} CARS entries, received ${CARS.length}.`,
    );
  }

  CARS.forEach((car, index) => {
    if (!car || car.index !== index || typeof car.id !== 'string' ||
        typeof car.modelFile !== 'string' || !car.modelFile) {
      throw new Error(
        `[cars] Invalid CARS entry at slot ${index}; expected { id, index: ${index}, modelFile }.`,
      );
    }
  });
}

function reportProgress() {
  const fraction = completedCount / EXPECTED_CAR_COUNT;
  for (const listener of progressListeners) {
    try {
      listener(completedCount, EXPECTED_CAR_COUNT, fraction);
    } catch (error) {
      console.error('[cars] Progress callback failed.', error);
    }
  }
  if (completedCount === EXPECTED_CAR_COUNT) progressListeners.clear();
}

function cloneMaterialInstances(root) {
  const clones = new Map();

  function cloneOne(material) {
    if (!material) return material;
    if (!clones.has(material)) {
      const clone = material.clone();
      // Material.clone() deliberately keeps texture references, avoiding a second
      // GPU texture allocation while allowing opacity/emissive changes per car.
      clone.envMapIntensity = 1.0;
      clones.set(material, clone);
    }
    return clones.get(material);
  }

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneOne)
      : cloneOne(object.material);
  });
}

function validBounds(box) {
  if (box.isEmpty()) return false;
  box.getSize(_size);
  return Number.isFinite(_size.x) && Number.isFinite(_size.y) &&
    Number.isFinite(_size.z) && _size.x > EPSILON && _size.z > EPSILON;
}

/**
 * Approximate how much mesh volume lies on either side of the car's midpoint.
 * Each transformed vertex receives an equal share of its mesh bounding volume;
 * that prevents a densely tessellated badge from outweighing a large body panel.
 * Instanced geometry (most commonly wheels) is evaluated once per instance.
 */
function measureHalfVolumes(root, midpointZ) {
  let negativeZ = 0;
  let positiveZ = 0;

  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry?.getAttribute('position');
    if (!position?.count) return;

    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const geometryBox = object.geometry.boundingBox;
    if (!geometryBox || geometryBox.isEmpty()) return;

    geometryBox.getSize(_size);
    // Thin panels legitimately have a zero-sized local axis. A tiny floor keeps
    // them represented without letting them dominate the volume estimate.
    const localVolume = Math.max(_size.x * _size.y * _size.z, EPSILON);
    const instanceCount = object.isInstancedMesh ? object.count : 1;

    for (let instance = 0; instance < instanceCount; instance++) {
      if (object.isInstancedMesh) {
        object.getMatrixAt(instance, _instanceMatrix);
        _vertexMatrix.multiplyMatrices(object.matrixWorld, _instanceMatrix);
      } else {
        _vertexMatrix.copy(object.matrixWorld);
      }

      const determinantScale = Math.abs(_vertexMatrix.determinant());
      const vertexVolume = localVolume * determinantScale / position.count;

      for (let index = 0; index < position.count; index++) {
        _vertex.fromBufferAttribute(position, index).applyMatrix4(_vertexMatrix);
        if (_vertex.z < midpointZ) negativeZ += vertexVolume;
        else positiveZ += vertexVolume;
      }
    }
  });

  return { negativeZ, positiveZ };
}

function normaliseScene(scene, car) {
  scene.updateWorldMatrix(true, true);
  _box.setFromObject(scene, true);
  if (!validBounds(_box)) {
    throw new Error(`Model ${car.modelFile} has no usable 3D bounds.`);
  }

  _box.getSize(_size);
  const lengthAxis = _size.x > _size.z ? 'X' : 'Z';
  const group = new THREE.Group();
  group.name = `car-${car.id}`;
  group.add(scene);

  // +90 degrees maps the source +X axis to canonical -Z. The rear-mass
  // disambiguation below establishes the sign for either source length axis.
  if (lengthAxis === 'X') group.rotation.y = Math.PI / 2;
  group.updateWorldMatrix(true, true);

  _box.setFromObject(group, true);
  if (!validBounds(_box)) {
    throw new Error(`Model ${car.modelFile} became invalid while aligning its length axis.`);
  }
  _box.getCenter(_centre);

  // Nose/tail orientation is NOT inferred. The mass-distribution heuristic that used to
  // live here was effectively a coin flip: on most of these models the two half-volumes
  // come out identical to four decimal places (0.0000 vs 0.0000), so it "decided" on
  // floating-point noise and put half the grid on track backwards.
  //
  // Instead, every model was rendered in side profile and checked by eye against the
  // direction of travel. All ten of these Sketchfab GT3 models are authored nose-toward
  // +Z, so all ten need the 180 flip. The table is explicit rather than a blanket
  // `true` so that a future replacement model with different authoring is a one-line
  // change here, next to the evidence, instead of a silent regression.
  //
  // Verified visually 2026-08-28 via carcheck.html side-profile contact sheet.
  const FLIP_BY_ID = {
    lexus: true, nissan: true, audi: true, bmw: true, mercedes: true,
    ferrari: true, mclaren: true, aston: true, lamborghini: true, porsche: true,
  };
  const halfVolumes = measureHalfVolumes(group, _centre.z);
  const flipApplied = FLIP_BY_ID[car.id] ?? true;
  if (flipApplied) {
    group.rotation.y += Math.PI;
    group.updateWorldMatrix(true, true);
  }

  const detectedForwardAxis = lengthAxis === 'Z'
    ? (flipApplied ? '+Z' : '-Z')
    : (flipApplied ? '-X' : '+X');

  _box.setFromObject(group, true);
  _box.getSize(_size);
  group.scale.setScalar(CANONICAL_LENGTH / _size.z);
  group.updateWorldMatrix(true, true);

  _box.setFromObject(group, true);
  _box.getCenter(_centre);
  group.position.set(-_centre.x, -_box.min.y, -_centre.z);
  group.updateWorldMatrix(true, true);

  cloneMaterialInstances(group);

  group.userData.normalization = {
    forwardAxis: detectedForwardAxis,
    lengthAxis,
    flipApplied,
    negativeHalfVolume: halfVolumes.negativeZ,
    positiveHalfVolume: halfVolumes.positiveZ,
  };

  console.info(
    `[cars] ${car.id}: forward ${detectedForwardAxis} ` +
    `(length axis ${lengthAxis}); 180° flip ${flipApplied ? 'applied' : 'not applied'} ` +
    `(from the verified orientation table).`,
  );

  return group;
}

function createPlaceholder(car, error) {
  const group = new THREE.Group();
  group.name = `car-${car.id}-load-error`;

  const material = new THREE.MeshStandardMaterial({
    color: 0xff1493,
    emissive: 0x55001f,
    emissiveIntensity: 0.8,
    roughness: 0.55,
    metalness: 0.1,
  });
  material.envMapIntensity = 1.0;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 1.2, CANONICAL_LENGTH),
    material,
  );
  mesh.name = `${car.id}-missing-model-placeholder`;
  mesh.position.y = 0.6;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  group.userData.loadError = error instanceof Error ? error.message : String(error);
  group.userData.normalization = {
    forwardAxis: '-Z',
    lengthAxis: 'Z',
    flipApplied: false,
    placeholder: true,
  };
  return group;
}

// The roster is loaded from the offline Tour-resolution set (textures <= 512 px,
// built by `node scripts/compress-models.mjs --tour`). Tour, morph, montage and
// Showcase all clone from this single roster; the full-resolution originals in
// /models/*.glb are not loaded at runtime.
const TOUR_MODEL_BASE = '/models/tour/';

function modelUrl(modelFile) {
  return modelFile.startsWith('/') ? modelFile : `${TOUR_MODEL_BASE}${modelFile}`;
}

async function loadOne(loader, car) {
  try {
    const gltf = await loader.loadAsync(modelUrl(car.modelFile));
    if (!gltf?.scene) throw new Error(`GLTFLoader returned no scene for ${car.modelFile}.`);
    return normaliseScene(gltf.scene, car);
  } catch (error) {
    console.error(
      `[cars] Failed to load ${car.id} from ${modelUrl(car.modelFile)}; using placeholder.`,
      error,
    );
    return createPlaceholder(car, error);
  } finally {
    completedCount += 1;
    reportProgress();
  }
}

async function beginPreload() {
  assertRoster();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  // The asset pipeline declares EXT_texture_webp and KHR_draco_mesh_compression.
  // It does not emit Meshopt or KTX2/Basis data, so those decoders are not needed.

  try {
    const models = await Promise.all(CARS.map((car) => loadOne(loader, car)));
    // A timed-out preload may already have installed a stable placeholder roster.
    // Do not replace it behind a running warm-up or an active drive.
    loadedCars ??= models;
    return loadedCars;
  } finally {
    dracoLoader.dispose();
  }
}

/**
 * Preload all cars. Repeated calls share the same work and resolved array.
 * @param {(loaded: number, total: number, fraction: number) => void} [onProgress]
 * @returns {Promise<THREE.Group[]>}
 */
export function preloadCars(onProgress) {
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new TypeError('[cars] preloadCars(onProgress) expects a function.');
  }

  if (onProgress) {
    progressListeners.add(onProgress);
    // A late subscriber immediately receives the current deterministic count.
    if (completedCount > 0) {
      queueMicrotask(() => {
        if (progressListeners.has(onProgress)) {
          try {
            onProgress(
              completedCount,
              EXPECTED_CAR_COUNT,
              completedCount / EXPECTED_CAR_COUNT,
            );
          } catch (error) {
            console.error('[cars] Progress callback failed.', error);
          }
          if (completedCount === EXPECTED_CAR_COUNT) {
            progressListeners.delete(onProgress);
          }
        }
      });
    }
  }

  if (!preloadPromise) preloadPromise = beginPreload();
  return preloadPromise;
}

function assertIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= EXPECTED_CAR_COUNT) {
    throw new RangeError(`[cars] Car index must be an integer from 0 to 9; received ${index}.`);
  }
}

export function getCarModel(index) {
  assertIndex(index);
  if (!loadedCars) {
    throw new Error('[cars] Models are not ready. Await carsReady before calling getCarModel().');
  }
  return loadedCars[index];
}

/** Recovery for a rejected or timed-out roster preload. The drive keeps ten models. */
export function recoverCars(error) {
  if (!loadedCars) {
    loadedCars = CARS.map(car => createPlaceholder(car, error));
    console.error('[cars] Preload did not finish; using placeholder roster.', error);
  }
  return loadedCars;
}

export function cloneCarModel(index) {
  const source = getCarModel(index);
  let hasSkinnedMesh = false;
  source.traverse((object) => {
    if (object.isSkinnedMesh) hasSkinnedMesh = true;
  });

  const clone = hasSkinnedMesh ? cloneSkeleton(source) : source.clone(true);
  cloneMaterialInstances(clone);
  return clone;
}

export function findWheels(carGroup) {
  const wheels = [];
  if (!carGroup?.traverse) return wheels;

  carGroup.traverse((object) => {
    if (!object.isMesh) return;
    const name = object.name || '';
    if (WHEEL_NAME.test(name) && !NON_WHEEL_NAME.test(name)) wheels.push(object);
  });
  return wheels;
}

// Importing this module starts the shared preload, while preloadCars(callback)
// lets UI code subscribe to the same in-flight operation for progress reporting.
export const carsReady = preloadCars();
// The bootstrap attaches recovery after its other module imports complete. Keep
// an early rejection from surfacing as an unhandled promise in that interval.
void carsReady.catch(() => {});
