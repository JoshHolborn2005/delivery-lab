import { db, deleteSessionCascade, deleteClipCascade } from '../db.js';
import { html, raw, setHTML, on, fmtDate, GOALS, VIEW_LABELS, toast, confirmDialog, fmt } from '../util.js';
import { processVideo } from '../pose/processor.js';
import { analyseClip, clipMeta } from '../biomech/index.js';
import { analyseSession, sessionSummary, scoreMetric, GOAL_KEYS } from '../biomech/analysis.js';
import { METRICS } from '../biomech/reference.js';
import { createDualPlayer } from './dualPlayer.js';
import { statusChip, metricValue, rangeText, rangeBar, drillItem, sourceList, scoreRing, evidenceChip } from './components.js';
import { outcomeFields, cleanOutcome, SLOW_OPTIONS } from './newSession.js';

export async function renderSession(app, nav, sessionId) {
  const session = await db.get('sessions', sessionId);
  if (!nav.alive()) return;
  if (!session) { setHTML(app, html`<div class="card empty"><h2>Session not found</h2><a class="btn" href="#/teams">All teams</a></div>`); return; }
  const player = await db.get('players', session.playerId);
  const team = player ? await db.get('teams', player.teamId) : null;
  let clips = (await db.byIndex('clips', 'sessionId', sessionId)).sort((a, b) => a.order - b.order);
  if (!nav.alive()) return;

  const results = new Map(); // clipId -> { s, events, metrics, pose }
  let analysis = null;
  let selectedId = null;
  let playerUI = null;
  let ctrl = new AbortController();
  nav.onLeave(() => { ctrl.abort(); playerUI?.destroy(); });

  setHTML(app, html`
    <div class="crumbs"><a href="#/teams">Teams</a> / <a href="#/team/${team?.id}">${team?.name || ''}</a> / <a href="#/player/${player?.id}">${player?.name || 'Player'}</a> /</div>
    <div class="page-head">
      <div>
        <h1>${player?.name || 'Player'}: ${fmtDate(session.date)}</h1>
        <div class="sub">${player?.arm === 'left' ? 'Left' : 'Right'}-arm · ${clips.length} clip${clips.length === 1 ? '' : 's'}${session.notes ? ` · ${session.notes}` : ''}</div>
      </div>
      <div class="row">
        <span class="muted" style="font-size:.85rem">Main goal</span>
        <div class="seg" role="radiogroup" aria-label="Session goal" data-goal-seg>
          ${GOAL_KEYS.map((g) => html`<button type="button" data-goal="${g}" class="${session.goal === g ? 'active' : ''}" role="radio" aria-checked="${session.goal === g}">${GOALS[g].label}</button>`)}
        </div>
        <button class="btn btn-ghost" data-act="reprocess" title="Run body tracking again (e.g. after switching to the high-accuracy model)">Re-process</button>
        <button class="btn btn-ghost" data-act="delete">Delete</button>
      </div>
    </div>
    <div data-proc></div>
    <div class="stack">
      <div data-injury></div>
      <div data-summary></div>
      <div class="card" data-viewer-card>
        <div class="card-head"><h2>Delivery viewer</h2><span class="muted" style="font-size:.85rem">Scrub, step frame by frame, or use ← → on the timeline</span></div>
        <div class="clip-strip" data-strip></div>
        <div data-viewer style="margin-top:14px"></div>
        <div data-clip-detail style="margin-top:16px"></div>
      </div>
      <div data-focus></div>
      <div data-table></div>
      <p class="muted" style="font-size:.82rem">Measurements are estimates from single-camera 2D video using a general-purpose body-tracking model. Expect a few degrees of error, more on low-frame-rate or poorly lit footage. Reference ranges come from published research on senior fast bowlers and from coaching guidance, and are a guide, not a rule. Injury flags are screening prompts, not a medical assessment. Have a qualified coach or physio review them.</p>
    </div>
  `);

  const $ = (sel) => app.querySelector(sel);

  // ------------------------------------------------------------ processing
  async function processPending() {
    const pending = clips.filter((c) => c.status !== 'done' && !c.imported);
    if (!pending.length) return;
    const proc = $('[data-proc]');
    setHTML(proc, html`<div class="card" style="margin-bottom:16px">
      <div class="card-head"><h2>Analysing ${pending.length} clip${pending.length > 1 ? 's' : ''}</h2><span class="muted" data-proc-label></span></div>
      <div class="proc-list">${pending.map((c) => html`<div class="proc-item" data-proc-id="${c.id}">
        <span>Clip ${c.order + 1} · ${VIEW_LABELS[c.view]}</span><div class="progress"><span></span></div><span class="num muted" data-pct>Queued</span>
      </div>`)}</div>
      <p class="muted" style="margin:10px 0 0;font-size:.85rem">Keep this page open while it runs. The first run downloads the body-tracking model.</p>
    </div>`);
    for (const c of pending) {
      const row = proc.querySelector(`[data-proc-id="${c.id}"]`);
      const bar = row.querySelector('.progress > span'), pct = row.querySelector('[data-pct]'), label = proc.querySelector('[data-proc-label]');
      try {
        const vid = await db.get('videos', c.id);
        if (!vid) throw new Error('The video file is missing on this device.');
        const { pose, thumb } = await processVideo(vid.blob, {
          slowFactor: c.slowFactor, trim: c.trim, signal: ctrl.signal,
          onProgress: (f, l) => { bar.style.width = `${Math.round(f * 100)}%`; pct.textContent = `${Math.round(f * 100)}%`; label.textContent = l || ''; },
        });
        await db.put('poses', { clipId: c.id, ...pose });
        Object.assign(c, { status: 'done', thumb, error: null, processedAt: Date.now() });
        await db.put('clips', c);
        pct.textContent = 'Done';
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error(e);
        Object.assign(c, { status: 'error', error: e.message || String(e) });
        await db.put('clips', c);
        pct.textContent = 'Failed';
      }
    }
    if (nav.alive()) setHTML(proc, '');
  }

  function reanalyse(c, pose) {
    const r = analyseClip(pose, clipMeta(c, player), c.manualEvents || {});
    results.set(c.id, { ...r, pose });
    const before = JSON.stringify([c.events, c.metrics, c.info, c.warnings]);
    Object.assign(c, { events: r.events, metrics: r.metrics, info: r.info, warnings: r.warnings });
    if (JSON.stringify([c.events, c.metrics, c.info, c.warnings]) !== before) db.put('clips', c);
  }

  async function loadAndAnalyse() {
    for (const c of clips) {
      if (c.status !== 'done' || results.has(c.id)) continue;
      const pose = await db.get('poses', c.id);
      if (pose) reanalyse(c, pose);
    }
    await refreshSession();
  }

  async function refreshSession() {
    analysis = analyseSession(clips, session.goal);
    session.summary = sessionSummary(analysis);
    await db.put('sessions', session);
  }

  // ------------------------------------------------------------ rendering
  function renderInjury() {
    const el = $('[data-injury]');
    const inj = analysis.injuries;
    const hasFront = clips.some((c) => c.view === 'front' && c.status === 'done');
    if (!analysis.clipCount) { setHTML(el, ''); return; }
    if (!inj.length) {
      setHTML(el, hasFront
        ? html`<div class="callout"><strong>Injury screen:</strong> no mixed-action or excessive side-bend pattern found in the front-on clips.</div>`
        : html`<div class="callout warn"><strong>Injury screen not possible:</strong> no front-on clip in this session. Mixed-action screening needs a front-on view.</div>`);
      return;
    }
    const high = inj.some((i) => i.level === 'high');
    const drills = [...new Set(inj.flatMap((i) => i.rule.drills))];
    const sources = [...new Set(inj.flatMap((i) => i.rule.sources))];
    setHTML(el, html`<div class="injury-banner ${high ? '' : 'caution'}" role="alert">
      <h3>⚠ ${high ? 'Injury-risk pattern found' : 'Injury-risk caution'}: coach review recommended</h3>
      <ul>${inj.map((i) => html`<li><strong>${i.rule.title}.</strong> ${i.rule.message(i.value)}${i.totalClips > 1 ? ` Seen in ${i.flaggedClips} of ${i.totalClips} front-on clips.` : ''}</li>`)}</ul>
      <p style="margin:10px 0 6px">Before changing technique, have a qualified coach confirm this on video. If ${player?.name || 'the bowler'} has any back pain, refer them to a physio and manage bowling workload.</p>
      <div class="focus-cols">
        <div><div class="section-title">Suggested work</div><ul class="drill-list">${drills.map(drillItem)}</ul></div>
        <div><div class="section-title">Research</div>${sourceList(sources)}</div>
      </div>
    </div>`);
  }

  function renderSummary() {
    const el = $('[data-summary]');
    if (!analysis.clipCount && clips.some((c) => c.status === 'pending')) {
      setHTML(el, html`<div class="card muted">The breakdown appears here once the clips have been processed.</div>`);
      return;
    }
    if (!analysis.clipCount) {
      const errs = clips.filter((c) => c.status === 'error');
      setHTML(el, html`<div class="card empty"><h2>No clips could be analysed yet</h2>
        ${errs.length ? html`<ul style="text-align:left;display:inline-block">${errs.map((c) => html`<li>Clip ${c.order + 1}: ${c.error}</li>`)}</ul>` : ''}
        <p>Check the <a href="#/guide">filming guide</a>, then retry from the clip list below.</p></div>`);
      return;
    }
    const g = session.goal;
    setHTML(el, html`<div class="card">
      <div class="card-head"><h2>Action scores</h2><span class="muted" style="font-size:.85rem">0–100 against the senior pace-bowling reference model</span></div>
      <div class="scores">${GOAL_KEYS.map((k) => {
        const gs = analysis.goalScores[k];
        return html`<div class="score-card ${k === g ? 'main' : ''}">
          ${scoreRing(gs.score)}
          <div><div class="goal-name">${GOALS[k].label}${k === g ? ' · main goal' : ''}</div>
          <div class="goal-sub">${gs.score == null ? 'Not measurable from these clips' : gs.coverage < 0.999 ? `Based on ${Math.round(gs.coverage * 100)}% of the model` : 'Full model'}</div></div>
        </div>`;
      })}</div>
      <div class="grid grid-2" style="margin-top:16px">
        <dl class="kv">
          <dt>Action type</dt><dd>${analysis.actionType || html`<span class="muted">Needs a front-on clip</span>`}${analysis.mixedClips && analysis.actionType !== 'Mixed' ? html` <span class="chip work">mixed in ${analysis.mixedClips} clip(s)</span>` : ''}</dd>
          <dt>Front-knee technique</dt><dd>${analysis.kneeType || html`<span class="muted">Needs a side-on clip</span>`}</dd>
          <dt>Clips analysed</dt><dd>${analysis.clipCount} of ${clips.length}</dd>
        </dl>
        <div>
          ${analysis.strengths.length ? html`<div class="section-title">Working well for ${GOALS[g].label.toLowerCase()}</div>
            <div class="row" style="gap:6px">${analysis.strengths.map((d) => html`<span class="chip good">${d.short}</span>`)}</div>` : ''}
          ${analysis.swingTendency ? html`<div class="section-title" style="margin-top:10px">Swing tendency <span class="chip" style="text-transform:none;letter-spacing:0">coaching consensus</span></div><p style="font-size:.9rem;margin:0">${analysis.swingTendency}</p>` : ''}
        </div>
      </div>
      ${analysis.gaps.length ? html`<div class="callout" style="margin-top:14px"><strong>To complete the picture</strong><ul>${analysis.gaps.map((x) => html`<li>${x}</li>`)}</ul></div>` : ''}
    </div>`);
  }

  function renderStrip() {
    setHTML($('[data-strip]'), html`${clips.map((c) => html`<button type="button" class="clip-tab ${c.id === selectedId ? 'active' : ''}" data-clip="${c.id}">
      ${c.thumb ? html`<img src="${c.thumb}" alt="">` : html`<span class="thumb-ph"></span>`}
      <span><span class="t1">Clip ${c.order + 1} · ${VIEW_LABELS[c.view]}</span>
      <span class="t2">${c.status === 'done' ? (c.outcome?.speedKmh ? `${c.outcome.speedKmh} km/h` : c.imported ? 'Results only' : 'Analysed') : c.status === 'error' ? 'Failed: tap to retry' : 'Pending'}</span></span>
    </button>`)}`);
  }

  async function selectClip(id) {
    selectedId = id;
    renderStrip();
    playerUI?.destroy();
    playerUI = null;
    const c = clips.find((x) => x.id === id);
    const viewer = $('[data-viewer]');
    if (!c) { setHTML(viewer, ''); setHTML($('[data-clip-detail]'), ''); return; }
    const r = results.get(c.id);
    if (c.status === 'error') {
      setHTML(viewer, html`<div class="callout warn"><strong>This clip could not be analysed.</strong> ${c.error}<div class="row" style="margin-top:10px"><button class="btn btn-sm" data-retry="${c.id}">Retry</button><button class="btn btn-sm btn-ghost" data-del-clip="${c.id}">Remove clip</button></div></div>`);
      setHTML($('[data-clip-detail]'), '');
      return;
    }
    if (!r) {
      setHTML(viewer, html`<div class="callout">${c.imported ? 'This clip was imported from a backup. Its results are included, but the video is not on this device.' : 'Not analysed yet.'}</div>`);
    } else {
      const vid = await db.get('videos', c.id);
      if (!nav.alive() || selectedId !== id) return;
      if (!vid) setHTML(viewer, html`<div class="callout warn">The video file is missing on this device.</div>`);
      else {
        playerUI = createDualPlayer(viewer, {
          videoBlob: vid.blob, series: r.s, events: r.events, meta: clipMeta(c, player),
          onSetEvent: (key, frame) => setEvent(c, key, frame),
          onResetEvent: (key) => setEvent(c, key, null),
        });
      }
    }
    renderClipDetail(c);
  }

  async function setEvent(c, key, frame) {
    const manual = { ...(c.manualEvents || {}) };
    if (frame == null) delete manual[key]; else manual[key] = frame;
    c.manualEvents = manual;
    const r0 = results.get(c.id);
    reanalyse(c, r0.pose);
    await db.put('clips', c);
    await refreshSession();
    const r = results.get(c.id);
    playerUI?.update(r.events, r.s);
    renderClipDetail(c);
    renderBreakdown();
    toast(frame == null ? 'Back to auto-detection.' : 'Event updated and metrics recalculated.');
  }

  function renderClipDetail(c) {
    const defs = METRICS.filter((d) => d.view === c.view);
    const m = c.metrics || {};
    setHTML($('[data-clip-detail]'), html`
      ${c.warnings?.length ? html`<div class="callout warn" style="margin-bottom:14px"><strong>Notes on this clip</strong><ul>${c.warnings.map((w) => html`<li>${w}</li>`)}</ul></div>` : ''}
      <div class="grid grid-2">
        <div>
          <div class="section-title">This clip (${VIEW_LABELS[c.view]})</div>
          <div class="table-wrap"><table class="table">
            <tbody>${defs.map((d) => {
              const sc = d.good ? scoreOf(d, m[d.id]) : null;
              return html`<tr><td>${d.short}</td><td class="num"><strong>${metricValue(d, m[d.id])}</strong></td><td>${d.good ? statusChip(sc?.status) : html`<span class="chip">Info</span>`}</td></tr>`;
            })}
            ${c.info?.actionType ? html`<tr><td>Action type</td><td class="num" colspan="2"><strong>${c.info.actionType}</strong></td></tr>` : ''}
            ${c.info?.cameraSide ? html`<tr><td>Camera</td><td class="num" colspan="2">${c.info.cameraSide === 'front' ? 'In front of the bowler' : 'Behind the bowler'} <small class="muted">(${c.info.cameraSideHow === 'set' ? 'set by coach' : 'auto-detected'})</small></td></tr>` : ''}
            ${c.info?.kneeType ? html`<tr><td>Front-knee technique</td><td class="num" colspan="2"><strong>${c.info.kneeType}</strong></td></tr>` : ''}
            </tbody>
          </table></div>
          ${c.info?.speedNote ? html`<p class="muted" style="font-size:.82rem">${c.info.speedNote}</p>` : ''}
        </div>
        <form data-clip-form="${c.id}">
          <div class="section-title">Clip settings</div>
          <div class="form-grid">
            <label class="field">Camera angle<select name="view">
              <option value="side" ${c.view === 'side' ? raw('selected') : ''}>Side-on</option>
              <option value="front" ${c.view === 'front' ? raw('selected') : ''}>Front-on</option>
            </select></label>
            <label class="field">Playback speed<select name="slowFactor">${SLOW_OPTIONS.map((o) => html`<option value="${o.v}" ${Number(c.slowFactor) === o.v ? raw('selected') : ''}>${o.label}</option>`)}</select></label>
            ${c.view === 'front' ? html`<label class="field full">Front-on camera position<select name="cameraSide">
              ${[['auto', 'Auto-detect'], ['behind', 'Behind the bowler'], ['front', 'In front of the bowler']].map(([v, l]) => html`<option value="${v}" ${(c.cameraSide || 'auto') === v ? raw('selected') : ''}>${l}</option>`)}
            </select></label>` : ''}
          </div>
          <div class="section-title" style="margin-top:14px">Delivery outcome <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">(feeds Insights)</span></div>
          <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${outcomeFields(c.outcome || {})}</div>
          <div class="row" style="margin-top:12px">
            ${c.manualEvents && Object.keys(c.manualEvents).length ? html`<button type="button" class="btn btn-sm" data-reset-all="${c.id}">Reset all events to auto</button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-sm btn-ghost" data-del-clip="${c.id}">Remove clip</button>
          </div>
        </form>
      </div>`);
  }

  function renderFocus() {
    const g = session.goal;
    const el = $('[data-focus]');
    if (!analysis.clipCount) { setHTML(el, ''); return; }
    const swingExtra = g === 'swing' ? html`<div class="focus-card" style="border-left-color:var(--info)">
      <div class="rank" style="color:var(--info)">Check by eye</div>
      <h3>Seam and wrist position at release</h3>
      <p>Swing depends mostly on seam angle, seam stability and a firm wrist behind the ball. These are too small for body tracking to measure reliably. Film a close-up slow-mo of the hand from side-on and check the seam stays upright without wobbling.</p>
      <div class="focus-cols">
        <div><div class="section-title">Things to think about</div><ul class="cue-list"><li>Wrist firm and behind the ball</li><li>Seam upright, angled slightly to the slips (outswing) or fine leg (inswing)</li><li>Release with backspin. A wobbling seam usually kills swing</li></ul></div>
        <div><div class="section-title">Drills</div><ul class="drill-list">${['seam-flicks', 'swing-setup'].map(drillItem)}</ul></div>
      </div>
    </div>` : '';
    setHTML(el, html`<div class="card">
      <div class="card-head"><h2>Focus areas for ${GOALS[g].label.toLowerCase()}</h2><span class="muted" style="font-size:.85rem">Ranked by gap × relevance to ${GOALS[g].label.toLowerCase()} × strength of evidence</span></div>
      <div class="stack">
        ${analysis.focus.length ? analysis.focus.map((f, k) => focusCard(f, k, g)) : html`<div class="callout">Nothing measured for ${GOALS[g].label.toLowerCase()} is outside the reference range. Keep reinforcing the current action${analysis.gaps.length ? ', and add the missing camera angles to check the rest of the model' : ''}.</div>`}
        ${swingExtra}
      </div>
    </div>`);
  }

  function focusCard(f, k, g) {
    const { row, advice } = f;
    const d = row.def;
    return html`<div class="focus-card">
      <div class="rank">Focus ${k + 1} ${evidenceChip(d.evidence)}</div>
      <h3>${advice.summary}</h3>
      <div class="measure">${d.label}: <strong>${metricValue(d, row.value)}</strong> · target ${rangeText(d)} · ${statusChip(row.status)}${row.n > 1 ? ` · median of ${row.n} clips` : ''}
        <div style="max-width:320px">${rangeBar(d, row.value)}</div></div>
      <p style="margin:0">${d.why[g] || d.what}</p>
      <div class="focus-cols">
        <div><div class="section-title">Things to think about when bowling</div><ul class="cue-list">${advice.cues.map((c) => html`<li>${c}</li>`)}</ul></div>
        <div><div class="section-title">Drills</div><ul class="drill-list">${advice.drills.map(drillItem)}</ul></div>
      </div>
    </div>`;
  }

  function renderTable() {
    const g = session.goal;
    const groups = [['side', 'Side-on measurements'], ['front', 'Front-on measurements'], ['session', 'Across the session']];
    const clipNo = Object.fromEntries(clips.map((c) => [c.id, c.order + 1]));
    setHTML($('[data-table]'), html`<div class="card">
      <div class="card-head"><h2>Full breakdown</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Measurement</th><th class="num">Value</th><th>Target</th><th>Status</th><th>Relevance to ${GOALS[g].label.toLowerCase()}</th><th>Evidence</th></tr></thead>
        ${groups.map(([v, title]) => {
          const rows = analysis.rows.filter((r) => r.def.view === v);
          return html`<tbody>
            <tr><td colspan="6" style="background:var(--surface-2);font-weight:700;font-size:.82rem">${title}</td></tr>
            ${rows.map((r) => html`<tr>
              <td style="min-width:220px"><div style="font-weight:600">${r.def.label}</div><small class="muted">${r.def.what}</small></td>
              <td class="num"><strong>${metricValue(r.def, r.value)}</strong>${r.perClip?.length > 1 ? html`<br><small class="muted" title="Per clip">${r.perClip.map((p) => `#${clipNo[p.clipId]} ${fmt(p.value, r.def.dp)}`).join(' · ')}</small>` : ''}</td>
              <td style="min-width:130px"><small>${rangeText(r.def)}</small>${rangeBar(r.def, r.value)}</td>
              <td>${r.def.good ? (r.value == null ? html`<span class="muted">Not measured</span>` : statusChip(r.status)) : html`<span class="chip">Info</span>`}</td>
              <td>${relevance(r.def.weights?.[g] || 0)}</td>
              <td>${evidenceChip(r.def.evidence)}</td>
            </tr>`)}
          </tbody>`;
        })}
      </table></div>
    </div>`);
  }

  function renderBreakdown() {
    renderInjury();
    renderSummary();
    renderFocus();
    renderTable();
  }

  function renderAll() {
    renderBreakdown();
    const first = clips.find((c) => c.id === selectedId) || clips.find((c) => c.status === 'done') || clips[0];
    selectClip(first?.id);
  }

  // ------------------------------------------------------------ events
  on(app, 'click', '[data-goal]', async (_e, b) => {
    session.goal = b.dataset.goal;
    app.querySelectorAll('[data-goal]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    await refreshSession();
    renderBreakdown();
  });
  on(app, 'click', '[data-clip]', (_e, b) => {
    const c = clips.find((x) => x.id === b.dataset.clip);
    if (c?.status === 'error') { selectClip(c.id); return; }
    if (b.dataset.clip !== selectedId) selectClip(b.dataset.clip);
  });
  on(app, 'click', '[data-retry]', async (_e, b) => {
    const c = clips.find((x) => x.id === b.dataset.retry);
    c.status = 'pending';
    await db.put('clips', c);
    await runPipeline();
  });
  on(app, 'click', '[data-del-clip]', async (_e, b) => {
    const ok = await confirmDialog('Remove clip?', 'This permanently deletes the clip\'s video and results from this session.', 'Remove clip');
    if (!ok) return;
    playerUI?.destroy(); playerUI = null;
    await deleteClipCascade(b.dataset.delClip);
    clips = clips.filter((c) => c.id !== b.dataset.delClip);
    results.delete(b.dataset.delClip);
    selectedId = null;
    await refreshSession();
    renderAll();
  });
  on(app, 'click', '[data-reset-all]', async (_e, b) => {
    const c = clips.find((x) => x.id === b.dataset.resetAll);
    c.manualEvents = {};
    reanalyse(c, results.get(c.id).pose);
    await db.put('clips', c);
    await refreshSession();
    selectClip(c.id);
    renderBreakdown();
  });
  on(app, 'change', '[data-clip-form]', async (e, form) => {
    const c = clips.find((x) => x.id === form.dataset.clipForm);
    const t = e.target;
    if (t.name === 'view' || t.name === 'slowFactor' || t.name === 'cameraSide') {
      c[t.name] = t.name === 'slowFactor' ? Number(t.value) : t.value;
      const r = results.get(c.id);
      if (r) reanalyse(c, r.pose);
      await db.put('clips', c);
      await refreshSession();
      selectClip(c.id);
      renderBreakdown();
      return;
    }
    const fd = new FormData(form);
    c.outcome = cleanOutcome({ speedKmh: fd.get('speedKmh'), swing: fd.get('swing'), accuracy: fd.get('accuracy') });
    await db.put('clips', c);
    renderStrip();
    toast('Outcome saved.');
  });
  on(app, 'click', '[data-act="delete"]', async () => {
    const ok = await confirmDialog('Delete session?', 'This permanently deletes the session, its videos and results. This cannot be undone.', 'Delete session');
    if (!ok) return;
    ctrl.abort();
    playerUI?.destroy();
    await deleteSessionCascade(session.id);
    location.hash = `#/player/${session.playerId}`;
  });
  on(app, 'click', '[data-act="reprocess"]', async () => {
    const ok = await confirmDialog('Re-process all clips?', 'Body tracking runs again on every clip using the model chosen on the dashboard. Manually set events are kept.', 'Re-process');
    if (!ok) return;
    playerUI?.destroy(); playerUI = null;
    for (const c of clips) {
      if (c.imported) continue;
      c.status = 'pending';
      results.delete(c.id);
      await db.put('clips', c);
    }
    await runPipeline();
  });

  async function runPipeline() {
    ctrl.abort();
    ctrl = new AbortController();
    await processPending();
    if (!nav.alive()) return;
    await loadAndAnalyse();
    if (!nav.alive()) return;
    renderAll();
  }

  // Initial load: show whatever is already analysed, then process anything pending.
  await loadAndAnalyse();
  if (!nav.alive()) return;
  renderAll();
  if (clips.some((c) => c.status !== 'done' && !c.imported && c.status !== 'error')) await runPipeline();
}

/** Same banding as the session analysis, applied to a single clip. */
function scoreOf(def, v) {
  return def.good && v != null ? scoreMetric(def, v) : null;
}

function relevance(w) {
  if (!w) return html`<span class="muted">–</span>`;
  return html`<span title="${['', 'Low', 'Medium', 'High'][w]} relevance" aria-label="${['', 'Low', 'Medium', 'High'][w]} relevance" style="letter-spacing:2px;color:var(--accent)">${'●'.repeat(w)}<span style="color:var(--border)">${'●'.repeat(3 - w)}</span></span>`;
}
