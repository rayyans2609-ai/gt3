# Cars refinement — 2026-11-26, W3

Candidate for owner review; no commit, push or merge performed.

Cars becomes a medium-weight Neue Haas display heading at 36–52 px (32 px on narrow screens), with tighter editorial tracking and a 24 px separation from the larger ten-bar discovery glyph. The control keeps its upper-left position and the circuit keeps its frame and geometry. The result gives vehicle discovery a distinct, substantial entry point while retaining the Hub's negative space and START RACE hierarchy. One treatment is supplied; no alternative query mode.

## Behavior

- The Cars toggle remains a native expand/collapse button; ten sibling native buttons represent CARS indices in order. An unlocked bar opens Cars, without changing selection or discovery.
- Locked bars expose only their ordinal and “undiscovered”, use hairlines and a not-allowed cursor, and remain keyboard reachable. Activating one nudges that bar and the Cars label together −4 → +1.5 → 0 px over 320 ms. A locked circuit name also resists with its corresponding bar and Cars label. Repeated activation resets the previous feedback.
- Unlocked bars expand 1.45× vertically from their baseline using only transforms; hover and keyboard focus use the shared identity colour. Circuit-name hover/focus colours text; activation plays one lap in that colour. START RACE retains its looping hover lap through the same parameterized `lapLight` function.
- Plan names are accessible buttons while expanded, with Enter/Space support; they leave the tab order and accessibility tree on collapse. Launch receives the same selector-bar behavior and coloured roster-name hover/focus; no Showcase navigation is invented.
- Reduced motion skips the nudge and expansion, provides instant resisted opacity/colour feedback, and replaces lap travel with a 240 ms static circuit highlight. Changing the preference stops current feedback/travel.
- Checker beneath START RACE, plan-to-Tour projection/zoom and persisted-position leader geometry are preserved. Audio and the excluded modules were not edited. No application dependency was added.

## Palette and provenance

Source of truth: `src/data/cars.js`, `identityColor`. UI consumers share `applyCarColor` in `src/ui/carIdentity.js`, exposing `--car-color` and the optional future Night variant `--car-color-night`. Every value below is the same in Day and Night; no variant is needed.

GLB JSON and BIN chunks were parsed with Node from the actual default Grand Tour models in `public/models/tour/`. Every material's `pbrMetallicRoughness.baseColorFactor` was recorded (absent means neutral); all chosen sources are textured exteriors, so none requires a brand fallback. Texture indices resolve through `EXT_texture_webp.source`. Embedded base-colour WebPs were decoded with Pillow in a local-only Python environment, reduced to at most 192×192, and filtered to alpha > 200, HSV saturation > .35 and value > .2. Pixels were grouped into 24 hue buckets; each reported seed is the RGB mean of its bucket. A 384×384 follow-up (value > .18) resolves small secondary accents on Lexus, Nissan, Lamborghini and Porsche. Exterior atlases were inspected together to distinguish livery from dashboards, tyres and lamps; histogram size alone does not establish body colour.

Material and texture indices below are zero-based. Derived accents adjust lightness/saturation, and modestly tune hue where needed for separation; they are UI accents, not exact paint matches. Contrast uses WCAG relative luminance against the actual Hub fields from `landing.css`: Day `#ffffff`, Night `#0c1930`. CIEDE2000 uses sRGB → CIELAB D65 and scikit-image 0.24.0's `deltaE_ciede2000`, all weighting factors 1, over all 45 pairs.

| Car | Hex, Day = Night | Exterior source / adjustment | Contrast Day | Contrast Night |
| --- | --- | --- | ---: | ---: |
| Lexus RC F GT3 | `#7578d1` | Texture 29, material 42 `ext_carpaint_inst`: indigo `#1c1f6e`, lifted/desaturated | 3.92 | 4.48 |
| Nissan GT-R NISMO GT3 | `#bd3057` | Texture 21, material 36 `EXT_Rim_Decals_45`: NISMO red `#65121c`, lifted and tuned toward crimson | 5.64 | 3.11 |
| Audi R8 LMS GT3 evo | `#cb2117` | Texture 1, material 2 `EXT_ENGINE_WIRE_1`: red body livery `#c11810`, lifted | 5.57 | 3.15 |
| BMW M6 GT3 | `#338dae` | Texture 4, material 16 `logo`: M/badge blue `#3390bd`, consistent with texture 0 body stripes; slightly muted | 3.78 | 4.65 |
| Mercedes-AMG GT3 | `#008655` | Texture 1, material 1 `Radiators_0`: secondary green body livery `#03af69`, darkened | 4.62 | 3.79 |
| Ferrari 488 GT3 | `#d96165` | Texture 8, material 8 `LOD_A_DOOR_RIGHT_mm_ext_Mat`: coral body `#da504e`, lifted and tuned slightly cooler | 3.59 | 4.88 |
| McLaren 720S GT3 | `#0c69b4` | Texture 1, material 3 `EXT_Carpaint_Inst`: blue body `#0c69b4`, retained | 5.68 | 3.09 |
| Aston Martin Vantage GT3 | `#9d8207` | Texture 4, material 4 `Vehicle_Exterior_mm_ext`: Bilstein yellow `#f2c90a`, darkened | 3.73 | 4.70 |
| Lamborghini Huracán GT3 EVO2 | `#788b08` | Texture 10, material 7 `EXT_Carpaint_Inst.007`: secondary lime `#a7c11e`, darkened | 3.82 | 4.59 |
| Porsche 911 GT3 R | `#9757bd` | Texture 11, material 15 `EXT_Carpaint_Inst`: secondary purple `#3b0b56`, lifted/desaturated | 4.76 | 3.69 |

**Minimum pairwise ΔE2000: 13.1789**, Aston Martin ↔ Lamborghini, identical in both themes. Minimum Day contrast 3.59 (Ferrari); minimum Night contrast 3.09 (McLaren). No black, white or repeated colour.

Local-only sampling evidence: `local/evidence/W3/materials.json`, `texture-samples.json`, `texture-sheet.png`, `sample-palette.py`, `check-palette.py`, `palette-check.json` and extracted WebPs under `textures/`. Pillow/scikit-image are confined to `local/tmp/w3-palette-env`; they are not application dependencies.

## Verification / limits

- `node --check` passed for `hub.js`, `hubPlan.js`, `carIdentity.js`, `cars.js`; `git diff --check` passed.
- Plain `npm run build` encountered EPERM because Vite's bundled config loader writes to the main checkout through the shared `node_modules` symlink. `npm run build -- --configLoader runner` passed using the same production config without the temporary bundled config; output is in `local/evidence/W3/build.log`.
- The supplied optional command, `scripts/run-harness.sh -R p5-refine -T W3 scripts/verify-controls.mjs`, stopped with exit 75 at host preflight: rising paging and CPU idle below 25%. The browser did not launch. No additional browser harness was attempted.
- Visual judgement, collision coverage, motion feel, keyboard/screen-reader runtime behavior and reduced-motion runtime behavior remain unverified. The manager/owner should review both themes, partial/all discoveries, Plan and Launch at representative viewport sizes. The static palette measurements are verified; the rendered result remains provisional.
