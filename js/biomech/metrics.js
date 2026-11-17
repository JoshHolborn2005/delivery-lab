// Per-clip biomechanical measurements at the key events.
// Side-on clips measure sagittal-plane variables (knee, trunk flexion, stride, run-up speed).
// Front-on clips measure frontal/transverse variables (alignment, side-bend, arm, head, foot line).

import { J, other, armSide, NOSE } from './landmarks.js';
import { angle3, sub, mid, fromVertical, tiltFromHorizontal, deg } from './geometry.js';
import { medianOf } from './series.js';

export function computeMetrics(s, ev, meta) {
  const values = {}, info = {}, warnings = [];
  if (!ev) return { values, info, warnings };
  const { bfc, ffc, br } = ev;
  const f = ev.frontSide, bk = other(f);
  const arm = armSide(meta.arm), nb = other(arm);
  const P = (i, side, joint) => s.p(i, J(side, joint));
  const hipC = (i) => mid(P(i, 'L', 'hip'), P(i, 'R', 'hip'));
  const shC = (i) => mid(P(i, 'L', 'sh'), P(i, 'R', 'sh'));
  const ok = (...frames) => frames.every((i) => s.has(i));

  if (!ok(bfc, ffc, br)) {
    warnings.push('The bowler was not tracked at one of the key events, so some measurements are missing.');
  }

  if (meta.view === 'side') {
    const H = s.scaleBetween(bfc - s.framesFor(0.3), br + s.framesFor(0.2));
    let dir = Math.sign(P(ffc, f, 'ank').x - P(bfc, bk, 'ank').x);
    if (!dir) dir = Math.sign(hipC(br).x - hipC(bfc).x) || 1;
    info.direction = dir > 0 ? 'Running left to right' : 'Running right to left';

    const knee = (i) => angle3(P(i, f, 'hip'), P(i, f, 'knee'), P(i, f, 'ank'));
    if (ok(ffc, br)) {
      const kFFC = knee(ffc), kBR = knee(br);
      let kMin = Infinity;
      for (let i = ffc; i <= br; i++) if (s.has(i)) kMin = Math.min(kMin, knee(i));
      values.frontKneeFFC = kFFC;
      values.frontKneeBR = kBR;
      values.frontKneeFlex = Math.max(0, kFFC - kMin);
      info.kneeType = classifyKnee(kFFC, kMin, kBR);
    }
    if (ok(bfc, ffc)) {
      values.strideLength = (Math.abs(P(ffc, f, 'ank').x - P(bfc, bk, 'ank').x) / H) * 100;
      info.deliveryStrideTime = s.times[ffc] - s.times[bfc];
    }
    const trunk = (i) => fromVertical(sub(shC(i), hipC(i)), dir);
    if (ok(ffc, br)) {
      values.trunkFlexFFC = trunk(ffc);
      values.trunkFlexBR = trunk(br);
      values.trunkFlexChange = values.trunkFlexBR - values.trunkFlexFFC;
    }
    const i0 = s.frameAtTime(s.times[bfc] - 0.25);
    if (i0 < bfc - 1 && ok(i0, bfc)) {
      const dt = s.times[bfc] - s.times[i0];
      const dx = Math.abs(hipC(bfc).x - hipC(i0).x);
      values.approachSpeed = (dx / H / dt) * (meta.heightM || 1.8);
      if (!meta.heightKnown) info.speedNote = 'Run-up speed assumes a 1.80 m bowler. Add the player\'s height for a better estimate.';
    } else {
      warnings.push('Not enough run-up before back-foot contact to measure run-up speed.');
    }
    if (ok(br)) values.releaseHeight = ((P(br, f, 'heel').y - P(br, arm, 'wr').y) / H) * 100;
  }

  if (meta.view === 'front') {
    // Standard set-up: camera behind the bowler, looking down the pitch. Clips filmed from in front
    // of the bowler are detected and handled too.
    const cam = detectCameraSide(s, ev, meta);
    info.cameraSide = cam.side;
    info.cameraSideHow = cam.how;
    const c = cam.side === 'front' ? 1 : -1;

    // Transverse-plane alignment from the tracker's 3D (world) estimate.
    // 0° = fully side-on (shoulder line points down the pitch), 90° = fully front-on (chest to batter),
    // negative = rotated beyond side-on ("closed"). c flips the depth/lateral axes for camera position.
    const sgn = arm === 'L' ? -1 : 1;
    const alignRaw = (i, joint) => {
      const pb = s.w(i, J(arm, joint)), pn = s.w(i, J(nb, joint));
      return deg(Math.atan2(c * sgn * (pn.x - pb.x), -c * (pn.z - pb.z)));
    };
    const align = (i, joint) => {
      const a = [];
      for (let j = i - 2; j <= i + 2; j++) if (s.has(j)) a.push(alignRaw(j, joint));
      return a.length ? medianOf(a) : NaN;
    };
    if (ok(bfc, ffc)) {
      const sB = align(bfc, 'sh'), hB = align(bfc, 'hip');
      values.shoulderAlignBFC = sB;
      values.hipAlignBFC = hB;
      values.hipShoulderSepBFC = hB - sB;
      let minS = sB;
      for (let i = bfc; i <= ffc; i++) if (s.has(i)) minS = Math.min(minS, align(i, 'sh'));
      values.counterRotation = Math.max(0, sB - minS);
      values.hipShoulderSepFFC = align(ffc, 'hip') - align(ffc, 'sh');
      const base = sB < 30 ? 'Side-on' : sB > 60 ? 'Front-on' : 'Semi-open';
      const mixed = values.counterRotation > 30 || Math.abs(values.hipShoulderSepBFC) > 30;
      info.actionBase = base;
      info.actionType = mixed ? 'Mixed' : base;
    }

    // Image direction pointing to the bowler's non-bowling side (robust to camera mirroring).
    let sideSign = 0;
    if (ok(br)) {
      sideSign = Math.sign(P(br, nb, 'hip').x - P(br, arm, 'hip').x) || Math.sign(P(br, nb, 'sh').x - P(br, arm, 'sh').x);
    }
    if (!sideSign) sideSign = (arm === 'R' ? 1 : -1) * c;

    if (ok(br)) {
      const Hb = s.scale[br];
      values.lateralFlexBR = fromVertical(sub(shC(br), hipC(br)), sideSign);
      values.armVerticalBR = fromVertical(sub(P(br, arm, 'wr'), P(br, arm, 'sh')), -sideSign);
      // Ears, not eyes/nose: they are visible whether the camera is behind or in front of the bowler.
      const earL = P(br, 'L', 'ear'), earR = P(br, 'R', 'ear');
      values.headTiltBR = tiltFromHorizontal(sub(earR, earL));
      values.headOffsetBR = ((mid(earL, earR).x - P(br, f, 'ank').x) * sideSign / Hb) * 100;
    }
    if (ok(bfc, ffc)) {
      values.frontFootAlign = ((P(ffc, f, 'ank').x - P(bfc, bk, 'ank').x) * -sideSign / s.scale[ffc]) * 100;
    }
  }

  for (const [k, v] of Object.entries(values)) if (!Number.isFinite(v)) delete values[k];
  return { values, info, warnings };
}

/**
 * Is the front-on camera behind the bowler (standard) or in front? Two independent cues:
 *  1. apparent size: a bowler running towards the camera gets bigger in the frame, away gets smaller
 *  2. face depth from the 3D estimate: nose nearer the camera than the ears = facing the camera
 * Ties default to 'behind'. A coach-set value always wins.
 */
export function detectCameraSide(s, ev, meta = {}) {
  if (meta.cameraSide === 'front' || meta.cameraSide === 'behind') return { side: meta.cameraSide, how: 'set' };
  const { br } = ev;
  let votes = 0;
  const i0 = Math.max(0, s.frameAtTime(s.times[br] - 0.5));
  if (br - i0 >= s.framesFor(0.25)) {
    const w = s.framesFor(0.05);
    const ratio = s.scaleBetween(br - w, br + w) / s.scaleBetween(i0 - w, i0 + w);
    if (ratio > 1.06) votes += 2;
    else if (ratio < 0.94) votes -= 2;
  }
  const dz = [];
  for (let i = i0; i <= br; i++) {
    if (!s.has(i)) continue;
    const n = s.w(i, NOSE), l = s.w(i, J('L', 'ear')), r = s.w(i, J('R', 'ear'));
    const d = n.z - (l.z + r.z) / 2;
    if (Number.isFinite(d)) dz.push(d);
  }
  const m = dz.length ? medianOf(dz) : null;
  if (m != null && m < -0.03) votes += 1;
  else if (m != null && m > 0.03) votes -= 1;
  return { side: votes > 0 ? 'front' : 'behind', how: 'auto' };
}

export function classifyKnee(kFFC, kMin, kBR) {
  const flex = kFFC - kMin, ext = kBR - kMin;
  if (flex <= 10 && Math.abs(kBR - kFFC) <= 10) return 'Braced';
  if (flex > 10 && ext > 10) return 'Flexor-extender';
  if (kBR - kFFC > 10) return 'Extender';
  return 'Flexor';
}
