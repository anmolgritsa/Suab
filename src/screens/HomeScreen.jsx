/**
 * HomeScreen.jsx — the Labour Homepage (mockups 6.1 / 6.2, Part 3).
 *
 * Layout, top to bottom:
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    small ← pill ("Back to Machine Allotment") — reopens
 *                   the Machine Allotment screen to review the machine
 *                   details again
 *   3. shift timer  pale-blue pill counting up from the shift start
 *   4. action cards Raw Material Issue · Machine Breakdown (2 columns)
 *                   Output Defect · Other (2 columns)
 *   5. SOS          red emergency button pinned near the bottom
 *
 * Behaviour (demo timings — see utils/shift.js):
 *   - The shift starts the first time the homepage is opened and is
 *     persisted, so a refresh keeps counting from the same moment.
 *   - At 2 minutes a "Work update needed" alert pops up (mockup 6.2).
 *   - At 4 minutes a second alert pops (only if the worker kept working).
 *   - An APPROVED half-day request (the supervisor decides from the
 *     Requests inbox; the decision syncs here live via the app's sync
 *     bridge) toasts the approval, shortens the running timer to the
 *     half-shift length, and 3 minutes AFTER the approval the green
 *     "Half-Day End Shift" button appears (it stays until the shift
 *     ends). Tapping it ends the shift immediately → Product Submission;
 *     the shift also ends automatically at its length (5 min full /
 *     3 min half) → Product Submission.
 *
 *   - An APPROVED overtime request (same live sync) stretches the
 *     shift the other way: each approved hour adds one demo minute to the
 *     timer's length (utils/shift.js), so a 4-hour approval ends the shift
 *     at 9 minutes instead of 5. The homepage announces the approval with
 *     an "Overtime Started" toast (once — persisted in the record) and an
 *     "Overtime Completed" toast when the approved window ends, but the
 *     overtime INDICATOR itself — the orange OVERTIME SHIFT badge with the
 *     clock-plus icon — appears ONLY once the REGULAR shift duration has
 *     elapsed (isRegularShiftComplete, which ignores the extension): no
 *     overtime badge shows while the regular shift is still running.
 *
 * Props:
 *  - allottedMachine      today's confirmed machine allotment record
 *                         ({ machineId, machineName, … }) — shown in the
 *                         banner under the shift timer
 *  - onShiftEnd()        shift reached its full length → product submission
 *  - onOpenScreen(key)   open a screen: 'input-errors' |
 *                        'machine-defect' | 'output-errors' | 'other' |
 *                        'machine-allotment' (the back chip)
 *  - onResetDemo()       wipe all demo data (small link at the very bottom)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import ShiftTimer from '../components/ShiftTimer.jsx';
import ActionCard from '../components/ActionCard.jsx';
import SosButton from '../components/SosButton.jsx';
import WorkUpdateReminder from '../components/WorkUpdateReminder.jsx';
import Toast from '../components/Toast.jsx';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockPlusIcon,
  CogIcon,
  DotsIcon,
  PackageIcon,
  WrenchIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  clearShiftAlertsShown,
  clearShiftStart,
  clearShiftType,
  getSession,
  getShiftAlertsShown,
  getShiftStart,
  getShiftType,
  saveShiftAlertsShown,
  saveShiftStart,
  saveShiftType,
  saveWorkUpdate,
  todayKey,
} from '../utils/storage.js';
import {
  DB_KEY,
  REQUEST_TYPES,
  findActiveRequest,
  getCurrentLabour,
  patchRequest,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  getEmployeeAssignment,
  PRIORITY_OPTIONS,
} from '../data/assignments.js';
import { playUpdateChime } from '../utils/sound.js';
import { overtimeExtensionMs, isRegularShiftComplete, shiftDurationMs } from '../utils/shift.js';

/** How long after a half-day approval the "Half-Day End Shift" button
    appears (the worker gets a confirmation window before it shows up). */
const HALF_DAY_BUTTON_DELAY_MS = 3 * 60 * 1000;

export default function HomeScreen({  onShiftEnd, onOpenScreen, onResetDemo }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  // The supervisor's assignment for THIS worker (data/assignments.js —
  // written by the supervisor's "Assign Machine" screen). Read once per
  // mount: screens remount on navigation, so the read is always current.
  // Purely additive — the labour flow below is untouched.
  const assignedJob = getEmployeeAssignment(getSession()?.employeeId);

  // How many of this shift's alerts have already popped (persisted, so a
  // refresh never repeats one).
  const [alertsShown, setAlertsShown] = useState(getShiftAlertsShown);

  /* ---- shift lifecycle ----------------------------------------------------
     The first visit starts the shift; later visits (and refreshes) reuse
     the persisted start time. The write happens inside the lazy
     initialiser so it runs exactly once per mount (StrictMode's double
     invoke is safe: the second call reads the time the first one saved). */
  const [startedAt] = useState(() => {
    const existing = getShiftStart();
    if (existing) return existing;
    const now = new Date().toISOString();
    saveShiftStart(now);
    return now;
  });

  // Full or half shift — an APPROVED half-day request makes the same
  // single timer end the shift at the half-shift length instead. The
  // persisted type is the fallback; the live approval below (shared data
  // layer) overrides it the moment the supervisor decides.
  const [storedShiftType] = useState(getShiftType);

  // This shift's overtime request, from the SHARED data layer (data/db.js)
  // — the record the supervisor's inbox decides on. Shift-scoped
  // (requestedAt >= startedAt), so a PREVIOUS shift's approval never
  // leaks into this one.
  const [overtimeRequest, setOvertimeRequest] = useState(() =>
    findActiveRequest(
      getCurrentLabour().id,
      REQUEST_TYPES.OVERTIME,
      todayKey(),
      startedAt,
    ),
  );

  // Approved overtime in whole hours (0 while pending/absent). It
  // stretches the shift the other way: utils/shift.js adds one demo
  // minute per approved hour to the timer's length, so the ShiftTimer's
  // end simply moves out when an approval lands.
  const approvedHours = Number(overtimeRequest?.hours);
  const overtimeHours =
    overtimeRequest?.status === 'approved' &&
    Number.isFinite(approvedHours) &&
    approvedHours > 0
      ? Math.floor(approvedHours)
      : 0;
  // The worker's half-day request for THIS shift, from the SHARED data
  // layer — live via the sync bridge, so the supervisor's decision lands
  // here without a refresh. Shift-scoped like the overtime read above.
  const [halfDayRequest, setHalfDayRequest] = useState(() =>
    findActiveRequest(
      getCurrentLabour().id,
      REQUEST_TYPES.HALF_DAY,
      todayKey(),
      startedAt,
    ),
  );

  // The timer's shift type: an approved half-day request for THIS shift
  // wins (the supervisor's decision shortens the running timer live);
  // otherwise the persisted type. Declared BEFORE overtimeShiftStarted,
  // which reads it — with an approved overtime request that expression
  // evaluates isRegularShiftComplete(startedAt, shiftType), and reading
  // a const before its initialiser would be a TDZ ReferenceError.
  const shiftType =
    halfDayRequest?.status === 'approved' ? 'half' : storedShiftType;

  // The OVERTIME SHIFT begins the moment the REGULAR shift duration has
  // elapsed (full or half — WITHOUT the approved overtime extension). The
  // approved hours stretch the same single timer (shiftDurationMs above),
  // so the overtime portion is simply the tail of that one timer. While
  // an approved request exists the overtime effect below ticks every
  // second, so this flips over live as the regular duration runs out.
  const overtimeShiftStarted =
    overtimeRequest?.status === 'approved' &&
    overtimeHours > 0 &&
    Boolean(startedAt) &&
    isRegularShiftComplete(startedAt, shiftType);

  // A once-a-second re-render tick, running only while a request is
  // approved (see the overtime effect below). Its value is never rendered —
  // each tick simply gives the JSX below a fresh chance to re-evaluate
  // overtimeShiftStarted, so the orange badge flips on the second the
  // REGULAR duration elapses, and the "Overtime Completed" moment fires.
  const [, setOvertimeTick] = useState(0);

  // Has the "Overtime Completed" toast already been handled for this
  // mount? Seeded on the effect's first pass: a window that had already
  // ended before the homepage mounted stays silent.
  const overtimeCompletedRef = useRef(null);


  // Live resync: both requests re-read whenever the shared document
  // changes (another tab, another browser via the sync bridge, or this
  // tab's own writes) — no manual refresh, no polling.
  useStorageSync(() => {
    setHalfDayRequest(
      findActiveRequest(
        getCurrentLabour().id,
        REQUEST_TYPES.HALF_DAY,
        todayKey(),
        startedAt,
      ),
    );
    setOvertimeRequest(
      findActiveRequest(
        getCurrentLabour().id,
        REQUEST_TYPES.OVERTIME,
        todayKey(),
        startedAt,
      ),
    );
  }, DB_KEY);

  // Whether the Half-Day End Shift button may render — true only once the
  // request is approved AND 3 minutes have passed since the approval
  // (HALF_DAY_BUTTON_DELAY_MS). Stays true until the shift ends.
  const [halfDayButtonReady, setHalfDayButtonReady] = useState(false);

  /* ---- half-day approval → toast + delayed End Shift button ---------------
     The supervisor approves from the Requests inbox; the decision arrives
     here live (the sync resync above swaps in the approved record). When
     this screen sees an approved request it makes the shift a HALF shift
     (the same single timer then ends at the half-shift length), toasts
     the approval once and schedules the button 3 minutes after the
     approval stamp — so a Home visit mid-wait resumes the same wait, and
     a request approved long ago shows the button immediately. */
  useEffect(() => {
    const status = halfDayRequest?.status;
    if (status === 'approved') {
      // The shift becomes a half shift — persisted so the rest of the app
      // (e.g. the supervisor dashboard's fallback read) agrees.
      saveShiftType('half');
      const approvedAtMs = halfDayRequest.approvedAt
        ? new Date(halfDayRequest.approvedAt).getTime()
        : Date.now(); // record written before approvedAt existed
      const remaining = Math.max(
        0,
        approvedAtMs + HALF_DAY_BUTTON_DELAY_MS - Date.now(),
      );
      // The approval toast is scheduled (0 ms) rather than set
      // synchronously in the effect body — same immediate behaviour,
      // without the cascading render that
      // react-hooks/set-state-in-effect warns about.
      const toastTimer = setTimeout(() => setToast(t('halfDayApproved')), 0);
      const timer = setTimeout(() => setHalfDayButtonReady(true), remaining);
      return () => {
        clearTimeout(toastTimer);
        clearTimeout(timer);
      };
    }
    // Pending: nothing to schedule — the sync resync swaps in the decided
    // record the moment the supervisor acts (no polling, no refresh).
    return undefined;
  }, [halfDayRequest, t]);

  /* ---- overtime approval → Started toast + ACTIVE badge + Completed toast
     The supervisor approves from the Requests inbox; the decision arrives
     here live (the sync resync above swaps in the approved record). When
     this screen sees an approved request it:
       1. toasts "Overtime Started" ONCE — the startedNotified flag is
          patched into the SHARED record (data/db.js), so later Home
          visits, refreshes and other browsers never repeat it;
       2. ticks once per second while the approved window runs (until
          approvedAt + the extension — overtimeExtensionMs: one demo
          minute per approved hour), re-rendering the screen so the
          orange OVERTIME SHIFT badge appears the moment the REGULAR
          duration elapses — no overtime badge shows before that;
       3. toasts "Overtime Completed" once when that window ends live (a
          window that had already ended before this mount stays silent —
          overtimeCompletedRef seeds from the current time). */
  useEffect(() => {
    const status = overtimeRequest?.status;
    if (status !== 'approved' || !overtimeRequest.approvedAt) return undefined;

    const hours = (() => {
      const n = Number(overtimeRequest.hours);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    })();
    if (hours <= 0) return undefined; // corrupt/empty record — nothing to show
    const windowEndMs =
      new Date(overtimeRequest.approvedAt).getTime() +
      overtimeExtensionMs(hours);

    // First pass for this mount: had the window already ended? Then the
    // completion must not be announced again.
    if (overtimeCompletedRef.current === null) {
      overtimeCompletedRef.current = Date.now() >= windowEndMs;
    }

    const timers = [];
    if (!overtimeRequest.startedNotified) {
      // Scheduled (0 ms) rather than set synchronously — same immediate
      // behaviour, without the cascading render that
      // react-hooks/set-state-in-effect warns about.
      timers.push(
        setTimeout(() => {
          // Patch the SHARED record (one-shot flag write) and adopt the
          // merged result locally.
          const announced = patchRequest(overtimeRequest.id, {
            startedNotified: true,
          });
          if (announced) setOvertimeRequest(announced);
          setToast(t('overtimeStarted'));
        }, 0),
      );
    }

    // One tick per second re-renders the screen (so the orange badge
    // flips the moment the REGULAR duration elapses) and drives the
    // completion moment.
    const tickId = setInterval(() => {
      const now = Date.now();
      setOvertimeTick((n) => n + 1);
      if (now >= windowEndMs) {
        if (overtimeCompletedRef.current !== true) {
          overtimeCompletedRef.current = true;
          setToast(t('overtimeCompleted'));
        }
        clearInterval(tickId); // window over — stop ticking
      }
    }, 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tickId);
    };
  }, [overtimeRequest, t]);

  /* ---- work-update alerts (2 min and 4 min) -------------------------------
     ShiftTimer — the homepage's single clock — calls this once per
     reached milestone. We persist the new count (no repeats after a
     refresh) and pop the existing "Work update needed" modal. The guard
     keeps a catch-up milestone from firing after the 5-minute auto-end
     cleared the shift in the same tick. */
  const handleAlert = useCallback((index) => {
    if (!getShiftStart()) return; // shift already over — no alert
    const shown = index + 1;
    saveShiftAlertsShown(shown);
    setAlertsShown(shown);
    setReminderOpen(true);
  }, []);

  /* ---- shift end ----------------------------------------------------------
     One path for both endings: the shift auto-end (ShiftTimer's
     onComplete — 5 min full, 3 min half, stretched by any approved
     overtime) and the Half-Day End Shift button (which appears 3 minutes
     after the half-day approval). The shift's type dies with the shift;
     the approved REQUEST records are kept (they are the day's history) —
     the reads above are scoped to THIS shift (requestedAt >= startedAt),
     so the next one starts full again at its base length. */
  const endShiftNow = useCallback(() => {
    clearShiftStart();
    clearShiftAlertsShown();
    clearShiftType();
    setReminderOpen(false);
    onShiftEnd();
  }, [onShiftEnd]);

  /* ---- card actions -------------------------------------------------------
     Each card opens its report screen (Input Errors / Machine Defect /
     Output Errors / Other). */
  const handleSendUpdate = useCallback((attachment) => {
    // Persist the update with the picked photo/video's metadata. The
    // reminder modal only calls this AFTER its mandatory-attachment check,
    // so `attachment` is always present here. The modal itself switches to
    // its "Update sent!" stage and closes when the worker taps Done — so
    // we only record + toast + chime here.
    saveWorkUpdate({ at: new Date().toISOString(), attachment });
    playUpdateChime(); // synthesised "sent" chime (utils/sound.js)
    setToast(t('updateSent'));
  }, [t]);

  const dismissReminder = useCallback(() => {
    setReminderOpen(false);
  }, []);

  return (
    <div className="home">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      {/* Back to the machine allotment — review today's machine details
          again. Same white-chip language as the detail screens' back
          button, widened into a small left-aligned pill (icon + short
          label); positioning lives in .home__back (screens.css). */}
      <button
        type="button"
        className="back-button home__back"
        aria-label={t('backToAllotment')}
        title={t('backToAllotment')}
        onClick={() => onOpenScreen('machine-allotment')}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('backToAllotment')}</span>
      </button>

      {startedAt && (
        <ShiftTimer
          startedAt={startedAt}
          durationMs={shiftDurationMs(shiftType, overtimeHours)}
          alertsShown={alertsShown}
          onAlert={handleAlert}
          onComplete={endShiftNow}
          overtime={overtimeShiftStarted}
        />
      )}

      {/* Overtime indicator — the ONLY overtime badge on this screen, and
          it appears exclusively once the REGULAR shift duration has
          elapsed (isRegularShiftComplete ignores the approved overtime
          extension): the overtime tail of the SAME single timer has
          begun. While the regular shift is still running NO overtime
          badge shows — an approved request only stretches the timer and
          toasts its approval. Orange pill + clock-plus icon distinguish
          it from the regular blue timer; styling lives in .ot__badge. */}
      {overtimeShiftStarted && (
        <div className="ot__badge" role="status">
          <ClockPlusIcon size={14} aria-hidden="true" />
          <span>{t('overtimeShiftBadge')}</span>
        </div>
      )}

      {/* Half-Day End Shift — appears 3 minutes AFTER the half-day request
          is approved (see the approval effect above) and stays until the
          shift ends; tapping it ends the shift immediately and moves to
          Product Submission. */}
      {halfDayButtonReady && (
        <div className="home__halfday">
          <button
            type="button"
            className="btn-primary btn-primary--success"
            onClick={endShiftNow}
          >
            <CheckCircleIcon size={20} />
            <span>{t('halfDayEndShift')}</span>
          </button>
        </div>
      )}

      {/* Today's machine — confirmed on the allotment screen. */}
      {/* Today's machine + job — confirmed on the allotment screen. */}
{/* {allottedMachine && (
  <div className="machine-banner" role="status">
    <div className="machine-chip machine-chip--machine">
      <span className="machine-chip__icon" aria-hidden="true">
        <CogIcon size={18} />
      </span>
      <span className="machine-chip__text">
        <span className="machine-chip__label">{t('allotMachineNo')}</span>
        <strong className="machine-chip__value">{allottedMachine.machineId}</strong>
      </span>
    </div>

    <div className="machine-chip machine-chip--job">
      <span className="machine-chip__icon" aria-hidden="true">
        <WrenchIcon size={18} />
      </span>
      <span className="machine-chip__text">
        <span className="machine-chip__label">{t('allotJob')}</span>
        <strong className="machine-chip__value">{t('allotJobValue')}</strong>
      </span>
    </div>
  </div>
)} */}

      {/* Assigned job — set by the supervisor's "Assign Machine" screen
          (data/assignments.js). Additive banner: shows the assigned
          machine, the job's priority and the raw material + target
          quantity. Renders nothing until the supervisor assigns this
          worker; the labour flow itself is untouched. */}
      {assignedJob && (
        <div className="labour-job" role="status">
          <div className="labour-job__row">
            <span className="labour-job__chip">
              <CogIcon size={16} aria-hidden="true" />
              <span className="labour-job__chip-text">
                <small>{t('allotMachineNo')}</small>
                <strong>{assignedJob.machineId}</strong>
              </span>
            </span>
            <span
              className={`labour-job__prio labour-job__prio--${assignedJob.priority}`}
            >
              {t(
                PRIORITY_OPTIONS.find((p) => p.id === assignedJob.priority)
                  ?.labelKey ?? 'supAssignNormal',
              )}
            </span>
          </div>
          <p className="labour-job__line">
            {assignedJob.material} · {t('assignedQuantity')}:{' '}
            {assignedJob.output?.targetQuantity}
          </p>
        </div>
      )}

      <main className="home__grid">
        <ActionCard
          color="amber"
          icon={<PackageIcon size={40} />}
          label={t('rawMaterialIssue')}
          onClick={() => onOpenScreen('input-errors')}
        />
        <ActionCard
          color="blue"
          icon={<WrenchIcon size={40} />}
          label={t('machineBreakdown')}
          onClick={() => onOpenScreen('machine-defect')}
        />
        <ActionCard
          color="green"
          icon={<AlertTriangleIcon size={40} />}
          label={t('outputDefect')}
          onClick={() => onOpenScreen('output-errors')}
        />
        <ActionCard
          color="slate"
          icon={<DotsIcon size={40} />}
          label={t('other')}
          onClick={() => onOpenScreen('other')}
        />
      </main>

      <div className="home__sos">
        <SosButton onNotify={setToast} />
      </div>

      <footer className="home__footer">
        <button type="button" className="link-button" onClick={onResetDemo}>
          {t('resetDemo')}
        </button>
      </footer>

      <WorkUpdateReminder
        open={reminderOpen}
        onClose={dismissReminder}
        onSend={handleSendUpdate}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
