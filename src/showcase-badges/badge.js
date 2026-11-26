import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import lexus from './lexus.svg?raw';
import audi from './audi.svg?raw';
import mclaren from './mclaren.svg?raw';
import nissan from './nissan.svg?raw';
import mercedes from './mercedes.svg?raw';
import bmwUrl from './bmw.svg?url';
import aston from './aston.svg?raw';
// Files prepared in the checkout's ignored local/ directory for private development.
const crestFaces = import.meta.glob('../../local/showcase-badges/*.face.svg', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const crestOutlines = import.meta.glob('../../local/showcase-badges/*.outline.svg', {
  eager: true, import: 'default', query: '?raw',
});

// The face finishes describe the emblems. Livery colour only affects their reflected tint.
const badges = {
  lexus: { source: lexus, metalness: 0.90, roughness: 0.22 },
  nissan: { source: nissan, metalness: 0.83, roughness: 0.30, bevel: 0.0009 },
  audi: { source: audi, metalness: 0.86, roughness: 0.25, bevel: 0.0013 },
  bmw: { metalness: 0.87, roughness: 0.26 },
  mercedes: { source: mercedes, metalness: 0.90, roughness: 0.23, pathLimit: 1 },
  ferrari: { crest: true, metalness: 0.83, roughness: 0.28, faceColor: 0xc9ab68 },
  mclaren: { source: mclaren, metalness: 0.48, roughness: 0.26, faceColor: 0xc23f22 },
  aston: { source: aston, metalness: 0.79, roughness: 0.27, bevel: 0.0005 },
  lamborghini: { crest: true, metalness: 0.78, roughness: 0.28, faceColor: 0xb9914c },
  porsche: { crest: true, metalness: 0.84, roughness: 0.29, faceColor: 0xc1a36a },
};

function makeDisc(radius, depth, bevel) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, 2 * Math.PI);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 20,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function makeRelief(shapes, span, bevel, depth = 0.009) {
  return new THREE.ExtrudeGeometry(shapes, {
    depth: span * depth,
    bevelEnabled: bevel > 0,
    bevelSize: span * bevel,
    bevelThickness: span * bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
}

function shapeBounds(shape) {
  return new THREE.Box2().setFromPoints(shape.getPoints(10));
}

/** Add the returned object to a lit Three.js scene. The caller owns input and the render loop. */
export function createBadge({ manufacturer = 'lexus', color = 0x8fa6b6, theme = 'day', locked = false, onHover, onClick } = {}) {
  if (!Object.hasOwn(badges, manufacturer)) throw new Error(`Unknown badge: ${manufacturer}`);
  const design = badges[manufacturer];
  const root = new THREE.Group();
  const motion = new THREE.Group();
  root.add(motion);
  const accent = new THREE.Color(color);
  const owned = [];
  let art, metal, neutral;
  let hovered = false, px = 0, py = 0, x = 0, y = 0, elapsed = 0, disposed = false;

  function own(resource) {
    owned.push(resource);
    return resource;
  }

  // This stationary target does not inherit hover scale or float. It submits no draw call.
  const hitTarget = new THREE.Mesh(
    own(new THREE.PlaneGeometry(1.05, 1.05)),
    own(new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })),
  );
  root.add(hitTarget);

  function setTheme(value) {
    theme = value;
    if (metal) {
      metal.color.set(design.faceColor ?? (theme === 'night' ? 0xc3cfdb : 0xdce1e5));
      metal.emissive.copy(accent).multiplyScalar(theme === 'night' ? 0.075 : 0.022);
    }
  }

  function makeArtwork() {
    const prefix = `../../local/showcase-badges/${manufacturer}`;
    const source = design.crest ? crestOutlines[`${prefix}.outline.svg`] : design.source;
    const url = crestFaces[`${prefix}.face.svg`];
    if (design.crest && (!source || !url)) {
      throw new Error(`Missing local ${manufacturer} crest. Run python3 src/showcase-badges/prepare-crests.py before starting Vite.`);
    }
    const group = new THREE.Group();
    metal = own(new THREE.MeshStandardMaterial({ metalness: design.metalness, roughness: design.roughness }));
    setTheme(theme);

    if (manufacturer === 'bmw') {
      const map = own(new THREE.TextureLoader().load(bmwUrl));
      map.colorSpace = THREE.SRGBColorSpace;
      group.add(new THREE.Mesh(own(makeDisc(0.496, 0.014, 0.004)), metal));
      const enamel = own(new THREE.MeshPhysicalMaterial({
        map, alphaTest: 0.5, metalness: 0.10, roughness: 0.36,
        clearcoat: 0.30, clearcoatRoughness: 0.26,
      }));
      const face = new THREE.Mesh(own(new THREE.PlaneGeometry(0.98, 0.98)), enamel);
      face.position.z = 0.0115;
      group.add(face);
      return group;
    }

    const parsed = new SVGLoader().parse(source);
    const { paths } = parsed;
    let shapes = paths.slice(0, design.pathLimit ?? paths.length).flatMap(path =>
      path.userData.style.fill === 'none' ? [] : SVGLoader.createShapes(path),
    );
    if (manufacturer === 'aston') {
      // Leave the separate lettering below the wings in the source artwork.
      shapes = shapes.filter(shape => shapeBounds(shape).max.y < 110);
    }
    const box = new THREE.Box2();
    for (const shape of shapes) box.union(shapeBounds(shape));
    const { x: width, y: height } = box.getSize(new THREE.Vector2());
    const span = Math.max(width, height);
    if (!(span > 0 && Number.isFinite(span))) throw new Error(`Badge artwork has no measurable geometry: ${manufacturer}`);

    const bevel = design.bevel ?? 0.0018;
    group.add(new THREE.Mesh(own(makeRelief(shapes, span, bevel)), metal));

    if (design.crest) {
      const [left, top, textureWidth, textureHeight] = parsed.xml.getAttribute('viewBox').trim().split(/\s+/).map(Number);
      const faceGeometry = own(new THREE.ShapeGeometry(shapes, 10));
      const { position, uv } = faceGeometry.attributes;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (position.getX(i) - left) / textureWidth, 1 - (position.getY(i) - top) / textureHeight);
      }
      const map = own(new THREE.TextureLoader().load(url));
      map.colorSpace = THREE.SRGBColorSpace;
      const enamel = own(new THREE.MeshPhysicalMaterial({
        map, alphaTest: 0.5, metalness: 0.12, roughness: 0.38,
        clearcoat: 0.22, clearcoatRoughness: 0.28,
      }));
      const face = new THREE.Mesh(faceGeometry, enamel);
      face.position.z = span * 0.011;
      group.add(face);
    }

    if (manufacturer === 'aston') {
      // The wing outline and centre insert both come from the source paths.
      const wing = shapes.find(shape => shapeBounds(shape).getSize(new THREE.Vector2()).x > 400);
      const insert = wing.holes.find(hole => {
        const bounds = shapeBounds(hole);
        return bounds.min.x > 120 && bounds.max.x < 310 && bounds.max.x - bounds.min.x > 150;
      });
      const ivory = own(new THREE.MeshStandardMaterial({ color: 0xd7d5c8, metalness: 0.18, roughness: 0.30 }));
      const green = own(new THREE.MeshStandardMaterial({ color: 0x123b2c, metalness: 0.06, roughness: 0.26 }));
      const back = new THREE.Mesh(own(makeRelief(new THREE.Shape(wing.getPoints(10)), span, 0.0005)), ivory);
      back.position.z = -span * 0.004;
      const panel = new THREE.Mesh(own(new THREE.ShapeGeometry(new THREE.Shape(insert.getPoints(10)))), green);
      panel.position.z = span * 0.0065;
      group.add(back, panel);
    }

    const center = box.getCenter(new THREE.Vector2());
    const scale = 0.99 / span;
    group.scale.set(scale, -scale, scale);
    group.position.set(-center.x * scale, center.y * scale, -0.004);
    return group;
  }

  function setLocked(value) {
    if (disposed) return;
    if (!value) art ??= makeArtwork();
    locked = !!value;
    if (locked) {
      art?.removeFromParent();
      neutral ??= new THREE.Mesh(
        own(makeDisc(0.30, 0.016, 0.004)),
        own(new THREE.MeshStandardMaterial({ color: 0x899096, metalness: 0.60, roughness: 0.40 })),
      );
      if (neutral.parent !== motion) motion.add(neutral);
      px = py = x = y = 0;
    } else {
      neutral?.removeFromParent();
      if (art.parent !== motion) motion.add(art);
    }
  }

  setLocked(locked);
  return {
    object: root,
    hitTarget,
    setLocked,
    setTheme,
    setColor(value) {
      accent.set(value);
      setTheme(theme);
    },
    setPointer(nx = 0, ny = 0) {
      px = locked ? 0 : THREE.MathUtils.clamp(nx, -1, 1);
      py = locked ? 0 : THREE.MathUtils.clamp(ny, -1, 1);
    },
    setHovered(value) {
      value = !!value;
      if (disposed || hovered === value) return;
      hovered = value;
      if (!hovered) px = py = 0;
      onHover?.(hovered, locked ? null : manufacturer);
    },
    click(event) {
      if (!disposed && !locked) onClick?.(manufacturer, event);
    },
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 0.1);
      elapsed += dt;
      const damping = 1 - Math.exp(-3.2 * dt);
      x += (px - x) * damping;
      y += (py - y) * damping;
      motion.rotation.y = Math.sin(elapsed * 0.55) * 0.025 + x * 0.055;
      motion.rotation.x = Math.sin(elapsed * 0.43) * 0.012 - y * 0.025;
      motion.position.y = Math.sin(elapsed * 0.8) * 0.012;
      motion.scale.setScalar(THREE.MathUtils.lerp(motion.scale.x, hovered ? 1.035 : 1, 1 - Math.exp(-7 * dt)));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      motion.clear();
      art?.clear();
      for (const resource of owned) resource.dispose();
      owned.length = 0;
    },
  };
}
