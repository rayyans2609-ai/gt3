/** T6 deterministic Lab metrics. Lab formula retained from T4; car membership is
 * exclusively the T5 depth-tested geometry silhouette, nearest-scaled. */
import {readFile,writeFile} from 'node:fs/promises';
import {decodePNG} from './lib/p3u-final-image.mjs';
const srgb=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};
function lab(p,i){const r=srgb(p[i]),g=srgb(p[i+1]),b=srgb(p[i+2]);const y=.2126729*r+.7151522*g+.072175*b,x=(.4124564*r+.3575761*g+.1804375*b)/.95047,z=(.0193339*r+.119192*g+.9503041*b)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))]}

const root=process.env.GT3_ROOT||'local/evidence/p3u/t6';
const output='docs/review/p3u/stage1/FINAL', fine=process.env.GT3_CONTINUITY==='1';
const rect=(im,x,y,w,h)=>{const ids=[];for(let yy=Math.floor(y*im.height);yy<Math.floor((y+h)*im.height);yy++)for(let xx=Math.floor(x*im.width);xx<Math.floor((x+w)*im.width);xx++)ids.push(yy*im.width+xx);return ids;};
const measure=(im,ids)=>{let L=0,C=0;for(const q of ids){const v=lab(im.pixels,q*4);L+=v[0];C+=Math.hypot(v[1],v[2]);}return {pixels:ids.length,L:L/ids.length,C:C/ids.length};};
const regions={road:[.80,.58,.025,.025],terrain:[.15,.45,.18,.15],sky:[.40,.40,.20,.20]};
const rows=[],manifests={};
for(const variant of ['locked','split']){
 const path=`${root}/${variant}-${fine?'continuity':'transition'}`,m=JSON.parse(await readFile(path+'/manifest.json'));manifests[variant]=m;
 for(const s of m.captures){
  const im=decodePNG(await readFile(path+'/'+s.file)),mask=decodePNG(await readFile(path+'/'+s.mask)),sky=decodePNG(await readFile(path+'/'+s.sky)),ids=[];
  for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(mask.pixels[(Math.floor(y*mask.height/im.height)*mask.width+Math.floor(x*mask.width/im.width))*4]>10)ids.push(y*im.width+x);
  rows.push({variant,car:s.name.split('-')[0],weight:s.blend,anchor:s.anchor,side:s.side,actualWeight:s.themeNightWeight,exposure:s.exposure,carMetric:measure(im,ids),world:Object.fromEntries(Object.entries(regions).map(([k,r])=>[k,measure(k==='sky'?sky:im,rect(k==='sky'?sky:im,...r))])),camera:s.camera});
 }
}
if(fine){
 const assessments=[];
 for(const car of ['lexus','ferrari'])for(const metric of ['road','terrain','sky','carL','carC']){
  const brackets=variant=>Array.from({length:9},(_,i)=>{
   const pair=rows.filter(r=>r.variant===variant&&r.car===car&&r.anchor===i/8).sort((a,b)=>a.side-b.side);
   const value=r=>metric==='carL'?r.carMetric.L:metric==='carC'?r.carMetric.C:r.world[metric].L;
   return {anchor:i/8,from:pair[0].weight,to:pair[1].weight,delta:value(pair[1])-value(pair[0])};
  });
  const locked=brackets('locked'),split=brackets('split'),max=v=>Math.max(...v.map(r=>Math.abs(r.delta)));
  assessments.push({car,metric,locked,split,maxLockedDelta:max(locked),maxSplitDelta:max(split),pass:max(split)<=Math.max(.02,max(locked)+.01)});
 }
 const result={method:'Neighbour brackets at ±0.00001 theme weight around all nine evenly spaced anchors, endpoints clamped. Same captures/masks/regions as main metrics. A bracket measures local continuity, not the coarse 0.125-weight change. Mean L*/C* tolerance 0.02 or locked +0.01 for quantization and different calibrated endpoint ranges. All coarse changes remain separately reported.',rows,assessments,pass:assessments.every(r=>r.pass)};
 await writeFile(output+'/fine-continuity.json',JSON.stringify(result,null,2)+'\n');
 console.log(assessments.map(r=>`${r.car} ${r.metric}: locked ${r.maxLockedDelta.toFixed(4)}, split ${r.maxSplitDelta.toFixed(4)}, pass ${r.pass}`).join('\n'));
 process.exit(result.pass?0:1);
}
const assessments=[];
for(const car of ['lexus','ferrari'])for(const metric of ['road','terrain','sky','carL','carC']){
 const values=variant=>rows.filter(r=>r.variant===variant&&r.car===car).map(r=>metric==='carL'?r.carMetric.L:metric==='carC'?r.carMetric.C:r.world[metric].L);
 const summary=v=>{const direction=Math.sign(v.at(-1)-v[0]),d=v.slice(1).map((x,i)=>x-v[i]);return {values:v,maxStep:Math.max(...d.map(Math.abs)),maxReversal:Math.max(0,...d.map(x=>-direction*x)),totalReversal:d.reduce((a,x)=>a+Math.max(0,-direction*x),0),steps:d};};
 const locked=summary(values('locked')),split=summary(values('split'));
 assessments.push({car,metric,locked,split,withinLockedStep:split.maxStep<=locked.maxStep+.1,withinLockedReversal:split.maxReversal<=locked.maxReversal+.1});
}
const report={method:'D65 Lab from screenshot sRGB; mean per-pixel car L*/C*, depth-tested true geometry silhouette, no padded/threshold colour mask. Fixed T1 pose t=.123; DPR locked 1, split smooth 1.5; device DPR2. Even theme weights via inverse production easing. Sky-only diagnostic: real sky mesh + output pipeline with world occluders hidden, same camera; T1 contains no visible sky.',regions,rows,assessments};
await writeFile(output+'/transition-metrics.json',JSON.stringify(report,null,2)+'\n');
let md='| Car / metric | Locked max step / reversal | Split max step / reversal | Coarse max change ≤ locked (+0.10) |\n|---|---:|---:|---|\n';
for(const r of assessments)md+=`| ${r.car} ${r.metric} | ${r.locked.maxStep.toFixed(2)} / ${r.locked.maxReversal.toFixed(2)} | ${r.split.maxStep.toFixed(2)} / ${r.split.maxReversal.toFixed(2)} | ${r.withinLockedStep&&r.withinLockedReversal?'yes':'NO'} |\n`;
await writeFile(output+'/transition-table.md',md);console.log(md);
