/** macOS host gate shared by the bounded performance experiment. */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export function hostSample() {
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
  const vm = run('vm_stat', []);
  const cpu = run('top', ['-l', '1', '-n', '0']).match(/CPU usage: ([\d.]+)% user, ([\d.]+)% sys, ([\d.]+)% idle/);
  const processes = run('ps', ['-Ao', 'pid,ppid,%cpu,rss,lstart,command']).split('\n')
    .filter(line => /chrome|puppeteer|vite|node|codex|claude/i.test(line)).map(line => line.slice(0, 250));
  return { at: new Date().toISOString(), pressure: +run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
    pageouts: +vm.match(/Pageouts:\s+(\d+)/)[1], swapouts: +vm.match(/Swapouts:\s+(\d+)/)[1],
    user: +cpu[1], system: +cpu[2], idle: +cpu[3], swap: run('sysctl', ['-n', 'vm.swapusage']).trim(), processes };
}
export async function preflight(out) {
  await mkdir(out, { recursive: true });
  const a = hostSample(); await wait(10000); const b = hostSample();
  const pass = [a, b].every(s => s.pressure === 1 && s.idle >= 25 && s.system < 50)
    && a.pageouts === b.pageouts && a.swapouts === b.swapouts;
  const row = { kind: 'preflight', a, b, pass };
  await appendFile(`${out}/host.jsonl`, `${JSON.stringify(row)}\n`);
  console.log('PREFLIGHT', JSON.stringify({ ...row, a: { ...a, processes: undefined }, b: { ...b, processes: undefined } }));
  if (!pass) throw new Error('Host preflight failed; no heavy launch.');
  return b;
}
export function hostDegraded(before, after) {
  return after.pressure !== 1 || after.idle < 15 || after.system > 65
    || after.pageouts > before.pageouts || after.swapouts > before.swapouts;
}
if (process.argv[1]?.endsWith('/perf-host.mjs')) await preflight(process.argv[2] || '/tmp/gt3-p3y-run');
