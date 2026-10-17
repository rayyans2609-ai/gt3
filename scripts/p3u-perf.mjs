/** P3u complete-tour pacing / GPU attribution. Headful by default (true macOS fullscreen,
 * real page: 1470×919 @2x beneath the 1470×956 panel's camera-notch band, asserted with
 * the bottom-HUD visibility gate before timing).
 * GT3_DURATION=600 (seconds, loops), GT3_MODE=tour|steady, GT3_GPU_SCOPE=total|passes|shadow
 * GT3_HEADLESS=1 is attribution only, never presentation acceptance. GT3_TRACE=1 enables
 * Chrome GC trace (extra observer overhead); raw RAF + GPU samples are always gzipped.
 * All quality candidates are page-only overrides; see lib/p3u-common.mjs.
 */
import { writeFile, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { hostSample } from './lib/perf-host.mjs';
import { launch, ready, quality, env, wait, dist } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/perf', duration = +(env.GT3_DURATION || 600);
const mode = env.GT3_MODE || 'tour', scope = env.GT3_GPU_SCOPE || 'total';
if (!(duration > 0) || !['tour', 'steady'].includes(mode) || !['total', 'passes', 'shadow'].includes(scope)) throw Error('Invalid duration/mode/scope');
const { browser, page, report, releaseDisplay } = await launch('perf', out, env.GT3_HEADLESS !== '1');
report.mode = mode; report.gpuScope = scope; report.gpuSampling = scope === 'passes' ? 'One pass per frame, round-robin; avoids per-pass query flush amplification on Metal' : 'One query per frame'; report.requestedSeconds = duration;
report.presentationCaveat = 'App RAF cadence under real headful vsync; not a count of displayed frames. Headless is GPU attribution only.';
report.traceEnabled = env.GT3_TRACE === '1';
let tracing = false;
const bounded = (promise, label, ms = 5000) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} exceeded ${ms}ms`)), ms); })]).finally(() => clearTimeout(timer)); };
try {
  await page.evaluateOnNewDocument(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => {
      const p = window.__p3uPerf;
      if (cb.name !== 'frame' || !p?.recording) return cb(ts);
      const now = performance.now(), f = { t: now, raf: ts, dt: p.last == null ? null : ts - p.last, cpu: 0, gpu: {} };
      p.last = ts; p.ordinal = (p.ordinal || 0) + 1; p.current = f;
      cb(ts);
      f.cpu = performance.now() - now;
      const g = window.__gt3, probe = g.probe();
      Object.assign(f, { progress: probe.progress, speed: probe.speed01, ratio: probe.ratio,
        car: p.state.activeCarIndex, morph: p.morph.isMorphing(), finish: probe.progress >= .995,
        phase: p.phase, heap: performance.memory?.usedJSHeapSize });
      p.frames.push(f); p.current = null;
    });
  });
  report.loading = await ready(page, report);
  report.quality = await quality(page);
  report.theme = env.GT3_THEME || 'day';
  if (report.theme !== 'day') await page.evaluate(async theme => (await import('/src/scene/theme.js')).applyTheme(theme, { instant: true }), report.theme);
  const pageCDP = await page.createCDPSession(); await pageCDP.send('Performance.enable');
  report.startMetrics = (await pageCDP.send('Performance.getMetrics')).metrics;
  if (report.traceEnabled) { await page.tracing.start({ path: `${out}/gc-trace.json`, categories: ['v8', 'disabled-by-default-v8.gc', 'blink.user_timing'] }); tracing = true; }
  report.setup = await page.evaluate(async ({ scope, mode }) => {
    const g = window.__gt3, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const { state } = await import('/src/core/state.js'), morph = await import('/src/scene/morph.js');
    const p = window.__p3uPerf = { frames: [], longTasks: [], gc: [], events: [], pending: [], recording: false, last: null, current: null, disjoint: 0, state, morph, phase: 'startup' };
    new PerformanceObserver(l => { if (p.recording) for (const e of l.getEntries()) p.longTasks.push({ t: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: false });
    const gcSupported = PerformanceObserver.supportedEntryTypes.includes('gc');
    if (gcSupported) new PerformanceObserver(l => { if (p.recording) for (const e of l.getEntries()) p.gc.push({ t: e.startTime, duration: e.duration }); }).observe({ type: 'gc' });
    function drain() {
      for (let i = p.pending.length - 1; i >= 0; i--) {
        const v = p.pending[i];
        if (!gl.getQueryParameter(v.q, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) p.disjoint++; else v.frame.gpu[v.label] = (v.frame.gpu[v.label] || 0) + gl.getQueryParameter(v.q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(v.q); p.pending.splice(i, 1);
      }
    }
    function wrap(obj, key, label, slot = 0, slots = 0) {
      const original = obj[key];
      obj[key] = function (...args) {
        if (!p.recording || !p.current || !ext || (slots && p.ordinal % slots !== slot)) return original.apply(this, args);
        drain(); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        try { return original.apply(this, args); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); p.pending.push({ q, frame: p.current, label }); }
      };
    }
    if (scope === 'total') wrap(g.composer, 'render', 'total');
    if (scope === 'passes') { const passes = g.composer.passes.filter(p => p.enabled); for (const [i, pass] of passes.entries()) wrap(pass, 'render', pass === g.passes.motionBlur ? 'motionBlur' : pass === g.passes.antialias ? 'smaa' : pass === g.passes.wash ? 'wash' : pass.constructor.name === 'RenderPass' ? 'sceneIncludingShadow' : pass.constructor.name, i, passes.length); }
    if (scope === 'shadow') wrap(g.renderer.shadowMap, 'render', 'shadow');
    window.addEventListener('wheel', e => { if (p.recording) p.events.push({ t: performance.now(), kind: 'wheel', deltaY: e.deltaY }); }, { passive: true });
    if (mode === 'steady') {
      const route = await import('/src/scene/trackCurve.js');
      (await import('/src/scroll/scrollDrive.js')).seekTo(route.progressAtRouteT(.123), { instant: true });
      (await import('/src/scene/aerialCamera.js')).snap();
    }
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), timerExtension: !!ext, gcSupported,
      visibility: document.visibilityState, screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      css: [innerWidth, innerHeight], deviceDPR: devicePixelRatio, probe: g.probe() };
  }, { scope, mode });
  if (!/ANGLE.*Metal/i.test(report.setup.gpu) || /SwiftShader|software/i.test(report.setup.gpu)) throw Error(`Nonhardware GPU: ${report.setup.gpu}`);
  await wait(3000);
  for (const extra of await browser.pages()) if (extra !== page) await extra.close();
  await page.bringToFront(); await wait(200);
  await page.evaluate(() => { const p = window.__p3uPerf; p.recording = true; p.start = performance.now(); p.phase = 'steady'; });
  const exec = promisify(execFile); let monitoring = false, previous;
  const sample = async () => {
    if (monitoring) return; monitoring = true;
    try {
      const [host, thermal] = await Promise.all([hostSample(), exec('pmset', ['-g', 'therm'], { encoding: 'utf8' })]);
      const app = await bounded(page.evaluate(() => { const p = window.__p3uPerf; return { frames: p.frames.length, frameAgeMs: p.last == null ? null : performance.now() - p.last, progress: window.__gt3.probe().progress, visibility: document.visibilityState }; }), 'RAF watchdog', 3000);
      if (app.frameAgeMs > 2000 || app.visibility !== 'visible') throw Error(`Presentation suspended: ${JSON.stringify(app)}`);
      const row = { app, elapsedSeconds: (Date.now() - started) / 1000, ...host, thermal: thermal.stdout.trim() };
      await appendFile(`${out}/host.jsonl`, JSON.stringify(row) + '\n');
      if (previous && previous.pressure !== 1 && host.pressure !== 1) throw Error('Two consecutive nonnormal memory-pressure samples');
      previous = host;
    } catch (e) { report.monitorError = e.message; } finally { monitoring = false; }
  };
  const started = Date.now(); await sample();
  const monitor = setInterval(() => void sample(), 10000);
  let nextStatus = started, nextProbe = 0, replayAt = null, loops = 0;
  try {
    while (Date.now() - started < duration * 1000) {
      if (report.monitorError) throw Error(report.monitorError);
      const elapsed = (Date.now() - started) / 1000;
      if (mode === 'tour') {
        if (elapsed >= nextProbe) {
          const status = await bounded(page.evaluate(() => ({ probe: window.__gt3.probe(), finished: document.querySelector('.finish-screen')?.classList.contains('is-visible') })), 'Route probe');
          nextProbe = elapsed + 1;
          if (status.finished && replayAt === null) { replayAt = elapsed + 4; loops++; report.completedLoops = loops; }
          if (replayAt !== null && elapsed >= replayAt) {
            await bounded(page.click('.finish-replay'), 'Replay click'); replayAt = null;
            await page.evaluate(() => { const p = window.__p3uPerf; p.events.push({ t: performance.now(), kind: 'replay' }); });
          }
        }
        // 120ms wheel bursts, occasional half-second release, finish dwell and real replay button.
        if (replayAt === null && elapsed % 18 < 17.4) await bounded(page.mouse.wheel({ deltaY: 100 + 35 * Math.sin(elapsed * .7) }), 'Wheel acknowledgement');
      }
      if (Date.now() >= nextStatus) { console.log('PERF', Math.round(elapsed), 'seconds', loops, 'complete tours'); nextStatus = Date.now() + 30000; }
      await wait(120);
    }
  } finally { clearInterval(monitor); await sample(); }
  report.elapsedSeconds = (Date.now() - started) / 1000;
  const raw = await page.evaluate(() => {
    const p = window.__p3uPerf; p.recording = false;
    return { frames: p.frames, longTasks: p.longTasks, gc: p.gc, events: p.events, disjoint: p.disjoint, pendingQueries: p.pending.length };
  });
  report.endMetrics = (await pageCDP.send('Performance.getMetrics')).metrics;
  report.frames = raw.frames.length; report.disjointQueries = raw.disjoint; report.pendingQueries = raw.pendingQueries;
  const summarize = frames => {
    const intervals = frames.map(f => f.dt).filter(Number.isFinite), seconds = intervals.reduce((a, b) => a + b, 0) / 1000;
    const gpu = {}; for (const name of new Set(frames.flatMap(f => Object.keys(f.gpu)))) gpu[name] = dist(frames.map(f => f.gpu[name]));
    const thresholds = {};
    for (const limit of [25, 33, 50]) {
      const bad = frames.filter(f => f.dt > limit), clusters = [];
      for (const f of bad) { const last = clusters.at(-1); if (last && f.t - last.end < 1000) { last.end = f.t; last.count++; last.worst = Math.max(last.worst, f.dt); }
        else clusters.push({ start: f.t, end: f.t, count: 1, worst: f.dt }); }
      thresholds[limit] = { count: bad.length, perMinute: seconds ? bad.length / seconds * 60 : 0, clusters };
    }
    return { raf: dist(intervals), cpu: dist(frames.map(f => f.cpu)), gpu,
      within16_7Percent: intervals.length ? intervals.filter(v => v <= 16.7).length / intervals.length * 100 : null,
      thresholds, heap: dist(frames.map(f => f.heap)), worst: [...frames].sort((a, b) => b.dt - a.dt).slice(0, 12) };
  };
  const swapTimes = raw.frames.filter(f => f.morph).map(f => f.t);
  // Precompute nearest swap windows once to avoid quadratic work on sustained traces.
  const ranges = []; for (const t of swapTimes) { const last = ranges.at(-1); if (last && t - 500 <= last[1]) last[1] = t + 500; else ranges.push([t - 500, t + 500]); }
  const inSwap = f => ranges.some(([a, b]) => f.t >= a && f.t <= b);
  report.summary = summarize(raw.frames);
  report.segments = { swapWindows: summarize(raw.frames.filter(inSwap)), finish: summarize(raw.frames.filter(f => f.finish)),
    steadyDriving: summarize(raw.frames.filter(f => !inSwap(f) && !f.finish && f.speed > .02)),
    rest: summarize(raw.frames.filter(f => !inSwap(f) && !f.finish && f.speed <= .02)) };
  report.perMinute = Array.from({ length: Math.ceil(report.elapsedSeconds / 60) }, (_, minute) => ({ minute,
    ...summarize(raw.frames.filter(f => f.t >= raw.frames[0].t + minute * 60000 && f.t < raw.frames[0].t + (minute + 1) * 60000)) }));
  report.gatesObserved = ranges.length;
  report.perCar = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, summarize(raw.frames.filter(f => f.car === i))]));
  report.carFrames = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, raw.frames.filter(f => f.car === i).length]));
  report.longTasks = raw.longTasks; report.gc = raw.gc;
  report.gcAvailability = report.setup.gcSupported ? 'PerformanceObserver gc' : report.traceEnabled ? 'Chrome trace in gc-trace.json; inspect V8 GC events' : 'Browser PerformanceObserver does not expose GC; heap samples and CDP metrics only (GT3_TRACE=1 for V8 GC events)';
  await writeFile(`${out}/frames.json.gz`, gzipSync(JSON.stringify(raw)));
  console.log('RESULT', JSON.stringify({ raf: report.summary.raf, gpu: report.summary.gpu, completedLoops: report.completedLoops, carFrames: report.carFrames }));
} catch (e) {
  report.incomplete = true; report.errors.push(e.stack);
  report.targetsAtFailure = browser.targets().map(t => ({ type: t.type(), url: t.url() }));
  try { const partial = await Promise.race([page.evaluate(() => { const p = window.__p3uPerf; if (!p) return null; p.recording = false; return { frames: p.frames, longTasks: p.longTasks, gc: p.gc, events: p.events }; }), wait(2000).then(() => null)]);
    if (partial) await writeFile(`${out}/partial-frames.json.gz`, gzipSync(JSON.stringify(partial)));
  } catch (captureError) { report.errors.push(`Partial capture: ${captureError.message}`); }
  process.exitCode = 1;
}
finally {
  if (tracing) try { await page.tracing.stop(); } catch (e) { report.errors.push(`Trace stop: ${e.message}`); }
  try { report.conditions.visibilityEnd = await page.evaluate(() => document.visibilityState); }
  catch (e) { report.conditions.visibilityEnd = `unknown (${e.message.split('\n')[0]})`; }
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  releaseDisplay();
  await browser.close().catch(() => {});
}
