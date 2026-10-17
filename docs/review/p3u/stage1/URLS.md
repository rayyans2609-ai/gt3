# Stage 1 live configurations and reproduction

Serve branch `p3u-t2` on `http://127.0.0.1:5231` using `scripts/with-verification-server.sh`. These select the actual product pipeline; there are no harness-only rendering candidates in these comparisons.

| Column | Exact live URL |
|---|---|
| C1 Locked | <http://127.0.0.1:5231/?version=locked> |
| C1 ACES / mid | <http://127.0.0.1:5231/?version=unlocked&mode=smooth&tone=aces&refl=mid> |
| C1 AgX / mid | <http://127.0.0.1:5231/?version=unlocked&mode=smooth&tone=agx&refl=mid> |
| C1 Neutral / mid; C2 mid | <http://127.0.0.1:5231/?version=unlocked&mode=smooth&tone=neutral&refl=mid> |
| C2 low | <http://127.0.0.1:5231/?version=unlocked&mode=smooth&tone=neutral&refl=low> |
| C2 high | <http://127.0.0.1:5231/?version=unlocked&mode=smooth&tone=neutral&refl=high> |
| Smooth default | <http://127.0.0.1:5231/?version=unlocked> |
| Quality default | <http://127.0.0.1:5231/?version=unlocked&mode=quality> |

Day and Night use the existing toggle; they are not additional URL presets. Car identities remain route-driven. The URLs choose each **column**. The deterministic capture harness supplies each row's car and Day/Night state at the same T1 pose (`t = 0.123`, settled base camera). The wide road row uses the Lexus capture at that same pose, with no camera or composition changes.

To regenerate a column, run from the worktree (choose a unique output/log path):

```sh
GT3_PORT=5231 GT3_RUN=p3u GT3_TASK=T2 \
GT3_SERVER_LOG=local/evidence/p3u/stage1/reproduce-server.log \
GT3_OUT=local/evidence/p3u/stage1/reproduce \
GT3_QUERY='?version=unlocked&mode=smooth&tone=neutral&refl=mid' \
GT3_RENDER_DPR=1.5 \
GT3_STATES=lamborghini-day,lamborghini-night,lexus-day,lexus-night,ferrari-day,ferrari-night,bmw-day,bmw-night,mclaren-day,mclaren-night \
scripts/with-verification-server.sh node scripts/p3u-capture.mjs
```

Use `GT3_RENDER_DPR=1` with the locked URL and `2` for quality. The existing T1 harness explicitly overrides DPR, so this input must agree with the selected product mode. Set `GT3_CANDIDATE=baseline` if your shell has an older diagnostic candidate exported. The harness performs its own browser preflight and records server provenance. Each original raw screenshot and manifest is in `local/evidence/p3u/stage1/<tone>-<reflection>/`; locked/default/reference contain all 23 states.
