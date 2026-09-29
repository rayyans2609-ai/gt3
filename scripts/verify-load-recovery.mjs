/** Recovery checks. Run host preflight before launching this single browser. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || 'http://127.0.0.1:5191';
const out = process.env.GT3_OUT || '/tmp/gt3-load-recovery';
const cases = [
  { name: 'glb-404', missing: '/models/lexus_rcf_gt3.glb',
    phase: 'model', value: 'degraded', reason: 'model-placeholder', car: 'car-lexus-load-error' },
  { name: 'audio-404', missing: '/audios/coin.mp3',
    phase: 'audio', value: 'degraded', reason: 'audio-file-unavailable', car: 'car-lexus' },
  { name: 'model-rejection', faults: { modelReject: true },
    phase: 'model', value: 'degraded', reason: 'model-rejection', car: 'car-lexus-load-error' },
  { name: 'audio-rejection', faults: { audioReject: true },
    phase: 'audio', value: 'degraded', reason: 'audio-rejection', car: 'car-lexus' },
  { name: 'model-timeout', faults: { modelHang: true, modelTimeoutMs: 1200 },
    phase: 'model', value: 'degraded', reason: 'model-timeout', car: 'car-lexus-load-error' },
  { name: 'audio-timeout', faults: { audioHang: true, audioTimeoutMs: 1200 },
    phase: 'audio', value: 'degraded', reason: 'audio-timeout', car: 'car-lexus' },
  { name: 'warmup-throw', faults: { warmThrowAtStep: 20 },
    phase: 'gpu', value: 'degraded', reason: 'gpu-step-error', car: 'car-lexus' },
  { name: 'warmup-timeout', faults: { warmHang: true, warmupTimeoutMs: 1200 },
    phase: 'gpu', value: 'degraded', reason: 'gpu-timeout', car: 'car-lexus' },
];
const report = { base, at: new Date().toISOString(), cases: [] };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 300000, protocolTimeout: 300000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle',
    '--use-angle=metal', `--user-data-dir=${out}/chrome-${process.pid}`,
    '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
report.browserPid = browser.process()?.pid;

try {
  for (const scenario of cases) {
    const entry = { name: scenario.name, status: 'pending', errors: [] };
    report.cases.push(entry);
    const page = await browser.newPage();
    try {
      await page.setCacheEnabled(false);
      await page.evaluateOnNewDocument(faults => {
        window.__gt3TestFaults = faults;
        window.__renderFrames = 0;
        const tick = () => { window.__renderFrames++; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }, scenario.faults || {});
      if (scenario.missing) {
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (new URL(request.url()).pathname === scenario.missing)
            void request.respond({ status: 404, contentType: 'text/plain', body: 'missing' });
          else void request.continue();
        });
      }
      page.on('pageerror', error => entry.errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('#start-screen.is-ready'),
        { timeout: 120000, polling: 100 });
      const first = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        const mount = window.__gt3.scene.getObjectByName('car-mount');
        const r = window.__gt3.readiness;
        let visibleMeshes = 0;
        let fadeMaterials = 0;
        mount.traverse(object => {
          if (!object.isMesh) return;
          if (object.visible) visibleMeshes++;
          for (const material of Array.isArray(object.material) ? object.material : [object.material])
            if (material?.forceSinglePass) fadeMaterials++;
        });
        return { status: r.status, model: r.model, audio: r.audio, gpu: r.gpu,
          reasons: [...r.reasons], locked: state.scrollLocked, started: state.started,
          car: mount.children.map(c => c.name), visible: mount.children[0]?.visible,
          visibleMeshes, fadeMaterials,
          fog: !!window.__gt3.scene.fog, gate: window.__gt3.scene
            .getObjectByName('checkpoint-traversal-response')?.visible,
          rendered: window.__gt3.renderer.info.render.frame,
          raf: window.__renderFrames };
      });
      assert(first.status === 'degraded', `status ${first.status}`);
      assert(first[scenario.phase] === scenario.value, `${scenario.phase} ${first[scenario.phase]}`);
      assert(first.reasons.includes(scenario.reason), `reasons ${first.reasons}`);
      assert(!first.locked && !first.started, 'drive did not unlock cleanly');
      assert(first.car.length === 1 && first.car[0] === scenario.car && first.visible,
        `starter car ${first.car}`);
      assert(first.visibleMeshes > 0 && first.fadeMaterials === 0,
        `starter visibility/material state ${first.visibleMeshes}/${first.fadeMaterials}`);
      assert(!first.gate, 'gate response remained visible');
      await wait(1000);
      const second = await page.evaluate(() => ({
        rendered: window.__gt3.renderer.info.render.frame, raf: window.__renderFrames,
      }));
      assert(second.rendered > first.rendered && second.raf > first.raf,
        'rendering or rAF did not continue after recovery');
      await page.mouse.wheel({ deltaY: 300 });
      await page.waitForFunction(async () => (await import('/src/core/state.js')).state.started,
        { timeout: 10000 });
      entry.status = 'PASS';
      entry.first = first;
      entry.second = second;
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      entry.status = 'FAIL';
      entry.error = error.stack || String(error);
      console.error(`FAIL ${scenario.name}: ${error.message}`);
    } finally {
      await page.close();
      await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2) + '\n');
}
if (report.cases.some(entry => entry.status !== 'PASS')) process.exitCode = 1;
