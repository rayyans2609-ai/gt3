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
