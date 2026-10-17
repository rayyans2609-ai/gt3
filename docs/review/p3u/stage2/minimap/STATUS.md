# Unlocked minimap — technically accepted for integration

Terra High completed the bounded replacement at15:28 Qatar (7m33s). GLM exited without a patch; no GLM product work was lost. Its logs and the Terra original patch remain in hud-minimap-smooth/local/evidence/minimap/terra/.

Sol adapted the candidate in p3u-hudtrail under p3u/e3. Only Unlocked creates the continuous completed-route base and48 tangent-aligned gradient strokes. Locked uses the original160 round-capped, quantized segments and original CSS. The updateLockedTrail body is preserved; the map builder selects the original node loop for Locked. The directly affected verify-hud assertions now handle both representations and accept GT3_QUERY for explicit profile verification.

CandidateChecks4 (p3u/e4) completed once: 22 captures per profile, no errors, legacy160 only for Locked and gradient48 only for Unlocked. Fractional, reverse, gantry, finish and reset states pass; adjacent gradient coordinates and alpha agree exactly. Sol inspected native-size Day and zoomed Day/Night fractional/gantry captures: the repeated brightness slicing is substantially reduced. Raster edges remain visible at4×. This is technical acceptance, not owner visual lock-in. Final integrated build, Locked/default identity and sustained performance follow integration.

Evidence source4022f1d plus diagnostic helper dirty hash f935b18906747fa8 (now committed unchanged). Raw captures and provenance: p3u-hudtrail/local/evidence/p3u/candidate-checks-e4/. Neutral backing isolates the route and is not a whole-scene appearance comparison.

The candidate branch is based on bb5d6de. Integrate its accepted three-file patch into p3u-profiles only under the run seat. No main change or push.
