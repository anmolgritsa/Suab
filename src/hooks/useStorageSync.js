/**
 * useStorageSync.js — keep a screen's localStorage-backed state in sync
 * across tabs and app focus, with NO manual refresh.
 *
 * WHY: the app persists everything (users, attendance, shifts…) in
 * localStorage (utils/storage.js + data/db.js). localStorage is shared
 * across tabs of the same origin, so two open tabs can otherwise show two
 * different states. This hook watches for changes and re-runs a caller's
 * resync:
 *
 *   - 'storage'           fires in every OTHER tab of the same origin when
 *                         one tab writes the watched key (e.g. the labour
 *                         tab writes 'suab.db') — true cross-tab sync.
 *   - window 'focus' +
 *     'visibilitychange'  re-reads when the user returns to this tab
 *                         (covers same-tab writes, which fire no event,
 *                         and any change missed while the tab was away).
 *   - a short interval    conservative fallback polling so the state
 *                         converges even if neither path fires.
 *
 * The effect rebinds whenever onResync, key, or interval changes, so the
 * listeners always fire the newest resync closure.
 *
 * Usage:
 *   const [rows, setRows] = useState(loadRows);
 *   useStorageSync(() => setRows(loadRows()), DB_KEY);
 *
 * Params:
 *  - onResync    re-read storage + setState. Made stateless by the caller,
 *                since a setState that finds nothing changed is a no-op.
 *  - key         the localStorage key to watch ('suab.db'); any change
 *                (including removal) when null.
 *  - intervalMs  fallback poll, default 2000 ms (0 disables it — use 0 in
 *                tests where fake timers matter).
 */

import { useEffect } from 'react';

const DEFAULT_INTERVAL_MS = 2000;
/**
 * Cross-browser channel: the sync bridge (data/syncBridge.js) mirrors a
 * DB pulled from the shared server into localStorage and re-dispatches
 * exactly this event, so this one listener covers same-tab writes AND
 * writes arriving from other browsers — no component needs to change.
 */
const DB_SYNC_EVENT = 'suab:db-sync';

export function useStorageSync(
  onResync,
  key = null,
  intervalMs = DEFAULT_INTERVAL_MS,
) {
  useEffect(() => {
    // Each render produces a fresh onResync closure (it captures current
    // state), so it is in the dep array and the listeners rebind whenever
    // onResync changes — the effect always fires the newest one.
    const resync = () => onResync();

    // Cross-tab: another tab of this origin wrote localStorage.
    function handleStorageChange(event) {
      if (event?.key && key != null && event.key !== key) return;
      resync();
    }

    // Cross-browser + same-tab: the sync bridge mirrors a server-pulled DB
    // into localStorage and saveDb() notifies writers; both re-dispatch
    // this CustomEvent, so this one listener covers both directions.
    function handleBridgeSync() {
      resync();
    }

    // Back to this tab: same-tab writes fire no 'storage' event, so refresh
    // on return to pick them up (and anything missed while hidden).
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') resync();
    }

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(DB_SYNC_EVENT, handleBridgeSync);
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fallback poll so state converges even if neither signal fires.
    let timer = null;
    if (intervalMs > 0) {
      timer = window.setInterval(resync, intervalMs);
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(DB_SYNC_EVENT, handleBridgeSync);
      window.removeEventListener('focus', resync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timer != null) window.clearInterval(timer);
    };
  }, [onResync, key, intervalMs]);
}
