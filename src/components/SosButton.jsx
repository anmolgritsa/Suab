/**
 * SosButton.jsx — the red emergency button at the bottom of the labour
<<<<<<< HEAD
 * homepage (mockup: "SOS / EMERGENCY").
 *
 * Tapping it opens a confirm dialog (a stray tap must not raise a false
 * alarm). Confirming records a mock SOS event in localStorage and shows
 * a toast — the real alert pipeline arrives in a later part.
=======
 * homepage (mockup: "SOS / EMERGENCY") and the supervisor dashboard.
 *
 * Tapping it opens a confirm dialog (a stray tap must not raise a false
 * alarm). Confirming writes a REAL SOS record to the SHARED `sosAlerts`
 * collection (data/db.js) — the supervisor's dashboard trips its blinking
 * + sound alarm within ~1 s (sync bridge) and the SOS screen lists the
 * alert. The device-local mock event (utils/storage.js) is kept for its
 * existing readers.
>>>>>>> master
 */

import { useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { AlertTriangleIcon, XIcon } from './icons.jsx';
<<<<<<< HEAD
import { saveSosEvent } from '../utils/storage.js';
=======
import { getSession, saveSosEvent } from '../utils/storage.js';
import { addSosAlert, getCurrentLabour } from '../data/db.js';
import { getEmployeeAssignment } from '../data/assignments.js';
>>>>>>> master

/**
 * Props:
 *  - onNotify(message) show a toast on the homepage after the alert
 */
export default function SosButton({ onNotify }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
<<<<<<< HEAD
    saveSosEvent({ at: new Date().toISOString() });
=======
    const at = new Date().toISOString();
    saveSosEvent({ at }); // device-local mock event (existing behaviour)
    // REAL record → shared DB → supervisor alarm + SOS screen, live.
    const labour = getCurrentLabour();
    const machineNumber =
      getEmployeeAssignment(getSession()?.employeeId)?.machineId ?? null;
    addSosAlert({
      labourId: labour.id,
      labourName: labour.name,
      machineNumber,
      reportedAt: at,
    });
>>>>>>> master
    setConfirming(false);
    onNotify?.(t('sosSent'));
  }

  return (
    <>
      <button
        type="button"
        className="sos-button"
        onClick={() => setConfirming(true)}
      >
        <span className="sos-button__sos">{t('sos')}</span>
        <span className="sos-button__label">{t('emergency')}</span>
      </button>

      {confirming && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setConfirming(false)}
        >
          <div
            className="sos-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('sosConfirmTitle')}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal__close"
              aria-label={t('close')}
              onClick={() => setConfirming(false)}
            >
              <XIcon size={18} />
            </button>

            <span className="sos-dialog__icon" aria-hidden="true">
              <AlertTriangleIcon size={30} />
            </span>
            <h2 className="modal__title">{t('sosConfirmTitle')}</h2>
            <p className="modal__subtitle">{t('sosConfirmBody')}</p>

            <div className="sos-dialog__actions">
              <button
                type="button"
                className="sos-dialog__cancel"
                onClick={() => setConfirming(false)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="sos-dialog__send"
                onClick={handleConfirm}
              >
                {t('sosConfirmSend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
