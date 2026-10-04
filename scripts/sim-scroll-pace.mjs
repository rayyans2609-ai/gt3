/**
 * Pure-node simulation of the real src/scroll/scrollDrive.js update law under synthetic wheel /
 * trackpad traces, for `default`, `?scroll=cap` and `?scroll=pace`. No browser, no Vite, no GPU.
 *
 * Run: node scripts/sim-scroll-pace.mjs [--out <dir>] [--fps 60] [--vh 900]
 *
 * How it works: scrollDrive.js is imported unmodified, once per mode (query-string module
 * instances; `?scroll=` is injected through a stubbed globalThis.location). A tiny fake browser
 * (window/document/history) provides scrollY, scrollTo, listeners and scrollHeight. Each simulated
 * frame: (1) apply the trace's wheel deltas for that frame to scrollY (clamped 0..maxScroll), (2) fire
 * the registered 'scroll' listeners (browsers dispatch scroll events before rAF callbacks), (3) call
 * the real update(dt). Speeds are derived from actual state.progress displacement * TRACK_LENGTH
 * over elapsed time, never from the clamped state.velocity.
 *
 * Assumptions (documented in report.md): wheel deltaY maps 1:1 to scrollY pixels with no browser
 * smooth-scroll animation and no momentum other than what the trace itself contains; page height =
 * #scroll-spacer = spacerVh * innerHeight (maxScroll = spacer - innerHeight); frame time is a
 * constant 1/fps; scroll->t mapping is the module's own (t = scrollY / maxScroll for default).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = argOf('--out', '/Users/rayyansheikh/.claude/jobs/d1cd9f0a/tmp/w3');
const FPS = Number(argOf('--fps', 60));
const VH = Number(argOf('--vh', 900));
const DT = 1 / FPS;
mkdirSync(OUT, { recursive: true });

const { state } = await import('../src/core/state.js');
const { TRACK_LENGTH: L } = await import('../src/scene/trackCurve.js');

// --------------------------------------------------------------------------- fake browser
function installBrowser(modeParam, vh) {
  const spacer = { style: { height: '' } };
  const listeners = {};
  const win = {
    scrollY: 0, innerHeight: vh,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    scrollTo: (_x, y) => { win.scrollY = Math.min(max(), Math.max(0, y)); },
  };
  const doc = {
    getElementById: id => (id === 'scroll-spacer' ? spacer : null),
    documentElement: {
      get scrollHeight() { return (parseFloat(spacer.style.height) || 0) * win.innerHeight / 100; },
      clientWidth: 1600, clientHeight: vh,
    },
  };
  const max = () => doc.documentElement.scrollHeight - win.innerHeight;
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.history = { scrollRestoration: 'auto' };
  globalThis.location = { search: modeParam ? `?scroll=${modeParam}` : '' };
  return { win, max, fire: type => (listeners[type] || []).forEach(fn => fn({})) };
}

async function bootMode(mode, vh = VH) {
  const env = installBrowser(mode === 'default' ? '' : mode, vh);
  const mod = await import(`../src/scroll/scrollDrive.js?sim=${mode}-${vh}-${Math.random()}`);
  if (mod.scrollMode !== mode) throw new Error(`mode mismatch ${mod.scrollMode} != ${mode}`);
  state.started = false; state.scrollLocked = false;
  mod.initScrollDrive();
  mod.resetToStart();
  return { mod, ...env, mode };
}

// --------------------------------------------------------------------------- frame runner
/**
 * events: [{ t, dy }] wheel deltas (seconds, px). hooks: [{ t, fn }] one-shot callbacks run at that
 * time before the frame's input. Returns per-frame samples.
 */
function run(sim, { events = [], hooks = [], duration, preroll = 0.3 }) {
  const frames = [];
  const evs = [...events].sort((a, b) => a.t - b.t);
  const hks = [...hooks].sort((a, b) => a.t - b.t);
  let ei = 0, hi = 0;
  const total = Math.ceil((duration + preroll) / DT);
  let prevP = state.progress;
  for (let n = 1; n <= total; n++) {
    const tNow = n * DT - preroll;           // trace time; < 0 during preroll
    while (hi < hks.length && hks[hi].t <= tNow) hks[hi++].fn();
    let moved = false;
    while (ei < evs.length && evs[ei].t <= tNow) {
      sim.win.scrollY = Math.min(sim.max(), Math.max(0, sim.win.scrollY + evs[ei].dy));
      ei++; moved = true;
    }
    if (moved) sim.fire('scroll');
    sim.mod.update(DT);
    const p = state.progress;
    frames.push({ t: tNow, p, m: p * L, speed: (p - prevP) * L / DT, target: state.targetProgress,
      vel: state.velocity, speed01: state.speed01, y: sim.win.scrollY, locked: state.scrollLocked });
    prevP = p;
  }
  return frames;
}

// --------------------------------------------------------------------------- traces
const steady = (pxPerFrame16, seconds, sign = 1, t0 = 0) => {
  const out = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.016) out.push({ t: t0 + t, dy: sign * pxPerFrame16 });
  return out;
};
const fling = (total, ms, tauMs, t0 = 0) => {         // trackpad-like decaying burst
  const step = 8, n = ms / step, w = [];
  for (let i = 0; i < n; i++) w.push(Math.exp(-(i * step) / tauMs));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x, i) => ({ t: t0 + i * step / 1000, dy: total * x / sum }));
};
const TRACES = {
  light: { desc: '5 px / 16 ms (312 px/s) for 2.5 s', ev: steady(5, 2.5), end: 2.5 },
  slow: { desc: '11 px / 16 ms (690 px/s) for 2.5 s', ev: steady(11, 2.5), end: 2.5 },
  gentle: { desc: '20 px / 16 ms (1250 px/s) for 2.5 s', ev: steady(20, 2.5), end: 2.5 },
  normal: { desc: '60 px / 16 ms (3750 px/s) for 2.5 s', ev: steady(60, 2.5), end: 2.5 },
  aggressive: { desc: '150 px / 16 ms (9375 px/s) for 2.5 s', ev: steady(150, 2.5), end: 2.5 },
  mouseNotch: { desc: '100 px notch every 80 ms (1250 px/s) for 2.5 s', ev: Array.from({ length: 32 }, (_, i) => ({ t: i * 0.08, dy: 100 })), end: 2.5 },
  fling2500: { desc: 'trackpad burst: 2500 px over 600 ms, decaying (tau 150 ms)', ev: fling(2500, 600, 150), end: 0.6 },
  mouse1500: { desc: 'one 1500 px wheel event', ev: [{ t: 0, dy: 1500 }], end: 0.0 },
  smallRepeats: { desc: '8 x 120 px, 180 ms apart', ev: Array.from({ length: 8 }, (_, i) => ({ t: i * 0.18, dy: 120 })), end: 7 * 0.18 },
};

// --------------------------------------------------------------------------- metrics
const r1 = x => (Number.isFinite(x) ? +x.toFixed(1) : null);
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const win100 = (frames, i) => {            // mean speed over the last 100 ms
  const k = Math.max(1, Math.round(0.1 / DT));
  const a = frames[Math.max(0, i - k)];
  return (frames[i].m - a.m) / Math.max(DT, frames[i].t - a.t);
};
function afterInput(frames, tEnd) {
  const i0 = frames.findIndex(f => f.t >= tEnd);
  const at = frames[Math.max(0, i0)];
  let settle = null;
  for (let i = Math.max(0, i0); i < frames.length; i++) {
    if (frames.slice(i, i + Math.round(0.25 / DT)).every(f => Math.abs(f.speed) < 1)) { settle = frames[i].t - tEnd; break; }
  }
  const last = frames.at(-1);
  return { settleS: settle === null ? null : r2(settle), backlogM: r1((at.target - at.p) * L),
    runOnM: r1(last.m - at.m), speedAtInputEnd: r1(at.speed) };
}
const peak = frames => {
  let p = 0, p100 = 0;
  frames.forEach((f, i) => { p = Math.max(p, Math.abs(f.speed)); p100 = Math.max(p100, Math.abs(win100(frames, i))); });
  return { peakFrame: r1(p), peak100ms: r1(p100) };
};
const reachedEnd = frames => { const f = frames.find(f => f.p >= 0.9999); return f ? r2(f.t) : null; };

// --------------------------------------------------------------------------- scenarios
async function scenarios(mode) {
  const out = {};
  const fresh = async (vh) => { const s = await bootMode(mode, vh); return s; };

  // Steady sustained input: steady speed measured over trace time 1.0-2.5 s (or until the car hits the end).
  out.steady = {};
  for (const k of ['light', 'slow', 'gentle', 'normal', 'aggressive', 'mouseNotch']) {
    const s = await fresh();
    const tr = TRACES[k];
    const fr = run(s, { events: tr.ev, duration: tr.end + 3 });
    const endT = reachedEnd(fr);
    const t1 = 1.0, t2 = Math.min(2.5, endT ?? 2.5);
    const a = fr.find(f => f.t >= t1), b = fr.find(f => f.t >= t2) || fr.at(-1);
    const meanSpeed = t2 > t1 ? (b.m - a.m) / (b.t - a.t) : null;
    out.steady[k] = { trace: tr.desc, meanSpeedMs: r1(meanSpeed), ...peak(fr), routeEndAtS: endT,
      distanceByInputEndM: r1(fr.find(f => f.t >= tr.end).m), maxSpeed01: r2(Math.max(...fr.map(f => f.speed01))),
      ...afterInput(fr, tr.end) };
  }
  const g = out.steady.gentle.meanSpeedMs, n = out.steady.normal.meanSpeedMs, a = out.steady.aggressive.meanSpeedMs;
  out.steady.ratios = { gentleToNormal: r2(g / n), aggressiveToNormal: r2(a / n), aggressiveToGentle: r2(a / g),
    note: mode === 'default' && out.steady.aggressive.routeEndAtS ? `aggressive reached route end at ${out.steady.aggressive.routeEndAtS}s; its mean is end-clipped (a lower bound)` : undefined };

  // One large gesture.
  out.gesture = {};
  for (const k of ['fling2500', 'mouse1500']) {
    const s = await fresh();
    const tr = TRACES[k];
    const fr = run(s, { events: tr.ev, duration: 6 });
    out.gesture[k] = { trace: tr.desc, ...peak(fr), distanceTravelledM: r1(fr.at(-1).m), routeEndAtS: reachedEnd(fr),
      inputRouteMetresAtDefaultGain: r1(tr.ev.reduce((x, e) => x + e.dy, 0) * L / (s.max())), ...afterInput(fr, tr.end),
      timeToCoverHalfOfDistanceS: r2(fr.find(f => f.m >= fr.at(-1).m / 2)?.t) };
  }

  // Repeated small gestures: smoothness during the sequence.
  { const s = await fresh(); const tr = TRACES.smallRepeats;
    const fr = run(s, { events: tr.ev, duration: tr.end + 3 });
    const seq = fr.filter(f => f.t >= 0 && f.t <= tr.end + 0.4);
    let maxAcc = 0; for (let i = 1; i < seq.length; i++) maxAcc = Math.max(maxAcc, Math.abs(seq[i].speed - seq[i - 1].speed) / DT);
    let stops = 0, was = false; for (const f of seq) { const st = Math.abs(f.speed) < 1; if (st && !was && f.t > 0.05) stops++; was = st; }
    out.smallRepeats = { trace: tr.desc, ...peak(fr), meanSpeedMs: r1(seq.reduce((x, f) => x + Math.abs(f.speed), 0) / seq.length),
      maxAccelMs2: r1(maxAcc), stopsBetweenNotches: stops, totalDistanceM: r1(fr.at(-1).m), ...afterInput(fr, tr.end) };
  }

  // Stop after sustained input (normal 2.5 s) — run-on.
  out.stopAfterNormal = { ...out.steady.normal };

  // Reverse after sustained input (normal 1.5 s forward, then reverse at same rate for 1.5 s).
  { const s = await fresh();
    const ev = [...steady(60, 1.5), ...steady(60, 1.5, -1, 1.5)];
    const fr = run(s, { events: ev, duration: 4 });
    const i0 = fr.findIndex(f => f.t >= 1.5);
    const mRev = fr[i0].m, speedRev = fr[i0].speed;
    let maxFwd = mRev; let delay = null;
    for (let i = i0; i < fr.length; i++) { maxFwd = Math.max(maxFwd, fr[i].m); if (delay === null && fr[i].speed < -1) delay = fr[i].t - 1.5; }
    out.reverseAfterSustained = { speedAtReverseMs: r1(speedRev), firstBackwardMotionDelayS: delay === null ? null : r2(delay),
      overshootOldDirectionM: r1(maxFwd - mRev), backwardPeakMs: r1(Math.min(...fr.slice(i0).map(f => f.speed))),
      backlogAtReverseM: r1((fr[i0].target - fr[i0].p) * L) };
  }

  // Rapid reversals: sign flip every 250 ms x 8 at normal rate.
  { const s = await fresh();
    const ev = []; for (let k = 0; k < 8; k++) ev.push(...steady(60, 0.25, k % 2 ? -1 : 1, k * 0.25));
    const fr = run(s, { events: ev, duration: 2 + 3 });
    const seq = fr.filter(f => f.t >= 0 && f.t <= 2);
    const ms = seq.map(f => f.m); let flips = 0, last = 0;
    for (const f of seq) { const sg = Math.abs(f.speed) < 1 ? 0 : Math.sign(f.speed); if (sg && last && sg !== last) flips++; if (sg) last = sg; }
    out.rapidReversals = { trace: '8 x 250 ms alternating 60 px/16 ms', netDisplacementM: r1(fr.at(-1).m), rangeM: r1(Math.max(...ms) - Math.min(...ms)),
      peakSpeedMs: peak(fr).peakFrame, velocitySignFlips: flips, finalSettleS: afterInput(fr, 2).settleS };
  }

  // Page ends: keep scrolling in both directions.
  { const s = await fresh();
    const fr = run(s, { events: steady(150, 60), duration: 60 });     // aggressive 60 s: page pins at the bottom early
    const arrive = reachedEnd(fr);
    let stall = 0, cur = 0, pinned = 0;
    for (const f of fr) { if (f.t < 0 || f.p >= 0.9999) { cur = 0; continue; } if (Math.abs(f.speed) < 1) { cur += DT; stall = Math.max(stall, cur); } else cur = 0; if (f.y >= s.max() - 1) pinned += DT; }
    // reverse from the end
    const s2 = await fresh();
    run(s2, { events: steady(150, 60), duration: 60 });
    const t0 = 0;
    const fr2 = run(s2, { events: steady(60, 3, -1, t0), duration: 3, preroll: 0 });
    const first = fr2.find(f => f.speed < -1);
    // from start, push up (nothing), then down
    const s3 = await fresh();
    const fr3 = run(s3, { events: [...steady(60, 1, -1, 0), ...steady(60, 2, 1, 1.0)], duration: 3 });
    const mv = fr3.find(f => f.t >= 1.0 && f.speed > 1);
    out.pageEnds = { downToEnd_reachedEndAtS: arrive, longestStallWhileInputActiveS: r2(stall), secondsPagePinnedAtBottomBeforeArrival: r2(pinned),
      reverseFromEnd_firstMotionDelayS: first ? r2(first.t - t0) : null, reverseFromEnd_distanceIn3sM: r1(fr2.at(-1).m - fr2[0].m),
      upAtStartThenDown_firstMotionDelayS: mv ? r2(mv.t - 1.0) : null, pageYAfterReverse: r1(fr2.at(-1).y) };
  }

  // Frame-rate independence probe is run separately via --fps.

  // Interaction contract checks.
  out.interactions = await interactionChecks(mode);
  return out;
}

async function interactionChecks(mode) {
  const res = {};
  const spy = (s) => { let n = 0; s.mod.onFirstScroll(() => n++); return () => n; };

  // Loading input discarded; release must not launch the car or fire first-scroll.
  { const s = await bootMode(mode); const started = spy(s);
    s.mod.lockScroll();
    const fr = run(s, { events: [...steady(150, 1), ...fling(2500, 600, 150, 1.2)], duration: 3, hooks: [] });
    const lockedMoved = fr.at(-1).m;
    s.mod.unlockScroll();
    const after = run(s, { events: [], duration: 3 });
    res.loadingInputDiscarded = { progressMovedWhileLocked_m: r2(lockedMoved), progressAfterRelease_m: r2(after.at(-1).m),
      maxSpeedAfterRelease: r2(Math.max(...after.map(f => Math.abs(f.speed)))), firstScrollFired: started() > 0,
      pageYAfterRelease: after.at(-1).y, pass: lockedMoved === 0 && after.every(f => f.m === 0) && started() === 0 };
  }
  // Lock mid-gesture then unlock: car holds, nothing banked.
  { const s = await bootMode(mode);
    s.mod.seekTo(0.3, { instant: true });
    const hooks = [{ t: 0.4, fn: () => s.mod.lockScroll() }, { t: 1.4, fn: () => s.mod.unlockScroll() }];
    const fr = run(s, { events: steady(60, 2.0), duration: 3.5, hooks });
    const lockedFrames = fr.filter(f => f.locked);
    const mLock = lockedFrames[0].m;
    const heldDrift = Math.max(...lockedFrames.slice(1).map(f => Math.abs(f.m - mLock)));
    const afterUnlock = fr.filter(f => !f.locked && f.t > 1.4 && f.t < 2.0);
    res.lockMidGesture = { driftWhileLockedM: r2(heldDrift), speedJustAfterUnlockMs: r1(afterUnlock[0]?.speed),
      pass: heldDrift < 0.01 };
  }
  // Instant seek mid-fling: no glide, banked target, or launch (W7 contract).
  { const s = await bootMode(mode);
    const hooks = [{ t: 0.3, fn: () => s.mod.seekTo(0.5, { instant: true }) }];
    const fr = run(s, { events: fling(2500, 600, 150), duration: 0.35 + 3, hooks });
    const i = fr.findIndex(f => f.t >= 0.3);
    const post = fr.slice(i + 1).filter(f => f.t > 0.31);
    // Input still arriving after 0.3 s is real input; test pure instant seek after input fully stops too.
    const s2 = await bootMode(mode);
    run(s2, { events: steady(60, 1), duration: 1.2 });
    s2.mod.seekTo(0.7, { instant: true });
    const fr2 = run(s2, { events: [], duration: 3, preroll: 0 });
    res.instantSeek = { afterStopped_dev_m: r2(Math.max(...fr2.map(f => Math.abs(f.p - 0.7) * L))),
      afterStopped_maxSpeed: r2(Math.max(...fr2.map(f => Math.abs(f.speed)))),
      afterStopped_targetEqProgress: fr2.every(f => Math.abs(f.target - f.p) < 1e-9),
      midFling_positionAt0p31s: r2(fr[i + 1].p), midFling_noLaunchFrameSpeedMs: r1(Math.abs(fr[i + 1].speed)),
      pass: fr2.every(f => Math.abs(f.p - 0.7) < 1e-9 && f.speed === 0) };
  }
  // Non-instant seekTo: speed-limited glide, arrives, leaves nothing.
  { const s = await bootMode(mode);
    s.mod.seekTo(0.4);
    const fr = run(s, { events: [], duration: 40, preroll: 0 });
    res.glideSeek = { arrivedAtS: r2(fr.find(f => Math.abs(f.p - 0.4) < 1e-4)?.t), peakSpeedMs: peak(fr).peakFrame,
      finalErrM: r2(Math.abs(fr.at(-1).p - 0.4) * L) };
  }
  // Replay (resetToStart) after a sustained drive.
  { const s = await bootMode(mode);
    run(s, { events: steady(60, 2), duration: 2.2 });
    s.mod.resetToStart();
    const fr = run(s, { events: [], duration: 2, preroll: 0 });
    res.replay = { maxProgressAfterResetM: r2(Math.max(...fr.map(f => f.m))), pageY: fr.at(-1).y,
      pass: fr.every(f => f.m === 0 && f.y === 0) };
  }
  // Keyboard Home/End as single large page deltas (browser keyboard scrolling arrives as scrollY deltas).
  { const s = await bootMode(mode);
    s.mod.seekTo(0.5, { instant: true });
    const fr = run(s, { events: [{ t: 0, dy: s.max() }], duration: 5 });      // End key
    const fr2 = run(s, { events: [{ t: 0, dy: -s.max() }], duration: 5, preroll: 0 });  // Home key
    res.keyboardEndHome = { endKey: { distanceM: r1(fr.at(-1).m - fr[0].m), peakSpeedMs: peak(fr).peakFrame, atEnd: reachedEnd(fr) },
      homeKey: { distanceM: r1(fr2.at(-1).m - fr2[0].m), peakSpeedMs: peak(fr2).peakFrame } };
  }
  // PageDown-like step (one viewport = innerHeight px).
  { const s = await bootMode(mode);
    const fr = run(s, { events: [{ t: 0, dy: s.win.innerHeight }], duration: 3 });
    res.keyboardPageDown = { distanceM: r1(fr.at(-1).m), peakSpeedMs: peak(fr).peakFrame, settleS: afterInput(fr, 0).settleS };
  }
  // Scrollbar drag: continuous absolute jump of the thumb (page 0 -> end in 1 s) with the thumb held.
  { const s = await bootMode(mode);
    const maxY = s.max(); const ev = [];
    for (let t = 0; t < 1; t += 0.016) ev.push({ t, dy: maxY * 0.016 });
    const fr = run(s, { events: ev, duration: 6 });
    res.scrollbarDrag1s = { distanceM: r1(fr.at(-1).m), peakSpeedMs: peak(fr).peakFrame, reachedEndAtS: reachedEnd(fr),
      note: 'drag modelled as ' + Math.round(maxY) + ' px in 1 s of scrollY deltas; thumb-held suppresses re-sync only in a real pointer (not simulated)' };
  }
  // Camera snap precondition (aerialCamera snaps when |dProgress| > snapProgress with |velocity| < 0.1).
  { const s = await bootMode(mode);
    const fr = run(s, { events: fling(2500, 600, 150), duration: 3 });
    let maxStep = 0; for (let i = 1; i < fr.length; i++) maxStep = Math.max(maxStep, Math.abs(fr[i].p - fr[i - 1].p));
    res.cameraSnapReads = { maxPerFrameProgressStep: +maxStep.toPrecision(3), maxPerFrameStepM: r1(maxStep * L),
      maxAbsVelocityReported: r2(Math.max(...fr.map(f => Math.abs(f.vel)))),
      maxFrameStepWhileVelocityBelow0p1_m: r1(Math.max(0, ...fr.slice(1).map((f, i) => Math.abs(f.vel) < 0.1 ? Math.abs(f.p - fr[i].p) * L : 0))) };
  }
  return res;
}

// --------------------------------------------------------------------------- main
const results = { config: { fps: FPS, innerHeight: VH, trackLengthM: +L.toFixed(2), reference: 'default damping 0.075/frame @60Hz' }, modes: {} };
for (const mode of ['default', 'cap', 'pace']) {
  results.modes[mode] = await scenarios(mode);
  console.log(`done ${mode}`);
}
// Viewport sensitivity probe: normal steady at 1080 px high.
results.viewportProbe = {};
for (const mode of ['default', 'cap', 'pace']) {
  const s = await bootMode(mode, 1080);
  const fr = run(s, { events: TRACES.normal.ev, duration: 5.5 });
  const endT = reachedEnd(fr), t2 = Math.min(2.5, endT ?? 2.5);
  const a = fr.find(f => f.t >= 1), b = fr.find(f => f.t >= t2) || fr.at(-1);
  results.viewportProbe[mode] = { innerHeight: 1080, normalMeanSpeedMs: r1((b.m - a.m) / (b.t - a.t)) };
}
writeFileSync(`${OUT}/sim-scroll-pace-${FPS}hz-${VH}.json`, JSON.stringify(results, null, 2));
console.log(`wrote ${OUT}/sim-scroll-pace-${FPS}hz-${VH}.json`);

// --------------------------------------------------------------------------- compact table (markdown)
{
  const M = results.modes, cols = ['default', 'cap', 'pace'];
  const row = (label, f) => `| ${label} | ${cols.map(c => f(M[c]) ?? 'n/a').join(' | ')} |`;
  const lines = [`| metric (${FPS} Hz, ${VH}px viewport) | default | cap | pace |`, '|---|---|---|---|'];
  for (const k of ['light', 'slow', 'gentle', 'normal', 'aggressive', 'mouseNotch'])
    lines.push(row(`steady ${k} mean speed (m/s)`, m => m.steady[k].meanSpeedMs + (m.steady[k].routeEndAtS ? ` (end@${m.steady[k].routeEndAtS}s)` : '')));
  lines.push(row('ratio gentle:normal / aggr:normal / aggr:gentle', m => `${m.steady.ratios.gentleToNormal} / ${m.steady.ratios.aggressiveToNormal} / ${m.steady.ratios.aggressiveToGentle}`));
  for (const k of ['fling2500', 'mouse1500']) {
    lines.push(row(`${k} peak speed per-frame / 100ms (m/s)`, m => `${m.gesture[k].peakFrame} / ${m.gesture[k].peak100ms}`));
    lines.push(row(`${k} distance (m) / settle (s) / backlog at input end (m)`, m => `${m.gesture[k].distanceTravelledM} / ${m.gesture[k].settleS} / ${m.gesture[k].backlogM}`));
  }
  lines.push(row('8x120px peak (m/s) / max accel (m/s2) / stops', m => `${m.smallRepeats.peakFrame} / ${m.smallRepeats.maxAccelMs2} / ${m.smallRepeats.stopsBetweenNotches}`));
  lines.push(row('stop after normal: settle (s) / run-on (m)', m => `${m.stopAfterNormal.settleS} / ${m.stopAfterNormal.runOnM}`));
  lines.push(row('reverse: delay (s) / overshoot (m)', m => `${m.reverseAfterSustained.firstBackwardMotionDelayS} / ${m.reverseAfterSustained.overshootOldDirectionM}`));
  lines.push(row('rapid reversals: range (m) / peak (m/s) / settle (s)', m => `${m.rapidReversals.rangeM} / ${m.rapidReversals.peakSpeedMs} / ${m.rapidReversals.finalSettleS}`));
  lines.push(row('page ends: stall (s) / reverse-from-end delay (s)', m => `${m.pageEnds.longestStallWhileInputActiveS} / ${m.pageEnds.reverseFromEnd_firstMotionDelayS}`));
  console.log(lines.join('\n'));
  writeFileSync(`${OUT}/sim-scroll-pace-${FPS}hz-${VH}.md`, lines.join('\n') + '\n');
}
