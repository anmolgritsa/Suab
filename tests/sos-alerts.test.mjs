/**
 * sos-alerts.test.mjs — regression test for the labour → supervisor SOS
 * alert sync: the SosButton → addSosAlert() → shared `sosAlerts`
 * collection → dashboard alarm (useSosAlarm) + SupervisorSosScreen seam.
 *
 * Covered here:
 *   1. addSosAlert() record shape — labour name/ID, machine number,
 *      emergency message, date, time, reportedAt, status 'active'.
 *   2. Validation — an unattributable payload (no labourId) is rejected;
 *      blank machine/message normalize to null.
 *   3. Ordering — getSosAlerts() newest-first; getActiveSosAlerts() only
 *      'active' (the dashboard alarm's source).
 *   4. groupSosAlertsByDate() — newest DATE first, newest alert within a
 *      date first, malformed records skipped (never fatal).
 *   5. setSosAlertStatus() lifecycle (active → acknowledged → resolved),
 *      unknown status/id rejected.
 *   6. migrateDb() normalizes a v5 document missing `sosAlerts` (no throw,
 *      empty array) — the blank-page guard.
 *
 * Run with:  node tests/sos-alerts.test.mjs
 */

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
}

// --- Browser-ish globals BEFORE importing the modules under test (the
// data layer touches window.localStorage through utils/storage.js).
const store = new Map();
globalThis.window = {
  dispatchEvent() {},
  addEventListener() {},
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(k),
  },
};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.detail = opts.detail;
  }
};

const db = await import('../src/data/db.js');
const dbCore = await import('../src/data/dbCore.js');
const { todayKey } = await import('../src/utils/storage.js');

console.log('# SOS alert sync seam (labour → supervisor)');

// 1) Record shape — everything the supervisor's overlay + SOS screen render.
{
  store.clear();
  const { record, created } = db.addSosAlert({
    labourId: 'LAB001',
    labourName: 'Ramesh Kumar',
    machineNumber: 'M-07',
    message: 'Need help at the press line',
    reportedAt: '2026-11-11T06:15:00.000Z',
  });
  ok('addSosAlert: valid payload is created', created === true && record !== null);
  ok('record: labour id + name carried', record.labourId === 'LAB001' && record.labourName === 'Ramesh Kumar');
  ok('record: machine number carried', record.machineNumber === 'M-07');
  ok('record: emergency message carried', record.message === 'Need help at the press line');
  ok('record: factory date is today', record.date === todayKey());
  ok('record: display time derived from reportedAt', typeof record.time === 'string' && record.time.length > 0);
  ok('record: reportedAt kept', record.reportedAt === '2026-11-11T06:15:00.000Z');
  ok('record: starts active', record.status === 'active');
  ok('record: has id + stamps', typeof record.id === 'string' && record.id.startsWith('sos-') && !!record.createdAt && !!record.updatedAt);
}

// 2) Validation — unattributable payloads are rejected, blanks normalize.
{
  store.clear();
  const rejected = db.addSosAlert({ labourName: 'No Id Given' });
  ok('addSosAlert: no labourId → rejected', rejected.created === false && rejected.record === null);
  const { record } = db.addSosAlert({ labourId: 'LAB002', machineNumber: '   ', message: '' });
  ok('addSosAlert: blank machine/message → null', record.machineNumber === null && record.message === null);
}

/* ### section-2 */

// 3) Ordering — newest first; active-only filter (the alarm's source).
{
  store.clear();
  db.addSosAlert({ labourId: 'LAB001', reportedAt: '2026-11-10T05:00:00.000Z' });
  db.addSosAlert({ labourId: 'LAB002', reportedAt: '2026-11-11T06:00:00.000Z' });
  db.addSosAlert({ labourId: 'LAB003', reportedAt: '2026-11-09T09:00:00.000Z' });
  const all = db.getSosAlerts();
  ok('getSosAlerts: newest first', all[0].labourId === 'LAB002' && all[2].labourId === 'LAB003');
  const active = db.getActiveSosAlerts();
  ok('getActiveSosAlerts: only active', active.length === 3 && active.every((a) => a.status === 'active'));
  // Acknowledge the newest — the alarm must no longer see it as "newest active".
  db.setSosAlertStatus(all[0].id, 'acknowledged');
  const active2 = db.getActiveSosAlerts();
  ok('getActiveSosAlerts: acknowledged excluded', active2.length === 2 && active2[0].labourId === 'LAB001');
}

// 4) Date grouping — newest date first; within a date the caller's order is
//    preserved (the screen passes getSosAlerts() output, already newest-
//    first). Malformed records are skipped (a throw would blank the screen).
{
  store.clear();
  const groups = db.groupSosAlertsByDate([
    { id: 'c', date: '2026-11-11', reportedAt: '2026-11-11T07:00:00.000Z' },
    { id: 'b', date: '2026-11-11', reportedAt: '2026-11-11T06:00:00.000Z' },
    { id: 'a', date: '2026-11-09', reportedAt: '2026-11-09T09:00:00.000Z' },
    null,
    42,
    { id: 'd' }, // no date/reportedAt → falls back to today
  ]);
  ok('groupSosAlertsByDate: newest date first', groups[0].dateKey === '2026-11-11' && groups[1].dateKey === '2026-11-09');
  ok('groupSosAlertsByDate: within-date order preserved (newest-first input)', groups[0].rows[0].id === 'c' && groups[0].rows[1].id === 'b');
  ok('groupSosAlertsByDate: malformed skipped, no throw', groups.length === 2 && groups[0].rows.length === 3);
  ok('groupSosAlertsByDate: missing date falls back to today', groups[0].rows.some((r) => r.id === 'd'));
  ok('groupSosAlertsByDate: non-array input → empty', db.groupSosAlertsByDate(null).length === 0);
}

// 5) Status lifecycle — active → acknowledged → resolved; bad inputs rejected.
{
  store.clear();
  const { record } = db.addSosAlert({ labourId: 'LAB004' });
  ok('setSosAlertStatus: acknowledge', db.setSosAlertStatus(record.id, 'acknowledged')?.status === 'acknowledged');
  ok('setSosAlertStatus: resolve', db.setSosAlertStatus(record.id, 'resolved')?.status === 'resolved');
  ok('setSosAlertStatus: unknown status → null', db.setSosAlertStatus(record.id, 'bogus') === null);
  ok('setSosAlertStatus: unknown id → null', db.setSosAlertStatus('sos-none', 'resolved') === null);
}

// 6) migrateDb — a v5 document without `sosAlerts` is normalized (no throw,
//    empty array): the blank-page guard for older shared DBs.
{
  store.clear();
  const oldDoc = {
    version: 5,
    updatedAt: '2026-11-10T00:00:00.000Z',
    collections: {
      users: [],
      updates: [],
      defectReports: [],
      productSubmissions: [],
      // sosAlerts deliberately missing
    },
  };
  const migrated = dbCore.migrateDb(oldDoc);
  ok('migrateDb: v5 doc gains sosAlerts array', Array.isArray(migrated.collections.sosAlerts));
  ok('migrateDb: version bumped to 6', migrated.version === 6);
  ok('migrateDb: existing collections preserved', Array.isArray(migrated.collections.users) && Array.isArray(migrated.collections.updates));
}

// 7) HOME SLOT + DAILY QUOTA — the first three SOS of the day claim the
//    supervisor Home slot (a newer claim REPLACES the older); the 4th+ is
//    recorded silently (Alerts feed only, never Home, never alarms).
{
  store.clear();
  const first = db.addSosAlert({ labourId: 'LAB001', labourName: 'Ramesh Kumar', machineNumber: 'M-01' }).record;
  ok('home: first SOS claims the slot today', first.home?.shownDate === todayKey() && first.home?.replaced === false && first.home?.removed === false);
  ok('home: getHomeSosAlert returns the claimant', db.getHomeSosAlert()?.id === first.id);

  const second = db.addSosAlert({ labourId: 'LAB002', labourName: 'Amit Sharma', machineNumber: 'M-02' }).record;
  ok('home: second SOS claims and REPLACES the first', second.home?.shownDate === todayKey() && db.getHomeSosAlert()?.id === second.id);
  ok('home: replaced alert keeps its feed record', db.getSosAlertById(first.id)?.home?.replaced === true);

  const third = db.addSosAlert({ labourId: 'LAB003' }).record;
  ok('home: third SOS claims (quota = 3)', third.home?.shownDate === todayKey() && db.getHomeSosAlert()?.id === third.id);

  const fourth = db.addSosAlert({ labourId: 'LAB004' }).record;
  ok('home: 4th SOS does NOT claim the slot', fourth.home?.shownDate === null);
  ok('home: 4th SOS does not displace the current holder', db.getHomeSosAlert()?.id === third.id);
  ok('home: 4th SOS is still recorded in the feed', db.getSosAlerts().some((a) => a.id === fourth.id));
  ok('home: 4th SOS is still active for the Alerts page', db.getActiveSosAlerts().some((a) => a.id === fourth.id));

  const fifth = db.addSosAlert({ labourId: 'LAB005' }).record;
  ok('home: 5th SOS also silent (quota counts all claimants)', fifth.home?.shownDate === null && db.getHomeSosAlert()?.id === third.id);
}

// 8) REMOVE — the supervisor clears the Home slot; the alert keeps its
//    place in the Alerts feed, and the removal does NOT free the quota.
{
  store.clear();
  const a = db.addSosAlert({ labourId: 'LAB001' }).record;
  db.addSosAlert({ labourId: 'LAB002' });
  const holder = db.addSosAlert({ labourId: 'LAB003' }).record;
  ok('remove: unknown id → null', db.removeHomeSosAlert('sos-none') === null);
  ok('remove: pre-check — LAB003 holds the slot', db.getHomeSosAlert()?.id === holder.id);
  const removed = db.removeHomeSosAlert(holder.id);
  ok('remove: stamps removed + removedAt', removed?.home?.removed === true && typeof removed?.home?.removedAt === 'string');
  ok('remove: slot is empty afterwards', db.getHomeSosAlert() === null);
  ok('remove: alert keeps its place in the feed', db.getSosAlerts().some((x) => x.id === holder.id));
  ok('remove: removed alert still active in the Alerts page', db.getActiveSosAlerts().some((x) => x.id === holder.id));
  const fourth = db.addSosAlert({ labourId: 'LAB004' }).record;
  ok('remove: removal does NOT free the daily quota', fourth.home?.shownDate === null && db.getHomeSosAlert()?.id === fourth.id);
  void a;
}

// 9) DAY-END AUTO-CLEAR — the slot matches on shownDate === today, so an
//    alert holding YESTERDAY's slot no longer shows on Home (no cron needed).
{
  store.clear();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const a = db.addSosAlert({ labourId: 'LAB001' }).record;
  ok('day-end: alert shows on Home today', db.getHomeSosAlert()?.id === a.id);
  // Simulate the calendar rolling over: the record keeps yesterday's stamp.
  a.home.shownDate = yesterday;
  store.set('suab.db', JSON.stringify({
    version: 6,
    collections: { users: [], sosAlerts: [a] },
  }));
  ok('day-end: yesterday\'s slot no longer matches today', db.getHomeSosAlert() === null);
  ok('day-end: the record itself is untouched in the feed', db.getSosAlerts().some((x) => x.id === a.id));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

