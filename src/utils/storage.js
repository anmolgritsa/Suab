/**
 * storage.js — tiny helpers around localStorage for the SUAB demo app.
 *
 * WHY: the app has no real backend yet, so we remember things (the
 * registered user, the chosen language, the logged-in session) in the
 * browser's localStorage. Everything here is safe to delete — clearing
 * your browser storage "resets" the demo.
 */

/** All keys we use live in one place so they are easy to find/change. */
export const STORAGE_KEYS = {
  REGISTERED_USER: 'suab.registeredUser', // { name, phone } — legacy; only read for the greeting
  SESSION: 'suab.session', // { mobile, employeeId, loginTimestamp, dayKey }
  LANGUAGE: 'suab.language', // 'en' for now (more languages in a later part)
  PIN_VAULT: 'suab.pinVault', // ENCRYPTED PIN record — see utils/secureStore.js
  PIN_SET: 'suab.pinSet', // boolean flag — this device has logged in before (has a PIN)
  DEVICE_KEY: 'suab.deviceKey', // AES-GCM vault key (the keystore stand-in)
  ATTENDANCE: 'suab.attendance', // attendance record — see saveAttendance()
  ALLOTMENT: 'suab.allotment', // today's accepted machine — see saveAllotment()
  HOMEPAGE_REACHED: 'suab.homepageReached', // { date } — last step of the daily flow
  ASSIGNED_QUANTITY: 'suab.assignedQuantity', // shift quota, set by the accepted machine
  SHIFT_START: 'suab.shiftStart', // ISO time the current shift began
  LAST_REMINDER: 'suab.lastReminderAt', // ISO time of the last work-update reminder
  SOS_EVENTS: 'suab.sosEvents', // [{ at }] emergency alerts raised (mock)
  WORK_UPDATES: 'suab.workUpdates', // [{ at, attachment }] updates sent to the supervisor
  ISSUE_REPORTS: 'suab.issueReports', // [{ category, timestamp, attachment }] — see saveIssueReport()
  PRODUCT_SUBMISSIONS: 'suab.productSubmissions', // [{ quantity, shiftEndTime }]
};

/**
 * Read a JSON value from localStorage.
 * Returns `fallback` when the key is missing or the value is corrupted,
 * so a broken value can never crash the app.
 * (Exported for utils/secureStore.js, which stores the PIN vault in the
 * same localStorage but keeps its encryption logic in one place.)
 */
export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Write a JSON value, ignoring private-mode/quota errors. */
export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the demo still works, it just won't persist */
  }
}

/** Remove a key, ignoring errors. */
export function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ---- Registered user (legacy — nothing writes it anymore, but a device
   that used the old signup flow still has one, and its name personalises
   the login greeting) ---- */

export function getRegisteredUser() {
  return readJson(STORAGE_KEYS.REGISTERED_USER, null);
}

export function saveRegisteredUser(user) {
  writeJson(STORAGE_KEYS.REGISTERED_USER, user);
}

export function clearRegisteredUser() {
  removeKey(STORAGE_KEYS.REGISTERED_USER);
}

/* ---- Session (set after a successful login) ----
 *
 * There is no signup: the supervisor hands out a mobile number and an
 * Employee ID, and a successful login records both plus when and on which
 * day the worker signed in:
 *   { mobile: '9876543210', employeeId: 'SUAB-1024',
 *     loginTimestamp: '…ISO…', dayKey: '2026-10-29' }
 */

export function getSession() {
  return readJson(STORAGE_KEYS.SESSION, null);
}

export function saveSession(session) {
  writeJson(STORAGE_KEYS.SESSION, session);
}

export function clearSession() {
  removeKey(STORAGE_KEYS.SESSION);
}

/* ---- Language preference (used by the language module in a later part) ---- */

export function getLanguage() {
  return readJson(STORAGE_KEYS.LANGUAGE, 'en');
}

export function setLanguage(lang) {
  writeJson(STORAGE_KEYS.LANGUAGE, lang);
}

/* ---- Attendance record (Part 2) ----
 *
 * One record per worker per DAY, stored as a single JSON object:
 *   { date: '2026-10-28', checkInAt: '2026-10-28T09:42:11.000Z',
 *     workerLat: 28.61, workerLng: 77.20, distanceMeters: 35 }
 * The date lives INSIDE the record, so getTodayAttendance() can ignore
 * yesterday's entry — attendance resets automatically every day.
 */

/** Today's date as a local 'YYYY-MM-DD' string (the record's key). */
export function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Today's attendance record, or null when the worker has not checked in yet. */
export function getTodayAttendance() {
  const record = readJson(STORAGE_KEYS.ATTENDANCE, null);
  return record && record.date === todayKey() ? record : null;
}

/** Stamp the record with today's date and persist it. */
export function saveAttendance(record) {
  const stamped = { ...record, date: todayKey() };
  writeJson(STORAGE_KEYS.ATTENDANCE, stamped);
  return stamped;
}

/** Forget today's record (demo reset — a new day also starts empty). */
export function clearAttendance() {
  removeKey(STORAGE_KEYS.ATTENDANCE);
}

/* ---- Machine allotment (accepted once per day, after check-in) ----
 *
 * The supervisor allots each worker a machine for the day; the worker
 * accepts it on the Machine Allotment screen. Like attendance, the record
 * is stamped with today's date so a new day starts the flow from scratch:
 *   { date: '2026-10-29', machineId: 'M-04', machineName: 'Tile Press #4',
 *     machineType: 'Pressing', targetQuantity: 500, acceptedAt: '…ISO…' }
 */

/** Today's accepted allotment, or null when none has been accepted yet. */
export function getTodayAllotment() {
  const record = readJson(STORAGE_KEYS.ALLOTMENT, null);
  return record && record.date === todayKey() ? record : null;
}

/** Stamp the allotment with today's date and persist it. */
export function saveAllotment(record) {
  const stamped = { ...record, date: todayKey() };
  writeJson(STORAGE_KEYS.ALLOTMENT, stamped);
  return stamped;
}

export function clearAllotment() {
  removeKey(STORAGE_KEYS.ALLOTMENT);
}

/* ---- "Homepage reached today" flag (the flow's last step) ----
 *
 * Once set, reopening the app and signing in again goes straight back to
 * the homepage — attendance and machine allotment are NOT repeated on the
 * same day. The date inside makes the flag expire at midnight, so a new
 * day runs the full flow again.
 */

/** Stamp "the worker reached the homepage today" (called on homepage mount). */
export function markHomepageReached() {
  writeJson(STORAGE_KEYS.HOMEPAGE_REACHED, { date: todayKey() });
}

/** True when the homepage flag was stamped today. */
export function hasReachedHomepageToday() {
  const flag = readJson(STORAGE_KEYS.HOMEPAGE_REACHED, null);
  return Boolean(flag) && flag.date === todayKey();
}

export function clearHomepageReached() {
  removeKey(STORAGE_KEYS.HOMEPAGE_REACHED);
}

/** '2026-10-28T09:42:11.000Z' -> '09:42 AM' in the device's local time. */
export function formatTime12h(isoString) {
  const time = new Date(isoString);
  if (Number.isNaN(time.getTime())) return '';
  return time
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    .toUpperCase();
}

/* ---- Active shift (Part 3 — labour homepage) ----
 *
 * A shift starts the first time the worker opens the homepage and keeps
 * running (across refreshes) until it reaches the full shift length.
 * The start time is stored as an ISO string.
 */

/** When the current shift started, or null if no shift is running. */
export function getShiftStart() {
  return readJson(STORAGE_KEYS.SHIFT_START, null);
}

/** Remember when the current shift began. */
export function saveShiftStart(isoString) {
  writeJson(STORAGE_KEYS.SHIFT_START, isoString);
}

/** End the current shift (the timer starts fresh next time). */
export function clearShiftStart() {
  removeKey(STORAGE_KEYS.SHIFT_START);
}

/* ---- Work-update reminder (shown every few hours during a shift) ---- */

/** When the last work-update reminder was shown, or null for never. */
export function getLastReminderAt() {
  return readJson(STORAGE_KEYS.LAST_REMINDER, null);
}

/** Stamp "a reminder was just shown" so the next one waits a full interval. */
export function saveLastReminderAt(isoString) {
  writeJson(STORAGE_KEYS.LAST_REMINDER, isoString);
}

export function clearLastReminderAt() {
  removeKey(STORAGE_KEYS.LAST_REMINDER);
}

/* ---- SOS events (mock — no backend yet) ---- */

/** Every emergency alert raised on this device, newest first. */
export function getSosEvents() {
  return readJson(STORAGE_KEYS.SOS_EVENTS, []);
}

/** Record an emergency alert and keep the list short (last 20). */
export function saveSosEvent(event) {
  const events = getSosEvents();
  events.unshift(event);
  writeJson(STORAGE_KEYS.SOS_EVENTS, events.slice(0, 20));
  return event;
}

/* ---- Work updates sent to the supervisor (mock) ---- */

/** Every update the worker sent, newest first. */
export function getWorkUpdates() {
  return readJson(STORAGE_KEYS.WORK_UPDATES, []);
}

/** Record a sent update (photo/video upload arrives in a later part). */
export function saveWorkUpdate(update) {
  const updates = getWorkUpdates();
  updates.unshift(update);
  writeJson(STORAGE_KEYS.WORK_UPDATES, updates.slice(0, 20));
  return update;
}

/* ---- Issue reports (Part 4 — the three report screens) ----
 *
 * One array holds every report from every category so a future backend
 * sync has a single queue to drain. The photo/video attachment is
 * mandatory, so every entry carries one (metadata only — nothing is
 * uploaded):
 *   { category: 'input-errors', timestamp: '…ISO…',
 *     attachment: { name, type, size } }
 */

/** Every report submitted on this device, newest first. */
export function getIssueReports() {
  return readJson(STORAGE_KEYS.ISSUE_REPORTS, []);
}

/** Record a report and keep the list short (last 50). */
export function saveIssueReport(report) {
  const reports = getIssueReports();
  reports.unshift(report);
  writeJson(STORAGE_KEYS.ISSUE_REPORTS, reports.slice(0, 50));
  return report;
}

/* ---- Product submissions (shift completion) ----
 *
 * Saved when the worker confirms the product count on the Product
 * Submission screen: { quantity, shiftEndTime, endedEarly? }.
 */

/** Every product submission on this device, newest first. */
export function getProductSubmissions() {
  return readJson(STORAGE_KEYS.PRODUCT_SUBMISSIONS, []);
}

/** Record a product submission and keep the list short (last 20). */
export function saveProductSubmission(submission) {
  const submissions = getProductSubmissions();
  submissions.unshift(submission);
  writeJson(STORAGE_KEYS.PRODUCT_SUBMISSIONS, submissions.slice(0, 20));
  return submission;
}

/**
 * The quantity the worker was assigned for this shift. The accepted machine
 * allotment writes it (see MachineAllotmentScreen); until one is accepted
 * we fall back to the demo default of 500.
 */
export const DEFAULT_ASSIGNED_QUANTITY = 500;

export function getAssignedQuantity() {
  const assigned = readJson(STORAGE_KEYS.ASSIGNED_QUANTITY, null);
  return Number.isFinite(assigned) && assigned > 0
    ? assigned
    : DEFAULT_ASSIGNED_QUANTITY;
}

/** Persist the shift's quota (called when an allotment is accepted). */
export function saveAssignedQuantity(quantity) {
  writeJson(STORAGE_KEYS.ASSIGNED_QUANTITY, quantity);
}

/* ---- Demo reset ---- */

/**
 * Wipe EVERYTHING the demo persists (account, session, PIN vault,
 * attendance, shift, reminders, SOS events, work updates). Used by the
 * "Reset demo data" link so a stakeholder can watch the whole flow from
 * the beginning — resetting also clears the saved PIN, so the next login
 * runs the full first-time flow (credentials → set PIN) again.
 * The language choice is kept on purpose — switching language should not
 * be part of the reset.
 */
export function clearAllDemoData() {
  Object.values(STORAGE_KEYS)
    .filter((key) => key !== STORAGE_KEYS.LANGUAGE)
    .forEach(removeKey);
}
