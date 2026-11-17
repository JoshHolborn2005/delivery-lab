// Reusable view fragments.

import { html, fmt, fmtSigned } from '../util.js';
import { DRILLS } from '../biomech/drills.js';
import { SOURCES, EVIDENCE } from '../biomech/reference.js';

export const STATUS_LABEL = { good: 'In range', fair: 'Close', work: 'Work on' };

export function statusChip(status) {
  if (!status) return html`<span class="chip">Not scored</span>`;
  return html`<span class="chip ${status}"><span class="dot"></span>${STATUS_LABEL[status]}</span>`;
}

export function scoreChip(score) {
  if (score == null) return html`<span class="muted">–</span>`;
  const cls = score >= 75 ? 'good' : score >= 50 ? 'fair' : 'work';
  return html`<span class="chip ${cls}">${Math.round(score)}</span>`;
}

export function evidenceChip(level) {
  const e = EVIDENCE[level];
  if (!e) return '';
  return html`<span class="chip ${level === 'strong' ? 'accent' : level === 'moderate' ? 'info' : ''}" title="${e.label}">${e.label}</span>`;
}

const SIGNED = new Set(['armVerticalBR', 'headOffsetBR', 'frontFootAlign', 'hipShoulderSepFFC', 'hipShoulderSepBFC', 'trunkFlexChange', 'lateralFlexBR', 'shoulderAlignBFC']);

export function metricValue(def, v) {
  if (v == null || !Number.isFinite(v)) return '–';
  const n = SIGNED.has(def.id) ? fmtSigned(v, def.dp) : fmt(v, def.dp);
  const unit = def.unit === '°' ? '°' : def.unit ? ` ${def.unit}` : '';
  return `${n}${unit}`;
}

export function rangeText(def) {
  if (!def.good) return 'Info only';
  const [a, b] = def.good;
  const u = def.unit === '°' ? '°' : ` ${def.unit}`;
  if (!Number.isFinite(b)) return `≥ ${a}${u}`;
  if (!Number.isFinite(a) || (a === 0 && def.unit !== '/100')) return `≤ ${b}${u}`;
  return `${a} to ${b}${u}`;
}

/** Horizontal bar showing fair/good bands with the measured value pinned. */
export function rangeBar(def, v) {
  const lo = def.scaleMin, hi = def.scaleMax;
  if (lo == null || hi == null) return '';
  const pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  const band = (b, cls) => {
    if (!b) return '';
    const a = Number.isFinite(b[0]) ? pos(b[0]) : 0, c = Number.isFinite(b[1]) ? pos(b[1]) : 100;
    return html`<span class="${cls}" style="left:${a}%;width:${Math.max(0, c - a)}%"></span>`;
  };
  return html`<div class="range-bar" aria-hidden="true">
    ${band(def.fair, 'fair')}${band(def.good, 'good')}
    ${v != null && Number.isFinite(v) ? html`<span class="pin" style="left:${pos(v)}%"></span>` : ''}
  </div>`;
}

export function drillItem(id) {
  const d = DRILLS[id];
  if (!d) return '';
  return html`<li><details>
    <summary>${d.name}</summary>
    <div class="muted" style="font-size:.88rem;margin-top:4px">${d.purpose}</div>
    <ol>${d.steps.map((s) => html`<li>${s}</li>`)}</ol>
    <div style="font-size:.82rem"><strong>Dose:</strong> ${d.dose} · <strong>Kit:</strong> ${d.equipment}</div>
  </details></li>`;
}

export function sourceList(ids) {
  return html`<ul style="margin:4px 0 0;padding-left:18px;font-size:.82rem;color:var(--muted)">${ids.map((id) => html`<li>${SOURCES[id] || id}</li>`)}</ul>`;
}

/** Circular score indicator (SVG). */
export function scoreRing(score) {
  const r = 26, c = 2 * Math.PI * r;
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = score == null ? 'var(--border)' : score >= 75 ? 'var(--good)' : score >= 50 ? 'var(--fair)' : 'var(--work)';
  return html`<svg class="score-ring" viewBox="0 0 64 64" role="img" aria-label="${score == null ? 'Not measured' : `Score ${Math.round(score)} out of 100`}">
    <circle class="track" cx="32" cy="32" r="${r}" fill="none" stroke-width="6"></circle>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 32 32)"></circle>
    <text class="val" x="32" y="38" text-anchor="middle">${score == null ? '–' : Math.round(score)}</text>
  </svg>`;
}
