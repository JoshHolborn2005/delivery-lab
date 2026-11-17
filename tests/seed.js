// DEV ONLY: seeds a clearly-labelled synthetic demo session so the viewer and breakdown can be
// exercised without real footage. Run from the browser console on the app page:
//   const m = await import('/tests/seed.js'); await m.seedDemo();

import { db } from '../js/db.js';
import { uid, todayISO } from '../js/util.js';
import { makeSideOn, makeFrontOn } from './synthetic.js';
import { BONES } from '../js/biomech/landmarks.js';

const NJ = 33;

async function recordSkeleton(pose, fpsVideo = 30) {
  const c = document.createElement('canvas');
  c.width = pose.width >= pose.height ? 960 : 540;
  c.height = Math.round((c.width * pose.height) / pose.width);
  const ctx = c.getContext('2d');
  const stream = c.captureStream(fpsVideo);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  const draw = (i) => {
    ctx.fillStyle = '#6b8f5e'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff'; ctx.font = '16px system-ui'; ctx.fillText('SYNTHETIC DEMO: not real footage', 12, 24);
    const P = (k) => { const o = (i * NJ + k) * 4; return { x: pose.lm[o] * c.width, y: pose.lm[o + 1] * c.height }; };
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const [a, b] of BONES) { const A = P(a), B = P(b); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
    const n = P(0); ctx.beginPath(); ctx.arc(n.x, n.y, 14, 0, 7); ctx.stroke();
  };
  draw(0);
  rec.start();
  for (let i = 0; i < pose.n; i++) {
    draw(i);
    await new Promise((r) => setTimeout(r, 1000 / fpsVideo));
  }
  rec.stop();
  await done;
  return new Blob(chunks, { type: 'video/webm' });
}

export async function seedDemo({ clipsPerView = 2 } = {}) {
  let team = (await db.all('teams')).find((t) => t.name === 'Synthetic demo');
  if (!team) { team = { id: uid(), name: 'Synthetic demo', notes: 'Generated test data, not real bowlers', createdAt: Date.now() }; await db.put('teams', team); }
  const player = { id: uid(), teamId: team.id, name: `Demo bowler ${Math.floor(Math.random() * 90 + 10)}`, arm: 'right', style: 'fast', heightCm: 180, notes: 'Synthetic', createdAt: Date.now() };
  await db.put('players', player);
  const session = { id: uid(), playerId: player.id, date: todayISO(), goal: 'pace', notes: 'Synthetic demo', createdAt: Date.now(), summary: null };
  await db.put('sessions', session);
  const SLOW = 8;
  let order = 0;
  const gens = [];
  for (let k = 0; k < clipsPerView; k++) gens.push(['side', makeSideOn({ fps: 240, seed: 11 + k })], ['front', makeFrontOn({ fps: 240, seed: 21 + k })]);
  for (const [view, g] of gens) {
    const pose = { ...g.pose, times: Float32Array.from(g.pose.times, (t) => t * SLOW) };
    const blob = await recordSkeleton(pose, 240 / SLOW);
    const id = uid();
    await db.put('videos', { clipId: id, blob, type: blob.type });
    await db.put('poses', { clipId: id, ...pose, fps: 30, model: 'synthetic' });
    const speed = view === 'side' ? 128 + Math.random() * 8 : null;
    await db.put('clips', { id, sessionId: session.id, order: order++, view, slowFactor: SLOW, trim: { start: null, end: null }, fileName: `synthetic-${view}.webm`, status: 'done', outcome: { speedKmh: speed && Math.round(speed * 10) / 10, swing: null, accuracy: null }, createdAt: Date.now() });
  }
  return { sessionId: session.id, playerId: player.id };
}
