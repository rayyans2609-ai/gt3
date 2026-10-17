/** W4 tonal integrity of full backing-resolution frames: clipping, crushed darks, and
 * gradient banding (longest run of identical luma along rows inside smooth regions).
 * node scripts/p3u-w4-tonal.mjs <runDir> [tags] [scenarios] */
import { readFile } from 'node:fs/promises';
import { decodePNG } from './lib/p3u-png.mjs';
const [run, tagsText = 'locked,smooth-off,smooth,quality-off,quality', scenText = 't123-creep,t123-night-creep,fence-creep,grid-creep'] = process.argv.slice(2);
const rows = [];
for (const scenario of scenText.split(',')) for (const tag of tagsText.split(',')) {
  let im; try { im = decodePNG(await readFile(`${run}/${tag}/${scenario}-frame.png`)); } catch { continue; }
  const n = im.width * im.height, p = im.pixels; let clipHi = 0, clipLo = 0, nearBlack = 0; const hist = new Uint32Array(256);
  for (let i = 0; i < n * 4; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2], y = (54 * r + 183 * g + 19 * b) >> 8; hist[y]++;
    if (r === 255 || g === 255 || b === 255) clipHi++;
    if (r === 0 && g === 0 && b === 0) clipLo++;
    if (y <= 4) nearBlack++;
  }
  // Banding proxy: in rows, runs of identical RGB across pixels whose 9-px neighbourhood
  // varies by <= 3 codes (smooth gradient zones). Long runs + 1-code steps = visible bands.
  let smooth = 0, runSum = 0, runs = 0, longest = 0;
  for (let y = 4; y < im.height - 4; y += 7) {
    let run = 1;
    for (let x = 5; x < im.width - 4; x++) {
      const i = (y * im.width + x) * 4; let lo = 255, hi = 0;
      for (let k = -4; k <= 4; k++) { const v = p[i + k * 4 + 1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (hi - lo > 3) { if (run > 1) { runSum += run; runs++; longest = Math.max(longest, run); } run = 1; continue; }
      smooth++;
      if (p[i] === p[i - 4] && p[i + 1] === p[i - 3] && p[i + 2] === p[i - 2]) run++;
      else { runSum += run; runs++; longest = Math.max(longest, run); run = 1; }
    }
  }
  let lumaLevels = 0; for (const v of hist) if (v) lumaLevels++;
  rows.push({ scenario, tag, size: `${im.width}x${im.height}`, clipHighAnyChannel: +(clipHi / n).toFixed(5), pureBlack: +(clipLo / n).toFixed(5),
    lumaLE4: +(nearBlack / n).toFixed(5), lumaLevels, smoothSampleFraction: +(smooth / (n / 7)).toFixed(3), meanIdenticalRunPx: +(runSum / (runs || 1)).toFixed(2), longestIdenticalRunPx: longest });
}
console.table(rows);
console.log(JSON.stringify(rows));
