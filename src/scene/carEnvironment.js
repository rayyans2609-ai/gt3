/** Unlocked outdoor reflection source. Never assigned to scene.environment. */
import * as THREE from 'three';
import { SETTINGS, REFLECTION } from '../core/renderProfile.js';

let target;
let strength = SETTINGS.themes?.day.reflection[REFLECTION] ?? 0;
const materials = new Set();

/** Register opaque originals and the actual cached swap materials before warm-up. */
export function registerCarReflection(material) {
  if (!SETTINGS.carEnvironment || !material?.isMeshStandardMaterial) return;
  if (!target) throw new Error('Car environment must be generated before material warm-up');
  material.envMap = target.texture;
  material.envMapIntensity = strength;
  materials.add(material);
}

export function setCarReflectionStrength(value) {
  strength = value;
  for (const material of materials) material.envMapIntensity = value;
}

export function prepareCarEnvironment(renderer, models) {
  if (!SETTINGS.carEnvironment || target) return;
  // Float linear equirectangular map: pale blue zenith, cream horizon, muted earth.
  // A soft outdoor sun lobe supplies direction without indoor panels or hard boxes.
  const width = 256, height = 128, data = new Float32Array(width * height * 4);
  const sky = new THREE.Color('#B7CDD8'), horizon = new THREE.Color('#E8E0CD');
  const ground = new THREE.Color('#787A65'), color = new THREE.Color();
  const sun = new THREE.Vector3(-0.35, 0.87, -0.35).normalize();
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const latitude = Math.PI * ((y + 0.5) / height - 0.5);
    const longitude = 2 * Math.PI * ((x + 0.5) / width - 0.5);
    const elevation = Math.sin(latitude);
    direction.set(Math.cos(latitude) * Math.cos(longitude), elevation, Math.cos(latitude) * Math.sin(longitude));
    color.copy(horizon).lerp(elevation > 0 ? sky : ground, THREE.MathUtils.smoothstep(Math.abs(elevation), 0, 0.85));
    const glow = Math.pow(Math.max(0, direction.dot(sun)), 24) * 1.5;
    const i = (y * width + x) * 4;
    data[i] = color.r + glow; data[i + 1] = color.g + glow * 0.95; data[i + 2] = color.b + glow * 0.8; data[i + 3] = 1;
  }
  const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.LinearSRGBColorSpace;
  source.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  target = pmrem.fromEquirectangular(source);
  target.texture.name = 'GT3OutdoorCarPMREM';
  source.dispose(); pmrem.dispose();
  for (const model of models) model.traverse(object => {
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) registerCarReflection(material);
  });
}
