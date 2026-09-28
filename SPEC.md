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

This is a **third product direction**, not a merge of the first two. V1 was restrained luxury-editorial with a fixed chase camera and a visible-identity coin mechanic. V2 explicitly reversed that toward "bold, colorful, Hot-Wheels-like" arcade energy with a homepage/collection hub. This spec returns to a premium/editorial register but keeps V2's wider aerial camera instinct and its mystery/locked-car identity-concealment idea, folds in official-motorsport and GT/Driveclub game-presentation quality, and restructures the whole experience into four explicit pages. Do not resurrect V1's fixed camera-child-of-rig framing or V2's bold/colorful HUD language. The one narrow later exception is the Hot-Wheels-style *scale relationship* between an oversized hero car and a thin road in a large world (§15). V2's toy materials, arcade rendering and arcade camera are not taken back.

---

## 1. Current repository reality vs. this spec (read before implementing)

The current runtime on `phase3-integration` (2026-09-28) still boots through the legacy start screen directly into Grand Tour and ends at the legacy finish screen. Phase 1–2 foundations are present: Day/Night state, session state, six-track playlist, and global audio controls. Phase 3 is implemented and technically verified: a closed-loop circuit, route-led world-space aerial camera, nine identity-neutral checkpoint gates, silent discoveries and reversible car swaps, sparse HUD with circuit map, and the typography slice. The old coin progression and in-Tour `F`-key Showcase are retired. The user's live-browser review (2026-09-28) did **not** accept Phase 3 as built. Phase 3 is reopened for a Grand Tour re-evaluation and finalization pass that revises the aerial camera and world/road/car scale (§15), the scroll pace model (§14), the checkpoint traversal response and first-crossing swap smoothness (§18–19), the HUD (§20) and the audio/theme control composition (§8, §13). Decisions still awaiting the user's review are tracked in §30.9. This branch has not been merged to `main`.

Landing, Hub, dedicated Showcase, manual unlock, and the completion hero transition are still future product work. The old Showcase and montage modules remain in the repository for that work but are not reachable inside Grand Tour. Where this spec differs from current code, **that difference is implementation work**, not a documentation error. Do not silently rewrite this spec to match what already exists. Reusable current assets and systems are called out explicitly in §1a.

### 1a. What to preserve from current code

- The 10 locked GT3 GLB models and their **exact roster order** (`src/data/cars.js`): Lexus, Nissan, Audi, BMW, Mercedes, Ferrari, McLaren, Aston, Lamborghini, Porsche. Lexus is both the player/hero car (Landing) and roster index 0.
- The verified per-model orientation table in `src/scene/cars.js` (do not re-derive orientation from geometry heuristics).
- The montage/studio system (`src/montage/`) — retained for future manual unlock only (§11); no longer called by Grand Tour checkpoints.
- The narration audio (`audios/voices/voice_01…10`) and per-car copy already authored in `src/data/cars.js`.
- The explicit-gesture WebAudio lifecycle in `src/audio/audioManager.js` (no scroll-based init).
- The accepted performance findings in `BUILD_LOG.md` (§27 below) — adaptive resolution while scrolling, non-passive-listener cost, fill-rate-first attribution.
- The DOM-overlay-over-fixed-canvas split, single RAF loop, and central `state.js` pub/sub pattern (module boundaries will change; the pattern doesn't need to).

### 1b. What is explicitly replaced

- Fixed camera-child-of-rig chase framing → stable-world-space high aerial camera (§15); architecture implemented in Phase 3, with framing, scale and motion under revision in the Phase 3 finalization pass.
- 5-state time-of-day (`dawn/morning/afternoon/dusk/night`) → 2-state Day/Night (§13); implemented in Phase 1.
- Visible-identity coins (`src/scene/coins.js`) → in-world sector/checkpoint thresholds (§18); implemented in Phase 3. Locked-identity Showcase presentation remains Phase 6.
- Green naturalistic grass/tree surroundings (`src/scene/environment.js`) → a predominantly white/off-white sculptural architectural landscape around a realistic circuit (§16–17). Executed in the Phase 8 scenery pass; earlier phases only keep terrain structure compatible with it.
- Single continuous scroll page with start-screen overlay → four distinct experiences (§2, detailed per page in §4–5, §11, §14) with agent-designed transitions (§25–26).
- Single `background.mp3` loop → six-track playlist system (§6–10); engine and compact player implemented in Phase 2, Hub presentation still Phase 5.
- `F`-key hidden Showcase overlay → dedicated Showcase page, discoverable from the Hub. The `F` key is inert in Grand Tour; the new page remains Phase 6.
- Cormorant/DM Sans/DM Mono/gold palette (pre-V3 architecture) → Neue Haas Grotesk / Geist Mono / Day-Night palette (§12–13). Fonts and theme foundations are implemented; remaining experience-specific visual work follows in later phases.

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

Outside the Hub, the player begins as speaker + small `+`. Opening it should feel spatially connected to that control: it originates from and expands around the speaker/launcher position, like one component transforming rather than a modal appearing, with restrained depth/shadow, polished choreography, and a compact footprint. Closing reverses back into the anchor. This is a signature microinteraction.

The launcher shows `+` when collapsed and an explicit `×` close affordance when expanded. The glyph really changes state; a rotated plus that only looks like an ×, standing in for the second state, is not enough. The glyph change rides inside the same polished, spatially connected transition.

**Composition with neighbouring edge controls.** Where the Day/Night control (§13) shares the edge row with the audio anchor (currently Grand Tour), expanding the player moves the Day/Night control outward to the expanded player's new outer edge, and collapsing returns it. Expanding and collapsing reads as one coordinated recomposition of the edge row. Controls never sit behind or under the expanded player. Avoid heavy glassmorphism, large SaaS-card animation, a detached modal, excessive blur, or distracting bounce/spring. Exact size, timing, easing, shadow, and placement are runtime tuning decisions.

---

# 9. Hub-specific music player presentation

The Hub uses the same player system but presents it more prominently: larger `track_x` cover artwork, current-track label, play/pause, previous/next, seek/progress, runtimes, music mute, and the track-list `+`. It should feel integrated into the Hub composition, not opened as an overlay each time — visually substantial enough to read as an intentional object, but secondary to the primary Grand Tour action. It still follows GT3 typography, active theme, negative-space doctrine, and restrained hierarchy. Do not turn the Hub into a music app.

## Hub track-list expansion (recomposition, not growth)

Because the Hub player has larger cover art, opening the track-list `+` must not simply make the whole component bigger. Instead it **recomposes**: cover art subtly reduces/recedes, controls compact/reflow if needed, the track-list area gains space, and `track_1…track_6` become browsable within the same player object — one cohesive surface reorganizing itself, not a second card or a modal. Closing reverses the recomposition. Exact composition is implementation-level.

---

# 10. Audio initialization

One browser-safe audio lifecycle, reusing the accepted explicit-gesture pattern already in `audioManager.js` (§1a). Preferred first initialization opportunity: an explicit Landing sound interaction / sound-on affordance (restrained, not a large modal). Audio may also initialize later through another explicit audio control. Scroll must never initialize WebAudio; Grand Tour start is not the intended first-init event; do not create competing init paths — one shared AudioContext/manager lifecycle only.

**Sound cue in Grand Tour.** On the first Grand Tour entry of a session, while audio is still off/uninitialized, a brief, restrained visual callout points toward the Sound control. It retires as soon as the user engages the Sound control, or after a short, unobtrusive timeout if ignored, and does not return that session. The cue is visual only: it never initializes audio, and the existing explicit-gesture lifecycle stays the single init path. Once the Landing Sound-On (Phase 4) exists, the same rule applies: the cue appears only if audio is still off when Grand Tour begins.

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

**Toggle form.** A compact pill/segmented control shows both choices at once, a sun and a moon, with the active side clearly indicated. It is slightly larger and more opaque than a text-only glassy pill, so it reads immediately as a two-state switch. Interpret it through GT3's UI language (§23), not generic iOS styling. It composes with the audio anchor as described in §8.

## 13a. Night route lighting (Grand Tour)

This section locks the **outcome**. The lighting design and technical approach remain **open**, and are Phase 8's to design and iterate.

### Locked outcome
- Night in Grand Tour must feel like an **intentionally authored, premium night-driving environment**, not a darkened Day scene.
- Night uses the **same pale physical environment as Day** (§16), not a separate dark terrain material. The principle is **darkness first, pale material revealed by light**: the landscape largely falls into darkness and cool low exposure, and light selectively reveals its form (headlight throw, pools of illumination, reflected light, readable slopes and berms, strong local lit/unlit contrast). Not a bright white landscape under a navy sky. How this is achieved stays open to Phase 8.
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

Scroll quality is the primary user-facing performance metric — not average FPS alone. Test wheel and trackpad, forward and backward, slow and fast, sustained scrolling, and repeated direction changes. Target fluid, predictable, responsive, controllable; avoid sudden jumps, over-sensitive mapping, uncontrolled inertia, choppy damping, unreliable reversing. Provide a subtle first-use/contextual cue for forward/backward direction without turning it into permanent HUD clutter. The old HUD telemetry cue described in `BUILD_LOG.md` job N was retired with the Phase 3d sparse HUD; its historical implementation is not a current UI requirement. Preserve the accepted reversible-scroll behavior where technically compatible.

**Bounded pace.** The target feel is a high-quality scroll-driven website, not a racing game. The user should never have to learn a personal "correct scroll strength":

- **Input sets pace, it does not bank distance.** One large wheel or trackpad gesture must not launch the car. Rendered route speed has a firm ceiling, and input beyond what the bounded pace can use is not stored as a long catch-up drive that continues after the hand has stopped.
- **Narrow intensity range.** Gentle scrolling moves slower, normal scrolling gives the default Tour pace, and aggressive scrolling is only somewhat faster. The gentle-to-aggressive spread is much narrower than in the 2026-09-28 build.
- **Slower default.** The overall default Tour pace is somewhat slower than in the 2026-09-28 build.
- **Controlled stop.** When input stops, the car settles promptly and smoothly, without a long inertial run-on.
- **Predictable reversal.** Direction changes respond immediately and predictably, rapid back-and-forth stays controlled, and reverse travel stays reliable.
- **Still scroll.** No section snapping, and no conversion to keyboard or game-controller-style control.

The exact model and values are chosen by comparing a small set of named candidates in real mouse-wheel and trackpad use. Proxy numbers help that comparison but do not accept it; the user's feel is the gate. The proxies are peak route speed from one large gesture, settle time after input stops, and the gentle/normal/aggressive speed ratio.

---

# 15. Camera references and doctrine

Canonical folder (actual on-disk name — see Open Issues §30.1): `reference _images/camera_angles/`. All five images opened and inspected.

- `camreference_1` = Circuit Superstars — very steep oblique, roof+side clearly readable, car travels convincingly through frame. **Take:** structural oblique angle, lateral readability, roof+side relationship. **Do not take:** flat/gamey rendering, exact stylization, its in-frame race HUD.
- `camreference_2` = Wooden GP II — similarly steep, dense tree framing, red/white/green curb striping. **Take:** corner readability, car-to-track relationship, bend composition. **Do not take:** overly top-down/isometric character.
- `camreference_3` = Assetto Corsa Competizione — much lower/wider angle (~30–40°), true dune/terrain depth, cars comparatively small/distant. **Take:** real 3D terrain depth, elevation, spatial scale, layered world geometry. **Do not take:** its excessive hero-car distance — this is the caution the reference itself demonstrates.
- `camreference_4` = real Spa Eau Rouge/Raidillon drone photo — extreme altitude, dense forest, cars tiny. **Take:** drone/skyscraper mentality, track-as-landscape, broad spatial context. **Do not take:** its detached event-overview scale — again, the reference demonstrates the failure mode to avoid.
- `camreference_5` = Okayama — moderate elevation, gravel runoff, mountains/atmosphere in background. **Take:** cinematic aerial composition, environmental scale, runoff/elevation presence. **Do not take:** excessive width/distance.

After the 2026-09-28 review, GT3 pushes further than before toward aerial distance, broad environmental context, thin-track presentation and architectural composition. The distance cautions above now guard the **hero car's apparent size**, which stays strong through deliberate hero-car scale (below). They are not a limit on world coverage. Reproduce no reference literally.

## Grand Tour camera

**Intent.** The camera is a **fixed observation point in the circuit world**: a high tower or hovering drone from which the race unfolds beneath the viewer. The target image is **a premium motorsport model showcase seen from a composed aerial observation point**. A still frame reads as *"a place with a race in it"* before *"a car on a road"*. The car is still unmistakably the hero subject, the first thing the eye finds, and the circuit reads as part of a larger designed world. The camera must not read as following the car, tracing each bend of the road, or a conventional race/broadcast camera.

**Angle.** High-elevation oblique drone/skyscraper view, approximately **45–60° downward**, with the car's roof and side visible and true 3D depth.

**Three separate visual controls.** A proportional zoom-out solves only the first of these and damages the third, so it is not a solution.

1. **World coverage.** Show substantially more environment than the 2026-09-28 build: wider circuit context, terrain, distant track sections, large architectural masses and surrounding negative space. The levers are elevation, distance, FOV and rail breadth/composition.
2. **Road apparent scale.** The circuit reads as a **thin graphic ribbon inside a much larger world**, not as the dominant object filling the viewport. The road occupies well under a third of the frame in typical compositions. Solve this with camera/world composition and road width (see *Hero-car path*) before rewriting track geometry.
3. **Hero-car apparent scale.** The GT3 car stays **deliberately oversized relative to road and environment**. Moving the camera away scales the car and nearby road together, so where needed use a deliberate hero-car scale treatment:
   - **uniform** scale only, proportions preserved, never non-uniform;
   - scaled around a ground-contact-aware pivot, so the tyres stay seated on the road;
   - body, wheel and suspension relationships stay believable;
   - orientation, swap and checkpoint behavior are unaffected.

The intended relationship is **far more world + visually thinner circuit + intentionally oversized hero car.** A road reading at roughly **3–4 hero-car widths** is a starting reference for tuning, not a locked value. This scale relationship is the **only** thing taken from the Hot Wheels reference. Materials, lighting, car proportions and motion stay realistic and premium. Do not bring in toy materials, exaggerated toy proportions, arcade rendering, arcade/game camera motion, or miniature-diorama styling, unless the last emerges naturally from the architectural language of §16. The hero car must never become tiny.

**Kept from the first Phase 3 build.** The camera keeps **stable world-space orientation**, is independent of the car rig, and does **not** rotate with the car. The car turns beneath and within the frame, and this is one of the strongest qualities of the build. It stays: no conventional chase camera, no car-relative orbit, no constant recentering, no pinning the car to one screen coordinate, no speed-linked FOV pumping. (The pre-Phase-3 camera was a child of the car rig; do not return to it.)

**Motion model.** The camera moves as little as possible while still carrying the whole circuit:

- **Rail.** The camera follows a **heavily spatially smoothed, low-frequency representation of the route**, not the raw local route. It responds to sector-scale direction, broad track placement and large spatial transitions. It largely ignores individual apexes, short chicanes, rapid heading changes and local car steering. **Track the geography of the circuit, not the geometry of each corner.**
- **Heading.** Fixed where possible; otherwise it changes only very slowly across large sectors. It never swings through a corner with the car.
- **Framing.** The car drifts freely inside a broad safe composition zone, starting at roughly the central 50–60% of the frame. That zone is a guide, not a hard visual cage. Correct only when the car nears an unsafe framing boundary, when visibility is genuinely threatened, or when a major world transition needs recomposition. Corrections are slow, eased, infrequent and visually subordinate to the car's motion. Occlusion handling never becomes continuous car-following.
- **Quality.** No snapping, hunting, bouncing, corner-triggered swings, reactive acceleration toward the car, or constant micro-corrections. Translation may accelerate and decelerate naturally across broad movement, but never visibly reacts to individual steering events. The camera feels heavy, calm and spatially established.

**Route-led, not car-led.** The rail is derived from the circuit, now at sector scale. The car moves within that pre-composed framing, and correction toward the car is the exception. Rule of thumb: **track the geography of the route; frame the car within it. Do not track the car and let the track follow.**

**Observable behavior.** Through a tight corner sequence, the camera barely moves while the car visibly changes orientation and position, and the world feels stable. Scrubbing forward and backward shows no swinging, hunting, visible chase, compositional panic, or snap at direction changes.

FOV, elevation, pitch, distance, rail smoothing, safe-zone and correction timing, and hero-car scale are runtime-tuned. Final values are chosen by the user's visual review of a small number of named whole-composition candidates, not from theory. Earlier parameter sweeps are historical evidence only.

## Hero-car path

The hero car need not ride locked to the road's centre spline. Two strategies (plus a hybrid) are reviewed visually **together with the camera**, because the whole composition is what is judged:

- **A — Narrower apparent road, broadly centred path.**
- **B — Wider, more believable road plus an authored racing line.** The car follows a separate, smooth, **never-rendered** path inside the physical road, like the hidden "ideal line" of driving games. It moves toward the outside before meaningful corner entry, cuts in toward the apex, and unwinds toward the outside on exit, with smooth transitions between phases. Variation stays much subtler on straights and gentle bends. The line is restrained and believable: no constant weaving, slalom, arcade zig-zag, arbitrary left-right oscillation, or lateral motion disconnected from circuit geometry. It gives the car lateral life and readable cornering from the stable aerial view without making the camera busier. It is not a simulation of a perfect driver.
- **C — A hybrid,** if testing shows the strongest result sits between A and B.

Checkpoint crossing, swaps, orientation and discovery semantics behave identically under any path. The road-width strategy and path treatment stay **unlocked until the user has reviewed them visually** (§30.9).

---

# 16. Scenery references and doctrine

Canonical folder (actual on-disk name — see Open Issues §30.1): `reference _images/scenery/`. All five images opened and inspected.

All repo reference images (`scenery/`, `camera_angles/`, `showcase_ref.jpeg`) remain **general directional references, never literal blueprints**: consult them for scale, negative space, architectural restraint, terrain composition, sculptural form, premium presentation, motorsport visual language, how sparse environments still feel finished, and how circuit and environment read from elevated viewpoints. The architectural/OMA-like references inform the environmental language; the GT / Driveclub / Le Mans / racing references continue to inform motorsport credibility, track presentation and polish. Reproduce none one-to-one; the result must feel original to GT3. The per-image notes below narrow each one.

- `sceneref_1` = Porsche Leipzig — flat open grassland, factory buildings and a distinctive tower in the distance, track calmly integrated into the land. **Take:** composition, readable road structure, calm open terrain, architecture/land/road balance. **Do not take:** the literal facility, branding, architecture, barrier styling.
- `sceneref_2` = Toyota Technical Center — an architectural masterplan render: winding test roads through dense forested hills, restrained low white buildings, a pond. **Take:** engineered landscape logic, purpose-built automotive character, road embedded naturally into land. **Do not take:** the literal campus, dense realistic forest, parking/facility detail, Toyota identity.
- `sceneref_3` = OMA architectural model — white foam-board massing study with abstracted green cube "trees," a red pedestrian accent path, and translucent tower forms. **Take:** the white/off-white sculptural material language, abstraction, massing, hierarchy, primary-vs-secondary form discipline, terrain-as-object — a strong directional reference for the Grand Tour environment language below, alongside the other scenery and motorsport references, not a blueprint. **Do not take:** the literal foam-board texture, green cube "trees", literal architecture, or a tabletop-miniature sense of scale — GT3 is that language brought to life at full scale.
- `sceneref_4` = Gran Turismo Sport — an **indoor showroom** scene (glass-roofed hall, stone walls, wood floor, a single red heritage Ferrari). **Take only:** finish quality, material restraint, lighting discipline, proportional refinement. **Do not take:** the showroom, its indoor spatial logic, or its exact static presentation — this reference is explicitly indoor and must not leak an interior-showroom feeling into an outdoor circuit.
- `sceneref_5` = Driveclub — a dramatic snowy mountain pass with photoreal rock/snow/pine and strong foreground/mid/background depth. **Take:** scale, atmosphere, foreground/mid/background depth, distant-world presence, atmospheric falloff. **Do not take:** dense photoreal vegetation, roadside clutter, exact realism level.

## Grand Tour environment — art direction

*Current preferred direction (2026-09-27). The design language below is intended; exact material execution, architecture placement and final scenery composition remain open to visual iteration.*

Target: **a realistic motorsport circuit presented inside a stylized architectural landscape** — a premium architectural motorsport maquette brought to life at full scale, closer to an OMA-style site model, competition maquette or exhibition landscape than a conventional green racing-game environment. The contrast is *realistic circuit + stylized architectural landscape*, never *stylized circuit + stylized environment* (circuit realism: §17). Not dense racing-game scenery, photoreal clutter, unfinished greybox, a tabletop miniature, cyberpunk, or sci-fi.

**Material language.** The surroundings are predominantly **white / warm-white / off-white** — a physical sculpted site, not a painted white game level. Never flat blank `#fff`: keep tonal variation, relief, depth, shadow, selective darker materials, occasional restrained secondary materials, and clear hierarchy. This is a broader environmental design language, not "grass recoloured white".

**Terrain is a primary visual object.** Broad landforms, berms, cuts, slopes and elevation changes stay clearly legible through lighting and shadow.

**Where visual interest comes from:** landform, track geometry, elevation, light and shadow, negative space, selective architecture, barriers / gantries / track infrastructure, and sparse but meaningful objects — not trees, grass, props or random decoration. The surroundings feel sculptural, architectural, sparse but intentional, premium, and highly composed from the aerial camera (§15). Restraint must read as deliberate, never as sterile or unfinished.

**Day:** pale sculptural terrain; dark asphalt as the primary graphic ribbon; strong, clean shadow definition; clear relief; precise curbs and track infrastructure; sparse architecture; generous negative space; premium editorial / official-motorsport presentation. The environment must compose well enough that the high aerial camera produces an interesting image even when little occupies the frame.

**Night:** the same pale environment, revealed by light out of genuine darkness (§13a).

Hierarchy: hero car → road → curbs/edges/markings/runoff → terrain form, light and shadow → track infrastructure (barriers, gantries) → selective architecture → sparse environmental objects. Architecture: monolithic, restrained, engineered — paddock volumes, retaining walls, bridges, simple grandstands, towers, sparse fencing, occasional landmark forms. Vegetation, if any, is sparse and abstracted, never a default green fill. Every object should define the circuit, frame composition, establish scale, create depth, or reinforce automotive-world identity.

**Wider-view consequence (2026-09-28 review).** The wider aerial camera (§15) shows far more of the world and exposes how empty it currently is. At that scale the environment must read as a composed, designed place, so favour **large-scale massing**:

- grandstands, paddock masses, towers and retaining structures;
- architectural blocks, and bridges or barriers where useful;
- distant circuit and world forms.

Keep it sparse but intentional, sculptural, and of OMA/architectural-maquette quality. Never fill space with random props, and never fall back to generic green racing-game grass as the final direction.

**Ownership.** Final material tuning, architecture/object composition, vegetation strategy, shadow art direction and all lighting belong to the **Phase 8** scenery/lighting pass. Earlier phases only keep the terrain structurally ready: meaningful relief, clean shading, and no geometry or material assumption that the ground is green grass. Phase 3 changes the world only where the revised camera or core systems structurally need it. For example, the wider view must not reveal a world edge or an unfinished terrain boundary.

## Scenery is also performance design

Environmental restraint is both aesthetic and computational. Do not build an expensive realistic world and reduce it until it runs — design the intended visual language to be naturally cheap: broad simple terrain, asset reuse, instancing, sparse objects, monolithic architecture, fewer materials, lightweight shaders, static/baked techniques where useful, limited shadow casters, low-cost atmosphere, concentrated detail near hero/road, reduced off-camera detail. If visual density conflicts with scroll smoothness, **scroll smoothness wins**. The same applies to Night route lighting (§13a): its design and implementation belong to the Phase 8 scenery/lighting/performance pass, not separate earlier work.

---

# 17. Circuit

An original closed-loop circuit, broadly inspired by Spa-Francorchamps and Circuit de la Sarthe without copying either — long sweeping sections, tighter technical sections, recognizable corner forms, varied rhythm, distinctive silhouette. Must work both in the Grand Tour aerial composition and as the small HUD map. Exact geometry is runtime/implementation work; the current spline (`src/scene/trackCurve.js`) already encodes named corner beats (chicane, back straight, hairpin, esses) that may be extended/reused rather than discarded.

**Track realism.** The circuit must feel like a plausible real GT/endurance circuit that could physically exist, even though its surroundings are stylized (§16). Do not abstract the road into something toy-like, futuristic, graphic-only or architectural. Preserve believable circuit width, corner radii, braking zones, long-straight rhythm, technical-sector rhythm, elevation, curbing, runoff logic, barriers/safety logic where appropriate, and trackside proportions. Real endurance circuits such as Circuit de la Sarthe may inform rhythm, scale and plausibility; copy none literally. The road feels real; the world presenting it feels curated and architectural. These are plausibility qualities, not a chosen layout: exact straight lengths, chicane and corner placement, and sector rhythm remain open and are settled through implementation and visual review.

**Road width is a composition decision under review** (§15 *Hero-car path*). A narrower apparent road (strategy A) is acceptable only if the circuit still reads as a plausible real circuit from the aerial view. A wider, more believable road with an authored racing line (strategy B) keeps closer to full-scale proportions. Either way, the hero car's deliberate oversizing (§15) is an intentional presentation choice, not a realism error.

---

# 18. Progression — checkpoints, not coins

No coins (replaces `src/scene/coins.js`'s visible branded emblem discs entirely, §1b). Use restrained in-world **sector/checkpoint thresholds**: a subtle translucent gate/structure, conceptually related to motorsport timing/sector infrastructure, architectural, world-integrated, restrained — not a collectible, glowing power-up, arcade portal, sci-fi gate, or fantasy object. Approach may reuse the existing proximity/incoming SFX (`coin_approach.mp3`). Crossing triggers the next car. Lexus (roster index 0) is discovered from session start as the Landing/starting car, so there are **9 discovery checkpoints**, one each for cars 1–9. Exact geometry, material, opacity, animation, and visibility distance are implementation-level.

Crossing a checkpoint is **silent**: it reveals/unlocks the associated car in session discovery state (§26) and performs the normal lightweight in-Grand-Tour car swap (§19) — nothing else. No narration, no reveal ceremony, no prompt, no Showcase transition. The newly discovered car simply becomes selectable the next time the user enters Showcase (§11). The montage/identity-reveal/narration sequence only ever plays through manual unlock (§11) — Grand Tour stays uninterrupted (§2).

Because identity is now hidden until discovery (§11), checkpoints must **not** carry brand color, emblem, or silhouette hints the way the old coins did — this is a direct consequence of the locked/mystery-car system and is not optional.

**Traversal response.** The physical timing-gate form is liked and kept. Crossing the gate, together with the car swap (§19), produces one smooth, restrained, very short local response. Candidates include a subtle material sweep across the gate, a restrained emissive response, or a light structural pulse. It is never a collectible burst, arcade flash, giant glow, portal effect, modal, narration, card or pause. The first Phase 3 response (the swap's emissive pulse and particle burst) is not accepted as final.

**No legacy racing cues.** Remove in-world cues left over from the pre-V3 race that no longer serve the Tour, such as painted turn-direction chevrons on the road. This does not remove the first-use scroll-direction cue (§14, §20).

---

# 19. In-Grand-Tour car swap

Preferred: a short digital/pixelated morph, but performance outranks the exact effect — acceptable alternatives include dither dissolve, masked crossfade, motion smear, or lightweight model replacement. Requirements: very short, smooth, no pause, no scroll interruption, no heavy reload, no meaningful frame-time spike, no narration/info-card/montage/Showcase. Use runtime measurement to pick the cheapest clean technique. The existing morph system (`src/scene/morph.js`) does cross-fade + emissive pulse + particles. Evolve it rather than rebuilding from zero unless measurement says otherwise; its visual treatment follows the restraint in §18 *Traversal response*.

**The first crossing is as smooth as any later crossing.** The first time the tour crosses a gate, there is no hitch and no apparent speed jump from dropped frames, and the cold crossing feels identical to a re-cross after reversing. The asset lifecycle is: **load globally, render locally, warm ahead, dispose only if measurement proves memory pressure requires it.** Reverse travel stays cheap.

---

# 20. Grand Tour HUD

**Intentionally sparse: composed and finished, never empty or unfinished.** Every element earns its place. The first Phase 3d build felt too bare in real use, and the frame, the bottom-left corner in particular, was underused.

- **Top-right:** the closed-loop circuit map, with strong contrast, a sufficiently thick and readable line and a moving position indicator. It is **roughly 10–20% more visually prominent** than the first Phase 3d build, and still restrained.
- **Top-left:** the current car's identity as an intentional composition: the car name, with the **manufacturer mark** beside it where appropriate. Marks come only from properly sourced assets, never fabricated or improvised (§30.8); until they exist, the name stands alone. A small passive rotating 3D car nearby is **defer-by-default**. It is allowed only if measurement proves it cheap on the one shared renderer (never a second renderer, §27). No large enclosing card.
- **Bottom-left:** a very small **car-information treatment** for the current car, taking only a few percent of the viewport and updating with the swap. It draws only on existing roster data in `src/data/cars.js`: manufacturer, display name, BoP-aware figures, engine/chassis data and the editorial headline/copy. It never invents specifications. The exact content, a short editorial line and/or a few factual figures, is settled in visual review.
- **First-use direction cue** (§14): makes forward and reverse obvious, then retires once the interaction is learned. No permanent clutter.
- **Sound cue** (§10): a brief, visual-only pointer to the Sound control on first Grand Tour entry while audio is off.
- **Bottom/edge:** the Day/Night control (§13) and the persistent audio control (§8), always present. They compose as one edge row that recomposes when the player expands (§8).

Do not add: speed, distance, unnecessary timer, stat wall, live or fake telemetry, incoming-car card, narration, Showcase overlay, or F-key Showcase. A few factual roster lines are allowed; a telemetry panel is not. Showcase = inspect; Grand Tour = drive.

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

**Goal:** maximize visible quality without compromising Grand Tour responsiveness and smoothness. Broad optimization waits until the experience (camera, scroll, swap, HUD) has settled. Do not add a settings menu or quality selector by default. Device-adaptive quality or higher frame-rate targets are added only when measurement proves they are useful.

**Grand Tour asset lifecycle:** load globally, render locally, warm ahead. GPU first-use work for an incoming car (shader programs, texture uploads, render-state changes) must not land on the gate crossing, and warming it must not create a new hitch earlier in the lap. Dispose, or introduce a streaming window, only when measured memory pressure requires it. Distinguish *downloaded*, *decoded/constructed* and *GPU/render-ready*: preloading a file is not the same as being ready to draw it.

**Judge hitches by the frame-time distribution.** A visible hitch can be a single 50–100 ms stall or a cluster of long frames, and to the viewer it can look like a speed jump. A single extreme-stall threshold is not evidence of smoothness.

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
8. **Manufacturer marks are not in the repository.** The repo contains no manufacturer logo or emblem assets (the only SVG is `public/favicon.svg`). The top-left identity mark (§20) depends on legitimately sourced marks with known usage terms. That is an explicit dependency for the user to supply or approve. Until then, the HUD shows the car name without a mark. Do not fabricate marks or silently pull random internet assets.
9. **Phase 3 finalization decisions awaiting user review (2026-09-28).** Each item is removed from this list once the user accepts it:
   - the camera candidate and world/road/hero-car scale relationship (§15);
   - the road-width / hero-car path strategy A, B or C (§15 *Hero-car path*, §17);
   - the scroll pace candidate (§14 *Bounded pace*);
   - the checkpoint traversal response (§18);
   - the bottom-left car-information content (§20);
   - final Phase 3 acceptance and approval to merge to `main`.
