/**
 * HomeScreen.jsx — the Labour Homepage (mockups 6.1 / 6.2, Part 3).
 *
 * Layout, top to bottom:
 *   1. top bar      SUAB company logo + language dropdown
 *   2. shift timer  pale-blue pill counting up from the shift start
 *   3. action cards Raw Material Issue · Machine Breakdown (2 columns)
 *                   Output Defect (full width)
 *   4. SOS          red emergency button pinned near the bottom
 *
 * Behaviour:
 *   - The shift starts the first time the homepage is opened and is
 *     persisted, so a refresh keeps counting from the same moment.
 *   - Every DEMO_INTERVAL_MINUTES a "Work update needed" reminder pops
 *     up (mockup 6.2). Sending or dismissing it snoozes it a full cycle.
 *   - When the shift reaches SHIFT_DURATION_MINUTES it ends automatically
 *     and the app moves to the Product Submission screen.
 *
 * Props:
 *  - allottedMachine      today's confirmed machine allotment record
 *                         ({ machineId, machineName, … }) — shown in the
 *                         banner under the shift timer
 *  - onShiftEnd()        shift reached its full length → product submission
 *  - onOpenScreen(key)   open a report screen: 'input-errors' |
 *                        'machine-defect' | 'output-errors'
 *  - onResetDemo()       wipe all demo data (small link at the very bottom)
 */

import { useCallback, useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import ShiftTimer from '../components/ShiftTimer.jsx';
import ActionCard from '../components/ActionCard.jsx';
import SosButton from '../components/SosButton.jsx';
import WorkUpdateReminder from '../components/WorkUpdateReminder.jsx';
import Toast from '../components/Toast.jsx';
import {
  AlertTriangleIcon,
  // CogIcon,
  PackageIcon,
  WrenchIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  clearLastReminderAt,
  clearShiftStart,
  getLastReminderAt,
  getShiftStart,
  saveLastReminderAt,
  saveShiftStart,
  saveWorkUpdate,
} from '../utils/storage.js';
import {
  REMINDER_INTERVAL_MS,
  isReminderDue,
} from '../utils/shift.js';

/* How often the homepage re-checks "is a reminder due now?". Capped so a
   tiny demo interval still fires promptly, and bounded so the real 3-hour
   interval doesn't wake the timer needlessly often. */
const REMINDER_CHECK_MS = Math.max(
  1000,
  Math.min(30000, Math.floor(REMINDER_INTERVAL_MS / 4)),
);

export default function HomeScreen({  onShiftEnd, onOpenScreen, onResetDemo }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);

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

  /* ---- work-update reminder ---------------------------------------------- */
  const checkReminder = useCallback(() => {
    const shiftStart = getShiftStart();
    if (!shiftStart) return;
    if (isReminderDue(shiftStart, getLastReminderAt())) {
      saveLastReminderAt(new Date().toISOString());
      setReminderOpen(true);
    }
  }, []);

  useEffect(() => {
    // The first check is deferred with a timeout so no state is set
    // synchronously inside the effect body (it also lets the first
    // paint settle before a dialog pops over the homepage).
    const catchUp = setTimeout(checkReminder, 250);
    const id = setInterval(checkReminder, REMINDER_CHECK_MS);
    return () => {
      clearTimeout(catchUp);
      clearInterval(id);
    };
  }, [checkReminder]);

  /* ---- shift end ---------------------------------------------------------- */
  const handleShiftComplete = useCallback(() => {
    clearShiftStart();
    clearLastReminderAt();
    setReminderOpen(false);
    onShiftEnd();
  }, [onShiftEnd]);

  /* ---- card actions -------------------------------------------------------
     Each card opens its report screen (Input Errors / Machine Defect /
     Output Errors). */
  const handleSendUpdate = useCallback((attachment) => {
    // Persist the update with the picked photo/video's metadata. The
    // reminder modal only calls this AFTER its mandatory-attachment check,
    // so `attachment` is always present here. The modal itself switches to
    // its "Update sent!" stage and closes when the worker taps Done — so
    // we only record + toast here.
    saveWorkUpdate({ at: new Date().toISOString(), attachment });
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

      {startedAt && (
        <ShiftTimer startedAt={startedAt} onComplete={handleShiftComplete} />
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
          wide
          color="green"
          icon={<AlertTriangleIcon size={38} />}
          label={t('outputDefect')}
          onClick={() => onOpenScreen('output-errors')}
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
