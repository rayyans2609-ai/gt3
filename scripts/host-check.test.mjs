import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWorkloads, identity, workloads, preflight } from './host-check.mjs';

const row = (pid, command) => `${pid} 1 1024 ${command}`;
const snapshot = commands => commands.map((command, i) => row(i + 100, command)).join('\n');
const m4 = { profile: 'm4-16gb', arch: 'arm64', cpu: 'Apple M4', ramGB: 16 };
const normal = { pressure: 1, pageouts: 50, swapouts: 10, idle: 80, system: 10, swap: 'used = 687.19M' };
const inventory = classifyWorkloads(row(100, 'claude'));
const gate = (cls = 'agent', overrides = {}) => preflight(cls, {
  identify: async () => m4, sample: async () => ({ ...normal }),
  inventory: async () => inventory, pause: async ms => assert.equal(ms, 10000), workers: async () => null, ...overrides,
});

test('excludes only the Claude bg-spare subcommand, including versioned paths and whitespace', () => {
  const commands = [
    'claude bg-spare --bg-spare /tmp/claim.sock',
    '/Users/example/Library/Application Support/Claude/claude-code/2.1.299/hash/claude.app/Contents/MacOS/claude bg-spare --bg-spare /tmp/claim.sock',
    '/usr/local/bin/claude\tbg-spare',
    'claude bg-spare-other',
    'claude -p "inspect bg-spare"',
  ];
  assert.deepEqual(classifyWorkloads(snapshot(commands)).agents.map(p => p.command), commands.slice(3));
});

test('retains real sessions, unrelated projects and existing helper exclusions', () => {
  const sessions = ['claude', '/usr/local/bin/claude -p task', '/usr/local/bin/codex',
    '/usr/local/bin/codex exec -C /another/project task', '/usr/local/bin/opencode run task',
    '/Applications/Claude/claude-code/2.1.299/hash/claude.app/Contents/MacOS/claude --output-format stream-json'];
  const helpers = ['codex app-server', 'codex exec-server', 'claude remote-control',
    'claude bg-pty-host', 'claude auth status'];
  assert.deepEqual(classifyWorkloads(snapshot([...sessions, ...helpers])).agents.map(p => p.command), sessions);
});

test('known limitation: native Codex app-server is excluded, not proven to count its manager', () => {
  assert.equal(classifyWorkloads(row(100, '/Applications/Codex.app/Contents/Resources/codex app-server')).agents.length, 0);
});

test('Codex launcher and its native child count as one session (D4)', () => {
  const ps = `${row(100, 'node /Users/example/.npm-global/bin/codex exec task')}\n101 100 1024 /vendor/bin/codex exec task`;
  assert.deepEqual(classifyWorkloads(ps).agents.map(p => [p.pid, p.ppid]), [[100, 1]]);
  const two = `${row(100, 'codex exec a')}\n${row(200, 'codex exec b')}`;
  assert.equal(classifyWorkloads(two).agents.length, 2, 'independent sessions still both count');
});

test('failed, empty or malformed process inventory is unavailable, not zero agents', async () => {
  for (const ps of [null, '', 'permission denied', `${row(100, 'claude')}\nmalformed`]) {
    const w = classifyWorkloads(ps);
    assert.equal(w.agents, null);
    assert.equal(w.builds, null);
    assert.match(w.unavailable, /inventory unavailable/);
    const result = await gate('agent', { inventory: async () => w });
    assert.equal(result.pass, false);
    assert.equal(result.counts.agents, null);
    assert.equal(result.counts.heavy, null);
    assert.match(result.reasons.join('\n'), /inventory unavailable/);
  }
  assert.equal((await workloads(async () => null)).agents, null);
});

test('unmatched valid processes produce a genuinely empty matched inventory', () => {
  assert.deepEqual(classifyWorkloads(row(100, '/sbin/launchd')).agents, []);
});

test('unavailable hardware remains null and blocks preflight', async () => {
  const id = await identity(async () => null);
  assert.equal(id.profile, 'unknown');
  assert.equal(id.ramGB, null);
  assert.equal(id.cpu, null);
  assert.equal(id.cores.performance, null);
  assert.ok(id.unavailable.includes('ramGB'));
  assert.ok(id.unavailable.includes('versions.codex'));
  const result = await gate('agent', { identify: async () => id });
  assert.equal(result.pass, false);
  assert.match(result.reasons.join('\n'), /host identity unavailable/);
});

test('readable M4 identity still detects the six-agent profile', async () => {
  const values = { 'uname -m': 'arm64', 'sysctl -n machdep.cpu.brand_string': 'Apple M4',
    'sysctl -n hw.memsize': '17179869184', 'sysctl -n hw.model': 'Mac16,12',
    'sysctl -n hw.perflevel0.physicalcpu': '4', 'sysctl -n hw.perflevel1.physicalcpu': '6' };
  const id = await identity(async (cmd, args) => values[[cmd, ...args].join(' ')] ?? null);
  assert.equal(id.profile, 'm4-16gb');
  assert.equal(id.ramGB, 16);
  assert.equal((await gate('agent', { identify: async () => id })).pass, true);
});

test('command failure gives explicit unavailable samples and null paging deltas', async () => {
  const result = await gate('agent', { sample: async () => { throw new Error('ps: Operation not permitted'); } });
  assert.equal(result.pass, false);
  assert.equal(result.a.pressure, null);
  assert.equal(result.a.idle, null);
  assert.deepEqual(result.paging, { pageouts: null, swapouts: null });
  assert.match(result.reasons.join('\n'), /host sample unavailable: ps: Operation not permitted/);
});

test('invalid measurement values are explicit and never pass', async () => {
  for (const change of [{ pressure: NaN }, { pressure: 0 }, { idle: undefined },
    { system: Infinity }, { pageouts: null }, { swapouts: -1 }, { swap: '' }]) {
    const result = await gate('agent', { sample: async () => ({ ...normal, ...change }) });
    assert.equal(result.pass, false);
    for (const key of Object.keys(change)) assert.equal(result.a[key], null);
    assert.match(result.reasons.join('\n'), /measurements unavailable/);
  }
});

test('normal pressure allows agent preflight; warning or critical in either sample refuses', async () => {
  assert.equal((await gate()).pass, true);
  for (const pressures of [[2, 2], [1, 2], [2, 1], [4, 4]]) {
    let i = 0;
    const result = await gate('agent', { sample: async () => ({ ...normal, pressure: pressures[i++] }) });
    assert.equal(result.pass, false);
    assert.ok(result.reasons.includes('memory pressure not normal'));
  }
});

test('host-wide census at the limit warns but does not refuse (S0 replay, D4)', async () => {
  for (const n of [5, 6, 9]) {
    const w = classifyWorkloads(snapshot(Array(n).fill('claude -p task')));
    const result = await gate('agent', { inventory: async () => w });
    assert.equal(result.pass, true);
    assert.equal(result.counts.agents, n);
    assert.deepEqual(result.workloads.agents, w.agents);
    assert.equal(result.warnings.length, n >= 6 ? 1 : 0);
  }
});

test('run-own live workers enforce the agent limit (manager + new launch included)', async () => {
  for (const [own, pass] of [[0, true], [4, true], [5, false]]) {
    const result = await gate('agent', { workers: async () => own });
    assert.equal(result.pass, pass, `own=${own}`);
    assert.equal(result.counts.runWorkers, own);
    if (!pass) assert.ok(result.reasons.some(r => r.startsWith('run workers 5')));
  }
});

test('advisory census never masks real blocks: pressure 2 still refuses agent launches', async () => {
  const result = await gate('agent', { sample: async () => ({ ...normal, pressure: 2 }),
    inventory: async () => classifyWorkloads(snapshot(Array(9).fill('claude -p task'))) });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes('memory pressure not normal'));
});

test('inventory evidence retains command suffixes beyond the former truncation', async () => {
  const command = `claude -p ${'x'.repeat(200)} evidence-tail`;
  const w = await workloads(async () => row(100, command));
  const result = await gate('agent', { inventory: async () => w });
  assert.equal(result.workloads.agents[0].command, command);
});

test('other safeguards remain: system CPU, heavy occupancy, paging, idle, GPU and perf exclusion', async () => {
  const build = classifyWorkloads(row(100, 'node /repo/node_modules/vite/bin/vite.js build'));
  const browser = classifyWorkloads(row(100, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/gt3-test'));
  const cases = [
    ['agent', { sample: async () => ({ ...normal, system: 50 }) }, 'system CPU >= 50 %'],
    ['heavy', { inventory: async () => build }, 'heavy workloads 1 >= 1'],
    ['heavy', { sample: async () => ({ ...normal, idle: 24 }) }, 'CPU idle < 25 %'],
    ['heavy2', { sample: async () => ({ ...normal, idle: 49 }) }, 'second heavy needs CPU idle >= 50 %'],
    ['heavy2', { inventory: async () => browser }, 'a GPU/browser session is running; overlap refused'],
    ['browser', { inventory: async () => browser }, 'GPU/browser slot busy'],
    ['perf', { inventory: async () => build }, 'performance runs need an exclusive host'],
  ];
  for (const [cls, overrides, reason] of cases) {
    const result = await gate(cls, overrides);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some(s => s.includes(reason)), JSON.stringify(result.reasons));
  }
  let i = 0;
  const result = await gate('heavy', { sample: async () => ({ ...normal, pageouts: 50 + i++ }) });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.some(s => s.startsWith('paging rising')));
});
