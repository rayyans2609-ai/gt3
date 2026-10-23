/** Phase 4 entry-flow harness (SPEC §24–25; provisional Phase 5 Hub): Landing → Hub → Grand Tour.
 * Cases, each reported with its observed values:
 *   fresh-landing         a new session boots to the Landing world and the hero loads
 *   landing-scroll-isolated  Landing page scroll never becomes Tour route input (§14)
 *   reach-hub             scrolling down reaches the Hub, which enables the START RACE button
 *   hub-rest-holds        rolling wheel at the Hub holds the Hub; route input stays zero
 *   reverse               wheeling back re-enters the Landing (progress < 0.975) and out again
 *   momentum-carryover    wheel momentum across the START RACE click crosses nothing into the Tour
 *   tour-drives           the first real gesture after entry drives (progress, started)
 *   refresh-tour          a reload in the Tour restores the exact route position within 0.002
 *   refresh-hub           a reload at the Hub re-enters the Hub directly (world stays landing)
 *   new-session-fresh     a new browser context starts fresh on the Landing
 * Usage: node scripts/verify-landing-flow.mjs [base-url]   (GT3_URL env wins; default 127.0.0.1:5243)
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const base = process.env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5243';
const wait = ms => new Promise(r => setTimeout(r, ms));
/** Favicon noise and the known three.js warm-up warning ('fog' on THREE.MeshDepthMaterial). */
const isNoise = text => /favicon/i.test(text)
  || (/fog/i.test(text) && /MeshDepthMaterial/i.test(text));
const rawErrors = [];
const report = { base, cases: {} };

const snap = page => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const landing = window.__gt3?.landing;
  return {
    world: document.documentElement.dataset.world,
    experience: state.experience,
    progress: state.progress,
    started: state.started,
    locked: state.scrollLocked,
    transition: state.transition ? `${state.transition.from}->${state.transition.to}` : null,
    activeCarIndex: state.activeCarIndex,
    readiness: window.__gt3?.readiness?.status ?? 'none',
    landing: landing
      ? { loaded: landing.loaded(), progress: landing.progress(), active: landing.active() }
      : null,
    startScreen: [...(document.getElementById('start-screen')?.classList ?? [])],
    session: (() => { try { return JSON.parse(sessionStorage.getItem('gt3.session.v1') || 'null'); } catch { return null; } })(),
  };
});
const readyOk = s => s.readiness === 'ready' || s.readiness === 'degraded';

/** Snapshot with the fields relevant to a session-storage check (unchanged between samples). */
const getSession = page => page.evaluate(() => sessionStorage.getItem('gt3.session.v1'));

/** Poll an async condition until it returns a truthy value; that value is returned. */
async function until(page, fn, { cap = 30000, step = 120, label = 'condition' } = {}) {
  const deadline = Date.now() + cap; let last;
  while (Date.now() < deadline) {
    try { last = await fn(page); if (last) return last; } catch { /* navigating */ }
    await wait(step);
  }
  const detail = last === undefined ? '' : ` (last: ${JSON.stringify(last)})`;
  throw new Error(`${label} not met within ${Math.round(cap / 1000)} s${detail}`);
}

const wheel = (page, deltaY, steps, gap) => (async () => {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY });
    await wait(gap);
  }
})();

function watch(page, tag) {
  page.on('pageerror', e => rawErrors.push({ at: tag, type: 'pageerror', text: String(e?.message ?? e) }));
  page.on('console', m => { if (m.type() === 'error') rawErrors.push({ at: tag, type: 'console', text: m.text() }); });
}

async function open(browsr, tag) {
  const page = await browsr.newPage();
  watch(page, tag);
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.mouse.move(720, 450).catch(() => {}); // centre: wheel events dispatch at the car
  return page;
}

const cases = [
  // 1 — new page, empty session storage → Landing world, hero loads.
  {
    name: 'fresh-landing',
    run: async page => {
      const t0 = Date.now();
      const booted = await until(page, async p => { const s = await snap(p); return s.landing ? s : null; },
        { cap: 30000, label: 'boot completed (registered landing handle)' });
      const sessionAtBoot = await getSession(page);
      await until(page, async p => { const s = await snap(p); return s.landing?.loaded ? s : null; },
        { cap: 30000, label: 'landing hero load' });
      if (booted.world !== 'landing' || booted.experience !== 'landing') {
        throw new Error(`boot: world=${booted.world} experience=${booted.experience}`);
      }
      if (sessionAtBoot !== null) throw new Error(`session present on a fresh tab: ${String(sessionAtBoot).slice(0, 120)}`);
      return { world: booted.world, experience: booted.experience, sessionAtBoot: null,
        heroLoaded: true, heroLoadSeconds: Math.round((Date.now() - t0) / 100) / 10 };
    },
  },
  // 2 — Landing scroll is native page scroll and must not reach the Tour drive (SPEC §14).
  {
    name: 'landing-scroll-isolated',
    run: async page => {
      await wheel(page, 200, 6, 60);
      await wait(600); // settle the short scroll damping
      const s = await snap(page);
      if (!(s.landing.progress > 0.05)) {
        throw new Error(`landing did not move: landingProgress=${s.landing.progress} scrollY?`);
      }
      if (s.progress !== 0 || s.started) {
        throw new Error(`Landing scroll bled into the Tour: progress=${s.progress} started=${s.started}`);
      }
      return { landingProgress: Math.round(s.landing.progress * 1000) / 1000,
        tourProgress: s.progress, started: s.started, locked: s.locked };
    },
  },
  // 3 — scroll down: Landing → Hub edge; the button arms once the Tour is ready or degraded.
  {
    name: 'reach-hub',
    run: async page => {
      let s; let steps = 0;
      while (steps < 80) {
        s = await snap(page);
        if (s.experience === 'hub') break;
        await page.mouse.wheel({ deltaY: 200 });
        steps++; await wait(60);
      }
      if (s.experience !== 'hub') {
        throw new Error(`no Hub within 80 steps: experience=${s.experience} landingProgress=${s.landing?.progress}`);
      }
      const readied = await until(page, async p => { const x = await snap(p); return readyOk(x) ? x : null; },
        { cap: 60000, step: 250, label: `readiness ready/degraded (was ${s.readiness})` });
      await wait(400); // let the button mirror the readiness decision
      const armed = await page.evaluate(() => document.querySelector('.hub-start')?.disabled ?? null);
      if (armed !== false) throw new Error(`.hub-start still disabled (readiness=${readied.readiness})`);
      return { wheelSteps: steps, readiness: readied.readiness, hubStartEnabled: !armed };
    },
  },
  // 4 — at the Hub, extra wheel-down does nothing: Hub holds, route stays at zero.
  {
    name: 'hub-rest-holds',
    run: async page => {
      await wheel(page, 200, 10, 60);
      await wait(600);
      const s = await snap(page);
      if (s.experience !== 'hub') throw new Error(`fell out of the Hub: experience=${s.experience}`);
      if (s.world !== 'landing') throw new Error(`world left the landing field: ${s.world}`);
      if (s.progress !== 0) throw new Error(`route input at the Hub: progress=${s.progress}`);
      return { world: s.world, experience: s.experience, tourProgress: s.progress,
        landingProgress: Math.round(s.landing.progress * 1000) / 1000, readiness: s.readiness };
    },
  },
  // 5 — wheel up: Hub → Landing (< 0.975); wheel down again: Landing → Hub.
  {
    name: 'reverse',
    run: async page => {
      let s; let up = 0;
      while (up < 80) {
        s = await snap(page);
        if (s.experience === 'landing') break;
        await page.mouse.wheel({ deltaY: -300 });
        up++; await wait(60);
      }
      if (s.experience !== 'landing') {
        throw new Error(`no Landing within 80 up-steps: experience=${s.experience} landingProgress=${s.landing?.progress}`);
      }
      await wait(500); // damping settles below the 0.975 edge
      const atLanding = await snap(page);
      if (!(atLanding.landing.progress < 0.975)) {
        throw new Error(`still at the Hub threshold: landingProgress=${atLanding.landing.progress}`);
      }
      let s2; let down = 0;
      while (down < 80) {
        s2 = await snap(page);
        if (s2.experience === 'hub') break;
        await page.mouse.wheel({ deltaY: 200 });
        down++; await wait(60);
      }
      if (s2.experience !== 'hub') {
        throw new Error(`no return to the Hub within 80 down-steps: experience=${s2.experience}`);
      }
      return { upSteps: up, landingProgress: Math.round(atLanding.landing.progress * 1000) / 1000,
        downSteps: down, readiness: s2.readiness };
    },
  },
  // 6 — hub momentum across the START RACE click must cross nothing into the Tour.
  {
    name: 'momentum-carryover',
    run: async page => {
      for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: 300 }); await wait(25); }
      const clickedAt = Date.now();
      await page.click('.hub-start');
      const entry = await until(page, async p => {
        const s = await snap(p);
        return s.world === 'tour' && s.experience === 'tour' ? s : null;
      }, { cap: 2500, step: 80, label: 'START RACE did not enter the Tour' });
      const entryMs = Date.now() - clickedAt;
      // 1000 ms of samples from entry: not one unit of carried-over route input.
      const samples = [];
      for (let i = 0; i < 10; i++) {
        await wait(100);
        const s = await snap(page).catch(() => null);
        if (s) samples.push({ ms: Date.now() - clickedAt, progress: s.progress });
      }
      const carried = samples.filter(x => x.progress !== 0);
      if (carried.length) throw new Error(`carried-over input: ${JSON.stringify(carried)}`);
      if (entry.activeCarIndex !== 0) throw new Error(`starter car changed: ${entry.activeCarIndex}`);
      if (!entry.startScreen.includes('is-prompt-only')) {
        throw new Error(`start screen not prompt-only: ${JSON.stringify(entry.startScreen)}`);
      }
      return { entryMs, wheelMomentumSent: 8,
        progressSamples: samples.map(x => x.progress), activeCarIndex: entry.activeCarIndex,
        startScreenClass: entry.startScreen, readiness: entry.readiness, locked: entry.locked };
    },
  },
  // 7 — the first real gesture in the Tour drives (progress grows, started flips).
  {
    name: 'tour-drives',
    run: async page => {
      const unlocked = await until(page, async p => { const s = await snap(p); return !s.locked ? s : null; },
        { cap: 20000, step: 120, label: 'quiet drive unlock after the handoff' });
      await wheel(page, 300, 15, 60);
      await wait(800);
      const s = await snap(page);
      if (!(s.progress > 0)) throw new Error(`no drive: progress=${s.progress} locked=${s.locked}`);
      if (!s.started) throw new Error(`drive moved without starting: progress=${s.progress} started=${s.started}`);
      return { unlockWaitProgress: unlocked.progress, progress: Math.round(s.progress * 10000) / 10000,
        started: s.started, world: s.world, experience: s.experience };
    },
  },
  // 8 — a reload in the Tour restores the exact route position (§25).
  {
    name: 'refresh-tour',
    run: async page => {
      const saved = (await snap(page)).progress;
      await wait(800); // route write throttle + pagehide flush land the settled value
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.mouse.move(720, 450).catch(() => {});
      const restored = await until(page, async p => {
        const s = await snap(p);
        return s.world === 'tour' && s.experience === 'tour' && readyOk(s) ? s : null;
      }, { cap: 60000, step: 250, label: 'tour restore ready/degraded' });
      const delta = Math.abs(restored.progress - saved);
      if (delta > 0.002) {
        throw new Error(`route position not exact: saved=${saved} restored=${restored.progress} (Δ=${delta})`);
      }
      return { saved: Math.round(saved * 10000) / 10000,
        restored: Math.round(restored.progress * 10000) / 10000, delta: Math.round(delta * 100000) / 100000,
        readiness: restored.readiness, activeCarIndex: restored.activeCarIndex };
    },
  },
  // 9 — a NEW page (empty session) reaches the Hub via seek and reloads straight into the Hub.
  {
    name: 'refresh-hub',
    run: async (page, browser) => {
      const p2 = await open(browser, 'hub-reload');
      try {
        await until(p2, async p => { const s = await snap(p); return s.landing?.loaded ? s : null; },
          { cap: 30000, label: 'landing hero load (new page)' });
        await p2.evaluate(() => window.__gt3.landing.seek(1));
        const atHub = await until(p2, async p => { const s = await snap(p); return s.experience === 'hub' ? s : null; },
          { cap: 15000, step: 60, label: 'Hub via landing.seek(1)' });
        const t0 = Date.now();
        await p2.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await until(p2, async p => {
          const s = await snap(p);
          return s.world === 'landing' && s.experience === 'hub'
            && s.landing && s.landing.progress > 0.99 ? s : null;
        }, { cap: 10000, step: 120, label: 'Hub restored into the landing world' });
        return { boot: { world: atHub.world, experience: atHub.experience },
          reloaded: { world: 'landing', experience: 'hub', landingProgressAbove99: true,
            seconds: Math.round((Date.now() - t0) / 100) / 10 } };
      } finally { await p2.close().catch(() => {}); }
    },
  },
  // 10 — a new browser context (private session) starts fresh on the Landing.
  {
    name: 'new-session-fresh',
    run: async (page, browser) => {
      const context = await browser.createBrowserContext();
      try {
        const p3 = await context.newPage();
        watch(p3, 'incognito');
        await p3.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
        const seen = await until(p3, async p => { const s = await snap(p); return s.landing ? s : null; },
          { cap: 30000, label: 'app boot (private context)' });
        if (seen.world !== 'landing' || seen.experience !== 'landing') {
          throw new Error(`private session booted elsewhere: world=${seen.world} experience=${seen.experience}`);
        }
        return { world: seen.world, experience: seen.experience };
      } finally { await context.close().catch(() => {}); }
    },
  },
];

/** Run one browser-GPU session for the whole flow; each case gets a named report entry. */
let browser;
try {
  mkdirSync(path.resolve('local/tmp'), { recursive: true });
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars', '--no-first-run',
      `--user-data-dir=${path.resolve('local/tmp', `gt3-landing-flow-${process.pid}`)}`],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await open(browser, 'main');

  // Cases 1–7, 8 share one page flow; cases 9–10 open their own surfaces and stand alone.
  for (const [index, step] of cases.entries()) {
    const entry = report.cases[step.name] = { pass: true };
    try {
      Object.assign(entry, await step.run(page, browser));
    } catch (error) {
      entry.pass = false;
      entry.failure = String(error?.message ?? error);
      for (const later of cases.slice(index + 1).map(c => c.name)) {
        report.cases[later] = { pass: false, failure: `skipped: flow broke at ${step.name}` };
      }
      break;
    }
  }

  report.pass = Object.values(report.cases).every(c => c.pass);
  report.errors = rawErrors.filter(e => !isNoise(e.text));
  report.suppressedNoise = rawErrors.length - report.errors.length;
} catch (fatal) {
  report.pass = false;
  report.failure = String(fatal?.message ?? fatal);
} finally {
  await browser?.close().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
