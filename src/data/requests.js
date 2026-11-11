/**
 * requests.js — the shared requests inbox behind the Supervisor workflow.
 *
 * WHY a separate module: the supervisor's "Requests" screen and the
 * dashboard's pending-requests badge must agree, so the demo requests live
 * in one place. Persistence follows the same localStorage pattern as
 * data/assignments.js (readJson/writeJson from utils/storage.js), exposed
 * as small get/save functions so the store can later be swapped for
 * Supabase without touching any screen.
 *
 * A request record:
 *   { id, employeeId, type: 'halfDay' | 'overtime', hours (overtime only),
 *     reason, audio (true when a voice note is attached), at (display
 *     time), status: 'pending' | 'approved' | 'rejected' }
 *
 * Demo data:
 *  - DEMO_REQUESTS  the supervisor's demo inbox (seeded on first read)
 */

import { readJson, writeJson } from '../utils/storage.js';

/* The key is also listed in storage.js STORAGE_KEYS so the demo reset
   wipes it together with everything else. */
const KEY_REQUESTS = 'suab.supervisorRequests';

/** Request types (color-coded badges on the requests screen). */
export const REQUEST_TYPES = {
  HALF_DAY: 'halfDay',
  OVERTIME: 'overtime',
};

/** Request statuses (color-coded badges + the dashboard's pending count). */
export const REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/* ### demo-data */
// The supervisor's demo inbox — who asked for what, when, and whether a
// voice note is attached. A real build replaces this with backend queries.
function seedRequests() {
  return [
    {
      id: 'req-demo-1',
      employeeId: 'SUAB-1024', // Amit Sharma
      type: REQUEST_TYPES.OVERTIME,
      hours: 2,
      reason: 'Finishing today’s coil batch before the delivery truck arrives.',
      audio: true,
      at: '09:15 AM',
      status: REQUEST_STATUSES.PENDING,
    },
    {
      id: 'req-demo-2',
      employeeId: 'SUAB-1031', // Sunita Devi
      type: REQUEST_TYPES.HALF_DAY,
      reason: 'Family function at home this afternoon.',
      audio: false,
      at: '10:02 AM',
      status: REQUEST_STATUSES.PENDING,
    },
    {
      id: 'req-demo-3',
      employeeId: 'SUAB-1055', // Vijay Singh
      type: REQUEST_TYPES.OVERTIME,
      hours: 3,
      reason: 'Machine 03 maintenance ran long — catching up on the target.',
      audio: true,
      at: '11:40 AM',
      status: REQUEST_STATUSES.APPROVED,
    },
    {
      id: 'req-demo-4',
      employeeId: 'SUAB-1062', // Pooja Patel
      type: REQUEST_TYPES.HALF_DAY,
      reason: 'Doctor’s appointment in the evening.',
      audio: true,
      at: '12:20 PM',
      status: REQUEST_STATUSES.REJECTED,
    },
    {
      id: 'req-demo-5',
      employeeId: '9988', // Ramesh Kumar
      type: REQUEST_TYPES.OVERTIME,
      hours: 1,
      reason: 'Willing to stay for the extra pipe order.',
      audio: false,
      at: '01:05 PM',
      status: REQUEST_STATUSES.PENDING,
    },
  ];
}

/* ### store */

/** Every demo request on this device, seeding the inbox on first read so
    the screen and the dashboard's badge are never empty. */
export function getSupervisorRequests() {
  const stored = readJson(KEY_REQUESTS, null);
  if (stored) return stored;
  const seeds = seedRequests();
  writeJson(KEY_REQUESTS, seeds);
  return seeds;
}

/** Persist the whole inbox (called after a decision). */
export function saveSupervisorRequests(requests) {
  writeJson(KEY_REQUESTS, requests);
}

/** Flip one request's status and persist the list. */
export function setRequestStatus(id, status) {
  const requests = getSupervisorRequests().map((request) =>
    request.id === id ? { ...request, status } : request,
  );
  saveSupervisorRequests(requests);
  return requests;
}
