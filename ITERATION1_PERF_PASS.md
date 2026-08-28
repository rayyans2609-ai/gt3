# ITERATION 1 — PERFORMANCE PASS

## Objective

The current GT3 build is functionally accepted, but manual use is **too slow/choppy to properly evaluate or refine**. Performance is therefore the immediate blocker.

Your goal is to make the existing experience **genuinely smooth and responsive while preserving its visual quality, features, interactions, and intended atmosphere**.

**Scroll is the highest-priority part of this pass.** The entire experience depends on scroll driving the car, and the current scroll feel is too choppy and somewhat uncontrollable. Prioritize making forward/backward scrolling feel smooth, predictable, responsive, and easy to control without losing the intended sense of speed.

This is primarily a **performance pass**, with one small UX exception: add a clear, tasteful indication of which scroll direction moves the experience **forward** and which moves it **backward**. Do not begin broader visual/UX redesign yet.

Refer to `SPEC.md`, `BUILD_LOG.md`, architecture/project files, Git history, and the current accepted baseline for project context rather than requiring it to be repeated here.

---

## Operating Principle

**Measure → identify bottleneck → prioritize → minimal optimization → re-measure → regression test.**

Do not blindly “optimize” code or reduce quality based on assumptions. Establish evidence first.

## 1. Profile the real experience

Use the actual Chrome experience and relevant profiling/devtools evidence to determine where performance is being lost.

Start with the **scroll-driving path**. Measure and inspect input handling, scroll-to-progress mapping, smoothing/damping, frame pacing during scroll, sensitivity, direction changes, camera/car response, and any work triggered by scroll events. The target is not merely higher FPS; the experience should feel controllable and fluid during real wheel/trackpad input in both directions.

Investigate where evidence warrants:

- FPS / frame-time consistency and long frames
- Three.js/WebGL render cost
- draw calls, geometry/poly count, materials and textures
- shadows, lighting and post-processing
- multiple renderers/scenes/canvases
- animation/render loops and unnecessary per-frame work
- model visibility and objects rendered when off-screen/unneeded
- DOM/layout/paint work
- scroll handlers, event frequency, input sensitivity, smoothing/damping, and scroll-to-track progression
- asset loading/memory pressure
- montage/showcase transitions
- duplicated work or avoidable state updates

Record a concise **before-state** using representative scenarios so improvements can be compared against the same conditions.

## 2. Optimize by impact

Rank bottlenecks by:

**performance gain × confidence ÷ regression/quality risk**

Fix the highest-impact causes first, with **scroll smoothness/control treated as the primary user-facing performance metric**.

Prefer:

- eliminating unnecessary work
- doing expensive work less frequently
- rendering only what is necessary
- caching/reusing computation and resources
- reducing duplicate work
- improving lifecycle/state management
- targeted optimizations over broad rewrites

Do **not** refactor functioning architecture merely for cleanliness.

Do **not** remove major visual effects, substantially reduce model quality, flatten the experience, or visibly downgrade graphics simply to produce a higher FPS number unless profiling proves a specific effect is disproportionately expensive and there is no better solution.

If a quality/performance tradeoff is genuinely necessary, preserve the highest visual value per unit of rendering cost.

## 3. Delegate aggressively

Protect Claude manager context.

Once a performance problem is characterized well enough to brief a worker, delegate implementation/debugging through the established Codex routing policy.

- **Terra:** normal performance implementation/debugging
- **Sol Medium:** difficult Three.js/rendering/state/performance problems
- **Sol High:** only when genuinely justified

Claude should focus on **profiling strategy, problem characterization, task routing, review, integration and acceptance**, while still coding directly when its project-wide context clearly makes that more efficient.

Parallelize only independent optimizations. Changes touching the same rendering/state systems should remain sequential.

## 4. Verify every accepted optimization

For each meaningful change:

**before evidence → change → same-scenario measurement → visual/behavior check → accept/reject**

A successful build alone is not evidence of a performance improvement.

Reject optimizations that produce negligible real-world benefit while adding complexity or degrading the experience.

Keep sensible Git checkpoints so regressions can be isolated.

## 5. Small scroll-direction UX change

Add a minimal, visually appropriate cue that makes it immediately clear:

- scroll one direction to move **forward**
- scroll the opposite direction to move **backward**

Keep it subtle and consistent with the existing GT3 visual language. It should clarify the interaction without becoming a new major UI element or distracting from the driving experience.

## 6. Final acceptance

Once the major bottlenecks are resolved:

1. Re-measure the same representative scenarios used for the baseline.
2. Manually verify scroll feel in Chrome with realistic wheel/trackpad input: forward, backward, slow movement, fast movement, direction reversals, and sustained scrolling.
3. Confirm scroll feels materially smoother, more controllable, and more predictable than the baseline, with no obvious choppiness or unwanted jumps.
4. Verify the forward/backward scroll-direction cue is clear and unobtrusive.
5. Perform a complete interactive regression run against `SPEC.md`.
6. Verify all 10 collection sequences, montage/morph/showcase flow, audio/narration, scrolling, HUD, time-of-day and finish sequence still behave correctly.
7. Check meaningful console/network errors.
8. Compare important visuals against the accepted baseline to ensure performance improvements did not noticeably degrade the experience.

Update `BUILD_LOG.md` with:

- principal bottlenecks found
- important optimizations made
- concise before/after evidence
- any remaining performance limitation

## Definition of Done

This iteration is complete when the existing GT3 experience is **smooth and responsive enough for sustained manual playtesting**, with **scroll driving specifically feeling fluid, predictable, and controllable in both directions**, and with no meaningful feature or visual regressions.

**Do not begin general Iteration 1 visual/UX refinement afterward. Stop at the new performance-stable baseline and wait for user feedback.**
