/** Node-only scheduling/restore regression checks; no WebGL or browser is started. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';

const current = await readFile(new URL('../src/scene/carWarmup.js', import.meta.url), 'utf8');
const baseline = execFileSync('git', ['show', '8b59a7b:src/scene/carWarmup.js'], { encoding: 'utf8' });

function fixture(source, options = {}) {
  let now = 0;
  const operations = [];
  const trace = [];
  const progress = [];
  const compiles = [];
  const pending = [];
  const warnings = [];
  const programs = new Set();
  const textures = new Set();
  const geometries = new Set();
  const compiled = new Set();
  const uploaded = new Set();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 1, 10);
  const originalFog = scene.fog;
  const rig = new THREE.Group();
  const carMount = new THREE.Group();
  scene.add(rig);
  rig.add(carMount);
  const shared = new THREE.Texture();
  shared.name = 'shared';
  const cars = Array.from({ length: 10 }, (_, index) => {
    const model = new THREE.Group();
    model.name = `car-${index}`;
    for (let meshIndex = 0; meshIndex < (index === 0 ? 25 : 2); meshIndex++) {
      const texture = meshIndex % 2 ? shared : new THREE.Texture();
      texture.name ||= `${index}-${meshIndex}`;
      const material = new THREE.MeshStandardMaterial({ map: texture });
      material.name = `${index}-${meshIndex}`;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
      mesh.name = `${index}-${meshIndex}`;
      mesh.geometry.name = mesh.name;
      if (options.hidden && index === 0 && meshIndex === 0) mesh.visible = false;
      if (meshIndex === 1) mesh.material = [material, material];
      model.add(mesh);
    }
    return model;
  });
  carMount.add(cars[0]);
  const snapshots = cars.flatMap(model => model.children.map(object => ({
    object, material: object.material, visible: object.visible, frustumCulled: object.frustumCulled,
  })));
  const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const key = material => `${material.name || material.type}:${material.transparent}:${material.side}`;
  const unit = (type, cost) => { operations.push({ type, at: now }); now += cost; };
  const composer = { readBuffer: { name: 'composer' } };
  let target = null;
  const renderer = {
    extensions: { has: () => options.extension !== false },
    getRenderTarget: () => target,
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 3,
    setRenderTarget: (next, face, mip) => {
      target = next;
      if (next === null) { assert.equal(face, 2); assert.equal(mip, 3); }
    },
    compileAsync: (model, camera, targetScene) => {
      assert.equal(target, composer.readBuffer);
      assert.equal(targetScene, scene);
      unit('compile', 3);
      compiles.push(model.name);
      if (options.compileThrow) throw new Error('compile failed');
      model.traverse(object => {
        if (object.isMesh) for (const material of materialsOf(object)) compiled.add(key(material));
      });
      return new Promise((resolve, reject) => pending.push(() => {
        if (options.compileReject) reject(new Error('compile rejected'));
        else if (options.compileRejectUndefined) reject();
        else resolve();
      }));
    },
    initTexture: texture => {
      unit('texture', 1.25);
      if (options.textureThrow) throw new Error('upload failed');
      assert(!uploaded.has(texture.name), 'duplicate texture upload');
      uploaded.add(texture.name);
      textures.add(texture.name);
    },
  };
  if (options.noCompile) delete renderer.compileAsync;
  if (options.noExtensions) delete renderer.extensions;
  const fadeCache = new WeakMap();
  function beginWarmFade(model) {
    model.traverse(object => {
      if (!object.isMesh) return;
      const fades = materialsOf(object).map(material => {
        if (!fadeCache.has(material)) {
          const fade = material.clone();
          fade.transparent = true;
          fade.depthWrite = false;
          fade.forceSinglePass = true;
          fade.opacity = 0.5;
          fadeCache.set(material, fade);
        }
        return fadeCache.get(material);
      });
      object.material = Array.isArray(object.material) ? fades : fades[0];
    });
  }
  function render() {
    assert.equal(target, null, 'compile target leaked into a draw');
    unit('draw', options.heavyDraw ? 19 : 2);
    const visible = [];
    scene.traverseVisible(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry.name || 'probe');
      for (const material of materialsOf(object)) {
        const program = key(material);
        programs.add(program);
        if (material.map) textures.add(material.map.name);
        if (options.expectPrepared && material.name) {
          assert(compiled.has(program), 'draw preceded program preparation');
          assert(uploaded.has(material.map.name), 'draw preceded texture preparation');
        }
        visible.push(`${object.name}:${program}`);
      }
    });
    trace.push(visible.sort());
  }
  const code = source.replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  const create = new Function('THREE', 'CARS', 'getCarModel', 'carMount', 'rig',
    'render', 'scene', 'renderer', 'camera', 'composer', 'beginWarmFade',
    'warmCheckpointResponse', 'performance', 'console', `${code}\nreturn createCarWarmup;`)(
    THREE, cars, index => cars[index], carMount, rig, render, scene, renderer,
    new THREE.PerspectiveCamera(), composer, beginWarmFade, () => () => {},
    { now: () => now }, { warn: (...args) => warnings.push(args) },
  );
  const warmup = create(fraction => progress.push(fraction), null, { throwAtDraw: options.throwAtDraw });
  function restored() {
    assert(warmup.restored);
    assert.equal(scene.fog, originalFog);
    assert.deepEqual(carMount.children, [cars[0]]);
    assert.equal(rig.children.length, 1);
    for (const snapshot of snapshots) {
      assert.equal(snapshot.object.material, snapshot.material);
      assert.equal(snapshot.object.visible, snapshot.visible);
      assert.equal(snapshot.object.frustumCulled, snapshot.frustumCulled);
    }
  }
  async function pump() {
    for (let frame = 0; !warmup.done && frame < 300; frame++) {
      const start = now;
      const first = operations.length;
      warmup.runFrame();
      const units = operations.slice(first);
      assert(units.filter(unit => unit.type === 'texture').length <= 4);
      assert(units.every(unit => unit.at - start < 12), 'unit started past frame budget');
      for (const settle of pending.splice(0)) settle();
      await Promise.resolve();
    }
    assert(warmup.done, 'warm-up did not finish');
    restored();
  }
  return { warmup, pump, restored, trace, progress, compiles, pending, operations,
    warnings, programs, textures, geometries, uploaded };
}

const old = fixture(baseline);
await old.pump();
const healthy = fixture(current, { expectPrepared: true });
await healthy.pump();
assert.deepEqual(healthy.trace, old.trace, 'original draw order/state changed');
for (const resource of ['programs', 'textures', 'geometries']) {
  assert.deepEqual([...healthy[resource]].sort(), [...old[resource]].sort(), resource);
}
assert.equal(healthy.compiles.length, 20, 'normal and fade compile per car');
assert.equal(healthy.warmup.progress, 1);
assert.equal(healthy.progress.at(-1), 1);
for (const options of [{ extension: false }, { noCompile: true }, { noExtensions: true },
  { hidden: true }, { compileThrow: true }, { compileReject: true },
  { compileRejectUndefined: true }, { textureThrow: true }, { heavyDraw: true }]) {
  const run = fixture(current, options);
  await run.pump();
  const control = options.hidden ? fixture(baseline, options) : old;
  if (options.hidden) await control.pump();
  assert.deepEqual(run.trace, control.trace);
  if (options.extension === false || options.noCompile || options.noExtensions || options.hidden) {
    assert.equal(run.compiles.length, 0);
    assert.equal(run.uploaded.size, 0);
  }
}
for (const options of [{}, { extension: false }]) {
  const run = fixture(current, { ...options, throwAtDraw: 20 });
  await assert.rejects(run.pump(), /Injected mid-warm-up draw failure/);
  run.restored();
  assert.equal(run.trace.length, 19, 'throwAtDraw numbering changed');
}
const stopped = fixture(current);
stopped.warmup.runFrame();
assert(stopped.pending.length);
stopped.warmup.abort();
stopped.restored();
const operationCount = stopped.operations.length;
for (const settle of stopped.pending.splice(0)) settle();
await Promise.resolve();
assert.equal(stopped.warmup.runFrame(), true);
assert.equal(stopped.operations.length, operationCount, 'late compile mutated aborted warm-up');
console.log('PASS: draw/resource parity, normal/fade preparation, texture quota, 12 ms budget, fallback, faults and late abort.');
