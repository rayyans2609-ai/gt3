# Canvas delta v1: owner edits to the Phase 4 Landing (read 2026-10-30)

Source: canvas https://claude.ai/artifact/DX9cFyYKNcBHu8dhkxdxaR, live version `1793380538-b254`, files saved as read in `edited-v1/`. Baseline: `baseline/` (published v5). Comment threads: none. Owner note: one, appended to the green sticky (below). Transition-stills board: unchanged, no annotations.
Reference images of what the owner saw: `edited-v1/reference-day.jpg`, `reference-night.jpg` (the edited board rendered locally with the canvas's own values; Neue Haas is not installed on this Mac, so the canvas showed Helvetica Neue).

## Static composition (canvas is the authority), 1440x900 reference

| # | Element | Old (baseline) | New (owner edit) | Implement as | Status |
|---|---|---|---|---|---|
| 1 | Layout | diagonal: GT3 low-left, car upper-right | **centred vertical stack**: GT3 top-centre, "A Grand Tour" under it, McLaren under that, Scroll cue bottom-centre | as listed below | direct |
| 2 | "GT3" wordmark | left 46.5, top 573.4 (bottom-left), 374.4 px | box left 388, top 190, w 664 (box centred at x 720); 358.4 px; weight 500, tracking -0.06em, line-height 0.74 unchanged | `text-align:center` across the viewport; font-size 24.89vw (358.4/1440), clamp bounds scaled (≈201-574 px); line-box top 21.11vh (190/900) | direct; centring is an interpretation (below) |
| 3 | "A Grand Tour" | left 63.4, top 537, muted ink | left 657, top 488 (centred, x 720), **colour #597EB3 at 52 % alpha** | centred; 32.8 px below the wordmark line box (keeps the relationship at other aspects); colour as edited | direct; Night colour flagged |
| 4 | Car caption "McLaren 720S GT3" | shown under the car | **deleted** | remove from the Landing | direct |
| 5 | McLaren | box 697,214 520x320 (pivot ≈ 957.6, 364.5) | box 507,453 426x265, object-fit cover (displayed scale 0.828, centre 720,585.5) | composition, not image scaling: lens-shift centre `restScreenX` 0.665 -> 0.500, `restScreenY` 0.405 -> 0.642; on-screen size x0.828 via `restWidthFraction` 0.29 -> 0.240 and `restHeightFraction` 0.34 -> 0.2815 (camera distance). Pose, elevation, idle and pointer unchanged | direct (runtime translation) |
| 6 | Scroll cue | label 10 px; track 1x30 px | label **13 px**; bar **8x33 px**; position unchanged (bottom-centre) | label 13 px; track 8x33, animated line 8 px wide | direct |
| 7 | Hub START RACE | 196x52, radius 26, centred | **233x65**, radius 26 (unchanged), still centred | `.hub-start` min-width 233, height 65 | direct |
| 8 | Edge controls (sticky note) | Day: white pill, grey icons, brown/gold active | note: "keep it black and blue and white - day and blue and white and yellow and cream - night" | Day: black icons, blue active state on the white pill; Night: navy pill, yellow active, cream icons (Night already close) | direct within scope; scope flagged |

Not changes: the editor's note-box sizes (`w` on the title note), SVG self-closing tags rewritten by the editor, `data-props` re-encoding, `attachments: {}` in the index.

## Interpretations the owner should confirm
1. **GT3 centred.** The edited box is exactly centred (388 + 664/2 = 720) and the label and car sit exactly on x 720, but the text was left-aligned inside the box, so on the canvas the glyphs sat about 22 px left of centre. Implemented as centred.
2. **"A Grand Tour" colour in Night.** The edit is a fixed colour (not theme-aware), so the canvas showed the same blue on navy. Implemented literally in both themes. Contrast is low in both (about 2:1 on white, under 2:1 on navy) for 12 px text.
3. **Control colours: Landing/Hub only.** The same controls appear in the accepted Phase 3 Tour HUD. Applied in the Landing world (Landing + Hub) only; extending them to the Tour is the owner's call.
4. **Scroll bar shape.** Drawn square-ended, 8 px wide; implemented as drawn.

## Runtime feedback (owner message 2026-10-30; the live app is the authority)
No visible graphic fade into white or navy. The camera physically pushes into the McLaren's surfaces until the car overtakes the viewport. Day: a bright/white region or reflection fills the frame and resolves into the pure-white Hub field. Night: a dark/deep-blue region (the blue paint) fills the frame and resolves into the navy field. Spatial continuity, convincing motion, smoothness; reversible and scroll-controlled; subtle support allowed, but the car's surface and the camera carry the transition. Inspect the geometry before choosing; the old headlight target need not stay.

## Implementation status (2026-10-30, p4-landing)
IMPLEMENTED and machine-VERIFIED; not HUMAN-ACCEPTED.
- Items 1-6 + runtime transition: Sol @ high, `94f4a79` (evidence `m4:local/evidence/t1/`, report `REPORT.md`). GT3 ink centre 720 px at 1440x900, label gap 32.81 px, car pivot (720, 577.8) at 0.828x; no collisions at 1280x800, 1920x1080, 2560x1080 (wide aspects cap the type at 39.824vh). Caption removed; cue 13 px / 8x33 px.
- Items 7-8: GLM 5.3 Flash Free, `43274b1` -> integrated as `df096ba`. Hub 233x65 r26; Landing-world controls Day `--accent #597eb3`, near-black inactive; Night unchanged; **Tour HUD unchanged** (Luna check).
- Transition: Day pushes onto the white front-fender livery, Night onto the adjacent blue paint (points chosen by ray hits on the real GLB, `geometry.json`); camera stops 8 mm off the paint; the `#landing-resolve` DOM gradient is removed. Support: exposure, plus a paint-fragment-only colour match over progress .93-.96 (largest correction 6/255 Day, 19/255 Night); every canvas pixel is exactly the field colour from .96, before the Hub appears at .965. Forward/reverse frames pixel-identical.
- Harnesses on `94f4a79`: build, flow 15/15, Landing/Hub profile parity 58/58 (tolerances unchanged). GLM's change is CSS-only, identical in both profiles: evidence reused, not rerun.
- Captures: `m4:local/evidence/t3/` (Luna @ medium, `df096ba`): composition Day/Night at 1440x900, 1280x800, 1920x1080; Hub; numeric control/button checks; canvas assets refreshed (`assets-v2`) and published to the canvas (version 79: car renders and transition stills only).

Still for the owner: interpretations 1-4 above; motion feel and close-up softness under natural scrolling; the responsive height cap on wide screens; the low-contrast label.
