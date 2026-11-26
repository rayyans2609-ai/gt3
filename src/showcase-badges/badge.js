import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import lexus from './lexus.svg?raw';

const sources = { lexus };

/** Create a self-contained, unlit-scene-agnostic badge. Caller supplies lights/environment. */
export function createBadge({ manufacturer = 'lexus', color = 0x8fa6b6, theme = 'day', onHover, onClick } = {}) {
  const source = sources[manufacturer];
  if (!source) throw new Error(`Unknown badge: ${manufacturer}`);
  const root = new THREE.Group();
  const art = new THREE.Group();
  root.add(art);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9e0e5, metalness: 0.85, roughness: 0.24 });
  const accent = new THREE.Color(color);
  const geometries = [];
  const parsed = new SVGLoader().parse(source);
  for (const path of parsed.paths) {
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelThickness: 0.7, bevelSize: 0.55, bevelSegments: 2, curveSegments: 8, steps: 1 });
      geometries.push(geometry);
      art.add(new THREE.Mesh(geometry, metal));
    }
  }
  art.scale.y = -1;
  art.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(art);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y);
  art.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  art.scale.set(scale, -scale, scale);
  let hovered = false, px = 0, py = 0, x = 0, y = 0, elapsed = 0, disposed = false;
  function setTheme(value) {
    theme = value;
    metal.color.set(value === 'night' ? 0xaabaca : 0xd9e0e5);
    metal.emissive.copy(accent).multiplyScalar(value === 'night' ? 0.12 : 0.035);
  }
  setTheme(theme);
  return {
    object: root,
    setTheme,
    setColor(value) { accent.set(value); setTheme(theme); },
    setPointer(nx = 0, ny = 0) { px = THREE.MathUtils.clamp(nx, -1, 1); py = THREE.MathUtils.clamp(ny, -1, 1); },
    setHovered(value) { value = !!value; if (hovered !== value) { hovered = value; onHover?.(value, manufacturer); } },
    click(event) { onClick?.(manufacturer, event); },
    update(dt) {
      dt = Math.max(0, Math.min(dt, 0.1)); elapsed += dt;
      const damping = 1 - Math.exp(-3.2 * dt);
      x += (px - x) * damping; y += (py - y) * damping;
      art.rotation.y = Math.sin(elapsed * 0.7) * 0.055 + x * 0.10;
      art.rotation.x = Math.sin(elapsed * 0.53) * 0.025 - y * 0.04;
      art.position.y = -center.y * scale + Math.sin(elapsed * 1.1) * 0.025;
      const target = hovered ? 1.045 : 1;
      const s = THREE.MathUtils.lerp(root.scale.x, target, 1 - Math.exp(-7 * dt));
      root.scale.setScalar(s);
    },
    dispose() { if (disposed) return; disposed = true; geometries.forEach(g => g.dispose()); metal.dispose(); root.removeFromParent(); },
  };
}
