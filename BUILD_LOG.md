# BUILD LOG — GT3: A Grand Tour

Manager: Claude Opus 5. Executor: Codex CLI (gpt-5.6-sol) via `codex exec`.
NOTE: `codex-executor` MCP server failed to connect (CONNECTION_CLOSED);
delegation runs through the `codex` CLI in Bash instead. Same quota, same split.

## Asset audit (2026-08-28)
- models/: 10/10 GLB present, correctly named. 270 MB total -> needs compression.
- audios/: 6/6 SFX present.
- audios/voices/: MISSING. 10 ElevenLabs narration MP3s not supplied.
  Mitigation: scripts written to audios/voices/SCRIPTS.md; Showcase Mode
  degrades gracefully (silent, pause button disabled) until files are added.

## Status
| # | Task | Owner | State |
|---|------|-------|-------|
| 0a | GLB compression pipeline | Codex | DONE — 257 MB -> 28 MB, every file < 4.5 MB |
| 0b | Vite scaffold, HTML shell, CSS tokens | Codex | DONE |
| 1a | src/data/cars.js roster | Codex | DONE (2nd attempt; 1st died before writing) |
| M1 | src/scroll/scrollDrive.js | Manager | DONE |
| M2 | src/scene/trackCurve.js | Manager | DONE |
| M3 | src/montage/choreography.js | Manager | DONE — 5 shots, 15.6 s |
| M4 | src/scene/carRig.js | Manager | DONE — camera hierarchy + framing |
| M5 | src/scene/morph.js | Manager | DONE — 0.85 s, 3-phase cross-fade |
| M6 | src/main.js integration | Manager | DONE — full wiring |
| 2a | sceneSetup (renderer/camera/postfx) | Codex | DONE |
| 2b | track (asphalt/markings/curbs) | Codex | DONE — 70.9k tris, 4 merged meshes |
| 2c | environment (grass/sky/dressing) | Codex | DONE |
| 3a | cars loader | Codex | DONE — but see orientation note below |
| 3b | coins | Codex | DONE |
| 4a | audioManager | Codex | DONE |
| 4c | environment visual fixes | Codex | DONE — trees seated, grass rolling |
| 5a | HUD + spec panel | Codex | DONE |
| 5b | timeOfDay + finishLine + todSelector | Codex | DONE |
| 6a | montage studio | Codex | DONE |
| 7a | showcase + fullscreen card | Codex | in flight |
| 7b | start + finish screens | Codex | in flight |
| 7c | Wikimedia images + narration scripts | Codex | in flight |
| QA | end-to-end visual/interaction pass | Manager | next |

## Review notes (manager)
- ALBEDO: the design-system palette hexes describe how a surface should LOOK once lit,
  not its albedo. Feeding #26262A/#1E3A2A straight into MeshStandardMaterial rendered
  the whole scene black (0.018 linear). Albedos were lifted so the LIT result lands on
  the intended tone. Do not "fix" the palette by pushing these back down.
- CAR ORIENTATION: the loader's mass-distribution heuristic for nose/tail was a coin
  flip — most models returned identical half-volumes to 4 dp, so five of ten cars drove
  backwards. Replaced with an explicit table verified by rendering all ten in side
  profile (carcheck.html). All ten Sketchfab models are authored nose-toward +Z.
- CAMERA: a literal 45 deg view pitch cannot show a horizon at this FOV — the top of
  frame lands on ground ~190 units out. Resolved by separating the two angles: the rig
  sits at 41.6 deg above the car (the spec's bird's-eye) while AIMING at 27 deg, which
  keeps the car at ~0.78 screen height and puts the top of frame ~880 units out, where
  fog resolves it into haze. Documented in carRig.js.
- studio.js creates its OWN WebGLRenderer rather than sharing sceneSetup's. Works, but
  it is a second GL context; flagged for the polish pass.

## Known gaps
- audios/voices/ is empty by design. Showcase Mode degrades gracefully; scripts for the
  ten narrations are generated to audios/voices/SCRIPTS.md.

## PAUSED 2026-08-28 — awaiting Codex quota refresh (18:14)
Work stopped by request. No Codex jobs running. Nothing in flight. Build is green.

Resume here:
1. QA defects found so far (not yet fixed):
   - The asphalt ribbon ENDS abruptly behind the start line and at the finish. Needs a
     straight apron extending ~80 units beyond t=0 and t=1 along the end tangents,
     reusing the existing track materials. Contained fix in track.js; do NOT change the
     t semantics that coins.js and finishLine.js depend on.
   - qa.mjs reported scrollY 2574 after scrolling to progress 1.0 (expected ~9900),
     which means something is holding the scroll lock — most likely the montage or the
     finish screen not releasing it on one exit path. Trace lockScroll/unlockScroll
     pairing across studio.js, showcase.js, fullscreenCard.js, finishScreen.js.
   - A persistent 404 on load (unidentified, likely favicon). Harmless but should be closed.
   - Possible hard-edged shadow band across the grass — verify whether it is the sun's
     orthographic shadow-camera boundary and widen or fade it if so.
2. Screenshots from the sweep are in /tmp/qa_01_start.png .. /tmp/qa_11_finish.png.
   Reviewed so far: 01 (start screen — good) and 05 (montage — good). 02,03,04,06-11 NOT
   yet reviewed.
3. Still outstanding from the spec:
   - Wikimedia images: scripts/fetch-images.mjs and src/data/carImages.js were NOT
     produced (Codex hit its quota mid-task). public/images/ has empty audi/ and ferrari/
     dirs. Nothing imports carImages.js, so the build is unaffected.
   - Final polish pass and the remaining end-to-end interaction QA.
4. audios/voices/ still intentionally empty; SCRIPTS.md and README.md are written.
   Showcase Mode degrades gracefully — preserve that.

Delegation note: Codex CLI is invoked via
  codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "$(cat brief.md)"
Briefs are kept in the session scratchpad; the pattern is documented at the top of this log.
