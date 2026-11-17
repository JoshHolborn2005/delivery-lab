// Cleaning pipeline for raw pose tracks:
//   1. fill short tracking gaps by interpolation
//   2. fix frames where the tracker swapped left/right labels
//   3. make sure the bowling arm is labelled correctly for the whole clip
//   4. light temporal smoothing
//   5. estimate the bowler's body height in the image for every frame (used to normalise distances)

import { NJ, J, other, armSide, FLIP_GROUPS, LR_PAIRS } from './landmarks.js';
import { dist } from './geometry.js';
import { medianOf } from './series.js';

// Segment length as a fraction of standing height (Winter, Biomechanics and Motor Control of Human Movement).
const LEG_FRACTION = 0.491;   // thigh + shank (hip joint to ankle)
const TRUNK_FRACTION = 0.288; // hip joint to shoulder joint

export function cleanSeries(s, meta = {}) {
  interpolateGaps(s, Math.max(3, s.framesFor(0.06)));
  correctFlips(s);
  fixHandedness(s, meta.arm || 'right');
  const hw = Math.max(0, Math.round(0.01 * s.fps));
  if (hw > 0) smooth(s, hw);
  computeScale(s);
  return s;
}

export function interpolateGaps(s, maxGap) {
  let last = -1;
  for (let i = 0; i < s.n; i++) {
    if (!s.has(i)) continue;
    if (last >= 0 && i - last > 1 && i - last - 1 <= maxGap) {
      for (let j = last + 1; j < i; j++) {
        const f = (j - last) / (i - last);
        lerpFrame(s.lm, 4, last, i, j, f);
        lerpFrame(s.world, 3, last, i, j, f);
      }
    }
    last = i;
  }
}

function lerpFrame(arr, stride, a, b, j, f) {
  const oa = a * NJ * stride, ob = b * NJ * stride, oj = j * NJ * stride;
  for (let q = 0; q < NJ * stride; q++) arr[oj + q] = arr[oa + q] + (arr[ob + q] - arr[oa + q]) * f;
}

/** Predict where landmark k should be in frame i from the two previous (already corrected) frames. */
function predict(s, i, k) {
  const a = s.p(i - 1, k);
  if (i - 2 >= 0 && s.has(i - 2)) {
    const b = s.p(i - 2, k);
    return { x: a.x + 0.7 * (a.x - b.x), y: a.y + 0.7 * (a.y - b.y) };
  }
  return a;
}

export function correctFlips(s) {
  let swaps = 0;
  for (const pairs of Object.values(FLIP_GROUPS)) {
    for (let i = 1; i < s.n; i++) {
      if (!s.has(i) || !s.has(i - 1)) continue;
      let keep = 0, swap = 0;
      for (const [a, b] of pairs) {
        const pa = predict(s, i, a), pb = predict(s, i, b);
        const A = s.p(i, a), B = s.p(i, b);
        keep += dist(A, pa) + dist(B, pb);
        swap += dist(B, pa) + dist(A, pb);
      }
      if (swap < 0.6 * keep && keep - swap > 0.02 * pairs.length) {
        for (const [a, b] of pairs) s.swapPair(i, a, b);
        swaps++;
      }
    }
  }
  if (swaps) s.notes.push(`Corrected ${swaps} left/right tracking swaps.`);
}

/**
 * The bowling arm's wrist should reach the highest point (at release), and it should peak *after* the
 * front arm does. If the other arm clearly does both, the tracker has the whole clip mirrored.
 */
export function fixHandedness(s, arm) {
  const b = armSide(arm), nb = other(b);
  let maxB = -Infinity, tB = -1, maxN = -Infinity, tN = -1;
  const trunk = [];
  for (let i = 0; i < s.n; i++) {
    if (!s.has(i)) continue;
    const hb = s.p(i, J(b, 'sh')).y - s.p(i, J(b, 'wr')).y;
    const hn = s.p(i, J(nb, 'sh')).y - s.p(i, J(nb, 'wr')).y;
    if (hb > maxB) { maxB = hb; tB = i; }
    if (hn > maxN) { maxN = hn; tN = i; }
    trunk.push(dist(s.p(i, J('L', 'sh')), s.p(i, J('L', 'hip'))));
  }
  const tl = medianOf(trunk) || 0.2;
  if (maxN > maxB + 0.3 * tl && tN > tB) {
    for (let i = 0; i < s.n; i++) for (const [a, c] of LR_PAIRS) s.swapPair(i, a, c);
    s.labelsSwapped = true;
    s.notes.push('The tracker had left and right mirrored for this clip. Corrected using the bowling arm.');
  }
}

export function smooth(s, hw) {
  const src = Float32Array.from(s.lm), srcW = Float32Array.from(s.world);
  for (let i = 0; i < s.n; i++) {
    if (!s.has(i)) continue;
    for (let k = 0; k < NJ; k++) {
      for (let q = 0; q < 3; q++) {
        let sum = 0, sumW = 0, c = 0;
        for (let d = -hw; d <= hw; d++) {
          const j = i + d;
          if (!s.has(j)) continue;
          sum += src[(j * NJ + k) * 4 + q];
          sumW += srcW[(j * NJ + k) * 3 + q];
          c++;
        }
        s.lm[(i * NJ + k) * 4 + q] = sum / c;
        s.world[(i * NJ + k) * 3 + q] = sumW / c;
      }
    }
  }
}

/** Body height (in video-height units) for every frame, from the less-foreshortened of legs/trunk. */
export function computeScale(s) {
  const raw = new Float32Array(s.n).fill(NaN);
  for (let i = 0; i < s.n; i++) {
    if (!s.has(i)) continue;
    const leg = (side) => dist(s.p(i, J(side, 'hip')), s.p(i, J(side, 'knee'))) + dist(s.p(i, J(side, 'knee')), s.p(i, J(side, 'ank')));
    const legH = Math.max(leg('L'), leg('R')) / LEG_FRACTION;
    const trunkL = dist(mid2(s.p(i, 11), s.p(i, 12)), mid2(s.p(i, 23), s.p(i, 24)));
    raw[i] = Math.max(legH, trunkL / TRUNK_FRACTION);
  }
  const hw = s.framesFor(0.1);
  for (let i = 0; i < s.n; i++) {
    const win = [];
    for (let j = i - hw; j <= i + hw; j++) if (j >= 0 && j < s.n && Number.isFinite(raw[j])) win.push(raw[j]);
    s.scale[i] = win.length ? medianOf(win) : NaN;
  }
  // Fill any remaining gaps with the clip median so downstream maths never divides by NaN.
  const fallback = medianOf(Array.from(s.scale).filter(Number.isFinite)) || 0.5;
  for (let i = 0; i < s.n; i++) if (!Number.isFinite(s.scale[i])) s.scale[i] = fallback;
}

const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
