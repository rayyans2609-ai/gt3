/** Exact no-query camera invariance against leg 1 (Node only).
 * node scripts/check-composition-base.mjs [reference=0967653]
 * Historical camera uses current shared curve/state; trackCurve has no diff at
 * the reference. Temporary baseline modules are outside the worktree.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
globalThis.location = { search: '', hash: '' };
globalThis.window = { __gt3: {} };
const reference = process.argv[2] || '0967653';
const scratch = mkdtempSync(join(tmpdir(), 'gt3-base-'));
try {
  const original = execFileSync('git', ['show', `${reference}:src/scene/aerialCamera.js`], { encoding: 'utf8' });
  const moduleUrl = new URL('../src/scene/aerialCamera.js', import.meta.url);
  const source = original.replace(/from '([^']+)'/g, (_, specifier) =>
    `from '${specifier.startsWith('.') ? new URL(specifier, moduleUrl).href : import.meta.resolve(specifier)}'`);
  const baselinePath = join(scratch, 'aerial.mjs');
  writeFileSync(baselinePath, source);
  const { PerspectiveCamera } = await import('three');
  const { state } = await import('../src/core/state.js');
  const baseline = await import(pathToFileURL(baselinePath).href);
  const current = await import('../src/scene/aerialCamera.js');
  const a = new PerspectiveCamera(40, 16 / 9, 0.5, 3000), b = a.clone();
  baseline.initAerialCamera(a); current.initAerialCamera(b);
  const rows = [];
  for (const direction of [1, -1]) for (let i = 0; i < 900; i++) {
    state.progress = direction > 0 ? i / 900 : 1 - i / 900;
    state.velocity = i % 30 ? direction : 0;
    if (i % 30) { baseline.update(1 / 60); current.update(1 / 60); }
    else { baseline.snap(); current.snap(); }
    assert.deepEqual(a.position.toArray(), b.position.toArray());
    assert.deepEqual(a.quaternion.toArray(), b.quaternion.toArray());
    assert.equal(a.fov, b.fov);
    rows.push([...b.position.toArray(), ...b.quaternion.toArray(), b.fov]);
  }
  console.log(JSON.stringify({ reference, samples: rows.length, exactEquality: true,
    maxPositionQuaternionComponentDifference: 0,
    serializedPosesSha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }, null, 1));
} finally { rmSync(scratch, { recursive: true, force: true }); }
