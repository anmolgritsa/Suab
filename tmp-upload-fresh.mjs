/**
 * tmp-upload-fresh.mjs — fresh end-to-end upload check through the NEW
 * (login-guarded) PUT path: an update carrying a data URL must be written
 * to data/work-uploads/ and served back at /api/work-uploads/<file>.
 * Confirms the login fix did not disturb the work-updates media pipeline.
 *
 * Run with:  node tmp-upload-fresh.mjs   (expects the dev server on :5173)
 */

const BASE = 'http://localhost:5173/Suab-deploy';
let passed = 0;
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? '  [' + detail + ']' : ''}`); }
};

// 1x1 transparent PNG.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const current = await (await fetch(`${BASE}/api/db`)).json();
const stamp = Date.now();
const update = {
  id: `upd-loginfix-${stamp.toString(36)}`,
  labourId: 'LAB001',
  labourName: 'Ramesh Kumar',
  type: 'work-activity',
  details: 'login-fix upload verification',
  media: [{ kind: 'image', dataUrl: `data:image/png;base64,${PNG_B64}`, name: 'probe.png' }],
  date: new Date().toISOString().slice(0, 10),
  status: 'new',
  createdAt: new Date(stamp).toISOString(),
  updatedAt: new Date(stamp).toISOString(),
};

const put = await fetch(`${BASE}/api/db`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    revision: stamp + 10000,
    db: { ...current.db, collections: { ...current.db.collections, updates: [...current.db.collections.updates, update] } },
  }),
});
ok('PUT with media accepted', put.status === 200, String(put.status));

const after = await (await fetch(`${BASE}/api/db`)).json();
const saved = (after.db.collections.updates ?? []).find((u) => u.id === update.id);
ok('update stored', Boolean(saved));
ok('data URL replaced by served path',
  saved?.media?.[0]?.dataUrl?.startsWith('/api/work-uploads/'),
  String(saved?.media?.[0]?.dataUrl));
ok('users still intact after media PUT (guard ran)',
  (after.db.collections.users ?? []).length === 11,
  String((after.db.collections.users ?? []).length));

const fileUrl = saved?.media?.[0]?.dataUrl;
if (fileUrl) {
  const file = await fetch(`${BASE}${fileUrl}`);
  const buf = Buffer.from(await file.arrayBuffer());
  ok('uploaded file served back', file.status === 200
    && (file.headers.get('content-type') ?? '').startsWith('image/')
    && buf.length > 0,
    `${file.status} ${file.headers.get('content-type')} ${buf.length}b`);
} else {
  failed++;
  console.error('  FAIL  uploaded file served back  [no file url]');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
