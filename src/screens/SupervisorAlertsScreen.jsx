/**
 * SupervisorAlertsScreen.jsx — "Emergency Alerts" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's bottom-nav "Alerts" tab (App.jsx
 * routes Employee ID 9977 here). Shows the labourers' defect/breakdown
 * reports as compact cards, grouped date-wise:
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Emergency Alerts" + one-line hint
 *   4. filters      All / Machine / Material / Output chips
 *   5. feed         date-wise groups (newest date first); within a date,
 *                   newest reports first — one card per report with the
 *                   labourer's initials avatar, name, ID and time, a
 *                   color-coded type badge (Machine Breakdown / Raw
 *                   Material Defect / Output Defect), the attachment
 *                   metadata chip (the picked file is NOT uploaded —
 *                   images-only upload comes later), an inline <audio
 *                   controls> player for the voice note (or a muted "no
 *                   voice note" state), a status badge and — while
 *                   unresolved — an Acknowledge / Resolve button
 *   6. actions      Acknowledge/Resolve flip the card's status badge, hide
 *                   the button and toast the result; the change persists in
 *                   the SHARED defectReports collection so it survives a
 *                   refresh and syncs to every browser
 *   7. bottom nav   the shared SupervisorBottomNav — Alerts is active,
 *                   Home returns to the dashboard, Reports opens the
 *                   reports screen
 *
 * The feed is the SHARED defectReports collection (data/db.js — filed by
 * the labour ReportForm on Submit). It is LIVE via the sync bridge
 * (useStorageSync): a report submitted in the labour's browser appears
 * here without a refresh. NO demo/static rows are shown — only real
 * submissions from labour, with an empty state when none exist. Voice
 * notes are saved by the sync server into data/work-uploads/ and rendered
 * inline (<audio controls src={mediaUrl(...)}>).
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 *  - onOpenReports()  open the "Reports" screen (App.jsx routes to
 *                     'supervisor-reports')
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import Toast from '../components/Toast.jsx';
import { useI18n } from '../i18n.jsx';
import {
  DB_KEY,
  getDefectReports,
  groupDefectReportsByDate,
  setDefectReportStatus,
} from '../data/db.js';
import { mediaUrl } from '../data/workUploads.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  ClockIcon,
  MicIcon,
  PackageIcon,
  WrenchIcon,
} from '../components/icons.jsx';

// Avatar accent colors, cycled across the cards (the same soft palette the
// dashboard's action cards use).
const AVATAR_COLORS = ['blue', 'green', 'amber', 'purple', 'coral'];

// The report types → their filter chip ids (the same chips the demo
// screen had: All / Machine / Material / Output).
const TYPE_MACHINE = 'machine-defect';
const TYPE_MATERIAL = 'input-errors';
const TYPE_OUTPUT = 'output-errors';

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
 * The SHARED defectReports collection (data/db.js) grouped date-wise,
 * newest date first; within a date, newest reports first
 * (getDefectReports() is already newest-first). Every real submission is
 * shown — labourers who filed but are not on any roster get their own
 * card. Returns date groups:
 *   [{ dateKey, rows: [{ id, name, labourId, type, at, voiceNote,
 *                       attachment, status, color, report }] }]
 * Defensive like the Labour Updates feed's buildRows(): one malformed
 * record is skipped, never fatal (a throw here happens during render).
 */
function buildRows() {
  const reports = getDefectReports();
  const list = Array.isArray(reports) ? reports : [];
  return groupDefectReportsByDate(list).map((group) => ({
    dateKey: group.dateKey,
    rows: group.rows.map((report, index) => ({
      id: String(report.id ?? `def-${index}`),
      labourId: report.labourId ?? '',
      name: report.labourName || report.labourId || '',
      type: report.type ?? '',
      at: report.time ?? '',
      // mediaUrl() prefixes server-saved '/api/work-uploads/…' paths with
      // the app's base (data URLs pass through unchanged) — the inline
      // <audio controls> needs that to load the saved voice note.
      voiceNote: mediaUrl(report.voiceNote ?? null),
      attachment: report.attachment ?? null,
      status: report.status ?? 'new',
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
      report,
    })),
  }));
}

/* ### screen */
export default function SupervisorAlertsScreen({ onBack, onOpenReports }) {
  /* ### state */
  const { t } = useI18n();

  // The feed with each report joined on — LIVE via the sync bridge: a
  // defect report submitted in the labour's browser re-merges the groups
  // here without a refresh (no manual reload).
  const [groups, setGroups] = useState(buildRows);
  useStorageSync(() => setGroups(buildRows()), DB_KEY);

  // The active filter chip: 'all' or one of the report types.
  const [filter, setFilter] = useState('all');

  // Transient toast after a status change.
  const [toast, setToast] = useState(null);

  /* ### actions */
  // Acknowledge or resolve a report. The change persists in the SHARED
  // defectReports collection (data/db.js) and re-merges the groups, so the
  // card re-renders with the new status badge, the action button
  // disappears and the nav's badge count stays in sync.
  function act(row, status) {
    setDefectReportStatus(row.id, status);
    setGroups(buildRows());
    setToast(
      status === 'resolved'
        ? t('supAlertToastResolved')
        : t('supAlertToastAcknowledged'),
    );
  }

  /* ### render */
  const typeLabel = (type) =>
    type === TYPE_MACHINE
      ? t('supAlertTypeMachine')
      : type === TYPE_MATERIAL
        ? t('supAlertTypeMaterial')
        : t('supAlertTypeOutput');

  const typeIcon = (type) =>
    type === TYPE_MACHINE ? (
      <WrenchIcon size={12} aria-hidden="true" />
    ) : type === TYPE_MATERIAL ? (
      <PackageIcon size={12} aria-hidden="true" />
    ) : (
      <AlertTriangleIcon size={12} aria-hidden="true" />
    );

  const filters = [
    { id: 'all', label: t('supAlertFilterAll') },
    { id: TYPE_MACHINE, label: t('supAlertTypeMachine') },
    { id: TYPE_MATERIAL, label: t('supAlertTypeMaterial') },
    { id: TYPE_OUTPUT, label: t('supAlertTypeOutput') },
  ];

  // Live badge count for the nav's Alerts tab — every not-yet-resolved
  // report in the shared collection, so it follows acknowledge/resolve
  // immediately (and grows the moment a labour files a new report).
  const unresolvedCount = groups.reduce(
    (count, group) =>
      count + group.rows.filter((row) => row.status !== 'resolved').length,
    0,
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
        aria-label={t('supAlertBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supAlertBack')}</span>
      </button>

      <h1 className="screen__title">{t('supAlertTitle')}</h1>
      <p className="screen__subtitle">{t('supAlertSub')}</p>

      <main className="supal__body">
        {/* Filter chips — All / Machine / Material / Output. */}
        <div className="supal__filters" role="group" aria-label={t('supAlertTitle')}>
          {filters.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={
                'supal__chip' +
                (filter === chip.id ? ' supal__chip--active' : '')
              }
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          /* Empty state — no real submissions yet (no demo rows are shown). */
          <p className="supal__empty">{t('supAlertEmpty')}</p>
        ) : (
          groups.map((group) => (
            <section key={group.dateKey} className="supal__date-group">
              <h2 className="supal__date-heading">
                {formatDateHeading(group.dateKey)}
              </h2>
              <ul className="supal__list">
                {group.rows
                  .filter((row) => filter === 'all' || row.type === filter)
                  .map((row) => (
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
                        <span className={`supal__type supal__type--${row.type}`}>
                          {typeIcon(row.type)}
                          {typeLabel(row.type)}
                        </span>
                      </div>

                      {row.attachment ? (
                        /* Attachment metadata chip — the picked file is NOT
                           uploaded (images-only upload comes later), so this
                           stays a placeholder, not a preview. */
                        <div className="supal__media">
                          <span className="supal__thumb supal__thumb--photo">
                            <CameraIcon size={13} aria-hidden="true" />
                            {row.attachment.name || t('supAlertPhoto')}
                          </span>
                        </div>
                      ) : null}

                      <div className="supal__meta">
                        {row.voiceNote ? (
                          /* Inline audio player — the REAL voice note, saved
                             by the sync server into data/work-uploads/ and
                             served back at /api/work-uploads/<file>. */
                          <audio
                            className="supal__audio-player"
                            controls
                            preload="none"
                            src={row.voiceNote}
                          />
                        ) : (
                          /* Muted "no voice note" state. */
                          <span className="supal__audio supal__audio--none">
                            <MicIcon size={13} aria-hidden="true" />
                            <span>{t('supAlertNoAudio')}</span>
                          </span>
                        )}

                        <span
                          className={`supal__status supal__status--${row.status}`}
                        >
                          {row.status === 'resolved' ? (
                            <CheckCircleIcon size={12} aria-hidden="true" />
                          ) : row.status === 'acknowledged' ? (
                            <ClockIcon size={12} aria-hidden="true" />
                          ) : (
                            <AlertTriangleIcon size={12} aria-hidden="true" />
                          )}
                          {row.status === 'resolved'
                            ? t('supAlertResolved')
                            : row.status === 'acknowledged'
                              ? t('supAlertAcknowledged')
                              : t('supAlertNew')}
                        </span>
                      </div>

                      {row.status !== 'resolved' && (
                        <div className="supal__actions">
                          {row.status === 'new' ? (
                            <button
                              type="button"
                              className="supal__act supal__act--acknowledge"
                              onClick={() => act(row, 'acknowledged')}
                            >
                              <ClockIcon size={14} aria-hidden="true" />
                              <span>{t('supAlertAcknowledge')}</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="supal__act supal__act--resolve"
                            onClick={() => act(row, 'resolved')}
                          >
                            <CheckCircleIcon size={14} aria-hidden="true" />
                            <span>{t('supAlertResolve')}</span>
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

      {/* Bottom tab navigation — Alerts is active with a live badge count;
          Home returns to the dashboard, Reports opens the reports screen. */}
      <SupervisorBottomNav
        active="alerts"
        onHome={onBack}
        onReports={onOpenReports}
        alertsBadge={unresolvedCount}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
