# Phase 5 — Hub & extended UI refinement: owner review package

Branch `p5-refine` (from `main` 7a0899b). Not pushed, not merged, **not accepted**. Run `p5-refine`, seat `opus@intel`, Opus-led. Owner brief: 2026-11-26.

## How to review

`npm run dev`, then open the app. Useful variants:
- default: the plan Hub (the review target)
- `?hub=launch`: the kinetic Hub direction (it received the checker and Cars interactions too, where cheap)
- `?palette=cream` and `?palette=ivory`: the Day palette exploration (see Decisions)
- refreshing inside a Tour shows the standalone checkered loading cover and shutter reveal
- `?version=unlocked` / Locked: the Tour render profiles are unchanged

Judge animation fluidity on the M4. The Intel host was too loaded to time motion reliably. To run the deferred functional checks there: `scripts/run-harness.sh -R <run> -T <task> scripts/verify-refine-smoke.mjs` and `scripts/verify-hud.mjs`.

## What changed (commit → owner item)

| Commit | Item | Worker |
|---|---|---|
| a4698b2 | §2 Independent SFX slider (Master / Music / Engine / SFX, persisted, mutes separate, no-clip four-row layout) | DeepSeek (benchmark), accepted unchanged |
| c3e229c | §2 Shared scroll cue, eased checker progress, minimap 10 % larger with grey/green discovery dots, Day blue accents | HY4 (trial), imported with `scrollCue.css` |
| fae2c92 | §2 Terra's findings: reduced-motion specificity, checker visibly complete before the shutter (160 ms beat, no artificial wait). §3 checker beneath START RACE as the Hub loader. §7 solid red marker | Terra |
| 30324e0 | §4 Plan resolves into the live Tour projection with a slight late perspective change; hover leader ends at the persisted car position | Sol |
| e22c255 | §5 Cars prominence, locked/unlocked bar interactions, ten livery-sampled identity colours, coloured pulse when a name is clicked | Sol |
| e74f34c | §8 Draggable Landing McLaren. §6 GT3 mark returns straight to the Landing; mark enlarged 21 → 25 px (owner addition) | Terra (+ manager yaw tweak) |
| 4a005d2 | §9 Album-cover crossfade (preloaded, layered, blur-to-sharp) | HY4 (+ one-line clip fix) |
| b630a65 | §10 Cream / ivory Day palette behind `?palette=` (default unchanged) | HY4 |
| b48a023 | Album-cover corners 2 → 5 px (owner addition; diff-inspected only) | manager |
| b059357 | Verification doctrine rewrite and host contention rule (docs only) | manager |
| 30c97db, 56035e7 | Fixes from verification: the shutter waits for the completed checker on a restored Tour; the animated cover recomposition is restored | Terra (R2) / manager |
| 900396a, 49ef9ec | §1, §11 Routing docs (HY4 provisional, GLM deprecated, DeepSeek retired); SPEC reconciliation; two future concepts documented (not implemented) | manager |
| edc8edf | Verification harness `verify-checker-loading` (W1's skipped runtime checks) | Terra |

Product truth is in `SPEC.md`: §4 (McLaren drag, scroll cue), §5 "Phase 5 refinement (2026-11-26)", §13 (accents, palette exploration), §20 (marker, trail, minimap), §31a–§31b (deferred concepts).

## Functional verification (technical; not visual acceptance)

Browser runs on the Intel host were kept to the minimum by owner direction (2026-11-26), under the revised verification doctrine (`docs/ai/model-routing.md` §5: verification must earn its cost; nothing skipped or deferred is reported as passed). Earlier passing evidence is reused where the code it covers has not changed since. Each row says which.

| Check | Result | On | Covers |
|---|---|---|---|
| verify-landing-flow | **DEFERRED** to your review / M4 (owner, 2026-11-26) | — | Earlier runs on this branch: `momentum-carryover` (START RACE → Tour within ~3 s) **failed on V1 b630a65 and V3 4e3f374 and passed on V2 4e3f374** (entryMs 2830, close to the cap) under load averages of 70–100. In V2 `refresh-tour` timed out at 60 s (restore under load). The cases after it (Tour↔Hub return, re-entry, refresh-hub, new session, theme mid-transition, audio gesture) have **not passed on this branch**. The `main` baseline comparison was not run. |
| verify-preready-input | **FAIL on one timing assertion**, classified as harness timing under host load (not passed) | b48a023 (V5) | Input before ready is swallowed, the first real gesture starts the drive, the crossing SFX fires, and restore matches the saved progress. The failing check expects unlock ≥ 200 ms after the harness's "momentum ended" stamp; it measured 193 ms. That stamp is taken by the harness's own interval timer, which runs late under load. The app unlocks 250 ms after the last *swallowed* input (`scrollDrive.js`, unchanged since Phase 4). Not re-run (owner doctrine). |
| verify-route-persistence | **PASS 6/6** | b48a023 (V5) | route restore after the readiness reorder |
| verify-motion-ticker | **DEFERRED** to your review / M4 | — | PASSED on V2 4e3f374 (single-RAF GSAP; 56 px). **Not re-run** after 56035e7 restored the animated cover Flip and changed the harness to wait for it to settle. |
| verify-checker-loading | **PASS 3/3** (reused) | R2 working tree = 30c97db code (provenance stamp shows that tree as dirty) | reduced-motion checker; 40/40 and no running cell when the shutter parts; Hub checker 40/40 and stable |
| verify-audio-lifecycle | **PASS 12/12** (reused) | b630a65 (V1) | audio scope and lifecycle; unchanged since, apart from the readiness order |
| verify-controls | **PASS 7/7** (reused) | 4e3f374 (V2) | edge controls and levels; unchanged since |
| Plan → Tour alignment | **numeric PASS** | 30324e0 | 0.07–0.08 px RMS residual over 51 real camera poses |
| Car palette | **computed PASS** | e22c255 | min ΔE2000 13.18; ≥ 3:1 contrast on both Hub fields |
| Palette exploration contrast | **computed PASS** | b630a65 | body ink ≥ 5.43:1 on cream/ivory |
| Builds | **PASS** | every commit | — |

### Deferred / unverified (not passed; for your review or an M4 run)
- **New interactions:** Cars locked resist, unlocked hover expansion and colour, name hover colour vs click pulse, McLaren drag, GT3 → Landing without reverse playback, leader to the persisted position. They are code-reviewed only. `scripts/verify-refine-smoke.mjs` (committed, eee37b3) checks all six functionally and has **not been run**.
- **HUD:** the solid red marker, blue/yellow trail, 10 % larger map and grey/green persistent dots are code-reviewed only. `verify-hud` has not been run.
- The checker tilting with START RACE, and the `?hub=launch` Cars treatment: code only.
- The palette parameter's first-paint behaviour and the WebGL Landing field under `?palette=`: code only.
- **Motion quality and frame pacing** (plan dive, checker fill, cover crossfade, drag feel) are not judged on this host.

## Decisions for the owner (provisional until you approve)

1. **Day palette:** keep white (default), or adopt cream (`#FFFDF4`) or ivory (`#FFFAE3`). The Landing push-into-paint resolves the McLaren's **white** fender into the field. A cream field changes that final colour match (the paint stays white), so judge the transition end specifically. Also, the parameter is applied at module load, so the very first paint can flash white before the 700 ms field transition. That only matters if one is adopted, and would be fixed with a pre-paint hook.
2. **Cars prominence:** Neue Haas display heading at 36–52 px with a larger ten-bar glyph. Is it prominent enough, or too heavy next to START RACE?
3. **Car identity colours:** the ten values are in `CARS-REFINEMENT.md`. The closest hues are **Nissan crimson `#bd3057`** and **Audi red `#cb2117`** (distinguishable, but check side by side). Aston/Lamborghini is the closest pair by ΔE (yellow-olive vs lime).
4. **McLaren drag range:** yaw ±35° (Terra proposed ±18°; I widened it so the car visibly turns), pitch ±4°, return to rest after 2.5 s idle. Narrower, wider, or free 360° with return?
5. **Hub checker colour:** the filled squares use the START RACE ink (not the blue/gold accent).
6. **Transition feel:** how strong the late perspective lean is (it blends over the last ~45 % of the existing 1.55 s dive).

## Known limitations

- W2 rebuilds SVG path strings each frame during the 1.5 s dive. Check frame pacing on the M4; it may also contribute to START RACE entry running close to its harness budget on this host (landing-flow, deferred).
- The kinetic `?hub=launch` direction got the checker and bar interactions, but was designed and checked less than the plan direction.
- The `verify-entry-sequence` capture-timing failure on Intel (known since ece4f8d) is unrelated and unchanged.
- Deferred, not built: 3D manufacturer badges and Showcase navigation (§31a). The loading design language is documented as a reusable direction only (§31b).

## Next

- **Your visual review** of this candidate: decisions 1–6 above, plus the deferred behaviour you can observe directly (Cars interactions, colour pulses, McLaren drag, GT3 → Landing, leader to the persisted position, HUD marker/trail/map).
- **Before Phase 5 closure, after design acceptance** (`model-routing.md` §5 *Phase closure*), preferably on the M4:
  - `verify-landing-flow`: START RACE entry timing and the Tour↔Hub cases that have not yet passed on this branch.
  - `verify-refine-smoke`, `verify-hud`, `verify-motion-ticker`.
  - `verify-preready-input`, if its timing assertion is worth confirming on calmer hardware.
- **Owner-only:** pushing `p5-refine` (needed to review on the M4), merging into `main`, Phase 6.

## Post-review refinements (2026-11-26, after your first visual pass)

Direct edits, not independently verified (diff-inspected and syntax-checked only):
- **GT3 mark** is substantially larger (`--mark-size`, 52–72 px, was 25 px) and its left ink edge is aligned to the Cars label using the font's own side-bearings.
- **Cars bars** now rest at the Cars lowercase x-height, with their bottoms on the label's baseline. Widths, colours and the hover/resist animations are unchanged.
- **Circuit pulse** now runs on **hover** (and keyboard focus) over a discovered car name, once per entry. **Clicking a discovered name does nothing yet** (reserved for its Showcase). Locked names still resist on click.
- **Click outline** on names removed (a mouse press no longer focuses the name); keyboard focus still shows a ring.
- **Colours:** Nissan, Audi, BMW, Ferrari, Aston Martin and Porsche changed as you specified (see `CARS-REFINEMENT.md`). Watch: Porsche yellow is faint on the white Day field, and Ferrari's red is dim on the Night navy.
- To eyeball: the GT3 mark/Cars spacing at 1440 and 1920 widths, and baseline alignment of the bars in both themes.

### Second refinement pass (2026-11-26)
Direct edits, diff-inspected and syntax-checked only:
- **Cars** sits lower (below the GT3 mark by about 90 px). The ten bars are now a stack of horizontal rules directly under the label, each as wide as "Cars" at rest. A discovered bar extends outwards from its centre on hover (scaleX 1.14); colour reaction and the locked resist (bar and label) are unchanged.
- **Hovering a discovered bar** (or focusing it by keyboard) reveals only that car's name in its colour and sends its pulse once. The name hides when you leave unless the full Cars view is open. Clicking "Cars" still reveals every name. Clicking a discovered bar or name does nothing yet (reserved for its Showcase); locked bars still resist. The reveal is built for the plan direction; `?hub=launch` bars react and resist but do not reveal a single name.
- **GT3 mark** turns the theme accent on hover and focus (Day blue, Night gold); navigation and typography are unchanged.
