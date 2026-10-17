# T5 — Ferrari colour and Neutral Night readability

No default changed. Review [C3 before/after](C3-fixes.png); numbers/provenance: [T5 evidence](T5-evidence.json), [locked diff](T5-locked-diff.json).

## Controls and mask audit

All captures use the T1 pose (route t=.123), deterministic clocks/randomness, unchanged lights/material inputs/camera, DPR1 rendering and device DPR2. This is an isolation setting, not a Stage 2 resolution proposal. Owned servers: candidate :5231, reference :5232. Reproduce with `scripts/p3u-diagnosis.mjs` and `scripts/p3u-diagnosis-metrics.mjs`. Raw files/manifests: `local/evidence/p3u/t5/`.
T4 scripts were copied byte-for-byte from d87df5e into `local/tmp/p3u/t5/`, never edited. Its Lab/LCh/Sobel functions also measure depth-tested geometry silhouettes, nearest-upsampled to screenshot size. Masks were visually inspected.
**Do not trust T4's thresholded car sample:** Neutral/high precision is only 36% Lexus / 7% Lamborghini; off produces identical false car L*=4.12 for both. Actual silhouettes give 0.47 / 0.33. The padded box admits road/curbs and the threshold rejects dark bodywork. World rectangles remain useful.
Ferrari comparisons use the same 2,532 red pixels selected once inside Neutral/off's silhouette (R>1.3G, R>1.3B, C*>20); C below is mean per-pixel chroma. Dominant values use T4's modal Lab bin. Neither is a perceptual acceptance score.

## Ferrari — three distinct causes

| Calibrated tone | C*: off / low / mid / high | Mid dominant C* / hue |
|---|---:|---:|
| Neutral (.35) | 47.9 / 47.6 / 47.8 / 48.0 | 66.9 / 34.7° |
| ACES (.265) | 42.0 / 43.3 / 43.7 / 43.1 | 60.6 / 31.0° |
| AgX (.16) | 30.9 / 30.5 / 30.0 / 28.9 | 41.6 / 31.8° |

**Tone:** the difference survives reflection-off; calibrated ACES/AgX lose 12%/35% mean C* relative to Neutral even without the sky. At identical .35 exposure and no reflections, C* is Neutral 47.9 / ACES 45.2 / AgX 32.2: pure mapper differences are 5.6% / 32.7%; the larger calibrated ACES deficit includes its lower exposure.
**Reflection:** neutral-coloured specular over red raises lightness much faster than chroma. Neutral off→mid raises red L* 31.2→38.3 while C* stays 47.9→47.8: C*/L* falls 1.54→1.25 (19%); high reaches 1.08. AgX also loses 2.0 C* off→high. This explains a brighter, paler appearance without assuming every absolute chroma value must fall. The Ferrari exterior is authored nonmetallic with roughness 0, particularly receptive to sky highlights.
**Missing transform:** at zero reflection, bypassing tone AND sRGB yields C*=72.1, dominant 98.0/38.1°; adding only sRGB yields 50.5, dominant 68.9/31.5°. Actual locked is 72.5, dominant 98.0/38.1°. Thus missing encoding alone inflates this mean C* by 21.6 (43% relative to encoded), accounting for most of the apparent locked→Neutral loss; it also changes lightness. This is not an additive causal percentage decomposition: encoding, exposure, toe and gamut compression interact.
At .35 exposure, linear+sRGB has C*=37.6 versus Neutral's 47.9: Neutral's offset itself increases saturation here. Restoring locked's displayed red with a blanket saturation boost would undo colour management.
**Albedo accuracy:** decoded GLB base-colour texture 8 → EXT_texture_webp image 9 (door exterior), modal red C*=66.1, hue=28.9°; texture 10 → image 11 (interior exterior atlas), 70.1/35.4°. Neutral's dominant chroma is closest; ACES has closer main-atlas hue but lower chroma, AgX substantially lower chroma. Locked's 98.0 exceeds either albedo mode. Lighting/BRDF/shading prevent treating albedo as a target screenshot; this supports Neutral as the red-preserving starting point, not a claim of measured real-world paint fidelity.

## Neutral Night — curve, not insufficient reflections alone

For grayscale radiance v with .13 exposure, Neutral's low-range output is **6.25(.13v)²**, before sRGB. ACES uses .29/.6 internally plus its fitted curve; AgX uses .17 and log contrast. Equal incoming v=.03/.10/.30 maps to sRGB codes Neutral **0.31/3.48/24.64**, ACES **6.41/30.22/78.00**, AgX **5.85/31.75/70.89** (CPU evaluation of installed r180 shader formulas, before wash/grain).
Neutral/high true-car mean L*: Lexus .82, Lamborghini 1.28, McLaren 1.74; ACES 2.38/4.47/2.76, AgX 2.43/4.44/3.14. Doubling reflections cannot undo a quadratic toe: Neutral low→high gives only .54→.82 / .49→1.28 / 1.21→1.74. Raising global exposure would lift the world.

## Two review options; owner chooses

- **Day `&carspec=quarter`**, any unlocked tone: quarter only environment **indirect specular**, all cars; direct highlights, diffuse environment and authored maps/roughness/metalness stay intact. It fades back to normal at Night. Ferrari Neutral/mid mean C* 47.8→49.2, L* 38.3→37.4; modal C* 66.9→68.1. Visibly a modest reduction of pale sky sheen, not a cure for ACES/AgX compression. Tradeoff: less glossy Day reflections on every car.
- **Night `&nightcar=toe`**, unlocked Neutral only: invert the common Neutral black offset on car radiance before the existing output transform. For uncompressed unfogged pixels this recovers exposure×radiance; it adds no world light. Weight follows the existing theme crossfade, including cached fade materials. High-reflection car L* becomes **3.22 / 4.62 / 3.40**, Sobel **2.61→7.62 / 3.41→8.89 / 4.72→7.96** (Lexus / Lamborghini / McLaren). Surfaces become readable while the route stays dark. Tradeoff: brighter car blacks relative to the rest of Neutral's image; highlight compression/fog can prevent exact toe cancellation.

C3 URLs: `?version=unlocked&tone=neutral&refl=mid&carspec=quarter` (Day), `?version=unlocked&tone=neutral&refl=high&nightcar=toe` (Night). Omit each added flag for before; theme/pose must match.
Both pairs have **zero changed world/HUD pixels outside the car bounds +8 CSS px** (5.59 million pixels/state); T4 background/road ΔL*=0.00 in all four. No paint/camera/Stage 2 changes, extra pass or default material variant.
Locked ignores both flags: fresh fa12e92 reference versus current locked **23/23 pixel-identical**, max channel delta 0. Build passed. Owner visual acceptance and sustained performance remain unverified; no push/merge/children.
