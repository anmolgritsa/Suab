/**
 * tmp-login-smoke.mjs — live dev-server smoke test of the login fix.
 *
 * 1. GET /api/db        → the server must have healed the on-disk userless
 *                         .data/db.json (11 users) and kept the real update.
 * 2. PUT a userless doc → the server's PUT guard must restore the roster
 *                         (and keep the updates collection) instead of
 *                         persisting a document nobody can log in against.
 * 3. GET /api/work-uploads/<file> → the uploads route still serves files
 *                         (work-updates feature untouched).
 *
 * Run with:  node tmp-login-smoke.mjs   (expects the dev server on :5173)
 */

const BASE = 'http://localhost:5173/Suab-deploy';
let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
};

const health = await fetch(`${BASE}/api/health`);
ok('dev server + sync API reachable', health.status === 200, String(health.status));

// 1) The on-disk document was userless before the fix — the server must
//    have healed it on boot (ensureDbFile → ensureSeededUsers).
const got = await (await fetch(`${BASE}/api/db`)).json();
const users = got?.db?.collections?.users ?? [];
ok('GET /api/db: users healed to 11', users.length === 11, String(users.length));
const sup = users.find((u) => u.credentials?.employeeId === 'SUP001');
ok('GET /api/db: SUP001 (supervisor, 9812345678, pin null)',
  sup?.role === 'supervisor' && sup?.credentials?.mobile === '9812345678'
    && sup?.credentials?.pin === null);
const lab1 = users.find((u) => u.credentials?.employeeId === 'LAB001');
ok('GET /api/db: LAB001 (labour, 9876540010, pin null)',
  lab1?.role === 'labour' && lab1?.credentials?.mobile === '9876540010'
    && lab1?.credentials?.pin === null);
ok('GET /api/db: real update (upd-live-1) preserved',
  (got?.db?.collections?.updates ?? []).some((u) => u.id === 'upd-live-1'));

// 2) PUT guard: a userless document must come back with the roster.
const putBody = {
  revision: Date.now() + 5000,
  db: {
    version: 3,
    collections: {
      users: [],
      attendance: [],
      requests: [],
      updates: got.db.collections.updates, // keep the real data
    },
  },
};
const put = await fetch(`${BASE}/api/db`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(putBody),
});
ok('PUT accepted', put.status === 200, String(put.status));
const after = await (await fetch(`${BASE}/api/db`)).json();
const usersAfter = after?.db?.collections?.users ?? [];
ok('PUT guard: userless doc healed to 11 users', usersAfter.length === 11,
  String(usersAfter.length));
ok('PUT guard: updates collection preserved',
  (after?.db?.collections?.updates ?? []).some((u) => u.id === 'upd-live-1'));
ok('PUT guard: roster routes SUP001 → supervisor',
  usersAfter.find((u) => u.credentials?.employeeId === 'SUP001')?.role === 'supervisor');

// 3) Uploads route still works (work-updates feature untouched).
const up = await fetch(`${BASE}/api/work-uploads/upd-live-1-0.png`);
ok('uploads route still serves files', up.status === 200
  && (up.headers.get('content-type') ?? '').startsWith('image/'),
  `${up.status} ${up.headers.get('content-type')}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
