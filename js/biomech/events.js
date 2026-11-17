// Key-event detection for a fast-bowling delivery:
//   BR  — ball release (proxy: bowling wrist at its highest point relative to the shoulder)
//   FFC — front-foot contact (start of the front foot's final stance before release)
//   BFC — back-foot contact (start of the back foot's stance before FFC)
// Foot contact = the foot (ankle/heel/toe centroid) becomes stationary in the image.
// All detections can be overridden by the coach in the UI.

import { J, other, armSide, FLIP_GROUPS } from './landmarks.js';
import { dist } from './geometry.js';
import { medianOf } from './series.js';

// Foot "planted" speed thresholds, in body-heights per second. The back foot pivots and drags,
// so it gets a little more allowance. Front-on footage needs lower thresholds: the bowler runs
// towards the camera, so a foot in the air moves much less across the image than it does side-on.
const THRESH = {
  side: { front: 1.0, back: 1.4 },
  front: { front: 0.5, back: 0.7 },
};

export const EVENT_KEYS = ['bfc', 'ffc', 'br'];
export const EVENT_LABELS = { bfc: 'Back-foot contact', ffc: 'Front-foot contact', br: 'Release' };
export const EVENT_SHORT = { bfc: 'BFC', ffc: 'FFC', br: 'BR' };

/** Foot speed in body-heights per (real) second, using a ~30 ms central difference. */
export function footSpeed(s, side) {
  const k = Math.max(1, Math.round(0.015 * s.fps));
  const speed = new Float32Array(s.n).fill(NaN);
  const c = (i) => {
    const a = s.p(i, J(side, 'ank')), h = s.p(i, J(side, 'heel')), f = s.p(i, J(side, 'foot'));
    return { x: (a.x + h.x + f.x) / 3, y: (a.y + h.y + f.y) / 3 };
  };
  for (let i = 0; i < s.n; i++) {
    const i0 = Math.max(0, i - k), i1 = Math.min(s.n - 1, i + k);
    if (i1 === i0 || !s.has(i0) || !s.has(i1)) continue;
    const dt = s.times[i1] - s.times[i0];
    if (dt <= 0) continue;
    speed[i] = dist(c(i0), c(i1)) / dt / s.scale[i];
  }
  return { speed, k };
}

function footCentroid(s, side, i) {
  const a = s.p(i, J(side, 'ank')), h = s.p(i, J(side, 'heel')), f = s.p(i, J(side, 'foot'));
  return { x: (a.x + h.x + f.x) / 3, y: (a.y + h.y + f.y) / 3 };
}

/**
 * Pin down the exact contact frame. `j` is a frame inside the stance (found from the speed signal,
 * which lags because it is a central difference). Contact = first frame where the foot is already
 * at its planted position (within `eps` body heights).
 */
function refineContact(s, side, j, eps = 0.02) {
  const end = Math.min(s.n - 1, j + s.framesFor(0.04));
  const xs = [], ys = [];
  for (let q = j; q <= end; q++) if (s.has(q)) { const c = footCentroid(s, side, q); xs.push(c.x); ys.push(c.y); }
  if (!xs.length) return j;
  const ref = { x: medianOf(xs), y: medianOf(ys) };
  const off = (q) => dist(footCentroid(s, side, q), ref) / s.scale[q];
  const lim = Math.max(0, j - s.framesFor(0.06));
  let q = j;
  while (q - 1 >= lim && s.has(q - 1) && off(q - 1) < eps) q--;
  while (q < end && off(q) >= eps) q++;
  return q;
}

function medianAround(arr, i, hw = 2) {
  const a = [];
  for (let j = i - hw; j <= i + hw; j++) if (j >= 0 && j < arr.length && Number.isFinite(arr[j])) a.push(arr[j]);
  return a.length ? medianOf(a) : NaN;
}

export function detectEvents(s, meta) {
  const arm = armSide(meta.arm);
  const warnings = [];
  const conf = {};
  const th = THRESH[meta.view] || THRESH.side;

  // --- Ball release ---------------------------------------------------------
  let br = -1, best = -Infinity;
  for (let i = 0; i < s.n; i++) {
    if (!s.has(i)) continue;
    const h = (s.p(i, J(arm, 'sh')).y - s.p(i, J(arm, 'wr')).y) / s.scale[i];
    if (h > best) { best = h; br = i; }
  }
  if (br < 0) return null;
  conf.br = best > 0.12 ? 'auto' : 'estimated';
  if (conf.br === 'estimated') warnings.push('The bowling arm never clearly went above the shoulder. Check the release frame.');

  // --- Which foot is the front foot? -------------------------------------------
  // A pace bowler lands on the foot opposite the bowling arm. If the tracker has the legs
  // labelled the other way round, swap the leg labels for the whole clip.
  let sp = { L: footSpeed(s, 'L'), R: footSpeed(s, 'R') };
  const expectedFront = other(arm);
  const vF = medianAround(sp[expectedFront].speed, br), vB = medianAround(sp[other(expectedFront)].speed, br);
  if (Number.isFinite(vF) && Number.isFinite(vB) && vB < 0.5 * vF && vB < th.front) {
    for (let i = 0; i < s.n; i++) for (const [a, b] of FLIP_GROUPS.legs) s.swapPair(i, a, b);
    sp = { L: sp.R, R: sp.L };
    s.notes.push('Leg labels were swapped by the tracker. Corrected using the planted front foot.');
  }
  const front = expectedFront, back = other(front);
  const fS = sp[front].speed, bS = sp[back].speed;

  // --- Front-foot contact --------------------------------------------------------
  let ffc = null;
  let j = br;
  if (!(fS[j] < th.front)) {
    j = -1;
    for (let q = br; q >= Math.max(0, br - s.framesFor(0.15)); q--) if (fS[q] < th.front) { j = q; break; }
  }
  if (j >= 0) {
    const lim = Math.max(0, br - s.framesFor(0.45));
    while (j - 1 >= lim && fS[j - 1] < th.front) j--;
    if (j > lim) { ffc = refineContact(s, front, j); conf.ffc = 'auto'; }
  }
  if (ffc == null || ffc >= br || s.times[br] - s.times[ffc] > 0.4) {
    ffc = Math.max(0, s.frameAtTime(s.times[br] - 0.12));
    conf.ffc = 'estimated';
    warnings.push('Front-foot contact could not be found clearly. Using an estimate; check and adjust it.');
  }

  // --- Back-foot contact ----------------------------------------------------------
  let bfc = null;
  const lim2 = Math.max(0, ffc - s.framesFor(0.6));
  let q = ffc - 1;
  while (q >= lim2 && !(bS[q] < th.back)) q--;
  if (q >= lim2) {
    while (q - 1 >= lim2 && bS[q - 1] < th.back) q--;
    if (q > lim2) { bfc = refineContact(s, back, q); conf.bfc = 'auto'; }
  }
  const gap = bfc != null ? s.times[ffc] - s.times[bfc] : NaN;
  if (bfc == null || !(gap >= 0.06 && gap <= 0.5)) {
    bfc = Math.max(0, s.frameAtTime(s.times[ffc] - 0.2));
    conf.bfc = 'estimated';
    warnings.push('Back-foot contact could not be found clearly. Using an estimate; check and adjust it.');
  }
  if (bfc === 0 && s.times[ffc] - s.times[0] < 0.1) warnings.push('The clip starts too late. Include the last few run-up strides before back-foot contact.');

  return { bfc, ffc, br, frontSide: front, backSide: back, conf, warnings };
}

/** Apply coach overrides (frame indices) on top of automatic detections. */
export function mergeManual(auto, manual = {}, n = Infinity) {
  const ev = { ...auto, conf: { ...auto.conf } };
  for (const key of EVENT_KEYS) {
    const v = manual?.[key];
    if (Number.isInteger(v) && v >= 0 && v < n) { ev[key] = v; ev.conf[key] = 'manual'; }
  }
  return ev;
}

export function eventOrderProblem(ev) {
  if (!ev) return null;
  if (!(ev.bfc < ev.ffc && ev.ffc <= ev.br)) return 'Events are out of order: back-foot contact should come before front-foot contact, then release.';
  return null;
}
