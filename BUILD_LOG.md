# BUILD LOG — GT3: A Grand Tour

Manager: Claude Opus 5. Executor: Codex CLI (gpt-5.6-sol) via `codex exec`.
NOTE: `codex-executor` MCP server failed to connect (CONNECTION_CLOSED);
delegation runs through the `codex` CLI in Bash instead. Same quota, same split.

## Asset audit (2026-08-28)
- models/: 10/10 GLB present, correctly named. 270 MB total -> needs compression.
- audios/: 6/6 SFX present.
- audios/voices/: MISSING. 10 ElevenLabs narration MP3s not supplied.
  Mitigation: scripts written to audios/voices/SCRIPTS.md; Showcase Mode
  degrades gracefully (silent, pause button disabled) until files are added.

## Status
| # | Task | Owner | State |
|---|------|-------|-------|
| 0a | GLB compression pipeline | Codex | in progress |
| 0b | Vite scaffold + HTML shell + CSS tokens | Codex | in progress |
