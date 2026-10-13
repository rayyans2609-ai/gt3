/** Native GPU / frame / allocation attribution. No product toggles are shipped.
 * GT3_CONFIGS=B,C,D GT3_REPEATS=3 GT3_URL=http://127.0.0.1:5211 node scripts/perf-p3y.mjs
 * A uses the 3d5c504 export; E names the fixed build. Traces stay in GT3_OUT.
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { hostSample, preflight, hostDegraded, wait } from './lib/perf-host.mjs';

const out = process.env.GT3_OUT || '/tmp/gt3-p3y-run';
const base = process.env.GT3_URL || 'http://127.0.0.1:5211';
const configs = (process.env.GT3_CONFIGS || 'B,C,D').split(',');
const repeats = +(process.env.GT3_REPEATS || 3);
const dpr = +(process.env.GT3_DPR || 2);
if (!configs.every(c => ['A', 'B', 'C', 'D', 'E'].includes(c)) || !Number.isInteger(repeats) || repeats < 1
  || ![1, 2].includes(dpr)) throw new Error('Invalid configs, repeats or DPR');
const q = (values, percentile) => {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * percentile))] : null;
};
const distribution = values => ({ n: values.length, p50: q(values, .5), p95: q(values, .95),
  p99: q(values, .99), worst: values.length ? Math.max(...values) : null });
const report = { base, dpr, css: [1280, 800], started: new Date().toISOString(),
  sha: process.env.GT3_SOURCE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), runs: [], errors: [] };
await mkdir(out, { recursive: true });
let admitted = await preflight(out);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 180000, protocolTimeout: 180000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    '--window-size=1280,800', `--user-data-dir=${out}/chrome-${process.pid}`],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: dpr } });
report.browserPid = browser.process().pid;
await writeFile(`${out}/browser.pid`, String(report.browserPid));
let stopped = false;
let page, traceRunning = false, stopping;
const persist = () => writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
// Startup can page before the first measured repetition. Cover that interval and
// retain incomplete telemetry before closing the browser; it is never a valid run.
async function stop(reason) {
  if (stopping) return stopping;
  stopped = true;
  report.stop = { reason, at: new Date().toISOString(), incomplete: true };
  stopping = (async () => {
    try {
      if (page && !page.isClosed()) {
        const partial = await Promise.race([page.evaluate(() => {
          const p = window.__perf;
          if (!p) return null;
          p.recording = false;
          return { frames: p.frames, gl: p.gl, switches: p.switches,
            input: p.input, longTasks: p.longTasks, disjoint: p.disjoint };
        }), wait(3000).then(() => null)]);
        if (partial) {
          report.stop.partial = `${out}/interrupted-frames.json.gz`;
          await writeFile(report.stop.partial, gzipSync(JSON.stringify(partial)));
        }
        if (traceRunning) {
          traceRunning = false;
          await Promise.race([page.tracing.stop(), wait(3000)]);
        }
      }
    } catch (error) { report.stop.captureError = error.message; }
    finally { await persist(); await browser.close(); }
  })();
  return stopping;
}
const terminate = () => { void stop('SIGTERM').catch(error => { report.errors.push(error.message); }); };
process.once('SIGTERM', terminate);
let monitorBusy = false;
const monitor = setInterval(async () => {
  if (monitorBusy || stopped) return;
  monitorBusy = true;
  try {
    const sample = hostSample();
    await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'monitor', sample })}\n`);
    if (hostDegraded(admitted, sample)) await stop('Host degraded during startup/run');
  } catch (error) { await stop(`Host monitor failed: ${error.message}`); }
  finally { monitorBusy = false; }
}, 30000);
try {
  report.browser = await browser.version();
  const cdp = await browser.target().createCDPSession();
  report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  page = await browser.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.evaluateOnNewDocument(() => {
    // Wrap the real application RAF, including updates before composer.render().
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(timestamp => {
      const p = window.__perf;
      if (callback.name !== 'frame' || !p?.recording) return callback(timestamp);
      const now = performance.now(), g = window.__gt3;
      const f = { t: now, raf: timestamp, dt: p.last ? now - p.last : null,
        cpu: 0, gpu: null, allocations: 0, phase: p.phase };
      p.last = now; p.current = f;
      callback(timestamp);
      f.cpu = performance.now() - now;
      const probe = g.probe();
      Object.assign(f, { dpr: probe.applied, speed: probe.speed01, progress: probe.progress,
        car: g.scene.getObjectByName('car-mount')?.children[0]?.name });
      p.frames.push(f); p.current = null;
    });
    for (const method of ['texImage2D', 'texStorage2D', 'createTexture', 'deleteTexture', 'bufferData']) {
      let proto = WebGL2RenderingContext.prototype;
      while (proto && !Object.hasOwn(proto, method)) proto = Object.getPrototypeOf(proto);
      const original = proto[method];
      proto[method] = function (...args) {
        const p = window.__perf;
        if (p?.recording) {
          if (p.current && /texImage|texStorage/.test(method)) p.current.allocations++;
          p.gl.push({ t: performance.now(), method, width: /texImage/.test(method) ? args[3] : args[3], height: args[4] });
        }
        return original.apply(this, args);
      };
    }
  });
  for (const config of configs) {
    if (stopped) break;
    if (config !== configs[0]) admitted = await preflight(out);
    await page.goto(`${base}/${config === 'D' ? '?props=lean' : ''}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
    await wait(800);
    await page.mouse.wheel({ deltaY: 20 }); await wait(1800);
    const setup = await page.evaluate(async ({ config, dpr }) => {
      const g = window.__gt3, gl = g.renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) throw new Error('GPU timer extension unavailable');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
      if (!gpu || !/ANGLE.*Metal/i.test(gpu) || /SwiftShader|software/i.test(gpu)) throw new Error(`Unacceptable GPU: ${gpu}`);
      if (innerWidth !== 1280 || innerHeight !== 800 || devicePixelRatio !== dpr)
        throw new Error('Viewport or DPR mismatch');
      if (config === 'C') g.passes.antialias.enabled = false;
      const p = window.__perf = { frames: [], gl: [], switches: [], longTasks: [], input: [], pending: [], recording: false,
        current: null, last: null, phase: '', disjoint: 0 };
      new PerformanceObserver(list => {
        if (p.recording) for (const e of list.getEntries()) p.longTasks.push({ t: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: false });
      const original = g.composer.render.bind(g.composer);
      g.composer.render = dt => {
        if (!p.recording || !p.current) return original(dt);
        while (p.pending.length && gl.getQueryParameter(p.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
          const { query, frame } = p.pending.shift();
          if (gl.getParameter(ext.GPU_DISJOINT_EXT)) p.disjoint++;
          else frame.gpu = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(query);
        }
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        try { original(dt); } finally { gl.endQuery(ext.TIME_ELAPSED_EXT); }
        p.pending.push({ query, frame: p.current });
      };
      const resize = g.renderer.setPixelRatio.bind(g.renderer);
      g.renderer.setPixelRatio = value => {
        const t = performance.now(); const before = g.renderer.getPixelRatio();
        resize(value);
        if (p.recording && before !== value) p.switches.push({ t, from: before, to: value, cpu: performance.now() - t });
      };
      const route = await import('/src/scene/trackCurve.js');
      const drive = await import('/src/scroll/scrollDrive.js');
      const camera = await import('/src/scene/aerialCamera.js');
      window.__perfSeek = t => { drive.seekTo(t == null ? 0 : route.progressAtRouteT(t), { instant: true }); camera.snap(); };
      window.addEventListener('wheel', e => { if (p.recording) p.input.push({ t: performance.now(), delta: e.deltaY }); }, { passive: true });
      return { gpu, css: [innerWidth, innerHeight], dpr: devicePixelRatio, probe: g.probe(),
        passes: g.composer.passes.map(x => ({ type: x.constructor.name, enabled: x.enabled })),
        memory: { ...g.renderer.info.memory }, heap: performance.memory?.usedJSHeapSize,
        gates: route.CHECKPOINT_ROUTE_T, checkpointProgress: route.CHECKPOINT_T[3],
        aaTargets: g.passes.antialias ? [g.passes.antialias._edgesRT.width, g.passes.antialias._edgesRT.height] : null };
    }, { config, dpr });
    console.log('SETUP', config, JSON.stringify(setup));
    report.setups ??= [];
    report.setups.push({ config, ...setup });
    await persist();
    const startupHost = hostSample();
    await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'startup', config, admitted, sample: startupHost })}\n`);
    if (stopped || hostDegraded(admitted, startupHost)) {
      await stop('Host degraded during startup; no measured repetition admitted');
      throw new Error(report.stop.reason);
    }
    if (report.errors.length) throw new Error('Page/resource errors invalidate this configuration; inspect report.errors');
    for (let rep = 1; rep <= repeats; rep++) {
      const before = hostSample();
      if (before.pressure !== 1 || before.idle < 25 || before.system >= 50) throw new Error('Host no longer meets dispatch gate');
      const tracePath = `${out}/${config}-${rep}-trace.json`;
      if (rep === 1) await page.tracing.start({ path: tracePath,
        categories: ['toplevel', 'devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-v8.gc'] });
      traceRunning = rep === 1;
      const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize);
      await page.evaluate(() => {
        const p = window.__perf; p.frames = []; p.gl = []; p.switches = []; p.input = []; p.longTasks = [];
        p.last = null; p.disjoint = 0; p.recording = false;
      });
      // Seeks between regions are setup, excluded from timing. All travel inside regions is wheel input.
      for (const [region, t] of [['grid', null], ['straight', .105], ['hairpin', .263], ['checkpoint', setup.gates[3] - .008]]) {
        await page.evaluate(t => window.__perfSeek(t), t);
        await wait(1800);
        await page.waitForFunction(async () => !(await import('/src/scene/morph.js')).isMorphing());
        await page.evaluate(region => { const p = window.__perf; p.recording = true; p.last = null; p.phase = `${region}:rest`; performance.mark(`p3y-start:${region}`); }, region);
        await wait(1500);
        for (let burst = 0; burst < 2; burst++) {
          await page.evaluate(region => { window.__perf.phase = `${region}:burst`; }, region);
          const end = Date.now() + 1200;
          while (Date.now() < end) { await page.mouse.wheel({ deltaY: 70 }); await wait(70); }
          await page.evaluate(region => { window.__perf.phase = `${region}:stop`; }, region);
          await wait(2800);
        }
        await page.evaluate(region => { window.__perf.phase = `${region}:cruise`; }, region);
        const end = Date.now() + 3000;
        while (Date.now() < end) { await page.mouse.wheel({ deltaY: 70 }); await wait(70); }
        await page.evaluate(region => { window.__perf.phase = `${region}:stop`; }, region);
        await wait(2800);
        await page.evaluate(region => { performance.mark(`p3y-end:${region}`); window.__perf.recording = false; }, region);
        if (stopped) throw new Error('Host stop requested');
      }
      if (rep === 1) { await page.tracing.stop(); traceRunning = false; }
      const data = await page.evaluate(() => {
        const p = window.__perf;
        return { frames: p.frames, gl: p.gl, switches: p.switches, input: p.input, longTasks: p.longTasks,
          heapAfter: performance.memory?.usedJSHeapSize, disjoint: p.disjoint,
          probe: window.__gt3.probe(), memory: { ...window.__gt3.renderer.info.memory } };
      });
      const after = hostSample();
      await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'run', config, rep, before, after })}\n`);
      await writeFile(`${out}/${config}-${rep}-frames.json.gz`, gzipSync(JSON.stringify(data)));
      const frames = data.frames.filter(f => f.dt !== null);
      if (frames.length < 100 || frames.filter(f => Number.isFinite(f.gpu)).length < frames.length * .8)
        throw new Error('Insufficient application frame/GPU samples; harness result is invalid');
      const crossingFrames = frames.filter(f => f.phase.startsWith('checkpoint:'));
      const crossed = Math.min(...crossingFrames.map(f => f.progress)) < setup.checkpointProgress
        && Math.max(...crossingFrames.map(f => f.progress)) >= setup.checkpointProgress;
      if (!crossed) throw new Error('Scripted wheel input did not cross the requested checkpoint');
      const duration = frames.reduce((sum, f) => sum + f.dt, 0);
      const subset = fs => ({ frame: distribution(fs.map(f => f.dt)), gpu: distribution(fs.map(f => f.gpu).filter(Number.isFinite)),
        cpu: distribution(fs.map(f => f.cpu)), over33per10s: fs.filter(f => f.dt > 33).length * 10000 / fs.reduce((s, f) => s + f.dt, 0),
        over50per10s: fs.filter(f => f.dt > 50).length * 10000 / fs.reduce((s, f) => s + f.dt, 0) });
      const run = { config, rep, setup, before: { ...before, processes: undefined }, after: { ...after, processes: undefined },
        contaminated: hostDegraded(before, after), crossed, duration, ...subset(frames), heapBefore,
        heapAfter: data.heapAfter, memory: data.memory, disjoint: data.disjoint,
        longTasks: data.longTasks, switchCount: data.switches.length, glAllocations: data.gl.filter(x => /texImage|texStorage/.test(x.method)).length,
        byPhase: Object.fromEntries(['rest', 'burst', 'cruise', 'stop'].map(s => [s, subset(frames.filter(f => f.phase.endsWith(`:${s}`)))])),
        byRegion: Object.fromEntries(['grid', 'straight', 'hairpin', 'checkpoint'].map(s => [s, subset(frames.filter(f => f.phase.startsWith(`${s}:`)))])),
        switches: data.switches.map(s => ({ ...s, nearFrames: frames.filter(f => f.t >= s.t - 100 && f.t <= s.t + 350)
          .map(f => ({ t: f.t, dt: f.dt, gpu: f.gpu, cpu: f.cpu, allocations: f.allocations, dpr: f.dpr })) })),
        worstFrames: [...frames].sort((a, b) => b.dt - a.dt).slice(0, 12) };
      if (rep === 1) {
        const trace = JSON.parse(await readFile(tracePath, 'utf8')).traceEvents;
        const main = trace.filter(e => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map(e => `${e.pid}:${e.tid}`);
        const marks = trace.filter(e => /^p3y-(start|end):/.test(e.name));
        const windows = ['grid', 'straight', 'hairpin', 'checkpoint'].map(region => {
          const start = marks.find(e => e.name === `p3y-start:${region}`)?.ts;
          const end = marks.find(e => e.name === `p3y-end:${region}`)?.ts;
          return [start, end];
        });
        const measured = e => windows.some(([start, end]) => e.ts >= start && e.ts <= end);
        const taskEvents = trace.filter(e => measured(e) && e.ph === 'X' && e.dur >= 50000 && main.includes(`${e.pid}:${e.tid}`)
          && /RunTask|ThreadControllerImpl::RunTask/.test(e.name));
        const gc = trace.filter(e => measured(e) && e.ph === 'X' && /^(MinorGC|MajorGC)$/.test(e.name));
        run.trace = { path: tracePath, windows, mainThreads: main, longTasks: taskEvents.map(e => ({ name: e.name, ts: e.ts, ms: e.dur / 1000 })),
          gc: gc.map(e => ({ name: e.name, ts: e.ts, ms: e.dur / 1000, args: e.args })),
          gcMs: gc.reduce((s, e) => s + e.dur / 1000, 0), events: trace.length };
      }
      report.runs.push(run);
      await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
      console.log('RUN', JSON.stringify({ config, rep, contaminated: run.contaminated, frame: run.frame, gpu: run.gpu,
        over33: run.over33per10s, over50: run.over50per10s, switches: run.switchCount, allocations: run.glAllocations,
        pageouts: after.pageouts - before.pageouts, swapouts: after.swapouts - before.swapouts }));
      if (run.contaminated) throw new Error('Host degraded during run; preserved contaminated evidence and stopped.');
    }
  }
} catch (error) { report.errors.push(error.stack); throw error; }
finally {
  clearInterval(monitor);
  process.removeListener('SIGTERM', terminate);
  if (stopping) await stopping;
  report.ended = new Date().toISOString();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
