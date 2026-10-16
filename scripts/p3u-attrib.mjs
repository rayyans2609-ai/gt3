/** Matched whole-composer ablations: Metal sub-pass query readouts are not additive.
 * One exclusive headful session, fixed t=.123; GT3_DURATION=12 seconds per condition.
 * Reports marginal GPU elapsed cost at DPR1/1.5/2 without stacking query boundaries.
 */
import {writeFile,appendFile} from 'node:fs/promises';
import {hostSample} from './lib/perf-host.mjs';
import {execFileSync} from 'node:child_process';
import {launch,ready,quality,wait,env,dist} from './lib/p3u-common.mjs';
const out=env.GT3_OUT||'local/evidence/p3u/attribution',seconds=+(env.GT3_DURATION||12);
const {browser,page,report}=await launch('perf',out,true);report.runs=[];report.method='One whole-composer GPU query per frame; matched pass ablations, fixed normal Tour pose';
try{
 report.loading=await ready(page);
 await page.evaluate(async()=>{
  const route=await import('/src/scene/trackCurve.js');(await import('/src/scroll/scrollDrive.js')).seekTo(route.progressAtRouteT(.123),{instant:true});
  const g=window.__gt3,gl=g.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(!ext)throw Error('GPU timer unavailable');
  const p=window.__attrib={active:false,gpu:[],raf:[],pending:[],previous:null,disjoint:0,sceneOnly:false};
  const scenePass=g.composer.passes[0],renderScene=scenePass.render;scenePass.render=function(...args){if(p.sceneOnly)this.renderToScreen=false;return renderScene.apply(this,args);};p.clearQueries=()=>{for(const q of p.pending)gl.deleteQuery(q);p.pending=[];};const original=g.composer.render;
  g.composer.render=function(...args){
   if(!p.active)return original.apply(this,args);
   const now=performance.now();if(p.previous!==null)p.raf.push(now-p.previous);p.previous=now;
   for(let i=p.pending.length-1;i>=0;i--)if(gl.getQueryParameter(p.pending[i],gl.QUERY_RESULT_AVAILABLE)){
    if(!gl.getParameter(ext.GPU_DISJOINT_EXT))p.gpu.push(gl.getQueryParameter(p.pending[i],gl.QUERY_RESULT)/1e6);else p.disjoint++;
    gl.deleteQuery(p.pending.splice(i,1)[0]);
   }
   const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);try{return original.apply(this,args);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);p.pending.push(q);}
  };
 });
 for(const dpr of (env.GT3_ATTRIB_DPRS||'1,1.5,2').split(',').map(Number)){
  const settings=await quality(page,dpr,'');
  for(const condition of (env.GT3_ATTRIB_CONDITIONS||'all,no-shadow,no-motionBlur,no-smaa,no-wash,all-repeat,scene-only,scene-no-shadow').split(',')){
   await page.evaluate(condition=>{
    const g=window.__gt3,p=window.__attrib;p.active=false;p.clearQueries();p.previous=null;p.gpu=[];p.raf=[];
    p.sceneOnly=condition.startsWith('scene-');g.renderer.shadowMap.enabled=!['no-shadow','scene-no-shadow'].includes(condition);g.passes.motionBlur.enabled=!p.sceneOnly&&condition!=='no-motionBlur';g.passes.antialias.enabled=!p.sceneOnly&&condition!=='no-smaa';g.passes.wash.enabled=!p.sceneOnly&&condition!=='no-wash';
   },condition);
   await wait(2000);await page.evaluate(()=>{window.__attrib.active=true;});await wait(seconds*1000);
   const data=await page.evaluate(()=>{const p=window.__attrib;p.active=false;return {gpu:p.gpu,raf:p.raf,disjoint:p.disjoint,probe:window.__gt3.probe(),visibility:document.visibilityState};});
   if(data.visibility!=='visible'||Math.max(...data.raf)>2000)throw Error('Presentation suspended');
   const row={dpr,condition,settings,gpu:dist(data.gpu),raf:dist(data.raf),disjoint:data.disjoint};report.runs.push(row);console.log('ATTRIB',JSON.stringify(row));
   const host=await hostSample();await appendFile(`${out}/host.jsonl`,JSON.stringify({...host,processes:undefined,thermal:execFileSync('pmset',['-g','therm'],{encoding:'utf8'})})+'\n');
  }
 }
}catch(e){report.incomplete=true;report.errors.push(e.stack);process.exitCode=1;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
