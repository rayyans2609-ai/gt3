/** Dependency-free decoder for non-interlaced 8-bit RGB/RGBA PNG screenshots. */
import { inflateSync } from 'node:zlib';
export function decodePNG(b) {
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Not PNG');
  let width, height, channels, packed = [];
  for (let p = 8; p < b.length;) { const n = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + n); p += n + 12;
    if (type === 'IHDR') { width=data.readUInt32BE(0); height=data.readUInt32BE(4); channels={2:3,6:4}[data[9]]; if(data[8]!==8||!channels||data[12]) throw Error('Only noninterlaced 8-bit RGB/RGBA supported'); }
    if (type === 'IDAT') packed.push(data);
  }
  const src=inflateSync(Buffer.concat(packed)), stride=width*channels, pixels=Buffer.alloc(width*height*4); let previous=Buffer.alloc(stride), pos=0;
  const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c); return x<=y&&x<=z?a:y<=z?b:c;};
  for(let y=0;y<height;y++){const filter=src[pos++],row=Buffer.alloc(stride); if(filter>4) throw Error('Invalid PNG filter'); for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0; row[x]=(src[pos++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;} for(let x=0;x<width;x++){const i=(y*width+x)*4; for(let c=0;c<3;c++)pixels[i+c]=row[x*channels+c];pixels[i+3]=channels===4?row[x*channels+3]:255;} previous=row;}
  return {width,height,pixels};
}
