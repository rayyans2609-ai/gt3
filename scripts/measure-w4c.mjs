/** One-context W4c memory arm. Preflight and an owned Vite server are required. */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GT3_URL;
const output = process.env.GT3_OUT;
if (!base || !output) throw new Error('Set GT3_URL and GT3_OUT');
const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  treeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  base, startedAt: new Date().toISOString(), stages: [], host: [], status: 'incomplete' };
const vm = () => {
  const out = execFileSync('vm_stat', { encoding: 'utf8' });
  const read = name => Number(out.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1]);
  return { pageouts: read('Pageouts'), swapouts: read('Swapouts') };
};
const rss = parent => {
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' });
  const row = out.split('\n').find(line => new RegExp(`^\\s*\\d+\\s+${parent}\\s+`).test(line)
    && line.includes('--type=gpu-process'));
  return row ? +(Number(row.trim().split(/\s+/)[2]) / 1024).toFixed(1) : null;
};
await mkdir(output, { recursive: true });
let browser, timer, lastHost, streak = 0, stopped = false;
try {
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false, pipe: true, timeout: 120000, protocolTimeout: 120000,
    args: ['--no-sandbox', '--no-first-run', '--enable-gpu', '--use-gl=angle', '--use-angle=metal',
      `--user-data-dir=${output}/chrome-${process.pid}`, '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const sample = () => {
    const now = vm();
    now.pressure = Number(execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim());
    const cpu = execFileSync('top', ['-l', '1', '-n', '0'], { encoding: 'utf8' }).match(/CPU usage:.*?(\d+(?:\.\d+)?)% sys.*?(\d+(?:\.\d+)?)% idle/);
    now.sys = cpu ? Number(cpu[1]) : null;
    now.idle = cpu ? Number(cpu[2]) : null;
    const flagged = now.pressure !== 1 || now.idle < 15 || now.sys > 65 ||
      (!!lastHost && (now.pageouts > lastHost.pageouts || now.swapouts > lastHost.swapouts));
    streak = flagged ? streak + 1 : 0;
    report.host.push({ at: new Date().toISOString(), ...now, flagged, streak });
    lastHost = now;
    if (streak >= 2) { stopped = true; report.stop = 'two consecutive unsafe host samples'; }
  };
  sample();
  timer = setInterval(sample, 5000);
  const take = async label => {
    const state = await page.evaluate(() => {
      const info = window.__gt3?.renderer?.info;
      const ready = window.__gt3?.readiness;
      return { gpu: ready?.gpu, status: ready?.status,
        steps: ready?.warmupSteps?.length ?? 0,
        programs: info?.programs?.length ?? 0,
        textures: info?.memory?.textures ?? 0,
        geometries: info?.memory?.geometries ?? 0 };
    });
    report.stages.push({ label, at: new Date().toISOString(), ...state,
      gpuProcessRssMB: rss(browser.process().pid), host: vm() });
  };
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  while (!stopped && !(await page.evaluate(() => !!window.__gt3?.renderer)))
    await new Promise(resolve => setTimeout(resolve, 50));
  if (!stopped) await take('renderer, before car GPU warm-up');
  let oneTaken = false;
  while (!stopped) {
    const stage = await page.evaluate(async () => {
      const ready = window.__gt3?.readiness;
      if (!ready) return null;
      const model = (await import('/src/scene/cars.js')).getCarModel;
      let firstMeshes = 0;
      try { model(0).traverse(o => { if (o.isMesh && o.visible) firstMeshes++; }); } catch {}
      const firstDraws = Math.max(1, Math.ceil(firstMeshes / 12)) * 2;
      return { steps: ready.warmupSteps.length, firstDraws,
        done: ready.status !== 'loading', status: ready.status };
    });
    if (!oneTaken && stage && stage.firstDraws && stage.steps >= stage.firstDraws) {
      await take('after car 0 warm-up, approximate');
      oneTaken = true;
    }
    if (stage?.done) {
      await take('all cars ready');
      report.status = stage.status === 'ready' ? 'complete' : 'degraded';
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  clearInterval(timer);
  report.endedAt = new Date().toISOString();
  if (browser) await browser.close();
  await writeFile(`${output}/attribution.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
