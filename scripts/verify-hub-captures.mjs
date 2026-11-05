/**
 * Owner review package: Hub A/B stills and short, real-time screencasts.
 * Usage: node scripts/verify-hub-captures.mjs [base-url]
 * Requires Chrome and ffmpeg; this is intentionally run by the browser worker.
 */
import puppeteer from 'puppeteer-core';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const baseInput = process.env.GT3_URL || args.find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:5243/';
const chrome = process.env.GT3_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ffmpeg = process.env.GT3_FFMPEG || '/usr/local/bin/ffmpeg';
const root = path.resolve('docs/review/p5/ab');
const stillRoot = path.join(root, 'stills');
const clipRoot = path.join(root, 'clips');
const tempRoot = path.resolve('local/tmp', `gt3-hub-captures-${process.pid}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const manifest = { gitSha: null, note: 'headless Chrome screencast, Metal; timing approximate', files: [] };

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

function session(theme = 'day', experience = 'hub', overrides = {}) {
  return {
    theme, experience, routeProgress: 0, routeMapping: 'grid-v1', routeGridDistance: 0,
    unlocked: [0], masterMuted: true, masterVolume: 1, musicMuted: false, musicVolume: 1,
    engineVolume: 1, trackIndex: 0, trackPosition: 0, playIntent: false, showcaseCarIndex: 0,
    lapElapsedMs: 0, finishAcknowledged: false, ...overrides,
  };
}
function target(variant) {
  const url = new URL(baseInput); if (variant) url.searchParams.set('hub', variant); return url.href;
}
async function until(fn, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await sleep(100); }
  throw new Error(`${label} not met within ${timeout}ms`);
}
async function settle() { await sleep(1200); }
async function record(file, url, state, dimensions) {
  const info = await stat(file);
  manifest.files.push({ file: path.relative(root, file), pixels: dimensions, bytes: info.size, url, state });
}
async function captureStill(page, name, state, dimensions = '1440x900') {
  const file = path.join(stillRoot, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, captureBeyondViewport: false });
  await record(file, page.url(), state, dimensions);
}
async function open(browser, { variant, theme = 'day', experience = 'hub', seed = {}, viewport = { width: 1440, height: 900 } }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(value => sessionStorage.setItem('gt3.session.v1', JSON.stringify(value)), session(theme, experience, seed));
  await page.goto(target(variant), { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (experience === 'hub') {
    await until(() => page.evaluate(() => {
      const hub = document.querySelector('#hub');
      return hub?.classList.contains('is-interactive') && hub.dataset.hubState === 'race' && !hub.inert
        && ['ready', 'degraded'].includes(window.__gt3?.readiness?.status) && !document.querySelector('.hub-start')?.disabled;
    }), 'interactive, ready Hub');
    await sleep(1800); // the arrival reveal (circuit draw, START, title block / console) completes
  } else if (experience === 'tour') {
    // The Tour still must show the edge controls and the minimap, so wait for the route to be
    // ready and the loading cover to part, not just for the canvas.
    await until(() => page.evaluate(() => document.querySelector('.home-control') && document.querySelector('canvas')
      && ['ready', 'degraded'].includes(window.__gt3?.readiness?.status)
      && document.querySelector('.hud-route__marker')), 'Grand Tour ready');
    await sleep(2500);
  } else {
    await until(() => page.evaluate(() => document.querySelector('#landing') && !document.querySelector('#landing')?.hidden), 'Landing');
  }
  return { context, page };
}
async function close(opened) { await opened.context.close(); }
async function chooseTheme(page, theme) {
  const current = await page.evaluate(() => document.querySelector('#hub')?.dataset.theme);
  if (current !== theme) await page.evaluate(() => {
    // Drive the rendered theme control: A hosts native radios and hides the global pill.
    const group = [...document.querySelectorAll('[data-control="theme"]')].find(node => {
      const style = getComputedStyle(node);
      return style.visibility !== 'hidden' && style.pointerEvents !== 'none' && node.getClientRects().length > 0;
    });
    if (!group) throw new Error('no visible theme control');
    const radio = group.querySelector('[role="radio"][aria-checked="false"]') || group.querySelector('input[type="radio"]:not(:checked)');
    if (!radio) throw new Error('no inactive theme option');
    radio.click();
  });
  await until(() => page.evaluate(value => document.querySelector('#hub')?.dataset.theme === value, theme), `${theme} theme`);
}
async function hubState(page, state) {
  await until(() => page.evaluate(value => document.querySelector('#hub')?.dataset.hubState === value, state), `Hub ${state}`);
}
// Click a control at its rendered centre once it is actually hit-testable (reveals and Flip
// transitions move controls; Puppeteer's element click can land beside them).
async function clickRendered(page, selector) {
  const point = await page.waitForFunction(sel => {
    const el = [...document.querySelectorAll(sel)].find(node => node.getClientRects().length);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el.contains(hit) ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, { timeout: 15000, polling: 50 }, selector).then(h => h.jsonValue());
  await page.mouse.click(point.x, point.y);
}
async function expanded(page) {
  await clickRendered(page, '.hub-player__expand');
  await until(() => page.evaluate(() => document.querySelector('[data-hub-player]')?.dataset.hubPlayer === 'expanded'), 'expanded player');
}

async function stills(browser) {
  for (const variant of ['a', 'b']) for (const theme of ['day', 'night']) {
    let opened = await open(browser, { variant, theme });
    await settle(); await captureStill(opened.page, `${variant}-${theme}-race`, 'Hub race, player collapsed'); await close(opened);

    opened = await open(browser, { variant, theme }); await expanded(opened.page); await settle();
    await captureStill(opened.page, `${variant}-${theme}-race-expanded`, 'Hub race, track list open'); await close(opened);

    opened = await open(browser, { variant, theme, seed: { unlocked: [0, 2, 5] } });
    await opened.page.click('[data-control="cars"]'); await hubState(opened.page, 'cars');
    // data-checkpoint is the car index (contract): found car 2 is checkpoint 2, locked car 4 is 4.
    await opened.page.click('[data-checkpoint="2"]'); await opened.page.hover('[data-checkpoint="4"]'); await settle();
    await captureStill(opened.page, `${variant}-${theme}-cars`, 'Hub cars; unlocked 0,2,5; checkpoint 2 selected; checkpoint 4 hovered'); await close(opened);

    opened = await open(browser, { variant, theme }); await opened.page.click('[data-control="cover"]'); await hubState(opened.page, 'listening'); await settle();
    await captureStill(opened.page, `${variant}-${theme}-listening`, 'Hub listening'); await close(opened);
  }
  for (const variant of ['a', 'b']) {
    const opened = await open(browser, { variant, viewport: { width: 1280, height: 800 } }); await settle();
    await captureStill(opened.page, `${variant}-day-race-1280`, 'Hub race, player collapsed', '1280x800'); await close(opened);
  }
  for (const theme of ['day', 'night']) {
    let opened = await open(browser, { theme, experience: 'landing' }); await settle();
    await captureStill(opened.page, `landing-${theme}`, `Landing ${theme}`); await close(opened);
    opened = await open(browser, { theme, experience: 'tour', seed: { routeProgress: .48, routeGridDistance: 18, unlocked: [0, 1, 2, 3, 4] } }); await settle();
    await captureStill(opened.page, `tour-${theme}`, `Grand Tour midpoint ${theme}; edge controls and red minimap marker`); await close(opened);
  }
}

async function screencast(page, action) {
  const client = await page.target().createCDPSession();
  const dir = path.join(tempRoot, `frames-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  const frames = []; let pending = Promise.resolve();
  client.on('Page.screencastFrame', event => {
    const index = frames.length; const file = path.join(dir, `${String(index).padStart(6, '0')}.jpg`);
    frames.push({ file, timestamp: event.metadata.timestamp });
    pending = pending.then(() => writeFile(file, Buffer.from(event.data, 'base64')));
    client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  try { await action(); await sleep(250); } finally { await client.send('Page.stopScreencast').catch(() => {}); await pending; await client.detach().catch(() => {}); }
  if (frames.length < 2) throw new Error('screencast produced fewer than two frames');
  return { dir, frames };
}
async function encode(cast, output) {
  const durations = cast.frames.map((frame, index) => Math.max(.001, Math.min(1, (cast.frames[index + 1]?.timestamp ?? frame.timestamp + 1 / 30) - frame.timestamp)));
  const list = cast.frames.map((frame, index) => `file '${frame.file.replace(/'/g, "'\\''")}'\nduration ${durations[index].toFixed(6)}`).join('\n');
  const concat = path.join(cast.dir, 'frames.txt'); await writeFile(concat, `${list}\nfile '${cast.frames.at(-1).file.replace(/'/g, "'\\''")}'\n`);
  let crf = 28;
  for (;;) {
    const result = spawnSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concat, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.slice(-1000)}`);
    if ((await stat(output)).size <= 1_500_000 || crf >= 40) break;
    crf += 3;
  }
  const info = await stat(output);
  if (info.size > 1_500_000) throw new Error(`${path.basename(output)} remains over 1.5 MB at CRF ${crf}`);
  await record(output, baseInput, 'motion clip', '1280x800 (scaled)');
}
async function clip(browser, name, setup, action) {
  const opened = await open(browser, setup); let cast;
  try { cast = await screencast(opened.page, () => action(opened.page)); await encode(cast, path.join(clipRoot, `${name}.mp4`)); }
  finally { await close(opened); if (cast) await rm(cast.dir, { recursive: true, force: true }); }
}
async function clips(browser) {
  for (const variant of ['a', 'b']) {
    await clip(browser, `${variant}-launch-home`, { variant, theme: 'day' }, async page => {
      await page.hover('[data-control="start"]'); await sleep(1500); await clickStart(page);
      await until(() => page.evaluate(async () => { const { state } = await import('/src/core/state.js'); return state.experience === 'tour' && !state.transition && !state.scrollLocked; }), 'Tour after launch', 35000);
      await page.click('.home-control'); await hubState(page, 'race'); await settle();
    });
    await clip(browser, `${variant}-states`, { variant, theme: 'night', seed: { unlocked: [0, 2, 5] } }, async page => {
      await page.click('[data-control="cars"]'); await hubState(page, 'cars'); await page.hover('[data-checkpoint="2"]'); await page.click('[data-checkpoint="2"]'); await sleep(500);
      await page.click('[data-control="cars"]'); await hubState(page, 'race'); await expanded(page); await sleep(400); await page.click('[data-control="cover"]'); await hubState(page, 'listening'); await sleep(500); await page.keyboard.press('Escape'); await hubState(page, 'race'); await sleep(500);
    });
    await clip(browser, `${variant}-theme`, { variant, theme: 'day' }, async page => {
      await chooseTheme(page, 'night'); await sleep(700); await chooseTheme(page, 'day'); await sleep(700);
    });
  }
  await clip(browser, 'landing-drag-scroll', { theme: 'day', experience: 'landing' }, async page => {
    const canvas = await page.$('canvas'); if (!canvas) throw new Error('Landing canvas missing');
    const box = await canvas.boundingBox(); if (!box) throw new Error('Landing canvas has no bounds');
    await page.mouse.move(box.x + box.width * .55, box.y + box.height * .52); await page.mouse.down(); await page.mouse.move(box.x + box.width * .25, box.y + box.height * .52, { steps: 18 }); await page.mouse.move(box.x + box.width * .78, box.y + box.height * .52, { steps: 24 }); await page.mouse.up();
    await page.mouse.wheel({ deltaY: 1600 }); await until(() => page.evaluate(() => document.querySelector('#hub')?.classList.contains('is-interactive')), 'Hub after Landing scroll'); await sleep(600);
  });
}

let browser;
try {
  await mkdir(stillRoot, { recursive: true }); await mkdir(clipRoot, { recursive: true }); await mkdir(tempRoot, { recursive: true });
  manifest.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${path.join(tempRoot, 'chrome')}`], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
  await stills(browser); await clips(browser);
  if (manifest.files.length !== 29) throw new Error(`expected 29 review files, produced ${manifest.files.length}`);
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Hub captures complete: ${manifest.files.filter(item => item.file.endsWith('.jpg')).length} stills, ${manifest.files.filter(item => item.file.endsWith('.mp4')).length} clips`);
} catch (error) {
  console.error(error.stack || error); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
