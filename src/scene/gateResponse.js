/** Local beam-edge illumination; the old sweep stays available for comparison. */
import * as THREE from 'three';
import { state } from '../core/state.js';

const requested = new URLSearchParams(location.search).get('gate');
export const gateTreatment = ['sweep', 'quiet'].includes(requested) ? requested : 'edge';
const quiet = gateTreatment === 'quiet';
const sweep = gateTreatment === 'sweep';
const DURATION = sweep ? 0.52 : 0.85;
const local = new THREE.Matrix4();
const base = new THREE.Matrix4();

export function createGateResponse(posts, beams) {
  const material = sweep ? new THREE.MeshBasicMaterial({
    color: 0xf3f5f4, transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false,
  }) : new THREE.MeshStandardMaterial({
    color: 0x687478, emissive: 0xe4eceb, emissiveIntensity: 0,
    metalness: 0.15, roughness: 0.5, transparent: true, opacity: 0,
    depthWrite: false,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const beamBand = new THREE.Mesh(geometry, material);
  const postBands = sweep ? [new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)] : [];
  const beamBack = sweep ? null : new THREE.Mesh(geometry, material);
  const meshes = [beamBand, ...postBands, ...(beamBack ? [beamBack] : [])];
  const group = new THREE.Group();
  group.name = 'checkpoint-traversal-response';
  group.visible = false;
  group.userData.treatment = gateTreatment;
  group.add(...meshes);
  const beamSize = beams.geometry.parameters;
  const postSize = posts.geometry.parameters;
  beamBand.scale.set(sweep ? beamSize.width * 0.11 : beamSize.width - 0.6,
    sweep ? beamSize.height * 1.18 : 0.055,
    sweep ? beamSize.depth * 1.12 : 0.045);
  beamBack?.scale.copy(beamBand.scale);
  for (const band of postBands) {
    band.scale.set(postSize.width * 1.18, postSize.height * 0.12, postSize.depth * 1.12);
  }
  for (const mesh of meshes) {
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
  }

  let gate = -1;
  let elapsed = DURATION;
  let triggerMeasureId = 0;
  let strength = 1;

  function place(mesh, source, index, x, y, z = 0) {
    source.getMatrixAt(index, base);
    // matrixAutoUpdate is off, so the band's size must be composed here too.
    local.makeScale(mesh.scale.x, mesh.scale.y, mesh.scale.z).setPosition(x, y, z);
    mesh.matrix.multiplyMatrices(base, local);
    mesh.matrixWorldNeedsUpdate = true;
  }

  function update(dt) {
    if (gate < 0 || elapsed >= DURATION) return;
    elapsed = Math.min(DURATION, elapsed + dt);
    const t = elapsed / DURATION;
    const night = state.theme === 'night';
    if (!sweep) {
      // Soft 170 ms rise, then a longer settle. A physical inset line, no bloom,
      // light source, post animation or travelling portal-like mask.
      const envelope = t < 0.2 ? Math.sin(t / 0.2 * Math.PI / 2) :
        Math.pow(Math.cos((t - 0.2) / 0.8 * Math.PI / 2), 2);
      material.opacity = envelope * strength * (night ? 0.72 : 0.62);
      material.emissiveIntensity = envelope * strength * (night ? 0.75 : 0.65);
      const edgeZ = beamSize.depth * 0.5 + 0.012;
      place(beamBand, beams, gate, 0, -beamSize.height * 0.5 + 0.018, -edgeZ);
      place(beamBack, beams, gate, 0, -beamSize.height * 0.5 + 0.018, edgeZ);
      if (elapsed >= DURATION) group.visible = false;
      return;
    }
    material.color.setHex(night ? 0xe8eff3 : 0xf3f5f4);
    material.opacity = (night ? 0.115 : 0.085) * Math.sin(Math.PI * t);
    const width = beamSize.width;
    const height = postSize.height;
    place(beamBand, beams, gate, (t - 0.5) * (width - beamBand.scale.x), 0);
    for (let side = 0; side < 2; side++) {
      place(postBands[side], posts, gate * 2 + side, 0,
        (0.5 - t) * (height - postBands[side].scale.y));
    }
    if (elapsed >= DURATION) group.visible = false;
  }

  function trigger(index, direction = 1) {
    if (quiet || index < 0 || index >= beams.count) return;
    const start = `gt3:gateTrigger:start:${++triggerMeasureId}`;
    const end = `gt3:gateTrigger:end:${triggerMeasureId}`;
    performance.mark(start);
    gate = index;
    strength = direction < 0 && !sweep ? 0.65 : 1;
    elapsed = 0;
    group.visible = true;
    update(0);
    performance.mark(end);
    performance.measure('gt3:gateTrigger', start, end);
    performance.clearMarks(start);
    performance.clearMarks(end);
  }

  // An actual draw during preload also warms this material and geometry. The
  // resulting pixels are covered by the start screen; restore visibility after it.
  function warm() {
    if (quiet) return () => {};
    const previous = { visible: group.visible, gate, elapsed, strength,
      emissiveIntensity: material.emissiveIntensity,
      opacity: material.opacity, color: material.color.clone(),
      matrices: meshes.map(mesh => mesh.matrix.clone()) };
    trigger(0);
    material.opacity = 0.001;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      group.visible = previous.visible;
      gate = previous.gate;
      elapsed = previous.elapsed;
      strength = previous.strength;
      if (!sweep) material.emissiveIntensity = previous.emissiveIntensity;
      material.opacity = previous.opacity;
      material.color.copy(previous.color);
      for (const [index, mesh] of meshes.entries()) {
        mesh.matrix.copy(previous.matrices[index]);
        mesh.matrixWorldNeedsUpdate = true;
      }
    };
  }

  return { group, trigger, update, warm };
}
