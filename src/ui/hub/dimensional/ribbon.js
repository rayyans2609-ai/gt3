import * as THREE from 'three';

/** Five strips: actual asphalt top, a .25 m chamfer, then the remaining .75 m side. */
export function createRibbon(data) {
  const positions = [], indices = [], groups = [];
  const v = p => new THREE.Vector3().fromArray(p);
  const inset = (p, other) => v(p).addScaledVector(v(other).sub(v(p)).normalize(), 0.25).toArray();
  const lower = (p, y) => [p[0], p[1] - y, p[2]];
  const leftTop = data.left.map((p, i) => inset(p, data.right[i]));
  const rightTop = data.right.map((p, i) => inset(p, data.left[i]));
  function strip(a, b, material, up = false) {
    const firstVertex = positions.length / 3, firstIndex = indices.length;
    for (let i = 0; i <= data.segments; i++) positions.push(...a[i], ...b[i]);
    for (let i = 0; i < data.segments; i++) {
      const k = firstVertex + i * 2;
      const normal = v(b[i]).sub(v(a[i])).cross(v(a[i + 1]).sub(v(a[i])));
      const expected = up ? new THREE.Vector3(0, 1, 0) : v(a[i]).sub(v(data.centre[i])).setY(0);
      if (normal.dot(expected) >= 0) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      else indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    groups.push([firstIndex, indices.length - firstIndex, material]);
  }
  strip(leftTop, rightTop, 0, true);
  strip(leftTop, data.left.map(p => lower(p, 0.25)), 1);
  strip(rightTop, data.right.map(p => lower(p, 0.25)), 1);
  strip(data.left.map(p => lower(p, 0.25)), data.left.map(p => lower(p, 1)), 2);
  strip(data.right.map(p => lower(p, 0.25)), data.right.map(p => lower(p, 1)), 2);
  // Interleave both edges inside each material group, so readiness resolves equal rings.
  for (const material of [1, 2]) {
    const pair = groups.filter(g => g[2] === material);
    const ordered = [];
    for (let i = 0; i < data.segments; i++) for (const [start] of pair) ordered.push(...indices.slice(start + i * 6, start + i * 6 + 6));
    for (let i = 0; i < ordered.length; i++) indices[pair[0][0] + i] = ordered[i];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  for (const [start, count, material] of groups) {
    const last = geometry.groups.at(-1);
    if (last?.materialIndex === material) last.count += count;
    else geometry.addGroup(start, count, material);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.76, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.24, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#e2dfd9', roughness: 0.84 }),
  ];
  const mesh = new THREE.Mesh(geometry, materials); mesh.name = 'Hub B / one metre ribbon';
  const edgePositions = [];
  for (let i = 0; i < data.segments; i++) for (const edge of [leftTop, rightTop]) {
    edgePositions.push(edge[i][0], edge[i][1] + 0.035, edge[i][2], edge[i + 1][0], edge[i + 1][1] + 0.035, edge[i + 1][2]);
  }
  const edges = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(edgePositions, 3)), new THREE.LineBasicMaterial({ color: '#2a2e33', transparent: true, opacity: 0.5 }));
  const group = new THREE.Group(); group.add(mesh, edges);
  return { group, mesh, edges, materials, geometry };
}

/** One cached silhouette texture; no shadow-map passes or render targets. */
export function createContactShadow(data) {
  const bounds = new THREE.Box3().setFromPoints([...data.left, ...data.right].map(p => new THREE.Vector3().fromArray(p)));
  const padding = 55, width = bounds.max.x - bounds.min.x + padding * 2, depth = bounds.max.z - bounds.min.z + padding * 2;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d');
  // Plane UV top becomes -Z after its -90° X rotation; canvas Y must follow +Z.
  const point = p => [(p[0] - bounds.min.x + padding) / width * 1024, (p[2] - bounds.min.z + padding) / depth * 1024];
  c.filter = 'blur(5px)'; c.fillStyle = '#000'; c.beginPath();
  for (let i = 0; i < data.segments; i++) {
    c.moveTo(...point(data.left[i])); c.lineTo(...point(data.right[i]));
    c.lineTo(...point(data.right[i + 1])); c.lineTo(...point(data.left[i + 1])); c.closePath();
  }
  c.fill();
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, color: '#111416', transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material); mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y - 1.2, (bounds.min.z + bounds.max.z) / 2); mesh.renderOrder = -1;
  return { mesh, texture, origin: mesh.position.clone() };
}

export function createPin() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 4.6); shape.lineTo(3.1, -3.6); shape.lineTo(0, -1.7); shape.lineTo(-3.1, -3.6); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.65, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.16, bevelThickness: 0.16 });
  geometry.rotateX(-Math.PI / 2);
  geometry.clearGroups(); // One material renders both cap and bevel in one draw.
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#3f68a6', roughness: 0.32, metalness: 0.18 }));
}

export function resourceSizes(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  let bytes = 0, vertices = 0, triangles = 0, draws = 0, instanceBytes = 0;
  object.traverse(o => {
    if (o.geometry && !geometries.has(o.geometry)) {
      geometries.add(o.geometry);
      for (const a of Object.values(o.geometry.attributes)) bytes += a.array.byteLength;
      bytes += o.geometry.index?.array.byteLength ?? 0; vertices += o.geometry.attributes.position.count;
      if (o.isMesh) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
    if (o.isMesh || o.isLine) draws += Array.isArray(o.material) ? o.geometry.groups.length || 1 : 1;
    instanceBytes += (o.instanceMatrix?.array.byteLength ?? 0) + (o.instanceColor?.array.byteLength ?? 0);
    for (const m of o.material ? [].concat(o.material) : []) { materials.add(m); for (const t of Object.values(m)) if (t?.isTexture) textures.add(t); }
  });
  return { geometries: geometries.size, geometryBytes: bytes, instanceBytes, vertices, triangles, materials: materials.size, textures: textures.size, potentialDrawCalls: draws };
}

/** Dispose only clone-owned materials. Tour owns its geometry, textures and environment. */
export function disposeCarClone(clone) {
  const materials = new Set();
  clone?.traverse(o => { for (const m of o.material ? [].concat(o.material) : []) materials.add(m); });
  for (const m of materials) m.dispose(); clone?.removeFromParent();
}
