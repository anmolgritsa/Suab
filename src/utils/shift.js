/**
 * shift.js — timing rules for the labour homepage (Part 3).
 *
 * A shift is a plain duration measured from the moment the worker first
 * opens the homepage (persisted in localStorage by storage.js so it
 * survives a refresh). Two knobs drive the demo:
 *
 *   SHIFT_DURATION_MINUTES full shift length — the shift auto-ends here
 *   DEMO_INTERVAL_MINUTES  how often the "work update needed" reminder pops
 *
 * Both are plain constants so testers can shrink them (e.g. 0.05 = 3
 * seconds) and watch the whole flow without waiting real hours.
 *
 * DEMO TIMINGS (for testing): a real factory shift is 8 hours with a
 * work-update reminder every 3 hours (180 minutes). For the demo both
 * are shrunk — a 5-minute shift and a 2-minute reminder — so the whole
 * flow (check-in → reminder → shift end → product submission) can be
 * watched in a few minutes. Restore the real values with:
 *   SHIFT_DURATION_MINUTES = 8 * 60   (480)
 *   DEMO_INTERVAL_MINUTES  = 3 * 60   (180)
 */

/** Full shift length in minutes. A real factory shift is 8 hours (480). */
export const SHIFT_DURATION_MINUTES = 5;

/**
 * How often the "Work update needed" reminder appears, in minutes.
 * The mockup asks for every 3 hours (180 minutes); the demo shrinks it
 * to 3 minutes so the reminder pops during a short test run.
 *
 * FOR QUICK TESTING: set this to a fraction — `0.05` is 3 seconds,
 * `1` is one minute — and the reminder will pop almost immediately.
 */
export const DEMO_INTERVAL_MINUTES = 3;

export const SHIFT_DURATION_MS = SHIFT_DURATION_MINUTES * 60 * 1000;
export const REMINDER_INTERVAL_MS = DEMO_INTERVAL_MINUTES * 60 * 1000;

/** Milliseconds elapsed since the shift started (never negative). */
export function getShiftElapsedMs(startIso) {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Date.now() - start);
}

/** Has the shift reached its full length? */
export function isShiftComplete(startIso) {
  return getShiftElapsedMs(startIso) >= SHIFT_DURATION_MS;
}

/**
 * Is it time to show the work-update reminder again?
 *
 * Rule: the first reminder waits one full interval of WORK time, and
 * after that a new one is due once a full interval has passed since the
 * last one was shown (whether it was sent or dismissed).
 */
export function isReminderDue(startIso, lastReminderIso) {
  const elapsed = getShiftElapsedMs(startIso);
  if (elapsed < REMINDER_INTERVAL_MS) return false;
  const anchor = lastReminderIso ? new Date(lastReminderIso).getTime() : new Date(startIso).getTime();
  if (Number.isNaN(anchor)) return true;
  return Date.now() - anchor >= REMINDER_INTERVAL_MS;
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
