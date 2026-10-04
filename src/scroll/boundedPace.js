/**
 * boundedPace.js — pure route-motion models for the `?scroll=` pace candidates. (SPEC §14 "Bounded pace")
 *
 * No DOM, no state, no three.js: scrollDrive.js owns the input plumbing (it measures how far the
 * page scrolled each frame and feeds that here as `addInput`); the node simulation in
 * scripts/sim-scroll-pace.mjs drives the same module through scrollDrive.js.
 *
 * Shared structure (both candidates):
 *   - Input is *credit*, not position: each frame's page-scroll delta is converted to route metres
 *     (px * metres-per-px * inputGain) and added to a signed `credit` = how far ahead (+) / behind (-)
 *     the car is allowed to travel. Credit is clamped to +-maxLead: input beyond that is DISCARDED,
 *     never banked, so one big gesture cannot launch the car.
 *   - Opposite-sign input drops the old credit immediately (direction follows input at once).
 *   - The car moves toward the credit target at a model-chosen desired speed, with bounded
 *     acceleration (aUp) and bounded deceleration/reversal (aBrake), and always keeps enough brake
 *     distance to stop exactly where its credit runs out (sqrt(2*aBrake*|credit|)).
 *   - The car only ever moves by consuming credit, so with no input it stops within <= maxLead metres.
 *
 * Differences:
 *   cap  — desired speed = |credit| / tau (proportional follower, like the default but with a
 *          bounded lead), hard ceiling vMax.  Gentle input is slow, hard input saturates at vMax.
 *   pace — desired speed is set by the smoothed *intensity* of recent input through a compressive
 *          (logarithmic) curve into a narrow band, around a slower default pace.
 */

export const BOUNDED_MODELS = {
  cap: {
    inputGain: 0.7,      // route metres per default-metre of input: ~1.43x less distance per input (SPEC +30-50% time/distance between events)
    maxLead: 55,         // m   max credit either way; excess input discarded
    vMax: 200,           // m/s hard speed ceiling
    tau: 0.20,           // s   follower time constant: desired speed = credit / tau
    aUp: 500,            // m/s^2 speeding up
    aBrake: 1100,        // m/s^2 slowing down / reversing
  },
  pace: {
    inputGain: 0.7,
    maxLead: 55,
    normalSpeed: 150,    // m/s  pace at "normal" intensity (factor 1)
    normalRate: 3750,    // px/s input intensity that maps to factor 1
    curve: 0.30,         // factor = 1 + curve * ln(rate / normalRate)
    factorMin: 0.55,     // narrow band: gentle ~0.55-0.7x ...
    factorMax: 1.35,     // ... aggressive capped at 1.35x  (ceiling = normalSpeed * factorMax = 202.5 m/s)
    rateTau: 0.15,       // s    smoothing of the intensity estimate
    aUp: 420,
    aBrake: 1100,
  },
};

const MAX_DT = 0.05;

export function paceFactor(cfg, ratePxPerSec) {
  const r = Math.max(ratePxPerSec, 1);
  const f = 1 + cfg.curve * Math.log(r / cfg.normalRate);
  return Math.min(cfg.factorMax, Math.max(cfg.factorMin, f));
}

export function speedCeiling(kind, cfg = BOUNDED_MODELS[kind]) {
  return kind === 'cap' ? cfg.vMax : cfg.normalSpeed * cfg.factorMax;
}

/** kind: 'cap' | 'pace'. routeLength in metres. */
export function createBoundedModel(kind, routeLength, overrides = {}) {
  const cfg = { ...BOUNDED_MODELS[kind], ...overrides };
  if (!BOUNDED_MODELS[kind]) throw new Error(`unknown bounded model ${kind}`);

  const m = {
    kind, cfg,
    p: 0,            // car position, metres along route
    v: 0,            // car signed speed, m/s
    credit: 0,       // signed metres still available to travel; target = p + credit
    rate: 0,         // smoothed input intensity, px/s (pace only reads it)
    idle: 1e9,       // seconds since last non-zero input
    discarded: 0,    // metres of input discarded by the lead bound (diagnostic)
    pendingPx: 0,
    mPerPx: 0,
    seeking: false,   // programmatic glide in progress (credit exempt from maxLead)
  };

  /** Queue page-scroll delta (px) observed this frame. mPerPx = routeLength / maxScroll. */
  m.addInput = (dyPx, mPerPx) => { m.pendingPx += dyPx; m.mPerPx = mPerPx; };

  /** Hard reset to position `meters` with no motion, no credit, no input memory. */
  m.reset = meters => {
    m.p = Math.min(routeLength, Math.max(0, meters));
    m.v = 0; m.credit = 0; m.rate = 0; m.idle = 1e9; m.pendingPx = 0; m.seeking = false;
  };

  /** Programmatic glide to `meters`, exempt from the lead bound (cancelled by the next user input). */
  m.seek = meters => {
    m.credit = Math.min(routeLength, Math.max(0, meters)) - m.p;
    m.seeking = m.credit !== 0;
    m.pendingPx = 0;
  };

  m.targetMeters = () => m.p + m.credit;

  m.step = dt => {
    dt = Math.min(MAX_DT, Math.max(0, dt));
    if (dt <= 0) return;

    const dy = m.pendingPx;
    m.pendingPx = 0;
    if (dy !== 0 && m.mPerPx > 0) {
      m.idle = 0;
      const dm = dy * m.mPerPx * cfg.inputGain;
      if (m.seeking) { m.seeking = false; m.credit = 0; }           // user input cancels a seek glide
      if (dm * m.credit < 0) m.credit = 0;                          // reversal: drop opposite credit
      const wanted = m.credit + dm;
      let bounded = Math.min(cfg.maxLead, Math.max(-cfg.maxLead, wanted));
      bounded = Math.min(routeLength - m.p, Math.max(-m.p, bounded)); // never beyond either end
      m.discarded += Math.abs(wanted - bounded);
      m.credit = bounded;
    } else {
      m.idle += dt;
    }

    // Input intensity estimate (px/s), exponential smoothing; decays to 0 when input stops.
    const inst = dy === 0 ? 0 : Math.abs(dy) / dt;
    if (kind === 'pace') m.rate += (inst - m.rate) * (1 - Math.exp(-dt / cfg.rateTau));

    // Desired speed.
    const gap = Math.abs(m.credit);
    const dir = Math.sign(m.credit);
    const brakeLimit = Math.sqrt(2 * cfg.aBrake * gap);
    let desired;
    if (kind === 'cap') desired = Math.min(cfg.vMax, gap / cfg.tau, brakeLimit);
    else desired = Math.min(cfg.normalSpeed * (m.seeking ? 1 : paceFactor(cfg, m.rate)), brakeLimit);
    desired *= dir;

    // Bounded acceleration. Opposing the current motion (or slowing) uses aBrake.
    const slowing = m.v * desired < 0 || Math.abs(desired) < Math.abs(m.v);
    const a = (slowing ? cfg.aBrake : cfg.aUp) * dt;
    m.v += Math.min(a, Math.max(-a, desired - m.v));

    // Move. The car only moves while it holds credit; it never lands past the credit target when
    // closing on it, but may carry bounded momentum past it when a reversal drops the old credit
    // (<= v^2 / (2 * aBrake), ~18 m at the 200 m/s ceiling), which `credit` then accounts for.
    let move = 0;
    if (dir === 0) {
      m.v = 0;
    } else {
      move = m.v * dt;
      if (Math.sign(move) === dir && Math.abs(move) >= gap) move = m.credit;   // land exactly
    }
    const before = m.p;
    m.p = Math.min(routeLength, Math.max(0, m.p + move));
    move = m.p - before;                              // route ends clamp the move
    m.credit -= move;
    if (Math.abs(m.credit) < 1e-3 || m.p <= 0 || m.p >= routeLength) {
      m.credit = 0;
      if (dy === 0 || m.p <= 0 || m.p >= routeLength) m.v = 0;
      m.seeking = false;
    }
    if (m.seeking && Math.abs(m.credit) < 1e-3) m.seeking = false;
  };

  return m;
}
