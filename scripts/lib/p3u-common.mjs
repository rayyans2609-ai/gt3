/** P3u browser/provenance and harness-only quality controls. No product imports. */
import puppeteer from 'puppeteer-core';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const env = process.env;
export const base = env.GT3_URL || process.argv[2] || 'http://127.0.0.1:5231';
export const query = env.GT3_QUERY ?? process.argv[3] ?? '?version=locked';
export const viewport = { width: 1470, height: 956, deviceScaleFactor: +(env.GT3_DEVICE_DPR || 2) };
export async function launch(kind, out, headful = false) {
  await mkdir(out, { recursive: true });
  // Keep the display/compositor active for owned evidence sessions without changing OS settings.
  const awake = spawn('caffeinate', ['-dimsu', '-t', '43200', '-w', String(process.pid)], { stdio: 'ignore' }); awake.unref();
  if (!env.GT3_SERVER_LOG) throw Error('Run behind scripts/with-verification-server.sh with GT3_SERVER_LOG');
  const provenance = JSON.parse(await readFile(`${env.GT3_SERVER_LOG}.provenance.json`, 'utf8'));
  if (provenance.url !== base) throw Error('Server provenance URL mismatch');
  let preflight; const admissionAttempts = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    let output;
    try { output = execFileSync('node', [fileURLToPath(new URL('../host-check.mjs', import.meta.url)), 'preflight', kind], { encoding: 'utf8' }); }
    catch (e) { if (e.status !== 75 || !e.stdout) throw e; output = e.stdout; }
    preflight = JSON.parse(output); admissionAttempts.push(preflight);
    if (preflight.pass) break;
    console.log('ADMISSION WAIT', preflight.reasons.join('; '));
    if (attempt < 5) await wait(20000);
  }
  if (!preflight.pass) throw Error(`Host rejected launch after retries: ${preflight.reasons.join('; ')}`);
  const instrumentation = {};
  for (const file of [fileURLToPath(import.meta.url), fileURLToPath(new URL('./p3u-trials.js', import.meta.url)), process.argv[1]]) instrumentation[file] = hash(await readFile(file));
  const profileDir = resolve(out, 'node_modules', `gt3-chrome-${process.pid}`);
  await mkdir(profileDir, { recursive: true });
  // Fresh measurement profile only. Chromium's below-20% battery saver otherwise caps RAF.
  const browserSaverState = +(env.GT3_BROWSER_SAVER || 0);
  await writeFile(`${profileDir}/Local State`, JSON.stringify({ performance_tuning: { battery_saver_mode: { state: browserSaverState } } }));
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: headful ? false : 'new', pipe: true, timeout: 180000, protocolTimeout: 180000,
    args: ['--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal', '--window-size=1470,1050',
      `--user-data-dir=${profileDir}`], defaultViewport: viewport });
  const report = { startedAt: new Date().toISOString(), base, query, profile: new URLSearchParams(query).get('version') === 'unlocked' ? 'unlocked' : 'locked', viewport, headful, browserPid: browser.process().pid, preflight, admissionAttempts, server: provenance,
    branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    tree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    browser: await browser.version(), conditions: { browserSaverState, osPowerSettings: execFileSync('pmset', ['-g', 'custom'], { encoding: 'utf8' }), awakeAssertion: 'caffeinate -dimsu -w harnessPID (released at exit)', power: execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }),
      thermal: execFileSync('pmset', ['-g', 'therm'], { encoding: 'utf8' }), candidate: env.GT3_CANDIDATE || 'baseline' }, errors: [] };
  report.instrumentation = instrumentation;
  const cdp = await browser.target().createCDPSession();
  report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  const page = (await browser.pages())[0];
  report.browserEvents = [];
  const closeStartupTab = async target => {
    if (target.type() !== 'page' || !/^chrome:\/\/newtab\//.test(target.url())) return;
    try { const extra = await target.page(); if (extra && extra !== page) { report.browserEvents.push({ at: new Date().toISOString(), kind: 'closed owned delayed startup newtab' }); await extra.close(); await page.bringToFront(); } } catch {}
  };
  browser.on('targetcreated', closeStartupTab); browser.on('targetchanged', closeStartupTab);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  if ((env.GT3_CANDIDATE || '').includes('full')) {
    await page.setRequestInterception(true);
    page.on('request', r => r.continue({ url: r.url().replace('/models/tour/', '/models/') }));
  }
  return { browser, page, report };
}
export async function ready(page) {
  if (/env|output/.test(env.GT3_CANDIDATE || '')) {
    // Optimize diagnostic imports before booting large model sets, avoiding an HMR
    // bootstrap/reload peak that can transiently keep two decoded rosters resident.
    const warm = await fetch(`${base}/scripts/lib/p3u-trials.js`);
    if (!warm.ok) throw Error(`Diagnostic import prewarm HTTP ${warm.status}`);
    await warm.text(); await wait(1500);
  }
  await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
  if (/env|output/.test(env.GT3_CANDIDATE || '')) {
    try { await page.evaluate(() => import('/scripts/lib/p3u-trials.js')); }
    catch (e) { if (!/context was destroyed|navigation/i.test(e.message)) throw e; }
    // First use can make Vite optimize these diagnostic-only imports and reload once.
    await wait(1200);
    await page.waitForFunction(() => window.__gt3?.readiness?.status === 'ready', { timeout: 180000 });
  }
  await page.bringToFront();
  await page.mouse.move(735, 478);
  await wait(1200);
  return page.evaluate(() => ({ readiness: window.__gt3.readiness, resources: performance.getEntriesByType('resource').filter(r => /models\/|draco/.test(r.name)).map(r => ({ name: r.name, duration: r.duration, transferSize: r.transferSize, decodedBodySize: r.decodedBodySize })), rendererMemory: { ...window.__gt3.renderer.info.memory }, programs: window.__gt3.renderer.info.programs.length }));
}
export async function quality(page, dpr = +(env.GT3_RENDER_DPR || 1), candidate = env.GT3_CANDIDATE || '') {
  return page.evaluate(async ({ dpr, candidate }) => {
    const g = window.__gt3, setup = await import('/src/scene/sceneSetup.js');
    // Prevent the production fixed-resolution controller from undoing a diagnostic override.
    setup.ADAPTIVE_RES.high = dpr; setup.ADAPTIVE_RES.low = dpr;
    g.renderer.setPixelRatio(dpr); g.renderer.setSize(innerWidth, innerHeight, false);
    g.renderer.setViewport(0, 0, innerWidth, innerHeight); g.renderer.setScissorTest(false);
    g.renderer.domElement.style.transform = ''; g.renderer.domElement.style.clipPath = '';
    g.composer.setPixelRatio(dpr); g.composer.setSize(innerWidth, innerHeight);
    if (candidate.includes('outputwash')) {
      const material = g.passes.wash.material;
      material.fragmentShader = material.fragmentShader.replace('color.rgb *=', 'gl_FragColor = color;\n      #include <tonemapping_fragment>\n      #include <colorspace_fragment>\n      color = gl_FragColor;\n      color.rgb *=');
      material.needsUpdate = true;
    } else if (candidate.includes('output')) {
      const { OutputPass } = await import('/scripts/lib/p3u-trials.js');
      g.composer.insertPass(new OutputPass(), 2);
    }
    if (candidate.includes('noaa')) g.passes.antialias.enabled = false;
    const msaa = Number(candidate.match(/msaa([248])/)?.[1] || 0);
    if (msaa && candidate.includes('output') && !candidate.includes('outputwash')) throw Error('Scene-only MSAA diagnostic requires even composer swap parity; test OutputPass separately');
    if (msaa) {
      g.passes.antialias.enabled = false;
      // RenderPass reads into readBuffer; multisample the scene input only.
      g.composer.readBuffer.dispose(); g.composer.readBuffer.samples = msaa;
    }
    if (candidate.includes('aniso')) {
      const cars = await import('/src/scene/cars.js');
      for (let i = 0; i < 10; i++) cars.getCarModel(i).traverse(o => {
        for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])
          for (const t of Object.values(m)) if (t?.isTexture) { t.anisotropy = Math.min(8, g.renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true; }
      });
    }
    if (candidate.includes('env')) {
      const THREE = await import('/node_modules/.vite/deps/three.js');
      const { RoomEnvironment } = await import('/scripts/lib/p3u-trials.js');
      const pmrem = new THREE.PMREMGenerator(g.renderer), room = new RoomEnvironment();
      g.scene.environment = pmrem.fromScene(room, .04).texture;
      room.dispose(); pmrem.dispose();
      if (candidate.includes('carenv')) {
        const texture = g.scene.environment; g.scene.environment = null;
        const cars = await import('/src/scene/cars.js'), morph = await import('/src/scene/morph.js');
        const { state } = await import('/src/core/state.js'), materials = new Set();
        const assign = model => model.traverse(o => {
          for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
            if (!m.isMeshStandardMaterial) continue;
            m.envMap = texture; m.envMapIntensity = .35; m.needsUpdate = true; materials.add(m);
          }
        });
        for (let i = 0; i < 10; i++) { const model = cars.getCarModel(i); assign(model); morph.beginWarmFade(model); assign(model); morph.endWarmFade(model); }
        const render = g.composer.render, intensity = { day: .35, night: .12 }; let previousTheme;
        g.composer.render = function (...args) {
          if (state.theme !== previousTheme) { for (const m of materials) m.envMapIntensity = intensity[state.theme]; previousTheme = state.theme; }
          return render.apply(this, args);
        };
      }
    }
    if (candidate.includes('shadow4k')) {
      setup.sun.shadow.mapSize.set(4096, 4096); setup.sun.shadow.map?.dispose(); setup.sun.shadow.map = null;
    }
    let diagnosticWarmupMs = 0;
    if (candidate && candidate !== 'baseline') {
      const cars = await import('/src/scene/cars.js'), rig = await import('/src/scene/carRig.js'), morph = await import('/src/scene/morph.js');
      const starter = rig.carMount.children[0], start = performance.now();
      // Candidate variants are installed after production readiness. Warm them outside timing,
      // so first use of a new environment/AA program is not mistaken for steady-state cost.
      for (let i = 0; i < 10; i++) {
        const model = cars.getCarModel(i); rig.setCarModel(model); g.composer.render(0);
        morph.beginWarmFade(model); g.composer.render(0); morph.endWarmFade(model);
      }
      rig.setCarModel(starter); g.composer.render(0); diagnosticWarmupMs = performance.now() - start;
    }
    const gl = g.renderer.getContext(), saved = g.renderer.getRenderTarget();
    g.renderer.setRenderTarget(g.composer.readBuffer); const sceneSamples = gl.getParameter(gl.SAMPLES); g.renderer.setRenderTarget(saved);
    return { dpr, candidate, sceneSamples, maxSamples: gl.getParameter(gl.MAX_SAMPLES), halfFloatSamples: [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES)], diagnosticWarmupMs, reflectionScope: candidate.includes('carenv') ? 'car materials, Day .35 / Night .12 (diagnostic)' : candidate.includes('env') ? 'scene, intensity 1 (diagnostic)' : 'none', rendererMemory: { ...g.renderer.info.memory }, programs: g.renderer.info.programs.length, probe: g.probe(), environment: !!g.scene.environment,
      passes: g.composer.passes.map(p => ({ name: p.constructor.name, enabled: p.enabled })),
      targets: [g.composer.readBuffer, g.composer.writeBuffer].map(t => ({ width: t.width, height: t.height, samples: t.samples })),
      timerExtension: !!g.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2') };
  }, { dpr, candidate });
}
export const hash = b => createHash('sha256').update(b).digest('hex');
export function dist(values) {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
  return { n: a.length, p50: q(.5), p95: q(.95), p99: q(.99), max: a.at(-1) ?? null };
}
