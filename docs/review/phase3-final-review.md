# GT3 Phase 3 — final live review package

Branch `phase3-integration` (this file is committed with the final candidate; the review copy lives at `~/Desktop/gt3-review-2026-10-04/README.md`). Capture and evidence paths below (`w2/`, `w5/`, `w5a/`, `w6/`, `startup-final/`, `run-packet/`) are relative to that local review folder and are not in git. **Nothing is merged to `main`. Phase 4 has not started.** Every choice below is yours; no candidate has been picked for you.

## How to run
```
cd ~/Desktop/gt3/.claude/worktrees/phase3b-aerial-camera      # branch phase3-integration
npm run dev                                                   # → http://localhost:5173/
```
- The start screen shows loading progress; once it is ready, scroll (wheel or trackpad) to begin.
- Review options are URL query parameters. They combine freely, e.g. `/?comp=b&cam=soft&scroll=pace&gate=quiet`, and survive a refresh. When a composition option is set, a small grey label at the bottom centre names it.
- **No parameters = today's baseline on every axis.**
- Refresh keeps your route position, discoveries, theme and audio settings for that browser session. A new tab or window starts fresh at the beginning.
- To go back to the start: finish the lap and press Replay, or open a new tab.
- Use a desktop window at 16:9 or 16:10. The first time a window shape is used with a `?cam=` option, the camera path is recomputed, which costs a one-off 1–1.5 s pause (see item 1).

---

## 1. Camera / world / road / car scale — `?cam=` (SPEC §15, §30.9 gate 1)
SPEC says that through a tight corner "the camera barely moves while the car visibly changes orientation and position", and that "the hero car must never become tiny". The geometry measurements show you cannot fully get both at once. Each option trades camera stillness against hero size and pan calm.

| URL (all with `&comp=b`; swap in `a` or `c`) | What it is | Camera vs car travel, hairpin / chicane | Hero length, % of frame width | Notes |
|---|---|---|---|---|
| `/` (no params) | today's camera, 54 m away | 0.91 / 0.98 | 5.3–6.5 % | follows the car closely |
| `/?comp=b` (leg 1) | wider sector camera, 140 m | 0.85 / 0.95 | 4.9–6.1 % | still follows through corners |
| `/?comp=b&cam=glide` | smooth broad rail, 240 m | 0.88 / 0.84 | 2.0–2.8 % | calmest motion; still follows |
| `/?comp=b&cam=soft` | corner-weighted rail, 400 m | **0.38 / 0.40** | 1.2–1.7 % | the middle ground; the hero is small, and **very hard to see at Night** |
| `/?comp=b&cam=hold` | fixed observation point per corner, 320 m | **0 / 0** | 1.6–2.3 % | still through each corner, but pans **quickly (~3× car speed)** between them; on a 4:3 window the chicane hold is skipped |
| `/?comp=b&cam=wide` | one fixed point for the whole complex, 440 m | **0 / 0** | **0.8–1.4 %** | the hero becomes tiny; the combined hold needs a window aspect ≥ 1.62 |

- **To compare:** drive slowly through the turn-5 hairpin and the turns 6–7 chicane, forwards and backwards, in Day and Night. Judge how calm the camera feels, how much the world moves, how prominent the car is, and how fast the camera pans between corners.
- **Optional hero-size probe** (a dev override, not a candidate): add `&hero=2.5` to any `cam` option. Hero size is the only lever on car prominence in the far views.
- **Captures:** `w2/` — one folder entry per comp/cam, named `<comp>-<cam>_<place>_<theme>`; chicane frame sequences `b-*_chicane-seq-*`. Numbers: `w2/matrix-final.json`.
- **Background:** `docs/review/w2-leg3/README.md` (Sol's engineering report) and `docs/review/cloud-opus-w2-review.md` on branch `p3-cloud-review-w2` (an independent review).
- **Decision needed:** which camera option, or what to change (for example a hero size).

## 2. Road width / hero path — `?comp=` (§15 hero-car path, §17, §30.9 gate 2)
| URL | Road | Hero scale | Path |
|---|---|---|---|
| `/?comp=a` | 9.6 m (narrow) | 1.7× | centreline |
| `/?comp=b` | 14 m (today's) | 1.9× | racing line ±3.4 m |
| `/?comp=c` | 12 m | 1.8× | restrained racing line ±1.9 m |

- Combine any of these with a `cam=` option from item 1.
- Measured clearance: every car always stays on the road; the minimum edge gap is a 2.27 m, b 0.74 m, c 1.39 m.
- **Decision needed:** which road width and path, and whether the narrower road still reads as a plausible circuit.

## 3. Scroll pace — `?scroll=` (§14 bounded pace, §30.9 gate 3)
| URL | Behaviour |
|---|---|
| `/` | today's behaviour: one big fling launches the car (about 850 m from one 2500 px fling) |
| `/?scroll=cap` | speed ceiling plus bounded lead; excess input is discarded (about 125 m for the same fling) |
| `/?scroll=pace` | input intensity sets a calm pace band; stops promptly (about 113 m) |

- Try a mouse wheel and a trackpad: slow, fast, sustained, flings and reversals. Real trackpad momentum hasn't been tested by machine.
- **Related SPEC point (§14, ~30–50 % more distance/time between progression events):** gate spacing is +8.3 % by distance over the old coins. The time increase reaches +54 % or more only under `cap` or `pace`, so meeting §14 depends on this choice.
- **Decision needed:** which pace model, and whether the speed feels right.

## 4. Gate traversal response — `?gate=` (§18, §30.9 gate 4)
- `/` = the default restrained sweep along the gate; `/?gate=quiet` = no sweep.
- Cross a few gates forwards and backwards.
- **Decision needed:** sweep or quiet.

## 5. Bottom-left car information (§20, §30.9 gate 5)
- Two lines per car, drawn only from the existing car data. Full list: `w5/car-info-lines.md`. The spec line shows "(BoP-dependent)" shortened to "· BoP".
- **Captures:** `w5/day-tour-bottomleft.png`, `w5/night-tour-bottomleft.png`, and the narrow-window `w5/narrow-1101-*`.
- **Decision needed:** keep, change or cut the content.

## 6. HUD and edge controls (W5a/W5b — not a separate §30.9 gate, but never visually reviewed)
- The circuit map is 15 % larger.
- The launcher shows `+` and changes to `×`.
- The Day/Night control is now a sun/moon pill, and it moves aside when the player opens.
- A one-time "Sound" cue appears on first Tour entry while audio is off.
- **Captures:** `w5a/` (Day/Night × player open/closed) and `w5/`.
- **Decision needed:** whether the look and feel are acceptable.

## 7. Tour 512-px textures (W4c)
- The Tour uses 512-px textures to save memory: texture memory dropped from 817 to 288 MiB.
- Look closely at the cars during the Tour.
- Showcase will load full-quality models in Phase 6. That is a recorded requirement; nothing about Showcase is verified now.
- **Decision needed:** whether the Tour texture quality is acceptable.

## 8. First-crossing live feel and startup
- The first gate crossing measured zero new GPU work in every run.
- Startup (solo, clean host, 3 rounds): **14.5 s** to ready at the final head, against 16.5 s before the warm-up budget fix and 8.8 s at 602c462 (before any GPU warm-up existed). Zero frames over 100 ms after the start screen in every run. Evidence: `startup-final/results.json`.
- **Decision needed:** whether the first crossing feels smooth, and whether the startup time is acceptable or needs another pass. The remaining cost is warming every car on the GPU before the Tour unlocks, which is the price of a smooth first crossing.

## 9. §30.6 grass over the road
- Machine sweep: no terrain between the camera and the car at 101 route points, for the default, b/soft and b/wide cameras.
- **Decision needed:** a visual confirmation of the old McLaren→Aston section (route ≈ 0.63–0.70), then this item can be retired.

## 10. Overall Phase 3 acceptance
After items 1–9, approve or reject Phase 3. On approval: a cleanup pass removes the candidates you didn't pick and the dev label, then Phase 3 merges to `main`. Nothing is merged before that.

---

## Machine-verified on the final head (summary)
- Build passes.
- The app loads fully offline: the 3D-model decoder is now self-hosted.
- Load recovery 9/9; checkpoints; gate swap with zero GPU allocations at crossings; controls; HUD.
- Scroll (all modes, sound on and off).
- Route persistence: exact, silent restore, and the URL query survives a refresh.
- First crossing; §30.6 occlusion.
- Aerial camera: constant yaw and pitch.
- §15 hero pivot: uniform scale. The wheel-contact fix levels the McLaren, Nissan and Lexus.
- The full W2 matrix across 4 window aspects, resize and fallback.
- Full evidence: `w6/`, `w2/`, `run-packet/` (closure audit, ledger).

## Not machine-verifiable or not done
Real trackpad momentum; perceived calm, size and feel; Night visibility; manufacturer marks beside the car name (§20: no logo assets exist — you need to supply them).
