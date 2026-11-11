/**
 * updates-render.test.mjs — regression test for the BLANK supervisor
 * updates feed (SupervisorLabourUpdatesScreen).
 *
 * Root cause of the blank page: workUploads.mediaUrl() called
 * new URL(path, import.meta.env.BASE_URL) — but BASE_URL ('/Suab-deploy/')
 * is a RELATIVE path, an invalid URL base, so new URL() threw
 * 'TypeError: Invalid URL' for every server-saved upload path
 * ('/api/work-uploads/…'). buildRows() runs during render (useState
 * initializer + useStorageSync resync), so the throw unmounted the whole
 * React tree → blank page. Updates WITHOUT attachments (data URLs) never
 * hit the throwing branch, which is why the page worked until a real
 * image/video was submitted.
 *
 * Covered here:
 *   1. mediaUrl() never throws and prefixes '/api/…' with BASE_URL
 *      (data URLs pass through; garbage in → string out).
 *   2. buildRows()'s data seam: getUpdates() tolerates a document whose
 *      collections object is missing/partial (migrateDb normalization).
 *   3. The exact stored record shape from .data/db.json (server path in
 *      media[].dataUrl) resolves to a BASE_URL-prefixed URL.
 *
 * Run with:  node tests/updates-render.test.mjs
 */

import assert from 'node:assert/strict';

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

// Vite replaces `import.meta.env` at build time; in plain Node it is
// undefined, so the modules must tolerate that (they do — optional chain).
// We simulate the deployed BASE_URL the same way Vite would inject it.
// (import.meta.env is not assignable in all engines; the modules under
// test read it defensively, so we exercise BOTH shapes below.)

const workUploads = await import('../src/data/workUploads.js');
const dbCore = await import('../src/data/dbCore.js');
const db = await import('../src/data/db.js');

console.log('# updates render seam (blank-page regression)');

// 1) mediaUrl() — the exact throwing call shape, now safe.
{
  // The old code: new URL('api/work-uploads/x.png', '/Suab-deploy/') → throw.
  let threw = false;
  try {
    new URL('api/work-uploads/x.png', '/Suab-deploy/');
  } catch {
    threw = true;
  }
  ok('sanity: new URL(rel, "/Suab-deploy/") really throws', threw);

  ok('mediaUrl: server path never throws (BASE_URL undefined in Node → base "/")',
    workUploads.mediaUrl('/api/work-uploads/upd-live-1-0.png')
      === '/api/work-uploads/upd-live-1-0.png',
    workUploads.mediaUrl('/api/work-uploads/upd-live-1-0.png'));
  // NOTE: in the browser Vite injects BASE_URL='/Suab-deploy/', so the same
  // call returns '/Suab-deploy/api/work-uploads/…' — asserted end-to-end in
  // the real-browser check (the <img> must actually load).

  ok('mediaUrl: data URL passes through unchanged',
    workUploads.mediaUrl('data:image/png;base64,AAAA') === 'data:image/png;base64,AAAA');

  ok('mediaUrl: empty/null → empty string (no throw)',
    workUploads.mediaUrl('') === '' && workUploads.mediaUrl(null) === '');

  ok('mediaUrl: non-string garbage → string out (no throw)',
    workUploads.mediaUrl(42) === '42' && workUploads.mediaUrl({}) === '[object Object]');

  ok('mediaUrl: absolute http URL passes through',
    workUploads.mediaUrl('https://cdn.example.com/a.png') === 'https://cdn.example.com/a.png');
}

// 2) Selectors tolerate malformed update records.
{
  ok('mediaOfKind: null update → null (no throw)',
    workUploads.mediaOfKind(null, 'image') === null);
  ok('mediaOfKind: media not an array → null (no throw)',
    workUploads.mediaOfKind({ media: 'oops' }, 'image') === null);
  ok('allMediaOfKind: missing media → [] (no throw)',
    workUploads.allMediaOfKind({}, 'video').length === 0);
  ok('allMediaOfKind: skips items without dataUrl',
    workUploads.allMediaOfKind(
      { media: [{ kind: 'image' }, { kind: 'image', dataUrl: 'x' }] },
      'image',
    ).length === 1);
}

// 3) The data seam behind getUpdates(): a version-valid document that lost
//    its collections object used to make getUpdates() throw ([...undefined]).
{
  store.clear();
  const broken = { version: 3, collections: null };
  store.set('suab.db', JSON.stringify(broken));
  let list = null;
  let threw = false;
  try {
    list = db.getUpdates();
  } catch {
    threw = true;
  }
  ok('getUpdates: collections=null doc does not throw', !threw);
  ok('getUpdates: returns an array for the broken doc', Array.isArray(list));

  store.clear();
  store.set('suab.db', JSON.stringify({ version: 3 })); // no collections at all
  let threw2 = false;
  try {
    db.getUpdates();
  } catch {
    threw2 = true;
  }
  ok('getUpdates: collections missing entirely does not throw', !threw2);

  store.clear();
  store.set('suab.db', JSON.stringify({
    version: 3,
    collections: { updates: 'not-an-array', users: 7 },
  }));
  let threw3 = false;
  try {
    db.getUpdates();
  } catch {
    threw3 = true;
  }
  ok('getUpdates: non-array collections normalized to []', !threw3);
}

// 4) migrateDb() normalization (shared with the sync server's PUT path).
{
  const healed = dbCore.migrateDb({ version: 3, collections: null });
  ok('migrateDb: null collections → all six arrays',
    ['users', 'attendance', 'updates', 'requests', 'productSubmissions', 'defectReports']
      .every((k) => Array.isArray(healed.collections[k])));
  ok('migrateDb: version normalized to current schema (6)', healed.version === 6);

  const partial = dbCore.migrateDb({
    version: 3,
    collections: { users: [{ id: 'u1' }], updates: [{ id: 'upd-1' }] },
  });
  ok('migrateDb: partial collections kept + missing added',
    partial.collections.users.length === 1
    && partial.collections.updates.length === 1
    && Array.isArray(partial.collections.attendance)
    && Array.isArray(partial.collections.requests)
    && Array.isArray(partial.collections.productSubmissions)
    && Array.isArray(partial.collections.defectReports));

  const unknown = dbCore.migrateDb({
    version: 3,
    collections: { users: [], extra: [{ id: 'x' }] },
  });
  ok('migrateDb: unknown collections preserved',
    Array.isArray(unknown.collections.extra) && unknown.collections.extra.length === 1);
}

// 5) The REAL stored record shape (from .data/db.json) end-to-end: a server
//    path in media[].dataUrl resolves through the selectors + mediaUrl().
{
  const realShape = {
    id: 'upd-live-1',
    labourId: 'LAB001',
    labourName: 'Ramesh Kumar',
    type: 'work-activity',
    date: '2026-11-10',
    status: 'new',
    createdAt: '2026-11-10T08:05:33.3912751Z',
    details: 'live dev check',
    media: [{ kind: 'image', dataUrl: '/api/work-uploads/upd-live-1-0.png', name: 'x.png' }],
  };
  const images = workUploads.allMediaOfKind(realShape, 'image')
    .map((item) => workUploads.mediaUrl(item.dataUrl));
  ok('real record: image resolves without throwing (Node base "/")',
    images.length === 1
    && images[0] === '/api/work-uploads/upd-live-1-0.png',
    String(images[0]));
  ok('real record: no videos → empty array',
    workUploads.allMediaOfKind(realShape, 'video').length === 0);
  ok('real record: no audio → voiceNote null',
    workUploads.mediaOfKind(realShape, 'audio') === null);
}

// 6) addUpdate/getUpdates still behave (no regression on the write path).
{
  store.clear();
  const rec = db.addUpdate({
    labourId: 'LAB002',
    labourName: 'Amit Sharma',
    type: 'work-activity',
    details: 'render regression probe',
    media: [{ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', name: 'p.png' }],
  }).record;
  ok('addUpdate still stores media + returns a record', rec?.media?.length === 1);
  ok('getUpdates newest-first still works', db.getUpdates()[0].id === rec.id);
}

console.log(`\n${failed === 0 ? 'ok' : 'not ok'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
