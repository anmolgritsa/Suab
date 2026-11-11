/**
 * SupervisorSosScreen.jsx — "SOS Alerts" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's blinking SOS overlay (or its SOS
 * banner / App.jsx routes Employee ID 9977 here). Lists the labourers'
 * SOS emergencies as cards, grouped date-wise:
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "SOS Alerts" + one-line hint
 *   4. feed         date-wise groups (newest date first); within a date,
 *                   newest alerts first — one card per SOS with the
 *                   labourer's initials avatar, name, ID and time, the
 *                   machine number, the emergency details (message), a
 *                   status badge and — while unresolved — Acknowledge /
 *                   Resolve buttons
 *   5. actions      Acknowledge/Resolve flip the card's status badge and
 *                   persist in the SHARED sosAlerts collection, so the
 *                   change survives a refresh and syncs to every browser
 *   6. bottom nav   the shared SupervisorBottomNav — Home returns to the
 *                   dashboard, Reports/Alerts open their screens
 *
 * The feed is the SHARED sosAlerts collection (data/db.js — written by the
 * labour SosButton on confirm). It is LIVE via the sync bridge
 * (useStorageSync): an SOS raised in the labour's browser appears here
 * without a refresh. NO demo/static rows are shown — only real alerts,
 * with an empty state when none exist.
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import Toast from '../components/Toast.jsx';
import { useI18n } from '../i18n.jsx';
import {
  DB_KEY,
  getSosAlerts,
  groupSosAlertsByDate,
  setSosAlertStatus,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  FactoryIcon,
} from '../components/icons.jsx';

// Avatar accent colors, cycled across the cards (coral first — SOS is the
// emergency screen; same soft palette the other supervisor screens use).
const AVATAR_COLORS = ['coral', 'amber', 'purple', 'blue', 'green'];

/* ### helpers */
// '2026-11-09' → 'Mon, Nov 9' — a date group's heading (the same helper the
// Labour Updates feed uses for its date headings).
function formatDateHeading(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Two-letter initials for a labourer's avatar circle (same helper as the
// other supervisor screens).
function initials(name) {
  return String(name ?? '')
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The SHARED sosAlerts collection (data/db.js) grouped date-wise, newest
 * date first; within a date, newest alerts first (getSosAlerts() is
 * already newest-first). Every real alert is shown — labourers who are
 * not on any roster get their own card. Returns date groups:
 *   [{ dateKey, rows: [{ id, name, labourId, machineNumber, message, at,
 *                       status, color, alert }] }]
 * Defensive like the other feeds' buildRows(): one malformed record is
 * skipped, never fatal (a throw here happens during render).
 */
function buildRows() {
  const alerts = getSosAlerts();
  const list = Array.isArray(alerts) ? alerts : [];
  return groupSosAlertsByDate(list).map((group) => ({
    dateKey: group.dateKey,
    rows: group.rows.map((alert, index) => ({
      id: String(alert.id ?? `sos-${index}`),
      labourId: alert.labourId ?? '',
      name: alert.labourName || alert.labourId || '',
      machineNumber: alert.machineNumber ?? null,
      message: alert.message ?? null,
      at: alert.time ?? '',
      status: alert.status ?? 'active',
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
      alert,
    })),
  }));
}

/* ### screen */
export default function SupervisorSosScreen({ onBack }) {
  /* ### state */
  const { t } = useI18n();

  // The feed — LIVE via the sync bridge: an SOS raised in the labour's
  // browser re-merges the groups here without a refresh (no manual reload).
  const [groups, setGroups] = useState(buildRows);
  useStorageSync(() => setGroups(buildRows()), DB_KEY);

  // Transient toast after a status change.
  const [toast, setToast] = useState(null);

  /* ### actions */
  // Acknowledge or resolve an SOS. The change persists in the SHARED
  // sosAlerts collection (data/db.js) and re-merges the groups, so the
  // card re-renders with the new status badge and the action disappears.
  function act(row, status) {
    setSosAlertStatus(row.id, status);
    setGroups(buildRows());
    setToast(
      status === 'resolved'
        ? t('sosScreenToastResolved')
        : t('sosScreenToastAcknowledged'),
    );
  }

  /* ### render */
  const statusLabel = (status) =>
    status === 'resolved'
      ? t('sosScreenResolved')
      : status === 'acknowledged'
        ? t('sosScreenAcknowledged')
        : t('sosScreenActive');

  const statusIcon = (status) =>
    status === 'resolved' ? (
      <CheckCircleIcon size={12} aria-hidden="true" />
    ) : status === 'acknowledged' ? (
      <ClockIcon size={12} aria-hidden="true" />
    ) : (
      <AlertTriangleIcon size={12} aria-hidden="true" />
    );

  /* ### jsx */
  return (
    <div className="home supal">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('sosScreenBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('sosScreenBack')}</span>
      </button>

      <h1 className="screen__title">{t('sosScreenTitle')}</h1>
      <p className="screen__subtitle">{t('sosScreenSub')}</p>

      <main className="supal__body">
        {groups.length === 0 ? (
          /* Empty state — no real SOS alerts yet (no demo rows are shown). */
          <p className="supal__empty">{t('sosScreenEmpty')}</p>
        ) : (
          groups.map((group) => (
            <section key={group.dateKey} className="supal__date-group">
              <h2 className="supal__date-heading">
                {formatDateHeading(group.dateKey)}
              </h2>
              <ul className="supal__list">
                {group.rows.map((row) => (
                  <li key={row.id} className="supal__card">
                    <div className="supal__head">
                      <span
                        className={`supal__avatar supal__avatar--${row.color}`}
                        aria-hidden="true"
                      >
                        {initials(row.name)}
                      </span>
                      <span className="supal__who">
                        <strong>{row.name}</strong>
                        <small>
                          {row.labourId}
                          {row.at ? ` · ${row.at}` : ''}
                        </small>
                      </span>
                      <span className="supal__type supal__type--sos">
                        <AlertTriangleIcon size={12} aria-hidden="true" />
                        {t('sos')}
                      </span>
                    </div>

                    {/* Machine number — from the labourer's assigned job. */}
                    {row.machineNumber ? (
                      <div className="supal__media">
                        <span className="supal__thumb supal__thumb--photo">
                          <FactoryIcon size={13} aria-hidden="true" />
                          {t('sosScreenMachine')} {row.machineNumber}
                        </span>
                      </div>
                    ) : null}

                    {/* Emergency details — the message the SOS carries. */}
                    {row.message ? (
                      <p className="supal__message">{row.message}</p>
                    ) : null}

                    <div className="supal__meta">
                      <span
                        className={`supal__status supal__status--${row.status}`}
                      >
                        {statusIcon(row.status)}
                        {statusLabel(row.status)}
                      </span>
                    </div>

                    {row.status !== 'resolved' && (
                      <div className="supal__actions">
                        {row.status === 'active' ? (
                          <button
                            type="button"
                            className="supal__act supal__act--acknowledge"
                            onClick={() => act(row, 'acknowledged')}
                          >
                            <ClockIcon size={14} aria-hidden="true" />
                            <span>{t('sosScreenAcknowledge')}</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="supal__act supal__act--resolve"
                          onClick={() => act(row, 'resolved')}
                        >
                          <CheckCircleIcon size={14} aria-hidden="true" />
                          <span>{t('sosScreenResolve')}</span>
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {/* Bottom tab navigation — Home returns to the dashboard; Reports and
          Alerts open their screens. */}
      <SupervisorBottomNav onHome={onBack} />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
