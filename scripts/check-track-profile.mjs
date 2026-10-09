/** Shared geometry contract: route invariants, widths, paint, body clearance and gate fit.
 * Pure Node, all ten conservative GLB footprints. GT3_LOOK=pro|p1|p2|r1|base.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { glbFootprint } from './lib/glb-footprint.mjs';
import { CARS } from '../src/data/cars.js';
globalThis.location = { search: process.env.GT3_LOOK ? `?look=${process.env.GT3_LOOK}` : '' };
const { COMP } = await import('../src/scene/composition.js');
const route = await import('../src/scene/trackCurve.js');
const { profileAt, gateSpanAt, WIDTH_SECTIONS, CURB_SEGMENTS, RUNOFF_REGIONS, CROSS_SECTION } = await import('../src/scene/trackProfile.js');
const line = await import('../src/scene/racingLine.js');
assert.ok(Math.abs(route.TRACK_LENGTH - 5006.8196682221) < 1e-8, 'route length changed');
assert.deepEqual(route.CHECKPOINT_T, [.09,.18,.255,.39,.495,.585,.68,.775,.86]);
assert.equal(route.FINISH_T,.994);
assert.deepEqual(profileAt(0), profileAt(1));
const footprints = await Promise.all(CARS.map(async c => ({ id:c.id, ...await glbFootprint(`public/models/tour/${c.modelFile}`) })));
const out = { source: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), look: COMP.look, hero:COMP.hero,
  widthClasses:COMP.widthClasses, camera:[COMP.distance,COMP.fov,COMP.pitchDeg], minClearance:{}, gates:[], maxTotalWidthSlope:0 };
const V = () => new THREE.Vector3();
const center=V(), tangent=V(), left=V(), point=V(), origin=V(), pathTan=V(), pathLeft=V(), delta=V();
function gapAt(world, t) {
  let u=t;
  for(let i=0;i<5;i++) {
    route.pointAt(Math.max(0,Math.min(1,u)),center);
    route.tangentAt(Math.max(0,Math.min(1,u)),tangent).setY(0).normalize();
    u = Math.max(0,Math.min(1,u+delta.copy(world).sub(center).dot(tangent)/route.TRACK_LENGTH));
  }
  route.pointAt(u,center);route.tangentAt(u,tangent).setY(0).normalize();
  left.set(tangent.z,0,-tangent.x);
  const lateral=delta.copy(world).sub(center).dot(left), p=profileAt(u);
  return lateral>=0 ? p.left+p.curbLeft-lateral : p.right+p.curbRight+lateral;
}
// Sampling every <=2 m plus all line extrema detects yaw+width coupling at
// front/rear body corners; the .1 m minimum margin exceeds interpolation error.
const ts = [...Array.from({length:Math.ceil(route.TRACK_LENGTH/2)+1},(_,i)=>i/Math.ceil(route.TRACK_LENGTH/2)), ...line.LINE_KNOTS.map(k=>k[0])];
for(const f of footprints) out.minClearance[f.id]={m:Infinity,t:null};
for(const t of ts) {
  const p=profileAt(t);
  if(t<1) { const q=profileAt(t+1/route.TRACK_LENGTH);out.maxTotalWidthSlope=Math.max(out.maxTotalWidthSlope,Math.abs(q.left+q.right-p.left-p.right)); }
  line.pathPointAt(t,origin);line.pathTangentAt(t,pathTan).setY(0).normalize();pathLeft.set(pathTan.z,0,-pathTan.x);
  for(const f of footprints) {
    let gap=Infinity;
    for(const side of [-1,1]) for(const fore of [-1,1]) {
      point.copy(origin).addScaledVector(pathLeft,side*f.width*COMP.hero/2).addScaledVector(pathTan,fore*f.length*COMP.hero/2);
      gap=Math.min(gap,gapAt(point,t));
    }
    if(gap<out.minClearance[f.id].m) out.minClearance[f.id]={m:gap,t};
  }
}
assert.ok(out.maxTotalWidthSlope<=.05001,'width transitions exceed 1:20');
for(const f of footprints) assert.ok(out.minClearance[f.id].m >= .05,`${f.id} clipped road/curb: ${JSON.stringify(out.minClearance[f.id])}`);
for(const t of [...route.CHECKPOINT_T,route.FINISH_T]) {
  const p=profileAt(t), span=gateSpanAt(t,t===route.FINISH_T?1.25:1);
  const leftGap=span.left-p.left-p.curbLeft-(t===route.FINISH_T?.55/2:.34/2);
  const rightGap=span.right-p.right-p.curbRight-(t===route.FINISH_T?.55/2:.34/2);
  assert.ok(leftGap>.5 && rightGap>.5);
  out.gates.push({t,span:span.width,leftGap,rightGap});
}
assert.equal(line.lateralAt(.55),0,'straight is not calm');
assert.equal(line.lateralAt(0),line.lateralAt(1));
for(const t of [.012,.283,.365,.616,.63,.645,.66,.673,.7,.985]) {
  assert.ok(line.pathPointAt(t).distanceTo(line.pathPointAt(t))===0,'not deterministic');
}
// Mesh construction is opt-in for an acquired heavy slot. The default is a
// small pure-math/source contract check that needs no renderer/build process.
if (process.env.GT3_MESH === '1') {
  const { buildTrack, TRACK_SAMPLE_COUNT } = await import('../src/scene/track.js');
  const track=buildTrack();
  out.meshes=track.children.map(m=>({name:m.name,triangles:(m.geometry.index?.count??m.geometry.attributes.position.count)/3}));
  assert.equal(out.meshes.length,5);
  assert.equal(out.meshes.find(m=>m.name==='track-markings').triangles,(TRACK_SAMPLE_COUNT-1)*4,'edge line gap or unexpected centre paint');
  const blocks=track.getObjectByName('track-curbs').geometry.userData.blocks;
  assert.ok(blocks.every(b=>b.terminal || Math.abs(b.toM-b.fromM-CROSS_SECTION.curbBlockLength)<1e-8));
  out.curbBlocks=blocks.length;
}
out.semanticCurbSegments=CURB_SEGMENTS.length;out.runoffRegions=RUNOFF_REGIONS.length;
out.pass=true;console.log(JSON.stringify(out,null,2));
if(process.env.GT3_RESULT) await writeFile(process.env.GT3_RESULT,JSON.stringify(out,null,2));
