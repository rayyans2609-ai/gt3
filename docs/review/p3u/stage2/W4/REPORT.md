# W4 — Image integrity (P3u Stage 2)

Branch `p3u-w4` on `ebad49e`. Scope: the unlocked chain only (`?version=unlocked`, smooth DPR1.5 / quality DPR2). Locked is unchanged; see Verification.

## Decision summary

| # | Defect | Cause class | Verdict |
|---|---|---|---|
| D1 | **Shimmer at rest** on the car's body lines and curb/barrier edges: animated grain fed into SMAA | post order (shader) | **Fixed.** Rest flicker 138 → 0 (smooth), 130 → 0 (quality); now equals locked |
| D2 | Extra edge flicker in slow motion from the same cause | post order | **Fixed** with D1: Night creep −50 % (smooth) / −40 % (quality), grid −25 % / −11 % |
| D3 | Crawling edges on thin, high-contrast features in motion (curb stripes, 0.25 m edge lines, barrier tops, gantry lattice, catch fence) | resolution / geometric aliasing | **Not fixed here.** DPR1.5 already halves locked's rate. Further gain needs stronger AA (W3), see Requests |
| D4 | Grain scale vs DPR (H3): finer and stronger in device pixels than locked | resolution × post | **Owner choice**, not changed. A review option is provided |
| — | Banding, clipping, z-fighting, motion-blur stepping, road faceting | — | Measured; **no defect worth fixing** (below) |

No owner-visible change by default: D1 leaves still frames identical except on AA edges (≈0.05 % of pixels, mean code shift ≤0.003).

## Method

`scripts/p3u-w4-integrity.mjs` + `scripts/lib/p3u-w4-page.js` drive the **production frame path** (`carRig`/`aerialCamera`/`updateScene`, fixed dt 1/60, seeded `Math.random`, frozen RAF as in `p3u-capture.mjs`) and read the drawing buffer each frame:
- **Pans**: 10 settle + 36 recorded frames per scenario. *creep* = speed 0.01 (≈ 1 backing px/frame), *cruise* = 0.3, *rest* = 0. Route sections: T1 (t .123, Day + Night), catch fence/grandstand (.628), hairpin (.272), start grid/gantry (.995).
- **Flicker metric**: per-pixel luma *reversal* of ≥8 codes across consecutive frames (strong = ≥24). Smooth motion of band-limited content changes a pixel monotonically; aliased features pop on and off. Reported per frame per megapixel, plus a heat map.
- **Grain range**: at a frozen pose, 8 grain seeds. Grain + dither alone stay ≤ ~5 codes, so pixels ranging >6 codes are grain-induced AA changes.
- **Blur study**: production 8-tap radial blur vs a 64-tap reference vs 8 taps with interleaved-gradient jitter, at the maximum blur strength.
- **Tonal**: `scripts/p3u-w4-tonal.mjs`, giving clipping, pure black, near-black, and a banding proxy (longest identical-RGB run inside smooth zones).
- Sheets: `scripts/p3u-w4-sheets.mjs`, all panels resampled to device pixels (what a 2× panel shows).

Runs (local, under `local/evidence/p3u/w4/`, behind `with-verification-server.sh`, port 5233, provenance beside each log):
- `r2/`: frozen grain clock, all 7 pans, grain range, blur study. Configs: locked, smooth-off, smooth, smooth-css, quality-off, quality (`-off` = `&integrity=off` = Stage 1 chain).
- `r2-live/`: **live production grain clock**, rest + 4 creep pans, same configs minus smooth-css.

All numbers: [`metrics.json`](metrics.json).

## D1/D2 — grain and dither ahead of SMAA (fixed)

**Diagnosis.** Stage 1 fused tone → sRGB → vignette → **grain → dither** into one pass placed **before** SMAA. Each frame draws a new grain seed (±0.009 ≈ ±2.3 codes). SMAA's colour-edge test (threshold 0.1 with local-contrast adaptation) sees that noise, so edges near the threshold change their blend weights every frame, even with the camera still. Locked never had this: its wash (grain) runs after SMAA.

| Grain range, pixels >6 codes (static pose, 8 seeds) | T1 Day | T1 Night | Fence Day |
|---|---|---|---|
| locked | 0 | 0 | 0 |
| smooth, Stage 1 | 4,206 (0.13 %) | 3,912 | 3,042 |
| **smooth, W4** | **0** | **0** | **0** |
| quality, Stage 1 | 6,218 (0.11 %) | 6,159 | 4,581 |
| **quality, W4** | **0** | **0** | **0** |

Maps: [before](grain-range-before.png) and [after](grain-range-after.png) (red = >6 codes; grey = grain/dither only). Churn sits on the car's body lines and the curb and barrier edges, where the eye rests.

**Motion (live grain clock), flicker events / frame / MP:**

| Scenario | locked | smooth S1 → **W4** | quality S1 → **W4** |
|---|---|---|---|
| T1 **rest** | 0 | 138.1 → **0** | 129.5 → **0** |
| T1 Day creep | 790.3 | 448.8 → **416.0** | 301.6 → **273.1** |
| T1 Night creep | 30.1 | 113.1 → **56.5** | 99.6 → **59.6** |
| Fence creep | 610.0 | 317.6 → **295.4** | 303.3 → **283.4** |
| Grid creep | 1058.4 | 532.5 → **399.1** | 522.3 → **463.4** |

Strong events at rest went 25.6 → 0 (smooth) and 29.9 → 0 (quality). Heat-map crops at rest: [locked](rest-flicker-locked.png), [smooth before](rest-flicker-smooth-off.png) / [after](rest-flicker-smooth.png), [quality before](rest-flicker-quality-off.png) / [after](rest-flicker-quality.png). Device-pixel crop strip (first/middle/last frame), locked | before | after: [rest-crop](rest-crop-locked_vs_before_vs_after.png). Moving APNGs (local, large): `local/evidence/p3u/w4/sheets/t123-rest-…apng`, `t123-night-creep-smooth-off_vs_smooth.apng`, `grid-creep-smooth-off_vs_smooth.apng`.

**Fix** (`src/scene/imageIntegrity.js`, wired from `createPostProcessing` on the `SETTINGS.output` path only):
- The output pass keeps tone map → sRGB → vignette. Its grain lines and dither are removed by text replacement.
- `moveGrainAfterAA()` patches SMAAPass's neighbourhood-blend material in place: after `SMAANeighborhoodBlendingPS`, it adds the **same** hash, seeds and amplitude for grain, then the ±½-code dither at the real float→8-bit boundary (SMAA's screen write).
- It shares the output pass's `uTime`/`uGrainAmount` uniform objects, so `updateScene` and every harness that drives `passes.wash.uniforms.uTime` work unchanged.
- No extra fullscreen pass. It throws loudly if three.js internals change (`_materialBlend`, the blend entry point).

**Still-image effect** (frozen grain seed, Stage 1 vs W4): mean max-channel delta 0.012–0.043 codes, 0.04–0.06 % of pixels >2 codes (AA edges only), mean code change ≤0.003. The grain character is identical. **No look change, no owner gate needed.**

**Review switch:** `&integrity=off` restores the Stage 1 chain for A/B.

## D3 — remaining motion aliasing on thin features (not fixed; W3)

Creep heat maps ([gantry/finish example](motion-aliasing-finish-gantry-heat.png)) put all remaining flicker on thin, high-contrast geometry: curb stripe edges, 0.25 m edge lines (~3 CSS px), barrier and armco tops, the start gantry lattice, the catch fence, and rotating wheels. There are no area patterns (no z-fighting or shadow-acne swaths). The cause is geometric aliasing that SMAA, a spatial single-frame filter, cannot stabilise. Higher resolution helps (locked 790 → smooth 416 → quality 273 at T1). A real further reduction means MSAA on the scene target or a temporal AA. That is the AA choice, W3's ownership, and not a cheap W4 shader fix. → Request R1.

## D4 — grain scale vs DPR (H3, owner choice)

Stage 1 draws grain per **backing** pixel. Locked draws it per CSS pixel, and the browser's 2× upscale then softens it. Measured in device pixels on a flat grass patch (RMS of local-mean-removed green; lag-1 autocorrelation):

| locked | smooth (S1 default) | smooth `&grain=css` | quality (S1 default) |
|---|---|---|---|
| 0.83, corr 0.63 | 0.95, corr 0.40 | **0.78, corr 0.59** | 1.37, corr −0.01 |

So unlocked grain is finer and a little stronger than locked, most of all in quality (+65 % RMS). It is barely perceptible at normal viewing ([sheet ×3](grain-scale-locked_smooth_smoothcss_quality.png)). Stage 1's grain is part of the owner-approved unlocked default, so **the default is unchanged**. `&grain=css` (one bilinearly interpolated sample per CSS pixel at any DPR) reproduces locked's grain scale. It is offered for the C4 comparison only if the owner wants it.

## Measured, no defect worth fixing

- **Banding / precision (H1):** in smooth zones the longest identical-RGB run is ≤8 px in every config (grain + dither break up gradients). The composer intermediates are already half float. No banding fix needed.
- **Clipping:** unlocked has 0 highlight-clipped pixels (locked 0.08–0.26 %) and pure black ≤0.023 %. *Observation for W3/owner:* Night unlocked has 9.9 % of pixels at luma ≤4 vs 4.3 % in locked. These are deep, near-black shadows from the approved ACES Night, not clipping. It is tone/lighting territory, so not changed here.
- **Motion blur:** the blur vector is in UV, so its length is DPR-invariant in CSS terms (H3 rejected for blur). 8-tap vs 64-tap error at maximum blur: 0.70–1.41 % of pixels >4 codes in unlocked (locked 1.1–1.6 %). Jittered taps would cut that to 0.48–0.99 % but add per-pixel noise to the accepted blur. The benefit is marginal, so not changed. At creep speed the blur is sub-pixel (strength 0.0042).
- **Depth / z-fighting:** camera near 0.5 / far 3000, 24-bit depth, default distance 140 m. That gives a depth step of ≈2.3 mm at 140 m and ≈4.8 mm at 200 m. Road layers (asphalt / curbs / verge / runoff) are laterally disjoint, and coplanar overlays already use `polygonOffset` (edge lines, finish strip, checkpoints, start facility). No area flicker in any heat map. Near/far are unchanged.
- **Road faceting:** the track ribbon is sampled every 1.1 m. No chord artefacts were visible at review distance.

## Performance

Same number of passes and draws. The grain hash and dither move from the output pass into the SMAA blend shader (identical ALU per pixel). The SMAA blend program is created at init exactly as before, so there is no new first-use program. No timing run was made (see Uncertainty).

## Verification

- **Locked/default 23-state diff vs reference (`p3u-ref` @ fa12e92 served on 5236, this worktree on 5233, both `scripts/p3u-capture.mjs`, DPR1):** **23/23 identical, 0 changed pixels** ([`locked-diff.json`](locked-diff.json); captures and provenance in `local/evidence/p3u/w4/locked/`).
- The fix is active only when `UNLOCKED && integrity !== 'off'`. The locked `else` branch of `createPostProcessing` is textually unchanged. `?version=locked` pans and grain range in `r2`/`r2-live` match the expected locked behaviour (grain range 0).
- The unlocked shader compiles and renders in both modes (all `r2`/`r2-live` configs completed, exit 0).

## Owner-visible changes

None by default. Optional for review: `&grain=css` (D4). `&integrity=off` (Stage 1 chain, for A/B only).

## Requests (manager)

- **R1 (W3, AA):** if the owner rates the remaining edge crawl in motion (D3) as worth budget, compare MSAA×2/×4 on the scene render target (or TAA) against SMAA at the curb-heavy T1 and grid/gantry sections. Use `GT3_W4_SET=t123-creep,grid-creep,fence-creep GT3_W4_GRAIN=live` with `scripts/p3u-w4-integrity.mjs`; flicker per MP is the deciding metric.
- **R2 (W3, low priority):** the sun's shadow camera follows the car without texel snapping. No shadow-edge crawl showed in these heat maps, so this is not a defect today. Keep it in mind if W3 changes shadow extent or map size.
- **R3 (owner, C4, optional):** grain scale `default` vs `&grain=css` (D4).

## Remaining uncertainty

- No GPU timing for the change (expected ±0, unmeasured).
- Car-mesh faceting (per-mesh normal analysis) was not assessed. I judged it out of proportion at the ~72–75 CSS px car size (AUDIT F12).
- Metrics come from emulated-viewport deterministic captures, not headful trackpad scrolling. The rest/creep results map directly onto real use because the grain clock and frame path are production code, but frame pacing is not covered.
- The fix depends on the three.js r180 SMAAPass internals (`_materialBlend`, the blend entry string). It fails loudly at init if these change.
