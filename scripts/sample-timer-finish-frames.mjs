/** Brief matched frame sample for the timer's ordinary driving dependency cone. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.GT3_URL || 'http://127.0.0.1:5204';
const out = process.env.GT3_OUT || '/tmp/gt3-timer-frames';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
 args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
 `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1280,800'],
 defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const report = { base, source: process.env.GT3_SOURCE, windows: {}, errors: [] };
const pause = ms => new Promise(r => setTimeout(r, ms));
try {
 const page = await browser.newPage();
 page.on('pageerror', e => report.errors.push(e.message));
 page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
 await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
 await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
 await page.mouse.wheel({ deltaY: 2 }); await pause(1400);
 await page.evaluate(async () => {
  const { seekTo } = await import('/src/scroll/scrollDrive.js'); seekTo(.30, { instant: true });
  window.__timerFrameSample = { on: false, rows: [], last: null };
  const tick = now => { const s = window.__timerFrameSample;
   if (s.on && s.last !== null) s.rows.push(now - s.last); s.last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
 });
 await pause(2000);
 for (const mode of ['idle', 'motion']) {
  await page.evaluate(() => { const s = window.__timerFrameSample; s.rows = []; s.last = null; s.on = true; });
  if (mode === 'motion') { for (let i = 0; i < 30; i++) { await page.mouse.wheel({ deltaY: 60 }); await pause(100); } }
  else await pause(3500);
  const data = await page.evaluate(() => {
   const s = window.__timerFrameSample; s.on = false;
   const g = window.__gt3; return { rows: s.rows, calls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles, pixelRatio: g.renderer.getPixelRatio(),
    gpu: g.renderer.getContext().getParameter(g.renderer.getContext().RENDERER) };
  });
  const sorted = [...data.rows].sort((a,b) => a-b);
  report.windows[mode] = { ...data, frames: sorted.length, p50: sorted[Math.floor(sorted.length*.5)],
   p95: sorted[Math.floor(sorted.length*.95)], over33: sorted.filter(x => x > 33).length };
 }
 report.pass = report.errors.length === 0;
 if (!report.pass) process.exitCode = 1;
} finally { await writeFile(`${out}/frames.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.windows).map(([k, { rows, ...v }]) => [k,v])), null, 2));
