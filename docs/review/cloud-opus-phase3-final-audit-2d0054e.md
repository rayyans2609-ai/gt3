# Cloud Opus — supplementary Phase 3 audit of 2d0054e (advisory)

> **Audited integration SHA: `2d0054e01b9734f2bdf38f7b38864841b37940f7`.**
> This is a **supplementary** audit of that SHA. It is **not** the authoritative audit of the newer `8b59a7b`; that audit is `docs/review/cloud-opus-phase3-final-audit.md` on this branch. The only code difference between the two SHAs is the `scripts/sim-scroll-pace.mjs` output-path fix (this report's N13).

This report is advisory. It does not accept or reject Phase 3; the product owner does that. The reviewer is an independent cloud session with no browser, GPU or Vite dev server. Nothing below is a visual, browser or performance observation.

Labels:
- **COMPUTED**: I ran it in Node in this sandbox.
- **REASONED**: drawn from reading the code or docs.
- **UNVERIFIED**: needs a real browser, or depends on artifacts that exist only on the developer's machine.

Severity: **BLOCKER** (fix before review) / **SHOULD-FIX** / **NOTE**.

## 0. Provenance and method

- I ran `git fetch origin phase3-integration && git checkout -B audit origin/phase3-integration`. `git rev-parse HEAD` returned **`2d0054e01b9734f2bdf38f7b38864841b37940f7`**, the expected SHA. All findings refer to this SHA.
- `npm ci --ignore-scripts` installed three r180.
- COMPUTED, all exit 0:
  - `npx vite build` passes, and `dist/draco/gltf/` contains the self-hosted decoder.
  - The `scripts/check-composition-{math,base,guard,rail}.mjs` checks ran. So did `scripts/check-wheel-ground.mjs` and `scripts/sim-scroll-pace.mjs`.
  - `check-composition-math` ran for base/a/b/c, b+soft and b+wide.
  - `check-composition-base` was additionally run against **2fe0940** (the pre-W2 head) and **61ce7b1** (the first Phase 3 build). Both gave `exactEquality: true` with sha `7616a0d1…` over 1800 poses. The default camera is therefore bit-exact with the pre-W2 camera, not only with the script's default reference 0967653, which is itself a W2 commit.
- I did not run any browser harness (`verify-*.mjs`, `measure-startup.mjs`, `diag-swap-hitch.mjs`). Every browser PASS quoted below is the developer's, and I could not re-check it.

**Result: 0 BLOCKER, 11 SHOULD-FIX, 14 NOTE.** The code is in good shape. Most of the risk sits in the review package and in the docs, not in the implementation.

---

## 1. Phase 3 closure requirements vs SPEC

| # | Requirement | Canonical source | Status at 2d0054e | Correctly scoped? |
|---|---|---|---|---|
| R1 | Camera / world / road / hero scale | SPEC §15, §30.9 gate 1 | Candidates `?cam=` × `?comp=`; owner decision pending | Yes. **No candidate meets all of §15** (see F4) |
| R2 | Road width and hero path A/B/C | §15 *Hero-car path*, §17, gate 2 | `?comp=a\|b\|c`; owner decision pending | Yes |
| R3 | Bounded scroll pace | §14, gate 3 | `?scroll=cap\|pace`; default unchanged | Yes. `cap` partly misses §14 (F5) |
| R4 | +30–50 % distance/time between progression events | §14 ¶1 | Distance +8.3 %; time increase only under cap/pace | Tied to R3, as the package says. Correct |
| R5 | Gate traversal response; legacy pulse/particles not final | §18, gate 4 | Sweep (default) / `?gate=quiet` | Yes |
| R6 | No legacy chevrons | §18 | Removed unconditionally (`src/scene/track.js:381`) | Yes |
| R7 | First crossing as smooth as later crossings; warm ahead | §19, §27 | Warm-up of all 10 cars (`carWarmup.js`) | Evidence is allocation-based, not frame-distribution-based (F7) |
| R8 | Swap effect restrained; "short digital/pixelated morph" preferred | §19 | 0.56 s body cross-fade (`morph.js`) | **Not surfaced for owner review** (F3) |
| R9 | HUD: map +10–20 %, TL identity, BL car info, direction cue, sound cue, edge row | §20, gate 5 (BL only) | Map 148→170 px = +14.9 % (COMPUTED, `hud.js:16`) | TL identity and direction cue are missing from the review list (F3) |
| R10 | Launcher +/× real glyph; Day/Night recomposition; sun/moon pill | §8, §13 | Two real glyph spans (`soundControl.js:40-41`, `player.css:88-92`) | Yes |
| R11 | Sound cue: visual only, once per session, retires | §10 | `soundCue.js`; never touches audio | Yes |
| R12 | Route position and discovery restore across refresh | §24–26 + user decision 2026-10-04 | `session.js`, `main.js:269-281` | Yes. One edge risk (F6) |
| R13 | Tour 512-px textures must not set Showcase quality | §27 l.514 + user decision | Deferred to Phase 6 (W8) | Defensible. Not recorded in SPEC (F9) |
| R14 | ~30 s time-to-ready investigated, not assumed | User decision 2026-10-04 | Now 14.5 s; owner decision | Yes |
| R15 | §30.6 grass over road: user visual acceptance | §30.6 | Machine sweep PASS; visual pending | Yes |
| R16 | Wider view shows no world edge / unfinished terrain | §16 *Ownership* | Node ray check (w2-leg2 README l.78) plus browser `exposed` rays | Covered by machine, but not named for the owner's eye on `wide` (NOTE N1) |
| R17 | Manufacturer marks | §20, §30.8 | Blocked on user-supplied assets | Correctly listed as not done |
| R18 | Final integrated approval and merge | §30.9 last bullet | Item 10 of the package | Yes |

Requirements wrongly treated as complete:
- **None outright.**
- R7 is presented as settled on a proxy, zero GL allocations at crossings. §27 requires a frame-time distribution (F7).
- R8 and part of R9 changed the default but are not on the decision list (F3).

---

## 2. Implementation completeness per package

- **W2 camera/composition (REASONED + COMPUTED): implemented as review scaffolding.**
  - `composition.js` resolves `?comp`/`?cam` once, as pure code. The default stays `legacy` (bit-exact, §0).
  - `compositionRail.js` is a convex-corridor FISTA solver with a tether, closest-pair anchors and a soft corner weighting. This addresses the earlier cloud W2 review (centroid anchors, missing tether, fallback cliff).
  - Guard, rail and math checks all pass (COMPUTED). The dense residual for b/soft is −5.67 m, inside the zone. The solver converged with a 0.046 m bound.
  - Racing line (`racingLine.js`): with amplitude 0 every path function falls through to the exact `trackCurve` calls (l.120-136). The default car path is therefore unchanged (REASONED).
  - Hero scale is uniform, applied to `carMount` about its ground origin (`carRig.js:98`).
- **W3 scroll pace: implemented.**
  - `boundedPace.js` is a pure model; `scrollDrive.js` handles the plumbing.
  - The default path is unchanged apart from the start-suppression guard and route persistence (diff vs 61ce7b1, REASONED).
  - Simulation results (COMPUTED, 60 Hz, 900 px viewport, `sim-scroll-pace.mjs`): 2500-px fling = default 853 m / cap 125 m / pace 113 m. Settle after normal input = 1.57 / 1.10 / 0.58 s.
- **W4b startup:**
  - Boot marks, lazy studio renderer (`main.js:381-383`), early preload, and a 12 ms/frame warm-up budget (`carWarmup.js:206-218`).
  - Self-hosted Draco (`cars.js` `DRACO_DECODER_PATH='/draco/gltf/'`) closes the gstatic dependency (COMPUTED: files ship in `dist`).
- **W5a/W5b HUD and controls:** implemented as described (R9–R11).
  - Car info draws only `engine.configuration`, `engine.power` and `showcase.headline` from roster data (`hud.js` `specLine`). Nothing is invented (REASONED).
- **W7 route and discovery persistence: implemented.**
  - Writes are throttled to 350 ms, with flush on `pagehide`/`hidden`.
  - Restore runs while scroll is locked, followed by `checkpoints.restoreAtProgress`, `morph.resetMorph` and `aerialCamera.snap`. No discovery or gate effects replay.
  - Discovery stays monotonic because `unlocked` is persisted independently.
- **W8 deferral:** correctly recorded as binding for Phase 6 (BUILD_LOG "run 2 — W8 deferral"; GT3_MASTER_CONTEXT l.23). No Phase 3 code was written for it, which is correct.
- **W6 regression:** the harnesses exist in `scripts/`. Results live only on the developer's machine (F8).
- **Wheel levelling** (`cars.js` `levelWheelContacts`): pitch about +X, sign derivation checked (REASONED).
  - COMPUTED via `check-wheel-ground.mjs`: lexus +0.164°, nissan −0.322°, mclaren −0.842°. All three now read 0.00/0.00 cm front/rear contact; the 7 others are unchanged; tour and full models match.
  - This matches BUILD_LOG exactly.

---

## 3. Unsupported or under-supported acceptance claims

- **F8 SHOULD-FIX — every browser PASS lives outside git.**
  - Affected: W6A/W6B, startup 14.5 s median, "0 post-dismiss frames >100 ms", load recovery 9/9, offline, occlusion 0/101, first crossing "0 GL allocations", and the matrix in the `?cam` table (hero %, camera/car travel 0.38/0.40, 0.75–3 s rebuild stall).
  - These rest only on `~/Desktop/gt3-review-2026-10-04/{w2,w5,w5a,w6,startup-final,run-packet}`.
  - Proposed fix: commit the small summary JSONs (for example `w2/matrix-final.json`, `startup-final/results.json`, the W6 PASS ledger) under `docs/review/phase3-final/`, so the claims survive the host.
- "Earlier 25–30 s figures were host memory pressure" (BUILD_LOG final entry): local evidence only. UNVERIFIED.
- "The no-query default camera is bit-exact to the pre-W2 camera": **now independently COMPUTED** against 2fe0940 and 61ce7b1 (§0). Supported.
- "§30.6 skirt geometry no longer exists" (BUILD_LOG run 1): REASONED-consistent. `environment.js` builds a single ground. SPEC §30.6 text still describes the skirt fix (F9).
- The package's "Machine-verified on the final head" list mixes heads. Per BUILD_LOG:
  - VERIFY-1 ran at f837c64.
  - W6A partial ran at a1ca1be/da67f54.
  - Startup ran at ea95055.
  - No run is stated at 2d0054e or f82248a. Only docs changed after ea95055, so this is acceptable, but the package should name the SHAs (NOTE N2).

---

## 4. SPEC drift, contradictions and default-behaviour changes

**F1 SHOULD-FIX — the package says "No parameters = today's baseline on every axis", which is misleading.** The no-query default does equal the pre-candidate baseline on the candidate axes:
- camera (COMPUTED, bit-exact);
- road width / gate beam (beam = 2·(7+1.15+1)+0.6 = 18.9 m, unchanged);
- path (REASONED);
- scroll law (REASONED).

But the no-query default also changed in ways the owner may not attribute correctly:

| Change | Status |
|---|---|
| Swap visual: 0.85 s emissive pulse + 140 particles → 0.56 s plain cross-fade | **not on any decision list** |
| Gate sweep added | item 4 |
| Chevrons removed | SPEC-mandated |
| HUD map +15 %, BL info, sound cue | items 5–6 |
| Edge row and pill | item 6 |
| Wheel levelling on 3 cars | fix |
| Time-to-ready 8.8 → 14.5 s | item 8 |
| Route restore on refresh | W7 |
| Draco self-host | fix |

Proposed fix: add a short "what changed in the default since the 2026-09-28 build" list to the package.

**F2 SHOULD-FIX — the package does not say that `/` fails SPEC.**
- `/` keeps the 2026-09-28 scroll law that §14 rejects: a fling travels about 850 m, and the gentle:aggressive spread is 3.79× (COMPUTED).
- `/` keeps a road at **20–32 % of frame**, against §15's "well under a third" (COMPUTED, base, 18 poses).
- Choosing "no change" on items 1 and 3 is therefore not a SPEC-conforming outcome. The owner should be told so explicitly.

**F9 SHOULD-FIX — doc drift:**
- `ARCHITECTURE.md:170-171` still says "route position still resets on refresh until the later navigation work lands". W7 changed that.
- ARCHITECTURE's module map omits the new modules: `composition.js`, `compositionRail.js`, `racingLine.js`, `gateResponse.js`, `carWarmup.js`, `boundedPace.js`, `soundCue.js`.
- SPEC §1 still states the 2026-09-28 status.
- SPEC §30.9 does not list the 2026-10-04 user decisions: route restore as Phase 3; Showcase full-quality deferred to Phase 6. They live only in GT3_MASTER_CONTEXT and BUILD_LOG, although SPEC outranks both for product truth.
- SPEC §30.6 still describes the retired skirt fix.
- None of this is a code defect, but a fresh agent reading SPEC/ARCHITECTURE alone gets the wrong picture.

**NOTE N3:** `?cam=` without `?comp=` silently uses base hero 1.0, road 14 m and no racing line (`composition.js:59-62`). For example, `/?cam=wide` gives a hero far smaller than any reviewed row. The package says "all with &comp=b", but nothing guards against it.

---

## 5. Machine-verifiability of the human-review list

Items that could have been machine-verified but are not reported:

- **F7 SHOULD-FIX (item 8, first crossing):**
  - §27 says "judge hitches by the frame-time distribution… a single extreme-stall threshold is not evidence".
  - The package reports only "zero new GPU work" for the crossing, and ">100 ms" counts for startup.
  - `scripts/diag-swap-hitch.mjs` already computes p50/p90/p99 per ±1.5 s crossing window (l.75-157).
  - Report cold-vs-re-cross distributions at the final head, so the owner judges feel and not something a machine could have settled.
- **F10 SHOULD-FIX (items 1–2): give the owner road-share and road-to-hero-width numbers.** These are §15's own reference metrics and are cheap to compute.

  Road share of frame (COMPUTED, 16:9, 18 poses each):

  | Candidate | Road share |
  |---|---|
  | base | 20–32 % |
  | a | 7–12 % |
  | b | 10–17 % |
  | c | 8–15 % |
  | b/soft | 3.6–6.7 % |
  | b/wide | 2.8–5.3 % |

  Road width in hero widths (§15 reference: 3–4), using the widest roster footprint of 2.82 m (`composition.js:12`):

  | Candidate | Hero widths |
  |---|---|
  | base | 5.0 |
  | a | 2.0 |
  | b | 2.6 |
  | c | 2.4 |

  With a typical ~2.0 m body instead, a/b/c come out at roughly 2.8/3.7/3.3 (REASONED arithmetic).
- Item 3 — real trackpad momentum. Recorded trackpad traces could be replayed through `boundedPace` in Node. That is optional: the feel judgement stays human.
- Item 5 — "content drawn only from data" is already machine-checkable and checked (REASONED). Only the *choice* of content is the owner's.

Subjective items **missing** from the list (**F3 SHOULD-FIX**):
- **Swap effect look.** The 0.56 s cross-fade replaced the pulse and particles. §19's preferred effect is a "digital/pixelated morph"; a plain cross-fade is an allowed alternative, but the owner has never been asked about it.
- **Top-left identity composition**, name without a mark (§20).
- **The first-use direction cue**, carried over from 3d and never judged by the owner (BUILD_LOG "3d … not part of what the user walked through").
- **Hero-scale believability at 1.7–1.9×.** §15 requires that "body, wheel and suspension relationships stay believable" and that tyres look seated. This is subjective once the machine contact check passes.
- **Night readability for every `cam` option.** The package only flags `soft`.

---

## 6. Scope

- **No Phase 4+ pull-in found (REASONED).**
  - There is no Landing, Hub or back-to-Hub control.
  - The montage studio is now created lazily; that is a performance change, not new scope.
- **No Night-lighting pre-build** (§13a): no lights were added in `theme.js` or `sceneSetup.js`.
- **No Phase 8 scenery:** environment changes are limited to fog and shadow scaling for wider cameras (`sceneSetup.js` diff), which §16 *Ownership* permits.
- W8 is deferred with a recorded user-binding requirement. Deferral is consistent with "a loader with no Phase 3 consumer would be speculative", because Showcase is unreachable.
- Nothing that Phase 3 owns has been wrongly deferred. The manufacturer marks are blocked on assets, not deferred.
- Review scaffolding (`composition.js` "TEMPORARY", the dev label in `main.js:188-206`, the overrides) is correctly marked for removal at lock. The package's item 10 states the cleanup pass.

---

## 7. Review-package sufficiency (`docs/review/phase3-final-review.md`)

Strengths:
- exact URLs per option;
- options combine freely;
- a clear "Decision needed" line per item;
- honest trade-off numbers for `cam`;
- explicit "nothing merged / Phase 4 not started".

Gaps and misleading points:
- **F4 SHOULD-FIX — the window-aspect advice conflicts with the `wide` hold.**
  - The package says "use a desktop window at 16:9 or 16:10".
  - `wide`'s combined hold needs a *viewport* aspect ≥ 1.62. A true 16:10 viewport is 1.60 and falls back to two strict anchors with hold-like fast pans (cloud W2 review §4.2, COMPUTED there; the threshold is restated in the package itself).
  - Tell the owner to check that the grey label reads `strict-complex` for `wide`, and to name `strict:hairpin+chicane` as the degraded state.
- **F5 SHOULD-FIX — disclose that `cap` saturates.** COMPUTED:
  - `cap` reaches its 200 m/s ceiling already at "gentle" (1250 px/s) input, so its gentle:normal:aggressive ratio is **1 : 1 : 1**.
  - §14 asks that gentle scrolling be *slower* than normal. Only `pace` keeps an ordered narrow band: 0.67 : 1 : 1.26.
  - Default pace also drops sharply. Lap time at steady normal input is about 33 s under `pace` (150 m/s, route 5006.8 m) and about 25 s under `cap`. Steady normal speed under the default law is 1278 m/s.
  - §14 asks for a "somewhat slower" default. The owner should know these candidates are much slower at normal intensity, and similar at light input (75 vs 107 m/s).
- **F11 SHOULD-FIX — switching options in the same tab carries state.**
  - sessionStorage survives same-tab navigation. Editing the URL therefore restores the route position, the discoveries and the "sound cue seen" flag.
  - Each switch also costs the full ~14.5 s ready time, plus a 0.75–3 s rail build for a new aspect.
  - The package mentions only that refresh keeps position. Say: "changing the URL in the same tab resumes at the same route point; open a new tab for a clean start; expect ~15 s per switch."
- Item 1 should add the hero-size and road-share numbers from F10, and say that no row satisfies both §15 "camera barely moves" and "hero never tiny". It says this in prose but not as a decision framing ("which SPEC clause gives way").
- Items 5–6 depend on captures that are not in git (F8).
- The machine-verified list should carry the SHA per run (N2).
- Add the missing subjective items (F3) and the default-change list (F1).

---

## 8. Code-quality risks in the newest changes

**F6 SHOULD-FIX — the programmatic restore can dismiss the start screen without a gesture.** `scrollDrive.seekTo` suppresses start for a **100 ms wall-clock window** (`scrollDrive.js:255-260`).

The race:
1. The queued `scroll` event from the restore `scrollTo` is dispatched at the next rendering opportunity.
2. If the first frame after warm-up/release exceeds 100 ms (BUILD_LOG recorded 100–216 ms post-dismiss frames before the budget fix), `onScroll` calls `startDrive()`.
3. Default mode reaches it via `rawTarget > 0` (l.125); bounded mode via `scrollY > 0` (l.117).
4. The start screen then dismisses with no user gesture.

Impact:
- No audio is initialised, because `onFirstScroll` only dismisses (`startScreen.js:161`). §10 is therefore safe.
- The UX contract of "silent restore, the first real gesture starts" breaks under load.
- `verify-route-persistence.mjs` does not assert start-screen state after reload (only l.58 `is-ready`).

Proposed fix:
- Replace the timer with a position guard: ignore start while `|scrollY − restoredY| ≤ 1` and no wheel/key/pointer input has been seen.
- Add an assertion to the harness.

Notes:
- **N4** — `restoreAtProgress` (`checkpoints.js:100-104`) sets the route car without unioning discoveries 1..routeIndex. A stale or edited `unlocked` could leave the active car "undiscovered". Normal writes keep both fields consistent (one JSON write), so this is a defensive gap only.
- **N5** — Wheel levelling: `hasWheelMaterial` uses `materials.some(...)`. For a multi-material merged mesh where one group is the tyre, every vertex of the mesh, body included, would count as wheel, and grounding could use a splitter vertex. Today's roster passes (COMPUTED), but a future model could fail silently. Consider filtering by `geometry.groups`.
- **N6** — Levelled cars are grounded from the tyre minimum (`cars.js` `groundY`). Any body vertex lower than the tyres would sit below asphalt; nothing asserts body-min ≥ tyre-min − 2 cm. Add that to `check-wheel-ground.mjs`.
- **N7** — `DRACO_DECODER_PATH = '/draco/gltf/'` is root-absolute. It breaks under a non-root Vite `base`, and the copied decoder must be re-synced when `three` is upgraded past r180. Use `import.meta.env.BASE_URL` and note the version coupling.
- **N8** — `carWarmup.runFrame`: correct. Steps run in identical order, progress is deferred, `done` is respected, and errors restore through `step()`. Several `render(0)` calls per rAF are fine; only the last is presented. A single heavy first-use draw still overshoots the 12 ms budget, as documented. No bug found.
- **N9** — `session.js` route persistence: correct. Throttled, flushed on hide, started only after restore, validated on read. Caveat: browsers copy sessionStorage on "Duplicate tab", so a duplicated tab resumes mid-route (browser-native; acceptable under §25's "simplest mechanism").
- **N10** — `scrollDrive` bounded modes:
  - `thumbHeld` detects a classic scrollbar by `clientX >= clientWidth`. macOS overlay scrollbars (the dev host) have no gutter, so a held overlay thumb can be re-synced under the user after 0.14 s idle. This is an edge case.
  - The bounded `seekTo` (non-instant) is exempt from `maxLead` by design.
- **N11** — `compositionRail`: the rebuild per new exact aspect runs synchronously on the main thread (0.4–1.5 s in Node here; the package says 0.75–3 s in the browser).
  - The first frame calls `prepareCompositionRail(camera.aspect)` inside rAF, so the initial build lands at boot for `cam` modes.
  - The 8-entry cache is keyed by exact float aspect.
  - Acceptable for review scaffolding. It must be precomputed or moved off the main thread if a `cam` option is locked.
- **N12** — `hud.js setIdentity` and `morph.js` add a `performance.measure` per swap and never clear measures. The User Timing buffer grows slowly under long back-and-forth use. Clear them, or keep them dev-only.
- **N13** — `scripts/sim-scroll-pace.mjs:24` defaults `--out` to `/Users/rayyansheikh/.claude/jobs/...`, so it writes outside the repo on any other machine. Default it to a temporary directory.
- **N14** — A global non-passive `keydown` listener (`scrollDrive.js:380`) is pre-existing. Keyboard listeners do not affect threaded scrolling (§27 concerns wheel/touch), so this is fine. Recorded only because §27 is strict about non-passive listeners.

Other NOTEs:
- **N1** — the package does not name §16 "no world edge" as a thing to watch on `wide` (440 m, FOV 48), although machine rays cover it.
- **N2** — per-run SHAs are missing from the package's machine-verified list (§3).

---

## Ranked summary

**BLOCKER (0).** None found. Nothing prevents the owner review from proceeding.

**SHOULD-FIX (11):**
- F1 — default-change list missing; "baseline on every axis" is misleading.
- F2 — package doesn't say `/` fails §14/§15.
- F3 — subjective items missing: swap look, TL identity, direction cue, hero believability, Night per cam.
- F4 — 16:10 advice vs `wide` ≥1.62 aspect.
- F5 — `cap` 1:1:1 saturation and the much slower normal pace are undisclosed.
- F6 — 100 ms time-based restore start-suppression race; harness gap.
- F7 — no §27 frame-time distribution for first crossing.
- F8 — all browser evidence is outside git.
- F9 — ARCHITECTURE/SPEC drift: route restore, new modules, user decisions, §30.6.
- F10 — road-share and road-to-hero-width numbers not given.
- F11 — same-tab URL switching carries session state; ~15 s per switch.

**NOTE (14):** N1–N14 above.
