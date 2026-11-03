# Metal FX — visual reference (not implemented)

**Status: reference only.** Nothing from `Jakubantalik/metal-fx` is in GT3's source, dependencies or bundle, and no phase owns it. Revisit only when a concrete use arrives (see "Proposed experiment"). No React, no second production WebGL renderer, no port without that use case.

Assessed 2026-11-04. Labels: **read** = seen in the source, **measured** = run and timed, **inferred** = reasoned from code, not run. Nothing here is *measured*; Metal FX was never executed.

## Provenance

| | |
|---|---|
| Repo | https://github.com/Jakubantalik/metal-fx — pinned `be1bf89c63056521a4e8224f368768314c9006f7` (v1.0.4, 2026-05-14) |
| License | MIT, © 2026 Jakub Antalik (**read**). Keep the copyright and permission notice when copying a substantial portion, for example the GLSL. |
| Live demo | https://metal.jakubantalik.com (not opened) |
| Local copy | `local/reference/metal-fx/` in the `p5-hub` worktree (git-ignored, worktree-local; re-create with `git clone https://github.com/Jakubantalik/metal-fx.git local/reference/metal-fx && git -C local/reference/metal-fx checkout be1bf89`). Read it; never `npm install` or run anything from it. |

## What it actually is

Not a chrome or PBR metal. **Read:** there is no `sampler2D`/`texImage2D`, no environment map, no normals and no fresnel. It is a 2D animated iridescent "plasma" colour field, drawn as a thin border ring around a UI element. The metallic read comes from the palette and a moving catch-light, not from lighting a surface. If GT3 ever wants true metal (car paint, wheels), this is the wrong source; as a rim or accent colour source it may fit.

## Requirements

- **Read:** a React component library (`metal-fx` on npm, `peerDependencies` `react`/`react-dom` >= 18, zero runtime dependencies). `MetalFx.tsx` is the only React file.
- **Read:** raw **WebGL1** (`getContext('webgl')`, `src/engine/renderer/core.ts:135`), not Three, OGL or r3f. It owns a **separate shared `OffscreenCanvas` + GL context**, `96 px × min(DPR, 2)` (`perfConfig.ts`: `CANONICAL_GL_SIZE`, `GL_DPR_CAP`), and each instance copies a cropped region into its own 2D canvas.
- Framework-neutral and reusable as ideas or GLSL: `src/engine/shaders.ts` (257 lines), `renderer/`, `glow/`, `reflection/`, `presets.ts`, `color.ts`.

## Mechanism

1. **Field** (`shaders.ts`, **read**): a few sine bands plus a simplex-FBM domain warp. FBM octaves are `3.0 + u_complexity * 4.0` (up to 7).
2. **Palette**: 5 uniform colours blended with Gaussian weights `exp(-k·(t - stop)²)` at stops 0, .25, .5, .75, 1.
3. **Soften**: a **5-tap cross blur** (the field is evaluated 5 times), then a vignette. (The header comment says "9-tap"; the code is 5-tap.)
4. **Uniforms**: about 27 scalars/vec3, driven by presets. Colours are plain sRGB (`hexToRgb`, /255), never linearised.
5. **Ring and highlight are not GLSL.** The ring is 2D-canvas `destination-out` hole-punching. The "catch-light" is blurred SVG strokes placed at the brightest of 16 perimeter samples, found with `gl.readPixels` luminance every 1.5 s. Neighbour "reflections" are canvas-2D clipping plus CSS `filter: blur/saturate/brightness`.

## Performance

- **Read:** render loop throttled to 66 ms (about 15 fps, `FRAME_INTERVAL_MS`); pauses when hidden or offscreen; handles context loss.
- **Read (absent):** no `prefers-reduced-motion` handling, no low-end or mobile detection.
- **Inferred:** shader cost is roughly 5 taps × 2 `nfbm` × up to 5 octaves ≈ 50 `snoise` calls per fragment. That is cheap only because the field is generated at **96 px** (about 9k fragments at DPR 1, 37k at DPR 2) and then scaled. The same shader on a full-viewport quad would be far more expensive and is **not** suitable for an Intel UHD 617 at 60 fps.
- **Inferred:** the non-GL work (per-frame SVG blur re-raster, per-instance 2D canvases sized by uncapped `devicePixelRatio`, CSS-filter reflections, a periodic `readPixels` stall) likely dominates on this class of GPU. The author flags the SVG blur cost in `perfConfig.ts`.

## Reuse in GT3 (vanilla JS + Three.js 0.180)

| Part | Verdict |
|---|---|
| GLSL field + palette (`snoise`, FBM, `palette`, vignette) | **Reusable** as a `ShaderMaterial` on a quad in the existing renderer. Replace `gl_FragCoord/u_resolution` with `vUv`; pack the 5 colours into `vec3[5]`; drop unused uniforms. |
| 2D-canvas ring | **Replace** with a rounded-rect SDF ring mask in the fragment shader, evaluated *before* the noise so only ring pixels pay. |
| Render once to a small `WebGLRenderTarget` (about 96–128 px) at 15–30 fps and sample it | **Good fit** for the cost profile above. |
| Post-process pass | **Poor fit**: it is a generator with no input image. |
| CSS/SVG-only approximation (`conic-gradient` + `mask-composite` + a moving blurred highlight) | **Plausible and cheap**; will not reproduce the plasma. |
| `MetalFx.tsx`, OffscreenCanvas→2D copy architecture, `readPixels` glow, DOM reflections | **Do not port** (React, a second GL context, DOM-coupled). |

Gotchas: colours are sRGB, so convert if the result goes through a render target or `OutputPass`; check blending/alpha (the library uses non-premultiplied alpha); `ShaderMaterial` adds no tone mapping or colour-space chunk unless you include one; dispose the material, geometry and any render target; add `prefers-reduced-motion` handling and a DPR cap if used on UI.

## Proposed experiment (not started)

Trigger: a concrete use, for example an accent ring on the selected control in the Phase 5 Hub. Until then, do nothing.

1. Scratch Vite page or a `?metalfx` dev-only flag; one `ShaderMaterial` quad inside GT3's existing Three scene. **No new dependency, no React.**
2. Copy only the GLSL from `src/engine/shaders.ts` and one preset from `presets.ts` into new local code, with the MIT notice.
3. Add the SDF ring mask with `ringPx` and `radius` uniforms; drive `u_time` from the existing clock at 30 fps or lower.
4. Compare direct-draw against a 96 px `WebGLRenderTarget` sampled as a texture. Measure GPU frame time on the Intel UHD 617 at DPR 1 and 2 (use the host-check preflight; one browser job at a time).
5. Check colour correctness with and without `OutputPass`. Accept only if the ring fits the existing frame budget and reads correctly in Day and Night themes. Otherwise fall back to the CSS approximation or drop it.
