/** Draw the loaded cars through the Tour renderer before scroll is released.
 * One small mesh batch is drawn per animation frame, under the start screen.
 * This exercises real color and shadow passes, including geometry/texture uploads.
 */
import * as THREE from 'three';
import { CARS } from '../data/cars.js';
import { getCarModel } from './cars.js';
import { carMount, rig } from './carRig.js';
import { render, scene } from './sceneSetup.js';
import { beginWarmFade, endWarmFade } from './morph.js';
import { warmCheckpointResponse } from './checkpoints.js';

const MESHES_PER_FRAME = 12;

export function createCarWarmup(onProgress) {
  const originalChildren = [...carMount.children];
  const cars = CARS.map((_, index) => {
    const model = getCarModel(index);
    const meshes = [];
    model.traverse((object) => {
      if (object.isMesh && object.visible) meshes.push({
        object, visible: object.visible, frustumCulled: object.frustumCulled,
      });
    });
    return { model, meshes };
  });
  // The moving car later introduces a mapped, double-sided shadow variant that
  // a stationary solo draw can miss. Exercise both shadow sides through the same
  // composer path, using a texture already resident from the real models.
  let mappedTexture = null;
  for (const car of cars) {
    car.model.traverse((object) => {
      if (mappedTexture || !object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      mappedTexture = materials.find(mat => mat?.map)?.map ?? null;
    });
    if (mappedTexture) break;
  }
  const probeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const shadowProbes = [THREE.BackSide, THREE.DoubleSide].map((side) => {
    const mesh = new THREE.Mesh(probeGeometry, new THREE.MeshDepthMaterial({
      map: mappedTexture, side, depthPacking: THREE.RGBADepthPacking, fog: false,
    }));
    mesh.position.y = 1;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    rig.add(mesh);
    return mesh;
  });
  const draws = cars.reduce((sum, car) =>
    sum + Math.max(1, Math.ceil(car.meshes.length / MESHES_PER_FRAME)) * 2,
    1 + shadowProbes.length + cars.length - 1);
  let completed = 0;
  let carIndex = 0;
  let offset = 0;
  let fading = false;
  let pairIndex = 0;
  let shadowProbeIndex = 0;
  let done = false;

  for (const car of cars) for (const { object } of car.meshes) {
    object.visible = false;
    object.frustumCulled = false;
  }

  function restoreMount() {
    for (const child of [...carMount.children]) carMount.remove(child);
    for (const child of originalChildren) carMount.add(child);
  }

  function finish() {
    restoreMount();
    for (const probe of shadowProbes) rig.remove(probe);
    for (const car of cars) for (const entry of car.meshes) {
      entry.object.visible = entry.visible;
      entry.object.frustumCulled = entry.frustumCulled;
    }
    done = true;
    onProgress?.(1);
  }

  function step() {
    if (done) return true;
    if (carIndex >= cars.length) {
      if (pairIndex < cars.length - 1) {
        const first = cars[pairIndex];
        const second = cars[pairIndex + 1];
        for (const { object, visible } of [...first.meshes, ...second.meshes]) object.visible = visible;
        beginWarmFade(first.model);
        beginWarmFade(second.model);
        for (const child of [...carMount.children]) carMount.remove(child);
        carMount.add(first.model, second.model);
        render(0);
        restoreMount();
        endWarmFade(first.model);
        endWarmFade(second.model);
        for (const { object } of [...first.meshes, ...second.meshes]) object.visible = false;
        pairIndex++;
        completed++;
        onProgress?.(completed / draws);
        return false;
      }
      if (shadowProbeIndex < shadowProbes.length) {
        const probe = shadowProbes[shadowProbeIndex++];
        probe.visible = true;
        // Shadow-map draws have no scene fog. Render this depth material once
        // under the same program key so its mapped side variants remain cached.
        const fog = scene.fog;
        scene.fog = null;
        try { render(0); } finally { scene.fog = fog; probe.visible = false; }
        completed++;
        onProgress?.(completed / draws);
        return false;
      }
      const restoreGate = warmCheckpointResponse();
      render(0);
      restoreGate();
      completed++;
      finish();
      return true;
    }

    const { model, meshes } = cars[carIndex];
    const batch = meshes.slice(offset, offset + MESHES_PER_FRAME);
    // GLTF meshes can contain other meshes. A selected child must have each
    // mesh ancestor visible or the renderer silently skips its fade variant.
    const enabled = new Set();
    for (const { object } of batch) {
      for (let ancestor = object; ancestor && ancestor !== model; ancestor = ancestor.parent) {
        if (ancestor.isMesh) enabled.add(ancestor);
      }
    }
    for (const object of enabled) object.visible = true;
    for (const child of [...carMount.children]) carMount.remove(child);
    carMount.add(model);
    render(0);
    restoreMount();
    for (const object of enabled) object.visible = false;

    completed++;
    onProgress?.(completed / draws);
    offset += MESHES_PER_FRAME;
    if (offset >= meshes.length) {
      offset = 0;
      if (!fading) {
        beginWarmFade(model);
        fading = true;
      } else {
        endWarmFade(model);
        fading = false;
        carIndex++;
      }
    }
    return false;
  }

  return { step, get done() { return done; } };
}
