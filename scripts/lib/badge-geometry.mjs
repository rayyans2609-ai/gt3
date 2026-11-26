import * as T from "three";
// Weld positions across material/UV seams before counting boundaries and winding.
function analyseTriangles(records, tolerance = 1e-8) {
  const vertices = [], vertexMap = /* @__PURE__ */ new Map(), edges = /* @__PURE__ */ new Map(), faces = [], duplicates = /* @__PURE__ */ new Set();
  let duplicateFaces = 0, degenerateFaces = 0, normalDisagreements = 0, front = 0, back = 0;
  const key = (p) => p.map((v) => Math.round(v / tolerance)).join(",");
  for (const r of records) for (let j = 0; j < r.positions.length; j += 9) {
    const ps = [0, 1, 2].map((k) => Array.from(r.positions.slice(j + k * 3, j + k * 3 + 3)));
    const ids = ps.map((p) => {
      let k = key(p);
      if (!vertexMap.has(k)) {
        vertexMap.set(k, vertices.length);
        vertices.push(p);
      }
      return vertexMap.get(k);
    });
    if (new Set(ids).size < 3) {
      degenerateFaces++;
      continue;
    }
    const signature = [...ids].sort((a2, b2) => a2 - b2).join(",");
    if (duplicates.has(signature)) {
      duplicateFaces++;
      continue;
    }
    duplicates.add(signature);
    const a = new T.Vector3(...ps[0]), b = new T.Vector3(...ps[1]), c = new T.Vector3(...ps[2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-22) {
      degenerateFaces++;
      continue;
    }
    if (n.z > 1e-10) front++;
    if (n.z < -1e-10) back++;
    if (r.normals) {
      const avg = new T.Vector3();
      for (let k = 0; k < 3; k++) avg.add(new T.Vector3().fromArray(r.normals, j + k * 3));
      if (n.dot(avg) < -1e-12) normalDisagreements++;
    }
    const face = { ids, r, j, volume: a.dot(b.cross(c)) / 6 };
    faces.push(face);
    for (let k = 0; k < 3; k++) {
      const a2 = ids[k], b2 = ids[(k + 1) % 3], key2 = a2 < b2 ? `${a2},${b2}` : `${b2},${a2}`;
      if (edges.has(key2)) edges.get(key2).count++;
      else edges.set(key2, { a: a2, b: b2, count: 1 });
    }
  }
  const parent = vertices.map((_, i) => i);
  const root = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (const { ids } of faces) {
    parent[root(ids[1])] = root(ids[0]);
    parent[root(ids[2])] = root(ids[0]);
  }
  const boundary = [...edges.values()].filter((e) => e.count === 1), openRoots = new Set(boundary.map((e) => root(e.a)));
  const volumes = /* @__PURE__ */ new Map();
  for (const f of faces) {
    f.root = root(f.ids[0]);
    volumes.set(f.root, (volumes.get(f.root) ?? 0) + f.volume);
  }
  return { vertices, faces, boundary, oddEdges: [...edges.values()].filter((e) => e.count % 2 === 1), openRoots, volumes, root, summary: { triangles: faces.length, boundaryEdges: boundary.length, nonManifoldEdges: [...edges.values()].filter((e) => e.count > 2).length, duplicateFaces, degenerateFaces, normalDisagreements, frontFacingTriangles: front, backFacingTriangles: back, components: volumes.size } };
}
function bounds(records) {
  const b = new T.Box3();
  for (const r of records) for (let i = 0; i < r.positions.length; i += 3) b.expandByPoint(new T.Vector3().fromArray(r.positions, i));
  return b;
}
function normalize(records) {
  const b = bounds(records), size = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()), span = Math.max(size.x, size.y);
  for (const r of records) for (let i = 0; i < r.positions.length; i += 3) {
    r.positions[i] = (r.positions[i] - c.x) / span;
    r.positions[i + 1] = (r.positions[i + 1] - c.y) / span;
    r.positions[i + 2] = (r.positions[i + 2] - c.z) / span;
  }
  return { span, center: c.toArray(), dimensions: size.toArray() };
}
// Filter whole position-welded components before simplification. The Lexus
// source combines an oval/L and a separate wordmark in one primitive.
function componentsAboveY(records, minY) {
  const size = bounds(records).getSize(new T.Vector3());
  const a = analyseTriangles(records, Math.max(size.x, size.y, size.z) * 1e-8), minima = new Map();
  for (const f of a.faces) for (const id of f.ids) minima.set(f.root, Math.min(minima.get(f.root) ?? Infinity, a.vertices[id][1]));
  const kept = new Set([...minima].filter(([, y]) => y > minY).map(([root]) => root));
  if (!kept.size || kept.size === minima.size) throw new Error('Component selection did not separate emblem and wordmark');
  const groups = new Map();
  let removedTriangles = 0;
  for (const f of a.faces) {
    if (!kept.has(f.root)) { removedTriangles++; continue; }
    const { r, j } = f;
    if (!groups.has(r)) groups.set(r, { positions: [], normals: [], uv: [], uv1: [], material: r.material });
    const g = groups.get(r);
    g.positions.push(...r.positions.slice(j, j + 9));
    g.normals.push(...r.normals.slice(j, j + 9));
    if (r.uv) g.uv.push(...r.uv.slice(j / 3 * 2, j / 3 * 2 + 6));
    if (r.uv1) g.uv1.push(...r.uv1.slice(j / 3 * 2, j / 3 * 2 + 6));
  }
  return { records: [...groups.values()].map((g) => ({ ...g, positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), uv: g.uv.length ? Float32Array.from(g.uv) : null, uv1: g.uv1.length ? Float32Array.from(g.uv1) : null })), report: { method: 'position-welded component minimum +Y in source world units', minY, components: minima.size, keptComponents: kept.size, removedTriangles } };
}
function faceCoverage(records, resolution = 256) {
  const mask = new Uint8Array(resolution * resolution);
  for (const r of records) for (let j = 0; j < r.positions.length; j += 9) {
    const vs = [0, 1, 2].map((k) => [(r.positions[j + k * 3] + 0.5) * (resolution - 1), (r.positions[j + k * 3 + 1] + 0.5) * (resolution - 1)]);
    const [a, b, c] = vs, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(den) < 1e-8) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...vs.map((v) => v[0])))), x1 = Math.min(resolution - 1, Math.ceil(Math.max(...vs.map((v) => v[0])))), y0 = Math.max(0, Math.floor(Math.min(...vs.map((v) => v[1])))), y1 = Math.min(resolution - 1, Math.ceil(Math.max(...vs.map((v) => v[1]))));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
      if (u >= 0 && v >= 0 && u + v <= 1) mask[y * resolution + x] = 1;
    }
  }
  return mask.reduce((a, b) => a + b, 0) / mask.length;
}
// Mirror only open components behind the original mesh; connect each boundary edge.
// The tiny rear inset prevents zero-area walls along purely vertical source edges.
function finishBacks(records, material, { backing = false, backingScale = 1.014 } = {}) {
  const a = analyseTriangles(records), backZ = bounds(records).min.z - 2e-3, groups = /* @__PURE__ */ new Map(), rear = [];
  const add = (mat, ps, ns, uv, uv1) => {
    if (!groups.has(mat)) groups.set(mat, { positions: [], normals: [], uv: [], uv1: [], material: mat, hasUV: false, hasUV1: false });
    const g = groups.get(mat);
    g.positions.push(...ps);
    g.normals.push(...ns);
    g.uv.push(...uv ?? [0, 0, 0, 0, 0, 0]);
    g.hasUV ||= !!uv;
    g.uv1.push(...uv1 ?? [0, 0, 0, 0, 0, 0]);
    g.hasUV1 ||= !!uv1;
  };
  const tri = (ps) => {
    const n = new T.Vector3(...ps.slice(3, 6)).sub(new T.Vector3(...ps.slice(0, 3))).cross(new T.Vector3(...ps.slice(6, 9)).sub(new T.Vector3(...ps.slice(0, 3)))).normalize().toArray();
    add(material, ps, [...n, ...n, ...n]);
  };
  let flippedComponents = 0;
  const flipped = /* @__PURE__ */ new Set();
  for (const f of a.faces) {
    const { r, j } = f;
    let p = f.ids.flatMap((id) => a.vertices[id]), n = Array.from(r.normals.slice(j, j + 9)), uv = r.uv ? Array.from(r.uv.slice(j / 3 * 2, j / 3 * 2 + 6)) : null, uv1 = r.uv1 ? Array.from(r.uv1.slice(j / 3 * 2, j / 3 * 2 + 6)) : null;
    if (!a.openRoots.has(f.root) && (a.volumes.get(f.root) ?? 0) < -1e-12) {
      p = [...p.slice(0, 3), ...p.slice(6, 9), ...p.slice(3, 6)];
      n = [...n.slice(0, 3), ...n.slice(6, 9), ...n.slice(3, 6)].map((v) => -v);
      if (uv) uv = [...uv.slice(0, 2), ...uv.slice(4, 6), ...uv.slice(2, 4)];
      if (uv1) uv1 = [...uv1.slice(0, 2), ...uv1.slice(4, 6), ...uv1.slice(2, 4)];
      flipped.add(f.root);
    }
    const fn = new T.Vector3(...p.slice(3, 6)).sub(new T.Vector3(...p.slice(0, 3))).cross(new T.Vector3(...p.slice(6, 9)).sub(new T.Vector3(...p.slice(0, 3)))).normalize();
    if (fn.dot(new T.Vector3(...n.slice(0, 3)).add(new T.Vector3(...n.slice(3, 6))).add(new T.Vector3(...n.slice(6, 9)))) < 0) n = [...fn.toArray(), ...fn.toArray(), ...fn.toArray()];
    add(r.material, p, n, uv, uv1);
    if (a.openRoots.has(f.root)) {
      const ps = [0, 2, 1].flatMap((k) => [p[k * 3] * 0.9999, p[k * 3 + 1] * 0.9999, 2 * backZ - p[k * 3 + 2]]);
      tri(ps);
    }
  }
  for (const e of a.boundary) {
    const p = a.vertices[e.a], q = a.vertices[e.b], pb = [p[0] * 0.9999, p[1] * 0.9999, 2 * backZ - p[2]], qb = [q[0] * 0.9999, q[1] * 0.9999, 2 * backZ - q[2]];
    tri([...q, ...p, ...pb]);
    tri([...q, ...pb, ...qb]);
  }
  let result = [...groups.values()].map((g) => ({ positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), uv: g.hasUV ? Float32Array.from(g.uv) : null, uv1: g.hasUV1 ? Float32Array.from(g.uv1) : null, material: g.material }));
  if (backing) {
    const clone = result.map((r) => ({ positions: Float32Array.from(r.positions, (v, i) => i % 3 === 2 ? v - 0.012 : v * backingScale), normals: r.normals, material }));
    result.push(...clone);
  }
  return { records: result, report: { before: a.summary, mirroredOpenComponents: a.openRoots.size, flippedComponents: flipped.size, backing: backing ? "silhouette-following graphite duplicate offset behind chrome" : "satin mirrored closures on open components; original closed backs retained" } };
}
// Odd-edge loops also include three-way source seams, ensuring even boundary degree.
// Local caps close residual simplification/quantization defects without a large plane.
function capResidualSeams(records, material) {
  const a = analyseTriangles(records), odd = a.oddEdges;
  if (!odd.length) return { records, cappedEdges: 0 };
  const adjacency = /* @__PURE__ */ new Map();
  for (const e of odd) for (const [v, w] of [[e.a, e.b], [e.b, e.a]]) {
    if (!adjacency.has(v)) adjacency.set(v, []);
    adjacency.get(v).push(w);
  }
  const centers = /* @__PURE__ */ new Map(), visited = /* @__PURE__ */ new Set();
  for (const v of adjacency.keys()) {
    if (visited.has(v)) continue;
    const queue = [v], component = [];
    while (queue.length) {
      const u = queue.pop();
      if (visited.has(u)) continue;
      visited.add(u);
      component.push(u);
      queue.push(...adjacency.get(u).filter((w) => !visited.has(w)));
    }
    const c = new T.Vector3();
    for (const u of component) c.add(new T.Vector3(...a.vertices[u]));
    c.multiplyScalar(1 / component.length).add(new T.Vector3(137e-6, -271e-6, -319e-6));
    for (const u of component) centers.set(u, c.toArray());
  }
  const ps = [], ns = [];
  for (const e of odd) {
    const p = [...a.vertices[e.b], ...a.vertices[e.a], ...centers.get(e.a)], n = new T.Vector3(...p.slice(3, 6)).sub(new T.Vector3(...p.slice(0, 3))).cross(new T.Vector3(...p.slice(6, 9)).sub(new T.Vector3(...p.slice(0, 3)))).normalize().toArray();
    ps.push(...p);
    ns.push(...n, ...n, ...n);
  }
  return { records: [...records, { positions: Float32Array.from(ps), normals: Float32Array.from(ns), material }], cappedEdges: odd.length };
}
function cleanTriangles(records) {
  const a = analyseTriangles(records), groups = /* @__PURE__ */ new Map();
  for (const f of a.faces) {
    const r = f.r;
    if (!groups.has(r)) groups.set(r, { positions: [], normals: [], uv: [], uv1: [], material: r.material });
    const g = groups.get(r);
    g.positions.push(...f.ids.flatMap((id) => a.vertices[id]));
    g.normals.push(...r.normals.slice(f.j, f.j + 9));
    if (r.uv) g.uv.push(...r.uv.slice(f.j / 3 * 2, f.j / 3 * 2 + 6));
    if (r.uv1) g.uv1.push(...r.uv1.slice(f.j / 3 * 2, f.j / 3 * 2 + 6));
  }
  return [...groups.values()].map((g) => ({ positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), uv: g.uv.length ? Float32Array.from(g.uv) : null, uv1: g.uv1.length ? Float32Array.from(g.uv1) : null, material: g.material }));
}
export {
  analyseTriangles,
  bounds,
  capResidualSeams,
  cleanTriangles,
  componentsAboveY,
  faceCoverage,
  finishBacks,
  normalize
};
