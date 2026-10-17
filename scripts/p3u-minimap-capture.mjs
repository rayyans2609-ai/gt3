/** Focused minimap geometry/capture check. Use the owned verification server.
 * GT3_QUERY selects locked/unlocked. Neutral backing isolates SVG joins/fade;
 * these are deterministic image checks, never timing or whole-scene look proof. */
import {writeFile} from 'node:fs/promises';
import {launch,ready,env,query,wait} from './lib/p3u-common.mjs';
const out=env.GT3_OUT||'local/evidence/p3u/minimap';
const {browser,page,report,releaseDisplay}=await launch('browser',out);
const unlocked=new URLSearchParams(query).get('version')==='unlocked';
report.kind='minimap-neutral-backing'; report.captures=[];
try {
  await page.evaluateOnNewDocument(()=>{
    const raf=requestAnimationFrame.bind(window);
    window.requestAnimationFrame=cb=>raf(t=>{if(!window.__mapFreeze||cb.name!=='frame')cb(t)});
  });
  report.loading=await ready(page,report);
  await page.mouse.wheel({deltaY:20}); await wait(1600);
  await page.evaluate(()=>{window.__mapFreeze=true});
  await page.addStyleTag({content:'.hud-route{background:#202427} *,*::before,*::after{animation:none!important;transition:none!important}'});
  const bounds=await page.$('.hud-route');
  const seams=await page.evaluate(async()=>{
    const {GRID_T,GRID_GAP}=await import('/src/scene/trackCurve.js');
    return {gantry:GRID_GAP/(1+GRID_GAP),whole:1/(1+GRID_GAP),grid:GRID_T};
  });
  const states=[['zero',0],['fractional',.25013],['forward',.76],['reverse',.002],
    ['gantry-before',seams.gantry-.00001],['gantry-after',seams.gantry+.00001],
    ['whole-before',seams.whole-.00001],['whole-after',seams.whole+.00001],
    ['near-finish',.99999],['finish',1],['reset',0]];
  for(const theme of ['day','night']) for(const [name,progress] of states){
    const facts=await page.evaluate(async({progress,theme})=>{
      (await import('/src/scene/theme.js')).applyTheme(theme,{instant:true});
      (await import('/src/scroll/scrollDrive.js')).seekTo(progress,{instant:true});
      (await import('/src/ui/hud.js')).update(0);
      const paths=[...document.querySelectorAll('.hud-route__trail-gradient')];
      const grads=[...document.querySelectorAll('linearGradient[id^="hud-route-trail-gradient-"]')];
      const bases=[...document.querySelectorAll('.hud-route__done-base')];
      const rows=grads.map(g=>({x1:+g.getAttribute('x1'),y1:+g.getAttribute('y1'),x2:+g.getAttribute('x2'),y2:+g.getAttribute('y2'),alpha:[...g.children].map(s=>+s.getAttribute('stop-opacity'))}));
      const visible=e=>e.style.visibility!=='hidden';
      return {progress:(await import('/src/core/state.js')).state.progress,
        modern:paths.length,legacy:document.querySelectorAll('.hud-route__done-seg').length,
        visible:paths.filter(visible).length,baseVisible:bases.filter(visible).length,
        baseLength:bases.filter(visible).reduce((sum,p)=>sum+Number(p.getAttribute('stroke-dasharray').split(' ')[0]),0),
        arrow:document.querySelector('.hud-route__marker').getAttribute('transform'),rows};
    },{progress,theme});
    if(unlocked){
      if(facts.modern!==48||facts.legacy!==0||facts.baseLength>1+1e-9)throw Error(`invalid modern representation: ${name}`);
      if(progress===0&&(facts.visible!==0||facts.baseVisible!==0))throw Error('trail did not reset');
      if(progress>0){
        if(facts.visible!==48||facts.baseVisible===0)throw Error('fractional trail missing');
        for(let i=0;i<facts.rows.length;i++){
          const r=facts.rows[i];if([...Object.values(r).filter(v=>typeof v==='number'),...r.alpha].some(v=>!Number.isFinite(v))||r.alpha.some(v=>v<0||v>1))throw Error('nonfinite/out-of-range gradient');
          if(i){const a=facts.rows[i-1];if(Math.hypot(a.x2-r.x1,a.y2-r.y1)>1e-7||Math.abs(a.alpha[1]-r.alpha[0])>1e-7)throw Error('discontinuous gradient boundary')}
        }
      }
    }else if(facts.legacy!==160||facts.modern!==0)throw Error('Locked representation changed');
    const file=`${theme}-${name}.png`;await bounds.screenshot({path:`${out}/${file}`});
    report.captures.push({name:`${theme}-${name}`,file,...facts});
  }
  report.pass=true;
}catch(e){report.pass=false;report.errors.push(e.stack);process.exitCode=1}
finally{await writeFile(`${out}/manifest.json`,JSON.stringify(report,null,1)+'\n');releaseDisplay();await browser.close().catch(()=>{})}
