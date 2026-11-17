// Session-level analysis: combine clips, score against the reference model, rank focus areas
// for the athlete's goal and raise injury flags.

import { METRICS, METRIC_BY_ID, EVIDENCE, REPEAT_TOL, INJURY_RULES, SWING_TENDENCY } from './reference.js';
import { median, sd, mean, clamp } from '../util.js';

export const GOAL_KEYS = ['pace', 'swing', 'accuracy'];

/** Score a value against a metric's bands → { status: good|fair|work, score 0–100, dir: low|high|null } */
export function scoreMetric(def, value) {
  if (!def?.good || value == null || !Number.isFinite(value)) return null;
  // Judge the value as displayed, so "5.5 m/s" never shows as outside a "≥ 5.5" target.
  const v = Number(value.toFixed(def.dp ?? 1));
  const [g0, g1] = def.good;
  const [f0, f1] = def.fair || def.good;
  if (v >= g0 && v <= g1) return { status: 'good', score: 100, dir: null };
  const low = v < g0;
  const edge = low ? g0 : g1;
  const fairEdge = low ? f0 : f1;
  const width = Number.isFinite(fairEdge) && fairEdge !== edge ? Math.abs(edge - fairEdge) : 10;
  const d = Math.abs(v - edge);
  if (d <= width) return { status: 'fair', score: Math.round(100 - (40 * d) / width), dir: low ? 'low' : 'high' };
  return { status: 'work', score: Math.round(Math.max(10, 60 - (50 * (d - width)) / width)), dir: low ? 'low' : 'high' };
}

export function repeatability(clips) {
  const parts = [];
  for (const view of ['side', 'front']) {
    const vc = clips.filter((c) => c.view === view && c.metrics);
    if (vc.length < 2) continue;
    const ratios = [];
    const detail = [];
    for (const [id, tol] of Object.entries(REPEAT_TOL[view])) {
      const vals = vc.map((c) => c.metrics[id]).filter(Number.isFinite);
      if (vals.length < 2) continue;
      const s = sd(vals);
      ratios.push(s / tol);
      detail.push({ id, sd: s, tol, n: vals.length });
    }
    if (ratios.length) parts.push({ view, n: vc.length, score: clamp(100 - 30 * mean(ratios), 0, 100), detail });
  }
  if (!parts.length) return null;
  const total = parts.reduce((s, p) => s + p.n, 0);
  return { score: parts.reduce((s, p) => s + p.score * p.n, 0) / total, n: total, parts };
}

export function analyseSession(clips, goal = 'pace') {
  const done = clips.filter((c) => c.status === 'done' && c.metrics);
  const rows = [];

  for (const def of METRICS) {
    if (def.view === 'session') continue;
    const perClip = done.filter((c) => c.view === def.view && Number.isFinite(c.metrics[def.id]))
      .map((c) => ({ clipId: c.id, value: c.metrics[def.id] }));
    const value = perClip.length ? median(perClip.map((p) => p.value)) : null;
    rows.push({ def, value, n: perClip.length, spread: sd(perClip.map((p) => p.value)), perClip, ...(scoreMetric(def, value) || {}) });
  }

  const rep = repeatability(done);
  const repDef = METRIC_BY_ID.repeatability;
  rows.push({ def: repDef, value: rep?.score ?? null, n: rep?.n ?? 0, detail: rep?.parts, ...(scoreMetric(repDef, rep?.score) || {}) });

  const byId = Object.fromEntries(rows.map((r) => [r.def.id, r]));

  // Goal scores (weighted mean of scored metrics) and how much of the model was measurable.
  const goalScores = {};
  for (const g of GOAL_KEYS) {
    let wAll = 0, wHave = 0, sum = 0;
    for (const r of rows) {
      const w = r.def.weights?.[g] || 0;
      if (!w || !r.def.good) continue;
      wAll += w;
      if (r.score == null) continue;
      wHave += w;
      sum += w * r.score;
    }
    goalScores[g] = { score: wHave ? Math.round(sum / wHave) : null, coverage: wAll ? wHave / wAll : 0 };
  }

  // Action type (front-on clips): majority vote, but any mixed clip is reported.
  const types = done.filter((c) => c.view === 'front' && c.info?.actionType).map((c) => c.info.actionType);
  const bases = done.filter((c) => c.view === 'front' && c.info?.actionBase).map((c) => c.info.actionBase);
  const actionType = types.length ? mode(types) : null;
  const actionBase = bases.length ? mode(bases) : null;
  const mixedClips = types.filter((t) => t === 'Mixed').length;

  // Knee technique (side-on clips).
  const kneeTypes = done.filter((c) => c.view === 'side' && c.info?.kneeType).map((c) => c.info.kneeType);
  const kneeType = kneeTypes.length ? mode(kneeTypes) : null;

  // Injury flags, always on.
  const injuries = [];
  for (const rule of INJURY_RULES) {
    const r = byId[rule.metric];
    if (!r || r.value == null) continue;
    const level = rule.level(r.value);
    const flaggedClips = r.perClip.filter((p) => rule.level(p.value)).length;
    if (level || flaggedClips > 0) {
      injuries.push({ rule, level: level || 'caution', value: r.value, flaggedClips, totalClips: r.perClip.length });
    }
  }

  // Focus areas for the chosen goal.
  const focus = rows
    .filter((r) => r.status && r.status !== 'good' && (r.def.weights?.[goal] || 0) > 0 && r.def[r.dir])
    .map((r) => ({ row: r, advice: r.def[r.dir], priority: (100 - r.score) * r.def.weights[goal] * EVIDENCE[r.def.evidence].weight }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const strengths = rows
    .filter((r) => r.status === 'good' && (r.def.weights?.[goal] || 0) >= 2)
    .map((r) => r.def);

  const views = new Set(done.map((c) => c.view));
  const gaps = [];
  if (!views.has('side')) gaps.push('Add side-on clips to measure run-up speed, front knee, stride and trunk flexion. These carry most of the pace score.');
  if (!views.has('front')) gaps.push('Add front-on clips to measure action type, counter-rotation (injury risk), arm angle and head position. These carry most of the swing and accuracy scores.');
  if (!rep) gaps.push('Add at least 2 clips from the same camera angle to measure how repeatable the action is.');

  return {
    rows, byId, goalScores, goal, focus, strengths, injuries, gaps,
    actionType, actionBase, mixedClips, kneeType,
    swingTendency: actionType ? SWING_TENDENCY[actionType] : null,
    clipCount: done.length,
  };
}

/** Compact summary cached on the session record for lists and progress charts. */
export function sessionSummary(analysis) {
  const metrics = {};
  for (const r of analysis.rows) if (r.value != null) metrics[r.def.id] = r.value;
  return {
    goalScores: Object.fromEntries(GOAL_KEYS.map((g) => [g, analysis.goalScores[g].score])),
    actionType: analysis.actionType,
    injuryFlags: analysis.injuries.length,
    clipCount: analysis.clipCount,
    metrics,
  };
}

function mode(arr) {
  const counts = new Map();
  for (const a of arr) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
