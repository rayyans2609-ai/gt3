/** State/scroll lifecycle check with a small DOM adapter; not browser/render evidence. */
import assert from 'node:assert/strict';
class Node {
  constructor(){this.children=[];this.attrs={};this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){}};}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,fn){this.events[k]=fn;}
}
const root=new Node(),listeners=new Map();
globalThis.document={getElementById:()=>root,createElement:()=>new Node(),createTextNode:()=>new Node(),createDocumentFragment:()=>new Node(),documentElement:{scrollHeight:40000},addEventListener(){}};
globalThis.window={scrollY:0,innerHeight:900,addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},scrollTo(_,y){this.scrollY=y;},clearTimeout, __gt3:{readiness:{status:'ready'}}};
globalThis.location={search:''};globalThis.requestAnimationFrame=fn=>fn();
const {set,state}=await import('../src/core/state.js');
const {seekTo}=await import('../src/scroll/scrollDrive.js');
const finish=await import('../src/ui/finishScreen.js');
const r=await import('../src/scene/trackCurve.js');
finish.initFinishScreen();
seekTo(r.FIRST_LINE_PROGRESS+.0001,{instant:true});assert.equal(state.mode,'race');
seekTo(1-1/r.TOUR_LENGTH,{instant:true});assert.equal(state.mode,'race');
seekTo(1,{instant:true});assert.equal(state.mode,'finish');assert.equal(state.scrollLocked,false);
finish.hideFinishScreen();finish.update(0);assert.equal(state.mode,'race','hide at endpoint immediately reopened completion');
seekTo(.99,{instant:true});seekTo(1,{instant:true});assert.equal(state.mode,'finish','completion did not re-arm');
// Reverse is regular scroll motion now, never a wheel-handler teleport.
seekTo(.999,{instant:true});assert.equal(state.mode,'race');assert.equal(state.scrollLocked,false);
assert.equal(state.finishAcknowledged,true,'reverse erased once-per-run completion');
seekTo(1,{instant:true});assert.equal(state.mode,'finish');
finish.hideFinishScreen();seekTo(.99,{instant:true});set('mode','finish');seekTo(1,{instant:true});finish.restoreFinishScreen();
assert.equal(state.mode,'finish');assert.equal(state.scrollLocked,false);
finish.disposeFinishScreen();
console.log('PASS: neutral first pass, endpoint finish, hide-to-reverse glide, continuous reverse state, re-arm, scrollable completed restore state (DOM adapter only)');
