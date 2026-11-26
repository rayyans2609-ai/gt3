/**
 * hubCollection.js — the Collection's central emblem in WebGL (owner brief 2026-11-26, Phase 6 §3).
 *
 * The circuit's discovered car names are the selector (DOM/SVG in hub.js / hubPlan.js). Selecting
 * one reveals that manufacturer's emblem, large, in the circuit's central negative space. Clicking
 * the emblem opens that car's Showcase. One emblem is on stage at a time; a new selection crossfades
 * (the old one sinks and turns away, the new one rises into place).
 *
 * Motion reuses the pre-drag Landing McLaren (landing.js before e74f34c): an extremely slow
 * continuous turn (4.2°/s), a 7.5 s float, and a damped pointer response (yaw/pitch, a small drift
 * and the reflections turning with the cursor). There is deliberately no drag: emblems float, react
 * to the cursor and are clicked. (The Showcase cars keep their drag-to-orbit.)
 *
 * Drawn on the one shared renderer (SPEC §27) into the main canvas while the Hub field covers the
 * Landing: the canvas clears to the field colour and the Hub's SVG/DOM sit on top. The camera maps
 * the z = 0 plane 1:1 to CSS pixels, so the emblem is placed straight from the plan's screen-space
 * centre every frame and follows any relayout (drawer, resize).
 *
 * Identity safety: a locked car never gets an emblem. selectEmblem() refuses it here as well as in
 * the caller, and nothing about a locked car is created, fetched or drawn.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS } from '../data/cars.js';
import { state, subscribe } from '../core/state.js';
import { gsap, reducedMotion } from './motion.js';
import { createBadge } from '../showcase-badges/badge.js';

const FOV = 24;
// Pre-drag Landing McLaren motion (landing.js TUNE at e74f34c^), adapted to a flat object.
const MOTION = {
  idleDegPerSecond: 4.2, // "extremely slowly": one turn in ~86 s
  bobSeconds: 7.5,
  bobFraction: 0.028,    // of the emblem's size (the car bobbed 0.035 m on ~1.2 m of height)
  pointerYaw: 0.2,       // the car used 0.13 / 0.045; a flat emblem needs a little more to read
  pointerPitch: 0.11,
  pointerDrift: 0.035,   // of the emblem's size, toward the cursor
  pointerEnvYaw: 0.32,   // reflections travel with the cursor (as the car's environment did)
  pointerDamping: 3.2,   // 1/s
  entryYaw: -0.55,       // a new emblem arrives turned slightly away and turns into view
};

let renderer = null;
let scene;
let camera;
let envTarget = null;
let pmrem = null;
let active = false;
let rendered = false;
let stage = 0;              // the whole Collection stage (0 hidden … 1 shown)
let selected = null;        // car index on stage
// The host fits each emblem individually into the circuit's real negative space: given the
// emblem's visible extents (units), it returns where its visual centre goes and its px per unit.
let fitFn = () => ({ x: innerWidth / 2, y: innerHeight / 2, size: 240 });
const UNIT = { w: 1, h: 1, cx: 0, cy: 0 };
let hovered = false;
let elapsed = 0;
const items = new Map();    // car index → { badge, holder, spinner, appear, hover, spin }
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const fieldColor = new THREE.Color();
const targetField = new THREE.Color();

/** Fallback when a component cannot build: a brushed disc with a raised ring in the car colour. */
function createPlaceholder({ color }) {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd6dde2, metalness: 0.9, roughness: 0.3 });
  const enamel = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.45 });
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 64); disc.rotateX(Math.PI / 2);
  const ring = new THREE.TorusGeometry(0.42, 0.035, 12, 64);
  const face = new THREE.CircleGeometry(0.36, 64);
  const ringMesh = new THREE.Mesh(ring, metal); ringMesh.position.z = 0.03;
  const faceMesh = new THREE.Mesh(face, enamel); faceMesh.position.z = 0.027;
  root.add(new THREE.Mesh(disc, metal), ringMesh, faceMesh);
  const hitGeometry = new THREE.PlaneGeometry(1.05, 1.05);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial);
  root.add(hitTarget);
  return {
    object: root, hitTarget, setLocked() {},
    setTheme() {}, setColor(value) { enamel.color.set(value); },
    setPointer() {}, setHovered() {}, click() {}, update() {},
    dispose() {
      [disc, ring, face, hitGeometry].forEach((g) => g.dispose());
      [metal, enamel, hitMaterial].forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}

function carColor(car) {
  return state.theme === 'night' && car.identityColorNight ? car.identityColorNight : car.identityColor;
}

function unlocked(index) { return state.unlocked.has(index); }

// GT3's own sculpted McLaren Speedmark (no downloaded mesh exists). Optional: an empty glob until
// the module is present, so the Collection never depends on it.
const speedmarkModules = import.meta.glob('../showcase-badges/mclarenSpeedmark.js', { eager: true });
const createSpeedmark = Object.values(speedmarkModules)[0]?.createSpeedmark ?? null;
const SPEEDMARK_OPTICAL_SCALE = 1.2;

/** Wrap the Speedmark in the badge interface the stage expects (hit plane, theme, dispose). */
function createSpeedmarkBadge({ theme }) {
  const mark = createSpeedmark({ theme });
  const root = new THREE.Group();
  // Optical normalisation: a wide, thin mark reads lighter than a roundel at the same span.
  mark.object.scale.multiplyScalar(SPEEDMARK_OPTICAL_SCALE);
  root.add(mark.object);
  const hitGeometry = new THREE.PlaneGeometry(1.05, 1.05);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial);
  root.add(hitTarget);
  return {
    object: root, hitTarget, setLocked() {},
    setTheme(value) { mark.setTheme?.(value); }, setColor() {},
    setPointer() {}, setHovered() {}, click() {}, update() {},
    dispose() { mark.dispose?.(); hitGeometry.dispose(); hitMaterial.dispose(); root.removeFromParent(); },
  };
}

function makeItem(index) {
  const car = CARS[index];
  const options = { manufacturer: car.id, color: carColor(car), theme: state.theme, locked: false };
  let badge;
  try {
    badge = car.id === 'mclaren' && createSpeedmark ? createSpeedmarkBadge(options) : createBadge(options);
  } catch (error) {
    console.warn('[collection] emblem unavailable, using placeholder', error?.message);
    badge = createPlaceholder(options);
  }
  // holder: position + pointer tilt; spinner: the continuous idle turn.
  const holder = new THREE.Group();
  const spinner = new THREE.Group();
  spinner.add(badge.object);
  holder.add(spinner);
  holder.visible = false;
  scene.add(holder);
  const item = { car: index, badge, holder, spinner, appear: 0, hover: 0, spin: MOTION.entryYaw,
    extKey: '', ext: UNIT, layout: null };
  items.set(index, item);
  return item;
}

function disposeItem(item) {
  gsap.killTweensOf(item);
  try { item.badge.dispose(); } catch { /* never let disposal break the Collection */ }
  item.holder.removeFromParent();
  items.delete(item.car);
}

function readField() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--landing-field').trim() || '#ffffff';
  try { targetField.setStyle(value); } catch { targetField.set(0xffffff); }
}

function applyTheme() {
  readField();
  for (const item of items.values()) {
    item.badge.setTheme(state.theme);
    item.badge.setColor(carColor(CARS[item.car]));
  }
}

/** Discovery only grows in play; a dev reset can re-lock, so drop anything no longer allowed. */
function refreshLocks() {
  for (const item of [...items.values()]) {
    if (unlocked(item.car)) continue;
    if (selected === item.car) selected = null;
    disposeItem(item);
  }
}

export function initCollection(sharedRenderer) {
  renderer = sharedRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  pmrem = new THREE.PMREMGenerator(renderer);
  envTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envTarget.texture;
  // Chrome reflects the room; on the white Day field a softer room and a firmer key keep relief readable.
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.4, 0.8, 1);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  rim.position.set(0.8, -0.2, 0.6);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));
  readField();
  fieldColor.copy(targetField);
  subscribe('theme', () => requestAnimationFrame(applyTheme));
  subscribe('unlocked', refreshLocks);
}

/** How emblems are placed: fit(ext) → { x, y, size } (screen px of the visual centre, px per unit). */
export function placeCollection({ fit } = {}) {
  if (fit) fitFn = fit;
}

const boxScratch = new THREE.Box3();
const matScratch = new THREE.Matrix4();
/**
 * The emblem's visible extents in its own units (the hit plane excluded), refreshed only when its
 * meshes change: a downloaded model replacing the procedural one re-fits that emblem.
 */
function measure(item) {
  const meshes = [];
  item.badge.object.traverse((node) => {
    if (node.isMesh && node !== item.badge.hitTarget && node.geometry) meshes.push(node);
  });
  const key = meshes.map((mesh) => mesh.uuid).join(',');
  if (key === item.extKey) return item.ext;
  item.extKey = key;
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    // Transform relative to the badge root (its own scale, e.g. opticalScale, included).
    mesh.updateMatrix();
    matScratch.copy(mesh.matrix);
    for (let node = mesh.parent; node && node !== item.badge.object.parent; node = node.parent) {
      node.updateMatrix();
      matScratch.premultiply(node.matrix);
    }
    box.union(boxScratch.copy(mesh.geometry.boundingBox).applyMatrix4(matScratch));
  }
  if (box.isEmpty()) { item.ext = UNIT; return item.ext; }
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // The root's own transform is the host's to set; measure without it.
  const root = item.badge.object;
  const s = root.scale.x || 1;
  item.ext = { w: size.x / s, h: size.y / s, cx: (centre.x - root.position.x) / s, cy: (centre.y - root.position.y) / s };
  return item.ext;
}

/** The on-stage emblem's current screen layout (for its caption): centre, size and visual bottom. */
export function emblemLayout() {
  const item = selected === null ? null : items.get(selected);
  if (!item?.layout) return null;
  const { x, y, size } = item.layout;
  return { x, y, size, bottom: y + item.ext.h * size / 2, half: Math.max(item.ext.w, item.ext.h) * size / 2 };
}

/** Show or hide the Collection stage (and the selected emblem with it). Returns a timeline. */
export function showCollection(on) {
  if (on && !active) {
    refreshLocks();
    applyTheme();
    fieldColor.copy(targetField);
    active = true;
    rendered = false;
  }
  const instant = reducedMotion.matches;
  const tl = gsap.timeline({ onComplete: () => { if (!on) { active = false; hovered = false; } } });
  const current = selected === null ? null : items.get(selected);
  if (on && current && current.hover > 1) tl.to(current, { hover: 0, duration: instant ? 0 : 0.5, ease: 'gt3.out' }, 0);
  tl.to({ v: stage }, {
    v: on ? 1 : 0, duration: instant ? 0 : on ? 0.8 : 0.28, ease: on ? 'gt3.out' : 'gt3',
    onUpdate() { stage = this.targets()[0].v; },
  }, instant ? 0 : on ? 0.2 : 0);
  return tl;
}

/**
 * Put one car's emblem on stage (or clear it with null). A locked car is refused: returns false.
 * The previous emblem sinks and turns away while the new one rises and turns into view.
 */
export function selectEmblem(index) {
  if (index !== null && !unlocked(index)) return false;
  if (index === selected) return true;
  const instant = reducedMotion.matches;
  const previous = selected === null ? null : items.get(selected);
  if (previous) {
    gsap.killTweensOf(previous);
    gsap.to(previous, { appear: 0, hover: 0, duration: instant ? 0 : 0.32, ease: 'gt3' });
  }
  selected = index;
  hovered = false;
  if (index === null) return true;
  const item = items.get(index) ?? makeItem(index);
  gsap.killTweensOf(item);
  if (item.appear < 0.05) item.spin = MOTION.entryYaw;
  gsap.to(item, { appear: 1, duration: instant ? 0 : 0.85, ease: 'gt3.out', delay: previous && !instant ? 0.14 : 0 });
  return true;
}

export function selectedEmblem() { return selected; }
export function collectionActive() { return active; }
/** True once a frame has been drawn since showing (the DOM field may give way to the canvas). */
export function collectionRendered() { return rendered; }

function screenToWorld(x, y, out) {
  return out.set(x - innerWidth / 2, innerHeight / 2 - y, 0);
}

/**
 * Pointer over the Hub (client px). Drives the emblem's tilt from anywhere on the page (as the
 * Landing car did) and reports whether the emblem itself is under the pointer.
 */
export function pointCollection(clientX, clientY) {
  if (!active) return null;
  pointer.tx = THREE.MathUtils.clamp(clientX / innerWidth * 2 - 1, -1, 1);
  pointer.ty = THREE.MathUtils.clamp(clientY / innerHeight * 2 - 1, -1, 1);
  const item = selected === null ? null : items.get(selected);
  if (!item || item.appear < 0.6 || stage < 0.6) { hovered = false; return null; }
  ndc.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  item.holder.updateMatrixWorld(true);
  const hit = raycaster.intersectObject(item.badge.hitTarget, false)[0];
  // The hit plane turns with the emblem; edge-on it is thin, so also accept a disc around the centre.
  const layout = emblemLayout();
  const near = layout ? Math.hypot(clientX - layout.x, clientY - layout.y) < layout.half * 0.85 : false;
  hovered = Boolean(hit) || near;
  return hovered ? { type: 'emblem', car: selected } : null;
}

/** The pointer left the Hub: the emblem eases back to its idle motion. */
export function clearCollectionPointer() {
  pointer.tx = 0;
  pointer.ty = 0;
  hovered = false;
}

/** Keyboard focus on the emblem's caption gives the same lift as the pointer. */
export function hoverEmblem(on) { hovered = Boolean(on) && selected !== null; }

/** Collection → Showcase: the emblem rises toward the viewer (single) or steps back (full). */
export function focusEmblem(mode) {
  const tl = gsap.timeline();
  const item = selected === null ? null : items.get(selected);
  if (!item) return tl;
  if (mode === 'single') tl.to(item, { hover: 2.4, duration: 0.55, ease: 'gt3.launch' }, 0);
  else tl.to(item, { appear: 0, duration: 0.32, ease: 'gt3' }, 0);
  return tl;
}

/** The Showcase returned to the Collection: bring the selected emblem back to rest. */
export function restoreEmblem() {
  const item = selected === null ? null : items.get(selected);
  if (!item) return;
  gsap.killTweensOf(item);
  gsap.to(item, { appear: 1, hover: 0, duration: reducedMotion.matches ? 0 : 0.6, ease: 'gt3.out' });
}

const scratch = new THREE.Vector3();
export function updateCollection(dt) {
  if (!active || !renderer) return;
  const step = Math.min(0.1, Math.max(0, dt || 0));
  elapsed += step;
  fieldColor.lerp(targetField, 1 - Math.exp(-step * 6));
  const still = reducedMotion.matches;
  const kp = 1 - Math.exp(-MOTION.pointerDamping * step);
  pointer.x += ((still ? 0 : pointer.tx) - pointer.x) * kp;
  pointer.y += ((still ? 0 : pointer.ty) - pointer.y) * kp;
  scene.environmentRotation.y = pointer.x * MOTION.pointerEnvYaw;
  const follow = 1 - Math.exp(-step * 5);
  for (const item of items.values()) {
    const isSelected = item.car === selected;
    if (item.hover <= 1) item.hover += ((isSelected && hovered ? 1 : 0) - item.hover) * (1 - Math.exp(-step * 8));
    const shown = item.appear * stage;
    item.holder.visible = shown > 0.001;
    if (!item.holder.visible) continue;
    if (!still) item.spin += THREE.MathUtils.degToRad(MOTION.idleDegPerSecond) * step;
    // Per-emblem fit: its own size and centre in the circuit's negative space, eased when the
    // fit changes (a model arriving, a relayout) so it never jumps.
    const ext = measure(item);
    const target = fitFn(ext);
    if (!item.layout || !item.holder.visible || item.appear < 0.02) item.layout = { ...target };
    else {
      item.layout.x += (target.x - item.layout.x) * follow;
      item.layout.y += (target.y - item.layout.y) * follow;
      item.layout.size += (target.size - item.layout.size) * follow;
    }
    const { size } = item.layout;
    // The fit places the visual centre; the model is offset inside the spinner so it turns about
    // its own visual centre rather than its file origin.
    item.badge.object.position.set(-ext.cx, -ext.cy, 0);
    const c = item.layout;
    const bob = still ? 0 : Math.sin(elapsed * 2 * Math.PI / MOTION.bobSeconds) * size * MOTION.bobFraction;
    // Arrival and departure: the emblem rises a little as it appears and sinks as it leaves.
    const travel = (1 - item.appear) * size * 0.12;
    screenToWorld(
      c.x + pointer.x * size * MOTION.pointerDrift,
      c.y + pointer.y * size * MOTION.pointerDrift + bob + travel,
      scratch,
    );
    item.holder.position.copy(scratch);
    const scale = size * (0.82 + 0.18 * shown) * (1 + 0.06 * item.hover) * shown;
    item.holder.scale.setScalar(Math.max(0.0001, scale));
    item.holder.rotation.set(pointer.y * MOTION.pointerPitch, pointer.x * MOTION.pointerYaw, 0);
    item.spinner.rotation.y = item.spin - (1 - item.appear) * 0.8;
    item.badge.update(step);
  }
}

export function renderCollection() {
  if (!active || !renderer) return false;
  const w = innerWidth;
  const h = innerHeight;
  if (camera.aspect !== w / h || camera.userData.h !== h) {
    camera.aspect = w / h;
    camera.userData.h = h;
    camera.position.set(0, 0, (h / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.near = camera.position.z * 0.2;
    camera.far = camera.position.z * 4;
    camera.updateProjectionMatrix();
  }
  scene.background = fieldColor;
  const exposure = renderer.toneMappingExposure;
  const target = renderer.getRenderTarget();
  try {
    renderer.toneMappingExposure = state.theme === 'night' ? 1.05 : 1;
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    rendered = true;
  } finally {
    renderer.toneMappingExposure = exposure;
    renderer.setRenderTarget(target);
  }
  return true;
}

/** Diagnostics for review/harness (never exposes a locked car: only on-stage, unlocked entries). */
export function collectionState() {
  return { active, stage, selected, emblems: [...items.keys()] };
}
