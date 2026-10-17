/** W4 image-integrity evidence: deterministic slow/cruise pans on the production frame path
 * (fixed dt), in-page temporal flicker metrics, grain×AA interaction, stills and motion crops.
 * with-verification-server.sh node scripts/p3u-w4-integrity.mjs [base] ['?version=unlocked']
 * GT3_OUT=dir GT3_RENDER_DPR=1.5 GT3_W4_SET=core|<name,...> GT3_W4_FRAMES=n
 * GT3_W4_GRAIN=live keeps the production grain clock running in recorded frames (default frozen).
 * GT3_W4_CONFIGS='tag|?query|dpr;tag|?query|dpr' runs several configurations in ONE browser
 * admission (each reloads the page; outputs under GT3_OUT/<tag>/).
 * Clocks frozen and Math.random seeded exactly as scripts/p3u-capture.mjs. */
import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { launch, ready, quality, env, wait, base, query } from './lib/p3u-common.mjs';
import { encodePNG, encodeAPNG } from './lib/p3u-w4-png.mjs';
const out = env.GT3_OUT || 'local/evidence/p3u/w4/integrity';
const frames = +(env.GT3_W4_FRAMES || 36);
const crops = { centre: { x: .32, y: .30, w: .36, h: .40 }, wide: { x: .1, y: .15, w: .8, h: .7 } };
// Route sections chosen for distinct content: T1 curbs; catch fence + grandstand + barrier;
// hairpin armco/runoff/tyres; start grid/finish strip. creep ≈ one backing pixel per frame.
const SCENARIOS = [
  { name: 't123-creep', car: 0, t: .123, theme: 'day', speed: .01 },
  { name: 't123-cruise', car: 0, t: .123, theme: 'day', speed: .3 },
  { name: 't123-night-creep', car: 0, t: .123, theme: 'night', speed: .01 },
  { name: 'fence-creep', car: 3, t: .628, theme: 'day', speed: .01 },
  { name: 'hairpin-creep', car: 5, t: .272, theme: 'day', speed: .01 },
  { name: 'grid-creep', car: 0, t: .995, theme: 'day', speed: .01 },
  { name: 'grid-cruise', car: 0, t: .99, theme: 'day', speed: .3 },
  { name: 't123-rest', car: 0, t: .123, theme: 'day', speed: 0, extra: true },
];
const set = env.GT3_W4_SET || 'core';
const chosen = set === 'core' ? SCENARIOS.filter(s => !s.extra) : SCENARIOS.filter(s => set.split(',').includes(s.name));
const { browser, page, report, releaseDisplay } = await launch('browser', out);
const decode = o => ({ w: o.w, h: o.h, rgba: Buffer.from(o.rgba, 'base64') });
try {
  await page.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('gt3:soundCueSeen', '1'); } catch {}
    let seed = 123456789;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__p3uFreeze || cb.name !== 'frame') cb(t); });
  });
  report.loading = await ready(page, report);
  const configs = (env.GT3_W4_CONFIGS || `default|${query}|${env.GT3_RENDER_DPR || 1}`).split(';').map(c => c.split('|'));
  report.configs = [];
  for (const [tag, q, dprText, only] of configs) {
    const dpr = +dprText, dir = configs.length > 1 ? `${out}/${tag}` : out, rep = { tag, query: q, dpr };
    await mkdir(dir, { recursive: true }); report.configs.push(rep);
    if (q !== query || report.configs.length > 1) {
      await page.evaluate(() => { window.__p3uFreeze = false; });
      await page.goto(`${base}/${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
      await page.mouse.move(735, 478); await wait(1200);
    }
    console.log('CONFIG', tag, q, dpr);
    await page.mouse.wheel({ deltaY: 20 }); await wait(1600);
    rep.quality = await quality(page, dpr);
    await page.evaluate(() => { window.__p3uFreeze = true; });
    await page.evaluate(() => import('/scripts/lib/p3u-w4-page.js').then(m => m.init()));
    rep.scenarios = [];
    for (const s of only ? SCENARIOS.filter(s => only.split(',').includes(s.name)) : chosen) {
      const start = await page.evaluate(async s => { const w = await import('/scripts/lib/p3u-w4-page.js'); const r = w.panStart(s); w.metricsReset(8); return r; }, s);
      // Ten unrecorded frames let the production camera damping settle into the pan.
      await page.evaluate(async s => { const w = await import('/scripts/lib/p3u-w4-page.js'); for (let i = 0; i < 10; i++) w.panStep({ ...s, grain: 'frozen' }); }, s);
      const cropFrames = []; let mid = null;
      for (let k = 0; k < frames; k++) {
        const r = await page.evaluate(async (s, k, frames, c, grain) => {
          const w = await import('/scripts/lib/p3u-w4-page.js');
          w.panStep({ ...s, grain }); const f = w.renderRead(); w.metricsAdd(f);
          return { crop: w.crop(f, c), full: k === frames >> 1 ? w.full(f) : null,
            blur: window.__gt3.passes.motionBlur.uniforms.uStrength.value };
        }, s, k, frames, crops[s.crop || 'centre'], env.GT3_W4_GRAIN || 'frozen');
        cropFrames.push(decode(r.crop)); if (r.full) mid = decode(r.full);
        if (k === 0) s.blurStrength0 = r.blur;
      }
      const m = await page.evaluate(async () => { const w = await import('/scripts/lib/p3u-w4-page.js'); return w.metricsResult(w.renderRead()); });
      const heat = decode(m.heat);
      await writeFile(`${dir}/${s.name}-heat.png`, encodePNG(heat.rgba, heat.w, heat.h));
      await writeFile(`${dir}/${s.name}-frame.png`, encodePNG(mid.rgba, mid.w, mid.h));
      const c0 = cropFrames[0];
      await writeFile(`${dir}/${s.name}-crop.apng`, encodeAPNG(cropFrames.map(f => f.rgba), c0.w, c0.h, 1000 / 30));
      await writeFile(`${dir}/${s.name}-crop.raw.gz`, gzipSync(Buffer.concat([Buffer.from(JSON.stringify({ w: c0.w, h: c0.h, n: cropFrames.length }).padEnd(256)), ...cropFrames.map(f => f.rgba)])));
      rep.scenarios.push({ ...s, ...start, size: { w: mid.w, h: mid.h }, metrics: m.summary });
      console.log('PAN', s.name, JSON.stringify({ flickerPerMP: +m.summary.flickerEventsPerFramePerMP.toFixed(1), strongPerMP: +m.summary.strongEventsPerFramePerMP.toFixed(1), ever: +m.summary.pixelsEverFlickeringFraction.toFixed(5), blur: s.blurStrength0 }));
    }
    if (env.GT3_W4_BLUR) {
      rep.blur = [];
      for (const b of [{ name: 'blur-t123-max', car: 0, t: .123, theme: 'day', strength: 200 / 312.538 * .42 }, { name: 'blur-grid-max', car: 0, t: .99, theme: 'day', strength: 200 / 312.538 * .42 }]) {
        const r = await page.evaluate(async (b, c) => { const w = await import('/scripts/lib/p3u-w4-page.js'); w.pose(b); return w.blurStudy(b.strength, c); }, b, { x: 0, y: 0, w: .3, h: .35 });
        for (const k of ['production', 'ref64', 'jitter8']) { const c = decode(r[k].crop); await writeFile(`${dir}/${b.name}-${k}.png`, encodePNG(c.rgba, c.w, c.h)); delete r[k].crop; }
        rep.blur.push({ ...b, ...r }); console.log('BLUR', b.name, JSON.stringify({ production: r.production.errorVsRef64, jitter8: r.jitter8.errorVsRef64 }));
      }
    }
    // Grain × SMAA: static T1 pose, eight grain seeds; anything beyond grain+dither is AA churn.
    if (!env.GT3_W4_NOGRAIN) {
      rep.grain = [];
      for (const g of [{ name: 'grain-t123-day', car: 0, t: .123, theme: 'day' }, { name: 'grain-t123-night', car: 0, t: .123, theme: 'night' }, { name: 'grain-fence-day', car: 3, t: .628, theme: 'day' }]) {
        const r = await page.evaluate(async g => { const w = await import('/scripts/lib/p3u-w4-page.js'); w.pose(g); return w.grainRange([0, .37, 1.91, 3.3, 5.07, 7.7, 11.3, 13.9]); }, g);
        const heat = decode(r.heat); await writeFile(`${dir}/${g.name}-range.png`, encodePNG(heat.rgba, heat.w, heat.h));
        delete r.heat; rep.grain.push({ ...g, ...r });
        console.log('GRAIN', g.name, r.pixelsOver6, r.fractionOver6.toFixed(6));
      }
    }
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(report, null, 2) + '\n');
} catch (e) {
  report.incomplete = true; report.errors.push(e.stack);
  await writeFile(`${out}/failed.json`, JSON.stringify(report, null, 2)); throw e;
} finally { releaseDisplay(); await browser.close(); }
