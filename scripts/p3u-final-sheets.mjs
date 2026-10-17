/** T6 owner sheets; native screenshot crops, no colour/brightness enhancement. */
import {readFile,writeFile} from 'node:fs/promises';
import {decodePNG,crop} from './lib/p3u-final-image.mjs';
import {launch,env} from './lib/p3u-common.mjs';
const root=env.GT3_ROOT||'local/evidence/p3u/t6',output='docs/review/p3u/stage1/FINAL';
const manifests={};
const load=async variant=>manifests[variant]??=(JSON.parse(await readFile(`${root}/${variant}/manifest.json`)));
const cell=async(variant,name,wide=false,w=360,h=220)=>{
 const m=await load(variant),s=m.captures.find(s=>s.name===name),im=decodePNG(await readFile(`${root}/${variant}/${s.file}`));
 const b=s.carBoundsCSS,scale=im.width/m.viewport.width;
 const png=wide?await readFile(`${root}/${variant}/${s.file}`):crop(im,Math.round((b.x+b.width/2)*scale)-w/2,Math.round((b.y+b.height/2)*scale)-h/2,w,h);
 return `<img style="width:${w}px;height:${h}px;object-fit:${wide?'contain':'fill'}" src="data:image/png;base64,${png.toString('base64')}">`;
};
const style=`<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f1efe9;color:#182329;font:15px Arial}h1{font-size:26px;margin:0 0 9px}p{margin:7px 0 16px;line-height:1.5}table{border-collapse:collapse}td,th{padding:10px 12px;border-bottom:1px solid #bdc3c4;text-align:left}th{font-size:16px}img{display:block}small{font-size:13px}</style>`;
const {browser,page,report}=await launch('browser',env.GT3_OUT||root+'/sheets');
try{
 for(const theme of ['day','night']){
  const columns=theme==='day'?[['locked','Locked · DPR1'],['neutral','Neutral / mid'],['quarter','Neutral / mid + quarter']]:[['locked','Locked · DPR1'],['split','Split / mid · ACES Night'],['toe','Neutral / high + toe'],['aces','ACES-only / mid']];
  const cars=theme==='day'?['ferrari','lamborghini','bmw']:['lexus','lamborghini','mclaren'];
  let html=`<!doctype html><meta charset="utf-8">${style}<h1>Stage 1 · ${theme==='day'?'Day':'Night'}</h1><p>Deterministic T1 pose · route t=.123 · candidates smooth DPR1.5 · locked DPR1 · same device DPR2<br>Car rows: unenhanced native 360 × 220 pixel crops. Last row: full frame reduced to show the road.</p><table><tr><th></th>${columns.map(c=>`<th>${c[1]}</th>`).join('')}</tr>`;
  for(const car of [...cars,'wide road']){
   html+=`<tr><th>${car}</th>`;
   for(const [variant] of columns)html+=`<td>${await cell(variant,`${car==='wide road'?cars[0]:car}-${theme}`,car==='wide road')}</td>`;
   html+='</tr>';
  }
  html+='</table><p><small>See README.md for exact URLs, observations and tradeoffs. Owner selection pending; defaults unchanged.</small></p>';
  await writeFile(`${root}/${theme}.html`,html);
  await page.setViewport({width:theme==='day'?1320:1710,height:1350,deviceScaleFactor:1});await page.setContent(html);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  await page.screenshot({path:`${output}/${theme}.png`,fullPage:true});
 }
 let html=`<!doctype html><meta charset="utf-8">${style}<h1>Day → Night · evenly spaced theme weights</h1><p>Same T1 pose, fixed clocks, real production easing inverted for each weight. Native crops; locked DPR1 / split smooth DPR1.5.</p><table><tr><th>Car / treatment</th>${Array.from({length:9},(_,i)=>`<th>${(i/8).toFixed(3)}</th>`).join('')}</tr>`;
 for(const car of ['lexus','ferrari'])for(const variant of ['locked','split']){
  html+=`<tr><th>${car}<br>${variant}</th>`;
  for(let i=0;i<9;i++)html+=`<td>${await cell(variant+'-transition',`${car}-blend-${i}`,false,200,150)}</td>`;
  html+='</tr>';
 }
 html+='</table><p><small>Silhouette and world L* / car C* measurements: transition-metrics.json. Sky is measured separately because terrain occludes it in T1.</small></p>';
 await writeFile(root+'/transition.html',html);await page.setViewport({width:2180,height:950,deviceScaleFactor:1});await page.setContent(html);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:output+'/transition.png',fullPage:true});
}finally{await writeFile((env.GT3_OUT||root+'/sheets')+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
