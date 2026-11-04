/** Landing drag regression. Run against an owned dev server:
 * node scripts/verify-landing-drag.mjs [base-url] (GT3_URL wins).
 * Browser execution belongs to the manager; this worker only authors the harness.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const base = process.env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5243';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { base, cases: {}, errors: [] };
const pose = page => page.evaluate(() => window.__gt3.landing.pose());
const angle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
async function until(fn, label, cap = 30000) {
  const start = Date.now();
  while (Date.now() - start < cap) {
    if (await fn()) return;
    await wait(50);
  }
  throw new Error(label + ' timed out');
}
async function rest(page) {
  await page.evaluate(() => window.__gt3.landing.seek(0));
  await page.mouse.move(720, 578);
  await wait(800);
}
async function dragHero(page, { release = true } = {}) {
  await page.mouse.move(620, 578);
  await wait(100);
  const before = await pose(page);
  await page.mouse.down();
  assert.equal((await pose(page)).dragging, true, 'hero press starts drag');
  let peak = 0, maxPitch = 0;
  // Slow enough to span RAFs, with a large vertical excursion to exercise the pitch clamp.
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(620 + i * 12, 578 - i * 16);
    await wait(20);
    const p = await pose(page);
    peak = Math.max(peak, p.angularVelocity);
    maxPitch = Math.max(maxPitch, Math.abs(p.pitch));
    assert.ok(p.angularVelocity <= p.velocityCap + 1e-6, 'angular speed capped');
    assert.ok(Math.abs(p.pitch) <= p.pitchLimit + 1e-6, 'pitch clamped');
  }
  const after = await pose(page);
  assert.ok(Math.abs(angle(after.yaw, before.yaw)) > 0.15, 'drag changes yaw');
  if (release) await page.mouse.up();
  return { before, after, peak, maxPitch };
}
async function wheelTo(page, deltaY, predicate, label) {
  for (let i = 0; i < 45; i++) {
    await page.mouse.wheel({ deltaY });
    await wait(70);
    if (predicate(await pose(page))) return;
  }
  throw new Error(label + ' did not advance');
}
let browser;
try {
  mkdirSync(path.resolve('local/tmp'), { recursive: true });
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      '--user-data-dir=' + path.resolve('local/tmp', 'gt3-landing-drag-' + process.pid)],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on('pageerror', e => report.errors.push(String(e.message ?? e)));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await until(() => page.evaluate(() => !!window.__gt3?.landing?.pose && window.__gt3.landing.loaded()), 'hero/pose ready');
  await rest(page);

  const dragged = await dragHero(page);
  const releaseAt = Date.now();
  await until(async () => (await pose(page)).angularVelocity < 0.01, 'release damping', 1500);
  report.cases.drag = { ...dragged, settled: await pose(page), decayMs: Date.now() - releaseAt };
  assert.equal(report.cases.drag.settled.dragging, false);

  for (const selector of ['.audio-speaker', '.theme-segmented__option[aria-checked="true"]']) {
    const control = await page.$(selector);
    assert.ok(control, 'control exists: ' + selector);
    const box = await control.boundingBox();
    assert.ok(box, 'control visible: ' + selector);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await pose(page);
    await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2);
    assert.equal(pressed.dragging, false, selector + ' never starts drag');
    assert.equal((await pose(page)).dragging, false);
    await page.mouse.up();
    report.cases[selector] = { dragging: pressed.dragging };
  }

  await page.mouse.move(720, 578);
  await wheelTo(page, 300, p => p.progress >= 0.999, 'wheel to Hub');
  const hub = await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    return { experience: state.experience, landingT: state.landingT, tourProgress: state.progress };
  });
  assert.equal(hub.experience, 'hub');
  assert.ok(hub.landingT >= 0.99);
  assert.equal(hub.tourProgress, 0);
  await wheelTo(page, -300, p => p.progress <= 0.001, 'wheel reverse');
  await until(() => page.evaluate(async () => (await import('/src/core/state.js')).state.experience === 'landing'), 'Landing return');
  report.cases.wheel = { hub, returned: await pose(page) };

  // Same progress and pointer, with no inspection gesture during the baseline pass.
  await page.evaluate(() => window.__gt3.landing.seek(0.92));
  await wait(200);
  const baseline = await pose(page);
  await rest(page);
  await dragHero(page, { release: false });
  await wheelTo(page, 200, p => p.progress >= 0.9, 'drag then scroll');
  const scrolled = await pose(page);
  assert.equal(scrolled.dragging, false, 'scroll cancels captured drag');
  await page.mouse.up();
  // New presses during transition are ignored, even at the original hero coordinates.
  await page.mouse.move(720, 578);
  await page.mouse.down();
  assert.equal((await pose(page)).dragging, false, 'transition blocks new drag');
  await page.mouse.up();
  await page.evaluate(() => window.__gt3.landing.seek(0.92));
  await wait(200);
  const inspected = await pose(page);
  assert.ok(Math.abs(angle(inspected.yaw, baseline.yaw)) < 0.001, 'push yaw matches baseline');
  assert.ok(Math.abs(inspected.pitch - baseline.pitch) < 0.001, 'push pitch matches baseline');
  assert.ok(inspected.angularVelocity < 0.001, 'push has no inspection momentum');
  report.cases.push = { baseline, scrolled, inspected };
  assert.equal(report.errors.length, 0, 'no page errors');
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = String(error?.stack ?? error);
} finally {
  await browser?.close().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
