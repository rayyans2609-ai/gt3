# Phase 3 gate / swap / finish comparison

Branch: `p3r-gates`, based on `ec9b697`. These are review options; no visual winner or Phase 3 acceptance is implied.

| URL (port 5200 when served) | Treatment |
|---|---|
| `/?gate=edge` or `/` | 0.85 s neutral emissive illumination along both underside edges of the crossed beam; soft rise/settle. Reverse is 65% strength; forward remains paired with the existing crossing SFX. |
| `/?gate=sweep` | Prior 0.52 s moving beam/post bands, unchanged for comparison. |
| `/?gate=quiet` | No gate response. |
| `/?swap=crossfade` or `/` | Existing 0.56 s body crossfade. |
| `/?swap=pulse` | Same crossfade and duration, plus the historical half-sine emissive pulse, brand tint mixed 55% toward warm white, intensity law restored from `1864cbe^`; no particles. |
| `/?gate=edge&swap=pulse` | Both new comparison treatments together. |
| `/?comp=b&cam=glide` | Existing distant aerial composition, including the new gantry. |

`swap=light` was considered but omitted: a third effect needs a distinct visual benefit beyond the restored pulse before adding its shader/warm-up path.

The gantry spans the road and curbs, with a 1.45 m tall, 1.4 m deep truss above 8.6 m clearance, two substantial uprights, and a suspended checker banner. One instanced structure draw (34 bars), two instanced signal draws (five hooded pods on each face), one banner and the existing painted strip; five shared materials. Scene lighting shades its metal in both themes. Lamps are off along the lap, ramp green over the final 120 m (150 ms intensity easing, Day 1.2 / Night 1.8), and turn off on reverse exit/replay. No real lights, dynamic geometry, interaction or completion sequence was added.

All effects are created at boot. Both gate edges use the existing explicit gate warm draw; car pulse uses the cached fade materials in the existing car warm draws. Gantry meshes disable frustum culling so their material/geometry/texture states are drawn during boot, even on a restored route. At crossings only existing material uniforms, visibility and matrices change.

## Verification

Production source matches engineering commit `63422a6`; runs used this worktree's Vite server on `127.0.0.1:5200`, Chrome ANGLE/Metal, 1600x900 at DPR 1. Finish captures use 1280x720. All runtime phases below passed; no browser console/page errors were reported.

| Command (with `GT3_URL=http://127.0.0.1:5200`) | Result | Evidence |
|---|---|---|
| `npm run build` | PASS, 3.20 s (inherited font-path warnings) | `/tmp/gt3-p3r-gates/build.log` |
| `GT3_VARIANTS=edge node scripts/verify-swap-response.mjs` | PASS, 12 phases, including cold first crossing, Day/Night, early/late reversals, retarget, replay | [Default report](swap-default-verification.json) |
| `GT3_VARIANTS=pulse node scripts/verify-swap-response.mjs` | PASS, same 12 phases | [Pulse report](swap-pulse-verification.json) |
| `GT3_LEAN=1 node scripts/verify-checkpoints.mjs` | PASS, 11 phases; 20 forward / 19 reverse stops; 18 GL probes across every gate in both directions | [Default checkpoint report](checkpoints-default-verification.json) |
| `GT3_LEAN=1 GT3_URL='http://127.0.0.1:5200/?swap=pulse' node scripts/verify-checkpoints.mjs` | PASS, same coverage | [Pulse checkpoint report](checkpoints-pulse-verification.json) |
| `node scripts/capture-p3r-gates.mjs` | PASS: Day/Night, both cameras, off/approach/reverse-exit/replay lamps; sweep/quiet selectors + lifecycle | [Finish and comparison report](finish-verification.json) |

Every measured crossing recorded **0 program compiles/creations, 0 texture allocations/uploads, 0 buffer allocations** and 0 renderer-info deltas. Counters were active during boot (default: 103 program creations, 206 shader compiles, 300 texture creations, 5,715 buffer creations/bufferData calls), rather than simply returning zero for all activity.

Frame diagnostics (shared Mac, short samples; not a comparative benchmark): default idle/swap p95 83.3/83.3 ms; pulse 50.0/66.7 ms. Both had zero >=250 ms frames in these samples. This does not select an effect or replace the already accepted first-crossing review.

An early run was stopped after two degrading host samples; the default full 40-forward/39-reverse discovery sweep also passed before a later host stop. The final checkpoint runs use `GT3_LEAN=1`: all gates and every phase remain; only the additional uniform grid and fixed settle padding are omitted. A real morph-completion wait remains. The gate lifecycle harness now waits for actual visibility to settle rather than assuming the old 900 ms wall-clock allowance; effects retain their 0.85/0.56 s app-clock durations. Each swap variant gets a fresh browser, serially. Owned servers/browsers and locks are cleaned at each heavy-job boundary.

GPU counters wrap actual WebGL calls before initialization, including compileShader, program/texture/buffer creation, bufferData and texture image/storage/sub-image uploads. Counters exclude bufferSubData (updates to existing buffers).

Owner review: gate restraint/readability (especially Night); crossfade vs pulse masking/detail tradeoff; gantry scale and signal readability in the distant glide framing. Existing Night route visibility is outside this task. Audio timing uses the established crossing hook; subjective audiovisual feel still needs owner review.

## Captures

Seven unedited PNGs; gate/swap frames held mid-effect, finish frames at route progress 0.9927 using the existing cameras. All were inspected.

- Gate edge: [Day](gate-edge-day.png), [Night](gate-edge-night.png).
- Swap pulse: [Day mid-swap](swap-pulse-day.png).
- Finish, default aerial: [Day](finish-default-day.png), [Night](finish-default-night.png).
- Finish, `?comp=b&cam=glide`: [Day](finish-glide-day.png), [Night](finish-glide-night.png).

The four finish approach probes and both legacy gate probes recorded zero GL allocations/uploads. Lamps returned off after reversing out and after replay, in both camera configurations. `gate=sweep` showed its timed band; `gate=quiet` stayed invisible. Their full swap suites were not repeated, since the legacy response bodies are retained.

Remaining owner choices: the edge response is deliberately very subtle; the historical pulse strongly masks body detail at its crest; the gantry/signal row is much smaller in the existing distant glide view, especially at Night. Visual restraint, audiovisual satisfaction and the winner are **UNVERIFIED by the owner**. No winner, Phase 3 closure or stable performance benchmark is claimed. The port-5200 server, owned browsers and monitor are stopped; the heavy lock was released.
