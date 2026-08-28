/**
 * perf-cpu.mjs — is the remaining cost rendering, app JS, or system contention?
 * Same wheel-driven scenario three ways, one page load:
 *   A rendering on   B rendering disabled (composer.render = noop)   C JS updates also idle
 * If B is not dramatically faster than A, rendering is not the limiter.
 */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-perf-cpu', '--no-first-run', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const p = await b.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await p.waitForFunction(() => { const n = document.querySelector('.hud-identity__name');
  return n && n.textContent.trim().length > 0 && window.__gt3?.renderer; }, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await p.evaluate(() => {
  const g = window.__gt3;
  g.__realRender = g.composer.render.bind(g.composer);
  window.__perf = { on: false, frames: [], canvas: [] };
  let last = performance.now();
  (function rec() {
    const now = performance.now();
    if (window.__perf.on) {
      window.__perf.frames.push(now - last);
      const c = document.querySelector('#scene');
      window.__perf.canvas.push(c.width);
    }
    last = now; requestAnimationFrame(rec);
  })();
  window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.5, behavior: 'instant' });
});
await new Promise((r) => setTimeout(r, 2500));

async function scenario(name, render) {
  await p.evaluate((r) => { const g = window.__gt3;
    g.composer.render = r ? g.__realRender : () => {}; }, render);
  await new Promise((r) => setTimeout(r, 800));
  await p.evaluate(() => { window.__perf.frames = []; window.__perf.canvas = []; window.__perf.on = true; });
  for (let i = 0; i < 80; i++) { await p.mouse.wheel({ deltaY: 250 }); await new Promise((r) => setTimeout(r, 16)); }
  const d = await p.evaluate(() => { window.__perf.on = false;
    return { f: window.__perf.frames, c: window.__perf.canvas }; });
  const f = d.f.slice(3).sort((x, y) => x - y);
  const mean = f.reduce((a, x) => a + x, 0) / f.length;
  const widths = [...new Set(d.c)].sort((a, x) => a - x);
  console.log(`${name.padEnd(30)} fps ${(1000/mean).toFixed(1).padStart(5)}  p50 ${f[Math.floor(f.length/2)].toFixed(0).padStart(5)}ms  p95 ${f[Math.floor(f.length*0.95)].toFixed(0).padStart(5)}ms   canvas widths seen: ${widths.join(',')}`);
}
console.log('\n=== where is the time going? (sustained wheel @midroute) ===');
await scenario('A rendering ON', true);
await scenario('B rendering OFF (JS only)', false);
await scenario('C rendering ON (repeat)', true);
await b.close();
