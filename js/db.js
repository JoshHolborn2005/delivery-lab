// On-device storage (IndexedDB). Every read/write goes through this module so the
// storage backend can later be swapped for a cloud service without touching the views.
//
// Stores
//   teams     { id, name, notes, createdAt }
//   players   { id, teamId, name, arm: 'right'|'left', style, heightCm, notes, createdAt }
//   sessions  { id, playerId, date, goal, notes, createdAt, summary }
//   clips     { id, sessionId, order, view, slowFactor, trim, fileName, status, outcome,
//               events, manualEvents, metrics, info, warnings, thumb, error }
//   poses     { clipId, n, times, lm, world, width, height, fps, ... }   (large, loaded on demand)
//   videos    { clipId, blob, type }                                      (large, loaded on demand)

const DB_NAME = 'delivery-lab';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('teams')) d.createObjectStore('teams', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('players')) d.createObjectStore('players', { keyPath: 'id' }).createIndex('teamId', 'teamId');
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' }).createIndex('playerId', 'playerId');
      if (!d.objectStoreNames.contains('clips')) d.createObjectStore('clips', { keyPath: 'id' }).createIndex('sessionId', 'sessionId');
      if (!d.objectStoreNames.contains('poses')) d.createObjectStore('poses', { keyPath: 'clipId' });
      if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath: 'clipId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function withTx(stores, mode, fn) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    let result;
    Promise.resolve(fn(tx)).then((r) => { result = r; }, (e) => { try { tx.abort(); } catch { /* already done */ } reject(e); });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export const db = {
  async all(store) {
    return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).getAll()));
  },
  async get(store, key) {
    if (key == null) return undefined;
    return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).get(key)));
  },
  async put(store, value) {
    await withTx([store], 'readwrite', (tx) => reqP(tx.objectStore(store).put(value)));
    requestPersistence();
    return value;
  },
  async del(store, key) {
    return withTx([store], 'readwrite', (tx) => reqP(tx.objectStore(store).delete(key)));
  },
  async byIndex(store, index, key) {
    return withTx([store], 'readonly', (tx) => reqP(tx.objectStore(store).index(index).getAll(key)));
  },
};

// Ask the browser not to evict our data under storage pressure (best effort).
let persistAsked = false;
function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

// ---------- Cascading deletes ----------

export async function deleteSessionCascade(sessionId) {
  const clips = await db.byIndex('clips', 'sessionId', sessionId);
  await withTx(['sessions', 'clips', 'poses', 'videos'], 'readwrite', (tx) => {
    for (const c of clips) {
      tx.objectStore('clips').delete(c.id);
      tx.objectStore('poses').delete(c.id);
      tx.objectStore('videos').delete(c.id);
    }
    tx.objectStore('sessions').delete(sessionId);
  });
}

export async function deletePlayerCascade(playerId) {
  const sessions = await db.byIndex('sessions', 'playerId', playerId);
  for (const s of sessions) await deleteSessionCascade(s.id);
  await db.del('players', playerId);
}

export async function deleteTeamCascade(teamId) {
  const players = await db.byIndex('players', 'teamId', teamId);
  for (const p of players) await deletePlayerCascade(p.id);
  await db.del('teams', teamId);
}

export async function deleteClipCascade(clipId) {
  await withTx(['clips', 'poses', 'videos'], 'readwrite', (tx) => {
    tx.objectStore('clips').delete(clipId);
    tx.objectStore('poses').delete(clipId);
    tx.objectStore('videos').delete(clipId);
  });
}

// ---------- Backup (metadata + results, no video or pose data) ----------

export async function exportBackup() {
  const [teams, players, sessions, clips] = await Promise.all(['teams', 'players', 'sessions', 'clips'].map((s) => db.all(s)));
  return {
    app: 'delivery-lab',
    version: 1,
    exportedAt: new Date().toISOString(),
    teams,
    players,
    sessions,
    clips: clips.map(({ thumb, ...rest }) => rest),
  };
}

export async function importBackup(data) {
  if (!data || data.app !== 'delivery-lab') throw new Error('This file is not a Delivery Lab backup.');
  await withTx(['teams', 'players', 'sessions', 'clips'], 'readwrite', (tx) => {
    for (const t of data.teams || []) tx.objectStore('teams').put(t);
    for (const p of data.players || []) tx.objectStore('players').put(p);
    for (const s of data.sessions || []) tx.objectStore('sessions').put(s);
    // Imported clips have no video/pose data on this device: mark them as results-only.
    for (const c of data.clips || []) tx.objectStore('clips').put({ ...c, imported: true });
  });
}
