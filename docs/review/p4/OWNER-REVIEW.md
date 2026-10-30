# Phase 4 Landing — owner review (2026-10-24)

**Status: HUMAN-ACCEPTED (owner, 2026-10-30)** and integrated into `main` (fast-forward from `p4-landing`). Accepted implementation: `23887af` (Landing, design v1 composition and physical surface-push transition, provisional Hub). The sections below are the 2026-10-24 review record; the final design changes are in `design/DELTA-v1.md`.

## Try it live
```
cd ~/Documents/rayyan/gt3/.claude/worktrees/p4-landing
npm run dev            # then open http://localhost:5173 in a NEW tab
```
- A new tab is a new session and starts on the Landing. A refresh restores where you were (Landing → top, Hub, or Tour position).
- Scroll down slowly through the transition, then back up (it rebuilds in reverse). Try a mouse wheel and a trackpad, plus Day/Night (bottom-right) at rest and mid-transition.
- At the Hub, further downward scroll does nothing; **START RACE** enters the Tour (Lexus, route start, SCROLL TO RACE).
- In the Tour, the small **home** circle left of Day/Night returns to the Hub with route and discoveries kept; START RACE resumes there.
- Review handle (devtools console): `__gt3.landing.seek(0.7)` jumps to any transition point (0–1).

## Images (1440×900, Chrome/Metal, M4)
- `day-landing-rest.jpg`, `night-landing-rest.jpg`: the Landing at rest.
- `day-transition.jpg`, `night-transition.jpg`: progress 0, .2, .4, .55, .7, .8, .88, .94 and the Hub.
- `day-tour-entry.jpg`, `night-tour-entry.jpg`: the first Tour frame after START RACE.

## What the transition does (scroll-position driven, reversible)
Idle turntable settles (0–.22) → car turns to a front three-quarter → `GT3` and its label fade and shrink (.05–.36) → camera push toward the near LED headlight, with distance shrinking geometrically for an even perceived push (.17–.97) → reflections sweep the fender, DRL strip brightens (.56–.84) → Day burns out to white highlights-first / Night sinks into navy from the edges (.78–.985) → Hub field (.965–1).

## Verified (evidence: `m4:local/evidence/p4/`, provenance-stamped)
- `scripts/verify-landing-flow.mjs`: **15/15** on `75f535f`. Covers: fresh session lands on Landing; Landing scroll never moves the route; Hub holds; reverse; momentum carry-over across START RACE (route stays 0 for 1 s); Tour drives; refresh-Tour restore; Tour→Hub→Tour with route and discovery preserved; refresh-Hub; new session; theme switch mid-transition; scroll never starts audio, the speaker click does.
- Phase 3 dependency cone, with existing harnesses booted into the Tour: pre-ready input, route persistence (one fixture updated to include `experience:'tour'`), load recovery 9/9, controls. All pass.
- Tour first frame vs `main@1fe20db`: identical camera, car, DPR 1 and fov; scene pixels match (0.017 % > 24/255). Hub entry shows only the SCROLL TO RACE prompt, not the legacy start card (by design).
- Landing frame pacing (headless, after readiness): DPR 2 and DPR 1 both p50/p99 16.7/16.8 ms; one 33 ms frame in about 680.
- Production build and preview: Landing → Hub → Tour works.

## Overnight technical closeout (2026-10-24, unattended)
Sol @ high hardened the integration seams (details and evidence: `W1-ENGINEERING.md`): Hub→Tour and Tour→Hub now recover cleanly from a failed handoff and no longer wait on rAF in a hidden tab; Landing draws restore renderer state even on exceptions (checked for Locked DPR1 and Unlocked Quality DPR2); START RACE cannot take keyboard focus before the Hub is at rest; the Tour warm-up gets at most 4 ms per frame while the Landing is visible (Landing frames steadier; Locked readiness about 3.1 → 3.5 s while you are still on the Landing). No visual changes. Flow 15/15 and the new seams harness pass on `73320f7`. Luna captured 1280×800, 1920×1080 and 2560×1080 (no layout defect); at ≤ 1100 px the existing desktop-only note shows by design.

## Not verified / known limits
- Intel Mac (Landing at DPR 2 and the warm-up running under the Landing are unmeasured there).
- The first seconds of Landing motion: warm-up contention is reduced, but individual cold first-use draws (about 66–91 ms) remain; judge it live.
- Failed readiness leaves START RACE disabled ("Route unavailable"); reload retries. An in-app retry would be new UX scope.
- Ultrawide (21:9) proportions, and the Scroll cue sitting close to the "3" at 1280/1920 widths: visual judgement.
- Livery texture (1024 px) softens close up, so the push stops about 0.8 m from the lamp. The LED blades sit behind the housing and can't be lit; only the DRL strip wakes.
- After a refresh *into the Tour*, the Landing hero loads only when you first press home (covered by the Hub; it fades in when ready).

## Owner decisions (subjective)
1. Composition: oversized `GT3` low-left, small car upper-right (diagonal).
2. Supporting text: "A Grand Tour" label, "McLaren 720S GT3" caption, "Scroll" cue. Keep or remove.
3. Transition: length (about 2.6 screen heights), the headlight focal point, the Day burn-out and Night sink endings, the lamp wake.
4. Close-up sharpness: keep the 0.8 m stop, or authorise a ~2048 px livery texture from the 45 MB source (asset work).
5. The McLaren as hero (provisional) and the Tour home control (kept for now).
