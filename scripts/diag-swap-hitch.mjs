/** First-pass checkpoint hitch diagnostic. Run: node scripts/diag-swap-hitch.mjs
 * Env: GT3_URL (external Vite URL), GT3_HEADLESS=1, GT3_CONTEXTS=3,
 * GT3_PREWARM=1 (adds one extra warmed context), GT3_OUT (results directory).
 * The harness changes no product source and uses real wheel input for every gate.
 */
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.GT3_URL || 'http://127.0.0.1:5191';
const outputDir = process.env.GT3_OUT || '/Users/rayyansheikh/.claude/jobs/60022478/tmp/w1';
const workRoot = '/tmp/gt3-w1';
const contexts = Math.max(1, Number(process.env.GT3_CONTEXTS || 3));
const headless = process.env.GT3_HEADLESS === '1';
const doPrewarm = process.env.GT3_PREWARM !== '0';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const preflight = '/Users/rayyansheikh/.claude/jobs/60022478/tmp/preflight.sh';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const result = { startedAt: new Date().toISOString(), base, headless, contextsRequested: contexts,
  prewarmRequested: doPrewarm, runs: [], host: [], errors: [] };
let server;

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
    type: e.type, offsetMs: +(e.startTime - center).toFixed(1), durationMs: +e.duration.toFixed(2),
    blockingDurationMs: e.blockingDuration, scripts: e.scripts,
  }));
  return { name, centerMs: +center.toFixed(1), expectedChange,
    coverageOffsetsMs: [+(first.t - first.dt - center).toFixed(1), +(last.t - center).toFixed(1)],
    completeWindow: first.t - first.dt <= center - 1500 && last.t >= center + 1500,
    frameCount: sample.length, p50: percentile(gaps, .5), p90: percentile(gaps, .9),
    p99: percentile(gaps, .99), max: +Math.max(...gaps).toFixed(2),
    counts: Object.fromEntries([20, 33, 50, 100, 250].map(n => [`gt${n}`, gaps.filter(v => v > n).length])),
    progressSpanM: +((last.progress - first.progress) * trackLength).toFixed(1),
    programsDelta: last.programs - first.programs, texturesDelta: last.textures - first.textures,
    geometriesDelta: last.geometries - first.geometries, levels, longest, loaf: relevant.filter(e => e.type === 'long-animation-frame'),
    longtasks: relevant.filter(e => e.type === 'longtask'),
    hudEvents: entries.filter(e => e.type === 'hud' && e.startTime >= center - 1500 && e.startTime <= center + 1500)
      .map(e => ({ offsetMs: +(e.startTime - center).toFixed(1), detail: e.detail })),
  };
}

async function installDiagnostics(page) {
  await page.evaluateOnNewDocument(() => {
    const diag = { frames: [], entries: [], running: false, supported: [], started: false };
    window.__swapDiag = diag;
    for (const type of ['long-animation-frame', 'longtask']) {
      try {
        const observer = new PerformanceObserver(list => {
          for (const e of list.getEntries()) {
            diag.entries.push({ type, startTime: e.startTime, duration: e.duration,
              blockingDuration: e.blockingDuration ?? null,
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
      const tick = t => {
        if (!diag.running) return;
        const gt3 = window.__gt3;
        if (gt3?.renderer) {
          const probe = gt3.probe();
          const info = gt3.renderer.info;
          const frame = { t, dt: previous ? t - previous.t : null,
            progress: probe.progress, dp: previous ? probe.progress - previous.progress : 0,
            level: probe.level, applied: probe.applied, active: state.activeCarIndex,
            morph: isMorphing(), programs: info.programs?.length ?? 0,
            textures: info.memory.textures, geometries: info.memory.geometries,
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
  // calibration pass. A 2-unit wheel step produces ~0.7 m and avoids jumping gates.
  const deltaY = direction * 2;
  while (Date.now() - started < maxMs) {
    const s = await snapshot(page);
    assert(!s.locked, `Scroll locked during drive: ${JSON.stringify(s)}`);
    if (direction * (s.progress - goalProgress) >= 0) return { events, elapsedMs: Date.now() - started, end: s };
    const targetLeadM = direction * (s.target - s.progress) * length;
    if (direction * (s.target - goalProgress) < 0 && targetLeadM < 12) {
      for (let i = 0; i < 4; i++) {
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
  const run = { index, warmed, sound: index === 2 && !warmed, profile,
    wheelDeltaY: 2, wheelIntervalMs: 33, phases: {}, errors: [] };
  result.runs.push(run);
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => run.errors.push(`pageerror: ${e.message}`));
    page.on('console', e => { if (e.type() === 'error') run.errors.push(`console: ${e.text()}`); });
    page.on('response', e => { if (e.status() >= 400) run.errors.push(`HTTP ${e.status()} ${e.url()}`); });
    await installDiagnostics(page);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gt3?.scene?.getObjectByName('car-rig')
      && document.querySelector('#start-screen.is-ready'), { timeout: 120000 });
    await page.mouse.wheel({ deltaY: 2 }); // real first gesture dismisses start screen
    await pause(1700);
    if (run.sound) {
      await page.click('.audio-speaker');
      await page.waitForFunction(() => document.querySelector('.audio-speaker')?.dataset.sound === 'on',
        { timeout: 20000 });
    }
    const metadata = await page.evaluate(async () => {
      const route = await import('/src/scene/trackCurve.js');
      return { length: route.TRACK_LENGTH, gates: route.CHECKPOINT_T,
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
    run.phases.cold = await drive(page, after1, +1, length);
    console.log(`RUN ${index} cold crossed: ${run.phases.cold.events} wheel events`);
    run.phases.reverse = await drive(page, below1, -1, length);
    console.log(`RUN ${index} reverse crossed: ${run.phases.reverse.events} wheel events`);
    run.phases.warm = await drive(page, after1, +1, length);
    console.log(`RUN ${index} warm crossed: ${run.phases.warm.events} wheel events`);
    await pause(1800);
    run.phases.beforeLater = await seek(page, gates[4] - 275 / length);
    run.phases.laterCold = await drive(page, gates[4] + 80 / length, +1, length);
    console.log(`RUN ${index} later cold crossed: ${run.phases.laterCold.events} wheel events`);
    run.phases.control = await drive(page, gates[4] + 200 / length, +1, length);
    await pause(1800);
    const data = await page.evaluate(() => ({ frames: window.__swapDiag.frames,
      entries: window.__swapDiag.entries, supported: window.__swapDiag.supported }));
    run.observerSupport = data.supported;
    run.frameCount = data.frames.length;
    run.soundState = await snapshot(page);
    const changes = data.frames.filter((f, i) => i && f.active !== data.frames[i - 1].active)
      .map(f => ({ t: f.t, from: data.frames[data.frames.indexOf(f) - 1].active, to: f.active, progress: f.progress }));
    run.changes = changes;
    const crossing = (from, to, ordinal = 0) => changes.filter(c => c.from === from && c.to === to)[ordinal]?.t;
    const controlProgress = gates[4] + 140 / length;
    const controlFrame = data.frames.find(f => f.progress >= controlProgress && f.t > (crossing(4, 5) || 0) + 1500);
    const centers = { cold: crossing(0, 1, 0), reverse: crossing(1, 0), warm: crossing(0, 1, 1),
      laterCold: crossing(4, 5), control: controlFrame?.t };
    run.windows = Object.fromEntries(Object.entries(centers).map(([name, center]) =>
      [name, summarizeWindow(name, data.frames, data.entries, center, length, name !== 'control')]));
    await writeFile(join(outputDir, `frames-${index}${warmed ? '-prewarm' : ''}.json`),
      JSON.stringify({ metadata, frames: data.frames, entries: data.entries }) + '\n');
    console.log(`RUN ${index}${warmed ? ' prewarm' : ''}: ` + Object.entries(run.windows)
      .map(([name, w]) => `${name}=${w.max ?? 'missing'}ms`).join(' '));
  } finally {
    await browser.close();
  }
}

function makeSummary() {
  const lines = ['# W1 swap hitch measurement', '',
    `Date: ${result.startedAt}. URL: ${base}. Chrome: ${headless ? 'headless' : 'headed'} ANGLE/Metal, 1600×900.`,
    '', '| Run | Scenario | Frames | p50 | p90 | p99 | Max | >20 | >33 | >50 | >100 | >250 | Programs Δ | Textures Δ | Level changes |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const run of result.runs) for (const name of ['cold', 'reverse', 'warm', 'laterCold', 'control']) {
    const w = run.windows?.[name];
    if (!w || w.error) { lines.push(`| ${run.index}${run.warmed ? ' prewarm' : ''} | ${name} | ${w?.error || 'not run'} |`); continue; }
    lines.push(`| ${run.index}${run.warmed ? ' prewarm' : ''}${run.sound ? ' sound' : ''} | ${name} | ${w.frameCount} | ${w.p50} | ${w.p90} | ${w.p99} | ${w.max} | ${w.counts.gt20} | ${w.counts.gt33} | ${w.counts.gt50} | ${w.counts.gt100} | ${w.counts.gt250} | ${w.programsDelta} | ${w.texturesDelta} | ${w.levels.length} |`);
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
  for (let i = 1; i <= contexts; i++) {
    try { await runOne(i, false); } catch (e) { result.errors.push(`Run ${i}: ${e.stack || e}`); console.error(e); }
    await save();
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
