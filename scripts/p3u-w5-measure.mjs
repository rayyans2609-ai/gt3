/** W5 loading / prewarm / swap-hitch measurement (headful true fullscreen by default).
 * One browser session: cold start -> readiness -> memory census -> short scripted Tour with
 * per-frame resource counters. Run behind scripts/with-verification-server.sh.
 *   GT3_QUERY=?version=unlocked[&textures=full][&prewarm=...]  GT3_RENDER_DPR=1.5
 *   GT3_DURATION=65 (Tour seconds; 0 = startup/memory only)  GT3_OUT=local/evidence/p3u/w5/<name>
 *   GT3_THEME=day|night   GT3_PROBE_FOOTPRINT=1 (macOS `footprint` of the GPU process)
 * Writes report.json and frames.json.gz. Page-only instrumentation; no product edits.
 */
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { launch, ready, quality, env, wait, dist } from './lib/p3u-common.mjs';

const out = env.GT3_OUT || 'local/evidence/p3u/w5/measure';
const duration = +(env.GT3_DURATION ?? 65);
const dpr = +(env.GT3_RENDER_DPR || 1.5);
const { browser, page, report, releaseDisplay } = await launch('browser', out, env.GT3_HEADLESS !== '1');
report.task = 'W5';
report.requestedSeconds = duration;

/** RSS (MB) of the measurement Chrome's process tree, by role. */
function processCensus() {
  const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).split('\n')
    .map(line => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(m => ({ pid: +m[1], ppid: +m[2], rssMB: +m[3] / 1024, command: m[4] }));
  const root = browser.process().pid, owned = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const r of rows) if (!owned.has(r.pid) && owned.has(r.ppid)) { owned.add(r.pid); grew = true; } }
  const mine = rows.filter(r => owned.has(r.pid));
  const role = r => /--type=gpu-process/.test(r.command) ? 'gpu' : /--type=renderer/.test(r.command) ? 'renderer'
    : /--type=utility/.test(r.command) ? 'utility' : /--type=/.test(r.command) ? 'other' : 'browser';
  const byRole = {};
  for (const r of mine) { const k = role(r); byRole[k] = (byRole[k] || 0) + r.rssMB; }
  for (const k of Object.keys(byRole)) byRole[k] = +byRole[k].toFixed(1);
  const gpu = mine.find(r => role(r) === 'gpu');
  let footprint = null;
  if (env.GT3_PROBE_FOOTPRINT === '1' && gpu) {
    try {
      const text = execFileSync('footprint', ['-p', String(gpu.pid)], { encoding: 'utf8', timeout: 8000 });
      footprint = { footprintLine: /Footprint:\s*([\d.]+ \w+)/.exec(text)?.[1] ?? null,
        graphics: text.split('\n').filter(l => /IOSurface|IOAccelerator|Graphics|VM_ALLOCATE|CG image/i.test(l)).slice(0, 8).map(l => l.trim()) };
    } catch (e) { footprint = { error: e.message.split('\n')[0] }; }
  }
  return { totalMB: +Object.values(byRole).reduce((a, b) => a + b, 0).toFixed(1), byRole, gpuPid: gpu?.pid ?? null, footprint };
}

try {
  await page.evaluateOnNewDocument(() => {
    // Records every app frame from page start (startup, background prewarm and Tour alike).
    window.__w5 = { frames: [], last: null, state: null, morph: null, measureMs: 0, bgMs: 0, bgDraws: 0, longTasks: [], measures: [] };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => {
      const p = window.__w5;
      if (cb.name !== 'frame') return cb(ts);
      const g = window.__gt3, now = performance.now(), f = { t: now, dt: p.last == null ? null : ts - p.last };
      if (g?.background && !p.bgWrapped) {
        p.bgWrapped = true;
        const bg = g.background, tick = bg.tick.bind(bg);
        bg.tick = () => { const s = performance.now(), r = tick(); p.bgMs += performance.now() - s; if (r) p.bgDraws++; return r; };
      }
      p.last = ts;
      const pm = performance.getEntriesByType('measure').length;
      cb(ts);
      f.cpu = performance.now() - now;
      if (!g) return void p.frames.push(f);
      const info = g.renderer.info;
      f.st = g.readiness?.status?.[0]; f.bg = p.bgMs; f.bgd = p.bgDraws; p.bgMs = 0; p.bgDraws = 0;
      f.morph = p.morph ? p.morph.isMorphing() : false; f.car = p.state?.activeCarIndex; f.progress = g.probe().progress;
      f.prog = info.programs.length; f.tex = info.memory.textures; f.geo = info.memory.geometries;
      f.calls = info.render.calls; f.heap = performance.memory?.usedJSHeapSize;
      f.resMs = p.measureMs; p.measureMs = 0; f.ent = performance.getEntriesByType('measure').length - pm;
      p.frames.push(f);
    });
  });

  const wallStart = Date.now();
  report.loading = await ready(page, report);
  report.readyWallMs = Date.now() - wallStart;
  const timeline = await page.evaluate(() => {
    const marks = {}; for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('gt3:')) marks[e.name.slice(4)] = +e.startTime.toFixed(1);
    const measures = {}; for (const e of performance.getEntriesByType('measure')) if (e.name.startsWith('gt3:') && !/morph|materialsFor/.test(e.name)) measures[e.name.slice(4)] = +e.duration.toFixed(1);
    const nav = performance.getEntriesByType('navigation')[0];
    const steps = window.__gt3.readiness.warmupSteps || [];
    const byPhase = {};
    for (const s of steps) { const b = byPhase[s.phase] ||= { n: 0, totalMs: 0, maxMs: 0 }; b.n++; b.totalMs += s.totalMs; b.maxMs = Math.max(b.maxMs, s.totalMs); }
    for (const b of Object.values(byPhase)) { b.totalMs = +b.totalMs.toFixed(1); b.maxMs = +b.maxMs.toFixed(1); }
    const stepList = steps.map(s => [s.phase, +s.startedAt.toFixed(1), +s.totalMs.toFixed(2), +s.setupMs.toFixed(2)]);
    return { stepList, marks, measures, readyAt: window.__gt3.readiness.readyAt, dcl: nav?.domContentLoadedEventEnd, reasons: window.__gt3.readiness.reasons,
      warmupSteps: steps.length, warmupStepMs: +steps.reduce((a, s) => a + s.totalMs, 0).toFixed(1), warmupByPhase: byPhase };
  });
  report.timeline = timeline;
  report.queryParams = await page.evaluate(() => location.search);
  report.quality = await quality(page, dpr);
  report.afterReady = await page.evaluate(async () => {
    const g = window.__gt3, i = g.renderer.info;
    // Texture census of the loaded roster: set in use, anisotropy applied, decoded size.
    const cars = await import('/src/scene/cars.js'), seen = new Set(), aniso = {}, sizes = {};
    let texels = 0;
    for (let n = 0; n < 10; n++) cars.getCarModel(n).traverse(o => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
        for (const t of Object.values(m)) if (t?.isTexture && !seen.has(t)) {
          seen.add(t); aniso[t.anisotropy] = (aniso[t.anisotropy] || 0) + 1;
          const img = t.image, key = img ? `${img.width}x${img.height}` : 'none'; sizes[key] = (sizes[key] || 0) + 1;
          if (img) texels += img.width * img.height;
        }
    });
    return { programs: i.programs.length, textures: i.memory.textures, geometries: i.memory.geometries,
      programNames: i.programs.map(p => p.name + ':' + p.cacheKey.length),
      heapUsedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), heapTotalMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
      maxAnisotropy: g.renderer.capabilities.getMaxAnisotropy(),
      carTextures: { set: cars.TEXTURE_SET, requestedAnisotropy: cars.CAR_ANISOTROPY, distinct: seen.size, anisotropyCounts: aniso, sizes,
        rgba8MipMiB: +(texels * 4 * 4 / 3 / 1048576).toFixed(1) } };
  });
  await wait(2500); // let a post-ready idle settle before the census
  report.census = processCensus();
  report.censusAfterSettle = report.census;
  if (env.GT3_THEME === 'night') await page.evaluate(async () => (await import('/src/scene/theme.js')).applyTheme('night', { instant: true }));

  if (duration > 0) {
    await page.evaluate(async () => {
      const g = window.__gt3, p = window.__w5, { state } = await import('/src/core/state.js'), morph = await import('/src/scene/morph.js');
      p.state = state; p.morph = morph;
      new PerformanceObserver(l => { for (const e of l.getEntries()) p.longTasks.push({ t: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (/^gt3:(morph|materialsFor)/.test(e.name)) { p.measureMs += e.duration; p.measures.push({ name: e.name, t: e.startTime, d: e.duration }); } }).observe({ type: 'measure', buffered: false });
    });
    await wait(1500);
    await page.evaluate(() => { window.__w5.tourStart = performance.now(); });
    const started = Date.now(); let nextProbe = 0, replayAt = null, loops = 0;
    while (Date.now() - started < duration * 1000) {
      const elapsed = (Date.now() - started) / 1000;
      if (elapsed >= nextProbe) {
        const status = await page.evaluate(() => ({ probe: window.__gt3.probe(), finished: document.querySelector('.finish-screen')?.classList.contains('is-visible') }));
        nextProbe = elapsed + 1;
        if (status.finished && replayAt === null) { replayAt = elapsed + 3; loops++; }
        if (replayAt !== null && elapsed >= replayAt) { await page.click('.finish-replay'); replayAt = null; }
      }
      if (replayAt === null && elapsed % 18 < 17.4) await page.mouse.wheel({ deltaY: 100 + 35 * Math.sin(elapsed * .7) });
      await wait(120);
    }
    report.completedLoops = loops;
    const raw = await page.evaluate(() => { const p = window.__w5; return { frames: p.frames, tourStart: p.tourStart, longTasks: p.longTasks, measures: p.measures, bgStats: window.__gt3.background ? { ticks: window.__gt3.background.stats.ticks, draws: window.__gt3.background.stats.draws, carsReady: window.__gt3.background.stats.carsReady, textures: window.__gt3.background.stats.textures, skipped: window.__gt3.background.stats.skipped, compileMs: window.__gt3.background.stats.compileMs, ready: [...window.__gt3.background.ready] } : null }; });
    report.finalCensus = processCensus();
    const allFrames = raw.frames, frames = allFrames.filter(f => f.t >= raw.tourStart);
    report.bgStats = raw.bgStats;
    // Everything from first frame to the Tour start: readiness hitches and background prewarm.
    const pre = allFrames.filter(f => f.t < raw.tourStart && f.st && f.st !== 'l');
    report.postReadyIdle = { n: pre.length, raf: dist(pre.map(f => f.dt)), cpu: dist(pre.map(f => f.cpu)), over25: pre.filter(f => f.dt > 25).length, bgFrames: pre.filter(f => f.bg > 0).length, bgMax: Math.max(0, ...pre.map(f => f.bg || 0)) };
    const bgFrames = allFrames.filter(f => f.st && f.st !== 'l' && f.bg > 0);
    report.bgFrames = { n: bgFrames.length, cpu: dist(bgFrames.map(f => f.bg)), dt: dist(bgFrames.map(f => f.dt)), over25: bgFrames.filter(f => f.dt > 25).length, over33: bgFrames.filter(f => f.dt > 33).length };
    const swapTimes = frames.filter(f => f.morph).map(f => f.t), ranges = [];
    for (const t of swapTimes) { const last = ranges.at(-1); if (last && t - 500 <= last[1]) last[1] = t + 500; else ranges.push([t - 500, t + 500]); }
    const inSwap = f => ranges.some(([a, b]) => f.t >= a && f.t <= b);
    const summarize = list => {
      const dts = list.map(f => f.dt).filter(Number.isFinite);
      return { n: dts.length, raf: dist(dts), cpu: dist(list.map(f => f.cpu)),
        over25: dts.filter(v => v > 25).length, over33: dts.filter(v => v > 33).length, over50: dts.filter(v => v > 50).length };
    };
    report.summary = summarize(frames);
    report.swapWindows = { gates: ranges.length, ...summarize(frames.filter(inSwap)) };
    report.nonSwap = summarize(frames.filter(f => !inSwap(f)));
    // Resource deltas: any frame where programs / textures / geometries changed after readiness.
    const base = report.afterReady; let prev = { prog: base.programs, tex: base.textures, geo: base.geometries };
    const growth = [];
    for (const f of frames) {
      if (f.prog !== prev.prog || f.tex !== prev.tex || f.geo !== prev.geo) growth.push({ t: f.t, car: f.car, morph: f.morph, dProg: f.prog - prev.prog, dTex: f.tex - prev.tex, dGeo: f.geo - prev.geo, dt: f.dt });
      prev = { prog: f.prog, tex: f.tex, geo: f.geo };
    }
    report.resourceGrowthAfterReady = growth;
    report.finalResources = frames.length ? { programs: frames.at(-1).prog, textures: frames.at(-1).tex, geometries: frames.at(-1).geo } : null;
    report.heapMB = { start: +(frames[0]?.heap / 1048576).toFixed(1), end: +(frames.at(-1)?.heap / 1048576).toFixed(1), max: +(Math.max(...frames.map(f => f.heap)) / 1048576).toFixed(1) };
    report.worstFrames = [...frames].sort((a, b) => b.dt - a.dt).slice(0, 12).map(f => ({ dt: +f.dt?.toFixed(1), cpu: +f.cpu.toFixed(1), morph: f.morph, car: f.car, inSwap: inSwap(f), progress: +f.progress.toFixed(4), calls: f.calls, resMs: +f.resMs.toFixed(2), prog: f.prog, tex: f.tex, geo: f.geo }));
    report.longTasks = raw.longTasks; report.morphMeasures = raw.measures;
    await writeFile(`${out}/frames.json.gz`, gzipSync(JSON.stringify(raw)));
    console.log('RESULT', JSON.stringify({ readyMs: timeline.readyAt, ready: report.readyWallMs, swap: report.swapWindows.raf, all: report.summary.raf, gates: ranges.length, growth: growth.length }));
  } else console.log('RESULT', JSON.stringify({ readyMs: timeline.readyAt, census: report.census.byRole }));
} catch (e) {
  report.incomplete = true; report.errors.push(e.stack); process.exitCode = 1;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
  releaseDisplay();
  await browser.close().catch(() => {});
}
