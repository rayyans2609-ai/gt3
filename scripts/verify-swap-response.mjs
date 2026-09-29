/** Swap/gate-response behaviour check (headless real GPU, like verify-checkpoints).
 * Usage: GT3_URL=http://127.0.0.1:5191 node scripts/verify-swap-response.mjs
 * Env: GT3_CAPTURES (directory for mid-crossing stills), GT3_OUT (report directory).
 * Covers: input during GPU warm-up, reversal/retarget before a swap completes, replay,
 * Day/Night, and both `sweep` (default) and `?gate=quiet` responses.
 * Run the host preflight before launching; it starts exactly one browser.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || 'http://127.0.0.1:5191';
const outDir = process.env.GT3_OUT || '/tmp/gt3-swap-response';
const captureDir = process.env.GT3_CAPTURES || `${outDir}/captures`;
await mkdir(outDir, { recursive: true });
await mkdir(captureDir, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const report = { base, startedAt: new Date().toISOString(), variants: {}, errors: [] };
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${outDir}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
report.browserPid = browser.process()?.pid;

async function variant(name, query) {
  const page = await browser.newPage();
  const phases = [];
  const errors = [];
  const record = async (label, work) => {
    try {
      const value = await work();
      phases.push({ label, status: 'PASS', value });
      console.log(`PASS ${name} ${label}`);
    } catch (error) {
      phases.push({ label, status: 'FAIL', message: error.message });
      console.error(`FAIL ${name} ${label}: ${error.message}`);
    }
  };
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', e => { if (e.type() === 'error') errors.push(`console: ${e.text()}`); });
  page.on('response', e => { if (e.status() >= 400) errors.push(`HTTP ${e.status()} ${e.url()}`); });

  const read = () => page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    const { isMorphing } = await import('/src/scene/morph.js');
    const { getCarModel } = await import('/src/scene/cars.js');
    const gt3 = window.__gt3;
    const mount = gt3.scene.getObjectByName('car-mount');
    let fadeMaterials = 0;
    for (let i = 0; i < 10; i++) getCarModel(i)?.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.forceSinglePass) fadeMaterials++;
    });
    const info = gt3.renderer.info;
    return { progress: state.progress, active: state.activeCarIndex, started: state.started,
      unlocked: [...state.unlocked].sort((a, b) => a - b), locked: state.scrollLocked,
      morphing: isMorphing(), scrollY: window.scrollY, theme: state.theme,
      model: mount.children.map(c => c.name), fadeMaterials,
      gateResponseVisible: gt3.scene.getObjectByName('checkpoint-traversal-response')?.visible ?? null,
      screen: document.querySelector('#start-screen')?.className,
      programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries };
  });
  const seek = async (t, instant = true) => {
    await page.evaluate(async ({ t, instant }) =>
      (await import('/src/scroll/scrollDrive.js')).seekTo(t, { instant }), { t, instant });
  };
  const settle = async () => {
    await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing(),
      { timeout: 15000, polling: 50 });
    await wait(700);
    return read();
  };
  // Seek across a gate, then `delayMs` after the swap begins seek again — timed in-page.
  const crossThen = (to, delayMs, next) => page.evaluate(async ({ to, delayMs, next }) => {
    const { seekTo } = await import('/src/scroll/scrollDrive.js');
    const { isMorphing } = await import('/src/scene/morph.js');
    const mount = window.__gt3.scene.getObjectByName('car-mount');
    const gate = window.__gt3.scene.getObjectByName('checkpoint-traversal-response');
    seekTo(to, { instant: true });
    return new Promise((resolve, reject) => {
      let startedAt = null;
      const limit = performance.now() + 5000;
      const tick = t => {
        if (isMorphing()) startedAt ??= t;
        if (startedAt != null && t - startedAt >= delayMs) {
          const at = { msIntoSwap: +(t - startedAt).toFixed(1), morphing: isMorphing(),
            mount: mount.children.map(c => c.name), gateVisible: gate?.visible ?? null };
          seekTo(next, { instant: true });
          resolve(at);
          return;
        }
        if (t > limit) { reject(new Error('swap never started')); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { to, delayMs, next });
  const carName = (ids, index) => `car-${ids[index]}`;
  const checkSettled = (s, ids, index, label) => {
    assert(s.active === index, `${label}: active ${s.active} != ${index}`);
    assert(!s.morphing, `${label}: still morphing`);
    assert(s.model.length === 1 && s.model[0] === carName(ids, index), `${label}: mount ${s.model}`);
    assert(s.fadeMaterials === 0, `${label}: ${s.fadeMaterials} fade materials left assigned`);
  };

  // Record input and state in-page, so the ready boundary is exact rather than a CDP round-trip later.
  await page.evaluateOnNewDocument(() => {
    const log = window.__a1 = { wheels: [], scrolls: [], atReady: null, readyAt: null, warmAt: null };
    window.addEventListener('wheel', e => log.wheels.push(e.timeStamp), { capture: true, passive: true });
    window.addEventListener('scroll', () => log.scrolls.push({ t: performance.now(), y: window.scrollY }),
      { capture: true, passive: true });
    const watch = () => {
      const screen = document.querySelector('#start-screen');
      if (log.warmAt == null && window.__gt3?.scene?.getObjectByName('car-mount')?.children.length)
        log.warmAt = performance.now();
      if (screen?.classList.contains('is-ready') && !log.readyAt) {
        log.readyAt = performance.now();
        import('/src/core/state.js').then(({ state }) => {
          log.atReady = { t: performance.now(), progress: state.progress, target: state.targetProgress,
            started: state.started, unlocked: [...state.unlocked], scrollY: window.scrollY,
            locked: state.scrollLocked };
        });
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });

  try {
    await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.mouse.move(800, 450);

    await record('A1 input during GPU warm-up is ignored; first gesture after ready starts', async () => {
      // Wait for the first mounted car (models loaded, warm-up running), then keep sending input.
      await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-mount')?.children.length,
        { timeout: 120000, polling: 20 });
      let events = 0;
      let keys = 0;
      const warmStart = await read();
      while (!(await page.evaluate(() => !!document.querySelector('#start-screen.is-ready')))) {
        await page.mouse.wheel({ deltaY: 120 });
        events++;
        if (events % 5 === 0) { await page.keyboard.press('PageDown'); keys++; }
        await wait(40);
        if (events > 2000) throw new Error('warm-up did not finish');
      }
      await page.waitForFunction(() => window.__a1.atReady, { timeout: 10000 });
      const log = await page.evaluate(() => window.__a1);
      const atReady = log.atReady;
      const handledBeforeReady = log.wheels.filter(t => t >= log.warmAt && t < log.readyAt).length;
      const scrollsBeforeReady = log.scrolls.filter(s => s.t < log.readyAt && s.y !== 0);
      assert(handledBeforeReady >= 3, `only ${handledBeforeReady} wheel events were handled during warm-up`);
      assert(atReady.progress === 0 && atReady.target === 0 && atReady.scrollY === 0,
        `route moved during warm-up: ${JSON.stringify(atReady)}`);
      assert(!atReady.started, 'warm-up input started the Tour');
      assert(JSON.stringify(atReady.unlocked) === '[0]', `discoveries changed: ${atReady.unlocked}`);
      assert(!atReady.locked, 'scroll still locked at ready');
      assert(scrollsBeforeReady.length === 0 || scrollsBeforeReady.every(s => s.y <= 1),
        `page scrolled before ready: ${JSON.stringify(scrollsBeforeReady.slice(0, 5))}`);
      // Input sent right before ready may be handled just after it; let that settle, then
      // return to the start line so the "first gesture" check starts from a clean state.
      await wait(1500);
      const queued = await read();
      const firstAfter = log.wheels.find(t => t >= log.readyAt);
      if (queued.started) {
        return { wheelEventsSent: events, pageDownSent: keys, wheelEventsHandledDuringWarmup: handledBeforeReady,
          warmupMs: +(log.readyAt - log.warmAt).toFixed(0), atReady,
          note: 'a wheel sent just before ready was handled after ready and started the Tour (the first post-ready gesture)',
          firstWheelAfterReadyMs: firstAfter == null ? null : +(firstAfter - log.readyAt).toFixed(1),
          after: { started: queued.started, progress: queued.progress, screen: queued.screen } };
      }
      await page.mouse.wheel({ deltaY: 120 });
      await wait(900);
      const after = await read();
      assert(after.started, 'first gesture after ready did not start the Tour');
      assert(after.progress > 0, 'first gesture after ready did not move the route');
      assert(/is-leaving/.test(after.screen), 'start screen did not dismiss');
      return { wheelEventsSent: events, pageDownSent: keys, wheelEventsHandledDuringWarmup: handledBeforeReady,
        warmupMs: +(log.readyAt - log.warmAt).toFixed(0), warmStart, atReady, after };
    });

    const { gates, ids } = await page.evaluate(async () => ({
      gates: (await import('/src/scene/trackCurve.js')).CHECKPOINT_T,
      ids: (await import('/src/data/cars.js')).CARS.map(c => c.id) }));

    for (const theme of ['day', 'night']) {
      await page.evaluate(async t => (await import('/src/scene/theme.js')).applyTheme(t, { instant: true }), theme);
      await wait(400);
      const before = await read();
      const k = theme === 'day' ? 2 : 5; // gate index; crossing it forward activates car k+1

      await record(`${theme}: reversal before the swap completes`, async () => {
        await seek(gates[k] - 0.003); checkSettled(await settle(), ids, k, 'setup');
        const mid = await crossThen(gates[k] + 0.003, 120, gates[k] - 0.003);
        assert(mid.morphing && mid.mount.length === 2, `not mid-swap: ${JSON.stringify(mid)}`);
        const end = await settle();
        checkSettled(end, ids, k, 'reversed early');
        return { atReverse: mid, end: { active: end.active, model: end.model } };
      });

      await record(`${theme}: reversal after the swap midpoint`, async () => {
        await seek(gates[k] - 0.003); await settle();
        const mid = await crossThen(gates[k] + 0.003, 380, gates[k] - 0.003);
        assert(mid.morphing && mid.mount.length === 2, `not mid-swap: ${JSON.stringify(mid)}`);
        const end = await settle();
        checkSettled(end, ids, k, 'reversed late');
        return { atReverse: mid, end: { active: end.active, model: end.model } };
      });

      await record(`${theme}: retarget across two gates before completion`, async () => {
        await seek(gates[k] - 0.003); await settle();
        const mid = await crossThen(gates[k] + 0.003, 120, gates[k + 1] + 0.003);
        assert(mid.morphing && mid.mount.length === 2, `not mid-swap: ${JSON.stringify(mid)}`);
        const end = await settle();
        checkSettled(end, ids, k + 2, 'retarget');
        assert(end.unlocked.includes(k + 1) && end.unlocked.includes(k + 2), 'retarget skipped a discovery');
        return { atRetarget: mid, end: { active: end.active, model: end.model, unlocked: end.unlocked } };
      });

      await record(`${theme}: gate response lifecycle`, async () => {
        await seek(gates[k] - 0.003); await settle();
        const mid = await crossThen(gates[k] + 0.003, 60, gates[k] + 0.003);
        const during = { gateResponseVisible: mid.gateVisible };
        await wait(900);
        const after = await read();
        if (query.includes('gate=quiet')) {
          assert(during.gateResponseVisible === false && after.gateResponseVisible === false,
            'quiet variant showed the gate sweep');
        } else {
          assert(during.gateResponseVisible === true, 'sweep not visible during the crossing');
          assert(after.gateResponseVisible === false, 'sweep still visible 0.9 s after the crossing');
        }
        await settle();
        return { during: during.gateResponseVisible, after: after.gateResponseVisible };
      });

      const afterTheme = await read();
      report.variants[name] ??= {};
      report.variants[name][`${theme}ResourceDelta`] = {
        programs: afterTheme.programs - before.programs, textures: afterTheme.textures - before.textures,
        geometries: afterTheme.geometries - before.geometries };
    }

    await record('replay returns to Lexus and keeps discoveries', async () => {
      await seek(1);
      await page.waitForSelector('.finish-replay', { visible: true, timeout: 20000 });
      await settle();
      const beforeReplay = await read();
      await page.click('.finish-replay');
      await wait(400);
      const s = await settle();
      checkSettled(s, ids, 0, 'replay');
      assert(JSON.stringify(s.unlocked) === JSON.stringify(beforeReplay.unlocked),
        `replay changed discoveries: ${beforeReplay.unlocked} -> ${s.unlocked}`);
      // Re-cross gate 1 after replay: a fresh morph must still work.
      await seek(gates[0] - 0.003); await settle();
      await seek(gates[0] + 0.003);
      const again = await settle();
      checkSettled(again, ids, 1, 'post-replay crossing');
      return { unlocked: s.unlocked };
    });

    await record('mid-crossing stills', async () => {
      const shots = [];
      const plan = [['day', 0], ['day', 3], ['night', 6]];
      for (const [theme, k] of plan) {
        await page.evaluate(async t => (await import('/src/scene/theme.js')).applyTheme(t, { instant: true }), theme);
        await seek(gates[k] - 0.0035); await settle();
        await seek(gates[k] + 0.004, false); // damped drive across the gate
        // Freeze the app's frame loop ~260 ms into the swap (mid cross-fade and mid sweep),
        // screenshot the held frame with its DOM overlay, then resume the loop.
        const frozen = await page.evaluate(async () => {
          const { isMorphing } = await import('/src/scene/morph.js');
          const realRaf = window.requestAnimationFrame.bind(window);
          return new Promise(resolve => {
            let startedAt = null;
            const tick = t => {
              if (isMorphing()) startedAt ??= t;
              if (startedAt != null && t - startedAt >= 260) {
                const held = [];
                window.requestAnimationFrame = cb => { held.push(cb); return 0; };
                window.__resumeFrames = () => { window.requestAnimationFrame = realRaf; for (const cb of held) realRaf(cb); };
                const gate = window.__gt3.scene.getObjectByName('checkpoint-traversal-response');
                resolve({ msIntoSwap: +(t - startedAt).toFixed(1), morphing: isMorphing(), gateVisible: gate?.visible });
                return;
              }
              realRaf(tick);
            };
            realRaf(tick);
          });
        });
        await wait(120); // let the one already-scheduled app frame render, then hold
        const path = `${captureDir}/${name}-${theme}-gate${k + 1}.png`;
        await page.screenshot({ path });
        await page.evaluate(() => window.__resumeFrames());
        assert(frozen.morphing, `${theme} gate ${k + 1}: swap already finished at capture`);
        shots.push({ path, theme, gate: k + 1, ...frozen });
        await settle();
      }
      await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('day', { instant: true }));
      return shots;
    });
  } finally {
    report.variants[name] = { ...(report.variants[name] || {}), phases, errors };
    await page.close();
  }
}

try {
  await variant('sweep', '');
  await variant('quiet', '?gate=quiet');
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  report.endedAt = new Date().toISOString();
  report.failed = Object.values(report.variants).flatMap(v => v.phases || []).filter(p => p.status === 'FAIL').length
    + Object.values(report.variants).reduce((n, v) => n + (v.errors?.length || 0), 0) + report.errors.length;
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.variants).map(([k, v]) =>
    [k, { phases: v.phases.map(p => `${p.status} ${p.label}${p.message ? `: ${p.message}` : ''}`),
      errors: v.errors, day: v.dayResourceDelta, night: v.nightResourceDelta }])), null, 2));
  await browser.close();
  if (report.failed) process.exitCode = 1;
}
