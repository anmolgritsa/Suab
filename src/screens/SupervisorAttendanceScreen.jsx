/**
 * SupervisorAttendanceScreen.jsx — "Attendance" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's "Attendance" action card
 * (App.jsx routes Employee ID 9977 here). Shows who checked in on a
 * chosen day:
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Attendance" + one-line hint
 *   4. date strip   prev/next arrows + a horizontal strip of day chips
 *                   (defaults to today; tap a chip to jump to that day)
 *   5. roster       one row per labourer — initials avatar, name, ID and
 *                   check-in time (clock icon, green) when present, or a
 *                   muted "Not Present" badge when absent
 *   6. bottom nav   the shared SupervisorBottomNav — Home is active,
 *                   Reports opens the reports screen, Alerts opens the
 *                   alerts screen
 *
 * The roster is the data layer's LABOUR users (one row per seeded LAB001–
 * LAB010, plus any account added later via addUser() — no schema change),
 * joined with that day's attendance records. The screen stays in sync
 * automatically (useStorageSync): when a labour checks in from another tab
 * it shows up here without any manual refresh. Dates the store has no
 * records for (past days, in the same-browser demo) show every labour as
 * Not Present — honest rather than the old hardcoded demo times.
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 *  - onOpenReports()  open the "Reports" screen (App.jsx routes to
 *                     'supervisor-reports')
 *  - onOpenAlerts()   open the "Emergency Alerts" screen (App.jsx routes
 *                     to 'supervisor-alerts')
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import { useI18n } from '../i18n.jsx';
import { formatTime12h, todayKey } from '../utils/storage.js';
import {
  DB_KEY,
  USER_ROLES,
  getAttendanceForDate,
  getUsersByRole,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
} from '../components/icons.jsx';

/* ### data-from-db */
// Avatar accent colors, cycled across the roster (the same soft palette the
// dashboard's action cards use).
const AVATAR_COLORS = ['blue', 'green', 'amber', 'purple', 'coral'];

// How many days the strip shows, ending at today.
const STRIP_DAYS = 7;

// A Date stamped at LOCAL midnight → storage.js's 'YYYY-MM-DD' day key.
function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Every labour account (the roster) joined with the selected day's
 * attendance. One row per labourer, in roster order, chosen-date records
 * joined by Employee ID: a labour with a record is Present with its
 * check-in time, everyone else is Not Present. A new account (addUser)
 * simply appears as another row — no screen or schema change.
 */
function buildRows(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const selectedKey = offset === 0 ? todayKey() : dateKey(date);
  // One lookup per Employee ID — O(1) joins regardless of collection size.
  const todayRecords = new Map(
    getAttendanceForDate(selectedKey).map((record) => [
      record.employeeId.toUpperCase(),
      record,
    ]),
  );
  return getUsersByRole(USER_ROLES.LABOUR).map((user, index) => {
    const record = todayRecords.get(user.credentials.employeeId.toUpperCase()) ?? null;
    return {
      id: user.credentials.employeeId,
      name: user.name,
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
      record,
      checkInAt: record ? formatTime12h(record.checkInAt) : '',
    };
  });
}

/* ### screen */
export default function SupervisorAttendanceScreen({
  onBack,
  onOpenReports,
  onOpenAlerts,
}) {
  /* ### state */
  const { t } = useI18n();

  // Day offset from today for the selected date (0 = today, -1 = yesterday).
  const [dayOffset, setDayOffset] = useState(0);

  // The joined roster rows for the selected day, derived from the shared
  // data layer and kept live by useStorageSync (below).
  const [rows, setRows] = useState(() => buildRows(0));

  /* ### live sync */
  // Keep the roster in sync AUTOMATICALLY — no manual refresh:
  //  - the 'storage' event fires in THIS tab when a labour checks in from
  //    another tab of the same browser (each writes the shared 'suab.db');
  //  - 'focus' + 'visibilitychange' catch same-tab writes (no event fires
  //    for them) and anything missed while this tab was away;
  //  - a short interval is a conservative fallback so the count converges
  //    even if neither listener fires.
  useStorageSync(() => setRows(buildRows(dayOffset)), DB_KEY);

  /* ### helpers */
  // Two-letter initials for a labourer's avatar circle (same helper as the
  // assign screen).
  function initials(name) {
    return name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // Switch the displayed day: re-join the roster against that date's
  // records (previous days exist in the store once its labourers check in).
  function chooseDay(nextOffset) {
    setDayOffset(nextOffset);
    setRows(buildRows(nextOffset));
  }

  // The strip of day chips: STRIP_DAYS days ending today. Each chip knows
  // its offset so the roster can be re-keyed when tapped.
  const today = new Date();
  const days = Array.from({ length: STRIP_DAYS }, (_, index) => {
    const offset = index - (STRIP_DAYS - 1);
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return {
      offset,
      name: date.toLocaleDateString('en', { weekday: 'short' }),
      num: date.getDate(),
    };
  });

  /* ### render */
  return (
    <div className="home supat">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('supAttBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supAttBack')}</span>
      </button>

      <h1 className="screen__title">{t('supAttTitle')}</h1>
      <p className="screen__subtitle">{t('supAttSub')}</p>

      <main className="supat__body">
        {/* Date switcher — prev/next arrows + a strip of day chips. */}
        <div className="supat__dates">
          <button
            type="button"
            className="supat__arrow"
            aria-label={t('supAttPrevDay')}
            onClick={() => chooseDay(dayOffset - 1)}
          >
            <ChevronLeftIcon size={18} aria-hidden="true" />
          </button>
          <div className="supat__strip">
            {days.map((day) => (
              <button
                key={day.offset}
                type="button"
                className={
                  'supat__day'
                  + (day.offset === dayOffset ? ' supat__day--on' : '')
                  + (day.offset === 0 ? ' supat__day--today' : '')
                }
                onClick={() => chooseDay(day.offset)}
              >
                <span className="supat__day-name">{day.name}</span>
                <span className="supat__day-num">{day.num}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="supat__arrow"
            aria-label={t('supAttNextDay')}
            disabled={dayOffset >= 0}
            onClick={() => chooseDay(Math.min(dayOffset + 1, 0))}
          >
            <ChevronRightIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <ul className="supat__list">
          {rows.map((row) => (
            <li key={row.id} className="supat__row">
              <span
                className={`supat__avatar supat__avatar--${row.color}`}
                aria-hidden="true"
              >
                {initials(row.name)}
              </span>
              <span className="supat__text">
                <strong>{row.name}</strong>
                <small>{row.id}</small>
              </span>
              {row.record ? (
                /* Check-in time — clock icon + green text. */
                <span className="supat__time">
                  <ClockIcon size={14} aria-hidden="true" />
                  {row.checkInAt}
                </span>
              ) : null}
              <span
                className={
                  row.record
                    ? 'supat__badge supat__badge--on'
                    : 'supat__badge supat__badge--off'
                }
              >
                {row.record ? (
                  <CheckCircleIcon size={12} aria-hidden="true" />
                ) : (
                  <ClockIcon size={12} aria-hidden="true" />
                )}
                {row.record ? t('supAttPresent') : t('supAttNotPresent')}
              </span>
            </li>
          ))}
        </ul>
      </main>

      {/* Bottom tab navigation — Home is active; Reports and Alerts open
          their screens. */}
      <SupervisorBottomNav
        active="home"
        onHome={onBack}
        onReports={onOpenReports}
        onAlerts={onOpenAlerts}
      />
    </div>
  );
}
