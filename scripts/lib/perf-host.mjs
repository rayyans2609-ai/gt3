/** macOS host gate shared by the bounded performance experiment. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
import { appendFile, mkdir } from 'node:fs/promises';

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function hostSample() {
  const run = async (command, args) => (await execute(command, args, {encoding:'utf8'})).stdout;
  // Host tools must not block CDP/input scheduling in the measurement driver.
  const [vm, top, ps, pressure, swap] = await Promise.all([
    run('vm_stat', []), run('top', ['-l','1','-n','0']),
    run('ps', ['-Ao','pid,ppid,%cpu,rss,lstart,command']),
    run('sysctl', ['-n','kern.memorystatus_vm_pressure_level']), run('sysctl', ['-n','vm.swapusage']),
  ]);
  const cpu=top.match(/CPU usage: ([\d.]+)% user, ([\d.]+)% sys, ([\d.]+)% idle/);
  const processes=ps.split('\n').filter(line=>/chrome|puppeteer|vite|node|codex|claude/i.test(line)).map(line=>line.slice(0,250));
  return {at:new Date().toISOString(),pressure:+pressure.trim(),
    pageouts:+vm.match(/Pageouts:\s+(\d+)/)[1],swapouts:+vm.match(/Swapouts:\s+(\d+)/)[1],
    user:+cpu[1],system:+cpu[2],idle:+cpu[3],swap:swap.trim(),processes};
}
export async function preflight(out) {
  await mkdir(out, { recursive: true });
  const a = await hostSample(); await wait(10000); const b = await hostSample();
  // Before a launch no measurement Chrome is meant to be running. Detect known
  // competing Chrome render/GPU work as well as checking host-wide CPU/pressure.
  const competing = [a, b].flatMap(s => s.processes.filter(line => {
    const row=line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)/);
    return row && +row[3] > 5 && /Chrome/i.test(line) && !/crashpad/i.test(line);
  }));
  const pass = [a, b].every(s => s.pressure === 1 && s.idle >= 25) && competing.length === 0;
  const row = { kind: 'preflight', a, b, pass, competing };
  await appendFile(`${out}/host.jsonl`, `${JSON.stringify(row)}\n`);
  console.log('PREFLIGHT', JSON.stringify({ ...row, a: { ...a, processes: undefined }, b: { ...b, processes: undefined } }));
  if (!pass) throw new Error('Host preflight failed; no heavy launch.');
  return b;
}
// Task-specific manager amendment, 2026-10-13: paging is measured, not a stop.
// CPU is a hard stop only outside a measured window; two bad samples required.
export function hostDegraded(before, after, measured = false) {
  return (before.pressure !== 1 && after.pressure !== 1)
    || (!measured && before.idle < 15 && after.idle < 15);
}
export const pagingDelta = (before, after) => ({
  pageouts: after.pageouts - before.pageouts, swapouts: after.swapouts - before.swapouts,
});
export async function settleHost(out, context, onSample = () => {}) {
  const start = Date.now(); let previous = await hostSample(), stableSince = Date.now();
  const first = previous;
  while (Date.now() - start < 90000) {
    await wait(Math.min(5000, Math.max(1, 90000 - (Date.now() - start))));
    const sample = await hostSample();
    await onSample(sample);
    if (sample.pageouts !== previous.pageouts || sample.swapouts !== previous.swapouts) stableSince = Date.now();
    if (hostDegraded(previous, sample)) throw new Error('Host hard stop while settling');
    previous = sample;
    if (Date.now() - stableSince >= 20000) break;
  }
  const result = { context, settled: Date.now() - stableSince >= 20000,
    waitedMs: Date.now() - start, first, last: previous };
  await appendFile(`${out}/host.jsonl`, `${JSON.stringify({ kind: 'settle', ...result })}\n`);
  console.log('SETTLE', JSON.stringify({ context, settled: result.settled, waitedMs: result.waitedMs }));
  return result;
}
if (process.argv[1]?.endsWith('/perf-host.mjs')) await preflight(process.argv[2] || '/tmp/gt3-p3y-run');
