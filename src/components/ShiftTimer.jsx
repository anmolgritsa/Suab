/**
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
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
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
      </span>
      <span className="shift-timer__time">
        {hours}:{minutes}:{seconds}
      </span>
    </div>
  );
}
