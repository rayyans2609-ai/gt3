/** Offline check: abort every non-local request; app must reach ready with zero placeholder cars and
 * zero gstatic requests; then a normal load must serve the Draco decoder from /draco/gltf/.
 * Usage: GT3_URL=http://127.0.0.1:5194 GT3_OUT=<dir> node scripts/verify-offline.mjs */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = (process.env.GT3_URL || 'http://127.0.0.1:5194').replace(/\/$/, '');
const out = process.env.GT3_OUT || '/tmp/gt3-offline';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=${out}/chrome-${process.pid}`, '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const result = { base, at: new Date().toISOString(), runs: {} };
const isLocal = u => {
  try { const p = new URL(u); if (!/^(https?|wss?):$/.test(p.protocol)) return true;
    return p.hostname === '127.0.0.1' || p.hostname === 'localhost'; } catch { return true; }
};
async function run(name, offline) {
  const page = await browser.newPage();
  const all = [], aborted = [], errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url(); all.push(u);
    if (offline && !isLocal(u)) { aborted.push(u); req.abort('internetdisconnected'); } else req.continue();
  });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gt3?.readiness?.status && window.__gt3.readiness.status !== 'loading',
    { timeout: 240000, polling: 250 });
  await new Promise(r => setTimeout(r, 1500));
  const info = await page.evaluate(() => ({ status: window.__gt3.readiness.status, model: window.__gt3.readiness.model,
    reasons: window.__gt3.readiness.reasons }));
  const gstatic = all.filter(u => /gstatic/.test(u));
  // decoder files only (the DRACOLoader module itself is a bundled/pre-bundled dep, not the decoder)
  const draco = all.filter(u => /draco_/i.test(new URL(u).pathname));
  result.runs[name] = { ...info, requests: all.length, abortedNonLocal: aborted, gstaticRequests: gstatic,
    dracoRequests: draco, errors };
  await page.close();
}
let failed = false;
try {
  await run('offline', true); await run('normal', false);
  const o = result.runs.offline, n = result.runs.normal;
  o.pass = o.status === 'ready' && !o.reasons.includes('model-placeholder') && o.gstaticRequests.length === 0;
  n.pass = n.status === 'ready' && n.gstaticRequests.length === 0
    && n.dracoRequests.length > 0 && n.dracoRequests.every(u => new URL(u).pathname.startsWith('/draco/gltf/'));
  failed = !(o.pass && n.pass);
} finally { await browser.close(); }
await writeFile(`${out}/offline.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
process.exit(failed ? 1 : 0);
