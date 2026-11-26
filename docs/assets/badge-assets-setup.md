# Reproduce Collection badge assets on either Mac

Keep the owner's source folder at **`models/logo models/` in the actual checkout root**. Both `/models/` and `/public/badges/` are ignored by Git. Copy the whole folder, retaining the Porsche `scene.gltf`, `scene.bin` and `license.txt` together. The nine runtime manufacturers are Lexus, GT-R/Nissan, Audi, BMW, Mercedes, Ferrari, Aston Martin, Lamborghini and Porsche. McLaren needs no asset: `src/showcase-badges/mclarenSpeedmark.js` builds it at runtime, so it works on both Macs from Git alone.

From a checkout/worktree with dependencies and the licensed local `font/` directory available:

```sh
npm ci
node scripts/prepare-badge-models.mjs
node scripts/check-badge-models.mjs
npx vite build
```

The preparation uses offline JS APIs from the pinned glTF Transform, meshoptimizer, Draco and sharp devDependencies. `npm ci` requires packages to be available in npm's cache or a normal connection; preparation and the Node check make no network requests and bind no server.

Source discovery is, in order: `--source <folder>`; `$GT3_BADGE_SOURCE`; `models/logo models/` in the main checkout found through `git rev-parse --git-common-dir`; then `local/showcase-badges/source/` in this worktree. The worker's sandbox command is:

```sh
node scripts/prepare-badge-models.mjs --source local/showcase-badges/source
```

Default runtime output is `public/badges/<id>.glb` plus `public/badges/manifest.json`. `--output <folder>` redirects it. All candidates are written to `local/showcase-badges/candidates/`, with a source inventory, preparation log/report and metrics under `local/showcase-badges/`. No personal absolute paths are embedded in defaults or runtime URLs.

Edit **`scripts/badge-models.config.mjs`** to change a badge's `chosen` candidate, node/mesh selection, transform corrections, material overrides or reduction target. Re-run preparation after edits. `standalone` is the default for all nine. Available `pack` alternatives are Audi, BMW, Ferrari, Aston, Porsche and generic Nissan. Nissan's chosen identity must remain the standalone **GT-R**. The pack contains no Lexus, Mercedes or Lamborghini. Only extracted candidates are emitted; the whole pack is never a runtime asset.

Optical scale is calculated from a 256-pixel orthographic union mask of the occupied face area, using `sqrt(0.55 / coverage)` clamped to 0.9–1.7. It is recorded per candidate in the manifest. Wide, sparse rings/wings get increased scale. Actual Day/Night appearance, upright readability and selection among candidates require the manager's rendered review under the host lighting; adjust the editable preparation config and re-run as needed.

Move **either the complete source folder** (preferred for reproducibility and changing choices) **or the complete prepared `public/badges/` folder** between Macs outside Git. Copying only prepared files supports runtime loading but cannot reproduce alternatives or re-run the geometry check's candidate coverage without sources. Keep the licensed `font/` folder separately as the rest of GT3 requires it for builds. The self-hosted r180 decoder lives at `/draco/gltf/`, matching `src/scene/cars.js`.

`createBadge` keeps its existing API. It fetches the manifest once, lazily loads only unlocked identities, and shows procedural artwork during loading or after any failure. Missing private SVG crests use a neutral procedural disc without throwing. Locked badges contain no visible emblem; the host renders its DOM `?`. The host owns continuous rotation, float and cursor tilt; badge `update()` adds only a small hover scale. Material clones are instance-owned; cached geometry and textures remain alive until their last lease is released. The module exports `badgeModelStatus(id)` for diagnostics.

The Node check decodes every runtime GLB and all prepared candidates. It checks budgets, axes metadata, face plane/span, centering, textures, front/back normals and open boundaries, then exercises actual `createBadge` code with local decoded-geometry loader stubs. Browser image decoding, PBR appearance and motion are deliberately left to visual review. Source intersecting relief shells/non-manifold seams are reported separately from open boundaries; these are presentation meshes, not manufacturing solids.
