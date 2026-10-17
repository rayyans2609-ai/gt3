/** T6: count actual WebGL creates after production readiness, across every
 * shader-affecting review combination. Reflection strengths are runtime uniforms;
 * exercise all three at each theme point, all original/cached-fade car materials.
 * No diagnostic material, mask or resolution mutation inside the measured window.
 */
import {writeFile} from 'node:fs/promises';
import {launch,env,wait} from './lib/p3u-common.mjs';
const out=env.GT3_OUT||'local/evidence/p3u/t6/allocations';
const {browser,page:startup,report}=await launch('browser',out);
report.runs=[];
try {
 for(const mode of ['smooth','quality']) for(const tone of ['neutral','aces','agx','split']) for(const spec of ['', '&carspec=quarter']) for(const toe of tone==='neutral'?['','&nightcar=toe']:['&nightcar=toe']) {
  const query=`?version=unlocked&mode=${mode}&tone=${tone}&refl=mid${spec}${toe}`;
  const page=await browser.newPage();
  await page.evaluateOnNewDocument(()=>{
   const proto=WebGL2RenderingContext.prototype;
   window.__creates={programs:0,textures:0};
   for(const [method,key] of [['createProgram','programs'],['createTexture','textures']]){
    const original=proto[method];proto[method]=function(...args){window.__creates[key]++;return original.apply(this,args);};
   }
   const raf=requestAnimationFrame.bind(window);
   window.requestAnimationFrame=cb=>raf(t=>{if(!window.__allocationFreeze||cb.name!=='frame')cb(t);});
  });
  await page.goto(report.base+'/'+query,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__gt3?.readiness?.status==='ready',{timeout:180000});
  const row=await page.evaluate(async()=>{
   window.__allocationFreeze=true;
   const g=window.__gt3,theme=await import('/src/scene/theme.js'),cars=await import('/src/scene/cars.js'),rig=await import('/src/scene/carRig.js'),morph=await import('/src/scene/morph.js');
   const env=await import('/src/scene/carEnvironment.js'),profile=await import('/src/core/renderProfile.js');
   const read=()=>({creates:{...window.__creates},programs:g.renderer.info.programs.length,textures:g.renderer.info.memory.textures});
   const before=read(),frames=[];
   for(const target of ['night','day','night','day']){
    theme.applyTheme(target);
    for(let step=0;step<9;step++){
     theme.update(2.2/8);
     for(const strength of Object.values(profile.SETTINGS.themes[target].reflection)){
      env.setCarReflectionStrength(strength);
      for(let i=0;i<10;i++){
       const model=cars.getCarModel(i);rig.setCarModel(model);g.composer.render(0);
       morph.beginWarmFade(model);g.composer.render(0);morph.endWarmFade(model);
      }
     }
     frames.push({target,step,...read()});
    }
   }
   const after=read();return {before,after,frames,delta:{programs:after.creates.programs-before.creates.programs,textures:after.creates.textures-before.creates.textures},toeEnabled:profile.NIGHT_CAR_TOE,dpr:g.renderer.getPixelRatio(),outputProgram:g.passes.wash.material.name,passes:g.composer.passes.length};
  });
  report.runs.push({query,...row});
  console.log('ALLOC',query,JSON.stringify(row.delta));
  await page.close(); await wait(100);
  await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 }
 report.pass=report.runs.every(r=>r.delta.programs===0&&r.delta.textures===0);
 if(!report.pass)process.exitCode=1;
}catch(e){report.incomplete=true;report.errors.push(e.stack);process.exitCode=1;}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
