import * as THREE from 'three';

/** Floating chequered flag; caller supplies lighting and forwards interaction. */
export function createShowcaseFlag({ color = 0x8197aa, theme = 'day', onHover, onClick } = {}) {
  const root = new THREE.Group();
  const flag = new THREE.Group();
  root.add(flag);
  const vertices = [], colors = [], base = [];
  const cols = 8, rows = 4;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const white = (row + col) % 2 === 0;
    const c = new THREE.Color(white ? 0xf5f4ee : 0x111820);
    const x0 = -0.46 + col * 0.115, x1 = x0 + 0.115;
    const y0 = 0.25 - row * 0.115, y1 = y0 - 0.115;
    for (const [x,y] of [[x0,y0],[x0,y1],[x1,y0],[x1,y0],[x0,y1],[x1,y1]]) {
      vertices.push(x,y,0); base.push(x,y); colors.push(c.r,c.g,c.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.04;
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, metalness: 0.12 });
  flag.add(new THREE.Mesh(geometry, cloth));
  const poleGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.79, 8);
  const poleMaterial = new THREE.MeshStandardMaterial({color: 0xbcc7cd, metalness: 0.8, roughness: 0.3});
  const pole = new THREE.Mesh(poleGeometry, poleMaterial); pole.position.set(-0.48, -0.12, 0); flag.add(pole);
  let accent = new THREE.Color(color), t = 0, px = 0, py = 0, x = 0, y = 0, hovered = false, disposed = false;
  function setTheme(value) { theme = value; cloth.emissive.copy(accent).multiplyScalar(value === 'night' ? 0.10 : 0.025); }
  setTheme(theme);
  return {
    object: root, setTheme,
    setColor(value) { accent.set(value); setTheme(theme); },
    setPointer(nx = 0, ny = 0) { px = THREE.MathUtils.clamp(nx,-1,1); py = THREE.MathUtils.clamp(ny,-1,1); },
    setHovered(value) { value = !!value; if (hovered !== value) { hovered = value; onHover?.(value); } },
    click(event) { onClick?.(event); },
    update(dt) {
      dt = Math.max(0, Math.min(dt, 0.1)); t += dt;
      const d = 1 - Math.exp(-3.2 * dt); x += (px-x)*d; y += (py-y)*d;
      flag.position.y = Math.sin(t*1.1)*0.025;
      flag.rotation.y = Math.sin(t*0.7)*0.055 + x*0.1; flag.rotation.x = Math.sin(t*0.53)*0.025 - y*0.04;
      const p = geometry.attributes.position;
      for (let i = 0; i < base.length / 2; i++) { const u = (base[i*2]+0.46)/0.92; p.setZ(i, Math.sin(u*5-t*2)*0.035*u); }
      p.needsUpdate = true; geometry.computeVertexNormals();
      const s = THREE.MathUtils.lerp(root.scale.x, hovered ? 1.045 : 1, 1-Math.exp(-7*dt)); root.scale.setScalar(s);
    },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); cloth.dispose(); poleGeometry.dispose(); poleMaterial.dispose(); root.removeFromParent(); },
  };
}
