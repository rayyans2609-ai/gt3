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

// Independent leg-2 camera range. Omitted/invalid ?cam= preserves leg-1 exactly.
// Broad framing is necessary to observe a whole corner from one position; road,
// path and hero scale remain owned by ?comp=. All are review candidates.
const CAMERAS = {
  glide: { camera: 'corridor', distance: 240, fov: 40, pitchDeg: 52,
    railSigmaM: 300, railZone: { x: 0.74, y: 0.72 }, anchorCorners: false },
  hold: { camera: 'corridor', distance: 320, fov: 40, pitchDeg: 52,
    railSigmaM: 300, railZone: { x: 0.76, y: 0.74 }, anchorCorners: true },
  wide: { camera: 'corridor', distance: 440, fov: 48, pitchDeg: 52,
    railSigmaM: 350, railZone: { x: 0.76, y: 0.74 }, anchorCorners: true },
  soft: { camera: 'corridor', distance: 400, fov: 40, pitchDeg: 52,
    railSigmaM: 300, railZone: { x: 0.76, y: 0.74 }, anchorCorners: false,
    speedWeight: 0.05, cornerWeight: 10, cornerEaseM: 120 },
};

// Phase-3 closure: coupled B/glide compositions, not independent tuning knobs.
// Road growth accommodates both the larger hero and the stronger ordinary line.
// Curb events are compact windows on genuine apexes (+lateral = left).
const HAIRPIN_CURB = { name: 'hairpin', t: 0.283, side: 1, radiusM: 65 };
const CHICANE_CURB = { name: 'chicane-exit', t: 0.365, side: 1, radiusM: 70 };
const LOOKS = {
  r1: { title: 'glide+', distance: 240, fov: 40, pitchDeg: 55.64,
    hero: 2.28, halfWidth: 8, lineGain: 1.15, curbCorners: [HAIRPIN_CURB] },
  r2: { title: 'closer', distance: 218, fov: 38, pitchDeg: 54.6,
    hero: 2.09, halfWidth: 7.5, lineGain: 1.1, curbCorners: [HAIRPIN_CURB] },
  r3: { title: 'bold', distance: 240, fov: 40, pitchDeg: 57.2,
    hero: 2.47, halfWidth: 8.6, lineGain: 1.2, curbCorners: [HAIRPIN_CURB, CHICANE_CURB] },
};

const OVERRIDES = { dist: ['distance', 30, 520], pitch: ['pitchDeg', 30, 80],
  fov: ['fov', 20, 60], hero: ['hero', 0.5, 3], hw: ['halfWidth', 3.5, 9] };

function resolve() {
  const params = typeof location === 'undefined'
    ? new URLSearchParams() : new URLSearchParams(location.search);
  const requested = (params.get('comp') || 'base').toLowerCase();
  const name = Object.hasOwn(CANDIDATES, requested) ? requested : 'base';
  const values = { ...CANDIDATES[name] };
  const requestedCamera = (params.get('cam') || '').toLowerCase();
  const cameraVariant = Object.hasOwn(CAMERAS, requestedCamera) ? requestedCamera : 'leg1';
  if (cameraVariant !== 'leg1') Object.assign(values, CAMERAS[cameraVariant]);
  const requestedLook = (params.get('look') || '').toLowerCase();
  const look = Object.hasOwn(LOOKS, requestedLook) ? requestedLook : null;
  // A valid look owns the whole composition; comp/cam keep their old meaning
  // when look is omitted or invalid. Numeric dev overrides still apply last.
  if (look) Object.assign(values, CANDIDATES.b, CAMERAS.glide, LOOKS[look]);
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
  if (look) {
    values.racingLineM = (7 - CAR_HALF_WIDTH_M * 1.9 - RACING_MARGIN_M - RACING_YAW_ALLOWANCE_M) * values.lineGain;
    // Target puts a nominal 1.8 m tyre footprint just onto the inner curb.
    // The largest roster body + yaw envelope must remain on the wide curb.
    values.curbLateralM = Math.min(values.halfWidth - 0.9 * values.hero + 0.18,
      values.halfWidth + 2.6 - scaledHalfWidth - 0.65);
    values.racingLineMaxM = Math.max(values.racingLineM, values.curbLateralM);
    values.curbCorners = Object.freeze(values.curbCorners.map(c => Object.freeze({ ...c })));
  }
  // Fog keeps today's fog-to-subject relationship as the camera pulls back.
  values.fogScale = values.camera === 'legacy' ? 1 : values.distance / CANDIDATES.base.distance;
  values.shadowScale = values.camera === 'legacy' ? 1 : Math.min(2, values.fogScale);
  return Object.freeze({ name: look ? 'b' : name, cameraVariant: look ? 'glide' : cameraVariant,
    ...(look ? { look } : {}),
    isDefault: !look && name === 'base' && cameraVariant === 'leg1' && !Object.keys(overrides).length,
    ...values, overrides: Object.freeze(overrides) });
}

export const COMP = resolve();
