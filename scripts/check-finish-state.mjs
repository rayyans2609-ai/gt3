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
const tail=await import('../src/scroll/finishTail.js');
finish.initFinishScreen();
// V1 finish mechanics (restored 2026-10-13): run-out past the gantry, completion at +5 m, lock.
assert.ok(Math.abs(tail.FINISH_PAST_LINE_METERS-5.0068)<1e-3&&Math.abs(tail.FINISH_TAIL_METERS-30.041)<1e-2,'V1 constants');
seekTo(r.FIRST_LINE_PROGRESS+.0001,{instant:true});assert.equal(state.mode,'race','first gantry pass must be neutral');
seekTo(1-1/r.TOUR_LENGTH,{instant:true});assert.equal(state.mode,'race');
seekTo(1,{instant:true});finish.update(0);assert.equal(state.mode,'race','V1 does not complete on the line itself');
set('finishTailMeters',tail.FINISH_PAST_LINE_METERS-.01);finish.update(0);assert.equal(state.mode,'race','completed short of the V1 point');
set('finishTailMeters',tail.FINISH_PAST_LINE_METERS+.4);
assert.equal(state.mode,'finish','V1 completion did not fire past the line');
assert.equal(state.scrollLocked,true,'V1 completion must lock the drive (no coast)');
assert.equal(state.finishAcknowledged,true);
// Replay Route: back to the grid, unlocked, run-out and acknowledgement cleared.
const replay=(function find(n){if(n?.events?.click)return n;for(const c of n?.children||[]){const f=find(c);if(f)return f;}})(root);
assert.ok(replay,'Replay Route control missing');replay.events.click();
assert.equal(state.mode,'race');assert.equal(state.scrollLocked,false);assert.equal(state.progress,0);
assert.equal(state.finishTailMeters,0);assert.equal(state.finishAcknowledged,false);
// Completion re-arms on the next lap and fires once.
seekTo(1,{instant:true});set('finishTailMeters',tail.FINISH_PAST_LINE_METERS);assert.equal(state.mode,'finish','completion did not re-arm');
// Refresh restore: locked completed state, car stood where V1 halts it.
finish.hideFinishScreen();seekTo(.99,{instant:true});set('mode','finish');seekTo(1,{instant:true});finish.restoreFinishScreen();
assert.equal(state.mode,'finish');assert.equal(state.scrollLocked,true);
assert.equal(state.finishTailMeters,tail.FINISH_PAST_LINE_METERS);
finish.disposeFinishScreen();
console.log('PASS: neutral first pass, no completion on/short of the line, V1 completion at +5 m with drive lock, Replay Route reset/unlock, re-arm, locked completed restore (DOM adapter only)');
