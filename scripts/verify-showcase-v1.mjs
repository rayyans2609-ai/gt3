/** Focused S1 review, run after the manager commits this harness:
 * scripts/run-harness.sh -R p5-hub-redesign -T S1-showcase-v1 scripts/verify-showcase-v1.mjs
 * Owned Vite/provenance is supplied by the guarded executor. No external services. */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const url = process.env.GT3_URL;
if (!url) throw new Error('Run through scripts/run-harness.sh (GT3_URL is required).');
const dir = path.resolve('local/evidence/S1');
await fs.mkdir(dir, { recursive: true });
let browser;
const report = { pass: false, errors: [], samples: [], checks: {} };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, userDataDir: path.join(dir, 'chrome-profile'),
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.evaluateOnNewDocument(() => sessionStorage.clear());
  await page.goto(`${url}/?showcase=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__gt3?.showcase?.state().open && !window.__gt3.showcase.state().loading
    && document.documentElement.dataset.experience === 'showcase', { timeout: 120000 });
  const snap = () => page.evaluate(() => window.__gt3.showcase.state());
  const settled = async index => {
    await page.waitForFunction(index => {
      const current = window.__gt3.showcase.state();
      return current.index === index && !current.loading && !current.pending.length
        && !document.querySelector('.sc-loading.is-loading');
    }, { timeout: 90000 }, index);
    await pause(650); // capture only; product loading has no timer
    const state = await snap(); assert(!state.modelError, 'model load failed');
    assert(state.cache.length <= 3); assert(state.resources.peakResident <= 3);
    return state;
  };
  await settled(0);
  await page.screenshot({ path: path.join(dir, 'day-unlocked.png') });
  await page.evaluate(async () => (await import('/src/core/state.js')).set('theme', 'night'));
  await pause(1000);
  await page.screenshot({ path: path.join(dir, 'night-unlocked.png') });
  await page.evaluate(async () => (await import('/src/core/state.js')).set('theme', 'day'));
  await page.click('.sc-read'); await pause(450);
  assert((await snap()).detailsOpen);
  assert.equal(await page.$$eval('.sc-prose', nodes => nodes.length), 3);
  await page.screenshot({ path: path.join(dir, 'details-open.png') });
  await page.click('.sc-details__head button');
  await page.click('.sc-voice');
  await page.waitForFunction(() => window.__gt3audio.voice().playing, { timeout: 20000 });
  report.checks.voiceStarted = await page.evaluate(() => window.__gt3audio.voice());

  // Requested browse sequence: right x3, left x1. These slots are still locked.
  for (const [key, index] of [['ArrowRight', 1], ['ArrowRight', 2], ['ArrowRight', 3], ['ArrowLeft', 2]]) {
    await page.keyboard.press(key); await settled(index);
    assert.equal(await page.evaluate(() => window.__gt3audio.voice().index), -1, 'old voice survived a switch');
  }
  const locked = await page.evaluate(async () => {
    const cars = (await import('/src/data/cars.js')).CARS;
    const root = document.querySelector('#showcase');
    return { text: root.textContent, hasImage: Boolean(root.querySelector('img')), color: root.style.getPropertyValue('--car-color'),
      leaks: cars.filter(car => root.textContent.includes(car.displayName) || root.textContent.includes(car.manufacturer)).map(car => car.id),
      state: window.__gt3.showcase.state() };
  });
  assert.equal(locked.leaks.length, 0); assert(!locked.hasImage); assert.equal(locked.color, '');
  assert(!locked.state.modelVisible); assert(locked.state.locked);
  report.checks.locked = locked;
  await page.screenshot({ path: path.join(dir, 'locked.png') });

  // Fixture only: unlock the roster through existing state, never product/manual-unlock code.
  await page.evaluate(async () => {
    const { set } = await import('/src/core/state.js');
    set('unlocked', new Set(Array.from({ length: 10 }, (_, index) => index)));
  });
  await settled(2);
  // Return to slot 0, then measure 12 forward switches (including repeated cache windows).
  await page.keyboard.press('ArrowLeft'); await settled(1);
  await page.keyboard.press('ArrowLeft'); await settled(0);
  for (let switchIndex = 1; switchIndex <= 12; switchIndex++) {
    await page.keyboard.press('ArrowRight');
    const state = await settled(switchIndex % 10);
    const voice = await page.evaluate(() => window.__gt3audio.voice());
    assert(voice.index === -1 || voice.index === state.index, 'narration index differs from visible vehicle');
    report.samples.push({ switch: switchIndex, ...state, voice });
  }
  for (const [early, late] of [[0, 10], [1, 11]]) {
    const a = report.samples[early], b = report.samples[late];
    assert.equal(a.index, b.index);
    assert(b.memory.geometries <= a.memory.geometries + 4, 'geometry residency grew for the same cache window');
    assert(b.memory.textures <= a.memory.textures + 4, 'texture residency grew for the same cache window');
  }
  const last = report.samples.at(-1);
  assert(last.resources.evicted > 0 && last.resources.disposedGeometries > 0 && last.resources.disposedTextures > 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__gt3.showcase.state().open && document.documentElement.dataset.experience === 'hub');
  assert.equal(await page.evaluate(() => window.__gt3audio.voice().index), -1, 'voice survived leaving Showcase');
  report.checks.voiceStoppedOnLeave = true;
  assert.equal(report.errors.length, 0, `Console errors: ${report.errors.join('\n')}`);
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await fs.writeFile(path.join(dir, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
