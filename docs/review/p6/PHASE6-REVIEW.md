# Phase 6 Collection and emblem review

Development branch `p5-hub-redesign`. The rendered implementation checkpoint is `87761ffc0963f893109953005ed51fd6c4358d20`. It includes Opus’s Collection refinement at `25aca5d`, the sculpted McLaren at `46537e8` and the final asset preparation corrections at `5debad2`. Visual decisions and phase acceptance are with the owner.

## Launch on the M4

From the prepared `p5-hub-redesign` worktree:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [http://localhost:5173/](http://localhost:5173/). Scroll from Landing to Hub, then choose **SHOWCASE**. Choose a discovered car name to reveal its emblem. Click the emblem or focus and activate **Open Showcase** to inspect that car. **ENTER SHOWCASE** opens the full roster from the Lexus. The right-edge drawer switches Day and Night. Discovery follows the active session.

| Review setting | URL suffix |
| --- | --- |
| Circuit names or preserved Cars selector | `/?collection=names` or `/?collection=cars` |
| Hub composition | `/?layout=horizontal` or `/?layout=vertical` |
| Loader | `/?loader=checker`, `/?loader=circuit` or `/?loader=strip` |
| Day palette | `/?palette=cream` or `/?palette=ivory` |
| Dev-only direct Showcase entry, with discovery rules | `/?showcase=0` through `/?showcase=9`, or `/?showcase=full` |

Parameters combine, for example `/?collection=cars&layout=vertical&loader=strip`.

## M4 previews

Files below are relative to `local/review/p6/` in the M4 development worktree.

| Preview | Local file |
| --- | --- |
| Ten emblems at 0°, 35° and 70° in Day and Night | `sheet-v2.png` |
| Integrated Collection with Porsche selected | `final-day-sel.png`, `final-night-sel.png` |
| McLaren front and three-quarter, both themes | `mclaren/speedmark-front-day.png`, `mclaren/speedmark-q35-day.png`, `mclaren/speedmark-front-night.png`, `mclaren/speedmark-q35-night.png` |
| McLaren comparison sheet | `mclaren/speedmark-compare-day-night.png` |

Compare McLaren with `mclaren_ref1.webp` for colour, `mclaren_ref2.avif` for shape and `mclaren_ref3.jpeg` for curvature, material and reflections. The originals are in `models/logo models/McLaren references/` in the main checkout. The source models and review images stay local.

## Implemented

- Discovered circuit names and anonymous locked `?` markers. Names sit beside the circuit, with monochromatic labels at rest and identity colours on hover, selection and pulse.
- One individually fitted 3D emblem that floats, turns and responds to the cursor using the historical pre-drag McLaren motion. Showcase vehicles retain drag-to-orbit.
- Nine prepared local GLBs and GT3’s sculpted runtime McLaren. Lexus uses the oval and L, Mercedes has its star and ring, Lamborghini shows its textured gold artwork, and Aston Martin has separate chrome wing, lettering and enamel zones. Porsche went from 3,617,958 to 45,228 triangles and four draws.
- Car-specific and full-roster entry use Showcase V1. Narration starts from **Listen to the story** and offers pause, resume and replay. Changing cars or leaving stops playback.
- [Asset provenance and adaptations](../../assets/badge-attribution.md) and [local preparation](../../assets/badge-assets-setup.md).

## Verification and owner review

- B3 passed geometry, asset lifecycle and build checks, including a build without the optional GLBs. A fresh M4 candidate preparation produced the same nine GLBs and manifest, byte for byte, as the worker's preparation. [B3 evidence](../B3-badge-corrections.md)
- The M4 Chrome capture batch used ANGLE/Metal and an owned Vite server at `87761ff`. The sheet shows all ten models in both themes. The integrated captures show Porsche selected in Collection with only its GLB and the manifest requested. Chrome logged a missing optional crest placeholder warning before the model loaded and existing Three.js depth-material `fog` warnings. Logs and provenance are under `local/evidence/R6-review-captures/`.
- Opus's existing evidence covers locked identity suppression, fallback without local badge files, emblem entry, full entry at roster index 0, return to Collection and narration idle on arrival and car switch. This pass focused on the changed assets and their presentation. Other viewports, drawer-open fit and another narration playback pass were outside the capture batch.
- Review apparent size and vertical balance, material readability in Day and Night, McLaren against the references, label and entry typography, and the prepared standalone versus pack options. The covered-car model, expanded manual unlocking and montage remain deferred.

## Sync the Intel checkout

From the Intel Mac, inspect the published worker checkpoint against the local branch. If `showcase-badges` is checked out in a worktree, also run `git status --short` there to see uncommitted edits.

```sh
cd ~/Desktop/gt3
git fetch origin
git log --oneline origin/showcase-badges..showcase-badges
git worktree list
```

An empty log means the local worker branch has no unpublished commits. A missing local branch means there's no local branch to compare. Share any listed commits or local edits before changing that worktree.

If the development worktree and local branch are both absent, create them from the published candidate:

```sh
git worktree add --track -b p5-hub-redesign .claude/worktrees/p5-hub-redesign origin/p5-hub-redesign
```

If the branch exists locally without a worktree, use `git worktree add .claude/worktrees/p5-hub-redesign p5-hub-redesign`. In an existing development worktree, check `git status --short` and proceed when clean:

```sh
cd ~/Desktop/gt3/.claude/worktrees/p5-hub-redesign
git merge --ff-only origin/p5-hub-redesign
git rev-parse HEAD
npm ci
```

For a reproducible source setup, copy the M4’s `models/logo models/` folder into the Intel checkout root, keeping the Porsche `.gltf`, `.bin` and licence together. Run `node scripts/prepare-badge-models.mjs` from the Intel development worktree. For runtime review alone, copy the complete prepared `public/badges/` folder to that worktree instead, including `manifest.json`. The M4 also has a private copy of this runtime set in `local/transfer/p6-runtime-badges-87761ff.zip`. Extract it at the Intel development worktree root and verify with `shasum -a 256 -c SHA256SUMS` from `public/badges/`.

Have the licensed `font/` directory in the Intel development worktree. McLaren is part of the code so it needs no mesh transfer. Use the same launch command and URL as on the M4. This sync procedure only updates the development branch. The Intel checkout and its local assets still need a check on that Mac.
