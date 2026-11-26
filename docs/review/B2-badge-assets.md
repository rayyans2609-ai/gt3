# B2-badge-assets worker handoff

Run `p5-hub-redesign`, branch `p5-badge-assets`, base `00ba235`. No commit, push, merge, network access, server or browser. Host UI/McLaren source files are untouched.

## Evidence

- Full offline preparation completed, including all 15 candidates.
- `node scripts/check-badge-models.mjs`: passed. Decodes runtime GLBs and candidates; checks budgets, face plane/span, centering, textures, front/back normals and zero open boundaries. Exercises locked/unlock/swap/dispose, shared geometry/textures versus private materials, late completion/relocking, manifest/file/decode failures, one warning, and untouched McLaren loader path.
- `npx vite build`: passed with and without `public/badges/`; assets restored afterward. Existing Vite mixed static/dynamic import warnings remain.
- Two full preparation runs: all nine GLBs and manifest SHA-256 identical.
- Local evidence: `local/showcase-badges/{INVENTORY.md,preparation-report.json,check-report.json,repro-check.json,preparation.log,preparation-repeat.log,build-with-assets.log,build-without-assets.log}`.

## Chosen models

All nine default to the standalone candidate. Each output is one glTF mesh with the following material-zone draw calls. Optical scale is based on occupied face area, with a 0.9–1.7 clamp.

| Badge | Triangles | Meshes | Materials / draws | Bytes | opticalScale | Rear treatment |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| lexus | 28,000 | 1 | 2 / 2 | 132,068 | 1.7 | Closed source retained; graphite silhouette support |
| nissan | 28,012 | 1 | 3 / 3 | 182,980 | 1.007 | Mirrored satin rear, edge walls/caps; graphite support |
| audi | 13,488 | 1 | 2 / 2 | 68,812 | 1.7 | Original closed chrome and graphite shells retained |
| bmw | 20,364 | 1 | 5 / 5 | 104,932 | 0.9 | Open lettering/insert shells mirrored and closed |
| mercedes | 1,404 | 1 | 2 / 2 | 11,272 | 1.609 | Closed star retained; graphite silhouette support |
| ferrari | 32,294 | 1 | 6 / 6 | 199,284 | 0.927 | Mirrored satin rear and local seam caps |
| aston | 16,030 | 1 | 3 / 3 | 112,376 | 1.7 | Mount loop removed; mirrored satin rear and seam caps |
| lamborghini | 256 | 1 | 2 / 2 | 227,244 | 0.944 | Original closed textured crest/back retained |
| porsche | 45,228 | 1 | 4 / 4 | 374,688 | 0.932 | Open relief pieces mirrored; satin walls/local caps |

Pack alternatives: `nissan-pack` (generic Nissan; not eligible as GT-R default), `audi-pack`, `bmw-pack`, `ferrari-pack`, `aston-pack`, `porsche-pack`. Candidates are under `local/showcase-badges/candidates/`; edit `scripts/badge-models.config.mjs` and re-run to change the selected candidate. No Lexus, Mercedes or Lamborghini is present in the pack.

## Inventory summary

| Source | Triangles | Meshes | Materials | Textures |
| --- | ---: | ---: | ---: | --- |
| lexus_logo.glb | 45,732 | 1 | 1 | none |
| gt-r_logo 2.glb | 10,342 | 2 | 2 | none |
| automobile_badges_-_main_brands.glb | 1,299,875 | 299 | 20 | none |
| audi-emblem.glb | 13,488 | 2 | 2 | none |
| bmw_emblem.glb | 12,124 | 10 | 6 | none |
| mercedes_benz_3d_logo_and_car_symbol_silver.glb | 738 | 2 | 1 | none |
| ferrari_logo.glb | 81,148 | 6 | 6 | none |
| AM badge.stl | 8,462 | 1 | 0 | none |
| lamborghini_emblem.glb | 2,584 | 3 | 3 | 2048×2048, 1024×1024, 1024×1024, 1024×1024 |
| detailed_porsche_logo/scene.gltf | 3,617,958 | 3671 | 7 | none |

Pack brands (24): Fiat, BMW, Lancia, Aston Martin, Chevrolet, Alfa Romeo, Ferrari, Renault, Bentley, Toyota, Nissan, Land Rover, Tesla, Mustang, Ford, Honda, Subaru, Porsche, Volkswagen, Audi, Maserati, Rolls-Royce, Mazda, Bugatti. Full original node names, mesh names and individual triangle counts are in the local inventory and editable pack ranges. The full 92,161,480-byte pack is never a runtime asset.

## Porsche and Aston

Porsche: **3,617,958 → 45,228 triangles; 3,671 → 1 glTF meshes; 3,671 → 4 draw calls; 7 → 4 materials; 119,884,695 → 374,688 bytes** (source glTF plus BIN). Repeated pearl relief is reduced to eight-triangle beads with meshoptimizer; gold field/rim, red, black horse/lettering/antlers and satin rear are merged into four zones. Silhouette and source raised details are retained without subdivision.

Aston: position welding found one connected printable shell. The centre panel bounds, face height and normals assign deep green-black dielectric enamel, raised chrome lettering and polished chrome wing/feather detail. 243 mounting-loop triangles were removed; 928 triangles were classified as panel and 636 as raised centre lettering before rear completion. Its large source non-manifold seam count remains disclosed.

## Limits and licence flags

All runtime outputs have **zero open boundary edges after Draco decoding**. Intersecting source relief shells remain: non-manifold edge counts are Nissan 46, Ferrari 122, Aston 1,201 and Porsche 202; other defaults have zero. These are presentation meshes, not boolean-unioned solids. Aston has three and Porsche one very small triangle-normal disagreements after quantization; the check permits at most four.

Rendered Day/Night legibility, upright text/texture orientation, rear/edge appearance through a full spin, actual relief readability and optical mass remain **unverified**. The Node check validates geometry/metadata but stubs browser image loading. Manager should especially review Aston material segmentation and the wide Lexus/Audi/Aston scales (1.7). Ferrari uses six genuine zones/draws (including Italian tricolour and back), slightly above the typical 2–5 target.

Downloaded mesh credits and CC BY 4.0 are retained in GLB extras and documented verbatim in `docs/assets/badge-attribution.md`. Aston standalone author/licence are **unknown**. Audi is GT3's own export. McLaren is GT3's own model under its separate task. Manufacturer trademark rights remain separate from mesh licences.

## Files changed

- `.gitignore`: ignore `/public/badges/` and `/models/`.
- `scripts/badge-models.config.mjs`, `scripts/prepare-badge-models.mjs`, `scripts/lib/badge-geometry.mjs`, `scripts/check-badge-models.mjs`.
- `src/showcase-badges/badge.js`, new `badgeModels.js`, `README.md`, `STATUS.md`.
- `docs/assets/badge-attribution.md`, `docs/assets/badge-assets-setup.md`, this handoff.
- `package.json` and `package-lock.json` were already modified by the manager at worker start; preserved.

Ignored output: nine runtime GLBs/manifest and 15 local candidates, source inventory/reports. No model files are tracked. Host needs no API changes: it owns rotation/float/tilt and the locked DOM question mark. Decoder URL matches the existing self-hosted `/draco/gltf/`.

done / evidence: prep, Node check, repeat hashes and both builds passed / unverified: manager visual review / blocked: none
