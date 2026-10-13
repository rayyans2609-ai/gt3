/** Deterministic pooling. Args: output.json report.json... Raw frame data stay beside each report. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
const [output, ...paths] = process.argv.slice(2);
if (!output || !paths.length) throw new Error('Need output + report paths');
const quantile = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : null;
const dist = values => { const a = values.filter(Number.isFinite).sort((x,y)=>x-y);
  return { n:a.length, p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),worst:a.at(-1)??null }; };
const metrics = frames => { const fs = frames.filter(f=>f.dt!==null), duration=fs.reduce((s,f)=>s+f.dt,0);
  return { duration, frame:dist(fs.map(f=>f.dt)),gpu:dist(fs.map(f=>f.gpu)),cpu:dist(fs.map(f=>f.cpu)),
    over33per10s:duration?fs.filter(f=>f.dt>33).length*10000/duration:null,
    over50per10s:duration?fs.filter(f=>f.dt>50).length*10000/duration:null,
    over100:fs.filter(f=>f.dt>100).length }; };
const summary = {};
for (const path of paths) {
  const report=JSON.parse(await readFile(path)), root=dirname(path), all=[], clean=[], cleanWindows=[], sw=[], runs=[];
  for (const r of report.runs) {
    const data=JSON.parse(gunzipSync(await readFile(`${root}/${r.config}-${r.rep}-frames.json.gz`)));
    all.push(...data.frames); if(!r.paging) clean.push(...data.frames);
    const cleanRegions=new Set(r.hostWindows.filter(w=>!w.pageouts&&!w.swapouts).map(w=>w.region));
    cleanWindows.push(...data.frames.filter(f=>cleanRegions.has(f.phase.split(':')[0])));
    for(const s of data.switches) { const near=data.frames.filter(f=>f.t>=s.t&&f.t<=s.t+500);
      sw.push({...s,worst:Math.max(...near.filter(f=>f.dt!==null).map(f=>f.dt)),maxCpu:Math.max(...near.map(f=>f.cpu)),
        maxGpu:Math.max(...near.map(f=>f.gpu).filter(Number.isFinite)),allocations:near.reduce((sum,f)=>sum+f.allocations,0)}); }
    runs.push({rep:r.rep,paging:r.paging,unsettled:r.unsettled,timingPaging:r.timingPaging,
      frame:r.frame,gpu:r.gpu,cpu:r.cpu,over33:r.over33per10s,over50:r.over50per10s,switches:r.switchCount,
      allocations:r.glAllocations,heapBefore:r.heapBefore,heapAfter:r.heapAfter,
      longTasks:r.longTasks,trace:r.trace,regions:r.hostWindows,crossed:r.crossed,disjoint:r.disjoint});
  }
  const config=report.runs[0]?.config || report.setups?.[0]?.config;
  summary[config]={path,sha:report.sha,tree:report.tree,browser:report.browser,setup:report.setups?.[0],errors:report.errors,
    includingPaging:metrics(all),excludingPaging:metrics(clean),nonpagingWindows:metrics(cleanWindows),
    phases:Object.fromEntries(['rest','burst','cruise','stop'].map(p=>[p,metrics(all.filter(f=>f.phase.endsWith(`:${p}`)))])),
    steady:Object.fromEntries([1,2].map(dpr=>[dpr,metrics(all.filter(f=>f.dpr===dpr&&!sw.some(s=>f.t>=s.t&&f.t<=s.t+500)))])),
    switches:{n:sw.length,cpu:dist(sw.map(s=>s.cpu)),worstFollowing:dist(sw.map(s=>s.worst)),
      low:dist(sw.filter(s=>s.to===1).map(s=>s.worst)),high:dist(sw.filter(s=>s.to===2).map(s=>s.worst)),events:sw},runs};
}
await writeFile(output,JSON.stringify(summary,null,2));
for(const [c,r] of Object.entries(summary)) console.log(c,JSON.stringify({all:r.includingPaging,clean:r.excludingPaging,
  paging:r.runs.map(x=>x.timingPaging),motion:r.phases.cruise,switches:{n:r.switches.n,low:r.switches.low,high:r.switches.high}}));
