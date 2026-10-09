/** Review proportions resolved once, before the shared track profile is built. */
// Conservative normalised Audi footprint incl. mirrors/wing, from GLB accessor bounds.
export const CAR_HALF_WIDTH_M = 1.412;
export const CAR_HALF_LENGTH_M = 2.3;
export const RACING_MARGIN_M = 0.6;

const SECTOR_CAMERA = {
  camera: 'sector', yawDeg: 75, pitchDeg: 52, fov: 32, distance: 140,
  railSigmaM: 300, railZone: { x: 0.55, y: 0.5 },
  engageZone: { x: 0.66, y: 0.62 }, releaseZone: { x: 0.55, y: 0.5 },
  hardZone: 0.85, correctionSeconds: 1.2, fastCorrectionSeconds: 0.3,
  maxCorrectionM: 45, dampingSeconds: 0.12,
};
const CANDIDATES = {
  base: { camera: 'legacy', yawDeg: 75, pitchDeg: 52, fov: 40, distance: 54,
    hero: 1, widthClasses: [14, 14, 14, 14], racingLine: 0 },
  a: { ...SECTOR_CAMERA, hero: 1.7, widthClasses: [9.6, 9.6, 9.6, 9.6], racingLine: 0 },
  b: { ...SECTOR_CAMERA, hero: 1.9, widthClasses: [14, 14, 14, 14], racingLine: 1 },
  c: { ...SECTOR_CAMERA, hero: 1.8, widthClasses: [12, 12, 12, 12], racingLine: 0.75 },
};
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
// All three closure proportions use EXACTLY the owner-kept r1 camera. Only
// uniform hero scale and racing-surface widths differ; infrastructure never scales.
// Four classes: technical / ordinary / braking / start-finish corridor.
const LOOKS = {
  pro: { title: 'provisional', hero: 2.7, widthClasses: [30, 32.4, 36, 40.5] },
  p1: { title: 'restrained', hero: 2.55, widthClasses: [28.333333, 30.6, 34, 38.25] },
  p2: { title: 'larger', hero: 2.85, widthClasses: [31.666667, 34.2, 38, 42.75] },
  r1: { title: 'r1 baseline', hero: 2.28, widthClasses: [16, 16, 16, 16] },
  r2: { title: 'r2 baseline', distance: 218, fov: 38, pitchDeg: 54.6,
    hero: 2.09, widthClasses: [15, 15, 15, 15] },
  r3: { title: 'r3 baseline', pitchDeg: 57.2,
    hero: 2.47, widthClasses: [17.2, 17.2, 17.2, 17.2] },
};
const OVERRIDES = { dist: ['distance', 30, 520], pitch: ['pitchDeg', 30, 80],
  fov: ['fov', 20, 60], hero: ['hero', 0.5, 3] };
function resolve() {
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const compName = (params.get('comp') || 'base').toLowerCase();
  const name = Object.hasOwn(CANDIDATES, compName) ? compName : 'base';
  const cameraName = (params.get('cam') || '').toLowerCase();
  const cameraVariant = Object.hasOwn(CAMERAS, cameraName) ? cameraName : 'leg1';
  const requested = (params.get('look') || '').toLowerCase();
  const legacy = requested === 'base';
  // Explicit old comp/cam URLs retain their meaning. '/' is the new review default.
  const look = legacy ? 'base' : Object.hasOwn(LOOKS, requested) ? requested
    : !params.has('comp') && !params.has('cam') ? 'pro' : null;
  const values = { ...CANDIDATES[name] };
  if (cameraVariant !== 'leg1') Object.assign(values, CAMERAS[cameraVariant]);
  if (look && !legacy) Object.assign(values, CANDIDATES.b, CAMERAS.glide,
    { pitchDeg: 55.64 }, LOOKS[look]);
  if (legacy) Object.assign(values, CANDIDATES.base);
  const overrides = {};
  if (import.meta.env?.DEV) for (const [key, [field, min, max]] of Object.entries(OVERRIDES)) {
    const raw = params.get(key), value = raw === null ? NaN : Number(raw);
    if (Number.isFinite(value)) overrides[field] = values[field] = Math.min(max, Math.max(min, value));
  }
  values.widthClasses = Object.freeze([...values.widthClasses]);
  values.racingLineM = values.racingLine ? 1 : 0; // activation only; profile owns metres
  values.fogScale = values.camera === 'legacy' ? 1 : values.distance / CANDIDATES.base.distance;
  values.shadowScale = values.camera === 'legacy' ? 1 : Math.min(2, values.fogScale);
  return Object.freeze({ ...values, name: look && !legacy ? 'b' : name,
    cameraVariant: look && !legacy ? 'glide' : cameraVariant, look,
    isDefault: look === 'pro' && !params.has('look') && !Object.keys(overrides).length,
    overrides: Object.freeze(overrides) });
}
export const COMP = resolve();
