// Squad database: tests which action traits go with logged outcomes (speed, swing, accuracy)
// across every analysed delivery on this device.

import { db } from '../db.js';
import { html, raw, setHTML, on, fmt, fmtDate, median } from '../util.js';
import { METRICS, METRIC_BY_ID } from '../biomech/reference.js';
import { metricValue, rangeText, statusChip } from './components.js';
import { scatterChart } from './charts.js';
import { scoreMetric } from '../biomech/analysis.js';

const OUTCOMES = {
  pace: { label: 'Speed (km/h)', get: (o) => (Number.isFinite(o?.speedKmh) ? o.speedKmh : null), fmt: (v) => v.toFixed(1) },
  swing: { label: 'Swing amount (0 none · 1 slight · 2 big)', get: (o) => (!o?.swing ? null : o.swing === 'none' ? 0 : o.swing.endsWith('big') ? 2 : 1), fmt: (v) => ['None', 'Slight', 'Big'][Math.round(v)] ?? v },
  accuracy: { label: 'Accuracy (0 miss · 1 close · 2 target)', get: (o) => (!o?.accuracy ? null : { miss: 0, near: 1, target: 2 }[o.accuracy] ?? null), fmt: (v) => ['Miss', 'Close', 'Target'][Math.round(v)] ?? v },
};
const MIN_N = 8;

export async function renderInsights(app, nav) {
  const [teams, players, sessions, clips] = await Promise.all(['teams', 'players', 'sessions', 'clips'].map((s) => db.all(s)));
  if (!nav.alive()) return;
  const sessionById = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const playerById = Object.fromEntries(players.map((p) => [p.id, p]));
  const all = clips.filter((c) => c.status === 'done' && c.metrics).map((c) => {
    const s = sessionById[c.sessionId], p = playerById[s?.playerId];
    return { clip: c, session: s, player: p, teamId: p?.teamId };
  }).filter((d) => d.player);
  const metricDefs = METRICS.filter((m) => m.view !== 'session');
  const state = { team: '', metric: 'frontKneeBR', outcome: 'pace' };

  setHTML(app, html`
    <div class="page-head">
      <div><h1>Insights</h1><div class="sub">Your squad's own database. Which parts of the action go with more pace, swing and accuracy, based on deliveries you've filmed and logged.</div></div>
      <label class="field" style="min-width:200px">Team<select data-team>
        <option value="">All teams</option>${teams.map((t) => html`<option value="${t.id}">${t.name}</option>`)}
      </select></label>
    </div>
    <div data-body></div>
  `);

  const body = app.querySelector('[data-body]');

  function draw() {
    const rows = all.filter((d) => !state.team || d.teamId === state.team);
    const withOutcome = (k) => rows.filter((d) => OUTCOMES[k].get(d.clip.outcome) != null).length;
    const nPlayers = new Set(rows.map((d) => d.player.id)).size;

    const corr = metricDefs.map((def) => {
      const res = {};
      for (const k of Object.keys(OUTCOMES)) {
        const pts = rows.filter((d) => d.clip.view === def.view && Number.isFinite(d.clip.metrics[def.id]) && OUTCOMES[k].get(d.clip.outcome) != null)
          .map((d) => [d.clip.metrics[def.id], OUTCOMES[k].get(d.clip.outcome)]);
        res[k] = { n: pts.length, rho: pts.length >= 3 ? spearman(pts) : null };
      }
      const vals = rows.filter((d) => d.clip.view === def.view).map((d) => d.clip.metrics[def.id]).filter(Number.isFinite);
      return { def, res, squadMedian: median(vals), nVals: vals.length };
    });

    if (!rows.length) {
      setHTML(body, html`<div class="card empty"><h2>No analysed deliveries yet</h2><p>Analyse some sessions and log the outcome of each clip (speed-gun reading, swing, whether it hit the target). The patterns appear here as the database grows.</p></div>`);
      return;
    }

    setHTML(body, html`
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat"><span class="value">${rows.length}</span><span class="label">Analysed deliveries</span></div>
        <div class="card stat"><span class="value">${nPlayers}</span><span class="label">Bowlers</span></div>
        <div class="card stat"><span class="value">${withOutcome('pace')}</span><span class="label">With speed logged</span></div>
        <div class="card stat"><span class="value">${withOutcome('swing')} / ${withOutcome('accuracy')}</span><span class="label">With swing / accuracy logged</span></div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h2>What goes with results in your squad</h2></div>
        <p class="muted" style="font-size:.88rem">Rank correlation (ρ) between each measurement and the logged outcome: +1 = higher values always go with better outcomes, −1 = the opposite, 0 = no link. Shown once at least ${MIN_N} deliveries have both. Differences between bowlers dominate small datasets, so treat this as a prompt for coaching conversations, not proof of cause.</p>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Measurement</th><th>View</th><th class="num">Squad median</th><th>Research target</th><th class="num">vs Speed</th><th class="num">vs Swing</th><th class="num">vs Accuracy</th></tr></thead>
          <tbody>${corr.map((c) => html`<tr class="clickable" data-pick="${c.def.id}">
            <td><span style="font-weight:600">${c.def.short}</span></td>
            <td><small>${c.def.view === 'side' ? 'Side-on' : 'Front-on'}</small></td>
            <td class="num">${metricValue(c.def, c.squadMedian)} ${c.def.good && c.squadMedian != null ? statusChip(scoreMetric(c.def, c.squadMedian)?.status) : ''}</td>
            <td><small>${rangeText(c.def)}</small></td>
            ${Object.keys(OUTCOMES).map((k) => html`<td class="num">${rhoCell(c.res[k])}</td>`)}
          </tr>`)}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Explore a relationship</h2>
          <div class="row">
            <select data-metric aria-label="Measurement" style="width:auto">${metricDefs.map((d) => html`<option value="${d.id}" ${d.id === state.metric ? raw('selected') : ''}>${d.short}</option>`)}</select>
            <span class="muted">vs</span>
            <select data-outcome aria-label="Outcome" style="width:auto">${Object.entries(OUTCOMES).map(([k, o]) => html`<option value="${k}" ${k === state.outcome ? raw('selected') : ''}>${o.label}</option>`)}</select>
          </div>
        </div>
        <div data-scatter></div>
        <p class="muted" data-scatter-note style="font-size:.85rem;margin:8px 0 0"></p>
      </div>
    `);
    drawScatter(rows);
  }

  function drawScatter(rows) {
    const def = METRIC_BY_ID[state.metric], out = OUTCOMES[state.outcome];
    const pts = rows.filter((d) => d.clip.view === def.view && Number.isFinite(d.clip.metrics[def.id]) && out.get(d.clip.outcome) != null)
      .map((d) => ({ x: d.clip.metrics[def.id], y: out.get(d.clip.outcome), label: `${d.player.name} · ${fmtDate(d.session.date)}` }));
    const el = body.querySelector('[data-scatter]');
    const note = body.querySelector('[data-scatter-note]');
    if (pts.length < 2) {
      setHTML(el, html`<div class="empty" style="padding:30px">Not enough deliveries with both <strong>${def.short}</strong> (${def.view === 'side' ? 'side-on' : 'front-on'} clips) and <strong>${out.label.split(' (')[0].toLowerCase()}</strong> logged yet.</div>`);
      note.textContent = '';
      return;
    }
    scatterChart(el, { points: pts, xLabel: `${def.short} (${def.unit})`, yLabel: out.label.split(' (')[0], xFmt: (v) => fmt(v, def.dp), yFmt: out.fmt });
    const rho = spearman(pts.map((p) => [p.x, p.y]));
    note.textContent = `${pts.length} deliveries · ρ = ${rho == null ? '–' : rho.toFixed(2)}${pts.length < MIN_N ? ` · fewer than ${MIN_N} deliveries, too few to read much into` : ''}. Dashed line = linear trend.`;
  }

  draw();
  on(app, 'change', '[data-team]', (_e, s) => { state.team = s.value; draw(); });
  on(app, 'change', '[data-metric]', (_e, s) => { state.metric = s.value; drawScatter(all.filter((d) => !state.team || d.teamId === state.team)); });
  on(app, 'change', '[data-outcome]', (_e, s) => { state.outcome = s.value; drawScatter(all.filter((d) => !state.team || d.teamId === state.team)); });
  on(app, 'click', '[data-pick]', (_e, tr) => {
    state.metric = tr.dataset.pick;
    const sel = app.querySelector('[data-metric]');
    sel.value = state.metric;
    drawScatter(all.filter((d) => !state.team || d.teamId === state.team));
    sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function rhoCell(r) {
  if (r.n < MIN_N || r.rho == null) return html`<small class="muted" title="Need ${MIN_N}+ deliveries">n=${r.n}</small>`;
  const a = Math.abs(r.rho);
  const strength = a >= 0.6 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'none';
  const cls = strength === 'strong' || strength === 'moderate' ? 'accent' : strength === 'weak' ? 'info' : '';
  return html`<span class="chip ${cls}" title="${strength} link, n=${r.n}">${r.rho > 0 ? '+' : ''}${r.rho.toFixed(2)}</span><br><small class="muted">n=${r.n}</small>`;
}

/** Spearman rank correlation of [x, y] pairs (average ranks for ties). */
export function spearman(pairs) {
  if (pairs.length < 3) return null;
  const rank = (vals) => {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(vals.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(pairs.map((p) => p[0])), ry = rank(pairs.map((p) => p[1]));
  const n = pairs.length, mx = (n + 1) / 2;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - mx); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - mx) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
