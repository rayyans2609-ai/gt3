# GT3 — Master Context

This file is a **context router**, not a second specification. It orients a future agent in under a minute; product truth lives in `SPEC.md`.

---

## GT3 in one paragraph

GT3 is a desktop-only interactive motorsport showcase in Three.js/WebGL with a DOM overlay, organized around four experiences — Landing, Grand Tour Hub, Showcase, Grand Tour — that balance editorial luxury, restrained software UI, and selective game-like progression. One locked ten-car roster, one player/hero car (Lexus RC F GT3), scroll-driven route progression through an original circuit, in-world checkpoint discovery instead of collectibles, locked/mystery-car identities revealed through Grand Tour or manual unlock, a six-track background playlist, and a two-state Day/Night theme applied globally. It is not a racing game, not a dealership configurator, not a SaaS dashboard.

## Current phase

**SPEC_V3 implementation in progress (as of 2026-09-27).**

**Complete:**
- **Phase 1:** two-state Day/Night theme, experience state machine, session persistence.
- **Phase 2:** playlist music engine inside `audioManager.js`; global speaker and compact expandable player.

**Still legacy:** the running app is otherwise the old single continuous scroll page (start screen → one race with ten visible-identity coins → finish scorecard), with a fixed camera rigidly parented to the car and Showcase behind an `F` key. A marked legacy bridge maps it onto `experience = 'tour'`.

**Next, in order:**
1. A small typography slice (Neue Haas Grotesk / Geist Mono), before Phase 4.
2. Phase 3 Grand Tour core (aerial camera, checkpoints, sparse HUD).
3. Phase 4 Landing, Phase 5 Hub, Phase 6 Showcase, Phase 7 finish/completion.
4. Phase 8 scenery / lighting / performance pass. It also owns **Night route lighting** (`SPEC.md` §13a). The outcome is locked: an authored premium night-driving feel with a readable road/car and real darkness. Headlights and trackside lighting are desired, but the design and technique are open to Phase 8. Earlier phases must not pre-build it.

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

## Important project paths

(Verified against the actual filesystem — note two names differ from what documentation elsewhere assumes.)

- `SPEC.md` — canonical product spec
- `ARCHITECTURE.md` — V3-reconciled technical map (see above)
- `BUILD_LOG.md` — performance/implementation evidence log
- `docs/archive/SPEC_V1.md`, `docs/archive/SPEC_V2.md` — historical specs
- `reference _images/camera_angles/`, `reference _images/scenery/`, `reference _images/showcase_ref.jpeg` — **note the literal space** in `reference _images` (not `reference_images`)
- `models/car_cover_model` — locked-showcase asset; valid `.glb` data but the filename itself carries no extension
- `public/audios/playlist/track_1.mp3 … track_6.mp3` — the six playlist tracks, moved and renamed from `audios/background_playlist/` in Phase 2a. The music engine lives inside `src/audio/audioManager.js`, and the alias table is `src/data/playlist.js`.
- `audios/background_playlist/audiocover_NOTaudios/` — the six track covers, unshipped and deferred to Phase 5 (Hub cover-art player)
- `font/` — four Neue Haas Grotesk families, all weight files suffixed `-Trial` (licensing status unconfirmed, see `SPEC.md` §30.5)
- `src/data/cars.js` — the locked ten-car roster and order (also mirrored in `SPEC.md` §1a)
- `docs/ai/model-routing.md`, `docs/ai/codex-cli-invocation.md` — canonical AI model-routing/delegation rules (roles, escalation, verified Codex slugs/invocation); route Codex jobs through `scripts/codex-route.sh`, which refuses to run without an explicit model and reasoning effort

## Core product structure

Landing (introduction/desire) → Grand Tour Hub (control surface) → Showcase (inspect) / Grand Tour (drive) → completion. Full behavior, transitions, and the agent-designed flows connecting these live in `SPEC.md` — this file does not duplicate them.

## Technical foundations worth knowing

- Vite + Three.js (ESM, no framework), DOM overlay over a fixed WebGL canvas, single RAF loop, one central `state.js` pub/sub store. This pattern is sound and worth keeping even where individual modules get rebuilt.
- Verified per-model orientation table for car facing (`src/scene/cars.js`) — don't replace with geometry heuristics.
- Explicit-user-gesture WebAudio lifecycle (`src/audio/audioManager.js`) — scroll must never initialize audio; this was broken and fixed once already.
- Fill rate, not geometry, was the measured bottleneck for scroll performance; adaptive render resolution while scrolling (full quality at rest) is an accepted tradeoff. Full detail and the rest of the verified performance lessons are in `SPEC.md` §27 — that's the copy to trust, not `BUILD_LOG.md` read cold.
- A second/duplicate WebGLRenderer (the montage's `studio.js`) was the single largest measured cost in the current build. Don't introduce another one for new cinematic sequences (e.g. the completion transition) — reuse shared scene/camera infrastructure.

## Historical sources

`docs/archive/SPEC_V1.md` and `SPEC_V2.md` are historical product direction, never current authority — see the source hierarchy above for exactly how each superseded direction differs from `SPEC.md`. `BUILD_LOG.md` is evidence/history: trust its measurements, not any UX that happened to be running when a measurement was taken. The Decipher / GT3 Meta Archive is the deeper historical source for original GT3 work, experiments, and lessons; retrieve it only when current docs genuinely don't answer the question.

## Working doctrine

- Apply process by relevance — not every task needs the full engineering methodology; match rigor to whether the work is creative, product/UX, or engineering.
- **Question → Eliminate → Simplify → Accelerate → Automate**, in that order, before adding process, abstraction, or automation.
- Measure reality: **measure → attribute → hypothesize → change → compare → verify**, especially for performance and debugging. Direct measurement outranks inherited claims from old logs.
- Current repo state and current explicit instruction outrank stale documentation.
- Minimize blast radius — prefer the smallest change that solves the proven problem; record out-of-scope opportunities instead of chasing them.
- Acceptance is stronger than "implemented" or "build passes" — use the strongest relevant evidence (runtime behavior, browser interaction, measurement, human judgment for subjective feel).
- Preserve useful project state at milestones; correct misleading historical claims rather than let them stand.
- Do not ask the user to decide routine, reversible engineering details resolvable from existing context — ask only when a decision changes product intent, subjective experience, scope, or architecture.
- Derive reusable AI-development systems (SOPs, routing rules, templates) from evidence accumulated doing real GT3 work, not from premature theory.
- Stop when the defined goal is achieved, acceptance passes, or remaining gains are marginal — more work is always possible; that isn't a reason to keep going.

---

## Project objective

GT3 is also a live laboratory for how to build software with AI more effectively. Over time, extract the strongest recurring lessons — planning, delegation, model-routing, debugging, acceptance, context-management — into reusable SOPs, templates, and instruction files. Those are **outputs** of doing the work, not assumptions to predetermine here.

The governing question: **what is the simplest, cheapest, most reliable combination of human judgment, software, and AI that produces the desired result?**
