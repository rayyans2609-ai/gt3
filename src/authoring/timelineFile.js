/**
 * Versioned on-disk format for Theatre.js timelines (dev authoring tool; see ARCHITECTURE.md
 * "Animation authoring"). Pure data helpers: no Theatre, Three or DOM, so node can import them.
 *
 * File: src/authoring/timelines/<projectId>.v<version>.json
 *   { format: 'gt3-theatre-timeline', version: 1, projectId, theatre: '<studio version>', state }
 * `state` is exactly what `studio.createContentOfSaveFile(projectId)` returns and what
 * `getProject(id, { state })` accepts. It is opaque to GT3: never hand-edit it.
 *
 * Bump TIMELINE_VERSION only when this wrapper changes. A Theatre state-format upgrade is
 * handled by Theatre itself on load; the `theatre` field records which version wrote the file.
 */

export const TIMELINE_FORMAT = 'gt3-theatre-timeline';
export const TIMELINE_VERSION = 1;
export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export class TimelineFileError extends Error {}

export function timelineFileName(projectId, version = TIMELINE_VERSION) {
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new TimelineFileError(`bad project id: ${projectId}`);
  return `${projectId}.v${version}.json`;
}

export function wrapTimeline(projectId, state, theatreVersion = 'unknown') {
  timelineFileName(projectId);
  if (!state || typeof state !== 'object') throw new TimelineFileError('state must be an object');
  return { format: TIMELINE_FORMAT, version: TIMELINE_VERSION, projectId, theatre: theatreVersion, state };
}

/** Validate a parsed file and return its Theatre state. Throws TimelineFileError with the reason. */
export function unwrapTimeline(file, expectedProjectId) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new TimelineFileError('not an object');
  if (file.format !== TIMELINE_FORMAT) throw new TimelineFileError(`unknown format: ${file.format}`);
  if (file.version !== TIMELINE_VERSION) {
    throw new TimelineFileError(`unsupported version ${file.version} (this build reads ${TIMELINE_VERSION})`);
  }
  if (expectedProjectId && file.projectId !== expectedProjectId) {
    throw new TimelineFileError(`project id ${file.projectId} does not match ${expectedProjectId}`);
  }
  if (!file.state || typeof file.state !== 'object' || Array.isArray(file.state)) {
    throw new TimelineFileError('missing state');
  }
  return file.state;
}
