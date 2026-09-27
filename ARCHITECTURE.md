# GT3 — Architecture (reconciled to SPEC_V3, 2026-09-27)

`SPEC.md` (SPEC_V3) is product truth; this file is the technical map that serves it. Where
they disagree, `SPEC.md` wins and this file is wrong. Module status tags:
**[keep]** exists and stays · **[evolve]** exists, changes behavior · **[new]** V3 build work ·
**[retire]** removed once its replacement lands.

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
  scripts/            build-time + puppeteer probe/perf/QA scripts [keep]
  src/
    main.js           bootstrap, module wiring, single RAF loop [evolve]
    core/
      state.js        central store + pub/sub [keep pattern, evolve keys]
      clock.js        delta time [keep]
      session.js      sessionStorage persist/restore of whitelisted keys [new]
      experience.js   experience state machine + transition driver [new]
    scroll/
      scrollDrive.js  sole owner of document scroll; per-experience mapping [evolve]
    scene/
      sceneSetup.js   shared renderer, adaptive dpr, render dispatch per experience [evolve]
      theme.js        Day/Night scene presets + crossfade (from timeOfDay.js) [new]
      timeOfDay.js    5 presets [retire → theme.js]
      trackCurve.js   circuit spline + named beats + checkpoint/finish t-values [evolve]
      track.js        asphalt ribbon, markings, curbs [keep]
      environment.js  terrain/grass/vegetation masses/architecture [evolve]
      carRig.js       car mount, lean/roll/bob — camera NO LONGER a child [evolve]
      aerialCamera.js world-space aerial rail camera for Grand Tour (SPEC §15) [new]
      cars.js         GLTF preload of 10 cars + verified orientation table [keep]
      coverModel.js   loads car_cover.glb for locked cars [new]
      checkpoints.js  sector/checkpoint gates, crossing detection [new]
      coins.js        visible-identity coins [retire → checkpoints.js]
      morph.js        in-tour car swap, forward + reverse [evolve]
      finishSequence.js route-end hero transition + completion hero car [new]
      finishLine.js   checkered gate at FINISH_T [evolve or fold into finishSequence]
      landingStage.js Landing field scene: floating Lexus, cursor response, push-in [new]
    montage/
      studio.js       montage studio (own renderer — sanctioned exception, see below) [keep]
      choreography.js 5-shot camera timeline [keep]
    ui/
      landing.js      GT3 wordmark, sound-on affordance [new; replaces startScreen.js]
      hub.js          START RACE, Cars, Day/Night, integrated player slot [new]
      showcase.js     Showcase scene + DOM (already uses shared renderer) [evolve]
      selector.js     bottom ten-car selector, ?/badge states [new]
      unlockFlow.js   manual unlock: flag wipe → montage → reveal → narration [new]
      hud.js          Grand Tour HUD: circuit map TR, car name TL, edge controls [evolve]
      player.js       global music player: compact anchor / expanded / Hub variant [new]
      soundControl.js persistent speaker (master mute) + `+` launcher [evolve]
      themeToggle.js  Day/Night control [new; replaces todSelector.js]
      completion.js   GRAND TOUR COMPLETE + return control [new; replaces finishScreen.js]
      startScreen.js todSelector.js finishScreen.js specPanel.js fullscreenCard.js [retire]
    audio/
      audioManager.js one AudioContext: master/music/sfx/engine/voice buses, AND the playlist
                      music engine (sequence, seek, auto-advance, mutes, restore) — kept here
                      because it needs the private context/buses [evolved, Phase 2a]
    data/
      cars.js         roster data (10 cars, locked order) + narration copy [keep]
      carImages.js    [keep]
      playlist.js     track_1..6 alias → shipped file [done, Phase 2a]; cover field in Phase 5
    styles/
      tokens.css      design tokens, Day/Night via :root[data-theme] [new]
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
- **Adaptive resolution** [keep]: lower dpr while scrolling, full dpr at rest (~420 ms
  settle). Landing push-in and Grand Tour use it; Showcase, montage and the completion hero
  render at full quality.
- **Landing→Hub** is a field scene (themed background + Lexus); the Hub itself is mostly DOM
  over the resolved theme field. The Landing Lexus is a clone from `cars.js`, not a second load.

## Experiences and scroll ownership
`scrollDrive.js` remains the **only** reader of `window.scrollY` and uses native document
scroll with passive listeners (threaded scrolling preserved). It remaps the spacer per
experience:

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
                   (Lexus). Written by checkpoint crossing (silent) and manual unlock.
                   [keep name, new semantics]
- `showcaseCarIndex` ★ selected car in Showcase [new]

Theme / audio
- `theme` ★        'day'|'night' (replaces `timeOfDay`)
- `masterMuted` ★  speaker: silences music + sfx + voice
- `musicMuted` ★   music-only mute; master unmute restores music only if this is false
- `trackIndex` ★, `trackPosition` ★, `playIntent` ★  playlist state; restored playback
                   still waits for a genuine user gesture (SPEC §10, §24)
- `playerOpen`     expanded-player UI state; reset to false on every major transition (SPEC §25)
- `audioReady`     true once the single AudioContext exists

Retired keys: `timeOfDay` (Phase 1a). `mode` and `started` are **transitional**: they stay
as legacy in-race keys until their last consumers go. That is Phase 3 for montage-in-race,
coins and the fullscreen card; Phases 4–5 for the start screen; Phase 6 for the F-key
Showcase; and Phase 7 for the finish screen. Until then, a marked legacy bridge in `main.js`
maps the running race onto `experience`.

Keys land with the phase that owns their truth, so no key has two sources of truth.
`masterMuted`/`audioReady` land in Phase 2, because the mute flag lives in
`audioManager.js` today. Session persistence of `progress`/`activeCarIndex`/`unlocked`, and
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
- Real artist/title names never reach the UI; shipped playlist files use `track_N` aliases.
- SFX set: existing files only (`coin_approach.mp3` reused as checkpoint approach cue; others
  kept as currently wired). Voices: exactly the 10 `voice_XX` files, played ONLY in Showcase.

## Grand Tour systems
- **Camera** (`aerialCamera.js`): world-space, NOT parented to the rig. Pitch ~45–60° down,
  fixed world orientation (does not yaw with the car), damped translation along a rail that
  follows the car, controlled screen-space drift with a safety-framing correction. Tunables:
  FOV, elevation, pitch, lateral offset, look target, damping, tracking gain, safety margin.
- **Checkpoints** (`checkpoints.js`): 9 restrained gates at `CHECKPOINT_T[]` in `trackCurve.js`,
  one per car 1–9 (Lexus is discovered from the start and has no checkpoint);
  no brand colour/emblem/silhouette. Forward crossing → `activeCarIndex` swap and (if new) add
  to `unlocked`; backward crossing → reverse swap only. Spacing ~30–50% longer than the coin
  spacing (SPEC §14).
- **Swap** (`morph.js`): short, non-blocking, runs in both directions, no scroll lock.
- **HUD** (`hud.js`): circuit map (top-right, derived from `trackCurve`), car name (top-left),
  edge row with theme toggle, speaker/`+`, back-to-Hub. Nothing else.
- **Finish** (`finishSequence.js`): begins at route end; progressively
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
Lexus (0) is the Landing hero car, the Grand Tour starting car, and discovered from session
start (Showcase never shows it locked).

## Design system (SPEC §12–13, §23)
- Fonts: Neue Haas Grotesk (primary; from local `font/`, never fetched), Geist Mono (timing /
  identifiers / data only; may load from Google Fonts), selective oblique for short emphasis.
  Cormorant Garamond / DM Sans / DM Mono are retired.
  **Scheduled:** the migration runs as a small dedicated typography slice **after Phase 2b
  and before Phase 4**, so the first major new V3 screen (Landing) is built on the new
  families. Until then the code keeps the legacy `--font-ui` / `--font-mono` / `--font-display`
  variables, and new UI must use those variables, not literal font names, so it picks up the
  migration automatically.
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

## Known later dependencies (not blockers for Phase 1)
- Playlist tracks shipped in Phase 2a (`public/audios/playlist/`). Track covers remain
  unshipped in `audios/background_playlist/audiocover_NOTaudios/` until Phase 5 (Hub player).
  `car_cover.glb` is not yet in `public/` (Showcase, Phase 6).
- McLaren → Aston grass-occlusion fix awaits user visual sign-off (SPEC §30.6).
- Neue Haas Grotesk `-Trial` licensing (SPEC §30.5) is a local-asset concern, not a build or
  deployment blocker for this project.
