/**
 * updates-browser.test.mjs — smoke-check of the pure schema/migration seam
 * behind the `updates` collection: seed shape, v1→v2 migration of a legacy
 * stored document, type/media/status enums round-tripping, and addUpdate /
 * getUpdates* / setUpdateStatus against a localStorage stub on getDb() so the
 * real browser logic is exercised outside a headless Chrome.
 *
 * Run with:  node tests/updates-browser.test.mjs
 */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}`); }
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

console.log('# updates schema/migration smoke test');

// 1) Seed shape: v2 + updates collection present.
{
  const seeded = dbCore.seedDb();
  ok('seed version is 6', seeded.version === 6);
  ok('seed has updates collection', Array.isArray(seeded.collections.updates));
  ok('seed users intact (11 accounts)', seeded.collections.users.length === 11);
}

// 2) Legacy v1 migration upgrades cleanly.
{
  const legacy = {
    version: 1,
    collections: {
      users: dbCore.seedDb().collections.users,
      attendance: [
        {
          id: 'att-LAB001-2026-11-09-current',
          userId: 'usr-001',
          employeeId: 'LAB001',
          name: 'Ramesh Kumar',
          date: '2026-11-09',
          shift: 'current',
          checkInAt: '2026-11-09T06:01:00.000Z',
          status: 'present',
        },
      ],
    },
  };
  const migrated = dbCore.migrateDb(legacy);
  ok('migrated to v6', migrated.version === 6);
  ok('updates collection added empty', Array.isArray(migrated.collections.updates)
    && migrated.collections.updates.length === 0);
  ok('users survive migration', migrated.collections.users.length === 11);
  ok('attendance survives migration', migrated.collections.attendance.length === 1);
}

// 3) Enums.
ok('UPDATE_TYPES has 7 entries', dbCore.UPDATE_TYPES.length === 7);
ok('media kinds image/video/audio',
  ['image', 'video', 'audio'].every((k) => dbCore.UPDATE_MEDIA_KINDS.includes(k)));
ok('statuses include new/in-progress/resolved',
  ['new', 'viewed', 'in-progress', 'resolved'].every((s) =>
    dbCore.UPDATE_STATUSES.includes(s)));

// 4) addUpdate: valid, invalid payloads, idempotency in window.
{
  // Fresh store.
  store.clear();
  const rec = db.addUpdate({
    labourId: 'LAB003',
    labourName: 'Sunita Devi',
    type: 'machine-defect',
    details: 'Spindle 4 vibrating',
    media: [{ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', name: 's4.png' }],
  }).record;
  ok('addUpdate returns a record', !!rec);
  ok('defaults status to new', rec.status === 'new');
  ok('media stored', rec.media.length === 1 && rec.media[0].kind === 'image');
  ok('getUpdates has it (newest first)', db.getUpdates()[0].id === rec.id);
  ok('getUpdatesByLabour finds it', db.getUpdatesByLabour('LAB003').length === 1);

  // invalid: unknown type, empty details, bad labour, non-image/video/audio media kind.
  ok('rejects unknown type', db.addUpdate({
    labourId: 'LAB001', labourName: 'X', type: 'nope', details: 'hi', media: [],
  }) === null);
  ok('rejects empty details', db.addUpdate({
    labourId: 'LAB001', labourName: 'X', type: 'emergency', details: '   ', media: [],
  }) === null);
  ok('rejects unknown labour', db.addUpdate({
    labourId: '', labourName: 'X', type: 'emergency', details: 'hi', media: [],
  }) === null);
  ok('rejects invalid media kind', db.addUpdate({
    labourId: 'LAB001', labourName: 'X', type: 'work-activity', details: 'hi',
    media: [{ kind: 'gif', dataUrl: 'x', name: 'x' }],
  }) === null);

  // idempotency: same labour + type + details (case/spacing insensitive) within the window.
  const dup = db.addUpdate({
    labourId: 'LAB003', labourName: 'Sunita Devi', type: 'machine-defect',
    details: '  spindle 4 VIBRATING ', media: [],
  });
  ok('duplicate returns the SAME record id', dup.record.id === rec.id);
  ok('duplicate reports created=false', dup.created === false);
  ok('collection still has one update', db.getUpdates().length === 1);
}

// 5) setUpdateStatus lifecycle + invalid id/status.
{
  store.clear();
  const rec = db.addUpdate({
    labourId: 'LAB007', labourName: 'Geeta Verma', type: 'raw-material-defect',
    details: 'Grey reel shade mismatch', media: [],
  }).record;
  const moved = db.setUpdateStatus(rec.id, 'in-progress');
  ok('status moves to in-progress', moved.status === 'in-progress');
  ok('updatedAt bumped', new Date(moved.updatedAt) >= new Date(rec.updatedAt));
  ok('persisted through getUpdateById', db.getUpdateById(rec.id).status === 'in-progress');
  ok('invalid status rejected', db.setUpdateStatus(rec.id, 'banana') === null);
  ok('unknown id rejected', db.setUpdateStatus('upd-nope', 'resolved') === null);
}

// 6) The write path goes through saveDb → pushes a suab:db-sync event.
{
  store.clear();
  let events = 0;
  globalThis.window.dispatchEvent = (ev) => { if (ev.type === 'suab:db-sync') events++; };
  db.addUpdate({
    labourId: 'LAB001', labourName: 'Ramesh Kumar', type: 'work-activity',
    details: 'Greased spindles on batch 7', media: [],
  });
  await delay(0);
  ok('saveDb fired suab:db-sync event', events >= 1, `events=${events}`);
}

// 7) Cross-browser sync seam: the DB_KEY under surfacing in syncBridge.
{
  ok('db.js DB_KEY stays suab.db', db.DB_KEY === 'suab.db');
}

// Restore a pristine global for anything importing this file after (not used).
delete globalThis.window;
delete globalThis.localStorage;

console.log(`\n${failed === 0 ? 'ok' : 'not ok'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
