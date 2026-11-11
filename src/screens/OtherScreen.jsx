/**
 * OtherScreen.jsx — "Other" (opened from the Home screen's "Other" tile).
 *
 * Four ActionCard tiles in a two-column grid — an icon badge plus a short
 * label each, one colour per option (the homepage tile palettes):
 *   - Apply for Half Day            → the voice recording screen (App.jsx
 *                                     'half-day'), whose submit saves the
 *                                     pending request (below)
 *   - Apply for Overtime            → the hours request screen (App.jsx
 *                                     'overtime'); the supervisor's
 *                                     decision syncs back here live, and
 *                                     the approved hours stretch the
 *                                     running shift (utils/shift.js)
 *   - Report Machine Maintenance    → the voice maintenance request
 *                                     screen (App.jsx
 *                                     'machine-maintenance'); its submit
 *                                     saves the take as a work update
 *                                     marked kind: 'maintenance'
 *                                     (storage.js)
 *   - Update Other Work Activities  → the voice update screen (App.jsx
 *                                     'work-activities'); its submit saves
 *                                     the take as a work update marked
 *                                     kind: 'activity' (storage.js)
 *
 * Both request tiles read the SHARED data layer (data/db.js) live via the
 * sync bridge: each tile shows its request's status — amber Pending, green
 * Approved (with a check) or coral Rejected — and is disabled while a
 * request is pending or approved (one request per labour per day; a
 * rejected one unlocks the tile for a fresh application). The supervisor
 * decides from the Requests inbox; the homepage's timer reacts to the
 * decision (half shift / stretched overtime) — no demo timers here.
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import ActionCard from '../components/ActionCard.jsx';
// import PrimaryButton from '../components/PrimaryButton.jsx';
import Toast from '../components/Toast.jsx';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  TimerIcon,
  WrenchIcon,
  XIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  DB_KEY,
  REQUEST_TYPES,
  findLatestRequest,
  getCurrentLabour,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';

export default function OtherScreen({
  onHome,
  onApplyHalfDay,
  onApplyOvertime,
  onReportMaintenance,
  onUpdateActivities,
}) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);

  // Today's half-day and overtime requests for THIS labour, from the
  // SHARED data layer (data/db.js) — the records the supervisor's inbox
  // decides on. Live: the sync bridge re-reads them the moment a decision
  // lands (no refresh). findLatestRequest keeps a Rejected decision
  // visible; the tiles only lock on pending/approved.
  const [halfDay, setHalfDay] = useState(() =>
    findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.HALF_DAY),
  );
  const [overtime, setOvertime] = useState(() =>
    findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.OVERTIME),
  );
  useStorageSync(() => {
    setHalfDay(
      findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.HALF_DAY),
    );
    setOvertime(
      findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.OVERTIME),
    );
  }, DB_KEY);
  const halfDayStatus =
    halfDay?.status === 'approved'
      ? 'approved'
      : halfDay?.status === 'pending'
        ? 'pending'
        : halfDay?.status === 'rejected'
          ? 'rejected'
          : 'idle';
  const overtimeStatus =
    overtime?.status === 'approved'
      ? 'approved'
      : overtime?.status === 'pending'
        ? 'pending'
        : overtime?.status === 'rejected'
          ? 'rejected'
          : 'idle';

  /* ---- tile configuration ------------------------------------------------
     The request tiles recolour with their state — blue/amber while idle,
     green once approved — and carry a small status pill (amber while
     pending, green with a check once approved, coral when rejected). The
     other two keep their own colours. */
  const halfDayNote =
    halfDayStatus === 'pending' ? (
      <span className="other__badge other__badge--pending">
        {t('halfDayPending')}
      </span>
    ) : halfDayStatus === 'approved' ? (
      <span className="other__badge other__badge--approved">
        <CheckCircleIcon size={14} />
        {t('halfDayApproved')}
      </span>
    ) : halfDayStatus === 'rejected' ? (
      <span className="other__badge other__badge--rejected">
        <XIcon size={14} />
        {t('halfDayRejected')}
      </span>
    ) : null;

  const overtimeNote =
    overtimeStatus === 'pending' ? (
      <span className="other__badge other__badge--pending">
        {t('overtimePending')}
      </span>
    ) : overtimeStatus === 'approved' ? (
      <span className="other__badge other__badge--approved">
        <CheckCircleIcon size={14} />
        {t('overtimeApproved')}
      </span>
    ) : overtimeStatus === 'rejected' ? (
      <span className="other__badge other__badge--rejected">
        <XIcon size={14} />
        {t('overtimeRejected')}
      </span>
    ) : null;

  return (
    <div className="home detail">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="detail__main">
        <button
          type="button"
          className="back-button detail__back"
          aria-label={t('continueToHome')}
          onClick={onHome}
        >
          <ArrowLeftIcon size={20} />
        </button>

        {/* other__body: scoped positioning — see screens.css (.other__body). */}
        <div className="detail__body other__body">
          <h1 className="screen__title">{t('otherTitle')}</h1>
          <p className="screen__subtitle">{t('otherSub')}</p>

          <div className="home__grid">
            <ActionCard
              color={halfDayStatus === 'approved' ? 'green' : 'blue'}
              icon={<ClockIcon size={40} />}
              label={t('otherHalfDay')}
              /* Locked while a request is pending or approved (one per
                 labour per day); a rejected one unlocks a fresh try. */
              disabled={halfDayStatus === 'pending' || halfDayStatus === 'approved'}
              note={halfDayNote}
              /* Opens the voice recording screen; its submit files the
                 request in the shared data layer for the supervisor. */
              onClick={onApplyHalfDay}
            />
            <ActionCard
              color={overtimeStatus === 'approved' ? 'green' : 'amber'}
              icon={<TimerIcon size={40} />}
              label={t('otherOvertime')}
              /* Same lock/unlock rule as the half-day tile. */
              disabled={
                overtimeStatus === 'pending' || overtimeStatus === 'approved'
              }
              note={overtimeNote}
              /* Opens the hours request screen; its submit files the
                 request in the shared data layer for the supervisor. */
              onClick={onApplyOvertime}
            />
            <ActionCard
              color="coral"
              icon={<WrenchIcon size={40} />}
              label={t('otherMaintenance')}
              /* Opens the voice maintenance request screen; it saves the
                 take as a work update (kind: 'maintenance') and returns
                 here. */
              onClick={onReportMaintenance}
            />
            <ActionCard
              color="purple"
              icon={<ClipboardIcon size={40} />}
              label={t('otherActivities')}
              /* Opens the voice update screen; it saves the take as a
                 work update (kind: 'activity') and returns here. */
              onClick={onUpdateActivities}
            />
          </div>

          
        </div>
      </div>

      <Toast
        message={toast}
        icon={<CheckCircleIcon size={18} />}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
