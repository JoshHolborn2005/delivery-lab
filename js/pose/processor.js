// Runs MediaPipe Pose Landmarker over a video file, frame by frame, entirely in the browser.
// Output is a compact pose track stored in IndexedDB and fed to the biomechanics layer.

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODELS = {
  full: { label: 'Standard (faster)', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task' },
  heavy: { label: 'High accuracy (slower, 30 MB download)', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task' },
};
const MAX_FRAMES = 900;          // per clip
const MAX_REAL_RATE = 120;       // pose samples per real-world second
const NJ = 33;

export function getModelChoice() {
  try { return localStorage.getItem('dl.model') === 'heavy' ? 'heavy' : 'full'; } catch { return 'full'; }
}
export function setModelChoice(m) {
  try { localStorage.setItem('dl.model', m); } catch { /* ignore */ }
  landmarkers.delete(m === 'heavy' ? 'full' : 'heavy');
}

const landmarkers = new Map();
let lastTs = 0;

async function getLandmarker(model) {
  if (!landmarkers.has(model)) {
    const p = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODELS[model].url, delegate },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        return await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (e) {
        console.warn('GPU delegate unavailable, falling back to CPU', e);
        return await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    })();
    landmarkers.set(model, p);
    p.catch(() => landmarkers.delete(model));
  }
  return landmarkers.get(model);
}

function waitEvent(el, name, ms = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for video (${name}).`)); }, ms);
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('This video format could not be decoded by the browser. Try Chrome or Safari, or export the clip as H.264 MP4.')); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(name, ok); el.removeEventListener('error', bad); };
    el.addEventListener(name, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

async function seekTo(video, t) {
  if (Math.abs(video.currentTime - t) < 1e-6) return;
  const p = waitEvent(video, 'seeked', 8000);
  video.currentTime = t;
  await p;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Estimate the file's native frame rate by playing a little at reduced speed. */
async function estimateFps(video) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return 30;
  const times = [];
  const result = await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      const d = [];
      for (let i = 1; i < times.length; i++) { const dt = times[i] - times[i - 1]; if (dt > 1e-4) d.push(dt); }
      if (!d.length) return resolve(30);
      d.sort((a, b) => a - b);
      const small = d.slice(0, Math.max(1, Math.ceil(d.length / 2)));
      const dt = small[Math.floor(small.length / 2)];
      resolve(Math.min(480, Math.max(15, Math.round(1 / dt))));
    };
    const cb = (_now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= 10) finish(); else video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
    video.playbackRate = 0.2;
    video.play().catch(finish);
    setTimeout(finish, 2500);
  });
  video.playbackRate = 1;
  return result;
}

function pickPose(res, prev, aspect) {
  const poses = res?.landmarks || [];
  if (!poses.length) return -1;
  if (poses.length === 1) return 0;
  const centre = (lm) => ({ x: ((lm[23].x + lm[24].x) / 2) * aspect, y: (lm[23].y + lm[24].y) / 2 });
  if (prev) {
    let best = 0, bd = Infinity;
    poses.forEach((lm, k) => { const c = centre(lm); const d = Math.hypot(c.x - prev.x, c.y - prev.y); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  // First frame: the largest person in view is most likely the bowler.
  let best = 0, ba = -1;
  poses.forEach((lm, k) => {
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const a = (x1 - x0) * (y1 - y0);
    if (a > ba) { ba = a; best = k; }
  });
  return best;
}

function thumbnail(video) {
  try {
    const w = 192, h = Math.round((w * video.videoHeight) / video.videoWidth) || 108;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}

/**
 * @param blob        video file
 * @param opts.slowFactor  1 for real-time footage, 4/8 for slow-motion that plays slowed
 * @param opts.trim   { start, end } in video seconds (optional)
 * @param opts.onProgress (fraction, label)
 * @param opts.signal AbortSignal
 */
export async function processVideo(blob, { slowFactor = 1, trim = null, onProgress, signal, model = getModelChoice() } = {}) {
  onProgress?.(0, 'Loading pose model…');
  const landmarker = await getLandmarker(model);
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  video.load();
  try {
    onProgress?.(0, 'Reading video…');
    if (video.readyState < 1) await waitEvent(video, 'loadedmetadata', 20000);
    if (video.readyState < 2) {
      // iOS Safari often won't decode frames until playback starts: nudge it, then wait for data.
      try { await video.play(); video.pause(); } catch { /* muted autoplay refused: fall through */ }
      if (video.readyState < 2) await waitEvent(video, 'loadeddata', 15000);
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read the video length.');
    const fps = await estimateFps(video);
    const start = Math.max(0, Math.min(duration, Number(trim?.start) || 0));
    const endRaw = Number(trim?.end);
    const end = Math.max(start, Math.min(duration, Number.isFinite(endRaw) && endRaw > 0 ? endRaw : duration));
    let step = Math.max(1 / fps, 1 / (MAX_REAL_RATE * (slowFactor || 1)));
    let n = Math.floor((end - start) / step);
    if (n > MAX_FRAMES) { n = MAX_FRAMES; step = (end - start) / n; }
    if (n < 8) throw new Error('This clip is too short to analyse. Use at least half a second around the delivery.');

    const aspect = video.videoWidth / video.videoHeight;
    const times = new Float32Array(n);
    const lm = new Float32Array(n * NJ * 4).fill(NaN);
    const world = new Float32Array(n * NJ * 3).fill(NaN);
    let prev = null, found = 0, thumb = null;
    const dtMs = Math.max(1, Math.round(step * 1000));

    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const t = start + (i + 0.5) * step;
      await seekTo(video, t);
      lastTs += dtMs;
      const res = landmarker.detectForVideo(video, lastTs);
      times[i] = t;
      const k = pickPose(res, prev, aspect);
      if (k >= 0) {
        const pts = res.landmarks[k], wpts = res.worldLandmarks?.[k];
        for (let j = 0; j < NJ; j++) {
          const o = (i * NJ + j) * 4;
          lm[o] = pts[j].x; lm[o + 1] = pts[j].y; lm[o + 2] = pts[j].z; lm[o + 3] = pts[j].visibility ?? 1;
          if (wpts) { const w = (i * NJ + j) * 3; world[w] = wpts[j].x; world[w + 1] = wpts[j].y; world[w + 2] = wpts[j].z; }
        }
        prev = { x: ((pts[23].x + pts[24].x) / 2) * aspect, y: (pts[23].y + pts[24].y) / 2 };
        found++;
      }
      if (i === Math.floor(n / 2)) thumb = thumbnail(video);
      if (i % 4 === 0) { onProgress?.((i + 1) / n, `Tracking body… frame ${i + 1} of ${n}`); await nextFrame(); }
    }
    if (found < n * 0.2) throw new Error('No bowler could be tracked in most of this clip. Check the whole body is in frame and well lit.');
    onProgress?.(1, 'Done');
    return {
      pose: { n, times, lm, world, width: video.videoWidth, height: video.videoHeight, fps, step, start, end, duration, model, mpVersion: MP_VERSION },
      thumb,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
