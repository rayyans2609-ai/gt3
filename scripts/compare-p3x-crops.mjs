import {execFileSync} from 'node:child_process';
import {readFileSync,unlinkSync,writeFileSync} from 'node:fs';
const [left,right,leftPrefix,rightPrefix,out]=process.argv.slice(2),rows=[];
for(const name of ['grid','hairpin','car']) {
 const paths=[`${left}/${leftPrefix}-${name}.png`,`${right}/${rightPrefix}-${name}.png`],bmps=paths.map((p,i)=>{const dest=`/tmp/p3x-compare-${process.pid}-${i}.bmp`;execFileSync('sips',['-s','format','bmp',p,'--out',dest],{stdio:'ignore'});const b=readFileSync(dest);unlinkSync(dest);return b;});
 const shape=b=>({w:b.readInt32LE(18),h:b.readInt32LE(22),bits:b.readUInt16LE(28),compression:b.readUInt32LE(30),offset:b.readUInt32LE(10)}),shapes=bmps.map(shape);
 if(shapes[0].w!==shapes[1].w||shapes[0].h!==shapes[1].h||shapes[0].bits!==shapes[1].bits)throw Error('Shape mismatch');
 const a=bmps[0].subarray(shapes[0].offset),b=bmps[1].subarray(shapes[1].offset);let different=0,maxDelta=0;for(let i=0;i<a.length;i++){if(a[i]!==b[i])different++;maxDelta=Math.max(maxDelta,Math.abs(a[i]-b[i]));}rows.push({name,shapes,identical:a.equals(b),differentBytes:different,maxDelta});
}
writeFileSync(out,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
