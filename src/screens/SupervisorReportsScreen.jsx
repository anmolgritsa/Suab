/**
 * SupervisorReportsScreen.jsx — "Reports" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's bottom-nav "Reports" tab
 * (App.jsx routes Employee ID 9977 here). Shows the labourers' confirmed
 * product submissions, grouped date-wise (newest date first):
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Reports" + one-line hint
 *   4. date picker  native date input (defaults to today) — filters the
 *                   groups to the chosen day
 *   5. groups       per date: one collapsible card per labourer who
 *                   submitted that day — initials avatar, name, ID,
 *                   machine number and a view icon; expanding reveals the
 *                   day's metrics: working hours, successful, rejected
 *                   and reusable products
 *   6. bottom nav   the shared SupervisorBottomNav — Reports is active,
 *                   Home returns to the dashboard, Alerts opens the
 *                   alerts screen
 *
 * The data is the SHARED productSubmissions collection (data/db.js —
 * filed by the labour's Product Submission screen on Confirm). It is LIVE
 * via the sync bridge (useStorageSync): a submission confirmed in the
 * labour's browser appears here without a refresh. NO demo/static rows —
 * only real submissions, with an empty state when none exist for the
 * chosen day. Date grouping reuses the SupervisorLabourUpdatesScreen
 * pattern (newest date first; within a date, newest submissions first).
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 *  - onOpenAlerts()   open the "Emergency Alerts" screen (App.jsx routes
 *                     to 'supervisor-alerts')
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import { useI18n } from '../i18n.jsx';
import { DB_KEY, getProductSubmissions, groupSubmissionsByDate } from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  RefreshIcon,
  XIcon,
} from '../components/icons.jsx';

// Avatar accent colors, cycled across the roster (the same soft palette the
// dashboard's action cards use).
const AVATAR_COLORS = ['blue', 'green', 'amber', 'purple', 'coral'];

// Today's date as a YYYY-MM-DD string (the native date input's format).
function todayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The shift window '…' → '7h 30m' (whole hours + minutes, never negative).
function formatHours(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

/**
 * The SHARED productSubmissions collection (data/db.js) grouped date-wise,
 * newest date first; within a date, newest submissions first. Every real
 * submission is shown — labourers who submitted but are not on any roster
 * get their own card. Returns date groups:
 *   [{ dateKey, rows: [{ id, name, labourId, machineName, hours,
 *                        successful, rejected, reusable, color, submission }] }]
 * Defensive like the Labour Updates feed's buildRows(): one malformed
 * record is skipped, never fatal (a throw here happens during render).
 */
function buildGroups() {
  const submissions = getProductSubmissions();
  const list = Array.isArray(submissions) ? submissions : [];
  const groups = groupSubmissionsByDate(list);
  return groups.map((group) => ({
    dateKey: group.dateKey,
    rows: group.rows.map((submission, index) => ({
      id: String(submission.id ?? `sub-${index}`),
      name: submission.labourName || submission.labourId || '',
      labourId: submission.labourId ?? '',
      machineName: submission.machineName ?? null,
      hours: formatHours(submission.shiftStartAt, submission.shiftEndAt),
      successful: submission.successful ?? 0,
      rejected: submission.rejected ?? 0,
      reusable: submission.reusable ?? 0,
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
      submission,
    })),
  }));
}

/* ### screen */
export default function SupervisorReportsScreen({ onBack, onOpenAlerts }) {
  /* ### state */
  const { t } = useI18n();

  // The SHARED submissions, grouped date-wise — LIVE via the sync bridge:
  // a submission confirmed in the labour's browser re-merges the groups
  // here without a refresh (no manual reload).
  const [groups, setGroups] = useState(buildGroups);
  useStorageSync(() => setGroups(buildGroups()), DB_KEY);

  // Which labourer's card is expanded (null = all collapsed).
  const [expandedId, setExpandedId] = useState(null);

  // The selected day as a YYYY-MM-DD string (native date input value).
  const [dateStr, setDateStr] = useState(todayStr());

  /* ### helpers */
  // Two-letter initials for a labourer's avatar circle (same helper as the
  // attendance screen).
  function initials(name) {
    return name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  /* ### render */
  // The chosen day's group (newest submissions first within it), or null.
  const selectedGroup = groups.find((group) => group.dateKey === dateStr) ?? null;

  return (
    <div className="home suprep">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('supRepBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supRepBack')}</span>
      </button>

      <h1 className="screen__title">{t('supRepTitle')}</h1>
      <p className="screen__subtitle">{t('supRepSub')}</p>

      <main className="suprep__body">
        {/* Date picker — native input, defaults to today. */}
        <label className="suprep__date">
          <CalendarIcon size={18} aria-hidden="true" />
          <input
            type="date"
            value={dateStr}
            max={todayStr()}
            aria-label={t('supRepDateLabel')}
            onChange={(event) => setDateStr(event.target.value)}
          />
        </label>

        {selectedGroup ? (
          <ul className="suprep__list">
            {selectedGroup.rows.map((row) => (
              <li key={row.id} className="suprep__card">
                <button
                  type="button"
                  className="suprep__head"
                  aria-expanded={expandedId === row.id}
                  onClick={() =>
                    setExpandedId((current) => (current === row.id ? null : row.id))
                  }
                >
                  <span
                    className={`suprep__avatar suprep__avatar--${row.color}`}
                    aria-hidden="true"
                  >
                    {initials(row.name)}
                  </span>
                  <span className="suprep__text">
                    <strong>{row.name}</strong>
                    <small>
                      {row.labourId}
                      {row.machineName ? ` · ${row.machineName}` : ''}
                    </small>
                  </span>
                  <span className="suprep__view">
                    <EyeIcon size={16} aria-hidden="true" />
                    <ChevronDownIcon
                      size={16}
                      className="suprep__chevron"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      {expandedId === row.id
                        ? t('supRepCollapse')
                        : t('supRepExpand')}
                    </span>
                  </span>
                </button>

                {expandedId === row.id && (
                  <div className="suprep__detail">
                    <div className="suprep__metrics">
                      <div className="suprep__metric suprep__metric--blue">
                        <ClockIcon size={18} aria-hidden="true" />
                        <strong>{row.hours ?? '—'}</strong>
                        <small>{t('supRepHours')}</small>
                      </div>
                      <div className="suprep__metric suprep__metric--green">
                        <CheckCircleIcon size={18} aria-hidden="true" />
                        <strong>{row.successful}</strong>
                        <small>{t('supRepSuccess')}</small>
                      </div>
                      <div className="suprep__metric suprep__metric--coral">
                        <XIcon size={18} aria-hidden="true" />
                        <strong>{row.rejected}</strong>
                        <small>{t('supRepRejected')}</small>
                      </div>
                      <div className="suprep__metric suprep__metric--amber">
                        <RefreshIcon size={18} aria-hidden="true" />
                        <strong>{row.reusable}</strong>
                        <small>{t('supRepReusable')}</small>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="suprep__empty">{t('supRepNoData')}</p>
        )}
      </main>

      {/* Bottom tab navigation — Reports is active; Home returns to the
          dashboard, Alerts opens the alerts screen. */}
      <SupervisorBottomNav active="reports" onHome={onBack} onAlerts={onOpenAlerts} />
    </div>
  );
}
