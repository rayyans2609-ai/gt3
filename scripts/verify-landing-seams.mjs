/** Targeted Phase 4 handoff faults, keyboard gating and renderer restoration.
 * Run through with-verification-server.sh, after the host browser preflight.
 * One Chrome/Metal session; profiles run sequentially. GT3_OUT optionally saves JSON.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.GT3_URL || 'http://127.0.0.1:5250';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { base, profiles: {}, pass: false };
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, protocolTimeout: 180000,
  args: ['--enable-gpu', '--use-angle=metal', '--no-first-run'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const snapshot = page => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const { isDriveDormant } = await import('/src/scroll/scrollDrive.js');
  const { renderer: r } = window.__gt3;
  const hub = document.querySelector('#hub');
  return { world: document.documentElement.dataset.world, experience: state.experience,
    transition: state.transition, dormant: isDriveDormant(), locked: state.scrollLocked,
    progress: state.progress, mode: state.mode, hubHidden: hub.hidden, inert: hub.inert,
    session: JSON.parse(sessionStorage.getItem('gt3.session.v1') || '{}'),
    renderer: { dpr: r.getPixelRatio(), size: r.getSize({ set: (x, y) => [x, y] }),
      viewport: r.getViewport({ copy: v => v.toArray() }), scissor: r.getScissor({ copy: v => v.toArray() }),
      scissorTest: r.getScissorTest(), exposure: r.toneMappingExposure,
      target: r.getRenderTarget()?.texture.name ?? null, toneMapping: r.toneMapping,
      outputColorSpace: r.outputColorSpace, transform: r.domElement.style.transform,
      clipPath: r.domElement.style.clipPath, memory: { ...r.info.memory } } };
});
async function settled(page, experience) {
  await page.waitForFunction(async expected => {
    const { state } = await import('/src/core/state.js');
    return state.experience === expected && !state.transition;
  }, { timeout: 5000 }, experience);
  await wait(300);
  return snapshot(page);
}
async function reachHub(page) {
  await page.evaluate(() => window.__gt3.landing.seek(1));
  return settled(page, 'hub');
}
function atHub(s) {
  assert.equal(s.world, 'landing'); assert.equal(s.experience, 'hub');
  assert.equal(s.transition, null); assert.equal(s.dormant, true);
  assert.equal(s.hubHidden, false); assert.equal(s.inert, false);
}
function atTour(s) {
  assert.equal(s.world, 'tour'); assert.equal(s.experience, 'tour');
  assert.equal(s.transition, null); assert.equal(s.dormant, false);
  assert.equal(s.hubHidden, true); assert.equal(s.inert, true);
}
async function resizeFault(page, action) {
  return page.evaluate(async actionName => {
    const r = window.__gt3.renderer, original = r.setPixelRatio;
    r.setPixelRatio = function () {
      r.setPixelRatio = original;
      throw new Error('W1 injected resize failure');
    };
    await window.__gt3[actionName]();
  }, action);
}

try {
  for (const [profile, query, dpr] of [['locked', '', 1], ['unlocked', '?version=unlocked', 2]]) {
    const result = report.profiles[profile] = { errors: [] };
    const page = await browser.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !/favicon|W1 injected|entry failed|return failed/.test(message.text()))
        result.errors.push(message.text());
    });
    try {
      await page.goto(base + query, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gt3?.landing?.loaded()
        && ['ready', 'degraded'].includes(window.__gt3.readiness.status), { timeout: 90000 });

      // Scroll keys remain native on Landing. A nearly visible Hub must not take focus.
      const start = await snapshot(page);
      await page.keyboard.press('PageDown'); await wait(500);
      const scrolled = await page.evaluate(() => window.__gt3.landing.progress());
      assert(scrolled > 0); assert.equal((await snapshot(page)).progress, start.progress);
      await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await wait(500);
      assert((await page.evaluate(() => window.__gt3.landing.progress())) > scrolled);
      await page.evaluate(() => window.__gt3.landing.seek(.97)); await wait(500);
      result.preHubFocusBlocked = await page.evaluate(() => {
        const button = document.querySelector('.hub-start'); button.focus();
        return document.activeElement !== button && document.querySelector('#hub').inert;
      });
      assert.equal(result.preHubFocusBlocked, true);
      await reachHub(page);

      // A one-shot renderer failure must return to a usable Hub and permit retry.
      await resizeFault(page, 'enterTour');
      result.entryRecovery = await settled(page, 'hub'); atHub(result.entryRecovery);

      // Withhold anonymous rAF callbacks (the handoff paints) while leaving the main frame
      // running. This isolates hidden-tab suspension without poisoning the renderer loop.
      const began = Date.now();
      await page.evaluate(() => {
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => callback.name === 'frame' ? raf(callback) : 0;
        window.__restoreRaf = () => { window.requestAnimationFrame = raf; };
        void window.__gt3.enterTour();
      });
      result.noRafEntry = await settled(page, 'tour');
      result.noRafEntryMs = Date.now() - began;
      await page.evaluate(() => window.__restoreRaf());
      atTour(result.noRafEntry); assert.equal(result.noRafEntry.renderer.dpr, dpr);

      // A Landing render failure must restore exposure and an existing offscreen target.
      result.renderRestore = await page.evaluate(async () => {
        const landing = await import('/src/landing/landing.js');
        const r = window.__gt3.renderer, original = r.render;
        const target = window.__gt3.composer.readBuffer.clone(), exposure = r.toneMappingExposure;
        target.setSize(8, 8);
        landing.activateLanding(); landing.seekLanding(0);
        r.setRenderTarget(target);
        let caught = false, restored;
        try {
          r.render = () => { throw new Error('W1 injected render failure'); };
          try { landing.renderLanding(); } catch { caught = true; }
          restored = r.getRenderTarget() === target && r.toneMappingExposure === exposure;
        } finally {
          r.render = original; r.setRenderTarget(null); target.dispose();
          landing.deactivateLanding(); window.__gt3.resizeScene(innerWidth, innerHeight);
        }
        return { caught, restored };
      });
      assert.deepEqual(result.renderRestore, { caught: true, restored: true });
      const reference = (await snapshot(page)).renderer;

      await resizeFault(page, 'leaveTour');
      result.returnRecovery = await settled(page, 'tour'); atTour(result.returnRecovery);
      assert.equal(result.returnRecovery.locked, false);
      await page.evaluate(() => window.__gt3.leaveTour()); atHub(await settled(page, 'hub'));

      // Real keyboard focus/activation, handoff keys, then a second entry by Space.
      await page.focus('.hub-start'); await page.keyboard.press('Enter');
      for (const key of ['PageDown', 'Space', 'ArrowDown']) await page.keyboard.press(key);
      result.keyboardEntry = await settled(page, 'tour'); atTour(result.keyboardEntry);
      assert.equal(result.keyboardEntry.progress, 0);
      const { memory, ...restored } = result.keyboardEntry.renderer;
      const { memory: beforeMemory, ...expected } = reference;
      assert.deepEqual(restored, expected);
      await page.evaluate(() => window.__gt3.leaveTour()); await settled(page, 'hub');
      await page.focus('.hub-start'); await page.keyboard.press('Space');
      atTour(await settled(page, 'tour'));

      // Refresh during the cover restores its originating experience/route. A completed
      // home return restores Hub; repeated lazy reuse must retain one home control.
      await page.evaluate(async () => {
        const { seekTo } = await import('/src/scroll/scrollDrive.js'); seekTo(.2, { instant: true });
        void window.__gt3.leaveTour();
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 90000 });
      const refreshed = await settled(page, 'tour'); atTour(refreshed);
      assert(Math.abs(refreshed.progress - .2) < 1e-6);
      await page.evaluate(() => window.__gt3.leaveTour()); atHub(await settled(page, 'hub'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__gt3?.landing?.active(), { timeout: 30000 });
      result.hubRefresh = await settled(page, 'hub'); atHub(result.hubRefresh);
      await page.waitForFunction(() => ['ready', 'degraded'].includes(window.__gt3?.readiness?.status), { timeout: 90000 });

      // Resize at the resting Hub and inside Landing, then restore the Tour's profile.
      await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 2 }); await wait(250);
      assert.deepEqual((await snapshot(page)).renderer.size, [1100, 720]);
      await page.evaluate(() => window.__gt3.landing.seek(.5)); await wait(300);
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 }); await wait(250);
      assert.deepEqual((await snapshot(page)).renderer.viewport, [0, 0, 1280, 800]);
      await reachHub(page); await page.evaluate(() => window.__gt3.enterTour());
      const resized = await settled(page, 'tour'); atTour(resized);
      assert.equal(resized.renderer.dpr, dpr);
      assert.deepEqual(resized.renderer.size, [1280, 800]);
      result.homeControls = await page.$$eval('.home-control', nodes => nodes.length);
      assert.equal(result.homeControls, 1);
      assert.deepEqual(result.errors, []);
      result.pass = true;
    } finally { await page.close(); }
  }
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
} finally {
  await browser.close();
  if (process.env.GT3_OUT) fs.writeFileSync(process.env.GT3_OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
