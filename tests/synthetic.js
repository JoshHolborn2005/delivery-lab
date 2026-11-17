// Synthetic bowling-action generator: builds pose tracks with known event times and joint angles,
// so the biomechanics pipeline can be checked against ground truth.

const NJ = 33;
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, f) => a + (b - a) * f;
const clamp01 = (f) => Math.max(0, Math.min(1, f));
const seg = (t, t0, t1, a, b) => lerp(a, b, clamp01((t - t0) / (t1 - t0)));

function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Two-link IK: knee position for hip→ankle with equal segments, knee bending towards `dir` (+1/-1 in x). */
function knee2D(hip, ank, L, dir) {
  const dx = ank.x - hip.x, dy = ank.y - hip.y, d = Math.hypot(dx, dy);
  const mx = (hip.x + ank.x) / 2, my = (hip.y + ank.y) / 2;
  if (d >= 2 * L) return { x: mx, y: my };
  const h = Math.sqrt(L * L - (d / 2) ** 2);
  // perpendicular to hip→ank
  let px = -dy / d, py = dx / d;
  if (px * dir < 0) { px = -px; py = -py; }
  return { x: mx + px * h, y: my + py * h };
}

function emptyPose(n, width, height) {
  return { n, times: new Float32Array(n), lm: new Float32Array(n * NJ * 4).fill(NaN), world: new Float32Array(n * NJ * 3).fill(0), width, height };
}

function put(pose, i, k, p, aspect, world) {
  const o = (i * NJ + k) * 4;
  pose.lm[o] = p.x / aspect; pose.lm[o + 1] = p.y; pose.lm[o + 2] = 0; pose.lm[o + 3] = 1;
  if (world) { const w = (i * NJ + k) * 3; pose.world[w] = world.x; pose.world[w + 1] = world.y; pose.world[w + 2] = world.z; }
}

export const SIDE_TRUTH = {
  bfc: 0.45, ffc: 0.65, br: 0.77,
  approachSpeed: 5.5, strideLength: 80, frontKneeFFC: 170, frontKneeMin: 156, frontKneeBR: 162,
  trunkFlexFFC: -5, trunkFlexBR: 35,
};

/**
 * Side-on right-arm bowler running left→right.
 * @param opts.fps real frames per second, opts.noise image noise (height units), opts.flipLegsAt frames to mislabel legs
 */
export function makeSideOn({ fps = 240, noise = 0.0015, seed = 1, flipLegs = [], dir = 1 } = {}) {
  const T = SIDE_TRUTH;
  const rng = mulberry(seed);
  const width = 1920, height = 1080, aspect = width / height;
  const dur = 1.15, n = Math.round(dur * fps);
  const pose = emptyPose(n, width, height);
  const Hb = 0.6, G = 0.92;                       // body height & ground line (height units)
  const L = 0.2455 * Hb, Lt = 0.288 * Hb, La = 0.332 * Hb;
  const v = (T.approachSpeed / 1.8) * Hb;          // hip speed in height-units / s
  const x0 = dir > 0 ? 0.15 : aspect - 0.15;
  const hipXAt = (t) => {
    if (t <= T.bfc) return x0 + dir * v * t;
    const tt = Math.min(t, T.br + 0.3) - T.bfc, span = T.br - T.bfc;
    return x0 + dir * (v * T.bfc + v * (tt - (0.5 * tt * tt) / (2 * span)));
  };
  const ankY = G - 0.039 * Hb;
  const xb = hipXAt(T.bfc) + dir * 0.08 * Hb;          // back-foot plant (lands just ahead of the hips)
  const xf = xb + dir * (T.strideLength / 100) * Hb;   // front-foot plant
  const kneeAngle = (t) => (t < T.ffc ? T.frontKneeFFC : t < 0.71 ? seg(t, T.ffc, 0.71, T.frontKneeFFC, T.frontKneeMin) : seg(t, 0.71, T.br, T.frontKneeMin, T.frontKneeBR));
  const legSpan = (th) => Math.sqrt(2 * L * L - 2 * L * L * Math.cos(rad(th)));
  const hipYAt = (t, hx) => {
    const tt = Math.max(t, T.ffc);
    const D = legSpan(kneeAngle(tt));
    const dx = (t < T.ffc ? hipXAt(T.ffc) : hx) - xf;
    return ankY - Math.sqrt(Math.max(1e-6, D * D - dx * dx));
  };

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    pose.times[i] = t;
    const hx = hipXAt(t), hy = hipYAt(t, hx);
    const hipC = { x: hx, y: hy };
    // Feet ------------------------------------------------------------------
    let back, front;
    const arc = (f, h) => -Math.sin(Math.PI * clamp01(f)) * h;
    const hipL = { x: hx, y: hy }, hipR = { x: hx, y: hy }; // hips overlap in a side-on view
    // Airborne feet can never be further from the hip than the leg is long.
    const reach = (foot, hip) => {
      const d = Math.hypot(foot.x - hip.x, foot.y - hip.y), max = 0.999 * 2 * L;
      return d <= max ? foot : { x: hip.x + ((foot.x - hip.x) * max) / d, y: hip.y + ((foot.y - hip.y) * max) / d };
    };
    const backEnd = T.ffc - 0.03;
    if (t < T.bfc) {
      const f = t / T.bfc;
      back = reach({ x: lerp(xb - dir * 0.9 * Hb, xb, f), y: ankY + arc(f, 0.12 * Hb) }, hipR);
    } else if (t < backEnd) back = { x: xb, y: ankY };
    else { const f = (t - backEnd) / 0.4; back = reach({ x: lerp(xb, xf + dir * 0.5 * Hb, clamp01(f)), y: ankY + arc(f, 0.15 * Hb) }, hipR); }
    if (t < T.ffc) {
      const f = t / T.ffc;
      front = reach({ x: lerp(x0 - dir * 0.1 * Hb, xf, f), y: ankY + arc(f, 0.18 * Hb) }, hipL);
      if (t > T.ffc - 0.05) { // leg reaches out already extended to the landing knee angle
        const D = legSpan(T.frontKneeFFC), d = Math.hypot(front.x - hipL.x, front.y - hipL.y);
        front = { x: hipL.x + ((front.x - hipL.x) * D) / d, y: hipL.y + ((front.y - hipL.y) * D) / d };
      }
    }
    else front = { x: xf, y: ankY };
    // Legs (front = L for right-armer)
    const kneeL = knee2D(hipL, front, L, dir), kneeR = knee2D(hipR, back, L, dir);
    // Trunk & head
    const phi = t < T.ffc ? T.trunkFlexFFC : t < T.br ? seg(t, T.ffc, T.br, T.trunkFlexFFC, T.trunkFlexBR) : seg(t, T.br, 1.0, T.trunkFlexBR, 60);
    const shC = { x: hx + dir * Lt * Math.sin(rad(phi)), y: hy - Lt * Math.cos(rad(phi)) };
    const shL = { x: shC.x + 0.008, y: shC.y }, shR = { x: shC.x - 0.008, y: shC.y };
    const nose = { x: shC.x + dir * (0.03 * Hb + 0.11 * Hb * Math.sin(rad(phi))), y: shC.y - 0.11 * Hb * Math.cos(rad(phi)) };
    // Arms: bowling arm (R) rotates through vertical exactly at BR; front arm (L) peaks earlier and lower.
    const psi = t < T.ffc - 0.05 ? -160 : t < T.br ? seg(t, T.ffc - 0.05, T.br, -160, 0) : seg(t, T.br, T.br + 0.15, 0, 150);
    const wrR = { x: shR.x + dir * La * Math.sin(rad(psi)), y: shR.y - La * Math.cos(rad(psi)) };
    const psiF = t < T.bfc ? seg(t, 0.2, T.bfc, 120, 25) : t < T.ffc ? 25 : seg(t, T.ffc, T.br + 0.05, 25, 160);
    const wrL = { x: shL.x + dir * La * Math.sin(rad(psiF)), y: shL.y - La * Math.cos(rad(psiF)) };
    const elR = { x: (shR.x + wrR.x) / 2, y: (shR.y + wrR.y) / 2 }, elL = { x: (shL.x + wrL.x) / 2, y: (shL.y + wrL.y) / 2 };

    const P = {};
    P[0] = nose; P[1] = P[2] = P[3] = { x: nose.x + 0.004, y: nose.y - 0.008 }; P[4] = P[5] = P[6] = { x: nose.x - 0.004, y: nose.y - 0.008 };
    P[7] = { x: nose.x - dir * 0.03, y: nose.y }; P[8] = P[7]; P[9] = P[10] = { x: nose.x, y: nose.y + 0.012 };
    P[11] = shL; P[12] = shR; P[13] = elL; P[14] = elR; P[15] = wrL; P[16] = wrR;
    for (const [k, w] of [[17, wrL], [19, wrL], [21, wrL], [18, wrR], [20, wrR], [22, wrR]]) P[k] = { x: w.x + dir * 0.01, y: w.y - 0.01 };
    P[23] = hipL; P[24] = hipR; P[25] = kneeL; P[26] = kneeR; P[27] = front; P[28] = back;
    P[29] = { x: front.x - dir * 0.04 * Hb, y: front.y + 0.03 * Hb }; P[31] = { x: front.x + dir * 0.1 * Hb, y: front.y + 0.035 * Hb };
    P[30] = { x: back.x - dir * 0.04 * Hb, y: back.y + 0.03 * Hb }; P[32] = { x: back.x + dir * 0.1 * Hb, y: back.y + 0.035 * Hb };
    const flip = flipLegs.includes(i);
    for (let k = 0; k < NJ; k++) {
      let src = k;
      if (flip) { const m = { 25: 26, 26: 25, 27: 28, 28: 27, 29: 30, 30: 29, 31: 32, 32: 31 }; src = m[k] ?? k; }
      const p = P[src];
      put(pose, i, k, { x: p.x + noise * gauss(rng), y: p.y + noise * gauss(rng) }, aspect);
    }
  }
  return { pose, truth: T, frame: (sec) => Math.round(sec * fps) };
}

export const FRONT_TRUTH = {
  bfc: 0.45, ffc: 0.65, br: 0.77,
  shoulderAlignBFC: 20, counterRotation: 25, hipShoulderSepBFC: 5, hipShoulderSepFFC: 30,
  lateralFlexBR: 30, armVerticalBR: 10, headTiltBR: 8, frontFootAlign: -8,
};

/**
 * Front-on bowler. camera = 'behind' (standard: bowler runs away from the camera, back to the lens)
 * or 'front' (bowler runs towards the camera).
 */
export function makeFrontOn({ fps = 240, noise = 0.0015, seed = 2, arm = 'right', camera = 'behind' } = {}) {
  const T = FRONT_TRUTH;
  const rng = mulberry(seed);
  const width = 1080, height = 1920, aspect = width / height; // portrait phone video
  const dur = 1.15, n = Math.round(dur * fps);
  const pose = emptyPose(n, width, height);
  const Hb = 0.5, cx = aspect / 2;
  const L = 0.2455 * Hb, Lt = 0.288 * Hb, La = 0.332 * Hb, shW = 0.26 * Hb, hipW = 0.18 * Hb;
  const s = arm === 'left' ? -1 : 1;     // left-armers are the mirror image
  const cs = camera === 'front' ? 1 : -1; // seen from behind, left and right swap sides in the image
  const nbDir = s * cs;                   // image direction of the bowler's non-bowling side
  // Alignment curves (0 = side-on, 90 = front-on)
  const mid = (T.bfc + T.ffc) / 2;
  const aS = (t) => (t < T.bfc ? 20 : t < mid ? seg(t, T.bfc, mid, 20, -5) : t < T.ffc ? seg(t, mid, T.ffc, -5, 10) : seg(t, T.ffc, T.br, 10, 80));
  const aH = (t) => (t < T.bfc ? 25 : t < T.ffc ? seg(t, T.bfc, T.ffc, 25, 40) : seg(t, T.ffc, T.br, 40, 90));
  const Gb = 0.86, Gf = 0.9;
  const ankYb = Gb - 0.039 * Hb, ankYf = Gf - 0.039 * Hb;
  const xbPlant = cx - nbDir * 0.05 * Hb, xfPlant = cx + nbDir * 0.03 * Hb; // front foot lands 8% open of the back foot

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    pose.times[i] = t;
    const arc = (f, h) => -Math.sin(Math.PI * clamp01(f)) * h;
    let back, front;
    if (t < T.bfc) { const f = t / T.bfc; back = { x: xbPlant, y: lerp(Gb - 0.2, ankYb, f) + arc(f, 0.05) }; }
    else if (t < T.ffc + 0.03) back = { x: xbPlant, y: ankYb };
    else { const f = (t - T.ffc - 0.03) / 0.4; back = { x: xbPlant, y: lerp(ankYb, ankYf + 0.05, clamp01(f)) + arc(f, 0.05) }; }
    if (t < 0.25) front = { x: xfPlant, y: Gb - 0.25 };
    else if (t < T.ffc) { const f = (t - 0.25) / (T.ffc - 0.25); front = { x: xfPlant, y: lerp(Gb - 0.25, ankYf, f) + arc(f, 0.06) }; }
    else front = { x: xfPlant, y: ankYf };
    const hipC = { x: cx, y: Math.max(back.y, front.y) - 0.45 * Hb }; // both feet always within leg reach
    // World coordinates (metres-ish), z towards camera negative. v = nonBowling - bowling.
    const worldPair = (alpha, w, yy) => {
      const vx = cs * s * w * Math.sin(rad(alpha)), vz = -cs * w * Math.cos(rad(alpha));
      return { b: { x: -vx / 2, y: yy, z: -vz / 2 }, nb: { x: vx / 2, y: yy, z: vz / 2 } };
    };
    const sh = worldPair(aS(t), 0.38, -0.5), hp = worldPair(aH(t), 0.28, 0);
    // Image: lateral flexion tilts the trunk towards the non-bowling side.
    const lf = t < T.ffc ? 5 : seg(t, T.ffc, T.br, 5, T.lateralFlexBR);
    const shC = { x: hipC.x + nbDir * Lt * Math.sin(rad(lf)), y: hipC.y - Lt * Math.cos(rad(lf)) };
    const shB = { x: shC.x - nbDir * (shW / 2) * Math.abs(Math.sin(rad(aS(t)))) - 0.002 * nbDir, y: shC.y };
    const shN = { x: shC.x + nbDir * (shW / 2) * Math.abs(Math.sin(rad(aS(t)))) + 0.002 * nbDir, y: shC.y };
    const hipB = { x: hipC.x - nbDir * (hipW / 2) * Math.max(0.05, Math.sin(rad(aH(t)))), y: hipC.y };
    const hipN = { x: hipC.x + nbDir * (hipW / 2) * Math.max(0.05, Math.sin(rad(aH(t)))), y: hipC.y };
    // Bowling arm swings over in a plane tilted 10° out towards the bowling side; highest at release.
    const theta = t < T.br - 0.08 ? -150 : t < T.br ? seg(t, T.br - 0.08, T.br, -150, 0) : seg(t, T.br, T.br + 0.12, 0, 130);
    const cth = Math.cos(rad(theta)), tau = rad(T.armVerticalBR);
    const wrB = { x: shB.x - nbDir * La * cth * Math.sin(tau), y: shB.y - La * cth * Math.cos(tau) };
    const wrN = { x: shN.x + nbDir * 0.1 * Hb, y: shN.y + 0.15 * Hb };
    const headC = { x: shC.x + nbDir * 0.1 * Hb * Math.sin(rad(lf)), y: shC.y - 0.1 * Hb * Math.cos(rad(lf)) };
    const tilt = t < T.ffc ? 0 : seg(t, T.ffc, T.br, 0, T.headTiltBR);
    const eyeHalf = 0.025;
    const eyeN = { x: headC.x + nbDir * eyeHalf * Math.cos(rad(tilt)), y: headC.y - 0.01 + eyeHalf * Math.sin(rad(tilt)) };
    const eyeB = { x: headC.x - nbDir * eyeHalf * Math.cos(rad(tilt)), y: headC.y - 0.01 - eyeHalf * Math.sin(rad(tilt)) };
    const earHalf = 0.04;
    const earN = { x: headC.x + nbDir * earHalf * Math.cos(rad(tilt)), y: headC.y + earHalf * Math.sin(rad(tilt)) };
    const earB = { x: headC.x - nbDir * earHalf * Math.cos(rad(tilt)), y: headC.y - earHalf * Math.sin(rad(tilt)) };

    const B = arm === 'left' ? 'L' : 'R';
    const idx = (side, j) => ({ L: { sh: 11, el: 13, wr: 15, hip: 23, knee: 25, ank: 27, heel: 29, foot: 31, eye: 2, ear: 7 }, R: { sh: 12, el: 14, wr: 16, hip: 24, knee: 26, ank: 28, heel: 30, foot: 32, eye: 5, ear: 8 } }[side][j]);
    const NB = B === 'L' ? 'R' : 'L';
    const F = NB; // front leg = non-bowling side
    const P = {}, W = {};
    P[0] = headC; for (const k of [1, 3, 4, 6, 7, 8, 9, 10]) P[k] = headC;
    P[idx(B, 'eye')] = eyeB; P[idx(NB, 'eye')] = eyeN;
    P[idx(B, 'ear')] = earB; P[idx(NB, 'ear')] = earN;
    // Face depth: nose nearer the camera than the ears only when the bowler faces the camera.
    W[0] = { x: 0, y: -0.62, z: -cs * 0.08 }; W[7] = { x: -0.07, y: -0.6, z: 0 }; W[8] = { x: 0.07, y: -0.6, z: 0 };
    P[idx(B, 'sh')] = shB; P[idx(NB, 'sh')] = shN; W[idx(B, 'sh')] = sh.b; W[idx(NB, 'sh')] = sh.nb;
    P[idx(B, 'wr')] = wrB; P[idx(NB, 'wr')] = wrN;
    P[idx(B, 'el')] = { x: (shB.x + wrB.x) / 2, y: (shB.y + wrB.y) / 2 }; P[idx(NB, 'el')] = { x: (shN.x + wrN.x) / 2, y: (shN.y + wrN.y) / 2 };
    for (const k of [17, 19, 21]) P[k] = P[15]; for (const k of [18, 20, 22]) P[k] = P[16];
    P[idx(B, 'hip')] = hipB; P[idx(NB, 'hip')] = hipN; W[idx(B, 'hip')] = hp.b; W[idx(NB, 'hip')] = hp.nb;
    const ankF = front, ankB = back;
    P[idx(F, 'ank')] = ankF; P[idx(B, 'ank')] = ankB;
    P[idx(F, 'knee')] = knee2D(P[idx(F, 'hip')], ankF, L, 0.0001); P[idx(B, 'knee')] = knee2D(P[idx(B, 'hip')], ankB, L, 0.0001);
    P[idx(F, 'heel')] = { x: ankF.x, y: ankF.y + 0.02 * Hb }; P[idx(F, 'foot')] = { x: ankF.x, y: ankF.y + 0.04 * Hb };
    P[idx(B, 'heel')] = { x: ankB.x, y: ankB.y + 0.02 * Hb }; P[idx(B, 'foot')] = { x: ankB.x, y: ankB.y + 0.04 * Hb };
    for (let k = 0; k < NJ; k++) {
      const p = P[k];
      put(pose, i, k, { x: p.x + noise * gauss(rng), y: p.y + noise * gauss(rng) }, aspect, W[k] ? { x: W[k].x + 0.002 * gauss(rng), y: W[k].y, z: W[k].z + 0.002 * gauss(rng) } : { x: 0, y: 0, z: 0 });
    }
  }
  return { pose, truth: T, frame: (sec) => Math.round(sec * fps) };
}
