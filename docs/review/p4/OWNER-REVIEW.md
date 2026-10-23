# Phase 4 Landing — owner review (2026-10-24)

**Status: IMPLEMENTED and machine-VERIFIED on M4. Not HUMAN-ACCEPTED.** Branch `p4-landing`. No visual changes since the 2026-10-24 checkpoint, by owner instruction.

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

## Not verified / known limits
- Intel Mac (Landing at DPR 2 and the warm-up running under the Landing are unmeasured there).
- Landing pacing during the first seconds while the Tour's GPU warm-up still runs. It pauses while you scroll the transition.
- Livery texture (1024 px) softens close up, so the push stops about 0.8 m from the lamp. The LED blades sit behind the housing and can't be lit; only the DRL strip wakes.
- After a refresh *into the Tour*, the Landing hero loads only when you first press home (covered by the Hub; it fades in when ready).

## Owner decisions (subjective)
1. Composition: oversized `GT3` low-left, small car upper-right (diagonal).
2. Supporting text: "A Grand Tour" label, "McLaren 720S GT3" caption, "Scroll" cue. Keep or remove.
3. Transition: length (about 2.6 screen heights), the headlight focal point, the Day burn-out and Night sink endings, the lamp wake.
4. Close-up sharpness: keep the 0.8 m stop, or authorise a ~2048 px livery texture from the 45 MB source (asset work).
5. The McLaren as hero (provisional) and the Tour home control (kept for now).
