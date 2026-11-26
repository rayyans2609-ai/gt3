# B2 badge-assets checkpoint

Nine real manufacturer emblems and six pack alternatives are prepared locally. The tracked config/script reproduces selection, orientation, budgets, PBR zones, optical scale and closed backs; no meshes are committed. Runtime loading, locked identity safety, caching/material ownership and optional fallback handling are implemented through the existing createBadge API. McLaren and host UI files were not changed.

See `docs/assets/badge-assets-setup.md`, `docs/assets/badge-attribution.md`, local `INVENTORY.md` and `preparation-report.json`. Numerical geometry/lifecycle checks run with `node scripts/check-badge-models.mjs`; renderer-based Day/Night, spinning rear/edge, typography and optical-weight review remain with the manager. Intersecting source relief shells are reported as non-manifold seams, separately from closed-back boundary checks.
