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
 *   tour-home-return      the home control returns to the Hub with route and discoveries kept
 *   hub-after-return-isolated  wheel at the returned Hub moves only the Landing scroll
 *   tour-reentry          START RACE re-enters the Tour at the preserved route position
 *   refresh-hub           a reload at the Hub re-enters the Hub directly (world stays landing)
 *   new-session-fresh     a new browser context starts fresh on the Landing
 *   theme-mid-transition  the Day/Night switch lands both field colours from mid-transition
 *   audio-gesture-only    scrolling never starts audio; only the speaker click can (or headless)
 * Usage: node scripts/verify-landing-flow.mjs [base-url]   (GT3_URL env wins; default 127.0.0.1:5243)
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const hubVariant = process.argv.find(arg => arg.startsWith('--hub='))?.split('=')[1] || process.env.GT3_HUB;
if (hubVariant && !['a', 'b'].includes(hubVariant)) throw new Error('Expected --hub=a or --hub=b');
const withHub = value => {
  if (!hubVariant) return value;
  const next = new URL(value); next.searchParams.set('hub', hubVariant); return next.href;
};

const base = withHub(process.env.GT3_URL || process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:5243');
const wait = ms => new Promise(r => setTimeout(r, ms));
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
    unlocked: [...state.unlocked].sort((a, b) => a - b),
    theme: state.theme,
    audioReady: state.audioReady,
    readiness: window.__gt3?.readiness?.status ?? 'none',
    landing: landing
      ? { loaded: landing.loaded(), progress: landing.progress(), active: landing.active() }
      : null,
    startScreen: [...(document.getElementById('start-screen')?.classList ?? [])],
    coverHidden: !!document.getElementById('start-screen')?.hidden,
    entryPhase: document.getElementById('entry-sequence')?.dataset.phase,
    session: (() => { try { return JSON.parse(sessionStorage.getItem('gt3.session.v1') || 'null'); } catch { return null; } })(),
  };
});
const readyOk = s => s.readiness === 'ready' || s.readiness === 'degraded';

/** Non-noise observations so far; a case compares before/after counts for "no new errors". */
const cleanErrorCount = () => rawErrors.filter(e => !isNoise(e.text)).length;

/** Values handed between the main-flow cases (route position recorded at the home return). */
const shared = {};

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
      await clickStart(page);
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
      if (!entry.coverHidden || entry.entryPhase !== 'reds' || !entry.locked) {
        throw new Error(`Hub launch must hide the refresh cover and begin locked lamps: ${JSON.stringify(entry)}`);
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
        return s.world === 'tour' && s.experience === 'tour' && readyOk(s) && !s.locked ? s : null;
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
  // 11 — the home control returns to the Hub: route, discovery and session all survive.
  {
    name: 'tour-home-return',
    run: async page => {
      const pre = await snap(page);
      if (pre.world !== 'tour' || pre.experience !== 'tour') {
        throw new Error(`main page not in the Tour: world=${pre.world} experience=${pre.experience}`);
      }
      // Create a discovery first: place the car just past checkpoint 1 (unlock + swap to car 1).
      await page.evaluate(async () => {
        const { seekTo } = await import('/src/scroll/scrollDrive.js');
        const { CHECKPOINT_T } = await import('/src/scene/trackCurve.js');
        seekTo(CHECKPOINT_T[0] + 0.01, { instant: true });
      });
      const discovered = await until(page, async p => {
        const s = await snap(p);
        return s.unlocked.includes(1) && s.activeCarIndex === 1 ? s : null;
      }, { cap: 5000, step: 60, label: 'checkpoint 1 discovery (unlock + car swap)' });
      await wait(500); // let the gate reaction and the car swap finish before the click
      const before = await snap(page);
      await page.click('.home-control');
      const atHub = await until(page, async p => {
        const s = await snap(p);
        return s.world === 'landing' && s.experience === 'hub' && !s.transition ? s : null;
      }, { cap: 3000, step: 80, label: 'home control reached the Hub' });
      const field = await page.evaluate(() => {
        const hub = document.getElementById('hub');
        return { hidden: Boolean(hub?.hidden ?? true), opacity: hub ? Number(getComputedStyle(hub).opacity) : 0 };
      });
      const after = await snap(page);
      const deltaProgress = Math.abs(after.progress - before.progress);
      const routeDelta = after.session ? Math.abs((after.session.routeProgress ?? NaN) - before.progress) : Infinity;
      if (after.world !== 'landing' || after.experience !== 'hub') {
        throw new Error(`ended elsewhere: world=${after.world} experience=${after.experience}`);
      }
      if (after.transition !== null) throw new Error(`transition still open: ${after.transition}`);
      if (after.landing?.active !== true) {
        throw new Error(`Landing not active after the return: ${JSON.stringify(after.landing)}`);
      }
      if (field.hidden || !(field.opacity > 0.95)) {
        throw new Error(`#hub not visible: hidden=${field.hidden} opacity=${field.opacity}`);
      }
      if (!(deltaProgress < 1e-6)) {
        throw new Error(`route position changed across the return: before=${before.progress} after=${after.progress} (Δ=${deltaProgress})`);
      }
      if (!after.unlocked.includes(1)) throw new Error(`discovery lost: unlocked=${JSON.stringify(after.unlocked)}`);
      if (after.session?.experience !== 'hub') {
        throw new Error(`session not at the Hub: ${JSON.stringify(after.session)}`);
      }
      if (!(routeDelta < 1e-4)) {
        throw new Error(`session routeProgress drifted: session=${after.session?.routeProgress} route=${before.progress}`);
      }
      shared.reentryProgress = before.progress;
      return { discoveredWithin5s: true, unlocked: discovered.unlocked, activeCarIndex: discovered.activeCarIndex,
        routeProgress: Math.round(before.progress * 10000) / 10000,
        deltaProgress: Number(deltaProgress.toFixed(9)), hubField: field, hubState: atHub.landing,
        session: { experience: after.session?.experience, routeProgress: after.session?.routeProgress,
          routeDelta: Number(routeDelta.toFixed(9)) } };
    },
  },
  // 12 — wheeling at the returned Hub: the Landing scroll moves, the route input holds zero.
  {
    name: 'hub-after-return-isolated',
    run: async page => {
      const before = await snap(page);
      if (before.experience !== 'hub') throw new Error(`main page not at the Hub: experience=${before.experience}`);
      await wheel(page, -200, 4, 80);
      await wait(600); // let the returning scroll damping settle below the Hub threshold
      const up = await snap(page);
      if (!(up.landing?.progress < 0.99)) {
        throw new Error(`Landing scroll did not leave the Hub rest point: landingProgress=${up.landing?.progress}`);
      }
      const upDelta = Math.abs(up.progress - before.progress);
      if (!(upDelta < 1e-6)) throw new Error(`route input during the Hub wheel-up: Δ=${upDelta}`);
      let down = 0; let again = null;
      while (down < 40) {
        await page.mouse.wheel({ deltaY: 300 });
        down++; await wait(60);
        const s = await snap(page);
        if (s.experience === 'hub') { again = s; break; }
      }
      if (!again) {
        throw new Error(`no Hub re-entry within 40 down-steps: experience=${(await snap(page)).experience}`);
      }
      const downDelta = Math.abs(again.progress - before.progress);
      if (!(downDelta < 1e-6)) throw new Error(`route input during the Hub re-entry: Δ=${downDelta}`);
      await wait(500); // the scroll settles on the Hub rest point before the next case clicks
      const settled = await snap(page);
      if (settled.experience !== 'hub') {
        throw new Error(`did not hold the Hub after re-entry: experience=${settled.experience}`);
      }
      return { landingProgress: Math.round(up.landing.progress * 1000) / 1000,
        routeDeltaUp: Number(upDelta.toFixed(9)), downSteps: down,
        routeDeltaDown: Number(downDelta.toFixed(9)) };
    },
  },
  // 13 — START RACE re-enters the Tour at the preserved route position, unlocked, static until driven.
  {
    name: 'tour-reentry',
    run: async page => {
      const atHub = await snap(page);
      if (atHub.experience !== 'hub') throw new Error(`main page not at the Hub: experience=${atHub.experience}`);
      const target = shared.reentryProgress
        ?? await page.evaluate(async () => (await import('/src/scene/trackCurve.js')).CHECKPOINT_T[0] + 0.01);
      const clickedAt = Date.now();
      await clickStart(page);
      const entry = await until(page, async p => {
        const s = await snap(p);
        return s.world === 'tour' && s.experience === 'tour' && !s.transition ? s : null;
      }, { cap: 3000, step: 80, label: 'START RACE did not re-enter the Tour' });
      const entryMs = Date.now() - clickedAt;
      const targetDelta = Math.abs(entry.progress - target);
      if (!(targetDelta < 1e-4)) {
        throw new Error(`route position not restored: entry=${entry.progress} target=${target} (Δ=${targetDelta})`);
      }
      if (entry.activeCarIndex !== 1) {
        throw new Error(`active car is not the discovered one: ${entry.activeCarIndex}`);
      }
      if (!entry.unlocked.includes(1)) throw new Error(`discovery lost on re-entry: ${JSON.stringify(entry.unlocked)}`);
      // Hub momentum must cross nothing into the Tour: 800 ms of stasis.
      const samples = [];
      for (let i = 0; i < 8; i++) {
        await wait(100);
        const s = await snap(page).catch(() => null);
        if (s) samples.push(s.progress);
      }
      if (samples.some(v => Math.abs(v - target) > 1e-4)) {
        throw new Error(`route moved right after re-entry: target=${target} samples=${JSON.stringify(samples)}`);
      }
      await wait(400); // the quiet unlock after the handoff has matured by now
      await wheel(page, 300, 15, 60);
      await wait(800);
      const drove = await snap(page);
      if (!(drove.progress > target)) {
        throw new Error(`no drive after re-entry: progress=${drove.progress} target=${target} locked=${drove.locked} started=${drove.started}`);
      }
      return { entryMs, target: Math.round(target * 10000) / 10000,
        progressAtEntry: Math.round(entry.progress * 10000) / 10000,
        targetDelta: Number(targetDelta.toFixed(9)), activeCarIndex: entry.activeCarIndex,
        progressSamples: samples.map(v => Math.round(v * 10000) / 10000),
        progressAfterDrive: Math.round(drove.progress * 10000) / 10000, started: drove.started };
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
  // 14 — the Day/Night switch lands both field colours from a mid-transition and both directions.
  {
    name: 'theme-mid-transition',
    run: async (page, browser) => {
      const errors0 = cleanErrorCount();
      const touch = p => p.evaluate(() => ({
        datasetTheme: document.documentElement.dataset.theme,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      }));
      // The field transition is 700 ms of CSS; under main-thread load it can run late. Wait for the
      // final colour (bounded) instead of a fixed sleep; the assertions below judge the last reading.
      const settle = async (p, target, cap = 4000) => {
        const t0 = Date.now(); let last;
        while (Date.now() - t0 < cap) {
          last = await touch(p);
          if (last.bodyBackground === target) break;
          await wait(50);
        }
        return { ...last, settleMs: Date.now() - t0 };
      };
      const p2 = await open(browser, 'theme');
      try {
        await until(p2, async p => { const s = await snap(p); return s.landing?.loaded ? s : null; },
          { cap: 30000, label: 'landing hero load (theme page)' });
        const dayBefore = await touch(p2);
        await p2.evaluate(() => window.__gt3.landing.seek(0.5));
        await wait(250); // let the seek land before the click
        await p2.click('.theme-segmented__option[data-value="night"]');
        const night = await settle(p2, 'rgb(12, 25, 48)');
        const nightState = await snap(p2);
        // The same switch at the Hub edge and again inside the Landing field.
        await p2.evaluate(() => window.__gt3.landing.seek(0.97));
        await wait(300);
        await p2.evaluate(() => window.__gt3.landing.seek(0.2));
        await p2.click('.theme-segmented__option[data-value="day"]');
        const day = await settle(p2, 'rgb(255, 255, 255)');
        const dayState = await snap(p2);
        const newErrors = rawErrors.filter(e => !isNoise(e.text)).slice(errors0);
        if (night.datasetTheme !== 'night' || nightState.theme !== 'night') {
          throw new Error(`night did not hold: dataset=${night.datasetTheme} state=${nightState.theme}`);
        }
        if (nightState.landing?.active !== true) {
          throw new Error(`Landing not active under the night field: ${JSON.stringify(nightState.landing)}`);
        }
        if (night.bodyBackground !== 'rgb(12, 25, 48)') {
          throw new Error(`night body field wrong: ${night.bodyBackground}`);
        }
        if (day.datasetTheme !== 'day' || dayState.theme !== 'day') {
          throw new Error(`day did not hold: dataset=${day.datasetTheme} state=${dayState.theme}`);
        }
        if (day.bodyBackground !== 'rgb(255, 255, 255)') {
          throw new Error(`day body field wrong: ${day.bodyBackground}`);
        }
        if (newErrors.length) throw new Error(`new page errors: ${JSON.stringify(newErrors.map(e => e.text))}`);
        return { dayBefore, night: { datasetTheme: night.datasetTheme, bodyBackground: night.bodyBackground,
            landingActive: nightState.landing?.active, settleMs: night.settleMs },
          day: { datasetTheme: day.datasetTheme, bodyBackground: day.bodyBackground, settleMs: day.settleMs },
          newPageErrors: newErrors.length };
      } finally { await p2.close().catch(() => {}); }
    },
  },
  // 15 — scrolling never starts audio; only the speaker gesture can (headless fallback accepted).
  {
    name: 'audio-gesture-only',
    run: async (page, browser) => {
      const errors0 = cleanErrorCount();
      const p2 = await open(browser, 'audio');
      try {
        await until(p2, async p => { const s = await snap(p); return s.landing?.loaded ? s : null; },
          { cap: 30000, label: 'landing hero load (audio page)' });
        await wheel(p2, 120, 6, 60);
        await wait(400);
        const scrolled = await snap(p2);
        if (!(scrolled.landing?.progress > 0.05)) {
          throw new Error(`the Landing scroll did not move: landingProgress=${scrolled.landing?.progress}`);
        }
        if (scrolled.audioReady !== false) {
          throw new Error(`scroll started audio: audioReady=${scrolled.audioReady}`);
        }
        await p2.evaluate(() => window.__gt3.landing.seek(0));
        await wait(200); // settle at the top of the Landing before the gesture
        await p2.click('.audio-speaker');
        let started = null;
        try {
          started = await until(p2, async p => {
            const s = await snap(p);
            return s.audioReady === true ? s : null;
          }, { cap: 6000, step: 120, label: 'audioReady after the speaker click' });
        } catch { /* headless audio may never be available: use the speaker's own state below */ }
        const dataSound = await p2.evaluate(() => document.querySelector('.audio-speaker')?.dataset.sound ?? null);
        const newErrors = rawErrors.filter(e => !isNoise(e.text)).slice(errors0);
        if (started) {
          return { audioReadyAfterScroll: false, landingProgressAfterScroll: Math.round(scrolled.landing.progress * 1000) / 1000,
            audioReady: true, dataSound, newPageErrors: newErrors.length };
        }
        const healthyIdle = dataSound === 'starting' || dataSound === 'on' || dataSound === 'idle';
        if (!healthyIdle || newErrors.length) {
          throw new Error(`audio did not start and the speaker is unhealthy: data-sound=${dataSound}`
            + ` newPageErrors=${JSON.stringify(newErrors.map(e => e.text))}`);
        }
        return { audioReadyAfterScroll: false,
          landingProgressAfterScroll: Math.round(scrolled.landing.progress * 1000) / 1000,
          audioReady: false, dataSound, note: 'headless audio unavailable', newPageErrors: newErrors.length };
      } finally { await p2.close().catch(() => {}); }
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

  // Cases 1–8, 11–13 share one page flow (11–13 continue the main page through the Tour↔Hub
  // round trip); refresh-hub, new-session-fresh, theme and audio stand alone on their own pages.
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
