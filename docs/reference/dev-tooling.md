# Dev tooling (outside GT3's production dependencies)

When to reach for these and for other creative tools: `creative-tooling.md`. This note covers what is installed, where, how it was verified (2026-11-04, Intel 8 GB Mac), and what is *not* done. Per-host: the Spector setup lives in the user's home, not in this repo, so the M4 needs its own install.

## Spector.js MCP — Claude Code, global (installed)

Lets a Claude session load a URL in headless Chromium, capture one WebGL frame, and inspect draw calls, shaders, textures and GL state. **Not** part of GT3: no `package.json` entry, nothing in this repo.

| | |
|---|---|
| Upstream | `BabylonJS/Spector.js`, `mcp/` directory, pinned `9800c92e` (2026-10-26), MIT. It is **not** an npm package: it runs from a clone. |
| Clone | `~/.claude/mcp-servers/Spector.js` (outside the repo) |
| Registration | `claude mcp add --scope user spector -- node ~/.claude/mcp-servers/Spector.js/mcp/dist/index.js` (stored in `~/.claude.json`; absent from every project file) |
| Browser | Playwright Chrome Headless Shell (about 100 MB, `~/Library/Caches/ms-playwright`), downloaded by `npx playwright install chromium`. No full Chrome and no extension needed. |
| Smoke page | `~/.claude/mcp-servers/spector-smoke/` on this host only (`index.html`, raw WebGL1, 2 draw calls; `serve.mjs`, loopback only, self-terminates after 10 min). On another host any small raw-WebGL page serves the same purpose. |

**Reinstall (another Mac or a clean machine):**

```
git clone --depth 1 https://github.com/BabylonJS/Spector.js.git ~/.claude/mcp-servers/Spector.js
cd ~/.claude/mcp-servers/Spector.js/mcp
npm ci --ignore-scripts          # upstream says `npm install`; ci + no scripts is stricter and was sufficient
npx playwright install chromium
npm run build
claude mcp add --scope user spector -- node ~/.claude/mcp-servers/Spector.js/mcp/dist/index.js
```

The root `dist/spector.bundle.js` that the server injects is committed upstream, so no webpack build is needed.

**Tools (13):** `load_url`, `load_playground`, `take_screenshot`, `list_canvases`, `select_canvas`, `capture_frame`, `get_draw_calls`, `get_command_details`, `get_shaders`, `get_textures`, `get_webgl_state`, `get_context_info`, `get_console_logs`.

**Verified:** `claude mcp get spector` reports `✔ Connected`. A headless Haiku 5.5 session (subscription login, strict MCP config containing only this server) called `load_url`, `list_canvases`, `capture_frame`, `get_draw_calls`, `get_shaders`, `get_textures`, `get_context_info` and `get_console_logs` against the smoke page and returned 22 commands, 2 draw calls plus 1 clear, 2 linked programs with source, `WebGL 1.0 (OpenGL ES 2.0 Chromium)`, and no console errors.

**Caveats:**
- An MCP server is loaded when a session starts. A session that was already open when it was registered cannot call `mcp__spector__*`; start a new one.
- `get_textures` lists only uploads *inside the captured frame*. Textures uploaded once at page start are absent (true of the smoke page).
- The capture summary's "duration" read `110400 ms`, which is implausible; it was not used and not investigated.
- The GL renderer string is masked (`WebKit WebGL`). Do not draw GPU-performance conclusions from a headless capture; it shows command structure, not timing.
- **Not exercised against GT3's own scenes** (the full scene is heavy on this host).

**Host limits:** one headless browser at a time. Run `node scripts/host-check.mjs preflight browser` first and wait on exit 75. Serve test pages from loopback only and stop the server afterwards. Use the owned verification server (`scripts/with-verification-server.sh`) if you point it at GT3.

## Lucide — vanilla-JS icons (installed as a dependency on `p5-hub`, unused)

| | |
|---|---|
| Package | `lucide` `^1.67.0`, ISC, `sideEffects: false` (commit `f81fee6`) |
| Used by | Nothing yet. **No source file imports it, no existing icon was changed, and no helper module exists** (there is no consumer). |
| Why here | GT3's icons are hand-written SVG strings (`src/ui/homeControl.js`, `themeToggle.js`, `soundControl.js`, `player.js`, `hud.js`) in one style: 24 viewBox, `currentColor`, 1.5 stroke, round caps. Lucide uses the same grammar, so it fits Phase 5's Hub player, which needs several new icons. It would not improve consistency for the accepted icons, so they stay. |

**Use (per-icon only):**

```js
import { createElement, Play, Pause, SkipBack, SkipForward } from 'lucide';
button.append(createElement(Play, { 'stroke-width': 1.5 })); // Lucide's default is 2; GT3's accepted icons use 1.5
```

`createElement` builds a real SVG node with `createElementNS`; no `innerHTML`. Deep imports also work: `lucide/dist/esm/icons/<kebab-name>.mjs` (default export is the icon data).

**Rule:** import named icons or deep paths. Never import or spread the `icons` namespace, and never call `createIcons({ icons })` with it, because that bundles all 2,019 icons.

**Measured** (Rollup/Vite 7 library build, minified; resolved through `node_modules` and also confirmed with esbuild):

| Imported | raw | gzip |
|---|---|---|
| 1 icon | 767 B | 456 B |
| 6 icons (play, pause, skip ×2, volume ×2) | 1.9 KB | 780 B |
| whole `icons` namespace | 549 KB | 103 KB |

The 1-icon bundle contained that icon's path data and no other icon. GT3's own production build was **not** re-run: nothing imports Lucide, so the bundle is unchanged by construction.
