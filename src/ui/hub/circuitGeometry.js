/** Pure road-space data. Match the asphalt mesh's 1.1 m rings, without importing its builder. */
import { TRACK_LENGTH, CHECKPOINT_ROUTE_T, GRID_T, offsetPointAt, routeTAt } from '../../scene/trackCurve.js';
import { asphaltEdgeAt, surfaceOffsetAt } from '../../scene/trackProfile.js';

export const CIRCUIT_SEGMENTS = Math.ceil(TRACK_LENGTH / 1.1);
export function roadPoint(t, lateral = 0) {
  // The rendered asphalt uses Float32BufferAttributes; use its world-coordinate precision.
  return offsetPointAt(t, lateral, surfaceOffsetAt(t, lateral)).toArray().map(Math.fround);
}
export function routePosition(progress) {
  const t = routeTAt(progress);
  const position = roadPoint(t);
  const ahead = roadPoint((t + 0.00002) % 1);
  return { t, position, ahead, heading: Math.atan2(ahead[0] - position[0], -(ahead[2] - position[2])) };
}
export function buildCircuitGeometry(segments = CIRCUIT_SEGMENTS) {
  const left = [], right = [], centre = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    left.push(roadPoint(t, asphaltEdgeAt(t, 1)));
    right.push(roadPoint(t, asphaltEdgeAt(t, -1)));
    centre.push(roadPoint(t));
  }
  const cross = t => [roadPoint(t, asphaltEdgeAt(t, -1)), roadPoint(t, asphaltEdgeAt(t, 1))];
  return { segments, left, right, centre,
    checkpoints: CHECKPOINT_ROUTE_T.map((t, i) => ({ t, carIndex: i + 1,
      position: roadPoint(t), tick: [roadPoint(t, asphaltEdgeAt(t, -1) - 9), roadPoint(t, asphaltEdgeAt(t, 1) + 9)] })),
    start: cross(0), grid: cross(GRID_T), gridPosition: routePosition(0),
  };
}
