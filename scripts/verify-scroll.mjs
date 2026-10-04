/**
 * Real-browser scroll-pace verification (W3). Drives the REAL browser scroll path with CDP
 * `Input.dispatchMouseEvent` type `mouseWheel` against `default`, `?scroll=cap` and `?scroll=pace`,
 * sampling state.progress every animation frame inside the page. Same traces and metric definitions as
 * scripts/sim-scroll-pace.mjs so the pure-node prediction can be compared directly with the browser result.
 *
 * Usage (Vite already running, e.g. port 5193):
 *   GT3_URL=http://127.0.0.1:5193 GT3_PREFLIGHT=<session preflight> HEAVY_OWNER=w3 \
 *   GT3_OUT=/Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/w3 node scripts/verify-scroll.mjs
 * Env: GT3_MODES=default,cap,pace (subset), GT3_QUERY="comp=b&gate=quiet" extra params for every URL,
 *      GT3_HEADLESS=1 (default headed is closer to a real user; headless is acceptable for proxies),
 *      GT3_SOUND=1 to click the speaker (sound-on pass) before the scenarios.
 * Metrics are proxies for comparison, not acceptance. CDP wheel events are discrete (no trackpad
 * momentum), delivered with timer jitter (~1-4 ms) and, on macOS, Chrome may apply its own wheel smoothing.
 */
import puppeteer from 'puppeteer-core';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.GT3_URL || 'http://127.0.0.1:5193';
const out = process.env.GT3_OUT || '/Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/w3';
const modes = (process.env.GT3_MODES || 'default,cap,pace').split(',');
const extra = (process.env.GT3_QUERY || '').replace(/^[?&]/, '');
const headless = process.env.GT3_HEADLESS === '1';
const sound = process.env.GT3_SOUND === '1';
const preflight = process.env.GT3_PREFLIGHT || '/Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/preflight-session.sh';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause = ms => new Promise(r => setTimeout(r, ms));
const r1 = x => (Number.isFinite(x) ? +x.toFixed(1) : null);
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const START_T = 0.30;   // straight-ish section between gates 3 and 4 (CHECKPOINT_T 0.255 / 0.390)

// ------------------------------------------------------------------ traces (same as the simulation)
const steady = (px16, s, sign = 1, t0 = 0) => { const o = []; for (let t = 0; t < s - 1e-9; t += 0.016) o.push({ t: t0 + t, dy: sign * px16 }); return o; };
const fling = (total, ms, tauMs) => { const n = ms / 8, w = Array.from({ length: n }, (_, i) => Math.exp(-(i * 8) / tauMs)); const sum = w.reduce((a, b) => a + b, 0); return w.map((x, i) => ({ t: i * 0.008, dy: total * x / sum })); };
const SCEN = {
  gentle: { ev: steady(20, 2.5), end: 2.5 }, normal: { ev: steady(60, 2.5), end: 2.5 }, aggressive: { ev: steady(150, 2.5), end: 2.5 },
  fling2500: { ev: fling(2500, 600, 150), end: 0.6 }, mouse1500: { ev: [{ t: 0, dy: 1500 }], end: 0 },
  smallRepeats: { ev: Array.from({ length: 8 }, (_, i) => ({ t: i * 0.18, dy: 120 })), end: 1.26 },
  reverse: { ev: [...steady(60, 1.5), ...steady(60, 1.5, -1, 1.5)], end: 3.0, reverseAt: 1.5 },
  rapidReversals: { ev: Array.from({ length: 8 }, (_, k) => steady(60, 0.25, k % 2 ? -1 : 1, k * 0.25)).flat(), end: 2.0 },
};

function preflightOk() {
  for (let i = 1; i <= 10; i++) {
    const c = spawnSync('bash', [preflight], { encoding: 'utf8', timeout: 60000, env: { ...process.env } });
    const o = `${c.stdout || ''}${c.stderr || ''}`; console.log(o.trim());
    if (o.includes('PREFLIGHT PASS')) return;
    if (i < 10) spawnSync('sleep', ['60']);
  }
  throw new Error('preflight never passed (host problem, not a product failure)');
}

async function installSampler(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    window.__vs = { rows: [], on: false, wheel: [] };
    // Real wheel input as the page sees it (after any Chrome-side smoothing): for pace calibration.
    window.addEventListener('wheel', e => { if (window.__vs.on) window.__vs.wheel.push([performance.now(), e.deltaY, e.deltaMode]); }, { passive: true, capture: true });
    const tick = t => {
      if (window.__vs.on) window.__vs.rows.push([t, state.progress, state.targetProgress, state.velocity, state.speed01, window.scrollY, state.scrollLocked ? 1 : 0]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function wheelTrace(cdp, ev, startMs) {
  // Schedule absolute wall-clock deadlines against performance-like time to limit drift.
  const t0 = Date.now() + startMs;
  for (const e of ev) {
    const wait = t0 + e.t * 1000 - Date.now();
    if (wait > 0) await pause(wait);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: e.dy });
  }
}

/** Reaching progress >= 0.995 opens the finish screen and locks scroll (by design); release it so
 * later scenarios measure the drive, not the lock. Returns whether a finish was open. */
async function dismissFinish(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    const was = state.mode === 'finish';
    if (was) (await import('/src/ui/finishScreen.js')).hideFinishScreen();
    return was;
  });
}

async function runScenario(page, cdp, L, name, sc, startT) {
  await dismissFinish(page);
  await page.evaluate(async t => { (await import('/src/scroll/scrollDrive.js')).seekTo(t, { instant: true }); }, startT);
  await pause(1500);
  await page.evaluate(() => { window.__vs.rows = []; window.__vs.wheel = []; window.__vs.on = true; });
  const t0 = await page.evaluate(() => performance.now());
  await pause(250);
  const inputStart = (await page.evaluate(() => performance.now())) + 20;
  await wheelTrace(cdp, sc.ev, 20);
  const settleWait = 3500;
  await pause(settleWait);
  const finishedDuring = await page.evaluate(async () => (await import('/src/core/state.js')).state.mode === 'finish');
  const { rows, wheel } = await page.evaluate(() => { window.__vs.on = false; return { rows: window.__vs.rows, wheel: window.__vs.wheel }; });
  const fr = rows.map((r, i) => ({ t: (r[0] - inputStart) / 1000, p: r[1], m: r[1] * L, target: r[2], vel: r[3], speed01: r[4], y: r[5],
    speed: i ? (r[1] - rows[i - 1][1]) * L / Math.max(1e-3, (r[0] - rows[i - 1][0]) / 1000) : 0 }));
  return { fr, t0, wheel: wheelRates(wheel), finishedDuring };
}

/** Observed wheel input in the page: events, px, mean px/s over the active span, peak px/s in any 100 ms window. */
function wheelRates(w) {
  if (!w.length) return { events: 0 };
  const span = Math.max(0.016, (w.at(-1)[0] - w[0][0]) / 1000);
  let peak = 0;
  for (let i = 0; i < w.length; i++) {
    let sum = 0;
    for (let j = i; j < w.length && w[j][0] - w[i][0] < 100; j++) sum += Math.abs(w[j][1]);
    peak = Math.max(peak, sum / 0.1);
  }
  return { events: w.length, totalPx: r1(w.reduce((a, e) => a + Math.abs(e[1]), 0)), spanS: r2(span),
    meanPxPerS: r1(w.reduce((a, e) => a + Math.abs(e[1]), 0) / span), peak100msPxPerS: r1(peak), deltaMode: w[0][2] };
}

function metrics(fr, sc, L) {
  const peakFrame = Math.max(...fr.map(f => Math.abs(f.speed)));
  const win100 = (i) => { const a = fr.slice(0, i).reverse().find(g => fr[i].t - g.t >= 0.1) || fr[0]; return (fr[i].m - a.m) / Math.max(0.016, fr[i].t - a.t); };
  const peak100 = Math.max(...fr.map((_, i) => Math.abs(win100(i))));
  const iEnd = Math.max(0, fr.findIndex(f => f.t >= sc.end));
  let settle = null;
  for (let i = iEnd; i < fr.length; i++) {
    const w = fr.filter(f => f.t >= fr[i].t && f.t < fr[i].t + 0.25);
    if (w.length > 3 && w.every(f => Math.abs(f.speed) < 1)) { settle = fr[i].t - sc.end; break; }
  }
  const meanWin = (a, b) => { const x = fr.find(f => f.t >= a), y = fr.find(f => f.t >= b) || fr.at(-1); return (y.m - x.m) / (y.t - x.t); };
  const o = { peakFrame: r1(peakFrame), peak100ms: r1(peak100), meanSpeed1to2p5: r1(meanWin(1.0, Math.min(2.5, sc.end))),
    settleS: r2(settle), backlogAtInputEndM: r1((fr[iEnd].target - fr[iEnd].p) * L),
    runOnM: r1(fr.at(-1).m - fr[iEnd].m), distanceM: r1(fr.at(-1).m - fr[0].m),
    maxSpeed01: r2(Math.max(...fr.map(f => f.speed01))) };
  if (sc.reverseAt) {
    const i0 = fr.findIndex(f => f.t >= sc.reverseAt); let maxFwd = fr[i0].m, delay = null;
    for (let i = i0; i < fr.length; i++) { maxFwd = Math.max(maxFwd, fr[i].m); if (delay === null && fr[i].speed < -1) delay = fr[i].t - sc.reverseAt; }
    o.reverseDelayS = delay === null ? null : r2(delay); o.reverseOvershootM = r1(maxFwd - fr[i0].m);
  }
  return o;
}

async function runMode(mode) {
  preflightOk();
  const profile = await mkdtemp(join(tmpdir(), 'gt3-vscroll-'));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: headless ? 'new' : false, pipe: true,
    timeout: 300000, protocolTimeout: 300000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal', `--user-data-dir=${profile}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 } });
  const res = { mode, errors: [], scenarios: {}, interactions: {} };
  try {
    const params = [mode === 'default' ? '' : `scroll=${mode}`, extra].filter(Boolean).join('&');
    const url = params ? `${base}/?${params}` : base;
    res.url = url;
    const page = await browser.newPage();
    page.on('pageerror', e => res.errors.push(`pageerror: ${e.message}`));
    page.on('console', e => { if (e.type() === 'error') res.errors.push(`console: ${e.text()}`); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready' && document.querySelector('#start-screen.is-ready'), { timeout: 180000 });
    res.scrollModeReported = await page.evaluate(() => window.__gt3.scrollMode);
    // Loading-lifecycle spot check happens before the first wheel: nothing moved, nothing started.
    res.interactions.postReadyBeforeInput = await page.evaluate(async () => { const { state } = await import('/src/core/state.js');
      return { progress: state.progress, started: state.started, locked: state.scrollLocked, y: window.scrollY }; });
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: 2 });
    await pause(1800);
    if (sound) { await page.click('.audio-speaker'); await pause(1500); res.sound = await page.evaluate(() => document.querySelector('.audio-speaker')?.dataset.sound); }
    const L = await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).TRACK_LENGTH);
    await installSampler(page);
    for (const [name, sc] of Object.entries(SCEN)) {
      const { fr, wheel, finishedDuring } = await runScenario(page, cdp, L, name, sc, START_T);
      res.scenarios[name] = { ...metrics(fr, sc, L), finishedDuring, wheelSeen: wheel };
      console.log(`${mode} ${name}: ${JSON.stringify(res.scenarios[name])}`);
    }
    // Page ends: push down past the end, then verify scrolling still continues both ways.
    await dismissFinish(page);
    await page.evaluate(async () => (await import('/src/scroll/scrollDrive.js')).seekTo(0.97, { instant: true }));
    await pause(1200);
    await page.evaluate(() => { window.__vs.rows = []; window.__vs.on = true; });
    for (let i = 0; i < 300; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: 100 }); await pause(16); }
    await pause(1500);
    const endRows = await page.evaluate(() => window.__vs.rows);
    const pEnd = endRows.at(-1)[1];
    // Reaching the end opens the finish screen and locks scroll by design; releasing it must leave the
    // drive at the end and still scrollable back.
    const finishAtEnd = await dismissFinish(page);
    await pause(300);
    for (let i = 0; i < 120; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: -100 }); await pause(16); }
    await pause(1200);
    const backRows = await page.evaluate(() => { window.__vs.on = false; return window.__vs.rows; });
    res.interactions.pageEnds = { finishScreenAtEnd: finishAtEnd, progressAfterPushingDown: r2(pEnd), progressAfterReverse: r2(backRows.at(-1)[1]), movedBack: backRows.at(-1)[1] < pEnd - 0.002 };
    // Instant-seek contract (W7): after seekTo(t,{instant:true}) the car is at t with no banked target / motion.
    await page.evaluate(async () => (await import('/src/scroll/scrollDrive.js')).seekTo(0.5, { instant: true }));
    await pause(1500);
    res.interactions.instantSeek = await page.evaluate(async () => { const { state } = await import('/src/core/state.js');
      return { progress: state.progress, target: state.targetProgress, velocity: state.velocity, speed01: state.speed01 }; });
    res.interactions.adaptiveResolution = await page.evaluate(() => window.__gt3?.renderer ? { pixelRatio: window.__gt3.renderer.getPixelRatio() } : null);
  } finally {
    await browser.close();
  }
  return res;
}

await mkdir(out, { recursive: true });
const all = { startedAt: new Date().toISOString(), base, headless, sound, extra, modes: {} };
for (const m of modes) {
  try { all.modes[m] = await runMode(m); } catch (e) { all.modes[m] = { error: String(e.message || e) }; console.error(`${m} failed: ${e.message}`); }
  await writeFile(join(out, `verify-scroll${sound ? '-sound' : ''}.json`), JSON.stringify(all, null, 2) + '\n');
}
console.log(`wrote ${join(out, `verify-scroll${sound ? '-sound' : ''}.json`)}`);
