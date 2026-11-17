// PoseSeries wraps the raw per-frame landmark arrays produced by the pose tracker.
// It never mutates the stored pose: it works on copies so cleaning can be re-run.

import { NJ } from './landmarks.js';

export class PoseSeries {
  /**
   * @param pose  { n, times (video s), lm: Float32Array(n*33*4) normalised x,y,z,vis, world: Float32Array(n*33*3) metres, width, height }
   * @param meta  { slowFactor } — how many times slower than real life the clip plays (1, 4, 8 ...)
   */
  constructor(pose, meta = {}) {
    this.n = pose.n;
    this.slow = meta.slowFactor || 1;
    this.vtimes = Float64Array.from(pose.times);
    this.times = this.vtimes.map((t) => t / this.slow); // real-world seconds
    this.lm = Float32Array.from(pose.lm);
    this.world = Float32Array.from(pose.world);
    this.width = pose.width;
    this.height = pose.height;
    this.aspect = pose.width / pose.height;
    const dur = this.n > 1 ? this.times[this.n - 1] - this.times[0] : 0;
    this.fps = dur > 0 ? (this.n - 1) / dur : 30; // real-time samples per second
    this.scale = new Float32Array(this.n).fill(NaN); // body height per frame (height units)
    this.notes = [];
  }

  /** Is landmark k present in frame i (defaults to a hip, i.e. is there a pose at all)? */
  has(i, k = 23) {
    return i >= 0 && i < this.n && !Number.isNaN(this.lm[(i * NJ + k) * 4]);
  }

  /** Image position of landmark k at frame i, both axes in units of video height. */
  p(i, k) {
    const o = (i * NJ + k) * 4;
    return { x: this.lm[o] * this.aspect, y: this.lm[o + 1], v: this.lm[o + 3] };
  }

  /** World (metric, hip-centred) position of landmark k at frame i. */
  w(i, k) {
    const o = (i * NJ + k) * 3;
    return { x: this.world[o], y: this.world[o + 1], z: this.world[o + 2] };
  }

  t(i) { return this.times[i]; }

  frameAtTime(realT) { return nearest(this.times, realT); }
  frameAtVideoTime(vt) { return nearest(this.vtimes, vt); }

  framesFor(seconds) { return Math.max(1, Math.round(seconds * this.fps)); }

  swapPair(i, a, b) {
    const oa = (i * NJ + a) * 4, ob = (i * NJ + b) * 4;
    for (let q = 0; q < 4; q++) { const t = this.lm[oa + q]; this.lm[oa + q] = this.lm[ob + q]; this.lm[ob + q] = t; }
    const wa = (i * NJ + a) * 3, wb = (i * NJ + b) * 3;
    for (let q = 0; q < 3; q++) { const t = this.world[wa + q]; this.world[wa + q] = this.world[wb + q]; this.world[wb + q] = t; }
  }

  validFraction() {
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.has(i)) c++;
    return this.n ? c / this.n : 0;
  }

  /** Median body scale over a frame range (clamped). */
  scaleBetween(i0, i1) {
    const a = [];
    for (let i = Math.max(0, i0); i <= Math.min(this.n - 1, i1); i++) if (Number.isFinite(this.scale[i])) a.push(this.scale[i]);
    if (!a.length) return medianOf(Array.from(this.scale).filter(Number.isFinite)) || 0.5;
    return medianOf(a);
  }
}

function nearest(arr, t) {
  let lo = 0, hi = arr.length - 1;
  if (hi < 0) return -1;
  if (t <= arr[0]) return 0;
  if (t >= arr[hi]) return hi;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) lo = m; else hi = m;
  }
  return t - arr[lo] <= arr[hi] - t ? lo : hi;
}

export function medianOf(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
