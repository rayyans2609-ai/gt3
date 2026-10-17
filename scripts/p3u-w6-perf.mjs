/** W6 sustained pacing + stall attribution. Fork of p3u-perf.mjs (same launch, display/HUD
 * gates, wheel driver, Replay loop and host sampling) with what stall classification needs:
 *  - unlocked runs keep the PRODUCT render resolution (no quality() override); locked keeps
 *    the T1 call with DPR1 so the locked baseline stays comparable;
 *  - per-frame: RAF interval, frame-callback CPU, composer.render CPU, GPU elapsed (one
 *    whole-composer timer query per frame), morph/finish/theme flags, renderer resources;
 *  - Long Animation Frames (script attribution, render/style timing) + long tasks;
 *  - GT3_THEME=day|night|alternate (alternate flips Day/Night with the real toggle after
 *    each completed Tour, so a sustained run covers both themes and real transitions);
 *  - GT3_W6_TRACE=1: Chrome trace (renderer + GPU process + viz) for short runs only;
 *  - host.jsonl adds GPU-process RSS (ps) and pmset therm every 10 s.
 * Output: report.json, frames.json.gz (raw), host.jsonl; analyse with p3u-w6-analyze.mjs.
 */
import { writeFile, appendFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { hostSample } from './lib/perf-host.mjs';
import { launch, ready, quality, env, wait, dist, query } from './lib/p3u-common.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/w6/perf', duration = +(env.GT3_DURATION || 65);
const themeMode = env.GT3_THEME || 'day', traceOn = env.GT3_W6_TRACE === '1';
if (!(duration > 0) || !['day', 'night', 'alternate'].includes(themeMode)) throw Error('Invalid duration/theme');
const unlocked = new URLSearchParams(query).get('version') === 'unlocked';
const { browser, page, report, releaseDisplay } = await launch('perf', out, env.GT3_HEADLESS !== '1');
Object.assign(report, { harness: 'p3u-w6-perf', mode: 'tour', gpuScope: 'total', requestedSeconds: duration, themeMode, traceEnabled: traceOn,
  presentationCaveat: 'App RAF cadence under real headful vsync; not a count of displayed frames.' });
let tracing = false;
const exec = promisify(execFile);
const bounded = (promise, label, ms = 5000) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} exceeded ${ms}ms`)), ms); })]).finally(() => clearTimeout(timer)); };
async function gpuProcess() {
  // Children of the owned browser only: GPU and renderer helper RSS/CPU.
  const { stdout } = await exec('ps', ['-Ao', 'pid,ppid,rss,%cpu,command'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return stdout.split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/)).filter(m => m && +m[2] === report.browserPid && /--type=(gpu-process|renderer)/.test(m[5]))
    .map(m => ({ pid: +m[1], type: m[5].match(/--type=([\w-]+)/)[1], rssMB: Math.round(+m[3] / 1024), cpu: +m[4] }));
}
try {
  await page.evaluateOnNewDocument(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => {
      const p = window.__p3uPerf;
      if (cb.name !== 'frame' || !p?.recording) return cb(ts);
      const now = performance.now(), f = { t: now, raf: ts, dt: p.last == null ? null : ts - p.last, cpu: 0, render: 0, gpu: {} };
      p.last = ts; p.ordinal = (p.ordinal || 0) + 1; p.current = f;
      cb(ts);
      f.cpu = performance.now() - now;
      const g = window.__gt3, probe = g.probe(), info = g.renderer.info;
      Object.assign(f, { progress: probe.progress, speed: probe.speed01, car: p.state.activeCarIndex, morph: p.morph.isMorphing(),
        finish: probe.progress >= .995, mode: p.state.mode, theme: p.state.theme, heap: performance.memory?.usedJSHeapSize,
        calls: info.render.calls, programs: info.programs.length, textures: info.memory.textures, geometries: info.memory.geometries });
      p.frames.push(f); p.current = null;
    });
  });
  report.loading = await ready(page, report);
  // Unlocked: product DPR/targets stay untouched. Locked: T1-identical DPR1 call.
  report.quality = unlocked ? { productResolution: true } : await quality(page, 1, '');
  report.product = await page.evaluate(async () => {
    const g = window.__gt3, rp = await import('/src/core/renderProfile.js');
    return { settings: JSON.parse(JSON.stringify(rp.SETTINGS, (k, v) => k === 'themes' ? undefined : v)), version: rp.VERSION, mode: rp.QUALITY_MODE,
      pixelRatio: g.renderer.getPixelRatio(), canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
      targets: [g.composer.readBuffer, g.composer.writeBuffer].map(t => ({ width: t.width, height: t.height, type: t.texture.type, samples: t.samples })),
      passes: g.composer.passes.map(p => ({ name: p.constructor.name, enabled: p.enabled })), programs: g.renderer.info.programs.length, memory: { ...g.renderer.info.memory } };
  });
  if (themeMode === 'night') await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));
  const pageCDP = await page.createCDPSession(); await pageCDP.send('Performance.enable');
  report.startMetrics = (await pageCDP.send('Performance.getMetrics')).metrics;
  report.setup = await page.evaluate(async () => {
    const g = window.__gt3, gl = g.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const { state } = await import('/src/core/state.js'), morph = await import('/src/scene/morph.js');
    const p = window.__p3uPerf = { frames: [], longTasks: [], loaf: [], events: [], pending: [], recording: false, last: null, current: null, disjoint: 0, state, morph };
    new PerformanceObserver(l => { if (p.recording) for (const e of l.getEntries()) p.longTasks.push({ t: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: false });
    const loafSupported = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
    if (loafSupported) new PerformanceObserver(l => { if (p.recording) for (const e of l.getEntries()) p.loaf.push({ t: e.startTime, duration: e.duration,
      blocking: e.blockingDuration, renderStart: e.renderStart, styleLayoutStart: e.styleAndLayoutStart, firstUIEvent: e.firstUIEventTimestamp,
      scripts: e.scripts.map(s => ({ invoker: s.invoker, type: s.invokerType, start: s.startTime, duration: s.duration, forcedLayout: s.forcedStyleAndLayoutDuration, source: `${s.sourceURL?.split('/').pop()}:${s.sourceFunctionName}` })) }); })
      .observe({ type: 'long-animation-frame', buffered: false });
    function drain() {
      for (let i = p.pending.length - 1; i >= 0; i--) {
        const v = p.pending[i];
        if (!gl.getQueryParameter(v.q, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) p.disjoint++; else v.frame.gpu.total = gl.getQueryParameter(v.q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(v.q); p.pending.splice(i, 1);
      }
    }
    const original = g.composer.render;
    g.composer.render = function (...args) {
      if (!p.recording || !p.current) return original.apply(this, args);
      const f = p.current, start = performance.now();
      if (ext) { drain(); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); p.pending.push({ q, frame: f }); }
      try { return original.apply(this, args); } finally { if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT); f.render += performance.now() - start; }
    };
    for (const kind of ['wheel', 'scroll']) window.addEventListener(kind, e => { if (p.recording) p.events.push({ t: performance.now(), kind, deltaY: e.deltaY }); }, { passive: true });
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { gpu: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), timerExtension: !!ext, loafSupported,
      visibility: document.visibilityState, css: [innerWidth, innerHeight], deviceDPR: devicePixelRatio, probe: g.probe() };
  });
  if (!/ANGLE.*Metal/i.test(report.setup.gpu) || /SwiftShader|software/i.test(report.setup.gpu)) throw Error(`Nonhardware GPU: ${report.setup.gpu}`);
  await wait(3000);
  for (const extra of await browser.pages()) if (extra !== page) await extra.close();
  await page.bringToFront(); await wait(200);
  if (traceOn) {
    await page.tracing.start({ path: `${out}/trace.json`, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-v8.gc', 'blink.user_timing', 'gpu', 'viz', 'cc', 'benchmark', 'toplevel'] });
    tracing = true;
  }
  // Clock sync for trace analysis: the mark's trace timestamp pairs with this performance.now().
  report.traceSync = await page.evaluate(() => { const p = window.__p3uPerf; p.recording = true; p.start = performance.now(); performance.mark('w6:sync'); return p.start; });
  let monitoring = false, previous, previousPaging = false;
  const sample = async () => {
    if (monitoring) return; monitoring = true;
    try {
      const [host, thermal, gpuProc] = await Promise.all([hostSample(), exec('pmset', ['-g', 'therm'], { encoding: 'utf8' }), gpuProcess()]);
      const app = await bounded(page.evaluate(() => { const p = window.__p3uPerf, i = window.__gt3.renderer.info; return { frames: p.frames.length, frameAgeMs: p.last == null ? null : performance.now() - p.last,
        progress: window.__gt3.probe().progress, visibility: document.visibilityState, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        programs: i.programs.length, textures: i.memory.textures, geometries: i.memory.geometries, theme: p.state.theme }; }), 'RAF watchdog', 3000);
      if (app.frameAgeMs > 2000 || app.visibility !== 'visible') throw Error(`Presentation suspended: ${JSON.stringify(app)}`);
      const row = { app, elapsedSeconds: (Date.now() - started) / 1000, ...host, processes: undefined, gpuProcess: gpuProc, thermal: thermal.stdout.trim() };
      await appendFile(`${out}/host.jsonl`, JSON.stringify(row) + '\n');
      if (previous) {
        const paging = host.pageouts > previous.pageouts || host.swapouts > previous.swapouts;
        if (previous.pressure !== 1 && host.pressure !== 1) throw Error('Two consecutive nonnormal memory-pressure samples');
        if (previous.idle < 15 && host.idle < 15) throw Error('Two consecutive low CPU-idle samples');
        if (previous.system > 65 && host.system > 65) throw Error('Two consecutive high system-CPU samples');
        if (previousPaging && paging) throw Error('Paging rose in two consecutive host-sample intervals');
        previousPaging = paging;
      }
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
      if (elapsed >= nextProbe) {
        const status = await bounded(page.evaluate(() => ({ finished: document.querySelector('.finish-screen')?.classList.contains('is-visible') })), 'Route probe');
        nextProbe = elapsed + 1;
        if (status.finished && replayAt === null) { replayAt = elapsed + 4; loops++; report.completedLoops = loops; }
        if (replayAt !== null && elapsed >= replayAt) {
          await bounded(page.click('.finish-replay'), 'Replay click'); replayAt = null;
          await page.evaluate(() => window.__p3uPerf.events.push({ t: performance.now(), kind: 'replay' }));
          if (themeMode === 'alternate') {
            // Real toggle (the owner's control), clicked after Replay so the transition runs while driving off the grid.
            const next = await page.evaluate(() => window.__p3uPerf.state.theme === 'day' ? 'night' : 'day');
            await bounded(page.click(`.theme-segmented [data-value="${next}"]`), 'Theme click');
            await page.evaluate(next => window.__p3uPerf.events.push({ t: performance.now(), kind: 'theme', to: next }), next);
            await page.mouse.move(735, 478);
          }
        }
      }
      // 120ms wheel bursts, occasional half-second release, finish dwell and real replay button (as T1).
      if (replayAt === null && elapsed % 18 < 17.4) await bounded(page.mouse.wheel({ deltaY: 100 + 35 * Math.sin(elapsed * .7) }), 'Wheel acknowledgement');
      if (Date.now() >= nextStatus) { console.log('PERF', Math.round(elapsed), 'seconds', loops, 'complete tours'); nextStatus = Date.now() + 30000; }
      await wait(120);
    }
  } finally { clearInterval(monitor); await sample(); }
  report.elapsedSeconds = (Date.now() - started) / 1000;
  const raw = await page.evaluate(() => {
    const p = window.__p3uPerf; p.recording = false;
    return { frames: p.frames, longTasks: p.longTasks, loaf: p.loaf, events: p.events, disjoint: p.disjoint, pendingQueries: p.pending.length };
  });
  report.endMetrics = (await pageCDP.send('Performance.getMetrics')).metrics;
  report.frames = raw.frames.length; report.disjointQueries = raw.disjoint; report.pendingQueries = raw.pendingQueries;
  const summarize = frames => {
    const intervals = frames.map(f => f.dt).filter(Number.isFinite), seconds = intervals.reduce((a, b) => a + b, 0) / 1000;
    const thresholds = {};
    for (const limit of [25, 33, 50]) {
      const bad = frames.filter(f => f.dt > limit), clusters = [];
      for (const f of bad) { const last = clusters.at(-1); if (last && f.t - last.end < 1000) { last.end = f.t; last.count++; last.worst = Math.max(last.worst, f.dt); }
        else clusters.push({ start: f.t, end: f.t, count: 1, worst: f.dt }); }
      thresholds[limit] = { count: bad.length, perMinute: seconds ? bad.length / seconds * 60 : 0, clusters: clusters.length };
    }
    return { seconds, raf: dist(intervals), cpu: dist(frames.map(f => f.cpu)), render: dist(frames.map(f => f.render)), gpu: dist(frames.map(f => f.gpu.total)),
      within16_7Percent: intervals.length ? intervals.filter(v => v <= 16.7).length / intervals.length * 100 : null,
      within20Percent: intervals.length ? intervals.filter(v => v <= 20).length / intervals.length * 100 : null, thresholds };
  };
  const ranges = []; for (const f of raw.frames) if (f.morph) { const last = ranges.at(-1); if (last && f.t - 500 <= last[1]) last[1] = f.t + 500; else ranges.push([f.t - 500, f.t + 500]); }
  const inSwap = f => ranges.some(([a, b]) => f.t >= a && f.t <= b);
  report.summary = summarize(raw.frames);
  report.segments = { swapWindows: summarize(raw.frames.filter(inSwap)), finish: summarize(raw.frames.filter(f => f.finish)),
    steadyDriving: summarize(raw.frames.filter(f => !inSwap(f) && !f.finish && f.speed > .02)),
    rest: summarize(raw.frames.filter(f => !inSwap(f) && !f.finish && f.speed <= .02)),
    day: summarize(raw.frames.filter(f => f.theme === 'day')), night: summarize(raw.frames.filter(f => f.theme === 'night')) };
  report.perMinute = Array.from({ length: Math.ceil(report.elapsedSeconds / 60) }, (_, minute) => ({ minute,
    ...summarize(raw.frames.filter(f => f.t >= raw.frames[0].t + minute * 60000 && f.t < raw.frames[0].t + (minute + 1) * 60000)) }));
  report.gatesObserved = ranges.length;
  report.carFrames = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, raw.frames.filter(f => f.car === i).length]));
  report.resourceGrowth = ['programs', 'textures', 'geometries'].map(k => ({ k, first: raw.frames[0]?.[k], last: raw.frames.at(-1)?.[k], max: Math.max(...raw.frames.map(f => f[k])) }));
  report.longTaskCount = raw.longTasks.length; report.loafCount = raw.loaf.length;
  await writeFile(`${out}/frames.json.gz`, gzipSync(JSON.stringify(raw)));
  console.log('RESULT', JSON.stringify({ raf: report.summary.raf, gpu: report.summary.gpu, t: report.summary.thresholds, completedLoops: report.completedLoops, gates: report.gatesObserved }));
} catch (e) {
  report.incomplete = true; report.errors.push(e.stack);
  try { const partial = await Promise.race([page.evaluate(() => { const p = window.__p3uPerf; if (!p) return null; p.recording = false; return { frames: p.frames, longTasks: p.longTasks, loaf: p.loaf, events: p.events }; }), wait(2000).then(() => null)]);
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
