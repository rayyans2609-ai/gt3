/** Algebraic regression: fixed world points keep integer shadow-texel translations. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stabilizeDirectionalShadow } from '../src/scene/shadowStability.js';
const results = [];
for (const mapSize of [2048, 4096]) for (const direction of [[-.35,.87,-.35],[.48,.58,.66],[.1,.9,.3]]) {
  const light = new THREE.DirectionalLight();
  Object.assign(light.shadow.camera, {left:-60,right:60,top:60,bottom:-60,near:.5,far:260});
  light.shadow.mapSize.setScalar(mapSize);
  stabilizeDirectionalShadow(light.shadow);
  const offset = new THREE.Vector3(...direction).normalize().multiplyScalar(104);
  const point = new THREE.Vector3(40,0,-20), projected = new THREE.Vector3();
  let previous, worst = 0, maxCentre = 0;
  for(let i=0;i<200;i++) {
    light.target.position.set(40+i*.001, 0, -20+i*.002);
    light.position.copy(light.target.position).add(offset);
    light.target.updateMatrixWorld(); light.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    projected.copy(point).applyMatrix4(light.shadow.matrix).multiplyScalar(mapSize);
    if(previous) for(const axis of ['x','y']) {
      const delta=projected[axis]-previous[axis];
      worst=Math.max(worst,Math.abs(delta-Math.round(delta)));
    }
    previous=projected.clone();
    const c=light.shadow.camera;
    maxCentre=Math.max(maxCentre,Math.abs((c.right+c.left)/2),Math.abs((c.top+c.bottom)/2));
    assert.equal(c.right-c.left,120); assert.equal(c.top-c.bottom,120);
    assert.equal(c.near,.5); assert.equal(c.far,260);
  }
  assert.ok(worst<1e-8); assert.ok(maxCentre<=60/mapSize+1e-12);
  results.push({mapSize,direction,worstFractionalTexelDelta:worst,maxCentreShift:maxCentre});
}
console.log(JSON.stringify({pass:true,results},null,2));
