// Entry point for per-clip analysis. Pure functions over pose data, with no DOM access,
// so this layer can be ported to a native app later.

import { PoseSeries } from './series.js';
import { cleanSeries } from './clean.js';
import { detectEvents, mergeManual, eventOrderProblem } from './events.js';
import { computeMetrics } from './metrics.js';

/**
 * @param pose    stored pose track (see pose/processor.js)
 * @param meta    { view: 'side'|'front', arm: 'right'|'left', heightM, heightKnown, slowFactor }
 * @param manual  coach-set event frames { bfc?, ffc?, br? }
 */
export function analyseClip(pose, meta, manual = {}) {
  const s = new PoseSeries(pose, meta);
  cleanSeries(s, meta);
  const warnings = [];
  const coverage = s.validFraction();
  if (coverage < 0.6) warnings.push(`The bowler was only tracked in ${Math.round(coverage * 100)}% of frames. Try better light, a plainer background or a closer camera.`);
  if (s.fps < 50) warnings.push(`Only ${Math.round(s.fps)} frames per real second. Events and speeds are approximate, so film in slow-motion (120 or 240 fps) if you can.`);

  const auto = detectEvents(s, meta);
  if (!auto) {
    return { s, events: null, metrics: {}, info: {}, warnings: ['No bowler was detected in this clip.', ...warnings] };
  }
  const events = mergeManual(auto, manual, s.n);
  const order = eventOrderProblem(events);
  if (order) warnings.push(order);
  const { values, info, warnings: mw } = computeMetrics(s, events, meta);
  const autoWarnings = auto.warnings.filter((w, i) => {
    // Drop "could not find X" warnings for events the coach has set by hand.
    if (/Front-foot contact/.test(w) && events.conf.ffc === 'manual') return false;
    if (/Back-foot contact/.test(w) && events.conf.bfc === 'manual') return false;
    if (/release frame/.test(w) && events.conf.br === 'manual') return false;
    return true;
  });
  return {
    s,
    events: { bfc: events.bfc, ffc: events.ffc, br: events.br, frontSide: events.frontSide, conf: events.conf },
    metrics: values,
    info: { ...info, coverage, fps: s.fps },
    warnings: [...s.notes, ...autoWarnings, ...mw, ...warnings],
  };
}

export function clipMeta(clip, player) {
  const h = Number(player?.heightCm);
  return {
    view: clip.view,
    arm: player?.arm || 'right',
    heightM: h > 100 && h < 230 ? h / 100 : 1.8,
    heightKnown: h > 100 && h < 230,
    slowFactor: Number(clip.slowFactor) || 1,
    cameraSide: clip.cameraSide || 'auto', // front-on clips: 'auto' | 'behind' | 'front'
  };
}
