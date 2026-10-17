/** W4 comparison sheets from p3u-w4-integrity.mjs output (node only, no browser).
 * node scripts/p3u-w4-sheets.mjs <runDir> <outDir> <scenario> <tagA,tagB,...> [cssRect x,y,w,h] [frames]
 * Every panel is resampled bilinearly to device pixels (CSS×2), i.e. what the browser's
 * canvas upscale shows on the owner's 2× panel. cssRect is relative to the crop's top-left
 * (the harness 'centre' crop starts at 32%/30% of the 1470×956 page). Writes an APNG and a
 * PNG strip of the first, middle and last frame. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { encodePNG, encodeAPNG, hstack } from './lib/p3u-w4-png.mjs';
const [run, outDir, scenario, tagsText, rectText = '0,0,529,382', framesText] = process.argv.slice(2);
const [rx, ry, rw, rh] = rectText.split(',').map(Number);
const tags = tagsText.split(',');
const load = async tag => {
  const b = gunzipSync(await readFile(`${run}/${tag}/${scenario}-crop.raw.gz`)), head = JSON.parse(b.subarray(0, 256).toString().trim());
  const manifest = JSON.parse(await readFile(`${run}/manifest.json`, 'utf8')), dpr = manifest.configs.find(c => c.tag === tag).dpr;
  return { ...head, dpr, frame: k => b.subarray(256 + k * head.w * head.h * 4, 256 + (k + 1) * head.w * head.h * 4) };
};
function resample(src, sw, sh, dpr) {
  // Output pixel (device, 2 per CSS px) centre → source backing coordinate.
  const W = rw * 2, H = rh * 2, out = Buffer.alloc(W * H * 4), s = dpr / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = Math.min(sw - 1, Math.max(0, (x + .5) * s + rx * dpr - .5)), fy = Math.min(sh - 1, Math.max(0, (y + .5) * s + ry * dpr - .5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < 4; c++) {
      const v = (src[(y0 * sw + x0) * 4 + c] * (1 - ax) + src[(y0 * sw + x1) * 4 + c] * ax) * (1 - ay)
        + (src[(y1 * sw + x0) * 4 + c] * (1 - ax) + src[(y1 * sw + x1) * 4 + c] * ax) * ay;
      out[(y * W + x) * 4 + c] = Math.round(v);
    }
  }
  return { rgba: out, w: W, h: H };
}
const sets = await Promise.all(tags.map(load));
const n = Math.min(+(framesText || Infinity), ...sets.map(s => s.n));
const frames = [];
for (let k = 0; k < n; k++) frames.push(hstack(sets.map(s => resample(s.frame(k), s.w, s.h, s.dpr))));
await mkdir(outDir, { recursive: true });
const name = `${outDir}/${scenario}-${tags.join('_vs_')}`;
await writeFile(`${name}.apng`, encodeAPNG(frames.map(f => f.rgba), frames[0].w, frames[0].h, 1000 / 30));
const pick = [0, n >> 1, n - 1].map(k => frames[k]);
const strip = { w: pick[0].w, h: pick.length * pick[0].h + (pick.length - 1) * 6 }, buf = Buffer.alloc(strip.w * strip.h * 4, 255);
pick.forEach((f, i) => f.rgba.copy(buf, i * (f.h + 6) * f.w * 4));
await writeFile(`${name}-strip.png`, encodePNG(buf, strip.w, strip.h));
console.log(name, frames[0].w, frames[0].h, n);
