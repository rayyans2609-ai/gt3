# Unlocked minimap candidate — not yet accepted

Terra High completed the bounded replacement at15:28 Qatar (7m33s). GLM exited without a patch; no GLM product work was lost. Its logs and the Terra original patch remain in hud-minimap-smooth/local/evidence/minimap/terra/.

Sol adapted the candidate in p3u-hudtrail under p3u/e3. Only Unlocked creates the continuous completed-route base and48 tangent-aligned gradient strokes. Locked uses the original160 round-capped, quantized segments and original CSS. The updateLockedTrail body is preserved; the map builder selects the original node loop for Locked. The directly affected verify-hud assertions now handle both representations and accept GT3_QUERY for explicit profile verification.

Static JS syntax and diff-whitespace checks pass. Build, fractional/reverse/seam/restore behavior, Day/Night zoomed before/after, performance and final Locked/default visual identity remain UNVERIFIED because host admission blocked browser work. Do not integrate or call the gradient accepted until those tests pass. Inspect joins at curves and the gantry seam: changing to local gradients removes constant-alpha quantization but still requires visual evidence that segment joins are clean.

The candidate branch is based on bb5d6de. Integrate its accepted three-file patch into p3u-profiles only under the run seat. No main change or push.
