#!/usr/bin/env node
/**
 * verify-motion-ticker.mjs — proves GSAP runs only inside GT3's one RAF loop (src/ui/motion.js).
 * Wraps requestAnimationFrame before any module loads, drives GSAP-heavy Hub interactions, and
 * requires: no frame requested by GSAP's own ticker (`_tick`, dev build), GSAP still advancing
 * (motion ticks grow, the lap light and Flip recomposition actually move), and suppressed wakes.
 * Run behind scripts/with-verification-server.sh (reads GT3_URL). Exit 1 on failure.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const url = process.env.GT3_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { pass: false, checks: {} };
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${path.resolve('local/tmp', `gt3-motion-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'hub', theme: 'day' }));
    const raf = window.requestAnimationFrame.bind(window);
    const counts = window.__rafCounts = { total: 0, byName: {} };
    window.requestAnimationFrame = (fn) => {
      counts.total += 1;
      const name = fn?.name || '(anonymous)';
      counts.byName[name] = (counts.byName[name] || 0) + 1;
      if (/^_tick\d*$/.test(name)) (counts.gsapAt ||= []).push(Math.round(performance.now()));
      if (!counts.stacks?.[name]) (counts.stacks ||= {})[name] = (new Error().stack || '').split('\n').slice(2, 6).join(' | ');
      // Count callbacks that actually run: a requested-then-cancelled frame is not a loop.
      return raf((t) => {
        if (/^_tick\d*$/.test(name)) counts.gsapRan = (counts.gsapRan || 0) + 1;
        return fn(t);
      });
    };
  });
  await page.goto(`${url}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#hub.is-interactive')
    && ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 150000 });
  await sleep(2500);
  const before = await page.evaluate(() => ({
    raf: JSON.parse(JSON.stringify(window.__rafCounts)), motion: { ...window.__gt3.motion.stats },
  }));
  await page.hover('.hub-start');
  await sleep(1200);
  const lapMid = await page.evaluate(() => getComputedStyle(document.querySelector('.hub-plan__lap')).strokeDasharray);
  await page.mouse.move(700, 40);
  await page.click('.hub-player__list-toggle');
  await sleep(900);
  const flipped = await page.evaluate(() => document.querySelector('.hub-player__cover').getBoundingClientRect().width);
  await page.click('.hub-cars__toggle');
  await sleep(900);
  const labelOpacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.hub-plan__car')).opacity));
  const after = await page.evaluate(() => ({
    raf: JSON.parse(JSON.stringify(window.__rafCounts)), motion: { ...window.__gt3.motion.stats },
  }));
  const gsapCount = (r) => Object.entries(r.byName).filter(([n]) => /^_tick\d*$/.test(n)).reduce((a, [, c]) => a + c, 0);
  const gsapFrames = gsapCount(after.raf) - gsapCount(before.raf);
  const installedAt = await page.evaluate(() => window.__gt3.motion.installedAt);
  report.checks = {
    gsapOwnFramesDuringInteraction: gsapFrames,
    gsapOwnFramesTotal: gsapCount(after.raf),
    gsapFrameTimes: after.raf.gsapAt || [],
    motionInstalledAt: installedAt,
    callerStacks: after.raf.stacks,
    motionTicks: after.motion.ticks - before.motion.ticks,
    suppressedWakes: after.motion.wakeRequests,
    lapDasharrayDuringHover: lapMid,
    coverWidthAfterFlip: flipped,
    carLabelOpacity: labelOpacity,
    rafNames: after.raf.byName,
  };
  const lateGsap = (after.raf.gsapAt || []).filter((t) => t > installedAt + 34);
  report.checks.gsapFramesAfterInstall = lateGsap.length;
  report.checks.gsapCallbacksRun = after.raf.gsapRan || 0;
  const ok = gsapFrames === 0 && lateGsap.length === 0 && report.checks.gsapCallbacksRun === 0
    && report.checks.motionTicks > 60
    && report.checks.suppressedWakes > 0
    && lapMid && lapMid !== 'none'
    && Math.abs(flipped - 56) < 1
    && labelOpacity > 0.9;
  report.pass = ok;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  report.error = String(error?.stack || error);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
