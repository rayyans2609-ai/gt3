/**
 * choreography.js — the showcase montage camera script. (SPEC §10)
 *
 * OWNED BY THE MANAGER. The runner in studio.js executes this timeline; this file
 * decides what the sequence *is*. Treat it as a shot list, not code to be refactored.
 *
 * Framing contract — every position below assumes the studio has normalised the car to
 * the canonical pose that src/scene/cars.js produces:
 *   - the car faces -Z: its length runs along Z, its width along X, and it is
 *     scaled so nose to tail measures 4.6 units.
 *   - wheels sit on y = 0, the model is centred on x = 0, z = 0.
 *   - so: +X is the car's left flank, -X its right flank, -Z the nose, +Z the tail,
 *     roof at roughly y = 1.25.
 *
 * Motion rule (SPEC §14): slow, drifting, confident. Nothing snaps, nothing whip-pans.
 * Every shot is a slow push, drift or pull — the camera never cuts mid-move.
 */

/**
 * Easing curves available to shots. Named rather than inlined so the whole montage
 * shares one motion vocabulary.
 */
export const EASES = {
  // Long, confident drift — the default. Barely accelerates, settles softly.
  drift: (t) => 1 - Math.pow(1 - t, 2.6),
  // Symmetrical ease for moves that should feel weighted at both ends.
  settle: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Near-linear, for turntable rotation that must not visibly speed up or slow down.
  steady: (t) => t,
  // Slow start that keeps opening — used for the final pull-back reveal.
  reveal: (t) => 1 - Math.pow(1 - t, 3.4),
};

/**
 * The shot list.
 *
 * Each shot:
 *   id        — for logging / skip targeting
 *   duration  — seconds
 *   ease      — key into EASES, applied to the camera interpolation
 *   fov       — [from, to] degrees. Longer lenses (lower fov) for detail, wider for reveals.
 *   from/to   — camera position, world units, relative to the car at the origin
 *   lookFrom  — the point the camera aims at, at the start of the shot
 *   lookTo    — the point it aims at by the end
 *   turntable — [fromDeg, toDeg] the car's own Y rotation during the shot. The car
 *               rotates; the camera does its own move on top. Continuity across shots
 *               matters: each shot's start angle picks up where the last one ended.
 *   roll      — optional camera roll in degrees, [from, to]. Used sparingly.
 *   blend     — seconds of crossfade INTO this shot from the previous one. The first
 *               shot blends from the race view; the last blends back out to it.
 */
export const SHOTS = [
  {
    // 1 — wide 3/4 front. The establishing shot. Car turns slowly on the turntable
    // while the camera holds almost still, so the CAR is the thing that moves.
    id: 'wide-three-quarter',
    duration: 1.15,
    ease: 'drift',
    fov: [37.338235, 36.661765],
    from:     { x: -8.430228, y: 2.433824, z: -4.625460 },
    to:       { x: -8.247834, y: 2.366176, z: -4.887283 },
    lookFrom: { x: 0, y: 0.833456, z: 0 },
    lookTo:   { x: 0, y: 0.816544, z: 0 },
    turntable: [9.029412, 23.235294],
    blend: 0.2,
  },
  {
    // 2 — low tracking shot along the flank, front to rear. Camera skims the ground,
    // the car stops rotating so the move reads as pure lateral travel down the body.
    id: 'flank-tracking',
    duration: 1.0,
    ease: 'settle',
    fov: [30, 30],
    from:     { x: -4.694290, y: 0.655294, z: -0.469017 },
    to:       { x: -4.410032, y: 0.684706, z:  1.807421 },
    lookFrom: { x: -0.466160, y: 0.769412, z: -0.504954 },
    lookTo:   { x: -0.327675, y: 0.810588, z:  0.604080 },
    turntable: [23.235294, 25],
    blend: 0.16,
  },
  {
    // 3 — close detail. Rear wing and diffuser: the most distinctive, most reliably
    // well-modelled area on a GT3 car, and the one that says "race car" fastest.
    id: 'rear-wing-detail',
    duration: 0.8,
    ease: 'drift',
    fov: [25.285714, 24.714286],
    from:     { x: -1.607143, y: 1.742857, z: 4.421429 },
    to:       { x: -1.292857, y: 1.657143, z: 4.278571 },
    lookFrom: { x: -0.128571, y: 1.215714, z: 1.957143 },
    lookTo:   { x: -0.071429, y: 1.164286, z: 1.842857 },
    turntable: [25, 29],
    roll: [-1.607143, -0.892857],
    blend: 0.14,
  },
  {
    // 4 — high front three-quarter looking down over the roof and nose. Reads the
    // silhouette and the livery from above, which is how the car is seen in the race.
    id: 'roof-descend',
    duration: 0.85,
    ease: 'settle',
    fov: [33.326923, 32.673077],
    from:     { x: 4.909386, y: 3.926923, z: -3.935300 },
    to:       { x: 4.663776, y: 3.273077, z: -4.383027 },
    lookFrom: { x: 0.108993, y: 0.892788, z: -0.557719 },
    lookTo:   { x: 0.140344, y: 0.837212, z: -0.718146 },
    turntable: [29, 34.884615],
    blend: 0.15,
  },
  {
    // 5 — the pull-back. Camera eases out and tilts up to hand the whole car over,
    // then crossfades to the race view. The morph fires on this crossfade (SPEC §10.7).
    id: 'pull-back-reveal',
    duration: 1.2,
    ease: 'reveal',
    fov: [39.058824, 44],
    from:     { x: -0.447035, y: 3.7, z: -12.381464 },
    to:       { x: -0.959730, y: 4.9, z: -15.338804 },
    lookFrom: { x: 0, y: 0.961765, z: 0 },
    lookTo:   { x: 0, y: 1.05, z: 0 },
    turntable: [34.884615, 42.649321],
    blend: 0.18,
    // Crossfade back to the race, overlapping the tail of this shot.
    outroBlend: 0.8,
  },
];

/** Total runtime, derived so the runner and shot list cannot drift apart. */
export const MONTAGE_DURATION = SHOTS.reduce((total, shot) => total + shot.duration, 0);

/** Cumulative start time of each shot, seconds from montage start. */
export const SHOT_STARTS = SHOTS.reduce((acc, shot) => {
  acc.push(acc.length ? acc[acc.length - 1] + SHOTS[acc.length - 1].duration : 0);
  return acc;
}, []);

/**
 * Beat timings for everything that is not the camera, seconds from montage start.
 * Kept here so the whole sequence reads from one place.
 */
export const BEATS = {
  raceFadeOut:   { at: 0.0,  duration: 0.45 }, // race view -> studio
  backdropIn:    { at: 0.08, duration: 0.55 }, // brand colour field rises
  cardIn:        { at: 0.35, duration: 0.35 }, // info card slides up, bottom third
  cardOut:       { at: 4.05, duration: 0.35 },
  audioSwell:    { at: 0.0,  duration: 0.55 }, // background.mp3 -> 115%
  audioRestore:  { at: 4.1,  duration: 0.9 },  // back to base
  morphFire:     { at: 4.25 },                 // car swap, hidden under the crossfade
  raceFadeIn:    { at: 4.2,  duration: 0.8 },  // studio -> race view
  skipHintIn:    { at: 0.55, duration: 0.25 }, // "ESC to skip" hairline, bottom right
};

/** Resolve which shot is active at a given elapsed time, with local progress 0..1. */
export function shotAt(elapsed) {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    if (elapsed >= SHOT_STARTS[i]) {
      const local = (elapsed - SHOT_STARTS[i]) / SHOTS[i].duration;
      return { index: i, shot: SHOTS[i], local: Math.min(1, Math.max(0, local)) };
    }
  }
  return { index: 0, shot: SHOTS[0], local: 0 };
}
