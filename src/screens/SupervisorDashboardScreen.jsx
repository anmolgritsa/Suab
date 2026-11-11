/**
 * SupervisorDashboardScreen.jsx — the Supervisor's dashboard (mockup:
 * "Suab / Supervisor" — timer pill, 2×2 action cards, emergency banner,
 * bottom tab navigation).
 *
 * Reached only when the login's Employee ID is the supervisor's (9977 —
 * see getRoleForEmployeeId in utils/validation.js). Every other valid ID
 * keeps using the existing labour workflow untouched.
 *
 * Layout, top to bottom (reuses the labour homepage's shell classes):
 *   1. top bar      SUAB company logo + language dropdown
 *   2. greeting     "Supervisor Dashboard" title + the signed-in ID chip
 *   3. shift timer  read-only pill — shown only while a labour shift is
 *                   actually running (the labour flow owns the shift state;
 *                   the dashboard never writes it)
 *   4. action cards Assign Machine · Labour Updates (2 columns)
 *                   Attendance · Requests (2 columns) — Attendance and
 *                   Requests carry live status notes read from today's
 *                   demo records (utils/storage.js)
 *   5. SOS          red emergency banner (the shared SosButton)
 *   6. bottom nav   Home · Reports · Alerts · Settings — Home is active
 *                   (the shared SupervisorBottomNav component)
 *   7. logout       small link under the cards → ends the session
 *
 * Props:
 *  - employeeId          the ID used at login (shown on the dashboard)
 *  - onLogout()          end the session (App.jsx clears it and shows the lock)
 *  - onOpenAssignMachine()  open the "Assign Machine" screen (App.jsx
 *                        routes to 'supervisor-assign')
 *  - onOpenLabourUpdates()  open the "Labour Updates" screen (App.jsx
 *                        routes to 'supervisor-updates')
 *  - onOpenAttendance()     open the "Attendance" screen (App.jsx routes
 *                        to 'supervisor-attendance')
 *  - onOpenRequests()       open the "Requests" screen (App.jsx routes
 *                        to 'supervisor-requests')
 *  - onOpenReports()        open the "Reports" screen (App.jsx routes
 *                        to 'supervisor-reports')
 *  - onOpenAlerts()         open the "Emergency Alerts" screen (App.jsx
 *                        routes to 'supervisor-alerts')
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import ActionCard from '../components/ActionCard.jsx';
import ShiftTimer from '../components/ShiftTimer.jsx';
import SosButton from '../components/SosButton.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import { useSosAlarm } from '../hooks/useSosAlarm.js';
import Toast from '../components/Toast.jsx';
import { useI18n } from '../i18n.jsx';
import { getSupervisorRequests, REQUEST_STATUSES } from '../data/requests.js';
import {
  getShiftAlertsShown,
  getShiftStart,
  getShiftType,
} from '../utils/storage.js';
import {
  DB_KEY,
  REQUEST_STATUSES as DB_REQUEST_STATUSES,
  REQUEST_TYPES as DB_REQUEST_TYPES,
  getAttendanceForDate,
  getRequests,
  removeHomeSosAlert,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import { todayKey } from '../utils/storage.js';
import { shiftDurationMs } from '../utils/shift.js';
import {
  BadgeIcon,
  ClipboardIcon,
  FactoryIcon,
  UserIcon,
  AlertTriangleIcon,
  XIcon,
} from '../components/icons.jsx';

export default function SupervisorDashboardScreen({
  employeeId,
  onLogout,
  onOpenAssignMachine,
  onOpenLabourUpdates,
  onOpenAttendance,
  onOpenRequests,
  onOpenReports,
  onOpenAlerts,
  onOpenSos,
}) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);

  /* ### sos-alarm */
  // The live SOS alarm: when a labour raises an SOS in another browser, the
  // record lands in the shared sosAlerts collection (~1 s, sync bridge) and
  // this dashboard starts BLINKING (red pulsing overlay) and beeping for
  // exactly 4 seconds — then both stop by themselves. Tapping the overlay
  // opens the SOS Alerts screen (App.jsx routes 'supervisor-sos').
  //
  // The HOME SLOT is separate and persistent: homeAlert is the SOS currently
  // holding the Home page's card (the newest of the day's first three that
  // has not been replaced/removed). It stays until the supervisor removes
  // it (Remove → confirm below) or the day ends — it never auto-clears.
  const { alarmActive, alarmAlert, homeAlert } = useSosAlarm();
  // Remove confirmation: the alert id pending the supervisor's confirm.
  const [removingSos, setRemovingSos] = useState(null);

  // Confirmed removal — clears the Home slot only; the alert keeps its
  // place in the Alerts feed. The write syncs to every browser.
  function confirmRemoveSos() {
    if (removingSos) removeHomeSosAlert(removingSos.id);
    setRemovingSos(null);
    setToast(t('sosHomeRemovedToast'));
  }

  /* ### overview-data */
  // Today's attendance records from the shared data layer (one entry per
  // labour who has checked in today). Kept live with useStorageSync so the
  // Attendance card follows check-ins from other tabs with no refresh.
  const [attendance, setAttendance] = useState(() => getAttendanceForDate(todayKey()));
  useStorageSync(() => setAttendance(getAttendanceForDate(todayKey())), DB_KEY);

  // The live inbox: the SHARED requests collection (labour submissions and
  // decisions, live via the sync bridge) plus the seeded demo requests.
  const [liveRequests, setLiveRequests] = useState(getRequests);
  useStorageSync(() => setLiveRequests(getRequests()), DB_KEY);
  const [demoRequests] = useState(getSupervisorRequests);

  // Requests still waiting on the supervisor's decision — the live count
  // shown as the Requests card's status note. Counts the shared collection
  // (data/db.js) AND the demo inbox (data/requests.js), the same records
  // the Requests screen shows.
  const pendingCount =
    liveRequests.filter(
      (request) => request.status === DB_REQUEST_STATUSES.PENDING,
    ).length +
    demoRequests.filter((request) => request.status === REQUEST_STATUSES.PENDING)
      .length;

  // The running shift's clock, read-only: the labour flow owns the shift
  // state, so the dashboard only DISPLAYS the timer while a shift is
  // actually running and never starts, alerts or ends one (no-op handlers).
  // The half-day/overtime effects are derived from the SHARED requests
  // collection (scoped to the running shift), so a decision made in
  // another browser shows up here live — no refresh.
  const [shiftStart] = useState(getShiftStart);
  const shiftStartTs = shiftStart ? new Date(shiftStart).getTime() : 0;
  const shiftHalfApproved = liveRequests.some(
    (request) =>
      request.type === DB_REQUEST_TYPES.HALF_DAY &&
      request.status === DB_REQUEST_STATUSES.APPROVED &&
      new Date(request.requestedAt).getTime() >= shiftStartTs,
  );
  const shiftType = shiftHalfApproved ? 'half' : getShiftType();
  const approvedOvertime = liveRequests.find(
    (request) =>
      request.type === DB_REQUEST_TYPES.OVERTIME &&
      request.status === DB_REQUEST_STATUSES.APPROVED &&
      new Date(request.requestedAt).getTime() >= shiftStartTs,
  );
  const approvedHours = Number(approvedOvertime?.hours);
  const overtimeHours =
    Number.isFinite(approvedHours) && approvedHours > 0
      ? Math.floor(approvedHours)
      : 0;
  const alertsShown = getShiftAlertsShown();
  const noop = () => {};

  /* ### render */
  // Replace {placeholders} in a translated string: fill('Hi {id}', { id: 1 })
  function fill(text, vars) {
    return Object.entries(vars).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
      text,
    );
  }

  return (
    <div className="home sup">
      {/* SOS alarm overlay — blinks (red pulse) for 4 s when an SOS arrives,
          then disappears by itself. Tap → the SOS Alerts screen. */}
      {alarmActive && alarmAlert && (
        <button
          type="button"
          className="sos-overlay"
          onClick={() => onOpenSos?.()}
        >
          <span className="sos-overlay__icon" aria-hidden="true">
            <AlertTriangleIcon size={34} />
          </span>
          <span className="sos-overlay__title">{t('sosOverlayTitle')}</span>
          <span className="sos-overlay__who">
            {alarmAlert.labourName || alarmAlert.labourId}
            {alarmAlert.labourId ? ` · ${alarmAlert.labourId}` : ''}
            {alarmAlert.machineNumber
              ? ` · ${t('sosScreenMachine')} ${alarmAlert.machineNumber}`
              : ''}
          </span>
          <span className="sos-overlay__hint">{t('sosOverlayTap')}</span>
        </button>
      )}

      {/* Persistent Home SOS card — the alert currently holding the Home
          slot (the day's newest un-replaced, un-removed claimant). It does
          NOT disappear by itself: only Remove (with confirmation) or the
          end of the day clears it. Remove → the confirm dialog below. */}
      {homeAlert && !alarmActive && (
        <div className="sos-home-card" role="status">
          <span className="sos-home-card__icon" aria-hidden="true">
            <AlertTriangleIcon size={18} />
          </span>
          <span className="sos-home-card__body">
            <span className="sos-home-card__name">
              {homeAlert.labourName || homeAlert.labourId}
              {homeAlert.labourId ? ` · ${homeAlert.labourId}` : ''}
            </span>
            <span className="sos-home-card__meta">
              {homeAlert.machineNumber
                ? `${t('sosScreenMachine')} ${homeAlert.machineNumber}`
                : ''}
              {homeAlert.time ? ` · ${homeAlert.time}` : ''}
            </span>
          </span>
          <button
            type="button"
            className="sos-home-card__remove"
            aria-label={t('sosHomeRemove')}
            onClick={() => setRemovingSos(homeAlert)}
          >
            <XIcon size={14} aria-hidden="true" />
            <span>{t('sosHomeRemove')}</span>
          </button>
        </div>
      )}

      {/* Remove confirmation — a stray tap must not clear a live emergency.
          Removing clears the HOME slot only; the alert stays in the Alerts
          feed with its full details and timestamps. */}
      {removingSos && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setRemovingSos(null)}
        >
          <div
            className="sos-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('sosHomeRemoveTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal__close"
              aria-label={t('close')}
              onClick={() => setRemovingSos(null)}
            >
              <XIcon size={18} />
            </button>

            <span className="sos-dialog__icon" aria-hidden="true">
              <AlertTriangleIcon size={30} />
            </span>
            <h2 className="modal__title">{t('sosHomeRemoveTitle')}</h2>
            <p className="modal__subtitle">
              {removingSos.labourName || removingSos.labourId}
              {removingSos.labourId ? ` · ${removingSos.labourId}` : ''}
              {removingSos.machineNumber
                ? ` · ${t('sosScreenMachine')} ${removingSos.machineNumber}`
                : ''}
            </p>
            <p className="modal__subtitle">{t('sosHomeRemoveBody')}</p>

            <div className="sos-dialog__actions">
              <button
                type="button"
                className="sos-dialog__cancel"
                onClick={() => setRemovingSos(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="sos-dialog__send"
                onClick={confirmRemoveSos}
              >
                {t('sosHomeRemoveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <h1 className="screen__title">{t('supTitle')}</h1>
      <p className="login__who">{fill(t('supSignedInAs'), { id: employeeId })}</p>

      {/* Read-only shift clock — only while a labour shift is running. */}
      {shiftStart && (
        <ShiftTimer
          startedAt={shiftStart}
          durationMs={shiftDurationMs(shiftType, overtimeHours)}
          alertsShown={alertsShown}
          onAlert={noop}
          onComplete={noop}
        />
      )}

      <main className="home__grid">
        <ActionCard
          color="blue"
          icon={<FactoryIcon size={40} />}
          label={t('supAssignMachine')}
          onClick={() => onOpenAssignMachine?.()}
        />
        <ActionCard
          color="green"
          icon={<UserIcon size={40} />}
          label={t('supLabourUpdates')}
          onClick={() => onOpenLabourUpdates?.()}
        />
        <ActionCard
          color="purple"
          icon={<BadgeIcon size={40} />}
          label={t('supAttendance')}
          note={attendance.length > 0 ? t('supCheckedIn') : t('supNotCheckedIn')}
          onClick={() => onOpenAttendance?.()}
        />
        <ActionCard
          color="amber"
          icon={<ClipboardIcon size={40} />}
          label={t('supRequests')}
          note={
            pendingCount > 0
              ? fill(t('supPendingCount'), { n: pendingCount })
              : t('supPendingNone')
          }
          onClick={() => onOpenRequests?.()}
        />
      </main>

      <div className="home__sos">
        <SosButton onNotify={setToast} />
      </div>

      <footer className="home__footer">
        <button type="button" className="link-button" onClick={onLogout}>
          {t('supLogout')}
        </button>
      </footer>

      {/* Bottom tab navigation — pinned to the bottom of the screen. */}
      <SupervisorBottomNav
        active="home"
        onReports={onOpenReports}
        onAlerts={onOpenAlerts}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
