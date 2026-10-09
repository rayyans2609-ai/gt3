/** Single cross-section contract. +lateral/+side = LEFT, as offsetPointAt.
 * Racing widths are authored by section purpose, never derived from curvature.
 * All other dimensions are metres, independent of the review hero scale.
 */
import { COMP } from './composition.js';
import { TRACK_LENGTH } from './trackCurve.js';

export const CROSS_SECTION = Object.freeze({
  asphaltY: -0.02, vergeY: -0.03, curbInnerY: -0.02, curbOuterY: 0.08,
  shoulderWidth: 1.5, edgeLineWidth: 0.15, edgeLineInset: 0.20, curbBlockLength: 2.4,
});
export const WIDTH_CLASSES = Object.freeze(['technical', 'ordinary', 'braking', 'start-finish']);
// Boundaries describe class centres; transitions straddle them. The wrapped
// corridor covers the entire 102 m run to the flag AND the start straight/T1.
export const WIDTH_SECTIONS = Object.freeze([
  { from: 0, to: 0.080, classIndex: 3, bias: 0 },
  { from: 0.080, to: 0.234, classIndex: 1, bias: 0 },
  { from: 0.234, to: 0.310, classIndex: 2, bias: -0.8 }, // hairpin approach, extra OUTSIDE
  { from: 0.310, to: 0.400, classIndex: 0, bias: 0 }, // linked technical chicane
  { from: 0.400, to: 0.594, classIndex: 1, bias: 0 },
  { from: 0.594, to: 0.674, classIndex: 2, bias: 0 }, // slowdown 1 braking complex
  { from: 0.674, to: 0.700, classIndex: 1, bias: 0 },
  { from: 0.700, to: 0.768, classIndex: 2, bias: 0 }, // slowdown 2 braking complex
  { from: 0.768, to: 0.954, classIndex: 1, bias: 0 },
  { from: 0.954, to: 1, classIndex: 3, bias: 0 },
].map(Object.freeze));

// Shared corner phases: outside -> apex -> track-out, with deliberate linked
// compromises in the three chicanes. Curbs remain separately designated below.
export const CORNERS = Object.freeze([
  { id: 'turn-1', entry: .028, apex: .056, exit: .091, side: -1, gain: .72 },
  { id: 'turn-2', entry: .097, apex: .123, exit: .137, side: 1, gain: .65, linked: true },
  { id: 'turn-3', entry: .139, apex: .159, exit: .181, side: 1, gain: .76 },
  { id: 'turn-4', entry: .187, apex: .219, exit: .251, side: -1, gain: .85 },
  { id: 'hairpin', entry: .254, apex: .283, exit: .317, side: 1, gain: .9, contact: true },
  { id: 'chicane-in', entry: .320, apex: .337, exit: .350, side: -1, gain: .66, linked: true },
  { id: 'chicane-out', entry: .351, apex: .365, exit: .394, side: 1, gain: .84, contact: true },
  { id: 'turn-8', entry: .399, apex: .420, exit: .434, side: -1, gain: .62, linked: true },
  { id: 'turn-9', entry: .437, apex: .470, exit: .505, side: 1, gain: .82 },
  { id: 'slowdown-1-in', entry: .615, apex: .635, exit: .646, side: -1, gain: .70, linked: true },
  { id: 'slowdown-1-out', entry: .647, apex: .654, exit: .678, side: 1, gain: .83 },
  { id: 'slowdown-2-in', entry: .706, apex: .729, exit: .738, side: 1, gain: .66, linked: true },
  { id: 'slowdown-2-out', entry: .739, apex: .748, exit: .778, side: -1, gain: .84 },
  { id: 'closing-1', entry: .806, apex: .835, exit: .860, side: 1, gain: .50 },
  { id: 'closing-2', entry: .865, apex: .898, exit: .926, side: 1, gain: .55 },
  { id: 'closing-3', entry: .931, apex: .952, exit: .978, side: 1, gain: .72 },
].map(Object.freeze));

export const CURB_SEGMENTS = Object.freeze([
  ['turn-1', .045, .076, -1, 'apex', 1.2],
  ['turn-2-3', .111, .170, 1, 'apex', 1.2],
  ['turn-4', .204, .237, -1, 'apex', 1.2],
  ['hairpin-entry', .244, .262, -1, 'entry', 1.2],
  ['hairpin', .268, .301, 1, 'apex', 1.8],
  ['hairpin-exit', .305, .320, -1, 'exit', 1.2],
  ['chicane-in', .327, .346, -1, 'apex', 1.2],
  ['chicane-out', .355, .381, 1, 'apex', 1.8],
  ['chicane-exit', .382, .397, -1, 'exit', 1.2],
  ['turn-8', .410, .432, -1, 'apex', 1.2],
  ['turn-9', .449, .489, 1, 'apex', 1.2],
  ['slowdown-1-entry', .608, .625, 1, 'entry', 1.2],
  ['slowdown-1-in', .626, .643, -1, 'apex', 1.2],
  ['slowdown-1-out', .648, .663, 1, 'apex', 1.2],
  ['slowdown-1-exit', .666, .681, -1, 'exit', 1.2],
  ['slowdown-2-entry', .701, .717, -1, 'entry', 1.2],
  ['slowdown-2-in', .721, .737, 1, 'apex', 1.2],
  ['slowdown-2-out', .741, .760, -1, 'apex', 1.2],
  ['slowdown-2-exit', .762, .779, 1, 'exit', 1.2],
  ['closing-3', .941, .967, 1, 'apex', 1.2],
].map(([id, from, to, side, phase, width]) => Object.freeze({ id, from, to, side, phase, width })));
export const RUNOFF_REGIONS = Object.freeze([
  { id: 'hairpin-braking', from: .248, to: .315, side: -1, width: 9 },
  { id: 'slowdown-1-braking', from: .610, to: .651, side: 1, width: 8 },
  { id: 'slowdown-2-braking', from: .704, to: .742, side: -1, width: 10 },
].map(Object.freeze));
const wrap = t => ((t % 1) + 1) % 1;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function envelope(t, region, taperM) {
  if (t <= region.from || t >= region.to) return 0;
  const taper = Math.min(taperM / TRACK_LENGTH, (region.to - region.from) / 2);
  return Math.min(smooth((t - region.from) / taper), smooth((region.to - t) / taper));
}
function classValues(section) {
  const width = COMP.widthClasses[section.classIndex];
  // Uniform old proportions remain available as baselines on the same contract.
  const bias = COMP.widthClasses[0] === COMP.widthClasses[3] ? 0 : section.bias;
  return [width / 2 + bias, width / 2 - bias];
}
/** One profile per route position, optionally reused by allocation-sensitive readers. */
export function profileAt(t, out = {}) {
  const u = wrap(t);
  const section = WIDTH_SECTIONS.find(s => u >= s.from && u < s.to);
  let [left, right] = classValues(section);
  for (let i = 1; i < WIDTH_SECTIONS.length; i++) {
    const a = WIDTH_SECTIONS[i - 1], b = WIDTH_SECTIONS[i];
    const av = classValues(a), bv = classValues(b);
    const delta = Math.abs(bv[0] + bv[1] - av[0] - av[1]);
    // smoothstep peak slope 1.5; 30 m per metre total width keeps <= 1:20.
    const lengthM = Math.max(48, delta * 30);
    const halfT = lengthM / (2 * TRACK_LENGTH);
    if (Math.abs(u - b.from) < halfT) {
      const w = smooth((u - b.from + halfT) / (2 * halfT));
      left = av[0] + (bv[0] - av[0]) * w;
      right = av[1] + (bv[1] - av[1]) * w;
      break;
    }
  }
  out.t = u; out.widthClass = WIDTH_CLASSES[section.classIndex];
  out.left = left; out.right = right;
  out.curbLeft = out.curbRight = 0;
  out.curbLeftSegment = out.curbRightSegment = null;
  for (const curb of CURB_SEGMENTS) {
    const w = envelope(u, curb, 8) * curb.width;
    if (w <= 0) continue;
    const key = curb.side === 1 ? 'curbLeft' : 'curbRight';
    if (w > out[key]) { out[key] = w; out[`${key}Segment`] = curb; }
  }
  out.runoffLeft = out.runoffRight = 0;
  for (const region of RUNOFF_REGIONS) {
    const key = region.side === 1 ? 'runoffLeft' : 'runoffRight';
    out[key] = Math.max(out[key], envelope(u, region, 45) * region.width);
  }
  out.shoulder = CROSS_SECTION.shoulderWidth;
  out.outerLeft = left + out.curbLeft + out.shoulder + out.runoffLeft;
  out.outerRight = right + out.curbRight + out.shoulder + out.runoffRight;
  return out;
}
/** Signed edge offsets; infrastructure consumers never need global width. */
export function asphaltEdgeAt(t, side) {
  const p = profileAt(t); return side * (side > 0 ? p.left : p.right);
}
export function outerEdgeAt(t, side) {
  const p = profileAt(t); return side * (side > 0 ? p.outerLeft : p.outerRight);
}
export function gateSpanAt(t, margin = 1) {
  const p = profileAt(t);
  const left = p.left + p.curbLeft + margin;
  const right = p.right + p.curbRight + margin;
  return { left, right, width: left + right, center: (left - right) / 2 };
}
/** Analytic road/curb height, used for tyre support; runoff is not driving surface. */
export function surfaceOffsetAt(t, lateral) {
  const p = profileAt(t), side = lateral >= 0 ? 1 : -1;
  const edge = side > 0 ? p.left : p.right;
  const curb = side > 0 ? p.curbLeft : p.curbRight;
  const segment = side > 0 ? p.curbLeftSegment : p.curbRightSegment;
  const d = Math.abs(lateral) - edge;
  if (d <= 0) return CROSS_SECTION.asphaltY;
  if (curb > 0 && d <= curb) return CROSS_SECTION.curbInnerY
    + (CROSS_SECTION.curbOuterY - CROSS_SECTION.curbInnerY) * d / segment.width;
  return CROSS_SECTION.vergeY;
}
