import { setLanguage, getLanguage } from './src/utils/storage.js';

globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
  clear() { this._s = {}; },
};

// storage.js was imported above; db.js reads the same global localStorage.
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL:', msg); } }

const db = await import('./src/data/db.js');

// --- attendance flow ---
const r1 = db.markAttendance('lab-1', 'Ravi Kumar', 'morning');
ok(r1 && typeof r1 === 'object', 'markAttendance returns record');
ok(r1.labourId === 'lab-1' && r1.labourName === 'Ravi Kumar', 'record carries id/name');
ok(r1.date === new Date().toISOString().slice(0, 10), 'record date is today');
ok(typeof r1.checkInTime === 'string', 'record has check-in time');
ok(r1.shift === 'morning', 'record has shift');

const sizeAfterFirst = db.getAttendanceForDate(r1.date).length;
const r2 = db.markAttendance('lab-1', 'Ravi Kumar', 'morning');
ok(db.getAttendanceForDate(r1.date).length === sizeAfterFirst, 'duplicate check-in not stored (idempotent)');
ok(r2.id === r1.id, 'idempotent call returns existing record');

const r3 = db.markAttendance('lab-2', 'Other Labour', 'morning');
ok(db.getAttendanceForDate(r1.date).length === sizeAfterFirst + 1, 'different labour adds new record');

const forLabour = db.getAttendanceFor('lab-1', r1.date);
ok(forLabour && forLabour.id === r1.id, 'getAttendanceFor finds labour record');
ok(db.getAttendanceFor('nobody', r1.date) == null, 'getAttendanceFor returns null/undefined for unknown labour');
ok(r3 != null, 'sanity');

// --- language persistence used by i18n provider ---
setLanguage('hi');
ok(getLanguage() === 'hi', 'storage language round-trips');

// --- i18n module parses and exports correctly ---
let mod;
try {
  mod = await import('./src/i18n.jsx');
} catch (e) {
  ok(false, 'i18n.jsx failed to parse/import: ' + e.message);
}
if (mod) {
  ok(Array.isArray(mod.LANGUAGES) && mod.LANGUAGES.length === 5, 'LANGUAGES has 5 entries');
  ok(typeof mod.I18nProvider === 'function', 'I18nProvider exported');
  ok(typeof mod.useI18n === 'function', 'useI18n exported');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
