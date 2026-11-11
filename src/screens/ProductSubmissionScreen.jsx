/**
 * ProductSubmissionScreen.jsx — the product-count screen the worker lands
 * on when the shift ends.
 *
 * Layout, top to bottom:
 *   1. header      SUAB logo + language dropdown
 *   2. title       "Product Submission" + shift-complete subtitle
 *   3. assigned    chip showing the machine's shift target (from the
 *                  machine allotment saved earlier)
 *   4. form        three count rows — Successful / Rejected / Reusable —
 *                  each with − / + steppers, a numeric field and a mic
 *                  button that fills the count from spoken words
 *   5. actions     Confirm (submit) and "End Shift & Submit" (early end)
 *
 * Voice input: tapping a row's mic starts speech recognition in the UI
 * language and cycles through the demo's five locales (en-IN, hi-IN,
 * bn-IN, pa-IN, te-IN) until a number is heard — see utils/speech.js and
 * utils/voiceNumbers.js. The parsed value lands in the field, where it
 * stays editable before submission.
 *
 * On a valid submission the counts are saved twice: to the device-local
 * suab.productSubmissions as { successful, rejected, reusable, quantity,
 * shiftEndTime, endedEarly? } (the shift-completed confirmation reads it —
 * the three counts presented as a small table (.output__table* rules:
 * header row, one row per product type, the shift-end time in its footer)
 * with "Start New Shift" / "Logout"), AND to the SHARED DB document
 * (data/db.js addProductSubmission → collections.productSubmissions) so
 * the supervisor's Reports screen shows the submission live via the sync
 * bridge — the same path the Work Activities screen files updates through.
 *
 * Validation: every count is a non-negative number, at least one count is
 * non-zero, and the successful count may not exceed the assigned quantity.
 *
 * All visible text comes from t() (see i18n.jsx), so it follows the
 * language chosen in <LanguageDropdown /> in the top bar.
 *
 * Props:
 *  - onStartNewShift()  clear the shift data and lock the app (unlocking
 *                       continues at the attendance screen)
 *  - onLogout()         end the session → login screen
 */

import { useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import QuantityField from '../components/QuantityField.jsx';
import {
  CheckCircleIcon,
  ClockIcon,
  PackageIcon,
  TargetIcon,
  XIcon,
} from '../components/icons.jsx';
import { useI18n, LANGUAGES } from '../i18n.jsx';
import {
  addProductSubmission,
  getCurrentLabour,
} from '../data/db.js';
import {
  clearShiftAlertsShown,
  clearShiftStart,
  formatTime12h,
  getAssignedQuantity,
  getShiftStart,
  getTodayAllotment,
  saveProductSubmission,
} from '../utils/storage.js';
import { isSpeechSupported, startSpeechRecognition } from '../utils/speech.js';
import { LOCALE_BY_LANG, SPEECH_LOCALES } from '../utils/voiceNumbers.js';

/** Native name of a speech locale ('hi-IN' → 'हिन्दी') for the mic chip. */
function nativeLabel(locale) {
  const match = LANGUAGES.find((entry) => LOCALE_BY_LANG[entry.code] === locale);
  return match ? match.native : locale;
}

export default function ProductSubmissionScreen({ onStartNewShift }) {
  const { t, lang } = useI18n();

  // The machine's shift quota (saved when the allotment was accepted) caps
  // the successful count; the accepted machine's name labels the chip.
  const allotment = getTodayAllotment();
  const assigned = getAssignedQuantity();

  // The three counts, kept as strings so the inputs stay editable.
  const [counts, setCounts] = useState({ successful: '', rejected: '', reusable: '' });
  const [error, setError] = useState('');
  // null until a valid submission, then the saved record
  const [completed, setCompleted] = useState(null);

  /* ---- voice state ---- */
  const [listeningField, setListeningField] = useState(null); // 'successful' | …
  const [activeLocale, setActiveLocale] = useState(''); // current attempt's locale
  const [voiceNotice, setVoiceNotice] = useState(''); // hint / failure text
  const recognizerRef = useRef(null);
  const localeQueueRef = useRef([]);
  const attemptRef = useRef(0);
  const speechSupported = isSpeechSupported();

  /* ---- voice input -------------------------------------------------------
     One mic per row. Tapping it starts recognition in the UI language and
     cycles through the five demo locales until a number is heard — no
     manual language picking. Tapping the active mic again cancels it. */
  function stopListening() {
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    setListeningField(null);
    setActiveLocale('');
  }

  /** One recognition attempt in queue[index]; onEnd chains the next one. */
  function beginAttempt(field, index) {
    const queue = localeQueueRef.current;
    if (index >= queue.length) {
      // Every locale had its chance — ask the worker to try once more.
      stopListening();
      setVoiceNotice(t('voiceFailed'));
      return;
    }
    attemptRef.current = index;
    const locale = queue[index];
    setActiveLocale(locale);
    setListeningField(field);
    setVoiceNotice('');

    // Per-attempt flags: exactly one of onResult/onError fires, then onEnd.
    let heardNumber = false;
    let failure = '';

    recognizerRef.current = startSpeechRecognition({
      lang: locale,
      onResult: (number) => {
        heardNumber = true;
        setCount(field, String(number));
      },
      onError: (reason) => {
        failure = reason;
      },
      onEnd: () => {
        recognizerRef.current = null;
        if (heardNumber) {
          setListeningField(null);
          setActiveLocale('');
          return;
        }
        if (failure === 'not-allowed' || failure === 'service-not-allowed') {
          stopListening();
          setVoiceNotice(t('voiceUnsupported'));
          return;
        }
        // Nothing usable in this language — the mic re-opens for the next.
        beginAttempt(field, index + 1);
      },
    });
  }

  function handleMicPress(field) {
    if (listeningField === field) {
      stopListening(); // second tap deactivates the mic
      return;
    }
    if (!speechSupported) {
      setVoiceNotice(t('voiceUnsupported'));
      return;
    }
    stopListening();
    // UI language first, then the remaining locales in demo order.
    const first = LOCALE_BY_LANG[lang] || SPEECH_LOCALES[0];
    localeQueueRef.current = [first, ...SPEECH_LOCALES.filter((l) => l !== first)];
    beginAttempt(field, 0);
  }

  /** Tap the language chip to skip straight to the next locale. */
  function cycleLocale() {
    const field = listeningField;
    if (!field) return;
    recognizerRef.current?.cancel();
    recognizerRef.current = null;
    beginAttempt(field, attemptRef.current + 1);
  }

  // Stop the mic when the screen goes away (shift submitted / logout).
  useEffect(() => () => recognizerRef.current?.cancel(), []);

  function setCount(field, value) {
    setError('');
    setCounts((current) => ({ ...current, [field]: value }));
  }

  /**
   * Validate the three counts, save them, and show the confirmation.
   * `endedEarly` marks the manual "End Shift & Submit" path (finishing
   * before the shift timer's auto-end) so the record keeps the intent.
   */
  function submitCounts({ endedEarly }) {
    const successful = Number(counts.successful || 0);
    const rejected = Number(counts.rejected || 0);
    const reusable = Number(counts.reusable || 0);
    const total = successful + rejected + reusable;

    if (total === 0) {
      setError(t('quantityEmpty'));
      return;
    }
    if (![successful, rejected, reusable].every((n) => Number.isInteger(n) && n >= 0)) {
      setError(t('quantityInvalid'));
      return;
    }
    if (successful > assigned) {
      setError(t('quantityTooHigh'));
      return;
    }
    // If the worker reaches this screen while a shift is still running
    // (early completion), end it as part of the submission.
    const shiftStartAt = getShiftStart();
    if (shiftStartAt) {
      clearShiftStart();
      clearShiftAlertsShown();
    }
    const shiftEndAt = new Date().toISOString();
    // The device-local record (unchanged — the confirmation table reads it).
    const saved = saveProductSubmission({
      successful,
      rejected,
      reusable,
      quantity: successful, // kept for older records' readers
      shiftEndTime: shiftEndAt,
      endedEarly: Boolean(endedEarly),
    });
    // The SHARED record (schema v4): the supervisor's Reports screen reads
    // these live via the sync bridge — same path as work updates. The
    // submission is attributed to the signed-in labourer (getCurrentLabour,
    // the same pattern the Work Activities screen uses) and carries the
    // machine + shift window so the report shows hours and machine number.
    const labour = getCurrentLabour();
    const allotmentRecord = getTodayAllotment();
    addProductSubmission({
      labourId: labour.id,
      labourName: labour.name,
      successful,
      rejected,
      reusable,
      machineId: allotmentRecord?.machineId ?? null,
      machineName: allotmentRecord?.machineName ?? null,
      shiftStartAt: shiftStartAt ?? null,
      shiftEndAt,
      endedEarly: Boolean(endedEarly),
    });
    setCompleted(saved);
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

          {/* The submitted counts as a small table: header row, one row
              per product type (icon + label + count), and the shift-end
              time in the footer. Styling: .output__table* rules. */}
          <table className="output__table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="output__th">
                    <PackageIcon size={13} />
                    {t('productColLabel')}
                  </span>
                </th>
                <th scope="col">
                  <span className="output__th">
                    <TargetIcon size={13} />
                    {t('countColLabel')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="output__item">
                  <span className="output__item-inner output__item-inner--success">
                    <CheckCircleIcon size={16} />
                    {t('successfulProducts')}
                  </span>
                </th>
                <td className="output__count output__count--success">
                  {completed.successful}
                </td>
              </tr>
              <tr>
                <th scope="row" className="output__item">
                  <span className="output__item-inner output__item-inner--danger">
                    <XIcon size={16} />
                    {t('rejectedProducts')}
                  </span>
                </th>
                <td className="output__count output__count--danger">
                  {completed.rejected}
                </td>
              </tr>
              <tr>
                <th scope="row" className="output__item">
                  <span className="output__item-inner output__item-inner--info">
                    <PackageIcon size={16} />
                    {t('reusableProducts')}
                  </span>
                </th>
                <td className="output__count output__count--info">
                  {completed.reusable}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="output__foot">
                  <span className="output__foot-inner">
                    <ClockIcon size={14} />
                    {t('shiftEndedAt')}:
                    <strong>{formatTime12h(completed.shiftEndTime)}</strong>
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>

          <button
            type="button"
            className="btn-primary product-submit__action"
            onClick={onStartNewShift}
          >
            {t('returnToHomePage')}
          </button>
          {/* <button type="button" className="link-button" onClick={onLogout}>
            {t('logout')}
          </button> */}
        </div>
      </div>
    );
  }

  /* ---- the count form ---- */
  return (
    <div className="home product-submit">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="product-submit__main">
        <h1 className="screen__title">{t('productSubmission')}</h1>
        <p className="screen__subtitle">{t('productSubmissionSub')}</p>

        {/* Machine + assigned quantity chip (from the allotment). */}
        <div className="product-submit__assigned demo-chip">
          {allotment ? `${allotment.machineName} · ` : ''}
          {t('assignedQuantity')}: <strong>{assigned}</strong>
        </div>

        {/* Three counts — type, step with − / +, or speak each one. */}
        <div className="product-submit__form">
          <QuantityField
            accent="success"
            icon={<CheckCircleIcon size={16} />}
            label={t('successfulProducts')}
            value={counts.successful}
            onChange={(value) => setCount('successful', value)}
            listening={listeningField === 'successful'}
            onMicPress={() => handleMicPress('successful')}
            micDisabled={!speechSupported}
            micLabel={t('micLabel')}
          />
          <QuantityField
            accent="danger"
            icon={<XIcon size={16} />}
            label={t('rejectedProducts')}
            value={counts.rejected}
            onChange={(value) => setCount('rejected', value)}
            listening={listeningField === 'rejected'}
            onMicPress={() => handleMicPress('rejected')}
            micDisabled={!speechSupported}
            micLabel={t('micLabel')}
          />
          <QuantityField
            accent="info"
            icon={<PackageIcon size={16} />}
            label={t('reusableProducts')}
            value={counts.reusable}
            onChange={(value) => setCount('reusable', value)}
            listening={listeningField === 'reusable'}
            onMicPress={() => handleMicPress('reusable')}
            micDisabled={!speechSupported}
            micLabel={t('micLabel')}
          />
        </div>

        {/* One-line voice status: hint → listening (+ language chip) → notice. */}
        <div className="product-submit__voice" aria-live="polite">
          {listeningField ? (
            <>
              <span className="product-submit__voice-dot" aria-hidden="true" />
              <span>{t('listening')}</span>
              {activeLocale && (
                <button
                  type="button"
                  className="product-submit__lang"
                  onClick={cycleLocale}
                  title={t('speakOrType')}
                >
                  {nativeLabel(activeLocale)}
                </button>
              )}
            </>
          ) : (
            <span
              className={
                voiceNotice
                  ? 'product-submit__voice-warn'
                  : 'product-submit__voice-hint'
              }
            >
              {voiceNotice || t('speakOrType')}
            </span>
          )}
        </div>

        {error && <p className="field__error product-submit__error">{error}</p>}

        <div className="product-submit__actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => submitCounts({ endedEarly: false })}
          >
            {t('confirmQuantity')}
          </button>
          {/* Manual early shift completion: end the shift now with the
              entered counts instead of waiting for the timer's auto-end. */}
          <button
            type="button"
            className="link-button"
            onClick={() => submitCounts({ endedEarly: true })}
          >
            {t('endShiftEarly')}
          </button>
        </div>
      </div>
    </div>
  );
}
