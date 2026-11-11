/**
 * shift.js — timing rules for the labour homepage (Part 3).
 *
 * A shift is a plain duration measured from the moment the worker first
 * opens the homepage (persisted in localStorage by storage.js so it
 * survives a refresh). The demo knobs:
 *
 *   SHIFT_DURATION_MINUTES   full shift length — the shift auto-ends here
 *   HALF_SHIFT_MINUTES       half shift length (the "half-day" mark)
 *   HALF_DAY_BUTTON_MINUTES  when the Half-Day End Shift button appears
 *   ALERT_MILESTONES_MINUTES elapsed minutes that pop a work-update alert
 *   OVERTIME_MINUTES_PER_HOUR demo minutes added per APPROVED overtime hour
 *
 * An APPROVED half-day request (Other screen) switches the shift's type to
 * 'half' (storage.js): shiftDurationMs() then returns HALF_SHIFT_MS, so the
 * homepage's single timer ends the shift at 3 minutes instead of 5. The
 * alert milestones are unchanged — a half shift simply ends before the
 * 4-minute alert can fire.
 *
 * An APPROVED overtime request (OvertimeRequestScreen) stretches the shift
 * the opposite way: storage.js getApprovedOvertimeHours() feeds the approved
 * hours into shiftDurationMs(), which adds one demo minute per hour — a
 * 4-hour approval turns the 5-minute demo shift into a 9-minute one.
 * Overtime never changes the shift's TYPE.
 *
 * DEMO TIMINGS — the whole flow (check-in → alert → half-day button →
 * alert → shift end → product submission) plays out in 5 minutes:
 *
 *   0 min   shift starts (timer counts up from 00:00:00)
 *   2 min   ALERT 1 + the "Half-Day End Shift" button appears
 *   4 min   ALERT 2 (only if the worker kept working)
 *   5 min   full shift auto-ends → Product Submission
 *           (approved overtime stretches this: +1 min per approved hour)
 *
 * A real factory shift is 8 hours with a half-day at 4 hours. Restore the
 * real values with:
 *   SHIFT_DURATION_MINUTES  = 480   HALF_SHIFT_MINUTES      = 240
 *   HALF_DAY_BUTTON_MINUTES = 240   ALERT_MILESTONES_MINUTES = [240, 420]
 *   OVERTIME_MINUTES_PER_HOUR = 60  (an approved hour really is an hour)
 */

/** Full shift length in minutes. A real factory shift is 8 hours (480). */
export const SHIFT_DURATION_MINUTES = 5;

/** Half shift length in minutes. A real half-day is 4 hours (240). */
export const HALF_SHIFT_MINUTES = 3;

/**
 * Elapsed minutes after which the homepage's "Half-Day End Shift" button
 * becomes visible (a real half-day button would appear at 240 minutes).
 */
export const HALF_DAY_BUTTON_MINUTES = 2;

/**
 * Elapsed minutes that pop a work-update alert, in order. The demo shift
 * alerts twice: once at 2 minutes and once at 4 minutes.
 */
export const ALERT_MILESTONES_MINUTES = [2, 4];

export const SHIFT_DURATION_MS = SHIFT_DURATION_MINUTES * 60 * 1000;
export const HALF_SHIFT_MS = HALF_SHIFT_MINUTES * 60 * 1000;
export const HALF_DAY_BUTTON_MS = HALF_DAY_BUTTON_MINUTES * 60 * 1000;
export const ALERT_MILESTONES_MS = ALERT_MILESTONES_MINUTES.map(
  (minutes) => minutes * 60 * 1000,
);

/**
 * Demo conversion for APPROVED overtime: each approved overtime HOUR
 * stretches the demo shift by ONE minute (so a 4-hour approval turns the
 * 5-minute demo shift into a 9-minute one). A real app adds the full hour
 * — restore OVERTIME_MINUTES_PER_HOUR = 60 together with the real shift
 * lengths above.
 */
export const OVERTIME_MINUTES_PER_HOUR = 1;

/**
 * Demo supervisor-approval delay for an overtime request: a PENDING request
 * flips to approved this long after it was made. The overtime screen drives
 * the countdown while it is open; the Other screen resumes the same
 * countdown if the worker left mid-wait (both schedule from the request's
 * requestedAt in storage.js, so the total wait is always 10 seconds).
 */
export const OVERTIME_APPROVAL_DELAY_MS = 10 * 1000;

/**
 * Milliseconds an APPROVED overtime request adds to the shift's length
 * (demo: OVERTIME_MINUTES_PER_HOUR minutes per hour). Missing, corrupt or
 * negative hours count as no overtime.
 */
export function overtimeExtensionMs(overtimeHours) {
  const hours =
    Number.isFinite(overtimeHours) && overtimeHours > 0 ? overtimeHours : 0;
  return hours * OVERTIME_MINUTES_PER_HOUR * 60 * 1000;
}

/**
 * How long the shift lasts, given its type ('full' or 'half' — see
 * storage.js getShiftType) and any APPROVED overtime (storage.js
 * getApprovedOvertimeHours). An approved half-day request does NOT create
 * a second timer: the homepage's single ShiftTimer simply measures the
 * same elapsed time against the shorter half-shift length, so the shift
 * auto-ends at HALF_SHIFT_MINUTES instead of SHIFT_DURATION_MINUTES.
 * Approved overtime stretches that length the same way — each approved
 * hour adds OVERTIME_MINUTES_PER_HOUR demo minutes (4 hours → +4 min).
 * Anything unknown counts as a full shift with no overtime.
 */
export function shiftDurationMs(type, overtimeHours = 0) {
  const base = type === 'half' ? HALF_SHIFT_MS : SHIFT_DURATION_MS;
  return base + overtimeExtensionMs(overtimeHours);
}

/**
 * The shift's length in whole minutes ('full' → 5, 'half' → 3 in the
 * demo, plus one minute per approved overtime hour).
 */
export function shiftDurationMinutes(type, overtimeHours = 0) {
  const base = type === 'half' ? HALF_SHIFT_MINUTES : SHIFT_DURATION_MINUTES;
  return base + overtimeExtensionMs(overtimeHours) / (60 * 1000);
}

/** Milliseconds elapsed since the shift started (never negative). */
export function getShiftElapsedMs(startIso) {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Date.now() - start);
}

/** Has the shift reached its full length (including approved overtime)? */
export function isShiftComplete(startIso, type = 'full', overtimeHours = 0) {
  return getShiftElapsedMs(startIso) >= shiftDurationMs(type, overtimeHours);
}

/**
 * Has the shift reached its REGULAR length (full or half — WITHOUT any
 * approved overtime extension)? The homepage uses this to flip its
 * overtime indicator on: the overtime portion of the shift begins the
 * moment the regular day shift is done, so the overtime icon/badge must
 * appear only once this turns true.
 */
export function isRegularShiftComplete(startIso, type = 'full') {
  return getShiftElapsedMs(startIso) >= shiftDurationMs(type, 0);
}

/**
 * Which work-update alert is due right now?
 *
 * `alertsShown` counts the alerts that have already popped for this shift
 * (persisted in storage.js so a refresh never repeats one). Returns the
 * index of the LAST milestone that has been reached but not shown yet —
 * a worker who was on a report screen through both milestones gets one
 * catch-up alert, not two — or -1 when nothing is due.
 */
export function dueAlertIndex(elapsedMs, alertsShown) {
  const shown = Number.isInteger(alertsShown) && alertsShown > 0 ? alertsShown : 0;
  let due = -1;
  for (let i = shown; i < ALERT_MILESTONES_MS.length; i += 1) {
    if (elapsedMs < ALERT_MILESTONES_MS[i]) break;
    due = i;
  }
  return due;
}

/**
 * Split an elapsed duration into the timer's "00:00:00" (hh:mm:ss) parts.
 * A fresh shift therefore reads 00:00:00 and every part is zero-padded to
 * two digits so the display never changes width as it ticks.
 */
export function formatShiftElapsed(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}
