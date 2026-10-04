/**
 * Attribution only: times the synchronous boot steps of src/main.js that can run in node
 * (pure geometry / precompute) without a browser. Node V8 on this Mac approximates Chrome's
 * main-thread cost for this kind of JS; it does NOT include GPU, DOM, layout or Vite
 * dev-server transform cost.
 *
 *   node scripts/time-boot-steps.mjs            # 5 cold child processes, median + range
 *   node scripts/time-boot-steps.mjs --profile  # one child under --cpu-prof, top functions
 *
 * Each repetition is a fresh node process so JIT/caches are cold, like a page load.
 * Steps that need WebGL/DOM (initScene, studio renderer, startScreen, ...) are not run;
 * see the ESTIMATED list printed at the end.
 */
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';
import { readFileSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const self = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// Child: one cold run, prints JSON { name: ms }
// ---------------------------------------------------------------------------
async function child() {
  // Minimal browser stubs for modules that touch them at import or build time.
  const noop = () => {};
  const ctx = new Proxy(function () {}, { get: () => ctx, set: () => true, apply: () => ctx });
  const element = () => new Proxy({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
    append: noop, setAttribute: noop, getContext: () => ctx, addEventListener: noop }, {
    get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.window = globalThis;
  globalThis.location = { search: '', hash: '', href: 'http://localhost/' };
  globalThis.document = { createElement: element, createElementNS: element,
    documentElement: { dataset: {} }, querySelector: () => null, getElementById: () => null,
    addEventListener: noop };
  globalThis.addEventListener = noop;
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 1600; globalThis.innerHeight = 900;

  register(`data:text/javascript,${encodeURIComponent(HOOKS)}`);

  const out = {};
  const t = async (name, fn) => {
    const s = performance.now();
    const r = await fn();
    out[name] = performance.now() - s;
    return r;
  };
  const src = (p) => pathToFileURL(join(root, 'src', p)).href;

  const THREE = await t('import three', () => import('three'));
  await t('import trackCurve (module-level: control pts, getLength, 801-sample curvature table)',
    () => import(src('scene/trackCurve.js')));
  await t('import track (module-level: ~5k-sample frames, curb widths, trackEdges)',
    () => import(src('scene/track.js')));
  await t('import environment (module-level: groundRoute, routeTree, baseGrid, poly2tri)',
    () => import(src('scene/environment.js')));
  const checkpoints = await t('import checkpoints+gateResponse', () => import(src('scene/checkpoints.js')));
  const finishLine = await import(src('scene/finishLine.js'));
  const carRig = await import(src('scene/carRig.js'));
  const aerialCamera = await import(src('scene/aerialCamera.js'));
  const track = await import(src('scene/track.js'));
  const environment = await import(src('scene/environment.js'));
  const trackCurve = await import(src('scene/trackCurve.js'));

  // ---- the synchronous section of main.js boot(), in order ----
  await t('S1 buildTrack()', () => track.buildTrack());
  await t('S2 buildEnvironment()', () => environment.buildEnvironment());
  await t('S3 buildFinishLine()', () => finishLine.buildFinishLine());
  await t('S4 buildCheckpoints()', () => checkpoints.buildCheckpoints());
  await t('S5 initCarRig()', () => carRig.initCarRig());
  await t('S6 initAerialCamera()', () => {
    globalThis.__gt3 = {};
    aerialCamera.initAerialCamera(new THREE.PerspectiveCamera(40, 1, 0.5, 3000));
  });
  await t('S7 hud buildRouteMap sampling (161 x pointAt, DOM part excluded)', () => {
    for (let i = 0; i <= 160; i++) trackCurve.pointAt(i / 160);
  });
  out.total_node_runnable_S1_S7 = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']
    .reduce((a, p) => a + out[Object.keys(out).find((k) => k.startsWith(p))], 0);
  out.total_module_level = Object.keys(out).filter((k) => k.startsWith('import ') && k !== 'import three')
    .reduce((a, k) => a + out[k], 0);
  process.stdout.write(`\n@@RESULT@@${JSON.stringify(out)}\n`);
}

// ---------------------------------------------------------------------------
// Loader hooks, registered from a data: URL so this file is not re-run in the hooks thread.
// sceneSetup needs WebGL; it is replaced by the module surface environment.js reads (same
// fog numbers as sceneSetup's `atmosphere`: near 105, far 570). CSS imports become empty.
// ---------------------------------------------------------------------------
const HOOKS = `
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return { url: 'data:text/javascript,', shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('/src/scene/sceneSetup.js')) {
    return { format: 'module', shortCircuit: true, source:
      "import * as THREE from 'three'; export const scene = new THREE.Scene(); " +
      "scene.fog = new THREE.Fog(0xb8ad94, 105, 570); export const camera = null;" };
  }
  return next(url, context);
}`;

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------
function runChild(extraNodeArgs = []) {
  const r = spawnSync(process.execPath, [...extraNodeArgs, self, '--child'],
    { encoding: 'utf8', cwd: root, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`child failed: ${r.stderr || r.stdout}`);
  const m = r.stdout.split('@@RESULT@@')[1];
  return JSON.parse(m);
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }

function profile() {
  const dir = mkdtempSync(join(tmpdir(), 'gt3-boot-prof-'));
  try {
    runChild(['--cpu-prof', `--cpu-prof-dir=${dir}`]);
    const file = readdirSync(dir).find((f) => f.endsWith('.cpuprofile'));
    const prof = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const self_ = new Map();
    const dt = prof.timeDeltas;
    prof.samples.forEach((id, i) => self_.set(id, (self_.get(id) || 0) + dt[i]));
    const agg = new Map();
    for (const [id, us] of self_) {
      const f = byId.get(id).callFrame;
      const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${f.lineNumber + 1}`;
      agg.set(key, (agg.get(key) || 0) + us);
    }
    console.log('Top self-time functions, one cold run (ms):');
    [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25)
      .forEach(([k, us]) => console.log(`${(us / 1000).toFixed(1).padStart(8)}  ${k}`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function main() {
  if (process.argv.includes('--child')) return child();
  if (process.argv.includes('--profile')) return profile();
  const reps = 5;
  const runs = Array.from({ length: reps }, () => runChild());
  console.log(`node ${process.version}, ${reps} cold processes, ms (median [min..max])`);
  for (const k of Object.keys(runs[0])) {
    const v = runs.map((r) => r[k]);
    console.log(`${median(v).toFixed(1).padStart(8)} [${Math.min(...v).toFixed(1)}..${Math.max(...v).toFixed(1)}]  ${k}`);
  }
  console.log(`
NOT RUNNABLE IN NODE (need WebGL/DOM/audio) -- estimates only, from code:
  initScene(): WebGLRenderer + EffectComposer + 3 passes + lights; ESTIMATE 20-150 ms (context creation,
    shadow-map/target allocation is lazy). studio.initStudio(): a SECOND WebGLRenderer/context plus
    SphereGeometry(64x32), CircleGeometry(96); ESTIMATE 30-250 ms.
  morph/theme/themeToggle/soundControl/player/startScreen/soundCue/finishScreen/scrollDrive init:
    DOM construction and listener wiring, a few hundred nodes at most; ESTIMATE <30 ms total.
  Chrome shader compile is NOT in this boot task (programs compile on first render, which waits on warm-up).`);
}
main();
