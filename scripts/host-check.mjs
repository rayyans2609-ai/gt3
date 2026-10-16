#!/usr/bin/env node
/**
 * GT3 host identity, whole-host workload accounting and pre-flight gate.
 * Contract: docs/ai/operating-contract.md §6. Deterministic; never a model.
 *
 *   node scripts/host-check.mjs identity            JSON: profile, hardware, OS, CLI/browser versions
 *   node scripts/host-check.mjs status              JSON: profile limits, live GT3 workloads, host health
 *   node scripts/host-check.mjs preflight <class>   two samples 10 s apart; exit 0 = go, 75 = wait
 *        class: heavy | heavy2 | browser | perf | agent
 *
 * Accounting is host-wide and spawner-blind: every GT3 Vite server, GT3 harness browser,
 * Vite build and agent CLI on the Mac counts, whichever manager, worker or nested agent
 * started it. Limits come from the profile table below (provisional until calibrated).
 * Identity deliberately omits hostname, username and serials.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostSample, wait } from './lib/perf-host.mjs';

const run = async (cmd, args, opts = {}) => {
  try { return (await promisify(execFile)(cmd, args, { encoding: 'utf8', timeout: 15000, ...opts })).stdout.trim(); }
  catch { return null; }
};

// Provisional limits (operating-contract.md §6). "measured" stays false until calibration
// evidence is recorded in BUILD_LOG.md and the contract is updated.
const PROFILES = {
  'intel-8gb': { measured: true, agents: 2, editors: 1, heavy: 1, heavy2: false, browsers: 1,
    note: 'historical Intel rules (2026-09-28 overload evidence)' },
  'm4-16gb': { measured: false, agents: 6, editors: 3, heavy: 1, heavy2: true, browsers: 1,
    note: 'provisional M4 envelope (owner, 2026-10-16); expand only on calibration evidence' },
  unknown: { measured: false, agents: 2, editors: 1, heavy: 1, heavy2: false, browsers: 1,
    note: 'unrecognised host: Intel rules apply' },
};

async function identity() {
  const [arch, brand, mem, model, pcores, ecores, os, gpu] = await Promise.all([
    run('uname', ['-m']), run('sysctl', ['-n', 'machdep.cpu.brand_string']), run('sysctl', ['-n', 'hw.memsize']),
    run('sysctl', ['-n', 'hw.model']), run('sysctl', ['-n', 'hw.perflevel0.physicalcpu']),
    run('sysctl', ['-n', 'hw.perflevel1.physicalcpu']), run('sw_vers', ['-productVersion']),
    run('system_profiler', ['SPDisplaysDataType']),
  ]);
  const ramGB = Math.round(Number(mem) / 2 ** 30);
  const profile = arch === 'arm64' && /Apple M4/.test(brand ?? '') && ramGB >= 16 ? 'm4-16gb'
    : arch === 'x86_64' && /Intel/.test(brand ?? '') && ramGB <= 8 ? 'intel-8gb' : 'unknown';
  const version = async bin => (await run(bin, ['--version']))?.split('\n')[0] ?? null;
  const chromeBin = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return {
    profile, arch, cpu: brand, ramGB, model, cores: { performance: Number(pcores) || null, efficiency: Number(ecores) || null },
    gpu: gpu?.match(/Chipset Model:\s*(.+)/)?.[1] ?? null, macos: os,
    versions: { node: process.version, claude: await version('claude'), codex: await version('codex'),
      opencode: await version('opencode'), chrome: await version(chromeBin) },
  };
}

/** Classify every GT3-relevant process on the host from one `ps` snapshot. */
async function workloads() {
  const ps = await run('ps', ['-Ao', 'pid=,ppid=,rss=,command=']) ?? '';
  const rows = ps.split('\n').map(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m && { pid: +m[1], ppid: +m[2], rssMB: Math.round(+m[3] / 1024), command: m[4] };
  }).filter(Boolean);
  const out = { viteServers: [], builds: [], browsers: [], agents: [] };
  for (const r of rows) {
    const c = r.command;
    if (/vite(\.js)?\s+build\b/.test(c)) out.builds.push(r);
    else if (/node_modules\/vite\/bin\/vite\.js|node_modules\/\.bin\/vite\b|\bnpm run dev\b/.test(c)) out.viteServers.push(r);
    else if (/Google Chrome( for Testing)?\.app\/Contents\/MacOS\/|chrome-headless-shell/.test(c)
      && /--user-data-dir=[^ ]*gt3/i.test(c) && !/--type=/.test(c)) out.browsers.push(r);
    // Agent sessions (approximate): provider CLIs minus their daemons, relays and helpers.
    else if (/(^|\/)(claude|codex)( |$)|(^|\/)opencode run\b|claude-code\/[\d.]+\//.test(c)
      && !/app-server|exec-server|remote-control|bg-pty-host|pid-update-loop|Helpers\/disclaimer| mcp( |$)|chrome-native-host|auth status/.test(c))
      out.agents.push(r);
  }
  for (const v of out.viteServers) {
    const cwd = await run('lsof', ['-a', '-p', String(v.pid), '-d', 'cwd', '-Fn']);
    v.cwd = cwd?.split('\n').find(l => l.startsWith('n'))?.slice(1) ?? null;
    v.port = (await run('lsof', ['-a', '-p', String(v.pid), '-iTCP', '-sTCP:LISTEN', '-nP', '-Fn']))
      ?.split('\n').find(l => l.startsWith('n'))?.match(/:(\d+)$/)?.[1] ?? null;
  }
  const trim = r => ({ pid: r.pid, ppid: r.ppid, rssMB: r.rssMB, command: r.command.slice(0, 160), ...(r.cwd !== undefined && { cwd: r.cwd, port: r.port }) });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map(trim)]));
}

const health = s => ({ pressure: s.pressure, pageouts: s.pageouts, swapouts: s.swapouts, idle: s.idle, system: s.system, swap: s.swap });

async function status() {
  const id = await identity();
  const w = await workloads();
  const s = await hostSample();
  return { at: s.at, profile: id.profile, limits: PROFILES[id.profile], health: health(s),
    counts: { heavy: w.builds.length + w.browsers.length, browsers: w.browsers.length, builds: w.builds.length,
      viteServers: w.viteServers.length, agentProcesses: w.agents.length }, workloads: w };
}

async function preflight(cls) {
  if (!['heavy', 'heavy2', 'browser', 'perf', 'agent'].includes(cls)) throw new Error(`unknown class '${cls}'`);
  const id = await identity();
  const L = PROFILES[id.profile];
  const a = await hostSample(); await wait(10000); const b = await hostSample();
  const w = await workloads();
  const heavyNow = w.builds.length + w.browsers.length;
  const paging = { pageouts: b.pageouts - a.pageouts, swapouts: b.swapouts - a.swapouts };
  const reasons = [];
  const healthy = s => s.pressure === 1;
  if (![a, b].every(healthy)) reasons.push('memory pressure not normal');
  if (cls !== 'agent' && (paging.pageouts > 0 || paging.swapouts > 0)) reasons.push(`paging rising ${JSON.stringify(paging)}`);
  if (cls !== 'agent' && ![a, b].every(s => s.idle >= 25)) reasons.push('CPU idle < 25 %');
  if (![a, b].every(s => s.system < 50)) reasons.push('system CPU >= 50 %');
  if (cls === 'agent' && w.agents.length >= L.agents) reasons.push(`agent processes ${w.agents.length} >= soft limit ${L.agents}`);
  if (cls === 'heavy' && heavyNow >= L.heavy) reasons.push(`heavy workloads ${heavyNow} >= ${L.heavy}`);
  if (cls === 'heavy2') {
    if (!L.heavy2) reasons.push('profile does not allow a second heavy workload');
    else if (heavyNow >= 2) reasons.push(`heavy workloads ${heavyNow} >= 2`);
    else if (![a, b].every(s => s.idle >= 50)) reasons.push('second heavy needs CPU idle >= 50 %');
    if (w.browsers.length > 0 && heavyNow >= 1) reasons.push('a GPU/browser session is running; overlap refused');
  }
  if (cls === 'browser' && (w.browsers.length >= L.browsers || heavyNow >= L.heavy + (L.heavy2 ? 1 : 0)))
    reasons.push(`browser sessions ${w.browsers.length}, heavy ${heavyNow}: GPU/browser slot busy`);
  if (cls === 'perf' && (heavyNow > 0 || w.builds.length > 0)) reasons.push('performance runs need an exclusive host (no other heavy GT3 work)');
  const pass = reasons.length === 0;
  return { pass, cls, profile: id.profile, provisional: !L.measured, reasons, paging,
    a: health(a), b: health(b), counts: { heavy: heavyNow, browsers: w.browsers.length, agents: w.agents.length } };
}

const [cmd, arg] = process.argv.slice(2);
const result = cmd === 'identity' ? await identity() : cmd === 'status' ? await status()
  : cmd === 'preflight' ? await preflight(arg) : null;
if (!result) { console.error('usage: host-check.mjs identity | status | preflight <heavy|heavy2|browser|perf|agent>'); process.exit(2); }
console.log(JSON.stringify(result, null, 2));
if (cmd === 'preflight' && !result.pass) process.exit(75);
