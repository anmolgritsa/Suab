/**
 * dbCore.js — the pure (no-browser, no-localStorage) half of the data
 * layer: schema version, roles, seed data and the migration function.
 *
 * It is imported by BOTH the browser data layer (src/data/db.js, which
 * adds localStorage + attendance helpers on top) and the dev sync server
 * (server/dataFile.js), so the seeded accounts and the document shape are
 * defined exactly once and can never drift between the two.
 */

/** Bumped whenever the stored shape changes; getDb() migrates old data. */
export const DB_SCHEMA_VERSION = 6;

/** User roles (routing decisions read these, never raw strings). */
export const USER_ROLES = { LABOUR: 'labour', SUPERVISOR: 'supervisor' };

/** SOS alert lifecycle (the SosButton files 'active'; the supervisor's
    SOS screen moves a record through acknowledge → resolve). */
export const SOS_STATUSES = ['active', 'acknowledged', 'resolved'];

/** How many SOS alerts per factory day may claim the supervisor HOME
    slot (the blinking alarm + the persistent Home card). The first three
    SOS of the day each take the slot (a newer one REPLACES the older);
    from the fourth on, alerts are recorded silently in the Alerts page
    only — no blink, no sound, no Home card. Enforced once, at write time
    (addSosAlert stamps `home.shownDate`), so every browser agrees. */
export const SOS_HOME_DAILY_LIMIT = 3;

/** Attendance statuses stored on a record. */
export const ATTENDANCE_STATUSES = { PRESENT: 'present' };

/** The kind of shop-floor update a labourer files (defects, activity, …). */
export const UPDATE_TYPES = [
  'machine-defect',
  'raw-material-defect',
  'output-defect',
  'machine-maintenance',
  'work-activity',
  'product-submission',
  'emergency',
];

/** Media kinds an update can carry (captured as data URLs). */
export const UPDATE_MEDIA_KINDS = ['image', 'video', 'audio'];

/** Named handle for the update type the Work Activities screen files —
    one of UPDATE_TYPES above (addUpdate validates against the array; this
    constant just gives screens a readable, typo-proof alias). */
export const UPDATE_TYPE_WORK_ACTIVITY = 'work-activity';

/** Update lifecycle for the supervisor workflow; first element is the default. */
export const UPDATE_STATUSES = ['new', 'viewed', 'in-progress', 'resolved'];

/**
 * The three defect/breakdown report categories the labour ReportForm files
 * (Input Errors / Machine Defect / Output Errors screens). Stored on a
 * defectReports record as `type`; the supervisor's Alerts screen renders
 * them with the same color-coded badges the demo alerts used.
 */
export const DEFECT_REPORT_TYPES = [
  'input-errors', // Raw Material Defect (Input Errors screen)
  'machine-defect', // Machine Breakdown
  'output-errors', // Output Defect
];

// The factory's seeded labour workforce — LAB001 through LAB010. The first
// five reuse the names already shown on the supervisor screens so the
// whole demo speaks of the same people.
function seedLabourUsers() {
  const names = [
    'Ramesh Kumar',
    'Amit Sharma',
    'Sunita Devi',
    'Vijay Singh',
    'Pooja Patel',
    'Manoj Yadav',
    'Geeta Verma',
    'Suresh Chandra',
    'Anita Kumari',
    'Dinesh Prasad',
  ];
  return names.map((name, index) => ({
    id: `usr-${String(index + 1).padStart(3, '0')}`,
    name,
    role: USER_ROLES.LABOUR,
    credentials: {
      employeeId: `LAB${String(index + 1).padStart(3, '0')}`,
      // Distinct valid Indian mobiles (start 6-9, 10 digits) for the
      // credential form; pin left null for the future "set your PIN" flow.
      // Built as 6 fixed digits + a 4-digit 01..10 suffix → exactly 10
      // digits, unique per labour, and each valid (starts with 9).
      mobile: `987654${String(index + 10).padStart(4, '0')}`,
      pin: null,
    },
  }));
}

// The seeded supervisor account (one for now — more can be added with
// addUser() and no schema change).
function seedSupervisorUsers() {
  return [
    {
      id: 'usr-sup-001',
      name: 'Sandeep Malhotra',
      role: USER_ROLES.SUPERVISOR,
      credentials: { employeeId: 'SUP001', mobile: '9812345678', pin: null },
    },
  ];
}

/** The full seeded user list (labour first, supervisor last). */
function seedUsers() {
  return [...seedLabourUsers(), ...seedSupervisorUsers()];
}

/** A fresh, seeded document at the current schema version. */
export function seedDb() {
  return {
    version: DB_SCHEMA_VERSION,
    collections: {
      users: seedUsers(),
      attendance: [],
      updates: [],
      requests: [],
      productSubmissions: [],
      defectReports: [],
      sosAlerts: [],
    },
  };
}

/** A safe fallback when the stored document is missing or corrupted. */
export function emptyDb() {
  return {
    version: DB_SCHEMA_VERSION,
    collections: {
      users: [],
      attendance: [],
      updates: [],
      requests: [],
      productSubmissions: [],
      defectReports: [],
      sosAlerts: [],
    },
  };
}

/**
 * Repair a document whose users collection is missing or EMPTY.
 *
 * WHY: seedDb() only runs when the whole document is absent/corrupt, so a
 * valid document that somehow lost its accounts (e.g. a partial write or a
 * hand-edited .data/db.json) used to pass every check with zero users —
 * and then NO ONE could log in. The seeded accounts are the factory's
 * fixed roster (LAB001–LAB010 + SUP001, all with a null PIN), so restoring
 * them by id can never overwrite or duplicate a real account: any user
 * still present in the document is kept as-is and only the missing ids are
 * appended (seed order preserved: labour first, supervisor last).
 */
export function ensureSeededUsers(db) {
  const users = Array.isArray(db?.collections?.users) ? db.collections.users : [];
  if (users.length > 0) return db; // healthy — nothing to repair
  return {
    ...db,
    collections: { ...db.collections, users: seedUsers() },
  };
}

/**
 * Upgrade a stored document to the current schema version. Migrations run
 * in order so any older document (v1 → …) survives: data is upgraded in
 * place and accounts / attendance are never lost.
 *
 *   v1 → v2: adds the `updates` collection (labour-filed shop-floor
 *            updates with media). Empty on upgrade.
 *   v2 → v3: adds the `requests` collection (half-day / overtime requests
 *            filed by labour, decided by the supervisor). Empty on upgrade.
 *   v3 → v4: adds the `productSubmissions` collection (the labour Product
 *            Submission screen's confirmed counts, read by the supervisor's
 *            Reports screen). Empty on upgrade.
 *   v4 → v5: adds the `defectReports` collection (the labour ReportForm's
 *            defect/breakdown reports — Input Errors / Machine Defect /
 *            Output Errors — read by the supervisor's Alerts screen). Empty
 *            on upgrade.
 *   v5 → v6: adds the `sosAlerts` collection (the labour SosButton's
 *            emergency alerts — read live by the supervisor's dashboard
 *            alarm and SOS screen). Empty on upgrade.
 */
export function migrateDb(db) {
  let next = db;
  if (next.version < 1) {
    next = {
      ...emptyDb(),
      collections: {
        users: Array.isArray(next?.collections?.users) ? next.collections.users : [],
        attendance: Array.isArray(next?.collections?.attendance)
          ? next.collections.attendance
          : [],
      },
    };
  }
  if (next.version < 2) {
    next = {
      ...next,
      collections: { ...next.collections, updates: [] },
    };
  }
  if (next.version < 3) {
    next = {
      ...next,
      collections: { ...next.collections, requests: [] },
    };
  }
  if (next.version < 4) {
    next = {
      ...next,
      collections: { ...next.collections, productSubmissions: [] },
    };
  }
  if (next.version < 5) {
    next = {
      ...next,
      collections: { ...next.collections, defectReports: [] },
    };
  }
  if (next.version < 6) {
    next = {
      ...next,
      collections: { ...next.collections, sosAlerts: [] },
    };
  }
  next.version = DB_SCHEMA_VERSION;
  // Normalize the collections object: every known collection must exist as
  // an ARRAY. A document that is version-valid but lost its `collections`
  // (or holds a non-array entry) used to slip through — screens then read
  // e.g. getUpdates() → [...undefined] and THREW during render (blank
  // supervisor feed). Unknown keys are kept; non-array values become [].
  const collections = {
    ...emptyDb().collections,
    ...(next.collections && typeof next.collections === 'object' ? next.collections : {}),
  };
  for (const key of Object.keys(collections)) {
    if (!Array.isArray(collections[key])) collections[key] = [];
  }
  next.collections = collections;
  return next;
}
