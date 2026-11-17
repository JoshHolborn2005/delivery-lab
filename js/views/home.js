import { db, exportBackup, importBackup } from '../db.js';
import { html, setHTML, fmtDate, GOALS, toast, on } from '../util.js';
import { MODELS, getModelChoice, setModelChoice } from '../pose/processor.js';
import { scoreChip } from './components.js';

export async function renderHome(app, nav) {
  const [teams, players, sessions, clips] = await Promise.all(['teams', 'players', 'sessions', 'clips'].map((s) => db.all(s)));
  if (!nav.alive()) return;
  const playerById = Object.fromEntries(players.map((p) => [p.id, p]));
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const recent = [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt).slice(0, 8);
  const logged = clips.filter((c) => c.outcome && (c.outcome.speedKmh || c.outcome.swing || c.outcome.accuracy)).length;
  const model = getModelChoice();

  setHTML(app, html`
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <div class="sub">Video-based action analysis for pace and seam bowlers.</div>
      </div>
      <div class="row">
        <a class="btn" href="#/guide">How to film</a>
        <a class="btn btn-primary" href="#/teams">${teams.length ? 'Teams and players' : 'Create your first team'}</a>
      </div>
    </div>

    ${!teams.length ? html`
      <div class="card" style="margin-bottom:16px">
        <h2>Getting started</h2>
        <ol style="margin:0;padding-left:20px">
          <li><a href="#/teams">Create a team</a> and add players, with bowling arm and height.</li>
          <li>Film 3–6 deliveries, mixing side-on and front-on. The <a href="#/guide">filming guide</a> shows where to put the camera.</li>
          <li>Open a player, start a new analysis session, choose the goal (pace, swing or accuracy) and upload the clips.</li>
          <li>Review the raw video next to the motion-capture view, then work through the focus areas and drills.</li>
        </ol>
      </div>` : ''}

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat"><span class="value">${teams.length}</span><span class="label">Teams</span></div>
      <div class="card stat"><span class="value">${players.length}</span><span class="label">Players</span></div>
      <div class="card stat"><span class="value">${sessions.length}</span><span class="label">Analysis sessions</span></div>
      <div class="card stat"><span class="value">${clips.length}</span><span class="label">Deliveries filmed (${logged} with outcomes)</span></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>Recent sessions</h2></div>
        ${recent.length ? html`
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Date</th><th>Player</th><th>Goal</th><th class="num">Goal score</th></tr></thead>
            <tbody>${recent.map((s) => {
              const p = playerById[s.playerId];
              const g = s.goal || 'pace';
              return html`<tr class="clickable" data-href="#/session/${s.id}">
                <td>${fmtDate(s.date)}</td>
                <td><span class="player-row-name">${p?.name || 'Unknown'}</span><br><small>${teamById[p?.teamId]?.name || ''}</small></td>
                <td>${GOALS[g]?.label}</td>
                <td class="num">${scoreChip(s.summary?.goalScores?.[g])}</td>
              </tr>`;
            })}</tbody>
          </table></div>` : html`<p class="muted">No sessions yet. Open a player and start a new analysis.</p>`}
      </div>

      <div class="stack">
        <div class="card">
          <h2>Analysis quality</h2>
          <p class="muted">Body tracking runs on this device. The high-accuracy model is more precise on fast arm movement but takes about 3× longer.</p>
          <div class="seg" role="radiogroup" aria-label="Pose model">
            ${Object.entries(MODELS).map(([k, m]) => html`<button type="button" data-model="${k}" class="${k === model ? 'active' : ''}" role="radio" aria-checked="${k === model}">${m.label}</button>`)}
          </div>
        </div>
        <div class="card">
          <h2>Data on this device</h2>
          <p class="muted">Teams, players, videos and results are stored in this browser only. Export a backup regularly (results only, no videos) so you can move it to another device or share it with the coaching staff.</p>
          <div class="row">
            <button class="btn" data-act="export">Export backup</button>
            <label class="btn">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
          </div>
        </div>
      </div>
    </div>
  `);

  on(app, 'click', 'tr[data-href]', (_e, tr) => { location.hash = tr.dataset.href; });
  on(app, 'click', '[data-model]', (_e, b) => {
    setModelChoice(b.dataset.model);
    app.querySelectorAll('[data-model]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    toast('Model saved. New clips will use it, and you can re-process old sessions from the session page.');
  });
  on(app, 'click', '[data-act="export"]', async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delivery-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  on(app, 'change', '[data-act="import"]', async (_e, input) => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      toast('Backup imported.');
      nav.refresh();
    } catch (e) {
      toast(e.message || 'Import failed.');
    }
  });
}
