/**
 * audioLevels.js — the Master / Music / Engine level sliders, shared by the Hub player and the
 * compact global player (SPEC §7, §31; owner clarification 2026-11-04: Music and Engine are
 * separate and independent). Levels are session state; mutes stay separate (SPEC §8), so a
 * slider never mutes and a mute never moves a slider. Setting a level never starts audio.
 */

import { setEngineVolume, setMasterVolume, setMusicVolume } from '../audio/audioManager.js';
import { state, subscribe } from '../core/state.js';

const LEVELS = Object.freeze([
  { key: 'masterVolume', name: 'Master', label: 'Master volume', set: setMasterVolume },
  { key: 'musicVolume', name: 'Music', label: 'Music volume', set: setMusicVolume },
  // Engine is heard only in the Grand Tour (SPEC §10); elsewhere it sets the next drive's level.
  { key: 'engineVolume', name: 'Engine', label: 'Engine volume', set: setEngineVolume },
]);

/**
 * Build one group of level rows. `prefix` names the BEM block (e.g. 'hub-level'); every input
 * also carries `rangeClass` so each player styles it like its own seek bar.
 */
export function buildLevels({ className, prefix, rangeClass }) {
  const group = document.createElement('div');
  group.className = className;
  for (const def of LEVELS) {
    const row = document.createElement('label');
    row.className = prefix;
    const name = document.createElement('span');
    name.className = `${prefix}__name`;
    name.textContent = def.name;
    const input = document.createElement('input');
    input.type = 'range';
    input.className = `${rangeClass} ${prefix}__input`;
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.setAttribute('aria-label', def.label);
    const sync = (value) => {
      if (Number(input.value) !== value) input.value = String(value);
      input.style.setProperty('--fill', String(value));
    };
    sync(state[def.key]);
    input.addEventListener('input', () => {
      input.style.setProperty('--fill', input.value);
      def.set(Number(input.value));
    });
    subscribe(def.key, sync);
    row.append(name, input);
    group.append(row);
  }
  return group;
}
