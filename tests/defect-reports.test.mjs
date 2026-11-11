/**
 * defect-reports.test.mjs — regression test for the labour → supervisor
 * defect-report sync (Raw Material Defect / Machine Breakdown / Output
 * Defect): the ReportForm → addDefectReport() → shared `defectReports`
 * collection → SupervisorAlertsScreen seam.
 *
 * Covered here:
 *   1. addDefectReport() record shape — labour name/ID, report type, date,
 *      time, voice note, attachment metadata, status.
 *   2. Image stripping — a picked file NEVER enters the shared DB: the
 *      attachment is normalized to { name, type, size }; any dataUrl field
 *      is dropped (images-only upload comes later).
 *   3. Voice note — a string data URL is kept; non-string garbage is
 *      dropped rather than stored broken.
 *   4. Ordering — getDefectReports() newest-first; groupDefectReportsByDate()
 *      newest DATE first (the supervisor feed's contract).
 *   5. setDefectReportStatus() lifecycle (new → acknowledged → resolved).
 *   6. migrateDb() normalizes a v4 document missing `defectReports` (no
 *      throw, empty array) — the blank-page guard.
 *   7. mediaUrl() resolves server-saved audio paths for the inline player.
 *
 * Run with:  node tests/defect-reports.test.mjs
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
const workUploads = await import('../src/data/workUploads.js');
// todayKey lives in utils/storage.js (re-exported by neither data module).
const { todayKey } = await import('../src/utils/storage.js');

console.log('# defect-report sync seam (labour → supervisor)');

// 1) Record shape — everything the supervisor's Alerts card renders.
{
  store.clear();
  const { record, created } = db.addDefectReport({
    labourId: 'LAB001',
    labourName: 'Ramesh Kumar',
    type: 'machine-defect',
    voiceNote: 'data:audio/webm;base64,AAAA',
    attachment: { name: 'defect.jpg', type: 'image/jpeg', size: 1234 },
    reportedAt: '2026-11-10T08:05:33.000Z',
  });
  ok('addDefectReport: valid payload is created', created === true && record !== null);
  ok('record: labour id + name carried', record.labourId === 'LAB001' && record.labourName === 'Ramesh Kumar');
  ok('record: type stored', record.type === 'machine-defect');
  ok('record: factory date is today', record.date === todayKey());
  ok('record: display time derived from reportedAt', typeof record.time === 'string' && record.time.length > 0);
  ok('record: reportedAt kept', record.reportedAt === '2026-11-10T08:05:33.000Z');
  ok('record: voice note kept + hasVoiceNote true',
    record.voiceNote === 'data:audio/webm;base64,AAAA' && record.hasVoiceNote === true);
  ok('record: status starts new', record.status === 'new');
  ok('record: id + stamps present', typeof record.id === 'string' && !!record.createdAt && !!record.updatedAt);
}

// 2) Image stripping — the picked file NEVER enters the shared DB.
{
  store.clear();
  const { record } = db.addDefectReport({
    labourId: 'LAB002',
    labourName: 'Suresh Yadav',
    type: 'input-errors',
    attachment: {
      name: 'photo.png',
      type: 'image/png',
      size: 999,
      // A naive caller might smuggle the file itself onto the metadata —
      // the record must keep METADATA ONLY.
      dataUrl: 'data:image/png;base64,SHOULD_NOT_BE_STORED',
      blob: { huge: 'object' },
    },
    reportedAt: '2026-11-10T07:00:00.000Z',
  });
  ok('strip: attachment normalized to metadata only',
    record.attachment.name === 'photo.png'
    && record.attachment.type === 'image/png'
    && record.attachment.size === 999);
  ok('strip: no dataUrl on the stored attachment', record.attachment.dataUrl === undefined);
  ok('strip: no blob on the stored attachment', record.attachment.blob === undefined);
  ok('strip: serialized record carries no base64 image data',
    !JSON.stringify(record).includes('SHOULD_NOT_BE_STORED'));
}

// 3) Voice note validation — garbage is dropped, not stored broken.
{
  store.clear();
  const a = db.addDefectReport({
    labourId: 'LAB003', labourName: 'Vijay Singh', type: 'output-errors',
    voiceNote: 'blob:http://localhost/non-persistable', reportedAt: '2026-11-10T06:00:00.000Z',
  });
  ok('voice: non-data-URL string is dropped (null)', a.record.voiceNote === null);
  ok('voice: hasVoiceNote false when dropped', a.record.hasVoiceNote === false);

  const b = db.addDefectReport({
    labourId: 'LAB003', labourName: 'Vijay Singh', type: 'output-errors',
    voiceNote: { notAString: true }, reportedAt: '2026-11-10T06:05:00.000Z',
  });
  ok('voice: object voiceNote dropped (null)', b.record.voiceNote === null);

  const c = db.addDefectReport({
    labourId: 'LAB003', labourName: 'Vijay Singh', type: 'output-errors',
    reportedAt: '2026-11-10T06:10:00.000Z',
  });
  ok('voice: absent voiceNote → null + hasVoiceNote false',
    c.record.voiceNote === null && c.record.hasVoiceNote === false);
}

// 4) Ordering — newest first overall, newest DATE first in groups.
//    NOTE: addDefectReport() stamps `date` with todayKey() (the factory day
//    AT SUBMISSION), so records filed "now" all share one date group; the
//    multi-date contract is exercised with synthetic records below.
{
  store.clear();
  db.addDefectReport({ labourId: 'LAB001', labourName: 'Ramesh Kumar', type: 'machine-defect', reportedAt: '2026-11-08T10:00:00.000Z' });
  db.addDefectReport({ labourId: 'LAB002', labourName: 'Suresh Yadav', type: 'input-errors', reportedAt: '2026-11-10T09:00:00.000Z' });
  db.addDefectReport({ labourId: 'LAB003', labourName: 'Vijay Singh', type: 'output-errors', reportedAt: '2026-11-09T12:00:00.000Z' });
  db.addDefectReport({ labourId: 'LAB001', labourName: 'Ramesh Kumar', type: 'machine-defect', reportedAt: '2026-11-10T11:30:00.000Z' });

  const all = db.getDefectReports();
  ok('order: getDefectReports newest-first',
    all[0].reportedAt === '2026-11-10T11:30:00.000Z' && all[3].reportedAt === '2026-11-08T10:00:00.000Z');

  const groups = db.groupDefectReportsByDate(all);
  ok('groups: same-day submissions land in one group (today)', groups.length === 1 && groups[0].dateKey === todayKey());
  ok('groups: within a date newest first',
    groups[0].rows[0].reportedAt === '2026-11-10T11:30:00.000Z'
    && groups[0].rows[3].reportedAt === '2026-11-08T10:00:00.000Z');
  ok('groups: every record lands in exactly one group',
    groups.reduce((n, g) => n + g.rows.length, 0) === 4);
  ok('groups: malformed records skipped, never fatal',
    db.groupDefectReportsByDate([null, 'x', 42, all[0]]).length === 1);

  // Pure grouping contract — records carrying their own factory dates:
  // newest DATE first, input order preserved within a date (the screens
  // pass getXReports() output, already newest-first).
  const synthetic = db.groupDefectReportsByDate([
    { date: '2026-11-10', reportedAt: '2026-11-10T11:30:00.000Z' },
    { date: '2026-11-10', reportedAt: '2026-11-10T09:00:00.000Z' },
    { date: '2026-11-09', reportedAt: '2026-11-09T12:00:00.000Z' },
    { date: '2026-11-08', reportedAt: '2026-11-08T10:00:00.000Z' },
  ]);
  ok('groups (pure): newest date first',
    synthetic[0].dateKey === '2026-11-10' && synthetic[2].dateKey === '2026-11-08');
  ok('groups (pure): within a date newest first',
    synthetic[0].rows[0].reportedAt === '2026-11-10T11:30:00.000Z'
    && synthetic[0].rows[1].reportedAt === '2026-11-10T09:00:00.000Z');
}

// 5) Supervisor lifecycle — acknowledge / resolve persists on the record.
{
  store.clear();
  const { record } = db.addDefectReport({
    labourId: 'LAB004', labourName: 'Anil Verma', type: 'machine-defect',
    reportedAt: '2026-11-10T05:00:00.000Z',
  });
  const acked = db.setDefectReportStatus(record.id, 'acknowledged');
  ok('lifecycle: acknowledge sticks', acked?.status === 'acknowledged');
  const resolved = db.setDefectReportStatus(record.id, 'resolved');
  ok('lifecycle: resolve sticks', resolved?.status === 'resolved');
  ok('lifecycle: updatedAt bumped on change', resolved.updatedAt >= record.createdAt);
  ok('lifecycle: unknown id → null', db.setDefectReportStatus('nope', 'resolved') === null);
  ok('lifecycle: invalid status rejected', db.setDefectReportStatus(record.id, 'bogus') === null);
}

// 6) migrateDb normalization — a v4 doc without defectReports must not
//    make the supervisor feed throw (the blank-page guard).
{
  store.clear();
  store.set('suab.db', JSON.stringify({ version: 4, collections: { users: [] } }));
  let threw = false;
  let list = null;
  try {
    list = db.getDefectReports();
  } catch {
    threw = true;
  }
  ok('migrate: v4 doc missing defectReports does not throw', !threw);
  ok('migrate: getDefectReports returns an array', Array.isArray(list) && list.length === 0);

  store.clear();
  store.set('suab.db', JSON.stringify({
    version: 4,
    collections: { defectReports: 'not-an-array' },
  }));
  let threw2 = false;
  try {
    db.getDefectReports();
  } catch {
    threw2 = true;
  }
  ok('migrate: non-array defectReports normalized (no throw)', !threw2);
}

// 7) mediaUrl — the inline <audio> player's src for a server-saved note.
{
  ok('mediaUrl: server audio path resolves (BASE_URL "/" in Node)',
    workUploads.mediaUrl('/api/work-uploads/def-abc-0.webm') === '/api/work-uploads/def-abc-0.webm');
  ok('mediaUrl: data-URL voice note passes through',
    workUploads.mediaUrl('data:audio/webm;base64,AAAA') === 'data:audio/webm;base64,AAAA');
  ok('mediaUrl: null voice note → empty string (no throw)',
    workUploads.mediaUrl(null) === '');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
