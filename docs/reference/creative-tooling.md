# Creative tooling strategy (Phase 5 onward)

Durable guidance for visually relevant work: Phase 5 onward and any substantial revision of an earlier phase. It says **which external techniques and tools exist for GT3, what state each is in, and when one earns its place.** It is not a checklist, a design stage or an execution policy. Product truth stays in `SPEC.md`. Who does the work and how it is verified stays in `docs/ai/model-routing.md` and `operating-contract.md`. Technical how-to stays in the notes linked below.

Status reconciled 2026-11-04 against `main` (after the `p5-hub` tooling integration) and the Intel host. Re-check before relying on a row; installs are per host.

## Principle

Judge the result by the finished, running experience: distinctive art direction, coherent composition, refined motion, convincing automotive presentation and responsive performance. To get there, **look for proven external techniques before inventing or accepting a generic one**, and reuse selectively. A known-good mechanism adapted to GT3 usually beats a model-generated default or a from-scratch rebuild.

Use tools intelligently, not maximally. Every entry below is an option. Do not use one unless it solves a real visual, interaction or performance problem in front of you. Avoid disconnected effects, new dependencies without a consumer, framework migrations, heavy setup and long mockup or research loops. A short look at a reference is fine; a research phase is not.

## Toolkit and status

Status labels: **installed** = present and wired, with a consumer or proof; **installed, unused** = present, no consumer yet; **tested** = exercised end to end at least once; **available** = usable from this harness or the web without a GT3 change; **reference only** = studied, deliberately not integrated; **not installed** = would need a host install first. "Not exercised on GT3" means the tool worked on a test page but never on GT3's own scenes.

| Capability | Status (2026-11-04) | Use it for | Details |
|---|---|---|---|
| **GSAP** core, **Flip**, **SplitText** | Installed dependency (`gsap ^3.15.0`); verified in a built bundle in Chrome (core tween, Flip, SplitText); no GT3 source imports it yet. Not used for the Phase 5 Hub: its ticker runs its own `requestAnimationFrame` (single-RAF rule, `ARCHITECTURE.md`), and CSS/WAAPI covered the Hub's needs | Code-driven UI motion: choreography, state/scroll/event-driven tweens, layout transitions (Flip), text reveals (SplitText) | `ARCHITECTURE.md` "Animation authoring" (GSAP vs Theatre) |
| **Theatre.js** | Installed and tested as dev-only authoring (`@theatre/studio` dev, `@theatre/core` dep); `?theatre` proof drives an off-scene probe only; no production playback | Scrubbable, hand-tuned, multi-property sequences judged by eye: camera and hero moves, light and material choreography | `ARCHITECTURE.md` "Animation authoring (Theatre.js, dev-only)" |
| **Lucide** | Installed and used: `src/ui/hubPlayer.js` (Phase 5 Hub player: skip, play/pause, music, plus/close), per-icon imports at stroke 1.5 | Selected icons for new UI (Phase 5 Hub player). Per-icon imports at stroke 1.5; accepted hand-written icons stay | `docs/reference/dev-tooling.md` "Lucide" |
| **Transitions.dev** skills (`transitions-dev`, `transitions-polish`, `transitions-ui-generation`) | Available: user-level Claude Code skills (`~/.claude/skills/` → `~/.agents/skills/`), auto-discovered by intent or invoked by name. Not used on GT3 yet. Intel host only until installed on the M4 | CSS transition recipes and motion tokens for UI states; polishing existing timing and easing. `ui-generation` ("AI is generating this") is off-brand for GT3 by default | Skill files; license allows use, not redistribution of the library |
| **Anthropic `frontend-design`** | Available: user-scope plugin (`frontend-design@anthropic-plugin-directory`), skill `frontend-design:frontend-design`. Intel host; check the M4. Used for the Phase 5 Hub plan (2026-11-04) | Pushing UI work away from template defaults: typography, composition, intent | Plugin skill |
| **Penpot MCP** | Available: user-scope HTTP MCP (`penpot`, hosted `design.penpot.app`; the registration carries a personal token, so never copy it into the repo). Tools load in new sessions. Not exercised on GT3 | Optional editable workspace when structured layout or component exploration clearly pays off. Not a mandatory design stage; the running app is still the acceptance surface | — |
| **Spector.js MCP** | Installed and tested (user scope) on a smoke page; **not exercised on GT3** | WebGL frame capture: draw calls, shaders, textures, GL state. Diagnosis only; headless captures give structure, not timing | `docs/reference/dev-tooling.md` "Spector.js MCP" |
| **Metal FX** (`Jakubantalik/metal-fx`) | Reference only (React + its own WebGL1 context) | A possible iridescent accent ring or UI rim, if a concrete use appears. It is not car paint or PBR metal | `docs/reference/metal-fx.md` (includes the proposed experiment) |
| **Three.js physical materials and image-based lighting** | Built into `three 0.180` (`MeshPhysicalMaterial`: clearcoat, sheen, transmission, iridescence, anisotropy; `HDRLoader`, `EXRLoader`, `PMREMGenerator`). GT3 currently uses `MeshStandardMaterial` cars and a **procedural** PMREM car-only reflection (`src/scene/carEnvironment.js`, never `scene.environment`). The car GLBs carry no `KHR_materials_*` extensions, so physical properties would be set in code | Paint clearcoat, glass, metallic trim, convincing reflections, studio-style lighting | `ARCHITECTURE.md` "Rendering model"; `carEnvironment.js` |
| **Poly Haven, ambientCG** | Available sources on the web (both publish CC0 assets) | HDRIs, PBR textures, occasional models | Confirm the licence on each asset page; record source and licence beside the asset |
| **Codrops, React Bits, Motion Primitives, Animata, Magic UI** | Available as references | Proven visual mechanisms and inspiration. Codrops demos are often vanilla JS + GSAP/Three and port most directly. The others are mostly React/Tailwind/Motion components: read the source and **re-express the mechanism in GT3's vanilla DOM + GSAP/CSS**; never add React or their component libraries | Check each repository's licence before copying code; keep required notices |
| **Blender** | Not installed on the Intel host (M4 unknown) | Selective modelling, cleanup, UVs, baking or prep of a specific asset | Install only when an asset task needs it |
| **glTF Transform** | Not installed (no repo dependency; `npx @gltf-transform/cli` works for one-off use) | Inspecting and optimizing models and textures (`inspect`, dedup, prune, texture resize/compress) when a measured load or memory problem justifies it. `models/` is about 258 MB | Keep originals; compare visually after any change |

When a row's status changes (first real use, an install on the M4, a promotion out of dev-only), update the row in the same change.

## Phase application

These are emphases, not requirements. The phase's `SPEC.md` sections govern scope.

- **Phase 4 Landing revision (PROPOSED, owner review required; not scheduled).** Directions and open choices are recorded in `GT3_MASTER_CONTEXT.md` "Current phase". Relevant tools if it is opened: GSAP and Transitions.dev for motion and type polish, `frontend-design` for hierarchy, existing-renderer shader work for any material experiment (not Metal FX or a second pipeline).

- **Phase 5 — Hub.** Priorities: coherent composition, typography, navigation, player interactions and polished motion. GSAP (Flip for player expand/recompose, SplitText for restrained type motion), Transitions.dev for state transitions and timing polish, `frontend-design` for compositional intent, and selectively adapted mechanisms from the reference libraries. Lucide for new player and controls icons, matched to the accepted icon grammar.
- **Phase 6 — Showcase.** Unlocked-car quality is the focus, and the locked/unlocked difference must be visually meaningful. Explore physically based paint (clearcoat), glass, metallic surfaces, realistic reflections and carefully authored studio lighting, with an HDRI (Poly Haven) as a **reflection/lighting source only**, following the existing car-only reflection pattern. Theatre.js is suited to deliberate camera and lighting choreography. Keep the canonical direction (SPEC §11): hero car, substantial negative space, pale Day and deep navy Night fields, no garage, floor, plinth or clutter. The HDRI must not become a visible background. Final lighting and material treatment is the owner's call.
- **Phase 7 — Completion.** Theatre.js (authored, scrubbable sequences) and GSAP (state-driven sequencing and UI) for cinematic motion, on the existing renderer, Grand Tour scene/camera and audio systems (SPEC §21, §27). No third animation architecture and no second renderer.
- **Phase 8 — Scenery and lighting.** Blender, physical materials, HDRIs and Poly Haven/ambientCG assets, plus authored lighting, for sculptural scenery and the premium Night-driving environment (SPEC §13a, §16–17; `ARCHITECTURE.md` "Known later dependencies"). glTF Transform and Spector.js where they improve measured performance or diagnosis. The spec's environment, lighting and performance requirements bound every choice.
- **Substantial revisions of any phase.** Revisit the relevant rows when one could solve an actual visual, interaction or performance problem. A full toolkit review is not required each time.

## Integration discipline

1. **Inspect before adopting.** Read the actual source; check compatibility with vanilla JS + Three 0.180 + Vite, dependencies, licence, bundle size and runtime cost. Label claims read, measured or inferred, as `metal-fx.md` does.
2. **Reuse, don't force.** Prefer a proven, compatible implementation over reinvention. Do not bring in React components, a second production WebGL context or a standalone effect system; port the mechanism instead.
3. **Preserve what is accepted.** The single shared renderer and its sanctioned exception, animation ownership (bind or tween only properties no other system writes in that frame), the Theatre dev-only/production separation, scroll ownership, the global theme and accepted product behaviour.
4. **Dependencies need a consumer** in the same phase. Assets need a recorded source and licence and a size check against load and memory budgets.
5. **Judge in the running app.** Mockups, Penpot frames, stills and Spector captures support decisions; they do not accept effects. Performance claims need real-device measurement (the Intel UHD 617 host is the floor).
6. **The owner decides taste.** Subjective art direction and final visual acceptance belong to the owner. Offer provisional picks with alternatives rather than stopping.
7. **No parallel policy.** Who runs the work, at what effort, and how it is verified follow `model-routing.md` and `operating-contract.md`. Browser and capture work follows host-resource rules (`scripts/host-check.mjs preflight browser`, owned verification server).

## Known limitations (2026-11-04)

- GSAP, Transitions.dev and Penpot have not been used on GT3 yet (Lucide and `frontend-design` were first used for the Phase 5 Hub, 2026-11-04). Spector has not captured a GT3 scene. Theatre has not driven a real scene object or shipped playback.
- The Spector, Transitions.dev, `frontend-design` and Penpot setups are user-level on the Intel host. The M4 needs its own installs (Spector reinstall steps are in `dev-tooling.md`).
- Blender and glTF Transform are not installed. No HDRI or external PBR asset has been evaluated in GT3.
