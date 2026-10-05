/** Browser verification for Grand Tour route position session persistence.
 * Usage: node scripts/verify-route-persistence.mjs [base-url]
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:5198/';
const root = '/tmp/gt3-route-persistence';
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const errors = [];
const report = { base, renderer: softwareGL ? 'SwiftShader fallback' : 'ANGLE/Metal', phases: [], errors };

function withQuery(url, search) {
  const next = new URL(url);
  next.search = search;
  return next.href;
}

function attachErrors(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
}

async function installRestoreActivityProbe(page) {
  await page.evaluateOnNewDocument(() => {
    const activity = { morphFrames: 0, gateFrames: 0, samples: 0 };
    window.__gt3RoutePersistenceActivity = activity;
    let morphModule;
    const sample = async () => {
      const readiness = window.__gt3?.readiness?.status;
      if (readiness === 'ready' || readiness === 'degraded') {
        morphModule ??= import('/src/scene/morph.js');
        const { isMorphing } = await morphModule;
        const gate = window.__gt3?.scene?.getObjectByName('checkpoint-traversal-response');
        activity.samples += 1;
        if (isMorphing()) activity.morphFrames += 1;
        if (gate?.visible) activity.gateFrames += 1;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__gt3?.readiness
    && ['ready', 'degraded'].includes(window.__gt3.readiness.status)
    && window.__gt3.scene?.getObjectByName('car-rig')
    && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const [{ state }, { isMorphing }] = await Promise.all([
      import('/src/core/state.js'), import('/src/scene/morph.js'),
    ]);
    const mount = window.__gt3.scene.getObjectByName('car-mount');
    const gate = window.__gt3.scene.getObjectByName('checkpoint-traversal-response');
    return {
      progress: state.progress,
      targetProgress: state.targetProgress,
      activeCarIndex: state.activeCarIndex,
      unlocked: [...state.unlocked].sort((a, b) => a - b),
      routeCar: mount?.children.filter((child) => child.name.startsWith('car-')).map((child) => child.name) ?? [],
      morphing: isMorphing(),
      gateVisible: gate?.visible ?? false,
      locked: state.scrollLocked,
      mode: state.mode,
      search: location.search,
      activity: { ...window.__gt3RoutePersistenceActivity },
    };
  });
}

async function waitForRest(page) {
  await page.waitForFunction(async () => {
    const { state } = await import('/src/core/state.js');
    return Math.abs(state.velocity) < 0.001 && state.speed01 < 0.01;
  }, { timeout: 15000, polling: 100 });
}

async function driveToMiddle(page) {
  await page.mouse.wheel({ deltaY: 180 }); // real gesture dismisses the start screen
  await wait(120);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const current = await snapshot(page);
    if (current.progress >= 0.37) {
      await waitForRest(page);
      const settled = await snapshot(page);
      assert(settled.progress >= 0.35 && settled.progress <= 0.45,
        `middle drive settled outside 35-45%: ${settled.progress}`);
      return settled;
    }
    await page.mouse.wheel({ deltaY: 180 });
    await wait(120);
  }
  throw new Error('real wheel input did not reach the middle of the route');
}

async function proveWheelDirections(page, baseline) {
  let forward = baseline;
  for (let attempt = 0; attempt < 12 && forward.progress <= baseline.progress + 0.002; attempt += 1) {
    await page.mouse.wheel({ deltaY: 300 });
    await wait(180);
    forward = await snapshot(page);
  }
  assert(forward.progress > baseline.progress + 0.002,
    `forward wheel did not advance route: ${baseline.progress} -> ${forward.progress}`);

  let backward = forward;
  for (let attempt = 0; attempt < 16 && backward.progress >= forward.progress - 0.002; attempt += 1) {
    await page.mouse.wheel({ deltaY: -300 });
    await wait(180);
    backward = await snapshot(page);
  }
  assert(backward.progress < forward.progress - 0.002,
    `backward wheel did not reverse route: ${forward.progress} -> ${backward.progress}`);
  return { forward, backward };
}

async function reloadAndAssert(page, before, expectedSearch) {
  await wait(600); // exceeds the 350 ms route write throttle before the reload lifecycle flush.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitReady(page);
  await wait(250);
  const restored = await snapshot(page);
  assert(Math.abs(restored.progress - before.progress) <= 0.002,
    `route progress did not restore: ${before.progress} -> ${restored.progress}`);
  assert(restored.activeCarIndex === before.activeCarIndex,
    `route car index did not restore: ${before.activeCarIndex} -> ${restored.activeCarIndex}`);
  assert(JSON.stringify(restored.routeCar) === JSON.stringify(before.routeCar),
    `route car model did not restore: ${before.routeCar} -> ${restored.routeCar}`);
  assert(JSON.stringify(restored.unlocked) === JSON.stringify(before.unlocked),
    `discovery state did not restore: ${restored.unlocked} != ${before.unlocked}`);
  assert(restored.activity.samples > 0 && restored.activity.morphFrames === 0
    && restored.activity.gateFrames === 0 && !restored.morphing && !restored.gateVisible,
  `restore was not silent: ${JSON.stringify(restored.activity)}`);
  assert(restored.search === expectedSearch,
    `location.search changed across reload: ${restored.search} != ${expectedSearch}`);
  return restored;
}

async function phase(name, work) {
  try {
    const value = await work();
    report.phases.push({ name, status: 'PASS' });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.phases.push({ name, status: 'FAIL', message });
    throw error;
  }
}

await mkdir(root, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--no-sandbox', '--no-first-run',
      ...(softwareGL
        ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
        : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
      `--user-data-dir=${root}/chrome-${process.pid}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });

  const page = await browser.newPage();
  attachErrors(page, 'session');
  await installRestoreActivityProbe(page);

  const defaultResult = await phase('default route restore', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    const saved = await driveToMiddle(page);
    const restored = await reloadAndAssert(page, saved, new URL(base).search);
    const wheel = await proveWheelDirections(page, restored);
    return { saved, restored, wheel };
  });
  report.default = defaultResult;

  const paceResult = await phase('pace route restore and URL preservation', async () => {
    const paceSearch = '?gate=quiet&scroll=pace';
    await page.goto(withQuery(base, paceSearch), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.mouse.wheel({ deltaY: 300 });
    await wait(450);
    // The bounded pace law keeps gliding after the input stops; snapshot only once the car is at rest,
    // otherwise the saved value legitimately trails the position persisted a moment later.
    await waitForRest(page);
    const saved = await snapshot(page);
    assert(saved.progress > 0 && saved.progress < 0.995,
      `pace route did not remain in a restorable range: ${saved.progress}`);
    const restored = await reloadAndAssert(page, saved, paceSearch);
    const wheel = await proveWheelDirections(page, restored);
    return { saved, restored, wheel };
  });
  report.pace = paceResult;

  const freshResult = await phase('fresh browser context starts fresh', async () => {
    const freshContext = await browser.createBrowserContext();
    try {
      const freshPage = await freshContext.newPage();
      attachErrors(freshPage, 'fresh');
      await freshPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await waitReady(freshPage);
      const fresh = await snapshot(freshPage);
      assert(Math.abs(fresh.progress) <= 0.00001, `fresh context started at ${fresh.progress}`);
      assert(JSON.stringify(fresh.unlocked) === JSON.stringify([0]),
        `fresh context discovery was not default: ${fresh.unlocked}`);
      return fresh;
    } finally {
      await freshContext.close();
    }
  });
  report.fresh = freshResult;

  const finishResult = await phase('finish-state refresh restores the scorecard only', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await page.mouse.wheel({ deltaY: 180 }); // a real gesture first, as a visitor would
    await wait(300);
    await page.evaluate(async () => {
      const { seekTo } = await import('/src/scroll/scrollDrive.js');
      seekTo(1, { instant: true });
    });
    await page.waitForFunction(async () => {
      const { state } = await import('/src/core/state.js');
      return state.mode === 'finish' && state.progress >= 0.995;
    }, { timeout: 15000, polling: 100 });
    await wait(600); // exceeds the 350 ms route write throttle before the reload lifecycle flush.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await waitReady(page);
    await wait(1800); // longer than the 1300 ms dismissal fade, so a late sound cue would exist by now
    const finishDom = () => page.evaluate(() => {
      const start = document.getElementById('start-screen');
      const finish = document.getElementById('finish-screen');
      const visible = (node) => !!node && !node.hidden && node.getAttribute('aria-hidden') !== 'true'
        && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden'
        && Number(getComputedStyle(node).opacity) > 0.5;
      return {
        startVisible: visible(start), startHidden: !!start?.hidden,
        finishVisible: visible(finish), soundCue: !!document.querySelector('.sound-cue'),
      };
    });
    const restoredDom = await finishDom();
    const restored = await snapshot(page);
    assert(restored.progress >= 0.995, `finish route position did not restore: ${restored.progress}`);
    assert(restored.mode === 'finish' && restored.locked, `finish restore not locked: ${restored.mode}/${restored.locked}`);
    assert(restoredDom.finishVisible, 'finish screen not visible after finish refresh');
    assert(restoredDom.startHidden && !restoredDom.startVisible, 'start screen still visible under the finish card');
    assert(!restoredDom.soundCue, 'sound cue appeared on a finish restore');
    assert(restored.activity.morphFrames === 0 && restored.activity.gateFrames === 0, `finish restore was not silent: ${JSON.stringify(restored.activity)}`);

    await page.click('#finish-screen .finish-replay');
    await page.waitForFunction(async () => {
      const { state } = await import('/src/core/state.js');
      return state.progress === 0 && state.mode === 'race' && !state.scrollLocked;
    }, { timeout: 15000, polling: 100 });
    await wait(300);
    const replayed = await snapshot(page);
    assert(replayed.activeCarIndex === 0, `replay did not reset the route car: ${replayed.activeCarIndex}`);
    let driven = replayed;
    for (let attempt = 0; attempt < 12 && driven.progress <= 0.002; attempt += 1) {
      await page.mouse.wheel({ deltaY: 300 });
      await wait(180);
      driven = await snapshot(page);
    }
    assert(driven.progress > 0.002, `drive did not work after replay: ${driven.progress}`);
    const afterDom = await finishDom();
    assert(!afterDom.finishVisible, 'finish screen still visible after replay');
    return { restored, restoredDom, replayed, driven };
  });
  report.finish = finishResult;

  await phase('console errors', async () => {
    assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  });
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
} finally {
  report.errors = errors;
  report.failed = report.phases.filter((entry) => entry.status === 'FAIL').length;
  if (report.failure && report.failed === 0) report.failed = 1;
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  if (report.failed) process.exitCode = 1;
}
