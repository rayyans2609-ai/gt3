/** Attribute long RAF intervals with the Chrome trace of a p3u-w6-perf run (GT3_W6_TRACE=1).
 *   node scripts/p3u-w6-trace.mjs <runDir> [limitMs=25]
 * Aligns page time to trace time with the 'w6:sync' mark, then lists, per process/thread,
 * the longest complete events overlapping each long interval, plus the same statistic for a
 * sample of normal intervals as a control.
 */
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const [dir, limitArg] = process.argv.slice(2);
const limit = +(limitArg || 25);
const report = JSON.parse(await readFile(`${dir}/report.json`, 'utf8'));
const raw = JSON.parse(gunzipSync(await readFile(`${dir}/frames.json.gz`)));
const trace = JSON.parse(await readFile(`${dir}/trace.json`, 'utf8'));
const events = trace.traceEvents || trace;
const names = new Map(), procs = new Map();
for (const e of events) if (e.ph === 'M') {
  if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  if (e.name === 'process_name') procs.set(e.pid, e.args.name);
}
const sync = events.find(e => e.name === 'w6:sync');
if (!sync) throw Error('No w6:sync mark in trace');
const offsetUs = sync.ts - report.traceSync * 1000;
const complete = events.filter(e => e.ph === 'X' && e.dur > 0).sort((a, b) => a.ts - b.ts);
const label = e => `${procs.get(e.pid) || e.pid}/${names.get(`${e.pid}:${e.tid}`) || e.tid}`;
function window(startMs, endMs) {
  const a = startMs * 1000 + offsetUs, b = endMs * 1000 + offsetUs, byThread = new Map();
  for (const e of complete) {
    if (e.ts > b) break;
    if (e.ts + e.dur < a) continue;
    const k = label(e), list = byThread.get(k) || [];
    list.push(e); byThread.set(k, list);
  }
  const out = {};
  for (const [k, list] of byThread) {
    const top = list.filter(e => e.dur > 2000).sort((x, y) => y.dur - x.dur).slice(0, 5);
    if (top.length) out[k] = top.map(e => `${e.name}:${(e.dur / 1000).toFixed(1)}ms@${((e.ts - a) / 1000).toFixed(0)}`);
  }
  return out;
}
const frames = raw.frames;
let normal = 0;
for (let i = 1; i < frames.length; i++) {
  const f = frames[i], prev = frames[i - 1];
  if (f.dt > limit) {
    console.log(`\nLONG dt=${f.dt.toFixed(1)} at ${((f.t - frames[0].t) / 1000).toFixed(2)}s car=${f.car} morph=${f.morph || prev.morph} gpu=${(prev.gpu?.total ?? 0).toFixed(1)}`);
    console.log(JSON.stringify(window(prev.raf - 34, f.raf), null, 1));
  } else if (i % 1500 === 0 && normal < 3) {
    normal++;
    console.log(`\nCONTROL dt=${f.dt.toFixed(1)} at ${((f.t - frames[0].t) / 1000).toFixed(2)}s`);
    console.log(JSON.stringify(window(prev.raf - 34, f.raf), null, 1));
  }
}
