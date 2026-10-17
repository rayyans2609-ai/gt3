# Stage2 — source integrated, final qualification blocked

2026-10-17, p3u/e5, Sol-led. Supersedes the e3 checkpoint. [Owner review package](OWNER-REVIEW.md) supplies configurations, visuals, evidence, tradeoffs and the provisional recommendation.

- Product source p3u-profilesfa9f19be4b6c073212583db4cecb2b41126fa083. W3–W5 retained; recovered W6 and Terra minimap accepted technically/integrated. Production build PASS.
- W6 actual target binding and4repeat captures PASS; stock/product differs3–46pixels of5.62million/state. Minimap22states/profile PASS; Locked160original path preserved, Unlocked48local gradients substantially reduce slicing.
- Final Locked23/23 and default23/23 identical tofa12e92, zero changed pixels, no capture errors. Unchanged V1 timer/finish and route persistence reused.
- Original admission causes: pressure2bothsamples, then40pageoutsin10s/pressure1 (not application failures). E5 initially10pageouts. Deterministic bounded admission wait then ran all planned functionals; no thresholds or shared harness/product code changed.
- Refreshed functionals accepted collectively:28swap behavior phases PASS; two A1 coverage assertions insufficient (1warmupwheel versus3required), preserved as runnerexit1. Dedicatedpre-ready PASS supplies actual input/readiness/momentum/restore proof. See stage2/final/e5-report.md.
- Smooth started under correct AC/display/product settings, then live safety monitor stopped after693frames/~11.5s on consecutive pressure2/pageouts+179; Quality not started. This partial window is not sustained qualification. Only full600s/mode remain blockers; no retry on unchanged host.
- Recovered W6 sustained data remain diagnostic only, including Smooth50.2ms and incomplete original automatic host stops. They do not substitute for integrated qualification.

Smallest continuation: stable host admission, only600s Smooth/Quality. Prepared commands are in p3u-final/local/briefs/run-after-swap-e5.sh; skip its completed preready block and choose a fresh output directory, checking current authority/epoch first. Do not repeat identity/glass/minimap/W3–W5. No new cosmetic work.

Owner acceptance and main merge pending. No Claude, banked reset, push, main changes, Phase4 or Phase8. Source/evidence/worktrees preserved.
