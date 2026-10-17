/** T5 supplementary silhouette metrics using UNMODIFIED T4 functions.
 * First copy d87df5e:scripts/p3u-metrics.mjs and scripts/lib/p3u-png.mjs to
 * local/tmp/p3u/t5/{p3u-metrics.mjs,lib/p3u-png.mjs}. Inputs: diagnosis directory
 * names under local/evidence/p3u/t5; optional GT3_METRIC_OUT. Run at repo root.
 * The original T4 CLI remains useful for world regions, not dark-car masks.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {decodePNG} from '../local/tmp/p3u/t5/lib/p3u-png.mjs';
let s=await readFile('local/tmp/p3u/t5/p3u-metrics.mjs','utf8');s=s.slice(s.indexOf('const clamp='),s.indexOf('async function load'))+'\nexport {lab,stats,lch,sobel,car};';
const {lab,stats,lch,sobel,car}=await import('data:text/javascript,'+encodeURIComponent(s));
const rows=[];
for(const tone of (process.argv.slice(2).length?process.argv.slice(2):['neutral','aces','agx'])) {
 const root=`local/evidence/p3u/t5/${tone}`,m=JSON.parse(await readFile(root+'/manifest.json'));
 const reference=decodePNG(await readFile('local/evidence/p3u/t5/neutral/ferrari-day-off.png'));
 const referenceMask=decodePNG(await readFile('local/evidence/p3u/t5/neutral/ferrari-day-mask.png'));
 let paintIds=[];
 for(let y=0;y<reference.height;y++)for(let x=0;x<reference.width;x++) {
  const q=y*reference.width+x,i=q*4,p=reference.pixels;
  const inMask=referenceMask.pixels[(Math.floor(y*referenceMask.height/reference.height)*referenceMask.width+Math.floor(x*referenceMask.width/reference.width))*4]>10;
  if(inMask&&p[i]>p[i+1]*1.3&&p[i]>p[i+2]*1.3&&Math.hypot(...lab(p,i).slice(1))>20)paintIds.push(q);
 }
 for(const st of m.captures){
  const im=decodePNG(await readFile(resolve(root,st.file))),mask=decodePNG(await readFile(resolve(root,st.mask)));
  const ids=[];for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(mask.pixels[(Math.floor(y*mask.height/im.height)*mask.width+Math.floor(x*mask.width/im.width))*4]>10)ids.push(y*im.width+x);
  const c=stats(im,ids),dominant=lch(c.labs);delete c.labs;
  let paint;
  if(st.name.startsWith('ferrari')) {
    
    const ps=stats(im,paintIds),mean=ps.labs.reduce((a,v)=>a.map((x,i)=>x+v[i]/paintIds.length),[0,0,0]);
    paint={pixels:paintIds.length,meanL:mean[0],meanC:ps.labs.reduce((a,v)=>a+Math.hypot(v[1],v[2]),0)/paintIds.length,hue:(Math.atan2(mean[2],mean[1])*180/Math.PI+360)%360};
  }
  const exactSet=new Set(ids),heuristic=car(im,st,m),overlap=heuristic.ids.filter(q=>exactSet.has(q)).length;
  rows.push({tone,state:st.name,paint,...c,dominant,sobel:sobel(im,ids),heuristic:{pixels:heuristic.ids.length,overlap,precision:overlap/heuristic.ids.length,recall:overlap/ids.length,bounds:heuristic.bounds},bounds:st.carBoundsCSS,treatment:st.treatment});
 }
}
await writeFile(process.env.GT3_METRIC_OUT || 'local/evidence/p3u/t5/exact-metrics.json',JSON.stringify(rows,null,2));
console.log(rows.map(r=>`${r.tone} ${r.state} n=${r.pixels} L=${r.meanLStar.toFixed(2)} sd=${r.stddevLStar.toFixed(2)} C=${r.dominant.chroma.toFixed(2)} h=${r.dominant.hueDegrees.toFixed(1)} grad=${r.sobel.toFixed(2)} precision=${r.heuristic.precision.toFixed(2)}`).join('\n'));
