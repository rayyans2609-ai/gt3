/** WS-B: real input, stopwatch lifecycle, restored V1 finish (run-out, completion lock) and silence.
 * Run through the canonical heavy gate with a fresh owned server. Captures are human review evidence.
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.GT3_URL || 'http://127.0.0.1:5204';
const out = process.env.GT3_OUT || '/tmp/gt3-timer-finish';
await mkdir(out, { recursive: true });
const visualOnly = process.env.GT3_TIMER_ONLY === 'visual';
const finishOnly = process.env.GT3_TIMER_ONLY === 'finish';
const report = { finishOnly, source: process.env.GT3_SOURCE, base, checks: {}, errors: [] };
const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
let page;
async function snap() {
  return page.evaluate(async () => {
    const [{ state }, { isMorphing }, route] = await Promise.all([
      import('/src/core/state.js'), import('/src/scene/morph.js'),
      import('/src/scene/trackCurve.js'),
    ]);
    const g = window.__gt3, rig = g.scene.getObjectByName('car-rig');
    const ndc = rig.position.clone().project(g.camera);
    return { p: state.progress, target: state.targetProgress, tail: state.finishTailMeters,
      elapsed: state.lapElapsedMs, running: state.lapRunning, frozen: state.lapFrozen,
      ack: state.finishAcknowledged, mode: state.mode, locked: state.scrollLocked, started: state.started,
      car: state.activeCarIndex, unlocked: [...state.unlocked], experience: state.experience,
      camera: [...g.camera.position.toArray(), ...g.camera.quaternion.toArray(), g.camera.fov],
      position: rig.position.toArray(), ndc: ndc.toArray(),
      t: route.routeTAt(state.progress + state.finishTailMeters / route.TOUR_LENGTH),
      morphing: isMorphing(), gateVisible: g.scene.getObjectByName('checkpoint-traversal-response')?.visible,
      sfx: window.__gt3SfxLog?.checkpointCross ?? 0, audioStarts: window.__wsbAudioStarts,
      completions: window.__wsbCompletions ?? 0, theme: state.theme,
      ready: g.readiness.status, timerText: document.querySelector('.hud-lap-timer').textContent,
    };
  });
}
async function ready({ unlocked = true } = {}) {
  await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 180000 });
  // A completed (V1) restore stays locked under the finish notice.
  if (unlocked) await page.waitForFunction(async () => !(await import('/src/core/state.js')).state.scrollLocked, { timeout: 10000 });
  await wait(250);
}
async function seek(p, instant = true) {
  await page.evaluate(async (p, instant) => (await import('/src/scroll/scrollDrive.js')).seekTo(p, { instant }), p, instant);
  await wait(1400);
}
async function wheels(delta, count = 5) {
  for (let i = 0; i < count; i++) { await page.mouse.wheel({ deltaY: delta }); await wait(100); }
}
async function until(predicate, delta, max = 40) {
  for (let i = 0; i < max; i++) { const s = await snap(); if (predicate(s)) return s; await wheels(delta, 1); }
  throw new Error(`wheel target not reached: ${JSON.stringify(await snap())}`);
}
const samePose = (a, b) => a.camera.every((v, i) => Math.abs(v - b.camera[i]) < 1e-10);
async function record(name, fn) {
  try { const data = await fn(); report.checks[name] = { result: 'PASS', data }; console.log(`PASS ${name}`); }
  catch (error) { report.checks[name] = { result: 'FAIL', error: error.message }; throw error; }
  finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
}
try {
  page = await browser.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.evaluateOnNewDocument(() => {
    window.__wsbAudioStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { window.__wsbAudioStarts++; return start.apply(this, args); };
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await ready();
  const constants = await page.evaluate(async () => {
    const r = await import('/src/scene/trackCurve.js'); const t = await import('/src/scroll/finishTail.js');
    return { length: r.TOUR_LENGTH, trackLength: r.TRACK_LENGTH, firstLine: r.FIRST_LINE_PROGRESS,
      cp1: r.CHECKPOINT_ROUTE_T[0], tailMax: t.FINISH_TAIL_METERS, pastLine: t.FINISH_PAST_LINE_METERS };
  });
  report.constants = constants;
  if (visualOnly) {
    await seek(1 - 12 / constants.length);
    await until(s => s.mode === 'finish', 100);
    await wait(1500);
    await record('refreshed timer and completion Day Night captures', async () => {
      const data = {};
      for (const theme of ['day', 'night']) {
        await page.evaluate(async t => (await import('/src/core/state.js')).set('theme', t), theme);
        await wait(1000);
        await page.screenshot({ path: `${out}/finish-v1-${theme}.png` });
        data[theme] = await snap();
        data[theme].timerStyle = await page.evaluate(() => {
          const s = getComputedStyle(document.querySelector('.hud-lap-timer'));
          return { color: s.color, stroke: s.webkitTextStroke, weight: s.fontWeight };
        });
      }
      await page.click('.audio-launcher'); await wait(500);
      await page.screenshot({ path: `${out}/finish-v1-player-expanded.png` });
      return data;
    });
  } else {
  if (!finishOnly) {
  await record('readiness and programmatic seeks never start stopwatch', async () => {
    const initial = await snap(); assert.equal(initial.elapsed, 0); assert.equal(initial.running, false);
    await seek(.03); await seek(.04, false); const sought = await snap();
    assert.equal(sought.elapsed, 0); assert.equal(sought.started, false);
    await seek(0); return { initial, sought };
  });
  await record('normal travel idle grace resume reverse and neutral first gantry', async () => {
    await wheels(180, 8); await wait(200); const moving = await snap();
    assert(moving.elapsed > 200 && moving.running && moving.started);
    assert(moving.p > constants.firstLine && moving.mode === 'race' && moving.car === 0 && !moving.ack);
    await wait(2300); const idle = await snap(); assert(!idle.running);
    await wait(1300); assert.equal((await snap()).elapsed, idle.elapsed);
    await wheels(180, 5); const resumed = await snap(); assert(resumed.elapsed > idle.elapsed && resumed.running);
    await wheels(-180, 5); const reverse = await snap(); assert(reverse.p < resumed.p && reverse.elapsed > resumed.elapsed);
    await wait(2400); return { moving, idle, resumed, reverse };
  });
  await record('paused middle reload preserves elapsed with no away or loading time', async () => {
    const before = await snap(); await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await ready();
    const restored = await snap(); assert.equal(restored.elapsed, before.elapsed);
    assert(Math.abs(restored.p - before.p) < 1e-8); assert(!restored.running);
    await wait(1500); assert.equal((await snap()).elapsed, before.elapsed);
    await wheels(180, 5); const driven = await snap(); assert(driven.elapsed > before.elapsed);
    await wait(2400); return { before, restored, driven };
  });
  await record('blur pauses and requires fresh driving', async () => {
    await wheels(180, 4); const before = await snap();
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(1400);
    const paused = await snap(); assert(!paused.running);
    await wait(1200); assert.equal((await snap()).elapsed, paused.elapsed);
    await wheels(180, 4); const resumed = await snap(); assert(resumed.elapsed > paused.elapsed);
    await wait(2300); return { before, paused, resumed };
  });
  await record('timer contrast and HUD separation Day Night', async () => {
    const data = {};
    for (const theme of ['day', 'night']) {
      await page.evaluate(async t => (await import('/src/core/state.js')).set('theme', t), theme); await wait(1000);
      data[theme] = await page.evaluate(() => {
        const timer = document.querySelector('.hud-lap-timer'), style = getComputedStyle(timer), r = timer.getBoundingClientRect();
        const overlaps = ['#hud-topleft', '#hud-topright', '#hud-bottomright', '.audio-anchor'].filter(q => {
          const n = document.querySelector(q); if (!n) return false; const b = n.getBoundingClientRect();
          return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        });
        return { color: style.color, weight: style.fontWeight, font: style.fontFamily, overlaps,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      });
      assert.equal(data[theme].overlaps.length, 0); assert(+data[theme].weight >= 500);
      await page.screenshot({ path: `${out}/timer-${theme}.png` });
    }
    assert.notEqual(data.day.color, data.night.color); return data;
  });
  }
  await page.evaluate(async () => {
    const { subscribe } = await import('/src/core/state.js'); window.__wsbCompletions = 0;
    subscribe('finishAcknowledged', ack => { if (ack) window.__wsbCompletions++; });
  });
  await record('near-finish reload stays paused exact and silent', async () => {
    await seek(1 - 12 / constants.length); const before = await snap();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await ready();
    const restored = await snap(); assert.equal(restored.elapsed, before.elapsed); assert.equal(restored.p, before.p);
    assert(!restored.running && !restored.morphing && !restored.gateVisible && restored.audioStarts === 0);
    return { before, restored };
  });
  await page.evaluate(async () => {
    const { subscribe, state, set } = await import('/src/core/state.js'); window.__wsbCompletions = 0;
    subscribe('finishAcknowledged', ack => { if (ack) window.__wsbCompletions++; });
    subscribe('progress', (p, previous) => {
      if (p === 1 && previous < 1) window.__wsbFinishEdge = { tail: state.finishTailMeters,
        elapsed: state.lapElapsedMs, frozen: state.lapFrozen, running: state.lapRunning, now: performance.now() };
    });
    set('theme', 'night');
  });
  await page.click('.audio-speaker'); await wait(700);
  await record('V1 finish: line freezes stopwatch, completion past the line locks the drive', async () => {
    const before = await snap(); const finish = await until(s => s.mode === 'finish', 100);
    const edge = await page.evaluate(() => window.__wsbFinishEdge);
    assert(edge && edge.frozen && !edge.running, 'stopwatch must freeze at the gantry crossing');
    assert.equal(finish.elapsed, edge.elapsed);
    assert(finish.locked, 'V1 completion locks the drive');
    assert(finish.p === 1 && finish.tail >= constants.pastLine - 1e-6 && finish.tail < constants.tailMax,
      `V1 completion point ${finish.tail} m past the line`);
    assert(finish.frozen && !finish.running && finish.ack && finish.car === 9);
    assert.equal(finish.experience, 'complete'); assert.equal(finish.completions, 1);
    assert(finish.ndc[2] < 1 && Math.abs(finish.ndc[0]) < .9 && Math.abs(finish.ndc[1]) < .9, `car left composition: ${finish.ndc}`);
    await wait(1700); const settled = await snap();
    assert.deepEqual(settled.position, finish.position, 'car moved after completion (coast)');
    assert.equal(settled.elapsed, finish.elapsed);
    await page.screenshot({ path: `${out}/finish-v1-night.png` });
    await page.evaluate(async () => (await import('/src/core/state.js')).set('theme', 'day')); await wait(1000);
    await page.screenshot({ path: `${out}/finish-v1-day.png` });
    return { before, edge, finish, settled };
  });
  await record('no post-finish coast or reverse escape: input under the completion lock is swallowed', async () => {
    const held = await snap();
    await wheels(600, 5); await wait(1200); const forward = await snap();
    await wheels(-600, 5); await wait(1200); const reverse = await snap();
    for (const s of [forward, reverse]) {
      assert.deepEqual(s.position, held.position); assert.equal(s.tail, held.tail); assert.equal(s.p, 1);
      assert(s.locked && s.mode === 'finish'); assert.equal(s.elapsed, held.elapsed);
      assert.equal(s.completions, 1); assert.equal(s.sfx, held.sfx); assert.equal(s.audioStarts, held.audioStarts);
      assert(!s.morphing && !s.gateVisible);
    }
    return { held, forward, reverse };
  });
  await record('completed reload restores locked V1 state silently and Replay Route resets', async () => {
    const before = await snap();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await ready({ unlocked: false });
    await wait(800); const restored = await snap();
    assert.equal(restored.p, 1); assert.equal(restored.tail, constants.pastLine); assert.equal(restored.elapsed, before.elapsed);
    assert(restored.frozen && !restored.running && restored.locked && restored.mode === 'finish' && restored.audioStarts === 0);
    assert.equal(restored.experience, 'complete');
    await wheels(300, 3); await wait(1300); const pushed = await snap();
    assert.deepEqual(pushed.position, restored.position); assert.equal(pushed.elapsed, before.elapsed);
    await page.click('.finish-replay'); await wait(1300); const replay = await snap();
    assert.equal(replay.p, 0); assert.equal(replay.tail, 0); assert.equal(replay.elapsed, 0);
    assert(!replay.ack && !replay.frozen && !replay.locked && replay.mode === 'race' && replay.car === 0);
    await wheels(150, 4); const driven = await snap(); assert(driven.elapsed > 0 && driven.p > 0);
    return { before, restored, pushed, replay, driven };
  });
  }
  assert.equal(report.errors.length, 0, report.errors.join(' | ')); report.pass = true;
} catch (error) {
  report.pass = false; report.failure = error.stack; console.error(error.stack); process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); await browser.close();
}
