import assert from 'node:assert/strict';
import { createBoundedModel, speedCeiling } from '../src/scroll/boundedPace.js';

const length = 5030;
for (const kind of ['cap', 'pace']) for (const dt of [1 / 60, 1 / 30, .05]) {
  const model = createBoundedModel(kind, length);
  const settle = () => { for (let i = 0; i < 1200; i++) model.step(dt); };
  for (const endpoint of [0, length]) {
    model.reset(endpoint === 0 ? 20 : length - 20);
    model.addInput(endpoint === 0 ? -1 : 1, .4, endpoint);
    settle();
    assert.equal(model.p, endpoint, `${kind}: terminal input did not reach ${endpoint}`);
    assert.equal(model.v, 0);
    model.reset(length / 2);
    model.addInput(endpoint === 0 ? -1e6 : 1e6, .4, endpoint);
    for (let i = 0; i < 1200; i++) {
      model.step(dt);
      assert.ok(Math.abs(model.credit) <= model.cfg.maxLead + 1e-8, 'terminal input banked excess credit');
      assert.ok(Math.abs(model.v) <= speedCeiling(kind) + 1e-8, 'terminal input exceeded speed ceiling');
    }
    assert.ok(Math.abs(model.p - length / 2) <= model.cfg.maxLead + 1e-8, 'terminal fling travelled beyond lead bound');
  }
  model.reset(length - 2); model.seek(length); settle();
  assert.equal(model.p, length, `${kind}: endpoint glide stopped short`);
  model.reset(length / 2); model.addInput(10, .4); settle();
  assert.ok(Math.abs(model.p - length / 2 - 2.8) < 1e-8, 'ordinary input gain changed');
  console.log(`PASS ${kind} dt=${dt}: exact endpoints, speed/lead bounds, ordinary input gain`);
}
