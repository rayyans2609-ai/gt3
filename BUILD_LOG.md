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

### OPEN — remaining

1. Aston Martin Vantage GT3 has NO freely licensed Wikimedia images (external
   limitation, not a code defect). The `is-imageless` path handles it. Do NOT
   fabricate substitutes.
   Everything else in the queue is closed as of 31a4050.
