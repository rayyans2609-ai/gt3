# Cloud Opus — independent Phase 3 final audit 2 (delta since 8b59a7b)

Advisory only; the owner accepts or rejects Phase 3. Cloud session: no GPU, no browser, no dev server. **No visual, browser, GPU or timing observation is claimed.**
Labels: **COMPUTED** = run in Node here; **REASONED** = read from code/docs; **UNVERIFIED** = depends on local artifacts not in git.
Result: **1 BLOCKER (mechanical), 4 SHOULD-FIX, 9 NOTE** (new IDs A1–A14; prior F/N dispositions in §1).

## 0. Provenance
- `git checkout -B audit3 origin/phase3-integration` → HEAD **`19dace50f6c31057f4ffd93355a9573f912b6c3e`** (as expected).
- `git diff --stat 360294a HEAD -- src` is empty: the W6C evidence point (360294a) has the same `src/` as the final head (COMPUTED). af8d13e/19dace5 touch only a harness script and docs.
- COMPUTED, all pass: `npx vite build --outDir /tmp/gt3-a3-dist`; `check-wheel-ground` (lexus +0.164°, nissan −0.322°, mclaren −0.842°, 7 others 0, full-match true);
  `check-wheel-classifier` (20 GLBs, spin sets identical to 8b59a7b); `check-car-warmup` (mocked renderer: parity, quota, budget, fallback, faults);
  `check-composition-base` (1800 samples, exactEquality, SHA `7616a0d1…`). Not replayed: prior audit's sim/composition-math runs.
- Every browser result in BUILD_LOG W6C and the package (load recovery, first-crossing distribution, hero pivot, occlusion, startup) is **UNVERIFIED** here: local only.

## 1. Prior findings — disposition
| ID | Status | Evidence |
|---|---|---|
| F1 | Resolved | Package `:16-26` lists default-on changes since 09-28. Caveat on `:26`, see A6. |
| F2 | Mostly resolved | BUILD_LOG W6C at 360294a (= final `src/`): hero pivot all comps, checkpoints, swap, persistence. Scroll/HUD/W2 matrix still at da67f54, disclosed `:151-152`. Contradiction with `:42`, see A3. |
| F3 | Framing resolved; substance carried to owner | `:31-45` states the frontier and per-option compliance. No measured hero-scaled candidate; `&hero=` still DEV-only (disclosed `:43`). |
| F4 | Resolved | `:50-54` coverage and hero widths; `:62` cap 1:1:1; `:65-68` 6–8× and +54 %; `:68` 55 m per gesture. Reach .72 omitted (minor). |
| F5 | Partially | SPEC §30 items 10–11 added; ARCHITECTURE fixed; BUILD_LOG `:713` citation corrected. Still stale: SPEC §1 `:22` (dated 09-28, "technically verified"). MASTER_CONTEXT `:23`, see A8. |
| F6 | Resolved in package and SPEC | Package item 7 `:105` asks to confirm; SPEC `:554` says "agent proposal awaiting the owner's confirmation". MASTER_CONTEXT contradicts it (A8). |
| F7 | Partially | Implemented (ad9c746) but **no measured gain**, measured only on a contaminated host. Keep/revert handed to the owner. `cam=` boot cost still unmeasured. See A2. |
| F8 | Partially, disclosed | Lean set per `:126-129`; c×{leg1,glide,hold,wide} skipped. Missing: "if you pick c, it must be swept before §30.6 retires" (A9). |
| F9 | Resolved | `main.js:280-283` + `startScreen.js:156-166`; harness `verify-route-persistence.mjs` finish phase. One assertion is non-discriminating (A7). |
| F10 | Resolved | `:108-110` quotes p50/p90/p99/worst and discloses the 133 ms frames in swap contexts. |
| N1 | Resolved | Node ancestry first; material fallback only when a model has no wheel nodes (`cars.js:122-145`). COMPUTED parity. New fragility A5. |
| N2 | Documented | `:26`. But see A6: no road wheels spin either. |
| N3 | Carried | `three: ^0.180.0` unpinned; absolute `/draco/gltf/`. Package `:161` covers re-copy only. |
| N4 / N4b | Carried | 12 ms budget and 40 s timeout unchanged; rail cleanup deferred to lock. Resize stall disclosed `:158`. |
| N5 | Carried, disclosed | `:159`. |
| N6 | Partially | Duplicate tab disclosed `:13`. `restoreAtProgress` vs `unlocked` reconciliation unchanged and unmentioned (Phase 6 relevance). |
| N7 | Partially | Source named (`w2/matrix-final.json`), but it conflicts with `:152` (A3). |
| N8 | Resolved | BUILD_LOG `:727` now "open owner decision". |
| N9 | Carried, disclosed | `:160`. |
| N10 | Carried to owner | Item 10 `:133`. |
| N11 | Partially | Direction cue (`:98`), racing line (`:55`), resize stall and camera×pace (`:44`) added. The levelled-car stance is listed as a change (`:25`), not as a judge item. Night readability is asked only for soft. |
| N12 | Resolved | `verify-occlusion.mjs:6` label removed. |
| N13 | **Not resolved** | `:3` and `:8` still contain the `<FINAL SHA>` placeholder (A1). |

Nothing is claimed resolved that clearly is not. Two partial overstatements: N7/F2 via A3, and "verified correct" for compileAsync via A2.

## 2. New code in the delta
**`carWarmup.js` compileAsync path (ad9c746).** REASONED against three r180 `WebGLRenderer.js:1301-1465`:
- **Correct:** `compile()` collects materials with `traverse` (not `traverseVisible`), so the hidden-mesh comment at `:79-80` is right. Lights come from `scene` via `traverseVisible`, which matches the real draws.
- **Correct:** binding `composer.readBuffer` (`:162`) gives `NoToneMapping`/linear output program keys, matching RenderPass's off-screen draw (`sceneSetup.js:243-244,361`). Both composer buffers share format, so swaps do not matter. Target, face and mip are restored in `finally`.
- **Correct:** the preparation key is (car, fading), so fade materials (after `beginWarmFade`) are compiled separately. Texture dedup across cars uses `uploadedTextures`.
- **Correct:** fallback works for a sync throw, a rejection (re-thrown at `:174`, caught at `:184`) and missing APIs. `!done` guards stop late resolutions. `pauseFrame` stops a busy loop.
- **A2 SHOULD-FIX — the path is unproven and possibly unexercised, and the owner is asked to arbitrate an engineering choice.**
  - Preparation is serial. 20 compile/wait cycles (10 cars × normal/fade) each yield ≥1 frame, poll at 10 ms `setTimeout`, and upload ≤4 textures per frame before any draw. All original draws still run.
  - The parallelism therefore overlaps only within one car's materials. That plausibly explains "no gain / ~3 s slower" (REASONED).
  - Nothing records which path ran. `parallelCompile` is not exposed in `readiness`, and `console.warn` fires only on fallback.
  - Whether headless contexts expose `KHR_parallel_shader_compile` is UNVERIFIED. The package's "verified correct: load recovery 9/9, zero first-crossing allocations" (`:121`) may have exercised only the draw path.
  - Fix: record the path in `readiness`, then either do one clean solo A/B or revert to the measured ea95055 path. If kept, compile all cars up front rather than per car.
- **A10 NOTE:** if `program.isReady()` never turns true (e.g. context loss), each frame pauses until the 40 s GPU timeout, and three's 10 ms poll keeps running after abort. Readiness degrades correctly. Cost: up to 40 s of extra wait.

**`cars.js` classifier (2a19233).**
- COMPUTED: identical contacts, pitches and spin sets on all 20 GLBs.
- **A5 NOTE — new false-negative fragility.**
  - `WHEEL_NAME` (`:23`) now needs non-letter delimiters. COMPUTED: `FrontWheel`, `wheelFL` and `TireFront` no longer match; `Wheel_FL` and `LOD_A_WHEEL_1` do.
  - Any ancestor matching `NON_WHEEL_NAME` (e.g. a group `Wheels_Brakes`) now vetoes every descendant (`:125`).
  - No effect on the shipped roster. Add a fixture before any new model.
- **A6 NOTE — `findWheels()` returns 0 meshes for all 10 cars, tour and full** (COMPUTED by `check-wheel-classifier`, real GLTFLoader hierarchy).
  - It tests only the mesh's own name (`cars.js:503-512`), and wheel identity lives on parent nodes or materials.
  - So the `carRig.js:158-161` spin blur is inert for every car (pre-existing).
  - Package `:26` ("steering wheels no longer spin with the road wheels") implies the road wheels spin. Reword it.

**Finish restore (5ec3867).**
- REASONED correct. `dismissStartScreenForRestore` runs synchronously between `unlockScroll()` and `restoreFinishScreen()` re-locking, so no input can interleave.
- It is idempotent. The later `setLoadState` → `renderProgress` → `dismissStartScreen` returns early (`dismissed`).
- `onDismissComplete` has one consumer (`main.js:233`). After Replay the cue stays suppressed, which is consistent with the once-per-session `sessionStorage` flag.
- **A7 NOTE:** the harness's `!soundCue` assertion cannot fail because of this fix. The first visit's gesture already set `soundCue` `SEEN_KEY` in `sessionStorage` (`soundCue.js:58-61`). The start-screen assertions do discriminate.
- `verify-occlusion` `GT3_TS`/`@WxH` changes are harness-only. Fine.

## 3. Review package (`docs/review/phase3-final-review.md`)
- **A1 BLOCKER (mechanical, one line):** `:3` and `:8` still say `<FINAL SHA>`. The package says "pin this SHA" but gives none.
  - `:118` calls the final head "af8d13e", while HEAD is 19dace5 (docs-only after af8d13e; `src/` = 360294a).
  - Fill in 19dace5 (or the eventual hand-off SHA), and say evidence was taken at 360294a/af8d13e with identical `src/`.
  - The "How to run" path is still a local worktree.
- **A3 SHOULD-FIX — contradiction on hero-% provenance.**
  - `:42` says the hero % comes "from the browser matrix at the final head (`w2/matrix-final.json`)".
  - `:152` says the W2 matrix PASS is "at da67f54; final-head spot captures".
  - BUILD_LOG W6C lists no matrix re-run. State which build produced the item-1 numbers.
- **A4 SHOULD-FIX — item 8 asks the owner to keep or revert ad9c746 on evidence that cannot decide it.** Two contaminated rounds, ~3 s slower, and an unknown executed path (A2). This is an engineering call that the agent should close with one clean A/B, or a revert to the measured path, before hand-off. Otherwise the owner reviews a startup number nobody has measured cleanly.
- A9 NOTE: item 9 should say that choosing `comp=c` (any cam except soft) requires the skipped c sweep before §30.6 retires.
- A11 NOTE: `:14` says "1–1.5 s (up to ~3 s)" and `:158` says "0.75–3 s" for the same stall. Pick one.
- A12 NOTE: `:108` reads "zero new GPU work … in every run", and BUILD_LOG W6C reads "6 contexts". Consistent, but all from headless contexts, so it says nothing about the owner's GPU (UNVERIFIED).
- Rest checked and consistent with BUILD_LOG/SPEC:
  - the default-on change list;
  - the compliance columns;
  - the +8.3 %/+54 %/6–8× figures (match the prior COMPUTED numbers);
  - the W8 framing;
  - the car-info table (matches the prior COMPUTED lines exactly);
  - the decision-recording line (`:135`).
- No scope drift found: the delta touches only warm-up, classifier, finish restore, harnesses and docs.
- **Depends solely on local evidence:**
  - every Evidence-table row except build, wheel-ground and camera invariance;
  - all startup figures;
  - the frame-time distribution;
  - the occlusion counts;
  - the captures (`w5/`, `w5a/`, `w2/`, `startup-final2/`, `run-packet/`).

## 4. Other docs
- A8 NOTE: `GT3_MASTER_CONTEXT.md:23` still states "Its implementation is deferred to Phase 6" as a user decision. That contradicts SPEC §30 item 10 and package item 7, which call it a proposal.
- A13 NOTE: SPEC §1 `:22` still reads "(2026-09-28) … Phase 3 is implemented and technically verified" (F5 remainder).
- A14 NOTE: N6's `restoreAtProgress`/`unlocked` gap is not listed under Known limits. Add one line for Phase 6.

## 5. Findings index
| ID | Sev | One line |
|---|---|---|
| A1 | BLOCKER | `<FINAL SHA>` placeholder unfilled; package cannot be pinned (N13 unresolved) |
| A2 | SHOULD-FIX | compileAsync path serial, unmeasured cleanly, path taken not recorded; may be unexercised headless |
| A3 | SHOULD-FIX | Hero-% "matrix at the final head" (`:42`) contradicts "matrix at da67f54" (`:152`) |
| A4 | SHOULD-FIX | Owner asked to keep/revert ad9c746 on non-decisive, contaminated evidence |
| F5r | SHOULD-FIX | F5 remainder: SPEC §1 + MASTER_CONTEXT stale/contradictory (A8, A13 detail) |
| A5–A14 | NOTE | classifier camelCase/ancestor veto; spin set empty for all cars + `:26` wording; vacuous cue assertion; MASTER_CONTEXT W8; c-sweep caveat; isReady hang; stall wording; headless-only; SPEC §1; N6 limit |

(A8 and A13 roll into F5r: 4 SHOULD-FIX, and the 9 NOTE are A5, A6, A7, A9, A10, A11, A12, A14, plus N3/N4 carried as one.)
A1 is the only item that should stop the hand-off, and it is a one-line fix. Fixing A2/A4 (instrument + clean A/B, or revert) before hand-off would remove the one decision the owner cannot meaningfully make.
