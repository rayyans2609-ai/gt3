/** Recovery checks. Run host preflight before launching this single browser. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL || 'http://127.0.0.1:5191';
const out = process.env.GT3_OUT || '/tmp/gt3-load-recovery';
const cases = [
  { name: 'healthy', phases: ['ready', 'ready', 'ready'], reason: null, car: 'car-lexus' },
  { name: 'glb-404', missing: '/models/tour/lexus_rcf_gt3.glb',
    phases: ['degraded', 'ready', 'ready'], reason: 'model-placeholder', car: 'car-lexus-load-error' },
  { name: 'audio-404', missing: '/audios/coin.mp3',
    phases: ['ready', 'degraded', 'ready'], reason: 'audio-file-unavailable', car: 'car-lexus' },
  { name: 'model-rejection', holdModels: true, faults: { modelReject: true },
    phases: ['degraded', 'ready', 'ready'], reason: 'model-rejection', car: 'car-lexus-load-error' },
  { name: 'audio-rejection', faults: { audioReject: true },
    phases: ['ready', 'degraded', 'ready'], reason: 'audio-rejection', car: 'car-lexus' },
  { name: 'model-timeout', holdModels: true, faults: { modelHang: true, modelTimeoutMs: 1200 },
    phases: ['degraded', 'ready', 'ready'], reason: 'model-timeout', car: 'car-lexus-load-error' },
  { name: 'audio-timeout', faults: { audioHang: true, audioTimeoutMs: 1200 },
    phases: ['ready', 'degraded', 'ready'], reason: 'audio-timeout', car: 'car-lexus' },
  { name: 'warmup-throw', faults: { warmThrowAtStep: 20 },
    phases: ['ready', 'ready', 'degraded'], reason: 'gpu-step-error', car: 'car-lexus' },
  { name: 'warmup-timeout', faults: { warmHang: true, warmupTimeoutMs: 5000 },
    phases: ['ready', 'ready', 'degraded'], reason: 'gpu-timeout', car: 'car-lexus' },
];
const only = process.env.GT3_CASES ? process.env.GT3_CASES.split(',') : null;
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

// Console errors from an intentional 404 have no reliable URL in their text. Require
// the matching HTTP response as well as Chrome's exact resource-error message.
function expectedError(scenario, event, all) {
  if (scenario.missing && event.type === 'http')
    return event.url && new URL(event.url).pathname === scenario.missing && event.status === 404;
  if (scenario.missing && event.type === 'console' &&
      /^Failed to load resource: the server responded with a status of 404/.test(event.text))
    return all.some(other => other.type === 'http' &&
      new URL(other.url).pathname === scenario.missing && other.status === 404);
  if (scenario.missing && event.type === 'console' &&
      event.text.startsWith('[cars] Failed to load') && event.text.includes(scenario.missing))
    return true;
  // The roster is preloaded eagerly at cars.js import, racing the injected fault.
  // holdModels keeps that real request pending so the injected fault decides the outcome.
  if (scenario.name === 'model-rejection' || scenario.name === 'model-timeout')
    return event.type === 'console' && (event.text.startsWith('[gt3] car preload failed') ||
      event.text.startsWith('[cars] Preload did not finish; using placeholder roster.'));
  if (scenario.name === 'warmup-throw')
    return event.type === 'console' && event.text.startsWith('[gt3] GPU warm-up failed');
  return false;
}

try {
  for (const scenario of cases) {
    if (only && !only.includes(scenario.name)) continue;
    const entry = { name: scenario.name, status: 'pending', errors: [] };
    report.cases.push(entry);
    const page = await browser.newPage();
    try {
      await page.setCacheEnabled(false);
      await page.evaluateOnNewDocument(faults => {
        window.__gt3TestFaults = faults;
        window.__recovery = { wheels: [], preWarm: null, captureInstalled: false };
        const originalAdd = EventTarget.prototype.addEventListener;
        const originalRemove = EventTarget.prototype.removeEventListener;
        let swallowers = 0;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          if (this === window && type === 'wheel' && listener?.name === 'swallow') swallowers++;
          return originalAdd.call(this, type, listener, options);
        };
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
          if (this === window && type === 'wheel' && listener?.name === 'swallow') swallowers--;
          return originalRemove.call(this, type, listener, options);
        };
        window.addEventListener('wheel', event => {
          const r = window.__gt3?.readiness;
          window.__recovery.wheels.push({ t: performance.now(), status: r?.status ?? null,
            phases: r ? [r.model, r.audio, r.gpu] : null, swallowers,
            defaultPrevented: event.defaultPrevented, y: window.scrollY });
        }, { passive: true });
        // Capture the untouched models synchronously at the first starter mount,
        // before createCarWarmup changes any mesh or scene state.
        void (async () => {
          const [{ carMount }, cars] = await Promise.all([
            import('/src/scene/carRig.js'), import('/src/scene/cars.js')]);
          const add = carMount.add;
          carMount.add = function(...children) {
            const result = add.apply(this, children);
            if (!window.__recovery.preWarm && children.some(child => child.name.startsWith('car-'))) {
              const meshes = [];
              for (let index = 0; index < 10; index++) cars.getCarModel(index)?.traverse(object => {
                if (object.isMesh) meshes.push({ object, material: object.material,
                  visible: object.visible, frustumCulled: object.frustumCulled });
              });
              const gate = window.__gt3.scene.getObjectByName('checkpoint-traversal-response');
              window.__recovery.preWarm = { meshes, fog: window.__gt3.scene.fog,
                gateVisible: gate?.visible ?? null, car: this.children.map(c => c.name) };
            }
            return result;
          };
          window.__recovery.captureInstalled = true;
        })();
      }, scenario.faults || {});
      if (scenario.missing || scenario.holdModels) {
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (scenario.holdModels && new URL(request.url()).pathname.startsWith('/models/tour/'))
            return; // never answered: the eager real preload cannot beat the injected fault
          if (scenario.missing && new URL(request.url()).pathname === scenario.missing)
            void request.respond({ status: 404, contentType: 'text/plain', body: 'missing' });
          else void request.continue();
        });
      }
      page.on('pageerror', error => entry.errors.push({ type: 'page', text: error.message }));
      page.on('console', message => {
        if (message.type() === 'error') entry.errors.push({ type: 'console', text: message.text(),
          url: message.location().url });
      });
      page.on('response', response => {
        if (response.status() >= 400) entry.errors.push({ type: 'http', status: response.status(),
          url: response.url() });
      });
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.__gt3?.readiness?.status === 'loading' &&
        window.__recovery?.captureInstalled && document.querySelector('#start-screen'),
      { timeout: 90000, polling: 20 });
      await page.mouse.wheel({ deltaY: 300 });
      await page.waitForFunction(() => window.__recovery.wheels.length > 0,
        { timeout: 10000 });
      const preGesture = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        return { wheels: [...window.__recovery.wheels], progress: state.progress,
          target: state.targetProgress, started: state.started, scrollY: window.scrollY };
      });
      assert(preGesture.wheels.every(w => w.status === 'loading' && w.phases?.includes('pending') &&
        w.swallowers > 0), `pre-ready wheel arrived outside locked loading: ${JSON.stringify(preGesture.wheels)}`);
      assert(!preGesture.started && preGesture.progress === 0 && preGesture.target === 0 &&
        preGesture.scrollY === 0, `pre-ready gesture moved Tour: ${JSON.stringify(preGesture)}`);
      await page.waitForFunction(() => ['ready', 'degraded', 'failed'].includes(window.__gt3?.readiness?.status),
        { timeout: 120000, polling: 100 });
      const first = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        const mount = window.__gt3.scene.getObjectByName('car-mount');
        const r = window.__gt3.readiness;
        const screen = document.querySelector('#start-screen');
        return { readiness: JSON.parse(JSON.stringify(r)), locked: state.scrollLocked,
          started: state.started, progress: state.progress, target: state.targetProgress,
          scrollY: window.scrollY, screenReady: screen.classList.contains('is-ready'),
          screenStatus: screen.dataset.readiness, car: mount.children.map(c => c.name),
          roster: await (async () => { const cars = await import('/src/scene/cars.js');
            return Array.from({ length: 10 }, (_, i) => { const m = cars.getCarModel(i);
              return [m.name, m.userData.loadError ?? null]; }); })(),
          visible: mount.children[0]?.visible, rendered: window.__gt3.renderer.info.render.frame,
          raf: window.__renderFrames ?? null };
      });
      const expectedStatus = scenario.reason ? 'degraded' : 'ready';
      assert(first.readiness.status === expectedStatus, `status ${first.readiness.status}`);
      assert(JSON.stringify([first.readiness.model, first.readiness.audio, first.readiness.gpu]) ===
        JSON.stringify(scenario.phases), `phases ${JSON.stringify(first.readiness)}`);
      assert(JSON.stringify(first.readiness.reasons) === JSON.stringify(scenario.reason ? [scenario.reason] : []),
        `reasons ${first.readiness.reasons}`);
      assert(first.screenReady && first.screenStatus === first.readiness.status && !first.locked,
        `screen/scroll disagreement: ${JSON.stringify(first)}`);
      assert(first.car.length === 1 && first.car[0] === scenario.car && first.visible,
        `starter car ${first.car} ${JSON.stringify(first.roster)}`);
      assert(!first.started && first.progress === 0 && first.target === 0 && first.scrollY === 0,
        `pre-ready input banked: ${JSON.stringify(first)}`);
      // Compare against the exact pre-warm objects and references. A completed warm-up
      // must restore them too; aborted warm-up is the critical regression path.
      const restore = await page.evaluate(() => {
        const baseline = window.__recovery.preWarm;
        if (!baseline) return { captured: false };
        const scene = window.__gt3.scene;
        const mount = scene.getObjectByName('car-mount');
        const gate = scene.getObjectByName('checkpoint-traversal-response');
        const changed = baseline.meshes.map((entry, index) => ({ index,
          material: entry.object.material !== entry.material,
          visible: entry.object.visible !== entry.visible,
          frustumCulled: entry.object.frustumCulled !== entry.frustumCulled }))
          .filter(item => item.material || item.visible || item.frustumCulled);
        return { captured: true, meshes: baseline.meshes.length, changed,
          fog: scene.fog === baseline.fog, gate: (gate?.visible ?? null) === baseline.gateVisible,
          mount: mount.children.map(c => c.name) };
      });
      assert(restore.captured && restore.meshes > 0 && restore.changed.length === 0 &&
        restore.fog && restore.gate && restore.mount.length === 1 && restore.mount[0] === scenario.car,
      `pre-warm scene not restored: ${JSON.stringify(restore)}`);
      // Render with and without the car into the same framebuffer. Compare pixels
      // inside the projected car bounds, not merely the mount or whole-scene counts.
      const carPixels = await page.evaluate(async () => {
        const THREE = await import('/node_modules/.vite/deps/three.js');
        const { render } = await import('/src/scene/sceneSetup.js');
        const { scene, camera, renderer } = window.__gt3;
        const car = scene.getObjectByName('car-mount').children[0];
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(car);
        const canvas = renderer.domElement;
        const gl = renderer.getContext();
        const coords = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(camera);
            coords.push([(p.x + 1) * canvas.width / 2, (1 - p.y) * canvas.height / 2]);
          }
        const left = Math.max(0, Math.floor(Math.min(...coords.map(p => p[0]))));
        const right = Math.min(canvas.width, Math.ceil(Math.max(...coords.map(p => p[0]))));
        const top = Math.max(0, Math.floor(Math.min(...coords.map(p => p[1]))));
        const bottom = Math.min(canvas.height, Math.ceil(Math.max(...coords.map(p => p[1]))));
        const width = right - left, height = bottom - top;
        if (width < 2 || height < 2 || width * height > 300000)
          return { width, height, changedPixels: 0, reason: 'invalid car bounds' };
        const read = () => {
          render(0);
          const data = new Uint8Array(width * height * 4);
          gl.readPixels(left, canvas.height - bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
          return data;
        };
        let withoutCar, repeatedWithoutCar, withCar;
        try {
          car.visible = false;
          withoutCar = read();
          repeatedWithoutCar = read();
          car.visible = true;
          withCar = read();
        } finally { car.visible = true; render(0); }
        let changedPixels = 0;
        let noisePixels = 0;
        for (let i = 0; i < withCar.length; i += 4)
          if (Math.abs(withCar[i] - withoutCar[i]) + Math.abs(withCar[i + 1] - withoutCar[i + 1]) +
            Math.abs(withCar[i + 2] - withoutCar[i + 2]) > 24) changedPixels++;
        for (let i = 0; i < withoutCar.length; i += 4)
          if (Math.abs(withoutCar[i] - repeatedWithoutCar[i]) +
            Math.abs(withoutCar[i + 1] - repeatedWithoutCar[i + 1]) +
            Math.abs(withoutCar[i + 2] - repeatedWithoutCar[i + 2]) > 24) noisePixels++;
        return { width, height, changedPixels, noisePixels };
      });
      assert(carPixels.changedPixels > carPixels.noisePixels,
        `starter car not proven rendered: ${JSON.stringify(carPixels)}`);
      const beforeQuiet = Date.now();
      await wait(1100);
      const quiet = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        return { status: window.__gt3.readiness.status, started: state.started,
          progress: state.progress, target: state.targetProgress, scrollY: window.scrollY,
          rendered: window.__gt3.renderer.info.render.frame };
      });
      assert(Date.now() - beforeQuiet >= 1000 && !quiet.started && quiet.progress === 0 &&
        quiet.target === 0 && quiet.scrollY === 0 && quiet.rendered > first.rendered,
      `quiet interval or render continuation failed: ${JSON.stringify(quiet)}`);
      await page.mouse.wheel({ deltaY: 300 });
      await page.waitForFunction(async () => (await import('/src/core/state.js')).state.started,
        { timeout: 10000 });
      const after = await page.evaluate(async () => {
        const { state } = await import('/src/core/state.js');
        return { started: state.started, progress: state.progress, target: state.targetProgress,
          screen: document.querySelector('#start-screen').className,
          wheels: window.__recovery.wheels };
      });
      assert(after.started && after.target > 0 && after.wheels.length >= 2 &&
        after.wheels.at(-1).status === first.readiness.status &&
        after.wheels.at(-1).swallowers === 0 && /is-leaving/.test(after.screen),
      `fresh gesture did not start Tour: ${JSON.stringify(after)}`);
      entry.expectedErrors = entry.errors.filter(e => expectedError(scenario, e, entry.errors));
      entry.unexpectedErrors = entry.errors.filter(e => !expectedError(scenario, e, entry.errors));
      assert(entry.unexpectedErrors.length === 0,
        `unexpected errors: ${JSON.stringify(entry.unexpectedErrors)}`);
      if (scenario.missing) assert(entry.expectedErrors.some(e => e.type === 'http'),
        'injected HTTP 404 was not observed');
      entry.status = 'PASS';
      Object.assign(entry, { preGesture, first, restore, carPixels, quiet, after });
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      entry.status = 'FAIL';
      entry.error = error.stack || String(error);
      entry.expectedErrors = entry.errors.filter(e => expectedError(scenario, e, entry.errors));
      entry.unexpectedErrors = entry.errors.filter(e => !expectedError(scenario, e, entry.errors));
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
