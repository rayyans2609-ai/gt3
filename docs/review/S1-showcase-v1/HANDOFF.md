# S1 — Showcase V1

Implementation ready for integration and visual review; runtime verification is blocked, not passed.

## Interface / integration

`src/showcase/showcase.js` exports the requested `initShowcase`, `openShowcase`, `closeShowcase`, `isShowcaseOpen`, and `renderShowcase` interface unchanged, plus `showcaseState()` for read-only review. Init only registers the update/listeners; DOM, scene, environment and inspection targets are lazy, and init loads no models. Both modes allow wrapping arrows. Back/Esc calls `onExit({to: mode === 'single' ? 'collection' : 'hub'})`; GT3 calls `{to:'hub'}`. Origin drives horizontal and vertical entry/return movement. All motion snaps for reduced motion.

`src/main.js` has contained Showcase blocks: import, timed edges/init, render branches, and DEV `?showcase=0..9|full` after real readiness. Landing is deactivated for Showcase and reactivated `atHub:true` on return. The existing Hub is only hidden/reset through its API. The manager should connect its Collection/emblem and Full Showcase entry to the new module/edges; this worker does not change the Hub. The provisional return dispatches `gt3:showcase-return` with `{to}` for Collection restoration after the existing `showcase:hub` edge.

Review: `window.__gt3.showcase = {open,close,state}` wraps the real experience edges. `state()` is a function returning a snapshot. `window.__gt3audio.voice()` exposes current voice index/playing/paused/time without side effects. Existing music ducking and restoration are reused unchanged.

`index.html` adds `#showcase` inside `#overlay`. Unreferenced legacy `src/ui/showcase.js` and `src/styles/showcase.css` are replaced; the obsolete base stylesheet import is removed. The F-key/HUD Showcase path was already retired, with no imports/callers remaining. Montage is unchanged.

## Presentation and residency

Adapted the legacy normalized turntable, rect-area rig, editorial data, achievements and voice control. Added PMREM reflections, Day/Night rig, an ungraded CSS field, drag/inertia with camera-elevation limits, quiet reading panel, technical archive and credited photographs. No covered-car model, floor, architecture, new audio/theme controls, or right-edge UI. The panel uses the transitions-dev panel reveal; its variables are local to Showcase rather than changing global tokens.

Full models use `loadFullResolutionCar(index, onProgress)`; the optional native byte-progress callback is the only loader API extension and preserves existing callers. Three-slot LRU, one serial decode/download, active model plus recent and one unlocked neighbour in browse direction. Obsolete queued work is skipped; obsolete completed work is disposed. Eviction disposes unique geometries, materials, textures, ImageBitmaps and skeleton resources. The inspection uses the existing renderer with its own DPR up to 2 and a four-sample offscreen target. It does not change Tour resolution settings.

Configured residency: at most **3** full-resolution cache entries, **1** in-flight model. Actual GPU geometry/texture counts and disposal totals: **not measured**. The snapshot includes cache/pending indices, peak residency, load/eviction/disposal counters and `renderer.info.memory` for runtime evidence.

Locked slots remove the mounted car and all editorial, imagery, voice and identity-colour data. Only a neutral question mark, slot number, and discovery copy remain. Narration stops before every switch and on close. It autoplays after presentation only when audio is already ready; explicit Listen uses the shared `startAudio()` path. Master mute and music mix remain audioManager-owned.

## Verification

- `npx vite build`: PASS (log: `local/evidence/S1/build.log`). Existing dynamic/static import warnings remain.
- `node --check` on the new Showcase, main, audioManager, and focused harness: PASS.
- `git diff --check`: PASS.
- Runtime: BLOCKED. `npx vite --host 127.0.0.1 --port 5317 --strictPort` failed with `listen EPERM: operation not permitted 127.0.0.1:5317`. No server was left running. No Chrome launch or broader campaign was attempted.
- Four stills, Day/Night material judgement, console-error check, requested browse sequence, narration switch/leave check and measured 12-switch GPU plateau: UNVERIFIED. No stills are represented as captured.

After the manager commits the new harness, the guarded path is:

```sh
scripts/run-harness.sh -R p5-hub-redesign -T S1-showcase-v1 scripts/verify-showcase-v1.mjs
```

This captures `day-unlocked.png`, `night-unlocked.png`, `locked.png`, `details-open.png`, and `verification.json` in `local/evidence/S1/`. It checks the requested arrow sequence with default locked state, then uses a test-only state fixture to unlock the roster for twelve switches, comparing GPU memory for repeated cache windows. It inspects audioManager's real voice diagnostics on switch/leave. It requires owned Vite provenance through the executor. The new uncommitted harness cannot be run through that executor yet; its guard requires tracked code unchanged against HEAD.

## Files changed

- `src/showcase/showcase.js`, `src/showcase/showcase.css` (new)
- `src/main.js`, `index.html`
- `src/scene/cars.js` (optional progress callback)
- `src/audio/audioManager.js` (read-only voice diagnostic only)
- `src/styles/base.css`
- `src/ui/showcase.js`, `src/styles/showcase.css` (removed)
- `scripts/verify-showcase-v1.mjs` (new, not run)
- This handoff

No commit, merge or push performed. Visual acceptance is outstanding.
