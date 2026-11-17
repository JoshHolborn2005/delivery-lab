import { html, setHTML, on, GOALS } from '../util.js';
import { DRILLS } from '../biomech/drills.js';
import { METRICS, SOURCES, INJURY_RULES } from '../biomech/reference.js';
import { rangeText, evidenceChip, sourceList } from './components.js';

export async function renderLibrary(app) {
  let tab = 'drills';
  let goal = '';

  function draw() {
    const drills = Object.entries(DRILLS).filter(([, d]) => !goal || d.goals.includes(goal));
    setHTML(app, html`
      <div class="page-head"><div><h1>Drills &amp; research</h1><div class="sub">The drill library and the reference model behind every breakdown.</div></div></div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="drills" class="${tab === 'drills' ? 'active' : ''}" aria-selected="${tab === 'drills'}">Drills</button>
        <button role="tab" data-tab="model" class="${tab === 'model' ? 'active' : ''}" aria-selected="${tab === 'model'}">Reference model</button>
        <button role="tab" data-tab="sources" class="${tab === 'sources' ? 'active' : ''}" aria-selected="${tab === 'sources'}">Sources</button>
      </div>
      ${tab === 'drills' ? html`
        <div class="seg" style="margin-bottom:14px">
          <button data-goalf="" class="${!goal ? 'active' : ''}">All</button>
          ${Object.entries(GOALS).map(([k, g]) => html`<button data-goalf="${k}" class="${goal === k ? 'active' : ''}">${g.label}</button>`)}
        </div>
        <div class="grid grid-2">${drills.map(([id, d]) => html`<div class="card">
          <div class="card-head"><h3>${d.name}</h3><div class="row" style="gap:4px">${d.goals.map((g) => html`<span class="chip">${GOALS[g].label}</span>`)}${d.injury ? html`<span class="chip work">Injury prevention</span>` : ''}</div></div>
          <p class="muted">${d.purpose}</p>
          <ol style="padding-left:18px;margin:0 0 8px">${d.steps.map((s) => html`<li>${s}</li>`)}</ol>
          <div style="font-size:.85rem"><strong>Dose:</strong> ${d.dose}<br><strong>Kit:</strong> ${d.equipment}</div>
        </div>`)}</div>` : ''}
      ${tab === 'model' ? html`
        <div class="callout" style="margin-bottom:14px">These are the starting reference ranges for senior pace and seam bowlers. They come from published biomechanics research and coaching guidance, and each one is labelled with how strong the evidence is. As your squad logs outcomes, the <a href="#/insights">Insights</a> page shows whether the same relationships hold for your players.</div>
        <div class="card"><div class="table-wrap"><table class="table">
          <thead><tr><th>Measurement</th><th>Camera</th><th>Target</th><th>Pace</th><th>Swing</th><th>Accuracy</th><th>Evidence</th></tr></thead>
          <tbody>${METRICS.map((m) => html`<tr>
            <td style="min-width:240px"><strong>${m.label}</strong><br><small class="muted">${m.what}</small></td>
            <td><small>${m.view === 'side' ? 'Side-on' : m.view === 'front' ? 'Front-on' : 'Session'}</small></td>
            <td><small>${rangeText(m)}</small></td>
            ${['pace', 'swing', 'accuracy'].map((g) => html`<td>${'●'.repeat(m.weights[g] || 0) || html`<span class="muted">–</span>`}</td>`)}
            <td>${evidenceChip(m.evidence)}</td>
          </tr>`)}</tbody>
        </table></div></div>
        <div class="card" style="margin-top:16px"><h2>Injury-risk screening</h2>
          <ul>${INJURY_RULES.map((r) => html`<li><strong>${r.title}</strong>: caution and high-risk thresholds as described in the session breakdown.${sourceList(r.sources)}</li>`)}</ul>
        </div>` : ''}
      ${tab === 'sources' ? html`<div class="card">
        <ul class="list-plain">${Object.entries(SOURCES).map(([, s]) => html`<li>${s}</li>`)}</ul>
        <p class="muted" style="font-size:.85rem;margin-top:10px">Ranges are simplified for coaching use and adapted to what can be measured from single-camera video. A qualified biomechanist should review them before high-stakes use.</p>
      </div>` : ''}
    `);
  }
  draw();
  on(app, 'click', '[data-tab]', (_e, b) => { tab = b.dataset.tab; draw(); });
  on(app, 'click', '[data-goalf]', (_e, b) => { goal = b.dataset.goalf; draw(); });
}
