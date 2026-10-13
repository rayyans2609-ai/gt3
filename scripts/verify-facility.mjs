/** Option A line semantics, reverse-out, silent finish refresh and representative captures. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base=process.env.GT3_URL||'http://127.0.0.1:5201';
const out=process.env.GT3_OUT||'/tmp/gt3-facility';await mkdir(out,{recursive:true});
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={sha:process.env.GT3_SOURCE||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:process.env.GT3_TREE??execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),base,variants:[],errors:[]};
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',pipe:true,timeout:180000,protocolTimeout:180000,
 args:['--no-sandbox','--no-first-run','--enable-gpu','--use-gl=angle','--use-angle=metal',`--user-data-dir=${out}/chrome-${process.pid}`],defaultViewport:{width:1600,height:900}});
process.once('SIGTERM',async()=>{await browser.close();process.exit(143);});
try {
const captureOnly=process.env.GT3_CAPTURE_ONLY==='1';
const geometryOnly=process.env.GT3_GEOMETRY_ONLY==='1';
const queries=process.env.GT3_QUERIES!==undefined?process.env.GT3_QUERIES.split('|'):['', '?grid=p2&gantry=plain&props=lean'];
for(const query of queries) {
 const page=await browser.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.evaluateOnNewDocument(()=>{
  window.__audioStarts=0;
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){window.__audioStarts++;return start.apply(this,args);};
 });
 const ready=()=>page.waitForFunction(()=>window.__gt3?.readiness?.status==='ready',{timeout:180000});
 const snap=()=>page.evaluate(async()=>{
  const {state}=await import('/src/core/state.js');const r=await import('/src/scene/trackCurve.js');
  const {isMorphing}=await import('/src/scene/morph.js');const g=window.__gt3.scene.getObjectByName('finish-line-gate');
  return {p:state.progress,t:r.routeTAt(state.progress),active:state.activeCarIndex,unlocked:[...state.unlocked],mode:state.mode,locked:state.scrollLocked,
   finishTailMeters:state.finishTailMeters,morphing:isMorphing(),signals:g.userData.signalling,sfx:{...window.__gt3SfxLog},audio:window.__audioStarts};
 });
 const seek=async p=>{
  await page.evaluate(async p=>(await import('/src/scroll/scrollDrive.js')).seekTo(p,{instant:true}),p);
  await page.waitForFunction(async()=>!(await import('/src/scene/morph.js')).isMorphing(),{timeout:15000});await wait(350);
 };
 await page.goto(base+'/'+query,{waitUntil:'domcontentloaded',timeout:180000});await ready();
 const constants=await page.evaluate(async()=>{const r=await import('/src/scene/trackCurve.js');return {first:r.FIRST_LINE_PROGRESS,length:r.TOUR_LENGTH,grid:r.GRID_T,slot:r.GRID_SLOT};});
 const grid=await page.evaluate(async()=>{
  const r=await import('/src/scene/trackCurve.js');const rig=window.__gt3.scene.getObjectByName('car-rig');
  const paint=window.__gt3.scene.getObjectByName('staggered-grid-paint');
  const expected=r.offsetPointAt(r.GRID_T,r.GRID_LATERAL);
  const slots=paint?.geometry.userData.slots;
  return {error:Math.hypot(rig.position.x-expected.x,rig.position.z-expected.z),
   vertices:paint?.geometry.getAttribute('position').count,slots,
   parked:slots?.find(b=>b.distance===r.GRID_DISTANCE && b.lateral===r.GRID_LATERAL)};
 });assert(grid.error<.05,'car is not in its grid slot');assert(grid.slots?.length===10 && grid.vertices>=180,'grid is not ten merged U boxes');
 assert(grid.parked,'parked car has no matching front slot');
 for(const side of [-6,6]) {
  const rows=grid.slots.filter(b=>b.lateral===side);
  for(let i=1;i<rows.length;i++)assert(rows[i].distance-rows[i-1].distance>(rows[i].length+rows[i-1].length)/2+5,'grid rows are too close');
 }
 if(captureOnly) {
  const shots=[];
  const label=query.replace(/[^a-z0-9-]/gi,'-')||'default';
  const capture=async name=>{const path=`${out}/${label}-${name}.png`;await page.screenshot({path});shots.push(path);};
  await capture('day-grid-parked');
  await page.mouse.wheel({deltaY:20});await wait(1500);await seek(0);
  await capture('day-grid');
  for(const [name,t] of [['day-edge-corner',.123],['day-runoff-barrier',.283],['day-checkpoint',.18],['day-slowdown-verge',.645],['day-braking-boards',.254-100/5006.8196682221]]) {
   const p=await page.evaluate(async t=>(await import('/src/scene/trackCurve.js')).progressAtRouteT(t),t);
   await seek(p);await capture(name);
  }
  await page.evaluate(async()=>(await import('/src/scene/theme.js')).applyTheme('night',{instant:true}));
  await seek(0);await capture('night-grid-spot');
  const scene=await page.evaluate(()=>{
   const g=window.__gt3, furniture=g.scene.getObjectByName('trackside-furniture');
   return {variant:furniture.userData.variant,trees:!!g.scene.getObjectByName('roadside-trees'),
    furniture:furniture.children.map(o=>({name:o.name,instances:o.count})),
    post:g.scene.getObjectByName('checkpoint-posts').geometry.parameters,
    beam:g.scene.getObjectByName('checkpoint-beams').geometry.parameters,
    stripeVertices:g.scene.getObjectByName('checkpoint-road-stripes')?.geometry.attributes.position.count??0};
  });
  report.variants.push({query,constants,grid,scene,shots});
  await page.close();continue;
 }
 await page.mouse.wheel({deltaY:20});await wait(1500);await seek(0);
 const before=await snap();await seek(constants.first+.25/constants.length);const neutral=await snap();
 assert(neutral.active===0 && neutral.mode==='race' && !neutral.signals,'first line pass changed car/completed/signalled');
 assert(JSON.stringify(neutral.unlocked)==='[0]','first line pass discovered car');
 assert((neutral.sfx.checkpointCross||0)===(before.sfx.checkpointCross||0),'first line pass played crossing SFX');
 await seek(constants.first-.25/constants.length);assert((await snap()).active===0,'neutral reversal changed car');
 await seek(0);const shots=[];
 const capture=async name=>{const path=`${out}/${constants.slot}-${name}.png`;await page.screenshot({path});shots.push(path);};
 await capture('day-grid-gantry');
 if(!query) {
  for(const [name,t] of [['day-braking-boards',.254-100/5006.8196682221],['day-barrier',.285]]) {
   const p=await page.evaluate(async t=>(await import('/src/scene/trackCurve.js')).progressAtRouteT(t),t);
   await seek(p);await capture(name);
  }
  await page.evaluate(async()=>(await import('/src/scene/theme.js')).applyTheme('night',{instant:true}));
  await seek(0);await capture('night-grid-spot');
  await page.evaluate(async()=>(await import('/src/scene/theme.js')).applyTheme('day',{instant:true}));
 }
 if(geometryOnly) {
  const inventory=await page.evaluate(()=>({variant:window.__gt3.scene.getObjectByName('trackside-furniture').userData.variant,
   trees:!!window.__gt3.scene.getObjectByName('roadside-trees'),lane:!!window.__gt3.scene.getObjectByName('parallel-pit-lane')}));
  await seek(1);const returnObservation=await snap();
  report.variants.push({query,constants,grid,neutral,shots,inventory,geometryOnly,returnObservation});
  await page.close();continue;
 }
 await seek(1-2/constants.length);const approaching=await snap();assert(approaching.mode==='race' && approaching.signals,'finish approach incorrect');
 const activeBefore=approaching.active;await seek(1);const finish=await snap();
 report.lastFinishObservation={query,constants,grid,neutral,approaching,finish};
 assert(finish.mode==='finish' && finish.locked && finish.t===0 && finish.active===activeBefore && finish.active===9,'return line completion incorrect');
 await wait(600);await page.reload({waitUntil:'domcontentloaded',timeout:180000});await ready();await wait(500);
 const restored=await snap();assert(restored.p===1 && restored.mode==='finish' && restored.audio===0,'finish refresh was not complete and silent');
 await page.mouse.wheel({deltaY:-120});await wait(500);const reversed=await snap();
 assert(reversed.p<1 && reversed.mode==='race' && !reversed.locked && reversed.active===9,'finish reverse-out failed');
 await seek(1);assert((await snap()).mode==='finish','finish did not re-arm');
 const inventory=await page.evaluate(()=>{
  const gt3=window.__gt3;const result={drawCalls:gt3.renderer.info.render.calls,triangles:gt3.renderer.info.render.triangles,geometries:gt3.renderer.info.memory.geometries,furniture:[]};
  gt3.scene.getObjectByName('trackside-furniture').traverse(o=>{if(o.isMesh)result.furniture.push({name:o.name,instances:o.count,triangles:(o.geometry.index?.count||o.geometry.getAttribute('position').count)/3*(o.count||1)});});
  return result;
 });report.variants.push({query,constants,grid,neutral,approaching,finish,restored,reversed,shots,inventory});
 await page.close();
}
assert(report.errors.length===0,`browser errors: ${report.errors.join(' | ')}`);
report.pass=true;
} catch(e) {report.pass=false;report.failure=e.stack;process.exitCode=1;}
finally {await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
