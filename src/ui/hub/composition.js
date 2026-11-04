/**
 * composition.js — screen-space composition helpers shared by the Hub presenters.
 *
 * `infieldPoint` finds where START RACE belongs: the most open place INSIDE the circuit's projected
 * loop (the infield's negative space) for a box of the title's actual size, pulled gently toward the
 * loop's horizontal centre and optically above its vertical centre. Points in concave notches outside
 * the loop never qualify, and the whole title box must clear the road edges. Pure geometry on
 * projected screen points; called only on layout/resize, never per animation frame.
 */

function inside(point, loop) {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Distance from a point to an axis-aligned rectangle (0 when inside it). */
function toRect(p, r) {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  return Math.hypot(dx, dy);
}

/**
 * @param {{x:number,y:number}[]} centre projected centreline (closed loop)
 * @param {{x:number,y:number}[]} edges projected road edges (left and right)
 * @param {{box?:{width:number,height:number}, lift?:number, step?:number}} options
 *   box = the title's size in px; lift = fraction of the loop height to raise the result
 * @returns {{x:number,y:number,clearance:number}|null} the box centre
 */
export function infieldPoint(centre, edges, { box = { width: 0, height: 0 }, lift = 0.05, step = 22 } = {}) {
  const valid = centre.filter(Boolean);
  const loop = valid.filter((_, i) => i % 4 === 0);
  const rim = edges.filter(Boolean).filter((_, i) => i % 8 === 0);
  if (loop.length < 3 || !rim.length) return null;
  const minX = Math.min(...valid.map(p => p.x)), maxX = Math.max(...valid.map(p => p.x));
  const minY = Math.min(...valid.map(p => p.y)), maxY = Math.max(...valid.map(p => p.y));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, hw = box.width / 2, hh = box.height / 2;
  const liftPx = (maxY - minY) * lift;
  let best = null;
  for (let y = minY + hh; y <= maxY - hh; y += step) {
    for (let x = minX + hw; x <= maxX - hw; x += step) {
      const ty = y - liftPx; // where the box will actually sit
      const rect = { left: x - hw, right: x + hw, top: ty - hh, bottom: ty + hh };
      const corners = [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top },
        { x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.bottom }, { x, y: ty }];
      if (!corners.every(p => inside(p, loop))) continue;
      let clearance = Infinity;
      for (const p of rim) { const d = toRect(p, rect); if (d < clearance) clearance = d; }
      const score = clearance - Math.abs(x - cx) * 0.04 - Math.max(0, ty - cy) * 0.12;
      if (!best || score > best.score) best = { x, y: ty, score, clearance };
    }
  }
  if (best) return { x: best.x, y: best.y, clearance: best.clearance };
  // The title is wider than any infield gap at this size: fall back to the loop's own centre.
  return { x: cx, y: cy - liftPx, clearance: 0 };
}
