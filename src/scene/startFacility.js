/** Fixed-metre grid paint and a restrained pit-wall / parallel-lane corridor. */
import * as THREE from 'three';
import { TRACK_LENGTH, offsetPointAt, tangentAt } from './trackCurve.js';
import { asphaltEdgeAt } from './trackProfile.js';
import { groundHeightAt } from './environment.js';
export const GRID_BOXES = Object.freeze(Array.from({ length: 10 }, (_, i) => ({
  distance: 18 + i * 8, lateral: i % 2 ? -6 : 6,
  width: 3, length: 8,
})));
const wrap = t => ((t % 1) + 1) % 1;
export function buildStartFacility() {
  const root = new THREE.Group(); root.name = 'start-finish-facility';
  const vertices = [];
  const paintQuad = (d0, d1, x0, x1) => {
    const a = offsetPointAt(wrap(d0 / TRACK_LENGTH), x0, .042);
    const b = offsetPointAt(wrap(d0 / TRACK_LENGTH), x1, .042);
    const c = offsetPointAt(wrap(d1 / TRACK_LENGTH), x1, .042);
    const d = offsetPointAt(wrap(d1 / TRACK_LENGTH), x0, .042);
    for (const v of [a,c,b,a,d,c]) vertices.push(v.x,v.y,v.z);
  };
  for (const box of GRID_BOXES) {
    const front = -box.distance + box.length / 2, rear = front - box.length;
    const left = box.lateral + box.width / 2, right = left - box.width;
    paintQuad(rear,front,right,right+.15); paintQuad(rear,front,left-.15,left);
    paintQuad(front-.15,front,right,left);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  const paint = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xe4e0d7,roughness:.86,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  paint.name = 'staggered-grid-paint'; paint.frustumCulled=false; paint.receiveShadow=true; root.add(paint);

  const poses=[], lanePoses=[]; const o=new THREE.Object3D();
  for (let d=-100;d<150;d+=5) {
    const t=wrap((d+2.5)/TRACK_LENGTH), edge=asphaltEdgeAt(t,-1);
    const tan=tangentAt(t); o.rotation.set(0,Math.atan2(tan.x,tan.z),0);
    o.position.copy(offsetPointAt(t,edge-2,0));
    o.position.y=groundHeightAt(o.position.x,o.position.z)+.5;
    o.scale.set(.55,1,5.05);o.updateMatrix();poses.push(o.matrix.clone());
    o.position.copy(offsetPointAt(t,edge-6,0));
    o.position.y=groundHeightAt(o.position.x,o.position.z)+.04;
    o.scale.set(6,.05,5.05);o.updateMatrix();lanePoses.push(o.matrix.clone());
  }
  const unit=new THREE.BoxGeometry(1,1,1);
  for (const [name,mat,parts] of [
    ['pit-wall',new THREE.MeshStandardMaterial({color:0xc9c7be,roughness:.9}),poses],
    ['parallel-pit-lane',new THREE.MeshStandardMaterial({color:0x55585a,roughness:.98}),lanePoses]]) {
    const mesh=new THREE.InstancedMesh(unit,mat,parts.length);mesh.name=name;
    parts.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.frustumCulled=false;mesh.receiveShadow=true;root.add(mesh);
  }
  return root;
}
