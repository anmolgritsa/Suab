/**
 * alerts.js — the shared emergency-alerts inbox behind the Supervisor
 * workflow.
 *
 * WHY a separate module: the supervisor's "Alerts" screen and the
 * dashboard's unresolved-alerts badge must agree, so the demo alerts live
 * in one place. Persistence follows the same localStorage pattern as
 * data/requests.js (readJson/writeJson from utils/storage.js), exposed as
 * small get/save functions so the store can later be swapped for Supabase
 * without touching any screen.
 *
 * An alert record:
 *   { id, employeeId, type: 'machine' | 'material' | 'output',
 *     description, photo (true when a photo is attached), video (true when
 *     a video is attached), audio (true when a voice note is attached),
 *     at (display time), status: 'new' | 'acknowledged' | 'resolved',
 *     machineId + machineDetails (machine breakdowns only) }
 *
 * Demo data:
 *  - DEMO_ALERTS  the supervisor's demo inbox (seeded on first read)
 */

import { readJson, writeJson } from '../utils/storage.js';

/* The key is also listed in storage.js STORAGE_KEYS so the demo reset
   wipes it together with everything else. */
const KEY_ALERTS = 'suab.supervisorAlerts';

/** Alert types (color-coded badges on the alerts screen). */
export const ALERT_TYPES = {
  MACHINE: 'machine',
  MATERIAL: 'material',
  OUTPUT: 'output',
};

/** Alert statuses (color-coded badges + the dashboard's unresolved count). */
export const ALERT_STATUSES = {
  NEW: 'new',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
};

/* ### demo-data */
// The supervisor's demo inbox — who reported what, when, and which media
// is attached. A real build replaces this with backend queries.
function seedAlerts() {
  return [
    {
      id: 'alr-demo-1',
      employeeId: 'SUAB-1055', // Vijay Singh
      type: ALERT_TYPES.MACHINE,
      description: 'Machine 03 stopped mid-run — unusual grinding sound from the roller assembly.',
      photo: true,
      video: true,
      audio: true,
      at: '08:42 AM',
      status: ALERT_STATUSES.NEW,
      machineId: 'M-03',
      machineDetails: 'Roller assembly jammed; needs a mechanic before the next batch.',
    },
    {
      id: 'alr-demo-2',
      employeeId: 'SUAB-1031', // Sunita Devi
      type: ALERT_TYPES.MATERIAL,
      description: 'This morning’s sheet bundle has dented edges — cannot feed it into the press.',
      photo: true,
      video: false,
      audio: false,
      at: '09:20 AM',
      status: ALERT_STATUSES.NEW,
    },
    {
      id: 'alr-demo-3',
      employeeId: '9988', // Ramesh Kumar
      type: ALERT_TYPES.OUTPUT,
      description: 'Last pipe of the batch came out with a warped seam — set it aside for inspection.',
      photo: true,
      video: false,
      audio: true,
      at: '10:05 AM',
      status: ALERT_STATUSES.ACKNOWLEDGED,
    },
    {
      id: 'alr-demo-4',
      employeeId: 'SUAB-1024', // Amit Sharma
      type: ALERT_TYPES.MACHINE,
      description: 'Machine 02’s coolant pump is leaking — running it dry will overheat the spindle.',
      photo: false,
      video: true,
      audio: false,
      at: '11:15 AM',
      status: ALERT_STATUSES.RESOLVED,
      machineId: 'M-02',
      machineDetails: 'Pump seal replaced by maintenance; machine back in service.',
    },
    {
      id: 'alr-demo-5',
      employeeId: 'SUAB-1062', // Pooja Patel
      type: ALERT_TYPES.OUTPUT,
      description: 'Two coils from the last hour are under-weight — flagged them for re-check.',
      photo: true,
      video: false,
      audio: false,
      at: '12:30 PM',
      status: ALERT_STATUSES.RESOLVED,
    },
  ];
}

/* ### store */

/** Every demo alert on this device, seeding the inbox on first read so
    the screen and the dashboard's badge are never empty. */
export function getSupervisorAlerts() {
  const stored = readJson(KEY_ALERTS, null);
  if (stored) return stored;
  const seeds = seedAlerts();
  writeJson(KEY_ALERTS, seeds);
  return seeds;
}

/** Persist the whole inbox (called after a status change). */
export function saveSupervisorAlerts(alerts) {
  writeJson(KEY_ALERTS, alerts);
}

/** Flip one alert's status and persist the list. */
export function setSupervisorAlertStatus(id, status) {
  const alerts = getSupervisorAlerts().map((alert) =>
    alert.id === id ? { ...alert, status } : alert,
  );
  saveSupervisorAlerts(alerts);
  return alerts;
}

/** Alerts that still need the supervisor's attention (new or
    acknowledged) — the dashboard's Alerts badge count. */
export function countUnresolvedAlerts() {
  return getSupervisorAlerts().filter(
    (alert) => alert.status !== ALERT_STATUSES.RESOLVED,
  ).length;
}
