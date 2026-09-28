# GT3 autonomous run 2026-09-28 — handoff

Stopped at a clean checkpoint (Astra checkpoint 2 recommendation) because the host was
at load average ~550–620 from ~05:00, making builds ~100× slower and Chrome DevTools
unresponsive. Nothing is merged to `main` (still `62024bb`). Measured evidence is in
`BUILD_LOG.md` (last section).

## Branches / worktrees
| Branch | Head | Content | Worktree |
|---|---|---|---|
| `worktree-phase3b-aerial-camera` | `ce61556` | Phase 3b camera + typography — **for the user's visual review** | shares `.claude/worktrees/phase3b-aerial-camera` (now checked out on `phase3-integration`) |
| `typography-slice` | `bd08be1` | typography only (its vite fs.allow hunk is dropped on merge, `b089595`) | `.claude/worktrees/typography-slice` |
| `phase3c-checkpoints` | `80926d4` | 3c on top of `ac76a9d` | `.claude/worktrees/phase3c-checkpoints` |
| `phase3-integration` | this commit | 3b (`ce61556`) + 3c + verifier fix + BUILD_LOG + this doc | `.claude/worktrees/phase3b-aerial-camera` |

Worktrees need a real `font/` copy (gitignored) and a `node_modules` symlink; both present.

## Status
- **Phase 3b** — technically complete; **awaiting human visual review.** Do not mark accepted.
- **Typography slice** — done, verified (fonts load, 22 files bundled, no Google requests).
- **Phase 3c** — implemented (Sol high); build + direct state sweep + session checks pass.
  **Browser verification not yet run** (host overload).
- **Phase 3d** (sparse HUD) — not started; brief ready (see below). Start only after 3c is
  browser-verified.

## Next exact actions (when the host is healthy)
0. DONE `76b9309` (Terra, 07:50): items 1 and 2 below are fixed; syntax-checked only — the host
   load rose again (~248) before build/browser runs. Start at item 3.
1. (done) Fix `scripts/verify-checkpoints.mjs` swap-timing test (line ~175): it can cancel the swap it
   measures (Audi→Nissan→Audi before midpoint). Settle fully, assert a swap occurs, exclude
   screenshots from timing, report ≥250 ms stalls instead of filtering them. (Terra/Luna.)
2. (done) Morph: reattach the particle object when a morph starts — preload's `setCarModel()` removes
   it, so the first swap lacks its particle mask. Small, pre-existing. (Terra.)
3. On `phase3-integration`: run `verify-checkpoints.mjs`, `verify-aerial.mjs branch|motion|
   focused`, captures of gates (Day/Night) and a mid-swap frame.
4. Then Phase 3d via the Terra brief.

## Briefs (job scratch — copy lives only for this job)
Phase 3d: sparse HUD per SPEC §20, Terra medium; branch from the verified integration head;
no back-to-Hub control until the Hub exists; legacy approach card stays idle (it would reveal
car identity before discovery).

## Model routing used
Opus 5.5 manager; GPT-6 Sol high (3b camera, 3b fix 1, 3c); GPT-6 Sol medium (3b fix 2,
interrupted by Codex usage limit — finished by Opus from its WIP); GPT-5.6 Terra medium
(typography); GPT-6 Luna medium (camera parameter sweep); GPT-6 Astra high (checkpoints 1, 2).

## Decisions that need the user
1. Camera framing/feel (visual acceptance of 3b), including whether to tune toward one of the
   sweep configurations (A current 40°/52°/54 m … F 55°/45°/44 m).
2. Gate appearance and swap feel (after captures exist).
3. Approval to merge Phase 3 work to `main` after verification.

## Update 2026-09-28 ~09:50 (continuation run)
- Doctrine: `733317d` (model-routing.md §9 hierarchical delegation; Master Context pointer).
- Astra (manager-assigned): harness browser-cleanup fix `804a36c`; 3b review retained A-current
  (40/52/54, preferred) and C-wider (50/47/46); no default change; no camera-motion defect.
  Captures: ~/Desktop/gt3-review-2026-09-28/3b-astra/.
- Host root cause (manager, from vm_stat): memory exhaustion → swap thrash on an 8 GB
  i5-8210Y (≈67 MB free pages, 162 M cumulative swapouts, idle CPUs, load 100–800). Contributors:
  VS Code, multiple Claude app/daemon processes, FileProvider, plus GT3 Vite + headless Chrome
  + concurrent Codex CLIs. Rule for this host: one locally-heavy GT3 job at a time; browser jobs
  only at 1-min load < 8; no parallel Codex jobs while a browser runs.
- 3c browser run (Luna): route-state sweeps fwd 40 / bwd 39 PASS, no interruptions PASS;
  oscillation + aerial settle FAILED on harness design → Terra `bfe5e30` (harness only).
  Re-run pending (load).
- 3d: Terra implementing on `phase3d-hud` (from `804a36c`), build-only; Luna browser brief to follow.

## Host concurrency cap (user rule, 2026-09-28)
On this 8 GB i5-8210Y: at most 1–2 active top-level tasks including sub-agents; one heavy task
(browser, build, Codex/Sol/Terra, memory-intensive) at a time; two only if both are light or one
is mostly waiting. Serialize when in doubt. If memory pressure, swap, load or system CPU climbs,
drop to one heavy task immediately. Browser pre-flight uses several signals (no other heavy job,
paging/swap deltas ~0, system CPU low / idle CPU substantial), not load average alone.

## FINAL correction 2026-09-28 ~12:30 (supersedes earlier "3c PASS" summaries)

A partial `verify-checkpoints.mjs` run against final HEAD `036d4d4` (killed mid-run before its
output was checked; recovered from `/tmp/gt3-3c/verification.json`, timestamp 11:17) gives the
real picture, corrected from the manager's earlier mis-summary:

**PASS:** startup; route metadata; forward sweep (40 stops); backward sweep (39 stops, discovery
never shrinks); **real-wheel gate reversals — genuinely PASSED this time** (gate 0.255: 6
crossings, indices [2,3]; gate 0.68: 8 crossings, indices [6,7]) — the `036d4d4` harness fix
(giving each burst its own time budget) is confirmed working; reload restores all 10 discoveries;
Replay preserves all 10 discoveries; Day/Night gate captures (6 images); zero console errors.

**FAIL (unclassified — harness vs app not yet determined):**
- "instant seeks": seeking far forward (t=0.91) left `morphing: true` with two car models
  attached (`car-mclaren`, `car-porsche`) instead of settled — either the harness didn't wait
  long enough for the morph to finish after an instant (non-animated) seek, or morph retargeting
  has a real edge case on a large instant jump. NOT reproduced/isolated. Needs a dedicated,
  patient re-check (wait on `isMorphing()===false` with a generous timeout) before calling it
  app or harness.
- "frame and swap diagnostics": `Waiting failed: 30000ms exceeded` — could be host CPU
  starvation (this session's dominant condition) rather than an app defect. NOT isolated.

**NEVER VERIFIED (not blocked-this-instant — genuinely never directly checked across two
attempts):** first-swap vs later-swap particle attachment. The dedicated particle script
(`particles.mjs`) was written into the brief but never executed — the run failed at the swap
diagnostics step first, and the fully-corrected final rerun never got past the host CPU gate at
all (8/8 retries failed, ~50 min, system CPU 70-80%/idle 6-22% with zero GT3 load — this is
CPU/kernel saturation, not memory/swap pressure; swap usage decreased over that run).

**3d HUD:** never browser-verified (host-blocked before any Vite/Chrome launch in the pass that
targeted it). Implementation reviewed only statically.

**Aerial regression on final HEAD `036d4d4`:** never re-run (last successful `motion` run was
against `ce61556`, before 3c/3d landed).

Earlier "3c PASS" / "3b+3c technically complete" language in this doc and in chat overstated
confidence — treat this section as authoritative over anything above it.

## Phase 3 acceptance sequence completed 2026-09-28 ~13:23 (supersedes the "FINAL correction" section above)

Host recovered (idle 60-93%, sys 4-23%, pageouts/swapouts flat). One combined browser session
(`/tmp/gt3-final2/results.json`) resolved every previously-open item with direct runtime evidence:

1. **instant-seek-far: PASS.** Root cause was the harness (`seek()`'s fixed 1050ms settle vs
   morph's 850ms nominal duration -- thin margin that this session's chronic host CPU
   starvation could exceed), not the app. Fixed narrowly in `c28cd41`: `seek()` now waits on
   `isMorphing()===false` instead of a blind delay. Confirmed: instant seek to t=0.91 settles
   cleanly (single model `car-porsche`, `morphing:false`).
2. **First-swap particles: PASS.** Fresh context, genuinely-first swap: 19/94 sampled frames
   showed particles attached to `car-mount`, opacity to 0.85, correct final car.
3. **Later-swap particles: PASS.** Fresh context past gate 1: 18/95 frames, same pattern,
   confirming the earlier particle-reattachment fix holds on subsequent swaps too.
4. **3d HUD: PASS.** All 11 DOM presence/absence checks matched the KEEP/REMOVE list exactly;
   zero console errors; car name updates across a crossing. One apparent F-key failure was
   isolated with a follow-up micro-script and traced to the combined script's own insufficient
   settle time before its baseline, not a real regression -- re-measured in isolation:
   `locked` never true, no `#showcase-layer`, camera delta 0.00135 world units (car is 4.6
   units long) after pressing F.
5. **Camera regression (light/technical): no regression signal.** 6 settled route points,
   FOV constant, no stuck morphs, no errors. `aerialCamera.js` remains byte-identical to the
   3b head, so this only needed to rule out side effects from 3c/3d -- it did.

Codex/Astra hit a usage-limit mid-run for its independent confirmatory pass (resets ~1:42 PM);
the manager (Sonnet 5, acting in the manager role) completed the final synthesis directly from
the concrete evidence above rather than block the stopping point on a quota reset.

**Remaining, honestly:** route marker's own SVG x/y coordinates were not directly sampled
(only `state.progress` advancing + map-SVG presence confirmed); gate Day/Night captures are
from an earlier session, not re-captured against this exact head. Neither is believed to
indicate a defect. **3b framing (A vs C), hero scale, motion feel, and gate/HUD visual
appearance remain human-review-only, as they always were.**

Phase 3 is now technically complete and runtime-verified. `main` untouched at `62024bb`.
Branch head: `c28cd41`.
