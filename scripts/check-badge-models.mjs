#!/usr/bin/env node
// Offline decoded geometry and actual createBadge lifecycle; no browser or server.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { badgeIO, recordsFromDocument } from "./prepare-badge-models.mjs";
import { analyseTriangles, bounds } from "./lib/badge-geometry.mjs";
const manifest = JSON.parse(await fs.readFile("public/badges/manifest.json", "utf8"));
const expected = ["lexus", "nissan", "audi", "bmw", "mercedes", "ferrari", "aston", "lamborghini", "porsche"];
assert.deepEqual(manifest.map((r) => r.id), expected);
const io = await badgeIO(), templates = /* @__PURE__ */ new Map(), geometryReport = [];
for (const row of manifest) {
  const bytes = await fs.readFile(`public/badges/${row.file}`), doc = await io.readBinary(bytes), records = recordsFromDocument(doc), topology = analyseTriangles(records).summary, b = bounds(records), size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3());
  assert.equal(bytes.length, row.bytes);
  assert.equal(topology.triangles, row.triangles);
  assert(row.triangles <= 6e4, `${row.id}: triangle cap`);
  assert(row.drawCalls <= 6, `${row.id}: draw-call fragmentation`);
  assert(Math.abs(Math.max(size.x, size.y) - 1) < 1e-4, `${row.id}: face span`);
  assert(Math.abs(center.x) < 1e-4 && Math.abs(center.y) < 1e-4 && Math.abs(center.z) < 1e-4, `${row.id}: centering`);
  assert(size.z < Math.max(size.x, size.y) * 0.4, `${row.id}: face plane`);
  assert(topology.frontFacingTriangles > 0 && topology.backFacingTriangles > 0, `${row.id}: front/back normals`);
  assert.equal(topology.boundaryEdges, 0, `${row.id}: open boundaries`);
  assert.equal(topology.degenerateFaces, 0, `${row.id}: degenerate faces`);
  assert(topology.normalDisagreements <= 4, `${row.id}: inconsistent normals`);
  assert.deepEqual(doc.getRoot().getAsset().extras.canonical, { face: "+Z", up: "+Y", span: 1 });
  assert(doc.hasExtension("KHR_draco_mesh_compression"));
  assert(!doc.hasExtension("EXT_meshopt_compression"));
  assert(!doc.hasExtension("KHR_texture_basisu"));
  for (const texture2 of doc.getRoot().listTextures()) {
    assert.equal(texture2.getMimeType(), "image/webp");
    assert(Math.max(...texture2.getSize()) <= 1024);
  }
  const root = new THREE.Group(), byMaterial = /* @__PURE__ */ new Map();
  for (const r of records) {
    const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(r.positions, 3)).setAttribute("normal", new THREE.BufferAttribute(r.normals, 3));
    if (!byMaterial.has(r.material)) byMaterial.set(r.material, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...r.material.getBaseColorFactor().slice(0, 3)), metalness: r.material.getMetallicFactor(), roughness: r.material.getRoughnessFactor() }));
    root.add(new THREE.Mesh(geometry, byMaterial.get(r.material)));
  }
  templates.set(row.id, root);
  geometryReport.push({ id: row.id, triangles: row.triangles, drawCalls: row.drawCalls, materials: row.materials, bytes: row.bytes, opticalScale: row.opticalScale, closed: true, nonManifoldEdges: topology.nonManifoldEdges });
}
for (const file of (await fs.readdir("local/showcase-badges/candidates")).filter((f) => f.endsWith(".glb"))) {
  const doc = await io.read(`local/showcase-badges/candidates/${file}`), t = analyseTriangles(recordsFromDocument(doc)).summary;
  assert.equal(t.boundaryEdges, 0, file);
  assert(t.triangles <= 6e4, file);
}
await fs.mkdir("local/tmp", { recursive: true });
// Strip Vite-only SVG imports for Node; missing DOM artwork exercises safe fallback.
const bundle = await build({ entryPoints: ["src/showcase-badges/badge.js"], bundle: true, platform: "node", format: "esm", write: false, packages: "external", plugins: [{ name: "offline-artwork", setup(b) {
  b.onLoad({ filter: /badge\.js$/ }, async (args) => ({ contents: (await fs.readFile(args.path, "utf8")).replace(/const crestFaces = import\.meta\.glob\([\s\S]*?\n\}\);/, "const crestFaces = {};").replace(/const crestOutlines = import\.meta\.glob\([\s\S]*?\n\}\);/, "const crestOutlines = {};"), loader: "js" }));
  b.onResolve({ filter: /\.svg\?/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.split("?")[0]), namespace: "svg" }));
  b.onLoad({ filter: /.*/, namespace: "svg" }, async (args) => ({ contents: `export default ${JSON.stringify(await fs.readFile(args.path, "utf8"))}`, loader: "js" }));
} }] });
const modulePath = path.resolve("local/tmp/badge-node-check.mjs");
await fs.writeFile(modulePath, bundle.outputFiles[0].text);
const fetchOriginal = globalThis.fetch, loadOriginal = GLTFLoader.prototype.loadAsync, warnOriginal = console.warn, textureOriginal = THREE.TextureLoader.prototype.load;
let fetches = 0, loads = 0, warnings = 0, mode = "ok", deferResolve;
const texture = new THREE.Texture();
let sharedTextureDisposals = 0;
texture.addEventListener("dispose", () => sharedTextureDisposals++);
templates.get("audi").children[0].material.map = texture;
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
console.warn = () => warnings++;
globalThis.fetch = async () => {
  fetches++;
  if (mode === "manifest404") return { ok: false, status: 404 };
  if (mode === "manifestReject") throw new Error("offline");
  return { ok: true, json: async () => manifest };
};
GLTFLoader.prototype.loadAsync = async function(url) {
  loads++;
  if (mode === "decodeFailure") throw new Error("decode failure");
  if (mode === "file404") throw new Error("HTTP 404");
  if (mode === "deferred") await new Promise((resolve) => deferResolve = resolve);
  const id = url.split("/").at(-1).replace(".glb", ""), scene = templates.get(id).clone(true);
  scene.traverse((n) => {
    if (n.material) n.material = n.material.clone();
  });
  return { scene };
};
const tick = async () => {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
};
let sequence = 0;
const fresh = () => import(`${new URL("file://" + modulePath)}?case=${sequence++}`);
try {
  const { createBadge, badgeModelStatus } = await fresh();
  const locked = expected.map((manufacturer) => createBadge({ manufacturer, locked: true }));
  assert.equal(fetches, 0);
  assert.equal(loads, 0);
  for (const badge of locked) {
    badge.update(0.1);
    badge.setTheme("night");
    badge.setColor(16711680);
    assert.equal(badge.object.children[0].children.length, 0);
    badge.dispose();
  }
  assert.equal(fetches, 0);
  assert.equal(loads, 0);
  const instances = expected.map((manufacturer) => createBadge({ manufacturer, locked: true }));
  for (const badge of instances) badge.setLocked(false);
  await tick();
  assert.equal(fetches, 1);
  assert.equal(loads, 9);
  instances.forEach((badge, i) => {
    assert.equal(badgeModelStatus(expected[i]), "ready");
    const motion = badge.object.children[0];
    assert.equal(motion.children.length, 1);
    assert.equal(motion.children[0].userData.badgeModel, expected[i]);
    assert.equal(motion.children[0].scale.x, manifest[i].opticalScale);
    assert(badge.hitTarget.geometry.type === "PlaneGeometry");
    badge.setLocked(true);
    assert.equal(motion.children.length, 0);
    badge.setLocked(false);
    assert.equal(motion.children.length, 1);
  });
  const template = templates.get("audi");
  const other = createBadge({ manufacturer: "audi" });
  await tick();
  assert.equal(loads, 9);
  const a = instances[2].object.children[0].children[0].children[0], b = other.object.children[0].children[0].children[0];
  assert.equal(a.geometry, b.geometry);
  assert.notEqual(a.material, b.material);
  let geometryDisposals = 0, materialDisposals = 0;
  a.geometry.addEventListener("dispose", () => geometryDisposals++);
  a.material.addEventListener("dispose", () => materialDisposals++);
  instances[2].dispose();
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(sharedTextureDisposals, 0);
  other.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(sharedTextureDisposals, 1);
  for (const badge of instances) badge.dispose();
  mode = "deferred";
  const pending = createBadge({ manufacturer: "lexus" });
  await tick();
  pending.dispose();
  deferResolve();
  await tick();
  assert.equal(pending.object.children.length, 0);
  const relocked = createBadge({ manufacturer: "lexus" });
  await tick();
  relocked.setLocked(true);
  deferResolve();
  await tick();
  assert.equal(relocked.object.children[0].children.length, 0);
  relocked.setLocked(false);
  assert.equal(relocked.object.children[0].children.length, 1);
  relocked.dispose();
  for (const failure of ["manifest404", "manifestReject", "file404", "decodeFailure"]) {
    mode = failure;
    warnings = 0;
    const freshModule = await fresh(), first = freshModule.createBadge({ manufacturer: "porsche" }), second = freshModule.createBadge({ manufacturer: "ferrari" });
    await tick();
    assert.equal(freshModule.badgeModelStatus("porsche"), "fallback");
    assert.equal(first.object.children[0].children.length, 1);
    assert.equal(warnings, 1, `${failure}: warning deduplication`);
    first.dispose();
    second.dispose();
  }
  mode = "ok";
  const mc = await fresh(), beforeFetch = fetches, beforeLoad = loads, mclaren = mc.createBadge({ manufacturer: "mclaren" });
  await tick();
  assert.equal(fetches, beforeFetch);
  assert.equal(loads, beforeLoad);
  mclaren.dispose();
  console.warn = warnOriginal;
  console.log(JSON.stringify({ pass: true, geometry: geometryReport, lifecycle: "nine locked/unlock/swap/dispose; shared geometry/private materials; late disposal/relock; optional manifest/file/decode failures; McLaren unchanged", orientation: "numeric face plane/span, centre, +/-Z normals and canonical metadata; visual upright/readability review remains with manager" }, null, 2));
} finally {
  globalThis.fetch = fetchOriginal;
  GLTFLoader.prototype.loadAsync = loadOriginal;
  THREE.TextureLoader.prototype.load = textureOriginal;
  console.warn = warnOriginal;
  await fs.rm(modulePath, { force: true });
}
