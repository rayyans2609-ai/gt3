/**
 * Node-only spin eligibility diagnostic for the ten runtime Tour GLBs.
 * Usage: node scripts/check-wheel-spin.mjs
 * Exit 1 means the runtime spin contract is broken; contact candidates are
 * diagnostics, NOT a proposed spin set. No geometry, pivots or runtime edits.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS } from '../src/data/cars.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const AXIS_TOLERANCE = 0.005; // 5 mm at the canonical 4.6 m car length.
const EXCLUDED = /steer|brake|caliper|disc|rotor|arch|well|wheel[\s_-]*house|(?:^|[^a-z])(?:body|chassis|cockpit)(?=$|[^a-z])/i;
globalThis.ProgressEvent ??= class {
  constructor(type, props) { Object.assign(this, { type }, props); }
};

// Evaluate the actual runtime selection without cars.js's browser preload.
const source = await readFile(new URL('../src/scene/cars.js', import.meta.url), 'utf8');
const constants = source.match(/const WHEEL_NAME = .*;\nconst NON_WHEEL_NAME = .*;/)[0];
const helpers = source.slice(source.indexOf('function hasWheelName'), source.indexOf('/** Lowest tyre'));
const spin = source.slice(source.indexOf('export function findWheels'), source.indexOf('// Importing this module'));
const { findWheels, isWheelMesh } = new Function(`${constants}\n${helpers}\n${spin.replace('export ', '')}
  return { findWheels, isWheelMesh };`)();

async function loadDraco() {
  const decoderDirectory = path.join(ROOT, 'node_modules/three/examples/jsm/libs/draco/gltf');
  const source = await readFile(path.join(decoderDirectory, 'draco_decoder.js'), 'utf8');
  const context = {
    console, require, __dirname: decoderDirectory, process, Buffer,
    setTimeout, clearTimeout, TextDecoder, TextEncoder, WebAssembly,
  };
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'draco_decoder.js' });
  return context.DracoDecoderModule({
    wasmBinary: await readFile(path.join(decoderDirectory, 'draco_decoder.wasm')),
  });
}

async function loadHierarchy(bytes, draco) {
  // Preserve GLTFLoader names, transforms and instances; decode real positions.
  // Only textures are removed: this check has no renderer or browser.
  const oldJsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + oldJsonLength));
  json.materials = json.materials.map(({ name }) => ({ name }));
  delete json.textures;
  delete json.images;
  delete json.samplers;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 32);
  jsonBytes.copy(padded);
  const binChunk = bytes.subarray(20 + oldJsonLength);
  const glb = Buffer.alloc(20 + padded.length + binChunk.length);
  bytes.copy(glb, 0, 0, 12);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  binChunk.copy(glb, 20 + padded.length);
  const loader = new GLTFLoader().setDRACOLoader({
    preload() {},
    decodeDracoFile(bytes, onLoad, attributes) {
      const decoder = new draco.Decoder();
      const mesh = new draco.Mesh();
      try {
        const status = decoder.DecodeArrayToMesh(new Int8Array(bytes), bytes.byteLength, mesh);
        if (!status.ok() || !mesh.ptr) throw new Error(status.error_msg());
        const attribute = decoder.GetAttributeByUniqueId(mesh, attributes.position);
        const values = new draco.DracoFloat32Array();
        try {
          decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
          const positions = new Float32Array(values.size());
          for (let i = 0; i < positions.length; i++) positions[i] = values.GetValue(i);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          onLoad(geometry);
        } finally {
          draco.destroy(values);
        }
      } finally {
        draco.destroy(mesh);
        draco.destroy(decoder);
      }
    },
  });
  return (await loader.parseAsync(glb.buffer, '')).scene;
}

function labels(mesh, root) {
  const names = [];
  for (let node = mesh; node && node !== root.parent; node = node.parent) names.push(node.name || '');
  for (const material of [mesh.material].flat()) names.push(material?.name || '');
  return names;
}

// rotation.x += spin (XYZ Euler) rotates about the parent's X line through
// the node origin. Check each instance separately, never the combined box.
function axisOffsets(mesh) {
  assert.equal(mesh.rotation.order, 'XYZ');
  assert(mesh.geometry.getAttribute('position')?.count, 'spin node needs real vertices');
  mesh.geometry.computeBoundingBox();
  const centre = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
  const pivot = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const axis = new THREE.Vector3(1, 0, 0).transformDirection(mesh.parent.matrixWorld);
  const instanceMatrix = new THREE.Matrix4();
  const offsets = [];
  for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
    const point = centre.clone();
    if (mesh.isInstancedMesh) {
      mesh.getMatrixAt(i, instanceMatrix);
      point.applyMatrix4(instanceMatrix);
    }
    point.applyMatrix4(mesh.matrixWorld).sub(pivot);
    offsets.push(point.cross(axis).length());
  }
  return offsets;
}

// Sanity fixtures prevent a vacuous axis check: offset along the axle is safe,
// offset perpendicular to it is not; separately centred instances cannot be
// spun together about the InstancedMesh origin.
const fixtureRoot = new THREE.Group();
const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.6));
fixtureRoot.add(fixture);
fixture.geometry.translate(2, 0, 0);
fixtureRoot.updateMatrixWorld(true);
assert(axisOffsets(fixture)[0] < 1e-6);
fixture.geometry.translate(0, 1, 0);
assert(axisOffsets(fixture)[0] > 0.99);
const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.6, 0.6), undefined, 2);
fixtureRoot.add(instances);
instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1, 2));
instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 1, -2));
fixtureRoot.updateMatrixWorld(true);
assert(axisOffsets(instances).every(offset => offset > 2));
console.log('PASS axis fixtures (centred, off-centre, separate instances)');

assert.equal(CARS.length, 10, 'spin contract covers all ten cars');
const draco = await loadDraco();
let empty = 0;
let excluded = 0;
let unsafe = 0;
for (const car of CARS) {
  const scene = await loadHierarchy(await readFile(new URL(
    `../public/models/tour/${car.modelFile}`, import.meta.url,
  )), draco);
  scene.updateWorldMatrix(true, true);
  const size = new THREE.Box3().setFromObject(scene, true).getSize(new THREE.Vector3());
  // Normalisation's yaw, levelling and translation are rigid transforms, so
  // they preserve the axis-to-centre distance. Only uniform scale matters.
  const scale = 4.6 / Math.max(size.x, size.z);
  assert(Number.isFinite(scale) && scale > 0, `${car.id}: invalid model bounds`);
  const selected = findWheels(scene);
  if (!selected.length) empty++;
  const badLabels = selected.filter(mesh => labels(mesh, scene).some(name => EXCLUDED.test(name)));
  excluded += badLabels.length;
  const badAxes = selected.filter(mesh => axisOffsets(mesh).some(offset => offset * scale > AXIS_TOLERANCE));
  unsafe += badAxes.length;
  let hasWheelNodes = false;
  scene.traverse(mesh => { if (mesh.isMesh && isWheelMesh(mesh, scene, false)) hasWheelNodes = true; });
  const candidates = [];
  scene.traverse(mesh => {
    if (mesh.isMesh && isWheelMesh(mesh, scene, !hasWheelNodes)) candidates.push(mesh);
  });
  const offCentre = candidates.filter(mesh => axisOffsets(mesh).some(offset => offset * scale > AXIS_TOLERANCE));
  const instanced = candidates.filter(mesh => mesh.isInstancedMesh && mesh.count > 1);
  const example = offCentre[0];
  const detail = example ? ` example=${example.name || '(unnamed)'} material=${[example.material].flat().map(m => m.name).join(',')}` +
    ` axis-offset=${(Math.max(...axisOffsets(example)) * scale).toFixed(3)}m` : '';
  console.log(`${selected.length && !badLabels.length && !badAxes.length ? 'PASS' : 'FAIL'} ${car.id}` +
    ` spin=${selected.length} contact-candidates=${candidates.length}` +
    ` off-centre=${offCentre.length} multi-instance=${instanced.length}${detail}`);
}
console.log(`${empty ? 'FAIL' : 'PASS'} non-empty spin set: ${CARS.length - empty}/${CARS.length} cars`);
console.log(`${excluded ? 'FAIL' : 'PASS'} selected steering/brake/body-label exclusions: ${excluded} violations` +
  (empty ? ' (empty sets; no positive selection proof)' : ''));
console.log(`${unsafe || empty ? 'FAIL' : 'PASS'} selected spin axis within 5mm of each bounds centre:` +
  ` ${unsafe} violations; ${empty} cars unavailable`);
process.exitCode = empty || excluded || unsafe ? 1 : 0;
