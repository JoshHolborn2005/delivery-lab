// Side-by-side raw video + motion-capture panels, kept in sync, with an event timeline the coach can edit.

import { html, setHTML, on, fmt } from '../util.js';
import { BONES, DRAW_JOINTS, J, other, armSide, NOSE } from '../biomech/landmarks.js';
import { angle3, sub, mid, fromVertical } from '../biomech/geometry.js';
import { EVENT_KEYS, EVENT_LABELS, EVENT_SHORT } from '../biomech/events.js';

const COL = {
  bowlArm: '#ff8a3d',
  frontLeg: '#2fd1c0',
  otherLimb: '#8ea2b1',
  torso: '#e7eef2',
  joint: '#ffffff',
  grid: 'rgba(255,255,255,0.055)',
  text: '#e7eef2',
  muted: 'rgba(231,238,242,0.6)',
  ref: 'rgba(231,238,242,0.45)',
  ev: { bfc: '#7b96ff', ffc: '#2fd1c0', br: '#ff8a3d' },
};

export function createDualPlayer(root, { videoBlob, series: s, events, meta, onSetEvent, onResetEvent }) {
  const url = URL.createObjectURL(videoBlob);
  const ar = s.width / s.height;
  let ev = events;
  let raf = 0;
  let follow = true;
  let overlay = false;
  let cur = 0;

  setHTML(root, html`
    <div class="dual">
      <div class="panel"><div class="panel-label">Raw video</div>
        <div class="stage" style="--ar:${s.width} / ${s.height};--arn:${ar}"><video playsinline muted preload="auto" src="${url}"></video><canvas data-overlay></canvas></div>
      </div>
      <div class="panel mocap"><div class="panel-label">Motion capture</div>
        <div class="stage" style="--ar:${s.width} / ${s.height};--arn:${ar}"><canvas data-mocap></canvas></div>
      </div>
    </div>
    <div class="player-controls">
      <button type="button" class="btn btn-sm" data-pc="prev" title="Previous frame" aria-label="Previous frame">◀ Frame</button>
      <button type="button" class="btn btn-sm btn-primary" data-pc="play" style="min-width:76px">Play</button>
      <button type="button" class="btn btn-sm" data-pc="next" title="Next frame" aria-label="Next frame">Frame ▶</button>
      <select data-pc="rate" aria-label="Playback speed" style="width:auto;min-height:30px;padding:3px 8px">
        <option value="0.1">0.1×</option><option value="0.25" selected>0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option>
      </select>
      <label class="row" style="gap:6px;font-size:.85rem"><input type="checkbox" data-pc="follow" checked> Follow bowler</label>
      <label class="row" style="gap:6px;font-size:.85rem"><input type="checkbox" data-pc="overlay"> Skeleton on video</label>
      <span class="time" data-time></span>
    </div>
    <div class="timeline">
      <div class="markers" data-markers></div>
      <input type="range" min="0" max="${s.n - 1}" step="1" value="0" data-scrub aria-label="Frame">
    </div>
    <div class="event-bar" data-events></div>
  `);

  const video = root.querySelector('video');
  const mocap = root.querySelector('[data-mocap]');
  const ovl = root.querySelector('[data-overlay]');
  const scrub = root.querySelector('[data-scrub]');
  const playBtn = root.querySelector('[data-pc="play"]');
  const timeEl = root.querySelector('[data-time]');
  video.playbackRate = 0.25;

  const arm = armSide(meta.arm);
  // Precompute view framing + reference directions.
  const scaleMed = s.scaleBetween(0, s.n - 1);
  const hipC = (i) => mid(s.p(i, 23), s.p(i, 24));
  const shC = (i) => mid(s.p(i, 11), s.p(i, 12));
  const centreCache = new Array(s.n);
  function centre(i) {
    if (centreCache[i]) return centreCache[i];
    let x = 0, y = 0, c = 0;
    for (let j = i - 4; j <= i + 4; j++) if (s.has(j)) { const h = hipC(j); x += h.x; y += h.y; c++; }
    const r = c ? { x: x / c, y: y / c - scaleMed * 0.05 } : { x: ar / 2, y: 0.5 };
    centreCache[i] = r;
    return r;
  }

  function geometry() {
    const f = ev?.frontSide || other(arm);
    let dir = 1, sideSign = arm === 'R' ? 1 : -1, ground = null;
    if (ev && s.has(ev.ffc) && s.has(ev.bfc)) {
      dir = Math.sign(s.p(ev.ffc, J(f, 'ank')).x - s.p(ev.bfc, J(other(f), 'ank')).x) || 1;
      ground = s.p(ev.ffc, J(f, 'heel')).y;
    }
    if (ev && s.has(ev.br)) sideSign = Math.sign(s.p(ev.br, J(other(arm), 'hip')).x - s.p(ev.br, J(arm, 'hip')).x) || sideSign;
    return { f, dir, sideSign, ground };
  }
  let geo = geometry();

  function sizeCanvas(c) {
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w, h, dpr };
  }

  function view(i, isFollow) {
    if (!isFollow) return { cx: ar / 2, cy: 0.5, vh: 1 };
    const c = centre(i);
    return { cx: c.x, cy: c.y, vh: Math.min(1, scaleMed * 1.45) };
  }

  function drawSkeleton(ctx, i, T, lw, dpr, { trail = true, labels = true } = {}) {
    const P = (k) => T(s.p(i, k));
    const fSide = geo.f;
    const partColor = (part) => {
      if (part === 'torso') return COL.torso;
      const side = part.slice(-1);
      if (part.startsWith('arm')) return side === arm ? COL.bowlArm : COL.otherLimb;
      return side === fSide ? COL.frontLeg : COL.otherLimb;
    };
    // Bowling-wrist trail
    if (trail) {
      const N = Math.max(4, s.framesFor(0.25));
      const wi = J(arm, 'wr');
      for (let j = Math.max(1, i - N); j <= i; j++) {
        if (!s.has(j) || !s.has(j - 1)) continue;
        const a = T(s.p(j - 1, wi)), b = T(s.p(j, wi));
        ctx.strokeStyle = `rgba(255,138,61,${0.08 + 0.5 * (1 - (i - j) / N)})`;
        ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.lineCap = 'round';
    for (const [a, b, part] of BONES) {
      const A = P(a), B = P(b);
      ctx.strokeStyle = partColor(part);
      ctx.lineWidth = part === 'torso' ? lw * 0.8 : lw;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    ctx.fillStyle = COL.joint;
    for (const k of DRAW_JOINTS) { const p = P(k); ctx.beginPath(); ctx.arc(p.x, p.y, lw * 0.55, 0, Math.PI * 2); ctx.fill(); }
    // Head
    const nose = P(NOSE), shm = T(shC(i));
    const headR = Math.max(4 * dpr, Math.hypot(nose.x - shm.x, nose.y - shm.y) * 0.42);
    ctx.strokeStyle = COL.torso; ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ctx.arc(nose.x, nose.y, headR, 0, Math.PI * 2); ctx.stroke();
    if (!labels) return;

    ctx.font = `600 ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    // Draw a label pill. side = +1 puts it to the right of x, -1 to the left.
    const tag = (text, x, y, color, side = 1) => {
      const w = ctx.measureText(text).width + 10 * dpr, h = 18 * dpr;
      const x0 = side > 0 ? x : x - w;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, x0, y - h / 2, w, h, 4 * dpr); ctx.fill();
      ctx.fillStyle = color; ctx.fillText(text, x0 + 5 * dpr, y);
    };
    const dashed = (A, B) => { ctx.save(); ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = COL.ref; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); ctx.restore(); };

    if (meta.view === 'side') {
      const hip = s.p(i, J(fSide, 'hip')), knee = s.p(i, J(fSide, 'knee')), ank = s.p(i, J(fSide, 'ank'));
      const k = angle3(hip, knee, ank);
      const K = T(knee);
      // Knee label on the running-direction side, trunk label behind the hips, so they never collide.
      tag(`Knee ${fmt(k)}°`, K.x + geo.dir * 12 * dpr, K.y, COL.frontLeg, geo.dir);
      const hc = hipC(i), sc = shC(i);
      const tr = fromVertical(sub(sc, hc), geo.dir);
      const H = T(hc), Up = T({ x: hc.x, y: hc.y - dist2(sc, hc) * 1.1 });
      dashed(H, Up);
      tag(`Trunk ${fmt(tr)}°`, H.x - geo.dir * 12 * dpr, H.y, COL.torso, -geo.dir);
    } else {
      const sh = s.p(i, J(arm, 'sh')), wr = s.p(i, J(arm, 'wr'));
      const a = fromVertical(sub(wr, sh), -geo.sideSign);
      const S = T(sh), Up = T({ x: sh.x, y: sh.y - dist2(wr, sh) * 1.05 });
      dashed(S, Up);
      const W = T(wr);
      tag(`Arm ${a > 0 ? '+' : ''}${fmt(a)}°`, W.x + 10 * dpr, W.y, COL.bowlArm);
      const hc = hipC(i), sc = shC(i);
      const lf = fromVertical(sub(sc, hc), geo.sideSign);
      const H = T(hc);
      dashed(H, T({ x: hc.x, y: hc.y - dist2(sc, hc) * 1.1 }));
      tag(`Side-bend ${fmt(lf)}°`, H.x + 10 * dpr, H.y + 22 * dpr, COL.torso);
    }
  }

  function phaseOf(i) {
    if (!ev) return '';
    for (const k of EVENT_KEYS) if (i === ev[k]) return EVENT_LABELS[k];
    if (i < ev.bfc) return 'Run-up / gather';
    if (i < ev.ffc) return 'Delivery stride';
    if (i < ev.br) return 'Front-foot contact → release';
    return 'Follow-through';
  }

  function drawMocap(i) {
    const { w, h, dpr } = sizeCanvas(mocap);
    const ctx = mocap.getContext('2d');
    ctx.fillStyle = '#0d1311';
    ctx.fillRect(0, 0, w, h);
    const v = view(i, follow);
    const vw = v.vh * ar;
    const T = (p) => ({ x: ((p.x - v.cx + vw / 2) / vw) * w, y: ((p.y - v.cy + v.vh / 2) / v.vh) * h });
    // World-anchored grid so camera-follow still shows motion.
    const step = 0.1;
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1 * dpr;
    for (let gx = Math.floor((v.cx - vw / 2) / step) * step; gx <= v.cx + vw / 2; gx += step) { const X = T({ x: gx, y: 0 }).x; ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X, h); ctx.stroke(); }
    for (let gy = Math.floor((v.cy - v.vh / 2) / step) * step; gy <= v.cy + v.vh / 2; gy += step) { const Y = T({ x: 0, y: gy }).y; ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(w, Y); ctx.stroke(); }
    if (geo.ground != null) {
      const Y = T({ x: 0, y: geo.ground }).y;
      ctx.strokeStyle = 'rgba(231,238,242,0.22)'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(w, Y); ctx.stroke();
    }
    const lw = Math.max(2.5 * dpr, (w / 160));
    if (s.has(i)) drawSkeleton(ctx, i, T, lw, dpr);
    else { ctx.fillStyle = COL.muted; ctx.font = `${13 * dpr}px system-ui`; ctx.fillText('Bowler not tracked in this frame', 14 * dpr, h / 2); }

    // HUD
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = COL.muted;
    ctx.fillText(phaseOf(i).toUpperCase(), 10 * dpr, h - 12 * dpr);
    if (ev && s.has(ev.br)) {
      const rel = s.times[i] - s.times[ev.br];
      const txt = `${rel >= 0 ? '+' : ''}${(rel * 1000).toFixed(0)} ms from release`;
      ctx.fillText(txt, w - ctx.measureText(txt).width - 10 * dpr, h - 12 * dpr);
    }
    if (ev) for (const key of EVENT_KEYS) {
      if (ev[key] !== i) continue;
      ctx.font = `700 ${13 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      const label = EVENT_LABELS[key].toUpperCase();
      const tw = ctx.measureText(label).width + 16 * dpr;
      ctx.fillStyle = COL.ev[key];
      roundRect(ctx, w - tw - 10 * dpr, 10 * dpr, tw, 24 * dpr, 6 * dpr); ctx.fill();
      ctx.fillStyle = '#0d1311';
      ctx.fillText(label, w - tw - 2 * dpr, 27 * dpr);
    }
  }

  function drawOverlay(i) {
    const { w, h, dpr } = sizeCanvas(ovl);
    const ctx = ovl.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!overlay || !s.has(i)) return;
    const T = (p) => ({ x: (p.x / ar) * w, y: p.y * h });
    drawSkeleton(ctx, i, T, Math.max(2 * dpr, w / 220), dpr, { trail: true, labels: false });
  }

  function drawAt(i) {
    cur = Math.max(0, Math.min(s.n - 1, i));
    drawMocap(cur);
    drawOverlay(cur);
    scrub.value = String(cur);
    const t = s.vtimes[cur];
    timeEl.textContent = `frame ${cur + 1}/${s.n} · ${t.toFixed(2)} s${s.slow > 1 ? ` (real ${(s.times[cur]).toFixed(3)} s)` : ''}`;
  }

  function seekFrame(i) {
    i = Math.max(0, Math.min(s.n - 1, i));
    video.currentTime = s.vtimes[i];
    drawAt(i);
  }

  const vStart = s.vtimes[0], vEnd = s.vtimes[s.n - 1];
  function loop() {
    if (video.paused) return;
    if (video.currentTime >= vEnd || video.currentTime < vStart - 0.05) video.currentTime = vStart;
    drawAt(s.frameAtVideoTime(video.currentTime));
    raf = requestAnimationFrame(loop);
  }

  function renderMarkers() {
    const mk = root.querySelector('[data-markers]');
    const pct = (i) => (s.n > 1 ? (i / (s.n - 1)) * 100 : 0);
    setHTML(mk, ev ? html`${EVENT_KEYS.map((k) => html`<span class="marker ${k}" style="left:${pct(ev[k])}%" data-jump="${k}" title="${EVENT_LABELS[k]}">${EVENT_SHORT[k]}</span>`)}` : '');
    const evEl = root.querySelector('[data-events]');
    const confLabel = { auto: 'auto-detected', estimated: 'estimate, please check', manual: 'set by coach' };
    setHTML(evEl, ev ? html`${EVENT_KEYS.map((k) => html`<div class="event-chip">
      <span class="swatch" style="background:var(--ev-${k})"></span>
      <div><div class="name">${EVENT_LABELS[k]}</div><div class="meta">frame ${ev[k] + 1} · ${confLabel[ev.conf?.[k]] || ''}</div></div>
      <div class="actions">
        <button type="button" class="btn btn-sm" data-jump="${k}">Go</button>
        <button type="button" class="btn btn-sm" data-set="${k}" title="Set ${EVENT_LABELS[k]} to the frame on screen">Set here</button>
        ${ev.conf?.[k] === 'manual' ? html`<button type="button" class="btn btn-sm btn-ghost" data-reset="${k}" title="Back to auto-detect">Auto</button>` : ''}
      </div>
    </div>`)}` : html`<div class="muted">No events detected.</div>`);
  }

  // ---- wiring
  on(root, 'click', '[data-pc="play"]', () => { if (video.paused) video.play(); else video.pause(); });
  video.addEventListener('play', () => { playBtn.textContent = 'Pause'; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
  video.addEventListener('pause', () => { playBtn.textContent = 'Play'; cancelAnimationFrame(raf); drawAt(s.frameAtVideoTime(video.currentTime)); });
  // 'loadedmetadata' (not 'loadeddata'): iOS Safari may not load frame data until a seek or play.
  video.addEventListener('loadedmetadata', () => seekFrame(ev?.br ?? 0), { once: true });
  video.load();
  on(root, 'click', '[data-pc="prev"]', () => { video.pause(); seekFrame(cur - 1); });
  on(root, 'click', '[data-pc="next"]', () => { video.pause(); seekFrame(cur + 1); });
  on(root, 'change', '[data-pc="rate"]', (_e, sel) => { video.playbackRate = Number(sel.value); });
  on(root, 'change', '[data-pc="follow"]', (_e, cb) => { follow = cb.checked; drawAt(cur); });
  on(root, 'change', '[data-pc="overlay"]', (_e, cb) => { overlay = cb.checked; drawAt(cur); });
  scrub.addEventListener('input', () => { video.pause(); seekFrame(Number(scrub.value)); });
  on(root, 'click', '[data-jump]', (_e, b) => { video.pause(); seekFrame(ev[b.dataset.jump]); });
  on(root, 'click', '[data-set]', (_e, b) => { video.pause(); onSetEvent?.(b.dataset.set, cur); });
  on(root, 'click', '[data-reset]', (_e, b) => { onResetEvent?.(b.dataset.reset); });

  const ro = new ResizeObserver(() => drawAt(cur));
  ro.observe(mocap);
  renderMarkers();
  drawAt(ev?.br ?? 0);

  return {
    update(newEvents, newSeries) {
      ev = newEvents;
      if (newSeries) { s = newSeries; centreCache.fill(undefined); }
      geo = geometry();
      renderMarkers();
      drawAt(cur);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

function dist2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
