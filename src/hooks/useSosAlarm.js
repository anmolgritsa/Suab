/**
 * useSosAlarm.js — the supervisor dashboard's live SOS alarm + Home slot.
 *
 * Watches the SHARED `sosAlerts` collection (data/db.js) through the sync
 * bridge: the moment a labour raises an SOS in another browser, the record
 * lands here (~1 s) and the dashboard starts BLINKING (a red pulsing
 * overlay) and plays a repeating beep for exactly 4 seconds — then both
 * stop by themselves. No refresh anywhere.
 *
 * DAILY QUOTA (SOS_HOME_DAILY_LIMIT = 3, decided at write time by
 * addSosAlert): only an alert that CLAIMED the home slot today
 * (home.shownDate != null) trips the alarm — the 4th+ SOS of the day is
 * recorded silently in the Alerts page and never blinks/sounds here.
 *
 * The HOME SLOT is persistent: getHomeSosAlert() returns the alert
 * currently holding the Home page's card — it stays until the supervisor
 * removes it (Remove → confirm → removeHomeSosAlert) or the day ends
 * (shownDate stops matching todayKey()).
 *
 * Each SOS trips the alarm EXACTLY ONCE per browser: alarmedIdsRef guards
 * against the sync bridge's re-reads (acknowledge writes, other screens'
 * writes, the fallback poll). A Set (not a single id) so two alerts
 * landing in one sync burst each alarm exactly once.
 *
 * Autoplay policy: browsers only allow audio after a user gesture, and an
 * SOS arrives from a sync callback (no gesture). startSosAlarm() resumes a
 * suspended context and degrades to silence when blocked — the blinking
 * overlay is the notification that must always work. Any tap on the page
 * primes the audio context, so a later alarm sounds.
 *
 * Returns { alarmActive, alarmAlert, homeAlert } — alarmActive drives the
 * 4-second overlay; alarmAlert is the SOS that tripped it; homeAlert is
 * the persistent Home-page card (null when the slot is empty).
 */

import { useEffect, useRef, useState } from 'react';
import { DB_KEY, getHomeSosAlert } from '../data/db.js';
import { useStorageSync } from './useStorageSync.js';
import { startSosAlarm, stopSosAlarm } from '../utils/sosAlarm.js';

/** How long the blinking + beeping lasts after an SOS arrives (ms). */
export const SOS_ALARM_DURATION_MS = 4000;

/** sessionStorage key holding the ids this TAB has already alarmed for —
    so refreshing the dashboard never re-trips the alarm for the same SOS
    (the alarm sounds ONCE per SOS request, not once per page load). */
const SEEN_ALARM_IDS_KEY = 'suab.sos-alarmed-ids';
/** Cap the remembered list so the tab's storage stays tiny. */
const SEEN_ALARM_IDS_MAX = 50;

function loadSeenAlarmIds() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SEEN_ALARM_IDS_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeenAlarmIds(seen) {
  try {
    window.sessionStorage.setItem(
      SEEN_ALARM_IDS_KEY,
      JSON.stringify([...seen].slice(-SEEN_ALARM_IDS_MAX)),
    );
  } catch {
    /* storage unavailable — the in-memory guard still covers this session */
  }
}

export function useSosAlarm() {
  // The alert that tripped the current 4-second alarm window — kept so the
  // overlay names the right labourer even if a newer record lands mid-window.
  const [alarmAlert, setAlarmAlert] = useState(null);
  // Whether the 4-second alarm window is running (drives the blink).
  const [alarmActive, setAlarmActive] = useState(false);
  // The persistent Home-page card: the alert currently holding the slot.
  const [homeAlert, setHomeAlert] = useState(getHomeSosAlert);

  // Ids we have already alarmed for — a resync that finds no NEW record
  // (acknowledge, another screen's write, the fallback poll, a refresh)
  // never re-trips the alarm. A Set so two alerts landing in one sync
  // burst each alarm exactly once; mirrored to sessionStorage so a reload
  // of this tab does not alarm for the same SOS again.
  const alarmedIdsRef = useRef(loadSeenAlarmIds());
  // The auto-stop timer for the current alarm window.
  const timerRef = useRef(null);

  function stopAlarm() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setAlarmActive(false);
    stopSosAlarm(); // silence any pending beeps too
  }

  // Re-read the shared collection on every sync-bridge event (storage,
  // SSE-mirrored writes, focus, fallback poll) — the same live pattern the
  // other supervisor screens use.
  useStorageSync(() => {
    // The persistent Home card follows the slot's current holder.
    setHomeAlert(getHomeSosAlert());

    // The alarm trips only for a NEW home-slot claimant (the write-time
    // quota already excluded the 4th+ of the day — they never hold the
    // slot, so they never alarm here).
    const newest = getHomeSosAlert();
    if (newest && !alarmedIdsRef.current.has(newest.id)) {
      alarmedIdsRef.current.add(newest.id);
      saveSeenAlarmIds(alarmedIdsRef.current);
      setAlarmAlert(newest);
      setAlarmActive(true);
      startSosAlarm(SOS_ALARM_DURATION_MS);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(stopAlarm, SOS_ALARM_DURATION_MS);
    }
  }, DB_KEY);

  // Cleanup on unmount: no stray timers, no stuck overlay, no beeping.
  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      stopSosAlarm();
    },
    [],
  );

  return { alarmActive, alarmAlert, homeAlert };
}
