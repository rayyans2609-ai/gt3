/** Fixed-metre grid paint and a restrained pit-wall / parallel-lane corridor. */
import * as THREE from 'three';
import { TRACK_LENGTH, offsetPointAt, tangentAt } from './trackCurve.js';
import { asphaltEdgeAt } from './trackProfile.js';
import { groundHeightAt } from './environment.js';
import { COMP } from './composition.js';
import { FULL_PROPS } from './trackFurniture.js';
export const GRID_BOXES = Object.freeze(Array.from({ length: 10 }, (_, i) => ({
  distance: 18 + i * 8, lateral: i % 2 ? -6 : 6,
  // Conservative whole-car footprint, including wing/mirrors. Paint remains
  // metre-sized, with a one-metre envelope around the current hero candidate.
  width: 2 * 1.412 * COMP.hero + 1.2, length: 4.6 * COMP.hero + 1.8,
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
    const line = .30;
    const left = box.lateral + box.width / 2, right = left - box.width;
    paintQuad(rear,front,right,right+line); paintQuad(rear,front,left-line,left);
    paintQuad(front-line,front,right,left);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  const paint = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xe4e0d7,roughness:.86,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  paint.name = 'staggered-grid-paint'; paint.frustumCulled=false; paint.receiveShadow=true; root.add(paint);

  // Expendable corridor lane/wall belongs to the recoverable fuller set.
  if (!FULL_PROPS) return root;
  const poses=[], laneVertices=[]; const o=new THREE.Object3D();
  for (let d=-100;d<150;d+=5) {
    const t=wrap((d+2.5)/TRACK_LENGTH), edge=asphaltEdgeAt(t,-1);
    const tan=tangentAt(t); o.rotation.set(0,Math.atan2(tan.x,tan.z),0);
    o.position.copy(offsetPointAt(t,edge-2,0));
    o.position.y=groundHeightAt(o.position.x,o.position.z)+.5;
    o.scale.set(.55,1,5.05);o.updateMatrix();poses.push(o.matrix.clone());
    // Continuous lane surface: rotated broad boxes produced overlapping
    // angular teeth and stepped heights along the outer corridor.
    const corners = [d, d+5].flatMap(distance => {
      const u=wrap(distance/TRACK_LENGTH), x=asphaltEdgeAt(u,-1)-6;
      return [x-3,x+3].map(lateral => {
        const p=offsetPointAt(u,lateral,0);
        p.y=groundHeightAt(p.x,p.z)+.025;
        return p;
      });
    });
    for (const p of [corners[0],corners[2],corners[1],corners[1],corners[2],corners[3]])
      laneVertices.push(p.x,p.y,p.z);
  }
  const unit=new THREE.BoxGeometry(1,1,1);
  for (const [name,mat,parts] of [
    ['pit-wall',new THREE.MeshStandardMaterial({color:0xc9c7be,roughness:.9}),poses]]) {
    const mesh=new THREE.InstancedMesh(unit,mat,parts.length);mesh.name=name;
    parts.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.frustumCulled=false;mesh.receiveShadow=true;root.add(mesh);
  }
  const laneGeometry=new THREE.BufferGeometry();
  laneGeometry.setAttribute('position',new THREE.Float32BufferAttribute(laneVertices,3));
  laneGeometry.computeVertexNormals();
  const lane=new THREE.Mesh(laneGeometry,new THREE.MeshStandardMaterial({color:0x55585a,roughness:.98,side:THREE.DoubleSide}));
  lane.name='parallel-pit-lane';lane.frustumCulled=false;lane.receiveShadow=true;root.add(lane);
  return root;
}
