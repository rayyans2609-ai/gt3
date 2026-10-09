# GT3 Phase 3 closure — live review package

Product owner review. Open the app and judge visually. Nothing here picks a winner or claims visual quality — only facts, exact URLs, and what to look at. Every decision below is yours. Nothing is merged to `main` before your approval (item 11). Implemented, machine-checked and accepted are kept separate throughout.

## How to run

```
npm run dev   # → http://localhost:5173/
```

- Scroll with a wheel or trackpad once the start screen reads ready.
- Review options are URL query parameters. They combine (e.g. `/?look=p1&grid=p2&props=lean`) and survive a refresh. A new tab starts a fresh session.
- Day/Night toggle sits at the bottom edge. Check each visual decision in both themes.

## 1. What changed since the 10-09 review

- **SPEC reconciled** to your 10-09 decisions (§15, §17–20, §25, §30.9).
- **Track profile + width hierarchy:** an authored per-t cross-section replaces the uniform ribbon.
- **Semantic curbs + continuous white edge lines; centre line removed.**
- **New proportions:** provisional default plus `p1` / `p2` comparisons (item 2).
- **Restrained GT racing line** on the wider road (item 3).
- **Option A grid start:** the car starts on the grid; first gantry pass neutral; Tour completes on the return.
- **Gantry, grid slots, pit wall, furniture** built (items 4–5).
- **Sweep is the default** gate response; swap follows the theme (item 6).
- **HUD legibility, centred prompt, reverse cue retired, legacy copy removed** (item 7).

## 2. Look at: proportions

| URL | Hero scale | Widths (technical / ordinary / braking / corridor) |
|---|---|---|
| `/` (provisional default) | 2.7 | 30 / 32.4 / 36 / 40.5 m |
| `/?look=p1` | 2.55 | 28.33 / 30.6 / 34 / 38.25 m |
| `/?look=p2` | 2.85 | 31.67 / 34.2 / 38 / 42.75 m |
| `/?look=r1` (baseline) | 2.28 | 16 m road |
| `/?look=base` (baseline) | 1.0 | 14 m road, legacy close camera |

- Default hero is 18.4 % larger than r1. Ordinary 32.4 m = 12 m × hero scale; the widest car (Audi 2.82 m) reads 7.62 m, i.e. ~4.25 car widths vs ~2.49 at r1.
- All of `/`, `p1`, `p2` use the kept r1 camera: distance 240 m, FOV 40°, pitch 55.64°. `base` keeps the legacy close camera (54 m, 40°, 52°).
- Curbs, paint, shoulders, checker cells and infrastructure stay at real-world metres in all looks.
- Note: the new looks suppress whole-model bob/roll (no independent suspension rig). The camera-stillness shortfall is unchanged: camera travel is still ~84–93 % of car travel in tight corners.
- **Decide:** default, p1 or p2 — or which values to change.

## 3. Look at: circuit

- **Width map:** 40.5 m start/finish corridor (t .954–1 and 0–.080); 32.4 m ordinary road; 36 m braking approaches (hairpin .234–.310, slowdowns .594–.674 and .700–.768); 30 m technical chicane (.310–.400). Transitions ease at ~1:20.
- **Racing line:** a never-rendered path favouring outside → apex → track-out, with linked-corner compromises and calm straights. Two short curb-contact plateaux: hairpin t≈0.283, chicane t≈0.365.
- **Curbs:** semantic only (entry/apex/exit), 1.2 m standard, 1.8 m at the two contact apices. Twenty spans, e.g. hairpin .244–.320, chicane .327–.397, slowdowns .608–.681 and .701–.779.
- **Edge lines:** continuous white 15 cm lines inside both edges through bends. No centre line. Paved runoff only at the hairpin, slowdowns 1–2; 1.5 m shoulders elsewhere.
- **Where to drive slowly:** the start/finish straight, the hairpin (t≈0.283), the chicane (t≈0.365), slowdowns 1–2 — forwards and back, Day and Night.
- **Decide:** width mapping, curb placement, line restraint.

## 4. Look at: start, grid and finish

- The car starts in a front-grid slot behind the line: P1, 18 m before the line at left 6 m. `?grid=p2` compares: 26 m before at right 6 m.
- The first gantry pass is neutral (no completion, no car change). The Tour completes when the car returns to the gantry after the full lap.
- Ten staggered 3×8 m grid boxes; a broad corridor with a low pit wall and parallel lane strip.
- Gantry: 43 m span, 10.5 m clearance, truss with checker banner, five signal pods per face, two restrained static flags. `?gantry=plain` removes the flags.
- Signals stay off along the lap and ramp green over the final 120 m only.
- **Decide:** P1 vs P2, gantry form/flags, signal timing.

## 5. Look at: furniture

- Nine 150/100/50 braking boards (1.6×2.4 m) before the hairpin and slowdowns 1–2; the old evenly spaced markers are replaced.
- Three barrier runs (hairpin outside, slowdown 1 concrete, slowdown 2 Armco) plus two catch-fence runs; two marshal posts; two short service strips; retained tyre stacks.
- `?props=lean` compares a sparser set: six boards, two barrier runs, no catch fencing, one marshal/service strip.
- **Decide:** inventory and density, full vs lean.

## 6. Look at: gate and swap

- Gate default is **sweep** (0.52 s moving band). `?gate=edge` / `?gate=quiet` remain selectable until cleanup. Forward crossings play the SFX; reverse stays silent.
- Swap default follows the theme at each swap start: **Day crossfade, Night restrained emissive pulse** (no particles). `?swap=crossfade` / `?swap=pulse` force one treatment for comparison.
- **Decide:** gate effect, swap treatments.

## 7. Look at: HUD

- **Top-left consolidated block:** heavier name/headline/spec weights with a theme-aware halo, one ink colour, no enclosing card.
- **Centred "Scroll to race" prompt** with a thicker indicator at bottom centre. The one-time "Scroll up to reverse" cue is gone.
- Removed: the "Ten machines" eyebrow and the reduced-assets wording (now "Route ready").
- **Decide:** legibility and treatment in Day and Night throughout.

## 8. Degraded readiness

A degraded start label names only the aggregate state, not the cause; audio, model and GPU phases each have their own deadline. If a degraded start recurs, the separator is the per-phase snapshot — in the console, run `copy(JSON.stringify(window.__gt3.readiness))` and keep the result. Do not change timeouts from the label alone.

## 9. Verification status

{{VERIFY}}

## 10. Still open for you

- Every subjective choice in items 2–7.
- Whether the camera-stillness shortfall needs a small correction.
- 512-px Tour textures acceptable or not (full-quality Showcase stays Phase 6).
- Startup time and the `compileAsync` keep-or-revert.
- Final Phase 3 acceptance.

After approval: choices recorded in SPEC, losing params / `edge` / `quiet` / dev labels removed, then push and merge — on your authorisation only. Nothing happens before then.

## 11. Visual checklist

{{CHECKLIST}}
