import { db, deleteTeamCascade } from '../db.js';
import { html, raw, setHTML, on, uid, fmtDate, formDialog, confirmDialog, toast, STYLE_LABELS, GOALS } from '../util.js';
import { scoreChip } from './components.js';

export function teamFormBody(t = {}) {
  return html`<div class="form-grid">
    <label class="field full">Team name<input type="text" name="name" required maxlength="80" value="${t.name || ''}" placeholder="e.g. 1st XI, U19 Academy"></label>
    <label class="field full">Notes<textarea name="notes" placeholder="Optional">${t.notes || ''}</textarea></label>
  </div>`;
}

export function playerFormBody(p = {}, teams = null) {
  return html`<div class="form-grid">
    <label class="field full">Name<input type="text" name="name" required maxlength="80" value="${p.name || ''}"></label>
    ${teams ? html`<label class="field full">Team<select name="teamId">${teams.map((t) => html`<option value="${t.id}" ${t.id === p.teamId ? raw('selected') : ''}>${t.name}</option>`)}</select></label>` : ''}
    <label class="field">Bowling arm<select name="arm">
      <option value="right" ${p.arm !== 'left' ? raw('selected') : ''}>Right-arm</option>
      <option value="left" ${p.arm === 'left' ? raw('selected') : ''}>Left-arm</option>
    </select></label>
    <label class="field">Bowling style<select name="style">
      ${Object.entries(STYLE_LABELS).map(([k, v]) => html`<option value="${k}" ${(p.style || 'fast-medium') === k ? raw('selected') : ''}>${v}</option>`)}
    </select></label>
    <label class="field">Height (cm)<span class="hint">Used to turn video distances into metres</span><input type="number" name="heightCm" min="120" max="225" step="1" value="${p.heightCm || ''}" placeholder="e.g. 185"></label>
    <label class="field">Usual speed (km/h)<span class="hint">Optional, from a speed gun</span><input type="number" name="typicalSpeed" min="50" max="170" step="0.5" value="${p.typicalSpeed || ''}"></label>
    <label class="field full">Notes<textarea name="notes" placeholder="Injury history, role, current focus…">${p.notes || ''}</textarea></label>
  </div>`;
}

export function readPlayerForm(fd, base = {}) {
  const num = (k) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
  return {
    ...base,
    name: String(fd.get('name') || '').trim(),
    teamId: fd.get('teamId') || base.teamId,
    arm: fd.get('arm') === 'left' ? 'left' : 'right',
    style: String(fd.get('style') || 'fast-medium'),
    heightCm: num('heightCm'),
    typicalSpeed: num('typicalSpeed'),
    notes: String(fd.get('notes') || '').trim(),
  };
}

export async function renderTeams(app, nav) {
  const [teams, players, sessions] = await Promise.all(['teams', 'players', 'sessions'].map((s) => db.all(s)));
  if (!nav.alive()) return;
  const count = (tid) => players.filter((p) => p.teamId === tid).length;
  const sessCount = (tid) => {
    const ids = new Set(players.filter((p) => p.teamId === tid).map((p) => p.id));
    return sessions.filter((s) => ids.has(s.playerId)).length;
  };
  teams.sort((a, b) => a.name.localeCompare(b.name));

  setHTML(app, html`
    <div class="page-head">
      <div><h1>Teams</h1><div class="sub">Organise bowlers into squads. Each player keeps their own analysis history.</div></div>
      <button class="btn btn-primary" data-act="new-team">New team</button>
    </div>
    ${teams.length ? html`<div class="grid grid-3">
      ${teams.map((t) => html`<a class="card link-row" href="#/team/${t.id}" style="flex-direction:column;align-items:flex-start;gap:6px">
        <span class="player-row-name" style="font-size:1.08rem">${t.name}</span>
        <span class="muted">${count(t.id)} player${count(t.id) === 1 ? '' : 's'} · ${sessCount(t.id)} session${sessCount(t.id) === 1 ? '' : 's'}</span>
        ${t.notes ? html`<small>${t.notes}</small>` : ''}
      </a>`)}
    </div>` : html`<div class="card empty">
      <h2>No teams yet</h2>
      <p>Create a team, then add your bowlers to it.</p>
      <button class="btn btn-primary" data-act="new-team">Create a team</button>
    </div>`}
  `);

  on(app, 'click', '[data-act="new-team"]', async () => {
    const fd = await formDialog({ title: 'New team', body: teamFormBody(), submitLabel: 'Create team' });
    if (!fd) return;
    const team = { id: uid(), name: String(fd.get('name')).trim(), notes: String(fd.get('notes') || '').trim(), createdAt: Date.now() };
    await db.put('teams', team);
    location.hash = `#/team/${team.id}`;
  });
}

export async function renderTeam(app, nav, teamId) {
  const team = await db.get('teams', teamId);
  if (!nav.alive()) return;
  if (!team) { setHTML(app, html`<div class="card empty"><h2>Team not found</h2><a class="btn" href="#/teams">All teams</a></div>`); return; }
  const players = (await db.byIndex('players', 'teamId', teamId)).sort((a, b) => a.name.localeCompare(b.name));
  const sessionsByPlayer = {};
  await Promise.all(players.map(async (p) => {
    sessionsByPlayer[p.id] = (await db.byIndex('sessions', 'playerId', p.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }));
  if (!nav.alive()) return;

  setHTML(app, html`
    <div class="crumbs"><a href="#/teams">Teams</a> /</div>
    <div class="page-head">
      <div><h1>${team.name}</h1>${team.notes ? html`<div class="sub">${team.notes}</div>` : ''}</div>
      <div class="row">
        <button class="btn btn-ghost" data-act="edit-team">Edit team</button>
        <button class="btn btn-ghost" data-act="delete-team">Delete</button>
        <button class="btn btn-primary" data-act="new-player">Add player</button>
      </div>
    </div>
    <div class="card">
      ${players.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>Player</th><th>Arm / style</th><th class="num">Height</th><th>Last session</th><th class="num">Pace</th><th class="num">Swing</th><th class="num">Accuracy</th><th class="num">Flags</th></tr></thead>
        <tbody>${players.map((p) => {
          const last = sessionsByPlayer[p.id][0];
          const gs = last?.summary?.goalScores || {};
          return html`<tr class="clickable" data-href="#/player/${p.id}">
            <td><span class="player-row-name">${p.name}</span></td>
            <td>${p.arm === 'left' ? 'Left-arm' : 'Right-arm'} ${STYLE_LABELS[p.style] || ''}</td>
            <td class="num">${p.heightCm ? `${p.heightCm} cm` : '–'}</td>
            <td>${last ? html`${fmtDate(last.date)} <small class="muted">· ${GOALS[last.goal]?.label}</small>` : html`<span class="muted">None yet</span>`}</td>
            <td class="num">${scoreChip(gs.pace)}</td>
            <td class="num">${scoreChip(gs.swing)}</td>
            <td class="num">${scoreChip(gs.accuracy)}</td>
            <td class="num">${last?.summary?.injuryFlags ? html`<span class="chip work">${last.summary.injuryFlags}</span>` : html`<span class="muted">–</span>`}</td>
          </tr>`;
        })}</tbody>
      </table></div>` : html`<div class="empty">
        <h2>No players in ${team.name}</h2>
        <p>Add a bowler to start analysing their action.</p>
        <button class="btn btn-primary" data-act="new-player">Add player</button>
      </div>`}
    </div>
    <p class="muted" style="margin-top:10px;font-size:.85rem">Scores are from each player's most recent session (0–100 against the research reference ranges). Flags are injury-risk patterns that need a coach review.</p>
  `);

  on(app, 'click', 'tr[data-href]', (_e, tr) => { location.hash = tr.dataset.href; });
  on(app, 'click', '[data-act="new-player"]', async () => {
    const fd = await formDialog({ title: `Add player to ${team.name}`, body: playerFormBody({ teamId }), submitLabel: 'Add player' });
    if (!fd) return;
    const p = readPlayerForm(fd, { id: uid(), teamId, createdAt: Date.now() });
    await db.put('players', p);
    toast(`${p.name} added.`);
    nav.refresh();
  });
  on(app, 'click', '[data-act="edit-team"]', async () => {
    const fd = await formDialog({ title: 'Edit team', body: teamFormBody(team) });
    if (!fd) return;
    await db.put('teams', { ...team, name: String(fd.get('name')).trim(), notes: String(fd.get('notes') || '').trim() });
    nav.refresh();
  });
  on(app, 'click', '[data-act="delete-team"]', async () => {
    const ok = await confirmDialog('Delete team?', `This permanently deletes ${team.name}, its ${players.length} player(s), and all their sessions and videos on this device. This cannot be undone.`, 'Delete team');
    if (!ok) return;
    await deleteTeamCascade(teamId);
    toast('Team deleted.');
    location.hash = '#/teams';
  });
}
