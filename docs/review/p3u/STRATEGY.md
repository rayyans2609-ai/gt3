# Unlocked Experience Optimization Strategy (decision checkpoint)

Run p3u, Opus-led, M4 (`m4-16gb`). Branch `p3u-profiles` @ `90ecf93`. Evidence: [AUDIT.md](AUDIT.md) (T1, Sol @ high) plus manager inspection of its controlled contact sheets. **Status: proposed. No unlocked product code exists. Locked is unchanged and proven pixel-identical to `fa12e92` in 7 compared states.** Every change below applies to `?version=unlocked` only.

Legend: **C** = confirmed by measurement or controlled capture · **S** = strongly supported, not yet decisive · **H** = hypothesis · **O** = owner judgment.

## 1. What T1 established

| # | Finding | Status | Evidence |
|---|---|---|---|
| F1 | The output stage never applies tone mapping or sRGB encoding (no OutputPass; custom post shaders skip it). Day 1.36 / Night 1.13 exposure is inert: exposure 0.1→4 changes **0 channels**; with an output pass, **16.9 M channels** change. | **C** | AUDIT §source, exposure probe |
| F2 | No environment/reflection source exists for any material. | **C** | source + runtime manifests |
| F3 | Native resolution alone sharpens edges and liveries but does **not** make dark cars or Night cars readable. | **C** (controlled sheet) | `cars-native-day-night.png` |
| F4 | Reflections supply the missing body form for all ten cars, including black Lamborghini and Lexus. A scene-wide indoor map also lifts the road and nearly erases Night. | **S** visual, **O** taste | `cars-env-day-night.png` |
| F5 | Turning on the output stage with ACES shifts saturated red toward salmon (Ferrari), lifts road to mid-grey and Night to navy. | **C** observed (manager), cause = ACES hue/tone curve **S** | `cars-recommended` vs `cars-env` |
| F6 | Locked on M4 is already smooth: 10-min, 14 Tours, RAF p50/p95/p99 16.7/17.2/17.6 ms, 0 >50 ms, 0.8/min >33 ms; GPU p50/p99 7.7/14.6 ms; no drift. | **C** (off-screen window, battery) | measurements.json |
| F7 | Combined DPR1.5 prototype (car reflections + output + 1024 textures + 8× aniso) on a 65 s Tour: GPU p50/p99 13.3/15.9 ms, 0 >25 ms (Day); Night 2 >33 ms. DPR2 equivalent: GPU p99 17.8, one 34 ms frame. | **S** (short runs) | AUDIT frontier |
| F8 | Short runs vary a lot: DPR1.5 *baseline* had 26 frames >33 ms, while the heavier DPR1.5 prototype had none. Single 65 s runs cannot choose a configuration. | **C** | AUDIT frontier |
| F9 | Stalls of 83 ms (DPR2 SMAA) and 116 ms (DPR2 + MSAA2 combined) appeared; cause unproven. | **C** observed, cause **H** | AUDIT frontier |
| F10 | Chrome Energy Saver (fresh profile, battery <20 %) caps the page near 30 fps: 33.3 ms median RAF with only 6.6 ms GPU. | **C** | headful-smoke |
| F11 | 1024 px car set: +6.6 MiB download; estimated texture residency 288 → 817 MiB as an uncompressed upper bound; cold ready 3.36 vs 3.00 s (single session). | **S** | assets.json |
| F12 | Cars occupy only ~72–75 × 55–62 CSS px. Texture resolution has limited visible payoff at this size. | **C** | captures-locked.json |
| F13 | Per-pass GPU timers are non-additive on Metal; only whole-chain timing is trustworthy. | **C** | attribution.json |

**Not yet diagnosed:** gradient banding, posterization, clipping, temporal shimmer/flicker, moiré, halos, faceting, z-fighting, HUD presentation, measurements in true full screen, controlled power state.

Hypotheses to test, not assume:
- H1: 8-bit output of *linear* values causes dark-gradient banding in locked.
- H2: SMAA detects edges poorly on linear input.
- H3: grain and motion blur need rescaling at higher DPR to keep the accepted look.
- H4: the F9 stalls are first-use GPU work (programs/uploads) or target allocation.

## 2. Success criteria (ambitious targets, not inflexible proof)

Measured in true full screen (1470×956 @ DPR2), on AC power, Chrome Energy Saver off, harness HUD-on-screen assertion passing, ≥10 min, all ten cars, Day and Night.

- **Bar:** unlocked must be at least as smooth as the locked M4 baseline: 0 frames >50 ms, ≤1/min >33 ms, RAF p99 ≤ ~18 ms, no minute-1 → minute-10 drift.
- **Headroom:** GPU p99 ≤ ~15 ms, so thermal or route variance doesn't push frames over budget.
- **Ambitious:** ≥99 % of frames within one vsync. Strict ≤16.7 ms reads 59 % even for locked because of timestamp jitter, so the metric is "within one refresh ± 1 ms".
- **Render vs presentation:** every >25 ms frame is classified as GPU-bound, main-thread-bound or presentation/compositor using GPU timer + long-task + trace data.
- **Load and memory:** startup to ready no worse than locked + ~0.5 s. No sustained memory-pressure change. Residency reported, not estimated.
- **Locked:** pixel-identical captures vs `fa12e92`, functional checks (swap, finish, Day/Night, persistence), and a locked perf rerun matching F6.
- **Owner:** visual and trackpad acceptance remain yours.

## 3. Workstreams

### W1 — Car readability and reflections (highest impact)
- **Approach:** a car-only, pre-filtered (PMREM) reflection environment. It is built procedurally once at load from an *outdoor* gradient matching GT3's pale maquette world: sky/horizon/ground bands, with no indoor panels. Separate Day and Night strengths, with Night far lower. Original per-car paint parameters are kept.
- **Alternatives:**
  - scene-wide environment (rejected: lifts the road and erases Night, F4);
  - per-car material edits (last resort only, O);
  - a dedicated car fill/rim light (cheaper, but adds lighting direction, O).
- **Benefit:** decisive for Lamborghini, Lexus, McLaren and Porsche at Night (S).
- **Perf risk:** low per frame (env only ~+0.4 ms steady at DPR2, inside noise). There are new shader variants to warm up.
- **Deciding test:** controlled 20-view roster sheets plus a moving clip at 2 strengths (O). The contour-contrast metric on dark cars must rise while body mean luminance stays dark: dark cars must stay dark.

### W2 — Color pipeline and tone (foundation for everything else)
- **Approach:** an unlocked-only output stage (tone map + sRGB encode) placed **before SMAA** (tests H2) and fused with the existing grain/vignette pass, so it costs no extra fullscreen pass. Add an output dither to remove 8-bit banding (H1). Then **look-match**: calibrate exposure per theme so the corrected image keeps GT3's accepted character (road darkness, Night darkness, livery hue and saturation) while gaining smooth darks and readable form.
- **Alternatives** (all in the comparison):
  - ACES (declared today; shifts reds, F5);
  - AgX;
  - Khronos PBR Neutral (designed to keep base colors; likely fixes the Ferrari);
  - keeping the current uncorrected output for unlocked too (no integrity gain).
- **Benefit:** fixes crushed darks and banding, makes exposure work, and gives every later tuning a correct base.
- **Perf risk:** ~0 (F1 delta below noise).
- **Deciding test:** banding metric (distinct levels and step histogram in sky, road and dark-car gradients), hue error of each livery's primary color vs its texture albedo, and the owner comparison (O).

### W3 — Resolution and anti-aliasing (decided late, on the combined configuration)
- **Approach:** fixed DPR, never switching. Candidates are 1.5, 1.75 and 2, with SMAA or scene-only MSAA 2×, chosen **after** W1/W2/W5 are integrated, by 10-min runs.
- **Alternatives:**
  - MSAA 4× (GPU p99 31 ms: rejected unless cheaper after fusion);
  - TAA (ghosting/memory; deferred unless a shimmer defect demands it);
  - dynamic DPR (rejected: resize-hitch history, F9).
- **Benefit:** fine edges, curbs, liveries and silhouettes (F3).
- **Perf risk:** main budget lever: DPR2 + all features sits at the GPU p99 limit (F7).
- **Deciding test:** 10-min frontier for the two finalists, plus a still and moving clarity comparison (O).

### W4 — Image integrity and geometry fidelity (your added workstream)
- **Diagnose first, on locked and unlocked:**
  - banding/posterization (H1), clipping and crushed blacks (histograms);
  - halos and ringing (SMAA/blur edges);
  - temporal shimmer/flicker (frame-to-frame edge energy during a deterministic slow pan);
  - moiré (curbs, fences, grid);
  - geometry: faceting (normal-angle analysis per car mesh), silhouette tessellation, road-edge chords, depth precision and z-fighting (near 0.5 / far 3000 over the route; coplanar decals and curbs), shadow acne/peter-panning.
- **Then apply proportional fixes:**
  - dither (W2);
  - AA choice (W3);
  - mip/anisotropy (W5);
  - depth-range tightening or polygon offset where z-fighting is proven;
  - normal smoothing only where faceting is proven;
  - grain/blur rescaled per DPR (H3) to preserve the accepted look.
- **Benefit:** a cleaner, steadier image, including in motion.
- **Perf risk:** mostly low; flagged per fix.
- **Deciding test:** objective metrics for each defect class before and after. Visual comparison only where a fix changes look (grain, blur, shadow softness).

### W5 — Asset fidelity, warm-up and loading
- **Approach:**
  - use the shipped 1024 px set and 8× anisotropy where oblique surfaces benefit;
  - extend the existing warm-up to the new programs and textures;
  - **compare full vs staged prewarm.** Full: all ten cars GPU-ready before interaction. Staged: current + next car at full quality, the rest uploaded during calm route segments, never on a gate crossing;
  - measure real residency (GPU process memory), startup to ready, and swap-window frames for both.
- **Alternative:** KTX2/Basis compressed textures (much lower residency; adds a decoder and pipeline work; only if residency proves a problem).
- **Benefit:** sharper liveries/decals, though limited by car size (F12). Removes first-use stalls (H4).
- **Perf risk:** memory (F11) and startup time.
- **Deciding test:** the residency/startup/swap table for full vs staged, plus a 2-car still comparison (O only if visibly different).

### W6 — Sustained smoothness
- **Approach:**
  - harden the harness: true full screen, no automation banner, HUD on-screen assertion, power and Energy Saver state recorded;
  - 10-min runs for each finalist, Day and Night;
  - attribute every >33 ms frame (H4, F9);
  - buy budget only where needed: fused post passes (W2), shadow-map settings at equal coverage, skipping work when stationary;
  - no quality cuts without evidence.
- **Benefit:** your actual priority #1.
- **Deciding test:** the §2 bar plus your trackpad session.

### W7 — Locked protection (continuous)
- Every unlocked branch reads `UNLOCKED` once, and locked code stays textually identical.
- Each integration step runs:
  - the 23-state determinism diff vs `fa12e92`;
  - default = `?version=locked` checks;
  - functional checks (swap, finish, Day/Night, persistence, pre-ready input);
  - a locked perf rerun at the end.
- Capture noise is classified, not treated as a regression (F8).

### W8 — HUD presentation (evidence first)
- Native-resolution captures of the HUD over the moving scene, a check of text and edge crispness, and a check of DOM-over-canvas compositing cost in traces.
- Change something only if evidence shows a technical defect. No new HUD features or layout changes.

## 4. Sequence

1. **First: foundation and car readability (W2 + W1 + W7, with W6 harness hardening in parallel).** These are the two confirmed root causes and the largest visible gain. Every later calibration (exposure, AA, banding, grain, shadows) depends on the final color pipeline, so tuning resolution or textures first would be re-done. **Gate:** your comparison set C1 (tone mapper and look-match) and C2 (reflection strength).
2. **Second: fidelity and integrity on the chosen look (W4 + W5 + W3 frontier).** Diagnose defects, apply proportional fixes, compare prewarm strategies, then narrow DPR/AA to two finalists using the combined cost. **Gate:** C3 (DPR/AA clarity, still and moving) and C4 (grain/blur scaling) only if the look changes.
3. **Third: sustained smoothness and closure (W6 + W8 + W7 final).** 10-min finalist runs, stall attribution and fixes, HUD audit, full locked regression, then your trackpad session and the review package (20-view roster, moving recordings, hardest cars first).

## 5. Your comparison set (kept small)

| Set | What you choose | Form |
|---|---|---|
| C1 | Output look: locked · ACES · AgX · Neutral, each look-matched | 4 cars (Lamborghini, Lexus, Ferrari, BMW) + one wide road view, Day and Night |
| C2 | Car reflection strength: 2 levels | same views + a 10 s moving clip |
| C3 | Resolution/AA: two finalists | stills + moving clip at a curb-heavy section |
| C4 | Grain/blur scaling (only if visible) | moving clip |
| Final | Whole unlocked vs locked | 20-view roster, recordings, your trackpad |

Routine parameter tuning inside an approved direction does not come back to you.

## 6. Delegation

| Work | Owner @ effort | Why this route |
|---|---|---|
| Seat, integration, look-match targets, comparison design, acceptance judgment | **Opus @ high** (Anchor: look-match calibration targets; reserved: final integration verdict) | Cross-system and aesthetic consequence; small code footprint |
| Stage 1 engineering lead: profile plumbing, output stage + fusion + dither, car PMREM, warm-up of new variants, comparison toggles | **Sol @ high** | Coupled render-pipeline work. Sol owns T1 context. Retries at a weaker tier would cost more |
| Harness hardening (full screen, banner, HUD assert, power/Energy Saver logging); local comparison viewer page | **Muse** (free) | Bounded scripts with a clear contract; separate files from Sol |
| Integrity metrics: banding, hue error, temporal flicker, contour contrast, residency probe | **Terra @ medium** | Clear spec; correctness matters; Codex-native |
| Stage 2 integrity fixes, W3/W5 engineering; Stage 3 stall attribution | **Sol @ medium → high** where uncertain | Rendering/perf diagnosis |
| Capture batches, 10-min runs, sheets, locked regression runs | **Luna @ medium** (or scripts directly) | Mechanical, scripted |
| Claude workers (Sonnet/Haiku) | none planned | No positive reason; protect Claude capacity |

- DeepSeek/Token Harbor is not authenticated on the M4, so that lane is unavailable.
- Browser and GPU work stays serial: one GPU session at a time, and timing runs exclusive.

## 7. Owner actions and conditions

- **Chrome Energy Saver:** for real use and your trackpad judgment, set it to off, or to "only when battery is low" and stay plugged in. Otherwise Chrome itself can cap GT3 near 30 fps (F10), whatever the profile.
- **Decisions requested now:** see the reply accompanying this document.
