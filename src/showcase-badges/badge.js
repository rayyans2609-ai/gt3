import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import lexus from './lexus.svg?raw';
import audi from './audi.svg?raw';
import mclaren from './mclaren.svg?raw';
import nissan from './nissan.svg?raw';
import mercedes from './mercedes.svg?raw';
import bmwUrl from './bmw.svg?url';
import aston from './aston.svg?raw';
import ferrari from './ferrari.svg?raw';

const sources = { lexus, nissan, audi, bmw: null, mercedes, ferrari, mclaren, aston, lamborghini: null, porsche: null };

/** Create a self-contained, unlit-scene-agnostic badge. Caller supplies lights/environment. */
export function createBadge({ manufacturer = 'lexus', color = 0x8fa6b6, theme = 'day', locked = false, onHover, onClick } = {}) {
  const source = sources[manufacturer];
  if (!Object.hasOwn(sources, manufacturer)) throw new Error(`Unknown badge: ${manufacturer}`);
  const substitute = !source && manufacturer !== 'bmw';
  const root = new THREE.Group();
  const motion = new THREE.Group();
  const art = new THREE.Group();
  root.add(motion);
  motion.add(art);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9e0e5, metalness: 0.85, roughness: 0.24 });
  const accent = new THREE.Color(color);
  const geometries = [];
  const ownedMaterials = [];
  const textures = [];
  if (manufacturer === 'bmw') {
    const texture = new THREE.TextureLoader().load(bmwUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const backing = new THREE.CylinderGeometry(0.5, 0.5, 0.025, 48);
    backing.rotateX(Math.PI / 2);
    geometries.push(backing);
    art.add(new THREE.Mesh(backing, metal));
    const faceGeometry = new THREE.PlaneGeometry(1, 1);
    geometries.push(faceGeometry);
    const faceMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.38, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1 });
    ownedMaterials.push(faceMaterial);
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.z = 0.014;
    art.add(face);
  } else if (source) {
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const extent = viewBox?.length === 4 ? Math.max(viewBox[2], viewBox[3]) : Math.max(parseFloat(svg.getAttribute('width')), parseFloat(svg.getAttribute('height')));
  if (!Number.isFinite(extent) || extent <= 0) throw new Error(`Invalid SVG dimensions: ${manufacturer}`);
  const parsed = new SVGLoader().parse(source);
  for (const path of parsed.paths) {
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: extent * 0.015, bevelEnabled: true, bevelThickness: extent * 0.004, bevelSize: extent * 0.003, bevelSegments: 2, curveSegments: 8, steps: 1 });
      geometries.push(geometry);
      art.add(new THREE.Mesh(geometry, metal));
    }
  }
  }
  if (!substitute) {
    art.scale.y = manufacturer === 'bmw' ? 1 : -1;
    art.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(art);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y);
    if (!Number.isFinite(span) || span <= 0) {
      geometries.forEach(g => g.dispose());
      ownedMaterials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
      metal.dispose();
      throw new Error(`Badge artwork has no measurable geometry: ${manufacturer}`);
    }
    const scale = 1 / span;
    art.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    art.scale.set(scale, manufacturer === 'bmw' ? scale : -scale, scale);
  }
  const lockGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.025, 32);
  lockGeometry.rotateX(Math.PI / 2);
  const lockMaterial = new THREE.MeshStandardMaterial({ color: 0x899096, metalness: 0.65, roughness: 0.4 });
  const lockMesh = new THREE.Mesh(lockGeometry, lockMaterial);
  motion.add(lockMesh);
  const hitGeometry = new THREE.PlaneGeometry(1.05, 1.05);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial);
  root.add(hitTarget);
  function setLocked(value) {
    locked = !!value; art.visible = !locked && !substitute; lockMesh.visible = locked || substitute;
    if (locked) { px = py = 0; }
  }
  let hovered = false, px = 0, py = 0, x = 0, y = 0, elapsed = 0, disposed = false;
  function setTheme(value) {
    theme = value;
    metal.color.set(value === 'night' ? 0xaabaca : 0xd9e0e5);
    metal.emissive.copy(accent).multiplyScalar(value === 'night' ? 0.12 : 0.035);
  }
  setTheme(theme);
  setLocked(locked);
  return {
    object: root,
    hitTarget,
    setLocked,
    setTheme,
    setColor(value) { accent.set(value); setTheme(theme); },
    setPointer(nx = 0, ny = 0) { px = locked ? 0 : THREE.MathUtils.clamp(nx, -1, 1); py = locked ? 0 : THREE.MathUtils.clamp(ny, -1, 1); },
    setHovered(value) { value = !!value; if (hovered !== value) { hovered = value; onHover?.(value, locked ? null : manufacturer); } },
    click(event) { if (!locked) onClick?.(manufacturer, event); },
    update(dt) {
      dt = Math.max(0, Math.min(dt, 0.1)); elapsed += dt;
      const damping = 1 - Math.exp(-3.2 * dt);
      x += (px - x) * damping; y += (py - y) * damping;
      motion.rotation.y = Math.sin(elapsed * 0.55) * 0.025 + x * 0.055;
      motion.rotation.x = Math.sin(elapsed * 0.43) * 0.012 - y * 0.025;
      motion.position.y = Math.sin(elapsed * 0.8) * 0.012;
      const target = hovered ? 1.045 : 1;
      const s = THREE.MathUtils.lerp(root.scale.x, target, 1 - Math.exp(-7 * dt));
      root.scale.setScalar(s);
    },
    dispose() { if (disposed) return; disposed = true; geometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); metal.dispose(); lockGeometry.dispose(); lockMaterial.dispose(); hitGeometry.dispose(); hitMaterial.dispose(); root.removeFromParent(); },
  };
}
