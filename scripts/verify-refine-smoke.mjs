/**
 * Targeted Phase 5 interaction smoke check. Run only through scripts/run-harness.sh, which
 * supplies GT3_URL and owns the Vite server. This proves state/behaviour, not visual acceptance.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5243';
const out = path.resolve(process.env.GT3_OUT || 'local/evidence/p5-refine/smoke');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { base, cases: {}, errors: [] };
const STORAGE_KEY = 'gt3.session.v1';
const ROUTE_SESSION = { routeMapping: 'grid-v1', routeGridDistance: 18 };
let browser;

function assert(ok, message) { if (!ok) throw new Error(message); }
function number(value) { return Math.round(value * 10000) / 10000; }

async function until(page, predicate, { timeout = 60000, step = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await predicate();
    if (value) return value;
    await wait(step);
  }
  throw new Error(`${label} not met within ${Math.round(timeout / 1000)}s; last=${JSON.stringify(value)}`);
}

function watch(page) {
  page.on('pageerror', error => report.errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) report.errors.push(`console: ${message.text()}`);
  });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    return {
      experience: state.experience,
      progress: state.progress,
      routeProgress: (() => { try { return JSON.parse(sessionStorage.getItem('gt3.session.v1'))?.routeProgress ?? null; } catch { return null; } })(),
      theme: state.theme,
      unlocked: [...state.unlocked].sort((a, b) => a - b),
      landingProgress: window.__gt3?.landing?.progress?.(),
      landing: window.__gt3?.landing ? {
        loaded: window.__gt3.landing.loaded(), active: window.__gt3.landing.active(),
        drag: window.__gt3.landing.drag?.(),
      } : null,
    };
  });
}

async function seed(page, value) {
  await page.evaluate((record) => {
    sessionStorage.clear();
    sessionStorage.setItem('gt3.session.v1', JSON.stringify(record));
  }, { theme: 'day', ...ROUTE_SESSION, ...value });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.mouse.move(720, 450);
}

async function awaitLanding(page) {
  return until(page, async () => {
    const s = await snapshot(page);
    return s.experience === 'landing' && s.landing?.loaded ? s : null;
  }, { timeout: 90000, label: 'loaded Landing' });
}

async function awaitHub(page) {
  return until(page, async () => {
    const s = await snapshot(page);
    const ready = await page.$eval('#hub[data-readiness="ready"] .hub-start:not([disabled])', el => !!el).catch(() => false);
    return s.experience === 'hub' && ready ? s : null;
  }, { timeout: 120000, label: 'interactive Hub' });
}

async function scrollToHub(page) {
  for (let i = 0; i < 90; i++) {
    if ((await snapshot(page)).experience === 'hub') return await awaitHub(page);
    await page.mouse.wheel({ deltaY: 240 });
    await wait(55);
  }
  throw new Error('Landing did not reach Hub within 90 wheel steps');
}

async function bootHub(page, record) {
  await seed(page, { experience: 'hub', routeProgress: 0, unlocked: [0], ...record });
  return await awaitHub(page);
}

async function cssCarColor(page, index) {
  return page.evaluate(async (carIndex) => {
    const { CARS } = await import('/src/data/cars.js');
    const probe = document.createElement('i');
    probe.style.color = CARS[carIndex].identityColor;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, index);
}

async function caseResult(name, fn) {
  try {
    const detail = await fn();
    report.cases[name] = { pass: true, ...detail };
    console.log(`PASS ${name}: ok`);
  } catch (error) {
    report.cases[name] = { pass: false, failure: error.message };
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

await mkdir(out, { recursive: true });
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--hide-scrollbars',
      `--user-data-dir=${path.join(out, `chrome-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  watch(page);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.mouse.move(720, 450);

  await caseResult('cars-locked-resist', async () => {
    await seed(page, { experience: 'landing', routeProgress: 0, unlocked: [0] });
    await awaitLanding(page);
    await scrollToHub(page);
    const before = await page.evaluate(() => ({ open: document.querySelector('.hub-cars__toggle')?.getAttribute('aria-expanded'),
      lap: getComputedStyle(document.querySelector('.hub-plan__lap')).opacity }));
    await page.click('.hub-cars__bar:nth-child(6)');
    await wait(145);
    const moved = await page.evaluate(() => {
      const tx = el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
      const bar = document.querySelector('.hub-cars__bar:nth-child(6)');
      const name = document.querySelector('.hub-cars__name');
      return { bar: tx(bar), name: tx(name), resisted: [bar, name].map(el => el.classList.contains('is-resisted')),
        open: document.querySelector('.hub-cars__toggle').getAttribute('aria-expanded'),
        lap: getComputedStyle(document.querySelector('.hub-plan__lap')).opacity };
    });
    assert(Math.abs(moved.bar) > 0.1 || moved.resisted[0], `locked bar did not resist: ${JSON.stringify(moved)}`);
    assert(Math.abs(moved.name) > 0.1 || moved.resisted[1], `Cars label did not resist: ${JSON.stringify(moved)}`);
    assert(moved.open === 'false' && moved.lap === before.lap, `locked bar opened/pulsed: ${JSON.stringify(moved)}`);
    await wait(500);
    const settled = await page.evaluate(() => {
      const tx = el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41;
      return { bar: tx(document.querySelector('.hub-cars__bar:nth-child(6)')), name: tx(document.querySelector('.hub-cars__name')) };
    });
    assert(Math.abs(settled.bar) < 0.05 && Math.abs(settled.name) < 0.05, `resist did not settle: ${JSON.stringify(settled)}`);
    return { before, moved, settled };
  });

  await caseResult('cars-unlocked-hover', async () => {
    await bootHub(page, { unlocked: [0, 2, 6] });
    const expected = await cssCarColor(page, 2);
    const before = await page.evaluate(() => [...document.querySelectorAll('.hub-cars__bar')].map(el => el.getBoundingClientRect().x));
    await page.hover('.hub-cars__bar:nth-child(3)');
    await wait(320);
    const observed = await page.evaluate(() => {
      const bar = document.querySelector('.hub-cars__bar:nth-child(3)');
      const inner = bar.firstElementChild;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
      return { scaleY: matrix.m22, color: getComputedStyle(inner).backgroundColor,
        positions: [...document.querySelectorAll('.hub-cars__bar')].map(el => el.getBoundingClientRect().x) };
    });
    assert(observed.scaleY > 1.05, `found bar did not expand: scaleY=${observed.scaleY}`);
    assert(observed.color === expected, `bar colour=${observed.color}, expected=${expected}`);
    const shifted = observed.positions.some((x, i) => i !== 2 && Math.abs(x - before[i]) > 0.5);
    assert(!shifted, `sibling bar layout shifted: before=${before}, after=${observed.positions}`);
    return { expected, before, observed };
  });

  await caseResult('cars-name-colour-and-pulse', async () => {
    await bootHub(page, { unlocked: [0, 2, 6] });
    await page.click('.hub-cars__toggle');
    await until(page, () => page.$eval('#hub-plan-cars .hub-plan__car:nth-child(7)', el => getComputedStyle(el).opacity > 0.5),
      { label: 'Cars labels visible' });
    const expected = await cssCarColor(page, 6);
    const name = '#hub-plan-cars .hub-plan__car:nth-child(7)';
    await page.hover(name);
    await wait(400);
    const hover = await page.evaluate(sel => ({ color: getComputedStyle(document.querySelector(sel)).fill,
      lapOpacity: Number(getComputedStyle(document.querySelector('.hub-plan__lap')).opacity),
      lapAnimations: document.querySelector('.hub-plan__lap').getAnimations().filter(a => a.playState === 'running').length }), name);
    assert(hover.color === expected, `name colour=${hover.color}, expected=${expected}`);
    assert(hover.lapOpacity < 0.05 && hover.lapAnimations === 0, `name hover started a pulse: ${JSON.stringify(hover)}`);
    await page.click(name);
    await wait(160);
    const pulse = await page.evaluate(() => {
      const lap = document.querySelector('.hub-plan__lap');
      return { color: lap.style.getPropertyValue('--car-color'), opacity: Number(getComputedStyle(lap).opacity) };
    });
    const expectedHex = await page.evaluate(async () => (await import('/src/data/cars.js')).CARS[6].identityColor);
    assert(pulse.color === expectedHex && pulse.opacity > 0, `discovered name did not pulse: ${JSON.stringify(pulse)}`);
    await wait(3100);
    await page.click('#hub-plan-cars .hub-plan__car:nth-child(6)');
    await wait(250);
    const locked = await page.evaluate(() => ({ opacity: Number(getComputedStyle(document.querySelector('.hub-plan__lap')).opacity),
      animations: document.querySelector('.hub-plan__lap').getAnimations().filter(a => a.playState === 'running').length }));
    assert(locked.opacity < 0.05 && locked.animations === 0, `locked ? name started pulse: ${JSON.stringify(locked)}`);
    return { expected, hover, pulse, locked };
  });

  await caseResult('landing-drag', async () => {
    await seed(page, { experience: 'landing', routeProgress: 0, unlocked: [0] });
    await awaitLanding(page);
    await page.mouse.move(600, 600); await page.mouse.down(); await page.mouse.move(800, 600, { steps: 8 });
    await wait(220);
    const dragged = await snapshot(page);
    const d0 = dragged.landing.drag;
    assert(Math.abs(d0.yaw) > 0.02 && Math.abs(d0.yaw) <= d0.yawLimit + 1e-5,
      `drag yaw invalid: ${JSON.stringify(d0)}`);
    await page.mouse.up();
    await wait(3700);
    const returned = await snapshot(page);
    const d1 = returned.landing.drag;
    assert(Math.abs(d1.yaw) < Math.abs(d0.yaw) * 0.35, `drag did not return toward zero: before=${d0.yaw}, after=${d1.yaw}`);
    await page.mouse.wheel({ deltaY: 360 }); await wait(700);
    const scrolled = await snapshot(page);
    assert(scrolled.landingProgress > 0.05, `wheel did not advance Landing after drag: ${scrolled.landingProgress}`);
    return { dragged: d0, returned: d1, landingProgressAfterWheel: number(scrolled.landingProgress) };
  });

  await caseResult('gt3-direct-landing', async () => {
    await seed(page, { experience: 'landing', routeProgress: 0.4, unlocked: [0, 2, 6] });
    await awaitLanding(page);
    await scrollToHub(page);
    const before = await snapshot(page);
    await page.click('.hub-mark');
    const samples = [];
    for (let i = 0; i < 24; i++) { await wait(30); samples.push((await snapshot(page)).landingProgress); }
    const landed = await until(page, async () => (await snapshot(page)).experience === 'landing' ? await snapshot(page) : null,
      { timeout: 1500, label: 'direct GT3 Landing' });
    assert(Math.abs(landed.landingProgress) < 0.01, `Landing did not reset: ${landed.landingProgress}`);
    assert(!samples.some(p => p > 0.05 && p < 0.95), `direct landing reverse-played: ${samples}`);
    assert(landed.theme === before.theme && JSON.stringify(landed.unlocked) === JSON.stringify(before.unlocked)
      && landed.routeProgress === before.routeProgress,
    `state changed: before=${JSON.stringify(before)}, after=${JSON.stringify(landed)}`);
    const hub = await scrollToHub(page);
    return { before, landed, samples: samples.map(number), returnedExperience: hub.experience };
  });

  await caseResult('leader-persisted-position', async () => {
    await bootHub(page, { routeProgress: 0.4, unlocked: [0] });
    await page.hover('.hub-start'); await wait(520);
    const mid = await page.evaluate(() => {
      const point = d => { const m = d.trim().match(/[-+]?\d*\.?\d+/g)?.map(Number) || []; return { x: m.at(-2), y: m.at(-1) }; };
      const translated = d => { const m = d.match(/translate\(([-+.\d]+) ([-+.\d]+)\)/); return { x: Number(m?.[1]), y: Number(m?.[2]) }; };
      const leader = document.querySelector('.hub-plan__leader'); const here = document.querySelector('.hub-plan__here');
      const start = document.querySelector('.hub-plan__start');
      const startPoint = translated(start.getAttribute('transform'));
      return { end: point(leader.getAttribute('d')), here: { x: Number(here.getAttribute('cx')), y: Number(here.getAttribute('cy')) }, start: startPoint,
        opacity: Number(getComputedStyle(leader).opacity) };
    });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    assert(mid.opacity > 0 && dist(mid.end, mid.here) <= 6 && dist(mid.end, mid.start) > 30,
      `persisted leader endpoint wrong: ${JSON.stringify(mid)}`);
    await bootHub(page, { routeProgress: 0, unlocked: [0] });
    await page.hover('.hub-start'); await wait(520);
    const fresh = await page.evaluate(() => {
      const point = d => { const m = d.trim().match(/[-+]?\d*\.?\d+/g)?.map(Number) || []; return { x: m.at(-2), y: m.at(-1) }; };
      const translated = d => { const m = d.match(/translate\(([-+.\d]+) ([-+.\d]+)\)/); return { x: Number(m?.[1]), y: Number(m?.[2]) }; };
      const leader = document.querySelector('.hub-plan__leader'); const start = document.querySelector('.hub-plan__start');
      return { end: point(leader.getAttribute('d')), start: translated(start.getAttribute('transform')) };
    });
    assert(dist(fresh.end, fresh.start) <= 6, `fresh leader did not end at start: ${JSON.stringify(fresh)}`);
    return { mid, fresh, midDistance: number(dist(mid.end, mid.here)), freshDistance: number(dist(fresh.end, fresh.start)) };
  });

  report.pass = Object.values(report.cases).every(result => result.pass);
} catch (error) {
  report.pass = false;
  report.failure = error.stack || error.message;
} finally {
  await browser?.close().catch(() => {});
  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
