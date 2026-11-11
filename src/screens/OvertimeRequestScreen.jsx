/**
 * OvertimeRequestScreen.jsx — "Apply for Overtime" (hours request).
 *
 * Opened from the Other screen's overtime tile (App.jsx routes the
 * 'overtime' screen key here). A minimal form: the worker picks how many
 * extra hours they need with one-tap quick-pick chips (1 / 2 / 4 hrs) or
 * the big − / + steppers — no keyboard — then submits.
 *
 * Supervisor approval flow (the real one — no demo timer):
 *   1. Submit → files a PENDING overtime request in the SHARED data layer
 *      (data/db.js — addRequest): labour id + name, date, time, the chosen
 *      hours, status 'pending'. One pending/approved overtime request per
 *      labour per day — a repeat submission is refused with an "already
 *      applied" message. The amber pending pill shows immediately.
 *   2. The supervisor's Requests inbox lists the record and decides —
 *      Approved (green check pill) or Rejected (coral pill, and the form
 *      unlocks for a fresh application). The decision syncs back here
 *      live via the app's sync bridge — no refresh.
 *
 * The approval does not change the shift's TYPE (only a half-day does
 * that) — but the approved hours DO stretch the running shift: the
 * homepage adds them to the timer's length via getApprovedOvertimeHours()
 * (storage.js) and utils/shift.js (demo: one minute per approved hour),
 * shows the green OVERTIME ACTIVE badge under the timer and toasts
 * "Overtime Started" / "Overtime Completed" as the approved window runs.
 */

import { useCallback, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Toast from '../components/Toast.jsx';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  TimerIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  DB_KEY,
  REQUEST_TYPES,
  addRequest,
  findLatestRequest,
  getCurrentLabour,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';

/* ---- constants ---- */

/** Stepper bounds — overtime is requested in whole hours, 1 to 8. */
const MIN_HOURS = 1;
const MAX_HOURS = 8;
const DEFAULT_HOURS = 2;

/** One-tap quick picks — the common requests (also the demo's sweet spot:
    each approved hour adds one demo minute to the shift). */
const QUICK_HOURS = [1, 2, 4];

export default function OvertimeRequestScreen({ onBack }) {
  const { t } = useI18n();

  /* ---- state & refs ---- */

  const [toast, setToast] = useState(null);

  // Today's overtime request for THIS labour, from the SHARED data layer
  // (data/db.js) — the record the supervisor's inbox decides on. Live: the
  // sync bridge re-reads it the moment a decision lands (no refresh).
  const [request, setRequest] = useState(() =>
    findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.OVERTIME),
  );
  useStorageSync(
    () =>
      setRequest(
        findLatestRequest(getCurrentLabour().id, REQUEST_TYPES.OVERTIME),
      ),
    DB_KEY,
  );
  const status =
    request?.status === 'approved'
      ? 'approved'
      : request?.status === 'pending'
        ? 'pending'
        : request?.status === 'rejected'
          ? 'rejected'
          : 'idle';

  // The chosen hours (stepper value; frozen into the record on submit).
  const [hours, setHours] = useState(DEFAULT_HOURS);

  /* ---- stepper & submit ---- */

  /** Step the chosen hours, clamped to the 1–8 range. */
  const stepHours = useCallback((delta) => {
    setHours((current) =>
      Math.max(MIN_HOURS, Math.min(MAX_HOURS, current + delta)),
    );
  }, []);

  /** Submit → file the request in the SHARED data layer (data/db.js):
      labour id + name, date, time, type 'overtime' and the chosen hours,
      status 'pending'. One pending/approved overtime request per labour
      per day — a repeat submission returns the existing record and pops
      the "already applied" message instead. The supervisor decides from
      the Requests inbox; the decision syncs back here live. */
  const handleSubmit = useCallback(() => {
    if (status !== 'idle') return;
    const labour = getCurrentLabour();
    const result = addRequest({
      labourId: labour.id,
      labourName: labour.name,
      type: REQUEST_TYPES.OVERTIME,
      hours,
    });
    if (result?.record) setRequest(result.record);
    setToast(t(result?.created === true ? 'overtimeSent' : 'overtimeDuplicate'));
  }, [hours, status, t]);

  /* ---- render ----
     Same shell as the other detail screens: topbar (logo + language),
     round back button, centred body. The stepper card is the hero; the
     status pill slot and the submit button follow underneath. */
  const locked = status === 'pending' || status === 'approved'; // rejected → re-apply

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
          aria-label={t('backToOther')}
          onClick={onBack}
        >
          <ArrowLeftIcon size={20} />
        </button>

        {/* overtime__body: scoped positioning — see screens.css (.overtime__body). */}
        <div className="detail__body overtime__body">
          <h1 className="screen__title">{t('otherOvertime')}</h1>
          <p className="screen__subtitle">{t('overtimeSub')}</p>

          {/* Hours stepper — large − / + targets around the chosen value. */}
          <div className="overtime__field">
            <div className="overtime__head">
              <span className="overtime__icon" aria-hidden="true">
                <TimerIcon size={16} />
              </span>
              <span className="overtime__label">{t('overtimeHoursLabel')}</span>
            </div>

            {/* Quick picks — one tap for the common requests; the active
                chip highlights and stays in sync with the steppers. */}
            <div className="overtime__chips" role="group" aria-label={t('overtimeHoursLabel')}>
              {QUICK_HOURS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`overtime__chip${hours === n ? ' overtime__chip--on' : ''}`}
                  onClick={() => setHours(n)}
                  disabled={locked}
                >
                  {n}
                  <span className="overtime__chip-unit">{t('overtimeHoursUnit')}</span>
                </button>
              ))}
            </div>

            <div className="overtime__box">
              <button
                type="button"
                className="overtime__step"
                onClick={() => stepHours(-1)}
                disabled={hours <= MIN_HOURS || locked}
                aria-label="-1"
              >
                −
              </button>
              <div className="overtime__value">
                {hours}
                <span className="overtime__unit">{t('overtimeHoursUnit')}</span>
              </div>
              <button
                type="button"
                className="overtime__step"
                onClick={() => stepHours(1)}
                disabled={hours >= MAX_HOURS || locked}
                aria-label="+1"
              >
                +
              </button>
            </div>
          </div>

          {/* Status slot — reserved height, so the submit never jumps. */}
          <p className="overtime__status">
            {status === 'pending' && (
              <span className="overtime__badge overtime__badge--pending">
                {t('overtimePending')}
              </span>
            )}
            {status === 'approved' && (
              <span className="overtime__badge overtime__badge--approved">
                <CheckCircleIcon size={14} />
                {t('overtimeApproved')}
              </span>
            )}
            {status === 'rejected' && (
              <span className="overtime__badge overtime__badge--rejected">
                {t('overtimeRejected')}
              </span>
            )}
          </p>

          <button
            type="button"
            className="btn-primary overtime__submit"
            onClick={handleSubmit}
            disabled={locked}
          >
            <CheckCircleIcon size={20} />
            <span>{t('overtimeSubmit')}</span>
          </button>
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
