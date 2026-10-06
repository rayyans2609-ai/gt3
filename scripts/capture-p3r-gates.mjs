/** Owner comparison captures + finish signal lifecycle/GL check. One real-GPU browser. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { installGpuCounters, gpuDelta } from './lib/gpu-counters.mjs';
const base = process.env.GT3_URL || 'http://127.0.0.1:5200';
const out = process.env.GT3_CAPTURES || 'docs/review/p3r-gates';
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', pipe: true, timeout: 120000, protocolTimeout: 120000,
  args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
    `--user-data-dir=/tmp/gt3-gantry-chrome-${process.pid}`],
  defaultViewport: { width: 1280, height: 720 },
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { base, captures: [], checks: [], errors: [] };
try {
  for (const [camera, query] of [['default', ''], ['glide', '?comp=b&cam=glide']]) {
    const page = await browser.newPage();
    await installGpuCounters(page);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
    await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#start-screen.is-ready', { timeout: 120000 });
    await page.mouse.wheel({ deltaY: 120 });
    await wait(1700);
    const seek = async progress => {
      await page.evaluate(async t => (await import('/src/scroll/scrollDrive.js')).seekTo(t, { instant: true }), progress);
      await wait(1400);
    };
    const read = () => page.evaluate(() => {
      const g = window.__gt3, root = g.scene.getObjectByName('finish-line-gate');
      const truss = root.getObjectByName('finish-gantry-truss');
      const lenses = root.getObjectByName('finish-signal-lamps');
      return { progress: g.probe().progress, signalling: root.userData.signalling,
        intensity: lenses.material.emissiveIntensity, lampCount: lenses.count, trussInstances: truss.count,
        gl: { ...window.__gt3GlCalls } };
    });
    for (const theme of ['day', 'night']) {
      await page.evaluate(async t => (await import('/src/scene/theme.js')).applyTheme(t, { instant: true }), theme);
      await seek(0.94);
      const off = await read();
      if (off.signalling || off.intensity > 0.005) throw new Error(`${camera}/${theme}: lamps not off away from finish`);
      await seek(0.9927);
      const on = await read();
      if (!on.signalling || on.intensity < 1) throw new Error(`${camera}/${theme}: final approach did not light lamps`);
      const gl = gpuDelta(off.gl, on.gl);
      if (Object.values(gl).some(value => value !== 0)) throw new Error(`gantry approach GL work: ${JSON.stringify(gl)}`);
      const path = `${out}/finish-${camera}-${theme}.png`;
      await page.screenshot({ path });
      report.captures.push(path);
      await seek(0.94);
      const reverse = await read();
      if (reverse.signalling || reverse.intensity > 0.005) throw new Error('lamps failed reverse exit');
      report.checks.push({ camera, theme, off: off.intensity, on: on.intensity,
        reverse: reverse.intensity, trussInstances: on.trussInstances, lampCount: on.lampCount, gl });
      console.log(`PASS finish ${camera}/${theme} signal lifecycle; zero GL allocations/uploads`);
    }
    await seek(1);
    await page.click('.finish-replay');
    await wait(1400);
    const replay = await read();
    if (replay.signalling || replay.intensity > 0.005) throw new Error('lamps failed replay reset');
    await page.close();
  }
  if (report.errors.length) throw new Error(report.errors.join(' | '));
} finally {
  await writeFile(`${out}/finish-verification.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
