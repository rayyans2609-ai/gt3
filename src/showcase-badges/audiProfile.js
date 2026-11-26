import * as THREE from 'three';

function normalizedLoop(points, center, scale, clockwise) {
  const loop = [];
  for (const point of points) {
    const normalized = new THREE.Vector2(
      (point.x - center.x) * scale,
      (center.y - point.y) * scale,
    );
    if (!loop.length || normalized.distanceToSquared(loop.at(-1)) > 1e-12) loop.push(normalized);
  }
  if (loop[0].distanceToSquared(loop.at(-1)) <= 1e-12) loop.pop();
  if (THREE.ShapeUtils.isClockWise(loop) !== clockwise) loop.reverse();
  return loop;
}

function insideMiter(loop, point, i) {
  const previous = loop[(i + loop.length - 1) % loop.length];
  const next = loop[(i + 1) % loop.length];
  const incoming = new THREE.Vector2(previous.y - point.y, point.x - previous.x).normalize();
  const outgoing = new THREE.Vector2(point.y - next.y, next.x - point.x).normalize();
  const miter = incoming.clone().add(outgoing).normalize();
  return miter.divideScalar(Math.max(0.55, miter.dot(outgoing)));
}

/** Sweep a machined section around the original joined-ring silhouette and its cutouts. */
function sweptProfile(loops, section) {
  const contours = loops.map(loop => loop.map((point, i) => ({
    point,
    miter: insideMiter(loop, point, i),
  })));
  const offsets = [];
  let layerSize = 0;
  for (const loop of loops) {
    offsets.push(layerSize);
    layerSize += loop.length;
  }

  const vertices = [], indices = [];
  section.forEach(({ z, inset }, layer) => {
    const rings = contours.map(loop => loop.map(({ point, miter }) => point.clone().addScaledVector(miter, inset)));
    for (const loop of rings) for (const point of loop) vertices.push(point.x, point.y, z);
    const base = layer * layerSize;
    if (layer > 0) {
      rings.forEach((ring, ringIndex) => {
        const start = base + offsets[ringIndex];
        for (let i = 0; i < ring.length; i++) {
          const a = start + i;
          const b = start + (i + 1) % ring.length;
          indices.push(a - layerSize, b - layerSize, b, a - layerSize, b, a);
        }
      });
    }
    if (layer === 0 || layer === section.length - 1) {
      const [outer, ...holes] = rings;
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(outer, holes)) {
        if (layer === 0) indices.push(base + a, base + c, base + b);
        else indices.push(base + a, base + b, base + c);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function makeAudiProfile(shape, own, chrome) {
  const outer = shape.getPoints(12);
  const bounds = new THREE.Box2().setFromPoints(outer);
  const { x: width } = bounds.getSize(new THREE.Vector2());
  const center = bounds.getCenter(new THREE.Vector2());
  const scale = 0.99 / width;
  const loops = [
    normalizedLoop(outer, center, scale, false),
    ...shape.holes.map(hole => normalizedLoop(hole.getPoints(12), center, scale, true)),
  ];

  const rear = own(sweptProfile(loops, [
    { z: -0.034, inset: 0.005 },
    { z: -0.031, inset: 0.002 },
    { z: -0.021, inset: 0.002 },
  ]));
  const front = own(sweptProfile(loops, [
    { z: -0.024, inset: 0.003 },
    { z: -0.020, inset: 0 },
    { z: 0.006, inset: 0 },
    { z: 0.015, inset: 0.0005 },
    { z: 0.022, inset: 0.0019 },
    { z: 0.027, inset: 0.0040 },
    { z: 0.028, inset: 0.0060 },
  ]));
  const mount = own(new THREE.MeshStandardMaterial({
    color: 0x3d464d, metalness: 0.58, roughness: 0.36,
  }));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(rear, mount), new THREE.Mesh(front, chrome));
  return group;
}
