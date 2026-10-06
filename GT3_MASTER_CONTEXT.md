# GT3 — Master Context

This file is a **context router**, not a second specification. It orients a future agent in under a minute; product truth lives in `SPEC.md`.

---

## GT3 in one paragraph

GT3 is a desktop-only interactive motorsport showcase in Three.js/WebGL with a DOM overlay, organized around four experiences — Landing, Grand Tour Hub, Showcase, Grand Tour — that balance editorial luxury, restrained software UI, and selective game-like progression. One locked ten-car roster, one player/hero car (Lexus RC F GT3), scroll-driven route progression through an original, realistic circuit set in a predominantly white/off-white sculptural architectural landscape (an architectural maquette brought to life, not green racing-game scenery), in-world checkpoint discovery instead of collectibles, locked/mystery-car identities revealed through Grand Tour or manual unlock, a six-track background playlist, and a two-state Day/Night theme applied globally. It is not a racing game, not a dealership configurator, not a SaaS dashboard.

## Current phase

**SPEC_V3 implementation in progress (Phase 3 integration branch; Phase 3 closure, 2026-10-06).**

**Built so far** (Phases 1–2 complete; Phase 3 open):
- **Phase 1:** two-state Day/Night theme, experience state machine, session persistence.
- **Phase 2:** playlist music engine inside `audioManager.js`; global speaker and compact expandable player.
- **Phase 3 (built, machine-verified, NOT accepted):** closed-loop circuit, route-led world-space aerial camera, nine checkpoint gates with reversible car swaps and session discoveries, Grand Tour HUD, route persistence, and the typography slice. The user's live reviews (2026-09-28, 2026-10-06) did not accept it. The 2026-10-06 review confirmed `scroll=cap`, the first-crossing fix, gates over coins, and the existing typography. It set the closure work: the crossing SFX, no input before ready, a refined gate effect, a swap-treatment comparison, a finish gantry, a coordinated car/road/camera visual-design pass, and HUD refinements. See `SPEC.md` §30.9; later-phase items are in §31.

**Still legacy:** the running app boots through the old start screen directly into Grand Tour and retains the old finish screen. Landing, Hub, the dedicated Showcase and completion hero flow are not implemented. A marked bridge maps the running race onto `experience = 'tour'`; `F` no longer opens Showcase during Grand Tour. The separate montage and old Showcase code remain for later manual-unlock/Showcase work, but are not part of Tour progression.

**Next, in order:**
1. Phase 3 closure per `SPEC.md` §30.9: functional and feedback fixes, the visual-design pass, and HUD refinements, then the user's live review. Phase 3 closes only on the user's explicit approval. Do not start Phase 4 or merge to `main` without it. The 2026-10-04 decisions still stand: route restore is Phase 3; the Tour keeps 512-px textures without lowering Showcase quality, with full-quality Showcase confirmed as Phase 6 (2026-10-06). Startup (14.5 s clean) and the `compileAsync` revert stay open owner decisions.
2. Phase 4 Landing, Phase 5 Hub, Phase 6 Showcase, Phase 7 finish/completion.
3. Phase 8 scenery / lighting / performance pass. It also owns **Night route lighting** (`SPEC.md` §13a). The outcome is locked: an authored premium night-driving feel with a readable road/car and real darkness. Headlights and trackside lighting are desired, but the design and technique are open to Phase 8. Earlier phases must not pre-build it. Phase 8 also executes the **environment art direction** (`SPEC.md` §16; circuit realism in §17): realistic circuit, white/off-white sculptural terrain, sparse selective architecture, and at Night the same pale world revealed by light out of darkness. Earlier phases only keep terrain structurally ready for it, with real relief, clean shading and no green-grass assumptions.

`ARCHITECTURE.md` tags each module keep / evolve / new / retire / done. `SPEC.md` §1 and §30 show what's reused versus replaced.

## Canonical source hierarchy

When sources disagree, in order:

1. **Current explicit user instruction** in the conversation — overrides everything below.
2. **`SPEC.md`** — current product/experience truth: what GT3 should be.
3. **Repository/runtime reality** — current technical truth: what actually exists. A gap between this and `SPEC.md` is implementation work, not a contradiction to silently resolve by rewriting `SPEC.md`.
4. **`ARCHITECTURE.md`** — technical map, reconciled to SPEC_V3 (2026-09-27). Each module is tagged keep / evolve / new / retire, so it describes both current code and the V3 target; tags marked new/evolve are build work, not running code. `SPEC.md` still wins on any disagreement.
5. **`BUILD_LOG.md`** — evidence and history: measured performance findings, accepted/rejected fixes, known runtime traps. Authoritative for *what was measured*, never for *what the product should be*.
6. **`docs/archive/SPEC_V1.md`, `docs/archive/SPEC_V2.md`** — historical product direction only. `SPEC_V1.md` = the first historical direction: restrained luxury with a fixed chase camera and visible-identity coins. `SPEC_V2.md` = the second historical direction: a bold/colorful "Hot-Wheels" reversal with a homepage/collection hub. The root `SPEC.md` = the current third direction, effectively `SPEC_V3` (the filename stays `SPEC.md`, which remains canonical). Do not treat either archive as a partial current authority.
7. **Decipher / GT3 Meta Archive** and branch chat history — deep historical context, retrieved only when genuinely needed.

**Process truth** sits beside this product hierarchy and is equally foundational: `docs/ai/model-routing.md` (who does what, at what cost, and how much verification) and `docs/ai/autonomous-mode.md` (unattended runs, host limits). Read both at session start, before assigning work.

## Important project paths

(Verified against the actual filesystem — note two names differ from what documentation elsewhere assumes.)

- `SPEC.md` — canonical product spec
- `ARCHITECTURE.md` — V3-reconciled technical map (see above)
- `BUILD_LOG.md` — performance/implementation evidence log
- `docs/archive/SPEC_V1.md`, `docs/archive/SPEC_V2.md` — historical specs
- `reference _images/camera_angles/`, `reference _images/scenery/`, `reference _images/showcase_ref.jpeg` — **note the literal space** in `reference _images` (not `reference_images`). General directional references, not implementation targets (`SPEC.md` §16).
- `models/car_cover_model` — locked-showcase asset; valid `.glb` data but the filename itself carries no extension
- `public/audios/playlist/track_1.mp3 … track_6.mp3` — the six playlist tracks, moved and renamed from `audios/background_playlist/` in Phase 2a. The music engine lives inside `src/audio/audioManager.js`, and the alias table is `src/data/playlist.js`.
- `audios/background_playlist/audiocover_NOTaudios/` — the six track covers, unshipped and deferred to Phase 5 (Hub cover-art player)
- `font/` — four Neue Haas Grotesk families, all weight files suffixed `-Trial` (licensing status unconfirmed, see `SPEC.md` §30.5); the Phase 3 typography slice bundles the locally available Display/Text weights and Geist Mono
- `src/data/cars.js` — the locked ten-car roster and order (also mirrored in `SPEC.md` §1a)
- `docs/ai/model-routing.md` — canonical AI operating doctrine: portable principles (cost-to-acceptance, scarcity-adjusted routing, net-leverage delegation, least-privilege context, risk-based review, right-sized verification, evidence reuse) plus the current GT3 model map (roles, quota modes, reasoning effort, delegation direction). Material model work is logged in `docs/ai/routing-evidence.md` so routing improves empirically. Execution layers: `docs/ai/codex-cli-invocation.md` (Codex; route through `scripts/codex-route.sh`, which requires an explicit model and reasoning effort) and `docs/ai/opencode-invocation.md` (OpenCode free routes; route through `scripts/opencode-route.sh`, which requires an explicit model and refuses paid Token Harbor routes). The GT3 model benchmark is complete as of 2026-10-04, and routing was revised from its measured evidence. It is archived separately (`gt3-model-benchmark`); don't reopen it during ordinary GT3 development.
- `docs/ai/autonomous-mode.md` — **GT3 Autonomous Mode**, the protocol for unattended multi-hour runs (invocation, host protection, recovery/stop rules, handoff). Invoked only when the user says so ("Enter GT3 Autonomous Mode", "Run this autonomously", …); never assumed. It extends `model-routing.md` rather than replacing it. Posture: maximum useful accepted progress, not constant activity. Supervision and review are event- and risk-driven, human-only judgments are queued rather than treated as blockers, and a clean wait or stop is a valid outcome. Current revisable default, not permanent doctrine. Its host-resource rules (1 heavy local job at a time, pre-flight thresholds, kill by owned PID only) apply to all heavy GT3 work on this 8 GB Mac.

## Core product structure

Landing (introduction/desire) → Grand Tour Hub (control surface) → Showcase (inspect) / Grand Tour (drive) → completion. Full behavior, transitions, and the agent-designed flows connecting these live in `SPEC.md` — this file does not duplicate them.

## Technical foundations worth knowing

- Vite + Three.js (ESM, no framework), DOM overlay over a fixed WebGL canvas, single RAF loop, one central `state.js` pub/sub store. This pattern is sound and worth keeping even where individual modules get rebuilt.
- Verified per-model orientation table for car facing (`src/scene/cars.js`) — don't replace with geometry heuristics.
- Explicit-user-gesture WebAudio lifecycle (`src/audio/audioManager.js`) — scroll must never initialize audio; this was broken and fixed once already.
- Fill rate, not geometry, was the measured bottleneck for scroll performance; adaptive render resolution while scrolling (full quality at rest) is an accepted tradeoff. Full detail and the rest of the verified performance lessons are in `SPEC.md` §27 — that's the copy to trust, not `BUILD_LOG.md` read cold.
- A second/duplicate WebGLRenderer (the montage's `studio.js`) was the single largest measured cost in the pre-Phase-3 Tour. The montage no longer runs in Grand Tour; don't introduce another renderer for new cinematic sequences (e.g. the completion transition) — reuse shared scene/camera infrastructure.

## Historical sources

`docs/archive/SPEC_V1.md` and `SPEC_V2.md` are historical product direction, never current authority — see the source hierarchy above for exactly how each superseded direction differs from `SPEC.md`. `BUILD_LOG.md` is evidence/history: trust its measurements, not any UX that happened to be running when a measurement was taken. The Decipher / GT3 Meta Archive is the deeper historical source for original GT3 work, experiments, and lessons; retrieve it only when current docs genuinely don't answer the question.

## Working doctrine

- Apply process by relevance — not every task needs the full engineering methodology; match rigor to whether the work is creative, product/UX, or engineering.
- **Question → Eliminate → Simplify → Accelerate → Automate**, in that order, before adding process, abstraction, or automation.
- Measure reality: **measure → attribute → hypothesize → change → compare → verify**, especially for performance and debugging. Direct measurement outranks inherited claims from old logs.
- Current repo state and current explicit instruction outrank stale documentation.
- Minimize blast radius — prefer the smallest change that solves the proven problem; record out-of-scope opportunities instead of chasing them.
- Acceptance is stronger than "implemented" or "build passes". Use the most relevant evidence (runtime behavior, browser interaction, measurement, human judgment for subjective feel), **right-sized to blast radius**: verify the change's dependency cone with representative rather than combinatorial coverage, escalate on real failures rather than theoretical ones, reuse valid evidence, and stop when marginal confidence is worth less than its cost. Phase closure is a risk-based integration check, not a replay of everything ever tested. Canonical: `docs/ai/model-routing.md` §5.
- Preserve useful project state at milestones; correct misleading historical claims rather than let them stand.
- Do not ask the user to decide routine, reversible engineering details resolvable from existing context — ask only when a decision changes product intent, subjective experience, scope, or architecture.
- Derive reusable AI-development systems (SOPs, routing rules, templates) from evidence accumulated doing real GT3 work, not from premature theory.
- AI work optimizes **cost-to-acceptance**, not activity: use the lowest-scarcity resource likely to reach acceptance without disproportionate rework, and spend intelligence on uncertainty and consequence, not volume. Delegate only for net leverage. Carry intent down and evidence up. Review only when it reduces a named risk. Reuse valid evidence. Move recurring checks into deterministic tooling. Details: `docs/ai/model-routing.md`.
- Stop when the defined goal is achieved, acceptance passes, or remaining gains are marginal — more work is always possible; that isn't a reason to keep going.

---

## Project objective

GT3 is also a live laboratory for how to build software with AI more effectively. Over time, extract the strongest recurring lessons — planning, delegation, model-routing, debugging, acceptance, context-management — into reusable SOPs, templates, and instruction files. Those are **outputs** of doing the work, not assumptions to predetermine here.

The governing question: **what is the simplest, cheapest, most reliable combination of human judgment, software, and AI that produces the desired result?**
