/**
 * ProductSubmissionScreen.jsx — the product-count screen the worker lands
 * on when the shift ends (numeric keypad mockup).
 *
 * Layout, top to bottom:
 *   1. header      SUAB logo + language dropdown
 *   2. title       "Product Submission" + shift-complete subtitle
 *   3. assigned    chip showing the machine's shift target (500 — read
 *                  from today's machine allotment, saved on the allotment
 *                  screen)
 *   4. display     the digits typed so far, big and readable
 *   5. keypad      0-9, backspace and clear (large touch targets)
 *   6. actions     Confirm (submit the count) and "End Shift & Submit"
 *                  (manual early shift completion)
 *
 * On a valid submission the count is saved to suab.productSubmissions as
 * { quantity, shiftEndTime, endedEarly? } and a shift-completed
 * confirmation is shown with "Start New Shift" / "Logout".
 *
 * Validation: the quantity must be a non-negative number and may not
 * exceed the assigned quantity.
 *
 * All visible text comes from t() (see i18n.jsx), so it follows the
 * language chosen in <LanguageDropdown /> in the top bar.
 *
 * Props:
 *  - onStartNewShift()  clear the shift data and open a fresh homepage
 *  - onLogout()         end the session → login screen
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Keypad from '../components/Keypad.jsx';
import { CheckCircleIcon } from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  clearLastReminderAt,
  clearShiftStart,
  formatTime12h,
  getAssignedQuantity,
  getShiftStart,
  getTodayAllotment,
  saveProductSubmission,
} from '../utils/storage.js';

export default function ProductSubmissionScreen({ onStartNewShift, onLogout }) {
  const { t } = useI18n();

  // The machine's shift quota (saved when the allotment was accepted) caps
  // the keypad; the accepted machine's name labels the chip. Falls back to
  // the demo default of 500 when no allotment was confirmed.
  const allotment = getTodayAllotment();
  const assigned = getAssignedQuantity();

  const [entry, setEntry] = useState(''); // digits typed so far
  const [error, setError] = useState('');
  // null until a valid submission, then the saved record
  const [completed, setCompleted] = useState(null);

  /* ---- keypad handlers ---- */

  function handleDigit(digit) {
    setError('');
    // Cap at 8 digits — plenty for a shift count, keeps the display tidy.
    setEntry((current) => (current.length >= 8 ? current : current + digit));
  }

  function handleBackspace() {
    setError('');
    setEntry((current) => current.slice(0, -1));
  }

  function handleClear() {
    setError('');
    setEntry('');
  }

  /**
   * Validate the typed quantity, save it, and show the confirmation.
   * `endedEarly` marks the manual "End Shift & Submit" path (finishing
   * before the 8-hour auto-end) so the record records the intent.
   */
  function submitQuantity({ endedEarly }) {
    if (entry === '') {
      setError(t('quantityEmpty'));
      return;
    }
    const quantity = Number(entry);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError(t('quantityInvalid'));
      return;
    }
    if (quantity > assigned) {
      setError(t('quantityTooHigh'));
      return;
    }
    // If the worker reaches this screen while a shift is still running
    // (early completion), end it as part of the submission.
    if (getShiftStart()) {
      clearShiftStart();
      clearLastReminderAt();
    }
    setCompleted(
      saveProductSubmission({
        quantity,
        shiftEndTime: new Date().toISOString(),
        endedEarly: Boolean(endedEarly),
      }),
    );
  }

  /* ---- shift-completed confirmation ---- */
  if (completed) {
    return (
      <div className="home product-submit">
        <header className="home__topbar">
          <BrandLogo />
          <LanguageDropdown />
        </header>

        <div className="product-submit__main">
          <span
            className="icon-badge icon-badge--lg product-submit__sent-icon"
            aria-hidden="true"
          >
            <CheckCircleIcon size={34} />
          </span>
          {/* <h1 className="screen__title">{t('shiftComplete')}</h1>
          <p className="screen__subtitle">{t('shiftCompletedSub')}</p> */}

          <div className="product-submit__summary">
            <div className="product-submit__row">
              <span>{t('submittedQuantity')}</span>
              <strong>{completed.quantity}</strong>
            </div>
            <div className="product-submit__row">
              <span>{t('shiftEndedAt')}</span>
              <strong>{formatTime12h(completed.shiftEndTime)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn-primary product-submit__action"
            onClick={onStartNewShift}
          >
            {t('startNewShift')}
          </button>
          <button type="button" className="link-button" onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home product-submit">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="product-submit__main">
        <h1 className="screen__title">{t('productSubmission')}</h1>
        <p className="screen__subtitle">{t('productSubmissionSub')}</p>

        {/* Machine + assigned quantity chip (500 from the allotment). */}
        <div className="product-submit__assigned demo-chip">
          {allotment ? `${allotment.machineName} · ` : ''}
          {t('assignedQuantity')}: <strong>{assigned}</strong>
        </div>

        {/* Big readout of the digits typed so far. */}
        <div className="product-submit__display">
          <span className="product-submit__value">{entry || '0'}</span>
          <span className="product-submit__display-label">{t('quantityLabel')}</span>
        </div>
        {error && <p className="field__error product-submit__error">{error}</p>}

        <Keypad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onClear={handleClear}
        />

        <div className="product-submit__actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => submitQuantity({ endedEarly: false })}
          >
            {t('confirmQuantity')}
          </button>
          {/* Manual early shift completion: end the shift now with the
              entered count instead of waiting for the 8-hour auto-end. */}
          <button
            type="button"
            className="link-button"
            onClick={() => submitQuantity({ endedEarly: true })}
          >
            {t('endShiftEarly')}
          </button>
        </div>
      </div>
    </div>
  );
}