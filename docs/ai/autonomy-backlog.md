# Autonomous Mode — deferred backlog (Phase 3 closure sprint; commit to docs branch docs/ai/autonomy-backlog.md when no worker is running)
1. Reclaim from an unavailable continuity manager — Sol→Opus handback 2026-09-29 needed Opus to act with Sol's stored identity (Codex out). Add `ctl reclaim` requiring evidence: no active turn, no pending actions, provider unavailable.
2. Opus wake after Claude reset — watcher touched opus-wake 19:21; nothing woke Opus; user message did. Optional waker unbuilt/unverified.
3. Failover target when Codex exhausted — Sol failover useless without Codex weekly quota; watcher stopped for the full-Claude period. Consider Claude-side continuity target or accept stall.
4. Activity-watchdog startup grace — watchdog-activity.sh fires immediately at task start (no change in the window before start).
5. Model-free / Claude-only watchdog interpretation — taskwatch.sh depended on Luna; TASKWATCH_NO_MODEL=1 added; Sonnet Low interpretation path open.
6. Single-view run status (manager, gen, task, stage, health, quota block, progress, handoff).
7. Quota-source discrepancy — 2026-09-29 14:55–14:57 Codex CLI rejected while user reported ample; cause UNKNOWN; no machine-readable usage.
8. Universal-core extraction ([CORE] tags) after live use; one Astra boundary review once Codex returns.
9. Sonnet 5.5 vs Sol routing evidence — compare after Codex restore.
10. Worktree switching while a subagent runs may re-scope the subagent (earlier worker blocked when spawned while switched) — batch docs-branch commits between worker runs.
