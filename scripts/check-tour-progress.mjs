/** Pure checks for the high-blast-radius Option A mapping and save migration. */
import assert from 'node:assert/strict';
globalThis.location={search:process.env.GT3_GRID==='p2'?'?grid=p2':''};
const r=await import('../src/scene/trackCurve.js');
const session=await import('../src/core/session.js');
const { migrateRouteProgress }=session;
const { tourPathPointAt, tourPathTangentAt }=await import('../src/scene/tourPath.js');
const near=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
near(r.TOUR_LENGTH,r.TRACK_LENGTH+r.GRID_DISTANCE);
near(r.routeTAt(0),r.GRID_T);near(r.routeTAt(r.FIRST_LINE_PROGRESS),0);near(r.routeTAt(1),0);
assert.equal(r.FINISH_THRESHOLD,1);
assert.ok(r.FIRST_LINE_PROGRESS<r.CHECKPOINT_T[0]);
for(let i=0;i<9;i++) {
  near(r.routeTAt(r.CHECKPOINT_T[i]),r.CHECKPOINT_ROUTE_T[i]);
  assert.equal(migrateRouteProgress({routeProgress:r.CHECKPOINT_ROUTE_T[i]}),r.CHECKPOINT_T[i]);
  assert.equal(migrateRouteProgress({routeMapping:r.ROUTE_MAPPING,routeGridDistance:r.GRID_DISTANCE,routeProgress:r.CHECKPOINT_T[i]}),r.CHECKPOINT_T[i]);
  assert.equal(r.CHECKPOINT_T.filter(p=>p<=r.CHECKPOINT_T[i]).length,i+1);
  assert.ok(r.CHECKPOINT_T[i]>(r.CHECKPOINT_T[i-1]||r.FIRST_LINE_PROGRESS));
}
for(const p of [0,.4,1]) near(migrateRouteProgress({routeMapping:r.ROUTE_MAPPING,routeGridDistance:r.GRID_DISTANCE,routeProgress:p}),p);
near(migrateRouteProgress({routeProgress:0}),0);near(migrateRouteProgress({routeProgress:1}),1);
near(migrateRouteProgress({routeProgress:.995}),1);
const migrated=migrateRouteProgress({routeProgress:.4});near(r.routeTAt(migrated),.4);
const oldDistance=r.GRID_DISTANCE===18?26:18;
const oldP=(.4*r.TRACK_LENGTH+oldDistance)/(r.TRACK_LENGTH+oldDistance);
near(r.routeTAt(migrateRouteProgress({routeMapping:r.ROUTE_MAPPING,routeGridDistance:oldDistance,routeProgress:oldP})),.4);
const grid=tourPathPointAt(0),expected=r.offsetPointAt(r.GRID_T,r.GRID_LATERAL);
near(grid.distanceTo(expected),0,1e-8);
for(const p of [0,r.FIRST_LINE_PROGRESS,.018,.1,.39,.7,.9999,1]) {
  const a=tourPathPointAt(p),b=tourPathPointAt(p);near(a.distanceTo(b),0);
  const tangent=tourPathTangentAt(p);near(tangent.length(),1,1e-8);
  assert.ok([a.x,a.y,a.z].every(Number.isFinite));
}
let written;
globalThis.window={sessionStorage:{getItem:()=>JSON.stringify({routeProgress:.4,theme:'night',unlocked:[0,1,2,3,4]}),setItem:(_,value)=>written=JSON.parse(value)},clearTimeout(){}};
session.restoreSession();near(r.routeTAt(session.getRestoredRouteProgress()),.4);
session.persistRouteProgress(session.getRestoredRouteProgress(),{flush:true});
assert.equal(written.routeMapping,r.ROUTE_MAPPING);assert.equal(written.routeGridDistance,r.GRID_DISTANCE);
assert.equal(written.theme,'night');assert.deepEqual(written.unlocked,[0,1,2,3,4]);
console.log(JSON.stringify({pass:true,grid:r.GRID_SLOT,gridDistance:r.GRID_DISTANCE,lapLength:r.TRACK_LENGTH,tourLength:r.TOUR_LENGTH,neutral:r.FIRST_LINE_PROGRESS,checkpoints:r.CHECKPOINT_T,migratedOld:.4,finish:r.FINISH_THRESHOLD},null,2));
