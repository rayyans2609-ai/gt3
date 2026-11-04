# GT3 — Architecture (reconciled to SPEC_V3, 2026-09-27)

`SPEC.md` (SPEC_V3) is product truth; this file is the technical map that serves it. Where
they disagree, `SPEC.md` wins and this file is wrong. Module status tags:
**[keep]** exists and stays · **[evolve]** exists, changes behavior · **[new]** V3 build work ·
**[retire]** removed once its replacement lands. The tags below describe the V3 target;
the current implementation checkpoint is stated here to avoid treating future modules as live.

**Current on `main` (2026-11-04):** Phases 3 and 4 are HUMAN-ACCEPTED and integrated; the app
boots into the Landing (Phase 4), with a provisional Hub and the accepted Tour. Locked/Unlocked
Tour rendering profiles are accepted (SPEC §31). Phase 5 has its tooling baseline (GSAP, Lucide,
dev-only Theatre) but no Hub implementation. The paragraph below is the 2026-09-28 snapshot.

**Historical, on `phase3-integration` (2026-09-28):** Phases 1–3 and the typography slice
are implemented. The live flow is still legacy start screen → Grand Tour → legacy finish;
Landing, Hub, dedicated Showcase and completion hero are later work. The Tour has a
closed-loop circuit, route-led world-space aerial camera, nine ceremony-free checkpoints,
bidirectional route car swaps, monotonic session discoveries and a sparse map/name HUD.
The Tour has no coin collection, in-Tour montage or `F`-key Showcase. Phase 3 technical
verification is complete, but the 2026-10-06 live review did not accept it. The closure work
(SPEC §30.9) is listed under *Phase 3 closure — technical touchpoints* below; merge remains open.

Desktop-only single-page WebGL experience. Vite + Three.js (ESM, no framework).
Four experiences — Landing, Grand Tour Hub, Showcase, Grand Tour (+ completion state) — are
internal application states of ONE page, not URL routes (SPEC §25). DOM overlay handles ALL
text/HUD/player UI. One fixed canvas behind it, one shared `WebGLRenderer`.

## Directory layout
```
/                     project root
  index.html          Vite entry, DOM overlay markup
  vite.config.js
  package.json
  models/             SOURCE glb files (do not ship, do not modify)
                      incl. car_cover_model (glb data, no extension — SPEC §30.3)
  audios/             SOURCE audio (sfx, voices/); background_playlist/audiocover_NOTaudios/
                      holds the six track covers (unshipped, deferred to Phase 5)
  font/               Neue Haas Grotesk — local project asset (gitignored), referenced
                      directly from CSS and bundled by Vite; not fetched, not committed
  reference _images/  design references (literal space in name), never shipped
  public/             shipped assets (tracked)
    models/           compressed car glbs [keep]; car_cover.glb [new]
    audios/           sfx + voices [keep]; background.mp3 [retired, Phase 2a]
    audios/playlist/  track_1..6.mp3, ALIASED filenames (moved from audios/background_playlist/
                      in Phase 2a, git renames, byte-identical) [done]; covers join in Phase 5
    images/<carId>/   manufacturer imagery / badges [keep]
  scripts/            build-time + current Phase 3 browser/perf harnesses [keep];
                      retired coin/montage/F-key Tour harnesses removed
  src/
    main.js           bootstrap, module wiring, single RAF loop [evolve]
    authoring/        Theatre.js animation authoring, DEV-ONLY, opt-in (`?theatre`); see "Animation authoring"
      theatre.js      Studio + proof sheet, bindObject3D(), JSON export/save [new, dev-only]
      timelineFile.js versioned timeline JSON wrapper (pure) [new]
      timelines/      saved timelines `<projectId>.v1.json`, the source of truth [new]
    core/
      state.js        central store + pub/sub [keep pattern, evolve keys]
      clock.js        delta time [keep]
      session.js      sessionStorage persist/restore of whitelisted keys [new]
      experience.js   experience state machine + transition driver [new]
    scroll/
      scrollDrive.js  sole owner of document scroll; per-experience mapping [evolve]
      boundedPace.js  pure `?scroll=cap|pace` pace models (Phase 3 review candidates) [new]
    scene/
      composition.js  `?comp=`/`?cam=` review scaffolding — remove at composition lock [new, temp]
      compositionRail.js precomputed corridor camera rail for `?cam=` candidates [new, temp]
      racingLine.js   hidden authored racing line (comp b/c) [new]
      carWarmup.js    GPU warm-up of all cars before Tour unlock (SPEC §27) [new]
      gateResponse.js restrained gate traversal response (`?gate=quiet` alternative) [new]
      sceneSetup.js   shared renderer, adaptive dpr, render dispatch per experience [evolve]
      theme.js        Day/Night scene presets + crossfade (from timeOfDay.js) [done, Phase 1a];
                      Night route lighting (SPEC §13a; approach open to design) is added
                      in Phase 8 only
      timeOfDay.js    5 presets [retire → theme.js]
      trackCurve.js   circuit spline + named beats + checkpoint/finish t-values [evolve]
      track.js        asphalt ribbon, markings, curbs [keep]
      environment.js  terrain + scenery [evolve]: terrain structure (relief, single layer,
                      route-agnostic) in Phase 3; white/off-white environment language,
                      architecture and objects in Phase 8 (SPEC §16)
      carRig.js       car mount, lean/roll/bob — camera NO LONGER a child [evolve]
      aerialCamera.js world-space aerial rail camera for Grand Tour (SPEC §15) [done, Phase 3b]
      cars.js         GLTF preload of 10 cars + verified orientation table [keep]
      coverModel.js   loads car_cover.glb for locked cars [new]
      checkpoints.js  sector/checkpoint gates, crossing detection [done, Phase 3c]
      coins.js        visible-identity coins [retired, Phase 3c]
      morph.js        in-tour car swap, forward + reverse [done, Phase 3c]
      finishSequence.js route-end hero transition + completion hero car [new]
      finishLine.js   finish at FINISH_T → bounded 3D gantry with traffic lights (Phase 3
                      closure, SPEC §18); finishSequence may later reuse it [evolve]
    landing/
      landing.js      Landing scene on the shared renderer: hero, composition, scroll-driven
                      surface-push transition to the Hub field [done, Phase 4]
    montage/
      studio.js       montage studio (own renderer — sanctioned exception, see below) [keep]
      choreography.js 5-shot camera timeline [keep]
    ui/
      hub.js          PROVISIONAL Hub (Phase 4): theme field + START RACE only; the real Hub
                      (Cars, integrated player) is Phase 5 [done provisional / evolve]
      homeControl.js  Grand Tour back/home control → Hub (SPEC §25) [done, Phase 4]
      showcase.js     Showcase scene + DOM (already uses shared renderer) [evolve]
      selector.js     bottom ten-car selector, ?/badge states [new]
      unlockFlow.js   manual unlock: flag wipe → montage → reveal → narration [new]
      soundCue.js     one-time first-Tour "Sound" cue (visual only) [new]
      hud.js          sparse Grand Tour HUD: circuit map TR, car name + info TL (BL info
                      moves TL in Phase 3 closure) [Phase 3];
                      back-to-Hub control waits for Phase 5
      player.js       global music player: compact anchor / expanded / Hub variant [new]
      soundControl.js persistent speaker (master mute) + `+` launcher [evolve]
      themeToggle.js  Day/Night control [new; replaces todSelector.js]
      completion.js   GRAND TOUR COMPLETE + return control [new; replaces finishScreen.js]
      startScreen.js finishScreen.js [retire in later phases]; specPanel.js and
                      fullscreenCard.js [retired, Phase 3 cleanup]; todSelector.js [retired]
    audio/
      audioManager.js one AudioContext: master/music/sfx/engine/voice buses, AND the playlist
                      music engine (sequence, seek, auto-advance, mutes, restore) — kept here
                      because it needs the private context/buses [evolved, Phase 2a]
    data/
      cars.js         roster data (10 cars, locked order) + narration copy [keep]
      carImages.js    [keep]
      playlist.js     track_1..6 alias → shipped file [done, Phase 2a]; cover field in Phase 5
    styles/
      tokens.css      design tokens, Day/Night via :root[data-theme] [done, Phase 1]
      base.css + per-experience sheets [evolve; montage.css keep]
  BUILD_LOG.md
```

## Rendering model
- **One shared `WebGLRenderer`** (`sceneSetup.js`). Each experience owns a scene+camera and a
  `render()`; `sceneSetup` dispatches to the active one (Showcase already works this way).
  Only the active experience's scene is rendered; Grand Tour's circuit is not rendered
  behind Landing/Hub/Showcase.
- **Sanctioned exception:** `montage/studio.js` keeps its own renderer, used ONLY inside the
  Showcase manual-unlock flow (SPEC §11), never in Grand Tour. No other second renderer —
  in particular the finish hero sequence reuses the Grand Tour scene/camera (SPEC §21, §27).
- **Adaptive resolution** [retired for the Grand Tour, 2026-10-14]: the Tour now renders at a fixed
  DPR1 with SMAA and no idle/motion switching (SPEC §27); the switching code remains but is inert
  (`ADAPTIVE_RES.high == low == RENDER_DPR`). Originally: lower dpr while scrolling, full dpr at rest (~420 ms
  settle). Landing push-in and Grand Tour use it; Showcase, montage and the completion hero
  render at full quality.
- **Landing→Hub** (`src/landing/landing.js`, Phase 4) is its own small scene + camera drawn by the
  shared renderer at native DPR (≤ 2) while the Landing owns the screen; main.js draws it instead of
  the Tour, and the Tour's fixed DPR is restored on entry. The hero (McLaren 720S GT3, owner
  2026-10-24) is one extra load of its full-resolution GLB (`cars.loadFullResolutionCar`, same
  verified normalisation), falling back to the roster clone. The Hub is DOM over the resolved field.

## Animation authoring (Theatre.js, dev-only)
Theatre.js is an **optional visual authoring tool** for hand-keyframed curves. It complements
GSAP and replaces nothing. Nothing here ships: `@theatre/studio` is a devDependency, and the only
import of `src/authoring/theatre.js` sits behind `import.meta.env.DEV` in `main.js`, so the
production bundle contains no Theatre code (verified 2026-11-04: `vite build` output is
byte-identical with and without this feature, zero "theatre" strings).
- **Open it:** `npm run dev`, then `/?theatre` (Studio + proof sheet, sequence editor opens once a
  prop is sequenced) or `/?theatre=play` (core only: replays the saved JSON with no Studio).
  `Alt+\` hides/shows Studio. Normal GT3 URLs are unaffected.
- **Proof:** sheet `proof`, object `Proof probe` (position, rotationDeg, scale) drives an
  **off-scene** `THREE.Object3D`: no renderer, scene or visual is touched. `bindObject3D(sheet,
  name, object3d, driver)` is the reusable binding for real targets.
- **One loop:** Theatre ticks through a custom `rafDriver` that `main.js`'s `registerUpdate` calls
  every frame (`__gt3.theatre.stats.ticks` counts it); the module never calls
  `requestAnimationFrame`. Studio's UI chrome uses Theatre's default raf and renders no GT3
  content. Studio's wheel/touch/key events stop at its root, so they never reach `scrollDrive`.
  Studio's `updates.theatrejs.com` poll is blocked locally (no option exists; it is a CORS error).
- **Persistence = JSON in the repo, never localStorage** (`usePersistentStorage: false`). Format
  `{format:'gt3-theatre-timeline', version:1, projectId, theatre, state}` in
  `src/authoring/timelines/<projectId>.v1.json` (`timelineFile.js`; unknown versions are ignored
  with a warning, never half-loaded). Edits live in memory until saved: top-left toolbar floppy
  icon (save to repo) or arrow icon (browser download), or `__gt3.theatre.saveToRepo()` /
  `exportJSON()`. Saving POSTs to the dev-server-only plugin `scripts/vite-theatre-save.mjs`
  (custom header, validated id, one directory). `state` is Theatre's opaque format: never hand-edit.
- **Claude can control** (dev only): `window.__gt3.theatre` = `sheet, obj, probe, studio, stats,
  play()/pause()/seek(s), exportJSON()/saveToRepo()`. Verified workflow: right-click a prop group in
  Studio, "Sequence all" (one-time UI step, scriptable with Playwright piercing the shadow root);
  then `seek(t)` + `studio.transaction(({set}) => set(obj.props.rotationDeg, {x,y,z}))` writes a
  keyframe at the playhead, `saveToRepo()` persists it. Easing/curve handles and sequence length
  are edited in the Studio UI. Harness: `scripts/verify-theatre-proof.mjs` (dev server, `GT3_URL`).
- **GSAP vs Theatre:** GSAP stays for code-driven, state/scroll/event-driven motion (UI, Flip,
  SplitText, tweens that react to input). Theatre earns its place for **scrubbable, hand-tuned,
  multi-property authored sequences** whose feel is judged visually: camera/hero moves, light and
  material choreography, the Phase 6 emblem flourish. If a motion is two numbers and an ease, use
  GSAP. Before binding a real object, check who drives it today (animation ownership): bind only
  properties no other system writes in the same frame. Production playback is a separate,
  reviewed change (it needs `@theatre/core` and the JSON in the bundle).

## Experiences and scroll ownership
Native document scroll with passive listeners throughout (threaded scrolling preserved). As built
in Phase 4, each world owns its own spacer instead of one remapped spacer: `:root[data-world]` is
`landing` (Landing + Hub: `#landing-spacer`, read by `landing.js`) or `tour` (`#scroll-spacer`,
read only by `scrollDrive.js`). While the Landing world owns the scroll, the drive is **dormant**
(`setDriveDormant`): it reads, moves and swallows nothing, so Landing scroll can never become route
input. START RACE wakes it locked, places the route and unlocks when input is quiet.

| experience | scroll role | mechanism |
|---|---|---|
| `landing` → `hub` | drives `landingT` 0..1, reversible | spacer = landing length; `landingT=1` at spacer end = Hub at rest, so further downward scroll has nowhere to go (SPEC §5) |
| `hub` | upward scroll reverses to Landing only | same spacer, sitting at its end; START RACE / Cars are clicks |
| `showcase` | none | `overflow:hidden` on the document — no non-passive listeners |
| `tour` | drives route `progress`, reversible | spacer = route length, restored from session route position |
| `complete` | backward scroll cancels/reverses completion (SPEC §26) | tail of the tour mapping |

Click-driven transitions (Hub↔Showcase, Hub→Tour, Tour→Hub) are timed, run by
`core/experience.js`, and hold `scrollLocked` for their duration only. Non-passive
wheel/touchmove swallowing is attached **only** while `scrollLocked` is true (existing rule).

## Central state (src/core/state.js)
Single exported object `state` + `subscribe(key, fn)` / `set(key, value)` — pattern unchanged.
Keys (★ = persisted to sessionStorage by `session.js`, SPEC §24):

Navigation
- `experience` ★  'landing'|'hub'|'showcase'|'tour'|'complete' (replaces `mode`)
- `transition`     null | { from, to } while a click-driven transition runs
- `landingT`       0..1 scroll-driven Landing→Hub progress
- `scrollLocked`   bool — scrollDrive ignores input and holds position [keep]

Grand Tour (route state — follows scroll bidirectionally, SPEC §26)
- `progress` ★    0..1 damped render progress along spline [keep]
- `targetProgress` 0..1 raw scroll target [keep]
- `velocity`, `speed01` [keep]
- `activeCarIndex` 0..9 car currently skinning the player car — ROUTE state [keep]

Discovery (monotonic within a session, SPEC §26)
- `unlocked` ★    Set<number> of discovered car indices; only ever grows. Starts as {0}
                   (Lexus). Written by checkpoint crossing (no ceremony) and manual unlock.
                   [keep name, new semantics]
- `showcaseCarIndex` ★ selected car in Showcase [new]

Theme / audio
- `theme` ★        'day'|'night' (replaces `timeOfDay`)
- `masterMuted` ★  speaker: silences music + sfx + voice
- `musicMuted` ★   music-only mute; master unmute restores music only if this is false
- `trackIndex` ★, `trackPosition` ★, `playIntent` ★  playlist state; restored playback
                   still waits for a genuine user gesture (SPEC §10, §24)
- `playerOpen`     expanded-player UI state; reset to false on every major transition (SPEC §25)
- `audioReady`     true only while the single AudioContext is running after a successful start (see Audio graph)

Retired keys: `timeOfDay` (Phase 1a). `mode` and `started` are **transitional** legacy
keys still used by the start/finish flow; a marked bridge in `main.js` maps the running
race onto `experience='tour'`. Phase 3 removed Tour coins, in-Tour montage and the
`F`-key Showcase. The start screen and finish screen remain until their later phases.
`unlocked` now starts with Lexus, grows monotonically and persists for the session.
Route position persists for the session as `routeProgress` (Phase 3, W7). It is restored after
readiness while scroll is locked; at or past 0.995 the finish state is restored.

Keys land with the phase that owns their truth, so no key has two sources of truth.
`masterMuted`/`audioReady` land in Phase 2, because the mute flag lives in
`audioManager.js` today. Session persistence of route position (`routeProgress`; the route car is derived from it) and `unlocked`, and
`unlocked` starting as {0}, land in Phase 3, because `coins.js` tracks collection
separately and the legacy replay clears `unlocked`.

Rules [keep]:
- Modules NEVER read `window.scrollY` directly except scrollDrive.js.
- Only ONE requestAnimationFrame loop, in main.js. Modules export `update(dt, state)`.
- Theme is read ONLY from `state.theme`; no component hardcodes a theme (SPEC §13). A theme
  change mid-transition is applied next frame, never queued (SPEC §25).
- Grand Tour never calls montage, narration, Showcase, cards or modals (SPEC §2, §14, §18).

## Session persistence (src/core/session.js)
`sessionStorage` — survives refresh, a new tab/session starts fresh (SPEC §24–25). Writes the
★ keys, throttled; restores on boot before first render. No history API, no URL routing.
Audio restore sets UI state only; playback resumes on the next user gesture.

## Audio graph (src/audio/)
One AudioContext, created only from an explicit user gesture — never scroll [keep, SPEC §10].
```
music <audio> → MediaElementSource → musicMuteGain → musicBus ─┐
sfx buffers ──────────────────────────────────────→ sfxBus ────┤
engine start/idle ────────────────────────────────→ engineBus ─┼→ masterGain → destination
voice <audio> → MediaElementSource ───────────────→ voiceBus ──┘
```
- Implemented in `audioManager.js` (Phase 2a): no separate `audio/playlist.js`.
- Music uses one streaming `<audio>` element (native duration/seek/ended) instead of decoding
  six full tracks. It is created only on the first successful audio start. Order
  track_1→…→track_6→track_1, auto-advance on `ended`.
- `masterMuted` → masterGain; `musicMuted` → musicMuteGain. Montage and narration ducking stay
  on musicBus. No SFX-only mute.
- `audioReady` is true only after a successful `startAudio()` with the context `running`, and
  drops to false whenever the context stops running. Explicit controls retry through
  `startAudio()` / `playMusic()`.
- Real artist/title names never appear as GT3 interface text; shipped playlist files use `track_N`
  aliases. Supplied cover artwork may carry its own embedded text (owner, 2026-11-03; SPEC §6).
- Race audio (engine, Grand Tour SFX) is scoped to the Grand Tour: Landing/Hub play music only,
  leaving the Tour stops engine/SFX while music continues (SPEC §10; HUMAN-ACCEPTED 2026-11-02;
  `scripts/verify-audio-lifecycle.mjs`).
- SFX set: existing files only (`coin_approach.mp3` reused as checkpoint approach cue; others
  kept as currently wired). Voices: exactly the 10 `voice_XX` files, played ONLY in Showcase.

## Grand Tour systems
- **Camera** (`aerialCamera.js`): world-space, NOT parented to the rig. Pitch ~45–60° down,
  fixed world orientation (does not yaw with the car), damped translation along a rail that
  follows the route, with the car framed within it, controlled screen-space drift with a safety-framing correction. Tunables:
  FOV, elevation, pitch, lateral offset, look target, damping, tracking gain, safety margin.
- **Checkpoints** (`checkpoints.js`): 9 restrained gates at `CHECKPOINT_T[]` in `trackCurve.js`,
  one per car 1–9 (Lexus is discovered from the start and has no checkpoint);
  no brand colour/emblem/silhouette. Forward crossing → `activeCarIndex` swap and (if new) add
  to `unlocked`; backward crossing → reverse swap only. Spacing ~30–50% longer than the coin
  spacing (SPEC §14).
- **Swap** (`morph.js`): short, non-blocking, runs in both directions, no scroll lock.
- **HUD** (`hud.js`): circuit map (top-right, derived from `trackCurve`), car name with its two-line info from `cars.js` (top-left; consolidated from
  bottom-left in the Phase 3 closure), first-use direction cue, a first-Tour
  sound cue (`soundCue.js`), and one bottom edge row: the sun/moon Day/Night control
  (`themeToggle.js`) plus speaker/`+`, recomposing when the player expands (SPEC §20, §8).
  Back-to-Hub waits for the Hub. Nothing else.
- **Finish target, Phase 7** (`finishSequence.js`): begins at route end; progressively
  hides environment groups, eases camera to a hero framing, resolves to the theme field, then
  `experience='complete'`. Backward scroll reverses it (SPEC §26). Whether its progress is
  scroll-linked or timed is internal to `finishSequence.js` — not an architecture decision.

## Showcase systems
- Scene: themed field, hero car, pointer-drag orbit (yaw free, pitch clamped), no free camera.
- Locked car → `coverModel.js` shroud, `?` label, unlock action. Unlocked → real model, badge,
  narration via `voiceBus`, optional expandable specs.
- Manual unlock (`unlockFlow.js`): flag wipe → existing montage → swap behind wipe → reveal →
  narration → inspectable; adds to `unlocked`.

## Locked car roster (order is fixed) [keep]
0 lexus_rcf_gt3 · 1 nissan_gtr_gt3 · 2 audi_r8_gt3 · 3 bmw_m6_gt3 · 4 mercedes_amg_gt3
5 ferrari_488_gt3 · 6 mclaren_720s_gt3 · 7 aston_vantage_gt3 · 8 lamborghini_huracan_gt3
9 porsche_911_gt3r
Lexus (0) is the Grand Tour starting car and discovered from session start (Showcase never shows
it locked). The Landing hero is decoupled from it: McLaren (6), owner 2026-10-24, presentation only.

## Design system (SPEC §12–13, §23)
- Fonts: Neue Haas Grotesk (primary; from local `font/`, never fetched), Geist Mono (timing /
  identifiers / data only), selective oblique for short emphasis. The dedicated typography
  slice is complete: local font assets are bundled via `fonts.css`, and
  `--font-ui` / `--font-mono` / `--font-display` point to the new families. Cormorant
  Garamond / DM Sans / DM Mono are retired.
- Tokens in `styles/tokens.css`, switched by `:root[data-theme="day"|"night"]`, interpolated:
  Day = white/pale field, dark type/icons; Night = deep navy field, near-black/navy
  architecture, refined motorsport-yellow accents. Exact values are runtime tuning.
  The old gold/ink/paper palette is retired.
- Controls: compact pills, clean buttons, moderate rounding, subtle surfaces, refined shadows;
  shared hover/active/focus and one shared easing family. No glassmorphism overload, neon,
  heavy blur, fake telemetry.
- Motion: slow, eased (cubic-bezier(.22,.61,.36,1) remains the default), nothing snaps.

## Hard constraints
No mobile/responsive breakpoints. No physics engine. No opponents/traffic/AI. No backend,
accounts, currency, achievements or extra modes. No hard model swaps in Grand Tour. No arcade
chrome. No new renderers beyond the sanctioned montage exception. No URL routes / synthetic
history entries. Audio: the existing SFX + the 10 voice files + the 6 playlist tracks, no others.

## Phase 3 closure — technical touchpoints (SPEC §30.9, 2026-10-06)
Only the implications that touch module boundaries or shared systems; product truth is in SPEC.
- **Crossing SFX:** re-wired from the checkpoint crossing path in Phase 3 (sfxBus, never an
  audio-init path). Since 2026-11-02 it plays the owner-supplied `checkpoint.mp3`, replacing
  `coin.mp3` (SPEC §18).
- **No input before ready:** gate route input in `scrollDrive.js` (the sole scroll owner) until
  readiness. Restored `routeProgress` must still apply exactly. This is shared input state, so
  verification is high blast radius (scroll + route persistence).
- **Gate effect / swap treatment:** `gateResponse.js` and `morph.js` carry review candidates
  (crossfade / restored pulse / light-based). Any emissive gate response is local to the gate
  mesh and is not Night route lighting (Phase 8). Zero new GPU work at crossings still holds.
- **Visual-design pass:** `composition.js` / `compositionRail.js` / `racingLine.js` / `aerialCamera.js`.
  Curb usage widens the racing line's lateral bound at selected corners only. World-edge and
  occlusion checks (`verify-occlusion.mjs`) apply to the chosen candidate.
- **HUD:** `hud.js` moves car info to top-left, swaps the map dot for a heading arrow and adds a
  progress trail derived from route progress (reverses with route state). The start screen's
  "Scroll to Race" copy and the direction cue are reconciled; the loading UX is not redesigned.

## Future technical implications (SPEC §31)
- The spinning HUD car and 3D emblem (Phase 6) render on the **one shared renderer**: no second
  renderer, and no HUD canvas with its own context. The click-through to a single-car
  presentation is a new user-initiated `tour → showcase`-family transition that preserves route
  state; its state shape is decided in Phase 6.
- Volume sliders (Phase 5) map onto the existing `masterGain` / `musicMuteGain` chain as separate
  level gains, so mute and level stay independent. New persisted keys land with that phase.
- Landing hero decoupled from roster index 0 (Phase 4, owner 2026-10-24): the Landing loads its
  own hero copy; nothing in the Tour, discovery or session reads the hero choice.

## Known later dependencies and phase ownership
- **Night route lighting (SPEC §13a) is owned by Phase 8** (scenery / lighting / performance
  pass). The outcome is locked: an authored premium night-driving feel, a readable road/car/
  near environment with real darkness preserved, smooth Day↔Night, performance-bounded.
  Headlights and street/trackside lighting are desired components, but fixture style, density,
  placement, light types and technique are open to Phase 8 design; nothing is fixed to uniform
  spacing, a light count or one implementation. Phase 3 and other earlier phases must not
  pre-build it; until then Night is the `theme.js` night preset.
- **Environment art direction (SPEC §16–17) is executed in Phase 8**: white/off-white
  sculptural terrain, material tuning, selective architecture/objects, vegetation strategy,
  shadow art direction. Phase 3 terrain work is structural only: meaningful relief, clean
  shading (no sliver-triangle creases), one layer, route-agnostic, performance-safe. It must
  not bake green-grass assumptions into terrain geometry or data, so Phase 8 can re-material
  it without rebuilding it. Night uses the same pale environment revealed by light (§13a).
- Playlist tracks shipped in Phase 2a (`public/audios/playlist/`). Track covers remain
  unshipped in `audios/background_playlist/audiocover_NOTaudios/` until Phase 5 (Hub player).
  `car_cover.glb` is not yet in `public/` (Showcase, Phase 6).
- McLaren → Aston grass-occlusion fix: owner visual sign-off given (2026-10-09, SPEC §30.6).
- Neue Haas Grotesk `-Trial` licensing (SPEC §30.5) is a local-asset concern, not a build or
  deployment blocker for this project.
