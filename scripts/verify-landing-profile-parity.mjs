/**
 * Landing/Hub render parity between the Grand Tour rendering profiles (owner, 2026-10-24):
 * `?version=locked|unlocked` may change only the Grand Tour. The Landing, its transition and the
 * provisional Hub must be pixel-equivalent under both URLs, including after Hub -> Tour -> Hub
 * and after a refresh at the Hub; the Tour must still use its own selected profile.
 *
 * Usage (owned server, provenance):
 *   GT3_PORT=5251 GT3_SERVER_LOG=$PWD/local/evidence/profile/parity.log \
 *     scripts/with-verification-server.sh node scripts/verify-landing-profile-parity.mjs [outDir]
 * Env: GT3_URL (set by the wrapper), PARITY_DSF (device scale factor, default 2).
 * Exit 0 only if every comparison is within tolerance and the Tour state matches its profile.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.GT3_URL || 'http://127.0.0.1:5251';
const out = path.resolve(process.argv[2] || 'local/evidence/profile');
const dsf = Number(process.env.PARITY_DSF || 2);
const wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });

async function clickStart(page) {
  const box = await page.waitForFunction(() => {
    const el = document.querySelector('.hub-start');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  }, { timeout: 15000, polling: 50 }).then(handle => handle.jsonValue());
  await page.mouse.click(box.x, box.y);
}

// Progress points that are time-deterministic (idle turntable and bob are frozen via the tuning
// handle; progress >= .25 has no idle motion anyway).
const POINTS = [0, 0.3, 0.55, 0.75, 0.88, 0.94, 1];
// Mean abs channel error per pixel (0..255) and share of pixels differing by > 8/255.
const TOL = { mean: 0.05, over8pct: 0.02 };
// At p0 (car at rest) the ground shadow's opacity pulses +-15 % with the idle bob, which follows
// performance.now() and cannot be frozen from outside; that is the only time-dependent pixel
// region (now centred at x720, below the y578 pivot; about 89x34 CSS px, <= 18/255).
// Looser bound for p0 only; the original strict tolerances are unchanged.
const TOL_P0 = { mean: 0.12, over8pct: 0.5 };

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000,
  args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${path.resolve('local/tmp', `gt3-parity-${process.pid}`)}`],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: dsf },
});
const report = { base, dsf, tol: TOL, tolP0: TOL_P0, runs: {}, compare: [], tour: {}, errors: [] };

const dump = page => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const r = window.__gt3.renderer, c = r.domElement;
  return { experience: state.experience, world: document.documentElement.dataset.world,
    pixelRatio: r.getPixelRatio(), canvas: [c.width, c.height], toneMapping: r.toneMapping,
    outputColorSpace: r.outputColorSpace, scissorTest: r.getScissorTest(),
    renderTargetNull: r.getRenderTarget() === null, canvasTransform: c.style.transform || '',
    canvasClip: c.style.clipPath || '', exposureResting: +r.toneMappingExposure.toFixed(4),
    landingActive: window.__gt3.landing?.active?.() ?? null, theme: state.theme };
});

const freezeMotion = page => page.evaluate(() => {
  const t = window.__gt3.landing.tuning; t.idleDegPerSecond = 0; t.bobAmplitude = 1e-9;
  if (!document.getElementById('parity-freeze')) {
    const style = document.createElement('style'); style.id = 'parity-freeze';
    style.textContent = '.landing-cue__line{animation:none!important}'; document.head.appendChild(style);
  }
});

async function boot(context, query, theme, freeze = true, seedSession = null) {
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(String(e.message)));
  page.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/favicon/.test(t)) report.errors.push(t); });
  await page.evaluateOnNewDocument((theme, seed) => {
    try {
      if (!sessionStorage.getItem('gt3.session.v1'))
        sessionStorage.setItem('gt3.session.v1', JSON.stringify(seed || { theme }));
    } catch { /* storage unavailable */ }
  }, theme, seedSession);
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
  // Freeze motion the instant the Landing handle exists (before the hero loads), so the pose is
  // identical in every run; a non-zero bob amplitude is kept tiny to avoid a 0/0 in the shadow.
  await page.waitForFunction(() => window.__gt3?.landing?.tuning, { timeout: 120000, polling: 20 });
  if (freeze) await freezeMotion(page);
  await page.waitForFunction(() => window.__gt3?.landing?.loaded?.() &&
    ['ready', 'degraded'].includes(window.__gt3.readiness?.status), { timeout: 120000, polling: 150 });
  await wait(1500);
  return page;
}
async function shot(page, name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
async function sweep(page, tag) {
  const files = {};
  for (const p of POINTS) {
    await page.evaluate(p => window.__gt3.landing.seek(p), p);
    await wait(500);
    files[`p${p}`] = await shot(page, `${tag}-p${p}`);
  }
  return files;
}

const diffPage = await browser.newPage();
async function diff(fileA, fileB) {
  const a = 'data:image/png;base64,' + fs.readFileSync(fileA).toString('base64');
  const b = 'data:image/png;base64,' + fs.readFileSync(fileB).toString('base64');
  return diffPage.evaluate(async (a, b) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { error: 'size mismatch' };
    const px = i => { const c = new OffscreenCanvas(i.width, i.height); const x = c.getContext('2d');
      x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const da = px(ia), db = px(ib); let sum = 0, big = 0; const n = da.length / 4;
    for (let k = 0; k < da.length; k += 4) {
      const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
      sum += d; if (d > 8) big++;
    }
    return { mean: +(sum / n).toFixed(4), over8pct: +(100 * big / n).toFixed(4) };
  }, a, b);
}
async function compare(label, a, b) {
  const result = await diff(a, b);
  const tol = / p0:/.test(label) ? TOL_P0 : TOL;
  const pass = !result.error && result.mean <= tol.mean && result.over8pct <= tol.over8pct;
  report.compare.push({ label, pass, ...result });
}

try {
  for (const theme of ['day', 'night']) {
    for (const [profile, query] of [['locked', ''], ['unlocked', '?version=unlocked']]) {
      const key = `${profile}-${theme}`;
      const context = await browser.createBrowserContext();
      const run = report.runs[key] = {};
      let page = await boot(context, query, theme);
      run.landingState = await dump(page);
      run.files = await sweep(page, `${key}-pre`);
      run.hubState = await dump(page);

      // Hub -> Tour: the Tour must be on its own profile's settings.
      await clickStart(page);
      await page.waitForFunction(() => document.documentElement.dataset.world === 'tour', { timeout: 15000 });
      await wait(2500);
      run.tourState = await dump(page);
      // Hub <- Tour, then the same sweep: must equal the pre-Tour frames and the other profile's.
      await page.click('.home-control');
      await page.waitForFunction(() => document.documentElement.dataset.world === 'landing'
        && window.__gt3.landing.active(), { timeout: 15000 });
      await freezeMotion(page);
      // The click left the pointer over the page; at rest the Landing (correctly) leans toward it.
      await page.evaluate(() => document.documentElement.dispatchEvent(new Event('pointerleave')));
      await wait(4000); // the pointer response is damped (3.2 /s): let the tilt decay to nothing
      run.returnState = await dump(page);
      run.filesReturn = await sweep(page, `${key}-return`);

      // Refresh at the Hub: restoration path (session says hub).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gt3?.landing?.loaded?.() &&
        ['ready', 'degraded'].includes(window.__gt3.readiness?.status), { timeout: 120000, polling: 150 });
      await freezeMotion(page);
      await wait(1500);
      run.refreshState = await dump(page);
      run.filesRefresh = { hub: await shot(page, `${key}-refresh-hub`) };
      await page.evaluate(() => window.__gt3.landing.seek(0.55)); await wait(500);
      run.filesRefresh.p55 = await shot(page, `${key}-refresh-p0.55`);
      await page.close(); await context.close();
    }
  }

  // Cross-profile parity (same theme), plus each profile against itself after the Tour round trip.
  for (const theme of ['day', 'night']) {
    const L = report.runs[`locked-${theme}`], U = report.runs[`unlocked-${theme}`];
    for (const p of POINTS) {
      await compare(`${theme} p${p}: locked vs unlocked`, L.files[`p${p}`], U.files[`p${p}`]);
      await compare(`${theme} p${p}: unlocked after Tour round trip vs before`, U.filesReturn[`p${p}`], U.files[`p${p}`]);
      await compare(`${theme} p${p}: locked after Tour round trip vs before`, L.filesReturn[`p${p}`], L.files[`p${p}`]);
    }
    await compare(`${theme} refreshed Hub: locked vs unlocked`, L.filesRefresh.hub, U.filesRefresh.hub);
    await compare(`${theme} refreshed p0.55: locked vs unlocked`, L.filesRefresh.p55, U.filesRefresh.p55);
    await compare(`${theme} refreshed p0.55 vs pre-Tour p0.55 (unlocked)`, U.filesRefresh.p55, U.files['p0.55']);
  }

  // State parity while the Landing/Hub own the screen (resting exposure is theme.js's Tour value
  // and is overridden inside every Landing draw, so it is excluded and covered by the pixel diffs).
  const strip = s => { const { exposureResting, ...rest } = s; return rest; };
  const sameState = (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  for (const theme of ['day', 'night']) {
    const L = report.runs[`locked-${theme}`], U = report.runs[`unlocked-${theme}`];
    for (const name of ['landingState', 'hubState', 'returnState', 'refreshState'])
      report.compare.push({ label: `${theme} renderer state ${name}: locked vs unlocked`,
        pass: sameState(L[name], U[name]), locked: strip(L[name]), unlocked: strip(U[name]) });
    // The Tour keeps its own profile: DPR1 locked, DPR2 unlocked Quality; Landing differs by design.
    report.tour[theme] = { locked: L.tourState, unlocked: U.tourState };
    report.compare.push({ label: `${theme} Tour uses its profile (locked DPR1 / unlocked DPR2)`,
      pass: L.tourState.pixelRatio === 1 && U.tourState.pixelRatio === 2 && L.tourState.world === 'tour'
        && U.tourState.world === 'tour' && L.tourState.landingActive === false && U.tourState.landingActive === false,
      locked: L.tourState.pixelRatio, unlocked: U.tourState.pixelRatio });
  }
} catch (error) {
  report.fatal = String(error?.stack ?? error);
}
await browser.close();
report.pass = !report.fatal && report.compare.length > 0 && report.compare.every(c => c.pass);
report.failed = report.compare.filter(c => !c.pass).map(c => c.label);
fs.writeFileSync(path.join(out, 'parity.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ pass: report.pass, comparisons: report.compare.length, failed: report.failed,
  fatal: report.fatal, errors: report.errors.slice(0, 5) }, null, 1));
process.exitCode = report.pass ? 0 : 1;
