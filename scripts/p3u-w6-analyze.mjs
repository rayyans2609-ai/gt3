/** Classify every long RAF interval in a p3u-w6-perf (or p3u-perf) run.
 *   node scripts/p3u-w6-analyze.mjs <runDir> [limitMs=33] [--json out.json]
 * An interval ends at frame f (f.dt = f.raf - prev.raf). Classes:
 *   main-thread  — the previous frame callback, or a long task / LoAF blocking period
 *                  overlapping the interval, consumed most of the budget (JS/GC/style);
 *   gpu-bound    — GPU elapsed of the previous three frames exceeds the vsync budget;
 *   presentation — neither: renderer main thread idle and GPU work short, yet RAF missed
 *                  vsyncs (compositor / GPU-process / display path).
 * Thresholds are explicit below; every row carries its raw evidence for review.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const [dir, limitArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const limit = +(limitArg || 33);
let raw;
try { raw = JSON.parse(gunzipSync(await readFile(`${dir}/frames.json.gz`))); }
catch { raw = JSON.parse(gunzipSync(await readFile(`${dir}/partial-frames.json.gz`))); }
const frames = raw.frames, loaf = raw.loaf || [], tasks = raw.longTasks || [], events = raw.events || [];
const BUDGET = 16.7, MAIN = 12, GPU = 16;
const rows = [];
for (let i = 1; i < frames.length; i++) {
  const f = frames[i];
  if (!(f.dt > limit)) continue;
  const prev = frames[i - 1], start = prev.raf, end = f.raf;
  const gpuPrev = frames.slice(Math.max(0, i - 3), i + 1).map(x => x.gpu?.total ?? null);
  const overl = (s, d) => s < end && s + d > start;
  const lf = loaf.filter(e => overl(e.t, e.duration));
  const lt = tasks.filter(e => overl(e.t, e.duration));
  // Main-thread time inside the interval that was not the app's own frame callback:
  const loafBlock = Math.max(0, ...lf.map(e => e.blocking || 0));
  // A LoAF with zero blocking and no script time is the main thread WAITING for the next
  // BeginMainFrame (compositor/GPU-process backpressure), not main-thread work.
  const scriptMs = lf.reduce((a, e) => a + (e.scripts || []).reduce((b, x) => b + x.duration, 0), 0);
  const taskLong = Math.max(0, ...lt.map(e => e.duration));
  const ev = events.filter(e => e.t >= start - 1000 && e.t <= end + 200 && e.kind !== 'wheel' && e.kind !== 'scroll');
  let cls;
  if (prev.cpu > MAIN || taskLong > 50 || loafBlock > 0 || scriptMs > f.dt * .5) cls = 'main-thread';
  else if (Math.max(...gpuPrev.filter(Number.isFinite), 0) > GPU) cls = 'gpu-bound';
  else cls = 'presentation';
  rows.push({ i, tMs: +(f.t - frames[0].t).toFixed(0), dt: +f.dt.toFixed(1), vsyncs: Math.round(f.dt / BUDGET), cls,
    prevCpu: +prev.cpu.toFixed(2), prevRender: +(prev.render ?? 0).toFixed(2), cpu: +f.cpu.toFixed(2),
    gpu: gpuPrev.map(v => v == null ? null : +v.toFixed(2)), longTask: taskLong ? +taskLong.toFixed(0) : 0,
    loaf: lf.map(e => ({ dur: +e.duration.toFixed(0), block: +(e.blocking || 0).toFixed(0), render: e.renderStart ? +(e.renderStart - e.t).toFixed(1) : null,
      scripts: (e.scripts || []).filter(s => s.duration > 2).map(s => `${s.type}:${s.invoker}:${s.source}:${s.duration.toFixed(0)}`) })),
    car: f.car, morph: f.morph || prev.morph, finish: f.finish, mode: f.mode, theme: f.theme, speed: +(f.speed ?? 0).toFixed(3), progress: +(f.progress ?? 0).toFixed(4),
    programs: f.programs, textures: f.textures, heapDeltaMB: f.heap && prev.heap ? +((f.heap - prev.heap) / 1048576).toFixed(1) : null,
    events: ev.map(e => `${e.kind}${e.to ? ':' + e.to : ''}@${(e.t - start).toFixed(0)}`) });
}
const count = k => rows.filter(r => r.cls === k).length;
const seconds = frames.reduce((a, f) => a + (Number.isFinite(f.dt) ? f.dt : 0), 0) / 1000;
const summary = { dir, limit, frames: frames.length, seconds: +seconds.toFixed(1), long: rows.length, perMinute: +(rows.length / seconds * 60).toFixed(2),
  mainThread: count('main-thread'), gpuBound: count('gpu-bound'), presentation: count('presentation'),
  inMorph: rows.filter(r => r.morph).length, inFinish: rows.filter(r => r.finish).length, nearEvent: rows.filter(r => r.events.length).length };
console.log(JSON.stringify(summary));
for (const r of rows) console.log(JSON.stringify(r));
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ summary, rows }, null, 1) + '\n');
