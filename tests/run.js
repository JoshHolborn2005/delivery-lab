import { analyseClip } from '../js/biomech/index.js';
import { analyseSession, scoreMetric } from '../js/biomech/analysis.js';
import { METRIC_BY_ID } from '../js/biomech/reference.js';
import { spearman } from '../js/views/insights.js';
import { makeSideOn, makeFrontOn } from './synthetic.js';
import { PoseSeries } from '../js/biomech/series.js';
import { cleanSeries } from '../js/biomech/clean.js';
import { detectCameraSide } from '../js/biomech/metrics.js';

const results = [];
const out = document.getElementById('out');

function section(title, checks) {
  const passed = checks.filter((c) => c.ok).length;
  results.push(...checks);
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<h2>${title} <span class="${passed === checks.length ? 'pass' : 'fail'}">${passed}/${checks.length}</span></h2>
    <table class="table"><thead><tr><th>Check</th><th class="num">Expected</th><th class="num">Got</th><th class="num">Tolerance</th><th>Result</th></tr></thead><tbody>
    ${checks.map((c) => `<tr><td>${c.name}</td><td class="num">${fmt(c.expected)}</td><td class="num">${fmt(c.got)}</td><td class="num">${c.tol ?? ''}</td><td class="${c.ok ? 'pass' : 'fail'}">${c.ok ? 'PASS' : 'FAIL'}</td></tr>`).join('')}
    </tbody></table>`;
  out.appendChild(div);
}
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v));
const near = (name, got, expected, tol) => ({ name, got, expected, tol, ok: Number.isFinite(got) && Math.abs(got - expected) <= tol });
const eq = (name, got, expected) => ({ name, got, expected, ok: got === expected });

function sideChecks(label, gen, meta) {
  const { pose, truth: T, frame } = gen;
  const r = analyseClip(pose, meta);
  const fps = pose.n / 1.15;
  const ev = r.events;
  const ms = (f) => (f / fps) * 1000;
  section(label, [
    near('Release frame (ms)', ms(ev.br), T.br * 1000, 10),
    near('Front-foot contact (ms)', ms(ev.ffc), T.ffc * 1000, 20),
    near('Back-foot contact (ms)', ms(ev.bfc), T.bfc * 1000, 25),
    eq('Events auto-detected (not estimated)', `${ev.conf.bfc}/${ev.conf.ffc}/${ev.conf.br}`, 'auto/auto/auto'),
    eq('Front leg = left (right-armer)', ev.frontSide, 'L'),
    near('Run-up speed (m/s)', r.metrics.approachSpeed, T.approachSpeed, 0.35),
    near('Stride length (% height)', r.metrics.strideLength, T.strideLength, 4),
    near('Front knee at FFC (°)', r.metrics.frontKneeFFC, T.frontKneeFFC, 4),
    near('Front knee at release (°)', r.metrics.frontKneeBR, T.frontKneeBR, 4),
    near('Front-knee collapse (°)', r.metrics.frontKneeFlex, T.frontKneeFFC - T.frontKneeMin, 4),
    near('Trunk flexion at FFC (°)', r.metrics.trunkFlexFFC, T.trunkFlexFFC, 4),
    near('Trunk flexion at release (°)', r.metrics.trunkFlexBR, T.trunkFlexBR, 4),
    eq('Knee technique', r.info.kneeType, 'Flexor'),
  ]);
  return r;
}

// ---- Side-on: clean, 240 fps
sideChecks('Side-on · 240 fps · left→right', makeSideOn({ fps: 240 }), { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 1 });
// ---- Side-on: right→left, 120 fps
sideChecks('Side-on · 120 fps · right→left', makeSideOn({ fps: 120, dir: -1, seed: 7 }), { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 1 });
// ---- Side-on: tracker swaps legs in a run of frames during the delivery stride
{
  const g = makeSideOn({ fps: 240, seed: 3 });
  const f0 = g.frame(0.5);
  const fresh = makeSideOn({ fps: 240, seed: 3, flipLegs: Array.from({ length: 12 }, (_, k) => f0 + k) });
  sideChecks('Side-on · leg labels swapped in 12 frames', fresh, { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 1 });
}
// ---- Side-on: slow-motion export (8x) — video time is 8x real time
{
  const g = makeSideOn({ fps: 240, seed: 4 });
  const slowed = { ...g.pose, times: g.pose.times.map((t) => t * 8) };
  sideChecks('Side-on · 240 fps exported as 8× slow-mo', { ...g, pose: slowed }, { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 8 });
}
// ---- Side-on: 30 fps phone video (coarse) — wider tolerances
{
  const g = makeSideOn({ fps: 30, seed: 5 });
  const r = analyseClip(g.pose, { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 1 });
  section('Side-on · 30 fps (expect approximate results)', [
    near('Release (ms)', (r.events.br / 30) * 1000, 770, 40),
    near('Front knee at release (°)', r.metrics.frontKneeBR, 162, 8),
    near('Stride length (% height)', r.metrics.strideLength, 80, 8),
    eq('Low-fps warning shown', r.warnings.some((w) => /frames per real second/.test(w)), true),
  ]);
}
// ---- Manual override
{
  const g = makeSideOn({ fps: 240, seed: 6 });
  const r = analyseClip(g.pose, { view: 'side', arm: 'right', heightM: 1.8, slowFactor: 1 }, { ffc: g.frame(0.62) });
  section('Coach override of FFC', [
    eq('FFC uses the manual frame', r.events.ffc, g.frame(0.62)),
    eq('FFC marked manual', r.events.conf.ffc, 'manual'),
  ]);
}

// ---- Front-on
function frontChecks(label, arm, seed = 2, camera = 'behind') {
  const g = makeFrontOn({ fps: 240, arm, seed, camera });
  const T = g.truth;
  const r = analyseClip(g.pose, { view: 'front', arm, heightM: 1.8, slowFactor: 1 });
  const fps = g.pose.n / 1.15, ms = (f) => (f / fps) * 1000;
  section(label, [
    near('Release (ms)', ms(r.events.br), T.br * 1000, 10),
    near('Front-foot contact (ms)', ms(r.events.ffc), T.ffc * 1000, 20),
    near('Back-foot contact (ms)', ms(r.events.bfc), T.bfc * 1000, 25),
    eq('Events auto-detected (not estimated)', `${r.events.conf.bfc}/${r.events.conf.ffc}/${r.events.conf.br}`, 'auto/auto/auto'),
    near('Shoulder alignment at BFC (°)', r.metrics.shoulderAlignBFC, T.shoulderAlignBFC, 4),
    near('Shoulder counter-rotation (°)', r.metrics.counterRotation, T.counterRotation, 4),
    near('Hip–shoulder diff at BFC (°)', r.metrics.hipShoulderSepBFC, T.hipShoulderSepBFC, 4),
    near('Hip–shoulder separation at FFC (°)', r.metrics.hipShoulderSepFFC, T.hipShoulderSepFFC, 5),
    near('Side-bend at release (°)', r.metrics.lateralFlexBR, T.lateralFlexBR, 3),
    near('Arm from vertical at release (°)', r.metrics.armVerticalBR, T.armVerticalBR, 3),
    near('Head tilt at release (°)', r.metrics.headTiltBR, T.headTiltBR, 3),
    near('Front-foot line (% height)', r.metrics.frontFootAlign, T.frontFootAlign, 3),
    near('Head offset (% height)', r.metrics.headOffsetBR, 16.4, 3),
    eq('Action type', r.info.actionType, 'Side-on'),
    eq('Camera position detected', r.info.cameraSide, camera),
  ]);
  return r;
}
frontChecks('Front-on from behind · right-arm', 'right');
frontChecks('Front-on from behind · left-arm', 'left');
frontChecks('Front-on from in front · right-arm', 'right', 2, 'front');
frontChecks('Front-on from in front · left-arm', 'left', 2, 'front');
frontChecks('Front-on from behind · right-arm · different noise seed', 'right', 21);
{
  // Coach override wins over auto-detection.
  const g = makeFrontOn({ fps: 240, camera: 'behind' });
  const r = analyseClip(g.pose, { view: 'front', arm: 'right', heightM: 1.8, slowFactor: 1, cameraSide: 'front' });
  // Apparent size is the strongest cue: a bowler growing in frame is running towards the camera.
  const meta = { view: 'front', arm: 'right', slowFactor: 1 };
  const sizeCase = (growth) => {
    const s = new PoseSeries(g.pose, meta);
    cleanSeries(s, meta);
    for (let i = 0; i < s.n; i++) s.scale[i] *= 1 + growth * s.times[i];
    return detectCameraSide(s, { br: g.frame(0.77) }, meta).side;
  };
  section('Camera position: override and size cue', [
    eq('Override respected', `${r.info.cameraSide}/${r.info.cameraSideHow}`, 'front/set'),
    eq('Bowler growing 30%/s in frame → in front', sizeCase(0.3), 'front'),
    eq('Bowler shrinking 30%/s in frame → behind', sizeCase(-0.3), 'behind'),
  ]);
}

// ---- Scoring + session aggregation
{
  const def = METRIC_BY_ID.frontKneeBR;
  const counter = METRIC_BY_ID.counterRotation;
  section('Scoring and session analysis', [
    eq('Knee 170° = good', scoreMetric(def, 170).status, 'good'),
    eq('Knee 150° = fair', scoreMetric(def, 150).status, 'fair'),
    eq('Knee 130° = work on', scoreMetric(def, 130).status, 'work'),
    eq('Counter-rotation 35° = work on (high side)', scoreMetric(counter, 35).dir, 'high'),
    ...(() => {
      const clips = [
        { id: 'a', view: 'front', status: 'done', metrics: { counterRotation: 36, hipShoulderSepBFC: 10, armVerticalBR: 40, lateralFlexBR: 30, headTiltBR: 5, headOffsetBR: 0, frontFootAlign: 0 }, info: { actionType: 'Mixed', actionBase: 'Semi-open' } },
        { id: 'b', view: 'side', status: 'done', metrics: { frontKneeBR: 135, frontKneeFlex: 30, approachSpeed: 5.8, strideLength: 82, trunkFlexBR: 40, trunkFlexChange: 35, frontKneeFFC: 165 }, info: { kneeType: 'Flexor' } },
      ];
      const pace = analyseSession(clips, 'pace');
      const swing = analyseSession(clips, 'swing');
      return [
        eq('Mixed action raises an injury flag', pace.injuries.some((i) => i.rule.id === 'mixed-cr' && i.level === 'high'), true),
        eq('Pace focus #1 = front knee at release', pace.focus[0]?.row.def.id, 'frontKneeBR'),
        eq('Swing focus #1 = arm angle', swing.focus[0]?.row.def.id, 'armVerticalBR'),
        eq('Repeatability needs 2+ clips per view', pace.byId.repeatability.value, null),
        eq('Action type reported', pace.actionType, 'Mixed'),
      ];
    })(),
    near('Spearman ρ of a perfect monotone set', spearman([[1, 2], [2, 4], [3, 9], [4, 10]]), 1, 1e-9),
    near('Spearman ρ of a reversed set', spearman([[1, 4], [2, 3], [3, 2], [4, 1]]), -1, 1e-9),
  ]);
}

const failed = results.filter((r) => !r.ok);
document.getElementById('summary').innerHTML = failed.length
  ? `<span class="fail">${failed.length} of ${results.length} checks failed</span>`
  : `<span class="pass">All ${results.length} checks passed</span>`;
window.__testResults = { total: results.length, failed: failed.map((f) => ({ name: f.name, expected: f.expected, got: f.got })) };
