# HUD minimap smooth-gradient patch — terra

## done

Replaced the 160 independently round-capped, two-decimal-opacity trail strokes with:

- continuous SVG dash intervals for the quiet completed-route base; and
- 48 fixed, tangent-aligned SVG gradient strokes for the recent fade behind the car.

The base intervals preserve the `GRID_T` departure and gantry seam. They switch to a
single full-route interval when the two travelled intervals meet, preventing an
overlap band near completion. The fade pool is created once; progress updates only
retarget its path/gradient attributes. Its local gradients interpolate alpha along
the route and cannot light an untravelled nearby bend as a global map-space gradient
could.

Changed tracked files:

- `src/ui/hud.js`
- `src/styles/hud.css`
- `scripts/verify-hud.mjs` (only assertions/selectors affected by the new trail representation)

## evidence

Root cause: each old segment had a rounded cap and a separately quantised constant
opacity (`toFixed(2)`), which made joins and opacity bands visible.

Exact checks run successfully:

```text
node --check src/ui/hud.js
node --check scripts/verify-hud.mjs
git diff --check
node --input-type=module -e "import { GRID_T, GRID_GAP, routeTAt } from './src/scene/trackCurve.js'; const near = (a, b) => Math.abs(a - b) < 1e-12; const gantry = GRID_GAP / (1 + GRID_GAP); const full = 1 / (1 + GRID_GAP); const end = p => GRID_T + p * (1 + GRID_GAP); if (!near(end(0), GRID_T)) throw new Error('grid start interval is wrong'); if (!near(end(gantry), 1)) throw new Error('gantry seam is wrong'); if (!near(end(full) - 1, GRID_T)) throw new Error('full-route handoff is wrong'); if (!near(end(1), 2)) throw new Error('completion interval is wrong'); if (!near(routeTAt(0), GRID_T) || !near(routeTAt(gantry), 0) || !near(routeTAt(1), 0)) throw new Error('route mapping is wrong'); console.log('minimap interval boundary assertions passed');"
# output: minimap interval boundary assertions passed
```

The boundary assertions covered: start at `GRID_T`, gantry crossing at route `1`,
the non-overlapping full-route handoff, completion at route `2`, and `routeTAt`
mapping at start/gantry/completion.

## unverified

Real visual smoothness, actual-app integration, Day/Night appearance, runtime cost,
and build status are unverified by design. No browser, Vite server, build, full
regression suite, or performance run was launched.

## blocked

None. The p3u Sol manager should run the browser/HUD harness and inspect the fade at
fractional progress, reverse travel, gantry crossing, and near completion in both
themes.
