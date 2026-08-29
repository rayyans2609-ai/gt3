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

## SESSION 2 — 2026-08-28 evening (Codex quota refreshed)

### Codex CLI invocation (VERIFIED — do not guess these flags)
    codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check \
      -m <model> -c model_reasoning_effort="<effort>" "$(cat brief.md)" < /dev/null

- Models: `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`. Efforts: low|medium|high|xhigh|max.
- IMPORTANT: `~/.codex/config.toml` defaults to `gpt-5.6-sol` + medium. Omitting `-m` silently
  runs Sol. Always pass `-m` explicitly.
- The run header echoes `model:` and `reasoning effort:` — grep it to confirm routing.
- The `codex-executor` MCP server is still CONNECTION_CLOSED; the CLI is the path.
- macOS has no `timeout`; don't use it. Scripts using puppeteer must live inside the repo
  (`scripts/`) so node resolves `puppeteer-core` from node_modules.

### Accepted this session
| Job | Tier | What |
|-----|------|------|
| A | Terra | `src/styles/showcase.css` — was a 73-byte stub; Showcase rendered as unstyled text |
| B | Terra | Track aprons past t=0/t=1 (80 units, 24 tris) |
| C | Luna | Favicon — closed the load 404 |
| D | Terra | Coin albedo #C6A96B -> #FFDE6E + fresnel brand rim |
| E | Terra | `src/styles/fullscreen.css` — no CSS existed for #fullscreen-card at all |
| F | Luna | Wire `car.images` from generated CAR_IMAGES |
| G | Terra | Wikimedia attribution in fullscreen card + finish screen |
| H | Terra | Showcase exclusivity (body.gt3-showcase-open) + card fit |
| I | Terra | Audio start on first user gesture (site was silent) |
| — | manager | apron z-fight heights, showcase camera framing, ToD stacking, carImages generator |

### Root causes worth remembering
- THREE unstyled components shipped from the same quota-exhausted batch 7a/7b:
  `showcase.css` (stub), `fullscreen.css` (absent entirely), and the ToD selector (styled
  inline in JS — that one is intentional, not a defect). If another component looks unstyled,
  suspect the same batch.
- `#showcase-layer` must stay `background: transparent`. Showcase renders via the SHARED
  renderer into `#scene` (z-index 0) BEHIND the overlay; an opaque background hides the car.
  This was broken once already.
- Aprons live outside t in [0,1] where the grass is NOT carved (trackEdges spans 0..1 only),
  so they must sit above groundHeightAt()'s -0.03 or they z-fight.
- Chrome does not count wheel/scroll as user activation. Anything gated on an AudioContext
  must retry on a real gesture and must not memoize the failure.
- ALBEDO NOTE still stands: palette hexes describe the LIT result, not albedo.

### Verified working (end-to-end, headless + real Chrome)
- 10/10 coin collections in correct roster order; scrollY reaches max (9900).
- Montage: 5 distinct shots; morph chain through all 10 cars; HUD/spec panel correct.
- Showcase: styled, car clear of card, HUD suppressed, narration PLAYS (real Chrome,
  scroll+keyboard-only session).
- Finish: scorecard 10/10, Replay control, Sketchfab + Wikimedia credits.
- Time of day: all 5 presets, 2.2s lerp (NOT a hard cut — allow the full 2.2s before judging).
- Cursor parallax: confirmed by A/B screenshot comparison (a few degrees, per spec).
- Aprons clean, coin reads gold at distance, zero console errors, zero failed requests.

### QA tooling (all in scripts/)
- `acceptance.mjs` — walks the whole route WAITING for each montage to clear. Use this, not
  `qa.mjs`. Needs `npx vite --port 5173` running first.
- `probe-showcase.mjs` — opens Showcase mid-race, reports HUD suppression + card fit metrics.
- `shot-start.mjs` — quick start-line screenshot.
- CAUTION: `qa.mjs` scrolls on fixed 2.6s timers while montages run 15.6s, so it races them.
  Its "scrollY 2574" was 0.26 x 9900 — a measurement artifact, NOT a scroll-lock leak.
  That earlier BUILD_LOG entry was wrong; do not re-chase it.
- Reading a module via `await import('/src/x.js')` in the page gives a DIFFERENT instance than
  the app's (Vite appends `?t=<hmr>`). Append the same `?t=` or the readings are meaningless.

### SESSION 3 — 2026-08-28 late (post-compaction)

| Job | Tier | What |
|-----|------|------|
| J | Terra | HUD panel cursor parallax (SPEC §11) — the last unimplemented spec bullet |
| — | manager | Moved J's parallax off `transform` onto `translate` (see below) |
| — | manager | playVoice() now awaits the in-flight startAudio() instead of bailing |

- PARALLAX / TRANSFORM COLLISION: `.hud-approach` and `#spec-panel` already transition
  `transform` (760ms / 820ms) for their reveal. Terra folded the parallax offset into
  that same property via calc(), which restarts the transition every frame and leaves
  those two panels lagging ~0.8s behind the other four. Parallax now rides the
  independent `translate` property, which composes with `transform` and is in neither
  transition list, so every existing reveal/progress animation is untouched. The vars
  are written once on the root element (they inherit) with an idle early-out.
  If you ever add motion to a HUD panel, check what already transitions on it first.
- NARRATION RACE (this was worse than the old "minor" note claimed): opening Showcase
  IS the gesture that starts audio, so playVoice() ran while the context was still
  resuming. It bailed on !raceStarted BEFORE loadVoice(), so voiceEntries[index] stayed
  unpopulated, isVoiceAvailable() returned false, and the play button was left DISABLED
  for as long as the card stayed open — not merely mislabeled. playVoice() now awaits
  the memoized startAudio() promise and re-checks.

### Regression status (verified, real Chrome)
- `node scripts/acceptance.mjs`: 10/10 unlocks in correct roster order (Lexus, Nissan,
  Audi, BMW, Mercedes, Ferrari, McLaren, Aston, Lamborghini, Porsche), scrollY 9900,
  finish reached, narration playing, ZERO console errors, ZERO failed requests.
- `node scripts/probe-parallax.mjs`: all 5 panel roots translate with the cursor
  (~6x4px total travel); #spec-panel's reveal transform stays matrix(1,0,0,1,12,10).
- `node scripts/probe-voice-race.mjs`: A/B proven. Pre-fix "Narration unavailable" +
  button disabled at +0.4/+1.5/+4.0s; post-fix "Narration playing" + enabled at all three.
- `npm run build` passes.
- SPEC §16 hard constraints re-checked against a start-line capture: translucent panels,
  editorial type, restrained palette, no arcade chrome. Compliant.

## ITERATION 1 — PERFORMANCE PASS (2026-08-28 night)

Governing brief: ITERATION1_PERF_PASS.md. Goal was scroll smoothness/controllability.

### MEASUREMENT: read this before touching performance again
The target machine is a MacBook Air class box: **Intel UHD Graphics 617**, 4 cores, 8 GB,
2560x1600 Retina => 1280x800 CSS at devicePixelRatio 2.

Three measurement traps burned real time here. Do not repeat them:
1. **Never profile through `--enable-unsafe-swiftshader`.** acceptance.mjs and qa.mjs pass
   it, which forces SOFTWARE rendering. Fine for functional QA, meaningless for perf.
   Headless `'new'` uses the real GPU on this machine, so no visible window is needed.
2. **Wall-clock frame timing is unusable on this machine.** It runs at load average 5-27
   on 4 cores from the user's own apps (VS Code alone was 44% CPU). Repeated runs of an
   IDENTICAL config spanned 17-85 ms. A `gl.finish()` bench does not save you -- it blocks
   the contended CPU thread. Use **EXT_disjoint_timer_query_webgl2** (scripts/perf-gpu.mjs,
   perf-attrib.mjs): it measures GPU execution only and is immune to CPU scheduling.
   My first attribution said "shadows are 49% of frame cost". That was noise. It was wrong.
3. **Instant-seeking along the route silently measures the MONTAGE, not scrolling.**
   Jumping across coins triggers 15.6 s montages that lock scrolling and render through
   studio.js's SEPARATE renderer. Several early "scroll" baselines were montage playback.
   Driving to the finish is equally wrong: mode becomes 'finish' and never returns.
   scripts/perf-ab.mjs measures inside the coin-free band before the first coin (p<0.065)
   with a per-step bound, and tags/discards every non-race frame.

### Root cause: FILL RATE, not geometry
GPU-timer cost is almost perfectly linear in pixel count, ~9.8 ms per megapixel:
    dpr 2.00  4.1 MPix  40.4 ms  ->  25 fps ceiling   (what was shipping)
    dpr 1.50  2.3 MPix  25.3 ms  ->  40 fps
    dpr 1.25  1.6 MPix  19.1 ms  ->  52 fps
    dpr 1.00  1.0 MPix  12.9 ms  ->  77 fps
At dpr 2 the GPU alone capped the experience at 25 fps before any CPU work, so no amount
of geometry/shadow optimisation could have reached smooth. Shadows are only ~15% (6.7 ms);
hiding the 270k-triangle grass saves 12.3 ms but that is also fill (it covers the screen).

### Accepted
| Job | Tier | What |
|-----|------|------|
| K | Terra | Adaptive render resolution (dpr 1.0 scrolling / full at rest, 420 ms settle) |
| L | Terra | Scroll listeners: non-passive wheel/touchmove now attach ONLY while locked |
| M | Terra | HUD per-frame DOM writes cached; approach bridge quantised |
| N | Terra | Scroll-direction cue (SCROLL / up-REV / down-FWD) beside the telemetry |
| — | manager | Reverted shadow tightening (see below); fixed .hud-telemetry position bug |

- **Adaptive resolution** was a user-approved quality tradeoff (they chose it over a fixed
  cap). Motion blur and speed streaking mask the softness while moving; full sharpness
  returns at rest. Showcase/montage/fullcard force full resolution -- Showcase renders the
  hero car through this same shared renderer and must not be soft. Render targets are
  reallocated only on an actual level change.
- **Non-passive wheel listeners were a real scroll-feel bug independent of frame rate.**
  Merely REGISTERING them disables Chrome's threaded scrolling for the whole page, so every
  wheel event had to wait on a main thread running at 7-30 fps. They only ever did anything
  while locked, so attaching them only while locked is behaviour-preserving.
  Verified both directions: scripts/verify-scrolllock.mjs (scrolls when free, held exactly
  during montage, restored after).
- **Shadow tightening was REVERTED after review.** map 2048->1024 + ortho 120->52 units
  bought only 0.73 ms (1.7%) but an A/B screenshot showed it removed the cast shadows of
  coins and roadside objects beyond 26 units, which popped in as the car approached. Bad
  trade under the brief. Only the curbs change was kept (they cast onto coplanar asphalt
  where the shadow is invisible; 25k caster triangles for nothing).
- **.hud-telemetry regression caught in review:** the cue job added `position: relative`
  to `.hud-telemetry`, which sits on the SAME element as `.hud-corner` and later in the
  stylesheet -- it overrode `position: absolute` and dropped the whole telemetry panel out
  of the bottom-left corner to the top of #hud.

### Before/after (scripts/perf-ab.mjs, identical harness run against b5072d8 and HEAD)
Frame times during real CDP wheel input, race frames only, coin-free band:
| scenario | BEFORE p50 | AFTER p50 | BEFORE p95 | AFTER p95 |
|----------|-----------|-----------|-----------|-----------|
| idle          | 68 ms | 40 ms |  89 ms | 84 ms |
| slow scroll   | 59 ms | 32 ms | 183 ms | 78 ms |
| fast scroll   | 64 ms | 32 ms | 220 ms | 52 ms |
Zero frames discarded in the final run. ~2x on p50, up to 4.2x on p95.

### Regression status
- scripts/acceptance.mjs: 10/10 unlocks in roster order, scrollY 9900, narration playing,
  finish reached, ZERO console errors, ZERO failed requests.
- scripts/verify-scrolllock.mjs: PASS in all three directions.
- All 10 GLBs load, no `missing-model-placeholder` in the scene, no failed requests.
- At-rest capture confirms canvas returns to 2560 (full dpr) and the scene is sharp.

### Remaining performance limitations (NOT addressed, deliberate)
1. **Montages still render at full resolution through a second renderer.** studio.js owns
   its own WebGLRenderer, so ADAPTIVE_RES does not reach it. That is ~15.6 s x 10 of the
   experience at the 25 fps ceiling. Biggest remaining win; left out of scope for this pass.
2. **Idle is still ~25 fps** because at rest we deliberately render at full dpr. This is
   the chosen tradeoff, not a defect.
3. The 96 near-empty car sub-mesh draw calls and the 270k-triangle grass mesh were NOT
   touched -- both are fill/geometry items that the resolution fix made non-critical.
   perf-inventory.mjs still reports them if they become worth doing.
4. The machine itself is saturated (load 5-27 on 4 cores) by the user's other apps. Some
   observed choppiness is contention this codebase cannot fix.

### Perf tooling (scripts/)
- `perf-ab.mjs <label>` — THE before/after harness. DOM-only state detection, so it runs
  unchanged against older commits. Use this for any perf claim about scroll feel.
- `perf-gpu.mjs` / `perf-attrib.mjs` / `perf-dpr.mjs` — GPU timer queries: total cost,
  stage attribution, and the resolution curve. Authoritative.
- `perf-inventory.mjs` — scene breakdown by group: meshes, triangles, shadow casters.
- `verify-scrolllock.mjs` — proves the lock/unlock listener lifecycle.
- `window.__gt3` is now exported unconditionally (scene/camera/renderer/composer/passes/
  probe) as the hook these scripts depend on.

## ITERATION 1 — MONTAGE PASS (2026-08-29)

Extension of the performance pass to studio.js, which the race work did not reach.

### The real problem was far worse than "15.6 seconds"
The montage timeline was advanced by accumulated `dt`, and Clock.tick() clamps dt to
0.05s. At the montage's actual 5.9 fps (169 ms/frame) the timeline advanced ~3.4x slower
than real time, so the nominally 15.6 s montage took **over 40 seconds of wall clock** --
measured, not estimated (it hit the harness's 40 s cap). Ten collections meant roughly
seven minutes of forced cinematic at 6 fps. That is what made the site impossible to
evaluate, and it was invisible from the source alone.

### Root cause of the frame rate: fill rate again, plus RectAreaLights
GPU timer queries on the montage renderer (scripts/perf-montage.mjs), validated with the
car confirmed present in-scene at both bench start and end:
    full (dpr2, rect lights, shadows)   66.4 ms  ->  15 fps ceiling
    dpr 1.0                             27.0 ms  ->  37 fps   (saves 59%)
    RectAreaLights disabled             35.8 ms  ->  28 fps   (saves 46%)
    shadows disabled                    61.5 ms  ->  16 fps   (saves  7%)
    scene: 254 draw calls, 351k triangles, 227 meshes, 3 RectAreaLights
Cost fits ~14 ms fixed + ~12.6 ms per megapixel. The montage is ~2x more expensive than
the race scene at equal resolution despite HALF the triangles -- that gap is the three
RectAreaLights, whose per-fragment cost is what makes the studio lighting look premium.
They were left ALONE deliberately: they are the cinematic identity, and the user ruled
out degrading it for frame rate.

A separate split (studio render disabled mid-montage) put non-render per-frame cost at
~17 ms and studio render at ~27 ms, independently confirming the GPU timer.

### Accepted
| Job | Tier | What |
|-----|------|------|
| O | Terra | MONTAGE_RES: montage renders at fixed dpr 1.0 + per-frame alloc/DOM caching |
| P | Sol Med | Re-choreographed all 5 shots + BEATS from 15.6 s to exactly 5.00 s |
| — | manager | Montage clock driven by wall time instead of accumulated dt |

- **Fixed rather than adaptive resolution** for the montage: unlike the race there is no
  still moment where sharpness is being judged -- it is continuous motion from first
  frame to last -- so it renders at dpr 1.0 throughout.
- **The re-choreography preserves motion rate, it does not speed the montage up.** Every
  shot's camera travel, fov sweep and turntable span were shortened in proportion to its
  new duration, so the linear travel rate is IDENTICAL before and after:
    wide-three-quarter  3.40->1.15 s   0.28 -> 0.28 u/s   12.35 -> 12.35 deg/s
    flank-tracking      3.40->1.00 s   2.29 -> 2.29 u/s    1.76 ->  1.76 deg/s
    rear-wing-detail    2.80->0.80 s   0.44 -> 0.44 u/s    5.00 ->  5.00 deg/s
    roof-descend        2.60->0.85 s   0.98 -> 0.98 u/s    6.92 ->  6.92 deg/s
    pull-back-reveal    3.40->1.20 s   2.69 -> 2.69 u/s    6.47 ->  6.47 deg/s
  The camera still drifts at the same speed; it simply travels a shorter arc. Blends
  scaled to 0.14-0.20 so no shot is mostly crossfade. MONTAGE_DURATION is now DERIVED
  from the sum of shot durations, so the two can no longer disagree.
- **Wall-clock montage timing.** See above -- this is what actually fixed the duration.
  Beat guards in applyTimeline are all `time >= at` one-shots, so a skipped frame cannot
  miss the morph or the audio restore; it just advances the timeline.

### Before/after (scripts/perf-montage-pacing.mjs, same script both sides)
| | BEFORE | AFTER |
|---|---|---|
| wall-clock duration | >= 40 s (hit cap) | 5.1 s |
| fps | 5.9 | 16.4 |
| p50 frame time | 158 ms | 60 ms |
| p95 frame time | 286 ms | 97 ms |
| montage canvas width | 2560 | 1280 |
Across a full playthrough that is roughly 400+ s of montage reduced to ~51 s.

### Regression status
- acceptance.mjs: 10/10 unlocks in correct roster order, scrollY 9900, narration playing,
  finish reached, ZERO console errors, ZERO failed requests.
- Visual check through the sequence: 5-shot structure still reads, card is up and fully
  legible by ~0.7 s, morph fires and the race returns correctly.
- Race scroll performance from the previous pass is untouched (no shared files changed).

### Rebalance to 3 hero shots / 6.0 s (2026-08-29, follow-up)
5.0 s across five 0.80-1.20 s shots overshot -- it read as too quick and choppy. The
sequence is now THREE hero shots at 6.00 s total (Sol Medium, Option A: no connector
shots, because at these durations a 0.5 s connector flickers rather than transitions):
    wide-three-quarter  2.00 s  blend 0.25   establishing reveal
    rear-wing-detail    1.80 s  blend 0.30   the detail/beauty beat
    pull-back-reveal    2.20 s  blend 0.30   hero angle + hand-off into the morph
Motion rate is again preserved EXACTLY against the original 15.6 s values --
0.284/0.445/2.694 units/s and 12.35/5.00/6.47 deg/s -- so the longer shots restore more
of the original camera journey rather than replaying it faster. Turntable stays
continuous (9.029 -> 33.735 -> 42.735 -> 56.971 deg).

MANAGER FIX on top of that job: it left morphFire at 5.45, and the morph runs 0.85 s
(morph.js DURATION), so the car swap would have finished at 6.30 -- 0.30 s AFTER the race
view returned, breaking SPEC 10.7's "hidden under the crossfade". morphFire and
raceFadeIn now both start at 5.10 with a 0.90 s fade, so the morph completes at 5.95,
inside the 6.00 end. Check this arithmetic whenever the montage duration changes.

Measured: 6.2 s wall clock (6.00 s + harness detection lag), 18.4 fps, p50 41 ms,
p95 107 ms, canvas 1280. acceptance.mjs: 10/10 in roster order, no console errors, no
failed requests.

### Closing hero shot + Phase 2 smoothness sweep (2026-08-29)

CLOSING SHOT: the pull-back ended at 16.6 units with the fov opening to 46 deg, so the
car shrank away exactly where the sequence should pay off. Replaced with `hero-close`: a
slow push IN on a low front three-quarter, 7.05 -> 6.52 units, fov narrowing 34.5 -> 32.8.
The look target is deliberately BELOW the car's centre, which lifts the car above frame
centre so it clears the info card that owns the bottom third. Travel rate 0.27 u/s stays
in the montage's slow-drift vocabulary (shot 1 is 0.28). Duration/blend/turntable
unchanged, so morph and crossfade timing are untouched.

### THE COIN -> MONTAGE FREEZE (the big Phase 2 find)
Collecting a coin froze the main thread for **1643 ms**, against ~46 ms race frames.
Instrumenting playMontage() attributed it precisely:
    montage #1: initStudio 0, cloneModel 20, cloneGeometry 40, cardAndState 28,
                firstRender 1713 ms   (total 1802)
    montage #2: initStudio 0, cloneModel 12, cloneGeometry 46, cardAndState  5,
                firstRender  927 ms   (total  990)
It is ENTIRELY the first renderMontage(): shader program creation plus texture upload
into the montage's SEPARATE WebGL context. It does not amortise -- each car brings its
own materials and 34 unique textures totalling 23.8 megapixels (~95 MB).
Geometry cloning is NOT the cause (40 ms); do not "optimise" it.

Fix, in two parts, both hung off the existing coin-approach signal:
  - `prewarmMontage(index)` builds the approaching car's hidden clone and calls
    `compileAsync` (KHR_parallel_shader_compile is available here), so program linking
    happens off the transition. playMontage() then REUSES that clone.
  - compileAsync does NOT upload textures, which was the larger half. A small internal
    rAF pump drip-feeds `initTexture()` at PREWARM_TEXTURES_PER_FRAME textures per frame.
Trigger fires at proximity >= 0.05 (proximity is 0 at the far edge of the approach zone,
1 at the coin), i.e. as early as the signal exists. At the original 0.45 the prewarm ran
out of time on a fast approach and the stall was still ~890 ms.

TUNING NOTE -- the drip rate is a genuine tradeoff, measured:
    1 tex/frame: normal approach 377 ms stall, 22 ms race frames; fast charge 1264 ms
    2 tex/frame: normal approach 208 ms stall, 24 ms race frames; fast charge ~1100 ms
    3 tex/frame: fast charge 248 ms stall BUT race frames during approach rose to 224 ms
2 is shipped: it gives the best NORMAL-USE profile (8x better stall at no smoothness
cost). 3 only helps an artificial hard-charge-at-the-coin case while visibly degrading
the driving it is supposed to protect. A player who sprints at a coin still sees a stall;
there is not enough approach time to hide 95 MB of uploads.

### MONTAGE CARD IMAGES WERE A BUG, NOT A CACHE MISS
The card's thumbnails rendered as broken placeholders. This was assumed to be cold-cache
latency. It was not: `image.src = source` assigned the OBJECT, since car.images entries
are `{ src, width, height, title, author, licence }`, producing
`src="[object Object]"` and naturalWidth 0. It could never have loaded, at any duration.
specPanel.js and fullscreenCard.js already resolved `image.src || image.url` correctly --
only the montage card was wrong. Fixed, and the preload path was written with the same
mistake and fixed with it. Thumbnails now load and are `complete` at montage open.

### Phase 2 measured results
| | before | after |
|---|---|---|
| coin -> montage stall (normal approach) | 1643 ms | 208 ms |
| montage card thumbnails | never loaded (broken src) | loaded, cached before open |
| scroll p50 idle / slow / fast | 40 / 32 / 32 ms | 27 / 25 / 30 ms |
| scroll p95 fast | 52 ms | 38 ms |
| montage | 6.5 s, 16.3 fps | 5.9 s, 18.2 fps |
Scroll numbers improved rather than regressed, so the prewarm work during the approach
did not cost the earlier gains. acceptance.mjs: 10/10 in roster order, zero console
errors, zero failed requests.

## P0 — TOTAL AUDIO SILENCE (2026-08-29)

SYMPTOM: no audio anywhere -- no music, engine, coin, montage or narration.

ROOT CAUSE (reproduced in the user's real Chrome, not inferred):
`startAudio()` opened with `if (startPromise) return startPromise;`.
Chrome does NOT settle `AudioContext.resume()` when it is called without user
activation -- the promise stays **pending forever** rather than rejecting. The first
call comes from the first scroll (via startScreen's onFirstScroll), and a wheel/scroll
is NOT a user activation, so that attempt hung. Because it never settled:
  - the `.then()` that resets `startPromise = null` on failure never ran,
  - `startPromise` stayed memoised for the life of the page,
  - every later gesture retry (`retryAudioOnGesture` -> `startAudio()`) hit the early
    return, received the same dead promise, and did nothing.
The context therefore stayed `suspended` forever and the entire site was silent.

Observed state in the live page, after a scroll AND a genuine trusted click
(navigator.userActivation.hasBeenActive === true):
    ctx "suspended", raceStarted false, startPromiseMemoized TRUE,
    gestureListeners true, all 6 buffers decoded, gains 1.0, no console errors
i.e. assets and the WebAudio graph were entirely healthy. Nothing was muted, no request
failed, and nothing was logged -- the failure was purely in the start lifecycle, which
is why it presented as "everything is silent" with a clean console.

THIS WAS LATENT, NOT A REGRESSION FROM THE PERF/MONTAGE WORK. The early return dates
from ca6a630; `src/audio/audioManager.js` was untouched by every commit in the
performance and montage passes (the only change since was the playVoice narration fix
in 31a4050). Chrome grants autoplay by Media Engagement Index, which drifts per site
over time, so the same code can appear to work and later go silent.

FIX (one condition):
    if (startPromise && context && context.state !== 'suspended') return startPromise;
An in-flight attempt is reused only once the context is actually out of `suspended`.
While still suspended, a gesture is precisely the event that lets `resume()` settle, so
it must be allowed to make a fresh attempt. Concurrent attempts are safe: preloadAudio()
memoises its own promise and startRaceSources() is guarded by `raceStarted`, so
whichever attempt wins starts the mix exactly once. This corrects the lifecycle rather
than papering over it with blind retries.

VERIFIED:
- Reproduced the stuck state in real Chrome: suspended + memoised + trusted click ->
  still suspended, silent.
- Deterministic proof of the fix in the live page: with a suspended context and the hung
  promise memoised, two successive startAudio() calls now return DIFFERENT promises
  (a fresh attempt per gesture); the old code returned the same dead object.
- Real-browser flow after the fix: ctx `running`, raceStarted true, background and idle
  sources live, gains healthy.
- acceptance.mjs: 10/10 unlocks in roster order, narration playing through
  showcase/finish, ZERO console errors, ZERO failed audio requests.

KNOWN, PRE-EXISTING, NOT PART OF THIS FIX:
`scripts/probe-voice-race.mjs` (open Showcase with 'f' as the session's ONLY gesture)
reports "Narration unavailable". A/B against the pre-fix code shows it fails IDENTICALLY
there, so it is unrelated to this change and was not introduced by it. Not chased.

## AUDIO: EXPLICIT "SOUND ON" CONTROL (2026-08-29)

Replaces scroll-as-autoplay-unlock entirely. After the P0 silence bug, the audio
contract no longer depends on browser autoplay heuristics at all:
  1. the site loads with audio NOT started,
  2. a subtle "SOUND OFF" control sits in the top-right (appended into #hud-topright,
     alongside the time-of-day selector, in the same editorial idiom),
  3. the first trusted click calls startAudio() and starts the background + engine/idle
     mix; on success the control flips to "SOUND ON",
  4. every later click is only setMasterMuted(!isMuted()) -- it never re-enters
     startAudio() and never recreates the AudioContext,
  5. coin, montage, narration and finish audio continue through the existing system.

OBSOLETE COMPLEXITY REMOVED
- `startScreen.js` no longer calls startAudio() from onFirstScroll. It still dismisses
  the start screen and still runs preloadAudio() for the loading readout -- decoding
  buffers early is still wanted, it just must not try to start playback.
- `audioManager.js` lost the entire gesture-unlock machinery, which only ever existed to
  retry after a scroll failed to unlock: `installGestureRetryListeners`,
  `removeGestureRetryListeners`, `retryAudioOnGesture`, `gestureRetryListenersInstalled`.
  Keeping them would have been a second competing initialisation path.
- `playVoice()` no longer does `if (!raceStarted) { await startAudio(); ... }`. That
  existed because opening Showcase USED to be the gesture that started audio; it is not
  any more, and awaiting a start that was never user-initiated would hang forever on a
  suspended context. It is back to a plain `if (!raceStarted) return false;` -- narration
  correctly reads as unavailable until the user turns sound on.
- `setMasterMuted` / `isMuted` already existed and were dead code; they are now the
  toggle. Nothing new was added to the audio graph.

KEPT: the P0 defensive guard in startAudio()
    if (startPromise && context && context.state !== 'suspended') return startPromise;
There is now exactly ONE call site for startAudio() (the control's first-click branch),
so this should never be load-bearing again, but it costs nothing and stops a hung
resume() from ever wedging the start path a second time.

VERIFIED IN REAL CHROME (the user's browser, not headless)
- fresh reload, scrolled around without touching the control -> stays "SOUND OFF",
  no audio, no errors, no stuck promise.
- one trusted click -> label flips to "SOUND ON", aria-pressed true. The label only
  flips when startAudio() resolves TRUE, which requires raceStarted, so this is direct
  evidence the mix actually started.
- second click -> "SOUND OFF" (muted); third click -> "SOUND ON". The third was an
  UNTRUSTED programmatic .click() and still worked, proving that path only ramps master
  gain and needs no activation.
- acceptance.mjs (updated to click the control, since scroll no longer unlocks audio and
  every audio assertion would otherwise be vacuous): 10/10 unlocks in roster order,
  narration playing through showcase AND finish -- i.e. audio survives
  race -> coin -> montage -> morph -> race -> finish -- ZERO console errors, ZERO failed
  audio requests.

NOTE: scripts/acceptance.mjs now clicks Sound On during startup. Any future audio
assertion in a harness must do the same or it is testing nothing.

### Remaining montage limitations (documented, NOT done)
1. **~17 ms/frame of non-render cost during montage.** Every race per-frame update still
   runs while the montage covers the screen (carRig, coins, finishLine, hud, specPanel,
   environment). Skipping them is NOT safe naively -- the race view is visible during the
   opening and closing crossfades, and morph/timeOfDay must keep running. Needs a proper
   "fully covered" window. This is the biggest remaining montage win.
2. **The three RectAreaLights cost ~46% of montage GPU.** Untouched on purpose. Any
   attempt to replace them must be judged on a screenshot, not a frame counter.
3. **254 draw calls / 351k triangles for one car**, from unmerged GLB sub-meshes. Same
   underlying item as the race pass's 96 near-empty draw calls; needs one-time
   material-preserving geometry merging at load.
4. **Cold-cache reference images may not appear within the 5 s card.** The three local
   JPEGs (~450 KB each) can still be loading when a montage runs on a cold profile; they
   are present in the spec panel afterwards. Preloading on coin approach would fix it.

### OPEN — remaining

1. Aston Martin Vantage GT3 has NO freely licensed Wikimedia images (external
   limitation, not a code defect). The `is-imageless` path handles it. Do NOT
   fabricate substitutes.
   Everything else in the queue is closed as of 31a4050.
