/**
 * login-auth.test.mjs — node-based check of the login/auth seam.
 *
 * Covers the reported "login broken for every account" bug:
 *   1. seed shape — 11 accounts (LAB001–LAB010 + SUP001), all pin: null,
 *      roles labour/supervisor, mobiles as documented;
 *   2. authenticateUser() — the exact existing credential pairs log in,
 *      wrong mobile / wrong id / empty input do NOT, and a null PIN never
 *      blocks a match;
 *   3. THE BUG: a structurally valid document whose users collection is
 *      EMPTY (what .data/db.json had on disk) must be repaired by
 *      migrateDb/ensureSeededUsers so login works again — and a healthy
 *      document must pass through untouched;
 *   4. role routing — getRoleForEmployeeId('SUP001') → 'supervisor',
 *      every LAB id → 'labour', unknown id → 'labour' fallback;
 *   5. getDb() end-to-end on a localStorage stub: a stored userless
 *      document comes back with the full roster (the browser-side repair).
 *
 * Run with:  node tests/login-auth.test.mjs
 */

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
}

// --- Simulate localStorage before importing the ESM modules under test.
// NOTE: utils/storage.js calls `window.localStorage`, so localStorage must
// live ON the window object (a bare global won't do).
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

const dbCore = await import('../src/data/dbCore.js');
const db = await import('../src/data/db.js');
const { getRoleForEmployeeId } = await import('../src/utils/validation.js');
const { todayKey } = await import('../src/utils/storage.js');

console.log('# login/auth seam test');

// 1) Seed shape — the credentials that must keep working, unchanged.
{
  const seeded = dbCore.seedDb();
  const users = seeded.collections.users;
  ok('seed has 11 accounts', users.length === 11, String(users.length));
  const sup = users.find((u) => u.credentials.employeeId === 'SUP001');
  ok('SUP001 exists', Boolean(sup));
  ok('SUP001 is Sandeep Malhotra, role supervisor',
    sup?.name === 'Sandeep Malhotra' && sup?.role === 'supervisor');
  ok('SUP001 mobile 9812345678, pin null',
    sup?.credentials.mobile === '9812345678' && sup?.credentials.pin === null);
  const lab1 = users.find((u) => u.credentials.employeeId === 'LAB001');
  ok('LAB001 exists (Ramesh Kumar, labour)',
    lab1?.name === 'Ramesh Kumar' && lab1?.role === 'labour');
  ok('LAB001 mobile 9876540010, pin null',
    lab1?.credentials.mobile === '9876540010' && lab1?.credentials.pin === null);
  const labIds = users
    .filter((u) => u.role === 'labour')
    .map((u) => u.credentials.employeeId);
  ok('labour roster is LAB001..LAB010',
    labIds.length === 10 && labIds[0] === 'LAB001' && labIds[9] === 'LAB010');
  ok('every seeded account has a null PIN',
    users.every((u) => u.credentials.pin === null));
}

// 2) authenticateUser — the exact pairs that must keep working.
{
  store.clear();
  store.set('suab.db', JSON.stringify(dbCore.seedDb()));
  const sup = db.authenticateUser('SUP001', '9812345678');
  ok('SUP001 + 9812345678 logs in', sup?.credentials.employeeId === 'SUP001');
  ok('SUP001 role routes to supervisor', sup?.role === 'supervisor');
  const lab = db.authenticateUser('LAB001', '9876540010');
  ok('LAB001 + 9876540010 logs in', lab?.credentials.employeeId === 'LAB001');
  ok('LAB001 role is labour', lab?.role === 'labour');
  ok('LAB010 + 9876540019 logs in',
    db.authenticateUser('LAB010', '9876540019')?.credentials.employeeId === 'LAB010');
  ok('case/whitespace-insensitive employee id',
    db.authenticateUser(' lab001 ', '9876540010')?.credentials.employeeId === 'LAB001');
  ok('formatted mobile with same 10 digits accepted',
    db.authenticateUser('SUP001', '98123 45678')?.credentials.employeeId === 'SUP001');
  ok('wrong mobile rejected', db.authenticateUser('SUP001', '9876540010') === null);
  ok('wrong employee id rejected', db.authenticateUser('LAB099', '9876540010') === null);
  ok('empty inputs rejected', db.authenticateUser('', '') === null);
  ok('null inputs rejected', db.authenticateUser(null, null) === null);
}

// 3) THE BUG: a valid document with an EMPTY users collection.
{
  const broken = {
    version: 3,
    collections: { users: [], attendance: [], updates: [], requests: [] },
  };
  const healed = dbCore.ensureSeededUsers(dbCore.migrateDb(broken));
  ok('userless document repaired to 11 accounts',
    healed.collections.users.length === 11, String(healed.collections.users.length));
  ok('repaired roster still routes SUP001 → supervisor',
    healed.collections.users.find((u) => u.credentials.employeeId === 'SUP001')?.role
      === 'supervisor');
  ok('repaired roster keeps LAB001..LAB010',
    healed.collections.users.filter((u) => u.role === 'labour').length === 10);

  // A healthy document must pass through untouched (no duplicates).
  const healthy = dbCore.seedDb();
  const untouched = dbCore.ensureSeededUsers(dbCore.migrateDb(healthy));
  ok('healthy document untouched (still 11, same objects)',
    untouched.collections.users.length === 11
      && untouched.collections.users === healthy.collections.users);

  // Missing users array entirely (undefined) is repaired too.
  const noUsersKey = { version: 3, collections: { attendance: [], updates: [], requests: [] } };
  ok('missing users array repaired',
    dbCore.ensureSeededUsers(dbCore.migrateDb(noUsersKey)).collections.users.length === 11);
}

// 4) Role routing (validation.js) — the redirect decision.
{
  ok("getRoleForEmployeeId('SUP001') === 'supervisor'",
    getRoleForEmployeeId('SUP001') === 'supervisor');
  ok("getRoleForEmployeeId('LAB001') === 'labour'",
    getRoleForEmployeeId('LAB001') === 'labour');
  ok("getRoleForEmployeeId('LAB010') === 'labour'",
    getRoleForEmployeeId('LAB010') === 'labour');
  ok('unknown id falls back to labour (never crashes)',
    getRoleForEmployeeId('NOPE-404') === 'labour');
  ok('null id falls back to labour', getRoleForEmployeeId(null) === 'labour');
}

// 5) getDb() end-to-end on the stub: a STORED userless document is healed
//    on read — the exact browser-side path that used to break login.
{
  store.clear();
  store.set('suab.db', JSON.stringify({
    version: 3,
    collections: { users: [], attendance: [], updates: [], requests: [] },
  }));
  const users = db.getUsers();
  ok('getDb() heals a stored userless document (11 users)',
    users.length === 11, String(users.length));
  ok('healed getDb() authenticates SUP001',
    db.authenticateUser('SUP001', '9812345678')?.role === 'supervisor');
  ok('healed getDb() authenticates LAB001',
    db.authenticateUser('LAB001', '9876540010')?.role === 'labour');
  // The healed document is also written back so the next read is clean.
  const persisted = JSON.parse(store.get('suab.db'));
  ok('healed document persisted back to storage',
    JSON.parse(store.get('suab.db') ?? '{}')?.collections?.users?.length === 11
      || persisted.collections.users.length === 11);
}

// 6) Regression: unrelated collections survive the repair untouched.
{
  store.clear();
  const seeded = dbCore.seedDb();
  seeded.collections.updates.push({
    id: 'upd-x', labourId: 'LAB001', labourName: 'Ramesh Kumar',
    type: 'work-activity', details: 'd', media: [], date: '2026-11-10',
    status: 'new', createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z',
  });
  seeded.collections.attendance.push({
    id: `att-LAB001-${todayKey()}-current`, userId: 'usr-001', employeeId: 'LAB001',
    name: 'Ramesh Kumar', date: todayKey(), shift: 'current',
    checkInAt: '2026-11-10T06:00:00.000Z', status: 'present',
  });
  store.set('suab.db', JSON.stringify(seeded));
  ok('existing updates survive a healthy read',
    db.getUpdates().length === 1 && db.getUpdates()[0].id === 'upd-x');
  ok('existing attendance survives a healthy read',
    db.getAttendanceFor('LAB001')?.employeeId === 'LAB001');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
