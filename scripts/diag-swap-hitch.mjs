/** Checkpoint hitch diagnostic. Run: node scripts/diag-swap-hitch.mjs
 * Env: GT3_URL (external Vite URL), GT3_HEADLESS=1, GT3_CONTEXTS=3,
 * GT3_PREWARM=1 (optional old-style comparison), GT3_OUT (results directory),
 * GT3_LABEL (free-form build label recorded in results, e.g. `w4` or `baseline-602c462`).
 * Scroll-pace modes (W3): GT3_SCROLL=cap|pace appends `scroll=<mode>` to the page URL (default: no param =
 * today's law); GT3_QUERY="comp=b&gate=quiet" appends further independent parameters verbatim.
 * GT3_WHEEL_DELTA (px per wheel event, default 2 = the legacy calibration), GT3_WHEEL_BURST (events per
 * 33 ms tick, default 4). The bounded modes ignore sub-intensity input (pace floor / lead bound), so a 2 px
 * trickle crosses a gate far slower than the legacy default measured; for cap/pace use e.g.
 * GT3_WHEEL_DELTA=10 (about 1200 px/s, "gentle") or 30 ("normal", ~3600 px/s). Every crossing window records
 * `routeSpeedMs`, the measured route speed (progress displacement x TRACK_LENGTH / time, +-0.5 s around the
 * crossing), so windows can be compared at measured speed rather than at nominal input. Input always goes
 * through real CDP wheel events. In cap/pace modes the drive loop keeps feeding input until the car's TARGET
 * (not its position) passes the goal, because the bounded lead never exceeds ~55 m.
 * The harness changes no product source and uses real wheel input for every gate.
 * Each context records vm_stat Pageouts/Swapouts at launch, at every phase boundary and
 * before close; any increase marks that context `hostContaminated` (host paging/swapping).
 */
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.GT3_URL || 'http://127.0.0.1:5191';
const scrollMode = process.env.GT3_SCROLL || 'default';
if (!['default', 'cap', 'pace'].includes(scrollMode)) throw new Error(`GT3_SCROLL must be default|cap|pace, got ${scrollMode}`);
const pageParams = [scrollMode === 'default' ? '' : `scroll=${scrollMode}`, (process.env.GT3_QUERY || '').replace(/^[?&]/, '')]
  .filter(Boolean).join('&');
const pageUrl = pageParams ? `${base.replace(/\/$/, '')}/?${pageParams}` : base;
const wheelDeltaAbs = Number(process.env.GT3_WHEEL_DELTA || 2);
const wheelBurst = Math.max(1, Number(process.env.GT3_WHEEL_BURST || 4));
if (!(wheelDeltaAbs > 0)) throw new Error('GT3_WHEEL_DELTA must be > 0');
const outputDir = process.env.GT3_OUT || '/Users/rayyansheikh/.claude/jobs/60022478/tmp/w1';
const workRoot = process.env.GT3_WORK || '/tmp/gt3-w1';
const contexts = Math.max(1, Number(process.env.GT3_CONTEXTS || 3));
const headless = process.env.GT3_HEADLESS === '1';
const doPrewarm = process.env.GT3_PREWARM === '1';
const startupOnly = process.env.GT3_STARTUP_ONLY === '1';
const firstGateOnly = process.env.GT3_FIRST_GATE_ONLY === '1';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const preflight = process.env.GT3_PREFLIGHT || '/Users/rayyansheikh/.claude/jobs/60022478/tmp/preflight.sh';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const result = { startedAt: new Date().toISOString(), base, pageUrl, scrollMode, wheelDeltaY: wheelDeltaAbs,
  wheelBurst, headless, contextsRequested: contexts,
  label: process.env.GT3_LABEL || null, prewarmRequested: doPrewarm, runs: [], host: [], errors: [] };
let server;

function gpuRssMB(browser) {
  const parent = browser.process()?.pid;
  if (!parent) return null;
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' });
  const child = (ps.stdout || '').split('\n').map(line => line.trim())
    .find(line => new RegExp(`^\\d+\\s+${parent}\\s+`).test(line) && line.includes('--type=gpu-process'));
  const kb = child && Number(child.match(/^\d+\s+\d+\s+(\d+)/)?.[1]);
  return Number.isFinite(kb) && kb > 0 ? +(kb / 1024).toFixed(1) : null;
}

function vmStat(tag) {
  const out = spawnSync('vm_stat', { encoding: 'utf8' }).stdout || '';
  const read = name => Number(out.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1]);
  return { tag, at: new Date().toISOString(), pageouts: read('Pageouts'), swapouts: read('Swapouts') };
}

function hostVerdict(samples) {
  const first = samples[0], last = samples.at(-1);
  const steps = samples.slice(1).map((s, i) => ({ from: samples[i].tag, to: s.tag,
    pageouts: s.pageouts - samples[i].pageouts, swapouts: s.swapouts - samples[i].swapouts }))
    .filter(step => step.pageouts || step.swapouts);
  return { pageoutsDelta: last.pageouts - first.pageouts, swapoutsDelta: last.swapouts - first.swapouts,
    contaminated: last.pageouts !== first.pageouts || last.swapouts !== first.swapouts, steps };
}

function frameStats(frames, trackLength = null) {
  const gaps = frames.map(f => f.dt).filter(Number.isFinite);
  if (!gaps.length) return null;
  return { frames: gaps.length, p50: percentile(gaps, .5), p90: percentile(gaps, .9), p99: percentile(gaps, .99),
    max: +Math.max(...gaps).toFixed(2),
    maxProgressJumpM: trackLength == null ? null
      : +Math.max(...frames.map(f => Math.abs(f.dp || 0) * trackLength)).toFixed(2),
    counts: Object.fromEntries([33, 50, 100].map(n => [`gt${n}`, gaps.filter(v => v > n).length])) };
}

async function save() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'results.json'), JSON.stringify(result, null, 2) + '\n');
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* Vite starting */ }
    await pause(500);
  }
  throw new Error(`Vite did not answer at ${base}`);
}

async function preflightBeforeBrowser() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const check = spawnSync('bash', [preflight], { encoding: 'utf8', timeout: 60000 });
    const output = `${check.stdout || ''}${check.stderr || ''}`;
    result.host.push({ at: new Date().toISOString(), attempt, output: output.trim() });
    console.log(output.trim());
    if (output.includes('PREFLIGHT PASS')) return;
    if (attempt < 10) await pause(60000);
  }
  throw new Error('Ten consecutive browser preflights failed');
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)].toFixed(2);
}

function summarizeWindow(name, frames, entries, center, trackLength, expectedChange = true) {
  if (center == null) return { name, error: 'No crossing or control center observed' };
  // A frame interval that straddles either boundary contributes to the window.
  // Including its ending rAF sample also captures a long frame crossing +1.5 s.
  const sample = frames.filter(f => Number.isFinite(f.dt)
    && f.t >= center - 1500 && f.t - f.dt <= center + 1500);
  if (!sample.length) return { name, error: 'No frames in ±1.5 s window' };
  const gaps = sample.map(f => f.dt).filter(Number.isFinite);
  const first = sample[0], last = sample.at(-1);
  const levels = sample.filter((f, i) => i > 0 && (f.level !== sample[i - 1].level || f.applied !== sample[i - 1].applied))
    .map(f => ({ offsetMs: +(f.t - center).toFixed(1), level: f.level, applied: f.applied }));
  const longest = [...sample].sort((a, b) => b.dt - a.dt).slice(0, 10).map(f => ({
    offsetMs: +(f.t - center).toFixed(1), dtMs: +f.dt.toFixed(2),
    progressJumpM: +(f.dp * trackLength).toFixed(2), progress: +f.progress.toFixed(6),
    active: f.active, morph: f.morph, level: f.level, applied: f.applied,
    programs: f.programs, textures: f.textures, geometries: f.geometries,
    jsHeapMB: f.heap == null ? null : +(f.heap / 1048576).toFixed(1),
  }));
  const overlap = e => e.startTime <= center + 1500 && e.startTime + e.duration >= center - 1500;
  const relevant = entries.filter(overlap).map(e => ({
    type: e.type, name: e.name, offsetMs: +(e.startTime - center).toFixed(1), durationMs: +e.duration.toFixed(2),
    blockingDurationMs: e.blockingDuration, scripts: e.scripts,
    phasesMs: e.renderStart ? { beforeRender: +(e.renderStart - e.startTime).toFixed(1),
      renderToStyle: +((e.styleAndLayoutStart || e.renderStart) - e.renderStart).toFixed(1),
      styleLayoutAndAfter: +(e.startTime + e.duration - (e.styleAndLayoutStart || e.renderStart)).toFixed(1) } : null,
  }));
  const near = sample.filter(f => f.t >= center - 500 && f.t <= center + 500);
  const routeSpeedMs = near.length > 1 && near.at(-1).t > near[0].t
    ? +(Math.abs(near.at(-1).progress - near[0].progress) * trackLength / ((near.at(-1).t - near[0].t) / 1000)).toFixed(1) : null;
  return { name, centerMs: +center.toFixed(1), expectedChange, routeSpeedMs,
    coverageOffsetsMs: [+(first.t - first.dt - center).toFixed(1), +(last.t - center).toFixed(1)],
    completeWindow: first.t - first.dt <= center - 1500 && last.t >= center + 1500,
    frameCount: sample.length, p50: percentile(gaps, .5), p90: percentile(gaps, .9),
    p99: percentile(gaps, .99), max: +Math.max(...gaps).toFixed(2),
    counts: Object.fromEntries([20, 33, 50, 100, 250].map(n => [`gt${n}`, gaps.filter(v => v > n).length])),
    progressSpanM: +((last.progress - first.progress) * trackLength).toFixed(1),
    glCalls: Object.fromEntries(Object.keys(last.gl || {}).map(key =>
      [key, last.gl[key] - (first.gl?.[key] || 0)])),
    measures: relevant.filter(e => e.type === 'measure')
      .map(e => ({ name: e.name, offsetMs: e.offsetMs, durationMs: e.durationMs })),
    programsDelta: last.programs - first.programs, texturesDelta: last.textures - first.textures,
    geometriesDelta: last.geometries - first.geometries, levels, longest, loaf: relevant.filter(e => e.type === 'long-animation-frame'),
    longtasks: relevant.filter(e => e.type === 'longtask'),
    hudEvents: entries.filter(e => e.type === 'hud' && e.startTime >= center - 1500 && e.startTime <= center + 1500)
      .map(e => ({ offsetMs: +(e.startTime - center).toFixed(1), detail: e.detail })),
  };
}

async function installDiagnostics(page) {
  await page.evaluateOnNewDocument(() => {
    const glMethods = ['createProgram', 'compileShader', 'linkProgram', 'createTexture',
      'texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'texStorage2D',
      'createBuffer', 'bufferData', 'bufferSubData'];
    const glCalls = Object.fromEntries(glMethods.map(name => [name, 0]));
    window.__gt3GLCalls = glCalls;
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of glMethods) {
        if (!Object.hasOwn(proto, name) || typeof proto[name] !== 'function') continue;
        const original = proto[name];
        proto[name] = function (...args) { glCalls[name]++; return original.apply(this, args); };
      }
    }
    const diag = { frames: [], entries: [], running: false, supported: [], started: false,
      startupFrames: [], readyAt: null, dismissedAt: null, hiddenAt: null,
      modelsAt: null, programSnapshots: [] };
    window.__swapDiag = diag;
    let startupPrevious = null;
    const startupTick = t => {
      const screen = document.querySelector('#start-screen');
      // The first car is mounted just before GPU warm-up begins (and, on older builds,
      // at the moment models finish loading). Frames from here to ready are the warm-up.
      if (diag.modelsAt == null && window.__gt3?.scene?.getObjectByName('car-mount')?.children.length)
        diag.modelsAt = t;
      if (screen?.classList.contains('is-ready') && diag.readyAt == null) diag.readyAt = t;
      if (screen?.classList.contains('is-leaving') && diag.dismissedAt == null) diag.dismissedAt = t;
      if (screen?.hidden && diag.dismissedAt != null && diag.hiddenAt == null) diag.hiddenAt = t;
      const progress = window.__gt3?.probe?.().progress ?? 0;
      const previousProgress = diag.startupFrames.at(-1)?.progress ?? progress;
      diag.startupFrames.push({ t, dt: startupPrevious == null ? null : t - startupPrevious,
        progress, dp: progress - previousProgress });
      startupPrevious = t;
      if (diag.hiddenAt == null || t < diag.hiddenAt + 30000) requestAnimationFrame(startupTick);
    };
    requestAnimationFrame(startupTick);
    for (const type of ['long-animation-frame', 'longtask', 'measure']) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            diag.entries.push({ type, name: e.name, startTime: e.startTime, duration: e.duration,
              blockingDuration: e.blockingDuration ?? null,
              // LoAF phase split: script before renderStart, rAF+render, style/layout, then commit/paint.
              renderStart: e.renderStart ?? null, styleAndLayoutStart: e.styleAndLayoutStart ?? null,
              scripts: type === 'long-animation-frame' ? [...(e.scripts || [])].map(s => ({
                sourceURL: s.sourceURL, sourceFunctionName: s.sourceFunctionName,
                invoker: s.invoker, duration: s.duration, executionStart: s.executionStart,
              })) : [] });
          }
        });
        observer.observe({ type, buffered: true });
        diag.supported.push(type);
      } catch { /* unsupported entry type */ }
    }
    diag.start = async () => {
      if (diag.started) return;
      const [{ state }, { isMorphing }] = await Promise.all([
        import('/src/core/state.js'), import('/src/scene/morph.js'),
      ]);
      diag.started = true;
      diag.running = true;
      let previous = null;
      let previousProgramCount = -1;
      const tick = t => {
        if (!diag.running) return;
        const gt3 = window.__gt3;
        if (gt3?.renderer) {
          const probe = gt3.probe();
          const info = gt3.renderer.info;
          const programs = info.programs || [];
          if (programs.length !== previousProgramCount) {
            diag.programSnapshots.push({ t, count: programs.length,
              added: programs.slice(Math.max(0, previousProgramCount)).map(p => ({
                id: p.id, name: p.name, cacheKey: p.cacheKey,
              })) });
            previousProgramCount = programs.length;
          }
          const frame = { t, dt: previous ? t - previous.t : null,
            progress: probe.progress, dp: previous ? probe.progress - previous.progress : 0,
            level: probe.level, applied: probe.applied, active: state.activeCarIndex,
            morph: isMorphing(), programs: info.programs?.length ?? 0,
            textures: info.memory.textures, geometries: info.memory.geometries,
            gl: { ...glCalls },
            heap: performance.memory?.usedJSHeapSize ?? null };
          diag.frames.push(frame);
          previous = frame;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const hud = document.querySelector('#hud-topleft');
      if (hud) new MutationObserver(records => {
        diag.entries.push({ type: 'hud', startTime: performance.now(), duration: 0,
          detail: records.map(r => `${r.type}:${r.target.className || r.target.nodeName}`).slice(0, 8).join(',') });
      }).observe(hud, { attributes: true, childList: true, characterData: true, subtree: true });
    };
  });
}

async function prewarm(page) {
  return page.evaluate(async () => {
    const { getCarModel } = await import('/src/scene/cars.js');
    const gt3 = window.__gt3;
    const mount = gt3.scene.getObjectByName('car-mount');
    const initialChildren = [...mount.children];
    const models = Array.from({ length: 10 }, (_, i) => getCarModel(i));
    if (models.some(m => !m)) throw new Error('Prewarm: car preload incomplete');
    const originalParents = models.map(m => m.parent);
    const mats = new Map();
    for (const model of models) model.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mats.has(m)) mats.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
      }
    });
    const before = { programs: gt3.renderer.info.programs?.length ?? 0, textures: gt3.renderer.info.memory.textures };
    try {
      for (const model of models) if (model.parent !== mount) mount.add(model);
      gt3.renderer.compile(gt3.scene, gt3.camera);
      gt3.renderer.render(gt3.scene, gt3.camera);
      for (const [mat] of mats) {
        mat.transparent = true; mat.opacity = 0; mat.depthWrite = false; mat.needsUpdate = true;
      }
      gt3.renderer.compile(gt3.scene, gt3.camera);
      gt3.renderer.render(gt3.scene, gt3.camera);
    } finally {
      for (const [mat, old] of mats) {
        mat.transparent = old.transparent; mat.opacity = old.opacity;
        mat.depthWrite = old.depthWrite; mat.needsUpdate = true;
      }
      for (let i = 0; i < models.length; i++) {
        if (models[i].parent !== originalParents[i]) {
          models[i].parent?.remove(models[i]);
          originalParents[i]?.add(models[i]);
        }
      }
    }
    if (mount.children.length !== initialChildren.length || initialChildren.some((c, i) => mount.children[i] !== c))
      throw new Error('Prewarm did not restore car mount children exactly');
    return { modelCount: models.length, materialCount: mats.size, before,
      after: { programs: gt3.renderer.info.programs?.length ?? 0, textures: gt3.renderer.info.memory.textures },
      restoredChildren: mount.children.map(c => c.name) };
  });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    const { isMorphing } = await import('/src/scene/morph.js');
    return { progress: state.progress, active: state.activeCarIndex, target: state.targetProgress,
      locked: state.scrollLocked, audioReady: state.audioReady, masterMuted: state.masterMuted,
      morphing: isMorphing(), scrollY: window.scrollY,
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      speaker: document.querySelector('.audio-speaker')?.dataset.sound,
      time: performance.now() };
  });
}

async function seek(page, progress) {
  await page.evaluate(async p => (await import('/src/scroll/scrollDrive.js')).seekTo(p, { instant: true }), progress);
  await pause(2200);
  await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing(),
    { timeout: 20000, polling: 100 });
  const s = await snapshot(page);
  assert(Math.abs(s.progress - progress) < .0003, `Seek did not settle: ${JSON.stringify(s)}`);
  return s;
}

async function drive(page, goalProgress, direction, length, maxMs = 180000) {
  const started = Date.now();
  let events = 0;
  // On headed Chrome/macOS, CDP wheel deltaY=120 moved ~40 m per event in a
  // calibration pass. The legacy 2-unit wheel step produces ~0.7 m and avoids jumping gates in default mode.
  const deltaY = direction * wheelDeltaAbs;
  const bounded = scrollMode !== 'default';
  while (Date.now() - started < maxMs) {
    const s = await snapshot(page);
    assert(!s.locked, `Scroll locked during drive: ${JSON.stringify(s)}`);
    if (direction * (s.progress - goalProgress) >= 0) return { events, elapsedMs: Date.now() - started, end: s };
    const targetLeadM = direction * (s.target - s.progress) * length;
    // default: legacy gate (feed only while the target lead is < 12 m). cap/pace: lead is bounded by the model,
    // so feed continuously until the target reaches the goal (steady input also keeps the pace estimate honest).
    if (direction * (s.target - goalProgress) < 0 && (bounded || targetLeadM < 12)) {
      for (let i = 0; i < wheelBurst; i++) {
        await page.mouse.wheel({ deltaY });
        events++;
        await pause(33);
      }
    } else {
      await pause(33);
    }
  }
  throw new Error(`Wheel drive timed out toward ${goalProgress}: ${JSON.stringify(await snapshot(page))}`);
}

async function runOne(index, warmed) {
  await preflightBeforeBrowser();
  const profile = await mkdtemp(join(workRoot, `chrome-${index}-`));
  const browser = await puppeteer.launch({ executablePath: chrome, headless, pipe: true,
    timeout: 300000, protocolTimeout: 300000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
      `--user-data-dir=${profile}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 } });
  const run = { index, warmed, sound: (index === 2 || index === 4) && !warmed, profile,
    wheelDeltaY: wheelDeltaAbs, wheelBurst, wheelIntervalMs: 33, scrollMode, pageUrl, phases: {}, errors: [],
    vm: [vmStat('launched')], hostSamples: [] };
  result.runs.push(run);
  const hostTimer = setInterval(() => {
    const requestedAt = Date.now();
    execFile('vm_stat', { encoding: 'utf8' }, (error, output) => {
      if (error) return;
      const read = name => Number(output.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1]);
      run.hostSamples.push({ atMs: requestedAt, pageouts: read('Pageouts'),
        swapouts: read('Swapouts') });
    });
  }, 1000);
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => run.errors.push(`pageerror: ${e.message}`));
    page.on('console', e => { if (e.type() === 'error') run.errors.push(`console: ${e.text()}`); });
    page.on('response', e => { if (e.status() >= 400) run.errors.push(`HTTP ${e.status()} ${e.url()}`); });
    await installDiagnostics(page);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    run.gpuRssAtDomMB = gpuRssMB(browser);
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig')
      && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
    run.readiness = await page.evaluate(() => window.__gt3?.readiness
      ? { status: window.__gt3.readiness.status,
        model: window.__gt3.readiness.model, audio: window.__gt3.readiness.audio,
        gpu: window.__gt3.readiness.gpu, reasons: [...window.__gt3.readiness.reasons] }
      : null);
    assert(!run.readiness || run.readiness.status === 'ready',
      `Performance run entered degraded readiness: ${JSON.stringify(run.readiness)}`);
    run.rendererAtReady = await page.evaluate(() => {
      const info = window.__gt3.renderer.info;
      return { programs: info.programs?.length ?? 0,
        textures: info.memory.textures, geometries: info.memory.geometries };
    });
    run.programsAtReady = await page.evaluate(() => window.__gt3.renderer.info.programs?.map(p => ({
      id: p.id, name: p.name, cacheKey: p.cacheKey,
    })) || []);
    run.gpuRssAtReadyMB = gpuRssMB(browser);
    run.vm.push(vmStat('ready'));
    // A2: every frame from first mounted car (warm-up start on W4 builds) to ready.
    const boot = await page.evaluate(() => ({ frames: window.__swapDiag.startupFrames,
      modelsAt: window.__swapDiag.modelsAt, readyAt: window.__swapDiag.readyAt }));
    run.modelsMs = boot.modelsAt;
    run.readyMs = boot.readyAt;
    run.warmupFrames = frameStats(boot.frames.filter(f => f.t > boot.modelsAt && f.t <= boot.readyAt));
    run.warmupSteps = await page.evaluate(() => window.__gt3?.readiness?.warmupSteps ?? null);
    if (run.warmupSteps?.length) {
      run.warmupStepSummary = Object.fromEntries(
        [...new Set(run.warmupSteps.map(step => step.phase))].map(phase => {
          const steps = run.warmupSteps.filter(step => step.phase === phase);
          return [phase, { draws: steps.length,
            setupMs: +steps.reduce((sum, step) => sum + step.setupMs, 0).toFixed(1),
            renderMs: +steps.reduce((sum, step) => sum + step.renderMs, 0).toFixed(1),
            maxMs: +Math.max(...steps.map(step => step.totalMs)).toFixed(1) }];
        }),
      );
      run.warmupOutsideStepMs = +(boot.readyAt - boot.modelsAt -
        run.warmupSteps.reduce((sum, step) => sum + step.totalMs, 0)).toFixed(1);
    }
    run.warmupLongest = boot.frames.filter(f => f.t > boot.modelsAt && f.t <= boot.readyAt)
      .sort((a, b) => b.dt - a.dt).slice(0, 8).map(f => ({ offsetMs: +(f.t - boot.modelsAt).toFixed(0), dtMs: +f.dt.toFixed(1) }));
    if (startupOnly) return;
    await page.mouse.wheel({ deltaY: 2 }); // real first gesture dismisses start screen
    await pause(1700);
    if (run.sound) {
      await page.click('.audio-speaker');
      await page.waitForFunction(async () => document.querySelector('.audio-speaker')?.dataset.sound === 'on'
        && (await import('/src/core/state.js')).state.audioReady,
        { timeout: 20000 });
      run.soundConfirmed = await page.evaluate(async () => ({
        audioReady: (await import('/src/core/state.js')).state.audioReady,
        gains: window.__gt3audio?.gains(),
      }));
    }
    const metadata = await page.evaluate(async () => {
      const route = await import('/src/scene/trackCurve.js');
      return { length: route.TRACK_LENGTH, gates: route.CHECKPOINT_T,
        timeOrigin: performance.timeOrigin,
        webgl: window.__gt3.renderer.getContext().getParameter(0x1F01),
        chrome: navigator.userAgent };
    });
    run.metadata = metadata;
    if (warmed) { run.prewarm = await prewarm(page); await pause(2200); }
    const { length, gates } = metadata;
    const before1 = gates[0] - 275 / length;
    const after1 = gates[0] + 80 / length;
    const below1 = gates[0] - 80 / length;
    if (index !== 1 || warmed) await seek(page, before1);
    else await pause(2200); // first context drives gate 1 from the start with no seek
    await page.evaluate(() => window.__swapDiag.start());
    const start = await snapshot(page);
    run.start = start;
    console.log(`RUN ${index}${warmed ? ' prewarm' : ''} start: progress=${start.progress.toFixed(5)}, scroll=${start.scrollY}/${start.maxScroll}`);
    run.vm.push(vmStat('beforeCold'));
    run.phases.cold = await drive(page, after1, +1, length);
    run.vm.push(vmStat('afterCold'));
    console.log(`RUN ${index} cold crossed: ${run.phases.cold.events} wheel events`);
    if (firstGateOnly) {
      await pause(1800);
      const data = await page.evaluate(() => ({ frames: window.__swapDiag.frames,
        entries: window.__swapDiag.entries,
        programSnapshots: window.__swapDiag.programSnapshots }));
      const i = data.frames.findIndex((frame, n) => n && frame.active !== data.frames[n - 1].active);
      const center = data.frames[i]?.t;
      run.windows = { cold: summarizeWindow('cold', data.frames, data.entries, center, length) };
      run.programSnapshots = data.programSnapshots;
      run.rendererAtEnd = await page.evaluate(() => {
        const info = window.__gt3.renderer.info;
        return { programs: info.programs?.length ?? 0,
          textures: info.memory.textures, geometries: info.memory.geometries };
      });
      return;
    }
    run.phases.reverse = await drive(page, below1, -1, length);
    run.vm.push(vmStat('afterReverse'));
    console.log(`RUN ${index} reverse crossed: ${run.phases.reverse.events} wheel events`);
    run.phases.warm = await drive(page, after1, +1, length);
    run.vm.push(vmStat('afterWarm'));
    console.log(`RUN ${index} warm crossed: ${run.phases.warm.events} wheel events`);
    await pause(1800);
    run.phases.beforeLater = await seek(page, gates[4] - 275 / length);
    run.vm.push(vmStat('beforeLaterCold'));
    run.phases.laterCold = await drive(page, gates[4] + 80 / length, +1, length);
    run.vm.push(vmStat('afterLaterCold'));
    console.log(`RUN ${index} later cold crossed: ${run.phases.laterCold.events} wheel events`);
    run.phases.laterReverse = await drive(page, gates[4] - 80 / length, -1, length);
    run.phases.laterWarm = await drive(page, gates[4] + 80 / length, +1, length);
    run.vm.push(vmStat('afterLaterWarm'));
    run.phases.control = await drive(page, gates[4] + 200 / length, +1, length);
    await pause(1800);
    run.vm.push(vmStat('afterControl'));
    const data = await page.evaluate(() => ({ frames: window.__swapDiag.frames,
      entries: window.__swapDiag.entries, supported: window.__swapDiag.supported,
      startupFrames: window.__swapDiag.startupFrames, modelsAt: window.__swapDiag.modelsAt,
      readyAt: window.__swapDiag.readyAt, dismissedAt: window.__swapDiag.dismissedAt,
      hiddenAt: window.__swapDiag.hiddenAt,
      programSnapshots: window.__swapDiag.programSnapshots }));
    run.dismissedMs = data.dismissedAt;
    run.hiddenMs = data.hiddenAt;
    run.programSnapshots = data.programSnapshots;
    run.fadeFrames = frameStats(data.startupFrames.filter(f =>
      f.t > data.dismissedAt && f.t <= data.hiddenAt), length);
    run.postDismissFrames = frameStats(data.startupFrames.filter(f =>
      f.t > data.hiddenAt && f.t <= data.hiddenAt + 5000), length);
    run.first30sFrames = frameStats(data.startupFrames.filter(f =>
      f.t > data.hiddenAt && f.t <= data.hiddenAt + 30000), length);
    run.observerSupport = data.supported;
    run.frameCount = data.frames.length;
    run.soundState = await snapshot(page);
    run.rendererAtEnd = await page.evaluate(() => {
      const info = window.__gt3.renderer.info;
      return { programs: info.programs?.length ?? 0,
        textures: info.memory.textures, geometries: info.memory.geometries };
    });
    run.gpuRssAtEndMB = gpuRssMB(browser);
    const changes = data.frames.filter((f, i) => i && f.active !== data.frames[i - 1].active)
      .map(f => ({ t: f.t, from: data.frames[data.frames.indexOf(f) - 1].active, to: f.active, progress: f.progress }));
    run.changes = changes;
    const crossing = (from, to, ordinal = 0) => changes.filter(c => c.from === from && c.to === to)[ordinal]?.t;
    const controlProgress = gates[4] + 140 / length;
    const controlFrame = data.frames.find(f => f.progress >= controlProgress && f.t > (crossing(4, 5) || 0) + 1500);
    const centers = { cold: crossing(0, 1, 0), reverse: crossing(1, 0), warm: crossing(0, 1, 1),
      laterCold: crossing(4, 5, 0), laterReverse: crossing(5, 4, 0),
      laterWarm: crossing(4, 5, 1), control: controlFrame?.t };
    run.windows = Object.fromEntries(Object.entries(centers).map(([name, center]) =>
      [name, summarizeWindow(name, data.frames, data.entries, center, length, name !== 'control')]));
    for (const window of Object.values(run.windows)) {
      if (!Number.isFinite(window.centerMs)) continue;
      const start = metadata.timeOrigin + window.centerMs - 1500;
      const end = metadata.timeOrigin + window.centerMs + 1500;
      window.hostSamples = run.hostSamples.filter(sample => sample.atMs >= start && sample.atMs <= end);
    }
    await writeFile(join(outputDir, `frames-${index}${warmed ? '-prewarm' : ''}.json`),
      JSON.stringify({ metadata, frames: data.frames, entries: data.entries,
        startupFrames: data.startupFrames, programSnapshots: data.programSnapshots }) + '\n');
    console.log(`RUN ${index}${warmed ? ' prewarm' : ''}: ` + Object.entries(run.windows)
      .map(([name, w]) => `${name}=${w.max ?? 'missing'}ms`).join(' '));
    // Finish the route by real wheel input for the memory/whole-context result.
    // 0.9942 passes the physical finish gate while staying below the legacy
    // finish-screen threshold (0.995), so it keeps the Tour renderer active.
    run.phases.fullLap = await drive(page, 0.9942, +1, length);
    run.vm.push(vmStat('lapEnd'));
    run.rendererAtLapEnd = await page.evaluate(() => {
      const info = window.__gt3.renderer.info;
      return { programs: info.programs?.length ?? 0,
        textures: info.memory.textures, geometries: info.memory.geometries };
    });
    run.gpuRssAtLapEndMB = gpuRssMB(browser);
  } finally {
    clearInterval(hostTimer);
    run.vm.push(vmStat('beforeClose'));
    run.host = hostVerdict(run.vm);
    await browser.close();
  }
}

function makeSummary() {
  const lines = ['# Swap hitch measurement', '',
    `Date: ${result.startedAt}. URL: ${pageUrl} (scroll mode: ${scrollMode}, wheel ${wheelDeltaAbs} px x ${wheelBurst}/33 ms). Chrome: ${headless ? 'headless' : 'headed'} ANGLE/Metal, 1600×900.`,
    '', '| Run | Scenario | Frames | p50 | p90 | p99 | Max | >20 | >33 | >50 | >100 | >250 | Programs Δ | Textures Δ | Geometries Δ | Level changes |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const run of result.runs) for (const name of ['cold', 'reverse', 'warm', 'laterCold', 'laterReverse', 'laterWarm', 'control']) {
    const w = run.windows?.[name];
    if (!w || w.error) { lines.push(`| ${run.index}${run.warmed ? ' prewarm' : ''} | ${name} | ${w?.error || 'not run'} |`); continue; }
    lines.push(`| ${run.index}${run.warmed ? ' prewarm' : ''}${run.sound ? ' sound' : ''}${run.host?.contaminated ? ' HOST-CONTAMINATED' : ''} | ${name} | ${w.frameCount} | ${w.p50} | ${w.p90} | ${w.p99} | ${w.max} | ${w.counts.gt20} | ${w.counts.gt33} | ${w.counts.gt50} | ${w.counts.gt100} | ${w.counts.gt250} | ${w.programsDelta} | ${w.texturesDelta} | ${w.geometriesDelta} | ${w.levels.length} |`);
  }
  for (const run of result.runs) {
    lines.push('', `Run ${run.index}: ready ${run.readyMs?.toFixed?.(0)} ms (first car mounted ${run.modelsMs?.toFixed?.(0)} ms); `
      + `warm-up frames ${JSON.stringify(run.warmupFrames)}; fade ${JSON.stringify(run.fadeFrames)}; `
      + `first 5 s fully hidden ${JSON.stringify(run.postDismissFrames)}; first 30 s ${JSON.stringify(run.first30sFrames)}; `
      + `renderer at ready ${JSON.stringify(run.rendererAtReady)}, at end ${JSON.stringify(run.rendererAtEnd)}; `
      + `GPU RSS MB dom/ready/lap/end ${run.gpuRssAtDomMB}/${run.gpuRssAtReadyMB}/${run.gpuRssAtLapEndMB}/${run.gpuRssAtEndMB}; `
      + `host ${JSON.stringify(run.host)}`);
  }
  lines.push('', 'Each window spans ±1.5 s around the observed active-car change; the control is centered 140 m after gate 5.',
    'Frame time is the interval between consecutive requestAnimationFrame callbacks. `progressJumpM` in results.json is the route progress change over that interval.',
    'See results.json for the ten longest frames, LoAF script attribution, HUD mutations, resolution transitions, and raw frame files for every run.',
    '', `Errors: ${result.errors.length}; per-run errors are in results.json.`, '');
  return lines.join('\n');
}

try {
  await mkdir(workRoot, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  if (!process.env.GT3_URL) {
    // Directly invoke the worktree's npx-resolved Vite binary so the recorded PID is
    // the actual server process, which TERM can stop without touching other jobs.
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5191', '--strictPort', '--host', '127.0.0.1'],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    result.serverPid = server.pid;
    server.stdout.on('data', b => process.stdout.write(b));
    server.stderr.on('data', b => process.stderr.write(b));
    console.log(`Vite PID ${server.pid}`);
  }
  await waitForServer();
  if (process.env.GT3_ONLY_PREWARM !== '1') {
    for (let i = 1; i <= contexts; i++) {
      try { await runOne(i, false); } catch (e) { result.errors.push(`Run ${i}: ${e.stack || e}`); console.error(e); }
      await save();
    }
  }
  if (doPrewarm) {
    try { await runOne(contexts + 1, true); }
    catch (e) { result.errors.push(`Prewarm: ${e.stack || e}`); console.error(e); }
  }
} catch (e) {
  result.errors.push(`Harness: ${e.stack || e}`);
  console.error(e);
} finally {
  result.endedAt = new Date().toISOString();
  if (server?.pid) {
    server.kill('SIGTERM');
    result.serverTerminatedPid = server.pid;
  }
  await save();
  await writeFile(join(outputDir, 'summary.md'), makeSummary());
}
if (result.errors.length) process.exitCode = 1;
