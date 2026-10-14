set -e
node /tmp/gt3-p3x/review-policy.mjs
node --input-type=module - <<'NODE' > /tmp/gt3-p3x/final-build.log 2>&1
import {preflight} from './scripts/lib/perf-host.mjs';
import {execFileSync} from 'node:child_process';
await preflight('/tmp/gt3-p3x/final-build');
execFileSync('npm',['run','build'],{stdio:'inherit'});
NODE
GT3_PACE=30 GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3x/gates GT3_GATES_ONLY=1 node /tmp/gt3-p3x/guard-check.mjs scripts/verify-checkpoints.mjs > /tmp/gt3-p3x/gates.log 2>&1
GT3_PACE=30 GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3x/cold-day GT3_COLD_ONLY=1 GT3_VARIANTS=autoDay node /tmp/gt3-p3x/guard-check.mjs scripts/verify-swap-response.mjs > /tmp/gt3-p3x/cold-day.log 2>&1
GT3_PACE=30 GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3x/cold-night GT3_COLD_ONLY=1 GT3_VARIANTS=autoNight node /tmp/gt3-p3x/guard-check.mjs scripts/verify-swap-response.mjs > /tmp/gt3-p3x/cold-night.log 2>&1
GT3_PACE=30 GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3x/viewport GT3_CONFIGS=E GT3_VIEWPORT_ONLY=1 GT3_REPEATS=1 GT3_CENTER=1 node scripts/perf-p3x.mjs > /tmp/gt3-p3x/viewport.log 2>&1
GT3_URL=http://127.0.0.1:5211 GT3_OUT=/tmp/gt3-p3x/default-viewport GT3_CONFIGS=B GT3_VIEWPORT_ONLY=1 GT3_REPEATS=1 GT3_CENTER=1 node scripts/perf-p3x.mjs > /tmp/gt3-p3x/default-viewport.log 2>&1
node scripts/compare-p3x-crops.mjs /tmp/gt3-p3x/matrix-B/crops /tmp/gt3-p3x/native-E/crops B E /tmp/gt3-p3x/native-compare.json > /tmp/gt3-p3x/native-compare.log
node /tmp/gt3-p3x/package-evidence.mjs > /tmp/gt3-p3x/package.log 2>&1
