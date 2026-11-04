/** Stable application contract; variant presenters and lifecycle live in ui/hub/. */
export { initHub, setHubReadiness, setHubPresence, updateHub, renderHub,
  resetHub, prepareLeave, leaveHub, coverHub } from './hub/hubCore.js';
