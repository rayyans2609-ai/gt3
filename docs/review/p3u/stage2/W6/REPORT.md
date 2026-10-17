# W6 recovery and completion

Recovered from the Opus High W6 worktree at `bb5d6de`; terminal result was quota exhaustion (429), with no final report/commit. Sol High preserved the implementation and six diagnostic scripts, inspected Three r180's renderer, and integrated the patch under p3u/e3. Original worktree and raw evidence remain intact. No Claude was invoked during recovery.

## Delivered mechanism

Unlocked alone loads `transmissionBudget.js` before GPU warm-up. Ferrari and Aston glazing invokes Three's private opaque-scene transmission render: stock uses the full drawing-buffer resolution, four samples and mipmaps. The patch renders this background at CSS-pixel density and removes that private target's multisampling. The main scene, SMAA, 4096 shadows, lighting, car environment and mode DPR remain unchanged. Locked does not import or invoke the module.

This uses Three r180 target characteristics (mipmaps, no depth resolve, multisampling) because its public transmissionResolutionScale setting does not control samples. It intercepts the renderer instance's setRenderTarget once, before first allocation. A future renderer update must revalidate the target guard. Glass background sampling is a real visual tradeoff and is presented to the owner; it is not an artistic acceptance by the manager.

## Recovered evidence and limits

`recovered-measurements.json` carries compact reports, source provenance and host summaries. Raw frames/traces/ablations are in `p3u-w6/local/evidence/p3u/w6/` on this M4.

- Before patch, Quality 65s: RAF maximum 233.4ms, two intervals >50ms; GPU p99 16.76ms, maximum48.22ms. After patch, 65s: maximum34.1ms, zero >50ms, GPU p99 15.27ms. These are single sessions, not a controlled sustained before/after claim.
- Gate ablation: disabling morph or hiding the car removes the large crossing cost; disabling shadow updates helps less. Transmission resolution/sample ablations identify the expensive pass (observed crossing maximum155ms). Sequential full/stock diagnostic variants do not always restore samples on the full condition, so their exact full/stock ratio is not acceptance evidence. Final runtime assertions and fresh-page measurements supersede that ambiguity.
- Smooth 600.5s, alternating themes, 15 Tours/135 crossings: RAF p95/p99 17.4/17.6ms, maximum50.2ms; ten >33ms, one >50ms; GPU p95/p99 14.82/15.50ms. The 50.2ms event was GPU-bound in a BMW swap window (GPU54.55ms; no long JS task), not new shader allocation. It prevents claiming universal stall elimination.
- Quality600.4s, alternating themes, 15 Tours/135 crossings: RAF p95/p99 17.5/17.6ms, maximum34.1ms; fourteen >33ms, zero >50ms; GPU p95/p99 15.02/15.62ms.
- Both stayed at116 programs/303 textures/1501 geometries after ready. Memory pressure remained normal; swapout delta zero; no thermal/performance warning was reported by pmset. Process RSS is not GPU memory residency; thermal warnings do not measure chip temperature or prove absence of frequency changes.

The historical83/116ms intervals are consistent with the reproduced transmission/swap cost, but those original exact events have no full trace and cannot be individually attributed retrospectively. Retain this distinction.

## Completion verification

Integrated syntax and Vite production build pass. Luna W6verify stopped at host admission after pageouts rose; it produced no new runtime proof. A deterministic visual adapter now explicitly sets and records both transmission scale and samples, and the swap harness accepts a profile query. Final target settings, Ferrari/Aston Day/Night comparisons, Locked/default23-state diffs and affected loading/swap checks are pending a stable host window. Final integrated sustained measurements follow the minimap integration. Until those reports are attached, completion remains pending.

### Host-monitor correction before final measurements

Recovery found that the original sustained harness stopped on two nonnormal memory-pressure samples but did not enforce the canonical M4 CPU/paging degradation conditions. The final harness also stops on two consecutive low-idle samples, high-system-CPU samples, or increasing paging intervals. The recovered runs recorded paging and normal pressure but did not have these complete automatic stops; they remain diagnostic observations with this limitation. They are not substituted for the final admitted run. The exact original script remains preserved in the W6 worktree. Final launch commands additionally require an unlocked console before each sustained mode.
