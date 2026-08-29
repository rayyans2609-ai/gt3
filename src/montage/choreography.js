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
    duration: 2.0,
    ease: 'drift',
    fov: [37.588235, 36.411765],
    from:     { x: -8.497634, y: 2.458824, z: -4.528699 },
    to:       { x: -8.180428, y: 2.341176, z: -4.984044 },
    lookFrom: { x: 0, y: 0.839706, z: 0 },
    lookTo:   { x: 0, y: 0.810294, z: 0 },
    turntable: [9.029412, 33.735294],
    blend: 0.25,
  },
  {
    // 2 — close detail. Rear wing and diffuser: the most distinctive, most reliably
    // well-modelled area on a GT3 car, and the one that says "race car" fastest.
    id: 'rear-wing-detail',
    duration: 1.8,
    ease: 'drift',
    fov: [25.642856, 24.357144],
    from:     { x: -1.803572, y: 1.796428, z: 4.510715 },
    to:       { x: -1.096428, y: 1.603572, z: 4.189285 },
    lookFrom: { x: -0.164285, y: 1.247856, z: 2.028572 },
    lookTo:   { x: -0.035715, y: 1.132143, z: 1.771428 },
    turntable: [33.735294, 42.735294],
    roll: [-2.053572, -0.446428],
    blend: 0.3,
  },
  {
    // 3 — the pull-back. Camera eases out and tilts up to hand the whole car over,
    // then crossfades to the race view. The morph fires on this crossfade (SPEC §10.7).
    id: 'pull-back-reveal',
    duration: 2.2,
    ease: 'reveal',
    fov: [37.000001, 46.058823],
    from:     { x: -0.233412, y: 3.2, z: -11.149239 },
    to:       { x: -1.173353, y: 5.4, z: -16.571029 },
    lookFrom: { x: 0, y: 0.925, z: 0 },
    lookTo:   { x: 0, y: 1.086765, z: 0 },
    turntable: [42.735294, 56.970588],
    blend: 0.3,
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
  cardOut:       { at: 5.05, duration: 0.35 },
  audioSwell:    { at: 0.0,  duration: 0.55 }, // background.mp3 -> 115%
  audioRestore:  { at: 5.1,  duration: 0.9 },  // back to base
  // The morph runs 0.85s (DURATION in src/scene/morph.js). It must start WITH the
  // outgoing crossfade and finish before the montage ends, or the tail of the car swap
  // plays in full view of the returned race. 5.10 + 0.85 = 5.95, inside the 6.00 end.
  morphFire:     { at: 5.10 },                 // car swap, hidden under the crossfade
  raceFadeIn:    { at: 5.10,  duration: 0.90 },  // studio -> race view
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
