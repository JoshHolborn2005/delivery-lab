// 2D geometry helpers. Points are { x, y } in height-normalised image units
// (both axes divided by the video height, y pointing down).

export const deg = (r) => (r * 180) / Math.PI;
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Interior angle at b (degrees, 0–180) formed by a-b-c. 180 = straight. */
export function angle3(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (!d) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / d))));
}

/**
 * Signed angle (degrees) of vector v away from vertical-up.
 * Positive when v leans towards +x * sx (sx = +1 or -1 picks which way counts as positive).
 */
export function fromVertical(v, sx = 1) {
  return deg(Math.atan2(v.x * sx, -v.y));
}

/** Angle of a line from horizontal, folded into 0–90°. */
export function tiltFromHorizontal(v) {
  let a = Math.abs(deg(Math.atan2(v.y, v.x)));
  if (a > 90) a = 180 - a;
  return a;
}
