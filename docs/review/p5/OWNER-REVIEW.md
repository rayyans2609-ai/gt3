# Phase 5 Hub — owner review package (candidate, NOT accepted)

**Status:** a functional, visually reviewable Hub candidate on branch `p5-hub-candidate` (run `p5-hub`, opus-led, Intel). Not pushed, not merged, not human-accepted. All visual direction is provisional until your review.

## Try it live
```
cd ~/Desktop/gt3/.claude/worktrees/bridge-cse_018B74G4pYvqAYFFYJiRou5p
npm run dev        # open http://localhost:5173 in a NEW tab (a new session starts on the Landing)
```
- Scroll down through the Landing into the Hub, and back up to reverse it (Phase 4 behaviour, unchanged).
- **Direction A, Plan** (default): `http://localhost:5173/`
- **Direction B, Launch**: `http://localhost:5173/?hub=launch`
- Both run on the same Hub contract, player, Cars data, audio and entry flow; only the creative direction differs.

## The two directions (fresh, per your 2026-11-04 correction; the old boards were not used)

**A — Plan.** GT3's own circuit is the hero. It is drawn like an architect's site plan: two hairline road edges, the start/finish checker and nine checkpoint ticks. The projection runs through the Grand Tour camera's fixed orientation, so the drawing already sees the circuit the way the Tour will. The plan fits GT3's white architectural-maquette world (SPEC §16).
- *Loading* (SPEC §25): the circuit is drawn as far as the route is prepared, and START RACE stays ghosted until it is ready.
- *START RACE hover:* the words lean into the selective oblique (SPEC §12), a hairline draws from them to the start line, and one light lap runs the circuit.
- *START RACE:* the words lift away, then the plan dives onto your place on the route. It is fitted to the live, projected road, so its two lines land on the real road edges, and the Tour frame takes over underneath before the start lights. Home reverses it: the drawing rises out of the road back to the plan.
- *Cars:* the checkpoint ticks carry discovery (accent once found). Cars names each checkpoint's car on the plan, or `?` if undiscovered (SPEC §11, §26).

**B — Launch.** Typographic and kinetic. START RACE runs edge to edge as one word on the lower third.
- *Loading:* the letters turn solid as the route prepares.
- *Pointer:* letters near the pointer lean forward, like speed passing through them.
- *START RACE:* the letters get away one after another, and the field wipes out after them; home wipes it back.
- *Cars* opens a short roster (names or `?`). The player is a column object with a larger cover.

## Implemented (both directions unless noted)
- Hub composition with START RACE as the primary action, Cars, the global Day/Night control and speaker (master mute) in the edge row. The Hub player replaces the `+` launcher while the Hub owns the screen (SPEC §5, §8, §9, §13).
- Integrated Hub player: supplied cover art (shown as supplied, labels stay `track_N`), label, mono clock, seek with direct scrub, previous/play/next, music mute, and a track list that recomposes the same object (GSAP Flip; the cover recedes, the six tracks take its space, the footprint holds).
- Master / Music / Engine levels in the Hub player and the compact Tour player (your Music/Engine clarification). Mutes stay independent; levels persist for the session.
- Mix pass (provisional; please listen): one `MIX` table, levels set from measured loudness. Checkpoint +8.3 dB (it sat ~10 dB under the music), engine idle +4.8 dB, engine start −4.4 dB (it sat over the music), finish +1.6 dB. Music, fades and ducking are unchanged; a future sound swap is one filename plus one level.
- Standing-start entry (Sol): five lamps, a random hold, lights out, GO, then one thicker SCROLL TO RACE control. The drive is locked through the reds (nothing stored) and armed at lights-out. A mid-route re-entry runs no lamps. A refresh into the Tour shows a new loading cover instead of the legacy start card.
- A refresh into the Hub restores it with its loading state, without flashing the Landing type.
- GSAP runs inside GT3's single frame loop. Its own ticker never runs a frame (proven by a harness, below).

## Images (1440×900, Chrome/Metal headless, Intel)
- Plan: `plan-day-rest`, `plan-night-rest`, `plan-day-loading` (route 15 % prepared), `plan-day-hover` (lean, leader, lap light), `plan-day-list` / `plan-night-list` (track list recomposed), `plan-day-cars` / `plan-night-cars`.
- Plan dive into the Tour: `planflow-day-launch-600` → `-1000` → `-1400` (the drawing lands on the road, then the Tour frame and the lamps).
- Launch: `launch-day-rest`, `launch-night-rest`, `launch-night-loading`, `launchflow-day-hover` (pointer lean), `launchflow-day-launch-450` / `-750` (letters leave, field wipes).
- Entry lamps/GO/SCROLL TO RACE (Day and Night): `local/evidence/p5/entry/` (local only).
- Stills can't show motion; please judge the moves live.

## Verified (machine; provenance-stamped under `local/evidence/p5/`)
Gate on the reworked Hub (`ce48cc0` + harness-only fixes `2bda009`):
- `verify-landing-flow`: PASS (Landing never moves the route, Hub holds, reverse, START RACE carries no momentum, Tour drives, refresh restores, Tour→Hub→Tour keeps route and discoveries, theme mid-transition, scroll never starts audio).
- `verify-entry-sequence` (new): PASS. Five lamps light in order, wheel input during the reds moves nothing, lights-out arms the drive, SCROLL TO RACE leaves on the first scroll, home during the reds cancels cleanly and a second START RACE replays, a mid-route refresh shows the cover then the control without lamps, and the Sound cue appears once.
- `verify-audio-lifecycle`: 12/12 PASS (Landing/Hub/Tour gestures, music continuity Tour→Hub, repeated re-entry, independent mutes, refresh, rapid start/home, race effects scoped to the Tour). One expectation updated for the deliberate idle level.
- `verify-controls`: PASS (Tour edge row and compact player with the new level rows).
- `verify-motion-ticker` (new): PASS. 0 GSAP-owned frames ever run; all Hub motion is driven by GT3's loop.
- Before the Hub rework, on the same entry code (`ece4f8d`): `verify-preready-input` PASS and `verify-route-persistence` PASS.
- `npm run build`: PASS.

## Not verified / known limits
- **Subjective quality is yours:** composition, motion feel, timing and both directions.
- Intel host only; nothing has been run on the M4. Motion frames are headless screenshots with capture latency, not timed recordings.
- The Plan dive re-rasterises the SVG each frame for about 1.5 s. Frame pacing during the dive is unmeasured on the Intel GPU; at rest it costs nothing.
- The Launch direction (`?hub=launch`) was exercised by captures, not by the flow harnesses, which use the default direction.
- `verify-preready-input` and `verify-route-persistence` were not re-run after the Hub rework. The refresh paths they cover were re-exercised by landing-flow and entry on the new code.
- Reduced-motion paths are implemented but not harness-tested. The production preview and bundle size were not re-measured after adding GSAP plugins.
- Not done (needs your input or assets): a separate SFX level control (you called it secondary), engine-sound improvements and replacement SFX, and the Phase 6 Showcase that Cars will eventually open.

## Decisions for you (visual judgement or product)
1. **Direction:** A Plan, B Launch, or a hybrid (for example the Plan with Launch's kinetic type).
2. **Plan details:** the oblique "camera-view" projection (vs a flat top-down plan); dive length (~1.5 s) and when the Tour fades in; the hover leader and lap light; car names on the plan as the Cars view.
3. **Cars before Showcase exists (decision D6):** provisional. Plan shows names on the checkpoints; Launch shows a short roster. Neither opens a Showcase (Phase 6).
4. **Levels:** Master, Music and Engine sliders in both the Hub player and the compact Tour player (SPEC §7 master/music, plus your Engine clarification). Keep Master? Add an SFX level later?
5. **Mix (listen):** checkpoint +8.3 dB, engine idle +4.8 dB, engine start −4.4 dB, finish +1.6 dB. Tracks 4 and 6 are ~3.5 dB quieter than the others; nothing was changed there.
6. **Entry timing:** lamps every 600 ms, random hold 0.5–1.3 s, GO 0.52 s. The lamps are silent (no new SFX), and they run only from a standing start; mid-route re-entry goes straight to driving.
7. **Copy:** "Start race" (the SPEC's working label), "Preparing the grid NN%", "Route unavailable. Reload the page to try again."
8. **Edge row in the Hub:** the `+` launcher is hidden because the Hub player is on screen; the speaker and Day/Night stay.
