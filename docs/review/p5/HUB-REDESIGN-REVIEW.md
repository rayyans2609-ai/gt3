# Phase 5 — Hub redesign and Showcase V1: owner review package

Branch `p5-hub-redesign` (from `p5-refine` e055d34, which is preserved unchanged as the local `p5-refine` branch and on origin). Run `p5-hub-redesign`, seat `opus@m4`, Opus-led. Owner brief and addendum: 2026-11-26. **Not merged, not accepted, no variant selected.**

Stills for every variant are in `docs/review/p5/redesign/`.

## How to review (M4)

From `.claude/worktrees/p5-hub-redesign`, run `npm run dev`, then open these URLs (default port 5173):

| What | URL |
|---|---|
| Default candidate (horizontal, checker loader, emblem Collection) | `/` |
| Vertical composition | `/?layout=vertical` |
| Circuit loader | `/?loader=circuit` (also `&layout=vertical`) |
| Full-width strip loader | `/?loader=strip` (also `&layout=vertical`) |
| Cars selector inside the Collection (preserved alternative) | `/?collection=cars` |
| Day palette variants (from p5-refine) | `/?palette=cream`, `/?palette=ivory` |
| Showcase straight from boot (dev only) | `/?showcase=0` … `/?showcase=9`, `/?showcase=full` |

The parameters combine, for example `/?layout=vertical&loader=strip&palette=ivory`. The loaders are only visible while the route is still preparing. A cached reload is fast on the M4, so use a hard reload, or watch the first visit. The Collection reads discovery from your session. Locked cars show the neutral disc. Drive the Tour to discover more, or open a fresh session.

Navigation: Landing → (scroll) Hub → **SHOWCASE** → Collection → emblem or **Full Showcase** → Showcase. Esc or **← Collection** returns to the Collection, **GT3** returns to the Hub, and **← Hub** or Esc in the Collection returns to the Hub. **START RACE** dives into the Tour as before. The music-note tab on the right edge opens the drawer.

## Implemented (brief section → what was built)

| § | Item | Where |
|---|---|---|
| 1 | Edge audio drawer: music-note tab attached to the right edge. The panel slides out flush with rounded exposed corners, and the tab rides its edge throughout (one translated shell). Vertical layout: full-width cover → label and runtime → seek → transport → four level sliders → Day/Night + master speaker. Cover crossfade, track-list Flip recomposition and audio continuity are preserved (same player view over audioManager). Landing/Hub/Showcase only; the Tour keeps its standalone controls. A dismissible "Sound is off · Enable" side notice replaces any scroll activation (none existed in code; the notice uses the single `startAudio()` path). | `edgeDrawer.js`, `drawer.css`, `hubPlayer.js` (worker D1, Terra) + manager polish |
| 2 | Landing: GT3 and A GRAND TOUR raised (21.1 → 16.2 vh). The wordmark ink is centred (measured at 1440 and 1600 px). The bottom control pills are gone (moved into the drawer). McLaren, drag and transitions are untouched. | `landing.css` |
| 3 | Hub: Cars removed from the main Hub. START RACE and SHOWCASE carry equal type and checkered underlines, in horizontal or vertical compositions. GT3 anchor sits closer to the left edge. The circuit is about 30 % larger, and its frame is computed in JS so it resizes continuously when the drawer opens (the actions scale and SHOWCASE moves clear). Mono captions add editorial hierarchy: `01 Grand Tour`, `02 Collection n / 10`. SHOWCASE hover lights discovered checkpoints in their car colours; START RACE hover keeps the lean, leader and lap. | `hub.js`, `hub.css`, `hubPlan.js` |
| 4 | Loaders: **checker** (both underlines fill from real progress), **circuit** (the plan lights from the start line with real progress and a travelling head, the status sits in the circuit's negative space, and the underlines sweep full at ready), **strip** (one strip spans START RACE→SHOWCASE; at ready its middle drops out in ~0.3 s, leaving both underlines). No artificial delays. The Showcase uses the checker/shutter cover. | `hub.js` |
| 5 | Collection: SHOWCASE transforms the Hub. The actions exit, GT3 moves to centre and the circuit enlarges. 3D emblems float at their checkpoints (gentle bob, turn and pointer response) on the shared renderer. Hovering an unlocked emblem shows its name in its identity colour, highlights its checkpoint and sends the colour pulse round the circuit. Locked emblems are identical neutral discs ("Undiscovered") and resist on click. The floating 3D checkered flag and **Full Showcase** sit in the middle. The Cars selector is preserved as `?collection=cars`. | `hubCollection.js`, `hub.js` |
| 6 | Showcase V1, recovered and adapted from the legacy Showcase: a large floating full-resolution car, horizontal orbit with inertia and restrained vertical inspection, ←/→ arrows and keys across all ten, dots, editorial name/headline, the story and technical archive panel with the existing paragraphs, specs, achievements and credited photographs, and existing ElevenLabs narration (autoplays only if sound is already on; stops on switch and on leave; never overlaps). Day/Night lighting rig. Checker/shutter loading with real byte progress. Locked slots show only `?`, the slot number and discovery copy. The car comes from the emblem's position and returns to it. Residency: a three-slot LRU, one serial load, full disposal on eviction. | `src/showcase/*` (worker S1, Sol) + manager integration |
| 7 | Terra oversight: reviewed checkpoints 4b95552/f57cf5f and ac9689d. Its components are integrated by path, and corrections are below. | `src/showcase-badges/*` |

### Since the first package (owner follow-up, 2026-11-26)

- **GT3 is centred on every global page** (Hub, Collection, Showcase) and holds the same position across all three, so it never moves or blinks during Hub → Collection → Showcase and back. In the vertical layout SHOWCASE now sits below the centred mark, and the circuit frame is measured from the elements above and below it.
- **Continuity:** returning from the Showcase crossfades into the Collection (the Hub is restored underneath first).
- **Keyboard:** Tab reaches every Collection emblem (with the same name, colour and pulse as hover); Enter opens it and a locked one resists. The Hub actions leave the focus order while the Collection is shown.
- **Full Showcase** resumes at the car last inspected this visit.

## Verification (consequence-driven; nothing skipped is reported as passed)

| Check | Result | Covers |
|---|---|---|
| `verify-showcase-v1` (Sol's focused harness, run by the manager through `run-harness.sh` on the M4) | **PASS** at db4e8c6 (5c2f588 later changed only the Collection's badge files and two Hub lines; Showcase path unchanged) | Model residency plateaus over 12 switches (geometries 1.6–1.9 k, textures 330–400; 15 evictions with disposal). Narration follows the visible car and stops on switch and leave. Locked slots leak no name, maker, colour or image. Details open. No console errors. Evidence: `local/evidence/S1/verification.json` and stills. |
| Same harness, first runs | **FAIL ×2 → fixed** | (1) A real product bug: the closed drawer's fixed box swallowed clicks on the right edge (SHOWCASE right half, right-hand emblems, "Explore the story"). Fixed in abd1ab3. (2) A harness assumption (same cache window at the same index) was replaced with a plateau check. |
| Hub → Tour alignment | **evidence reused + visual spot check** | The dive's end pose is the fitted live-road target regardless of the resting slot, and `zoom`/`fitSimilarity`/perspective are unchanged since the 0.07 px RMS numeric PASS on p5-refine. A mid-dive still in the vertical layout with the drawer open looks clean. Not re-measured numerically. |
| Navigation round trips | **headless stills, PASS by inspection** | Landing → Hub → Collection → Showcase (Lexus) → Collection; Collection → Hub; Hub → Tour → Hub (experience `hub`, Hub revealed). Day and Night. |
| Builds | **PASS** every commit | — |
| Not run (deferred to after visual acceptance, per doctrine) | `verify-landing-flow`, `verify-audio-lifecycle`, `verify-controls`, `verify-motion-ticker`, `verify-refine-smoke`, `verify-hud` | These harnesses target the old Hub DOM (Cars bars, `.hub-start`, the player in the Hub) and need retargeting once the design is chosen. The Tour code is untouched; the audio lifecycle changed only through the drawer view and the Showcase narration. |

## Owner review (decisions, none taken)

1. Composition: **horizontal** or **vertical**.
2. Loader: **checker**, **circuit** or **strip** (each works in both layouts).
3. Collection: **emblems** (default) or the **Cars selector** alternative; emblem size and placement just outside the road.
4. Drawer: tab position (mid-height), panel width 320 + 46 px tab, and whether the "Sound is off" notice should appear on every page until dismissed (it does now).
5. Showcase framing, lighting and typography; the details panel; the locked-slot presentation (minimal `?`; the covered-car asset is deferred as you asked).
6. Captions (`01 Grand Tour` / `02 Collection 1 / 10`): keep or drop.
7. **Crest rights.** Terra's Ferrari, Lamborghini and Porsche faces are fetched by `src/showcase-badges/prepare-crests.py` from a third-party logo site into ignored `local/`, because their rights are unverified. I did not run that download. Until you decide, those three show identity-colour placeholder discs.

## Corrections to relay to Terra (badges, from the rendered review at ac9689d)

- **Optical scale.** The Audi rings and Aston wings render at roughly a third of the BMW/Mercedes visual weight. Add a per-mark optical scale or a backing plate so all ten read at one size.
- **Day contrast.** Nissan's open chrome nearly disappears on the white field, and Lexus is faint. Give open chrome marks a darker satin finish or a subtle dark backing in Day.
- **Aston.** At Collection size the enamel inlays don't read; the wings look like a small white smear at Night.
- **Interface.** Fine. Keep `createBadge` non-throwing for missing private art (the Hub falls back already, but a throw from `setLocked(false)` is avoidable).

## Known limitations

- The Collection renders emblems on the shared renderer into the main canvas while the Hub covers the Landing. The Landing does not render then (it is covered), so there is no extra cost at rest.
- `?hub=launch` (the kinetic direction from p5-refine) was retired from this branch; it remains on `p5-refine`.
- The Hub circuit pulse and checker colours use the existing tokens. Palette variants apply to Landing, Hub, Collection and Showcase alike (one field token).
- Showcase entry from a cold cache shows real byte progress; on the M4 with a warm cache it is near-instant.
