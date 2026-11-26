# B3 badge corrections

Run `p5-hub-redesign`, task `B3-badge-corrections`, branch `p5-badge-assets`, base `773c4fc`. Offline worker; no server, browser, network, downloads, agents, commits, push or merge. Preparation used `--source local/showcase-badges/source`.

## Corrected outputs

| Badge | Triangles | Materials / draws | Bytes | opticalScale |
| --- | ---: | ---: | ---: | ---: |
| Lexus | 21,624 | 2 / 2 | 101,408 | 1.349 |
| Mercedes | 1,484 | 2 / 2 | 12,144 | 1.349 |
| Lamborghini | 256 | 2 / 2 | 228,452 | 1.123 |

All three decode with zero boundary edges, degenerate faces, duplicate faces and normal disagreements. Lexus and Lamborghini have zero non-manifold edges. Mercedes retains 18 non-manifold edges from the star's intersecting source faces and local seam closures; it is a presentation mesh, not a manufacturing solid.

### Lexus

The old selection included the entire single primitive and reduced it before distinguishing the wordmark. Position-welded topology separates two components. In source world coordinates, the wordmark ends at Y=2.053432 and the oval/L starts at Y=2.711210. Keeping components whose minimum Y exceeds 2.4 removes 34,918 unique wordmark triangles; two additional duplicate source faces are discarded by topology analysis. All 10,812 emblem triangles survive without simplification.

The remaining oval/L is renormalised from a 6.076051 source-unit span to one unit. Its chrome finish and graphite silhouette support remain. The support is inset to 0.992 and offset behind the chrome, keeping the oval at one unit and avoiding coincident side walls visible at 70° when support and chrome used exactly the same XY outline. Materials are chrome `object_0` and graphite `Satin metal backing`.

### Mercedes

The defect was node exclusion: `polySurface1_aiStandardSurface1_0` is the 702-triangle ring; the omitted `polySurface2_aiStandardSurface1_0` is the 36-triangle three-pointed star. It was not simplification, flipped normals, or back-face culling. Both nodes are now selected without reduction.

The source has 735 unique faces after three duplicate star faces are removed. Chrome plus graphite support produce 1,470 faces; 14 local seam caps bring the output to 1,484. Materials are chrome `aiStandardSurface1` and graphite `Satin metal backing`. An independent projected-geometry check confirms chrome covers the centre, which the previous ring-only extraction did not.

### Lamborghini

The extra Y half-turn exposed the black rear. The source crest has negative closed-shell winding; the existing winding repair already puts its textured artwork on +Z. Removing the half-turn reveals upright gold lettering, bull and border. Restoring the textured `Emblem` material's metallic factor from 0 to 1 preserves the authored metallic/roughness response; the black `Emblem_2` rear remains enamel.

**Source clarification:** `Lamborghini_Gold_0` is a detached cursive “Lamborghini” script beside the shield, spanning about four times the shield's width. It is not the shield's bull or border geometry. The shield's actual gold artwork and relief are in its baseColor, metallicRoughness and normal maps. The detached script remains excluded, so the corrected shield still has 256 triangles. Source projections identifying the separate script are saved with the local evidence.

All three runtime crest maps are 1024×1024 WebP: baseColor 82,516 bytes, metallicRoughness 33,370 bytes, normal 105,392 bytes. The unused 2048 normal belongs to the detached script and is pruned; a resized 1024 WebP diagnostic is saved locally for review. No 2048 texture ships.

`TEXCOORD_0` and `TEXCOORD_1` now survive expansion, winding repair, geometry emission and Draco. Decoded UVs match source UVs within 0.000031. All three material texture slots retain UV set 0. No `KHR_texture_transform` exists in this source; the preparation extension allowlist now preserves it when present instead of deleting it. Source tangents are not emitted; the renderer can derive the normal-map tangent basis from positions, normals and UVs.

## Optical scales

Occupied projected triangle area is rasterised within the normalised face, including its actual holes, rather than using bounding-box area. The target is BMW's occupied area, 0.7788. Scale is `sqrt(BMW area / badge area)`, bounded to 0.9–1.35, with a 1.30 cap for aspect ratios at least 2.5. A final cap from the decoded bounding span is floored to three decimals, keeping the actual scaled span below 1.35 despite Draco's tiny span overshoot. BMW is 1.0.

| Badge | Occupied area | opticalScale |
| --- | ---: | ---: |
| Lexus | 0.2840 | 1.349 |
| GT-R / Nissan | 0.5425 | 1.198 |
| Audi | 0.1390 | 1.300 |
| BMW | 0.7788 | 1.000 |
| Mercedes | 0.3123 | 1.349 |
| Ferrari | 0.6402 | 1.103 |
| Aston Martin | 0.0784 | 1.300 |
| Lamborghini | 0.6176 | 1.123 |
| Porsche | 0.6333 | 1.109 |

Sparse emblems cannot exactly match BMW's occupied area within the required span limits. The largest decoded scaled span is 1.349000161 units. The six approved GLBs (GT-R, BMW, Ferrari, Porsche, Audi, Aston) are SHA-256 identical to the saved B2 hashes in `local/showcase-badges/repro-before.json`; only their manifest scales change.

## Verification and evidence

- Full preparation completed for all nine runtime badges and all 15 candidates.
- `node scripts/check-badge-models.mjs`: passed geometry, candidate and lifecycle checks.
- Independent correction checks: passed source component selection, Mercedes centre coverage, both Lamborghini UV sets, three texture slots, exact approved-asset hashes, BMW reference scale and all scaled spans.
- `npx --no-install vite build`: passed with and without `public/badges/`. Assets were restored in a `finally` block; the final build includes badges. Existing mixed static/dynamic import warnings remain.
- `git diff --check`: passed.

Local evidence is under `local/evidence/B3-badge-corrections/`: `preparation.log`, `check-report.json`, `corrections-check.json`, `build-with-assets.log`, `build-without-assets.log`, source inspection, and offline CPU projections at 0°, 35° and 70° yaw. Those projections use front-face culling and the actual baseColor/UV mapping; they do not model Collection PBR lighting.

Changed tracked files: the three badge preparation/configuration/geometry scripts and this report. No UI, showcase, main entry or style files changed. Generated GLBs, manifest and local evidence remain ignored and available in the worktree.

done / evidence: preparation, decoded geometry/lifecycle, correction checks and both builds passed / unverified: Collection Day/Night PBR appearance / blocked: none
