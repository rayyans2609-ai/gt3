/** Browser verification for the Phase 3-refined HUD: consolidated top-left identity,
 * directional minimap arrow, completed-route trail, reverse-only direction cue,
 * first-Tour-entry sound cue, and their composition with the edge-row controls.
 *
 * Usage: node scripts/verify-hud.mjs [baseUrl] [outDir]
 * Defaults: baseUrl http://127.0.0.1:5194/  outDir /Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w5/
 * Same Chrome launch as verify-checkpoints.mjs / verify-controls.mjs (puppeteer-core,
 * real GPU unless GT3_SOFTWARE_GL=1). One browser, one page at a time; each scenario
 * opens a fresh tab (fresh sessionStorage) and closes it. Prints a JSON summary and
 * exits non-zero if any check fails. Content (car-info lines) is a starting state for
 * the user's review: this script reports wraps/overflow, it does not accept content.
 *
 * Expected-error policy: a healthy run must have zero console errors / page errors /
 * HTTP >= 400. The injected degraded-load scenario records console errors separately
 * (`degradedConsoleErrors`) and fails only on uncaught page errors or HTTP failures. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const base = (process.argv[2] || 'http://127.0.0.1:5194/').replace(/\/?$/, '/');
const outDir = (process.argv[3] || '/Users/rayyansheikh/Desktop/gt3-review-2026-10-04/w5/').replace(/\/?$/, '/');
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
await mkdir(outDir, { recursive: true });

// Roster data is read straight from source so expectations never drift from cars.js.
const { CARS } = await import(pathToFileURL(resolve(process.cwd(), 'src/data/cars.js')).href);
const specLine = car => {
  const bop = /\s*\(BoP-dependent\)/.test(car.engine.power);
  return `${car.engine.configuration} · ${car.engine.power.replace(/\s*\(BoP-dependent\)/, '')}${bop ? ' · BoP' : ''}`;
};

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=/tmp/gt3-w5b/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});

const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m); };
const phases = [];
const report = { base, outDir, renderer: softwareGL ? 'SwiftShader fallback' : 'ANGLE/Metal',
  phases, carInfo: [], shots: [], errors: [], degradedConsoleErrors: [], notes: [] };
let scenarioErrors = [];
let scenarioName = '';

async function phase(name, work) {
  try {
    const value = await work();
    phases.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    phases.push({ name, status: 'FAIL', message });
    console.error(`FAIL ${name}: ${message}`);
    return undefined;
  }
}

/** Open a fresh tab, optionally with injected faults / reduced motion / custom size. */
async function openPage({ width = 1600, height = 900, faults = null, reducedMotion = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (faults) await page.evaluateOnNewDocument(f => { window.__gt3TestFaults = f; }, faults);
  page.on('pageerror', e => scenarioErrors.push({ kind: 'pageerror', text: e.message }));
  page.on('console', m => { if (m.type() === 'error') scenarioErrors.push({ kind: 'console', text: m.text() }); });
  page.on('response', r => { if (r.status() >= 400) scenarioErrors.push({ kind: 'http', text: `HTTP ${r.status()} ${r.url()}` }); });
  return page;
}

async function load(page, query = '') {
  await page.goto(`${base}${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__gt3?.readiness
    && ['ready', 'degraded'].includes(window.__gt3.readiness.status)
    && document.querySelector('#start-screen.is-ready'), { timeout: 180000 });
}

/** Real wheel input dismisses the start screen; resolves when root.hidden is set. */
async function enterTour(page) {
  await page.mouse.wheel({ deltaY: 240 });
  await page.waitForFunction(() => document.querySelector('#start-screen')?.hidden === true, { timeout: 15000 });
}

const read = (page, fn, ...args) => page.evaluate(fn, ...args);

const intersects = (a, b) => !!a && !!b && a.width > 0 && b.width > 0
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Rects of everything that must not overlap, plus the live visibility of each. */
async function layout(page) {
  return read(page, () => {
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        shown: cs.visibility !== 'hidden' && Number.parseFloat(cs.opacity) > 0.02 && r.width > 0 };
    };
    const q = s => document.querySelector(s);
    return {
      theme: document.documentElement.dataset.theme,
      player: box(q('.music-player')), anchor: box(q('.audio-anchor')),
      theme_control: box(q('#hud-bottomright')), cue: box(q('.sound-cue')),
      map: box(q('.hud-route')), info: box(q('.hud-identity')), direction: box(q('.hud-direction')),
      identity: box(q('.hud-identity')),
      open: q('#audio-layer')?.classList.contains('is-open') ?? false,
      vw: innerWidth, vh: innerHeight,
    };
  });
}

/** No two of player / theme control / cue / anchor / info / map / direction may overlap. */
function checkNoOverlap(l, label) {
  const named = { player: l.player, theme: l.theme_control, cue: l.cue, anchor: l.anchor,
    info: l.info, direction: l.direction, map: l.map };
  const names = Object.keys(named);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = named[names[i]];
    const b = named[names[j]];
    // The open player is built around the anchor (it grows out of it): intended containment.
    if ((names[i] === 'player' && names[j] === 'anchor') || (names[i] === 'anchor' && names[j] === 'player')) continue;
    // Only count rects the user can actually see (a closed player has opacity 0).
    if (a?.shown && b?.shown && intersects(a, b)) {
      throw new Error(`${label}: ${names[i]} overlaps ${names[j]} ${JSON.stringify({ a, b })}`);
    }
  }
}

async function sampleNoOverlap(page, label, samples = 12, every = 50) {
  for (let i = 0; i < samples; i++) { checkNoOverlap(await layout(page), `${label}#${i}`); await wait(every); }
}

async function shot(page, name, clip) {
  const path = `${outDir}${name}.png`;
  await page.screenshot(clip ? { path, clip } : { path });
  report.shots.push(path);
}

async function crops(page, prefix) {
  const { vw, vh } = await layout(page);
  await shot(page, `${prefix}-full`);
  await shot(page, `${prefix}-bottomleft`, { x: 0, y: vh - 190, width: 460, height: 190 });
  await shot(page, `${prefix}-topright`, { x: vw - 260, y: 0, width: 260, height: 230 });
  await shot(page, `${prefix}-bottomright-closed`, { x: vw - 480, y: vh - 190, width: 480, height: 190 });
}

async function setOpen(page, want) {
  const open = (await layout(page)).open;
  if (open !== want) { await page.click('.audio-launcher'); await wait(450); }
}

async function setTheme(page, name) {
  if ((await layout(page)).theme === name) return;
  await setOpen(page, false);
  await page.click(`.theme-segmented [role="radio"][aria-label="${name === 'day' ? 'Day' : 'Night'}"]`);
  await wait(900);
}

const cueState = page => read(page, () => {
  const el = document.querySelector('.sound-cue');
  if (!el) return { present: false, visible: false };
  const cs = getComputedStyle(el);
  return { present: true, visible: el.classList.contains('is-visible') && Number.parseFloat(cs.opacity) > 0.02 };
});

const audioState = page => read(page, async () => {
  const { state } = await import('/src/core/state.js');
  return { ready: state.audioReady, master: window.__gt3audio?.gains().master ?? null };
});

/** Active car and consolidated top-left identity as the user perceives it now. */
const hudState = page => read(page, async () => {
  const { state } = await import('/src/core/state.js');
  const { isMorphing } = await import('/src/scene/morph.js');
  const slots = [...document.querySelectorAll('.hud-identity__slot')];
  const pick = list => list.filter(s => s.getAttribute('aria-hidden') === 'false');
  const vis = pick(slots);
  const marker = document.querySelector('.hud-route__marker');
  const doneSegs = [...document.querySelectorAll('.hud-route__done-seg')];
  const svg = document.querySelector('.hud-route__svg');
  const order = svg ? [...svg.children].map(el => el.getAttribute('class')) : [];
  return {
    active: state.activeCarIndex, progress: state.progress, morphing: isMorphing(),
    name: vis.map(s => s.querySelector('.hud-identity__name').textContent),
    headline: vis.map(s => s.querySelector('.hud-identity__headline').textContent),
    spec: vis.map(s => s.querySelector('.hud-identity__spec').textContent),
    nameCount: vis.length, infoCount: vis.length,
    infoHiddenWithClass: slots.filter(s => s.classList.contains('is-visible')).length,
    legacyInfoBlocks: document.querySelectorAll('.hud-info').length,
    bottomLeftChildren: document.querySelector('#hud-bottomleft')?.childElementCount ?? -1,
    markerTag: marker?.tagName.toLowerCase() ?? null,
    markerTransform: marker?.getAttribute('transform') ?? null,
    trailSegs: doneSegs.length,
    trailVisible: doneSegs.filter(s => s.style.visibility !== 'hidden').length,
    svgOrder: order,
  };
});

function checkHud(h, label, index = h.active) {
  const car = CARS[index];
  assert(h.nameCount === 1 && h.infoCount === 1, `${label}: slots visible to AT name=${h.nameCount} info=${h.infoCount}`);
  assert(h.infoHiddenWithClass === 1, `${label}: ${h.infoHiddenWithClass} info slots carry is-visible`);
  assert(h.name[0] === car.displayName, `${label}: name "${h.name[0]}" != "${car.displayName}"`);
  assert(h.headline[0] === car.showcase.headline, `${label}: headline "${h.headline[0]}" != "${car.showcase.headline}"`);
  assert(h.spec[0] === specLine(car), `${label}: spec "${h.spec[0]}" != "${specLine(car)}"`);
}

async function idle(page, timeout = 15000) {
  await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing(),
    { timeout, polling: 100 }).catch(() => {});
  await wait(700); // allow the 440/520 ms cross-fade to finish
}

/** Drive forward/back with real wheel input until the active car changes. */
async function wheelUntilActive(page, target, direction, { step = 360, timeout = 90000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const active = await read(page, async () => (await import('/src/core/state.js')).state.activeCarIndex);
    if (active === target) return Date.now() - t0;
    await page.mouse.wheel({ deltaY: direction * step });
    await wait(40);
  }
  throw new Error(`wheel ${direction > 0 ? 'down' : 'up'} never reached car ${target}`);
}

async function seek(page, t, instant = false) {
  await read(page, async (t2, inst) => { (await import('/src/scroll/scrollDrive.js')).seekTo(t2, { instant: inst }); }, t, instant);
}

function endScenario(kind = 'healthy') {
  const list = scenarioErrors;
  scenarioErrors = [];
  if (kind === 'degraded') {
    for (const e of list) {
      if (e.kind === 'console') report.degradedConsoleErrors.push(`${scenarioName}: ${e.text}`);
    }
    const hard = list.filter(e => e.kind !== 'console');
    assert(hard.length === 0, `${scenarioName}: uncaught/HTTP errors ${JSON.stringify(hard)}`);
    return;
  }
  for (const e of list) report.errors.push(`${scenarioName}: ${e.text}`);
  assert(list.length === 0, `${scenarioName}: ${list.length} browser errors: ${list.map(e => e.text).join(' | ')}`);
}

async function scenario(name, opts, fn, kind = 'healthy') {
  if (process.env.GT3_HUD_ONLY && !name.includes(process.env.GT3_HUD_ONLY)) return;
  scenarioName = name;
  scenarioErrors = [];
  const page = await openPage(opts);
  try {
    await phase(name, async () => { await fn(page); endScenario(kind); });
  } finally { await page.close().catch(() => {}); }
}

try {
  // ---- S1 main: map, info, cue, layout, themes, car-info through crossings ----------
  await scenario('main 1600x900 Tour (default scroll)', {}, async page => {
    await load(page);
    report.readiness = await read(page, () => window.__gt3.readiness.status);

    // Before Tour entry: reverse hint hidden until first forward motion, info already
    // shows car 0 in the consolidated top-left block, no sound cue yet.
    const h0 = await hudState(page);
    checkHud(h0, 'initial');
    assert(h0.legacyInfoBlocks === 0, 'legacy .hud-info block still in the DOM');
    assert(h0.bottomLeftChildren === 0, `bottom-left not empty: ${h0.bottomLeftChildren} children`);
    assert(h0.markerTag === 'g', `minimap marker is <${h0.markerTag}>, expected the <g> arrow`);
    assert(h0.trailSegs === 160, `trail has ${h0.trailSegs} segments, expected 160`);
    assert(h0.trailVisible === 0, `trail visible before any progress: ${h0.trailVisible} segs`);
    const order = h0.svgOrder;
    const iPath = order.indexOf('hud-route__path');
    const iDone = order.indexOf('hud-route__done');
    const iFirstDot = order.indexOf('hud-route__checkpoint');
    const iArrow = order.indexOf('hud-route__marker');
    assert(iPath >= 0 && iPath < iDone && iDone < iFirstDot && iFirstDot < iArrow,
      `map z-order wrong (route→trail→dots→arrow): ${JSON.stringify(order.filter((v, i) => order.indexOf(v) === i))}`);
    const promptLabel = await read(page, () => document.querySelector('.start-prompt__label')?.textContent);
    assert(promptLabel === 'Scroll to race', `start prompt "${promptLabel}" != "Scroll to race"`);
    assert(!(await cueState(page)).present, 'sound cue present before Tour entry');
    const pre = await layout(page);
    assert(!pre.direction?.shown, 'reverse hint visible before any motion (it teaches only after forward drive)');
    assert(!intersects(pre.direction, pre.info), `direction cue overlaps info: ${JSON.stringify([pre.direction, pre.info])}`);

    // Monitor: the cue must never be visible while the start screen is still on screen.
    await read(page, () => {
      window.__cueEarly = 0;
      window.__cueMonitor = setInterval(() => {
        const s = document.querySelector('#start-screen');
        const c = document.querySelector('.sound-cue');
        if (c && s && !s.hidden) window.__cueEarly++;
      }, 20);
    });
    // Watch the reverse hint across entry: it must appear on forward motion, then retire.
    await read(page, () => {
      window.__dirSeen = 0;
      window.__dirMonitor = setInterval(() => {
        if (document.querySelector('.hud-direction.is-visible')) window.__dirSeen++;
      }, 50);
    });
    const wheelAt = Date.now();
    await page.mouse.wheel({ deltaY: 240 });
    await wait(500); // start screen mid-fade (dismissal started, not complete)
    assert(!(await cueState(page)).present, 'cue appeared during start-screen fade (before dismissal-complete)');
    await page.waitForFunction(() => document.querySelector('#start-screen')?.hidden === true, { timeout: 15000 });
    const hiddenAfter = Date.now() - wheelAt;
    await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
    const early = await read(page, () => { clearInterval(window.__cueMonitor); return window.__cueEarly; });
    assert(early === 0, `cue was in the DOM ${early} samples while the start screen was still shown`);
    report.dismissCompleteMs = hiddenAfter;

    // Scrolling alone must never initialise audio.
    const audio = await audioState(page);
    assert(audio.ready === false, `scrolling made audio usable: ${JSON.stringify(audio)}`);

    // Geometry with the cue up: map size, identity width, no overlaps, cue clear of theme control.
    const l = await layout(page);
    assert(Math.abs(l.map.width - 170) <= 1 && Math.abs(l.map.height - 170) <= 1, `map ${l.map.width}x${l.map.height} != 170`);
    assert(l.info.width <= 330.5, `identity width ${l.info.width} > 330`);
    assert(l.cue?.shown, 'cue not shown');
    checkNoOverlap(l, 'closed+cue');
    // Cue sits above the anchor, pointing down at the speaker.
    assert(l.cue.y + l.cue.height <= l.anchor.y + 8, `cue not above the anchor: ${JSON.stringify([l.cue, l.anchor])}`);
    report.cue = { rect: l.cue, anchor: l.anchor, themeControl: l.theme_control };
    report.map = { width: l.map.width, height: l.map.height };
    await crops(page, `${l.theme}-cue`);

    // Theme switch while the cue is up (cue stays clear of theme control in both themes).
    await page.click('.theme-segmented [role="radio"][aria-label="Night"]');
    await wait(900);
    const other = await layout(page);
    if (other.cue?.shown) checkNoOverlap(other, `${other.theme}+cue`);
    await page.click('.theme-segmented [role="radio"][aria-label="Day"]');
    await wait(900);
    await idle(page);

    // Reverse-hint lifecycle: shown on forward motion, retired ~3 s later.
    const dirSeen = await read(page, () => { clearInterval(window.__dirMonitor); return window.__dirSeen; });
    assert(dirSeen > 0, 'reverse hint never appeared after forward drive');
    const dirCopy = await read(page, () => ({
      text: document.querySelector('.hud-direction')?.textContent,
      aria: document.querySelector('.hud-direction')?.getAttribute('aria-label'),
    }));
    assert(/Scroll up to reverse/.test(dirCopy.text ?? ''), `hint copy "${dirCopy.text}" missing "Scroll up to reverse"`);
    assert(/↑/.test(dirCopy.text ?? ''), 'hint missing the up arrow');
    assert(/reverse/i.test(dirCopy.aria ?? ''), `hint aria-label "${dirCopy.aria}" not meaningful`);
    await page.waitForFunction(() => {
      const el = document.querySelector('.hud-direction');
      return el && !el.classList.contains('is-visible');
    }, { timeout: 8000 });
    // Bottom-centre placement, ~44 px above the viewport bottom (rect is still
    // measurable after retirement — only opacity changed).
    const dirBox = await read(page, () => {
      const r = document.querySelector('.hud-direction').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
    });
    assert(Math.abs((dirBox.x + dirBox.width / 2) - dirBox.vw / 2) <= 6,
      `hint not bottom-centre: ${JSON.stringify(dirBox)}`);
    assert(Math.abs(dirBox.vh - (dirBox.y + dirBox.height) - 44) <= 10,
      `hint not ~44 px above the bottom: ${JSON.stringify(dirBox)}`);

    // Arrow + trail against real route state.
    const angleOf = t => read(page, async target => {
      (await import('/src/scroll/scrollDrive.js')).seekTo(target, { instant: true });
    }, t).then(() => wait(500)).then(() => read(page, () => {
      const tr = document.querySelector('.hud-route__marker')?.getAttribute('transform') ?? '';
      const m = /rotate\(([^)]+)\)/.exec(tr);
      return { transform: tr, angle: m ? Number.parseFloat(m[1]) : NaN };
    }));
    await seek(page, 0.25, true);
    await wait(600);
    let h = await hudState(page);
    assert(/translate\(.+\) rotate\(.+\)/.test(h.markerTransform ?? ''),
      `arrow transform missing translate+rotate: "${h.markerTransform}"`);
    assert(h.trailVisible > 0 && h.trailVisible < h.trailSegs,
      `trail should be partial at t=0.25 (visible ${h.trailVisible}/${h.trailSegs})`);
    const opacities = await read(page, () => [...document.querySelectorAll('.hud-route__done-seg')]
      .filter(s => s.style.visibility !== 'hidden').map(s => Number.parseFloat(s.style.opacity)));
    assert(opacities.every(o => o >= 0.37 && o <= 1.001),
      `trail opacities outside [0.38, 1]: min=${Math.min(...opacities)} max=${Math.max(...opacities)}`);
    assert(Math.max(...opacities) > 0.9, 'trail never reaches full strength right behind the car');
    const a1 = await angleOf(0.1);
    const a2 = await angleOf(0.55);
    assert(Number.isFinite(a1.angle) && Number.isFinite(a2.angle), `arrow angles not finite: ${a1.angle}, ${a2.angle}`);
    let diff = Math.abs(a1.angle - a2.angle) % 360;
    if (diff > 180) diff = 360 - diff;
    assert(diff > 5, `arrow does not follow the tangent (t=0.1: ${a1.angle}°, t=0.55: ${a2.angle}°)`);
    // Reversing shrinks the trail: back near the start nothing is completed.
    await seek(page, 0.002, true);
    await wait(600);
    h = await hudState(page);
    assert(h.trailVisible === 0, `trail did not shrink on reverse: ${h.trailVisible} segs visible`);
  });

  // ---- S2 car info through wheel-driven checkpoint crossings (default + bounded) ----
  const crossing = async (page, query, label) => {
    await load(page, query);
    await enterTour(page);
    await wait(1500);
    checkHud(await hudState(page), `${label} start`);
    // Sample the swap: exactly one slot visible to AT at every sample, content self-consistent.
    const samples = [];
    const sampler = (async () => {
      for (let i = 0; i < 140; i++) {
        const h = await hudState(page);
        samples.push(h);
        if (h.active === 1 && !h.morphing && i > 10) break;
        await wait(40);
      }
    })();
    const took = await wheelUntilActive(page, 1, 1);
    await sampler;
    for (const [i, h] of samples.entries()) {
      assert(h.nameCount === 1 && h.infoCount === 1, `${label} swap sample ${i}: nameCount=${h.nameCount} infoCount=${h.infoCount}`);
      // Name and info are written in the same pass, so they must always describe the same car.
      const nameCar = CARS.find(c => c.displayName === h.name[0]);
      assert(nameCar && h.headline[0] === nameCar.showcase.headline && h.spec[0] === specLine(nameCar),
        `${label} swap sample ${i}: info (${h.headline[0]}) does not match name (${h.name[0]})`);
    }
    await idle(page);
    checkHud(await hudState(page), `${label} after forward crossing`);
    // Reverse across the same checkpoint.
    await wheelUntilActive(page, 0, -1);
    await idle(page);
    checkHud(await hudState(page), `${label} after reverse crossing`);
    return { crossingMs: took, swapSamples: samples.length };
  };

  await scenario('car info across wheel crossing (default scroll)', {}, async page => {
    report.defaultCrossing = await crossing(page, '', 'default');
  });
  await scenario('car info across wheel crossing (?scroll=cap)', {}, async page => {
    report.capCrossing = await crossing(page, '?scroll=cap', 'cap');
  });

  // ---- S3 cancellation / retarget correctness ---------------------------------------
  await scenario('identity + info through morph cancellation and two-gate retarget', {}, async page => {
    await load(page);
    await enterTour(page);
    await wait(1200);
    const T = await read(page, async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_T);
    // Cancellation: cross gate 1, reverse before the 0.56 s swap completes.
    await seek(page, T[0] + 0.004);
    await wait(250);
    await seek(page, T[0] - 0.006);
    await wait(100);
    for (let i = 0; i < 12; i++) {
      const h = await hudState(page);
      assert(h.nameCount === 1 && h.infoCount === 1, `cancel sample ${i}: slot counts ${h.nameCount}/${h.infoCount}`);
      await wait(120);
    }
    await idle(page);
    let h = await hudState(page);
    checkHud(h, 'after cancellation');
    // Retarget across two gates: jump past gates 1 and 2, then back to before gate 1.
    await seek(page, T[1] + 0.004);
    await wait(300);
    await seek(page, T[0] - 0.006);
    await wait(300);
    await seek(page, T[1] + 0.004);
    await idle(page);
    h = await hudState(page);
    checkHud(h, 'after two-gate retarget');
    await seek(page, 0);
    await idle(page);
    checkHud(await hudState(page), 'after return to start');
  });

  // ---- S4 all ten cars: wrap / overflow report -------------------------------------
  await scenario('ten-car info fit (1600 and 1101 widths)', {}, async page => {
    await load(page);
    await enterTour(page);
    const T = await read(page, async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_T);
    for (const [width, height] of [[1600, 900], [1101, 720]]) {
      await page.setViewport({ width, height });
      await wait(500);
      for (let i = 0; i < 10; i++) {
        const lo = i === 0 ? 0 : T[i - 1];
        // The last car's span ends at the finish line (progress >= 0.995 opens the finish screen
        // and locks scroll), so keep its probe point clear of the threshold; return to car 0
        // instantly rather than gliding back across the whole circuit.
        const hi = i < T.length ? T[i] : 0.99;
        await seek(page, i === 0 ? 0.002 : (lo + hi) / 2, i === 0);
        try {
          await page.waitForFunction(async idx => (await import('/src/core/state.js')).state.activeCarIndex === idx,
            { timeout: 30000, polling: 100 }, i);
        } catch (error) {
          const snap = await read(page, async () => { const { state } = await import('/src/core/state.js');
            return { active: state.activeCarIndex, progress: state.progress, target: state.targetProgress,
              scrollY: window.scrollY, locked: state.scrollLocked, started: state.started, mode: state.mode,
              finish: document.querySelector('#finish-screen')?.className,
              T: (await import('/src/scene/trackCurve.js')).CHECKPOINT_T }; });
          throw new Error(`car ${i} @${width}: activeCarIndex never reached ${i} (${JSON.stringify(snap)}, seek t=${i === 0 ? 0.002 : (lo + hi) / 2})`);
        }
        await idle(page);
        const h = await hudState(page);
        checkHud(h, `car ${i} @${width}`);
        const fit = await read(page, () => {
          const slot = [...document.querySelectorAll('.hud-identity__slot')].find(s => s.getAttribute('aria-hidden') === 'false');
          const head = slot.querySelector('.hud-identity__headline');
          const spec = slot.querySelector('.hud-identity__spec');
          const lh = Number.parseFloat(getComputedStyle(head).lineHeight);
          const name = document.querySelector('.hud-identity__slot[aria-hidden="false"] .hud-identity__name');
          return { headlineLines: Math.round(head.getBoundingClientRect().height / lh),
            specOverflowPx: Math.max(0, spec.scrollWidth - spec.clientWidth),
            slotHeight: slot.getBoundingClientRect().height,
            contentHeight: head.getBoundingClientRect().height + spec.getBoundingClientRect().height + 3,
            nameTruncated: name.scrollWidth > name.clientWidth };
        });
        assert(fit.headlineLines <= 2, `car ${i}: headline wraps to ${fit.headlineLines} lines`);
        assert(fit.contentHeight <= fit.slotHeight + 0.5, `car ${i}: info content ${fit.contentHeight} taller than block ${fit.slotHeight}`);
        assert(fit.specOverflowPx <= 0, `car ${i}: spec line overflows the 330 px block by ${fit.specOverflowPx}px`);
        report.carInfo.push({ viewport: `${width}x${height}`, index: i, name: CARS[i].displayName,
          line1: CARS[i].showcase.headline, line2: specLine(CARS[i]), ...fit });
        checkNoOverlap(await layout(page), `car ${i} @${width}`);
      }
    }
  });

  // ---- S5 sound cue: timeout retirement + no reappearance after reload ---------------
  await scenario('sound cue: timeout, then no reappear on reload (same session)', {}, async page => {
    await load(page);
    await enterTour(page);
    await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
    const shownAt = Date.now();
    // Untouched for the full window: must retire on its own (~6 s).
    await page.waitForFunction(() => !document.querySelector('.sound-cue.is-visible'), { timeout: 9000, polling: 100 });
    const lived = Date.now() - shownAt;
    assert(lived >= 5000 && lived <= 8000, `cue lived ${lived} ms (expected ~6000)`);
    report.cueLifetimeMs = lived;
    await wait(500);
    assert(!(await cueState(page)).present, 'cue node not removed after retirement');
    const audio = await audioState(page);
    assert(audio.ready === false, `audio became usable without a gesture: ${JSON.stringify(audio)}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gt3?.readiness && ['ready', 'degraded'].includes(window.__gt3.readiness.status)
      && document.querySelector('#start-screen.is-ready'), { timeout: 180000 });
    await enterTour(page);
    await wait(2500);
    assert(!(await cueState(page)).present, 'cue reappeared after reload in the same session');
  });

  // ---- S6 sound cue: retire on speaker click; retire on launcher click ---------------
  for (const [label, selector] of [['speaker', '.audio-speaker'], ['launcher', '.audio-launcher']]) {
    await scenario(`sound cue: retires on ${label} click and stays gone after reload`, {}, async page => {
      await load(page);
      await enterTour(page);
      await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
      await page.click(selector); // a speaker click may start audio: allowed, explicit gesture
      await page.waitForFunction(() => !document.querySelector('.sound-cue.is-visible'), { timeout: 1500, polling: 50 });
      await wait(400);
      assert(!(await cueState(page)).present, `cue node still present after ${label} click`);
      if (label === 'launcher') {
        // Player open: no overlap between player / theme control / anchor in either theme.
        await wait(400);
        for (const theme of ['day', 'night']) {
          await setTheme(page, theme);
          await setOpen(page, true);
          await sampleNoOverlap(page, `${theme} open`, 6);
          await crops(page, `${theme}-player-open`);
          await setOpen(page, false);
          await sampleNoOverlap(page, `${theme} closed`, 6);
        }
        await setTheme(page, 'day');
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gt3?.readiness && ['ready', 'degraded'].includes(window.__gt3.readiness.status)
        && document.querySelector('#start-screen.is-ready'), { timeout: 180000 });
      await enterTour(page);
      await wait(2500);
      assert(!(await cueState(page)).present, `cue reappeared after reload (${label})`);
    });
  }

  // ---- S7 engagement BEFORE Tour entry (start screen still up) ------------------------
  for (const [label, selector] of [['launcher', '.audio-launcher'], ['speaker', '.audio-speaker']]) {
    await scenario(`sound cue: never shown after ${label} engaged before Tour entry`, {}, async page => {
      await load(page);
      await page.click(selector);
      await wait(400);
      if (label === 'launcher') await setOpen(page, false);
      const audio = await audioState(page);
      report[`audioAfterPreEntry_${label}`] = audio;
      await enterTour(page);
      await wait(2500);
      assert(!(await cueState(page)).present, `cue appeared after ${label} was engaged before Tour entry`);
    });
  }

  // ---- S8 audio already usable at Tour start -----------------------------------------
  await scenario('sound cue: not shown when audio is already usable at Tour start', {}, async page => {
    await load(page);
    await read(page, async () => { (await import('/src/core/state.js')).set('audioReady', true); });
    await enterTour(page);
    await wait(2500);
    assert(!(await cueState(page)).present, 'cue shown although audioReady was true at Tour start');
    // Interruption then shows audioReady=false later: cue is one-shot and was retired, must stay gone.
    await read(page, async () => { (await import('/src/core/state.js')).set('audioReady', false); });
    await wait(800);
    assert(!(await cueState(page)).present, 'cue appeared after audioReady dropped post-Tour-entry');
  });

  // ---- S9 input queued during loading + degraded-load path ----------------------------
  await scenario('sound cue: queued input + degraded load (audioReject) shows cue only after dismissal-complete',
    { faults: { audioReject: true } }, async page => {
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      // Wheel while loading is swallowed by the scroll lock (must not start the Tour)...
      await page.mouse.wheel({ deltaY: 300 });
      await page.mouse.wheel({ deltaY: 300 });
      // ...but a start request that is already pending when readiness lands (state.started)
      // must dismiss the screen at readiness and only then raise the cue.
      await read(page, async () => { (await import('/src/core/state.js')).set('started', true); });
      await read(page, () => {
        window.__earlyCue = 0;
        setInterval(() => {
          const s = document.querySelector('#start-screen');
          if (document.querySelector('.sound-cue') && s && !s.hidden) window.__earlyCue++;
        }, 20);
      });
      await page.waitForFunction(() => window.__gt3?.readiness && ['ready', 'degraded'].includes(window.__gt3.readiness.status),
        { timeout: 180000 });
      report.degradedReadiness = await read(page, () => ({ status: window.__gt3.readiness.status, reasons: window.__gt3.readiness.reasons }));
      assert(report.degradedReadiness.status === 'degraded', `expected degraded, got ${report.degradedReadiness.status}`);
      await page.waitForFunction(() => document.querySelector('#start-screen')?.hidden === true, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
      assert((await read(page, () => window.__earlyCue)) === 0, 'cue visible while the start screen was still showing');
      checkNoOverlap(await layout(page), 'degraded cue');
    }, 'degraded');

  // ---- S10 narrowest supported desktop width, cue + player states ----------------------
  await scenario('1101x720 narrowest width: cue, player open/closed, themes', { width: 1101, height: 720 }, async page => {
    await load(page);
    await enterTour(page);
    await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
    let l = await layout(page);
    checkNoOverlap(l, '1101 closed+cue');
    assert(l.info.x + l.info.width <= l.vw && l.map.x + l.map.width <= l.vw, 'info/map outside viewport at 1101');
    await crops(page, 'narrow-1101-cue');
    await page.click('.audio-launcher');
    await wait(450);
    await sampleNoOverlap(page, '1101 open', 6);
    l = await layout(page);
    assert(!(await cueState(page)).visible, 'cue still visible with the player open');
    for (const theme of ['night', 'day']) { await setTheme(page, theme); await setOpen(page, true); checkNoOverlap(await layout(page), `1101 ${theme} open`); }
    await crops(page, 'narrow-1101-open');
  });

  // ---- S11 reduced motion + keyboard selection --------------------------------------
  await scenario('reduced motion + keyboard: cue appears, Enter on speaker retires it, info swaps',
    { reducedMotion: true }, async page => {
      await load(page);
      await enterTour(page);
      await page.waitForFunction(() => document.querySelector('.sound-cue.is-visible'), { timeout: 4000 });
      const dur = await read(page, () => getComputedStyle(document.querySelector('.sound-cue')).transitionDuration);
      assert(/^0s(, 0s)*$/.test(dur), `reduced-motion cue transition ${dur}`);
      const infoDur = await read(page, () => getComputedStyle(document.querySelector('.hud-identity__slot')).transitionDuration);
      assert(/^0s(, 0s)*$/.test(infoDur), `reduced-motion info transition ${infoDur}`);
      await page.focus('.audio-launcher');
      await page.keyboard.press('Enter');
      await wait(300);
      assert(!(await cueState(page)).present, 'keyboard Enter on the launcher did not retire the cue');
      await page.keyboard.press('Enter');
      await wait(300);
      const T = await read(page, async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_T);
      await seek(page, T[0] + 0.01);
      await idle(page);
      checkHud(await hudState(page), 'reduced-motion after crossing');
    });

  // ---- S12 F key inert + Day/Night full-frame captures --------------------------------
  await scenario('F key inert in Tour; Day/Night captures', {}, async page => {
    await load(page);
    await enterTour(page);
    await wait(1500);
    const before = await read(page, async () => {
      const { state } = await import('/src/core/state.js');
      return { mode: state.mode, locked: state.scrollLocked, exp: state.experience };
    });
    await page.keyboard.press('f');
    await page.keyboard.press('F');
    await wait(600);
    const after = await read(page, async () => {
      const { state } = await import('/src/core/state.js');
      return { mode: state.mode, locked: state.scrollLocked, exp: state.experience,
        showcase: !!document.querySelector('#showcase-layer.is-open'),
        card: !!document.querySelector('#fullscreen-card.is-open'),
        spec: !!document.querySelector('#spec-panel.is-visible') };
    });
    assert(after.mode === before.mode && after.locked === before.locked && after.exp === before.exp
      && !after.showcase && !after.card && !after.spec, `F key changed Tour state: ${JSON.stringify({ before, after })}`);
    for (const theme of ['day', 'night']) {
      await setTheme(page, theme);
      await setOpen(page, false);
      await wait(500);
      await crops(page, `${theme}-tour`);
      await setOpen(page, true);
      await shot(page, `${theme}-bottomright-open`, { x: 1600 - 480, y: 900 - 520, width: 480, height: 520 });
      await setOpen(page, false);
    }
  });
} finally {
  report.failed = phases.filter(p => p.status === 'FAIL').length;
  await writeFile(`${outDir}verification-hud.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.failed) process.exitCode = 1;
}
