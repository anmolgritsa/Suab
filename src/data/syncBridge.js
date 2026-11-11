/**
 * syncBridge.js — cross-BROWSER sync layered on top of localStorage.
 *
 * WHY: every screen reads/writes the DB through data/db.js, which sits on
 * localStorage. localStorage is shared between tabs of ONE browser profile
 * only — a labour checking in on Chrome is invisible to a supervisor
 * dashboard open in Edge. This bridge fixes that without touching any UI:
 *
 *   local write  → saveDb() posts the doc to PUT /api/db with a new,
 *                  monotonically increasing revision number.
 *   any browser  → the sync server (Vite middleware in dev, or
 *                  `npm run sync-server`) accepts the newest revision,
 *                  persists it to .data/db.json (survives restarts), and
 *                  pushes an SSE `revision` event.
 *   other        → on the event they GET /api/db, write the result back
 *   browsers       into the SAME localStorage key and dispatch the SAME
 *                  'suab:db-sync' CustomEvent useStorageSync already
 *                  listens for — so every existing screen updates live,
 *                  within ~1 s, with zero component changes.
 *
 * Revisions are Date.now()-based and strictly increase per client write,
 * which makes concurrent writers safe: a stale tab's PUT is rejected with
 * 409 and it simply reloads the newer document. Duplicate same-day
 * attendance stays impossible because markAttendance()'s idempotency check
 * runs against this converged document.
 *
 * Sessions are untouched: suab.session / suab.currentUser stay per-browser
 * by design (each person stays logged in on their own screen).
 *
 * The bridge no-ops silently when the API is absent (plain static hosting,
 * server down), so the app always keeps working as pure-localStorage.
 */

import { DB_KEY, getDb } from './db.js';

const SYNC_PATH_DB = 'api/db';
const SYNC_PATH_EVENTS = 'api/db/events';
/** Same event name useStorageSync dispatches/listens for same-tab writes. */
export const DB_SYNC_EVENT = 'suab:db-sync';
const APPLY_DEBOUNCE_MS = 250;
/** Must stay ahead of the server's persisted revision after restarts. */
const SERVER_CLOCK = Number(import.meta.env?.VITE_SYNC_CLOCK ?? 0) || 0;

function syncEndpoints() {
  const base = new URL(import.meta.env.BASE_URL ?? '/', window.location.origin);
  return {
    db: new URL(SYNC_PATH_DB, base).toString(),
    events: new URL(SYNC_PATH_EVENTS, base).toString(),
  };
}

let state = null;

function createState(endpoints) {
  return {
    endpoints,
    revision: Math.max(Date.now(), SERVER_CLOCK),
    applying: false, // suppresses sync echoes while we write a pulled doc
    applyTimer: null,
    pullInFlight: null,
    lastPulledRevision: 0,
  };
}

/** Push the current local DB to the server (newest revision wins). */
export async function pushDbToServer() {
  if (!state) return;
  state.revision = Math.max(state.revision + 1, Date.now());
  const revision = state.revision;
  try {
    const response = await fetch(state.endpoints.db, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision, db: getDb() }),
    });
    if (response.status === 409) {
      // A newer revision exists — adopt it.
      const body = await response.json().catch(() => null);
      if (body?.revision) await pullAndApply();
    }
  } catch {
    /* offline / server down — the app keeps working on localStorage alone */
  }
}

/** Pull the newest doc and mirror it into localStorage (+ notify screens). */
function applyServerDocument(revision, db) {
  state.applying = true;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage unavailable — screens will still re-read via other screens */
  } finally {
    state.applying = false;
  }
  state.lastPulledRevision = revision;
  state.revision = Math.max(revision + 1, Date.now(), SERVER_CLOCK);
  window.dispatchEvent(new CustomEvent(DB_SYNC_EVENT, { detail: { key: DB_KEY } }));
}

export async function pullAndApply() {
  if (!state) return false;
  if (state.pullInFlight) return state.pullInFlight;
  state.pullInFlight = (async () => {
    try {
      const response = await fetch(state.endpoints.db, { cache: 'no-store' });
      if (!response.ok) return false;
      const body = await response.json();
      if (
        typeof body?.revision === 'number' &&
        body.revision > state.lastPulledRevision &&
        body.db
      ) {
        applyServerDocument(body.revision, body.db);
        return true;
      }
    } catch {
      /* server absent — stay local-only */
    }
    return false;
  })();
  const applied = await state.pullInFlight;
  state.pullInFlight = null;
  return applied;
}

/** Debounced pull so a burst of SSE events collapses into one fetch. */
function schedulePull() {
  if (state.applyTimer != null) window.clearTimeout(state.applyTimer);
  state.applyTimer = window.setTimeout(() => {
    state.applyTimer = null;
    pullAndApply();
  }, APPLY_DEBOUNCE_MS);
}

/**
 * Boot the bridge once at app start (called from main.jsx):
 *  1. pull the shared doc — a browser with server-side data sees it even
 *     on first load,
 *  2. subscribe to SSE revision events for ~1 s cross-browser updates,
 *  3. fall back to polling when EventSource is unavailable/retrying.
 */
export async function startSyncBridge({ pollMs = 5000 } = {}) {
  if (state) return state; // StrictMode double-invocation safe
  state = createState(syncEndpoints());

  window.__suabSync = {
    push: pushDbToServer,
    pull: pullAndApply,
    get applying() {
      return state.applying;
    },
    revision: () => state.revision,
  };

  await pullAndApply();

  if (typeof EventSource === 'function') {
    let pollTimer = null;
    const startPolling = () => {
      if (pollTimer == null && pollMs > 0) {
        pollTimer = window.setInterval(pullAndApply, pollMs);
      }
    };
    const stopPolling = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const source = new EventSource(state.endpoints.events);
    source.addEventListener('revision', schedulePull); // server pushes
    source.addEventListener('open', stopPolling);
    source.addEventListener('error', startPolling); // retrying → poll instead
  } else if (pollMs > 0) {
    window.setInterval(pullAndApply, pollMs);
  }

  return state;
}
