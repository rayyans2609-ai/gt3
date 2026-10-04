/**
 * TEMPORARY REVIEW SCAFFOLDING (W2) — remove at composition lock.
 *
 * Named whole-composition candidates (camera + road width + hero-car scale + path)
 * for the user's live review, resolved ONCE from `?comp=` before any scene module
 * builds geometry. Pure: no scene, no three.js, safe to import from node.
 * `base` (default, no query) is today's composition and decides nothing.
 */

// Widest normalised roster footprint (scripts/lib/glb-footprint.mjs, accessor
// bounds, conservative): audi 2.82 m incl. wing/mirrors. Runtime Box3 re-check: leg 2.
export const CAR_HALF_WIDTH_M = 1.41;
const RACING_MARGIN_M = 0.6;   // scaled body to road edge
const RACING_YAW_ALLOWANCE_M = 0.3; // footprint growth from path-vs-road heading

const SECTOR_CAMERA = {
  camera: 'sector', yawDeg: 75, pitchDeg: 52, fov: 32, distance: 140,
  // Rail: wrapped Gaussian of the car path (σ, m), then an elastic band that keeps the
  // car's scaled bounds inside `railZone` (NDC) — geography first, framing second.
  railSigmaM: 300, railZone: { x: 0.55, y: 0.5 },
  // Live last-resort layer: engage at the outer zone, release inside the inner zone.
  engageZone: { x: 0.66, y: 0.62 }, releaseZone: { x: 0.55, y: 0.5 },
  hardZone: 0.85, correctionSeconds: 1.2, fastCorrectionSeconds: 0.3,
  maxCorrectionM: 45, dampingSeconds: 0.12,
};

const CANDIDATES = {
  base: { camera: 'legacy', yawDeg: 75, pitchDeg: 52, fov: 40, distance: 54,
    hero: 1, halfWidth: 7, racingLine: 0 },
  a: { ...SECTOR_CAMERA, hero: 1.7, halfWidth: 4.8, racingLine: 0 },
  b: { ...SECTOR_CAMERA, hero: 1.9, halfWidth: 7, racingLine: 1 },
  // ≈60 % of b's amplitude on a 12 m road (0.75 × its own clamp ≈ 2.4 m vs b 3.4 m).
  c: { ...SECTOR_CAMERA, hero: 1.8, halfWidth: 6, racingLine: 0.75 },
};

const OVERRIDES = { dist: ['distance', 30, 320], pitch: ['pitchDeg', 30, 80],
  fov: ['fov', 20, 60], hero: ['hero', 0.5, 3], hw: ['halfWidth', 3.5, 9] };

function resolve() {
  const params = typeof location === 'undefined'
    ? new URLSearchParams() : new URLSearchParams(location.search);
  const requested = (params.get('comp') || 'base').toLowerCase();
  const name = Object.hasOwn(CANDIDATES, requested) ? requested : 'base';
  const values = { ...CANDIDATES[name] };
  const overrides = {};
  // Numeric overrides are dev-only live-tuning aids, validated and clamped.
  const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
  if (dev) {
    for (const [key, [field, min, max]] of Object.entries(OVERRIDES)) {
      const raw = params.get(key);
      const value = raw === null ? NaN : Number(raw);
      if (!Number.isFinite(value)) continue;
      values[field] = Math.min(max, Math.max(min, value));
      overrides[field] = values[field];
    }
  }
  const scaledHalfWidth = CAR_HALF_WIDTH_M * values.hero;
  values.racingLineM = values.racingLine > 0 ? Math.max(0, values.racingLine
    * (values.halfWidth - scaledHalfWidth - RACING_MARGIN_M - RACING_YAW_ALLOWANCE_M)) : 0;
  // Fog keeps today's fog-to-subject relationship as the camera pulls back.
  values.fogScale = values.camera === 'legacy' ? 1 : values.distance / CANDIDATES.base.distance;
  values.shadowScale = values.camera === 'legacy' ? 1 : Math.min(2, values.fogScale);
  return Object.freeze({ name, isDefault: name === 'base' && !Object.keys(overrides).length,
    ...values, overrides: Object.freeze(overrides) });
}

export const COMP = resolve();
