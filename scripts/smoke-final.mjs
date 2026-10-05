/** Healthy-load smoke: readiness, gt3:* User Timing measures, warm-up step count, zero console errors.
 * Usage: GT3_URL=http://127.0.0.1:5194 node scripts/smoke-final.mjs  (run host preflight first; one browser). */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = (process.env.GT3_URL || 'http://127.0.0.1:5194').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-smoke-final';
const queries = (process.env.GT3_QUERIES || ',?comp=b&cam=soft&scroll=pace&gate=quiet').split(',');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const report = { base, at: new Date().toISOString(), runs: [] };
let failed = false;
try {
  for (const q of queries) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });
    await page.setCacheEnabled(false);
    await page.goto(`${base}/${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gt3?.readiness?.status && window.__gt3.readiness.status !== 'loading',
      { timeout: 180000, polling: 250 });
    await new Promise(r => setTimeout(r, 1500));
    const info = await page.evaluate(() => {
      const r = window.__gt3.readiness;
      return {
        status: r.status, model: r.model, audio: r.audio, gpu: r.gpu, reasons: r.reasons,
        warmupSteps: r.warmupSteps.length, readyAt: Math.round(r.readyAt),
        comp: window.__gt3.comp, scrollMode: window.__gt3.scrollMode, url: location.search,
        measures: Object.fromEntries(performance.getEntriesByType('measure')
          .filter(m => m.name.startsWith('gt3:')).map(m => [m.name, Math.round(m.duration)])),
      };
    });
    info.query = q; info.errors = errors;
    info.pass = info.status === 'ready' && errors.length === 0;
    // warmupSteps is reported, not asserted: it depends on roster mesh counts.
    if (!info.pass) failed = true;
    report.runs.push(info);
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${out}/smoke.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(failed ? 1 : 0);
