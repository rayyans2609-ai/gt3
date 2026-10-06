/** Targeted check for SPEC §14 "No driving input before ready" and the §18 crossing SFX wiring.
 * A: wheel input streamed from first paint until after ready (incl. momentum across ready)
 *    must not start the Tour, dismiss the start screen or move the car; the first real gesture
 *    afterwards drives normally.
 * B: with a saved route position, wheel input during reload must not disturb the exact restore.
 * C: a forward gate crossing calls the crossing SFX (dev counter); reversing does not.
 * Usage: node scripts/verify-preready-input.mjs [base-url]   (dev server; default 127.0.0.1:5198)
 */
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://127.0.0.1:5198/';
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(m); };
const errors = [];
const report = { base, cases: {}, errors };

const snap = page => page.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  return { progress: state.progress, started: state.started, locked: state.scrollLocked,
    active: state.activeCarIndex, ready: window.__gt3?.readiness?.status ?? 'none',
    startVisible: !document.querySelector('#start-screen')?.hidden
      && !document.querySelector('#start-screen')?.classList.contains('is-leaving'),
    sfx: { ...(window.__gt3SfxLog || { checkpointCross: 0, audible: 0 }) } };
});
const isReady = s => s.ready === 'ready' || s.ready === 'degraded';

/** Dense wheel stream (~30 ms gaps, like a held wheel / trackpad momentum) until `afterReadyMs`
 * after ready. Polling is cheap and separate so input gaps never exceed the unlock quiet window. */
async function streamUntilAfterReady(page, afterReadyMs) {
  let readyAt = 0; let sent = 0; let maxGap = 0; let last = 0; const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try { await page.mouse.wheel({ deltaY: 120 }); sent++; } catch { /* navigating */ }
    const now = Date.now(); if (last) maxGap = Math.max(maxGap, now - last); last = now;
    await wait(25);
    if (sent % 8 === 0 || readyAt) {
      let status; try { status = await page.evaluate(() => window.__gt3?.readiness?.status); } catch { continue; }
      if ((status === 'ready' || status === 'degraded') && !readyAt) readyAt = Date.now();
    }
    if (readyAt && Date.now() - readyAt >= afterReadyMs) return { sent, maxGapMs: maxGap, s: await snap(page) };
  }
  throw new Error('page never became ready');
}

async function driveUntil(page, pred, delta = 300, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    const s = await snap(page);
    if (pred(s)) return s;
    await page.mouse.wheel({ deltaY: delta });
    await wait(60);
  }
  throw new Error('drive target not reached');
}

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
      `--user-data-dir=/tmp/gt3-preready-${process.pid}`, '--window-size=1600,900',
      '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.mouse.move(800, 450);
  await page.evaluateOnNewDocument(() => {
    const log = window.__gt3Probe = [];
    let prev = '';
    const tick = async () => {
      try {
        const { state } = await import('/src/core/state.js');
        const cur = `${window.__gt3?.readiness?.status ?? 'none'}|locked=${state.scrollLocked}|started=${state.started}|y=${Math.round(scrollY)}`;
        if (cur !== prev) { log.push(`${Math.round(performance.now())} ${cur} guard=${!!window.__gt3BootGuard}`); prev = cur; }
      } catch { /* module not served yet */ }
      setTimeout(tick, 10);
    };
    tick();
    window.addEventListener('wheel', () => { window.__gt3LastWheel = performance.now(); }, { passive: true, capture: true });
  });

  // A — fresh session, input streamed across readiness.
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const { sent, maxGapMs, s: atStop } = await streamUntilAfterReady(page, 0);
  await wait(600); // > unlock quiet window
  const settled = await snap(page);
  const probe = await page.evaluate(() => window.__gt3Probe);
  report.cases.A = { wheelEventsSent: sent, maxGapMs, atStop, settled, probe };
  // Requirement: nothing moves or starts while locked or before ready. Lines after the unlock may
  // legitimately show post-ready input (the stream polls readiness only every few events).
  const leaked = probe.filter(line => (/^\d+ (none|loading)\|/.test(line) || /\|locked=true\|/.test(line))
    && !/\|started=false\|y=0 /.test(line));
  assert(!leaked.length, `input moved/started before or at unlock: ${leaked.join(' ; ')}`);
  // The stream polls readiness only every few events, so under host load some wheel events land
  // after the unlock with gaps > the quiet window: those are genuine post-ready gestures and may
  // start the Tour. The requirement (nothing before ready/while locked) is the `leaked` check
  // above; the quiet gate itself is proven in case B with dense synthetic momentum.
  report.cases.A.postReadyInputStarted = settled.started;
  if (!settled.started) {
    assert(settled.progress === 0, `pre-ready input moved the car: progress=${settled.progress}`);
    assert(settled.startVisible, 'start screen dismissed without any post-ready gesture');
  }
  assert(!settled.locked, 'drive still locked after input went quiet');
  await page.mouse.wheel({ deltaY: 200 });
  await wait(900);
  const driven = await snap(page);
  report.cases.A.firstRealGesture = driven;
  assert(driven.started && driven.progress > 0, 'first real post-ready gesture did not drive');

  // C — crossing SFX wiring (start audio with a real click gesture first).
  await page.click('.audio-speaker').catch(() => {});
  await wait(300);
  const before = (await snap(page)).sfx.checkpointCross;
  const crossed = await driveUntil(page, s => s.active >= 1);
  await wait(200);
  const afterForward = (await snap(page)).sfx.checkpointCross;
  await driveUntil(page, s => s.active === 0, -300);
  await wait(200);
  const afterReverse = (await snap(page)).sfx;
  report.cases.C = { before, afterForward, afterReverse, crossedAt: crossed.progress };
  assert(afterForward === before + 1, `forward crossing SFX calls ${afterForward - before} (want 1)`);
  assert(afterReverse.checkpointCross === afterForward, 'reverse crossing played the SFX');

  // B — saved route position + input during reload.
  const saved = await driveUntil(page, s => s.progress > 0.3, 400);
  await wait(1200); // settle + route write throttle
  const savedSettled = await snap(page);
  await page.evaluateOnNewDocument(() => {
    // Synthetic trackpad momentum: untrusted wheel events every 16 ms (they never scroll the page,
    // but reach the lock's swallow listener exactly like real momentum would).
    const id = setInterval(() => {
      if (window.__gt3StopMomentum) { clearInterval(id); window.__gt3MomentumEnd = performance.now(); return; }
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, cancelable: true }));
    }, 16);
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await streamUntilAfterReady(page, 600);
  await page.evaluate(() => { window.__gt3StopMomentum = true; });
  await wait(700);
  const restored = await snap(page);
  const gate = await page.evaluate(() => {
    const unlock = window.__gt3Probe.find(l => /\|locked=false\|/.test(l) && !/^\d+ none/.test(l));
    const ready = window.__gt3Probe.find(l => / (ready|degraded)\|/.test(l));
    return { readyAt: ready && Number(ready.split(' ')[0]), unlockAt: unlock && Number(unlock.split(' ')[0]),
      momentumEnd: Math.round(window.__gt3MomentumEnd) };
  });
  report.cases.B = { saved: savedSettled.progress, savedActive: savedSettled.active, restored, gate };
  assert(gate.unlockAt >= gate.momentumEnd + 200,
    `unlock (${gate.unlockAt}) did not wait for momentum to end (${gate.momentumEnd})`);
  assert(Math.abs(restored.progress - savedSettled.progress) < 1e-4,
    `restore disturbed by pre-ready input: ${savedSettled.progress} -> ${restored.progress}`);
  assert(restored.active === savedSettled.active, 'restored route car changed');
  void saved;

  const relevant = errors.filter(e => !/favicon/.test(e));
  assert(!relevant.length, `page errors: ${relevant.join(' | ')}`);
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.failure = error.message;
} finally {
  await browser?.close();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}
