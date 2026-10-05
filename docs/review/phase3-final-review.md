# GT3 Phase 3 — final live review package

**Review build:** `phase3-integration`, audited at `19dace5` (19dace50f6c31057f4ffd93355a9573f912b6c3e). Later commits on the branch are documentation only, so `src/` is identical from `360294a` (where the final W6C browser evidence was taken) through `19dace5` and the handoff head. **Nothing is merged to `main`. Phase 4 has not started.** Every decision below is yours; none has been pre-picked.

## How to run
```
cd ~/Desktop/gt3/.claude/worktrees/phase3b-aerial-camera
git diff --stat 360294a HEAD -- src   # should print nothing (same product code as the evidence)
npm run dev                     # → http://localhost:5173/
```
- The start screen shows loading progress. Once it reads ready, scroll with a wheel or trackpad to begin.
- Review options are URL query parameters. They combine, for example `/?comp=b&cam=soft&scroll=pace&gate=quiet`, and survive a refresh. A small grey label at the bottom centre names the active composition and camera.
- Refresh keeps your route position, discoveries, theme and audio settings for the browser session. A **new** tab or window starts fresh; Chrome's *Duplicate tab* copies the session and resumes it. Refreshing at the finish restores the finish card only. To start over, use Replay or a new tab.
- Use a desktop window. With any `cam=` option, the first time a window shape is used the camera path is recomputed, a one-off 0.75–3 s pause (typically about 1–1.5 s).

### What is new by default, with no parameters, since your 09-28 walkthrough (Cloud audit F1)
No parameters keeps today's **camera, road/path and scroll law**. These changes are on by default and have no "old" switch:
- Gate response: a restrained sweep along the gate (`?gate=quiet` turns it off). This replaced the old morph pulse and particles.
- All ten cars are warmed on the GPU before the Tour unlocks, so the first crossing is smooth. Startup changed as a result; see item 8.
- Tour textures are 512 px (item 7).
- Larger circuit map; bottom-left car info; a one-time "Sound" cue; `+`/`×` launcher; sun/moon Day/Night control that moves aside when the player opens (items 5 and 6).
- Route position persists across refresh.
- Legacy turn chevrons removed.
- The model decoder is self-hosted, so the app works offline.
- Three cars (McLaren, Nissan, Lexus) are now levelled so all four wheels touch the road. They were nose-up.
- Steering wheels are excluded from the wheel-spin set. In fact the spin set is empty for every car, so **no wheels spin at all**. This predates Phase 3 (Cloud audit 2, A6) and is listed under Known limits.

---

## 1. Camera — `?cam=` (SPEC §15, §30.9 gate 1)
SPEC §15 wants two things at once: "through a tight corner sequence the camera barely moves while the car visibly changes orientation and position", and "the hero car must never become tiny". **No camera option satisfies both** (Cloud audit F3). The measurements show a frontier between camera stillness and hero size or pan calm. Either pick a point on it, or accept a SPEC deviation and say which half yields.

| URL (shown with `comp=b`) | Camera vs car travel, hairpin / chicane (lower = stiller) | Hero length, % of frame width | Meets §15 "barely moves"? | Meets "never tiny"? | Notes |
|---|---|---|---|---|---|
| `/` (default) | 0.91 / 0.98 | 5.3–6.5 % | **no** | yes | today's close chase camera |
| `/?comp=b` (leg 1) | 0.85 / 0.95 | 4.9–6.1 % | **no** | yes | wider sector camera |
| `/?comp=b&cam=glide` | 0.88 / 0.84 | 2.0–2.8 % | **no** | borderline | calmest motion |
| `/?comp=b&cam=soft` | **0.38 / 0.40** | 1.2–1.7 % | mostly | **at risk** | middle ground; the hero is **hard to see at Night** |
| `/?comp=b&cam=hold` | **0 / 0** | 1.6–2.3 % | yes in corners | **at risk** | pans **~3× car speed** between corners; on a 4:3 window the chicane hold is skipped |
| `/?comp=b&cam=wide` | **0 / 0** | **0.8–1.4 %** | yes | **no** | the hero is tiny; the combined hold needs window aspect ≥ 1.62 |

- Hero % comes from the browser matrix run at `da67f54` (`w2/matrix-final.json`). The camera and composition code is unchanged since. The only later change affecting the car is the sub-degree wheel levelling of three models. Node geometry gives slightly wider ranges (see `docs/review/w2-leg3/`).
- **Only lever on hero size:** `&hero=<1.0–3.0>`. It is a dev override, not a measured candidate. Raising it also shrinks the racing line on b and the road-to-car ratio. For example, `hero=2.5` gives about 2.8 road widths and a ±2.6 m line.
- **Compare:** drive slowly through the turn-5 hairpin and the turns 6–7 chicane, forwards and backwards, in Day and Night. **Judge the camera together with your scroll choice (item 3):** a hold or wide pan moves about 3× route speed, so its feel depends on how fast the route moves.
- **Decide:** which camera to keep, or which change to make, such as a larger hero or a different balance on the soft frontier.

## 2. Road width / hero path — `?comp=` (§15, §17, §30.9 gate 2)
| URL | Road | Hero scale | Path | Road width in hero widths (median) | Min. edge gap |
|---|---|---|---|---|---|
| `/?comp=a` | 9.6 m | 1.7× | centreline | **2.83** (below §15's "3–4" starting reference) | 2.27 m |
| `/?comp=b` | 14 m | 1.9× | racing line ±3.4 m | 3.69 | 0.74 m |
| `/?comp=c` | 12 m | 1.8× | racing line ±1.9 m | 3.34 | 1.39 m |

- Road coverage of the frame falls from about 29 % (default) to 4–7 % in the far cameras.
- **Judge:** whether the narrower road still reads as a plausible circuit, and whether the racing line (b, c) looks believable, with no weaving.
- **Decide:** a, b or c.

## 3. Scroll pace — `?scroll=` (§14 bounded pace, §30.9 gate 3)
| URL | What it does | Meets §14 "bounded pace"? |
|---|---|---|
| `/` | today's behaviour: one 2500 px fling travels ~850 m | **no** (unbounded) |
| `/?scroll=cap` | speed ceiling + max lead; one fling ~125 m | partly: gentle, normal and aggressive input all run at the **same** ceiling speed (ratio 1 : 1 : 1), so "gentle scrolling moves slower" fails at normal input rates |
| `/?scroll=pace` | input intensity sets a calm pace band (0.67 : 1 : 1.26); one fling ~113 m; stops promptly | yes, by design |

- **§14's +30–50 % distance/time between progression events:** gate spacing is +8.3 % by distance. The time increase comes only from cap/pace:
  - light input: about +54 %;
  - normal input: gates arrive about **6–8× slower** than today's default (≈0.4 s → ≈2.4–3.2 s).
- **Visible behaviour to try on purpose:** in cap/pace, any single gesture moves at most 55 m. That includes one big mouse-wheel burst, keyboard End/PageDown, and a scrollbar drag. Afterwards the page scrollbar re-syncs to the car, a small "snap back" of the scrollbar.
- Real trackpad momentum hasn't been tested by machine.
- **Decide:** default, cap or pace, and whether the speed band should be faster or slower.

## 4. Gate traversal response — `?gate=` (§18, §30.9 gate 4)
`/` = restrained sweep along the gate; `/?gate=quiet` = none. Cross several gates both ways. **Decide:** sweep or quiet.

## 5. Bottom-left car information (§20, §30.9 gate 5)
Two lines per car, from existing car data only. "(BoP-dependent)" is shown as "· BoP".

| car | line 1 | line 2 |
|---|---|---|
| Lexus | A front-engined outlier built for long races | 5.4 L naturally aspirated V8, 90° · ≈540 hp · BoP |
| Nissan | The road-bred silhouette that crossed continents | 3.8 L twin-turbocharged V6, 60° · ≥550 hp · BoP |
| Audi | A customer-racing benchmark refined through endurance | 5.2 L naturally aspirated V10, 90° · Up to 585 hp · BoP |
| BMW | Long-wheelbase composure for the endurance era | 4.4 L twin-turbocharged V8, 90° · Up to 585 hp · BoP |
| Mercedes | A large-capacity V8 shaped by endurance | 6.2 L naturally aspirated V8, 90° · ≈550 hp · BoP |
| Ferrari | Maranello's defining GT3 platform of the turbo era | 3.9 L twin-turbocharged V8, 90° · ≈600 hp · BoP |
| McLaren | Carbon architecture translated into customer racing | 4.0 L twin-turbocharged V8, 90° · ≈500 hp · BoP |
| Aston Martin | A front-engined Vantage for the global grid | 4.0 L twin-turbocharged V8, 90° · ≈535 hp · BoP |
| Lamborghini | The final Huracán evolution for GT3 racing | 5.2 L naturally aspirated V10, 90° · ≈570 hp · BoP |
| Porsche | The rear-engined reference, redrawn for 2023 | 4.2 L naturally aspirated flat-six · Up to 565 hp · BoP |

Captures: `w5/day-tour-bottomleft.png`, `w5/night-tour-bottomleft.png`, `w5/narrow-1101-*`. **Decide:** keep, change or cut.

## 6. HUD and edge controls (never reviewed by you)
- Map +15 % (170 px).
- `+`/`×` launcher.
- Sun/moon Day/Night pill that slides aside when the player opens.
- One-time "Sound" cue on first Tour entry while audio is off.
- The first-use forward/reverse **direction cue**, which you haven't seen yet.
- Top-left manufacturer marks are **not shown**: no logo assets exist, and you need to supply or approve them (§20, §30 item 8).

Captures: `w5a/`, `w5/`. **Decide:** acceptable or not.

## 7. Textures, and the Showcase deferral (W8) — two decisions
- **Tour textures are 512 px,** cutting texture memory from 817 to 288 MiB. Look closely at the cars while driving. **Decide:** acceptable or not.
- **Showcase full quality is deferred (proposal, Cloud audit F6).** Showcase and the manual-unlock montage currently clone the same 512-px cars. Both are unreachable until Phase 6, so loading full-resolution models for them was **deferred to Phase 6** rather than built now with no user. The requirement is recorded in SPEC §30 item 10. **Decide:** confirm the deferral, or ask for it now.

## 8. First crossing and startup
- **First crossing:** zero new GPU work at the first gate in every run. Cold-crossing frame times (6 headless contexts at the final head):
  - In the 4 contexts with no swap activity: p50 16.7 ms, p90 33.4 ms, p99 33–67 ms, worst frame 50–83 ms, **no frame over 100 ms**.
  - The only 133 ms frames came in the 2 contexts with swap activity.
- **Startup:** median time to ready.

  | Build | Ready, median (range) | Host |
  |---|---|---|
  | 602c462 (before any GPU warm-up) | 8.8 s | clean, solo |
  | ea95055 (warm-up budget; final head minus the two fixes below) | 14.5 s (14.4–14.6) | clean, solo |
  | 8b59a7b (pre-`compileAsync`) | 25.4 s (23.3–27.4) | host-contaminated |
  | Final head (af8d13e, with `compileAsync`) | 28.3 s (23.5–33.0) | host-contaminated |

  - The last two runs are host-contaminated: the machine was swapping. Only their relative order means anything.
  - **`compileAsync` warm-up preparation** (audit F7, `ad9c746`) is verified correct: load recovery 9/9, zero first-crossing allocations. **It showed no startup gain**, and was about 3 s slower in both contaminated rounds.
  - **My recommendation: revert `ad9c746`.** It adds complexity without a measured gain. Its parallel compile runs per car, which limits overlap. The run doesn't record which path executed, so headless checks may only have exercised the fallback (Cloud audit 2, A2/A4). Reverting returns to the warm-up code verified at ea95055 (14.5 s, clean); the wheel-classifier fix stays.
  - **What I need from you:** say "revert compileAsync" and I'll apply it with `git revert` and re-run the warm-up checks. My earlier attempt was blocked by the permission system, so this needs your explicit OK. The remaining cost is warming every car on the GPU before the Tour unlocks, which is what makes the first crossing smooth.
- **Decide:** whether the first crossing feels smooth, and whether this startup time is acceptable.

## 9. §30.6 grass over the road
- Machine sweep at the final head: **0 terrain hits between camera and car** in every configuration checked.
  - 101 route points: default, a × {leg1, glide, hold, wide, soft}, b × {leg1, glide}.
  - 62 route points, dense at the hairpin, chicane and the old McLaren→Aston section: b × {hold, wide, soft}, c/soft, b/wide at 16:10, b/hold at 4:3.
  - c × {leg1, glide, hold, wide} were skipped intentionally (lean verification). **If you pick `comp=c` with any camera except `soft`, that combination is swept before §30.6 is retired.**
- **Decide:** visually confirm the old McLaren→Aston section (route ≈0.63–0.70), so the item can be retired.

## 10. Overall Phase 3 acceptance and the SPEC classification
- Confirm the SPEC classification gate (MASTER_CONTEXT Next 1). There is no recorded approval yet.
- Then approve or reject Phase 3.
- **After approval:** I record your choices in SPEC (§30.9 entries removed, body updated), remove the losing candidates and the dev label, and merge Phase 3 to `main`.
- Nothing is merged before then.

---

## Evidence (final head unless stated)
| Check | Result |
|---|---|
| Build; wheel-ground (node); default camera bit-exact vs pre-W2 | PASS |
| Smoke (default and composed params); offline load (no internet) | PASS |
| Load recovery (9 fault cases incl. warm-up throw and timeout) | 9/9 PASS |
| First crossing: new GPU work at the first gate | 0 in all 6 contexts |
| Checkpoints / gate swap (Day + Night) | 10/10 / PASS, 0 GPU allocations |
| Route persistence (exact silent restore, query kept, new tab fresh, finish-state refresh) | PASS |
| Hero pivot: 4 compositions × 10 cars × 8 route points | PASS; all wheels level within 0.4 cm |
| §30.6 occlusion (lean set, see item 9) | 0 hits |
| Scroll (default/cap/pace, sound on and off); controls; HUD (14 scenarios) | PASS at da67f54. Since then only `main.js`/`startScreen.js` (finish-restore path), `carWarmup.js` and `cars.js` changed. Scroll, HUD and controls modules are untouched, and the changed start/restore paths were re-verified at the final head (smoke, route persistence incl. no sound cue). |
| W2 browser matrix: 16 comp×cam rows, 4 aspects, resize, fallback | PASS (at da67f54; final-head spot captures in `w2/final-check/`) |
| Startup | clean solo 14.5 s at ea95055 vs 8.8 s baseline; final head with `compileAsync` not cleanly measured (see item 8) |

Folders: `w6/` (regression), `w2/` (camera matrix, captures), `startup-final2/` (startup), `run-packet/` (closure audit, ledger). In git: `docs/review/` (W2 legs 2–3, this file). Cloud reviews: branches `p3-cloud-review-w2` and `p3-cloud-audit-final`.

## Known limits and notes (not blockers)
- In `?cam=` modes, the first resize to a new window shape stalls 0.75–3 s while the camera path is recomputed. Cached afterwards.
- Scrollbar thumb-hold detection only covers classic scrollbars. With macOS overlay scrollbars, a held thumb can re-sync after 0.14 s (cap/pace only).
- Fonts are trial files and are gitignored, so a clean clone builds without them.
- The model decoder is copied from three r180. Re-copy it if three is upgraded.
- 4 unexplained page-loss flakes occurred under heavy host load during automated runs. All reran clean.
- **Wheel spin is inert for every car.** The spin-mesh finder matches only mesh names, while wheel identity lives on parent nodes. This predates Phase 3 and isn't fixed here.
- A restored route position sets the route car but doesn't reconcile `unlocked` with the gates passed. It's invisible in Phase 3 and becomes relevant in Phase 6 (Showcase).
- The new wheel classifier needs delimited names (`Wheel_FL`, not `FrontWheel`). The shipped models are fine; add a test fixture before adding a model.
- The finish-restore check's "no sound cue" assertion would pass anyway, because the cue was already shown once in that session. The start-screen assertions do test the fix.
- All browser evidence comes from headless Chrome on this Mac, not your GPU.
