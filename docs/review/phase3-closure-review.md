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
- **Confirm in use** (both already chosen on 10-09): sweep in Day and Night; the Day crossfade / Night pulse feel.

## 7. Look at: HUD

- **Top-left consolidated block:** heavier name/headline/spec weights with a theme-aware halo, one ink colour, no enclosing card.
- **Centred "Scroll to race" prompt** with a thicker indicator at bottom centre. The one-time "Scroll up to reverse" cue is gone.
- Removed: the "Ten machines" eyebrow and the reduced-assets wording (now "Route ready").
- **Decide:** legibility and treatment in Day and Night throughout.

## 8. Degraded readiness

A degraded start label names only the aggregate state, not the cause; audio, model and GPU phases each have their own deadline. If a degraded start recurs, the separator is the per-phase snapshot — in the console, run `copy(JSON.stringify(window.__gt3.readiness))` and keep the result. Do not change timeouts from the label alone.

## 9. Verification status

All machine checks PASS. Evidence: run job folder.

| Check | Result | Tested SHA |
|---|---|---|
| Integrated mesh pro/p1/p2 + wheel normalisation | PASS | 0bff493 |
| Facility static mapping / finish / mesh | PASS | 0bff493 |
| Final build + bounded endpoint model | PASS | 9e27a72 |
| Tyre seating: pro/P1/P2, all 390 samples | PASS | 0afc419 |
| Full terrain matrix 48 points + targeted final 15 | PASS | caa2560 / 0afc419 |
| HUD: all 15 scenarios | PASS | 9e27a72 |
| Scroll: default/cap/pace, all 8 traces per mode | PASS | 9e27a72 |
| Facility persistence: all 5 cases | PASS | 0abc3b6 / ee9869e |
| Facility neutral line / finish / reverse / silent refresh + captures | PASS | 9e27a72 |
| Facility checkpoints + all 9 cold gates both ways | PASS | ee9869e |
| Facility pre-ready input + crossing SFX | PASS | ee9869e |
| Facility theme swaps: Day-start + Night-start | PASS | ee9869e |
| Facility healthy-load smoke: both variants | PASS | ee9869e |
| Before perf, r1 runtime 8795519 | PASS | 8c09ce6 |
| After perf: default / look=p1 / look=p2 | PASS | ee9869e |
| P1 curb hotspot: three warm repeats | PASS | 9e27a72 |

Product code at merge `fb99921` is identical to the final verified `9e27a72` (docs-only difference).

What Sol fixed:

- Harness/environment: IPv4 bind (server advertised localhost, harness used IPv4), false-PASS scroll harness (errors now fatal, true cap default and Tour distance), stale persistence fixture (seed incoming document before app reads), host interruption (pageout/swapout, EXIT 143 — not app defects).
- Real app fixes: tyre seating fitted to local road grade outside deliberate curb use; closed-seam tyre wrap at t=0/1 (worst errors ~0.5 cm vs 1 cm limit).
- Real app fix: exact finish at the endpoint under bounded pace — physical endpoint input passes through the 55 m credit bound; all modes finish exactly at 1 and reverse naturally.

Perf verdict: no meaningful difference in observed steady frame pacing (1280×800 DPR1, controlled Lexus, six positions, 2 s idle / 3 s motion; p95 = median of the six window p95s).

| Product | Calls | Triangles | Idle p95 median (ms) | Motion p95 median (ms) |
|---|---:|---:|---|---|
| Before r1 | 500 | 853394 | 33.3 | 33.3 |
| After default | 509 | 845008 | 33.3 | 33.4 |
| After p1 | 509 | 845096 | 33.3 | 33.4 |
| After p2 | 509 | 844896 | 33.4 | 33.4 |

Not machine-verifiable (yours): all look and feel in items 2–7, Night appearance, real wheel/trackpad feel.

## 10. Still open for you

- Every subjective choice in items 2–7.
- Whether the camera-stillness shortfall needs a small correction.
- 512-px Tour textures acceptable or not (full-quality Showcase stays Phase 6).
- Startup time and the `compileAsync` keep-or-revert.
- Final Phase 3 acceptance.

After approval: choices recorded in SPEC, losing params / `edge` / `quiet` / dev labels removed, then push and merge — on your authorisation only. Nothing happens before then.

## 11. Visual checklist

1. `/` vs `?look=p1` vs `?look=p2` (vs `?look=r1` / `?look=base`): car/road proportion.
2. Width hierarchy at the start/finish corridor, hairpin t≈0.283, chicane t≈0.365, slowdowns 1–2.
3. Curb placement and white edge lines; no centre line.
4. Racing-line feel through linked corners; calm straights.
5. Grid start P1 vs `?grid=p2`; the first gantry pass does nothing; the return completes the Tour.
6. Gantry with flags vs `?gantry=plain`; signals on the final approach.
7. Furniture density, full vs `?props=lean`; braking-board numbers readable from the camera.
8. Sweep gate effect in Day and Night.
9. Day crossfade vs Night pulse swap.
10. Top-left HUD legibility over terrain in both themes; centred "Scroll to race".
11. Night looks unchanged otherwise.
12. Note the captures in the job folder `p3c-sol-fac-captures/` (paths in the Sol report).
