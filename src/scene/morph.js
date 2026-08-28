/**
 * morph.js — the car transformation. (SPEC §9)
 *
 * OWNED BY THE MANAGER (cross-fade timing).
 *
 * The rule the whole effect is built around: the rig's position, orientation and forward
 * speed never change during a morph. The car stays anchored and keeps driving. Only the
 * BODY is swapped, under a mask.
 *
 * The mask is three overlapping things, none of which is enough on its own:
 *   - an opacity cross-fade between the outgoing and incoming model,
 *   - an emissive energy pulse that peaks exactly at the 50% crossover, which is the
 *     moment the cross-fade looks worst and therefore the moment to overwhelm the eye,
 *   - a short outward particle burst that starts a beat BEFORE the swap, so the eye is
 *     already tracking scattering pixels when the bodies trade places.
 *
 * Timing (total 0.85s, inside the spec's 0.6-1.0s window):
 *   0.00 - 0.18  charge:   old car's emissive rises, particles spawn and push out
 *   0.18 - 0.62  cross:    opacity trades over, emissive peaks at 0.40 then falls
 *   0.62 - 0.85  settle:   new car's emissive drains to zero, particles fade out
 *
 * Everything is driven off a single normalised clock so the phases cannot drift apart.
 */

import * as THREE from 'three';
import { state, set } from '../core/state.js';
import { carMount, setCarModel, setWheels } from './carRig.js';
import { getCarModel, findWheels } from './cars.js';
import { CARS } from '../data/cars.js';

const DURATION = 0.85;
const PHASE = { chargeEnd: 0.18 / DURATION, crossEnd: 0.62 / DURATION };
const PEAK_AT = 0.40 / DURATION;   // where the emissive pulse crests
const PARTICLE_COUNT = 140;

let active = false;
let clock = 0;
let outgoing = null;
let incoming = null;
let outgoingMats = [];
let incomingMats = [];
let particles = null;
let particleVel = null;
let particleLife = 0;
let completeHandlers = [];
let pendingIndex = -1;

const _color = new THREE.Color();

// ---------------------------------------------------------------------------
// Material handling
// ---------------------------------------------------------------------------
// Fading a GLTF car means touching every material it owns. cars.js already clones
// materials per car, so mutating them here cannot leak into another car — but the
// ORIGINAL values still have to be restored, or a car that has been morphed twice
// slowly drifts brighter each time.

function collectMaterials(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      out.push({
        mat: m,
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
        emissive: m.emissive ? m.emissive.clone() : null,
        emissiveIntensity: m.emissiveIntensity ?? 1,
      });
    }
  });
  return out;
}

function restore(entries) {
  for (const e of entries) {
    e.mat.opacity = e.opacity;
    e.mat.transparent = e.transparent;
    e.mat.depthWrite = e.depthWrite;
    if (e.emissive && e.mat.emissive) e.mat.emissive.copy(e.emissive);
    if (e.mat.emissiveIntensity !== undefined) e.mat.emissiveIntensity = e.emissiveIntensity;
    e.mat.needsUpdate = true;
  }
}

function applyFade(entries, opacity, glow, glowColor) {
  for (const e of entries) {
    e.mat.transparent = true;
    e.mat.opacity = opacity;
    // Writing depth while translucent makes the far side of the body punch holes in
    // the near side during the cross-fade. Disable it only while actually fading.
    e.mat.depthWrite = opacity > 0.985;
    if (e.mat.emissive) {
      e.mat.emissive.copy(e.emissive ?? _color.setRGB(0, 0, 0)).lerp(glowColor, glow);
      e.mat.emissiveIntensity = (e.emissiveIntensity ?? 1) + glow * 2.4;
    }
  }
}

// ---------------------------------------------------------------------------
// Particles — blocky, axis-aligned points, matching the coin's pixel language
// ---------------------------------------------------------------------------

function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const col = new Float32Array(PARTICLE_COUNT * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.13,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'morph-particles';
  return points;
}

function seedParticles(brandColor) {
  const pos = particles.geometry.attributes.position.array;
  const col = particles.geometry.attributes.color.array;
  const gold = _color.set(0xc6a96b);
  const brand = new THREE.Color(brandColor);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    // Spawn inside the car's volume rather than on a sphere, so the burst reads as the
    // body itself coming apart instead of an explosion happening near it.
    pos[i3 + 0] = (Math.random() - 0.5) * 2.0;
    pos[i3 + 1] = 0.25 + Math.random() * 1.15;
    pos[i3 + 2] = (Math.random() - 0.5) * 4.4;

    const c = Math.random() < 0.55 ? gold : brand;
    col[i3 + 0] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b;

    const i3v = i * 3;
    particleVel[i3v + 0] = pos[i3 + 0] * 1.5 + (Math.random() - 0.5) * 1.1;
    particleVel[i3v + 1] = 0.7 + Math.random() * 1.9;
    particleVel[i3v + 2] = pos[i3 + 2] * 0.5 + (Math.random() - 0.5) * 1.1;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initMorph() {
  particles = buildParticles();
  particleVel = new Float32Array(PARTICLE_COUNT * 3);
  carMount.add(particles);
}

export function isMorphing() {
  return active;
}

/** Register a callback fired when a morph completes, with the new car index. */
export function onMorphComplete(fn) {
  completeHandlers.push(fn);
}

/**
 * Morph the player's car into car `index`.
 * Safe to call while a morph is running — the running one is completed instantly first,
 * so a fast scroller collecting two coins in quick succession cannot strand a half-faded
 * body on the track.
 */
export function morphTo(index) {
  if (index === state.activeCarIndex && !active) return;
  if (active) finish();

  const next = getCarModel(index);
  if (!next) {
    console.warn(`[morph] no model for index ${index}`);
    return;
  }

  outgoing = carMount.children.find((c) => c !== particles) || null;
  incoming = next;
  pendingIndex = index;

  outgoingMats = outgoing ? collectMaterials(outgoing) : [];
  incomingMats = collectMaterials(incoming);

  // The incoming car is added immediately at zero opacity. Adding it later would cost a
  // shader compile mid-morph and produce a visible hitch exactly at the crossover.
  applyFade(incomingMats, 0, 0, _color.set(0x000000));
  carMount.add(incoming);

  seedParticles(CARS[index]?.brandColor ?? '#c6a96b');
  particleLife = 0;
  clock = 0;
  active = true;
}

function finish() {
  if (outgoing) {
    restore(outgoingMats);
    carMount.remove(outgoing);
  }
  restore(incomingMats);
  setCarModel(incoming);
  carMount.add(particles);
  setWheels(findWheels(incoming));

  particles.material.opacity = 0;
  active = false;
  outgoing = null;
  outgoingMats = [];
  incomingMats = [];

  if (pendingIndex >= 0) {
    set('activeCarIndex', pendingIndex);
    for (const fn of completeHandlers) fn(pendingIndex);
    pendingIndex = -1;
  }
}

// Smoothstep, so the cross-fade eases in and out instead of ramping linearly through
// the ugly 50/50 point.
function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function updateMorph(dt) {
  if (!active) return;

  clock += dt / DURATION;
  const t = Math.min(1, clock);

  // Emissive pulse: rises to the crossover, falls after it. Remap t so that PEAK_AT
  // lands at 0.5, then take a half-sine — a soft crest rather than a spike, which reads
  // as energy building rather than a camera flash.
  const pulseT = t <= PEAK_AT
    ? (t / PEAK_AT) * 0.5
    : 0.5 + ((t - PEAK_AT) / (1 - PEAK_AT)) * 0.5;
  const glow = Math.sin(Math.PI * pulseT);

  const brand = _color.set(CARS[pendingIndex]?.brandColor ?? '#c6a96b');
  const glowColor = brand.clone().lerp(new THREE.Color(0xffe9c0), 0.55);

  // Cross-fade only across the middle phase; the charge and settle phases hold at the
  // ends so the swap itself is buried in the busiest part of the effect.
  const crossT = smooth((t - PHASE.chargeEnd) / (PHASE.crossEnd - PHASE.chargeEnd));

  if (outgoingMats.length) applyFade(outgoingMats, 1 - crossT, glow, glowColor);
  applyFade(incomingMats, crossT, glow, glowColor);

  // Particles: push out with a little gravity, fade over the whole morph.
  particleLife += dt;
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    particleVel[i3 + 1] -= 3.1 * dt;
    pos[i3 + 0] += particleVel[i3 + 0] * dt;
    pos[i3 + 1] += particleVel[i3 + 1] * dt;
    pos[i3 + 2] += particleVel[i3 + 2] * dt;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.material.opacity = Math.sin(Math.PI * t) * 0.85;

  if (t >= 1) finish();
}
