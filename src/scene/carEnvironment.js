/** Unlocked outdoor reflection source. Never assigned to scene.environment. */
import * as THREE from 'three';
import { SETTINGS, REFLECTION, CAR_SPECULAR, NIGHT_CAR_TOE } from '../core/renderProfile.js';

let target;
let strength = SETTINGS.themes?.day.reflection[REFLECTION] ?? 0;
const materials = new Set();
const review = {
  specular: { value: CAR_SPECULAR },
  toe: { value: 0 },
  exposure: { value: 0.13 },
};

// Shared by originals and cached fades; transitions never compile another variant.
export function setCarReviewTreatment(nightWeight, exposure) {
  review.specular.value = THREE.MathUtils.lerp(CAR_SPECULAR, 1, nightWeight);
  review.toe.value = NIGHT_CAR_TOE ? nightWeight : 0;
  review.exposure.value = exposure;
}

/** Register opaque originals and the actual cached swap materials before warm-up. */
export function registerCarReflection(material) {
  if (!SETTINGS.carEnvironment || !material?.isMeshStandardMaterial) return;
  if (!target) throw new Error('Car environment must be generated before material warm-up');
  material.envMap = target.texture;
  material.envMapIntensity = strength;
  if ((CAR_SPECULAR !== 1 || NIGHT_CAR_TOE) && !materials.has(material)) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      shader.uniforms.uCarSpecular = review.specular;
      shader.uniforms.uCarToe = review.toe;
      shader.uniforms.uCarExposure = review.exposure;
      shader.fragmentShader = `uniform float uCarSpecular;
        uniform float uCarToe;
        uniform float uCarExposure;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n reflectedLight.indirectSpecular *= uCarSpecular;');
      // Invert Neutral's black offset for cars only. For non-compressed pixels,
      // this recovers exposure * radiance without altering the world's curve.
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float carMin = max(0.0, min(outgoingLight.r, min(outgoingLight.g, outgoingLight.b))) * uCarExposure;
        float inverseMin = carMin < 0.04 ? sqrt(carMin / 6.25) : carMin + 0.04;
        outgoingLight += uCarToe * max(0.0, inverseMin - carMin) / max(uCarExposure, 0.0001);
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => previousKey + '|p3u-t5-car-review';
  }
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
