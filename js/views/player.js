import { db, deletePlayerCascade, deleteSessionCascade } from '../db.js';
import { html, setHTML, on, fmtDate, formDialog, confirmDialog, toast, STYLE_LABELS, GOALS, fmt } from '../util.js';
import { playerFormBody, readPlayerForm } from './teams.js';
import { scoreChip, metricValue } from './components.js';
import { lineChart, SERIES_COLORS } from './charts.js';
import { METRICS, METRIC_BY_ID } from '../biomech/reference.js';

export async function renderPlayer(app, nav, playerId) {
  const player = await db.get('players', playerId);
  if (!nav.alive()) return;
  if (!player) { setHTML(app, html`<div class="card empty"><h2>Player not found</h2><a class="btn" href="#/teams">All teams</a></div>`); return; }
  const [team, teams, sessions] = await Promise.all([db.get('teams', player.teamId), db.all('teams'), db.byIndex('sessions', 'playerId', playerId)]);
  if (!nav.alive()) return;
  sessions.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt);
  const newest = [...sessions].reverse();
  const withSummary = sessions.filter((s) => s.summary);
  const trendMetrics = METRICS.filter((m) => m.good && withSummary.some((s) => s.summary.metrics?.[m.id] != null));

  setHTML(app, html`
    <div class="crumbs"><a href="#/teams">Teams</a> / <a href="#/team/${team?.id}">${team?.name || 'Team'}</a> /</div>
    <div class="page-head">
      <div>
        <h1>${player.name}</h1>
        <div class="sub">${player.arm === 'left' ? 'Left-arm' : 'Right-arm'} ${STYLE_LABELS[player.style] || ''}${player.heightCm ? ` · ${player.heightCm} cm` : ''}${player.typicalSpeed ? ` · usually ${player.typicalSpeed} km/h` : ''}</div>
      </div>
      <div class="row">
        <button class="btn btn-ghost" data-act="edit">Edit profile</button>
        <button class="btn btn-ghost" data-act="delete">Delete</button>
        <a class="btn btn-primary" href="#/player/${player.id}/new">New analysis session</a>
      </div>
    </div>

    ${!player.heightCm ? html`<div class="callout warn" style="margin-bottom:16px">Add ${player.name}'s height to the profile. It's used to convert run-up speed from the video into metres per second.</div>` : ''}
    ${player.notes ? html`<div class="card tight" style="margin-bottom:16px"><div class="section-title">Notes</div>${player.notes}</div>` : ''}

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>Progress</h2>
          ${trendMetrics.length ? html`<select data-act="trend" aria-label="Chart" style="width:auto">
            <option value="__scores">Goal scores</option>
            ${trendMetrics.map((m) => html`<option value="${m.id}">${m.short}</option>`)}
          </select>` : ''}
        </div>
        ${withSummary.length >= 1 ? html`<div data-chart></div><div class="legend viz-root" data-legend style="margin-top:8px"></div>${withSummary.length === 1 ? html`<p class="muted" style="font-size:.85rem;margin:6px 0 0">Trends build up as more sessions are analysed.</p>` : ''}` : html`<p class="muted">Progress appears here after the first analysed session.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h2>Sessions</h2><span class="muted">${sessions.length}</span></div>
        ${newest.length ? html`<ul class="list-plain">${newest.map((s) => html`<li class="row">
          <a class="link-row" href="#/session/${s.id}" style="flex:1">
            <div>
              <div class="player-row-name">${fmtDate(s.date)} · ${GOALS[s.goal]?.label || ''} focus</div>
              <small class="muted">${s.summary ? `${s.summary.clipCount} clip(s)${s.summary.actionType ? ` · ${s.summary.actionType} action` : ''}` : 'Not analysed yet'}${s.notes ? ` · ${s.notes}` : ''}</small>
            </div>
          </a>
          ${s.summary?.injuryFlags ? html`<span class="chip work">${s.summary.injuryFlags} flag${s.summary.injuryFlags > 1 ? 's' : ''}</span>` : ''}
          ${scoreChip(s.summary?.goalScores?.[s.goal])}
          <button class="btn btn-ghost btn-sm" data-del-session="${s.id}" aria-label="Delete session">Delete</button>
        </li>`)}</ul>` : html`<div class="empty" style="padding:20px">
          <p>No sessions yet.</p>
          <a class="btn btn-primary" href="#/player/${player.id}/new">Start the first analysis</a>
        </div>`}
      </div>
    </div>
  `);

  const chartEl = app.querySelector('[data-chart]');
  const legendEl = app.querySelector('[data-legend]');
  const labels = withSummary.map((s) => fmtDate(s.date).replace(/ \d{4}$/, ''));
  const draw = (which) => {
    if (!chartEl) return;
    if (which === '__scores') {
      const series = ['pace', 'swing', 'accuracy'].map((g, k) => ({ key: g, label: GOALS[g].label, color: SERIES_COLORS[k], values: withSummary.map((s) => s.summary.goalScores?.[g] ?? null) }));
      lineChart(chartEl, { series, xLabels: labels, yMin: 0, yMax: 100 });
      setHTML(legendEl, html`${series.map((s) => html`<span><i style="background:${s.color}"></i>${s.label} score</span>`)}`);
    } else {
      const def = METRIC_BY_ID[which];
      const vals = withSummary.map((s) => s.summary.metrics?.[def.id] ?? null);
      const fin = vals.filter((v) => v != null);
      const lo = Math.min(...fin, def.good[0] === -Infinity ? Infinity : def.good[0]);
      const hiG = Number.isFinite(def.good[1]) ? def.good[1] : -Infinity;
      const hi = Math.max(...fin, hiG);
      const span = (hi - lo) || 10;
      lineChart(chartEl, { series: [{ key: def.id, label: def.short, color: SERIES_COLORS[0], values: vals }], xLabels: labels, yMin: Math.floor(lo - span * 0.15), yMax: Math.ceil(hi + span * 0.15), valueFmt: (v) => metricValue(def, v) });
      setHTML(legendEl, html`<span class="muted">Target range: ${def.good[0] === -Infinity ? '' : fmt(def.good[0], def.dp)}${Number.isFinite(def.good[1]) ? ` to ${fmt(def.good[1], def.dp)}` : ' or more'} ${def.unit}</span>`);
    }
  };
  draw('__scores');
  on(app, 'change', '[data-act="trend"]', (_e, sel) => draw(sel.value));
  const ro = new ResizeObserver(() => draw(app.querySelector('[data-act="trend"]')?.value || '__scores'));
  if (chartEl) ro.observe(chartEl.parentElement);
  nav.onLeave(() => ro.disconnect());

  on(app, 'click', '[data-act="edit"]', async () => {
    const fd = await formDialog({ title: 'Edit player', body: playerFormBody(player, teams) });
    if (!fd) return;
    await db.put('players', readPlayerForm(fd, player));
    toast('Profile saved. Open a session to re-run its analysis with the new details.');
    nav.refresh();
  });
  on(app, 'click', '[data-act="delete"]', async () => {
    const ok = await confirmDialog('Delete player?', `This permanently deletes ${player.name} and all ${sessions.length} of their sessions and videos on this device. This cannot be undone.`, 'Delete player');
    if (!ok) return;
    await deletePlayerCascade(player.id);
    toast('Player deleted.');
    location.hash = `#/team/${player.teamId}`;
  });
  on(app, 'click', '[data-del-session]', async (_e, b) => {
    const ok = await confirmDialog('Delete session?', 'This permanently deletes the session, its videos and results. This cannot be undone.', 'Delete session');
    if (!ok) return;
    await deleteSessionCascade(b.dataset.delSession);
    nav.refresh();
  });
}
