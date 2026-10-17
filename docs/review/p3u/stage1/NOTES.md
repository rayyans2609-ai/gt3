# P3u Stage 1 — selectable candidates

Owner review: [C1 Day](C1-day.png) · [C1 Night](C1-night.png) · [C2 Day](C2-day.png) · [C2 Night](C2-night.png). The matching HTML sheets have clickable column URLs and embedded full-resolution crops. [Exact live URLs and capture inputs](URLS.md).

## What changed

- One explicit profile/mode settings table. `?version=unlocked` defaults to smooth; unknown modes also use smooth. Everything else selects locked and ignores the overrides.
- Unlocked: scene → motion blur → **tone mapping + sRGB + existing wash + output dither** → SMAA. Four passes, as before. The dither is ±0.5/255, below the existing ±0.009 grain. Locked shader text and pass order remain unchanged.
- A single procedural outdoor sky/horizon/ground map is prefiltered at load. Only car materials receive it, including cached fade variants. Original paint color, textures, metalness and roughness are preserved; there are no per-car multipliers.
- The existing full warm-up exercises the selected output, PMREM, opaque and fade programs before readiness. Theme exposure, atmosphere and reflection strength interpolate through the existing 2.2 s transition; toggling never creates a new variant.
- Exposure anchors road/terrain brightness near locked. Fog and sky endpoints are separately inverted through each tone + sRGB transform to preserve their accepted displayed colors. Locked presets, road materials and lighting values are untouched.

## Provisional recommendations — owner chooses the look

**Neutral / mid**, for a color-preserving starting point with visible car form. ACES and AgX remain equally selectable candidates. This is not an artistic decision or final acceptance.

| Setting | Day | Night |
|---|---:|---:|
| ACES exposure | 0.265 | 0.29 |
| AgX exposure | 0.16 | 0.17 |
| Neutral exposure | 0.35 | 0.13 |
| Reflection low / mid / high | 0.35 / 0.7 / 1.4 | 0.07 / 0.14 / 0.28 |

Smooth uses fixed **DPR1.5**, quality **DPR2**. Both retain the accepted SMAA, 2048 shadow map, Tour textures and grain/blur settings. DPR1.5 follows the T1 combined-cost candidate; DPR2 offers a meaningful resolution comparison. These are provisional Stage 1 settings; Stage 2 frontiers decide them. Neither mode has an FPS cap or adaptive resolution.

## Observations — evidence, not recommendations

The reflection comparisons reveal glass and body contours on dark cars while leaving the surrounding world unchanged. Night is deliberately very dark; reflection strength is one fifth of Day. Dark paint is still dark, and glass highlights become more visible. The low/mid/high columns make that tradeoff inspectable.

Ferrari red is more subdued than the locked rendering in all three corrected candidates; Neutral retains more saturation than ACES/AgX in the Day crop. This remains an owner review point, rather than a paint-material adjustment.

A scalar exposure cannot reproduce the locked contrast curve at every luminance. [Measured world brightness](world-brightness.json) stays within 2.85 L* of locked in the sampled regions (Night within 0.95 L*), and records the remaining road/terrain differences, rather than hiding them by lifting the world. The sky/fog endpoint calibration is analytic; it does not claim identical intermediate gradients or sun glow. The static C1 rows use the T1 pose and cameras. The wide row is the same camera's road/terrain view, cropped to omit the HUD.

C1 compares locked DPR1 against unlocked smooth DPR1.5, so the locked/candidate difference also includes resolution. Tone columns and all C2 columns use identical DPR1.5. The owner can compare quality live using the linked URL; sustained cadence and moving image integrity remain Stage 2 work.

## Verification

[Locked/default pixel reports](reference-default.json): both complete 23-state sets are compared with reference `fa12e92` served from `p3u-ref:5232`; [explicit locked report](reference-locked.json). [Runtime and functional checks](verification.json), [selection cases](selection.json), [paint preservation](paint-preservation.json), [capture provenance](capture-evidence.json), and [performance sanity](PERFORMANCE.md) accompany the sheets. Raw manifests, screenshots, functional reports, runtime variant checks and per-frame timing are in `local/evidence/p3u/stage1/`.

The concurrent T3/T4 branches are not merged. T1 harness behavior is retained here; in particular these short performance runs do not claim the forthcoming fullscreen/HUD presentation checks, 10-minute frontiers, residency measurement, banding diagnosis, or owner trackpad acceptance. No children, push or merge.
