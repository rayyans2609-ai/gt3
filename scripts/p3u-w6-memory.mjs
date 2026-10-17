/** W6 GPU-memory probe: macOS `footprint` of the owned Chrome GPU process with the product
 * transmission budget, then with three's stock transmission target (scale 1, 4x MSAA),
 * each after drawing the Ferrari (transmissive glazing) at the steady pose for 60 frames.
 * Headful product page; app loop held while probing. Output: report.json.
 */
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launch, ready, env, wait } from './lib/p3u-common.mjs';
const exec = promisify(execFile);
const out = env.GT3_OUT || 'local/evidence/p3u/w6/memory';
const { browser, page, report, releaseDisplay } = await launch('perf', out, env.GT3_HEADLESS !== '1');
Object.assign(report, { harness: 'p3u-w6-memory', samples: [] });
async function gpuPid() {
  const { stdout } = await exec('ps', ['-Ao', 'pid,ppid,command'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return +stdout.split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).find(m => m && +m[2] === report.browserPid && /--type=gpu-process/.test(m[3]))[1];
}
async function footprint(label) {
  const pid = await gpuPid();
  let text = '';
  try { text = (await exec('footprint', ['-p', String(pid)], { encoding: 'utf8', maxBuffer: 1 << 24 })).stdout; }
  catch (e) { text = e.stdout || e.message; }
  const total = /phys_footprint:\s+([\d.]+)\s*([KMG]B)/.exec(text) || /Footprint:\s+([\d.]+)\s*([KMG]B)/.exec(text);
  const accel = /([\d.]+)\s*([KMG]B)\s+[\d.]+\s*[KMG]B\s+[\d.]+\s*[KMG]B\s+\d+\s+IOAccelerator/.exec(text);
  const mb = m => m ? +m[1] * ({ KB: 1 / 1024, MB: 1, GB: 1024 }[m[2]]) : null;
  const row = { label, pid, footprintMB: mb(total), ioAcceleratorMB: mb(accel) };
  report.samples.push(row); console.log('MEM', JSON.stringify(row));
  await writeFile(`${out}/footprint-${label}.txt`, text);
}
try {
  await page.evaluateOnNewDocument(() => {
    const raf = requestAnimationFrame.bind(window);
    const wrapped = cb => raf(ts => { if (cb.name === 'frame' && window.__w6Hold) return wrapped(cb); return cb(ts); });
    window.requestAnimationFrame = wrapped;
  });
  report.loading = await ready(page, report);
  await wait(2000);
  await footprint('ready');
  const draw = (stock) => page.evaluate(async (stock) => {
    window.__w6Hold = true;
    const g = window.__gt3, rig = await import('/src/scene/carRig.js'), cars = await import('/src/scene/cars.js');
    const drive = await import('/src/scroll/scrollDrive.js'), route = await import('/src/scene/trackCurve.js'), aerial = await import('/src/scene/aerialCamera.js');
    drive.seekTo(route.progressAtRouteT(.123), { instant: true }); rig.setCarModel(cars.getCarModel(5)); rig.update(0); aerial.snap();
    if (stock) {
      g.renderer.transmissionResolutionScale = 1;
      const proto = Object.getPrototypeOf(g.composer.readBuffer), setSize = proto.setSize;
      proto.setSize = function (...a) { if (this.texture.generateMipmaps && this.resolveDepthBuffer === false && this.samples !== 4) { this.samples = 4; this.dispose(); } return setSize.apply(this, a); };
    }
    for (let i = 0; i < 60; i++) { g.composer.render(0); await new Promise(r => requestAnimationFrame(r)); }
    return { scale: g.renderer.transmissionResolutionScale };
  }, stock);
  report.product = await draw(false); await wait(1500); await footprint('product-ferrari');
  report.stock = await draw(true); await wait(1500); await footprint('stock-ferrari');
} catch (e) { report.incomplete = true; report.errors.push(e.stack); process.exitCode = 1; }
finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 1) + '\n');
  releaseDisplay(); await browser.close().catch(() => {});
}
