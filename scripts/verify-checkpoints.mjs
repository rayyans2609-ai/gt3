/** Browser verification for Phase 3c. Usage: GT3_URL=http://127.0.0.1:5187 node scripts/verify-checkpoints.mjs */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || 'http://127.0.0.1:5187';
const root = '/tmp/gt3-3c';
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
await mkdir(root, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run',
    ...(softwareGL ? ['--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
      : ['--enable-gpu', '--use-gl=angle', '--use-angle=metal']),
    `--user-data-dir=${root}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const phases = [];
const recordPhase = async (name, work) => {
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
};
const report = { renderer: softwareGL ? 'SwiftShader fallback' : 'ANGLE/Metal', phases, errors };

try {
  const ready = await recordPhase('startup', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig')
      && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
    await page.mouse.wheel({ deltaY: 240 });
    await wait(1600);
    return true;
  });
  if (ready) {
  const route = await recordPhase('route metadata', async () => {
    const thresholds = await page.evaluate(async () =>
      (await import('/src/scene/trackCurve.js')).CHECKPOINT_T);
    const carIds = await page.evaluate(async () =>
      (await import('/src/data/cars.js')).CARS.map(car => car.id));
    return { thresholds, carIds };
  });
  if (route) {
  const { thresholds, carIds } = route;
  const expected = progress => thresholds.filter(t => t <= progress).length;

  async function read() {
    return page.evaluate(async () => {
      const { state } = await import('/src/core/state.js');
      const { isMorphing } = await import('/src/scene/morph.js');
      const mount = window.__gt3.scene.getObjectByName('car-mount');
      return { progress: state.progress, active: state.activeCarIndex,
        unlocked: [...state.unlocked].sort((a, b) => a - b),
        model: mount.children.filter(child => child.name.startsWith('car-')).map(child => child.name),
        morphing: isMorphing(), locked: state.scrollLocked, mode: state.mode,
        montage: !!document.querySelector('#montage-layer.is-active'),
        spec: !!document.querySelector('#spec-panel.is-visible'),
        showcase: !!document.querySelector('#showcase-layer.is-open'),
        card: !!document.querySelector('#fullscreen-card.is-open') };
    });
  }

  async function seek(progress, { instant = false, settle = 1050 } = {}) {
    await page.evaluate(async ({ progress, instant }) => {
      const { seekTo } = await import('/src/scroll/scrollDrive.js');
      seekTo(progress, { instant });
    }, { progress, instant });
    await page.waitForFunction(target => Math.abs(window.__gt3.probe().progress - target) < 0.00025,
      { timeout: 30000 }, progress).catch(async error => {
      const detail = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        return { probe: window.__gt3.probe(), started: state.started, locked: state.scrollLocked,
          mode: state.mode, target: state.targetProgress,
          screen: document.querySelector('#start-screen')?.className,
          finish: document.querySelector('#finish-screen')?.className };
      });
      throw new Error(`seek(${progress}, instant=${instant}) progress wait: ${error.message}; ` +
        JSON.stringify(detail)); });
    await wait(settle);
    // `settle` covers ordinary camera/UI easing, but a jump that crosses checkpoints can
    // start a morph (nominal duration 0.85s) whose WALL-CLOCK completion depends on frame
    // delivery, not just its own timer -- under host CPU pressure it can outlast `settle`.
    // Wait on the real completion signal instead of assuming a fixed delay is enough; if a
    // morph is genuinely stuck this just times out and falls through to read()/check(),
    // which still asserts !morphing and fails correctly.
    await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing(),
      { timeout: 15000, polling: 100 }).catch(() => {});
    return read();
  }

  function check(snapshot, label, allowFinish = false) {
    const index = expected(snapshot.progress);
    assert(snapshot.active === index, `${label}: active ${snapshot.active} != ${index}`);
    assert(!snapshot.morphing, `${label}: morph still active`);
    assert(snapshot.model.length === 1 && snapshot.model[0] === `car-${carIds[index]}`,
      `${label}: model ${snapshot.model} != car-${carIds[index]}`);
    assert(!snapshot.montage && !snapshot.spec && !snapshot.showcase && !snapshot.card,
      `${label}: an overlay opened`);
    if (!allowFinish) assert(!snapshot.locked, `${label}: scroll locked`);
  }

  const forward = [];
  const backward = [];
  const stops = [...new Set([0, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 0.049),
    ...thresholds.flatMap(t => [t - 0.003, t + 0.003]), 1])].sort((a, b) => a - b);
  await recordPhase('forward and backward discovery sweeps', async () => {
    let forwardUnlocked = 1;
    for (const t of stops) {
      const snapshot = await seek(t, { instant: t === 1 });
      check(snapshot, `forward ${t}`, t === 1);
      assert(snapshot.unlocked.includes(0), `forward ${t}: Lexus missing from discoveries`);
      assert(snapshot.unlocked.length >= forwardUnlocked, `forward ${t}: discovery shrank`);
      for (let index = 1; index <= expected(snapshot.progress); index++) {
        assert(snapshot.unlocked.includes(index), `forward ${t}: car ${index} was not discovered`);
      }
      forwardUnlocked = snapshot.unlocked.length;
      forward.push(snapshot);
    }
    console.log(`forward sweep: ${forward.length} stops`);
    await page.evaluate(async () => (await import('/src/ui/finishScreen.js')).hideFinishScreen());
    let priorUnlocked = forward.at(-1).unlocked.length;
    for (const t of stops.slice(0, -1).reverse()) {
      const snapshot = await seek(t);
      check(snapshot, `backward ${t}`);
      assert(snapshot.unlocked.length >= priorUnlocked, `discovery shrank at ${t}`);
      priorUnlocked = snapshot.unlocked.length;
      backward.push(snapshot);
    }
    console.log(`backward sweep: ${backward.length} stops`);
  });

  const oscillation = [];
  await recordPhase('real-wheel gate reversals', async () => {
    for (const gate of [thresholds[2], thresholds[6]]) {
      const below = expected(gate - 0.003);
      const above = expected(gate + 0.003);
      await seek(gate - 0.003, { instant: true, settle: 450 });
      const end = Date.now() + 9000;
      const seen = new Set();
      let crossings = 0;
      // Each burst owns its full budget; capping it by the phase deadline let the final
      // backward burst start with almost no time left and fail spuriously.
      const burstMs = 2500;
      async function driveUntil(deltaY, target) {
        const burstEnd = Date.now() + burstMs;
        while (Date.now() < burstEnd) {
          await page.mouse.wheel({ deltaY });
          await wait(110);
          const snapshot = await read();
          seen.add(snapshot.active);
          assert(!snapshot.locked && !snapshot.montage && !snapshot.spec && !snapshot.showcase,
            `wheel crossing ${gate}: interruption`);
          if (snapshot.active === target) return true;
        }
        return false;
      }
      // Start a forward+backward pair only when both bursts' full budgets still fit.
      do {
        assert(await driveUntil(150, above), `wheel input did not cross forward over gate ${gate}`);
        crossings++;
        assert(await driveUntil(-150, below), `wheel input did not cross backward over gate ${gate}`);
        crossings++;
      } while (end - Date.now() > 2 * burstMs);
      assert(crossings >= 2, `wheel oscillation at gate ${gate} made only ${crossings} crossings`);
      const settled = await seek(gate - 0.003, { settle: 1050 });
      check(settled, `oscillation ${gate}`);
      assert(seen.has(below) && seen.has(above),
        `wheel input did not cross both sides of gate ${gate}: ${[...seen]}`);
      oscillation.push({ gate, crossings, observedIndices: [...seen].sort((a, b) => a - b), settled });
    }
    console.log('wheel oscillation complete');
  });

  let far;
  let back;
  await recordPhase('instant seeks', async () => {
    far = await seek(0.91, { instant: true });
    check(far, 'instant forward');
    back = await seek(0.04, { instant: true });
    check(back, 'instant backward');
  });

  // A fresh page in the same browser tab must restore discovery while route
  // position remains intentionally outside this phase's persistence scope.
  let restored;
  await recordPhase('reload and discovery restoration', async () => {
    assert(far, 'instant forward seek did not produce a restoration baseline');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig')
      && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
    restored = await read();
    assert(JSON.stringify(restored.unlocked) === JSON.stringify(far.unlocked),
      `session discovery did not restore: ${restored.unlocked}`);
  });

  // Replay is a separate reset path from reversing through the route. It must
  // return the visible car to Lexus without clearing discoveries.
  let replayed;
  await recordPhase('replay preserves discoveries', async () => {
    assert(restored, 'reload did not produce a replay baseline');
    await page.mouse.wheel({ deltaY: 240 });
    await seek(1, { instant: true });
    await page.click('.finish-replay');
    await wait(250);
    replayed = await read();
    check(replayed, 'replay');
    assert(JSON.stringify(replayed.unlocked) === JSON.stringify(restored.unlocked),
      'replay cleared discoveries');
  });

  async function frames(duration) {
    return page.evaluate(ms => new Promise(resolve => {
      const gaps = [];
      let previous = 0;
      const start = performance.now();
      function sample(time) {
        if (previous) gaps.push(time - previous);
        previous = time;
        if (time - start < ms) requestAnimationFrame(sample);
        else resolve(gaps);
      }
      requestAnimationFrame(sample);
    }), duration);
  }
  function stats(samples) {
    const ordered = samples.filter(ms => ms > 0).sort((a, b) => a - b);
    const longFrames = ordered.filter(ms => ms >= 250);
    return { frames: ordered.length, p50: ordered[Math.floor(ordered.length * 0.5)] ?? null,
      p95: ordered[Math.floor(ordered.length * 0.95)] ?? null,
      longFrames: { count: longFrames.length, ms: longFrames } };
  }
  let idle;
  let swap;
  await recordPhase('frame and swap diagnostics', async () => {
  await page.mouse.wheel({ deltaY: 240 });
  // The wheel is applied as native scrolling after mouse.wheel() resolves and would
  // override a seek issued too early (progress lands at the wheel's 0.2163, never 0.2).
  // Let the wheel scroll and the drive settle, then seek.
  for (let stable = 0, last = null; stable < 3;) {
    await wait(400);
    const y = await page.evaluate(() => window.scrollY);
    stable = y === last ? stable + 1 : 0;
    last = y;
  }
  await seek(0.2);
  idle = stats(await frames(1600));

  // Settle on one side of a single gate. Capturing the diagnostic image happens in
  // a separate swap so screenshot encoding cannot contaminate the frame-time sample.
  const swapStart = thresholds[1] - 0.005;
  const swapEnd = thresholds[1] + 0.004;
  const beforeSwap = await seek(swapStart, { instant: true, settle: 1050 });
  const expectedSwapIndex = expected(swapEnd);
  assert(beforeSwap.active !== expectedSwapIndex,
    `swap setup did not straddle one gate: ${beforeSwap.active} -> ${expectedSwapIndex}`);
  await page.evaluate(async () => {
    const { onMorphComplete } = await import('/src/scene/morph.js');
    window.__cpMorphCompletions = [];
    onMorphComplete(index => window.__cpMorphCompletions.push(index));
  });
  await page.evaluate(async t => (await import('/src/scroll/scrollDrive.js')).seekTo(t, { instant: true }), swapEnd);
  await wait(300);
  await page.screenshot({ path: `${root}/swap-day.png` });
  await page.waitForFunction(index => window.__cpMorphCompletions.includes(index),
    { timeout: 30000 }, expectedSwapIndex).catch(async error => {
    throw new Error(`captured-swap completion wait (expected ${expectedSwapIndex}): ${error.message}; ` +
      JSON.stringify({ completions: await page.evaluate(() => window.__cpMorphCompletions), state: await read() })); });
  const capturedSwap = await read();
  assert(capturedSwap.active === expectedSwapIndex && capturedSwap.model.length === 1
    && capturedSwap.model[0] === `car-${carIds[expectedSwapIndex]}`,
  `captured swap did not complete at car ${expectedSwapIndex}: ${JSON.stringify(capturedSwap)}`);

  // Return to the settled start, then measure one uninterrupted crossing of this
  // exact gate. Unlike the old Audi -> Nissan -> Audi sequence, this cannot cancel
  // the swap before its midpoint.
  await seek(swapStart, { instant: true, settle: 1050 });
  const swapPromise = frames(1200);
  const completedBefore = await page.evaluate(() => window.__cpMorphCompletions.length);
  await page.evaluate(async t => (await import('/src/scroll/scrollDrive.js')).seekTo(t, { instant: true }),
    swapEnd);
  swap = stats(await swapPromise);
  await page.waitForFunction(({ count, index }) =>
    window.__cpMorphCompletions.length > count &&
    window.__cpMorphCompletions.at(-1) === index,
  { timeout: 30000 }, { count: completedBefore, index: expectedSwapIndex }).catch(async error => {
    throw new Error(`measured-swap completion wait (expected ${expectedSwapIndex}, before=${completedBefore}): ` +
      `${error.message}; ` + JSON.stringify({ completions: await page.evaluate(() => window.__cpMorphCompletions),
        state: await read() })); });
  const measuredSwap = await read();
  assert(measuredSwap.active === expectedSwapIndex && measuredSwap.model.length === 1
    && measuredSwap.model[0] === `car-${carIds[expectedSwapIndex]}`,
  `measured swap did not complete at car ${expectedSwapIndex}: ${JSON.stringify(measuredSwap)}`);

  });

  const captures = [];
  await recordPhase('day and night captures', async () => {
  for (const theme of ['day', 'night']) {
    await page.evaluate(async name => (await import('/src/scene/theme.js')).applyTheme(name, { instant: true }), theme);
    for (const index of [0, 4, 8]) {
      await seek(thresholds[index] - 0.003, { instant: true, settle: 850 });
      const path = `${root}/${theme}-gate-${index + 1}.png`;
      await page.screenshot({ path });
      captures.push(path);
    }
  }
  });

  await recordPhase('console errors', async () => {
    assert(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  });
  report.routeLengthM = await page.evaluate(async () =>
    (await import('/src/scene/trackCurve.js')).TRACK_LENGTH);
  Object.assign(report, { thresholds, forwardStops: forward.length, backwardStops: backward.length,
    forwardFinal: forward.at(-1), backwardFinal: backward.at(-1),
    replayed, oscillation, instantSeek: { far, back }, restored, frameMs: { idle, swap }, captures });
  }
  }
} finally {
  report.errors = errors;
  report.failed = phases.filter(phase => phase.status === 'FAIL').length;
  await writeFile(`${root}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.failed) process.exitCode = 1;
}
