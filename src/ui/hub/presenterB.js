/** Dimensional Circuit. Shared renderer; all motion is ticked by main.js's one RAF. */
import * as THREE from 'three';
import { renderer as sharedRenderer, render as renderTour } from '../../scene/sceneSetup.js';
import { cloneCarModel, carsReady } from '../../scene/cars.js';
import { state, set } from '../../core/state.js';
import { CARS } from '../../data/cars.js';
import { gsap, reducedMotion } from '../motion.js';
import { buildCircuitGeometry, routePosition } from './circuitGeometry.js';
import { restPose as fitPose, poseAt, project, orientation } from './circuitCamera.js';
import { infieldPoint } from './composition.js';
import { createRibbon, createContactShadow, createPin, resourceSizes, disposeCarClone } from './dimensional/ribbon.js';
import '../../styles/hub-b.css';

const NS = 'http://www.w3.org/2000/svg';
const color = value => new THREE.Color(value);
const duration = value => reducedMotion.matches ? 0 : value;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const node = (tag, className, parent, text) => {
  const n = document.createElement(tag); n.className = className;
  if (text !== undefined) n.textContent = text;
  parent?.append(n); return n;
};
const palette = {
  top: [color('#f4f2ee'), color('#13264a')], bevel: [color('#ffffff'), color('#d8b94f')],
  side: [color('#c9c3b9'), color('#0a1730')], field: [color('#ffffff'), color('#0c1930')],
  pin: [color('#3f68a6'), color('#e2c25a')], key: [color('#fff5e6'), color('#b9cce9')],
};

export function createPresenter() {
  const road = buildCircuitGeometry(), framing = [...road.left, ...road.right];
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), model = new THREE.Group(); scene.add(model);
  const ribbon = createRibbon(road), shadow = createContactShadow(road), pin = createPin(); model.add(ribbon.group, shadow.mesh, pin);
  pin.scale.setScalar(2.6);
  const key = new THREE.DirectionalLight('#fff5e6', 2.6), fill = new THREE.HemisphereLight('#e4ebf3', '#8c8b87', 1.8); scene.add(key, key.target, fill);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 6, 0.85),
    new THREE.MeshStandardMaterial({ color: '#d1d3d6', roughness: 0.4, metalness: 0.3 }), 18);
  posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); posts.frustumCulled = false; posts.visible = false; model.add(posts);
  const cover = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), new THREE.MeshStandardMaterial({ color: '#cbcdd0', roughness: 0.7 }));
  cover.scale.set(10, 4.6, 22); cover.visible = false; model.add(cover);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), new THREE.MeshStandardMaterial({ color: '#dceaff', emissive: '#9fb7d9', emissiveIntensity: 0.45, roughness: 0.08, metalness: 0.65 }));
  glint.visible = false; model.add(glint);
  const gridPoints = []; for (const cross of [road.start, road.grid]) gridPoints.push(...cross[0], ...cross[1]);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)),
    new THREE.LineBasicMaterial({ color: '#2a2e33', transparent: true, opacity: 0.55 })); grid.position.y = 0.08; model.add(grid);
  // Only the descent composites the shared Tour under the yielding ribbon.
  const worldVeil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { field: { value: color('#ffffff') }, opacity: { value: 1 } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.999,1.0);}',
    fragmentShader: 'uniform vec3 field; uniform float opacity; void main(){gl_FragColor=vec4(field,opacity);\n#include <colorspace_fragment>\n}',
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  worldVeil.frustumCulled = false; worldVeil.renderOrder = -10; worldVeil.visible = false; scene.add(worldVeil);
  let root, ctx, viewport, rest, carsRest, current, uiState = 'race', moving = false, disposed = false;
  let dirty = true, readiness = 0, progress = 0, hovered = null, selected = null, discovered = new Set();
  let overlay, markerHook, leader, veil, labels = [], detail, detailName, detailLine, detailLink, previewStatus;
  let shellMounted = false, ownTheme, ownShowcase, consoleStrip, shellReveal, themeControls = [], startChars = [];
  let sharedTheme, themeParent, themeNext;
  let car = null, carIndex = null, rosterReady = false, rosterFailed = false, carPending = null;
  let stateTween, themeTween, revealTween, edgeTween, hoverTween, lapTime = 0, hover = false, showcaseTween;
  const motion = { cars: 0, listen: 0, reveal: 0, theme: state.theme === 'night' ? 1 : 0,
    gate: 0, gateLift: 0, parallaxX: 0, parallaxY: 0, surface: 1, world: 0 };
  const pointer = { x: 0, y: 0 }, matrixHelper = new THREE.Object3D();
  const markerSnapshot = { progress: 0, x: 0, y: 0, angle: 0 }, checkpointsScreen = [];
  const drawStats = { frames: 0, drawsLastFrame: 0, renderedFramesLastSecond: 0, totalMs: 0, maxMs: 0, lastMs: 0, resources: null, preview: null };
  const frameTimes = []; let lastDraw = null, materialSignature, poseSignature, gateSignature, anchorSignature, anchoredPose;
  const invalidate = () => { dirty = true; };
  const tween = (target, vars) => gsap.to(target, { ...vars, onUpdate: () => { vars.onUpdate?.(); invalidate(); } });

  function showDeferral() {
    const status = root.querySelector('[data-showcase-status]'); if (!status) return;
    status.textContent = 'Showcase opens in the next build.'; status.hidden = false;
    showcaseTween?.kill(); showcaseTween = gsap.delayedCall(2.4, () => { status.hidden = true; });
  }
  function syncThemeControls() {
    for (const button of themeControls) {
      const active = button.dataset.value === state.theme; button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1;
    }
  }
  function restoreSharedTheme() {
    if (sharedTheme && themeParent && sharedTheme.parentElement === consoleStrip) themeParent.insertBefore(sharedTheme, themeNext?.parentElement === themeParent ? themeNext : null);
  }
  function hostSharedTheme() {
    if (!consoleStrip || moving || state.experience !== 'hub') return;
    const native = document.querySelector('.theme-segmented');
    if (!native || native.parentElement === consoleStrip) return;
    sharedTheme = native; themeParent = native.parentElement; themeNext = native.nextSibling;
    ownTheme?.remove(); ownTheme = null; consoleStrip.append(native);
    native.dataset.control = 'theme'; themeControls = [...native.querySelectorAll('[role="radio"]')]; syncThemeControls();
  }
  // The core appends its common chrome after build(). Mount/move those exact elements once.
  function mountShell() {
    if (shellMounted || !root.querySelector('.hub-player-slot')) return;
    shellMounted = true; consoleStrip = node('div', 'hub-b-console', root); consoleStrip.append(root.querySelector('.hub-player-slot'));
    let theme = root.querySelector('[data-control="theme"]');
    if (!theme) {
      ownTheme = theme = node('div', 'hub-b-theme', consoleStrip); theme.dataset.control = 'theme';
      theme.setAttribute('role', 'radiogroup'); theme.setAttribute('aria-label', 'Theme');
      for (const [value, glyph, label] of [['day', '☀', 'Day'], ['night', '☾', 'Night']]) {
        const button = node('button', 'hub-b-theme__option', theme, glyph); button.type = 'button'; button.dataset.value = value;
        button.setAttribute('role', 'radio'); button.setAttribute('aria-label', label); button.addEventListener('click', () => set('theme', value));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'day' : event.key === 'End' ? 'night' : state.theme === 'day' ? 'night' : 'day';
          set('theme', next); themeControls.find(b => b.dataset.value === next)?.focus();
        });
      }
    } else consoleStrip.append(theme);
    themeControls = [...theme.querySelectorAll('[role="radio"]')]; syncThemeControls();
    if (!root.querySelector('[data-control="showcase"]')) {
      ownShowcase = node('button', 'hub-b-showcase', root, 'Showcase'); ownShowcase.type = 'button';
      ownShowcase.dataset.control = 'showcase'; ownShowcase.addEventListener('click', showDeferral);
    }
    if (!root.querySelector('[data-showcase-status]')) {
      const status = node('p', 'hub-b-showcase-status', root); status.dataset.showcaseStatus = ''; status.setAttribute('role', 'status'); status.hidden = true;
    }
    const mark = root.querySelector('.hub-mark');
    if (mark) {
      mark.classList.add('hub-b-index-active'); mark.setAttribute('role', 'button'); mark.tabIndex = 0; mark.setAttribute('aria-label', 'GT3, Race');
      const returnRace = () => {
        if (uiState === 'cars') root.querySelector('[data-control="cars"], .hub-cars__toggle')?.click();
        else if (uiState === 'listening') ctx.emit?.('close-listening');
      };
      mark.addEventListener('click', returnRace);
      mark.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); returnRace(); } });
    }
    const carsToggle = root.querySelector('.hub-cars__toggle');
    if (carsToggle) { carsToggle.dataset.control = 'cars'; carsToggle.setAttribute('aria-pressed', String(uiState === 'cars')); }
    ctx.startButton.dataset.control = 'start';
    const word = ctx.startButton.querySelector('.hub-start__word');
    if (word) {
      word.replaceChildren(); startChars = [...'START RACE'].map(letter => node('span', 'hub-b-letter', word, letter === ' ' ? '\u00a0' : letter)); word.setAttribute('aria-hidden', 'true');
    }
    root.dataset.hubState = uiState; hostSharedTheme();
    gsap.set([consoleStrip, ownShowcase].filter(Boolean), { autoAlpha: readiness > 0 ? 1 : 0, y: readiness > 0 ? 0 : 10 });
    drawStats.resources = resourceSizes(scene);
  }

  function updateMaterials() {
    const signature = [motion.theme, motion.reveal, motion.surface, motion.world, motion.listen, moving].join('|');
    if (signature === materialSignature) return;
    materialSignature = signature;
    const t = motion.theme, reveal = motion.reveal, mix = (out, values) => out.copy(values[0]).lerp(values[1], t);
    const azimuth = THREE.MathUtils.degToRad(-35 + 138 * t), elevation = THREE.MathUtils.degToRad(55 - 27 * t);
    const shadowDirection = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    mix(ribbon.materials[0].color, palette.top); mix(ribbon.materials[1].color, palette.bevel); mix(ribbon.materials[2].color, palette.side);
    ribbon.materials[0].roughness = 0.76 - t * 0.38; ribbon.materials[1].emissive.set('#d8b94f'); ribbon.materials[1].emissiveIntensity = t * 0.1;
    mix(pin.material.color, palette.pin); pin.material.emissive.set('#e2c25a'); pin.material.emissiveIntensity = t * 0.14;
    pin.material.opacity = motion.surface;
    ribbon.edges.material.color.copy(color('#2a2e33')).lerp(color('#a4b2ca'), t); ribbon.edges.material.opacity = (0.5 - t * 0.28) * reveal * motion.surface;
    const opacity = reveal * motion.surface; for (const m of ribbon.materials) m.opacity = opacity;
    shadow.mesh.material.opacity = (0.2 + t * 0.15) * opacity;
    shadow.mesh.position.copy(shadow.origin).addScaledVector(shadowDirection, 6 + t * 12);
    mix(key.color, palette.key); key.intensity = (2.6 - t * 0.5) * reveal; fill.intensity = (1.8 - t * 1.05) * reveal;
    key.target.position.fromArray(rest?.target ?? [0, 0, 0]);
    key.position.copy(key.target.position).add(new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(1800));
    model.position.y = -8 * (1 - reveal);
    worldVeil.visible = moving && motion.world > 0 && motion.world < 1;
    worldVeil.material.uniforms.field.value.copy(palette.field[0]).lerp(palette.field[1], t);
    worldVeil.material.uniforms.opacity.value = 1 - motion.world;
    const screenShadow = shadowDirection.applyQuaternion(new THREE.Quaternion().fromArray(current?.quaternion ?? rest.quaternion).invert());
    root.style.setProperty('--hub-light-x', `${(screenShadow.x * 4).toFixed(2)}px`); root.style.setProperty('--hub-light-y', `${(-screenShadow.y * 4).toFixed(2)}px`);
    veil.style.opacity = String(motion.listen * 0.4);
  }
  function makePose() {
    if (!rest || moving) return;
    const signature = [motion.parallaxX, motion.parallaxY, motion.cars, motion.listen].join('|');
    if (signature === poseSignature) return;
    poseSignature = signature;
    const quaternion = orientation((ctx.camera?.yawDeg ?? 75) + motion.parallaxX, (ctx.camera?.pitchDeg ?? 52) + motion.cars * 6 + motion.parallaxY);
    const to = carsRest ?? rest, m = motion.cars, mix = (a, b) => a + (b - a) * m;
    const distance = mix(rest.distance, to.distance) * (1 + motion.listen * 0.28);
    const target = rest.target.map((v, i) => mix(v, to.target[i]));
    const shift = [mix(rest.shift?.[0] ?? 0, to.shift?.[0] ?? 0), mix(rest.shift?.[1] ?? 0, to.shift?.[1] ?? 0)];
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(quaternion));
    current = { ...rest, quaternion, distance, target, shift, position: new THREE.Vector3().fromArray(target).addScaledVector(back, distance).toArray() };
  }
  function applyCamera() {
    if (!current) return;
    camera.position.fromArray(current.position); camera.quaternion.fromArray(current.quaternion);
    for (const name of ['fov', 'aspect', 'near', 'far', 'zoom', 'filmGauge', 'filmOffset']) camera[name] = current[name] ?? ({ zoom: 1, filmGauge: 35, filmOffset: 0 }[name] ?? camera[name]);
    camera.view = current.view ? { ...current.view } : null; camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] -= current.shift?.[0] ?? 0; camera.projectionMatrix.elements[9] -= current.shift?.[1] ?? 0; camera.updateMatrixWorld();
  }
  function layout() {
    if (!root || disposed) return;
    mountShell(); viewport = { width: window.innerWidth, height: window.innerHeight }; overlay.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    rest = fitPose({ points: framing, slot: { left: viewport.width * 0.16, top: viewport.height * 0.39, width: viewport.width * 0.68, height: viewport.height * 0.48 }, viewport, variant: 'b', ...ctx.camera });
    // The pure fit's .1 m near plane is for projection math. At this long lens it
    // cannot resolve a .25 m bevel in a normal depth buffer. Tighten only depth range.
    rest.near = Math.max(0.5, rest.distance * 0.1);
    // Cars is framed deliberately (not just "25% closer" around the rest lens shift, which ran the
    // ribbon under the console): a larger slot that ends above the console, pitched 6 degrees higher.
    carsRest = fitPose({ points: framing, slot: { left: viewport.width * 0.07, top: viewport.height * 0.17, width: viewport.width * 0.86, height: viewport.height * 0.6 },
      viewport, variant: 'b', ...ctx.camera, pitchDeg: (ctx.camera?.pitchDeg ?? 52) + 6 });
    poseSignature = materialSignature = undefined;
    makePose(); invalidate(); placeStart();
  }
  // START RACE floats in the maquette's infield, optically above its centre, measured from the
  // rest pose. GSAP owns the wrapper's transform (reveal/state tweens), so centre with
  // xPercent/yPercent rather than a CSS transform.
  function placeStart() {
    const at = pts => project(pts, rest, viewport);
    const wrap = ctx.startButton.parentElement;
    const clear = infieldPoint(at(road.centre), [...at(road.left), ...at(road.right)],
      { box: { width: wrap.offsetWidth + 40, height: wrap.offsetHeight + 24 }, lift: 0.08 });
    if (clear) gsap.set(wrap, { left: Math.round(clear.x), top: Math.round(clear.y), bottom: 'auto', xPercent: -50, yPercent: -50 });
  }
  function anchorDOM() {
    const signature = [progress, uiState, hovered, selected, motion.gateLift, motion.reveal, hover].join('|');
    if (anchoredPose === current && anchorSignature === signature) return;
    anchorSignature = signature; anchoredPose = current;
    const at = routePosition(progress), raised = p => [p[0], p[1] + model.position.y + 1.2, p[2]];
    const projected = project([raised(at.position), raised(at.ahead), ...road.checkpoints.map(c => raised(c.position))], current, viewport), [p, ahead] = projected;
    markerHook.style.display = p ? '' : 'none';
    if (p) {
      markerHook.style.left = `${p.x}px`; markerHook.style.top = `${p.y}px`; markerHook.dataset.progress = String(progress);
      Object.assign(markerSnapshot, { progress, x: p.x, y: p.y, angle: ahead ? Math.atan2(ahead.y - p.y, ahead.x - p.x) : 0 });
      if (hover) { const b = ctx.startButton.getBoundingClientRect(), x = b.left + b.width * 0.65, y = b.bottom + 12; leader.setAttribute('d', `M${x} ${y}L${x} ${p.y - 18}L${p.x} ${p.y}`); }
    }
    checkpointsScreen.length = 0;
    labels.forEach((label, i) => {
      const p = projected[i + 2]; label.hidden = uiState !== 'cars' || !p; if (!p) return;
      const lift = hovered === i + 1 || selected === i + 1 ? 2 * motion.gateLift : 0;
      label.style.left = `${p.x}px`; label.style.top = `${p.y - 15 - lift}px`; checkpointsScreen.push({ car: i + 1, x: p.x, y: p.y });
    });
    const active = hovered ?? selected, anchor = active !== null ? projected[active + 1] : null; detail.hidden = uiState !== 'cars' || !anchor;
    if (anchor) { detail.style.left = `${clamp(anchor.x + 24, 170, viewport.width - 250)}px`; detail.style.top = `${clamp(anchor.y - 48, 130, viewport.height - 220)}px`; }
    Object.assign(ctx.debug, { markerScreen: { x: markerSnapshot.x, y: markerSnapshot.y }, checkpointsScreen,
      drawsLastFrame: drawStats.drawsLastFrame, renderedFramesLastSecond: drawStats.renderedFramesLastSecond });
  }
  function updateGates() {
    const signature = [motion.gate, motion.gateLift, current?.distance, state.theme, hovered, selected, readiness].join('|');
    if (signature === gateSignature) return;
    gateSignature = signature;
    const scale = motion.gate, worldPerPixel = current ? 2 * current.distance * Math.tan(THREE.MathUtils.degToRad(current.fov / 2)) / viewport.height : 1;
    posts.visible = scale > 0.001 && readiness > 0;
    road.checkpoints.forEach((checkpoint, i) => {
      for (let side = 0; side < 2; side++) {
        const p = new THREE.Vector3().fromArray(checkpoint.position).lerp(new THREE.Vector3().fromArray(checkpoint.tick[side]), 0.53), active = hovered === i + 1 || selected === i + 1;
        matrixHelper.position.copy(p); matrixHelper.position.y += 3 * scale + (active ? 2 * worldPerPixel * motion.gateLift : 0);
        matrixHelper.scale.set(1, Math.max(0.001, scale), 1); matrixHelper.updateMatrix(); posts.setMatrixAt(i * 2 + side, matrixHelper.matrix);
        posts.setColorAt(i * 2 + side, color(active ? (state.theme === 'night' ? '#e2c25a' : '#ffffff') : (state.theme === 'night' ? '#77849b' : '#b0b6bd')));
      }
    }); posts.instanceMatrix.needsUpdate = true; if (posts.instanceColor) posts.instanceColor.needsUpdate = true;
    if (drawStats.resources) drawStats.resources.instanceBytes = posts.instanceMatrix.array.byteLength + (posts.instanceColor?.array.byteLength ?? 0);
  }
  function clearCar() { if (car) disposeCarClone(car); car = null; carIndex = null; carPending = null; cover.visible = false; drawStats.preview = null; }
  function refreshPreview() {
    const index = uiState === 'cars' ? hovered ?? selected : null, found = index !== null && discovered.has(index), checkpoint = road.checkpoints[index - 1];
    if (index === null || !checkpoint) { clearCar(); invalidate(); return; }
    detailName.textContent = found ? CARS[index].displayName : 'Not yet discovered'; detailLine.textContent = found && selected === index ? CARS[index].model : ''; detailLink.hidden = !found || selected !== index;
    if (index === carIndex || index === carPending) return;
    clearCar();
    if (!found) { cover.position.fromArray(checkpoint.position); cover.position.y += 0.15; cover.visible = true; previewStatus.textContent = '?'; invalidate(); return; }
    if (!rosterReady) { carPending = index; previewStatus.textContent = rosterFailed ? 'Scale model unavailable' : 'Preparing scale model'; invalidate(); return; }
    try {
      car = cloneCarModel(index); const materials = new Set(); let oversized = false;
      car.traverse(o => {
        if (!o.isMesh) return; o.castShadow = o.receiveShadow = false;
        for (const m of [].concat(o.material)) {
          materials.add(m);
          for (const [name, texture] of Object.entries(m)) if (texture?.isTexture && name !== 'envMap' && Math.max(texture.image?.width ?? 0, texture.image?.height ?? 0) > 512) {
            // Full-resolution review maps are omitted on clone-owned materials, without a fetch or GPU allocation.
            m[name] = null; oversized = true;
          }
          m.needsUpdate = true;
        }
      });
      const group = new THREE.Group(); group.add(car); model.add(group); car = group;
      car.position.fromArray(checkpoint.position); car.position.y += 0.2; car.scale.setScalar(10.5); carIndex = index; previewStatus.textContent = '';
      drawStats.preview = { ...resourceSizes(car), cloneMaterials: materials.size, oversizedMapsOmitted: oversized };
    } catch {
      if (car) disposeCarClone(car); car = null;
      cover.position.fromArray(checkpoint.position); cover.position.y += 0.15; cover.visible = true; carPending = index; previewStatus.textContent = 'Scale model unavailable';
    } invalidate();
  }

  function transition(seam, reverse) {
    edgeTween?.kill(); stateTween?.kill(); presenter.hoverStart(false); moving = false; layout(); clearCar(); motion.gate = 0; posts.visible = false;
    restoreSharedTheme();
    const live = seam.pose?.(); if (!live || !rest) return gsap.timeline().to(ctx.field, { opacity: reverse ? 1 : 0, duration: duration(0.4) });
    const origin = reverse ? rest : structuredClone(current); moving = true; progress = seam.progress ?? progress;
    const proxy = { z: reverse ? 1 : 0 }, seconds = duration(reverse ? 1.6 : 2);
    const apply = () => {
      current = poseAt(proxy.z, origin, live);
      // A linear near-plane interpolation would overtake the logarithmic dolly.
      // Endpoints stay byte-for-byte equal to the captured live/rest snapshots.
      if (proxy.z > 0 && proxy.z < 1) current.near = Math.min(current.near, Math.max(live.near, current.distance * 0.1));
      motion.world = reducedMotion.matches ? (reverse ? 0 : 1) : clamp((proxy.z - 0.58) / 0.34, 0, 1);
      root.dataset.canvasOwner = motion.world >= 0.999 ? 'tour' : 'hub';
      motion.surface = 1 - motion.world; ctx.setPoseOverride?.(() => current); ctx.field.style.opacity = String(1 - motion.world); invalidate();
    };
    const cleanup = () => { ctx.setPoseOverride?.(null); moving = false; };
    edgeTween = gsap.timeline({ onComplete: () => {
      if (!reverse) {
        proxy.z = 1; apply();
        // Harness evidence only (projects ~9k points): dev builds alone pay for it.
        if (import.meta.env.DEV) ctx.debug.lastDive = { pose: structuredClone(current), progress, viewport: { ...viewport }, left: project(road.left, current, viewport), right: project(road.right, current, viewport) };
      }
      cleanup(); if (reverse) { current = rest; motion.surface = 1; motion.world = 0; root.dataset.canvasOwner = 'hub'; ctx.field.style.opacity = '1'; invalidate(); }
    }, onInterrupt: cleanup });
    apply(); edgeTween.to(proxy, { z: reverse ? 0 : 1, duration: seconds, ease: reverse ? 'gt3.out' : 'gt3.launch', onUpdate: apply }, 0);
    edgeTween.to(startChars, { yPercent: reverse ? 0 : -112, z: reverse ? 0 : 12, opacity: reverse ? 1 : 0, duration: duration(0.34), stagger: duration(0.018) }, 0);
    if (consoleStrip) edgeTween.to(consoleStrip, { y: reverse ? 0 : 16, opacity: reverse ? 1 : 0, duration: duration(0.28) }, 0);
    return edgeTween;
  }
  function onPointer(event) {
    if (moving || reducedMotion.matches || uiState === 'listening') return;
    pointer.x = clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1) * 1.5; pointer.y = clamp(event.clientY / window.innerHeight * 2 - 1, -1, 1) * 1.5;
  }
  function onPointerLeave() { pointer.x = pointer.y = 0; }

  const presenter = {
    build(container, context) {
      root = container; ctx = context; ctx.debug ??= {}; root.dataset.canvasField = 'true'; root.dataset.canvasOwner = 'hub'; root.dataset.hubState = 'race';
      for (const material of [...ribbon.materials, pin.material]) material.transparent = true;
      veil = node('div', 'hub-b-veil', root); veil.setAttribute('aria-hidden', 'true');
      overlay = document.createElementNS(NS, 'svg'); overlay.setAttribute('class', 'hub-b-overlay'); overlay.setAttribute('aria-hidden', 'true'); root.append(overlay);
      leader = document.createElementNS(NS, 'path'); leader.setAttribute('class', 'hub-b-leader'); overlay.append(leader);
      markerHook = node('span', 'hub-b-marker', root); markerHook.dataset.hubMarker = ''; markerHook.setAttribute('aria-hidden', 'true');
      labels = road.checkpoints.map(checkpoint => {
        const button = node('button', 'hub-b-checkpoint', root, String(checkpoint.carIndex).padStart(2, '0')); button.type = 'button'; button.dataset.checkpoint = String(checkpoint.carIndex); button.hidden = true;
        button.addEventListener('pointerenter', () => ctx.hoverCheckpoint(checkpoint.carIndex));
        button.addEventListener('pointerleave', event => { if (!detail.contains(event.relatedTarget)) ctx.hoverCheckpoint(null); });
        button.addEventListener('focus', () => ctx.hoverCheckpoint(checkpoint.carIndex));
        button.addEventListener('blur', event => { if (!detail.contains(event.relatedTarget)) ctx.hoverCheckpoint(null); });
        button.addEventListener('click', () => ctx.selectCheckpoint(checkpoint.carIndex)); ctx.registerCheckpoint(checkpoint.carIndex, button); return button;
      });
      detail = node('div', 'hub-b-detail', root); detail.hidden = true;
      detailName = node('div', 'hub-b-detail__name', detail); detailLine = node('div', 'hub-b-detail__model', detail); previewStatus = node('div', 'hub-b-detail__status', detail);
      detailLink = node('button', 'hub-b-detail__link', detail, 'View in Showcase'); detailLink.type = 'button'; detailLink.hidden = true;
      detailLink.addEventListener('click', showDeferral); detail.addEventListener('pointerleave', () => ctx.hoverCheckpoint(null));
      root.addEventListener('pointermove', onPointer, { passive: true }); root.addEventListener('pointerleave', onPointerLeave);
      ctx.debug.drawStats = drawStats;
      ctx.presenterDebug = () => ({ markerScreen: { x: markerSnapshot.x, y: markerSnapshot.y }, checkpointsScreen,
        drawsLastFrame: drawStats.drawsLastFrame, renderedFramesLastSecond: drawStats.renderedFramesLastSecond });
      layout(); void carsReady.then(() => { if (!disposed) { rosterReady = true; carPending = null; refreshPreview(); } })
        .catch(() => { if (!disposed) { rosterFailed = true; carPending = null; refreshPreview(); } });
    },
    layout,
    setReadiness(value) {
      // Main freezes interactivity before it captures the live Tour endpoint. The
      // maquette must remain present during those two preparation paints.
      if (value === 0 && state.transition) return;
      const next = clamp(value, 0, 1), arrival = readiness === 0 && next > 0; readiness = next;
      const rings = Math.floor(road.segments * readiness);
      for (const group of ribbon.geometry.groups) group.count = rings * 6 * (group.materialIndex === 0 ? 1 : 2);
      ribbon.edges.geometry.setDrawRange(0, rings * 4);
      if (arrival || next === 0) { revealTween?.kill(); revealTween = tween(motion, { reveal: next > 0 ? 1 : 0, duration: duration(next > 0 ? 0.68 : 0.16), ease: 'gt3.out' }); }
      if (arrival || next === 0) {
        shellReveal?.kill(); shellReveal = gsap.to([consoleStrip, ownShowcase].filter(Boolean), { autoAlpha: next > 0 ? 1 : 0, y: next > 0 ? 0 : 10,
          duration: duration(next > 0 ? 0.62 : 0.16), ease: 'gt3.out' });
      }
      pin.visible = readiness > 0; grid.visible = readiness > 0; invalidate();
    },
    setState(next) {
      uiState = next; root.dataset.hubState = next; mountShell(); root.querySelector('.hub-mark')?.classList.toggle('hub-b-index-active', next === 'race');
      // Listening is modal and the full player card covers the sheet; take START RACE out of the
      // render and the tab order (A already does this through its setState).
      ctx.startButton.parentElement.hidden = next === 'listening';
      root.querySelector('.hub-cars__toggle')?.setAttribute('aria-pressed', String(next === 'cars')); labels.forEach(button => { button.tabIndex = next === 'cars' ? 0 : -1; });
      if (next !== 'cars') { hovered = null; clearCar(); }
      presenter.hoverStart(false); hoverTween?.kill(); stateTween?.kill(); stateTween = gsap.timeline({ onUpdate: invalidate });
      stateTween.to(motion, { cars: next === 'cars' ? 1 : 0, listen: next === 'listening' ? 1 : 0, gate: next === 'cars' ? 1 : 0,
        duration: duration(next === 'cars' ? 0.68 : next === 'listening' ? 0.6 : 0.44), ease: 'gt3.out' }, 0);
      stateTween.to(startChars, { y: next === 'race' ? 0 : -34, z: next === 'race' ? 0 : 16, opacity: next === 'race' ? 1 : 0,
        duration: duration(next === 'race' ? 0.44 : 0.3), stagger: duration(0.012) }, 0);
      refreshPreview(); invalidate(); return stateTween;
    },
    hoverStart(on) {
      hover = on && readiness >= 1 && uiState === 'race' && !moving; hoverTween?.kill();
      hoverTween = gsap.timeline().to(startChars, { y: hover ? -5 : 0, z: hover ? 10 : 0, duration: duration(hover ? 0.14 : 0.22), ease: 'gt3.out', stagger: duration(hover ? 0.012 : 0.008) });
      gsap.to(leader, { opacity: hover ? 1 : 0, duration: duration(hover ? 0.22 : 0.2) });
      if (hover) gsap.fromTo(leader, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: duration(0.22) });
      glint.visible = hover && !reducedMotion.matches; invalidate();
    },
    setDiscovery(set) {
      discovered = set; labels.forEach((button, i) => {
        const found = discovered.has(i + 1); button.dataset.found = String(found); button.textContent = found ? String(i + 1).padStart(2, '0') : '?';
        button.setAttribute('aria-label', found ? CARS[i + 1].displayName : 'Not yet discovered');
      }); carIndex = null; carPending = null; refreshPreview(); invalidate();
    },
    setRoutePosition(value) {
      if (!Number.isFinite(value)) return;
      progress = clamp(value, 0, 1); const at = routePosition(progress); pin.position.fromArray(at.position); pin.position.y += 1.2; pin.rotation.y = -at.heading; invalidate();
    },
    hoverCheckpoint(index) {
      hovered = index; labels.forEach((button, i) => button.classList.toggle('is-hovered', index === i + 1));
      gsap.killTweensOf(motion, 'gateLift'); tween(motion, { gateLift: index !== null ? 1 : 0, duration: duration(index !== null ? 0.14 : 0.22) }); refreshPreview(); invalidate();
    },
    selectCheckpoint(index) {
      selected = index; labels.forEach((button, i) => { button.classList.toggle('is-selected', index === i + 1); button.setAttribute('aria-pressed', String(index === i + 1)); }); refreshPreview(); invalidate();
    },
    setTheme() {
      root.dataset.theme = state.theme; syncThemeControls(); themeTween?.kill(); themeTween = gsap.timeline({ onUpdate: invalidate });
      themeTween.to(motion, { theme: state.theme === 'night' ? 1 : 0, duration: duration(0.6), ease: 'gt3.out' }, 0);
      const night = state.theme === 'night';
      themeTween.to(root, { '--hub-field': night ? '#0c1930' : '#ffffff', '--hub-ink': night ? '#edf0ea' : '#111416', '--hub-accent': night ? '#d8b94f' : '#597eb3',
        '--hub-ground': night ? '#091327' : '#f2f3f5', duration: duration(0.6), ease: 'gt3.out' }, 0);
      const theme = sharedTheme?.parentElement === consoleStrip ? sharedTheme : ownTheme;
      if (theme) themeTween.to(theme, { scale: 0.96, duration: duration(0.08) }, 0).to(theme, { scale: 1, duration: duration(0.22), ease: 'gt3.out' }, 0.08); invalidate();
    },
    restPose() { return rest; }, launch(seam) { return transition(seam, false); }, returnTo(seam) { return transition(seam, true); },
    reset() {
      edgeTween?.kill(); moving = false; motion.surface = 1; motion.world = 0; root.dataset.canvasOwner = 'hub'; ctx.setPoseOverride?.(null); ctx.field.style.opacity = '1';
      if (consoleStrip) gsap.set(consoleStrip, { y: 0, opacity: 1 }); layout();
    },
    update(dt) {
      mountShell(); hostSharedTheme();
      if (!moving && !reducedMotion.matches) {
        // Pointer parallax is a follow, not an animation: reach the target in a few frames so
        // the scene is genuinely idle (and draws nothing) about a tenth of a second after the
        // pointer stops. A long exponential tail kept re-rendering the whole maquette.
        const factor = 1 - Math.exp(-Math.min(dt, 0.05) * 26);
        for (const [axis, target] of [['parallaxX', pointer.x], ['parallaxY', pointer.y]]) {
          const delta = target - motion[axis]; if (delta !== 0) { motion[axis] = Math.abs(delta) < 0.02 ? target : motion[axis] + delta * factor; invalidate(); }
        }
      }
      if (car && uiState === 'cars' && !reducedMotion.matches) { car.rotation.y += THREE.MathUtils.degToRad(12) * Math.min(dt, 0.1); invalidate(); }
      if (glint.visible) {
        lapTime = (lapTime + dt / 3.2) % 1; const i = Math.floor(lapTime * road.segments), a = road.left[i], b = road.left[i + 1];
        glint.position.fromArray(a).lerp(new THREE.Vector3().fromArray(b), lapTime * road.segments - i); glint.position.y += 0.1;
        glint.scale.set(0.32, 0.18, 7); glint.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]); invalidate();
      }
      const now = performance.now(); while (frameTimes.length && frameTimes[0] < now - 1000) frameTimes.shift();
      drawStats.renderedFramesLastSecond = frameTimes.length; drawStats.drawsLastFrame = 0;
      ctx.debug.drawsLastFrame = 0; ctx.debug.renderedFramesLastSecond = frameTimes.length;
      if (dirty) makePose();
    },
    render(force = false) {
      if (force) invalidate(); // A warm-up draw overwrote the retained canvas.
      const renderer = ctx?.renderer ?? sharedRenderer;
      if (!dirty || !renderer || !current || disposed || motion.world >= 0.999) return false;
      const began = performance.now();
      const previous = { color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), exposure: renderer.toneMappingExposure,
        target: renderer.getRenderTarget(), autoClear: renderer.autoClear, viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        face: renderer.getActiveCubeFace?.() ?? 0, mip: renderer.getActiveMipmapLevel?.() ?? 0, infoAutoReset: renderer.info.autoReset,
        scissorTest: renderer.getScissorTest(), ratio: renderer.getPixelRatio(), transform: renderer.domElement.style.transform, clip: renderer.domElement.style.clipPath };
      try {
        renderer.info.autoReset = false; renderer.info.reset();
        if (moving && motion.world > 0) {
          (ctx.renderWorld ?? renderTour)();
        }
        if (previous.ratio > 2) renderer.setPixelRatio(2);
        renderer.domElement.style.transform = ''; renderer.domElement.style.clipPath = ''; renderer.setRenderTarget(null); renderer.setViewport(0, 0, viewport.width, viewport.height); renderer.setScissorTest(false);
        renderer.toneMappingExposure = 1; renderer.autoClear = !(moving && motion.world > 0);
        if (!renderer.autoClear) renderer.clearDepth();
        renderer.setClearColor(palette.field[0].clone().lerp(palette.field[1], motion.theme), 1);
        updateMaterials(); updateGates(); applyCamera(); anchorDOM(); renderer.render(scene, camera);
        drawStats.drawsLastFrame = renderer.info.render.calls; drawStats.frames++; frameTimes.push(performance.now()); drawStats.renderedFramesLastSecond = frameTimes.length;
        drawStats.lastMs = performance.now() - began; drawStats.totalMs += drawStats.lastMs; drawStats.maxMs = Math.max(drawStats.maxMs, drawStats.lastMs);
        Object.assign(ctx.debug, { drawsLastFrame: drawStats.drawsLastFrame, renderedFramesLastSecond: drawStats.renderedFramesLastSecond });
        lastDraw = { pose: current, viewport: { ...viewport } }; dirty = false; return true;
      } finally {
        renderer.setClearColor(previous.color, previous.alpha); renderer.toneMappingExposure = previous.exposure; renderer.autoClear = previous.autoClear;
        renderer.setRenderTarget(previous.target, previous.face, previous.mip); renderer.info.autoReset = previous.infoAutoReset;
        if (previous.ratio > 2) renderer.setPixelRatio(previous.ratio);
        renderer.setViewport(previous.viewport); renderer.setScissor(previous.scissor); renderer.setScissorTest(previous.scissorTest);
        renderer.domElement.style.transform = previous.transform; renderer.domElement.style.clipPath = previous.clip;
      }
    },
    dispose() {
      disposed = true; restoreSharedTheme(); for (const tl of [stateTween, themeTween, revealTween, edgeTween, hoverTween, showcaseTween, shellReveal]) tl?.kill();
      gsap.killTweensOf([motion, root, leader, ...startChars]); ctx.setPoseOverride?.(null); root.removeEventListener('pointermove', onPointer); root.removeEventListener('pointerleave', onPointerLeave); clearCar();
      const geometries = new Set(), materials = new Set();
      scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of o.material ? [].concat(o.material) : []) materials.add(m); });
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); shadow.texture.dispose(); posts.dispose();
      for (const el of [overlay, markerHook, veil, detail, ...labels, ownTheme, ownShowcase]) el?.remove(); scene.clear(); delete root.dataset.canvasField; delete root.dataset.canvasOwner;
    },
    debug: { marker: markerSnapshot, drawStats, checkpointsScreen, get markerScreen() { return { x: markerSnapshot.x, y: markerSnapshot.y }; },
      get drawsLastFrame() { return drawStats.drawsLastFrame; }, get renderedFramesLastSecond() { return drawStats.renderedFramesLastSecond; },
      get pose() { return current; }, get lastDraw() { return lastDraw; }, get transitionActive() { return moving; }, get worldWeight() { return motion.world; } },
  };
  return presenter;
}
