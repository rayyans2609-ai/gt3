# CandidateChecks4 evidence

## Provenance

- Candidate worktree: `p3u-hudtrail`, source SHA `4022f1ddcf96f2eea09da38af8f02b5e8f4193dc`; server provenance records one dirty file (`scripts/p3u-minimap-capture.mjs`, dirty hash `f935b18906747fa8`). The file was already modified at task start and was not edited by this run.
- W6 worktree: `p3u-w6`, source SHA `bb5d6de9004bc97d9c016e613b755c825288c021`; server provenance records 9 dirty files (dirty hash `91a7f6743195a766`).
- Both server provenance records show run `p3u`, epoch `4`; candidate task `CandidateChecks4`, W6 task `FinalVerify`. The harness completed once with exit 0.

## Minimap: pass

Both manifests report `pass: true`, zero errors, and 22 captures. Locked captures select the 160 segment legacy path (`legacy: 160`, `modern: 0`); unlocked captures select 48 gradients (`modern: 48`, `legacy: 0`). The unlocked captures have 48 rows each; maximum adjacent coordinate join delta and alpha join delta are both 0. Fractional/forward/reverse/gantry/near-finish/finish/reset progress values match between locked and unlocked: `0.25013`, `0.76`, `0.002`, gantry-after `0.0035922181`, `0.99999`, `1`, `0`. Neutral backing counts are diagnostic only.

Artifacts: `map-locked/manifest.json`, `map-unlocked/manifest.json`; original PNG captures and 4x whole-image crops (`*-zoom4x.png`) are alongside them. Four requested states (day/night fractional, day/night gantry-after) were cropped for each lock state. Inputs decoded as 340×340; crops use the full 340×340 area at 4x.

## W6 glass: captured; repeat identical

Product, stock, and repeat manifests each contain four states (Ferrari/Aston, day/night), with zero errors. Product and repeat transmission targets are 1470×956, scale 0.5, samples 0, mainDPR 2. Stock targets are 2940×1912, scale 1, samples 4, mainDPR 2. Captured PNGs decode to 2940×1912.

Repeat diff: identical true for 4/4 states; each has 0 differing pixels and max channel delta 0 (5,621,280 pixels per state). Stock/product differs as expected: Ferrari day 46 pixels (max delta 7), Ferrari night 15 (1), Aston day 22 (6), Aston night 3 (1). Difference summary: `../p3u-w6/local/evidence/p3u/W6-e4/glass-stock-product-diff.json`; repeat summary: `../p3u-w6/local/evidence/p3u/W6-e4/glass-repeat-diff.json`.

Artifacts: product, stock, and repeat manifests/captures under `../p3u-w6/local/evidence/p3u/W6-e4/{glass-product,glass-stock,glass-repeat}/`. Each state has a `*-car-zoom2x.png` crop computed from `carBoundsCSS × 2`, 12-pixel margin, image-bound clamping, and scale 2.

## Limits

This is only the prepared minimap and glass evidence sequence. It includes no timing run or broader regression suite. Exit 0 was considered together with each manifest and saved diff result.
