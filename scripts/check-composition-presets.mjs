/** Coupled look presets: old-query bit equality, line locality/curb safety,
 * default track geometry equality and assertions over check-composition-math output.
 * node scripts/check-composition-presets.mjs [reference=ec9b697] [math-dir=/tmp/gt3-p3r-visual]
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const reference = process.argv[2] || 'ec9b697';
const mathDir = process.argv[3] || '/tmp/gt3-p3r-visual';
const scratch = mkdtempSync(join(tmpdir(), 'gt3-looks-'));
const compURL = new URL('../src/scene/composition.js', import.meta.url).href;
try {
  writeFileSync(join(scratch, 'baseline.mjs'), execFileSync('git', ['show', `${reference}:src/scene/composition.js`]));
  const queryRows = [];
  for (const comp of ['base', 'a', 'b', 'c', 'invalid']) for (const cam of ['leg1', 'glide', 'soft', 'hold', 'wide']) {
    const search = `?comp=${comp}&cam=${cam}`;
    globalThis.location = { search };
    const currentComp = await import(`${compURL}?compat=${queryRows.length}`);
    const baselineComp = await import(`${new URL('file://' + join(scratch, 'baseline.mjs')).href}?compat=${queryRows.length}`);
    assert.deepEqual(currentComp.COMP, baselineComp.COMP);
    queryRows.push(search);
  }
  globalThis.location = { search: '' };
  // Default entire static track geometry remains byte-identical, not only dimensions.
  const trackURL = new URL('../src/scene/track.js', import.meta.url);
  const source = execFileSync('git', ['show', `${reference}:src/scene/track.js`], { encoding: 'utf8' })
    .replace(/from '([^']+)'/g, (_, s) => `from '${s.startsWith('.') ? new URL(s, trackURL).href : import.meta.resolve(s)}'`);
  writeFileSync(join(scratch, 'track.mjs'), source);
  const original = await import(new URL('file://' + join(scratch, 'track.mjs')).href);
  const current = await import(trackURL.href);
  const a = original.buildTrack(), b = current.buildTrack();
  for (let i = 0; i < a.children.length; i++) {
    const ga = a.children[i].geometry, gb = b.children[i].geometry;
    assert.equal(a.children[i].name, b.children[i].name);
    assert.deepEqual(ga.index?.array, gb.index?.array);
    for (const key of Object.keys(ga.attributes)) assert.deepEqual(ga.attributes[key].array, gb.attributes[key].array);
  }
  // The default mount, tyre pivot and body motion follow exactly the old path.
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) }) };
  const rigURL = new URL('../src/scene/carRig.js', import.meta.url);
  const oldRig = execFileSync('git', ['show', `${reference}:src/scene/carRig.js`], { encoding: 'utf8' })
    .replace(/from '([^']+)'/g, (_, s) => `from '${s.startsWith('.') ? new URL(s, rigURL).href : import.meta.resolve(s)}'`);
  writeFileSync(join(scratch, 'rig.mjs'), oldRig);
  const baselineRig = await import(new URL('file://' + join(scratch, 'rig.mjs')).href);
  const currentRig = await import(rigURL.href);
  const { state } = await import('../src/core/state.js');
  baselineRig.initCarRig(); currentRig.initCarRig();
  for (let i = 0; i < 600; i++) {
    state.progress = i < 300 ? i / 300 : (600 - i) / 300;
    state.speed01 = i % 11 ? 0.5 : 0;
    state.velocity = i < 300 ? 1 : -1;
    baselineRig.update(1 / 60); currentRig.update(1 / 60);
    for (const field of ['position', 'quaternion', 'scale']) {
      assert.deepEqual(baselineRig.rig[field].toArray(), currentRig.rig[field].toArray());
      assert.deepEqual(baselineRig.carMount[field].toArray(), currentRig.carMount[field].toArray());
    }
  }
  for (const look of ['r1', 'r2', 'r3']) {
    const d = JSON.parse(readFileSync(join(mathDir, `${look}-math.json`), 'utf8'));
    assert(d.values.pitch >= 45 && d.values.pitch <= 60);
    assert.equal(d.railFallback, null);
    assert(d.railDenseCheck.maxResidualM <= 0);
    assert.equal(d.framingSettled.pctOverHardZone, 0);
    assert.equal(d.framingSettled.pctOverFrame, 0);
    assert.equal(d.worldExtent.exposedRays, 0);
    assert.equal(d.worldExtent.beyondCameraFar, 0);
    assert(d.gates.minPostClearanceM > 0 && d.gates.finishPostClearanceM > 0);
    assert.equal(d.seamPositionDiffM, 0);
    assert.equal(d.reversibilityPositionDiffM, 0);
    assert.equal(d.motionProxy.snapsDuringContinuousUpdates, 0);
    assert.equal(d.motionProxy.updatePoseDiffM, 0);
    // Body over asphalt only in the two selected curb windows. Conservative
    // all-roster body/roll/yaw envelope remains within actual curb outer edge.
    const code = `globalThis.location={search:'?look=${look}'};
      const {COMP}=await import(${JSON.stringify(compURL)});
      const THREE=await import(${JSON.stringify(import.meta.resolve('three'))});
      const {TRACK,TRACK_LENGTH,tangentAt}=await import(${JSON.stringify(new URL('../src/scene/trackCurve.js', import.meta.url).href)});
      const line=await import(${JSON.stringify(new URL('../src/scene/racingLine.js', import.meta.url).href)});
      const {default:assert}=await import('node:assert/strict');
      const footprints=${JSON.stringify(d.footprints)};
      let minSupport=Infinity,minOrdinary=Infinity,maxCurbOutside=0,wrongSide=0;
      for(let i=0;i<8192;i++) {
        const t=i/8192,lateral=line.lateralAt(t),w=line.curbUseAt(t);
        const yaw=Math.acos(THREE.MathUtils.clamp(line.pathTangentAt(t).setY(0).normalize().dot(tangentAt(t).setY(0).normalize()),-1,1));
        const extent=Math.abs(lateral)+Math.max(...footprints.map(f=>COMP.hero*((f.width/2+f.height*Math.sin(3.4*Math.PI/180))*Math.cos(yaw)+2.3*Math.sin(yaw))));
        const gap=TRACK.halfWidth-extent;
        if(w===0) minOrdinary=Math.min(minOrdinary,gap);
        minSupport=Math.min(minSupport,gap+(w>0?TRACK.curbWidthWide:0));
        if(w>0&&gap<0)maxCurbOutside=Math.max(maxCurbOutside,-gap);
        if(w>.9&&lateral*COMP.curbCorners.find(c=>line.curbWeight(t,c)>.9).side<0)wrongSide++;
      }
      assert(minOrdinary>.1,'body leaves ordinary asphalt: '+minOrdinary);
      assert(minSupport>.1,'body leaves curb: '+minSupport);
      assert(maxCurbOutside>0,'no curb event');assert.equal(wrongSide,0);
      console.log(JSON.stringify({look:'${look}',minOrdinary,minSupport,maxCurbOutside}));`;
    process.stdout.write(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }));
  }
  console.log(JSON.stringify({ pass: true, reference, exactOldQueries: queryRows.length, defaultTrackMeshBuffersExact: a.children.length, defaultRigPosesExact: 600 }));
} finally { rmSync(scratch, { recursive: true, force: true }); }
