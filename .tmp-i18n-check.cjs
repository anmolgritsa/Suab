// One-off i18n parity check for the new Other-screen keys.
const fs = require('fs');
const src = fs.readFileSync('src/i18n.jsx', 'utf8');
const keys = [
  'other', 'otherTitle', 'otherSub', 'otherHalfDay', 'otherOvertime',
  'otherMaintenance', 'otherActivities', 'halfDayPending',
  'halfDayApproved', 'shiftNowHalf', 'inputMaterial1', 'gradeLabel',
];
let bad = 0;
for (const k of keys) {
  const n = (src.match(new RegExp('\\b' + k + ':', 'g')) || []).length;
  const ok = n === 5;
  if (!ok) bad += 1;
  console.log((ok ? 'OK  ' : 'BAD ') + k + ' x' + n);
}
process.exitCode = bad ? 1 : 0;
