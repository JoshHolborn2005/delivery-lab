// Lightweight SVG charts with hover tooltips. Colours come from the --series-* tokens
// (reference palette slots 1–3, validated for all pairs in light and dark).

import { html, setHTML, esc } from '../util.js';

const NS = 'http://www.w3.org/2000/svg';

function ensureStyles() {
  if (document.getElementById('chart-tokens')) return;
  const st = document.createElement('style');
  st.id = 'chart-tokens';
  st.textContent = `
  .viz-root { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --viz-grid:#e1e0d9; --viz-axis:#c3c2b7; --viz-ink:#0b0b0b; --viz-ink-2:#52514e; --viz-muted:#898781; position:relative; }
  @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .viz-root { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --viz-grid:#2c2c2a; --viz-axis:#383835; --viz-ink:#f0efec; --viz-ink-2:#c3c2b7; } }
  :root[data-theme="dark"] .viz-root { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --viz-grid:#2c2c2a; --viz-axis:#383835; --viz-ink:#f0efec; --viz-ink-2:#c3c2b7; }
  .viz-root svg { width:100%; height:auto; display:block; overflow:visible; }
  .viz-root .g line { stroke:var(--viz-grid); }
  .viz-root .ax { stroke:var(--viz-axis); }
  .viz-root text { font: 11px var(--font); fill: var(--viz-muted); }
  .viz-root text.end-label { fill: var(--viz-ink-2); font-weight:600; }
  .viz-tip { position:absolute; pointer-events:none; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 10px; font-size:12px; box-shadow:0 6px 20px rgb(0 0 0 / .12); white-space:nowrap; z-index:5; }
  .viz-tip .k { display:flex; align-items:center; gap:6px; }
  .viz-tip .sw { width:10px; height:3px; border-radius:2px; display:inline-block; }
  .viz-tip .v { margin-left:auto; padding-left:12px; font-weight:600; font-variant-numeric: tabular-nums; }
  `;
  document.head.appendChild(st);
}

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

function niceTicks(lo, hi, count = 5) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo, step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const t0 = Math.ceil(lo / step) * step;
  const out = [];
  for (let t = t0; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

function tooltip(root) {
  const tip = document.createElement('div');
  tip.className = 'viz-tip';
  tip.hidden = true;
  root.appendChild(tip);
  return {
    show(x, y, content) {
      setHTML(tip, content);
      tip.hidden = false;
      const rw = root.clientWidth, tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(0, x + 12), rw - tw)}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
    },
    hide() { tip.hidden = true; },
  };
}

/**
 * Multi-series line chart over ordered x points (e.g. sessions).
 * @param series [{ key, label, color: 'var(--series-1)', values: [number|null] }]
 * @param xLabels ['12 Mar', ...]
 */
export function lineChart(container, { series, xLabels, yMin = 0, yMax = 100, height = 240, valueFmt = (v) => Math.round(v) }) {
  ensureStyles();
  container.classList.add('viz-root');
  container.innerHTML = '';
  const W = Math.max(320, container.clientWidth || 600), H = height;
  const m = { l: 36, r: 76, t: 12, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = xLabels.length;
  const x = (i) => m.l + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Line chart: ${series.map((s) => s.label).join(', ')} by session` }, container);

  const g = el('g', { class: 'g' }, svg);
  for (const t of niceTicks(yMin, yMax, 4)) {
    el('line', { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t) }, g);
    el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, svg).textContent = String(t);
  }
  el('line', { class: 'ax', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, svg);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 80))));
  xLabels.forEach((lab, i) => {
    if (i % every && i !== n - 1) return;
    el('text', { x: x(i), y: H - 8, 'text-anchor': n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, svg).textContent = lab;
  });

  // Lines + markers
  const endLabels = [];
  for (const s of series) {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`;
      pen = true;
    });
    if (d) el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    s.values.forEach((v, i) => {
      if (v == null) return;
      el('circle', { cx: x(i), cy: y(v), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    });
    const lastI = s.values.reduce((acc, v, i) => (v != null ? i : acc), -1);
    if (lastI >= 0) endLabels.push({ s, i: lastI, yy: y(s.values[lastI]) });
  }
  // Direct labels at the line ends, nudged apart so they never collide.
  endLabels.sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < endLabels.length; k++) if (endLabels[k].yy - endLabels[k - 1].yy < 13) endLabels[k].yy = endLabels[k - 1].yy + 13;
  for (const e of endLabels) {
    el('text', { class: 'end-label', x: x(e.i) + 10, y: e.yy + 4 }, svg).textContent = e.s.label;
  }

  // Crosshair + tooltip
  const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, stroke: 'var(--viz-axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const hit = el('rect', { x: m.l - 10, y: m.t, width: iw + 20, height: ih, fill: 'transparent' }, svg);
  const tip = tooltip(container);
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const rows = series.map((s) => html`<div class="k"><span class="sw" style="background:${s.color}"></span>${s.label}<span class="v">${s.values[i] == null ? '–' : valueFmt(s.values[i])}</span></div>`);
    tip.show((x(i) / W) * r.width, (m.t / H) * r.height + 20, html`<div style="font-weight:600;margin-bottom:4px">${xLabels[i]}</div>${rows}`);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hide(); });
}

/**
 * Scatter with least-squares trend line.
 * @param points [{ x, y, label }]
 */
export function scatterChart(container, { points, xLabel, yLabel, height = 280, xFmt = (v) => v.toFixed(1), yFmt = (v) => v.toFixed(1) }) {
  ensureStyles();
  container.classList.add('viz-root');
  container.innerHTML = '';
  const W = Math.max(320, container.clientWidth || 600), H = height;
  const m = { l: 48, r: 16, t: 12, b: 40 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const pad = (lo, hi) => { const d = (hi - lo) || Math.abs(hi) || 1; return [lo - d * 0.08, hi + d * 0.08]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const X = (v) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Scatter plot of ${yLabel} against ${xLabel}` }, container);
  const g = el('g', { class: 'g' }, svg);
  for (const t of niceTicks(y0, y1, 4)) {
    el('line', { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t) }, g);
    el('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end' }, svg).textContent = String(t);
  }
  for (const t of niceTicks(x0, x1, 5)) el('text', { x: X(t), y: m.t + ih + 16, 'text-anchor': 'middle' }, svg).textContent = String(t);
  el('line', { class: 'ax', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }, svg);
  el('text', { x: m.l + iw / 2, y: H - 4, 'text-anchor': 'middle' }, svg).textContent = xLabel;
  const yl = el('text', { x: 12, y: m.t + ih / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${m.t + ih / 2})` }, svg);
  yl.textContent = yLabel;

  const fit = linearFit(points);
  if (fit) {
    el('line', { x1: X(x0), y1: Y(fit.a + fit.b * x0), x2: X(x1), y2: Y(fit.a + fit.b * x1), stroke: 'var(--viz-muted)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
  }
  const tip = tooltip(container);
  for (const p of points) {
    el('circle', { cx: X(p.x), cy: Y(p.y), r: 5, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
    const h = el('circle', { cx: X(p.x), cy: Y(p.y), r: 12, fill: 'transparent' }, svg);
    h.addEventListener('pointerenter', () => {
      const r = svg.getBoundingClientRect();
      tip.show((X(p.x) / W) * r.width, (Y(p.y) / H) * r.height, html`<div style="font-weight:600;margin-bottom:2px">${p.label}</div>
        <div class="k">${xLabel}<span class="v">${xFmt(p.x)}</span></div><div class="k">${yLabel}<span class="v">${yFmt(p.y)}</span></div>`);
    });
    h.addEventListener('pointerleave', () => tip.hide());
  }
}

export function linearFit(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  if (!sxx) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r: syy ? sxy / Math.sqrt(sxx * syy) : 0 };
}

export const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
export { esc };
