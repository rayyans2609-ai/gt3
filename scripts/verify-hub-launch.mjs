/**
 * Camera-aware Hub launch/Home evidence. Run only AFTER this harness is committed.
 * scripts/run-harness.sh -R p5-hub -T T1-ab-core scripts/verify-hub-launch.mjs --runs=3
 * Options: [base-url], --runs=3, --dive=world, --hub=a|b (default: both).
 * Alignment reads actual asphalt mesh edge vertices through __gt3.hubRoadEdges().
 * No circuitGeometry/circuitCamera import participates in the independent projection check.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const base = process.env.GT3_URL || args.find(arg => !arg.startsWith('--')) || 'http://127.0.0.1:5243/';
const runs = Number(option('runs') || 3);
const dive = option('dive') === 'world' ? 'world' : 'linework';
const onlyHub = option('hub') || process.env.GT3_HUB;
if (onlyHub && !['a', 'b'].includes(onlyHub)) throw new Error('Expected --hub=a or --hub=b');
if (!Number.isInteger(runs) || runs < 1) throw new Error('Expected a positive integer --runs');
const root = process.env.GT3_OUT || 'local/evidence/p5ab/launch';
const softwareGL = process.env.GT3_SOFTWARE_GL === '1';
const report = { base, runs, dive, source: process.env.GT3_SOURCE,
  renderer: softwareGL ? 'SwiftShader fallback' : 'ANGLE/Metal', cases: [], pass: false };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function clickStart(page) {
  const box = await page.waitForFunction(() => {
    const el = document.querySelector('.hub-start');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  }, { timeout: 15000, polling: 50 }).then(handle => handle.jsonValue());
  await page.mouse.click(box.x, box.y);
}
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? null;
  return { frames: values.length, p50: q(.5), p95: q(.95), max: q(1),
    over25ms: values.filter(v => v > 25).length, over50ms: values.filter(v => v > 50).length };
};
let browser;
try {
  await mkdir(root, { recursive: true });
  const tmp = path.resolve('local/tmp', `gt3-hub-launch-${process.pid}`);
  await mkdir(tmp, { recursive: true });
  browser = await puppeteer.launch({
    executablePath: process.env.GT3_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
    args: ['--enable-gpu', `--use-angle=${softwareGL ? 'swiftshader' : 'metal'}`, '--hide-scrollbars',
      '--no-first-run', `--user-data-dir=${tmp}`, ...(softwareGL ? ['--enable-unsafe-swiftshader'] : [])],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  for (const hub of onlyHub ? [onlyHub] : ['a', 'b']) for (const progress of [0, .42]) for (let run = 1; run <= runs; run++) {
    const context = await browser.createBrowserContext();
    const result = { hub, progress, run, errors: [] };
    report.cases.push(result);
    try {
      const page = await context.newPage();
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && !/favicon/i.test(message.text())) result.errors.push(message.text()); });
      await page.evaluateOnNewDocument(p => {
        sessionStorage.setItem('gt3.session.v1', JSON.stringify({ experience: 'hub', theme: 'day',
          routeProgress: p, routeMapping: 'grid-v1', routeGridDistance: 18,
          unlocked: p ? [0, 1, 2, 3, 4] : [0] }));
      }, progress);
      const url = new URL(base); url.searchParams.set('hub', hub);
      if (dive === 'world') url.searchParams.set('dive', 'world');
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('#hub.is-interactive')
        && ['ready', 'degraded'].includes(window.__gt3?.readiness?.status)
        && !document.querySelector('.hub-start')?.disabled, { timeout: 150000 });
      // Let reveal finish; captures are timed from the actual transition state, not this wait.
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hub-start-wrap')).opacity) > .99,
        { timeout: 10000 });
      await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        const stats = window.__hubLaunchProbe = { frames: { tour: [], hub: [] }, lampsMax: 0,
          entryPhases: [], alignment: null, initialDiscovery: [...state.unlocked] };
        let previous, previousTarget, sampledDive;
        // Independent homogeneous projection using the LIVE camera's own matrices.
        // Screen-space output is rounded to match the SVG's three-decimal path coordinates.
        const screen = (p, camera) => {
          const v = camera.matrixWorldInverse.elements, m = camera.projectionMatrix.elements;
          const x = v[0]*p[0]+v[4]*p[1]+v[8]*p[2]+v[12];
          const y = v[1]*p[0]+v[5]*p[1]+v[9]*p[2]+v[13];
          const z = v[2]*p[0]+v[6]*p[1]+v[10]*p[2]+v[14];
          if (-z < camera.near) return null;
          const w = m[3]*x+m[7]*y+m[11]*z+m[15];
          return { x: ((m[0]*x+m[4]*y+m[8]*z+m[12])/w+1)*innerWidth/2,
            y: (1-(m[1]*x+m[5]*y+m[9]*z+m[13])/w)*innerHeight/2 };
        };
        function frame(now) {
          const target = state.transition?.to;
          if (previous !== undefined && (target || previousTarget)) {
            const bucket = stats.frames[target || previousTarget];
            if (bucket) bucket.push(now - previous);
          }
          previous = now; previousTarget = target;
          stats.lampsMax = Math.max(stats.lampsMax, document.querySelectorAll('.entry-lamp.is-on').length);
          const phase = document.querySelector('#entry-sequence')?.dataset.phase;
          if (phase && stats.entryPhases.at(-1) !== phase) stats.entryPhases.push(phase);
          const drawn = window.__gt3?.hub?.lastDive;
          if (drawn && drawn !== sampledDive) {
            sampledDive = drawn;
            const road = window.__gt3.hubRoadEdges(), camera = window.__gt3.camera;
            camera.updateMatrixWorld();
            const distances = [], visibleDistances = [];
            let clipped = 0;
            for (const side of ['left', 'right']) for (let i = 0; i < road[side].length; i++) {
              const actual = screen(road[side][i], camera), line = drawn[side][i];
              if (!actual || !line) { clipped++; continue; }
              const distance = Math.hypot(Math.round(line.x*1000)/1000 - actual.x, Math.round(line.y*1000)/1000 - actual.y);
              distances.push(distance);
              if (actual.x >= 0 && actual.x <= innerWidth && actual.y >= 0 && actual.y <= innerHeight) visibleDistances.push(distance);
            }
            const summary = values => {
              values.sort((a,b) => a-b);
              return { points: values.length, maxPx: values.at(-1) ?? null,
                medianPx: values[Math.floor(values.length/2)] ?? null };
            };
            stats.alignment = { allInFront: summary(distances), visible: summary(visibleDistances), clipped,
              roadRings: road.left.length, drawnRings: drawn.left.length,
              at: now, livePose: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov } };
          }
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      await clickStart(page);
      await page.waitForFunction(async () => {
        const { state } = await import('/src/core/state.js');
        return state.experience === 'tour' && !state.transition && !state.scrollLocked;
      }, { timeout: 35000 });
      result.entry = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        const probe = window.__hubLaunchProbe;
        return { progress: state.progress, lampsMax: probe.lampsMax, phases: probe.entryPhases,
          alignment: probe.alignment, frames: probe.frames.tour, unlocked: [...state.unlocked] };
      });
      assert(result.entry.lampsMax === (progress === 0 ? 5 : 0), `lamps ran incorrectly at ${progress}`);
      assert(Math.abs(result.entry.progress - progress) < .002, 'launch changed saved route progress');
      assert(result.entry.alignment?.roadRings === result.entry.alignment?.drawnRings, 'edge sample count differs from actual road mesh');
      assert(result.entry.alignment?.visible.points > 2 && result.entry.alignment.visible.maxPx < 1, 'visible last-frame edge alignment exceeds 1px');
      assert(result.entry.alignment.allInFront.maxPx < 1, 'last-frame edge alignment exceeds 1px');
      await page.click('.home-control');
      await page.waitForFunction(async () => {
        const { state } = await import('/src/core/state.js');
        return state.experience === 'hub' && !state.transition && document.querySelector('#hub.is-interactive');
      }, { timeout: 20000 });
      result.home = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        const { routeTAt, offsetPointAt } = await import('/src/scene/trackCurve.js');
        const { surfaceOffsetAt } = await import('/src/scene/trackProfile.js');
        const { PerspectiveCamera } = await import('/node_modules/three/build/three.module.js');
        const pose = window.__gt3.hub.pose, snapshot = window.__gt3.hub.snapshot();
        const camera = new PerspectiveCamera(pose.fov, pose.aspect, pose.near, pose.far);
        camera.position.fromArray(pose.position); camera.quaternion.fromArray(pose.quaternion);
        camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        camera.projectionMatrix.elements[8] -= pose.shift?.[0] ?? 0;
        camera.projectionMatrix.elements[9] -= pose.shift?.[1] ?? 0;
        const t = routeTAt(state.progress), p = offsetPointAt(t, 0, surfaceOffsetAt(t, 0));
        if (snapshot.variant === 'b') p.y += 1.2; // Hub B raises its marker above the track surface.
        p.project(camera);
        const markerErrorPx = Math.hypot(snapshot.marker.x - (p.x+1)*innerWidth/2, snapshot.marker.y - (1-p.y)*innerHeight/2);
        return { progress: state.progress, marker: snapshot.marker, markerErrorPx,
          frames: window.__hubLaunchProbe.frames.hub, drawStats: snapshot.drawStats,
          unlocked: [...state.unlocked], initialDiscovery: window.__hubLaunchProbe.initialDiscovery };
      });
      assert(Math.abs(result.home.progress - progress) < .002, 'Home changed saved route progress');
      assert(Math.abs(result.home.marker.progress - result.home.progress) < 1e-8, 'Home marker lost saved progress');
      assert(result.home.markerErrorPx < .1, 'Home marker does not project to saved route position');
      assert(result.home.initialDiscovery.every(i => result.home.unlocked.includes(i)), 'Home lost discovery');
      result.diveTiming = distribution(result.entry.frames); delete result.entry.frames;
      result.homeTiming = distribution(result.home.frames); delete result.home.frames;
      assert(result.diveTiming.frames > 5 && result.homeTiming.frames > 5, 'transition frame timing is empty');
      assert(result.errors.length === 0, `runtime errors: ${result.errors.join('; ')}`);
      result.pass = true;
    } catch (error) { result.error = error.stack || String(error); result.pass = false; }
    finally { await context.close(); }
    await writeFile(path.join(root, `${hub}-${String(progress).replace('.', '_')}-${run}-${dive}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ hub, progress, run, pass: result.pass, diveTiming: result.diveTiming, homeTiming: result.homeTiming, error: result.error }));
  }
  report.pass = report.cases.every(result => result.pass);
} catch (error) { report.error = error.stack || String(error); }
finally {
  await browser?.close();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, `report-${dive}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, cases: report.cases.length, output: root }));
  process.exitCode = report.pass ? 0 : 1;
}
