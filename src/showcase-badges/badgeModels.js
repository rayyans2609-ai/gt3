import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const decoder = new DRACOLoader().setDecoderPath('/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(decoder);
const cache = new Map();
const states = new Map();
let manifestPromise;
let warned = false;

export function warnBadgeFallback(error) {
  if (warned) return;
  warned = true;
  console.warn('[badges] Using procedural artwork; optional model assets are unavailable.', error);
}
export function badgeModelStatus(id) { return states.get(id) ?? 'none'; }

function manifest() {
  // Invoked only by an unlocked instance. A failed optional manifest is not retried.
  return manifestPromise ??= Promise.resolve().then(() => fetch('/badges/manifest.json'))
    .then(response => {
      if (!response.ok) throw new Error(`Badge manifest: HTTP ${response.status}`);
      return response.json();
    }).then(data => {
      if (!Array.isArray(data)) throw new Error('Invalid badge manifest');
      return new Map(data.filter(row => row && typeof row.id === 'string'
        && typeof row.file === 'string' && /^[\w-]+\.glb$/.test(row.file))
        .map(row => [row.id, row]));
    });
}
function destroyTemplate(entry) {
  if (entry.users || !entry.settled) return;
  const hadTemplate = !!entry.template;
  if (entry.template) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    entry.template.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
    entry.template = null;
  }
  // Keep the settled promise/failure cached while any lease is alive. Once the last
  // lease leaves, a later instance can reload geometry without holding GPU resources.
  if (hadTemplate && cache.get(entry.id) === entry) cache.delete(entry.id);
  if (hadTemplate && states.get(entry.id) === 'ready') states.set(entry.id, 'none');
}

/** Internal lease: geometry/textures are shared; instance materials are private. */
export function acquireBadgeModel(id) {
  let entry = cache.get(id);
  if (!entry) {
    entry = { id, users: 0, settled: false, template: null };
    cache.set(id, entry);
    states.set(id, 'loading');
    entry.promise = manifest().then(rows => {
      const row = rows.get(id);
      if (!row) { states.set(id, 'none'); return null; }
      return loader.loadAsync(`/badges/${row.file}`).then(gltf => {
        entry.template = gltf.scene;
        states.set(id, 'ready');
        return { template: gltf.scene, opticalScale: Number.isFinite(row.opticalScale) && row.opticalScale > 0 ? row.opticalScale : 1 };
      });
    }).catch(error => {
      states.set(id, 'fallback');
      warnBadgeFallback(error);
      return null;
    }).finally(() => { entry.settled = true; destroyTemplate(entry); });
  }
  entry.users++;
  let released = false, instance = null;
  const materials = new Set();
  const ready = entry.promise.then(result => {
    if (released || !result) return null;
    instance = result.template.clone(true);
    const clones = new Map();
    instance.traverse(node => {
      if (!node.material) return;
      const clone = material => {
        if (!clones.has(material)) { const copy = material.clone(); clones.set(material, copy); materials.add(copy); }
        return clones.get(material);
      };
      node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
    });
    instance.scale.multiplyScalar(result.opticalScale);
    instance.userData.badgeModel = id;
    return instance;
  }).catch(error => { warnBadgeFallback(error); return null; });
  return {
    ready,
    release() {
      if (released) return;
      released = true;
      instance?.removeFromParent();
      for (const material of materials) material.dispose();
      materials.clear();
      entry.users--;
      destroyTemplate(entry);
    },
  };
}
