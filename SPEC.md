# GT3 — Canonical Product & Experience Specification

## 0. Authority and purpose

This file is the current, standalone product/experience specification for GT3. A fresh implementation agent should be able to read only this file (plus the repo itself) and understand the intended experience without reconstructing prior design conversations.

Priority when sources disagree:

1. Current explicit user instruction
2. This `SPEC.md`
3. Current repository/runtime reality (what actually exists — see §1 and the Open Issues section for where it differs from this file)
4. `ARCHITECTURE.md` (technical map, reconciled to this spec 2026-09-27)
5. `BUILD_LOG.md` (evidence/history — measured findings only, not product doctrine)
6. `docs/archive/SPEC_V1.md`, `docs/archive/SPEC_V2.md` (historical product direction, superseded)

This is a **third product direction**, not a merge of the first two. V1 was restrained luxury-editorial with a fixed chase camera and a visible-identity coin mechanic. V2 explicitly reversed that toward "bold, colorful, Hot-Wheels-like" arcade energy with a homepage/collection hub. This spec returns to a premium/editorial register but keeps V2's wider aerial camera instinct and its mystery/locked-car identity-concealment idea, folds in official-motorsport and GT/Driveclub game-presentation quality, and restructures the whole experience into four explicit pages. Do not resurrect V1's fixed camera-child-of-rig framing or V2's bold/colorful HUD language.

---

## 1. Current repository reality vs. this spec (read before implementing)

The current runtime (`src/`) is a **single continuous scroll page**: a start screen ("GT3: A Grand Tour" / "Scroll to Race") leads directly into one scroll-driven race with ten visible-identity coins, a fixed 45°-chase camera rigidly parented to the car, five time-of-day presets, a single looping `background.mp3`, and an `F`-key Showcase overlay. There is no Landing/Hub/Showcase/Grand Tour page separation, no locked/mystery-car system, no playlist, and no checkpoint-gate mechanic.

Nearly everything in §4 onward is new product surface or a deliberate architectural replacement, not a tweak. Where this spec differs from current code, **that difference is implementation work**, not a documentation error. Do not silently rewrite this spec to match what already exists. Reusable current assets and systems are called out explicitly in §1a.

### 1a. What to preserve from current code

- The 10 locked GT3 GLB models and their **exact roster order** (`src/data/cars.js`): Lexus, Nissan, Audi, BMW, Mercedes, Ferrari, McLaren, Aston, Lamborghini, Porsche. Lexus is both the player/hero car (Landing) and roster index 0.
- The verified per-model orientation table in `src/scene/cars.js` (do not re-derive orientation from geometry heuristics).
- The montage/studio system (`src/montage/`) — reused, unmodified in spirit, for manual unlock only (§11).
- The narration audio (`audios/voices/voice_01…10`) and per-car copy already authored in `src/data/cars.js`.
- The explicit-gesture WebAudio lifecycle in `src/audio/audioManager.js` (no scroll-based init).
- The accepted performance findings in `BUILD_LOG.md` (§27 below) — adaptive resolution while scrolling, non-passive-listener cost, fill-rate-first attribution.
- The DOM-overlay-over-fixed-canvas split, single RAF loop, and central `state.js` pub/sub pattern (module boundaries will change; the pattern doesn't need to).

### 1b. What is explicitly replaced

- Fixed camera-child-of-rig chase framing → stable-world-space high aerial camera (§15).
- 5-state time-of-day (`dawn/morning/afternoon/dusk/night`) → 2-state Day/Night (§13).
- Visible-identity coins (`src/scene/coins.js`) → in-world sector/checkpoint thresholds (§18), with locked-identity cars (§11).
- Single continuous scroll page with start-screen overlay → four distinct experiences (§2, detailed per page in §4–5, §11, §14) with agent-designed transitions (§25–26).
- Single `background.mp3` loop → six-track playlist system (§6–10). The music engine was implemented in Phase 2a (2026-09-27) inside `src/audio/audioManager.js`; the player UI follows in Phase 2b.
- `F`-key hidden Showcase overlay → dedicated Showcase page, discoverable from the Hub.
- Cormorant/DM Sans/DM Mono/gold palette (pre-V3 `ARCHITECTURE.md`) → Neue Haas Grotesk / Geist Mono / Day-Night palette (§12–13).

---

# 2. Product definition

GT3 is a desktop-only interactive motorsport showcase organized around four differentiated experiences:

1. **Landing** — introduction / desire
2. **Grand Tour Hub** — control surface
3. **Showcase** — inspect
4. **Grand Tour** — drive

Core balance: **editorial luxury + restrained software UI + game-like progression**, targeting **a premium official-motorsport-quality digital showcase with selective game-like interaction**.

GT3 is not: a full racing game, a passive luxury microsite, a dealership configurator, a SaaS dashboard, a simulator HUD, or an arcade product.

**Design priority / tiebreaker**, in order: (1) official motorsport / institutional polish, (2) Gran Turismo / Driveclub presentation and interaction quality, (3) luxury automotive component craft, (4) game mechanics. Use motorsport/game references for quality, precision, motion, interaction, composition — never reproduce ACO branding, 24 Heures du Mans identity, manufacturer websites, Gran Turismo/Driveclub screens, or real event branding. Inspiration, not imitation.

**Experience responsibilities are not to blur.** Grand Tour in particular remains fundamentally uninterrupted — no narration, Showcase, montage, info card, modal, or forced pause inside it.

---

# 3. Technical foundations (preserve where compatible)

Desktop-only. Mouse, wheel, and trackpad input. One player car. Three.js/WebGL + DOM/CSS overlay. The exact ten-car roster and existing models. Session-scoped browser persistence (no accounts/backend/database).

Do not add: mobile, opponents, traffic, racing AI, multiplayer, accounts, database/backend, leaderboards, achievements, currency, unlock economy, extra cars, or additional race modes.

---

# 4. Page 1 — Landing

Empty, restrained composition. **Pure white in Day. Deep navy in Night.** Same composition in both themes.

Use: large `GT3`, a small floating Lexus RC F GT3, substantial negative space, a persistent audio control. No floor, scenery, platform, card, stats, large navigation, or visible primary CTA.

Scrolling progresses the experience. The Lexus rotates extremely slowly, reacts subtly to cursor yaw/pitch, and may have subtle lighting response; it stays small enough to preserve the composition.

## Landing → Hub signature transition

Downward scroll: (1) Lexus idle settles, (2) car rotates toward a deliberate front-three-quarter, (3) `GT3` recedes/fades, (4) camera pushes toward a bright automotive front/headlight/body detail, (5) reflections/bodywork increasingly fill the viewport, (6) frame resolves toward the active theme's base field (white in Day, deep navy in Night), (7) Grand Tour Hub emerges from that same field. Reverse cleanly when scrolling upward. No hard cut. Exact automotive detail is implementation-level.

---

# 5. Page 2 — Grand Tour Hub

The functional home/control surface. Primary action: Grand Tour start (working label `START RACE`, exact wording implementation-level). Secondary: Cars, Day/Night, Music/audio. Substantial negative space; a restrained sculptural checkered-flag accent may appear near the primary action.

Do not add: track selection, modes, unnecessary stats, speed/distance, redundant race menus, dashboard clutter.

The Hub player treatment (§9) is visually more substantial here than anywhere else in the app.

**Scroll ownership — canonical product behavior, not implementation-tunable.** Landing → Hub is scroll-driven and reversible (§4). Once the Hub reaches its resting/control-surface state, downward scroll does **not** launch Grand Tour or advance to another experience — the Hub is intentionally a calm, click-driven control surface, and `START RACE` is the deliberate commitment into Grand Tour. Scrolling upward from the Hub reverses the Landing→Hub transition (§4). Grand Tour itself becomes scroll-driven only once explicitly entered (§14); Showcase is entered explicitly via Cars (§11, §25). This separation is intentional: Landing = introduction/desire, Hub = control/decision, Showcase = inspection, Grand Tour = driving. Only the transition choreography/timing is implementation-tunable — the interaction rule itself is fixed.

---

# 6. Global playlist — source and integrity check

Shipped location: `public/audios/playlist/track_1.mp3 … track_6.mp3`. The six source tracks were moved and renamed there in Phase 2a (2026-09-27): git renames, byte-identical by MD5, with no duplicate copies. The original folder `audios/background_playlist/` now holds only the six covers, in `audiocover_NOTaudios/`, which stay there until the Hub player needs them in Phase 5.

**Verified state at spec time:** 6 audio files, all carrying explicit `(name this track_X)` markers, and 6 cover images (in a subfolder — see Open Issues §30.2). This matches the brief's expected state. The table below records the original source filenames for provenance only.

| GT3 alias | Original source filename (pre-move) | Cover file |
|---|---|---|
| `track_1` | `Cult Member - one(name this track_1).mp3` | `track_1.png` |
| `track_2` | `Vegyn - The Path Less Traveled(name this track_2).mp3` | `track_2.jpeg` |
| `track_3` | `blije - through the windshield(name this track_3).mp3` | `track_3.jpeg` |
| `track_4` | `Vegyn - Mystery or Misery(name this track_4).mp3` | `track_4.jpeg` |
| `track_5` | `Cult Member - U Weren't Here I Really Miss You(name this track_5).mp3` | `track_5.jpeg` |
| `track_6` | `Cult Member - Fantastic Life(name this track_6).mp3` | `track_6.jpeg` |

All six `(name this track_X)` markers are present, unique, and cover `track_1`–`track_6` exactly once — **the explicit-marker mapping is authoritative and valid**; the fallback numeric/alphabetical rule in the brief is not needed. Playback sequence: `track_1 → track_2 → track_3 → track_4 → track_5 → track_6 → track_1`, looping indefinitely while music is active, auto-advancing on track end.

Real artist/title names must never appear in the GT3 UI — only `track_1…track_6`. Only the six audio files count as tracks; cover images are never treated as playlist entries. The playlist/player system is **net-new** (§1b). The music engine was implemented in Phase 2a **inside `src/audio/audioManager.js`**, with the alias table in `src/data/playlist.js`. The player/speaker UI is Phase 2b, and per-track covers are Phase 5.

---

# 7. Global music player — function

One shared player system, global. A refined, contemporary interpretation of a simple iPod-style player filtered through GT3's premium UI language — not Spotify, not Apple Music, not a media-library app, not a giant playlist browser. It is a GT3 feature, not a music app embedded into GT3.

Core controls: play, pause, previous, next, current/total runtime, progress/seek bar with direct scrub, current `track_x` label, music-only mute/unmute, a `+` playlist/track-list expansion revealing all six tracks with direct selection.

---

# 8. Persistent audio control

A compact persistent speaker control is visible throughout the entire site (Landing, Hub, Showcase, Grand Tour, completion, and any other global surface). It must remain available in every normal interactive state, including mid-transition where interaction remains possible; its position and composition may adapt or recompose to avoid conflicts with the local composition, but it must not simply vanish. The speaker controls **master mute/unmute**: master mute silences music + SFX; master unmute restores SFX, and restores music only if the independent music channel is not itself muted. No independent SFX-only mute is required.

Beside the speaker sits a small `+` that opens the global player.

## Open/close motion

Outside the Hub, the player begins as speaker + small `+`. Opening it should feel spatially connected to that control: it originates from and expands around the speaker/launcher position, like one component transforming rather than a modal appearing, with restrained depth/shadow, polished choreography, and a compact footprint. Closing reverses back into the anchor. This is a signature microinteraction. Avoid heavy glassmorphism, large SaaS-card animation, a detached modal, excessive blur, or distracting bounce/spring. Exact size, timing, easing, shadow, and placement are runtime tuning decisions.

---

# 9. Hub-specific music player presentation

The Hub uses the same player system but presents it more prominently: larger `track_x` cover artwork, current-track label, play/pause, previous/next, seek/progress, runtimes, music mute, and the track-list `+`. It should feel integrated into the Hub composition, not opened as an overlay each time — visually substantial enough to read as an intentional object, but secondary to the primary Grand Tour action. It still follows GT3 typography, active theme, negative-space doctrine, and restrained hierarchy. Do not turn the Hub into a music app.

## Hub track-list expansion (recomposition, not growth)

Because the Hub player has larger cover art, opening the track-list `+` must not simply make the whole component bigger. Instead it **recomposes**: cover art subtly reduces/recedes, controls compact/reflow if needed, the track-list area gains space, and `track_1…track_6` become browsable within the same player object — one cohesive surface reorganizing itself, not a second card or a modal. Closing reverses the recomposition. Exact composition is implementation-level.

---

# 10. Audio initialization

One browser-safe audio lifecycle, reusing the accepted explicit-gesture pattern already in `audioManager.js` (§1a). Preferred first initialization opportunity: an explicit Landing sound interaction / sound-on affordance (restrained, not a large modal). Audio may also initialize later through another explicit audio control. Scroll must never initialize WebAudio; Grand Tour start is not the intended first-init event; do not create competing init paths — one shared AudioContext/manager lifecycle only.

---

# 11. Page 3 — Showcase

One selector/inspection environment. Presentation: hero car, generous scale, substantial negative space, restrained peripheral UI. No garage, floor, plinth, showroom architecture, or dashboard/card around the car. Day: pale/white exhibition field. Night: deep navy exhibition field.

## `showcase_ref` — role (narrow)

Path (actual on-disk name — see Open Issues §30.1): `reference _images/showcase_ref.jpeg`. Opened and inspected successfully (it is **not** inaccessible). It depicts a Gran Turismo garage/dealership screen: dark showroom field, a top info bar, a right-side price/spec panel, and a bottom horizontal thumbnail strip of car variants.

Take only: hero-car-to-negative-space relationship, car dominance, the broad selector/browsing relationship implied by the bottom thumbnail strip. Do not inherit: the dark showroom atmosphere, colors, lighting, top info bar, right spec/price panel, typography, information density, borders, crowded thumbnail treatment, or "dealership" feeling. It is a composition/selector reference, not an art-direction template.

## Locked showcase asset

Path (actual on-disk name — see Open Issues §30.3): `models/car_cover_model` — verified present as a valid glTF-Binary model. Locked presentation: generic covered form, hidden identity, `?` / `???` label, no manufacturer clues; shroud geometry must not reveal which car is underneath.

Unlocked: real model, car identity, manufacturer badge, narration, optional expandable technical data.

## Selector / orbit

Bottom selector across the exact ten-car roster. Locked cars show `?`; unlocked cars show their manufacturer badge/logo.

Primary orbit interaction is **pointer/mouse drag**: horizontal drag controls orbit, a restrained vertical drag controls pitch, clamped so the user cannot reach awkward underside angles — no unrestricted free camera, no 3D-editor-style controls. Scroll is not used for page navigation inside Showcase and does not need to manipulate the car by default; if implementation testing later establishes a useful restrained wheel/trackpad inspection behavior, it may be added only if it does not interfere with predictable navigation.

Selecting an unlocked car changes model, updates identity, starts its narration. Selecting a locked car shows `car_cover_model` and exposes discovery/unlock actions. Default information stays sparse: car → identity → narration → optional deeper data on request. Do not permanently surround the car with specifications.

## Manual unlock

Locked cars can be discovered through Grand Tour or unlocked manually — no currency, challenge, minigame, grind, or unlock economy. The existing montage is expected for manual unlock:

1. user commits → 2. checkered-flag wipe covers view → 3. existing montage plays → 4. covered model swaps behind the transition → 5. real model appears → 6. manufacturer badge/name appear → 7. narration begins → 8. car becomes inspectable.

Do not build an expensive cloth-removal simulation. The montage belongs here and must not return as an interruption inside normal Grand Tour progression.

---

# 12. Typography

## Neue Haas Grotesk — primary

For hero, headings, body, nav, buttons, general UI. The repo contains the licensed asset at `font/` (four families: Display, Display Round Dots, Text, Text Round Dots — all "-Trial" weight files; see Open Issues §30.5 for a licensing flag). Use this repo asset; do not fetch or replace it from the internet.

## Geist Mono — selective

For genuine timing, identifiers, positions, technical/machine data. Not present in the repo; it is a freely licensed family and may be sourced normally (Google Fonts/CDN) without violating the "don't fetch the licensed font" rule, which applies only to Neue Haas Grotesk.

## Oblique treatment — selective

Short, high-energy motorsport emphasis via Neue Haas Italic/Oblique or a restrained custom skew. Avoid the old Cormorant direction, futuristic racing fonts, outlined/glowing text, excessive uppercase, permanent italics, or fake telemetry styling.

Hierarchy: Neue Haas Grotesk = premium/editorial voice · Geist Mono = machine/data layer · selective oblique = speed/competitive emphasis.

---

# 13. Day / Night — global theme

Only two states exist — no five-state time-of-day architecture (replaces `src/scene/timeOfDay.js`'s current five presets entirely, §1b).

**Day:** white/pale fields, dark typography/icons, pale architecture, sufficiently dark road for contrast.
**Night:** deep navy, dark navy/near-black architecture, refined motorsport-yellow UI/type accents — not grey/black generic darkness, not neon.

One global theme state applies to **the entire site with no exceptions**: Landing, the Landing→Hub transition, Hub, Hub player, global speaker, expanded player, track list, Showcase, Grand Tour, Grand Tour HUD, circuit map, manual-unlock framing/overlays, completion, and any surface added during implementation. No component may hardcode a single theme; a theme change propagates everywhere at once via one shared state, with smooth interpolation. Pre-rendered montage content may keep its authored imagery, but its surrounding framing/overlays/transitions/controls stay theme-aware. The toggle can live wherever the final composition calls for it.

## 13a. Night route lighting (Grand Tour)

This section locks the **outcome**. The lighting design and technical approach remain **open**, and are Phase 8's to design and iterate.

### Locked outcome
- Night in Grand Tour must feel like an **intentionally authored, premium night-driving environment**, not a darkened Day scene.
- The **road, the active car and the immediate driving environment stay clearly readable**, while **meaningful darkness and atmosphere are preserved**.
- Day↔Night changes interpolate smoothly, consistent with §13.
- It stays consistent with GT3's overall visual direction (§12–16, §23) and within the performance constraints below.

### Desired components (directional, not a fixed solution)
- **Functional car headlights / forward illumination** on the active car that meaningfully light the road and nearby geometry ahead (road surface, curbs, checkpoint structures §18, near scenery). They should carry through in-Tour car swaps (§19).
- **Street/trackside lighting** as part of the night environment.

### Open to Phase 8 design and iteration
- The exact **fixture style, density, placement, light types, illumination strategy**, and how trackside lighting relates to other environmental lighting (sky, fog, emissive architecture, ambient).
- Whether to use **additional or alternative lighting techniques** where they produce a better result.
- **Not locked:** uniformly spaced streetlights, any specific number of lights, or any single technical lighting implementation.
- **Directional cautions, not rules:** avoid an arcade-like uniformly lit look and a flat "flashlight cone" headlight.

### Constraints
- **Performance-safe** (§16 "Scenery is also performance design", §27): bound the use of expensive local lights and shadow-casting lights, and reuse lighting where practical. Scroll smoothness remains the top priority, and the final approach is chosen by visual review plus measurement.

**Ownership:** designed and implemented in **Phase 8 (scenery / lighting / performance pass)**. Earlier phases, **including Phase 3 (Grand Tour core), must not pre-build it.** Until Phase 8, Grand Tour at Night uses the existing `src/scene/theme.js` night preset. Phase 3 may place checkpoint structures without any Night-lighting provisions.

---

# 14. Page 4 — Grand Tour

The experiential core. Scrolling drives route progression: smooth, responsive, controllable, predictable, reversible where compatible, uninterrupted. Increase distance/time between vehicle-progression events by **~30–50%** relative to the current implementation, giving the user meaningful time to experience driving, camera, car, road, world, and atmosphere between events.

Do not interrupt Grand Tour with narration, Showcase, montage, info card, modal, F-key presentation, or forced pause.

## Scroll interaction quality

Scroll quality is the primary user-facing performance metric — not average FPS alone. Test wheel and trackpad, forward and backward, slow and fast, sustained scrolling, and repeated direction changes. Target fluid, predictable, responsive, controllable; avoid sudden jumps, over-sensitive mapping, uncontrolled inertia, choppy damping, unreliable reversing. Provide a subtle first-use/contextual cue for forward/backward direction (current code already has one — `src/scroll/scrollDrive.js` / the HUD telemetry cue in `BUILD_LOG.md` job N — evolve it, don't rebuild from scratch) without turning it into permanent HUD clutter. Preserve the accepted reversible-scroll behavior where technically compatible.

---

# 15. Camera references and doctrine

Canonical folder (actual on-disk name — see Open Issues §30.1): `reference _images/camera_angles/`. All five images opened and inspected.

- `camreference_1` = Circuit Superstars — very steep oblique, roof+side clearly readable, car travels convincingly through frame. **Take:** structural oblique angle, lateral readability, roof+side relationship. **Do not take:** flat/gamey rendering, exact stylization, its in-frame race HUD.
- `camreference_2` = Wooden GP II — similarly steep, dense tree framing, red/white/green curb striping. **Take:** corner readability, car-to-track relationship, bend composition. **Do not take:** overly top-down/isometric character.
- `camreference_3` = Assetto Corsa Competizione — much lower/wider angle (~30–40°), true dune/terrain depth, cars comparatively small/distant. **Take:** real 3D terrain depth, elevation, spatial scale, layered world geometry. **Do not take:** its excessive hero-car distance — this is the caution the reference itself demonstrates.
- `camreference_4` = real Spa Eau Rouge/Raidillon drone photo — extreme altitude, dense forest, cars tiny. **Take:** drone/skyscraper mentality, track-as-landscape, broad spatial context. **Do not take:** its detached event-overview scale — again, the reference demonstrates the failure mode to avoid.
- `camreference_5` = Okayama — moderate elevation, gravel runoff, mountains/atmosphere in background. **Take:** cinematic aerial composition, environmental scale, runoff/elevation presence. **Do not take:** excessive width/distance.

## Grand Tour camera

High-elevation oblique drone/skyscraper camera, approximate pitch **45–60° downward**. Roof + side of car visible, road readable, substantial environment context, true 3D depth, hero vehicle clear. Player car target: **~20–30% larger on-screen** than vehicles in `camreference_1`, at comparable frame width — achieved without destroying the high-altitude character.

**Camera behavior — a major architectural change from current code.** The current camera (`src/scene/carRig.js`) is a child of the car rig, permanently fixed in screen position while the world moves. The new doctrine is the opposite: the camera maintains **stable world-space orientation** and does **not** rotate with the car; the car turns beneath/within the frame. Camera translation behaves like a controlled aerial rail — no free orbit, no swinging around every corner, no constant dual-axis recentering, no pinning the car to one screen coordinate, no conventional chase-camera behavior. Allow controlled screen-space drift; use only enough framing correction to keep the car safely visible. Motion should feel stable, smooth, subtly inertial, premium, cinematic rather than reactive. Runtime-tune FOV, elevation, pitch, lateral offset, look target, damping, tracking gain, and safety framing.

---

# 16. Scenery references and doctrine

Canonical folder (actual on-disk name — see Open Issues §30.1): `reference _images/scenery/`. All five images opened and inspected.

- `sceneref_1` = Porsche Leipzig — flat open grassland, factory buildings and a distinctive tower in the distance, track calmly integrated into the land. **Take:** composition, readable road structure, calm open terrain, architecture/land/road balance. **Do not take:** the literal facility, branding, architecture, barrier styling.
- `sceneref_2` = Toyota Technical Center — an architectural masterplan render: winding test roads through dense forested hills, restrained low white buildings, a pond. **Take:** engineered landscape logic, purpose-built automotive character, road embedded naturally into land. **Do not take:** the literal campus, dense realistic forest, parking/facility detail, Toyota identity.
- `sceneref_3` = OMA architectural model — white foam-board massing study with abstracted green cube "trees," a red pedestrian accent path, and translucent tower forms. **Take:** abstraction, massing, hierarchy, primary-vs-secondary form discipline (this is where the "grouped vegetation masses, not individually heroic trees" doctrine in Grand Tour scenery below comes from). **Do not take:** the foam-board appearance, all-white miniature treatment, literal architecture, miniature-model feeling.
- `sceneref_4` = Gran Turismo Sport — an **indoor showroom** scene (glass-roofed hall, stone walls, wood floor, a single red heritage Ferrari). **Take only:** finish quality, material restraint, lighting discipline, proportional refinement. **Do not take:** the showroom, its indoor spatial logic, or its exact static presentation — this reference is explicitly indoor and must not leak an interior-showroom feeling into an outdoor circuit.
- `sceneref_5` = Driveclub — a dramatic snowy mountain pass with photoreal rock/snow/pine and strong foreground/mid/background depth. **Take:** scale, atmosphere, foreground/mid/background depth, distant-world presence, atmospheric falloff. **Do not take:** dense photoreal vegetation, roadside clutter, exact realism level.

## Grand Tour scenery

Target: **a premium full-scale automotive world built with the clarity of an architectural prototype** — not dense racing-game scenery, photoreal clutter, unfinished greybox, literal scale model, cyberpunk, or sci-fi.

Hierarchy: hero car → road → curbs/edges/markings → materials/shadows → terrain → essential architecture → vegetation masses → decorative detail. Terrain: broad sculpted forms. Grass: broad controlled terrain treatment, not dense hero-level grass. Vegetation: grouped masses/silhouettes, not individually heroic trees everywhere. Architecture: monolithic, restrained, engineered — paddock volumes, retaining walls, bridges, simple grandstands, towers, barriers, sparse fencing, occasional landmark forms. Every object should define the circuit, frame composition, establish scale, create depth, or reinforce automotive-world identity.

## Scenery is also performance design

Environmental restraint is both aesthetic and computational. Do not build an expensive realistic world and reduce it until it runs — design the intended visual language to be naturally cheap: broad simple terrain, asset reuse, instancing, grouped vegetation, monolithic architecture, fewer materials, lightweight shaders, static/baked techniques where useful, limited shadow casters, low-cost atmosphere, concentrated detail near hero/road, reduced off-camera detail. If visual density conflicts with scroll smoothness, **scroll smoothness wins**. The same applies to Night route lighting (§13a): its design and implementation belong to the Phase 8 scenery/lighting/performance pass, not separate earlier work.

---

# 17. Circuit

An original closed-loop circuit, broadly inspired by Spa-Francorchamps and Circuit de la Sarthe without copying either — long sweeping sections, tighter technical sections, recognizable corner forms, varied rhythm, distinctive silhouette. Must work both in the Grand Tour aerial composition and as the small HUD map. Exact geometry is runtime/implementation work; the current spline (`src/scene/trackCurve.js`) already encodes named corner beats (chicane, back straight, hairpin, esses) that may be extended/reused rather than discarded.

---

# 18. Progression — checkpoints, not coins

No coins (replaces `src/scene/coins.js`'s visible branded emblem discs entirely, §1b). Use restrained in-world **sector/checkpoint thresholds**: a subtle translucent gate/structure, conceptually related to motorsport timing/sector infrastructure, architectural, world-integrated, restrained — not a collectible, glowing power-up, arcade portal, sci-fi gate, or fantasy object. Approach may reuse the existing proximity/incoming SFX (`coin_approach.mp3`). Crossing triggers the next car. Lexus (roster index 0) is discovered from session start as the Landing/starting car, so there are **9 discovery checkpoints**, one each for cars 1–9. Exact geometry, material, opacity, animation, and visibility distance are implementation-level.

Crossing a checkpoint is **silent**: it reveals/unlocks the associated car in session discovery state (§26) and performs the normal lightweight in-Grand-Tour car swap (§19) — nothing else. No narration, no reveal ceremony, no prompt, no Showcase transition. The newly discovered car simply becomes selectable the next time the user enters Showcase (§11). The montage/identity-reveal/narration sequence only ever plays through manual unlock (§11) — Grand Tour stays uninterrupted (§2).

Because identity is now hidden until discovery (§11), checkpoints must **not** carry brand color, emblem, or silhouette hints the way the old coins did — this is a direct consequence of the locked/mystery-car system and is not optional.

---

# 19. In-Grand-Tour car swap

Preferred: a short digital/pixelated morph, but performance outranks the exact effect — acceptable alternatives include dither dissolve, masked crossfade, motion smear, or lightweight model replacement. Requirements: very short, smooth, no pause, no scroll interruption, no heavy reload, no meaningful frame-time spike, no narration/info-card/montage/Showcase. Use runtime measurement to pick the cheapest clean technique. The existing morph system (`src/scene/morph.js`) already does cross-fade + emissive pulse + particles at the accepted cost profile — evolve it rather than rebuilding from zero unless measurement says otherwise.

---

# 20. Grand Tour HUD

Extremely sparse.

- **Top-right:** closed-loop circuit map, strong contrast, sufficiently thick/readable, moving position indicator.
- **Top-left:** current car name, optional subtle progression context, optional small passive 3D car only if performance genuinely permits it. No large enclosing card.
- **Bottom/edge:** Day/Night control, and the persistent audio control (§8) — always present; its exact placement adapts to this HUD's edge layout.

Do not add: speed, distance, unnecessary timer, stat wall, fake telemetry, incoming-car card, narration, Showcase overlay, or F-key Showcase. Showcase = inspect; Grand Tour = drive.

---

# 21. Grand Tour → completion hero transition

**Agent-designed flow — revisable.** The Grand Tour should not simply stop. Conceptual direction: the player car continues past the final progression point; the environment progressively simplifies/disappears behind and around it; circuit/world elements fall away; the car becomes increasingly dominant; the camera transitions toward a more cinematic finishing angle (a high oblique/bird's-eye framing derived from the Grand Tour camera language is one promising direction); the car may appear to travel toward the viewer as circuit curvature simplifies into a cleaner graphical motion path; scenery continues disappearing until the composition is primarily car + motion + active-theme field; this resolves into completion, where the car may recompose/shift vertically into a slow rotating hero presentation, from which the completion control is presented.

This is directional, not a locked storyboard — the implementer may determine exact camera choreography, beat order, whether the car literally moves toward camera or only appears to via framing/parallax, how much circuit remains visible, environment-disappearance timing, whether/where the rotating hero state belongs, the exact return transition, duration, and whether to use one intermediate visual beat. It may simplify/combine beats if the result is stronger.

Must feel cinematic, premium, deliberate, spatially continuous, automotive, increasingly visually simple, and closer to a closing automotive film beat than a videogame victory animation — not a score/results animation, achievement sequence, arcade finish, particle climax, or long forced cutscene. The car remains the visual through-line. Follows the active theme, resolving toward the Day/Night base field as scenery disappears; completion UI and hero-car presentation stay theme-aware.

**Performance constraint:** must not meaningfully compromise Grand Tour performance leading into it. Prefer reusing the existing player model, camera/scene infrastructure, progressively hiding environment complexity, lightweight transforms, opacity/masks, simple lighting changes, inexpensive depth/parallax, existing assets. Avoid large finish-time asset loads, an unnecessary second renderer (the montage's separate `studio.js` renderer is known-expensive per §27 — do not repeat that pattern here), heavy shader effects, meaningful frame-time spikes, or anything that makes the preceding Grand Tour itself more expensive. If the elaborate concept conflicts with performance, preserve the conceptual beat with a cheaper implementation.

---

# 22. Completion state

Not a fifth page — the Grand Tour resolves into this state through the hero sequence above. Must include `GRAND TOUR COMPLETE` and an appropriate return/home control. May retain the finishing hero car / slow rotating model. Do not add a score screen, achievement page, reward summary, race-results table, giant celebration, or game-reward language.

---

# 23. UI language and copy voice

**UI:** premium, restrained, modern, slightly software-like where useful. Allow compact pills, clean buttons, moderate rounding, subtle surfaces, refined shadows, large negative space. Avoid glassmorphism overload, giant SaaS pills, admin-dashboard layouts, generic racing UI, neon, excessive blur, fake technical decoration. All applicable controls need coherent hover/active/focus states, using shared motion/easing families rather than one-off animations.

**Copy:** concise, confident, restrained, premium, motorsport-native. Avoid arcade hype, childish reward language, excessive exclamation, unnecessary technical jargon, fake machine terminology. Fixed wording: `GT3` and `GRAND TOUR COMPLETE`. Everything else may be refined during implementation where behavior is unambiguous.

---

# 24. Session persistence

Refresh within the same browser session: **preserve the current session.** A genuinely new browser/tab session: **starts fresh.** Session-scoped browser persistence (no account/cloud). Persist: unlocked cars, Day/Night, master mute, music mute, selected playlist track, playback position where sensible, intended play/pause state, and relevant Grand Tour session state (route position, discovery state — see §26).

**Audio restoration after refresh:** may restore remembered track/position/mute/play-intent state in the UI, but browser autoplay restrictions still apply — restored playback resumes only after a genuine user gesture. Never autoplay merely because prior session state says audio was playing; no hidden autoplay workaround.

---

# 25. Agent-designed flows (navigation and edge states)

The following were left open by product direction and are **designed here**, each marked **Agent-designed flow — revisable**, per the documentation requirement. Every choice below preserves smooth/predictable scrolling, adds no meaningful rendering cost, respects the four experience responsibilities, follows the restraint doctrine, avoids unnecessary modals, avoids hard cuts where continuity is expected, and behaves correctly under Day/Night and session state.

**Entering Showcase.** *Agent-designed flow — revisable.* Clicking "Cars" on the Hub composition-transitions (cross-fade/push, no hard cut, reusing the shared renderer) into Showcase. This is the only entry point. Grand Tour never transitions into Showcase, even when a checkpoint discovers a new car (§18) — discovery there is silent, and the car only becomes selectable the next time Showcase is opened via the Hub.

**Leaving Showcase.** *Agent-designed flow — revisable.* Showcase is a bounded inspection environment, not a scroll-route page (§11) — exit is an explicit small back/home UI affordance that reverses the entry transition back to the Hub.

**Hub → Grand Tour.** *Agent-designed flow — revisable.* Clicking `START RACE` transitions the Hub composition into the Grand Tour's opening camera position; scroll is then immediately armed for route progression, mirroring the existing "Scroll to Race" handoff pattern already validated in `src/ui/startScreen.js`, adapted to launch from the Hub rather than from a start screen.

**Leaving Grand Tour mid-run.** *Agent-designed flow — revisable.* A small back/home affordance lives in the sparse HUD edge area (§20) alongside Day/Night and the speaker — scroll cannot be reused for exit since it drives the route. Activating it returns to the Hub, preserving route position and discovery state (§24, §26) for resumption.

**Returning to Landing.** *Agent-designed flow — revisable.* Reachable only from the Hub via reverse scroll (§5), not directly from Showcase or Grand Tour. This keeps the four-experience hierarchy legible — one always passes back through the control surface — rather than allowing skip-level hard cuts.

**Browser Back / refresh.** *Agent-designed flow — revisable.* GT3 does not create synthetic browser-history entries for Landing, Hub, Showcase, or Grand Tour — the four experiences are internal application states, not URL routes. Browser Back retains normal browser behavior and may leave the site; GT3 does not intercept or manipulate it to simulate internal page navigation. Refresh restores the active session/state where technically sensible (§24) — Hub, Showcase, or a Grand Tour route position, not always Landing; a genuinely new browser session starts fresh per the session-persistence rules, and Landing appears only then. Use the simplest browser-native storage/lifecycle mechanism that satisfies refresh-vs-new-session behavior — no custom history/session machinery built solely to enforce edge-case semantics. Persisted state (unlocked/discovered cars, Day/Night, master mute, music mute, selected track, sensible playback state, Grand Tour route/discovery state) and browser autoplay restrictions (§10, §24) are unchanged.

**Audio-player open state across transitions.** *Agent-designed flow — revisable.* The expanded player auto-collapses to its compact speaker+`+` anchor whenever a major experience transition begins (Landing↔Hub, Hub↔Showcase, Hub→Grand Tour, Grand Tour→Completion), then reappears collapsed in the new experience. Playback itself (track, position) is never interrupted by this — only the open/closed visual state resets, avoiding layout collision with the incoming composition.

**Theme-switch mid-transition.** *Agent-designed flow — revisable.* Theme changes apply instantly and globally (§13) even while a transition/choreography is in progress; an in-flight transition simply re-evaluates its field colors on the next frame rather than blocking or queuing the toggle.

---

# 26. Progression reversal — route state vs. discovery state

*Agent-designed flow — revisable, but the distinction itself is required, not optional (§25).*

**Discovery state** — which cars have identities revealed/are unlocked — is **monotonic within a session**. Once a car is discovered, whether by reaching its Grand Tour checkpoint or by manual Showcase unlock (§11), it stays discovered regardless of later scrolling backward, and this is part of the persisted session state (§24). Discovery is an achievement, not a transient visual effect. Discovery via a Grand Tour checkpoint (§18) is a silent state update only — no narration, no reveal ceremony, no Showcase transition; only manual unlock (§11) plays the reveal sequence.

**Route state** — which car currently skins the player car during Grand Tour — **does** follow scroll position bidirectionally. Scrolling backward past a checkpoint reverts the active car to the previous checkpoint's car, using the same short swap effect (§19) run in reverse-equivalent, because route state represents "where you are on the circuit," not "what you've found."

**Repeated forward crossing** of a checkpoint whose car is already discovered performs only the route-state visual swap — it does not replay discovery-state side effects (no re-unlock beat, no duplicate roster change in Showcase). This keeps back-and-forth scrolling cheap, glitch-free, and consistent with "Grand Tour remains uninterrupted" (§2).

**Scrolling backward out of the finish/completion hero sequence.** *Agent-designed flow — revisable.* Because completion is triggered by reaching route end (t=1), scrolling backward during or shortly after the hero sequence cancels completion and reconstructs normal Grand Tour camera/environment state at the corresponding route position, using the same progressive-hide mechanism in reverse (environment/circuit fade back in as the camera de-simplifies) — spatially continuous, per §21. Normal scroll-driven route control is restored once the reverse transition completes.

---

# 27. Performance doctrine

Primary user-facing metric: **scroll feel**, not raw FPS. Use measure → attribute → hypothesize → change → compare → verify. Prefer eliminating unnecessary work, reducing expensive work's frequency, rendering only what's necessary, caching/reuse, targeted fixes with small blast radius. Do not broadly refactor working architecture for cleanliness, lower important quality for tiny unmeasured gains, or treat a successful build as performance proof. Preserve highest visual value per unit of rendering cost.

**Grand Tour priority order:** scroll response/frame pacing → stable camera → hero car → circuit → materials/shadows → environment → secondary effects. An optional passive 3D HUD car is allowed only if it survives real performance review.

## Verified lessons worth preserving (from `BUILD_LOG.md` — evidence, not product doctrine)

- **Fill rate, not geometry, was the real bottleneck.** GPU-timer measurement showed cost ~linear in pixel count (~9.8 ms/megapixel); at dpr 2 the GPU alone capped the race scene at 25 fps before any CPU work. Do not assume geometry/shadow reduction is the fix without measuring fill rate first.
- **Adaptive render resolution** (lower dpr while scrolling, full dpr at rest, ~420 ms settle) is an accepted, user-approved tradeoff — motion blur/streaking mask the softness while moving. Showcase/hero-inspection states must render at full quality; this is why the current code forces full resolution for Showcase/montage/fullcard.
- **Non-passive wheel/touchmove listeners measurably damage scroll feel independent of frame rate** — merely registering them disables Chrome's threaded scrolling for the whole page. Attach them only while scroll must be actively suppressed (e.g. during a locked/transition state), not globally.
- **A second WebGLRenderer is expensive and easy to lose track of.** The montage's separate `studio.js` renderer sat outside the adaptive-resolution system entirely and was, measured, the single largest remaining cost (~15.6 s montage × 10 at a 25 fps ceiling before its own fixed-resolution fix). Do not introduce another separate renderer for the completion hero sequence (§21) — reuse shared scene/camera infrastructure.
- **Car orientation relies on a verified per-model table**, not geometry heuristics (`src/scene/cars.js` logs each car's applied flip from "the verified orientation table") — preserve this approach for any new car-facing code.
- **WebAudio initialization must depend on a valid user gesture**, never scroll — Chrome does not count wheel/scroll as user activation; this was fixed once already (`BUILD_LOG.md`, job I) and confirmed again by the later "explicit Sound On" commit history. Do not regress it.
- **Montage re-choreography can shorten duration without changing perceived motion rate** — when the montage was cut from 15.6 s to 5.0 s, every shot's travel/FOV/rotation span was shortened in the same proportion as its duration, so linear travel and angular rates stayed identical. Apply the same technique if any hero/cinematic sequence needs future retiming.

---

# 28. Non-goals (repeated for emphasis)

Do not add: mobile, opponents, traffic, racing AI, multiplayer, accounts, database/backend, leaderboards, achievements, currency, unlock economy, extra cars, unnecessary race modes, a garage/comparison page, photo mode, manual/free-camera Showcase, additional collectible systems, or dealership/gallery-site structure. Do not drift into generic SaaS design, a realistic simulator UI, F1 imitation, cyberpunk/neon styling, or a cluttered game HUD.

---

# 29. Acceptance

A fresh implementation agent should be able to determine, from this file alone: what GT3 is; the four-experience model and their responsibilities; the design hierarchy; typography; global theme; Landing and Landing→Hub behavior; Hub behavior; global audio/player behavior including the six-track aliasing, ordering, and cover mapping; the Hub cover-art player and its track-list recomposition; master mute vs. music mute; audio initialization; refresh-safe audio restoration; Showcase behavior; locked-car behavior; manual unlock; Grand Tour progression; reverse-checkpoint behavior and the route-state/discovery-state distinction; camera doctrine; scenery doctrine; progression checkpoints; car swap; HUD; the hero finish transition and reversing out of it; completion; session behavior; performance doctrine; non-goals; every agent-designed navigation flow; open repo mismatches; and implementation-level freedoms — without reading the design chat that produced it.

---

# 30. Open Issues / Repo Mismatches

1. **`reference_images/` is actually `reference _images/`** (with a literal space) at the repo root. All paths in this spec use the real on-disk name. `camera_angles/`, `scenery/`, and `showcase_ref.jpeg` are all present and were opened successfully.
2. **Playlist cover images are not directly inside `audios/background_playlist/`** as assumed by the source brief — they live one level deeper, in `audios/background_playlist/audiocover_NOTaudios/`. All six covers are present and correctly named by GT3 alias (`track_1.png`, `track_2.jpeg` … `track_6.jpeg`); the mapping itself is not ambiguous, only the folder depth differs from expectation. *Update (Phase 2a, 2026-09-27):* the six tracks have moved to `public/audios/playlist/` (§6). The covers intentionally remain at this path, unshipped, until Phase 5 (Hub cover-art player).
3. **`models/car_cover_model` has no file extension** in its literal filename, though `file` confirms it is a valid glTF-Binary (.glb) blob (874 KB). Present but differently named — reference it by its literal name, or add an explicit `.glb` extension during the build step.
4. **`audios/background.mp3`** (the current single background loop referenced by `src/audio/audioManager.js`'s `RACE_FILES.background`) is deleted from the working tree (uncommitted, per `git status`). This is consistent with retiring the single-track system in favor of the playlist (§6). **RESOLVED (Phase 2a, 2026-09-27):** the shipped copy `public/audios/background.mp3`, byte-identical to `track_1`, was deleted, and `RACE_FILES.background` was removed from `audioManager.js`.
5. **Font licensing status is unresolved.** Every weight file under `font/` (all four Neue Haas Grotesk families) is named with a `-Trial` suffix (e.g. `NeueHaasGrotDisp-65Medium-Trial.otf`). Use this asset per §12, but confirm licensing/weight-completeness before shipping — do not assume "Trial" naming is cosmetic.
6. **McLaren → Aston Martin green road-overlay issue — REPRODUCED · IMPLEMENTED · VERIFIED TECHNICALLY · USER VISUAL ACCEPTANCE PENDING (2026-09-27).** *Reproduced:* headless Chrome captures with real GPU rendering (puppeteer-core, ANGLE/Metal, non-sandboxed) showed the defect. From roughly t≈0.645 to the Aston checkpoint, the race view was almost entirely covered by green terrain, with the road and car hidden. **Cause:** in `src/scene/environment.js` (`buildGrassGeometry`), each track edge's far grass "skirt" kept that edge's elevation hundreds of metres outward. The skirt from an earlier, higher route section (t≈0.428) therefore passed above the lower McLaren→Aston straight, between the camera and the road. A raycast hit grass ~5.5 m from the camera versus road at ~29.9 m, and hiding only the grass mesh restored the view. *Implemented:* far skirt vertices now ease toward the existing horizon elevation between 240 and 530 units from the track edge. Near-track grass is unchanged, and the camera, coin and montage code were not touched. *Verified technically:* `npm run build` passes, and post-fix browser captures at t≈0.63, 0.645, 0.66, 0.673 and 0.70 (past Aston's checkpoint) no longer show the occlusion. Only those route points were checked; distant grass elsewhere on the route was not re-captured. *User visual acceptance:* still pending. Do not treat this item as closed until the user has visually accepted it in the running experience.
7. **`ARCHITECTURE.md` — RESOLVED (2026-09-27).** Reconciled to this spec: two-state theme, checkpoints instead of coins, Neue Haas Grotesk / Geist Mono design system, world-space aerial camera, four-experience state machine. Modules are tagged keep / evolve / new / retire.
