# Cloud Opus — independent Phase 3 final audit

Advisory only. This audit does not accept or reject Phase 3; the product owner does. The reviewer is a cloud session with no GPU, no headed browser and no Vite dev server run. **No visual, browser, GPU or perceptual observation is claimed.**
Labels: **COMPUTED** means run in Node in this sandbox. **REASONED** means read from code or docs. **UNVERIFIED** means it needs the owner's machine or browser.
Severity: **BLOCKER** (fix before review), **SHOULD-FIX**, **NOTE**. Result: **0 BLOCKER, 10 SHOULD-FIX, 13 NOTE**.

## 0. Provenance and method

- `git fetch origin phase3-integration && git checkout -B audit origin/phase3-integration` gave HEAD
  **`8b59a7be7c4eb76e4b25d1c44031fdde5a64f091`**, the expected commit. Everything below refers to that commit.
- `npm ci --ignore-scripts` installed three@0.180.0. All scratch output went to `/tmp`.
- **COMPUTED runs:**
  - `npx vite build --outDir /tmp/gt3-audit-dist` passed. It shipped `draco/gltf/*`.
  - `node scripts/check-wheel-ground.mjs` passed and reproduced the BUILD_LOG pitches: lexus +0.164°, nissan −0.322°, mclaren −0.842°, the other 7 at 0.
  - `node scripts/check-composition-base.mjs` passed, both against `0967653` and against the pre-W2 merge **`2fe0940`**. Both gave 1800 samples, `exactEquality: true`, SHA256 `7616a0d1…`.
  - `node scripts/check-composition-math.mjs b 1.7778 soft` is byte-identical to the committed `docs/review/w2-leg3/b-soft.json` once timing keys are excluded.
  - `node scripts/sim-scroll-pace.mjs --out /tmp/gt3-audit-sim` reproduces the fling distances: 853.2 / 124.6 / 112.5 m.
  - Scratch variants of the wheel verifier ran in the session scratchpad: wheel-name census and body-below-contact. They are not committed.
- No browser harness was run. Every `w2/`, `w5/`, `w5a/`, `w6/`, `startup-final/` and `run-packet/` artifact is on the developer's machine and **not in git**.

## 1. Phase 3 closure requirements vs SPEC

| # | Requirement | Canonical source | State at 8b59a7b |
|---|---|---|---|
| R1 | Camera candidate + world/road/hero scale, owner-picked | SPEC §15, §30.9 bullet 1 | Candidates built. **No candidate meets all of §15** (see F3). |
| R2 | Road width / path A/B/C, owner-picked | SPEC §15 *Hero-car path*, §17, §30.9 | Built as `?comp=a/b/c`; clearance is machine-checked. |
| R3 | Bounded scroll pace, owner-picked | SPEC §14, §30.9 | Built as `?scroll=cap/pace`. The default still violates §14 by design. |
| R4 | §14 +30–50 % distance/time between progression events | SPEC §14 | Distance is +8.3 %. Time depends on the R3 choice (see F4). |
| R5 | Gate traversal response, owner-picked | SPEC §18, §30.9 | The default sweep and `?gate=quiet` are built. |
| R6 | First crossing as smooth as a re-cross; warm ahead | SPEC §19, §27 | Implemented (`carWarmup.js`). Evidence is local only (F10). |
| R7 | Bottom-left car info, owner-picked | SPEC §20, §30.9 | Built. The lines are COMPUTED below (§7). |
| R8 | HUD map 10–20 % more prominent; edge row; sound cue; direction cue | SPEC §20, §8, §13 | Map 148→170 px, which is +14.9 % linear and +32 % area (`hud.css`). Edge row and cue are built. |
| R9 | Top-left manufacturer mark | SPEC §20, §30.8 | Correctly blocked on owner-supplied assets. The name stands alone. |
| R10 | Remove legacy chevrons | SPEC §18 | Done (`track.js`, 1888aed). |
| R11 | Route-position restore across refresh | User decision 2026-10-04 (MASTER_CONTEXT Next 1); SPEC §24–25 | Done (`session.js`, `main.js:268-282`). The finish-state path is untested (F9). |
| R12 | Tour 512-px textures must not lower Showcase quality | User decision 2026-10-04 (MASTER_CONTEXT) | Deferred to Phase 6 (W8). This is **not in SPEC** (F5) and **not presented as an owner decision** (F6). |
| R13 | ~30 s startup not accepted: measure, then fix no-tradeoff causes | User decision 2026-10-04 | Measured at 14.5 s (local evidence). One no-tradeoff path is untried (F7). |
| R14 | §30.6 grass-over-road needs owner visual acceptance | SPEC §30.6 | Machine sweep for 3 of 16+ configs (F8). Owner check pending. |
| R15 | Wider view must not reveal a world edge | SPEC §16 *Ownership* | COMPUTED from the committed leg-3 JSON: `worldExtent.exposedRays = 0` for base, b/glide, b/hold, b/wide and b/soft. |
| R16 | Uniform hero scale, ground-contact pivot, tyres seated | SPEC §15 item 3 | `carRig.js` scales `carMount` about y=0. Wheel levelling verified in Node. The browser check is pre-fix (F2). |
| R17 | "SPEC classification" review gate | MASTER_CONTEXT Next 1 | **No recorded owner approval in git** (N10). |
| R18 | Final integrated acceptance + merge approval | SPEC §30.9, MASTER_CONTEXT | Pending; this is correct. |

**Mis-scoped or incorrectly complete (REASONED):**
- R12 is treated as a settled deferral. It is an unratified agent decision; see F6.
- SPEC §30.6 still describes a "far grass skirt" fix. `BUILD_LOG.md:705` says that geometry no longer exists. The SPEC item is stale, not complete.
- Nothing required for Phase 3 is missing from the code. The gaps are evidence, decision framing and documentation.

## 2. Implementation completeness per package

- **W2 camera/composition** (`composition.js`, `compositionRail.js`, `aerialCamera.js:164-463`, `racingLine.js`):
  - COMPUTED: the default camera is bit-exact to the pre-W2 camera at `2fe0940`. This is stronger than BUILD_LOG's claim, which compared against `0967653`.
  - REASONED: `pathPointAt`/`pathTangentAt`/`pathCurvatureAt` reduce exactly to the old `pointAt`/`tangentAt`/`curvatureAt` when the amplitude is 0 (`racingLine.js:113-136` vs `trackCurve.js:181-188`). The default gate beam is still 18.9 m (`checkpoints.js:14-15`).
  - The Cloud W2 review's §4.2, §4.3, §5 and §6.1 recommendations are implemented: the tether, closest-pair anchors, `?cam=soft` and the hold-state label.
  - The design gap remains: see F3.
- **W3 scroll pace** (`boundedPace.js`, `scrollDrive.js:47-80,345-370`):
  - The default law is unchanged. `cap` and `pace` implement credit, maximum lead, a ceiling and bounded acceleration.
  - COMPUTED (sim): a 2500 px fling travels 853 / 125 / 113 m; stop after "normal" settles in 1.57 / 1.10 / 0.58 s; reversal overshoots by 64 / 16.5 / 8.2 m.
  - **`cap` fails §14's "gentle scrolling moves slower".** Gentle, normal and aggressive all run at 200 m/s, a ratio of 1/1/1. `pace` gives 0.67 / 1.26 / 1.88.
- **W4b startup** (1cd1d29, b198095, 2b524c8, 11fffac): boot marks, a lazy studio renderer, early preload and a 12 ms warm-up budget. `runFrame` (`carWarmup.js:205-217`) runs the same step order and is correct. See F7 and N4.
- **W5a/W5b HUD + controls:**
  - Map 170 px with a 2.2 px stroke.
  - Car info: two cross-fading slots of 320×52 px, about 1.2 % of 1600×900.
  - Day/Night control: a segmented sun/moon control. It parks beside the open player (`hud.css`, `themeToggle.js`).
  - Sound cue: once per session and visual only (`soundCue.js`).
  - These match SPEC §20/§8 as written. Look and feel are owner judgments.
- **W7 route + discovery persistence:**
  - `routeProgress` is validated to [0,1] and written at most every 350 ms, with a flush on `pagehide`/`hidden` (`session.js:13,18,91-104`).
  - Restore runs while scroll is locked, with a 100 ms guard against programmatic start (`scrollDrive.js:280-286`). Discovery state is separate and monotonic.
  - Gaps: F9, N6.
- **W8 deferral:** the code has no Phase 3 consumer. `cars.js:374-378` states that Showcase and montage clone the 512-px roster. Meanwhile 49 MB of full-resolution GLBs in `public/models/` ship into `dist/` but are never loaded (COMPUTED `du`). See F6.
- **W6 regression:** the harnesses exist in `scripts/`. **All results are local.** Most browser runs predate the last code change (F2).

## 3. Unsupported or over-stated acceptance claims

- **F2 SHOULD-FIX — "Machine-verified on the final head" is inaccurate.**
  - `phase3-final-review.md:101-110` claims this. The last code commit is `ea95055` (the `cars.js` wheel levelling).
  - The commit messages place verify-occlusion, verify-aerial, verify-hero-pivot and verify-composition-extra at **`da67f54`**, which is pre-fix. `git diff da67f54 8b59a7b -- src` touches only `src/scene/cars.js`.
  - Only startup (ea95055) and possibly smoke ran after the fix. BUILD_LOG's "wheel contact … browser-confirmed at base scale" after the fix has no git trace, and does not cover hero scales 1.7/1.8/1.9.
  - Fix: either re-run verify-hero-pivot (all comps), verify-checkpoints, verify-swap-response and verify-composition-extra at 8b59a7b, or reword the claim.
- **Claims that rest only on local artifacts (UNVERIFIED here):**
  - load-recovery 9/9, checkpoints 10/10, swap-response 22/22;
  - zero GL allocations at crossings;
  - W6B 16/16 matrix rows;
  - startup 14.5 / 16.5 / 8.8 s;
  - offline ready with zero placeholders;
  - occlusion "0 hits at 101 t";
  - verify-aerial constant yaw/pitch;
  - the 4 "unexplained page-loss flakes";
  - the "25–30 s figures were host memory pressure" attribution.

  The harness code is present; the outputs are not.
- **F10 SHOULD-FIX — hitch evidence is reported by threshold, not by distribution.**
  - SPEC §27 says "a single extreme-stall threshold is not evidence of smoothness".
  - The package and BUILD_LOG cite "zero new GPU work" and "0 post-dismiss frames >100 ms".
  - `diag-swap-hitch.mjs:78,569-574` already records p50/p90/p99 and the >20/>33/>50 counts. The package should quote the first-crossing distribution on the final head.
  - The package's "in every run" also drops BUILD_LOG's "8/9 contexts clean".
- **N7 NOTE — hero-size numbers have no stated source.** The package's hero % ranges (b/soft 1.2–1.7, glide 2.0–2.8, hold 1.6–2.3) have lower upper bounds than the committed Node JSON (1.19–1.99, 2.00–3.11, 1.60–2.40). The source is presumably the local browser matrix; the package should name it.
- **N8 NOTE — ambiguous wording on the warm-up cost.** `BUILD_LOG.md:727` says "`gt3:warmup` 8.2 s is the remaining cost of the smooth first crossing (user decision)". This reads as if the owner had already accepted it, but item 8 of the package still asks for that decision.

## 4. SPEC drift, contradictions, silent default changes

- **F1 SHOULD-FIX — "No parameters = today's baseline on every axis" is misleading** (`phase3-final-review.md:14`).
  - It is true for the comp, cam and scroll axes only (COMPUTED camera; REASONED comp and scroll).
  - Relative to the build the owner reviewed on 09-28 (`61ce7b1`), the no-query default now includes all of these:
    - the gate sweep, which replaced the morph pulse/particles (`morph.js` −335/+, `gateResponse.js`);
    - warm-up before unlock and the startup changes;
    - the 512-px textures;
    - the HUD map +15 %, car info and sound cue;
    - the segmented Day/Night control and edge-row recomposition;
    - route restore;
    - chevron removal;
    - Draco self-hosting;
    - wheel levelling for 3 cars;
    - the steering-wheel spin exclusion (N2).
  - Several of these are themselves under review (items 4–7), and the old behaviour has no query to compare against.
  - The package should list what is new by default since 09-28.
- **F5 SHOULD-FIX — owner decisions are missing from SPEC.**
  - The 2026-10-04 decisions appear only in MASTER_CONTEXT and BUILD_LOG: route restore is Phase 3; Showcase and montage use full-resolution models; ~30 s startup is not accepted. `grep -n "512\|texture" SPEC.md` finds no Showcase texture rule.
  - BUILD_LOG run 2 says the W8 requirement is binding through "SPEC §27, line 514". That line covers **render resolution (dpr)**, not model or texture resolution.
  - SPEC §1 and §30.9 are still dated 2026-09-28.
  - §30.6 is stale.
  - ARCHITECTURE has its own drift:
    - `ARCHITECTURE.md:171` still says "route position still resets on refresh".
    - `:174` names `progress`/`activeCarIndex` keys; the actual key is `routeProgress`.
    - It does not list `boundedPace.js`, `composition.js`, `compositionRail.js`, `racingLine.js`, `carWarmup.js`, `gateResponse.js` or `soundCue.js`.
- **REASONED — composition defaults versus SPEC wording.**
  - Corridor zones are .74–.76 NDC. Measured reach is x .72 / y .70 (leg-3 table), against SPEC §15's "starting at roughly the central 50–60 %".
  - SPEC calls that a guide, not a cage, but the owner should know the car approaches the frame edge.
  - COMPUTED from the committed JSON: comp **a** gives road = **2.83** median hero widths (2.0 widest), below §15's "3–4" starting reference. b gives 3.69 and c 3.34.
- **N9 NOTE — fonts are not in git.** `font/` is gitignored (`.gitignore`, `ARCHITECTURE.md:32`). A clean clone builds (COMPUTED) but without the typography. This predates Phase 3 and is noted only for reproducibility.
- **N12 NOTE — the occlusion harness labels a candidate.** `verify-occlusion.mjs:6` calls b+soft "(recommended candidate)", while the package says "no candidate has been picked for you". Remove the label to avoid anchoring the owner.

## 5. Machine-verifiability

**Items that are machine-verifiable but not, or not fully, verified:**
- **F8 SHOULD-FIX — occlusion sweep coverage (item 9).**
  - Defaults cover only `base`, `b+soft` and `b+wide` (`verify-occlusion.mjs:15`).
  - Terrain carving depends on `TRACK.halfWidth` (`environment.js:314,446,472`), so comps a and c and the glide/hold cameras are unswept.
  - Run the sweep for every comp×cam pair still in contention, at minimum the owner's pick, before the visual retirement.
- **F4 SHOULD-FIX — §15/§14 proxies already exist but are not in the package.**
  - Road coverage of the frame (median/max): base .29/.32, b/soft .04/.07.
  - Road in hero widths, per comp (above).
  - Framing reach.
  - Time between gates: COMPUTED from sim steady speeds against the mean gate spacing of 479 m (`CHECKPOINT_T` × `TRACK_LENGTH` 5006.8 m). Default light 4.5 s vs cap/pace 6.4 s (+43 %, about +54 % with the +8.3 % distance). Default normal 0.37 s vs pace 3.2 s and cap 2.4 s, i.e. **≈6.4–8.5× longer** at "normal" input. "+54 % or more" understates this.
  - A 1500 px mouse burst moves only 55 m under either candidate (`maxLead`).
  - Keyboard End/PageDown and a scrollbar drag are likewise capped at 55 m per gesture, then the page re-syncs (`boundedPace.js:63-75`, `scrollDrive.js:349-357`). This is a visible behaviour the owner should test deliberately.
- **Night visibility** (listed as not machine-verifiable): it could be proxied by car-vs-background luminance contrast in the existing Night captures. **Trackpad momentum:** recorded macOS trackpad delta traces could be replayed through `sim-scroll-pace.mjs`. Both are optional (NOTE).

**Subjective items missing from the human-review list (N11 NOTE):**
- the first-use forward/reverse direction cue (SPEC §14/§20), which the owner has never reviewed (BUILD_LOG 3d note);
- the wheel-levelled McLaren, Nissan and Lexus stance;
- Night readability of the hero for **every** far camera, not just soft;
- racing-line believability ("no weaving", SPEC §15) for b and c;
- whether the 0.75–3 s first-seen-aspect stall on resize is acceptable for a chosen `cam=`;
- **camera × pace together.** Hold/wide pan at about 3× route speed, so with the default law (sim normal ≈1278 m/s route speed) the pan is far larger than under `pace` (≤202 m/s). Judge the pick in its final scroll mode.

## 6. Scope

- **Nothing outside Phase 3 was pulled in (REASONED).**
  - `git diff 2fe0940 8b59a7b --stat -- src` touches no Landing, Hub, Showcase, finish-hero, `theme.js` or `environment.js` code.
  - Night route lighting and Phase 8 scenery are untouched.
  - Fog and shadow-box scaling (`sceneSetup.js` `COMP.fogScale/shadowScale`) is camera-structural, which SPEC §16 *Ownership* allows.
- **F6 SHOULD-FIX — W8 is deferred by the agent, not ratified by the owner.**
  - BUILD_LOG run 2 records the rationale ("a loader with no Phase 3 consumer would be speculative"). That rationale is sound engineering.
  - The package item 7 presents it as settled ("That is a recorded requirement") and asks only about Tour texture quality.
  - Ask the owner explicitly to confirm the deferral to Phase 6, and record it in SPEC (F5).
- **F7 SHOULD-FIX — startup work may be deferred too early.**
  - The Tour warm-up renders full composer frames per batch (`carWarmup.js:93-104`).
  - The montage already uses `renderer.compileAsync` (KHR_parallel_shader_compile) and drip-fed `initTexture` (`studio.js:490,787`; `BUILD_LOG.md:396-399`).
  - That is a candidate "no-tradeoff" fix, which is exactly what the 10-04 decision asks for, and it should be tried before the owner is asked to accept 14.5 s.
  - Startup for any `cam=` candidate is also unmeasured. The rail solves synchronously at boot: 388–637 ms Node time per the leg-3 README, 0.75–3 s in the browser.

## 7. Review-package sufficiency (`docs/review/phase3-final-review.md`)

What works: the URLs combine and are listed per item, every item has a decision line, and the numbers and costs are mostly stated. What is missing or misleading:
1. F1: the baseline wording.
2. F2: the "final head" wording.
3. F10: the distribution evidence.
4. **F3 SHOULD-FIX — compliance and the frontier are not stated.**
   - The `/` rows for cam and scroll are presented as choosable, but they fail SPEC §15 ("barely moves") and §14 ("bounded pace"). The package should mark which options are SPEC-compliant.
   - No camera candidate satisfies both "the camera barely moves" and "the hero car must never become tiny".
     - Hold, wide and soft keep hero length ≤ 2.4 % of frame width (b, leg-3 JSON).
     - Leg 1 is 4.9–6.6 % but moves 0.87/0.95.
   - The only lever, `&hero=`, is **DEV-only** (`composition.js:62-71`), unmeasured, and shrinks b's racing line.
     - Amplitude = `halfWidth − 1.41·hero − 0.9` (`composition.js:73-74`): 3.42 m at 1.9, about 2.58 m at 2.5 and 1.87 m at 3.0 (REASONED).
     - It also drops road/hero widths below 3: 14/(1.98·2.5) ≈ 2.8.
   - Offer a named hero-scaled soft candidate with measured L%, or ask the owner explicitly to accept a SPEC deviation.
5. F4: the missing proxies.
6. F6: the W8 decision.
7. F8: occlusion coverage for the eventual pick.
8. N11: the missing subjective items.
9. **N13 NOTE — the build under review is not pinned.**
   - Pin the reviewed SHA (8b59a7b) in "How to run". The package names a branch and a worktree path only.
   - The committed copy and `~/Desktop/…/README.md` can diverge.
   - "A new tab starts fresh" holds, but Chrome's *Duplicate tab* copies `sessionStorage` and resumes (N6).
10. Item 5 depends on `w5/car-info-lines.md`, which is not in git. The ten lines COMPUTED from `hud.js:specLine` and `cars.js` are:

    | car | headline | factual line |
    |---|---|---|
    | lexus | A front-engined outlier built for long races | 5.4 L naturally aspirated V8, 90° · ≈540 hp · BoP |
    | nissan | The road-bred silhouette that crossed continents | 3.8 L twin-turbocharged V6, 60° · ≥550 hp · BoP |
    | audi | A customer-racing benchmark refined through endurance | 5.2 L naturally aspirated V10, 90° · Up to 585 hp · BoP |
    | bmw | Long-wheelbase composure for the endurance era | 4.4 L twin-turbocharged V8, 90° · Up to 585 hp · BoP |
    | mercedes | A large-capacity V8 shaped by endurance | 6.2 L naturally aspirated V8, 90° · ≈550 hp · BoP |
    | ferrari | Maranello's defining GT3 platform of the turbo era | 3.9 L twin-turbocharged V8, 90° · ≈600 hp · BoP |
    | mclaren | Carbon architecture translated into customer racing | 4.0 L twin-turbocharged V8, 90° · ≈500 hp · BoP |
    | aston | A front-engined Vantage for the global grid | 4.0 L twin-turbocharged V8, 90° · ≈535 hp · BoP |
    | lamborghini | The final Huracán evolution for GT3 racing | 5.2 L naturally aspirated V10, 90° · ≈570 hp · BoP |
    | porsche | The rear-engined reference, redrawn for 2023 | 4.2 L naturally aspirated flat-six · Up to 565 hp · BoP |

11. Add one line on how decisions are recorded: SPEC §30.9 entries removed, and the SPEC body updated.

## 8. Code-quality risks in the newest changes

- **N1 NOTE — the `cars.js` wheel classifier is fragile, but its result is currently correct.**
  - `isWheelMesh` (`cars.js:120-125`) accepts a mesh if any ancestor node **or any material** matches `/wheel|tyre|tire|rim/` without matching the exclusion list.
  - COMPUTED census:
    - **All 38 Nissan materials are named `EXT_Rim_Decals*`** (tour and full GLBs alike), so the whole Nissan body is treated as "wheel".
    - Mercedes `EXT_Wheelhouse` (a body arch) is also classed as wheel.
    - `rim` would also match names such as "trim" or "primitive".
  - COMPUTED: a node-ancestry-only classifier (excluding "wheelhouse") gives the **same Nissan pitch, −0.322°**. After levelling, no body vertex sits below the wheel contact in any of the 10 cars (0.00 cm).
  - So the fix is right today by coincidence for Nissan. Prefer node ancestry, and fall back to material names only when no wheel node exists.
- **N2 NOTE — undocumented spin change.** Adding `steering` to `NON_WHEEL_NAME` also changes `findWheels()` (spin set, `cars.js:487-497`; used at `main.js:346` and `morph.js`). COMPUTED: Aston and Ferrari have `LOD_A_STEERING_WHEEL_*` nodes, so their steering wheels no longer spin. This is a good fix, but it is undocumented and contradicts "7 others byte-identical" as a statement about behaviour.
- **N3 NOTE — Draco self-hosting.**
  - COMPUTED: `public/draco/gltf/*` is byte-identical to the installed three@0.180.0 decoder.
  - Risks:
    - `three: ^0.180.0` allows minor drift without re-copying the decoder.
    - The absolute `'/draco/gltf/'` path (`cars.js:20`) breaks under a non-root Vite `base`.

    Pin three, or copy the decoder from `node_modules` at build time.
- **N4 NOTE — `carWarmup.runFrame`.**
  - Correct: `deferProgress` is restored in `finally`; there is at least one step per frame; the abort/restore paths are intact.
  - Each step is a full `render(0)`, so a single heavy draw still overshoots the 12 ms budget.
  - The 40 s GPU timeout (`main.js:130`) degrades slower machines to cold crossings.
  - See F7 for `compileAsync`.
- **F9 SHOULD-FIX — refresh at the finish state is untested.**
  - `main.js:270-280` with `finishScreen.restoreFinishScreen()`: no harness covers it. `verify-route-persistence.mjs:202` asserts progress < 0.995.
  - REASONED, UNVERIFIED: after a refresh at ≥ 0.995 the start screen (z 30, still awaiting a scroll) stays visible under the finish card (z 40, `screens.css:14,231`), while scroll is locked by the finish screen. Replay still works.
  - Add a harness case, and decide whether the start screen should be dismissed on finish-restore.
- **N6 NOTE — session edge cases.** Besides the duplicate-tab case, `restoreAtProgress` (`checkpoints.js:99-104`) sets the route car without reconciling `unlocked` ⊇ {1..k}. This is invisible in Phase 3 (Showcase is unreachable) but matters in Phase 6.
- **N5 NOTE — bounded scroll modes.**
  - Thumb-hold detection uses `clientX >= clientWidth` (`scrollDrive.js:139-142`). That only detects classic scrollbars.
  - REASONED, UNVERIFIED: with macOS overlay scrollbars, a held but paused thumb drag can be re-synced under the pointer after 0.14 s.
  - Excess input being discarded is visible as the page "snapping back" after idle. Test both in the review.
- **N4b NOTE — `compositionRail`.**
  - The dense framing assertion runs only in dev (`compositionRail.js:298`). The review uses dev, so a dense-check failure shows the leg-1 fallback in review while production would ship the unchecked rail.
  - A failed aspect is retried after visiting another aspect (only successes are cached).
  - The solve blocks the main thread on every first-seen aspect, including mid-scroll.
  - Hold spans are hard-coded t-ranges (`:12`) and break silently if `trackCurve` changes.
  - The pose has no temporal filter: progress jitter is amplified up to about 3× (Cloud W2 review §5).
  - All of these are acceptable for review scaffolding. Clean them up when the owner locks a choice.
- **N10 NOTE — the "SPEC classification" gate (MASTER_CONTEXT Next 1)** has no recorded owner approval in git. Confirm it in the review session.

## Findings index

| ID | Sev | One line |
|---|---|---|
| F1 | SHOULD-FIX | The package's "baseline on every axis" hides ~10 default-on changes since the 09-28 review |
| F2 | SHOULD-FIX | Most browser evidence is at da67f54 (pre-wheel-fix), not the final head; post-fix pivot at hero scales is unrun |
| F3 | SHOULD-FIX | No cam candidate satisfies §15 "barely moves" + "never tiny"; default cam/scroll are not SPEC-compliant options; `&hero` is a DEV-only, unmeasured lever |
| F4 | SHOULD-FIX | Missing proxies: road coverage, hero widths (a = 2.83), reach .72; cap is flat 1/1/1; time between gates ≈6.4–8.5× at normal input; 55 m per-gesture cap |
| F5 | SHOULD-FIX | 10-04 owner decisions not in SPEC; "§27 line 514" mis-cited; SPEC §1/§30.6/§30.9 and ARCHITECTURE stale |
| F6 | SHOULD-FIX | W8 deferral never put to the owner |
| F7 | SHOULD-FIX | compileAsync/initTexture (proven in studio.js) untried before asking to accept 14.5 s; cam= startup unmeasured |
| F8 | SHOULD-FIX | Occlusion sweep only base, b/soft, b/wide; terrain depends on road width |
| F9 | SHOULD-FIX | Finish-state refresh path untested; start screen likely left under the finish card |
| F10 | SHOULD-FIX | Hitch evidence quoted by threshold, not distribution (SPEC §27); "every run" omits 8/9 |
| N1–N13 | NOTE | wheel classifier fragility; steering spin; Draco pin/path; warm-up budget/timeout; overlay scrollbar; session edges; number provenance; "(user decision)" wording; fonts; SPEC-classification gate; missing subjective items; harness "recommended" label; unpinned SHA (N4b is part of N4) |

No BLOCKER: every gap is about evidence, documentation or decision framing. The owner can still run the review today. Fixing F1–F4 and F6 first would make the decisions better informed.
