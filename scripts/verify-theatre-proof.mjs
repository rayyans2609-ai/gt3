/** Theatre.js authoring proof harness (ARCHITECTURE.md "Animation authoring"). DEV server only.
 * Cases, each reported with its observed values:
 *   file-format          (node) versioned wrapper accepts v1, rejects bad format/version/id/state
 *   plain-boot-clean     without ?theatre: no Theatre global, no Studio DOM, no Theatre network request
 *   studio-opens         ?theatre: Studio root mounts, proof sheet+probe exist, probe is off-scene
 *   edit-applies-in-loop a Studio transaction reaches the probe, and Theatre ticks from GT3's frame loop
 *   input-shield         wheel/keys inside Studio never reach GT3's window listeners; outside they do
 *   no-local-storage     no Theatre key is written to localStorage or sessionStorage by editing
 *   save-roundtrip       POST saves a versioned file; wrong header/version are refused; file is cleaned up
 *   play-from-json       ?theatre=play replays the committed timeline with no Studio loaded
 *   console-clean        no console errors or page errors in any page
 * Usage: node scripts/verify-theatre-proof.mjs [base-url]   (GT3_URL env wins; default 127.0.0.1:5173)
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { TIMELINE_FORMAT, TIMELINE_VERSION, timelineFileName, unwrapTimeline, wrapTimeline } from '../src/authoring/timelineFile.js';

const base = process.env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isNoise = (text) => /favicon/i.test(text) || (/fog/i.test(text) && /MeshDepthMaterial/i.test(text));
const rawErrors = [];
const requests = [];
const report = { base, cases: {} };
const TMP_ID = 'gt3-verify-tmp';
const TMP_FILE = path.resolve('src/authoring/timelines', timelineFileName(TMP_ID));

async function openPage(browser, query, tag) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => rawErrors.push({ at: tag, type: 'pageerror', text: String(e?.message ?? e) }));
  page.on('console', (m) => { if (m.type() === 'error') rawErrors.push({ at: tag, type: 'console', text: m.text() }); });
  page.on('request', (r) => requests.push({ at: tag, url: r.url() }));
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  return page;
}
const theatreReady = (page) => page.waitForFunction(() => window.__gt3?.theatre?.ready === true, { timeout: 150000 });

const cases = [
  { name: 'file-format', run: async () => {
    const state = { sheetsById: {}, definitionVersion: '0.4.0', revisionHistory: [] };
    const file = wrapTimeline(TMP_ID, state, '0.7.2');
    const checks = {
      roundTrip: unwrapTimeline(JSON.parse(JSON.stringify(file)), TMP_ID) !== null,
      format: file.format === TIMELINE_FORMAT && file.version === TIMELINE_VERSION,
    };
    const rejects = (fn) => { try { fn(); return false; } catch { return true; } };
    checks.badFormat = rejects(() => unwrapTimeline({ ...file, format: 'x' }));
    checks.futureVersion = rejects(() => unwrapTimeline({ ...file, version: 2 }));
    checks.wrongProject = rejects(() => unwrapTimeline(file, 'other'));
    checks.noState = rejects(() => unwrapTimeline({ ...file, state: null }));
    checks.badId = rejects(() => timelineFileName('../evil'));
    return { pass: Object.values(checks).every(Boolean), checks };
  } },
  { name: 'plain-boot-clean', run: async (ctx) => {
    const page = ctx.plain = await openPage(ctx.browser, '', 'plain');
    await wait(4000);
    const out = await page.evaluate(() => ({ global: Boolean(window.__gt3?.theatre),
      studioRoot: Boolean(document.getElementById('theatrejs-studio-root')) }));
    const theatreRequests = requests.filter((r) => r.at === 'plain' && /theatre/i.test(r.url) && !/src\/authoring/.test(r.url));
    const authoringRequests = requests.filter((r) => r.at === 'plain' && /src\/authoring/.test(r.url));
    return { pass: !out.global && !out.studioRoot && !theatreRequests.length && !authoringRequests.length,
      ...out, theatreRequests: theatreRequests.length, authoringRequests: authoringRequests.length };
  } },
  { name: 'studio-opens', run: async (ctx) => {
    const page = ctx.studio = await openPage(ctx.browser, '?theatre', 'studio');
    await theatreReady(page);
    await page.waitForSelector('#theatrejs-studio-root', { timeout: 30000 });
    const out = await page.evaluate(() => {
      const t = window.__gt3.theatre;
      return { rootChildren: document.getElementById('theatrejs-studio-root').childElementCount
        || document.getElementById('theatrejs-studio-root').shadowRoot?.childElementCount || 0,
      sheet: t.sheet.address.sheetId, object: t.obj.address.objectKey, probeParent: t.probe.parent,
      source: t.source, studioHidden: t.studio.ui.isHidden };
    });
    return { pass: out.rootChildren > 0 && out.sheet === 'proof' && out.probeParent === null && !out.studioHidden, ...out };
  } },
  { name: 'edit-applies-in-loop', run: async (ctx) => {
    const out = await ctx.studio.evaluate(async () => {
      const t = window.__gt3.theatre;
      // GT3's loop can be starved while the scene warms up, so wait for the value, not a fixed time.
      const until = async (fn, ms = 20000) => { const end = performance.now() + ms; while (!fn() && performance.now() < end) await new Promise((r) => setTimeout(r, 50)); return fn(); };
      t.pause();
      const ticks0 = t.stats.ticks;
      // Static (unsequenced) prop: scale.
      t.studio.transaction(({ set }) => set(t.obj.props.scale, 2));
      const scaleApplied = await until(() => Math.abs(t.probe.scale.x - 2) < 1e-6);
      // Sequenced prop: setting a value at the playhead edits that keyframe.
      t.seek(1.5);
      t.studio.transaction(({ set }) => set(t.obj.props.rotationDeg.y, 90));
      const ryApplied = await until(() => Math.abs(t.probe.rotation.y - Math.PI / 2) < 1e-6);
      return { ticks: t.stats.ticks - ticks0, scaleApplied, ryApplied, scale: t.probe.scale.x, ry: t.probe.rotation.y };
    });
    return { pass: out.ticks > 0 && out.scaleApplied && out.ryApplied, ...out };
  } },
  { name: 'input-shield', run: async (ctx) => {
    const out = await ctx.studio.evaluate(() => {
      const seen = { wheel: 0, keydown: 0 };
      const onWheel = () => seen.wheel++;
      const onKey = () => seen.keydown++;
      window.addEventListener('wheel', onWheel);
      window.addEventListener('keydown', onKey);
      const root = document.getElementById('theatrejs-studio-root');
      const fire = (target) => {
        target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, composed: true, deltaY: 120 }));
        target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'ArrowDown' }));
      };
      fire(root);
      const inside = { ...seen };
      fire(document.body);
      const outside = { wheel: seen.wheel - inside.wheel, keydown: seen.keydown - inside.keydown };
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      return { inside, outside };
    });
    return { pass: out.inside.wheel === 0 && out.inside.keydown === 0 && out.outside.wheel === 1 && out.outside.keydown === 1, ...out };
  } },
  { name: 'no-local-storage', run: async (ctx) => {
    const out = await ctx.studio.evaluate(() => {
      const keys = (s) => Object.keys(s).filter((k) => /theatre/i.test(k));
      return { local: keys(localStorage), session: keys(sessionStorage) };
    });
    return { pass: !out.local.length && !out.session.length, ...out };
  } },
  { name: 'save-roundtrip', run: async (ctx) => {
    const file = await ctx.studio.evaluate(() => window.__gt3.theatre.exportJSON());
    // Sent from node, not the page, so the deliberate 4xx responses do not land in the page console.
    const post = async (body, headers) => (await fetch(`${base}/__theatre/save`, { method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers } })).status;
    const out = {
      exported: { format: file.format, version: file.version, projectId: file.projectId, theatre: file.theatre,
        hasState: Boolean(file.state?.sheetsById) },
      okStatus: await post({ ...file, projectId: TMP_ID }, { 'x-gt3-theatre': '1' }),
      noHeaderStatus: await post(file, {}),
      badVersionStatus: await post({ ...file, version: 99 }, { 'x-gt3-theatre': '1' }),
      badIdStatus: await post({ ...file, projectId: '../evil' }, { 'x-gt3-theatre': '1' }),
    };
    const written = existsSync(TMP_FILE) ? JSON.parse(readFileSync(TMP_FILE, 'utf8')) : null;
    const state = written ? unwrapTimeline(written, TMP_ID) : null;
    rmSync(TMP_FILE, { force: true });
    return { pass: out.okStatus === 200 && out.noHeaderStatus === 403 && out.badVersionStatus === 400
      && out.badIdStatus === 400 && Boolean(state?.sheetsById) && !existsSync(TMP_FILE),
    ...out, writtenVersion: written?.version ?? null };
  } },
  { name: 'play-from-json', run: async (ctx) => {
    const page = ctx.play = await openPage(ctx.browser, '?theatre=play', 'play');
    await theatreReady(page);
    const samples = await page.evaluate(async () => {
      const t = window.__gt3.theatre;
      const rows = [];
      for (let i = 0; i < 12; i++) {
        rows.push({ pos: t.sheet.sequence.position, y: t.probe.rotation.y, x: t.probe.position.x, s: t.probe.scale.x });
        await new Promise((r) => setTimeout(r, 250));
      }
      return { rows, source: t.source, studio: Boolean(t.studio), root: Boolean(document.getElementById('theatrejs-studio-root')),
        length: t.sheet.sequence.length };
    });
    const span = (key) => Math.max(...samples.rows.map((r) => r[key])) - Math.min(...samples.rows.map((r) => r[key]));
    const studioRequests = requests.filter((r) => r.at === 'play' && /@theatre_studio|theatre\/studio|theatre_studio/i.test(r.url));
    return { pass: samples.source.includes('gt3-proof.v1.json') && !samples.studio && !samples.root && !studioRequests.length
      && span('pos') > 0.2 && (span('y') > 0.05 || span('x') > 0.05 || span('s') > 0.05),
    source: samples.source, studioLoaded: samples.studio, studioRoot: samples.root, studioRequests: studioRequests.length,
    sequenceLength: samples.length, playheadSpan: +span('pos').toFixed(3), rotationYSpan: +span('y').toFixed(3),
    positionXSpan: +span('x').toFixed(3), scaleSpan: +span('s').toFixed(3), first: samples.rows[0], last: samples.rows.at(-1) };
  } },
];

let browser;
try {
  mkdirSync(path.resolve('local/tmp'), { recursive: true });
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${path.resolve('local/tmp', `gt3-theatre-proof-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const ctx = { browser };
  for (const step of cases) {
    const entry = report.cases[step.name] = { pass: true };
    try { Object.assign(entry, await step.run(ctx)); } catch (error) { entry.pass = false; entry.error = String(error?.message ?? error); }
    // Heavy pages are closed as soon as nothing later needs them (8 GB host).
    if (step.name === 'plain-boot-clean') await ctx.plain?.close();
    if (step.name === 'save-roundtrip') await ctx.studio?.close();
    if (step.name === 'play-from-json') await ctx.play?.close();
  }
  const errors = rawErrors.filter((e) => !isNoise(e.text));
  report.cases['console-clean'] = { pass: errors.length === 0, errors, suppressedNoise: rawErrors.length - errors.length };
} finally {
  await browser?.close();
  rmSync(TMP_FILE, { force: true });
}
report.pass = Object.values(report.cases).every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
