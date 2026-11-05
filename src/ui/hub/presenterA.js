/**
 * Precision Plan — a deliberately flat architectural drawing of the live circuit.
 * This presenter owns only the A drawing and its DOM; hubCore owns navigation/state.
 */
import '../../styles/hub-a.css';
import { createElement, Moon, Sun } from 'lucide';
import { gsap, reducedMotion } from '../motion.js';
import { CARS } from '../../data/cars.js';
import { state, set } from '../../core/state.js';
import { buildCircuitGeometry, routePosition } from './circuitGeometry.js';
import { poseAt, project, restPose } from './circuitCamera.js';
import { infieldPoint } from './composition.js';

// motion.js owns the GSAP instance/ticker. Named eases live on that instance so
// the presenter never creates a second animation clock.
gsap.registerEase('gt3.precision', gsap.parseEase('power3.out'));
gsap.registerEase('gt3.settle', gsap.parseEase('back.out(0.35)'));

const NS = 'http://www.w3.org/2000/svg';
const MARKER = 'M0 -5.3L3.5 4L0 1.9L-3.5 4Z';
const make = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  parent?.append(node);
  return node;
};
const html = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svgPath = points => {
  let pen = false;
  return points.reduce((d, point) => {
    if (!point) { pen = false; return d; }
    const command = pen ? 'L' : 'M'; pen = true;
    return `${d}${command}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, '');
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Returns the most generous point inside the projected ring, biased gently upward. */
export function createPresenter() {
  const geometry = buildCircuitGeometry();
  const framing = [...geometry.left, ...geometry.right];
  let root, ctx, svg, edgeLeft, edgeRight, centreLine, checker, grid, marker, startLeader, sweep;
  let checkpointGroup, checkpointTicks = [], checkpointNums = [], checkpointButtons = [], checkpointCallouts = [], calloutSignatures = [];
  let rest, current, viewport, progress = 0, readiness = 0, stateName = 'race', hoverStart = false;
  let found = new Set(), hovered = null, selected = null, moving = false, revealDone = false;
  let hoverTimeline, lapTimeline, edgeTimeline, titleBlock, showcaseStatus, linework;
  const drawStats = { frames: 0, totalMs: 0, maxMs: 0 };
  const markerSnapshot = { progress: 0, x: 0, y: 0, angle: 0 };

  function projected(points) { return project(points, current, viewport); }

  // START RACE lives in the infield's negative space at the resting composition only, so it is
  // measured from the rest pose (never per dive frame). GSAP owns the wrapper's transform
  // (reveal tweens its y), so centring uses xPercent/yPercent instead of an inline transform.
  function placeStart() {
    if (!rest || stateName !== 'race') return;
    const at = pts => project(pts, rest, viewport);
    const wrap = ctx.startButton.parentElement;
    const clear = infieldPoint(at(geometry.centre), [...at(geometry.left), ...at(geometry.right)],
      { box: { width: wrap.offsetWidth + 32, height: wrap.offsetHeight + 16 }, lift: .05 });
    if (!clear) return;
    gsap.set(wrap, { left: Math.round(clear.x), top: Math.round(clear.y), bottom: 'auto',
      right: 'auto', xPercent: -50, yPercent: -50 });
  }

  function calloutPoint(anchor) {
    const flip = anchor.x > viewport.width * .62 ? -1 : 1;
    const x1 = anchor.x + flip * 38;
    const y1 = anchor.y - 28;
    const x2 = x1 + flip * 58;
    return { x1, y1, x2, y2: y1, endX: x2, endY: y1 - 10, flip };
  }

  function draw() {
    if (!current || !viewport) return;
    const began = performance.now();
    const left = projected(geometry.left), right = projected(geometry.right);
    edgeLeft.setAttribute('d', svgPath(left)); edgeRight.setAttribute('d', svgPath(right));
    // Keep the frame the SVG was just drawn from (same index order as the geometry; the path
    // itself rounds to 2 decimals). The launch harness reads it through __gt3.hub.lastDive,
    // exactly as Hub B publishes its last dive.
    linework = { pose: current, progress, left, right };
    centreLine.setAttribute('d', svgPath(projected(geometry.centre)));
    checker.setAttribute('d', svgPath(projected(geometry.start)));
    grid.setAttribute('d', svgPath(projected(geometry.grid)));

    const at = routePosition(progress);
    const [position, ahead] = projected([at.position, at.ahead]);
    if (position && ahead) {
      const angle = Math.atan2(ahead.y - position.y, ahead.x - position.x) * 180 / Math.PI + 90;
      marker.setAttribute('transform', `translate(${position.x} ${position.y}) rotate(${angle})`);
      marker.dataset.progress = String(progress);
      Object.assign(markerSnapshot, { progress, x: position.x, y: position.y, angle });
      if (hoverStart) {
        const startBox = ctx.startButton.getBoundingClientRect();
        const rootBox = root.getBoundingClientRect();
        const sx = startBox.right - rootBox.left + 12, sy = startBox.top - rootBox.top + 8;
        startLeader.setAttribute('d', `M${sx} ${sy}L${sx} ${position.y + 22}L${position.x} ${position.y + 22}L${position.x} ${position.y}M${position.x - 4} ${position.y}L${position.x + 4} ${position.y}`);
      }
    }

    const checkPositions = projected(geometry.checkpoints.map(item => item.position));
    checkpointTicks.forEach((tick, i) => {
      const line = projected(geometry.checkpoints[i].tick);
      tick.setAttribute('d', svgPath(line));
      const point = checkPositions[i];
      const button = checkpointButtons[i], callout = checkpointCallouts[i];
      if (!point) { button.hidden = true; callout.hidden = true; return; }
      button.hidden = stateName !== 'cars';
      button.style.left = `${point.x - 22}px`; button.style.top = `${point.y - 22}px`;
      checkpointNums[i].setAttribute('x', point.x + 10); checkpointNums[i].setAttribute('y', point.y - 12);
      const bend = calloutPoint(point);
      callout.style.left = `${bend.endX + bend.flip * 8}px`; callout.style.top = `${bend.endY - 22}px`;
      const carIndex = geometry.checkpoints[i].carIndex;
      const isOpen = hovered === carIndex || selected === carIndex;
      callout.hidden = !isOpen || stateName !== 'cars';
      if (isOpen) tick.dataset.leader = `M${point.x} ${point.y}L${bend.x1} ${point.y}L${bend.x1} ${bend.y1}L${bend.endX} ${bend.endY}M${bend.endX} ${bend.endY - 3}L${bend.endX} ${bend.endY + 3}`;
    });
    const leaderPath = hovered !== null || selected !== null ? checkpointTicks[(hovered ?? selected) - 1]?.dataset.leader : '';
    grid.setAttribute('d', `${svgPath(projected(geometry.grid))}${leaderPath || ''}`);
    drawStats.frames += 1;
    const elapsed = performance.now() - began;
    drawStats.totalMs += elapsed; drawStats.maxMs = Math.max(drawStats.maxMs, elapsed);
  }

  function layout() {
    viewport = { width: window.innerWidth, height: window.innerHeight };
    svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    const slot = stateName === 'cars'
      ? { left: 140, top: 70, width: Math.max(780, viewport.width - 280), height: Math.max(520, viewport.height - 140) }
      : { left: viewport.width * .21, top: viewport.height * .122, width: viewport.width * .60, height: viewport.height * .622 };
    rest = restPose({ points: framing, slot, viewport, variant: 'a', ...ctx.camera });
    if (!moving) { current = rest; draw(); placeStart(); }
  }

  function setCalloutContent(i) {
    const callout = checkpointCallouts[i];
    const carIndex = geometry.checkpoints[i].carIndex; // tick i belongs to car i + 1 (Lexus starts the Tour)
    const car = CARS[carIndex], isFound = found.has(carIndex);
    // Hover/focus churn re-renders every callout. Replacing children while a child is the
    // mousedown target detaches it before mouseup, which cancels the click. Only rebuild when
    // the content actually changes so a callout action stays clickable.
    const signature = `${isFound}:${selected === carIndex}:${carIndex}`;
    if (calloutSignatures[i] === signature) return;
    calloutSignatures[i] = signature;
    callout.replaceChildren();
    const heading = html('p', 'precision-callout__name', isFound ? car.displayName : '?');
    const index = html('span', 'precision-callout__index', String(carIndex).padStart(2, '0'));
    heading.append(index); callout.append(heading);
    callout.append(html('p', 'precision-callout__detail', isFound ? car.year : 'Not yet discovered'));
    if (selected === carIndex) {
      if (isFound) callout.append(html('p', 'precision-callout__model', car.model));
      const action = html('button', 'precision-callout__showcase', 'View in Showcase');
      action.type = 'button'; action.dataset.control = 'showcase';
      action.addEventListener('click', event => {
        event.stopPropagation();
        ctx.requestShowcase({ carIndex });
        showcaseStatus.hidden = false; showcaseStatus.textContent = 'Showcase opens in the next build.';
        window.setTimeout(() => { showcaseStatus.hidden = true; }, 2400);
      });
      callout.append(action);
    }
  }

  function stopStartHover() {
    hoverStart = false; hoverTimeline?.kill(); lapTimeline?.kill();
    gsap.to(ctx.startButton.querySelectorAll('.precision-start__char'), {
      fontStyle: 'normal', duration: reducedMotion.matches ? 0 : .24, ease: 'gt3.out', stagger: .012,
    });
    gsap.set([startLeader, centreLine], { opacity: 0 });
  }

  function titleBlockSetup() {
    const mark = root.querySelector('.hub-mark');
    const cars = root.querySelector('.hub-cars');
    const slot = root.querySelector('.hub-player-slot');
    if (!mark || !cars || !slot || titleBlock) return;
    titleBlock = html('section', 'precision-title');
    titleBlock.setAttribute('aria-label', 'Drawing title block');
    const identity = html('div', 'precision-title__cell precision-title__identity'); identity.append(mark);
    const carsCell = html('div', 'precision-title__cell precision-title__cars'); carsCell.append(cars);
    const showcase = html('button', 'precision-title__cell precision-title__showcase', 'Showcase');
    showcase.type = 'button'; showcase.dataset.control = 'showcase';
    showcase.addEventListener('click', () => {
      showcaseStatus.hidden = false; showcaseStatus.textContent = 'Showcase opens in the next build.';
      window.setTimeout(() => { showcaseStatus.hidden = true; }, 2400);
    });
    const theme = html('div', 'precision-title__cell precision-theme');
    theme.dataset.control = 'theme'; theme.setAttribute('role', 'radiogroup'); theme.setAttribute('aria-label', 'Theme');
    ['day', 'night'].forEach((mode, index) => {
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'precision-theme'; input.value = mode;
      input.checked = state.theme === mode; input.setAttribute('aria-label', mode === 'day' ? 'Day theme' : 'Night theme');
      input.addEventListener('change', () => { if (input.checked) set('theme', mode); });
      // Both choices stay visible (SPEC §13): Lucide glyphs at stroke 1.5, the checked one inverted on the thumb.
      const label = html('label', 'precision-theme__option');
      label.append(createElement(index ? Moon : Sun, { width: 15, height: 15, 'stroke-width': 1.5, 'aria-hidden': 'true' }), input);
      theme.append(label);
    });
    theme.append(html('i', 'precision-theme__thumb'));
    const playerCell = html('div', 'precision-title__cell precision-title__player'); playerCell.append(slot);
    showcaseStatus = html('p', 'precision-showcase-status'); showcaseStatus.dataset.showcaseStatus = ''; showcaseStatus.hidden = true;
    titleBlock.append(identity, carsCell, showcase, theme, playerCell, showcaseStatus); root.append(titleBlock);
    const toggle = cars.querySelector('.hub-cars__toggle'); toggle.dataset.control = 'cars';
    root.dataset.hubState = stateName;
  }

  function splitStart() {
    const word = ctx.startButton.querySelector('.hub-start__word');
    word.replaceChildren(...[...'START RACE'].map(letter => html('span', 'precision-start__char', letter === ' ' ? '\u00a0' : letter)));
    ctx.startButton.dataset.control = 'start';
  }

  function transition(seam, reverse) {
    edgeTimeline?.kill(); stopStartHover(); moving = false; layout();
    const live = seam.pose?.();
    const duration = reducedMotion.matches ? .01 : reverse ? 1.5 : 1.9;
    if (!rest || !live) return gsap.timeline().to(ctx.field, { opacity: reverse ? 1 : 0, duration: .5 });
    moving = true; progress = seam.progress ?? progress;
    const proxy = { amount: reverse ? 1 : 0 };
    const apply = () => { current = poseAt(proxy.amount, rest, live); draw(); ctx.setPoseOverride?.(() => current); };
    const clean = () => { moving = false; ctx.setPoseOverride?.(null); if (reverse) { current = rest; draw(); } };
    // Harness evidence only: cloning ~9k projected points costs a frame, so dev builds alone pay it.
    const publish = () => { if (import.meta.env.DEV && !reverse && linework) ctx.setDebug?.({ lastDive: structuredClone(linework) }); };
    edgeTimeline = gsap.timeline({ onComplete: () => { publish(); clean(); }, onInterrupt: clean });
    gsap.set(svg, { opacity: reverse ? 0 : 1 }); gsap.set(ctx.field, { opacity: reverse ? 0 : 1 }); apply();
    if (reverse) {
      edgeTimeline.to([svg, ctx.field], { opacity: 1, duration: .28 }, 0);
      edgeTimeline.to(proxy, { amount: 0, duration, ease: 'gt3.settle', onUpdate: apply }, 0);
    } else {
      edgeTimeline.to(proxy, { amount: 1, duration, ease: 'gt3.launch', onUpdate: apply }, 0);
      edgeTimeline.to([edgeLeft, edgeRight], { attr: { 'stroke-width': 3.1 }, duration: .5 }, duration - .5);
      edgeTimeline.to(ctx.field, { opacity: 0, duration: .5, ease: 'gt3' }, duration - .5);
      edgeTimeline.to(svg, { opacity: 0, duration: .28 }, duration);
    }
    return edgeTimeline;
  }

  return {
    build(container, context) {
      root = container; ctx = context; root.classList.add('precision-plan');
      svg = make('svg', { class: 'precision-plan__svg', role: 'img', 'aria-label': 'Top-down circuit plan' }, root);
      edgeLeft = make('path', { class: 'precision-plan__edge' }, svg);
      edgeRight = make('path', { class: 'precision-plan__edge' }, svg);
      centreLine = make('path', { class: 'precision-plan__lap' }, svg);
      checker = make('path', { class: 'precision-plan__checker' }, svg);
      grid = make('path', { class: 'precision-plan__grid' }, svg);
      checkpointGroup = make('g', { class: 'precision-plan__checkpoints' }, svg);
      checkpointTicks = geometry.checkpoints.map(() => make('path', { class: 'precision-plan__tick' }, checkpointGroup));
      checkpointNums = geometry.checkpoints.map((_, i) => { const item = make('text', { class: 'precision-plan__number', 'aria-hidden': 'true' }, checkpointGroup); item.textContent = String(i + 1).padStart(2, '0'); return item; });
      marker = make('path', { class: 'precision-plan__marker', d: MARKER, 'data-hub-marker': '', 'aria-label': 'Current route position' }, svg);
      startLeader = make('path', { class: 'precision-plan__start-leader' }, svg);
      sweep = html('i', 'precision-theme-sweep'); root.append(sweep);
      const overlay = html('div', 'precision-plan__overlay'); root.append(overlay);
      // Nine checkpoints, one per car 1-9 (contract: data-checkpoint is the car index).
      checkpointButtons = geometry.checkpoints.map(({ carIndex }) => {
        const button = html('button', 'precision-checkpoint'); button.type = 'button'; button.dataset.checkpoint = String(carIndex);
        button.addEventListener('pointerenter', () => ctx.hoverCheckpoint(carIndex)); button.addEventListener('pointerleave', () => ctx.hoverCheckpoint(null));
        button.addEventListener('focus', () => ctx.hoverCheckpoint(carIndex)); button.addEventListener('blur', () => ctx.hoverCheckpoint(null));
        button.addEventListener('click', () => ctx.selectCheckpoint(carIndex)); overlay.append(button); ctx.registerCheckpoint(carIndex, button); return button;
      });
      checkpointCallouts = geometry.checkpoints.map(() => { const node = html('aside', 'precision-callout'); overlay.append(node); return node; });
      splitStart(); queueMicrotask(titleBlockSetup); layout();
    },
    layout,
    setReadiness(value) {
      readiness = value;
      const drawn = Math.max(0, Math.min(1, value));
      [edgeLeft, edgeRight].forEach(edge => { edge.style.strokeDasharray = '1'; edge.style.strokeDashoffset = String(1 - drawn); edge.setAttribute('pathLength', '1'); });
      checkpointTicks.forEach((tick, i) => tick.classList.toggle('is-drawn', drawn >= geometry.checkpoints[i].t));
      if (drawn >= 1 && !revealDone) {
        revealDone = true;
        const chars = ctx.startButton.querySelectorAll('.precision-start__char');
        // The player cell is the Hub's audio anchor. §145/contract: the master speaker must not
        // vanish in an interactive state, so it joins the immediate chrome reveal instead of the
        // 1.03 s title-block stagger (which also left it hidden to hit-testing).
        const cells = [...(titleBlock?.children ?? [])].filter(cell => !cell.classList.contains('precision-title__player'));
        gsap.set(chars, { yPercent: 36, autoAlpha: 0 }); gsap.set(cells, { y: 10, autoAlpha: 0 });
        gsap.timeline()
          .fromTo([edgeLeft, edgeRight], { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: reducedMotion.matches ? 0 : 1.2, ease: 'gt3.out' }, 0)
          .to(checkpointTicks, { autoAlpha: 1, duration: reducedMotion.matches ? 0 : .18, stagger: .07 }, .55)
          .to(chars, { yPercent: 0, autoAlpha: 1, duration: reducedMotion.matches ? 0 : .38, ease: 'gt3.out', stagger: .012 }, .86)
          .to(cells, { y: 0, autoAlpha: 1, duration: reducedMotion.matches ? 0 : .32, ease: 'gt3.out', stagger: .045 }, 1.03);
      }
    },
    setState(next) {
      stateName = next; root.dataset.hubState = next;
      const cars = next === 'cars', listening = next === 'listening';
      root.classList.toggle('precision-plan--cars', cars); root.classList.toggle('precision-plan--listening', listening);
      if (titleBlock) titleBlock.querySelector('.hub-cars__name').textContent = cars ? 'Race' : 'Cars';
      ctx.startButton.parentElement.hidden = cars || listening;
      checkpointButtons.forEach(button => { button.tabIndex = cars ? 0 : -1; button.hidden = !cars; });
      if (!cars) { hovered = null; selected = null; }
      layout(); return gsap.timeline().to(svg, { opacity: 1, duration: reducedMotion.matches ? 0 : .64, ease: 'gt3.precision' });
    },
    hoverStart(on) {
      stopStartHover(); hoverStart = on;
      if (!on || readiness < 1 || moving || reducedMotion.matches) return;
      const chars = ctx.startButton.querySelectorAll('.precision-start__char');
      hoverTimeline = gsap.timeline().to(chars, { fontStyle: 'oblique', duration: .16, ease: 'gt3.out', stagger: .012 });
      gsap.set([startLeader, centreLine], { opacity: 1 }); draw();
      hoverTimeline.fromTo(startLeader, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: .32, ease: 'gt3.out' }, 0);
      lapTimeline = gsap.fromTo(centreLine, { drawSVG: '0% 6%' }, { drawSVG: '94% 100%', duration: 2.6, ease: 'none', repeat: -1 });
    },
    setDiscovery(next) {
      found = next;
      checkpointButtons.forEach((button, i) => {
        const carIndex = geometry.checkpoints[i].carIndex;
        const isFound = found.has(carIndex); button.dataset.found = String(isFound);
        button.setAttribute('aria-label', isFound ? CARS[carIndex].displayName : 'Not yet discovered'); button.textContent = isFound ? String(carIndex).padStart(2, '0') : '?';
        checkpointTicks[i].classList.toggle('is-found', isFound); setCalloutContent(i);
      });
    },
    setRoutePosition(value) { progress = value; marker.dataset.progress = String(value); if (!moving) draw(); },
    hoverCheckpoint(index) { hovered = index; checkpointButtons.forEach((button, i) => button.classList.toggle('is-hovered', geometry.checkpoints[i].carIndex === index)); checkpointCallouts.forEach((_, i) => setCalloutContent(i)); draw(); },
    selectCheckpoint(index) { selected = index; checkpointButtons.forEach((button, i) => button.classList.toggle('is-selected', geometry.checkpoints[i].carIndex === index)); checkpointCallouts.forEach((_, i) => setCalloutContent(i)); draw(); },
    setTheme(theme) {
      root.dataset.theme = theme; titleBlock?.querySelectorAll('input').forEach(input => { input.checked = input.value === theme; });
      gsap.fromTo(sweep, { scaleX: 0, transformOrigin: '0 50%' }, { scaleX: 1, duration: reducedMotion.matches ? 0 : .52, ease: 'gt3.out', onComplete: () => gsap.set(sweep, { scaleX: 0, transformOrigin: '100% 50%' }) });
    },
    restPose() { return rest; }, launch(seam) { return transition(seam, false); }, returnTo(seam) { return transition(seam, true); }, update() {},
    reset() { edgeTimeline?.kill(); stopStartHover(); moving = false; revealDone = false; ctx.setPoseOverride?.(null); gsap.set([svg, ctx.field], { opacity: 1 }); layout(); },
    dispose() { edgeTimeline?.kill(); stopStartHover(); ctx.setPoseOverride?.(null); root.classList.remove('precision-plan'); },
    debug: { marker: markerSnapshot, drawStats, get pose() { return current; } },
  };
}
