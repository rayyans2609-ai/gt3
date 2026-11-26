#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { NodeIO, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from "@gltf-transform/extensions";
import { prune, dedup, join, draco, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";
import sharp from "sharp";
import * as T from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { models, finishes, credits, packFile, packBrands, opticalScaling } from "./badge-models.config.mjs";
import { analyseTriangles, normalize, bounds, finishBacks, faceCoverage, capResidualSeams, cleanTriangles, componentsAboveY } from "./lib/badge-geometry.mjs";
// Shared offline IO used by preparation and the independent Node lifecycle check.
async function badgeIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule(), "draco3d.encoder": await draco3d.createEncoderModule() });
}
async function defaultSource() {
  if (process.env.GT3_BADGE_SOURCE) return process.env.GT3_BADGE_SOURCE;
  const common = path.resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim());
  const main = path.join(path.dirname(common), "models", "logo models");
  try {
    await fs.access(main);
    return main;
  } catch {
    return "local/showcase-badges/source";
  }
}
const triangles = (p) => (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3;
async function sourceBytes(file) {
  const stat = await fs.stat(file);
  if (!file.endsWith(".gltf")) return stat.size;
  const json = JSON.parse(await fs.readFile(file, "utf8"));
  let total = stat.size;
  for (const buffer of json.buffers ?? []) if (buffer.uri && !buffer.uri.startsWith("data:")) total += (await fs.stat(path.join(path.dirname(file), buffer.uri))).size;
  return total;
}
function sourceSummary(doc) {
  const r = doc.getRoot();
  return { asset: r.getAsset(), triangles: r.listNodes().reduce((sum, n) => sum + (n.getMesh()?.listPrimitives().reduce((a, p) => a + triangles(p), 0) ?? 0), 0), meshes: r.listMeshes().length, materials: r.listMaterials().map((m) => m.getName()), textures: r.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength ?? 0 })), nodes: r.listNodes().filter((n) => n.getMesh()).map((n) => ({ name: n.getName(), mesh: n.getMesh().getName(), triangles: n.getMesh().listPrimitives().reduce((a, p) => a + triangles(p), 0) })) };
}
// Cache repeated source geometry while counting every mesh instance.
function sourceQuality(doc) {
  const r = doc.getRoot(), geometryCache = /* @__PURE__ */ new Map(), worldBounds = new T.Box3();
  const total = { boundaryEdges: 0, nonManifoldEdges: 0, duplicateFaces: 0, degenerateFaces: 0, normalDisagreements: 0 };
  for (const node of r.listNodes()) if (node.getMesh()) for (const primitive of node.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute("POSITION"), indices = primitive.getIndices(), matrix = new T.Matrix4().fromArray(node.getWorldMatrix()), min = positions.getMin([]), max = positions.getMax([]);
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) worldBounds.expandByPoint(new T.Vector3(x, y, z).applyMatrix4(matrix));
    let byIndices = geometryCache.get(positions);
    if (!byIndices) {
      byIndices = /* @__PURE__ */ new Map();
      geometryCache.set(positions, byIndices);
    }
    if (!byIndices.has(indices)) {
      const record = expand(primitive, Uint32Array.from(indices?.getArray() ?? Array.from({ length: positions.getCount() }, (_, i) => i)), new T.Matrix4(), primitive.getMaterial());
      normalize([record]);
      byIndices.set(indices, analyseTriangles([record]).summary);
    }
    const summary = byIndices.get(indices);
    for (const key of Object.keys(total)) total[key] += summary[key];
  }
  return { units: "glTF metre convention; authoring units unspecified", worldBounds: { min: worldBounds.min.toArray(), max: worldBounds.max.toArray(), dimensions: worldBounds.getSize(new T.Vector3()).toArray() }, perPrimitiveTopology: total, note: "Per-primitive sums include legitimate material/UV seams; assembled selected geometry is analysed separately before and after repair." };
}
function expand(p, indices, matrix, material) {
  const pos = p.getAttribute("POSITION").getArray(), norm = p.getAttribute("NORMAL")?.getArray(), uv = p.getAttribute("TEXCOORD_0")?.getArray(), uv1 = p.getAttribute("TEXCOORD_1")?.getArray();
  const ps = new Float32Array(indices.length * 3), ns = new Float32Array(indices.length * 3), us = uv ? new Float32Array(indices.length * 2) : null, us1 = uv1 ? new Float32Array(indices.length * 2) : null, normalMatrix = new T.Matrix3().getNormalMatrix(matrix), v = new T.Vector3();
  for (let i = 0; i < indices.length; i++) {
    const k = indices[i];
    v.fromArray(pos, k * 3).applyMatrix4(matrix).toArray(ps, i * 3);
    if (norm) v.fromArray(norm, k * 3).applyMatrix3(normalMatrix).normalize().toArray(ns, i * 3);
    if (uv) {
      us[i * 2] = uv[k * 2];
      us[i * 2 + 1] = uv[k * 2 + 1];
    }
    if (uv1) {
      us1[i * 2] = uv1[k * 2];
      us1[i * 2 + 1] = uv1[k * 2 + 1];
    }
  }
  if (!norm) {
    const g = new T.BufferGeometry().setAttribute("position", new T.BufferAttribute(ps, 3));
    g.computeVertexNormals();
    ns.set(g.attributes.normal.array);
  }
  return { positions: ps, normals: ns, uv: us, uv1: us1, material };
}
function applyFinish(doc, m, override, cache) {
  if (!override) return m;
  const finish = typeof override === "string" ? finishes[override] : override, key = JSON.stringify(finish);
  if (!m.getBaseColorTexture() && cache.has(key)) return cache.get(key);
  if (finish.color) m.setBaseColorFactor(finish.color);
  if (finish.metalness !== void 0) m.setMetallicFactor(finish.metalness);
  if (finish.roughness !== void 0) m.setRoughnessFactor(finish.roughness);
  m.setEmissiveFactor([0, 0, 0]).setDoubleSided(false);
  if (m.getMetallicFactor() === 0) {
    m.setExtension("KHR_materials_clearcoat", doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(0.3).setClearcoatRoughnessFactor(0.2));
  }
  if (!m.getBaseColorTexture()) cache.set(key, m);
  return m;
}
// Position welding permits reduction across hard-normal seams without subdivision.
function simplifyIndices(p, target) {
  let idx = Uint32Array.from(p.getIndices()?.getArray() ?? Array.from({ length: p.getAttribute("POSITION").getCount() }, (_, i) => i));
  if (idx.length <= target * 3) return idx;
  const pos = p.getAttribute("POSITION").getArray();
  const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
  idx = idx.map((i) => remap[i]);
  return MeshoptSimplifier.simplify(idx, pos, 3, Math.max(12, Math.floor(target) * 3), 4e-3, ["Permissive"])[0];
}
async function stlRecords(file, config, doc) {
  const b = await fs.readFile(file), g = new STLLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const mats = {};
  for (const name of ["chrome", "green"]) mats[name] = applyFinish(doc, doc.createMaterial(name), name, /* @__PURE__ */ new Map());
  const groups = /* @__PURE__ */ new Map();
  let removedLoopTriangles = 0, panelTriangles = 0, letterTriangles = 0;
  for (let j = 0; j < g.attributes.position.count; j += 3) {
    const ps = [0, 1, 2].map((k) => new T.Vector3().fromBufferAttribute(g.attributes.position, j + k)), c = ps[0].clone().add(ps[1]).add(ps[2]).multiplyScalar(1 / 3), n = new T.Vector3().fromBufferAttribute(g.attributes.normal, j);
    if (c.x > config.removeLoop.x[0] && c.x < config.removeLoop.x[1] && c.y > config.removeLoop.aboveY) {
      removedLoopTriangles++;
      continue;
    }
    const inPanel = c.x > config.panel.x[0] && c.x < config.panel.x[1] && c.y > config.panel.y[0] && c.y < config.panel.y[1], letter = inPanel && c.z > config.panel.letterHeight;
    const name = inPanel && !letter && c.z > 1.5 && n.z > -0.5 ? "green" : "chrome";
    if (name === "green") panelTriangles++;
    if (letter) letterTriangles++;
    if (!groups.has(name)) groups.set(name, { positions: [], normals: [], material: mats[name] });
    const r = groups.get(name);
    for (let k = 0; k < 3; k++) {
      r.positions.push(...ps[k].toArray());
      r.normals.push(g.attributes.normal.getX(j + k), g.attributes.normal.getY(j + k), g.attributes.normal.getZ(j + k));
    }
  }
  return { records: [...groups.values()].map((r) => ({ ...r, positions: Float32Array.from(r.positions), normals: Float32Array.from(r.normals) })), segmentation: { components: 1, removedLoopTriangles, panelTriangles, letterTriangles, method: "position-welded connected shell; panel region + face height + normals separate enamel and raised chrome lettering" } };
}
function emitGeometry(doc, records) {
  for (const s of doc.getRoot().listScenes()) s.dispose();
  for (const n of doc.getRoot().listNodes()) n.dispose();
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  for (const a of doc.getRoot().listAccessors()) a.dispose();
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  for (const c of doc.getRoot().listCameras()) c.dispose();
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer(), scene = doc.createScene("Badge"), mesh = doc.createMesh("Material zones"), byMaterial = /* @__PURE__ */ new Map();
  for (const r of records) {
    if (!byMaterial.has(r.material)) byMaterial.set(r.material, []);
    byMaterial.get(r.material).push(r);
  }
  for (const [mat, rs] of byMaterial) {
    const total = rs.reduce((a, r) => a + r.positions.length, 0), ps = new Float32Array(total), ns = new Float32Array(total), hasUV = rs.some((r) => r.uv), uv = hasUV ? new Float32Array(total / 3 * 2) : null, uv1 = rs.some((r) => r.uv1) ? new Float32Array(total / 3 * 2) : null;
    let o = 0;
    for (const r of rs) {
      ps.set(r.positions, o);
      ns.set(r.normals, o);
      if (r.uv) uv.set(r.uv, o / 3 * 2);
      if (r.uv1) uv1.set(r.uv1, o / 3 * 2);
      o += r.positions.length;
    }
    const prim = doc.createPrimitive().setMaterial(mat).setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(ps).setBuffer(buffer)).setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(ns).setBuffer(buffer));
    if (uv) prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer));
    if (uv1) prim.setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(uv1).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  scene.addChild(doc.createNode("Emblem +Z, up +Y").setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);
}
function recordsFromDocument(doc) {
  const rs = [];
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) for (const p of n.getMesh().listPrimitives()) rs.push(expand(p, Uint32Array.from(p.getIndices()?.getArray() ?? Array.from({ length: p.getAttribute("POSITION").getCount() }, (_, i) => i)), new T.Matrix4().fromArray(n.getWorldMatrix()), p.getMaterial()));
  return rs;
}
async function prepare({ source, output = "public/badges", only } = {}) {
  source ??= await defaultSource();
  const io = await badgeIO();
  await MeshoptSimplifier.ready;
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir("local/showcase-badges/candidates", { recursive: true });
  const inventory = [], manifest = [], candidateReports = [];
  const sourceFiles = [...new Set(Object.values(models).flatMap((m) => Object.values(m.candidates).map((c) => c.file)))];
  for (const file of sourceFiles) {
    if (file.endsWith(".stl")) {
      inventory.push({ file, format: "STL binary", bytes: (await fs.stat(path.join(source, file))).size, triangles: 8462, meshes: 1, materials: [], textures: [], units: "unspecified; ~97 source units across (likely millimetres)", licence: "unknown", author: "unknown" });
      continue;
    }
    const doc = await io.read(path.join(source, file));
    inventory.push({ file, format: path.extname(file).slice(1), bytes: await sourceBytes(path.join(source, file)), ...sourceSummary(doc), quality: sourceQuality(doc) });
  }
  for (const [id, model] of Object.entries(models)) {
    if (only && !only.includes(id)) continue;
    for (const [candidate, c] of Object.entries(model.candidates)) {
      console.log(`Preparing ${id}-${candidate}`);
      let doc, records, before, segmentation;
      const originalFile = path.join(source, c.file), cache = /* @__PURE__ */ new Map();
      if (c.file.endsWith(".stl")) {
        doc = new Document();
        doc.createBuffer();
        ({ records, segmentation } = await stlRecords(originalFile, c, doc));
        before = inventory.find((i) => i.file === c.file);
      } else {
        doc = await io.read(originalFile);
        before = sourceSummary(doc);
        const nodes = doc.getRoot().listNodes().filter((n) => {
          if (!n.getMesh()) return false;
          if (c.nodes && !c.nodes.includes(n.getName())) return false;
          const i = Number(n.getMesh().getName().replace("Object_", ""));
          return !c.meshRange || i >= c.meshRange[0] && i <= c.meshRange[1] && !c.excludeMeshes?.includes(i);
        });
        let correction = new T.Matrix4();
        if (c.alignNode) {
          const n = nodes.find((n2) => n2.getName() === c.alignNode);
          correction.extractRotation(new T.Matrix4().fromArray(n.getWorldMatrix())).invert();
        }
        if (c.rotation) correction.premultiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(...c.rotation)));
        const selectedTriangles = nodes.reduce((a, n) => a + n.getMesh().listPrimitives().reduce((s, p) => s + triangles(p), 0), 0);
        before.selectedTriangles = selectedTriangles;
        before.selectedDrawCalls = nodes.reduce((a, n) => a + n.getMesh().listPrimitives().length, 0);
        const target = c.target ?? model.target ?? (id === "lexus" ? 14e3 : id === "nissan" ? 6500 : c.backing ? 14e3 : 24e3), ratio = Math.min(1, target / selectedTriangles);
        records = [];
        for (const n of nodes) for (const p of n.getMesh().listPrimitives()) {
          let material = p.getMaterial();
          const override = c.materialOverrides?.[material?.getName()];
          if (override) material = applyFinish(doc, material, override, cache);
          else if (material) {
            material.setEmissiveFactor([0, 0, 0]);
            material.setRoughnessFactor(Math.max(0.15, Math.min(0.45, material.getRoughnessFactor())));
            if (material.getMetallicFactor() > 0.7) material.setMetallicFactor(1);
          }
          let t = triangles(p), targetForPrim = c.pearlTriangles && /pearl/i.test(material?.getName()) ? c.pearlTriangles : Math.max(8, t * ratio);
          // Component selection must precede reduction; Lexus' wordmark is most
          // of its source primitive, but its emblem is already below the budget.
          let indices = c.componentAboveY !== undefined ? Uint32Array.from(p.getIndices()?.getArray() ?? Array.from({ length: p.getAttribute("POSITION").getCount() }, (_, i) => i)) : simplifyIndices(p, targetForPrim);
          if (c.pearlTriangles && /pearl/i.test(p.getMaterial()?.getName()) && indices.length > 36) {
            const pos = p.getAttribute("POSITION").getArray();
            indices = MeshoptSimplifier.simplify(Uint32Array.from(p.getIndices().getArray()), pos, 3, 24, 1, ["Permissive"])[0];
          }
          const matrix = correction.clone().multiply(new T.Matrix4().fromArray(n.getWorldMatrix()));
          records.push(expand(p, indices, matrix, material));
        }
      }
      if (c.componentAboveY !== undefined) {
        const selected = componentsAboveY(records, c.componentAboveY);
        records = selected.records;
        segmentation = selected.report;
      }
      const sourceBounds = normalize(records);
      const satin = applyFinish(doc, doc.createMaterial("Satin metal backing"), model.backing || c.backing ? "graphite" : "satin", /* @__PURE__ */ new Map());
      const finished = finishBacks(records, satin, { backing: model.backing || c.backing, backingScale: c.backingScale });
      records = finished.records;
      normalize(records);
      const seams = capResidualSeams(records, satin);
      records = seams.records;
      finished.report.cappedResidualEdges = seams.cappedEdges;
      const coverage = faceCoverage(records);
      let topology = analyseTriangles(records).summary;
      emitGeometry(doc, records);
      const pruneOptions = { keepAttributes: c.preserveUVs ?? false };
      await doc.transform(prune(pruneOptions), dedup(), join({ keepMeshes: true }), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 90 }), prune(pruneOptions));
      for (const ext of doc.getRoot().listExtensionsUsed()) if (!["KHR_materials_clearcoat", "KHR_texture_transform", "EXT_texture_webp"].includes(ext.extensionName)) ext.dispose();
      const credit = credits[c.file === packFile ? "pack" : id], originalAttribution = structuredClone(doc.getRoot().getAsset().extras ?? {});
      const modifications = [`Extracted ${candidate} candidate; world transforms baked; centred, +Z face, +Y up; larger face span 1`, "Merged by physical material zone; unused scene data removed; PBR finishes corrected", "WebP textures <=1024; Draco geometry compression", finished.report.backing];
      if (c.componentAboveY === undefined && (model.target || before.selectedTriangles > 3e4)) modifications.push("Meshoptimizer reduction preserving silhouette and raised relief");
      if (c.file.endsWith('.stl')) modifications.push("STL panel/letter/wing material segmentation; mounting loop removed");
      if (c.componentAboveY !== undefined) modifications.push("Separated connected components; removed LEXUS wordmark; retained oval/L and graphite support");
      const licence = id === "aston" && candidate === "standalone" ? "unknown" : id === "audi" && candidate === "standalone" ? "GT3 own export" : "CC BY 4.0";
      doc.getRoot().getAsset().extras = { ...originalAttribution, originalAttribution, title: credit[0], author: credit[1] ?? "unknown", sourceUrl: credit[2], licence, modifications, canonical: { face: "+Z", up: "+Y", span: 1 }, topology };
      await doc.transform(draco({ quantizePosition: 24, quantizeNormal: 12, quantizeTexcoord: 14, quantizationVolume: "scene" }));
      const candidatePath = `local/showcase-badges/candidates/${id}-${candidate}.glb`;
      await io.write(candidatePath, doc);
      let quantizationRepairs = 0;
      // Verify the bytes we actually ship: Draco quantization can collapse tiny seams.
      for (let pass = 0; pass < 4; pass++) {
        const decoded = await io.read(candidatePath), rs = recordsFromDocument(decoded);
        topology = analyseTriangles(rs).summary;
        if (!topology.boundaryEdges && !topology.degenerateFaces) break;
        const back = decoded.getRoot().listMaterials().find((m) => m.getName() === "Satin metal backing") ?? applyFinish(decoded, decoded.createMaterial("Satin metal backing"), "satin", /* @__PURE__ */ new Map());
        const fixed = capResidualSeams(cleanTriangles(rs), back);
        quantizationRepairs += fixed.cappedEdges;
        emitGeometry(decoded, fixed.records);
        await decoded.transform(prune(pruneOptions), dedup(), join({ keepMeshes: true }), draco({ quantizePosition: 24, quantizeNormal: 12, quantizeTexcoord: 14, quantizationVolume: "scene" }));
        await io.write(candidatePath, decoded);
      }
      finished.report.quantizationRepairs = quantizationRepairs;
      const finalDoc = await io.read(candidatePath);
      const finalRecords = recordsFromDocument(finalDoc), finalSize = bounds(finalRecords).getSize(new T.Vector3());
      topology = analyseTriangles(finalRecords).summary;
      if (topology.boundaryEdges) throw new Error(`${id}-${candidate} still has ${topology.boundaryEdges} open edges after Draco`);
      const bytes = (await fs.stat(candidatePath)).size;
      const report = { id, candidate, source: c.file, author: credit[1] ?? "unknown", sourceUrl: credit[2], licence, modifications, triangles: topology.triangles, meshes: finalDoc.getRoot().listMeshes().length, materials: finalDoc.getRoot().listMaterials().length, drawCalls: finalDoc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0), bytes, faceCoverage: Number(coverage.toFixed(4)), faceSpan: Math.max(finalSize.x, finalSize.y), sourceBounds, topology, back: finished.report, segmentation, before: { triangles: before.selectedTriangles ?? before.triangles, meshes: before.meshes, drawCalls: before.selectedDrawCalls ?? before.meshes, materials: before.materials.length, bytes: before.bytes ?? await sourceBytes(originalFile) } };
      candidateReports.push(report);
      if (candidate === model.chosen) {
        await fs.copyFile(candidatePath, path.join(output, `${id}.glb`));
        manifest.push({ ...report, file: `${id}.glb` });
      }
      console.log(`${id}-${candidate}: ${report.triangles} triangles, ${report.drawCalls} draws, ${bytes} bytes, ${topology.boundaryEdges} open edges`);
    }
  }
  let reference = candidateReports.find((r) => r.id === opticalScaling.reference && r.candidate === models[r.id].chosen);
  if (!reference && only) reference = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8")).find((r) => r.id === opticalScaling.reference);
  if (!reference) throw new Error('BMW reference coverage is required for optical scaling');
  for (const report of candidateReports) {
    const [x, y] = report.sourceBounds.dimensions, aspect = Math.max(x, y) / Math.min(x, y);
    const cap = aspect >= opticalScaling.wideAspect ? opticalScaling.wideMax : opticalScaling.max;
    // Draco can decode a span a fraction above 1; floor the final bound so even
    // the actual scaled geometry stays <=1.35, rather than just its metadata.
    const spanCap = Math.floor(opticalScaling.max / report.faceSpan * 1000) / 1000;
    report.opticalScale = Math.min(spanCap, Number(Math.min(cap, Math.max(opticalScaling.min, (reference.faceCoverage / report.faceCoverage) ** opticalScaling.areaExponent)).toFixed(3)));
    report.opticalScaling = { reference: opticalScaling.reference, referenceCoverage: reference.faceCoverage, areaExponent: opticalScaling.areaExponent, cap };
    const chosen = manifest.find((r) => r.id === report.id && r.candidate === report.candidate);
    if (chosen) Object.assign(chosen, { opticalScale: report.opticalScale, opticalScaling: report.opticalScaling });
  }
  if (!only) {
    await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    await fs.writeFile("local/showcase-badges/preparation-report.json", JSON.stringify({ inventory, candidates: candidateReports }, null, 2));
    await writeInventory(inventory, candidateReports, source);
  }
  return { manifest, candidates: candidateReports };
}
async function writeInventory(inventory, reports, source) {
  let text = "# Badge source inventory\n\nGenerated by `node scripts/prepare-badge-models.mjs --source " + source + "`. Source units are unspecified unless noted; world transforms are baked before normalizing. glTF does not declare authoring units beyond its metre convention. Orientations and bounds below describe the selected geometry, not a claim about physical badge size.\n\n";
  for (const i of inventory) {
    text += `## ${i.file}

Format ${i.format}; ${i.bytes} bytes; ${i.triangles} triangles; ${i.meshes} meshes; ${i.materials.length} materials.

Source units, orientation bounds and full-source quality: ${JSON.stringify(i.quality ?? { units: i.units })}.

Materials: ${i.materials.join(", ") || "none (uncoloured STL)"}. Textures: ${JSON.stringify(i.textures)}.

Licence metadata: ${JSON.stringify(i.asset?.extras ?? { author: i.author, licence: i.licence })}.

`;
    for (const r of reports.filter((r2) => r2.source === i.file)) text += `- ${r.id}-${r.candidate}: source bounds/units ${JSON.stringify(r.sourceBounds)}; correction ${JSON.stringify(models[r.id].candidates[r.candidate])}; numeric source topology after budget reduction ${JSON.stringify(r.back.before)}; repair ${JSON.stringify(r.back)}.
`;
  }
  const pack = inventory.find((i) => i.file === packFile);
  text += "\n## Pack brand map\n\nIdentified by orthographic geometry inspection. Names are generic in the download; explicit mesh ranges are editable in config. Ferrari excludes remote Mustang tricolour pieces 52\u201354. No Lexus, Mercedes or Lamborghini is present.\n\n";
  for (const [brand, ranges] of Object.entries(packBrands)) {
    const nodes = pack.nodes.filter((n) => ranges.some(([a, b]) => {
      const i = Number(n.mesh.replace("Object_", ""));
      return i >= a && i <= b;
    }) && !(brand === "ferrari" && [52, 53, 54].includes(Number(n.mesh.replace("Object_", "")))));
    text += `- **${brand}**: ${nodes.reduce((s, n) => s + n.triangles, 0)} triangles; ${nodes.map((n) => `${n.name}/${n.mesh}: ${n.triangles}`).join("; ")}.
`;
  }
  text += "\n## Download licence text\n\n";
  try {
    text += "```text\n" + await fs.readFile(path.join(source, "detailed_porsche_logo/license.txt"), "utf8") + "\n```\n";
  } catch {
    text += "No Porsche license.txt found.\n";
  }
  text += "\nOther standalone GLBs and the pack retain embedded CC-BY-4.0 author/title/source metadata quoted above. Audi has no embedded licence metadata (GT3 own export). STL has no metadata; author and licence unknown. ZIP is an archive of the Porsche source; McLaren references are outside this task and were not processed.\n\n## Quality notes\n\nLexus: connected-component bounds separate the oval/L from the lower LEXUS wordmark before reduction; only the emblem is retained and normalised. Mercedes: polySurface1 is the ring; polySurface2 is the star; both retained without reduction, with graphite silhouette support. Lamborghini: Gold is a separate detached cursive wordmark, omitted from the crest; its unused 2048 normal map is pruned. The crest retains its gold bull/border/lettering baseColor, metallicRoughness and 1024 normal maps, both UV sets, and texture transforms when present. No Y half-turn: the repaired crest already faces +Z. Aston: one connected printable shell with a mounting loop; loop removed and cut boundaries closed. Porsche: thousands of bead shells simplified individually, then material zones merged. Source boundaries, duplicate triangles, normal disagreements and non-manifold edges are counted above; closed negative-volume components are reversed, open components mirrored with satin rears and edge walls. Intersecting relief shells are retained; this is a presentation mesh, not a boolean-unioned manufacturing solid. Remaining non-manifold edges are reported, never hidden.\n";
  await fs.writeFile("local/showcase-badges/INVENTORY.md", text);
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2), value = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : void 0;
  await prepare({ source: value("--source"), output: value("--output"), only: value("--only")?.split(",") });
}
export {
  badgeIO,
  defaultSource,
  prepare,
  recordsFromDocument
};
