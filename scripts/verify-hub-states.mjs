/**
 * Phase 5 Hub state harness. It deliberately seeds a restored Hub session so
 * the checks do not consume Tour input or create audio as a side-effect.
 * Usage: node scripts/verify-hub-states.mjs [base-url] [--hub=a|b]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const requested = process.argv.find(arg => arg.startsWith('--hub='))?.slice(6);
if (requested && !['a', 'b'].includes(requested)) throw new Error('Expected --hub=a or --hub=b');
const baseInput = process.env.GT3_URL || process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:5243';
const variants = requested ? [requested] : ['a', 'b'];
const themes = ['day', 'night'];
const report = { startedAt: new Date().toISOString(), base: baseInput, cases: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (fn, label, timeout = 30000) => {
  const untilAt = Date.now() + timeout; let value;
  while (Date.now() < untilAt) { value = await fn(); if (value) return value; await wait(100); }
  throw new Error(`${label} not met within ${timeout}ms; last=${JSON.stringify(value)}`);
};
const assert = (value, message) => { if (!value) throw new Error(message); };
const session = theme => ({
  theme, experience: 'hub', routeProgress: 0, routeMapping: 'grid-v1', routeGridDistance: 0,
  unlocked: [0, 2, 5], masterMuted: true, masterVolume: 1, musicMuted: false, musicVolume: 1,
  engineVolume: 1, trackIndex: 0, trackPosition: 0, playIntent: false, showcaseCarIndex: 0,
  lapElapsedMs: 0, finishAcknowledged: false,
});
function target(base, variant) { const url = new URL(base); url.searchParams.set('hub', variant); return url.href; }
async function seedAndOpen(browser, variant, theme) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(value => sessionStorage.setItem('gt3.session.v1', JSON.stringify(value)), session(theme));
  await page.goto(target(baseInput, variant), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await until(() => page.evaluate(() => {
    const hub = document.getElementById('hub'); return hub && !hub.hidden && hub.dataset.hubState === 'race' && !hub.inert;
  }), 'Hub race state', 60000);
  return page;
}
async function noOverlap(page, state) {
  const collisions = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#hub [data-control], #hub [data-track]')]
      .filter(node => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 4 && box.height > 4; });
    const bad = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].getBoundingClientRect(), b = nodes[j].getBoundingClientRect();
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (overlap > 12 && !nodes[i].contains(nodes[j]) && !nodes[j].contains(nodes[i])) bad.push([nodes[i].dataset.control || nodes[i].dataset.track, nodes[j].dataset.control || nodes[j].dataset.track]);
    }
    return bad;
  });
  assert(!collisions.length, `${state}: overlapping controls ${JSON.stringify(collisions)}`);
}
async function runCase(browser, variant, theme) {
  const page = await seedAndOpen(browser, variant, theme);
  try {
    const observed = await page.evaluate(() => ({
      root: document.getElementById('hub')?.dataset.hubState,
      marker: !!document.querySelector('[data-hub-marker]'), markerProgress: document.querySelector('[data-hub-marker]')?.dataset.progress,
      debug: window.__gt3?.hub?.debug?.(),
    }));
    assert(observed.root === 'race', `expected race, got ${observed.root}`); assert(observed.marker, 'route marker missing at progress 0');
    await noOverlap(page, 'race');

    await page.click('[data-control="cars"]');
    await until(() => page.evaluate(() => document.getElementById('hub')?.dataset.hubState === 'cars'), 'cars state');
    const checkpoints = await page.evaluate(() => [...document.querySelectorAll('[data-checkpoint]')].map(node => ({
      id: Number(node.dataset.checkpoint), found: node.dataset.found, text: node.textContent, aria: node.getAttribute('aria-label'), html: node.outerHTML,
    })));
    assert(checkpoints.length === 9, `expected 9 checkpoints, got ${checkpoints.length}`);
    const found = checkpoints.filter(item => item.found === 'true').map(item => item.id - 1).sort((a, b) => a - b);
    assert(JSON.stringify(found) === JSON.stringify([0, 2, 5]), `seeded discovery mismatch: ${JSON.stringify(found)}`);
    checkpoints.filter(item => item.found === 'false').forEach(item => assert(!/lexus|nissan|audi|bmw|mercedes|ferrari|mclaren|aston|lamborghini|porsche/i.test(item.html), `locked checkpoint ${item.id} exposes a car name`));
    await page.hover('[data-checkpoint="1"]'); await page.click('[data-checkpoint="1"]'); await noOverlap(page, 'cars');
    await page.click('[data-control="showcase"]');
    const showcase = await page.evaluate(async () => { const { state } = await import('/src/core/state.js'); return { text: document.querySelector('[data-showcase-status]')?.textContent, experience: state.experience }; });
    assert(showcase.text === 'Showcase opens in the next build.', `Showcase status wrong: ${showcase.text}`); assert(showcase.experience === 'hub', 'Showcase navigated away from Hub');

    await page.click('[data-control="cars"]'); await until(() => page.evaluate(() => document.getElementById('hub')?.dataset.hubState === 'race'), 'race return');
    const muteBefore = await page.evaluate(async () => { const { state } = await import('/src/core/state.js'); return { master: state.masterMuted, music: state.musicMuted }; });
    const master = await page.$('[data-control="master-mute"]'); assert(master, 'collapsed master mute missing'); await master.click();
    const muteAfter = await page.evaluate(async () => { const { state } = await import('/src/core/state.js'); return { master: state.masterMuted, music: state.musicMuted }; });
    assert(muteAfter.music === muteBefore.music, 'master mute changed music mute');
    assert(muteAfter.master !== muteBefore.master, 'master click did not change state');
    await page.click('.hub-player__expand'); await until(() => page.evaluate(() => document.querySelector('[data-hub-player]')?.dataset.hubPlayer === 'expanded'), 'expanded player');
    const tracks = await page.evaluate(() => [...document.querySelectorAll('[data-track]')].map(node => node.textContent.trim()));
    assert(JSON.stringify(tracks) === JSON.stringify(['track_1', 'track_2', 'track_3', 'track_4', 'track_5', 'track_6']), `track list wrong: ${JSON.stringify(tracks)}`);
    assert(await page.$('[data-control="levels"]'), 'Levels disclosure missing'); await noOverlap(page, 'expanded');
    await page.click('[data-control="cover"]'); await until(() => page.evaluate(() => document.getElementById('hub')?.dataset.hubState === 'listening' && !!document.querySelector('[data-hub-player="listening"]')), 'listening player');
    await noOverlap(page, 'listening'); await page.keyboard.press('Escape'); await until(() => page.evaluate(() => document.getElementById('hub')?.dataset.hubState === 'race'), 'Escape return');
    const beforeTheme = await page.evaluate(async () => (await import('/src/core/state.js')).state.theme);
    await page.click('[data-control="theme"] [role="radio"][aria-checked="false"]');
    const afterTheme = await page.evaluate(async () => { const { state } = await import('/src/core/state.js'); return { theme: state.theme, rootTheme: document.getElementById('hub')?.dataset.theme }; });
    assert(afterTheme.theme !== beforeTheme, 'theme did not flip');
    return { variant, theme, observed, checkpoints: checkpoints.length, themeAfter: afterTheme.theme };
  } finally { await page.close().catch(() => {}); }
}

let browser;
try {
  mkdirSync(path.resolve('local/evidence/p5ab/states'), { recursive: true });
  browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${path.resolve('local/tmp', `gt3-hub-states-${process.pid}`)}`], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
  for (const variant of variants) for (const theme of themes) {
    const entry = { variant, theme, pass: true }; report.cases.push(entry);
    try { Object.assign(entry, await runCase(browser, variant, theme)); } catch (error) { entry.pass = false; entry.failure = String(error?.message ?? error); }
  }
  report.pass = report.cases.every(item => item.pass);
} catch (error) { report.pass = false; report.failure = String(error?.message ?? error); }
finally {
  await browser?.close().catch(() => {});
  const out = path.resolve('local/evidence/p5ab/states', `verify-hub-states-${Date.now()}.json`);
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ pass: report.pass, out }, null, 2)); process.exitCode = report.pass ? 0 : 1;
}
