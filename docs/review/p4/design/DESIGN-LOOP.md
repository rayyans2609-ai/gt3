# Phase 4 design loop: Claude Design canvas <-> Claude Code (2026-10-24)

Canvas (private, owner's account): https://claude.ai/artifact/DX9cFyYKNcBHu8dhkxdxaR
Baseline as published (version 5): `docs/review/p4/design/baseline/` (`canvas.json`, `Main.dc.html`, `Hub.dc.html`, `Transition.dc.html`).
Runtime authority: the live GT3 app (Three.js). The canvas is a composition and UI surface only.

## Boards
| Board | What it is | Editable by the owner |
|---|---|---|
| Landing at rest (`Main.dc.html`) | DOM/CSS geometry of the real Landing at 1440x900 (resolved px), real McLaren render, real colours/type | wordmark, label, caption, cue, car image: move, resize, retype, weight, tracking, colour; Theme tweak Day/Night |
| Hub, provisional (`Hub.dc.html`) | field + START RACE (kept minimal) | button size/position/type |
| Transition stills (`Transition.dc.html`) | six real frames of the live transition per theme | not editable content: comment on a frame to direct camera/timing/lighting |

## What the canvas cannot edit (stays in Three.js, `src/landing/landing.js`)
Car pose, turn and idle motion, pointer response, camera path and timing of the push, lighting and reflections, the headlight wake, the white/navy resolve. The car on the canvas is a still render at the opening pose (yaw -30 deg, elevation 8.5 deg). Moving or scaling it changes where the car sits on screen, not how it is posed.

## Handoff: canvas edits -> source
Claude Code reads the saved `.dc.html` files back (`Artifact read`, per-file `path`) and diffs them against `baseline/`. Every edit is a changed inline style or text on a named element, so the delta is exact. Conversion at the 1440x900 reference (horizontal /14.4 -> vw, vertical /9 -> vh):

| Canvas element | Source | Rule |
|---|---|---|
| `h1` "GT3" | `.landing-wordmark` (landing.css) | font-size px -> `--landing-type` = clamp(210px, vw, 600px); left px = 4.4vw - 0.045em -> new `left` + 0.045em; `bottom` = 900 - (top + 0.74 x font-size); letter-spacing/weight/line-height 1:1 |
| `p` "A Grand Tour" | `.landing-eyebrow` | left 1:1 (vw); `bottom` = 900 - (top + 14) |
| caption | `.landing-caption` | centre x = left + 120 -> `left` %; `top` -> vh |
| "Scroll" cue | `.landing-cue` | centre x = left + 30 -> `left` %; `bottom` = 900 - (top + 54) |
| car image | `TUNE` in landing.js: `restScreenX`, `restScreenY`, `restWidthFraction`, `restHeightFraction` | baseline box (697,214,520x320): `restScreenX += dx/1440`, `restScreenY += dy/900` (dx,dy of the image centre); `restWidthFraction`, `restHeightFraction` x= newWidth/520. The push, pose and timing are unchanged. |
| START RACE | `.hub-start` (landing.css) | size/type 1:1; position is currently centred by the grid: a moved button needs an explicit decision (owner confirms) |
| pill and audio anchor | `hud.css`, `player.css` | placement only; they are global controls, not changed without explicit approval |
| Theme tweak colours | `landing.css` tokens | read-only reference: colours are the shipped tokens |

Comments on the canvas (`ArtifactComments`) are read when the owner asks; each becomes a line in the brief with the board/element it was anchored to.

## Delegated implementation (per `docs/ai/model-routing.md`)
1. Opus (manager): reads the canvas diff and comments, writes the design-delta table, decides scope and what needs the owner, briefs, integrates, reports.
2. Sol @ high: Landing CSS plus `TUNE`/camera constants and any Three.js-side change (coupled; one owner). Pure CSS-only deltas (type, spacing) may go to Terra or a free worker if they are separable and a clear contract.
3. Luna / scripts: `scripts/capture-design-assets.mjs` and the existing flow/parity harnesses (`verify-landing-flow.mjs`, `verify-landing-profile-parity.mjs`) for evidence; a numeric check compares live element boxes with the canvas values.
4. Opus shows the owner the running app (dev server) and refreshed canvas assets; repeat.

## Fidelity limits (stated, not hidden)
- Neue Haas Grotesk "-Trial" is licensed (SPEC section 30.5) and is not uploaded; the canvas falls back to Helvetica Neue, which is close but not identical. Geist Mono comes from Google Fonts.
- The car image is a flat render: scaling it approximates a camera change; true re-framing is a runtime change.
- Absolute-position dragging in the canvas editor is not verified; if an element will not drag, set `left`/`top` in the properties panel.
- Pixel-exactness between the canvas and the app is not guaranteed (different layout engines for the pill/anchor mock-ups); numeric element boxes are the check.
