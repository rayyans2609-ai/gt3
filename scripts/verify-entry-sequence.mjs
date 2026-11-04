/** Standing-start entry, cancellation, refresh cover and genuine-scroll dismissal.
 * Run through the owned verification server: GT3_URL is required in manager runs.
 * Day/Night captures and report: local/evidence/p5/entry/ (GT3_OUT overrides).
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const hubVariant = process.argv.find(arg => arg.startsWith('--hub='))?.split('=')[1] || process.env.GT3_HUB;
if (hubVariant && !['a', 'b'].includes(hubVariant)) throw new Error('Expected --hub=a or --hub=b');
const withHub = value => {
  if (!hubVariant) return value;
  const next = new URL(value); next.searchParams.set('hub', hubVariant); return next.href;
};

const base = withHub(process.env.GT3_URL || process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:5243');
const out = path.resolve(process.env.GT3_OUT || 'local/evidence/p5/entry');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const report = { base, cases: {}, errors: [] };
let browser;

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

const snap = page => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const entry = document.getElementById('entry-sequence');
  const control = document.querySelector('.entry-scroll');
  return {
    experience: state.experience, transition: state.transition, progress: state.progress,
    targetProgress: state.targetProgress, locked: state.scrollLocked, started: state.started,
    audioReady: state.audioReady, mode: state.mode,
    phase: entry?.dataset.phase, entryHidden: !entry || entry.hidden,
    lamps: [...document.querySelectorAll('.entry-lamp')].map(lamp => lamp.classList.contains('is-on')),
    control: !!control && !control.hidden && !entry.hidden,
    coverHidden: !!document.getElementById('start-screen')?.hidden,
    soundCue: !!document.querySelector('.sound-cue'),
  };
});

async function phase(page, expected) {
  await page.waitForFunction(value => document.getElementById('entry-sequence')?.dataset.phase === value,
    { timeout: 20000, polling: 20 }, expected);
}
async function hubReady(page) {
  await page.waitForFunction(async () => {
    const { state } = await import('/src/core/state.js');
    return state.experience === 'hub' && !state.transition
      && document.querySelector('.hub-start')?.disabled === false;
  }, { timeout: 120000 });
}
async function armed(page) {
  await page.waitForFunction(async () => {
    const { state } = await import('/src/core/state.js');
    return state.experience === 'tour' && !state.scrollLocked && !state.transition;
  }, { timeout: 20000 });
}
async function record(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    window.__entryLog = [];
    let previous = '';
    const sample = () => {
      const root = document.getElementById('entry-sequence');
      if (!root) return;
      const value = { phase: root.dataset.phase, locked: state.scrollLocked,
        pattern: [...root.querySelectorAll('.entry-lamp')].map(lamp => lamp.classList.contains('is-on') ? '1' : '0').join(''),
        progress: state.progress, targetProgress: state.targetProgress };
      const next = JSON.stringify(value);
      if (next !== previous) { window.__entryLog.push({ at: performance.now(), ...value }); previous = next; }
    };
    new MutationObserver(sample).observe(document.getElementById('overlay'),
      { attributes: true, childList: true, subtree: true });
    sample();
  });
}
async function capture(page, theme, name) {
  const matches = () => page.evaluate(stage => {
    const root = document.getElementById('entry-sequence');
    if (!root || root.hidden) return false;
    const selector = stage === 'lamps' ? '.entry-housing' : stage === 'go' ? '.entry-go' : '.entry-scroll';
    const node = root.querySelector(selector);
    return !node.hidden && Number(getComputedStyle(node).opacity) > .8
      && (stage !== 'lamps' || root.querySelectorAll('.entry-lamp.is-on').length === 5);
  }, name);
  assert(await matches(), `${theme} ${name} capture stage was not visible`);
  await page.screenshot({ path: path.join(out, `${theme}-${name}.png`) });
  assert(await matches(), `${theme} ${name} changed during capture; rerun for valid visual evidence`);
}
async function dismissWithWheel(page) {
  await page.mouse.wheel({ deltaY: 240 });
  await page.waitForFunction(() => document.querySelector('.entry-scroll')?.hidden,
    { timeout: 5000 });
  const driven = await snap(page);
  assert(driven.started && driven.progress > 0, `first genuine scroll did not drive: ${JSON.stringify(driven)}`);
  assert(!driven.audioReady, 'scroll initialized audio');
  return driven;
}

await mkdir(out, { recursive: true });
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
      `--user-data-dir=${path.join(out, `chrome-${process.pid}`)}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  for (const theme of ['day', 'night']) {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(`${theme}: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error' && !/favicon/i.test(message.text())) report.errors.push(`${theme}: ${message.text()}`);
      });
      await page.evaluateOnNewDocument(selectedTheme => {
        // Record actual cover visibility and parting on every document, including refresh.
        const log = window.__coverLog = [];
        let previous = '';
        new MutationObserver(() => {
          const cover = document.getElementById('start-screen');
          if (!cover?.querySelector('.start-cover__loading')) return;
          const sample = { hidden: cover.hidden, leaving: cover.classList.contains('is-leaving'),
            readiness: cover.dataset.readiness,
            filled: cover.querySelectorAll('.start-cover__column.is-filled').length };
          const next = JSON.stringify(sample);
          if (next !== previous) { log.push({ at: performance.now(), ...sample }); previous = next; }
        }).observe(document, { subtree: true, childList: true, attributes: true });
        if (!sessionStorage.getItem('gt3.session.v1')) {
          sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'hub', theme: selectedTheme, routeProgress: 0 }));
        }
        // DEV-only evidence holds: a screenshot on the Intel host outlasts the real lamp/GO holds.
        window.__gt3TestFaults = { ...(window.__gt3TestFaults || {}), entryHoldMs: 5000, entryGoHoldMs: 3500 };
      }, theme);
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.mouse.move(800, 450);
      await hubReady(page);
      await clickStart(page);
      await phase(page, 'reds');
      await page.waitForFunction(() => document.querySelectorAll('.entry-lamp.is-on').length >= 1,
        { timeout: 5000 });
      const beforeHome = await snap(page);
      assert(beforeHome.locked && beforeHome.progress === 0, 'first entry did not hold the start line');
      await page.click('.home-control');
      await hubReady(page);
      const cancelled = await snap(page);
      assert(cancelled.entryHidden && cancelled.locked, `home did not cancel entry: ${JSON.stringify(cancelled)}`);
      await wait(5200); // old lamps/GO/quiet timers must never reappear or unlock at the Hub
      const afterTimers = await snap(page);
      assert(afterTimers.entryHidden && afterTimers.locked && afterTimers.progress === 0,
        'cancelled entry left a delayed visual or unlock');

      await record(page);
      await clickStart(page);
      await phase(page, 'reds');
      const redSamples = [];
      for (let count = 1; count <= 5; count++) {
        await page.waitForFunction(n => document.querySelectorAll('.entry-lamp.is-on').length === n,
          { timeout: 5000, polling: 20 }, count);
        const before = await snap(page);
        assert(before.locked && before.coverHidden, 'red lamps must lock the drive without the refresh cover');
        assert(before.lamps.every((on, i) => on === (i < count)), `lamps out of order: ${before.lamps}`);
        await page.mouse.wheel({ deltaY: 300 });
        await wait(60);
        const after = await snap(page);
        assert(after.progress === 0 && after.targetProgress === 0 && !after.started && !after.audioReady,
          `red input leaked: ${JSON.stringify(after)}`);
        redSamples.push(after);
        if (count === 5) await capture(page, theme, 'lamps');
      }
      await phase(page, 'go');
      await armed(page);
      const lightsOut = await snap(page);
      assert(lightsOut.lamps.every(on => !on) && lightsOut.progress === 0 && lightsOut.targetProgress === 0,
        `lights-out retained red travel: ${JSON.stringify(lightsOut)}`);
      await wait(150); // GO has completed its entrance
      await capture(page, theme, 'go');
      await page.waitForFunction(() => document.getElementById('entry-sequence')?.dataset.phase === 'control'
        && !document.querySelector('.entry-scroll')?.hidden, { timeout: 5000 });
      await capture(page, theme, 'control');
      const log = await page.evaluate(() => window.__entryLog);
      for (const pattern of ['10000', '11000', '11100', '11110', '11111']) {
        assert(log.some(sample => sample.pattern === pattern && sample.locked), `missing locked pattern ${pattern}`);
      }
      assert(!log.some(sample => sample.phase === 'reds' && !sample.locked), 'drive unlocked during reds');
      const lastRed = log.findLastIndex(sample => sample.pattern === '11111');
      assert(lastRed >= 0 && log.slice(lastRed + 1).find(sample => sample.phase === 'go')?.pattern === '00000',
        'all lamps did not go out together');
      const driven = await dismissWithWheel(page);
      assert(driven.soundCue, 'first-entry visual Sound cue did not follow the completed control fade');

      // Mid-route refresh parts the loading cover, preserves position, and teaches scroll without lamps.
      await wait(1000);
      const saved = await snap(page);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      // During boot, session restore sets experience before the drive locks, so `armed` can be
      // momentarily true before the cover exists. Wait for the real readiness first.
      await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status),
        { timeout: 150000 });
      await armed(page);
      const restored = await snap(page);
      const coverLog = await page.evaluate(() => window.__coverLog);
      const parting = coverLog.find(sample => sample.leaving && !sample.hidden);
      const parted = coverLog.find(sample => sample.leaving && sample.hidden);
      assert(coverLog.some(sample => sample.readiness === 'loading' && !sample.hidden && !sample.leaving),
        `refresh never displayed the loading cover: ${JSON.stringify(coverLog)}`);
      assert(parting && ['ready', 'degraded'].includes(parting.readiness)
        && parted && parted.at - parting.at >= 880, `cover did not part for 900ms after readiness: ${JSON.stringify(coverLog)}`);
      assert(restored.phase === 'resume' && restored.coverHidden && restored.control
        && restored.lamps.every(on => !on), `mid-route refresh entry incorrect: ${JSON.stringify(restored)}`);
      assert(Math.abs(restored.progress - saved.progress) < 0.002, 'refresh moved the saved route position');
      assert(!restored.soundCue, 'refresh repeated the session Sound cue');
      await dismissWithWheel(page);
      await wait(1000);
      await page.click('.home-control');
      await hubReady(page);
      const resumeAt = (await snap(page)).progress;
      await clickStart(page);
      await armed(page);
      const resumed = await snap(page);
      assert(!resumed.control && resumed.lamps.every(on => !on) && Math.abs(resumed.progress - resumeAt) < 1e-6,
        `Hub mid-route resume showed an entry cue or moved: ${JSON.stringify(resumed)}`);
      report.cases[theme] = { cancelled, afterTimers, redSamples, lightsOut, log, driven, saved, restored, coverLog, resumed };
    } finally { await context.close(); }
  }
  assert(report.errors.length === 0, `page errors: ${report.errors.join(' | ')}`);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = error.stack || error.message;
} finally {
  await browser?.close();
  await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
