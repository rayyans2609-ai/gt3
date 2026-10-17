# P3u Stage 2 · W5 — asset loading, prewarm and transitions

Branch `p3u-w5` (base `ebad49e`). Owner: W5 (Sonnet High). Unlocked profile only; the locked/default path is byte-for-byte the same scheduler and loads the same files (see Verification).

**Read this first — what is and isn't measured.** The Mac's screen locked (`IOConsoleLocked=true`) during round 2 and stayed locked. After that, true-fullscreen headful runs would not enter fullscreen and every timed run (headful or headless) was throttled 4–10× (ready 8–32 s for a config that took 1.9–3.4 s earlier; 33 ms median frames). **All timing, memory and frame-pacing numbers below are from the round-1 headful true-fullscreen sessions (1470×919 @2×, render DPR 1.5, M4, AC power), taken before the lock.** They are single sessions, not repeats. Anything run after the lock is used only for deterministic facts (program/texture/geometry counts, which resources appear after readiness, texture census, pixel diffs). The selective/staged rows are in that second category and carry no timing.

## 1. Diagnosis

Boot (unlocked, Tour set) is download+decode ≈ 1.05 s, then a GPU warm-up. Measured on the unchanged `ebad49e` code (headful):

| | value |
|---|---|
| model ready → GPU ready (warm-up) | **2339 ms** (ready 3432 ms) |
| summed warm-up draw/step time (279 steps) | **758 ms** |
| remainder | ~1.58 s = waiting between steps |

So two thirds of the warm-up was scheduling, not GPU work: the accepted scheduler serialises *compile → 4 texture uploads/frame → draws* one car at a time, and `render(0)` pushes every warm-up draw through the whole post chain (SMAA, wash, grain…), although those programs are identical for every draw.

Gate-crossing/swap/finish hitches caused by loading or resource work: **none found in this profile.** Across four headful 65 s Tours (16 gates each, one Replay loop, all ten cars, 64 gate crossings) swap-window frames never exceeded 17.8 ms, there were no long tasks, `gt3:morphTo`/`morphFinish` cost ≤0.5 ms, and renderer programs/textures/geometries did not change after readiness (116 / 303 / 1501). The historical 83 ms / 116 ms frames in T1 high-DPR runs were not reproduced and are not loading-caused here; they stay with W6's sustained attribution. The existing "full prewarm before unlock" lifecycle is the thing keeping swaps clean, which is what decided the strategy below.

## 2. Options compared

Prewarm strategies (unlocked), each with both texture sets:

* **full** — all ten cars GPU-ready before input unlocks (today's lifecycle). Variants of *how fast*: `base` (existing scheduler), `ahead` (compile/upload ahead of the draws, 24 ms frame budget), `scene` (= `ahead` + warm draws render the scene pass only; the one composer control draw still creates the post-chain programs).
* **selective** — warm only previous/current/next car (and car 0, and the resume position); prepare the next cars from a calm-frame ticker after unlock, never during a swap or a gate approach (`src/scene/carWarmBackground.js`, `?prewarm=selective`).
* **staged** — same start window, then all remaining cars nearest-first (`?prewarm=staged`).

### 2a. Headful measurements (valid, single sessions)

Tour = `/models/tour` (≤512 px), Full = `/models` (≤1024 px). "footprint" = macOS `footprint -p <GPU process>` after ready. Swap window = ±500 ms around each morph.

| textureSet | warm-up scheduler | ready | warm-up | GPU footprint | JS heap | swap-window RAF p99 / max | >25 ms | programs / textures / geometries after ready (end of Tour) |
|---|---|---|---|---|---|---|---|---|
| Tour | base (`ebad49e`) | 3432 ms | 2339 ms | 1361 MB | 184 MB | 17.6 / 17.8 ms | 0 | 116 / 303 / 1501 (unchanged) |
| Tour | ahead | 2850 ms (2854 repeat) | 1745 ms | 1374 MB | 193 MB | 17.6 / 17.8 ms | 0 | unchanged |
| Tour | scene (startup only, no Tour) | **1894 ms** | **816 ms** | 1375 MB | 193 MB | — | — | 116 / 303 / 1501 at ready |
| Full | base | 3939 ms | 2770 ms | 1923 MB | 201 MB | 17.6 / 17.7 ms | 0 | unchanged |
| Full | ahead | 3243 ms | 2042 ms | 1899 MB | 258 MB¹ | 17.5 / 17.7 ms | 0 | unchanged |

¹ heap read is the post-ready value in a session whose decoded roster had not yet been collected (it fell to 187 MB by Tour end, max 281 MB); treat the heap column as ±50 MB noise. The 1894 ms "scene" row is the unlocked default now implemented; its Tour is not available headful (lock), see 2c.

Batch/draw variants (startup only, Tour set, headful): `warmbatch=48` 2005 ms and `=1000` 1929 ms gave **115 programs, not 116** (one car program is not created with large per-draw mesh batches — an uncreated program is a swap hitch waiting to happen), so the batch stays at 12. `scene`-only at batch 12: 116 programs with the same names; `scene`+48 / +1000: 1850 ms but 115 programs. Rejected for that reason.

### 2b. Selective / staged (deterministic facts only; the run was contended, headless, 65 s Tour)

| | at ready | after ready | outcome |
|---|---|---|---|
| selective | programs 63, textures 112, geometries 581; 2 cars warmed | 23 growth events during the Tour (programs +1…+6, geometries +21, textures +1…+2 each) | cars 5–8 were still unprepared when the Tour reached them in this run; largest single background step **128.7 ms CPU** |
| staged | programs 70, textures 119, geometries 754; 2 cars warmed | 79 growth events | all but car 9 ready by the end; largest single background step **63 ms CPU** |

Median background step is 0.7 ms, but first-use steps (geometry buffers, pipeline state for a car's first draw) are 30–130 ms and cannot be subdivided: they are one-draw costs. Under contention the calm-frame gate (`dt < 20 ms`) also starved selective, so those timings overstate the problem; the structural point does not depend on timing: both strategies create programs/textures/geometry after readiness, mid-lap.

### 2c. What is verified for the chosen configuration (deterministic, post-lock)

`scene` default, headless, 65 s Tour (all ten cars, finish, one Replay loop): programs/textures/geometries 116 / 303 / 1501 before and after, **zero growth events**; identical program-name set to base. Also zero growth at Night, Night with `tone=split&refl=mid`, and `textures=full&aniso=8` (the last two covered 8–9 gates, not the whole lap, because of the contention). The timing of the `scene` Tour (swap-window frames) was **not** obtained headful.

## 3. Decision

**Unlocked default: full prewarm, scheduled ahead, scene-only warm draws.** `selective` and `staged` are kept only as opt-in review modes (`?prewarm=`), not adopted.

Why:
1. The brief's hard constraint — zero new programs/textures after readiness — and SPEC §27 ("warming must not create a new hitch earlier in the lap"; "dispose or stream only when measured memory pressure requires it") rule out selective/staged as the default: they necessarily create programs, geometry and textures mid-lap, and a car's first-use cost is a 30–130 ms single step that cannot be spread.
2. Full prewarm already gave clean swaps for both texture sets, so the only thing selective/staged could buy is startup time and early memory, and `scene` buys back most of that while keeping everything resident before unlock: ready 3432 → 1894 ms (−1.54 s, −45 %) for the Tour set with an identical program set.
3. Memory is not under pressure in either texture set (GPU footprint 1.37 GB / 1.9 GB, all resident either way once the lap is driven), so a streaming window isn't justified by evidence.

Both texture sets use the same strategy: the extra +0.4–0.5 s that `full` costs at startup is smaller than the 1.5 s `scene` saves.

## 4. Implementation

* `src/scene/cars.js` — `SETTINGS.textureSet` (`'tour'`|`'full'`) picks `/models/tour/` vs `/models/` (absolute `modelFile` paths untouched); `SETTINGS.anisotropy` (≥1) is applied to every distinct texture of each car right after load, before the first upload (three clamps to the device max, 16 on this M4). Absent keys ⇒ Tour set, anisotropy untouched ⇒ exact locked behaviour. Review overrides, **unlocked only**: `?textures=tour|full`, `?aniso=1..16`. `renderProfile.js` values untouched.
* `src/scene/carWarmup.js` — gated by `UNLOCKED`; the locked scheduler (`prepare()`, 12 ms frame budget) is unchanged. Unlocked: `prepareAhead()` issues `compileAsync` for the next four cars' normal + cached-fade programs and uploads textures for the next three cars, bounded by a 24 ms frame budget; warm draws render the scene pass into `composer.readBuffer` (same target as the live RenderPass) instead of the whole chain; the final `full-scene-control` draw still runs the whole composer. `createCarWarmup(..., { indices })` can restrict the warmed cars (used only by the review modes). `?warmdraw=composer` restores whole-chain draws for A/B.
* `src/scene/carWarmBackground.js` (new, unlocked review modes only) — `?prewarm=selective|staged`. Default (`full`) never constructs it. Frame loop hook in `src/main.js` is inert in the default mode.
* `src/main.js` — the hooks above; `readiness.warmupCars` records `'all'` or the subset.
* `scripts/check-car-warmup.mjs` — baseline moved to `ebad49e`, fixture gets the `SETTINGS`/`UNLOCKED`/`prepareCarEnvironment` globals that `carWarmup.js` gained after the check was written (it was throwing `ReferenceError`), and a new assertion that the locked op sequence/timing is identical to the baseline.
* `scripts/p3u-w5-measure.mjs` — the measurement harness (startup marks, process census with optional `footprint`, per-frame resource counters, swap-window split).

## 5. Verification

* **23-state locked diff vs the reference** (`p3u-ref` `fa12e92` on 5237 vs this worktree on 5234, `GT3_STATES=all`): **23/23 identical, 0 differing pixels, max channel delta 0** (`local/evidence/p3u/w5/locked/diff.json`).
* **Locked loading path unchanged:** locked startup on `ebad49e` vs this branch has the same 279 warm-up steps in the same phase order, same 12 requested model/Draco resources, same program names (113), textures (302) and geometries (1501) at ready. `check-car-warmup.mjs` asserts locked `operations` equal to the baseline's before it reaches its (separate) failure below. Locked never imports `carWarmBackground.js`, never reads the review params, and `SETTINGS.textureSet/anisotropy` are absent.
* `npm run build` passes.
* Zero resource growth after readiness: see 2c.
* Not passing: `node scripts/check-car-warmup.mjs` stops at the `extension:false` fixture with "unit started past frame budget". This fails identically with the **unmodified** `ebad49e` `carWarmup.js`, so it predates this work (the check had been failing at HEAD earlier, with a `ReferenceError`); I did not touch the locked scheduler to make it pass. The equality assertion that guards the locked path runs, and passes, before that point.

## 6. Remaining uncertainty

* **No headful Tour of the `scene` default, and no headful selective/staged timing** — blocked by the locked screen. Needed: one headful 65 s Tour of `?version=unlocked` (expect swap max ≈17.8 ms like the other rows), repeated twice, plus a repeat of `base` vs `scene` startup to put a spread on 3.43 → 1.89 s (currently one session each).
* The ahead→scene saving comes from skipping the post chain in warm draws. Equality of the program set (116 names, 0 growth over a full lap, Day and Night, two tone configurations) is the evidence that nothing is lost; a program that only exists under an unexercised combination would only show as a first-use hitch.
* Memory is process-level `footprint`/RSS; per-texture GPU residency isn't available. The +529 MB (footprint, IOAccelerator) matches the +529.0 MiB computed from decoded RGBA8+mips (288.9 → 817.9 MiB).
* GT3 Night with the Full set was not measured headful.
* The `carRig.js` canvas decal (336×256) keeps anisotropy 1; it is not part of the roster textures and `carRig.js` isn't mine.

## 7. Cost data for W3's `textureSet` / `anisotropy` decision

| | Tour (≤512 px) | Full (≤1024 px) | Δ |
|---|---|---|---|
| ten GLBs transferred | 21.0 MB | 27.6 MB | +6.6 MB |
| decoded RGBA8 + mips (291 distinct roster textures) | 288.9 MiB | 817.9 MiB | **+529 MiB** |
| GPU process footprint at ready (headful) | 1361–1375 MB | 1899–1923 MB | **+524–562 MB** (IOAccelerator 961 → 1490 MB) |
| startup, base scheduler | 3432 ms | 3939 ms | +507 ms |
| startup, ahead scheduler | 2850 ms | 3243 ms | +393 ms |
| JS heap at ready | 184–193 MB | 201–258 MB | within noise (see ¹) |
| swap-window frames at DPR 1.5 (64 gate crossings) | max 17.8 ms | max 17.7 ms | none measurable; zero >25 ms |
| programs / textures after ready | 116 / 303 | 116 / 303 | none |

Anisotropy: `SETTINGS.anisotropy` = N sets a sampler parameter on 290 of 291 roster textures; it adds **no texture memory** and no programs. Its cost is GPU sampling time on oblique car surfaces, which I did not measure (no stable GPU timing after the lock); T1's DPR 2 steady full-set + 8× figure (11.93 ms median / 13.18 p95 GPU) is in AUDIT row 4. Device max here is 16, so any value ≤16 is honoured. Because the car is only ~75 CSS px on screen, expect the visible effect to be small.

The `scene` scheduler removes more startup cost than `full` adds (−1.54 s vs +0.4–0.5 s), so choosing `textureSet: 'full'` is net-faster than today's Tour start; the price is ~0.53 GB more GPU memory on a machine with no observed pressure. This is my reading of the data; the decision is W3's.

## 8. Housekeeping

* Round 1 created two detached worktrees without being asked: `.claude/worktrees/p3u-w5-snap` (pristine `ebad49e`, used as the A/B baseline so the measurement could run while I kept editing `p3u-w5`) and `.claude/worktrees/p3u-w5-dev` (a rsync copy of my working tree at `src/` + `scripts/`, so a measurement ran a fixed snapshot while I edited). Round 2 created none and used `p3u-w5` and `-snap` only; both can be removed.
* No background loops left; all round-2 runs were foreground.
* Raw evidence: `local/evidence/p3u/w5/` (git-ignored). Headless/post-lock reports are prefixed `hl-`, `st-`, `lk-`; the valid headful reports are `base-tour-unl`, `ahead2-tour`, `ahead-tour-unl`, `base-full`, `ahead-full`, `var-*`.
