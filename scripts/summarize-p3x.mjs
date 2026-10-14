/** Pool p3x RAF/CPU/GPU/transition evidence. node scripts/summarize-p3x.mjs out.json report.json... */
import {readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gunzipSync} from 'node:zlib';
const [output,...paths]=process.argv.slice(2);
if(!output||!paths.length)throw Error('Need output + report paths');
const dist=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))]:null;return{n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),worst:a.at(-1)??null};};
const metrics=frames=>{const fs=frames.filter(f=>f.dt!==null);const duration=fs.reduce((s,f)=>s+f.dt,0);const draws=fs.filter(f=>Number.isFinite(f.drawDt)),drawDuration=draws.reduce((s,f)=>s+f.drawDt,0);return{duration,draw:dist(draws.map(f=>f.drawDt)),drawOver33per10s:drawDuration?draws.filter(f=>f.drawDt>33).length*10000/drawDuration:null,drawOver50per10s:drawDuration?draws.filter(f=>f.drawDt>50).length*10000/drawDuration:null,frame:dist(fs.map(f=>f.dt)),raf:dist(fs.slice(1).map((f,i)=>f.raf-fs[i].raf).filter(v=>v>0&&v<5000)),cpu:dist(fs.map(f=>f.cpu)),gpu:dist(fs.map(f=>f.gpu)),over33per10s:duration?fs.filter(f=>f.dt>33).length*10000/duration:null,over50per10s:duration?fs.filter(f=>f.dt>50).length*10000/duration:null,over100:fs.filter(f=>f.dt>100).length,passes:Object.fromEntries(['scene0','smaa','blur','wash'].map(p=>[p,{cpu:dist(fs.map(f=>f.passes?.[p]?.cpu)),gpu:dist(fs.map(f=>f.passes?.[p]?.gpu))}]))};};
const result={};
for(const path of paths){
 const report=JSON.parse(await readFile(path)),root=dirname(path),key=`${report.runs[0]?.config??'empty'}${report.passGpu?'-passGPU':''}`,all=[],clean=[],cleanWindows=[],runs=[],transitions=[];
 for(const run of report.runs){
  const data=JSON.parse(gunzipSync(await readFile(`${root}/${run.config}-${run.rep}-frames.json.gz`)));
  const frames=data.frames;all.push(...frames);if(!run.paging)clean.push(...frames);
  const cleanRegions=new Set(run.hostWindows.filter(w=>!w.pageouts&&!w.swapouts).map(w=>w.region));cleanWindows.push(...frames.filter(f=>cleanRegions.has(f.phase.split(':')[0])));
  const input=data.input;
  const starts=input.filter((e,i)=>!i||e.t-input[i-1].t>500);
  const stops=input.filter((e,i)=>!input[i+1]||input[i+1].t-e.t>500);
  for(const [type,events] of [['start',starts],['stop',stops]])for(const e of events){
   const near=frames.filter(f=>f.t>=e.t&&f.t<=e.t+500),first=near.slice(0,10);
   const prior=frames.filter(f=>f.t<e.t).at(-1),moved=near.find(f=>prior&&Math.abs(f.progress-prior.progress)>1e-8);
   transitions.push({rep:run.rep,type,t:e.t,phase:e.phase,worst:Math.max(...near.map(f=>f.dt??0)),cpu:Math.max(...near.map(f=>f.cpu)),gpu:Math.max(0,...near.map(f=>f.gpu).filter(Number.isFinite)),firstFrameMs:near[0]?near[0].t-(e.event??e.t):null,inputToMovementMs:type==='start'&&moved?moved.t-(e.event??e.t):null,first10:first.map(f=>({t:f.t,dt:f.dt,raf:f.raf,cpu:f.cpu,gpu:f.gpu,dpr:f.dpr,progress:f.progress,allocations:f.allocations,passes:f.passes,calls:f.calls}))});
  }
  runs.push({...run,worstFrames:undefined,switches:undefined,byPhase:undefined,byRegion:undefined,metrics:metrics(frames),inputDeliveryMs:dist(input.map(e=>e.t-e.event)),inputIntervals:dist(input.slice(1).map((e,i)=>e.t-input[i].t).filter(v=>v<500)),glSlow:data.gl.filter(e=>e.ms>2),programs:data.gl.filter(e=>/createProgram|compileShader|linkProgram/.test(e.method)),sync:data.gl.filter(e=>/^(finish|readPixels|fenceSync|clientWaitSync|waitSync)$/.test(e.method)),switches:data.switches});
 }
 const switches=runs.flatMap(r=>r.switches.map(s=>({...s,rep:r.rep})));
 result[key]={path,sha:report.sha,tree:report.tree,browser:report.browser,harnessRevision:report.harnessRevision,errors:report.errors,includingPaging:metrics(all),excludingPaging:metrics(clean),nonpagingWindows:metrics(cleanWindows),phases:Object.fromEntries(['rest','burst','cruise','stop'].map(p=>[p,metrics(all.filter(f=>f.phase.endsWith(`:${p}`)))])),steady:Object.fromEntries([1,1.5,2].map(dpr=>[dpr,metrics(all.filter(f=>f.dpr===dpr&&!switches.some(s=>f.t>=s.t-100&&f.t<=s.t+500)))])),transitionSummary:Object.fromEntries(['start','stop'].map(t=>{const ts=transitions.filter(e=>e.type===t);return[t,{n:ts.length,worst:dist(ts.map(e=>e.worst)),firstFrame:dist(ts.map(e=>e.firstFrameMs)),inputToMovement:dist(ts.map(e=>e.inputToMovementMs)),over50:ts.filter(e=>e.worst>50).length,over100:ts.filter(e=>e.worst>100).length}];})),transitions,runs};
 console.log(key,JSON.stringify({all:result[key].includingPaging,cruise:result[key].phases.cruise,transitions:result[key].transitionSummary,paging:runs.map(r=>r.timingPaging)}));
}
await writeFile(output,JSON.stringify(result,null,2));
