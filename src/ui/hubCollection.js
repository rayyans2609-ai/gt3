/**
 * hubCollection.js — the Hub's Collection view in WebGL (owner brief 2026-11-26 §5).
 *
 * Floating 3D manufacturer emblems at their checkpoints on the enlarged circuit plan, and a
 * floating checkered flag in the circuit's middle for the Full Showcase. Drawn on the one shared
 * renderer (SPEC §27) into the main canvas while the Hub field covers the Landing: the canvas
 * clears to the field colour and the Hub's SVG/DOM sit on top, so the plan lines, names and
 * controls stay crisp DOM. The camera maps the z = 0 plane 1:1 to CSS pixels, so emblems are
 * placed straight from the plan's screen-space anchors every frame (they follow any relayout).
 *
 * Emblems come from the showcase-badges components (worker branch showcase-badges); a
 * manufacturer without a component yet gets a neutral placeholder with the same interface.
 * A locked car is always the identical neutral disc and reports no identity.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CARS } from '../data/cars.js';
import { state, subscribe } from '../core/state.js';
import { gsap, reducedMotion } from './motion.js';
import { createBadge } from '../showcase-badges/badge.js';
import { createShowcaseFlag } from '../showcase-badges/flag.js';

const FOV = 24;
let renderer = null;
let scene;
let camera;
let envTarget = null;
let pmrem = null;
let items = [];
let flag = null;
let flagWrap;
let active = false;
let rendered = false;
let anchorsFn = () => [];
let centreFn = () => ({ x: innerWidth / 2, y: innerHeight / 2 });
let sizes = { badge: 64, flag: 150, offset: 54 };
let hovered = null;
let elapsed = 0;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const fieldColor = new THREE.Color();
const targetField = new THREE.Color();

/** Placeholder until a real component exists: a brushed disc with a raised ring. */
function createPlaceholder({ color, theme, locked }) {
  const root = new THREE.Group();
  const motion = new THREE.Group();
  root.add(motion);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd6dde2, metalness: 0.9, roughness: 0.3 });
  const enamel = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.45 });
  const lockMaterial = new THREE.MeshStandardMaterial({ color: 0x899096, metalness: 0.65, roughness: 0.4 });
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 64); disc.rotateX(Math.PI / 2);
  const ring = new THREE.TorusGeometry(0.42, 0.035, 12, 64);
  const face = new THREE.CircleGeometry(0.36, 64);
  const lockGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.025, 32); lockGeometry.rotateX(Math.PI / 2);
  const discMesh = new THREE.Mesh(disc, metal);
  const ringMesh = new THREE.Mesh(ring, metal); ringMesh.position.z = 0.03;
  const faceMesh = new THREE.Mesh(face, enamel); faceMesh.position.z = 0.027;
  const art = new THREE.Group(); art.add(discMesh, ringMesh, faceMesh);
  const lockMesh = new THREE.Mesh(lockGeometry, lockMaterial);
  motion.add(art, lockMesh);
  const hitGeometry = new THREE.PlaneGeometry(1.05, 1.05);
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  const hitTarget = new THREE.Mesh(hitGeometry, hitMaterial);
  root.add(hitTarget);
  const setLocked = (value) => { art.visible = !value; lockMesh.visible = !!value; };
  setLocked(locked);
  return {
    object: root, hitTarget, setLocked,
    setTheme() {}, setColor(value) { enamel.color.set(value); },
    setPointer() {}, setHovered() {}, click() {},
    update() {},
    dispose() {
      [disc, ring, face, lockGeometry, hitGeometry].forEach((g) => g.dispose());
      [metal, enamel, lockMaterial, hitMaterial].forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}

function carColor(car) {
  return state.theme === 'night' && car.identityColorNight ? car.identityColorNight : car.identityColor;
}

function makeEmblem(index) {
  const car = CARS[index];
  const locked = !state.unlocked.has(index);
  const options = { manufacturer: car.id, color: carColor(car), theme: state.theme, locked };
  let badge;
  let placeholder = false;
  try { badge = createBadge(options); } catch { badge = createPlaceholder(options); placeholder = true; }
  const holder = new THREE.Group();
  holder.add(badge.object);
  scene.add(holder);
  return { car: index, badge, holder, locked, placeholder, appear: 0, hover: 0, resist: 0, phase: index * 0.83, x: 0, y: 0 };
}

function buildItems() {
  disposeItems();
  items = CARS.map((_, index) => makeEmblem(index));
  flag = createShowcaseFlag({ color: state.theme === 'night' ? 0xd8b94f : 0x597eb3, theme: state.theme });
  flagWrap = new THREE.Group();
  flagWrap.add(flag.object);
  scene.add(flagWrap);
  flag.appear = 0;
  flag.hover = 0;
}

function disposeItems() {
  for (const item of items) { item.badge.dispose(); item.holder.removeFromParent(); }
  items = [];
  if (flag) { flag.dispose(); flagWrap.removeFromParent(); flag = null; }
}

function refreshLocks() {
  for (const item of items) {
    const locked = !state.unlocked.has(item.car);
    if (locked === item.locked) continue;
    item.locked = locked;
    item.badge.setLocked(locked);
  }
}

function readField() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--landing-field').trim() || '#ffffff';
  try { targetField.setStyle(value); } catch { targetField.set(0xffffff); }
}

function applyTheme() {
  readField();
  for (const item of items) {
    item.badge.setTheme(state.theme);
    item.badge.setColor(carColor(CARS[item.car]));
  }
  flag?.setTheme(state.theme);
  flag?.setColor(state.theme === 'night' ? 0xd8b94f : 0x597eb3);
}

export function initCollection(sharedRenderer) {
  renderer = sharedRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  pmrem = new THREE.PMREMGenerator(renderer);
  envTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envTarget.texture;
  // Chrome reflects the room; on the white Day field a softer room and a firmer key keep its relief readable.
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

/** Where things go: plan anchors (screen px), the circuit centre, and sizes in px. */
export function placeCollection({ anchors, centre, badge, flagSize, offset }) {
  if (anchors) anchorsFn = anchors;
  if (centre) centreFn = centre;
  if (badge) sizes.badge = badge;
  if (flagSize) sizes.flag = flagSize;
  if (offset !== undefined) sizes.offset = offset;
}

/** Show the emblems and flag (staggered along the route) or send them away. Returns a timeline. */
export function showCollection(on) {
  if (on && !active) {
    if (!items.length) buildItems();
    refreshLocks();
    applyTheme();
    fieldColor.copy(targetField);
    active = true;
    rendered = false;
  }
  const tl = gsap.timeline({ onComplete: () => { if (!on) { active = false; setHovered(null); } } });
  const instant = reducedMotion.matches;
  items.forEach((item, i) => {
    if (on && item.hover > 1) tl.to(item, { hover: 0, duration: instant ? 0 : 0.5, ease: 'gt3.out' }, 0);
    tl.to(item, { appear: on ? 1 : 0, duration: instant ? 0 : on ? 0.7 : 0.28, ease: on ? 'gt3.out' : 'gt3' }, instant ? 0 : on ? 0.06 * i : 0.02 * (items.length - i));
  });
  if (flag && on && flag.hover > 1) tl.to(flag, { hover: 0, duration: instant ? 0 : 0.5, ease: 'gt3.out' }, 0);
  if (flag) tl.to(flag, { appear: on ? 1 : 0, duration: instant ? 0 : on ? 0.9 : 0.3, ease: on ? 'gt3.out' : 'gt3' }, instant ? 0 : on ? 0.25 : 0);
  return tl;
}

export function collectionActive() { return active; }
/** True once a frame has been drawn since showing (the DOM field may give way to the canvas). */
export function collectionRendered() { return rendered; }

function screenToWorld(x, y, out) {
  return out.set(x - innerWidth / 2, innerHeight / 2 - y, 0);
}

function setHovered(next) {
  if (hovered === next) return;
  if (hovered && hovered !== 'full') hovered.badge.setHovered(false);
  hovered = next;
  if (hovered && hovered !== 'full') hovered.badge.setHovered(true);
}

/** Pointer over the canvas (client px). Returns what is under it, without revealing locked identity. */
export function pointCollection(clientX, clientY) {
  if (!active) return null;
  ndc.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = items.filter((item) => item.appear > 0.6).map((item) => item.badge.hitTarget);
  const hit = raycaster.intersectObjects(targets, false)[0];
  for (const item of items) {
    const dx = (clientX - item.x) / 260;
    const dy = (clientY - item.y) / 260;
    item.badge.setPointer(THREE.MathUtils.clamp(dx, -1, 1), THREE.MathUtils.clamp(dy, -1, 1));
  }
  if (hit) {
    const item = items.find((entry) => entry.badge.hitTarget === hit.object);
    setHovered(item);
    return { type: 'car', car: item.car, locked: item.locked, x: item.x, y: item.y, size: sizes.badge };
  }
  if (flag && flag.appear > 0.6) {
    const c = centreFn();
    const r = sizes.flag * 0.55;
    if (Math.abs(clientX - c.x) < r && Math.abs(clientY - c.y) < r * 0.75) {
      setHovered('full');
      return { type: 'full', x: c.x, y: c.y, size: sizes.flag };
    }
  }
  setHovered(null);
  return null;
}

export function clearCollectionPointer() { setHovered(null); }

/** A locked emblem refuses with a short damped shake. */
export function resistEmblem(car) {
  const item = items.find((entry) => entry.car === car);
  if (!item || reducedMotion.matches) return;
  gsap.fromTo(item, { resist: 1 }, { resist: 0, duration: 0.6, ease: 'power2.out' });
}

/** The chosen emblem rises toward the viewer as the Showcase takes over (others recede). */
export function focusEmblem(car) {
  const tl = gsap.timeline();
  items.forEach((item) => {
    if (item.car === car) tl.to(item, { hover: 2.4, duration: 0.55, ease: 'gt3.launch' }, 0);
    else tl.to(item, { appear: 0, duration: 0.3, ease: 'gt3' }, 0);
  });
  if (flag) tl.to(flag, { appear: car === 'full' ? 1 : 0, hover: car === 'full' ? 1.6 : 0, duration: 0.5, ease: 'gt3.launch' }, 0);
  return tl;
}

const scratch = new THREE.Vector3();
export function updateCollection(dt) {
  if (!active || !renderer) return;
  const step = Math.min(0.1, Math.max(0, dt || 0));
  elapsed += step;
  fieldColor.lerp(targetField, 1 - Math.exp(-step * 6));
  const anchors = anchorsFn(sizes.offset);
  const still = reducedMotion.matches;
  for (const item of items) {
    const anchor = anchors.find((a) => a.car === item.car);
    if (!anchor) continue;
    item.x = anchor.x; item.y = anchor.y;
    const hoverTarget = hovered === item ? 1 : 0;
    if (item.hover <= 1) item.hover += (hoverTarget - item.hover) * (1 - Math.exp(-step * 9));
    const bob = still ? 0 : Math.sin(elapsed * 0.9 + item.phase) * 3;
    screenToWorld(anchor.x, anchor.y + bob, scratch);
    item.holder.position.copy(scratch);
    const s = sizes.badge * (0.55 + 0.45 * item.appear) * (1 + 0.16 * item.hover) * item.appear;
    item.holder.scale.setScalar(Math.max(0.0001, s));
    // Slow, gentle turn (McLaren-presentation spirit); a hovered emblem squares up to the viewer.
    const sway = still ? 0 : Math.sin(elapsed * 0.45 + item.phase) * 0.42;
    item.holder.rotation.y = sway * (1 - Math.min(1, item.hover)) + (1 - item.appear) * 1.2;
    item.holder.rotation.z = item.resist * Math.sin(elapsed * 46) * 0.12;
    item.holder.visible = item.appear > 0.001;
    item.badge.update(step);
  }
  if (flag) {
    const c = centreFn();
    flag.setHovered(hovered === 'full');
    if (flag.hover <= 1) flag.hover += ((hovered === 'full' ? 1 : 0) - flag.hover) * (1 - Math.exp(-step * 8));
    screenToWorld(c.x, c.y - sizes.flag * 0.08 + (still ? 0 : Math.sin(elapsed * 0.7) * 4), scratch);
    flagWrap.position.copy(scratch);
    flagWrap.scale.setScalar(Math.max(0.0001, sizes.flag * flag.appear * (1 + 0.08 * flag.hover)));
    flagWrap.rotation.y = (still ? 0 : Math.sin(elapsed * 0.35) * 0.3) + (1 - flag.appear) * 1.4;
    flagWrap.visible = flag.appear > 0.001;
    flag.update(step);
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
