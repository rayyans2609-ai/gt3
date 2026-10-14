/** Node-only wheel name fixtures and exact findWheels() before/after census. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS } from '../src/data/cars.js';

const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.ProgressEvent ??= class {
  constructor(type, props) { Object.assign(this, { type }, props); }
};

// Evaluate the actual helpers without importing cars.js's eager browser preload.
function classifier(source) {
  const constants = source.match(/const WHEEL_NAME = .*;\nconst NON_WHEEL_NAME = .*;/)[0];
  const helpers = source.slice(source.indexOf('function hasWheelName'), source.indexOf('/** Lowest tyre'));
  const spin = source.slice(source.indexOf('export function findWheels'), source.indexOf('// Importing this module'));
  return new Function(`${constants}\n${helpers}\n${spin.replace('export ', '')}
    return { findWheels, isWheelMesh, hasWheelName };`)();
}
const before = classifier(execFileSync('git', ['show', '8b59a7b:src/scene/cars.js'], {
  cwd: root, encoding: 'utf8',
}));
const after = classifier(await readFile(new URL('../src/scene/cars.js', import.meta.url), 'utf8'));

async function loadHierarchy(bytes) {
  // Preserve real GLTFLoader hierarchy/naming and instancing. Stub only material
  // textures and Draco positions: check-wheel-ground.mjs verifies real vertices.
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
    decodeDracoFile(_bytes, onLoad, attributes) {
      const geometry = new THREE.BufferGeometry();
      for (const name of Object.keys(attributes)) {
        const components = name.startsWith('uv') ? 2 : 3;
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(
          new Float32Array(3 * components), components,
        ));
      }
      onLoad(geometry);
    },
  });
  return (await loader.parseAsync(glb.buffer, '')).scene;
}

for (const resolution of ['tour', 'full']) for (const car of CARS) {
  const base = resolution === 'tour' ? 'public/models/tour/' : 'public/models/';
  const scene = await loadHierarchy(await readFile(new URL(`../${base}${car.modelFile}`, import.meta.url)));
  scene.traverse(object => assert.equal(object.visible, true, 'authored hidden object'));
  assert(scene.children.length);
  const a = before.findWheels(scene).map(mesh => mesh.name).sort();
  const b = after.findWheels(scene).map(mesh => mesh.name).sort();
  const added = b.filter(name => !a.includes(name));
  const removed = a.filter(name => !b.includes(name));
  console.log(`${resolution} ${car.id.padEnd(12)} ${a.length} -> ${b.length} ` +
    `added=${JSON.stringify(added)} removed=${JSON.stringify(removed)}`);
  assert.deepEqual(b, a, `${resolution}/${car.id}: spin set changed`);
  assert(!b.some(name => /steering/i.test(name)));
}
for (const name of ['trim', 'primitive', 'EXT_Wheelhouse', 'steering_wheel',
  'wheel_arch', 'wheel_well', 'WheelHouse', 'Wheel-House']) {
  assert.equal(after.hasWheelName({ name }), false, name);
}
for (const name of ['WHEEL_LF_2', 'wheel2', 'EXT_Tyre_0', 'amg_gt3_rims_0', 'rim', 'g_Tire']) {
  assert.equal(after.hasWheelName({ name }), true, name);
}
const rootObject = { name: 'car', parent: null };
const body = { name: 'body', parent: rootObject, material: { name: 'EXT_Rim_Decals' } };
assert.equal(after.isWheelMesh(body, rootObject, false), false);
assert.equal(after.isWheelMesh(body, rootObject, true), true);
const brake = { name: 'brake', parent: { name: 'WHEEL_LF', parent: rootObject },
  material: { name: 'tyre' } };
assert.equal(after.isWheelMesh(brake, rootObject, true), false);
const steering = { name: 'wheel', parent: { name: 'STEERING', parent: rootObject },
  material: { name: 'wheel' } };
assert.equal(after.isWheelMesh(steering, rootObject, true), false);
console.log('Classifier fixtures passed; Aston/Ferrari steering exclusion preserved.');
