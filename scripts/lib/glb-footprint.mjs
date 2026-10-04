/**
 * Static (no GPU, no browser) footprint of a GLB after cars.js normaliseScene():
 * the longer horizontal axis is the length, scaled to CANONICAL_LENGTH.
 * Bounds are the transformed corners of each POSITION accessor's min/max box — a
 * slight over-estimate for rotated nodes, which is conservative for clearance checks.
 */
import { readFile } from 'node:fs/promises';

const NORMALIZED_DIVISOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
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

export async function glbFootprint(path, canonicalLength = 4.6) {
  const buffer = await readFile(path);
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function visit(index, parent) {
    const node = gltf.nodes[index];
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        if (!accessor?.min || !accessor?.max) continue;
        const divisor = accessor.normalized ? NORMALIZED_DIVISOR[accessor.componentType] || 1 : 1;
        const lo = accessor.min.map(v => v / divisor);
        const hi = accessor.max.map(v => v / divisor);
        for (let corner = 0; corner < 8; corner++) {
          const p = [corner & 1 ? hi[0] : lo[0], corner & 2 ? hi[1] : lo[1], corner & 4 ? hi[2] : lo[2]];
          for (let axis = 0; axis < 3; axis++) {
            const v = world[axis] * p[0] + world[4 + axis] * p[1] + world[8 + axis] * p[2] + world[12 + axis];
            min[axis] = Math.min(min[axis], v);
            max[axis] = Math.max(max[axis], v);
          }
        }
      }
    }
    for (const child of node.children || []) visit(child, world);
  }
  const scene = gltf.scenes[gltf.scene ?? 0];
  for (const root of scene.nodes) visit(root, identity);
  const size = max.map((v, i) => v - min[i]);
  const lengthSource = Math.max(size[0], size[2]);
  const widthSource = Math.min(size[0], size[2]);
  const scale = canonicalLength / lengthSource;
  return { length: canonicalLength, width: widthSource * scale, height: size[1] * scale };
}
