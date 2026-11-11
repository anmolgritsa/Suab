/**
 * db.js — a lightweight, schema-versioned data layer on localStorage.
 *
 * WHY: the app has no backend yet, but login must authenticate against a
 * real set of accounts (labourers + a supervisor) instead of accepting any
 * well-formatted pair. Everything lives under ONE namespaced root key
 * ('suab.db') holding a schema-versioned document with TYPED COLLECTIONS
 * (users, attendance) — like a tiny embedded DB. Adding more accounts (or
 * more fields on a record) needs NO schema change: users/auth navigate via
 * find* helpers, and the version field leaves room for future migrations.
 *
 *   DB = { version: 1,
 *          collections: { users: [User, ...], attendance: [Record, ...] } }
 *
 *   User   = { id: 'usr-001', name: 'Ramesh Kumar', role: 'labour' | 'supervisor',
 *              credentials: { employeeId: 'LAB001', mobile: '9876540010', pin: '1234' } }
 *   Record = { id, userId, employeeId, name, date: 'YYYY-MM-DD', shift,
 *              checkInAt: '…ISO…', workerLat, workerLng, distanceMeters,
 *              status: 'present' } — idempotent: one record per labour per
 *              date per shift (see markAttendance).
 *
 * Since schema v2 a third collection, `updates`, holds shop-floor updates a
 * labourer files to the supervisor. Each record:
 *   Update = { id, labourId, labourName, type (see UPDATE_TYPES),
 *              details, media: [{ kind, dataUrl, name }], date, status,
 *              createdAt, updatedAt }
 * Idempotent add (same labour + type + details within a short window) and a
 * typed status lifecycle — see the section-updates helpers below.
 *
 * Since schema v4 a fifth collection, `productSubmissions`, holds the
 * confirmed shift counts from the labour Product Submission screen — the
 * supervisor's Reports screen reads them live (see the
 * section-product-submissions helpers below).
 *
 * The logged-in user is mirrored to 'suab.currentUser' for cross-page
 * state (profile/personalisation anywhere in the tree), while the flow
 * flags stay in utils/storage.js untouched.
 *
 * Both root keys are also listed in storage.js STORAGE_KEYS so the demo
 * reset wipes them together with everything else.
 */

import {
  formatTime12h,
  getSession,
  readJson,
  writeJson,
  removeKey,
  todayKey,
} from '../utils/storage.js';
// Schema version, roles, statuses, seed users and migrations live in
// dbCore.js, shared with the dev sync server (server/dataFile.js) so the
// browser copy and the on-disk copy can never drift apart.
import {
  DB_SCHEMA_VERSION,
  USER_ROLES,
  ATTENDANCE_STATUSES,
  UPDATE_TYPES,
  UPDATE_TYPE_WORK_ACTIVITY,
  UPDATE_MEDIA_KINDS,
  UPDATE_STATUSES,
  DEFECT_REPORT_TYPES,
  SOS_STATUSES,
  SOS_HOME_DAILY_LIMIT,
  seedDb,
  migrateDb,
  ensureSeededUsers,
} from './dbCore.js';

/** Namespaced storage keys (mirrored in utils/storage.js STORAGE_KEYS). */
export const DB_KEY = 'suab.db';
export const CURRENT_USER_KEY = 'suab.currentUser';

export {
  DB_SCHEMA_VERSION,
  USER_ROLES,
  ATTENDANCE_STATUSES,
  UPDATE_TYPES,
  UPDATE_TYPE_WORK_ACTIVITY,
  UPDATE_MEDIA_KINDS,
  UPDATE_STATUSES,
  DEFECT_REPORT_TYPES,
  SOS_STATUSES,
  SOS_HOME_DAILY_LIMIT,
};

/**
 * Read the whole document, seeding it (11 accounts: LAB001–LAB010 +
 * SUP001) on first read so every screen is never empty. A corrupted value
 * falls back to an empty document instead of crashing.
 */
export function getDb() {
  const stored = readJson(DB_KEY, null);
  if (stored && typeof stored === 'object' && typeof stored.version === 'number') {
    // migrateDb() upgrades the shape; ensureSeededUsers() repairs a document
    // that is structurally valid but has LOST its accounts (empty users
    // collection) — without this, nobody could ever log in again.
    const migrated = migrateDb(stored);
    const healed = ensureSeededUsers(migrated);
    if (healed !== migrated) {
      // The stored document had no accounts — persist the repair (the same
      // write-on-read seedDb() already does) so the next read and the next
      // sync push start from the healthy roster.
      writeJson(DB_KEY, healed);
    }
    return healed;
  }
  const seeded = seedDb();
  writeJson(DB_KEY, seeded);
  return seeded;
}

/** Persist the whole document + notify the sync bridge when running. */
export function saveDb(db) {
  writeJson(DB_KEY, db);
  // Same-tab notification through the shared channel (useStorageSync also
  // dispatches this); the sync bridge mirrors the change to other BROWSERS.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('suab:db-sync', { detail: { key: DB_KEY } }));
    window.__suabSync?.push?.();
  }
}

/** Wipe the document and reseed (used by the demo reset path). */
export function resetDb() {
  removeKey(DB_KEY);
  return getDb();
}
/* ### endsection-store */

/* ### section-users */

/** Every user account in the database (seeded + any added later). */
export function getUsers() {
  return getDb().collections.users;
}

/** Every account with the given role (e.g. a labour-only roster). */
export function getUsersByRole(role) {
  return getUsers().filter((user) => user.role === role);
}

/** The account for an Employee ID (' LAB001 ' → 'LAB001'), or null. */
export function findUserByEmployeeId(employeeId) {
  const id = (employeeId ?? '').trim().toUpperCase();
  if (!id) return null;
  return (
    getUsers().find(
      (user) => user.credentials.employeeId.toUpperCase() === id,
    ) ?? null
  );
}

/** The account for a mobile number (digits only), or null. */
export function findUserByMobile(mobile) {
  const digits = (mobile ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return (
    getUsers().find((user) => user.credentials.mobile === digits) ?? null
  );
}

/** The account for an internal user id ('usr-001'…), or null. */
export function findUserById(userId) {
  return getUsers().find((user) => user.id === userId) ?? null;
}

/**
 * Add a new account (a labourer or another supervisor) — the record shape
 * { id, name, role, credentials } stays the same, so no schema change is
 * ever needed. A duplicate employeeId is refused: the existing account is
 * returned instead of creating a conflicting one.
 */
export function addUser(user) {
  const existing = findUserByEmployeeId(user?.credentials?.employeeId);
  if (existing) return existing;
  const id =
    user?.id ?? `usr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const record = {
    id,
    name: user?.name ?? '',
    role: user?.role === USER_ROLES.SUPERVISOR ? USER_ROLES.SUPERVISOR : USER_ROLES.LABOUR,
    credentials: {
      employeeId: (user?.credentials?.employeeId ?? '').trim(),
      mobile: (user?.credentials?.mobile ?? '').replace(/\D/g, ''),
      pin: user?.credentials?.pin ?? null,
    },
  };
  const db = getDb();
  db.collections.users.push(record);
  saveDb(db);
  return record;
}

/** Patch an existing account (matched by employeeId) and persist. */
export function updateUser(employeeId, patch) {
  const db = getDb();
  const id = (employeeId ?? '').trim().toUpperCase();
  const index = db.collections.users.findIndex(
    (user) => user.credentials.employeeId.toUpperCase() === id,
  );
  if (index === -1) return null;
  const merged = {
    ...db.collections.users[index],
    ...patch,
    credentials: { ...db.collections.users[index].credentials, ...patch?.credentials },
  };
  db.collections.users[index] = merged;
  saveDb(db);
  return merged;
}

/**
 * The login flow's front door: match BOTH the Employee ID and the mobile
 * number against one account and return the user, or null when no account
 * has that exact pair. Callers route by `user.role`.
 *
 * Null PINs/passwords are the NORMAL state for every seeded account (the
 * PIN is reserved for a future "set your PIN" flow) — authentication is
 * Employee ID + mobile only, and a null pin never blocks a login. The
 * guards below also keep a malformed credentials object (missing
 * employeeId/mobile) from throwing instead of failing the match.
 */
export function authenticateUser(employeeId, mobile) {
  const user = findUserByEmployeeId(employeeId);
  if (!user) return null;
  const digits = (mobile ?? '').replace(/\D/g, '');
  const stored = String(user.credentials?.mobile ?? '').replace(/\D/g, '');
  return stored && stored === digits ? user : null;
}
/* ### endsection-users */

/* ### section-attendance */

/** Shift identifiers stored on a record (the factory runs one shift today,
    but the field lets extra shifts be added without a schema change). */
export const SHIFTS = { CURRENT: 'current' };

/** Find one labour's record for a date+shift (the idempotency key), or null. */
function findAttendanceEntry(list, employeeId, date, shift) {
  const id = (employeeId ?? '').trim().toUpperCase();
  return (
    list.find(
      (record) =>
        record.employeeId.toUpperCase() === id &&
        record.date === date &&
        (record.shift ?? SHIFTS.CURRENT) === shift,
    ) ?? null
  );
}

/** Every attendance record in the collection. */
export function getAllAttendance() {
  return getDb().collections.attendance;
}

/** All records for one day (default today) — e.g. the supervisor's sheet. */
export function getAttendanceForDate(date = todayKey()) {
  return getAllAttendance().filter((record) => record.date === date);
}

/** One labourer's record for one day (default today), or null. */
export function getAttendanceFor(employeeId, date = todayKey()) {
  const id = (employeeId ?? '').trim().toUpperCase();
  if (!id) return null;
  return (
    getAllAttendance().find(
      (record) =>
        record.employeeId.toUpperCase() === id && record.date === date,
    ) ?? null
  );
}

/**
 * Record (or update) a check-in for an account — one record per user per
 * day, always stamped with today's date so a new day starts empty.
 * (Upsert variant kept for tools that need to overwrite; the UI uses the
 * idempotent markAttendance below.)
 */
export function saveAttendanceRecord(user, checkIn) {
  const record = {
    id: `att-${user.credentials.employeeId}-${todayKey()}`,
    userId: user.id,
    employeeId: user.credentials.employeeId,
    name: user.name ?? '',
    date: todayKey(),
    shift: checkIn?.shift ?? SHIFTS.CURRENT,
    checkInAt: checkIn?.checkInAt ?? new Date().toISOString(),
    workerLat: checkIn?.workerLat ?? null,
    workerLng: checkIn?.workerLng ?? null,
    distanceMeters: checkIn?.distanceMeters ?? null,
    status: checkIn?.status ?? ATTENDANCE_STATUSES.PRESENT,
  };
  const db = getDb();
  const list = db.collections.attendance;
  const index = list.findIndex(
    (entry) => entry.employeeId === record.employeeId && entry.date === record.date,
  );
  if (index === -1) list.push(record);
  else list[index] = record;
  saveDb(db);
  return record;
}

/**
 * Mark a labour's attendance for today's current shift — IDEMPOTENT.
 *
 * One record per labour per date per shift: if that record already exists
 * it is returned untouched (result.created === false), so re-marking can
 * never create a duplicate or move the original check-in time. Callers
 * show the "already marked" state whenever `created` is false.
 *
 * Returns { record, created } — record always carries the labour's id,
 * employeeId, name, date, shift and check-in time.
 */
export function markAttendance(user, checkIn = {}) {
  const date = todayKey();
  const shift = checkIn.shift ?? SHIFTS.CURRENT;
  const db = getDb();
  const list = db.collections.attendance;
  const existing = findAttendanceEntry(list, user?.credentials?.employeeId, date, shift);
  if (existing) return { record: existing, created: false };
  const record = {
    id: `att-${user.credentials.employeeId}-${date}-${shift}`,
    userId: user.id,
    employeeId: user.credentials.employeeId,
    name: user.name ?? '',
    date,
    shift,
    checkInAt: checkIn.checkInAt ?? new Date().toISOString(),
    workerLat: checkIn.workerLat ?? null,
    workerLng: checkIn.workerLng ?? null,
    distanceMeters: checkIn.distanceMeters ?? null,
    status: checkIn.status ?? ATTENDANCE_STATUSES.PRESENT,
  };
  list.push(record);
  saveDb(db);
  return { record, created: true };
}
/* ### endsection-attendance */

/* ### section-updates */

/**
 * Two submissions count as "the same update" if the same labourer re-files
 * the same type with the same details within this short window — covers a
 * double-tap / offline retry, but not a genuinely new report right after.
 */
const UPDATE_DEDUP_WINDOW_MS = 60 * 1000;

function normalizeUpdateDetails(details) {
  return String(details ?? '').trim().replace(/\s+/g, ' ');
}

function sanitizeUpdateMedia(media) {
  if (media == null) return [];
  if (!Array.isArray(media)) return null; // non-array media payload → reject
  const clean = [];
  for (const item of media) {
    if (!item || typeof item !== 'object') return null;
    const kind = String(item.kind ?? '');
    const dataUrl = String(item.dataUrl ?? '');
    if (!UPDATE_MEDIA_KINDS.includes(kind) || !dataUrl) return null;
    clean.push({ kind, dataUrl, name: String(item.name ?? '') });
  }
  return clean;
}

/** Every labour-filed update, newest first. */
export function getUpdates() {
  return [...getDb().collections.updates].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

/** All updates filed by one labourer, newest first. */
export function getUpdatesByLabour(labourId) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return [];
  return getUpdates().filter(
    (update) => update.labourId.toUpperCase() === id,
  );
}

/** The single update with the given id, or null. */
export function getUpdateById(id) {
  return getDb().collections.updates.find((u) => u.id === id) ?? null;
}

/**
 * File a shop-floor update from a labourer — IDEMPOTENT.
 *
 * payload: { labourId, labourName, type (UPDATE_TYPES), details,
 *            media: [{ kind, dataUrl, name }] } — the Work Activities
 * screen files type 'work-activity' with the voice note as audio media.
 *
 * Validation: type must be one of UPDATE_TYPES, details non-empty, media
 * restricted to UPDATE_MEDIA_KINDS with a data URL. If the same labourer
 * has filed an equivalent update (same type + details, case/spacing
 * insensitive) within UPDATE_DEDUP_WINDOW_MS, the EXISTING record is
 * returned untouched instead of creating a duplicate — the caller treats
 * that as the "already filed" state.
 *
 * The record carries everything the supervisor's update feed renders:
 * labour id, name, the factory date (todayKey), the created-at time, the
 * details and the media (the voice note), status 'new'. The write goes
 * through saveDb(), so the sync bridge pushes it to other browsers.
 *
 * Returns { record, created } — record is null when the payload is
 * invalid; created is false when the dedup window returned an existing
 * record (the caller shows the "already sent" state).
 */
export function addUpdate(payload = {}) {
  const labourId = String(payload.labourId ?? '').trim();
  const labourName = String(payload.labourName ?? '').trim();
  const type = String(payload.type ?? '');
  const details = normalizeUpdateDetails(payload.details);
  if (!labourId || !UPDATE_TYPES.includes(type) || !details) return null;
  const media = sanitizeUpdateMedia(payload.media);
  if (media === null) return null;
  const db = getDb();
  const list = db.collections.updates;
  const now = Date.now();
  const duplicate = list.find(
    (u) =>
      u.labourId.toUpperCase() === labourId.toUpperCase() &&
      u.type === type &&
      normalizeUpdateDetails(u.details).toUpperCase() === details.toUpperCase() &&
      now - Date.parse(u.createdAt) < UPDATE_DEDUP_WINDOW_MS,
  );
  if (duplicate) return { record: duplicate, created: false };
  const stamp = new Date(now).toISOString();
  const record = {
    id: `upd-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    labourId,
    labourName,
    type,
    details,
    media,
    date: todayKey(), // the factory day the update belongs to (the feed)
    status: UPDATE_STATUSES[0],
    createdAt: stamp,
    updatedAt: stamp,
  };
  list.push(record);
  saveDb(db);
  return { record, created: true };
}

/**
 * Move an update through its lifecycle (supervisor acknowledges / works /
 * closes). Any status in UPDATE_STATUSES is accepted; unknown ids return
 * null; updatedAt is bumped. The write syncs to other browsers via saveDb().
 */
export function setUpdateStatus(id, status) {
  if (!UPDATE_STATUSES.includes(status)) return null;
  const db = getDb();
  const record = db.collections.updates.find((u) => u.id === id) ?? null;
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return record;
}
/* ### endsection-updates */

/* ### section-requests */

/** The request types a labourer can file (color-coded badges both sides). */
export const REQUEST_TYPES = {
  HALF_DAY: 'half_day',
  OVERTIME: 'overtime',
};

/** Request lifecycle (Pending → Approved | Rejected — decided once). */
export const REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/**
 * The signed-in labourer's identity for request attribution: { id, name }
 * (id = the Employee ID, name = the account's name from the data layer).
 * Empty strings when nobody is signed in — addRequest() then refuses the
 * payload rather than saving an unattributable request.
 */
export function getCurrentLabour() {
  const session = getSession();
  const user = findUserByEmployeeId(session?.employeeId);
  return {
    id: user?.credentials?.employeeId ?? session?.employeeId ?? '',
    name: user?.name ?? '',
  };
}

/** Every filed request, newest first. */
export function getRequests() {
  return [...getDb().collections.requests].sort((a, b) =>
    String(b.requestedAt).localeCompare(String(a.requestedAt)),
  );
}

/** All requests filed by one labourer, newest first. */
export function getRequestsByLabour(labourId) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return [];
  return getRequests().filter(
    (request) => String(request.labourId).toUpperCase() === id,
  );
}

/** The single request with the given id, or null. */
export function getRequestById(id) {
  return getDb().collections.requests.find((r) => r.id === id) ?? null;
}

/**
 * The labourer's ACTIVE request of one type for a date — the LATEST record
 * that is still pending or approved (a rejected request never blocks a new
 * application). Null when none exists. This is the duplicate guard's lookup
 * AND the labour screens' status source.
 */
export function findActiveRequest(
  labourId,
  type,
  date = todayKey(),
  sinceIso = null,
) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return null;
  return (
    getRequests().find(
      (request) =>
        String(request.labourId).toUpperCase() === id &&
        request.type === type &&
        request.date === date &&
        (request.status === REQUEST_STATUSES.PENDING ||
          request.status === REQUEST_STATUSES.APPROVED) &&
        // Shift scoping (optional): ISO timestamps compare correctly as
        // strings, so `sinceIso` keeps a PREVIOUS shift's approval from
        // leaking into the shift that followed it.
        (!sinceIso || String(request.requestedAt) >= sinceIso),
    ) ?? null
  );
}

/** Overtime is requested in whole hours, 1–8 (the stepper's bounds). */
const REQUEST_MIN_HOURS = 1;
const REQUEST_MAX_HOURS = 8;

/**
 * File a half-day / overtime request from a labourer — IDEMPOTENT.
 *
 * payload: { labourId, labourName, type (REQUEST_TYPES), hours (overtime),
 *            reason (optional text), voiceNote (optional audio data URL),
 *            requestedAt (optional ISO — defaults to now) }
 *
 * Duplicate guard: one PENDING or APPROVED request per labour + type + DAY.
 * A repeat submission returns the EXISTING record untouched
 * ({ record, created: false }) — callers show the "already requested"
 * state whenever `created` is false. A REJECTED request does not block a
 * fresh application.
 *
 * The record carries everything the supervisor's inbox renders: labour id,
 * name, date, time, type, hours / voice note and the Pending status. The
 * write goes through saveDb(), so the sync bridge pushes it to the
 * supervisor's browser within ~1 s.
 *
 * Returns { record, created } — record is null when the payload is invalid.
 */
export function addRequest(payload = {}) {
  const labourId = String(payload.labourId ?? '').trim();
  const labourName = String(payload.labourName ?? '').trim();
  const type = String(payload.type ?? '');
  if (!labourId || !Object.values(REQUEST_TYPES).includes(type)) return null;

  // Overtime carries its requested hours; half-day carries a voice note.
  let hours = null;
  if (type === REQUEST_TYPES.OVERTIME) {
    hours = Number(payload.hours);
    if (
      !Number.isFinite(hours) ||
      hours < REQUEST_MIN_HOURS ||
      hours > REQUEST_MAX_HOURS
    ) {
      return null;
    }
    hours = Math.floor(hours);
  }
  const voiceNote =
    type === REQUEST_TYPES.HALF_DAY && typeof payload.voiceNote === 'string'
      ? payload.voiceNote
      : null;
  const reason =
    typeof payload.reason === 'string' && payload.reason.trim()
      ? payload.reason.trim()
      : null;

  const date = todayKey();
  const duplicate = findActiveRequest(labourId, type, date);
  if (duplicate) return { record: duplicate, created: false };

  const requestedAt = payload.requestedAt ?? new Date().toISOString();
  const stamp = new Date().toISOString();
  const record = {
    id: `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    labourId,
    labourName,
    type,
    date,
    time: formatTime12h(requestedAt),
    requestedAt,
    hours,
    reason,
    voiceNote,
    hasVoiceNote: Boolean(voiceNote),
    status: REQUEST_STATUSES.PENDING,
    decidedAt: null,
    decidedBy: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const db = getDb();
  db.collections.requests.push(record);
  saveDb(db);
  return { record, created: true };
}

/**
 * The supervisor's decision — Approve or Reject a PENDING request.
 *
 * Double-handling guard: only a request whose status is still 'pending' can
 * be decided; an already approved/rejected one is returned untouched
 * ({ record, decided: false }), so a double-tap or two supervisors can never
 * flip a decision twice. The write syncs to every browser via saveDb().
 *
 * Returns { record, decided } — record is null for unknown ids / bad status.
 */
export function setRequestDecision(id, status, decidedBy = null) {
  if (
    status !== REQUEST_STATUSES.APPROVED &&
    status !== REQUEST_STATUSES.REJECTED
  ) {
    return null;
  }
  const db = getDb();
  const record = db.collections.requests.find((r) => r.id === id) ?? null;
  if (!record) return null;
  if (record.status !== REQUEST_STATUSES.PENDING) {
    return { record, decided: false }; // already decided — never re-decide
  }
  record.status = status;
  record.decidedAt = new Date().toISOString();
  record.decidedBy = decidedBy == null ? null : String(decidedBy);
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return { record, decided: true };
}

/**
 * Patch presentation state on one request (e.g. the homepage's
 * startedNotified flag so an "Overtime Started" toast never repeats).
 * Unknown ids return null; the write syncs like every other change.
 */
export function patchRequest(id, patch) {
  if (!patch || typeof patch !== 'object') return null;
  const db = getDb();
  const record = db.collections.requests.find((r) => r.id === id) ?? null;
  if (!record) return null;
  const merged = { ...record, ...patch, updatedAt: new Date().toISOString() };
  db.collections.requests[db.collections.requests.indexOf(record)] = merged;
  saveDb(db);
  return merged;
}

/**
 * The labourer's LATEST request of one type for a date — ANY status, so a
 * Rejected decision stays visible on the labour side (findActiveRequest
 * above deliberately ignores rejected records to allow re-application).
 * Null when no request of this type exists for the date.
 */
export function findLatestRequest(
  labourId,
  type,
  date = todayKey(),
  sinceIso = null,
) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return null;
  return (
    getRequests().find(
      (request) =>
        String(request.labourId).toUpperCase() === id &&
        request.type === type &&
        request.date === date &&
        (!sinceIso || String(request.requestedAt) >= sinceIso),
    ) ?? null
  );
}

/* ### endsection-requests */

/* ### section-product-submissions */

/**
 * The labour Product Submission screen's confirmed shift counts, filed to
 * the SHARED document so the supervisor's Reports screen sees them live
 * (same sync path as updates/requests: saveDb() → sync bridge → SSE).
 *
 *   Submission = { id, labourId, labourName, machineId, machineName,
 *                  date, submittedAt, shiftStartAt, shiftEndAt,
 *                  successful, rejected, reusable, endedEarly }
 *
 * `date` is the factory day (todayKey) the report belongs to — the
 * supervisor's Reports screen groups on it; `shiftStartAt`/`shiftEndAt`
 * measure the reported working hours.
 */

/** Every product submission, newest first. */
export function getProductSubmissions() {
  return [...getDb().collections.productSubmissions].sort((a, b) =>
    String(b.submittedAt).localeCompare(String(a.submittedAt)),
  );
}

/** All submissions filed by one labourer, newest first. */
export function getProductSubmissionsByLabour(labourId) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return [];
  return getProductSubmissions().filter(
    (submission) => String(submission.labourId).toUpperCase() === id,
  );
}

/** The single submission with the given id, or null. */
export function getProductSubmissionById(id) {
  return getDb().collections.productSubmissions.find((s) => s.id === id) ?? null;
}

/**
 * File a confirmed product submission from a labourer.
 *
 * payload: { labourId, labourName, successful, rejected, reusable,
 *            machineId?, machineName?, shiftStartAt?, shiftEndAt?,
 *            endedEarly?, submittedAt? }
 *
 * Validation mirrors the Product Submission screen's own checks: the three
 * counts must be non-negative integers with at least one non-zero, and the
 * labourer must be attributable (labourId). Returns { record, created } —
 * record is null when the payload is invalid. The write goes through
 * saveDb(), so the supervisor's Reports screen updates within ~1 s.
 */
export function addProductSubmission(payload = {}) {
  const labourId = String(payload.labourId ?? '').trim();
  const labourName = String(payload.labourName ?? '').trim();
  if (!labourId) return { record: null, created: false };
  const counts = {
    successful: Number(payload.successful ?? 0),
    rejected: Number(payload.rejected ?? 0),
    reusable: Number(payload.reusable ?? 0),
  };
  const total = counts.successful + counts.rejected + counts.reusable;
  if (
    total === 0 ||
    !Object.values(counts).every((n) => Number.isInteger(n) && n >= 0)
  ) {
    return { record: null, created: false };
  }
  const submittedAt =
    typeof payload.submittedAt === 'string' && payload.submittedAt
      ? payload.submittedAt
      : new Date().toISOString();
  const stamp = new Date().toISOString();
  const record = {
    id: `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    labourId,
    labourName,
    machineId: payload.machineId ?? null,
    machineName: payload.machineName ?? null,
    date: todayKey(), // the factory day the report belongs to
    submittedAt,
    shiftStartAt: payload.shiftStartAt ?? null,
    shiftEndAt: payload.shiftEndAt ?? submittedAt,
    ...counts,
    endedEarly: Boolean(payload.endedEarly),
    createdAt: stamp,
    updatedAt: stamp,
  };
  const db = getDb();
  db.collections.productSubmissions.push(record);
  saveDb(db);
  return { record, created: true };
}

/**
 * The supervisor Reports screen's data seam — submissions grouped
 * date-wise, newest date first; within a date, newest submissions first
 * (getProductSubmissions() is already newest-first). PURE: takes the
 * submission list as an argument so it is unit-testable without a DOM,
 * and defensive so one malformed record can never take the screen down
 * (a throw here happens during render → blank page).
 *
 * Returns [{ dateKey, rows: [submission, …] }] — rows carry the raw
 * records; the screen joins on the roster for names/IDs.
 */
export function groupSubmissionsByDate(submissions) {
  const groups = new Map();
  const list = Array.isArray(submissions) ? submissions : [];
  for (const submission of list) {
    if (!submission || typeof submission !== 'object') continue;
    const dateKey =
      (typeof submission.date === 'string' && submission.date) ||
      dateKeyOfIso(submission.submittedAt) ||
      todayKey();
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(submission);
  }
  return [...groups.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([dateKey, rows]) => ({ dateKey, rows }));
}

// '2026-11-10T08:05:33.000Z' → '2026-11-10' (local day of an ISO stamp) —
// the fallback for records that predate the `date` field.
function dateKeyOfIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/* ### endsection-product-submissions */

/* ### section-defect-reports */

/**
 * The labour ReportForm's defect/breakdown reports (Input Errors / Machine
 * Defect / Output Errors screens), filed to the SHARED document so the
 * supervisor's Alerts screen sees them live (same sync path as updates /
 * requests / productSubmissions: saveDb() → sync bridge → SSE).
 *
 *   Report = { id, labourId, labourName, type (DEFECT_REPORT_TYPES),
 *              date, time, reportedAt, voiceNote, hasVoiceNote,
 *              attachment: { name, type, size } | null, status,
 *              createdAt, updatedAt }
 *
 * `date` is the factory day (todayKey) the report belongs to — the
 * supervisor's Alerts screen groups on it. `voiceNote` is the recorded
 * audio: a data URL when the sync server is absent, or the SERVED PATH
 * ('/api/work-uploads/<file>') the server rewrites it to on the next PUT
 * (same pipeline the work-updates media rides — see server/syncServer.js).
 * `attachment` keeps the picked file's METADATA only (name/type/size) —
 * images are deliberately NOT uploaded yet (images-only upload comes later).
 */

/** Every defect report, newest first. */
export function getDefectReports() {
  return [...getDb().collections.defectReports].sort((a, b) =>
    String(b.reportedAt).localeCompare(String(a.reportedAt)),
  );
}

/** All reports filed by one labourer, newest first. */
export function getDefectReportsByLabour(labourId) {
  const id = String(labourId ?? '').trim().toUpperCase();
  if (!id) return [];
  return getDefectReports().filter(
    (report) => String(report.labourId).toUpperCase() === id,
  );
}

/** The single report with the given id, or null. */
export function getDefectReportById(id) {
  return getDb().collections.defectReports.find((r) => r.id === id) ?? null;
}

/**
 * File a defect/breakdown report from a labourer.
 *
 * payload: { labourId, labourName, type (DEFECT_REPORT_TYPES),
 *            voiceNote (optional audio data URL), attachment (optional
 *            { name, type, size } metadata — images are NOT uploaded),
 *            reportedAt (optional ISO — defaults to now) }
 *
 * The record carries everything the supervisor's Alerts screen renders:
 * labour id, name, type, the factory date, the display time, the voice
 * note and the attachment metadata. The write goes through saveDb(), so
 * the sync bridge pushes it to the supervisor's browser within ~1 s.
 *
 * Returns { record, created } — record is null when the payload is invalid
 * (unknown type, unattributable labourer, non-string voice note).
 */
export function addDefectReport(payload = {}) {
  const labourId = String(payload.labourId ?? '').trim();
  const labourName = String(payload.labourName ?? '').trim();
  const type = String(payload.type ?? '');
  if (!labourId || !DEFECT_REPORT_TYPES.includes(type)) {
    return { record: null, created: false };
  }
  // Voice note: an optional audio data URL (utils/voiceNote.js). Anything
  // else (blob URL, object, empty) is dropped rather than stored broken.
  const voiceNote =
    typeof payload.voiceNote === 'string' &&
    payload.voiceNote.startsWith('data:')
      ? payload.voiceNote
      : null;
  // Attachment metadata only — the picked file itself is never uploaded.
  const attachment =
    payload.attachment && typeof payload.attachment === 'object'
      ? {
          name: String(payload.attachment.name ?? ''),
          type: String(payload.attachment.type ?? ''),
          size: Number(payload.attachment.size ?? 0),
        }
      : null;

  const reportedAt =
    typeof payload.reportedAt === 'string' && payload.reportedAt
      ? payload.reportedAt
      : new Date().toISOString();
  const stamp = new Date().toISOString();
  const record = {
    id: `def-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    labourId,
    labourName,
    type,
    date: todayKey(), // the factory day the report belongs to (the feed)
    time: formatTime12h(reportedAt),
    reportedAt,
    voiceNote,
    hasVoiceNote: Boolean(voiceNote),
    attachment,
    status: 'new',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const db = getDb();
  db.collections.defectReports.push(record);
  saveDb(db);
  return { record, created: true };
}

/**
 * The supervisor Alerts screen's data seam — reports grouped date-wise,
 * newest date first; within a date, newest reports first
 * (getDefectReports() is already newest-first). PURE: takes the report
 * list as an argument so it is unit-testable without a DOM, and defensive
 * so one malformed record can never take the screen down (a throw here
 * happens during render → blank page).
 *
 * Returns [{ dateKey, rows: [report, …] }] — rows carry the raw records;
 * the screen renders names/IDs straight from them.
 */
export function groupDefectReportsByDate(reports) {
  const groups = new Map();
  const list = Array.isArray(reports) ? reports : [];
  for (const report of list) {
    if (!report || typeof report !== 'object') continue;
    const dateKey =
      (typeof report.date === 'string' && report.date) ||
      dateKeyOfIso(report.reportedAt) ||
      todayKey();
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(report);
  }
  return [...groups.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([dateKey, rows]) => ({ dateKey, rows }));
}

/**
 * Move a defect report through its lifecycle (supervisor acknowledges /
 * resolves). Only 'new' | 'acknowledged' | 'resolved' are accepted; unknown
 * ids return null; updatedAt is bumped. The write syncs to other browsers
 * via saveDb().
 */
export function setDefectReportStatus(id, status) {
  if (!['new', 'acknowledged', 'resolved'].includes(status)) return null;
  const db = getDb();
  const record =
    db.collections.defectReports.find((r) => r.id === id) ?? null;
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return record;
}

/* ### endsection-defect-reports */

/* ### section-sos-alerts */

/**
 * The labour SOS button's emergency alerts (components/SosButton.jsx),
 * filed to the SHARED document so the supervisor's dashboard alarm and the
 * SOS screen see them live (same sync path as every collection:
 * saveDb() → sync bridge → SSE, ~1 s).
 *
 *   Alert = { id, labourId, labourName, machineNumber, message,
 *             date, time, reportedAt, status, createdAt, updatedAt }
 *
 * `date` is the factory day (todayKey) the alert belongs to — the
 * supervisor's SOS screen groups on it. `machineNumber` comes from the
 * labourer's assigned job when one exists (null otherwise); `message` is
 * optional free text the SOS UI may carry.
 */

/** Every SOS alert, newest first. */
export function getSosAlerts() {
  return [...getDb().collections.sosAlerts].sort((a, b) =>
    String(b.reportedAt).localeCompare(String(a.reportedAt)),
  );
}

/** The single SOS alert with the given id, or null. */
export function getSosAlertById(id) {
  return getDb().collections.sosAlerts.find((a) => a.id === id) ?? null;
}

/** SOS alerts still awaiting the supervisor (status 'active'), newest first. */
export function getActiveSosAlerts() {
  return getSosAlerts().filter((alert) => alert.status === SOS_STATUSES[0]);
}

/**
 * Raise an SOS alert from the labour SOS button.
 *
 * payload: { labourId, labourName, machineNumber?, message?, reportedAt? }
 *
 * The record carries everything the supervisor side renders: labour id,
 * name, machine number, optional message, the factory date, the display
 * time and status 'active'. The write goes through saveDb(), so the
 * supervisor's dashboard alarm trips within ~1 s — no refresh.
 *
 * HOME SLOT + DAILY QUOTA (SOS_HOME_DAILY_LIMIT = 3):
 * The first three SOS of a factory day each claim the supervisor's HOME
 * slot — a newer claim REPLACES the older one on the Home page (the older
 * record keeps its place in the Alerts feed). From the fourth SOS on, the
 * alert is recorded silently: it appears in the Alerts feed like any
 * other, but never claims the slot, so it never blinks/sounds on the
 * dashboard. The quota is decided ONCE, here at write time, so every
 * browser converges on the same decision without extra writes.
 *
 * Returns { record, created } — record is null when the payload is
 * unattributable (no labourId).
 */
export function addSosAlert(payload = {}) {
  const labourId = String(payload.labourId ?? '').trim();
  const labourName = String(payload.labourName ?? '').trim();
  if (!labourId) return { record: null, created: false };
  const machineNumber =
    payload.machineNumber != null && String(payload.machineNumber).trim()
      ? String(payload.machineNumber).trim()
      : null;
  const message =
    payload.message != null && String(payload.message).trim()
      ? String(payload.message).trim()
      : null;
  const reportedAt =
    typeof payload.reportedAt === 'string' && payload.reportedAt
      ? payload.reportedAt
      : new Date().toISOString();
  const stamp = new Date().toISOString();
  const db = getDb();
  const day = todayKey();

  // Quota: how many alerts have ALREADY claimed the home slot today?
  // Every claimant counts — including ones since replaced or removed —
  // because the cap is on SOS shown on Home per DAY ("maximum 3 blinking
  // and sound alerts per day"), so a removal never frees the quota.
  // (Counted from the shared collection, so a labour browser in another
  // room and the supervisor's own browser agree on the same number.)
  const claimedToday = db.collections.sosAlerts.filter(
    (alert) => alert?.home?.shownDate === day,
  ).length;
  const claimsSlot = claimedToday < SOS_HOME_DAILY_LIMIT;

  // A new claim REPLACES the previous holder: mark it so it stops showing
  // on Home (it stays in the Alerts feed untouched). Only done when this
  // alert actually claims the slot — the 4th+ never displaces anyone.
  if (claimsSlot) {
    for (const alert of db.collections.sosAlerts) {
      if (
        alert?.home?.shownDate === day &&
        alert?.home?.replaced !== true
      ) {
        alert.home = { ...alert.home, replaced: true, replacedAt: stamp };
        alert.updatedAt = stamp;
      }
    }
  }

  const record = {
    id: `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    labourId,
    labourName,
    machineNumber,
    message,
    date: day, // the factory day the alert belongs to (the feed)
    time: formatTime12h(reportedAt),
    reportedAt,
    status: SOS_STATUSES[0],
    // The HOME slot state — lives ON the record so it survives the sync
    // server round-trip (no schema/collection change, no extra writes).
    //   shownDate: the factory day this alert holds the Home slot (null =
    //              never claimed it — the 4th+ of the day)
    //   replaced:  a newer SOS has taken the slot (this one left Home)
    //   removed:   the supervisor removed it from Home (confirmation flow)
    home: {
      shownDate: claimsSlot ? day : null,
      replaced: false,
      removed: false,
      removedAt: null,
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.collections.sosAlerts.push(record);
  saveDb(db);
  return { record, created: true };
}

/**
 * The supervisor HOME page's SOS slot — the record currently shown there.
 *
 * Rules (all stamped on the records at write time, so this is a pure read):
 *   - claimed the slot today (`home.shownDate === todayKey()`)
 *   - not replaced by a newer SOS and not removed by the supervisor
 *   - the slot auto-clears at day end because shownDate stops matching
 * The newest qualifying alert wins (getSosAlerts() is newest-first).
 * Returns the alert or null (no alert → the Home page shows nothing).
 */
export function getHomeSosAlert() {
  const day = todayKey();
  return (
    getSosAlerts().find(
      (alert) =>
        alert?.home?.shownDate === day &&
        alert?.home?.replaced !== true &&
        alert?.home?.removed !== true,
    ) ?? null
  );
}

/**
 * Supervisor removed the Home-page SOS alert (Remove → confirm). The
 * record KEEPS its place in the Alerts feed — only the Home slot clears.
 * Unknown ids return null. The write syncs to every browser via saveDb().
 */
export function removeHomeSosAlert(id) {
  const db = getDb();
  const record = db.collections.sosAlerts.find((a) => a.id === id) ?? null;
  if (!record) return null;
  record.home = {
    ...(record.home ?? { shownDate: null, replaced: false }),
    removed: true,
    removedAt: new Date().toISOString(),
  };
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return record;
}

/**
 * Move an SOS alert through its lifecycle (supervisor acknowledges /
 * resolves). Only statuses in SOS_STATUSES are accepted; unknown ids
 * return null; updatedAt is bumped. The write syncs to other browsers
 * via saveDb().
 */
export function setSosAlertStatus(id, status) {
  if (!SOS_STATUSES.includes(status)) return null;
  const db = getDb();
  const record = db.collections.sosAlerts.find((a) => a.id === id) ?? null;
  if (!record) return null;
  record.status = status;
  record.updatedAt = new Date().toISOString();
  saveDb(db);
  return record;
}

/**
 * The supervisor SOS screen's data seam — alerts grouped date-wise, newest
 * date first; within a date, newest alerts first (getSosAlerts() is already
 * newest-first). PURE + defensive, exactly like groupDefectReportsByDate:
 * one malformed record is skipped, never fatal (a throw here happens
 * during render → blank page).
 *
 * Returns [{ dateKey, rows: [alert, …] }].
 */
export function groupSosAlertsByDate(alerts) {
  const groups = new Map();
  const list = Array.isArray(alerts) ? alerts : [];
  for (const alert of list) {
    if (!alert || typeof alert !== 'object') continue;
    const dateKey =
      (typeof alert.date === 'string' && alert.date) ||
      dateKeyOfIso(alert.reportedAt) ||
      todayKey();
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(alert);
  }
  return [...groups.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([dateKey, rows]) => ({ dateKey, rows }));
}

/* ### endsection-sos-alerts */

/* ### section-current-user */

/** Mirror the logged-in user for cross-page state (profile, greetings…). */
export function saveCurrentUser(user) {
  writeJson(CURRENT_USER_KEY, {
    id: user.id,
    name: user.name,
    role: user.role,
    employeeId: user.credentials?.employeeId ?? '',
    mobile: user.credentials?.mobile ?? '',
    loginTimestamp: new Date().toISOString(),
    dayKey: todayKey(),
  });
}

/** The mirrored logged-in user (survives refreshes), or null. */
export function getCurrentUser() {
  return readJson(CURRENT_USER_KEY, null);
}

/** Forget the logged-in user (logout / session teardown). */
export function clearCurrentUser() {
  removeKey(CURRENT_USER_KEY);
}
/* ### endsection-current-user */
