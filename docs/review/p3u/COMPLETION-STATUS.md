# Stage2 — source integrated, final qualification blocked

2026-10-17, p3u/e7, Sol-led. Supersedes the e3 checkpoint. [Owner review package](OWNER-REVIEW.md) supplies configurations, visuals, evidence, tradeoffs and the provisional recommendation.

- Product source p3u-profilesfa9f19be4b6c073212583db4cecb2b41126fa083. W3–W5 retained; recovered W6 and Terra minimap accepted technically/integrated. Production build PASS.
- W6 actual target binding and4repeat captures PASS; stock/product differs3–46pixels of5.62million/state. Minimap22states/profile PASS; Locked160original path preserved, Unlocked48local gradients substantially reduce slicing.
- Final Locked23/23 and default23/23 identical tofa12e92, zero changed pixels, no capture errors. Unchanged V1 timer/finish and route persistence reused.
- Original admission causes: pressure2bothsamples, then40pageoutsin10s/pressure1 (not application failures). E5 initially10pageouts. Deterministic bounded admission wait then ran all planned functionals; no thresholds or shared harness/product code changed.
- Refreshed functionals accepted collectively:28swap behavior phases PASS; two A1 coverage assertions insufficient (1warmupwheel versus3required), preserved as runnerexit1. Dedicatedpre-ready PASS supplies actual input/readiness/momentum/restore proof. See stage2/final/e5-report.md.
- Latest e7 after verified GT3-only process cleanup: idleOpenCode/Claude groups removed withidentity-checkedTERM; noforcekill/restart/productchanges. Word/Office/VSCode/liveCodexprotected. NoOpenCode/Clauderesiduals. AdmissionPASS, butSmoothlivepagingstopafter4246frames/70.783s on+120/+21pageouts in successive10sintervals; pressure1/swapoutsflat/CPUchecksPASS. Qualitynotstarted. Partialnotqualification. Onlyfull600s/mode remainblocked; no moreidenticalattempts. See stage2/final/e7-summary.json. Priorattemptspreserved.
- Recovered W6 sustained data remain diagnostic only, including Smooth50.2ms and incomplete original automatic host stops. They do not substitute for integrated qualification.

Continuation is blocked by sustained livepaging despite passing initialadmission and completedcleanup. Owner explicitlyforbidsrestart/productchanges/protectedapptermination; no additional verifiedidleGT3targetsremain. Preserveevidenceandstopretriesonunchangedhost. Preparedonly-sustainedrunnerp3u-final/local/briefs/run-sustained-only.sh needs a freshclaimedepochafterachangedauthorizedhoststate. Reuseeverycompletedcheck. No newcampaign/cosmetics.

Owner acceptance and main merge pending. No Claude, banked reset, push, main changes, Phase4 or Phase8. Source/evidence/worktrees preserved.
