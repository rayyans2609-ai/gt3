# Cloud Opus independent W2 review: camera range of `p3-w2-composition`

Advisory only. Reviewer: independent cloud session, with no browser, GPU or Vite.
Labels: **COMPUTED** means I ran it in Node here. **REASONED** means it comes from code or maths. **UNVERIFIED** means it needs a real browser.
Nothing in this report claims a visual, perceptual or GPU observation. No product winner is chosen.

## 0. Provenance and method

- `git fetch origin p3-w2-composition && git checkout -B review origin/p3-w2-composition` gave HEAD
  **`40e116e33d32babebc154e8d999e408448d9d848`**, the expected commit. All analysis is of this SHA.
- `npm ci --ignore-scripts` installed three@0.180. The GLB roster is present in `public/models/tour/`.
- **COMPUTED reproduction.** `node scripts/check-composition-math.mjs b <aspect> <cam>` was run for
  b/hold, b/wide and b/glide at 16:9, b/hold at 4:3, and base. Every output is byte-identical to the committed
  `docs/review/w2-leg2/*.json`, once `railInitMs` is excluded. The harness is deterministic on this machine.
  `railInitMs` here was 435 ms (glide), 507–522 ms (hold, wide, 4:3) and 0.9–1.06 s wall time per process. This
  is consistent with the colleague's 500–730 ms.
- **COMPUTED experiments.** I wrote scratch scripts outside the repo, in the session scratchpad; they are not committed.
  They are a parametric copy of `src/scene/compositionRail.js` (`framingPlanes`, `clipPolygon`, `nearest`, the
  FISTA loop and the spline), with the camera configuration passed in.
  - The copy is validated: it reproduces b/hold peak speed, acceleration and jerk **233.52 / 412.33 / 4248.21** and b/glide
    **48.64 / 13.07 / 3.35** exactly.
  - The scratch H/C ratios use the camera-target ground path divided by the 3D centreline car path. They differ by
    about 0.02 from the README's 3D racing-line ratios: b/glide is 0.78/0.89 here and 0.806/0.895 there.
  - Unless stated, all runs use comp **b** (hero 1.9, framing radius 9.216 m), 16:9, yaw 75° and pitch 52°.
  - Speeds use the README's spatial proxy at a declared 50 m/s route speed. They are not scroll timings.
- **Colleague's notes, checked:**
  - Framing-tube attribution: **agree (REASONED)**. `aerialCamera.js:265-297` (leg-1 sector rail) has no
    terrain term. The corridor rail `compositionRail.js:35-49` likewise has only lens, zone and radius terms.
  - Leg 1 is not a pure function of t: **agree (REASONED)**. `sectorUpdate` lerps `basePosition` with damping
    (`aerialCamera.js:394-398`). `sectorFraming` keeps hysteresis state `engaged` and a lerped `correction`
    (`:346-369`).
  - The **0.52/0.57 leg-1 lower bound was not re-derived** by me.
  - Glide at about 300 m holds both corners: **confirmed (COMPUTED)**. With glide's zone .74/.72, FOV 40, the minimum
    stationary distance is H 228.9 m, C 293.7 m and H+C 520.8 m. So 240–280 m holds only H.
  - Hold anchors 335 m apart against a 223 m polygon gap: **confirmed (COMPUTED)**. Centroid gap 334.9 m, closest-pair gap
    222.9 m at 320 m, so a strict hold forces at least 1.71× the car's 130.0 m inter-corner travel.

## 4. Smallest correct solution

### 4.1 The binding constraint is frame width at the target, not lens, height or terrain (COMPUTED)

The test was a binary search for the minimum stationary distance that frames each guarded span. It used rail slack 0.025 NDC,
a 10 m guard and zone .76/.74. From that distance the script derived the frame width at the target, W = 2·d·tan(FOV/2)·aspect.
It also derived the upper bound on hero length as a share of frame width, L% ≤ 8.74 m / W, with the car aligned to the frame width.

| pitch | FOV | H: d / W / L%≤ | C: d / W / L%≤ | H+C: d / W / L%≤ |
|---|---|---|---|---|
| 45 | 20–60 | 453–127 / 284–261 / 3.07–3.34 | 551–143 / 345–294 / 2.53–2.97 | 1040–281 / 652–576 / 1.34–1.52 |
| 52 | 20 | 459 / 288 / 3.04 | 608 / 381 / 2.29 | 1057 / 663 / 1.32 |
| 52 | 40 | 223 / 288 / 3.04 | 285 / 369 / 2.37 | 506 / 655 / 1.33 |
| 52 | 60 | 137 / 282 / 3.10 | 169 / 346 / 2.53 | 307 / 630 / 1.39 |
| 60 | 40 | 227 / 294 / 2.97 | 315 / 408 / 2.14 | 550 / 712 / 1.23 |

What the table shows:

- **Telephoto from greater height cannot raise hero prominence during a hold.** It only trades distance for FOV at an
  almost constant W.
- **Dolly-zoom FOV compensation cannot help either.** Constant on-screen car size means constant W, and W is what the
  hold needs. Distance-linked FOV is not literally the forbidden "speed-linked FOV pumping" (`SPEC.md:316`). However, the
  visible perspective warp contradicts "calm, spatially established" and the fixed observation point (`SPEC.md:293`,
  `:323`). Not recommended.
- **Hero scale is the only lever on L%.** Hero 1.9 → 2.5 → 3.0 gives an H-hold L% ≤ 3.04 → 3.91 → 4.61. The minimum
  distance moves only from 223 m to 231 m. The cost is road-to-hero ratio and racing-line room (`composition.js:72-74`). For
  reference, leg-1 projected L% was 4.89–6.55 for b.
- **Yaw sweep, 0–165° in 15° steps.** The best fixed yaw for H+C is 15°, at 464 m against 506 m at 75°. That is about 8%,
  at the cost of the authored world view. Per-sector yaw changes buy at most about 10% on corner holds and spend the
  SPEC's "heading fixed where possible" budget. This is a low-value lever.
- **World enlargement buys nothing on this axis.** No term in the framing inequalities involves terrain. The ground hits
  stay inside the existing terrain in every committed row.

### 4.2 Anchor placement: a free improvement (COMPUTED)

Hold anchors are polygon centroids (`compositionRail.js:134-137`). Holds stay strict, at the 320/40 lens, b, 16:9:

| anchor policy | anchor gap m | peak cam m/s | peak acc m/s² | peak jerk m/s³ |
|---|---:|---:|---:|---:|
| centroid (as built) | 335 | 233.5 | 412 | 4248 |
| 50% from closest-pair toward centroid | 279 | 194.5 | 343 | 3538 |
| 25% … | 251 | 174.9 | 309 | 3184 |
| closest pair | 223 | 155.4 | 274 | 2829 |
| closest pair, d = 360 | 175 | 121.8 | 215 | 2217 |
| closest pair, d = 400 | 126 (< car's 130) | REASONED ≈ car speed | – | – |

- Every row keeps H/C ratio 0 and positive plane slack. The worst plane residual is −2.4 to −2.8 m, which is inside the
  zone.
- The code comment at `:134-135` says closest boundary points force acceleration just outside the hold. The table shows
  peak speed, acceleration and jerk all *fall* with closer anchors at this lens. The comment's premise does not hold here.
- **Critical cliff (COMPUTED).** `wide` loses its H+C intersection below aspect **1.616** for b (a 1.570, c 1.595).
  That makes **16:10 (1.6) fall back** to two centroid anchors 337 m apart, at **235 m/s peak**, the same as hold. Yet the
  closest-pair gap at 16:10 is only **4.5 m**. Two consequences follow:
  - A small window resize across about 1.6 switches between the calmest and the harshest motion.
  - The README's "4:3 fallback" understates this: common 16:10 laptop viewports are in it.

### 4.3 Eased partial holds: the most promising unexplored path (COMPUTED)

The method was to replace the hard lock with a weighted first-difference (speed) term:
α·Σ w_e·|y_{i+1} − y_i|² + Σ|D2 y|², with α = 0.05. Here w = w_C inside the spans, raised-cosine eased over 40 m outside
them, and 1 elsewhere. Corridors are unchanged and every result stays inside the zone.

| lens | w_C | H / C ratio | peak m/s | acc m/s² | jerk m/s³ |
|---|---:|---|---:|---:|---:|
| 320/40 | 3 | .33 / .38 | 52.3 | 33 | 77 |
| 320/40 | 10 | .22 / .26 | 81.9 | 104 | 250 |
| 360/40 | 10 | .18 / .20 | 66.1 | 84 | 202 |
| 400/40 | 10 | .14 / .16 | 54.9 | 64 | 155 |
| 400/40 | 30 | .09 / .09 | 83.8 | 135 | 364 |
| glide as built 240/40 | – | .78 / .89 | 48.6 | 13 | 3.4 |
| hold as built 320/40 | ∞ | 0 / 0 | 233.5 | 412 | 4248 |

- This yields a **continuous trade-off frontier** between corner stillness and inter-corner pan speed. The current
  candidates are only its two extremes.
- Example: 400/40 with w_C = 10 keeps the camera at about 15% of car motion through both corners, with peak pan
  ≈ 1.1× route speed. Hero L% ≤ 1.7, or about 2.0 if the hero is raised to 2.3.
- Hard holds need a guarded polygon. The soft form needs no feasibility branch, so the 4:3 / 16:10 fallback cliff
  disappears and degradation becomes gradual.
- **Plain "minimum motion" is not enough.** Uniform w (w_C = 1) at 320 gives H/C .69/.87, because squared speed
  spreads motion evenly in t. The corner weighting is what produces stillness.

### 4.4 Recommendation on the approach (REASONED)

- **Smallest correct change:** keep the corridor architecture (it is sound) and change only the path *objective*:
  - add a seed-tether term (see §6.1);
  - add a corner-weighted speed term;
  - choose anchors by optimisation rather than by centroid.
- Camera maths beyond that, such as FOV, yaw or dolly, buys at most about 10%.
- Enlarging the world buys 0.
- A single H+C anchor is sound only at d ≳ 506 m (FOV 40) or 409 m (FOV 48), with L% ≤ 1.33–1.35 for b. That is the
  hero-prominence risk the README already flags. It needs a hero increase to be acceptable.

## 5. Risks and failure modes

- **Hero prominence: all strict holds (COMPUTED bound, UNVERIFIED perception).** A corner hold caps b at about 3.0% of
  frame width (H) or 2.4% (C). Holding H and C together caps it at 1.3%. At 1600 px wide that is about 48, 38 and 21 px of
  car length. Leg 1 was about 78–105 px. Only hero scale moves this (§4.1).
- **Pan speed and jerk.** Measured values:
  - hold and `wide` at 16:10 or below: 233–235 m/s, about 4.7× route speed (COMPUTED);
  - wide at 16:9: 95 m/s;
  - glide: about 49 m/s.

  `corridorUpdate` has no temporal filtering (`aerialCamera.js:188-199`). Pose is a pure function of `state.progress`, so any
  scroll-progress jitter or step is amplified by the local camera/route gain: up to about 4.7× in hold's transfer.
  (REASONED; real scroll feel is UNVERIFIED.)
- **Aspect cliffs (COMPUTED).** These are the minimum aspects that keep each guarded hold, for b (a and c are within ±0.06):

  | camera | H | C | H+C |
  |---|---:|---:|---:|
  | hold | 1.137 | 1.370 | – |
  | wide | ≤ 0.8 | ≤ 0.8 | 1.616 |

  Crossing one of these silently changes the motion character. `unavailableHolds` reports it, but the label does not.
  Per-sample corridors themselves stay non-empty down to aspect 0.10–0.13, so the throw at `compositionRail.js:73` is
  unreachable on desktop.
- **Resize cost (COMPUTED in Node, UNVERIFIED in browser).** A rebuild takes 435–590 ms and runs synchronously inside the
  frame (`aerialCamera.js:175-180`). It is debounced 60 ms (`main.js:46-51`), so expect one hitch per settled resize,
  not one per frame.
  - The dev override `?dist=<47` (min 30) at 16:9 empties some per-sample corridors. Then `nearest()` throws, and
    because `compositionRail` stays undefined, it re-throws, after a full rebuild, on **every frame**. This is dev only (COMPUTED threshold 46–47 m).
- **Seam and reversal (REASONED, consistent with the README's computed 0 m).**
  - The periodic B-spline and pure-t pose make both exact.
  - Inside a strict hold, spline support is constant (2-sample halo, `:124`).
  - Soft holds keep this property.
- **Shadow (REASONED, UNVERIFIED).** The shadow box is ±120 m around the car (`sceneSetup.js:48`,
  `composition.js:77`), against a frame width at the target of 311 / 414 / 697 m for glide / hold / wide. The box covers
  77 / 58 / 34% of the frame width. In a *stationary* hold the shadow-casting window slides across a still frame with
  the car. That is likely more conspicuous than under a following camera.
- **Fog (COMPUTED flat-ground ray model).** The top-corner ground hits are 418 / 557 / 911 m, against fog near
  467 / 622 / 856 m. So glide and hold show no fog on flat ground, and wide just reaches fog near in its top corners.
  Fog far exceeds camera far (3000 m) for hold and wide, but no ground ray reaches far at pitch 52°. Relief and sky joins
  remain UNVERIFIED.
- **Proposals' own risks.**
  - Soft holds keep some corner motion (about 10–35%). Whether that reads as "barely moves" is a user call.
  - Closest-pair anchors put the car nearer the zone edge at hold boundaries. This is still inside the 0.025-slack zone
    (COMPUTED), but entry and exit framing must be eyeballed.
  - A larger hero changes road-width readings and racing-line amplitude (`composition.js:72-74`), and gate/post clearance
    must be re-run.

## 6. Correctness review: `compositionRail.js` and the corridor path

### 6.1 Defect (COMPUTED, highest priority): the solver's objective is not strictly convex, so the rail is not converged and not unique

- Σ|D2 y|² is invariant to rigid translation, and its lowest cyclic modes have eigenvalue ≈ (2π/1024)⁴ ≈ 1.4e−9.
  Inside wide corridors the band therefore keeps drifting.
- Comparing the as-built tables:
  - 6000 vs 20000 iterations differ by up to **45.9 m (glide)** and **99.8 m (hold)**, with more than 10 m of drift at
    54–63% of samples;
  - 20000 vs 60000 iterations still differ by 89 m and 128 m.
- So the shipped rail is effectively "seed plus 6000 drift steps". The iteration count (`:161`) is a hidden composition
  parameter, and the glide smoothness numbers depend on it. At 20000 iterations glide is 52.2 / 8.0 / 2.1 against
  48.6 / 13.1 / 3.4 at 6000.
- The README's "finite-iteration, not a certificate" understates this. Hold *metrics* barely move because anchors
  dominate them, but its off-corner rail does move.
- **Fix:** add a seed tether β·|y − seed|².
  - With β = 1e-4, 6k vs 20k differs by ≤ 0.2 m. With β = 1e-3, convergence takes 1500 iterations (175 ms against
    527 ms), with identical metrics at 6000.
  - Converged glide at β = 1e-3 is less smooth (H .89, acc 31.8, jerk 138), so β must be tuned and the diagnostics
    re-run.
  - Better still, add a stopping tolerance and adaptive restart, or solve the banded QP directly.

### 6.2 Other findings

- **Centroid anchor policy (`:134-137`, `:147`).**
  - COMPUTED: it inflates inter-corner pan by 1.50× (335 vs 223 m) at 16:9 hold. At 16:10 wide it inflates a 4.5 m gap
    to 337 m.
  - The rationale comment is contradicted by the measurements in §4.2.
- **Binary complex hold (`:142-153`).** It is all or nothing: if H+C is infeasible by 1 cm, behaviour flips to two
  centroids. This causes the aspect cliff in §5.
- **Throw in the render loop (`:73`, `aerialCamera.js:175-176`).** It is not caught. Because a failed build leaves the rail
  undefined, the rebuild-and-throw repeats every frame.
  - Fix: catch the throw, keep the last good rail or fall back to the leg-1 camera, and record it in `aerial.rail`.
  - Practical reach today: dev `?dist` < 47 only.
- **Discrete constraints with slack.** Corridors use centreline samples at 4.9 m spacing plus 0.025 NDC slack (`:111-112`).
  - COMPUTED: the worst residual on 4096 dense samples, at the true zone, stays negative (−1.8 m glide to −4.0 m wide).
  - No hole is found, but the slack is empirical. Assert it at build time, not only in the harness.
- **Hard-coded `CORNER_SPANS` (`:11`).** These spans silently go stale if the track changes. Derive them from curvature, or
  assert the measured heading sweeps at load in dev.
- **Diagnostic inconsistency.** The harness feasibility uses a `targetY` from the mean of `controlPoints`
  (`scripts/check-composition-math.mjs:212-213`). The rail uses the mean of 1024 samples (`compositionRail.js:110`). The
  reported minimum distances therefore sit on a slightly different plane from the rail's.
- **Cost (COMPUTED 435–590 ms).**
  - Each of the 6000 iterations allocates two `Float64Array(1024)` and runs about 1024 `nearest()` calls, each building
    small arrays.
  - With β and a stopping criterion: about 175 ms. With precomputed in-polygon flags and reused buffers: lower still. A
    Worker, or a cached table per aspect bucket, removes the resize hitch.
- **Determinism.**
  - REASONED: within one engine the build is deterministic, as the identical JSON reruns show.
  - Across engines, `Math.exp`/`sin`/`cos` may differ by an ULP. FISTA differences then stay tiny, but because the problem
    is non-converged and non-unique, they are not damped either. The β fix makes the result well-posed.
  - Spline wrap at t → 1⁻/0 is safe (`:182`).
- **No-query base path (REASONED, COMPUTED).**
  - `CORRIDOR` is a module-constant false (`aerialCamera.js:171`), and the new branches return before any legacy code.
    Importing `compositionRail.js` does no work at module load.
  - `railPoseAt` now calls `routePose` for legacy (`:406-413`). This overwrites shared scratch vectors, but `update()`
    recomputes them before use, so it is safe.
  - My base run reproduces `base.json` exactly. I did not re-run the 1800-sample comparison against `0967653`.
- **Minor.** `aerial.carNdc` is not updated in corridor mode, so it is stale for any consumer. `instantSeek`
  (`aerialCamera.js:189`) only increments a counter.

## 7. Recommendations for the local engineer, ranked

1. **Make the solver well-posed.** Add β ≈ 1e-4 to 1e-3 seed tether, a convergence stop, and restart. Re-run the 13+
   JSON rows.
   - Expected effect: tables become iteration-independent (≤ 0.2 m), and build time drops to roughly 175–300 ms.
   - Glide's acc/jerk figures will change, possibly upward. Report the change honestly.
2. **Replace centroid anchors with optimised placement.** Use closest-pair, or let the objective place them (§4.3).
   - Expected effect: hold peak drops from 233 to about 155 m/s (acc 412 → 274, jerk 4248 → 2829), and wide at 16:10
     drops from 235 to about 95 m/s or less.
   - Re-check entry and exit framing.
3. **Prototype `?cam=soft`.** Use the corner-weighted speed term with eased weights, no hard locks, at about 360–400 m /
   FOV 40, with w_C around 10.
   - Expected effect: H/C 0.14–0.20, peak about 55–66 m/s, no aspect cliff.
   - This is the first candidate that is neither a follower nor a 4.7× pan.
4. **Make hero scale an explicit axis of the review matrix.** Try hero 2.3–3.0 with the wider cameras: L% rises
   roughly in proportion to hero.
   - Re-run road-edge and gate/post clearance and the racing-line amplitude.
5. **Handle the aspect thresholds.**
   - Either use soft holds (item 3), or show `unavailableHolds` in the dev label.
   - Test 16:10 and 1.5 explicitly, not only 16:9 and 4:3.
6. **Guard the build.** Wrap the rail build in try/catch with a fallback, and assert the dense-sample zone residual at
   build in dev.
7. **Shadow window.** Centre the shadow camera on the rail target and size it to the frame footprint, instead of ±120 m on
   the car. Compare texel density at 2048: about 0.25 m/texel over 500 m.
   - Defer this until a camera is chosen. It is render-side and needs an A/B.

**Must be verified in a real browser:**

- Perceived hero prominence at 1.3–3% L.
- Whether hold transfers and soft-hold residual motion read as calm.
- Scroll-jitter amplification with no filter.
- The rebuild hitch on a resize across the 1.6 threshold.
- The shadow window sliding inside a still frame.
- Fog and relief edges in the top corners of `wide`.
- Occlusion, and road-ribbon legibility at 3–7% coverage.
- Day/Night.

**Technically sound enough to show the user now:**

- `glide`, any comp: smooth, framed and seam-safe, though a corner follower.
- `wide` at 16:9 or wider only.

`hold` as built, and `wide` below aspect 1.616, carry a computed 4.7× pan that comes from the formulation, not from
geometry alone. I would show them only as the extreme of the trade-off, after item 2.
