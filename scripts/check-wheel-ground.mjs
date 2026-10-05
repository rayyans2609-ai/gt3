/**
 * Node-only wheel-ground verifier. It decodes POSITION accessors from the
 * Draco GLBs, mirrors cars.js normalisation, and checks tour/full parity.
 * Usage: node scripts/check-wheel-ground.mjs
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { CARS } from '../src/data/cars.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CANONICAL_LENGTH = 4.6;
const TOLERANCE = 0.005;
const EPSILON = 1e-7;
const WHEEL_NAME = /wheel|tyre|tire|rim/i;
const NON_WHEEL_NAME = /brake|caliper|disc|rotor|arch|well|steering/i;
const require = createRequire(import.meta.url);

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
    for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transform(matrix, [x, y, z]) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function namedWheel(name) {
  return WHEEL_NAME.test(name || '') && !NON_WHEEL_NAME.test(name || '');
}

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

function parseGlb(buffer) {
  let offset = 12;
  let json;
  let bin;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error('Expected a JSON and BIN chunk.');
  return { json, bin };
}

function decodePositions(draco, gltf, bin, primitive) {
  const extension = primitive.extensions?.KHR_draco_mesh_compression;
  if (!extension) throw new Error('Expected KHR_draco_mesh_compression.');
  const view = gltf.bufferViews[extension.bufferView];
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (view.byteOffset || 0), view.byteLength);
  const decoder = new draco.Decoder();
  const geometry = new draco.Mesh();
  try {
    const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, geometry);
    if (!status.ok() || geometry.ptr === 0) throw new Error(`Draco decode failed: ${status.error_msg()}`);
    const attribute = decoder.GetAttributeByUniqueId(geometry, extension.attributes.POSITION);
    const valueCount = geometry.num_points() * attribute.num_components();
    const byteLength = valueCount * Float32Array.BYTES_PER_ELEMENT;
    const pointer = draco._malloc(byteLength);
    try {
      decoder.GetAttributeDataArrayForAllPoints(geometry, attribute, draco.DT_FLOAT32, byteLength, pointer);
      return new Float32Array(draco.HEAPF32.buffer, pointer, valueCount).slice();
    } finally {
      draco._free(pointer);
    }
  } finally {
    draco.destroy(geometry);
    draco.destroy(decoder);
  }
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  const readers = {
    5126: (view, offset) => view.getFloat32(offset, true),
    5125: (view, offset) => view.getUint32(offset, true),
    5123: (view, offset) => view.getUint16(offset, true),
    5121: (view, offset) => view.getUint8(offset),
  };
  const sizes = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 };
  const bytes = new DataView(bin.buffer, bin.byteOffset + (view.byteOffset || 0), view.byteLength);
  const stride = view.byteStride || components * sizes[accessor.componentType];
  const offset = accessor.byteOffset || 0;
  return Array.from({ length: accessor.count }, (_, item) => Array.from(
    { length: components }, (_, component) => readers[accessor.componentType](
      bytes, offset + item * stride + component * sizes[accessor.componentType],
    ),
  ));
}

async function sourceVertices(modelPath, draco) {
  const { json, bin } = parseGlb(await readFile(modelPath));
  const vertices = [];
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function visit(index, parent, ancestorNames) {
    const node = json.nodes[index];
    const world = multiply(parent, localMatrix(node));
    const names = [...ancestorNames, node.name || ''];
    if (node.mesh !== undefined) {
      const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
      const translations = attributes?.TRANSLATION === undefined
        ? null : readAccessor(json, bin, attributes.TRANSLATION);
      const rotations = attributes?.ROTATION === undefined
        ? null : readAccessor(json, bin, attributes.ROTATION);
      const scales = attributes?.SCALE === undefined
        ? null : readAccessor(json, bin, attributes.SCALE);
      const instances = translations || rotations || scales
        ? Array.from({ length: (translations || rotations || scales).length }, (_, item) => multiply(
          world,
          localMatrix({
            translation: translations?.[item], rotation: rotations?.[item], scale: scales?.[item],
          }),
        ))
        : [world];
      for (const primitive of json.meshes[node.mesh].primitives) {
        const materialName = json.materials?.[primitive.material]?.name || '';
        const wheel = names.some(namedWheel) || namedWheel(materialName);
        const positions = decodePositions(draco, json, bin, primitive);
        for (const instance of instances) for (let i = 0; i < positions.length; i += 3) {
          vertices.push({ point: transform(instance, [positions[i], positions[i + 1], positions[i + 2]]), wheel });
        }
      }
    }
    for (const child of node.children || []) visit(child, world, names);
  }
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, identity, []);
  return vertices;
}

function bounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let i = 0; i < 3; i++) {
    min[i] = Math.min(min[i], point[i]);
    max[i] = Math.max(max[i], point[i]);
  }
  return { min, max, centre: min.map((value, i) => (value + max[i]) / 2) };
}

function analyse(vertices) {
  const sourceBounds = bounds(vertices.map(vertex => vertex.point));
  const lengthAxis = sourceBounds.max[0] - sourceBounds.min[0] > sourceBounds.max[2] - sourceBounds.min[2] ? 'X' : 'Z';
  const yaw = (lengthAxis === 'X' ? Math.PI / 2 : 0) + Math.PI;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const aligned = vertices.map(({ point: [x, y, z], wheel }) => ({
    point: [cosine * x + sine * z, y, -sine * x + cosine * z], wheel,
  }));
  const alignedBounds = bounds(aligned.map(vertex => vertex.point));
  const scale = CANONICAL_LENGTH / (alignedBounds.max[2] - alignedBounds.min[2]);
  const scaled = aligned.map(({ point, wheel }) => ({ point: point.map(value => value * scale), wheel }));
  const scaledBounds = bounds(scaled.map(vertex => vertex.point));
  const contacts = (points) => {
    let front = null;
    let rear = null;
    for (const { point, wheel } of points) {
      if (!wheel) continue;
      const target = point[2] <= scaledBounds.centre[2] ? 'front' : 'rear';
      if (!({ front, rear })[target] || point[1] < ({ front, rear })[target][1]) {
        if (target === 'front') front = point;
        else rear = point;
      }
    }
    if (!front || !rear) {
      const wheelPoints = points.filter(({ wheel }) => wheel).map(({ point }) => point);
      const wheelBounds = bounds(wheelPoints);
      throw new Error(
        `Could not identify wheel contact vertices at both axles (wheel bounds ${wheelBounds.min}..${wheelBounds.max}, car ${scaledBounds.min}..${scaledBounds.max}).`,
      );
    }
    return { front, rear, lowest: Math.min(front[1], rear[1]) };
  };
  const before = contacts(scaled);
  const difference = before.front[1] - before.rear[1];
  let pitch = 0;
  let pitched = scaled;
  let after = before;
  if (Math.abs(difference) > TOLERANCE) for (let attempt = 0; attempt < 3; attempt++) {
    const correctionDifference = after.front[1] - after.rear[1];
    if (Math.abs(correctionDifference) <= EPSILON) break;
    let correction = Math.atan2(correctionDifference, after.front[2] - after.rear[2]);
    if (correction > Math.PI / 2) correction -= Math.PI;
    if (correction <= -Math.PI / 2) correction += Math.PI;
    const cosPitch = Math.cos(correction);
    const sinPitch = Math.sin(correction);
    pitched = pitched.map(({ point: [x, y, z], wheel }) => ({
      point: [x, cosPitch * y - sinPitch * z, sinPitch * y + cosPitch * z], wheel,
    }));
    pitch += correction;
    after = contacts(pitched);
  }
  const unchanged = pitch === 0 && Math.abs(before.lowest - scaledBounds.min[1]) <= EPSILON;
  return {
    before: { front: before.front[1] - scaledBounds.min[1], rear: before.rear[1] - scaledBounds.min[1] },
    after: { front: after.front[1] - after.lowest, rear: after.rear[1] - after.lowest },
    pitch, unchanged,
  };
}

function cm(value) { return `${(value * 100).toFixed(2)}`; }
function deg(value) { return `${(value * 180 / Math.PI).toFixed(3)}`; }

const draco = await loadDraco();
const outcomes = [];
for (const car of CARS) {
  const [tourVertices, fullVertices] = await Promise.all([
    sourceVertices(path.join(ROOT, 'public/models/tour', car.modelFile), draco),
    sourceVertices(path.join(ROOT, 'public/models', car.modelFile), draco),
  ]);
  let tour;
  let full;
  try {
    tour = analyse(tourVertices);
    full = analyse(fullVertices);
  } catch (error) {
    throw new Error(`${car.id}: ${error.message}`);
  }
  const fullMatch = Math.abs(tour.pitch - full.pitch) <= EPSILON &&
    Math.abs(tour.before.front - full.before.front) <= EPSILON &&
    Math.abs(tour.before.rear - full.before.rear) <= EPSILON;
  outcomes.push({ car, tour, fullMatch });
}

console.log('car           before F/R cm   after F/R cm    pitch deg  unchanged  full-match');
for (const { car, tour, fullMatch } of outcomes) {
  console.log(`${car.id.padEnd(13)} ${`${cm(tour.before.front)}/${cm(tour.before.rear)}`.padEnd(15)} ` +
    `${`${cm(tour.after.front)}/${cm(tour.after.rear)}`.padEnd(15)} ${deg(tour.pitch).padStart(9)} ` +
    `${String(tour.unchanged).padStart(9)}  ${fullMatch}`);
}

const failures = outcomes.filter(({ tour, fullMatch }) =>
  (tour.pitch !== 0 && Math.abs(tour.after.front - tour.after.rear) > EPSILON) || !fullMatch ||
  (tour.pitch === 0 && !tour.unchanged),
);
if (failures.length) {
  throw new Error(`Wheel-ground verification failed for: ${failures.map(({ car }) => car.id).join(', ')}`);
}
