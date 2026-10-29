/**
 * SosButton.jsx — the red emergency button at the bottom of the labour
 * homepage (mockup: "SOS / EMERGENCY").
 *
 * Tapping it opens a confirm dialog (a stray tap must not raise a false
 * alarm). Confirming records a mock SOS event in localStorage and shows
 * a toast — the real alert pipeline arrives in a later part.
 */

import { useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { AlertTriangleIcon, XIcon } from './icons.jsx';
import { saveSosEvent } from '../utils/storage.js';

/**
 * Props:
 *  - onNotify(message) show a toast on the homepage after the alert
 */
export default function SosButton({ onNotify }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  function handleConfirm() {
    saveSosEvent({ at: new Date().toISOString() });
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
