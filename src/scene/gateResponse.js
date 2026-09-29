/** A brief neutral highlight on the one timing gate the car has just crossed. */
import * as THREE from 'three';
import { state } from '../core/state.js';

const DURATION = 0.52;
const quiet = new URLSearchParams(location.search).get('gate') === 'quiet';
const local = new THREE.Matrix4();
const base = new THREE.Matrix4();

export function createGateResponse(posts, beams) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf3f5f4, transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const beamBand = new THREE.Mesh(geometry, material);
  const postBands = [new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material)];
  const group = new THREE.Group();
  group.name = 'checkpoint-traversal-response';
  group.visible = false;
  group.add(beamBand, ...postBands);
  const beamSize = beams.geometry.parameters;
  const postSize = posts.geometry.parameters;
  beamBand.scale.set(beamSize.width * 0.11, beamSize.height * 1.18, beamSize.depth * 1.12);
  for (const band of postBands) {
    band.scale.set(postSize.width * 1.18, postSize.height * 0.12, postSize.depth * 1.12);
  }
  for (const mesh of [beamBand, ...postBands]) {
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
  }

  let gate = -1;
  let elapsed = DURATION;
  let triggerMeasureId = 0;

  function place(mesh, source, index, x, y) {
    source.getMatrixAt(index, base);
    // matrixAutoUpdate is off, so the band's size must be composed here too.
    local.makeScale(mesh.scale.x, mesh.scale.y, mesh.scale.z).setPosition(x, y, 0);
    mesh.matrix.multiplyMatrices(base, local);
    mesh.matrixWorldNeedsUpdate = true;
  }

  function update(dt) {
    if (gate < 0 || elapsed >= DURATION) return;
    elapsed = Math.min(DURATION, elapsed + dt);
    const t = elapsed / DURATION;
    material.color.setHex(state.theme === 'night' ? 0xe8eff3 : 0xf3f5f4);
    material.opacity = (state.theme === 'night' ? 0.115 : 0.085) * Math.sin(Math.PI * t);
    const width = beamSize.width;
    const height = postSize.height;
    place(beamBand, beams, gate, (t - 0.5) * (width - beamBand.scale.x), 0);
    for (let side = 0; side < 2; side++) {
      place(postBands[side], posts, gate * 2 + side, 0,
        (0.5 - t) * (height - postBands[side].scale.y));
    }
    if (elapsed >= DURATION) group.visible = false;
  }

  function trigger(index) {
    if (quiet || index < 0 || index >= beams.count) return;
    const start = `gt3:gateTrigger:start:${++triggerMeasureId}`;
    const end = `gt3:gateTrigger:end:${triggerMeasureId}`;
    performance.mark(start);
    gate = index;
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
    const previous = { visible: group.visible, gate, elapsed,
      opacity: material.opacity, color: material.color.clone(),
      matrices: [beamBand, ...postBands].map(mesh => mesh.matrix.clone()) };
    trigger(0);
    material.opacity = 0.001;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      group.visible = previous.visible;
      gate = previous.gate;
      elapsed = previous.elapsed;
      material.opacity = previous.opacity;
      material.color.copy(previous.color);
      for (const [index, mesh] of [beamBand, ...postBands].entries()) {
        mesh.matrix.copy(previous.matrices[index]);
        mesh.matrixWorldNeedsUpdate = true;
      }
    };
  }

  return { group, trigger, update, warm };
}
