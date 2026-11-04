/** Shared SVG implementation for the minimal A/B presenters. No independent frame loop. */
import { gsap, reducedMotion } from '../motion.js';
import { CARS } from '../../data/cars.js';
import { buildCircuitGeometry, routePosition } from './circuitGeometry.js';
import { restPose, poseAt, project } from './circuitCamera.js';

const NS = 'http://www.w3.org/2000/svg';
const path = points => {
  let d = '', pen = false;
  for (const p of points) {
    if (!p) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`; pen = true;
  }
  return d;
};
function node(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  parent?.append(el);
  return el;
}
export function createLinePresenter(variant) {
  const geometry = buildCircuitGeometry();
  // Include both complete edges so framing never misses an outer extreme.
  const framing = [...geometry.left, ...geometry.right];
  let root, ctx, svg, edgeL, edgeR, lap, marker, leader, start, grid, labels = [], ticks = [];
  let rest, current, viewport, progress = 0, readiness = 0, cars = false, hover = false;
  let moving = false, lapTween, leaderTween, launchTween, discovered = new Set();
  let lastDraw = null;
  const drawStats = { frames: 0, totalMs: 0, maxMs: 0 };
  const markerSnapshot = { progress: 0, x: 0, y: 0, angle: 0 };

  function draw(pose = current) {
    if (!pose) return;
    const began = performance.now();
    const left = project(geometry.left, pose, viewport), right = project(geometry.right, pose, viewport);
    edgeL.setAttribute('d', path(left)); edgeR.setAttribute('d', path(right));
    // Centre trace is only needed at rest, where the lap light is allowed to run.
    if (!moving) lap.setAttribute('d', path(project(geometry.centre, pose, viewport)));
    const cross = points => path(project(points, pose, viewport));
    start.setAttribute('d', cross(geometry.start));
    grid.setAttribute('d', cross(geometry.grid));
    ticks.forEach((el, i) => el.setAttribute('d', cross(geometry.checkpoints[i].tick)));
    const at = routePosition(progress), [p, ahead] = project([at.position, at.ahead], pose, viewport);
    marker.style.display = p && ahead ? '' : 'none';
    if (p && ahead) {
      const angle = Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180 / Math.PI + 90;
      marker.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle}) scale(1.5)`);
      Object.assign(markerSnapshot, { progress, x: p.x, y: p.y, angle });
      if (hover) {
        const r = ctx.startButton.getBoundingClientRect();
        leader.setAttribute('d', `M${r.right + 12} ${r.top + 8}L${r.right + 12} ${p.y + 24}L${p.x} ${p.y}`);
      }
    }
    const positions = project([geometry.gridPosition.position, ...geometry.checkpoints.map(c => c.position)], pose, viewport);
    labels.forEach((el, i) => {
      const p = positions[i]; el.style.display = p ? '' : 'none';
      if (p) { el.setAttribute('x', p.x + 16); el.setAttribute('y', p.y - 10); }
    });
    if (import.meta.env.DEV) lastDraw = { pose, left, right };
    const ms = performance.now() - began;
    drawStats.frames++; drawStats.totalMs += ms; drawStats.maxMs = Math.max(drawStats.maxMs, ms);
  }
  function layout() {
    viewport = { width: window.innerWidth, height: window.innerHeight };
    svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    const box = ctx.frame.getBoundingClientRect();
    if (!box.width || !box.height) return;
    rest = restPose({ points: framing, slot: box, viewport, variant, ...ctx.camera });
    if (!moving) { current = rest; draw(); }
  }
  function stopHover() {
    hover = false; lapTween?.kill(); lapTween = null; leaderTween?.kill();
    gsap.set([lap, leader], { opacity: 0 });
  }
  function transition(seam, reverse) {
    launchTween?.kill(); stopHover();
    moving = false; layout();
    const live = seam.pose?.();
    if (!rest || !live) return gsap.timeline().to(ctx.field, { opacity: reverse ? 1 : 0, duration: 0.5 });
    moving = true;
    progress = seam.progress ?? progress;
    const world = ctx.worldDive;
    const proxy = { z: reverse ? 1 : 0 };
    const duration = reducedMotion.matches ? 0.01 : reverse ? 1.35 : 1.55;
    let tl;
    const apply = () => {
      current = poseAt(proxy.z, rest, live); draw();
      // Measurement option: the final 40% of dive TIME is rendered in-world.
      // Keep the override installed (returning null under the opaque field), so it never
      // snaps the base rail or resets its damping on a threshold crossing.
      ctx.setPoseOverride?.(world ? () => {
        const elapsed = tl?.time() ?? 0;
        return (reverse ? elapsed <= duration * 0.4 : elapsed >= duration * 0.6) ? current : null;
      } : null);
    };
    const cleanup = () => { ctx.setPoseOverride?.(null); moving = false; };
    tl = launchTween = gsap.timeline({ onComplete: () => {
      cleanup();
      if (reverse) { current = rest; draw(); }
    }, onInterrupt: cleanup });
    gsap.set(svg, { opacity: reverse ? 0 : 1 });
    gsap.set(ctx.field, { opacity: reverse ? 0 : 1 });
    apply();
    const endDive = () => {
      proxy.z = 1; apply();
      if (import.meta.env.DEV) ctx.debug.lastDive = { ...lastDraw, progress, viewport: { ...viewport } };
    };
    if (reverse) {
      tl.to(svg, { opacity: 1, duration: 0.2 }, 0);
      // Default: first cover the live scene at its exact pose; then rise to the plan.
      if (!world) tl.to(ctx.field, { opacity: 1, duration: 0.45 }, 0.12);
      tl.to(proxy, { z: 0, duration, ease: 'gt3.launch', onUpdate: apply }, world ? 0 : 0.5);
      if (world) tl.to(ctx.field, { opacity: 1, duration: duration * 0.4 }, 0);
    } else {
      tl.to(proxy, { z: 1, duration, ease: 'gt3.launch', onUpdate: apply, onComplete: endDive }, 0);
      // In the default dive the field only starts dissolving AFTER exact road alignment.
      tl.to(ctx.field, { opacity: 0, duration: 0.5, ease: 'gt3' }, world ? duration * 0.6 : duration);
      tl.to(svg, { opacity: 0, duration: 0.4, ease: 'gt3' }, duration + 0.12);
    }
    return tl;
  }
  const presenter = {
    build(container, context) {
      root = container; ctx = context;
      svg = node('svg', { class: 'hub-plan', role: 'group', 'aria-label': 'Grand Tour circuit' }, root);
      edgeL = node('path', { class: 'hub-plan__edge', 'aria-hidden': 'true' }, svg);
      edgeR = node('path', { class: 'hub-plan__edge', 'aria-hidden': 'true' }, svg);
      lap = node('path', { class: 'hub-plan__lap', 'aria-hidden': 'true' }, svg);
      ticks = geometry.checkpoints.map(() => node('path', { class: 'hub-plan__tick', 'aria-hidden': 'true' }, svg));
      // Checkered start line stays in road space and therefore shares the perspective dive.
      start = node('path', { class: 'hub-plan__checker', 'aria-hidden': 'true' }, svg);
      grid = node('path', { class: 'hub-plan__grid', 'aria-hidden': 'true' }, svg);
      marker = node('path', { class: 'hub-plan__marker', d: 'M0 -4.6L3.1 3.6L0 1.7L-3.1 3.6Z', 'aria-hidden': 'true' }, svg);
      leader = node('path', { class: 'hub-plan__leader', 'aria-hidden': 'true' }, svg);
      labels = CARS.map((_, i) => {
        const el = node('text', { class: 'hub-plan__car', role: 'button', tabindex: '-1' }, svg);
        el.addEventListener('pointerenter', () => ctx.hoverCheckpoint(i));
        el.addEventListener('pointerleave', () => ctx.hoverCheckpoint(null));
        el.addEventListener('focus', () => ctx.hoverCheckpoint(i));
        el.addEventListener('blur', () => ctx.hoverCheckpoint(null));
        el.addEventListener('click', () => ctx.selectCheckpoint(i));
        ctx.registerCheckpoint(i, el);
        return el;
      });
      layout();
      gsap.set(lap, { drawSVG: '0% 0%' });
    },
    layout,
    setReadiness(p) {
      readiness = p;
      // pathLength avoids measuring SVG geometry again during the per-frame dive.
      for (const edge of [edgeL, edgeR]) {
        edge.setAttribute('pathLength', '1'); edge.style.strokeDasharray = '1'; edge.style.strokeDashoffset = String(1 - p);
      }
      ticks.forEach((el, i) => el.classList.toggle('is-drawn', p >= geometry.checkpoints[i].t));
    },
    setState(next) {
      cars = next === 'cars';
      gsap.killTweensOf(labels);
      labels.forEach(el => { el.setAttribute('tabindex', cars ? '0' : '-1'); el.style.pointerEvents = cars ? 'auto' : 'none'; });
      return gsap.timeline().to(labels, { opacity: cars ? 1 : 0, duration: reducedMotion.matches ? 0 : cars ? 0.35 : 0.15 });
    },
    hoverStart(on) {
      stopHover(); hover = on;
      if (!on || readiness < 1 || moving || reducedMotion.matches) return;
      draw();
      gsap.set(leader, { opacity: 1 });
      leaderTween = gsap.fromTo(leader, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.4, ease: 'gt3.out' });
      gsap.set(lap, { opacity: 1 });
      lapTween = gsap.fromTo(lap, { drawSVG: '0% 5%' }, { drawSVG: '95% 100%', duration: 2.8, ease: 'none', repeat: -1 });
    },
    setDiscovery(set) {
      discovered = set;
      labels.forEach((el, i) => {
        const car = CARS[i], found = discovered.has(i);
        el.textContent = found ? `${car.manufacturer} ${car.model}` : '?';
        el.setAttribute('aria-label', found ? `${el.textContent}, Showcase coming later` : 'Undiscovered car, Showcase coming later');
        el.classList.toggle('is-found', found);
      });
      ticks.forEach((el, i) => el.classList.toggle('is-found', discovered.has(i + 1)));
    },
    setRoutePosition(p) { if (progress !== p) { progress = p; if (!moving) draw(); } },
    hoverCheckpoint(i) { labels.forEach((el, j) => el.classList.toggle('is-hovered', i === j)); },
    selectCheckpoint(i) { labels.forEach((el, j) => el.classList.toggle('is-selected', i === j)); },
    setTheme(theme) { root.dataset.theme = theme; },
    restPose() { return rest; },
    launch(seam) { return transition(seam, false); },
    returnTo(seam) { return transition(seam, true); },
    reset() {
      launchTween?.kill(); moving = false; stopHover(); ctx.setPoseOverride?.(null);
      gsap.set([svg, ctx.field], { opacity: 1 }); layout();
    },
    update() {},
    // No renderer work for either SVG placeholder. A future B can supply render() and set
    // root.dataset.canvasField='true', which makes the field transparent while Hub owns it.
    dispose() { launchTween?.kill(); stopHover(); ctx.setPoseOverride?.(null); svg.remove(); },
    debug: { marker: markerSnapshot, drawStats, get pose() { return current; }, get lastDraw() { return lastDraw; } },
  };
  return presenter;
}
