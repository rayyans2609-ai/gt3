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

/** Total runtime of the sequence in seconds. Spec ceiling is 18s; this sits at 15.6. */
export const MONTAGE_DURATION = 15.6;

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
    duration: 3.4,
    ease: 'drift',
    fov: [38, 36],
    from:     { x: -6.2, y: 2.5, z: -7.4 },
    to:       { x: -5.4, y: 2.3, z: -7.9 },
    lookFrom: { x: 0, y: 0.85, z: 0 },
    lookTo:   { x: 0, y: 0.80, z: 0 },
    turntable: [-28, 14],
    blend: 0.9,
  },
  {
    // 2 — low tracking shot along the flank, front to rear. Camera skims the ground,
    // the car stops rotating so the move reads as pure lateral travel down the body.
    id: 'flank-tracking',
    duration: 3.4,
    ease: 'settle',
    fov: [30, 30],
    from:     { x: -4.6, y: 0.62, z: -3.8 },
    to:       { x: -4.6, y: 0.72, z:  4.0 },
    lookFrom: { x: -0.4, y: 0.72, z: -1.9 },
    lookTo:   { x: -0.4, y: 0.86, z:  1.9 },
    turntable: [14, 20],
    blend: 0.55,
  },
  {
    // 3 — close detail. Rear wing and diffuser: the most distinctive, most reliably
    // well-modelled area on a GT3 car, and the one that says "race car" fastest.
    id: 'rear-wing-detail',
    duration: 2.8,
    ease: 'drift',
    fov: [26, 24],
    from:     { x: -2.0, y: 1.85, z:  4.6 },
    to:       { x: -0.9, y: 1.55, z:  4.1 },
    lookFrom: { x: -0.2, y: 1.28, z:  2.1 },
    lookTo:   { x:  0.0, y: 1.10, z:  1.7 },
    turntable: [20, 34],
    roll: [-2.5, 0],
    blend: 0.5,
  },
  {
    // 4 — high front three-quarter looking down over the roof and nose. Reads the
    // silhouette and the livery from above, which is how the car is seen in the race.
    id: 'roof-descend',
    duration: 2.6,
    ease: 'settle',
    fov: [34, 32],
    from:     { x:  4.4, y: 4.6, z: -4.4 },
    to:       { x:  3.4, y: 2.6, z: -5.6 },
    lookFrom: { x: 0, y: 0.95, z: -0.4 },
    lookTo:   { x: 0, y: 0.78, z: -0.9 },
    turntable: [34, 52],
    blend: 0.5,
  },
  {
    // 5 — the pull-back. Camera eases out and tilts up to hand the whole car over,
    // then crossfades to the race view. The morph fires on this crossfade (SPEC §10.7).
    id: 'pull-back-reveal',
    duration: 3.4,
    ease: 'reveal',
    fov: [30, 44],
    from:     { x: -3.2, y: 1.5, z: -6.2 },
    to:       { x: -8.8, y: 4.9, z: -12.6 },
    lookFrom: { x: 0, y: 0.80, z: 0 },
    lookTo:   { x: 0, y: 1.05, z: 0 },
    turntable: [52, 74],
    blend: 0.6,
    // Crossfade back to the race, overlapping the tail of this shot.
    outroBlend: 1.0,
  },
];

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
  raceFadeOut:   { at: 0.0,  duration: 0.9 },  // race view -> studio
  backdropIn:    { at: 0.15, duration: 1.1 },  // brand colour field rises
  cardIn:        { at: 1.5,  duration: 0.8 },  // info card slides up, bottom third
  cardOut:       { at: 13.4, duration: 0.7 },
  audioSwell:    { at: 0.0,  duration: 1.2 },  // background.mp3 -> 115%
  audioRestore:  { at: 14.2, duration: 1.4 },  // back to base
  morphFire:     { at: 14.6 },                 // car swap, hidden under the crossfade
  raceFadeIn:    { at: 14.6, duration: 1.0 },  // studio -> race view
  skipHintIn:    { at: 2.0,  duration: 0.5 },  // "ESC to skip" hairline, bottom right
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
