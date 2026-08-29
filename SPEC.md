# GT3 — Pass 2 Product & Experience Specification

## 0. Authority and purpose

This file is the current product/experience specification for GT3.

Priority when sources disagree:

1. Current explicit user instruction
2. Current accepted runtime/repo state and direct measurement
3. This `SPEC.md`
4. `ARCHITECTURE.md` and `BUILD_LOG.md`
5. Historical archives and older decisions

Historical decisions remain useful context, but they do not override Pass 2.

This file defines **what GT3 should be**, not which AI/model must perform implementation. Agent/model-routing instructions belong to the current development workflow, not permanently inside the product specification.

Do not preserve an old behavior merely because it existed in GT3 V1 if this specification explicitly replaces it.

---

# 1. Product north star

GT3 is a desktop-only interactive **GT3 car-discovery and showcase experience** built around one continuous scroll-driven Grand Tour.

The experience should feel:

- bold
- colorful
- atmospheric
- unmistakably motorsport-oriented
- polished
- smooth
- visually playful without becoming childish
- closer to observing and discovering collectible racing machines than playing a conventional driving simulator

The previous “restrained luxury-brand website” direction is obsolete.

The site should feel more like a polished racing experience with strong environmental atmosphere and a slightly Hot-Wheels-like sense of scale and observation.

The primary experience structure is:

**Homepage / Collection → Grand Tour → Car Discovery / Showcase → Grand Tour → Completion → Homepage / Collection**

The showcase and discovery of the cars are now at least as important as the driving/scroll mechanic itself.

---

# 2. Platform and technical foundation

Preserve:

- desktop-only target
- mouse + scroll-wheel / trackpad interaction
- Three.js/WebGL for the 3D world
- DOM/CSS overlay for interface and readable text
- one player car only
- existing ten-car roster and order
- existing working GT3 car models
- existing narration/showcase content and audio assets
- existing smooth reversible scroll progression where compatible
- accepted reliability and performance fixes

Do not add:

- mobile implementation
- opponents or traffic
- physics-engine complexity
- accounts
- database/backend
- multiplayer

The current runtime architecture may be modified where Pass 2 requires it, but changes should remain as small and measurable as possible.

---

# 3. Core state model

There is **one Grand Tour**, not ten separate races.

Each of the ten existing Tour discovery/coin positions corresponds to one featured car.

Maintain conceptually:

- `discoveredCars`
- `tourProgress`
- `tourComplete`
- current time-of-day state
- current audio state

A car becomes **discovered** when either:

1. the user reaches its discovery point during the Grand Tour, or
2. the user deliberately reveals it through Showcase from the homepage.

Revealing a future car from the homepage:

- reveals its identity permanently
- makes it available from the homepage collection
- does **not** advance Grand Tour progress
- does **not** skip any section of the route

If that already-discovered car is later reached during the Tour, preserve its normal collection/showcase/morph sequence, but it is no longer treated as a first identity reveal.

Persist at minimum:

- discovered cars
- Tour progress
- Grand Tour completion

Use lightweight local persistence only. No account/backend system.

Time-of-day preference may also be persisted if simple and reliable.

---

# 4. Homepage / collection hub

GT3 now opens on a genuine homepage.

Primary presentation:

**GT3: A Grand Tour**

- large
- solid
- bold
- wide
- racing-oriented
- no transparent/cutout typography effect

Below it:

**START RACING**

This is a clear solid button with no unnecessary gimmick.

The 3D GT3 environment and sky should remain visible as the homepage backdrop where practical.

Before racing begins, use a cheap/static or lightly animated presentation state rather than running unnecessary race systems.

## Navigation

Near the top provide:

- Race
- Cars

Global collapsible behavior:

- hover → temporarily expands
- pointer leaves → collapses
- `+` → pins open
- `X` → closes

Use the same interaction model consistently.

`Race` enters the Grand Tour.

`Cars` displays all ten cars in a **2 × 5 collection layout**.

Discovered cars show their identities.

Undiscovered cars display:

**???**

Do not reveal brand, model or identifying hints before discovery.

---

# 5. Mystery-car experience

Selecting an undiscovered car opens a dedicated locked-car presentation.

Use one reusable **generic shrouded sports/race-car 3D model** for all locked cars.

The shrouded model must not expose identifiable manufacturer/model geometry.

Presentation should communicate:

- this is a real discoverable car
- its identity is intentionally hidden
- the user can either discover it through the Tour or reveal it now

Primary state:

**MYSTERY CAR**  
**???**

Primary choices:

- **RACE FIRST**
- **VIEW CAR**

`RACE FIRST` returns toward the Grand Tour/home flow without revealing the identity.

`VIEW CAR` transitions directly into the existing Showcase environment.

Do not create a second elaborate reveal cinematic.

Instead, the transition from mystery state into Showcase is the reveal:

**shrouded/unknown → Showcase transition → real car visible → car name revealed → narration/showcase begins**

Once revealed, the car remains discovered.

If the shrouded-car asset is not yet supplied during implementation, temporary neutral placeholder geometry may be used only as a development substitute.

---

# 6. Grand Tour progression

Preserve scroll-driven route progression and prioritize pristine smoothness.

The Grand Tour should become approximately **40–50% longer** than the current route.

Purpose:

- give the journey more breathing room
- increase time spent moving through the world
- strengthen the discovery rhythm

Do not use additional route length to conceal loading problems. Loading/performance issues must be solved separately.

Extend the route efficiently using:

- scenery reuse
- instancing where appropriate
- lightweight environmental variation
- atmospheric variation
- composition changes
- minimal additional unique geometry

Do not increase scene complexity proportionally with route length.

---

# 7. Camera and framing — major Pass 2 change

The old close chase-camera / car-anchored presentation is obsolete.

Target a **wider low-aerial oblique viewpoint**.

Reference feeling:

- Hot-Wheels-like scale
- low helicopter observation
- polished racing diorama
- car discovery rather than first-person/chase driving

Conceptually:

- the car progresses generally northward
- the viewer observes from an oblique southeast/rear-side toward northeast/front-side orientation
- significantly more road, scenery and sky are visible
- the car remains clearly identifiable
- the car moves noticeably within the frame
- the camera follows overall progression but reacts far less than before
- camera movement is damped and subtle
- camera is not perfectly fixed
- no shakiness
- no aggressive drift/lean gimmicks
- no conventional close chase-camera behavior

The camera should no longer be permanently hard-locked to the same fixed car-relative composition.

An independent/damped follow rig is acceptable if it produces the intended effect.

## Pending human selection

Do **not** permanently lock:

- exact FOV
- exact camera position
- exact follow distance
- exact height
- exact look angle
- exact damping

These must be decided through runtime visual prototypes and human evaluation.

Create several sensible camera variants during implementation rather than assuming one numerical interpretation is correct.

---

# 8. Track and environment

Keep the route stylized and performant.

Because the new camera is wider, small road details do not need unnecessary geometric complexity.

## Road

Maintain visual consistency across the entire route.

Use stronger **red-and-white curb/block treatment primarily at corners and important racing accents**.

Do not require continuous heavy red/white curbing along the entire route.

Track markings must remain clear and reliable.

Fix or replace the current yellow roadside strip system if it continues fading/disappearing inconsistently.

## Required existing visual fixes

Fix:

- green road-overlay/rendering issue around the McLaren 720S → Aston Martin Vantage region
- unreliable/fading yellow roadside strips
- awkward/random arrow elements
- overly sparse grass

## Low-cost environmental improvement

Increase visual life without materially increasing rendering cost.

Allowed examples:

- slightly denser lightweight grass/scatter
- simple trackside barriers
- corner curbs
- streetlights
- decorative start/stop-light structures
- lightweight grandstand at start, finish or both
- existing simple trees/track props

Avoid turning the environment into a dense asset showcase.

Reuse and instance assets where sensible.

---

# 9. Coins and discovery points

Preserve ten discovery collectibles / progression points tied to the existing ten cars.

Coins should remain visually readable from the wider camera.

However:

**Coins must no longer reveal or strongly hint at the identity of their car.**

Remove:

- car names
- manufacturer names
- brand emblems
- model silhouettes
- obvious brand-specific styling intended as identification

The car remains unknown until:

- the user enters its Showcase from the mystery system, or
- its Tour discovery sequence reveals it

Preserve satisfying collection feedback and the established collection → montage/showcase → morph → return flow unless a later instruction explicitly changes it.

Backward scrolling/reset behavior should remain compatible with the existing reversible Tour system.

Discovery state itself must not be accidentally erased by backward scrolling.

---

# 10. Car transformation and collection sequence

Preserve the existing working morph/collection machinery unless a Pass 2 change requires adjustment.

The active Tour car may continue transforming into each featured car after collection.

Requirements:

- no abrupt hard swaps
- route position remains coherent
- transition remains readable from the wider camera
- current accepted morph fixes must not regress

The existing montage/showcase sequence remains a major reward moment.

Pass 2 should give this system greater visual prominence rather than removing it.

Do not casually increase sequence complexity or duration without subjective testing.

---

# 11. Showcase

Showcase is now one of GT3's primary hero experiences.

Preserve existing working functionality including:

- car presentation
- narration
- existing car information
- current Showcase audio behavior
- existing transition logic where still compatible

Showcase must be accessible from:

- normal Grand Tour discovery
- discovered cars on the homepage
- mystery-car reveal
- eligible car selections on the completion screen

When a mystery car enters Showcase:

- reveal its real model
- reveal its name
- mark it discovered
- begin the normal Showcase presentation

Do not duplicate Showcase functionality into a separate gallery architecture.

The same Showcase system should be reused across entry points.

---

# 12. Sky, lighting and time of day

Sky and atmosphere are core parts of the Pass 2 visual identity.

The sky should:

- occupy more meaningful screen space
- use richer color
- provide stronger atmosphere
- visibly influence the world rather than behaving like a flat background

Preserve the existing time states unless later changed:

- Dawn
- Morning
- Afternoon
- Dusk
- Night

Each state should coherently control:

- sky color / gradient
- ambient/world color
- road appearance
- grass response
- car lighting
- distant scenery
- fog/haze where applicable
- practical-light behavior
- time-selector visual treatment

Prefer coordinated low-cost color/lighting treatment over unnecessarily expensive lighting systems.

Time-of-day transitions should remain smooth.

## Streetlights

Streetlights should be:

- Dawn → available/on
- Morning → off
- Afternoon → off
- Dusk → available/on
- Night → available/on

Their appearance/glow should respond appropriately to the selected atmosphere.

Drive these behaviors from the time-of-day configuration rather than scattered special-case logic.

---

# 13. UI / HUD direction

The old thin, quiet, luxury-editorial HUD direction is obsolete.

Pass 2 UI should feel:

- obvious
- bold
- readable
- colorful
- racing-oriented
- visually confident

Use stronger GT3/racing color language, including:

- red
- green
- yellow
- blue

Use them coherently rather than randomly.

## Remove

Remove unnecessary race telemetry including:

- speed display
- distance display

Do not add telemetry simply to make the interface look technical.

## Progress

The **route representation itself** becomes the primary progress indicator.

It should communicate:

- current Tour position
- route shape
- progression through the experience
- upcoming discovery positions where appropriate without revealing identities

It must be:

- prominent
- thicker
- readable
- race-oriented
- visually filled/active rather than a decorative hairline

Avoid redundant secondary progress bars unless genuinely necessary.

## Top-left

Make the main top-left race information more prominent and easier to parse.

## Showcase discoverability

Showcase entry is currently hidden behind the `F` keyboard shortcut, with no visible
affordance. Pass 2 must make Showcase access visibly discoverable in the UI, not
dependent on the user already knowing the keybind.

- Preserve keyboard access to Showcase unless later explicitly changed.
- The current `F` interaction needs a clear visible affordance/hint whenever Showcase
  is available.
- A first-time user must be able to discover Showcase without instructions outside the
  experience.
- Exact placement, copy, visual treatment, persistence/animation, and whether the final
  shortcut remains `F` are TBD during the UI redesign. Do not hard-code final placement
  before the UI designs are approved.
- Integrate this into the broader Pass 2 HUD hierarchy rather than adding an isolated
  floating tooltip as a permanent solution.

## Bottom-right controls

Place together:

- Sound On / Off
- Time of Day

The time-of-day selector should be:

- collapsible
- relatively substantial/card-like
- visually connected to the selected atmosphere
- usable at any point
- navigated with previous `<` and next `>` controls

## Typography

Final fonts are **not yet selected**.

Do not permanently introduce Cormorant Garamond, DM Sans, Inter, DM Mono or any other previous fixed typography choice solely because it existed in V1.

Await user-selected font direction before final typography implementation.

Temporary development fonts are acceptable only as placeholders.

---

# 14. Sound and WebAudio

Preserve the simplified, accepted audio lifecycle:

**Audio initialization occurs through one explicit Sound On user action.**

Do not:

- initialize audio from scrolling
- reintroduce scroll-based WebAudio startup
- create competing audio-init paths

Before meaningful Grand Tour progression begins, present a clear sound recommendation prompt.

Options:

- **IGNORE**
- **SWITCH ON SOUND**

Behavior:

- selecting `SWITCH ON SOUND` invokes the established explicit Sound On initialization path
- selecting `IGNORE` proceeds muted
- either action dismisses the prompt immediately
- if untouched, it may auto-dismiss after approximately 15–20 seconds and remain muted
- never force the user to wait 15–20 seconds after acting

Preserve the current audio asset set and established behavior unless explicitly changed.

Existing categories include:

- background music
- engine start / idle
- coin collection
- coin approach
- finish
- per-car Showcase narration

No unnecessary new audio category should be added in Pass 2.

---

# 15. Finish and completion

Preserve a celebratory in-world ending.

When the Grand Tour is completed:

- `tourComplete = true`
- all ten cars become available/discovered
- present a completion message such as:

**You have completed the Grand Tour. You can now view all cars.**

Provide:

**GO BACK TO HOMEPAGE**

The ending screen may also allow the user to select cars and open their Showcase.

Returning to the homepage should display the complete ten-car collection.

Replay/reset functionality may remain if already useful, but it must not replace the new homepage-return flow.

---

# 16. Featured car roster

The roster and order remain locked.

| # | Car | Existing file hint |
|---|---|---|
| 1 | Lexus RC F GT3 (2018) | `lexus_rcf_gt3.glb` |
| 2 | Nissan GT-R GT3 | `nissan_gtr_gt3.glb` |
| 3 | Audi R8 LMS GT3 (2020) | `audi_r8_gt3.glb` |
| 4 | BMW M6 GT3 | `bmw_m6_gt3.glb` |
| 5 | Mercedes-AMG GT3 | `mercedes_amg_gt3.glb` |
| 6 | Ferrari 488 GT3 (2018) | `ferrari_488_gt3.glb` |
| 7 | McLaren 720S GT3 | `mclaren_720s_gt3.glb` |
| 8 | Aston Martin Vantage GT3 | `aston_vantage_gt3.glb` |
| 9 | Lamborghini Huracán GT3 EVO2 (2023) | `lamborghini_huracan_gt3.glb` |
| 10 | Porsche 911 GT3 R (2023) | `porsche_911_gt3r.glb` |

Do not change the roster/order without explicit instruction.

---

# 17. Navigation and lifecycle

Pass 2 introduces multiple presentation states while remaining one coherent application.

Required transitions include:

- Homepage → Grand Tour
- Homepage → Mystery Car
- Mystery Car → Homepage / Race
- Mystery Car → Showcase
- Homepage → discovered-car Showcase
- Grand Tour → collection/montage/Showcase
- Showcase → Grand Tour when entered from Tour
- Showcase → Homepage when entered from Homepage
- Grand Tour → Completion
- Completion → Homepage
- Completion → Showcase

Transitions must preserve the correct originating state and return destination.

Avoid reload-like page changes.

Use one clear application-state/lifecycle system rather than scattered UI toggles.

Entering or leaving Showcase must not corrupt:

- Tour progress
- current active car
- discovery state
- scroll position
- audio state
- time-of-day state

---

# 18. Performance and implementation discipline

Visual quality matters, but smoothness remains a hard requirement.

The wider camera and simpler small-scale road detail may allow performance savings, but do not assume this without measurement.

For meaningful performance work:

**measure → attribute → hypothesize → change → compare → verify**

Do not inherit unsupported performance claims from historical logs.

Prefer:

- instancing
- asset reuse
- lightweight shaders/material changes
- coordinated environmental color
- minimal unique geometry
- small targeted fixes

Avoid:

- speculative rewrites
- high-cost geometry for objects barely visible at the new camera distance
- unnecessary dynamic lights
- adding complexity simply to make the environment “richer”

A clean build alone is not acceptance.

Acceptance requires relevant runtime testing and visual evaluation.

---

# 19. Pending user-supplied / human-selected inputs

These areas are intentionally unresolved and must not be prematurely locked by implementation.

## Camera

User will provide visual references and select between runtime camera variants.

## Fonts

User will handpick final typography.

## UI visual design

Major UI surfaces will be visually explored using screenshots and design tools before final implementation styling.

Primary design surfaces:

1. Homepage default
2. Homepage Cars expanded
3. Mystery-car presentation
4. Standard race HUD
5. Dark-time race HUD + expanded time selector
6. Sound prompt
7. Showcase
8. Grand Tour completion

Workflow:

**current runtime screenshot → visual redesign → human approval → implementation → runtime comparison/refinement**

Implementation may prepare structure/state before final visual assets are selected, but should not treat temporary styling as final design.

## Mystery-car model

One generic shrouded-car model will be supplied/selected.

## Optional grandstand

A lightweight external grandstand asset may be supplied if worthwhile; otherwise use a simple performant solution or omit until later.

---

# 20. Hard constraints / out of scope

Do not add:

- extra cars
- opponents
- traffic
- separate individual race modes
- leaderboards
- achievements
- currencies
- unlock economies
- garages
- comparison pages
- photo mode
- manual/free-camera Showcase
- additional collectible systems
- multiplayer
- accounts
- backend/database
- mobile work
- unnecessary new audio systems

Do not drift into:

- generic SaaS design
- dealership/gallery-site structure
- realistic simulator UI
- F1 imitation
- cyberpunk/neon styling
- luxury-editorial minimalism
- thin invisible interface elements
- cluttered game HUDs

The goal is not to add more systems.

The goal is to substantially improve the **presentation, atmosphere, discovery structure, visual identity and subjective feel** of the systems GT3 already has.

---

# 21. Pass 2 acceptance

Pass 2 is successful when:

- GT3 opens on a real usable homepage
- the collection/mystery system works coherently
- discovered state persists reliably
- all ten cars remain correctly ordered and accessible
- Grand Tour progress is independent from manually revealing cars
- the route is approximately 40–50% longer without unacceptable performance regression
- scroll progression remains pristinely smooth
- the camera feels wider, calmer and more observational
- substantially more sky/environment is visible
- each time-of-day state visibly affects the entire scene
- UI feels bold, readable, colorful and racing-oriented rather than luxury-editorial
- route progress is clear without speed/distance clutter
- audio still uses one explicit Sound On initialization path
- existing Showcase/narration/morph systems do not regress
- known environmental visual defects are fixed
- completion correctly returns into the full collection experience
- the full application can be played through without lifecycle/state regressions
- final visual acceptance is based on human evaluation, not merely build success

This specification defines the Pass 2 target. Exact subjective tuning of camera, typography, color balance, pacing and final UI composition remains subject to runtime/design review.
