/** Sparse safety logic, authored from the shared braking classes; no lights. */
import * as THREE from 'three';
import { TRACK_LENGTH, tangentAt } from './trackCurve.js';
import { CORNERS, WIDTH_SECTIONS, outerEdgeAt } from './trackProfile.js';
import { groundPositionAt } from './environment.js';
export const FULL_PROPS = new URLSearchParams(globalThis.location?.search || '').get('props') !== 'lean';
const lean = !FULL_PROPS;
// Braking classes select zones, corner entries locate the 150/100/50 sequence.
export const BRAKING_ZONES = WIDTH_SECTIONS.filter(s => s.classIndex === 2).map(s => {
  const corner=CORNERS.find(c=>c.entry>=s.from && c.entry<s.to);
  return { id:corner.id, entry:corner.entry, side:-corner.side };
});
export const BARRIER_RUNS = [
  // This aerial-facing catch-fence run minified into detached opaque panels.
  // Keep its two Armco rails and posts; the useful density elsewhere survives.
  {from:.263,to:.308,side:-1,concrete:false,fence:false},
  {from:.621,to:.648,side:1,concrete:true,fence:true},
  {from:.711,to:.748,side:-1,concrete:false,fence:false},
];
export function buildTrackFurniture() {
  // Static instanced draws stay resident from boot, including the atlas
  // shader; a later zone entering view must not allocate at a checkpoint.
  const root=new THREE.Group();root.name='trackside-furniture';root.userData.variant=lean?'lean':'full';
  const pale=new THREE.MeshStandardMaterial({color:0xd5d4cc,roughness:.85});
  const steel=new THREE.MeshStandardMaterial({color:0x8e999e,roughness:.65,metalness:.35});
  const dark=new THREE.MeshStandardMaterial({color:0x52575b,roughness:.96});
  const box=new THREE.BoxGeometry(1,1,1), o=new THREE.Object3D();
  const parts={concrete:[],steel:[],service:[],marshal:[]}, fenceParts=[];
  const add=(bucket,t,lateral,height,sx,sy,sz) => {
    groundPositionAt(t,lateral,o.position,sx*.5+.2,2);
    o.position.y+=height;const tan=tangentAt(t);
    o.rotation.set(0,Math.atan2(tan.x,tan.z),0);o.scale.set(sx,sy,sz);o.updateMatrix();
    bucket.push(o.matrix.clone());
  };
  // One small atlas: actual numbers, high contrast, no branding or extra text.
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=192;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e9e6dc';ctx.fillRect(0,0,384,192);
  ctx.fillStyle='#22272b';ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ['150','100','50'].forEach((text,i)=>ctx.fillText(text,64+i*128,96,118));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const boardGeometry=new THREE.PlaneGeometry(1.6,2.4);
  // Ordinary lit surface: no emissive/light changes or Night-specific treatment.
  const boardMaterial=new THREE.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.95,side:THREE.DoubleSide});
  const zones=BRAKING_ZONES;
  const boards=new THREE.InstancedMesh(boardGeometry,boardMaterial,zones.length*3);boards.name='braking-150-100-50';
  // Per-instance atlas offsets, shader compiled at boot; no per-frame mutation.
  const offsets=new Float32Array(boards.count);
  boardGeometry.setAttribute('boardColumn',new THREE.InstancedBufferAttribute(offsets,1));
  boardMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float boardColumn;\nvarying float vBoardColumn;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBoardColumn = boardColumn;');
    shader.fragmentShader='varying float vBoardColumn;\n'+shader.fragmentShader;
    // onBeforeCompile runs BEFORE shader includes expand. Replacing texture2D
    // in the unexpanded source silently left all three numbers on every board.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',
        'texture2D( map, vec2((vMapUv.x + vBoardColumn) / 3.0, vMapUv.y) )'));
  };
  boardMaterial.customProgramCacheKey=()=> 'braking-board-atlas-v2';
  let index=0;root.userData.boards=[];
  for(const zone of zones) for(const [column,distance] of [150,100,50].entries()) {
    const t=zone.entry-distance/TRACK_LENGTH;
    const lateral=outerEdgeAt(t,zone.side)+zone.side*3.5;
    groundPositionAt(t,lateral,o.position,1,2);o.position.y+=2.1;
    const tan=tangentAt(t);o.rotation.set(0,Math.atan2(-tan.x,-tan.z),0);o.scale.set(1,1,1);o.updateMatrix();
    boards.setMatrixAt(index,o.matrix);offsets[index++]=column;
    add(parts.steel,t,lateral,.9,.12,1.8,.12);
    root.userData.boards.push({zone:zone.id,distance,t,lateral});
  }
  boards.instanceMatrix.needsUpdate=true;boards.computeBoundingSphere();boards.frustumCulled=false;root.add(boards);
  for (const run of lean?BARRIER_RUNS.slice(0,2):BARRIER_RUNS) {
    const count=Math.ceil((run.to-run.from)*TRACK_LENGTH/4);
    for(let i=0;i<count;i++) {
      const t=run.from+(i+.5)*(run.to-run.from)/count;
      const lateral=outerEdgeAt(t,run.side)+run.side*4;
      const length=(run.to-run.from)*TRACK_LENGTH/count+.12;
      if(run.concrete) add(parts.concrete,t,lateral,.6,.6,1.2,length);
      else {
        for(const y of [.45,.85]) add(parts.steel,t,lateral,y,.14,.28,length);
        add(parts.steel,t,lateral,.55,.18,1.1,.18);
      }
      if(run.fence && !lean) {
        const back=lateral+run.side*.8;
        add(parts.steel,t,back,1.8,.12,3.6,.12);
        add(parts.steel,t,back,3.5,.08,.08,length);
        // One cutout panel per bay instead of many sub-pixel wire boxes.
        groundPositionAt(t,back,o.position,.25,2);o.position.y+=1.9;
        const tan=tangentAt(t);o.rotation.set(0,Math.atan2(tan.x,tan.z)+Math.PI/2,0);
        o.scale.set(length,3.2,1);o.updateMatrix();fenceParts.push(o.matrix.clone());
      }
    }
  }
  // The hairpin service-strip / marshal-block pair sat alone in the infield,
  // away from any access junction (owner C #2). Keep the second useful post.
  for(const t of lean?[]:[.605]) {
    const side=1,lateral=outerEdgeAt(t,side)+12;
    add(parts.marshal,t,lateral,1.5,2.8,3,2.5);
    add(parts.steel,t,lateral,3.05,3.5,.18,3.2);
    for(let j=0;j<5;j++) add(parts.service,t+j*4/TRACK_LENGTH,lateral+5,.025,3,.05,4.1);
  }
  for(const [key,material] of [['concrete',pale],['steel',steel],['service',dark],['marshal',pale]]) {
    const matrices=parts[key];if(!matrices.length)continue;
    const mesh=new THREE.InstancedMesh(box,material,matrices.length);mesh.name=`furniture-${key}`;
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.frustumCulled=false;mesh.receiveShadow=true;root.add(mesh);
  }
  if(fenceParts.length) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const context=canvas.getContext('2d');context.clearRect(0,0,128,128);
    context.strokeStyle='#bdc8cd';context.lineWidth=3;
    for(let d=-128;d<=256;d+=32) {
      context.beginPath();context.moveTo(d,0);context.lineTo(d+128,128);context.stroke();
      context.beginPath();context.moveTo(d,0);context.lineTo(d-128,128);context.stroke();
    }
    const wire=new THREE.CanvasTexture(canvas);wire.colorSpace=THREE.SRGBColorSpace;
    wire.wrapS=wire.wrapT=THREE.RepeatWrapping;wire.repeat.set(3,3);
    const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({
      map:wire,color:0xffffff,alphaTest:.05,roughness:.8,side:THREE.DoubleSide}),fenceParts.length);
    mesh.name='furniture-catch-fencing';fenceParts.forEach((m,i)=>mesh.setMatrixAt(i,m));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.frustumCulled=false;root.add(mesh);
  }
  return root;
}
