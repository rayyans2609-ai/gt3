# GT3 Racing Scroll Experience — Build Prompt

## 0. Build architecture — read this first

**You are Claude Opus 5, running in Claude Code. You are the MANAGER, not the primary implementer.**

You have an MCP tool registered as `codex-executor`, which runs OpenAI's Codex CLI on GPT-5.6 Sol. Codex is your EXECUTOR. Your job is to architect, decompose, delegate, review, and integrate — Codex's job is to write the bulk of the code.

**Why this split:** the user is on Claude Pro with limited weekly Opus quota, and a separate, more generous ChatGPT Plus quota for Codex. Every line of code you write yourself burns the scarcer resource. Delegate aggressively.

### Your responsibilities (Opus — do these yourself)
- Read this entire spec and build the architecture plan before writing anything
- Scaffold decisions: project structure, file layout, module boundaries, data flow
- Write precise implementation briefs for Codex — each one self-contained, with exact file paths, function signatures, expected behavior, and acceptance criteria
- Review every diff Codex returns; catch bugs, spec drift, and integration breaks
- Own the genuinely hard problems yourself if Codex fails twice on the same task: the scroll→drive spline math, the camera rig hierarchy, morph cross-fade timing, montage camera choreography, shader work
- Integrate the pieces and keep the whole coherent
- Maintain a running `BUILD_LOG.md` in the project root: what's done, what's in progress, what's blocked

### Codex's responsibilities (delegate these)
- All routine file creation and boilerplate (Vite config, HTML shell, CSS, module scaffolding)
- Implementing well-specified functions from your briefs
- Wiring DOM/HUD components
- Asset loading plumbing (GLTFLoader setup, audio wiring)
- Iteration loops: tweak-run-check cycles on values, styling, timing
- Bug fixes on clearly diagnosed issues
- Writing the 10 narration scripts for the voice files (see §10)

### How to delegate
When calling `codex-executor`, give it a brief in this shape:
```
TASK: <one line>
FILE(S): <exact paths>
CONTEXT: <what exists already, what it must integrate with>
REQUIREMENTS:
- <specific, testable>
- <specific, testable>
ACCEPTANCE: <how to know it's done right>
DO NOT: <scope boundaries — what not to touch>
```
Never send Codex a vague task. A bad brief costs two round-trips; a good brief costs one.

### Parallel agents
Where tasks are independent, spawn multiple Codex calls in parallel rather than sequentially. Example: track geometry, HUD overlay, and audio manager have no shared state at build time — brief all three at once. Do not parallelize anything that touches the same file.

### Escalation rule
If Codex returns broken output twice on the same task, stop delegating that piece and write it yourself. Don't burn quota on a third attempt.

### Build order
1. Project scaffold (Vite + Three.js) — delegate
2. Scene + camera rig + spline track — you architect, Codex implements
3. Scroll→drive mapping with damping — you write this yourself, it's the core feel
4. Car loading + rig attachment — delegate
5. Coins + collection trigger — delegate
6. Morph system — you architect, Codex implements
7. Montage sequence — you choreograph, Codex implements
8. HUD + spec panels + Showcase Mode — delegate
9. Audio manager — delegate
10. Time-of-day system — delegate
11. Start screen + finish sequence — delegate
12. Polish pass + integration review — you

Announce your plan before you start. Then execute.

---

## 1. Concept in one line
A desktop-only, single-page interactive experience where **scrolling drives a GT3 race car forward** along a winding, stylized racetrack seen from a pulled-back **45° bird's-eye camera**. Scrolling = driving. Floating coins along the track each represent a real GT3 car; collecting one triggers a **short cinematic showcase montage** then **morphs the player's car** into that car, with specs revealed in a refined HUD panel.

**Aesthetic:** premium luxury with a GT3 wash. Not an arcade game, not a dealership site — closer to how Porsche Motorsport or Ferrari presents its racing program digitally. Understated, precise, confident. The racing mechanics (track, HUD, coins, morph) sit on top of a luxury design foundation. Restrained palette, editorial typography, thin translucent UI, cinematic motion. The PS2-era arcade energy comes through in the *mechanics and camera*, not the visual styling.

## 2. Platform & scope
- **Desktop only.** Do not add mobile/responsive breakpoints or touch controls. Assume mouse + scroll wheel/trackpad on a wide viewport (~1280–1920px). A single "best viewed on desktop" note for small screens is enough.
- **One continuous page.** No multi-page navigation, no accounts, no database, no comparison tools, no unrelated sections. The race *is* the site.

## 3. Recommended technical approach
Use a **hybrid** architecture:
- **Three.js / WebGL** for the 3D scene — track, car(s), coins, grass, camera, and transformation effects. This is the correct tool for a 45° camera, curving track, depth, and smooth morphs. Do not attempt this in pure CSS/canvas; it will fight you.
- **A DOM (HTML/CSS) overlay** layered on top of the canvas for **all** HUD text, spec panels, the fullscreen car card, and the start screen. Text and layout are far cleaner and more readable in DOM than rendered inside WebGL. The canvas sits fixed behind; the HUD floats above.
- Keep it to exactly this. No physics engine, no multiplayer, no heavy asset pipeline beyond loading a handful of models/textures.

## 4. The scroll → drive mechanic (the heart of it)
- A tall invisible scroll spacer defines total race length. Compute `progress = clamp(scrollY / (scrollHeight − innerHeight), 0, 1)` — `0` at the start line, `1` at the finish.
- The track centerline is one smooth 3D spline (e.g. `THREE.CatmullRomCurve3`) with deliberate left/right sweeps and gentle elevation change. The full track geometry is generated along this spline once at load.
- A **car rig** (an empty group holding the car model + the camera) is repositioned every frame to `curve.getPointAt(t)` and oriented to face `curve.getTangentAt(t)`. As `t` grows with scroll, the rig travels the spline. Because **the camera is a child of the rig at a fixed offset**, the car stays locked in the same screen position (lower-center) while the world streams toward and past the viewer and the track visibly curves ahead. This is what produces "car anchored, world moving toward you."
- **Smoothing:** never map raw scroll straight to render. Each frame, lerp the rendered `t` toward the scroll target: `t += (target − t) * damping`. This gives the fluid, weighty, game-like glide instead of jittery 1:1 scroll. Scrolling up smoothly reverses the drive.
- **Speed feedback:** map scroll *velocity* to intensity — faster scrolling subtly widens FOV, strengthens motion blur, and intensifies the streaking of track lines and grass; slowing eases it back. Ties the sensation of speed directly to how hard the user scrolls.

## 5. Camera & framing
- `PerspectiveCamera`, moderate FOV (~45–55°), positioned above and slightly behind the car, tilted ~45° downward.
- Tune camera distance + FOV so the **car occupies roughly 15–25% of viewport height** — clearly identifiable, never dominating. This recreates the "≈50% zoom, wide view" feeling through camera distance, **not** by touching the browser's zoom.
- Keep the car near the **lower third** of the screen at all times, and reveal a generous run of track ahead so upcoming curves and the next coin are readable.
- Preserve depth via perspective, ground shadows, roadside objects, and streaming track markings. The camera must never cut to first-person, side-on, or flat top-down.
- **Corner drift:** on the sharpest turns, add a small extra camera tilt/lean-in that eases out as the track straightens — a light arcade-drift feel. Keep it subtle; the 45° framing stays intact.

## 6. Track & environment
- **Surface:** a smooth asphalt ribbon following the spline. Default tone: dark, desaturated charcoal.
- **Surface markings:** bright **racing-yellow** — a dashed centerline plus yellow accent lines/chevrons painted on the asphalt. A primary streaming motion cue.
- **Edge curbs (red & white):** classic **red-and-white** rumble-strip borders tracing both outer edges of the track for the whole route — **thin throughout, thickening occasionally into wider curb blocks** (at corners and accent points) before tapering back to thin. Reads as a real circuit and reinforces speed + corner readability.
- **Surroundings:** stylized **green grass** on both sides (flat or gently rolling) out to a simple horizon/skybox. Sparse low-poly dressing only — e.g. simple trees, distance markers, tire-stack chicanes, far-off grandstands — enough to sell "a real route," never cluttered.
- **Exactly one car on the track:** the player's. No AI opponents, no traffic.
- **Style:** clean low-poly-leaning 3D with flat/soft shading and bold color blocking. Stylized, not photoreal. Polished, not pixelated.

## 7. The player's car
- A single GT3-style car model, lower-center, always moving forward. **Asset strategy: real-car GLB/GLTF models sourced from Sketchfab (CC-BY or CC0 licensed, one per featured car). Load with `GLTFLoader`. All 10 models arrive pre-supplied in `gt3/models`; Claude Code scales, centers, and Draco-compresses them as needed. At the 45° pulled-back camera distance, silhouette and livery color carry the identity — minor mesh imperfections are acceptable.** Include a small attribution line at the finish screen crediting any CC-BY Sketchfab artists.
- The car must read clearly from the 45° camera — distinct silhouette with roof, front, and flanks all visible.
- Subtle life: slight body lean into corners (roll with the turn direction), faint wheel-spin blur, a soft contact shadow, optional gentle bob. Nothing that breaks the anchored framing.

## 8. Coins & the collectible mechanic
- **Ten** floating collectibles — one per featured car (see §15) — at set `t` positions along the track, spaced to pace the run.
- Each coin is **large and unmistakable** at the pulled-back distance — a spinning yellow disc/ring bobbing above the track — and is **pre-associated with the car it holds**: brand color treatment + a small emblem/silhouette/badge on the face. The player should be able to guess the car before collecting.
- **Trigger:** when the car rig's `t` passes a coin's `t` within a small threshold, that coin fires its collection sequence. **Coins reset when the user scrolls back past them** — the coin reappears and can be collected again on the next forward pass. This makes replaying the route feel complete.
- **Collection effect:** the coin **pixelates away** on collection — a dissolve into blocky pixels that scatter and fade. Clean, stylized, distinctive.
- **Feedback:** coin pixelates out with a particle scatter, `coin.mp3` fires, HUD confirms the car name.
- **Approach cue:** as the car nears the next coin, telegraph it — the coin pulses/grows or emits a soft light beam and an "incoming" badge appears in the HUD. `coin_approach.mp3` rises in volume as distance closes, cuts on collection.

## 9. Car transformation
- On collection, the player's car **morphs** into the featured car as part of the same animation — never an abrupt hard swap, never a page/section change.
- **Technique:** preload all car models. During a ~0.6–1.0s morph, mask the swap with a stylized effect over a cross-fade between old and new model — a brief emissive glow / energy pulse, a quick particle burst, optional digital-scan or silhouette-dissolve, light motion blur. The rig's position, orientation, and forward speed stay constant throughout, so the car stays anchored and keeps driving.
- The new car stays active until the next coin, then morphs into that one. Keep the effect readable at the wide camera distance and arcade-quick — a mechanic, not a cinematic. The HUD's active-car name/badge updates the moment the morph completes.

## 10. Coin collection — showcase montage
When a coin is collected, before the race resumes, fire a **short cinematic showcase sequence** for that car. This is the reward moment — treat it like a GT Sport car reveal, not a loading screen.

**Sequence:**
1. Scroll input is **paused and locked** for the duration.
2. The race canvas crossfades into a **clean isolated render environment** — a dark studio or a brand-color-matched backdrop (e.g. Rosso Corsa field for Ferrari, Lamborghini orange for Huracán). This is a secondary Three.js camera/scene or a render target that fades over the race view.
3. **3–5 pre-choreographed camera shots** play in sequence, each ~2–4 seconds:
   - **Shot 1:** wide 3/4 front — car sits static, slowly rotating on a turntable
   - **Shot 2:** low sweeping tracking shot along the flank from front to rear
   - **Shot 3:** close detail — rear wing, diffuser, or brake duct (wherever the model has the most detail)
   - **Shot 4 (optional):** interior/cockpit if the model supports it; otherwise a second dramatic angle
   - **Shot 5:** pull-back — camera eases back and tilts up to reveal the full car, then crossfades back into the race perspective
4. **Music:** a short stinger/swell plays for the duration of the montage. Wire an audio hook `onMontageStart(carIndex)` even if shipped silent — the hook is how the background track ducks and the stinger fires.
5. The **info card** overlays the montage in the bottom third. Content focus:
   - **Engine section (primary):** engine configuration, displacement, induction, power output, redline, transmission, drivetrain — this is the hero content, given the most space
   - **Race achievements (secondary):** notable results at specific circuits (Le Mans, Spa, Nürburgring, Daytona etc.), championship titles, GT3-class records, endurance history
   - Keep each field a single punchy line. No paragraph prose in the compact card.
   - 2–3 images sourced from Wikimedia Commons.

6. **Press `F` to enter Showcase Mode** — a fullscreen presentation triggered by keyboard at any point during or after the montage:
   - The 3D scene fades to black and the car model appears **centered, large, slowly rotating on its vertical axis** — idle, non-interactive, just the car breathing
   - A **description card sits beneath the model** — same engine specs and race achievements, but now with room to breathe: slightly longer prose, better formatted, more considered layout
   - A **female British voice (ElevenLabs TTS, pre-rendered to MP3)** reads the description aloud. Audio **autoplays** when Showcase Mode opens. A single **pause/play button** overlays the card — that's the only control needed.
   - Voice files pre-supplied in `gt3/audios/voices/` as `voice_01_lexus.mp3` through `voice_10_porsche.mp3`. Generate via ElevenLabs free tier using the description text — pick a calm, precise, authoritative British female voice.
   - Press `F` again or `Escape` to exit Showcase Mode and return exactly to where the race was paused.
   - Showcase Mode is the **one moment of full luxury presentation** — dark, quiet, spacious, the car as the subject. Let it breathe.
6. An **expand button** on the panel opens the fullscreen card (paused, dimmed) for users who want more. Closing it returns to the montage if still playing, or resumes the race if it has finished.
7. On Shot 5's crossfade, the car morph fires simultaneously — the new model is already loaded into the rig so the transition from studio back to race view is seamless.
8. Total montage duration: **10–18 seconds**. Never longer. The user can **skip** with a keypress or button — always offer an out.

**Technical note:** preload all 9 car models at startup (show a progress bar on the start screen while this happens). The studio scene is one shared environment; only the car model and backdrop color swap per collection. Do not create 9 separate scenes.

## 11. Information reveal & HUD
- **Persistent HUD** (compact, racing-game styled, hugs the edges, never blocks the track center):
  - active car name + brand badge
  - race progress (a stage bar tied to scroll progress, or a "distance" readout)
  - cars unlocked (e.g. "3 / 10")
  - a thin **route-map indicator** — a small winding-track glyph showing your position along the route plus coin markers, so progress and what's coming read at a glance
  - light telemetry flavor (optional, keep subtle)
- **On collection**, a compact spec panel animates in near a HUD corner and holds briefly **without covering the track**, then eases out as the user keeps scrolling. Fields, each a glanceable line: manufacturer, model, engine config, power output, drivetrain, racing series, one notable aero feature, one short endurance/GT3 fact. A race-unlock card, not a spec wall. Include 2–3 images per car sourced from **Wikimedia Commons** (public domain / CC licensed — fetch at build time by car name, no manual prep needed).
- **Fullscreen detail** (from your original ask): the panel has an expand control. Expanding opens a **fullscreen car card** with larger imagery, the full spec list, and more flavor. Opening it **pauses the scroll→drive mapping** and gently dims/blurs the 3D scene behind; closing resumes the race exactly where it paused. This keeps the default reveal non-blocking while still delivering the fullscreen card on demand.
- **Time-of-day selector (collapsible):** a small collapsible menu tucked in a HUD corner, **collapsed by default**. Expanding it lets the user choose **Dawn / Morning / Afternoon / Dusk / Night**; selecting one re-lights the whole scene — sky gradient, sun position and color, ambient light, shadow length, and grass/asphalt tint — with a smooth transition, never a hard cut. Default: **Afternoon** (bright, readable). Collapsed, it must not obstruct the track.

## 11. Cursor interaction
- Subtle, controlled mouse parallax that reinforces the wide 45° depth without hurting readability:
  - small eased camera tilt/yaw toward the cursor (a few degrees max)
  - light parallax on background/roadside layers
  - a slight shift/tilt of HUD panels
  - optional soft light/highlight response on the car or nearby coins under the cursor
- The core 45° framing must stay constant — cursor adds life, never takes control or makes the page hard to read.

## 12. Start screen → race handoff
- Open on a **start screen rendered as a DOM overlay in front of the already-running canvas**: the live, idling/slow-creeping track is visible through **transparent/translucent panels** behind the title.
- Contains: the site title **"GT3: A Grand Tour"**, a GT3 visual identity, a **"Scroll to Race"** prompt, and one line explaining that collecting coins unlocks and transforms into different GT3 cars.
- The **first scroll fades/slides the start overlay away** and begins mapping scroll → race progress on the same continuous canvas — no page load, no swap. The transition is one motion into the drive.

## 13. Finish & ending
- The final stretch leads to a clear **finish line** (checkered gate/banner) as progress → 1.
- On crossing: the last active car gets a brief hero beat (slow rotate or spotlight), plus a compact **recap of the cars discovered** this run (a small grid of unlocked badges + names). Then a short closing line and a **"Replay route"** control that resets scroll/progress to the start.
- Keep the ending in-world (racing-HUD language), not a generic footer.

## 14. Design system

### Aesthetic direction
The visual language is **premium luxury with a GT3 wash** — not an arcade game skin, not a dealership brochure. Think Porsche Motorsport's own digital presence, or how Ferrari presents its racing program: restrained, precise, confident, with racing detail as the texture rather than the headline. The GT3 elements (track markings, HUD telemetry, coin mechanics) sit *on top of* an understated luxury foundation, not the other way around. Nothing should shout. Everything should feel considered.

### Palette
- **Base:** near-black or very deep charcoal as the dominant tone — not pure black, slightly warm or slightly cool depending on the active time-of-day
- **Grass:** deep, slightly desaturated racing green — lush but not cartoon-bright
- **Track:** dark asphalt with subtle texture, not flat grey
- **Accent:** a single restrained warm tone — not yellow-yellow, closer to **champagne gold** or **aged white gold** — used for coins, key UI lines, and active-state indicators. Think FIA gold, not arcade yellow. The yellow track markings on the asphalt stay racing-yellow (they're functional, not decorative) but the UI gold is separate and more refined
- **HUD text:** pure off-white or very light warm grey — never bright white, never neon
- **Brand accent:** one subtle color per active car echoed in the HUD — pulled from that marque's actual brand color, used sparingly (a thin line, a badge glow, a stat bar fill)
- **Montage backdrop:** per-car — deep brand color field, not a generic grey studio. Rich Rosso for Ferrari, deep British Racing Green for Aston, Lamborghini Arancio at low saturation, etc.

### Typography
- **Display / car names / section headers:** **Cormorant Garamond** (Google Fonts, free) — a high-contrast serif with genuine luxury pedigree. Tall, elegant, slightly editorial. Used large and spaced. This is the face that makes it feel like a marque, not a game.
- **HUD labels / UI text / spec fields:** **DM Sans** or **Inter** — clean, neutral, modern grotesque. Completely invisible as a design choice, which is exactly right. Labels should recede; the information should come forward.
- **Numbers / telemetry / stats:** **DM Mono** — monospaced, tabular, precise. Feels like instrumentation rather than decoration.
- **Typographic behavior:** generous letter-spacing on all caps labels, tight tracking on large display text, restrained weights (light and regular mostly, bold only for car names and key callouts). Never heavy, never playful, never condensed-aggressive.

### HUD & interface styling
- Thin — very thin. Lines at 1px or less where possible. No chunky frames or thick brackets.
- **Frosted glass / translucent panels** where UI sits over the scene — a subtle backdrop blur with very low opacity fill, not solid cards. The track should always bleed through.
- Corner marks only as fine hairlines — not thick bracket graphics
- Small-caps labels in DM Sans, tracked out, light weight
- Numbers in DM Mono, tabular figures, no decoration
- No scanlines, no gloss, no arcade chrome — those read as game UI, not luxury
- The HUD should feel like it belongs on a Porsche dashboard, not a PlayStation menu

### Audio
Six files, pre-supplied in `gt3/audios`. Wire with Web Audio API — not HTML `<audio>`. Start all audio on first scroll (browser autoplay gate), never before.

| File | Trigger | Behavior |
|------|---------|----------|
| `background.mp3` | First scroll | Loops entire race at base volume. On montage start: **boost to 110–120% volume** (brief swell to signal the reveal), then return to base when race resumes |
| `engine_start.mp3` | First scroll | Fires once as start screen fades, overlaps into idle loop, fades out after 3s |
| `idle.mp3` | After engine_start fades | Loops continuously under background track, very low volume (~15%). Pitch shifts subtly up with scroll velocity |
| `coin.mp3` | Coin collected | Fires once per collection, before montage |
| `coin_approach.mp3` | ~15% track distance before each coin | Plays as a rising ping, gets slightly louder as car closes in, stops on collection |
| `finish.mp3` | Finish line crossed | Fires once, no loop |
| `gt3/audios/voices/voice_01_lexus.mp3` … `voice_10_porsche.mp3` | Showcase Mode opens for that car | Autoplays, pauseable via on-screen button. Pre-rendered ElevenLabs TTS, calm precise British female voice |

No car morph SFX. No montage intro sting — the background volume boost handles that moment. The only audio files are the 6 in `gt3/audios` plus the 10 voice files in `gt3/audios/voices/`. Do not add others.

### Motion
- Slow, deliberate, eased — nothing snaps or pops aggressively
- Coin collection chime and morph are still satisfying but the animation style pulls back from arcade-snappy toward **smooth and cinematic**
- Montage camera moves: slow, drifting, confidence — not fast cuts
- Transitions between time-of-day: long, graceful crossfade
- Parallax and cursor response: barely perceptible, like the scene breathing — not reactive

### Hierarchy
- Track + car own the center always
- HUD lives at the edges, transparent enough that it feels like instrument glass
- Spec panels are secondary and transient — they appear quietly and leave quietly
- The fullscreen card is the one moment of deliberate luxury presentation — give it space, give it air, let the car breathe on screen
- White space is intentional — resist the urge to fill every corner of the HUD

## 15. Featured car roster
- **10 cars, 10 coins, locked order — do not change.** All models sourced as free GLB downloads from Sketchfab, dropped into `gt3/models`. Load each with `GLTFLoader` and associate to its coin by index.

| Coin | Car | File hint |
|------|-----|-----------|
| 1 | Lexus RC F GT3 (2018) | `lexus_rcf_gt3.glb` |
| 2 | Nissan GT-R GT3 | `nissan_gtr_gt3.glb` |
| 3 | Audi R8 LMS GT3 (2020) | `audi_r8_gt3.glb` |
| 4 | BMW M6 GT3 | `bmw_m6_gt3.glb` |
| 5 | Mercedes-AMG GT3 | `mercedes_amg_gt3.glb` |
| 6 | Ferrari 488 GT3 (2018) | `ferrari_488_gt3.glb` |
| 7 | McLaren 720S GT3 | `mclaren_720s_gt3.glb` |
| 8 | Aston Martin Vantage GT3 | `aston_vantage_gt3.glb` |
| 9 | Lamborghini Huracán GT3 EVO2 (2023) | `lamborghini_huracan_gt3.glb` |
| 10 | Porsche 911 GT3 R (2023) | `porsche_911_gt3r.glb` |

- Pacing rationale: opens with the two Japanese underdogs (Lexus, Nissan), transitions into the Europeans, Italian heat at #6, visual standouts #7–8, climaxes with the two most dramatic silhouettes, closes on the most iconic GT3 car ever built.
- For each car: manufacturer, model, year, engine config, power output, drivetrain, racing series, one notable aero feature, one endurance/GT3 fact. Keep copy to glanceable lines. Panel images (2–3 per car) sourced from **Wikimedia Commons** at build time by car name.

## 16. Hard constraints (do NOT do)
- No mobile/responsive work.
- Don't literally change browser zoom — recreate the wide view via camera distance/FOV/scale.
- Don't let the car dominate the screen, and don't shrink the car/coins into unreadable dots.
- Don't drift into: a generic SaaS site, a dealership/gallery site, a realistic sim, an F1 site, cyberpunk/neon, a wall of rectangular cards, a flat top-down map, unrelated car-profile pages, or normal vertical scrolling with a racing animation pasted on top.
- No opponents or traffic — only the player's car.
- No abrupt model swaps or page-like section jumps — one continuous race.
- Nostalgic in mechanics, yes. Nostalgic in visual styling, no — the aesthetic is modern luxury, not retro game.
- No chunky HUD frames, no thick bracket graphics, no scanlines, no gloss effects, no arcade chrome, no neon
- No heavy typefaces, no condensed-aggressive fonts, no playful display faces — the typography is editorial and restrained
- No solid opaque UI panels sitting over the track — everything translucent, frosted, or edge-hugging
- No bright white or saturated color — the palette is deep, warm, restrained
