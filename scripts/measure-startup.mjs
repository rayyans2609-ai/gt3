/** Startup / startup-frame / memory measurement across build arms (W4b-verify-B2).
 * Run: node scripts/measure-startup.mjs <plan.json>
 *
 * Plan: { out, rounds, headless, lap, driveDeltaY, lapDeltaY, driveMs, preflight, hostmon, prime,
 *         arms: [{ name, sha, dir, port, query }] }
 * Arms alternate per round (A B C A B C ...). For each arm-context the harness starts that arm's own
 * Vite dev server (from `dir`), primes it with one throwaway page load (Vite transform cache), runs one
 * measured context in a fresh Chrome profile, then TERMs exactly the PID it started.
 *
 * One context records: harness-side markers that exist on every arm (start-screen DOM mutations, car
 * mount, resource timing for models/audio, gt3:preload events), readiness.warmupSteps where the build has
 * them, a per-frame log (dt, GL allocation counters, renderer.info, pixel ratio), LoAF/longtask/measure
 * entries, renderer/GPU-process RSS + swap sampled every second, and a real-wheel drive of the first
 * driveMs after the start screen is hidden, optionally followed by a wheel-driven full lap.
 * The harness changes no product source. Host rules: preflight before every launch, hostmon.log
 * STOP-SIGNAL aborts, per-window swapout flags (windows with swapouts are `memoryAffected`).
 */
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const planPath = process.argv[2];
if (!planPath) { console.error('usage: node scripts/measure-startup.mjs <plan.json>'); process.exit(2); }
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const outDir = plan.out;
const workRoot = plan.work || '/private/tmp/gt3-vb-work';
const chrome = plan.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const preflightScript = plan.preflight;
const hostmonLog = plan.hostmon;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sessionStartedAt = Date.now();
let activeServer = null;
let activeBrowser = null;

class HostStop extends Error {}

// ---------------------------------------------------------------- host helpers
function vmStat() {
  const out = spawnSync('vm_stat', { encoding: 'utf8' }).stdout || '';
  const read = name => Number(out.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1]);
  return { at: Date.now(), pageouts: read('Pageouts'), swapouts: read('Swapouts') };
}
function swapUsedMB() {
  const out = spawnSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).stdout || '';
  return Number(out.match(/used = ([\d.]+)M/)?.[1]) || null;
}
function pressureLevel() {
  return Number((spawnSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).stdout || '').trim());
}
async function hostmonTail() {
  if (!hostmonLog || !existsSync(hostmonLog)) return [];
  return (await readFile(hostmonLog, 'utf8')).trim().split('\n').slice(-8);
}
function lineSeconds(line) {
  const m = line.match(/^(\d\d):(\d\d):(\d\d)/);
  if (!m) return null;
  const d = new Date(sessionStartedAt);
  d.setHours(+m[1], +m[2], +m[3], 0);
  return d.getTime();
}
async function checkStopSignal() {
  for (const line of await hostmonTail()) {
    const at = lineSeconds(line);
    if (line.includes('STOP-SIGNAL') && at != null && at >= sessionStartedAt - 1000) throw new HostStop(line);
  }
}
async function preflight(tag, log) {
  const first = Date.now();
  for (let attempt = 1; ; attempt++) {
    await checkStopSignal();
    const check = spawnSync('bash', [preflightScript], { encoding: 'utf8', timeout: 90000 });
    const output = `${check.stdout || ''}${check.stderr || ''}`;
    const head = output.split('\n').filter(l => /pressure=|PREFLIGHT/.test(l)).join(' | ');
    log.push({ tag, attempt, at: new Date().toISOString(), summary: head });
    console.log(`[preflight ${tag} #${attempt}] ${head}`);
    if (output.includes('PREFLIGHT PASS')) return;
    if (Date.now() - first > 30 * 60 * 1000) throw new HostStop(`preflight could not pass for 30 min (${tag})`);
    await pause(60000);
  }
}

// ------------------------------------------------------------- process helpers
function psTable() {
  const out = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).stdout || '';
  return out.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m && { pid: +m[1], ppid: +m[2], rssMB: +m[3] / 1024, command: m[4] };
  }).filter(Boolean);
}
function chromeRss(browserPid) {
  const children = psTable().filter(p => p.ppid === browserPid);
  const renderers = children.filter(p => p.command.includes('--type=renderer')).map(p => p.rssMB);
  const gpu = children.filter(p => p.command.includes('--type=gpu-process')).map(p => p.rssMB);
  const self = psTable().find(p => p.pid === browserPid);
  return { rendererMB: renderers.length ? +Math.max(...renderers).toFixed(1) : null,
    gpuMB: gpu.length ? +Math.max(...gpu).toFixed(1) : null,
    browserMB: self ? +self.rssMB.toFixed(1) : null,
    treeMB: +[self?.rssMB || 0, ...children.map(p => p.rssMB)].reduce((a, b) => a + b, 0).toFixed(1) };
}
function freePort(port) {
  return new Promise(resolve => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function startVite(arm) {
  if (!(await freePort(arm.port))) throw new Error(`port ${arm.port} busy`);
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(arm.port),
    '--strictPort', '--host', '127.0.0.1'], { cwd: arm.dir, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', b => process.stderr.write(`[vite ${arm.name}] ${b}`));
  activeServer = server;
  console.log(`[vite ${arm.name}] PID ${server.pid} port ${arm.port} dir ${arm.dir}`);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${arm.port}/`)).ok) return server; } catch { /* starting */ }
    await pause(500);
  }
  throw new Error('Vite did not answer');
}
function stopVite(server) {
  if (server?.pid) { try { process.kill(server.pid, 'SIGTERM'); } catch { /* gone */ } }
  if (activeServer === server) activeServer = null;
}
async function launchBrowser(tag) {
  await mkdir(workRoot, { recursive: true });
  const profile = await mkdtemp(join(workRoot, `chrome-${tag}-`));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: plan.headless !== false, pipe: true,
    timeout: 300000, protocolTimeout: 600000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
      `--user-data-dir=${profile}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 } });
  activeBrowser = browser;
  return { browser, profile };
}
async function closeBrowser(browser, profile) {
  try { await browser.close(); } catch { /* closed */ }
  if (activeBrowser === browser) activeBrowser = null;
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

// ----------------------------------------------------------- page instrumentation
async function installDiagnostics(page) {
  await page.evaluateOnNewDocument(() => {
    const names = ['createProgram', 'linkProgram', 'compileShader', 'createTexture', 'texImage2D',
      'texSubImage2D', 'texStorage2D', 'compressedTexImage2D', 'createBuffer', 'bufferData', 'createFramebuffer',
      'createRenderbuffer'];
    const gl = Object.fromEntries(names.map(n => [n, 0]));
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const n of names) {
        if (!Object.hasOwn(proto, n) || typeof proto[n] !== 'function') continue;
        const original = proto[n];
        proto[n] = function (...args) { gl[n]++; return original.apply(this, args); };
      }
    }
    const vb = { names, frames: [], marks: [], preload: [], entries: [], detail: true, stopAt: Infinity,
      firstWheelAt: null, screenSeen: false, carMountAt: null };
    window.__vb = vb;
    const mark = (name, extra) => vb.marks.push({ name, t: performance.now(), ...extra });
    window.addEventListener('wheel', () => { vb.firstWheelAt ??= performance.now(); }, { capture: true, passive: true });
    window.addEventListener('gt3:preload', e => {
      const r = window.__gt3?.readiness;
      vb.preload.push({ t: performance.now(), fraction: e.detail?.fraction, status: e.detail?.status,
        model: r?.model, audio: r?.audio, gpu: r?.gpu });
    });
    let screenObserver = null;
    const attachScreen = screen => {
      mark('screen-present', { cls: screen.className, hidden: screen.hidden });
      screenObserver = new MutationObserver(() => mark('screen', { cls: screen.className, hidden: screen.hidden,
        readiness: screen.dataset.readiness }));
      screenObserver.observe(screen, { attributes: true, attributeFilter: ['class', 'hidden', 'data-readiness'] });
    };
    for (const type of ['long-animation-frame', 'longtask', 'measure']) {
      try {
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            vb.entries.push({ type, name: e.name, startTime: e.startTime, duration: e.duration,
              blockingDuration: e.blockingDuration ?? null, renderStart: e.renderStart ?? null,
              styleAndLayoutStart: e.styleAndLayoutStart ?? null,
              scripts: type === 'long-animation-frame' ? [...(e.scripts || [])].map(s => ({
                sourceURL: s.sourceURL, fn: s.sourceFunctionName, invoker: s.invoker, duration: s.duration,
                executionStart: s.executionStart, forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration })) : [] });
          }
        }).observe({ type, buffered: true });
      } catch { /* unsupported */ }
    }
    let previous = null;
    const tick = t => {
      if (!vb.screenSeen) {
        const screen = document.querySelector('#start-screen');
        if (screen) { vb.screenSeen = true; attachScreen(screen); }
      }
      if (vb.carMountAt == null && window.__gt3?.scene?.getObjectByName('car-mount')?.children.length) {
        vb.carMountAt = t; mark('car-mount-populated');
      }
      if (t <= vb.stopAt) {
        const g = window.__gt3;
        const r = g?.renderer;
        const info = r?.info;
        const f = { t, dt: previous == null ? null : t - previous };
        if (vb.detail && r) {
          f.gl = names.map(n => gl[n]);
          f.pr = r.getPixelRatio();
          f.programs = info.programs?.length ?? 0;
          f.textures = info.memory.textures;
          f.geometries = info.memory.geometries;
          f.calls = info.render.calls;
          f.tris = info.render.triangles;
          f.shadow = r.shadowMap.enabled ? 1 : 0;
          f.progress = g.probe?.().progress;
        }
        vb.frames.push(f);
        previous = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const percentile = (values, fraction) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.ceil(fraction * s.length) - 1)].toFixed(2);
};
function frameStats(frames) {
  const gaps = frames.map(f => f.dt).filter(Number.isFinite);
  if (!gaps.length) return null;
  return { frames: gaps.length, p50: percentile(gaps, .5), p90: percentile(gaps, .9), p99: percentile(gaps, .99),
    max: +Math.max(...gaps).toFixed(2), totalMs: +gaps.reduce((a, b) => a + b, 0).toFixed(1),
    gt33: gaps.filter(v => v > 33).length, gt50: gaps.filter(v => v > 50).length, gt100: gaps.filter(v => v > 100).length };
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const g = window.__gt3;
    const info = g?.renderer?.info;
    return { renderer: info ? { programs: info.programs?.length ?? 0, textures: info.memory.textures,
      geometries: info.memory.geometries, pixelRatio: g.renderer.getPixelRatio() } : null,
    jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    now: performance.now() };
  });
}

async function rawState(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    return { progress: state.progress, target: state.targetProgress, locked: state.scrollLocked,
      active: state.activeCarIndex };
  });
}

async function driveFor(page, { ms, goal = null, deltaY, length, maxMs = 600000 }) {
  const started = Date.now();
  const limit = goal == null ? ms : maxMs;
  let events = 0;
  while (Date.now() - started < limit) {
    const s = await rawState(page);
    if (goal != null && s.progress >= goal) return { events, elapsedMs: Date.now() - started, end: s, reached: true };
    const leadM = (s.target - s.progress) * length;
    if (leadM < 12) {
      for (let i = 0; i < 4; i++) { await page.mouse.wheel({ deltaY }); events++; await pause(33); }
    } else await pause(33);
  }
  return { events, elapsedMs: Date.now() - started, end: await rawState(page), reached: goal == null };
}

// --------------------------------------------------------------------- one context
async function runContext(arm, ordinal, round) {
  const run = { arm: arm.name, sha: arm.sha, round, ordinal, query: arm.query || '', mode: 'vite dev',
    headless: plan.headless !== false, startedAt: new Date().toISOString(), host: { preflights: [] }, errors: [],
    samples: [], windows: {} };
  await preflight(`${arm.name}#${round}`, run.host.preflights);
  const vmStart = vmStat();
  run.host.vmStart = vmStart; run.host.swapUsedMBStart = swapUsedMB(); run.host.pressureStart = pressureLevel();
  const { browser, profile } = await launchBrowser(`${arm.name}-${round}`);
  const browserPid = browser.process()?.pid;
  run.browserPid = browserPid;
  const sampler = setInterval(async () => {
    try {
      await checkStopSignal();
      const vm = vmStat();
      run.samples.push({ at: Date.now(), ...chromeRss(browserPid), pageouts: vm.pageouts, swapouts: vm.swapouts });
    } catch (e) { run.stopSignal = String(e.message || e); }
  }, 1000);
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => run.errors.push(`pageerror: ${e.message}`));
    page.on('console', e => { if (e.type() === 'error') run.errors.push(`console: ${e.text().slice(0, 300)}`); });
    page.on('response', e => { if (e.status() >= 400) run.errors.push(`HTTP ${e.status()} ${e.url()}`); });
    await installDiagnostics(page);
    const url = `http://127.0.0.1:${arm.port}/${arm.query || ''}`;
    run.url = url;
    const navStartWall = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    run.timeOrigin = await page.evaluate(() => performance.timeOrigin);
    run.navToDomMs = Date.now() - navStartWall;
    await page.waitForFunction(() => document.querySelector('#start-screen.is-ready')
      && window.__gt3?.scene?.getObjectByName('car-rig'), { timeout: 240000, polling: 250 });
    if (run.stopSignal) throw new HostStop(run.stopSignal);
    run.readyWall = Date.now();
    // Everything below is read at (just after) ready; settle first so a pending frame can land.
    await pause(300);
    const atReady = await page.evaluate(() => {
      const vb = window.__vb;
      const r = window.__gt3.readiness;
      const resources = performance.getEntriesByType('resource').filter(e => /\.glb|\.mp3|gstatic|draco|\.wasm|\.webp|\.ktx/i.test(e.name))
        .map(e => ({ name: e.name.replace(location.origin, ''), start: +e.startTime.toFixed(1), reqStart: +e.requestStart.toFixed(1),
          respStart: +e.responseStart.toFixed(1), end: +e.responseEnd.toFixed(1), transfer: e.transferSize,
          body: e.encodedBodySize, decoded: e.decodedBodySize }));
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, +p.startTime.toFixed(1)]));
      const allResources = performance.getEntriesByType('resource').length;
      return { readiness: r ? { status: r.status, model: r.model, audio: r.audio, gpu: r.gpu,
        reasons: [...r.reasons], readyAt: r.readyAt, warmupSteps: r.warmupSteps.map(s => ({ phase: s.phase,
          startedAt: +s.startedAt.toFixed(2), endedAt: +s.endedAt.toFixed(2), setupMs: +s.setupMs.toFixed(2),
          renderMs: +s.renderMs.toFixed(2) })) } : null,
      marks: vb.marks, preload: vb.preload, resources, allResources, paints,
      nav: nav ? { domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, responseEnd: nav.responseEnd } : null,
      carMountAt: vb.carMountAt, now: performance.now() };
    });
    Object.assign(run, { atReady });
    run.snapshotAtReady = await pageSnapshot(page);
    run.rssAtReady = chromeRss(browserPid);
    run.vmAtReady = vmStat();
    run.swapUsedMBAtReady = swapUsedMB();
    // --- first gesture: real wheel dismisses the start screen
    await pause(1500);
    run.firstWheelWall = Date.now();
    await page.mouse.wheel({ deltaY: 2 });
    await page.waitForFunction(() => document.querySelector('#start-screen')?.hidden === true, { timeout: 15000, polling: 50 });
    const length = await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).TRACK_LENGTH);
    run.trackLength = length;
    const driveMs = plan.driveMs || 36000;
    run.phases = {};
    run.phases.drive = await driveFor(page, { ms: driveMs, deltaY: plan.driveDeltaY || 2, length });
    if (run.stopSignal) throw new HostStop(run.stopSignal);
    run.vmAfterDrive = vmStat();
    const frames = await page.evaluate(() => { const vb = window.__vb; vb.stopAt = performance.now(); return vb.frames; });
    const meta = await page.evaluate(() => ({ marks: window.__vb.marks, firstWheelAt: window.__vb.firstWheelAt,
      entries: window.__vb.entries, now: performance.now() }));
    const marks = meta.marks;
    const first = name => marks.find(m => m.name === 'screen' && name(m))?.t ?? null;
    const dismissedAt = first(m => /is-leaving/.test(m.cls));
    const hiddenAt = first(m => m.hidden === true);
    run.dismissedAt = dismissedAt; run.hiddenAt = hiddenAt; run.firstWheelAt = meta.firstWheelAt;
    run.windows.fade = frameStats(frames.filter(f => f.t > dismissedAt && f.t <= hiddenAt));
    run.windows.firstWheelPlus5s = frameStats(frames.filter(f => f.t > meta.firstWheelAt && f.t <= meta.firstWheelAt + 5000));
    run.windows.first5sAfterHidden = frameStats(frames.filter(f => f.t > hiddenAt && f.t <= hiddenAt + 5000));
    run.windows.first30sAfterHidden = frameStats(frames.filter(f => f.t > hiddenAt && f.t <= hiddenAt + 30000));
    const startWindow = frames.filter(f => f.t > meta.firstWheelAt - 1000 && f.t <= hiddenAt + 5000);
    run.worstFrames = [...startWindow].filter(f => f.dt != null).sort((a, b) => b.dt - a.dt).slice(0, 12).map(f => {
      const i = frames.indexOf(f);
      const prev = frames[i - 1];
      const delta = prev?.gl ? Object.fromEntries(f.gl.map((v, k) => [`${k}`, v - prev.gl[k]]).filter(([, v]) => v)) : null;
      return { offsetFromWheelMs: +(f.t - meta.firstWheelAt).toFixed(1), offsetFromHiddenMs: +(f.t - hiddenAt).toFixed(1),
        dtMs: +f.dt.toFixed(1), pr: f.pr, programs: f.programs, textures: f.textures, geometries: f.geometries,
        calls: f.calls, tris: f.tris, shadow: f.shadow, progress: f.progress,
        glDeltaByIndex: delta, prevPr: prev?.pr, prevPrograms: prev?.programs, prevTextures: prev?.textures };
    });
    run.glNames = await page.evaluate(() => window.__vb.names);
    run.pixelRatioChanges = frames.filter((f, i) => i && f.pr !== frames[i - 1].pr).map(f => ({ t: +f.t.toFixed(1), pr: f.pr }));
    run.shadowChanges = frames.filter((f, i) => i && f.shadow !== frames[i - 1].shadow).map(f => ({ t: +f.t.toFixed(1), shadow: f.shadow }));
    run.allocationsDuringDrive = (() => {
      const a = frames.find(f => f.t > hiddenAt)?.gl, b = frames.at(-1)?.gl;
      return a && b ? Object.fromEntries(run.glNames.map((n, k) => [n, b[k] - a[k]]).filter(([, v]) => v)) : null;
    })();
    run.loafNearStart = meta.entries.filter(e => e.startTime + e.duration >= meta.firstWheelAt - 500
      && e.startTime <= hiddenAt + 1000 && e.type !== 'measure');
    run.measures = meta.entries.filter(e => e.type === 'measure').slice(0, 40).map(e => ({ name: e.name, startTime: +e.startTime.toFixed(1), duration: +e.duration.toFixed(2) }));
    run.warmupFrames = (() => {
      const w = run.atReady.readiness?.warmupSteps;
      const t0 = w?.length ? w[0].startedAt : run.atReady.carMountAt;
      const t1 = run.atReady.readiness?.readyAt ?? run.atReady.marks.find(m => m.name === 'screen' && /is-ready/.test(m.cls))?.t;
      return { from: t0, to: t1, ...frameStats(frames.filter(f => f.t > t0 && f.t <= t1)) };
    })();
    run.snapshotAfterDrive = await pageSnapshot(page);
    run.rssAfterDrive = chromeRss(browserPid);
    await writeFile(join(outDir, `frames-${arm.name}-${round}.json`), JSON.stringify({ arm: arm.name, round, frames,
      entries: meta.entries, marks, preload: run.atReady.preload }) + '\n');
    // --- full wheel lap for the memory-after-lap number
    if (plan.lap) {
      await page.evaluate(() => { const vb = window.__vb; vb.detail = false; vb.stopAt = Infinity; vb.frames.length = 0; });
      const lapStart = Date.now();
      run.lapStartWall = lapStart;
      run.phases.lap = await driveFor(page, { goal: 0.9942, deltaY: plan.lapDeltaY || 60, length, maxMs: plan.lapMaxMs || 420000 });
      run.lapWall = [lapStart, Date.now()];
      if (run.stopSignal) throw new HostStop(run.stopSignal);
      await pause(1500);
      run.lapFrames = frameStats(await page.evaluate(() => window.__vb.frames));
      run.snapshotAfterLap = await pageSnapshot(page);
      run.rssAfterLap = chromeRss(browserPid);
      run.vmAfterLap = vmStat();
      run.swapUsedMBAfterLap = swapUsedMB();
    }
  } catch (error) {
    run.errors.push(`harness: ${error.stack || error}`);
    run.failed = true;
    if (error instanceof HostStop) run.hostStop = error.message;
  } finally {
    clearInterval(sampler);
    run.vmEnd = vmStat();
    run.endedAt = new Date().toISOString();
    await closeBrowser(browser, profile);
  }
  // ---- post-process: swapout flags per window (page ms -> wall ms)
  const toWall = t => run.timeOrigin + t;
  const swapsIn = (a, b) => {
    const s = run.samples.filter(x => x.at >= a - 1000 && x.at <= b + 1000);
    return s.length ? s.at(-1).swapouts - s[0].swapouts : null;
  };
  const poIn = (a, b) => {
    const s = run.samples.filter(x => x.at >= a - 1000 && x.at <= b + 1000);
    return s.length ? s.at(-1).pageouts - s[0].pageouts : null;
  };
  if (run.timeOrigin && run.atReady) {
    const readyAtMs = run.atReady.readiness?.readyAt ?? run.atReady.marks.find(m => m.name === 'screen' && /is-ready/.test(m.cls))?.t;
    run.readyMs = readyAtMs;
    const win = {
      navToReady: [run.timeOrigin, toWall(readyAtMs)],
      startupFrame: run.hiddenAt != null ? [toWall(run.firstWheelAt), toWall(run.hiddenAt + 30000)] : null,
      lap: run.lapWall || null };
    run.swapouts = {};
    for (const [k, v] of Object.entries(win)) if (v) run.swapouts[k] = { swapouts: swapsIn(...v), pageouts: poIn(...v) };
    run.memoryAffected = Object.fromEntries(Object.entries(run.swapouts).map(([k, v]) => [k, (v.swapouts || 0) > 0]));
  }
  run.peakRss = { rendererMB: Math.max(0, ...run.samples.map(s => s.rendererMB || 0)),
    gpuMB: Math.max(0, ...run.samples.map(s => s.gpuMB || 0)) };
  run.hostmonTail = await hostmonTail();
  run.hostContaminated = run.vmEnd.swapouts !== run.host.vmStart.swapouts;
  return run;
}

async function prime(arm, round) {
  const log = [];
  await preflight(`prime-${arm.name}#${round}`, log);
  const { browser, profile } = await launchBrowser(`prime-${arm.name}`);
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${arm.port}/${arm.query || ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig'), { timeout: 120000, polling: 250 });
    await pause(2500);
  } finally { await closeBrowser(browser, profile); }
}

async function cleanup() {
  if (activeBrowser) { try { await activeBrowser.close(); } catch { /* closed */ } }
  stopVite(activeServer);
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

await mkdir(outDir, { recursive: true });
const resultsPath = join(outDir, 'results.json');
const all = existsSync(resultsPath) ? JSON.parse(await readFile(resultsPath, 'utf8')) : { runs: [], plan: null };
all.plan = plan;
let exitCode = 0;
try {
  const rounds = plan.rounds || 3;
  const startRound = plan.startRound || 1;
  for (let round = startRound; round < startRound + rounds; round++) {
    for (const arm of plan.arms) {
      if (plan.only && !plan.only.includes(arm.name)) continue;
      let server;
      try {
        await checkStopSignal();
        await preflight(`vite-${arm.name}#${round}`, []);
        server = await startVite(arm);
        if (plan.prime !== false) await prime(arm, round);
        const run = await runContext(arm, all.runs.length + 1, round);
        run.vitePid = server.pid;
        all.runs.push(run);
        await writeFile(resultsPath, JSON.stringify(all, null, 2) + '\n');
        const w = run.windows || {};
        console.log(`[${arm.name} r${round}] ready ${run.readyMs?.toFixed?.(0)} ms; first5s ${JSON.stringify(w.first5sAfterHidden)}; `
          + `rss@ready ${JSON.stringify(run.rssAtReady)}; swapouts ${JSON.stringify(run.swapouts)}; errors ${run.errors.length}`);
        if (run.hostStop) { exitCode = 3; throw new HostStop(run.hostStop); }
      } finally { stopVite(server); await pause(1500); }
    }
  }
} catch (e) {
  console.error(e);
  exitCode = e instanceof HostStop ? 3 : 1;
} finally {
  await cleanup();
  await writeFile(resultsPath, JSON.stringify(all, null, 2) + '\n');
}
process.exit(exitCode);
