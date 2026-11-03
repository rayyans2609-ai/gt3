/**
 * Theatre.js animation authoring -- DEV-ONLY, opt-in, isolated. See ARCHITECTURE.md
 * "Animation authoring (Theatre.js)".
 *
 * Loaded only from main.js behind `import.meta.env.DEV && ?theatre`, so none of this (nor
 * @theatre/core / @theatre/studio) reaches the production bundle. Never import it statically.
 *
 *   ?theatre        Studio UI + the proof sheet (author keyframes visually)
 *   ?theatre=play   core only, no Studio: loads the saved JSON and loops it (proves replay)
 *
 * Contract with the rest of GT3:
 *  - No renderer, no scene change: the proof drives an OFF-SCENE probe Object3D.
 *  - Theatre ticks from GT3's single frame loop through a custom rafDriver (registerUpdate);
 *    this module never calls requestAnimationFrame. (Studio's own UI chrome uses Theatre's
 *    default raf; it renders no GT3 content.)
 *  - Timeline state lives in versioned JSON in the repo, never in localStorage
 *    (usePersistentStorage: false). Exporting is explicit: toolbar "GT3 timeline" or exportJSON().
 *  - GSAP keeps owning UI/DOM/state-driven motion. Theatre owns hand-authored, scrubbable curves.
 */

import * as THREE from 'three';
import { createRafDriver, getProject, types } from '@theatre/core';
import { TimelineFileError, timelineFileName, unwrapTimeline, wrapTimeline } from './timelineFile.js';

export const PROJECT_ID = 'gt3-proof';
const SHEET_ID = 'proof';
const OBJECT_ID = 'Proof probe';
const SAVE_ENDPOINT = '/__theatre/save';
const TheatreVersion = '0.7.2'; // recorded in the file; @theatre/core and /studio are versioned together
// Resolved by Vite at dev time; a missing file simply yields an empty project.
const timelineModules = import.meta.glob('./timelines/*.json', { import: 'default' });

/**
 * Bind an Object3D's transform to a Theatre sheet object. Reusable by future authored sequences.
 * Rotation is authored in degrees. Callers must make sure nothing else writes the same
 * properties in the same frame (animation ownership): bind only objects GT3 does not drive.
 */
export function bindObject3D(sheet, name, object3d, driver) {
  const obj = sheet.object(name, {
    position: { x: types.number(0, { nudgeMultiplier: 0.1 }), y: types.number(0, { nudgeMultiplier: 0.1 }),
      z: types.number(0, { nudgeMultiplier: 0.1 }) },
    rotationDeg: { x: types.number(0), y: types.number(0), z: types.number(0) },
    scale: types.number(1, { range: [0.01, 10], nudgeMultiplier: 0.01 }),
  });
  const apply = (v) => {
    object3d.position.set(v.position.x, v.position.y, v.position.z);
    object3d.rotation.set(THREE.MathUtils.degToRad(v.rotationDeg.x), THREE.MathUtils.degToRad(v.rotationDeg.y),
      THREE.MathUtils.degToRad(v.rotationDeg.z));
    object3d.scale.setScalar(v.scale);
  };
  const stop = obj.onValuesChange(apply, driver);
  return { obj, stop };
}

async function loadSavedState(projectId) {
  const key = `./timelines/${timelineFileName(projectId)}`;
  const load = timelineModules[key];
  if (!load) return { state: undefined, source: 'empty' };
  try {
    return { state: unwrapTimeline(await load(), projectId), source: key };
  } catch (error) {
    if (!(error instanceof TimelineFileError)) throw error;
    console.warn(`[gt3:theatre] ignoring ${key}: ${error.message}`);
    return { state: undefined, source: `invalid:${error.message}` };
  }
}

export async function initTheatre({ registerUpdate, mode = 'studio' }) {
  if (!import.meta.env.DEV) return null; // belt and braces; main.js already gates the import
  const withStudio = mode !== 'play';
  const driver = createRafDriver({ name: 'gt3-main-loop' });
  const stats = { ticks: 0 }; // frames in which GT3's loop ticked Theatre (proves loop ownership)
  const stopTick = registerUpdate(() => { stats.ticks++; driver.tick(performance.now()); });

  const { state, source } = await loadSavedState(PROJECT_ID);
  const project = getProject(PROJECT_ID, state ? { state } : undefined);
  const sheet = project.sheet(SHEET_ID);
  const probe = new THREE.Object3D(); // deliberately NOT added to any scene
  probe.name = 'theatre-proof-probe';
  const { obj } = bindObject3D(sheet, OBJECT_ID, probe, driver);

  const api = {
    project, sheet, obj, probe, driver, stats, source, studio: null, ready: false,
    play: (opts = {}) => sheet.sequence.play({ rafDriver: driver, iterationCount: Infinity, ...opts }),
    pause: () => sheet.sequence.pause(),
    seek: (seconds) => { sheet.sequence.position = seconds; },
    /** Theatre state wrapped in the versioned file format. Requires Studio (it owns the history). */
    exportJSON() {
      if (!api.studio) throw new Error('exportJSON needs Studio (?theatre)');
      return wrapTimeline(PROJECT_ID, api.studio.createContentOfSaveFile(PROJECT_ID), TheatreVersion);
    },
    /** POST the export to the dev server, which writes src/authoring/timelines/<id>.v1.json. */
    async saveToRepo() {
      const response = await fetch(SAVE_ENDPOINT, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gt3-theatre': '1' },
        body: JSON.stringify(api.exportJSON()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `save failed (${response.status})`);
      console.info('[gt3:theatre] saved', result.saved);
      return result;
    },
    downloadJSON() {
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(api.exportJSON(), null, 2)}\n`],
        { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: timelineFileName(PROJECT_ID) }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    dispose() { stopTick(); },
  };
  window.__gt3 = window.__gt3 || {};
  window.__gt3.theatre = api;

  // `project.ready` resolves only once Studio has initialised or a saved state was provided.
  if (withStudio) { await startStudio(api); await project.ready; }
  else if (state) { await project.ready; api.play(); }
  else console.warn(`[gt3:theatre] play mode: no saved timeline for ${PROJECT_ID}; nothing to play`);
  api.ready = true;
  console.info(`[gt3:theatre] ${withStudio ? 'studio' : 'play'} ready; timeline source: ${source}`);
  return api;
}

async function startStudio(api) {
  blockStudioUpdateCheck();
  const { default: studio } = await import('@theatre/studio');
  // No localStorage: the repo JSON is the single source of truth; edits live in memory until saved.
  studio.initialize({ usePersistentStorage: false });
  api.studio = studio;
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const saveIcon = svg('M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7'); // floppy: write to repo
  const downloadIcon = svg('M12 3v12m0 0l-4-4m4 4l4-4M5 21h14'); // arrow: browser download
  studio.extend({
    id: 'gt3-timeline',
    toolbars: {
      global(set) {
        set([
          { type: 'Icon', title: 'GT3: save timeline JSON to the repo (src/authoring/timelines)', svgSource: saveIcon,
            onClick: () => api.saveToRepo().catch((e) => console.error('[gt3:theatre] save failed', e)) },
          { type: 'Icon', title: 'GT3: download timeline JSON', svgSource: downloadIcon,
            onClick: () => api.downloadJSON() },
        ]);
        return () => {};
      },
    },
  });
  studio.setSelection([api.obj]);
  shieldGameInput();
}

/**
 * Studio 0.7.2 polls https://updates.theatrejs.com forever (no option to disable it). It is a
 * third-party call from a dev tool and, from localhost, a CORS console error. Reject just that URL
 * locally (no request leaves the browser); every other fetch passes through untouched.
 */
function blockStudioUpdateCheck() {
  if (window.fetch.__gt3BlocksTheatreUpdates) return;
  const nativeFetch = window.fetch.bind(window);
  const guarded = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (url.startsWith('https://updates.theatrejs.com/')) {
      return Promise.reject(new TypeError('theatre update check disabled by GT3'));
    }
    return nativeFetch(input, init);
  };
  guarded.__gt3BlocksTheatreUpdates = true;
  window.fetch = guarded;
}

/**
 * Studio needs wheel/touch/keys for its panels. GT3's scroll owner listens on window (bubble), so
 * stop those events at Studio's root and Studio input never drives the route or the audio.
 */
function shieldGameInput() {
  let tries = 0;
  const attach = () => {
    const root = document.getElementById('theatrejs-studio-root');
    if (!root) { if (++tries < 50) setTimeout(attach, 100); return; }
    for (const type of ['wheel', 'touchmove', 'keydown', 'keyup']) {
      root.addEventListener(type, (event) => event.stopPropagation());
    }
  };
  attach();
}
