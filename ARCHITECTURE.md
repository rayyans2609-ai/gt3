# GT3: A Grand Tour — Architecture (authoritative; read before any task)

Desktop-only single-page WebGL experience. Vite + Three.js (ESM, no framework).
Scroll drives a GT3 car along a spline track under a 45° pulled-back camera.
DOM overlay handles ALL text/HUD. Canvas is fixed behind it.

## Directory layout
```
/                     project root (this dir)
  index.html          Vite entry, DOM overlay markup lives here
  vite.config.js
  package.json
  models/             SOURCE glb files (270MB, do not ship, do not modify)
  audios/             SOURCE mp3 files (ship via copy to public/audios)
  public/
    models/           COMPRESSED glb output (shipped)
    audios/           copied mp3 (shipped)
    images/<carId>/   Wikimedia images (shipped)
  scripts/            build-time node scripts (compression, image fetch)
  src/
    main.js           bootstrap, module wiring, single RAF loop
    core/
      state.js        central mutable store + pub/sub
      clock.js        delta time
    scroll/
      scrollDrive.js  OWNED BY MANAGER — do not edit unless briefed
    scene/
      sceneSetup.js   renderer, scene, camera, composer/postfx
      track.js        spline + asphalt ribbon + yellow markings + red/white curbs
      environment.js  grass, sky, trees, grandstands, tire stacks, markers
      timeOfDay.js    5 lighting presets + smooth crossfade
      carRig.js       rig group (car mount + camera child), lean/roll/bob
      cars.js         GLTF preload of 10 cars, normalize scale/center
      coins.js        10 coins, spin/bob, approach cue, pixel dissolve
      morph.js        cross-fade car swap w/ emissive pulse + particles
      finishLine.js   checkered gate at t=1
    montage/
      studio.js       shared studio scene (one only), per-car backdrop color
      choreography.js 5-shot camera timeline
    ui/
      startScreen.js hud.js specPanel.js fullscreenCard.js showcase.js
      todSelector.js finishScreen.js
    audio/
      audioManager.js Web Audio API graph
    data/
      cars.js         roster data (10 cars, locked order)
    styles/
      base.css hud.css montage.css showcase.css screens.css
  BUILD_LOG.md
```

## Central state (src/core/state.js)
Single exported object `state` + `subscribe(key, fn)` / `set(key, value)`.
Keys:
- `progress`      0..1 damped render progress along spline (written by scrollDrive)
- `targetProgress`0..1 raw scroll target
- `velocity`      signed scroll velocity, normalized ~-1..1
- `speed01`       0..1 abs speed intensity for FOV/blur
- `started`       bool, true after first scroll (start screen dismissed)
- `activeCarIndex` 0..9, current car in the rig (starts at 0 = Lexus)
- `unlocked`      Set<number> of collected coin indices
- `mode`          'race' | 'montage' | 'showcase' | 'fullcard' | 'finish'
- `scrollLocked`  bool — when true scrollDrive ignores input and holds progress
- `timeOfDay`     'dawn'|'morning'|'afternoon'|'dusk'|'night' (default 'afternoon')

Rule: modules NEVER read `window.scrollY` directly except scrollDrive.js.
Rule: only ONE requestAnimationFrame loop, in main.js. Modules export `update(dt, state)`.

## Locked car roster (order is fixed, index = coin index)
0 lexus_rcf_gt3 · 1 nissan_gtr_gt3 · 2 audi_r8_gt3 · 3 bmw_m6_gt3 · 4 mercedes_amg_gt3
5 ferrari_488_gt3 · 6 mclaren_720s_gt3 · 7 aston_vantage_gt3 · 8 lamborghini_huracan_gt3
9 porsche_911_gt3r

## Design system (non-negotiable)
- Fonts: Cormorant Garamond (display/car names), DM Sans (UI labels), DM Mono (numbers). Google Fonts.
- Palette tokens (CSS vars in base.css):
  --ink:#0B0B0C  --ink-2:#141416  --gold:#C6A96B (FIA/champagne gold, UI accent)
  --paper:#EDE9E3 (off-white HUD text)  --hair:rgba(237,233,227,.16)
  --track-yellow:#E8C33A (asphalt markings ONLY, never UI)
  --green:#1E3A2A (grass base)
- HUD: 1px hairlines, backdrop-filter blur, fill opacity <=0.18. No thick frames,
  no scanlines, no gloss, no neon, no solid panels over the track.
- Motion: slow, eased (cubic-bezier(.22,.61,.36,1)), nothing snaps.
- All-caps labels: DM Sans 300, letter-spacing .14em, font-size 10-11px.
- Numbers: DM Mono, font-variant-numeric: tabular-nums.

## Hard constraints
No mobile/responsive breakpoints. No physics engine. No opponents/traffic.
No hard model swaps. No arcade chrome. Exactly the 6 SFX + 10 voice files, no others.
