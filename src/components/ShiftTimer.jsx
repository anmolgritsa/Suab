/**
<<<<<<< HEAD
 * ShiftTimer.jsx — the pale-blue pill under the homepage header.
 *
 * It counts up once per second from the shift's start time and calls
 * `onComplete()` exactly once when the shift reaches its full length —
 * the homepage then ends the shift and moves to product submission.
 *
 * The display is a 24-hour-style clock that starts at 00:00:00 when the
 * shift begins (hh:mm:ss, zero-padded so the digits never jitter).
 *
 * Props:
 *  - startedAt   ISO timestamp when the current shift began
 *  - onComplete() called once when the shift reaches SHIFT_DURATION
=======
 * ShiftTimer.jsx — the pill under the homepage greeting that counts the
 * running shift up ("00:00:00").
 *
 * ONE timer for the whole shift: its duration comes from shiftDurationMs()
 * in utils/shift.js, which already stretches the shift by the approved
 * overtime hours (one demo minute per hour). This component only renders
 * that single countdown — it never adds a second timer.
 *
 * Behaviour:
 *  - ticks once per second (plus one immediate evaluation on mount, so a
 *    worker returning from another screen gets their catch-up alert and
 *    the auto-end without waiting a full second)
 *  - calls onAlert(index) when a work-update alert milestone is reached
 *    (index = the 0-based milestone from dueAlertIndex; HomeScreen turns
 *    it into the persisted "alerts shown" count)
 *  - calls onComplete() exactly once when the (possibly extended) shift
 *    ends — the homepage then clears the shift and moves on
 *
 * Props:
 *  - startedAt    ISO timestamp the shift began (null → renders nothing)
 *  - durationMs   total shift length in ms (regular + approved overtime)
 *  - alertsShown  how many work-update alerts have already popped
 *  - onAlert(n)   called when alert n becomes due (n = 1, 2, 3)
 *  - onComplete() called once when the (possibly extended) shift ends
 *  - overtime     the REGULAR shift duration has elapsed — the overtime
 *                 tail of the same timer is running. Purely visual: the
 *                 pill turns orange and the clock gains a plus.
>>>>>>> master
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
<<<<<<< HEAD
import { ClockIcon } from './icons.jsx';
import {
  SHIFT_DURATION_MS,
  formatShiftElapsed,
  getShiftElapsedMs,
} from '../utils/shift.js';

export default function ShiftTimer({ startedAt, onComplete }) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => getShiftElapsedMs(startedAt));
  const completedRef = useRef(false);

  /* Tick every second so the seconds roll over promptly. */
  useEffect(() => {
    const id = setInterval(() => setElapsed(getShiftElapsedMs(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  /* Fire the shift-end callback once, when the full length is reached. */
  useEffect(() => {
    if (completedRef.current || elapsed < SHIFT_DURATION_MS) return;
    completedRef.current = true;
    onComplete();
  }, [elapsed, onComplete]);

  const { hours, minutes, seconds } = formatShiftElapsed(elapsed);

  return (
    <div className="shift-timer" role="timer" aria-label={t('shiftTimerLabel')}>
      <span className="shift-timer__icon" aria-hidden="true">
        <ClockIcon size={22} />
=======
import { ClockIcon, ClockPlusIcon } from './icons.jsx';
import {
  dueAlertIndex,
  formatShiftElapsed,
  getShiftElapsedMs,
  SHIFT_DURATION_MS,
} from '../utils/shift.js';

export default function ShiftTimer({
  startedAt,
  durationMs = SHIFT_DURATION_MS,
  alertsShown,
  onAlert,
  onComplete,
  overtime = false,
}) {
  const { t } = useI18n();

  // Elapsed time, seeded from the persisted start so a refresh never
  // resets the clock to 00:00:00.
  const [elapsedMs, setElapsedMs] = useState(() =>
    startedAt ? getShiftElapsedMs(startedAt) : 0,
  );

  // The interval callback must always see the latest props without being
  // re-created (and re-timed) on every render — hence refs. They are
  // synced in the dep-less effect below (after every commit) rather than
  // during render, which react-hooks/refs forbids. The effect is declared
  // BEFORE the timer effect, so its immediate first tick always sees
  // fresh values.
  const alertsShownRef = useRef(alertsShown);
  const onAlertRef = useRef(onAlert);
  const onCompleteRef = useRef(onComplete);
  const durationRef = useRef(durationMs);
  const firedCompleteRef = useRef(false); // onComplete fires exactly once

  useEffect(() => {
    alertsShownRef.current = alertsShown;
    onAlertRef.current = onAlert;
    onCompleteRef.current = onComplete;
    durationRef.current = durationMs;
  }); // no dep array — re-sync after every commit

  useEffect(() => {
    if (!startedAt) return undefined;
    firedCompleteRef.current = false; // a new start timestamp = a new shift

    const tick = () => {
      const elapsed = getShiftElapsedMs(startedAt);
      setElapsedMs(elapsed);

      // Work-update alert due? dueAlertIndex returns the LAST milestone
      // reached but not shown yet (-1 when none) — one catch-up alert,
      // never a burst. Bump the ref immediately so the same milestone
      // can't fire twice within one tick.
      const due = dueAlertIndex(elapsed, alertsShownRef.current);
      if (due >= 0) {
        alertsShownRef.current = due + 1;
        onAlertRef.current(due);
      }

      // Shift over (regular length + approved overtime)? Fire once —
      // the homepage clears the shift and switches screens.
      if (elapsed >= durationRef.current) {
        if (!firedCompleteRef.current) {
          firedCompleteRef.current = true;
          onCompleteRef.current();
        }
      }
    };

    tick(); // don't make the first second wait
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [startedAt]);

  if (!startedAt) return null;

  const { hours, minutes, seconds } = formatShiftElapsed(elapsedMs);

  return (
    <div
      className={'shift-timer' + (overtime ? ' shift-timer--overtime' : '')}
      role="timer"
      aria-label={overtime ? t('overtimeShiftBadge') : t('shiftTimerLabel')}
    >
      <span className="shift-timer__icon" aria-hidden="true">
        {overtime ? <ClockPlusIcon size={22} /> : <ClockIcon size={22} />}
>>>>>>> master
      </span>
      <span className="shift-timer__time">
        {hours}:{minutes}:{seconds}
      </span>
    </div>
<<<<<<< HEAD
  );
=======
  )
>>>>>>> master
}
