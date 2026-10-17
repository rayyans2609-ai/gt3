/** Dependency-free 8-bit RGB/RGBA PNG pixel diff (Chrome screenshots). */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
export { decodePNG } from './lib/p3u-png.mjs';
import { decodePNG } from './lib/p3u-png.mjs';
const args = process.argv.slice(2);
if (args.length < 2) throw Error('Usage: node scripts/p3u-diff.mjs setA setB [report.json]');
const manifest = async p => { const path = p.endsWith('.json') ? p : `${p}/manifest.json`; return { root: dirname(resolve(path)), data: JSON.parse(await readFile(path, 'utf8')) }; };
const [a, b] = await Promise.all(args.slice(0, 2).map(manifest));
const results = [];
for (const s of a.data.captures) {
  const t = b.data.captures.find(t => t.name === s.name);
  if (!t) { results.push({ state: s.name, missing: true }); continue; }
  const [x, y] = await Promise.all([[a, s], [b, t]].map(async ([m, s]) => decodePNG(await readFile(resolve(m.root, s.file)))));
  if (x.width !== y.width || x.height !== y.height) { results.push({ state: s.name, sizeMismatch: true }); continue; }
  let maxChannelDelta = 0, differingPixels = 0;
  for (let i = 0; i < x.pixels.length; i += 4) { let different = false; for (let c = 0; c < 4; c++) { const d = Math.abs(x.pixels[i + c] - y.pixels[i + c]); maxChannelDelta = Math.max(maxChannelDelta, d); different ||= d !== 0; } if (different) differingPixels++; }
  results.push({ state: s.name, identical: differingPixels === 0, maxChannelDelta, differingPixels, pixels: x.width * x.height });
}
for (const s of b.data.captures) if (!a.data.captures.some(t => t.name === s.name)) results.push({ state: s.name, extra: true });
const result = { a: args[0], b: args[1], identical: results.length > 0 && results.every(r => r.identical), results };
if (args[2]) await writeFile(args[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.identical ? 0 : 1;
