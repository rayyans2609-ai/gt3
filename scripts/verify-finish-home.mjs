#!/usr/bin/env node
/**
 * verify-finish-home.mjs — Finish -> Home and Finish -> Replay (Phase 5 bug fix).
 * Boots into the finished Tour (saved routeProgress 1), then clicks the real Home control and,
 * in a second page, the real Replay control. Run behind scripts/with-verification-server.sh.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const url = process.env.GT3_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { pass: false, cases: {} };
let browser;
async function finished(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'complete', routeProgress: 1, theme: 'day' }));
  });
  await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 150000 });
  await page.waitForFunction(() => document.querySelector('#finish-screen.is-visible'), { timeout: 30000 });
  await sleep(1500);
  return { ctx, page, errors };
}
const snap = (page) => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const home = document.querySelector('.home-control');
  const r = home.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { experience: state.experience, mode: state.mode, transition: state.transition, locked: state.scrollLocked,
    progress: state.progress, hubHidden: document.getElementById('hub').hidden,
    finishVisible: !!document.querySelector('#finish-screen.is-visible'),
    homeReachable: top === home || home.contains(top), homeCoveredBy: top?.id || top?.className };
});
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${path.resolve('local/tmp', `gt3-finishhome-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  // Finish -> Home
  {
    const { ctx, page, errors } = await finished(browser);
    const before = await snap(page);
    await page.click('.home-control');
    await page.waitForFunction(async () => (await import('/src/core/state.js')).state.experience === 'hub', { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    const after = await snap(page);
    const ok = after.experience === 'hub' && !after.hubHidden && !after.finishVisible && !after.transition;
    report.cases.finishToHome = { before, after, errors, pass: ok };
    // Hub -> START RACE again: finished state restored, finish card back, no deadlock
    if (ok) {
      await page.waitForFunction(() => document.querySelector('#hub.is-interactive'), { timeout: 15000 });
      await page.click('.hub-start');
      await sleep(4500);
      const back = await snap(page);
      report.cases.finishToHome.reenter = back;
      report.cases.finishToHome.reenterRestoresFinish = back.finishVisible && back.progress > 0.99;
    }
    await ctx.close();
  }
  // Finish -> Replay
  {
    const { ctx, page, errors } = await finished(browser);
    const replay = await page.$('.finish-replay');
    await replay.click();
    await sleep(2500);
    const after = await snap(page);
    const ok = after.experience === 'tour' && after.mode === 'race' && !after.finishVisible && after.progress < 0.02;
    report.cases.finishToReplay = { after, errors, pass: ok };
    await ctx.close();
  }
  report.pass = report.cases.finishToHome.pass && report.cases.finishToReplay.pass;
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.pass ? 0 : 1;
} catch (e) {
  report.error = String(e?.stack || e); console.log(JSON.stringify(report, null, 1)); process.exitCode = 1;
} finally { await browser?.close(); }
