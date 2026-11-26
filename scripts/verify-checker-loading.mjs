/**
 * Targeted runtime proof for the Tour loading-cover checker and the Hub START RACE checker.
 * Run through scripts/run-harness.sh so the owned verification server supplies GT3_URL.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5243';
const out = path.resolve(process.env.GT3_OUT || 'local/evidence/p5-refine/checker');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const report = { base, cases: {}, errors: [] };
let browser;

async function makePage(context, reduced) {
  const page = await context.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }]);
  page.on('pageerror', error => report.errors.push(`${reduced ? 'reduced' : 'normal'}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/i.test(message.text())) {
      report.errors.push(`${reduced ? 'reduced' : 'normal'}: ${message.text()}`);
    }
  });
  await page.evaluateOnNewDocument(() => {
    // An unfinished Tour restoration is the only boot path that renders this loading cover.
    if (!sessionStorage.getItem('gt3.session.v1')) {
      sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'tour', routeProgress: 0.4, theme: 'day' }));
    }
    const probe = window.__gt3CheckerProbe = { samples: [], readinessAt: null, completingAt: null, leaving: null };
    let last = '';
    const snapshot = (reason) => {
      const root = document.getElementById('start-screen');
      if (!root?.querySelector('.start-cover__loading')) return null;
      const cells = [...root.querySelectorAll('.start-cover__column.is-filled i')].map((cell, index) => {
        const live = cell.getAnimations().filter(animation => animation.playState === 'running');
        const value = { animationName: getComputedStyle(cell).animationName, running: live.length > 0 };
        // Diagnostics only on a running cell (keeps the sample key stable otherwise).
        if (live.length) {
          value.index = index;
          value.column = cell.parentElement.className;
          value.live = live.map(animation => ({
            type: animation.constructor.name,
            name: animation.animationName ?? animation.transitionProperty ?? null,
            currentTime: animation.currentTime,
            duration: animation.effect?.getComputedTiming?.().endTime ?? null,
          }));
        }
        return value;
      });
      const value = {
        at: performance.now(), reason, readiness: root.dataset.readiness || 'none',
        completing: root.classList.contains('is-completing'), leaving: root.classList.contains('is-leaving'),
        filled: root.querySelectorAll('.start-cover__column.is-filled').length,
        cells,
        shutters: [...root.querySelectorAll('.start-cover__top, .start-cover__bottom')]
          .map(shutter => getComputedStyle(shutter).transitionDuration),
      };
      const key = JSON.stringify({ readiness: value.readiness, completing: value.completing,
        leaving: value.leaving, filled: value.filled, cells: value.cells, shutters: value.shutters });
      if (key !== last || reason === 'leaving') {
        probe.samples.push(value);
        last = key;
      }
      if ((value.readiness === 'ready' || value.readiness === 'degraded') && probe.readinessAt === null) {
        probe.readinessAt = value.at;
      }
      if (value.completing && probe.completingAt === null) probe.completingAt = value.at;
      if (value.leaving && !probe.leaving) probe.leaving = value;
      return value;
    };
    new MutationObserver(() => snapshot('mutation')).observe(document, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-readiness'],
    });
    const interval = setInterval(() => snapshot('interval'), 20);
    window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  });
  return page;
}

async function visit(page) {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.mouse.move(800, 450);
}

async function tourCover(page, reduced) {
  await visit(page);
  await page.waitForFunction(() => window.__gt3CheckerProbe?.leaving, { timeout: 150000 });
  const observed = await page.evaluate(() => window.__gt3CheckerProbe);
  const loadingCells = observed.samples
    .filter(sample => sample.readiness === 'loading')
    .flatMap(sample => sample.cells);
  const completion = observed.leaving;
  assert(loadingCells.length > 0, 'never sampled a filled checker cell while loading');
  assert(completion, 'cover never added is-leaving');
  if (reduced) {
    const allCells = [...loadingCells, ...completion.cells];
    assert(allCells.every(cell => cell.animationName === 'none' && !cell.running),
      `reduced-motion checker animated: ${JSON.stringify(allCells)}`);
    const durations = completion.shutters.map(value => Number.parseFloat(value) * (value.includes('ms') ? 1 : 1000));
    assert(durations.length === 2 && durations.every(duration => duration <= 5),
      `reduced-motion shutters were not instant: ${JSON.stringify(completion.shutters)}`);
    return { samples: observed.samples, completion, shutterDurationsMs: durations };
  }
  const readinessToLeavingMs = completion.at - observed.readinessAt;
  const completingToLeavingMs = observed.completingAt === null ? null : completion.at - observed.completingAt;
  assert(completion.filled === 40, `is-leaving began with ${completion.filled}/40 columns filled`);
  const stillRunning = completion.cells.filter(cell => cell.running);
  assert(!stillRunning.length, `checker animation was still running at is-leaving: ${stillRunning.length} cells; `
    + `first: ${JSON.stringify(stillRunning.slice(0, 3))}; completing->leaving `
    + `${observed.completingAt === null ? 'n/a' : Math.round(completion.at - observed.completingAt)} ms`);
  assert(readinessToLeavingMs <= 400, `readiness to is-leaving took ${readinessToLeavingMs}ms (max 400ms)`);
  if (completingToLeavingMs !== null) {
    assert(completingToLeavingMs <= 400, `is-completing to is-leaving took ${completingToLeavingMs}ms (max 400ms)`);
  }
  return { samples: observed.samples, completion, readinessToLeavingMs, completingToLeavingMs };
}

async function hubChecker(page, reduced) {
  await page.evaluate(() => {
    sessionStorage.clear();
    sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'hub', routeProgress: 0, theme: 'day' }));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#hub[data-readiness="ready"] .hub-start:not([disabled])'),
    { timeout: 150000 });
  const sample = () => page.evaluate(() => {
    const columns = [...document.querySelectorAll('.hub-start__checker .hub-start__checker-column')];
    const filled = columns.filter(column => column.classList.contains('is-filled'));
    return {
      columns: columns.length,
      filled: filled.length,
      running: filled.flatMap(column => [...column.querySelectorAll('i')])
        .some(cell => cell.getAnimations().some(animation => animation.playState === 'running')),
    };
  });
  const ready = await sample();
  await wait(1000);
  const stable = await sample();
  assert(ready.columns === 40 && ready.filled === 40, `Hub ready checker is ${ready.filled}/${ready.columns}`);
  assert(stable.filled === 40, `Hub checker regressed after 1s: ${stable.filled}/40`);
  if (reduced) assert(!ready.running && !stable.running, 'reduced-motion Hub checker has a running animation');
  return { ready, afterOneSecond: stable };
}

async function caseResult(name, fn) {
  try {
    const value = await fn();
    report.cases[name] = { pass: true, ...value };
    console.log(`PASS ${name}`);
  } catch (error) {
    report.cases[name] = { pass: false, failure: error.stack || error.message };
    console.log(`FAIL ${name}: ${error.message}`);
  }
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
  const reducedContext = await browser.createBrowserContext();
  const normalContext = await browser.createBrowserContext();
  try {
    const [reducedPage, normalPage] = await Promise.all([
      makePage(reducedContext, true), makePage(normalContext, false),
    ]);
    await caseResult('tour-cover-reduced-motion', () => tourCover(reducedPage, true));
    await caseResult('tour-cover-normal-motion', () => tourCover(normalPage, false));
    await caseResult('hub-start-race-checker', async () => ({
      normal: await hubChecker(normalPage, false),
      reduced: await hubChecker(reducedPage, true),
    }));
  } finally {
    await Promise.all([reducedContext.close(), normalContext.close()]);
  }
  assert(Object.values(report.cases).every(result => result.pass), 'one or more checker cases failed');
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
