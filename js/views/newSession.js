import { db } from '../db.js';
import { html, raw, setHTML, on, uid, todayISO, GOALS, toast, fmt } from '../util.js';

const MAX_CLIPS = 6;

export const SLOW_OPTIONS = [
  { v: 1, label: 'Real speed', hint: 'Normal video, or a high-fps original that plays at normal speed' },
  { v: 4, label: 'Slowed 4× (120 fps slo-mo)', hint: 'Slo-mo exported so it plays back slowed' },
  { v: 8, label: 'Slowed 8× (240 fps slo-mo)', hint: 'Slo-mo exported so it plays back slowed' },
];

export const SWING_OPTIONS = [
  ['', 'Not recorded'], ['none', 'No swing'], ['in-slight', 'Inswing: slight'], ['in-big', 'Inswing: big'],
  ['out-slight', 'Outswing: slight'], ['out-big', 'Outswing: big'],
];
export const ACCURACY_OPTIONS = [['', 'Not recorded'], ['target', 'Hit target zone'], ['near', 'Close (within a stump width or so)'], ['miss', 'Missed']];

export function outcomeFields(o = {}, prefix = '') {
  return html`
    <label class="field">Speed (km/h)<input type="number" name="${prefix}speedKmh" min="40" max="170" step="0.1" value="${o.speedKmh ?? ''}" placeholder="Speed gun"></label>
    <label class="field">Swing<select name="${prefix}swing">${SWING_OPTIONS.map(([v, l]) => html`<option value="${v}" ${o.swing === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <label class="field">Accuracy<select name="${prefix}accuracy">${ACCURACY_OPTIONS.map(([v, l]) => html`<option value="${v}" ${o.accuracy === v ? raw('selected') : ''}>${l}</option>`)}</select></label>`;
}

export async function renderNewSession(app, nav, playerId) {
  const player = await db.get('players', playerId);
  if (!nav.alive()) return;
  if (!player) { setHTML(app, html`<div class="card empty"><h2>Player not found</h2></div>`); return; }
  const team = await db.get('teams', player.teamId);
  const state = { goal: 'pace', clips: [] };
  const urls = [];
  nav.onLeave(() => urls.forEach((u) => URL.revokeObjectURL(u)));

  setHTML(app, html`
    <div class="crumbs"><a href="#/teams">Teams</a> / <a href="#/team/${team?.id}">${team?.name || ''}</a> / <a href="#/player/${player.id}">${player.name}</a> /</div>
    <div class="page-head"><div><h1>New analysis session</h1><div class="sub">${player.name} · ${player.arm === 'left' ? 'left' : 'right'}-arm</div></div></div>

    <form class="stack" data-form novalidate>
      <div class="card">
        <h2>1. What is ${player.name} working on?</h2>
        <p class="muted">The breakdown ranks focus areas and drills for this goal. All three scores are always shown, and you can switch the goal later without re-processing.</p>
        <div class="goal-picker">
          ${Object.entries(GOALS).map(([k, g]) => html`<div class="goal-option">
            <input type="radio" name="goal" id="goal-${k}" value="${k}" ${k === 'pace' ? raw('checked') : ''}>
            <label for="goal-${k}"><strong>${g.label}</strong><span>${g.blurb}</span></label>
          </div>`)}
        </div>
        <div class="form-grid" style="margin-top:14px">
          <label class="field">Session date<input type="date" name="date" value="${todayISO()}" required></label>
          <label class="field">Notes<input type="text" name="notes" placeholder="e.g. nets, new ball, after rest day"></label>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>2. Add 3–6 delivery clips</h2><span class="muted" data-count>0 of ${MAX_CLIPS}</span></div>
        <p class="muted">One delivery per clip. Mix <strong>side-on</strong> clips (pace and knee) with <strong>front-on</strong> clips filmed from behind the bowler (alignment, arm, head and injury risk). Slow-motion gives much better results. <a href="#/guide">Filming guide</a></p>
        <label class="dropzone" data-drop>
          <strong>Choose videos or drop them here</strong>
          MP4 or MOV from your phone. On a phone you can also record straight from the camera.
          <input type="file" accept="video/*" multiple hidden data-file>
        </label>
        <div class="clip-cards" data-clips style="margin-top:14px"></div>
      </div>

      <div class="card">
        <h2>3. Analyse</h2>
        <p class="muted">Videos are stored and processed on this device. Nothing is uploaded. Processing takes roughly 10–40 seconds per clip.</p>
        <div class="row"><button type="submit" class="btn btn-primary" data-submit disabled>Save and analyse</button><span class="muted" data-hint>Add at least one clip.</span></div>
      </div>
    </form>
  `);

  const clipsEl = app.querySelector('[data-clips]');
  const fileInput = app.querySelector('[data-file]');
  const drop = app.querySelector('[data-drop]');

  function addFiles(files) {
    const vids = [...files].filter((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name));
    if (!vids.length) { toast('Those files are not videos.'); return; }
    for (const file of vids) {
      if (state.clips.length >= MAX_CLIPS) { toast(`Up to ${MAX_CLIPS} clips per session.`); break; }
      const url = URL.createObjectURL(file);
      urls.push(url);
      const sides = state.clips.filter((c) => c.view === 'side').length, fronts = state.clips.length - sides;
      state.clips.push({ key: uid(), file, url, view: sides <= fronts ? 'side' : 'front', slowFactor: 1, trim: { start: null, end: null }, outcome: {} });
    }
    renderClips();
  }

  function renderClips() {
    setHTML(clipsEl, html`${state.clips.map((c, i) => html`<div class="card flat tight clip-card" data-key="${c.key}">
      <div>
        <video src="${c.url}" controls playsinline muted preload="metadata"></video>
        <div class="trim-row" style="margin-top:6px">
          <span>Trim:</span>
          <button type="button" class="btn btn-sm" data-trim="start">Set start</button>
          <button type="button" class="btn btn-sm" data-trim="end">Set end</button>
          <button type="button" class="btn btn-sm btn-ghost" data-trim="clear">Clear</button>
          <span data-trim-label>${trimLabel(c.trim)}</span>
        </div>
      </div>
      <div>
        <div class="row" style="margin-bottom:10px">
          <strong>Clip ${i + 1}</strong><small class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px">${c.file.name}</small>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" data-remove>Remove</button>
        </div>
        <div class="clip-fields">
          <label class="field">Camera angle<select data-f="view">
            <option value="side" ${c.view === 'side' ? raw('selected') : ''}>Side-on</option>
            <option value="front" ${c.view === 'front' ? raw('selected') : ''}>Front-on (from behind bowler)</option>
          </select></label>
          <label class="field wide">Playback speed<select data-f="slowFactor">
            ${SLOW_OPTIONS.map((o) => html`<option value="${o.v}" ${c.slowFactor === o.v ? raw('selected') : ''}>${o.label}</option>`)}
          </select><span class="hint">${SLOW_OPTIONS.find((o) => o.v === c.slowFactor)?.hint}</span></label>
          ${outcomeFields(c.outcome, 'o-')}
        </div>
        <p class="hint muted" style="font-size:.8rem;margin:8px 0 0">Outcomes are optional. They feed the squad <a href="#/insights">Insights</a> database, which shows which action traits go with pace, swing and accuracy in your players.</p>
      </div>
    </div>`)}`);
    app.querySelector('[data-count]').textContent = `${state.clips.length} of ${MAX_CLIPS}`;
    const submit = app.querySelector('[data-submit]');
    submit.disabled = !state.clips.length;
    const views = new Set(state.clips.map((c) => c.view));
    app.querySelector('[data-hint]').textContent = !state.clips.length ? 'Add at least one clip.'
      : state.clips.length < 3 ? 'Tip: 3–6 clips give a more reliable picture.'
      : views.size < 2 ? 'Tip: include both side-on and front-on clips for the full breakdown.' : '';
  }

  const clipFor = (node) => state.clips.find((c) => c.key === node.closest('[data-key]')?.dataset.key);

  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); addFiles(e.dataTransfer.files); });

  on(clipsEl, 'click', '[data-remove]', (_e, b) => {
    const c = clipFor(b);
    state.clips = state.clips.filter((x) => x !== c);
    renderClips();
  });
  on(clipsEl, 'click', '[data-trim]', (_e, b) => {
    const c = clipFor(b);
    const video = b.closest('[data-key]').querySelector('video');
    const t = Math.round(video.currentTime * 100) / 100;
    if (b.dataset.trim === 'start') c.trim.start = t;
    if (b.dataset.trim === 'end') c.trim.end = t;
    if (b.dataset.trim === 'clear') c.trim = { start: null, end: null };
    if (c.trim.start != null && c.trim.end != null && c.trim.end <= c.trim.start) { toast('The end must be after the start.'); c.trim.end = null; }
    b.closest('[data-key]').querySelector('[data-trim-label]').textContent = trimLabel(c.trim);
  });
  on(clipsEl, 'change', '[data-f]', (_e, input) => {
    const c = clipFor(input);
    if (input.dataset.f === 'slowFactor') { c.slowFactor = Number(input.value); renderClips(); return; }
    c[input.dataset.f] = input.value;
    renderClips();
  });
  on(clipsEl, 'change', '[name^="o-"]', (_e, input) => {
    const c = clipFor(input);
    const k = input.name.slice(2);
    c.outcome[k] = k === 'speedKmh' ? (input.value ? Number(input.value) : null) : input.value || null;
  });

  on(app, 'submit', '[data-form]', async (e, form) => {
    e.preventDefault();
    if (!state.clips.length) return;
    const fd = new FormData(form);
    const submit = form.querySelector('[data-submit]');
    submit.disabled = true;
    submit.textContent = 'Saving videos…';
    try {
      const session = {
        id: uid(), playerId, date: String(fd.get('date') || todayISO()), goal: String(fd.get('goal') || 'pace'),
        notes: String(fd.get('notes') || '').trim(), createdAt: Date.now(), summary: null,
      };
      await db.put('sessions', session);
      let order = 0;
      for (const c of state.clips) {
        const id = uid();
        await db.put('videos', { clipId: id, blob: c.file, type: c.file.type });
        await db.put('clips', {
          id, sessionId: session.id, order: order++, view: c.view, slowFactor: c.slowFactor,
          trim: c.trim, fileName: c.file.name, status: 'pending', outcome: cleanOutcome(c.outcome), createdAt: Date.now(),
        });
      }
      location.hash = `#/session/${session.id}`;
    } catch (err) {
      console.error(err);
      toast(`Could not save: ${err.message}. The device may be out of storage.`);
      submit.disabled = false;
      submit.textContent = 'Save and analyse';
    }
  });
}

function trimLabel(t) {
  if (t.start == null && t.end == null) return 'Whole clip';
  return `${t.start != null ? fmt(t.start, 2) : '0'}s to ${t.end != null ? `${fmt(t.end, 2)}s` : 'end'}`;
}

export function cleanOutcome(o = {}) {
  const speed = Number(o.speedKmh);
  return {
    speedKmh: Number.isFinite(speed) && speed > 0 ? speed : null,
    swing: o.swing || null,
    accuracy: o.accuracy || null,
  };
}
