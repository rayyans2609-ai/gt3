# GT3 Phase 3 refinement — live review package

Product owner review. Open the app and judge visually. Nothing here picks a winner or claims visual quality — only facts, exact URLs, and what to look at. Every decision below is yours; none has been pre-picked. Nothing is merged to `main` before your approval (item 9).

## How to run

```
npm run dev   # → http://localhost:5173/
```

- Scroll with a wheel or trackpad once the start screen reads ready.
- Review options are URL query parameters. They combine (e.g. `/?look=r1&gate=sweep&swap=pulse`) and survive a refresh. A new tab starts a fresh session.
- `?scroll=legacy` keeps the old unbounded scroll law for comparison only. The default is now capped (item 1).
- Day/Night toggle sits at the bottom edge. Check each visual decision in both themes.

## 1. What changed since the 10-06 review

- **Crossing SFX is back.** Forward gate crossings play the checkpoint sound; restore, replay and reverse stay silent.
- **No driving input before ready.** Scroll/keys during loading are swallowed until the Tour is ready and input has been quiet for 250 ms. Route persistence still works.
- **Cap is the default pace.** `?scroll=cap` is now the no-query behaviour; `?scroll=legacy` is comparison-only.
- **HUD refinements** (item 6): consolidated top-left identity, map arrow, completed-route trail, new moon, single instruction system.
- **Gate / finish / swap** (items 3–5): edge illumination is the default gate effect, pulse is a swap comparison option, finish gantry with signals is built.
- **Three coupled camera/car/road candidates** (item 2): `/?look=r1`, `/?look=r2`, `/?look=r3`.
- **Wheels: still not spinning, deferred to you.** The cause is found: spin parts are chosen by mesh name, and these models name their wheels on parent nodes, so no car has any. A safe fix isn't a filter change: 9 of 10 cars have wheel geometry off its own axle, shared or merged (Mercedes 1.24 m off-axis), so it needs per-car wheel pivot re-authoring, a separate rig task with its own performance and visual checks. **Decide:** schedule that task, or accept static wheels for now. (Diagnostic check on branch `p3r-wheels`, `051fccd`.)

## 2. Decide: camera / car / road — `?look=`

One query owns the whole composition (distance, hero scale, road width, racing line, curb use). Without `?look=`, existing `comp`/`cam` behaviour is unchanged.

| URL | Distance / pitch / FOV | Hero scale | Road / median hero widths | Intent | Tradeoffs |
|---|---|---|---|---|---|
| `/?look=r1` | 240 m / 55.64° / 40° | 2.28× (+20 %) | 16 m / 3.52 | Keep glide distance, enlarge hero, deepen roof view; one hairpin curb event (t=0.283) | Road widened to preserve clearances; hero deliberately oversized |
| `/?look=r2` | 218 m / 54.6° / 38° | 2.09× (+10 %) | 15 m / 3.60 | Give up 22 m distance and 2° FOV for prominence with less hero oversizing; one curb event | Highest hairpin camera-travel ratio (0.930); ~14 % less horizontal world span at the target plane |
| `/?look=r3` | 240 m / 57.2° / 40° | 2.47× (+30 %) | 17.2 m / 3.49 | Broad distance, largest hero, deepest pitch; two curb events (hairpin + chicane exit t=0.365) | Strongest cornering treatment (chicane heading sweep ~80° vs ~70°); widest road |

- Route-wide hero size: r1 2.41–3.86 %, r2 2.54–4.11 %, r3 2.67–4.14 % of frame width (501-point node projection; same metric for all three).
- Camera travel vs car travel, hairpin / chicane: r1 0.915 / 0.839, r2 0.930 / 0.839, r3 0.923 / 0.842. **None meets "camera barely moves" — camera translation is still ~84–93 % of car travel.**
- Curb use is confined to compact windows (body overhang stays on curb, before runoff). No rendered racing-line guide.
- **Suggested comparisons:** drive the turn-5 hairpin and turns 6–7 chicane slowly, forwards and backwards, in Day and Night. Combine with gate/swap where helpful, e.g. `/?look=r1&gate=sweep`, `/?look=r3&swap=pulse`. Captures: `docs/review/p3r-visual/` (three Day frames per candidate).
- **Decide:** r1, r2 or r3 — or which values to change.

## 3. Decide: checkpoint feedback — `?gate=`

| URL | What it does |
|---|---|
| `/` (default) | Edge illumination: 0.85 s neutral emissive light along both underside edges of the crossed beam; reverse crossings at 65 % strength; forward paired with the crossing SFX |
| `/?gate=sweep` | Prior 0.52 s moving beam/post bands, kept for comparison |
| `/?gate=quiet` | No gate response |

- Cross several gates both ways, in Day and Night. The edge response is deliberately subtle — check whether it reads at Night.
- Captures: `docs/review/p3r-gates/gate-edge-day.png`, `gate-edge-night.png`.
- **Decide:** edge, sweep or quiet.

## 4. Decide: car swap — `?swap=`

| URL | What it does |
|---|---|
| `/?swap=crossfade` (default) | Existing 0.56 s body crossfade |
| `/?swap=pulse` | Same crossfade plus the historical half-sine emissive pulse (brand tint mixed 55 % toward warm white); no particles |

- A light-based treatment was considered but not built: it needs a distinct visual benefit beyond the restored pulse first.
- The pulse strongly masks body detail at its crest; the crossfade does not. Watch a swap mid-effect in Day.
- Capture: `docs/review/p3r-gates/swap-pulse-day.png`.
- **Decide:** crossfade or pulse.

## 5. Decide: finish gantry + signal timing

- The gantry spans the road and curbs: truss above 8.6 m clearance, two uprights, suspended checker banner, five hooded signal pods on each face.
- Lamps are off along the lap, ramp green over the final 120 m (Day 1.2 / Night 1.8 intensity), and turn off on reverse exit and replay.
- Approach the finish in the default camera and in `?comp=b&cam=glide`: the signal row reads small in the distant glide-type framing, especially at Night.
- Captures: `docs/review/p3r-gates/` — `finish-default-day.png`, `finish-default-night.png`, `finish-glide-day.png`, `finish-glide-night.png`.
- **Decide:** gantry form and whether the final-120 m green timing is right.

## 6. Decide: HUD

- **Top-left consolidated block:** car name + headline + spec in one crossfade; one ink colour per theme. The spec line may wrap to 2 lines.
- **Map arrow:** filled chevron rotated by the car's direction each frame.
- **Completed-route trail:** yellow gradient behind the car over ~22 % of the lap. Day colour `#c58f00` is an open choice.
- **Moon:** filled crescent (~45 % max thickness) with matching Night-segment styling.
- **Instructions:** start prompt reads "Scroll to race"; once moving forward, "Scroll up to reverse" appears once bottom-centre (~3 s, then retires).
- **Decide:** acceptable or not — content and colour of the top-left info, Day yellow, readability in both themes throughout.

## 7. Still-open owner items carried from earlier

- **512-px Tour textures acceptable or not.** Tour cars use 512-px textures (288 MiB vs 817 MiB). Full-quality Showcase models are deferred to Phase 6 — confirmed, not re-decided here.
- **Startup time.** Clean solo median 14.5 s (8.8 s before GPU warm-up). The earlier 25–30 s figures were host memory pressure.
- **`compileAsync` revert (`ad9c746`).** No measured startup gain (about 3 s slower in contaminated runs); recommendation stands at revert. Needs your explicit OK.
- **§30.6 visual retirement.** Machine sweep finds no terrain between camera and car. Visually confirm the old McLaren→Aston section (route ≈ t 0.63–0.70) so the item can be retired.

Deferred items belonging to later phases are listed in SPEC §31, not here.

## 8. Verification status

Final tree `bf9e53b` (docs-only commits after it), on a fresh dev server. Executed by Luna and Sol.

| Check | Result |
|---|---|
| Build | PASS |
| No input before ready (`verify-preready-input`): pre-ready wheel input, quiet-gated unlock under 16 ms momentum, exact restore under input, crossing SFX forward-only | PASS |
| Scroll, `cap` default + `legacy` (`verify-scroll`) | PASS |
| Route persistence across refresh (`verify-route-persistence`) | PASS |
| Checkpoints: discovery sweeps, all nine gates zero GL allocations both ways, reversals, reload/replay (`verify-checkpoints`) | PASS |
| Swap response, `edge` gate × crossfade and × pulse: cold first crossing zero GL work, reversals, retargets, Day/Night (`verify-swap-response`) | PASS (both) |
| Startup smoke for `/`, `?look=r1`, `?look=r2`, `?look=r3&swap=pulse` | PASS |
| Occlusion: r1/r2/r3 at 15 points each (Sol); r2 at 7 points on the merged tree | PASS (0 terrain hits) |
| Tyre seating on curbs (r1/r2/r3) | PASS (≤ 0.93 cm) |
| Gates/finish (Sol): signal lifecycle, both cameras and themes | PASS |
| HUD (`verify-hud`): layout, crossings, cancellation, sound cue, narrow width, reduced motion, F key, Day/Night | PASS, except one check |
| HUD ten-car spec fit, car 2 (Audi) | Harness FAIL. **A direct measurement shows no clipping:** 2 rendered lines, scrollHeight = clientHeight = 28 px at 1600 and 1101 widths. Classified as a harness artifact; the harness itself is not yet fixed. |

Not machine-verifiable, so yours: everything in items 2–6 (look and feel), Night appearance, trackpad feel.

## 9. After approval

On your approval I record your choices in SPEC (§30.9 entries removed, body updated), remove the losing candidates and the dev-only labels, and merge Phase 3 to `main`. Nothing happens before then.
