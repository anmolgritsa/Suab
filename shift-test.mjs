/**
 * shift-test.mjs — quick node check of the homepage's timing logic.
 * Run with:  node shift-test.mjs
 * (Not part of the app bundle — just a developer sanity check.)
 */

import {
  SHIFT_DURATION_MS,
  REMINDER_INTERVAL_MS,
  getShiftElapsedMs,
  isShiftComplete,
  isReminderDue,
  formatShiftElapsed,
} from './src/utils/shift.js'

let failures = 0

function t(label, actual, expected) {
  // JSON compare so object results (formatShiftElapsed) work too.
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(ok ? 'PASS' : 'FAIL', label, '->', JSON.stringify(actual))
}

const NOW = Date.now()
const ago = (ms) => new Date(NOW - ms).toISOString()

/* ---- getShiftElapsedMs ---- */
t('elapsed for invalid date', getShiftElapsedMs('not-a-date'), 0)
t('elapsed for future start clamps to 0', getShiftElapsedMs(ago(-60000)), 0)
t('elapsed ~1h', Math.round(getShiftElapsedMs(ago(3600000)) / 60000), 60)

/* ---- isShiftComplete (demo shift = SHIFT_DURATION_MINUTES, see shift.js) ---- */
t('shift not complete after 1 minute', isShiftComplete(ago(60000)), false)
t('shift not complete just before the duration', isShiftComplete(ago(SHIFT_DURATION_MS - 60000)), false)
t('shift complete after full duration', isShiftComplete(ago(SHIFT_DURATION_MS)), true)
t('shift complete well past duration', isShiftComplete(ago(SHIFT_DURATION_MS * 5)), true)

/* ---- formatShiftElapsed (the timer's "00:00:00" hh:mm:ss parts) ---- */
t('format 0ms', formatShiftElapsed(0), { hours: '00', minutes: '00', seconds: '00' })
t('format 90.5s', formatShiftElapsed(90500), { hours: '00', minutes: '01', seconds: '30' })
t('format 1h', formatShiftElapsed(3600000), { hours: '01', minutes: '00', seconds: '00' })
t('format 1h 5min', formatShiftElapsed(3900000), { hours: '01', minutes: '05', seconds: '00' })
t('format 2h 59min 59s', formatShiftElapsed(10799999), { hours: '02', minutes: '59', seconds: '59' })
t('format 10h (past shift end)', formatShiftElapsed(36000000), { hours: '10', minutes: '00', seconds: '00' })

/* ---- isReminderDue ----
   Rule: the first reminder waits one full interval of work time; later
   ones wait a full interval since the last reminder was shown. */
t('reminder not due before first interval', isReminderDue(ago(60000), null), false)
t('reminder due at first interval', isReminderDue(ago(REMINDER_INTERVAL_MS), null), true)
t('reminder not due right after shown', isReminderDue(ago(REMINDER_INTERVAL_MS * 2), ago(60000)), false)
t('reminder due a full interval after shown', isReminderDue(ago(REMINDER_INTERVAL_MS * 2), ago(REMINDER_INTERVAL_MS)), true)
t('reminder due long after shown', isReminderDue(ago(REMINDER_INTERVAL_MS * 10), ago(REMINDER_INTERVAL_MS * 2)), true)

console.log(failures > 0 ? `\n${failures} test(s) FAILED` : '\nAll shift tests passed')
if (failures > 0) process.exit(1)
