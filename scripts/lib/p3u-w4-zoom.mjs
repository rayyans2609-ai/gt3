/** node scripts/lib/p3u-w4-zoom.mjs in.png out.png x y w h scale  (nearest-neighbour inspection crop) */
import { readFile, writeFile } from 'node:fs/promises';
import { decodePNG } from './p3u-png.mjs';
import { encodePNG } from './p3u-w4-png.mjs';
const [i, o, x, y, w, h, s] = process.argv.slice(2); const X = +x, Y = +y, Wd = +w, H = +h, S = +s;
const im = decodePNG(await readFile(i)), out = Buffer.alloc(Wd * S * H * S * 4);
for (let yy = 0; yy < H * S; yy++) for (let xx = 0; xx < Wd * S; xx++) {
  const src = ((Y + (yy / S | 0)) * im.width + X + (xx / S | 0)) * 4; im.pixels.copy(out, (yy * Wd * S + xx) * 4, src, src + 4);
}
await writeFile(o, encodePNG(out, Wd * S, H * S));
