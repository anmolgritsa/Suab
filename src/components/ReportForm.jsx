/**
 * ReportForm.jsx — the shared form behind the three issue-report screens
 * (Input Errors / Machine Defect / Output Errors).
 *
 * One component, parameterised by `category`, so all three screens look
 * and behave identically:
 *   1. header        back button + icon badge + title + subtitle
 *   2. attachment    MANDATORY photo/video picker — only the file's
 *                    metadata (name, type, size) is kept; nothing is
 *                    uploaded. Submit is blocked until a file is picked.
 *   3. actions       Submit (saves to suab.issueReports) / Cancel
 *   4. confirmation  after a successful submit: a "Report submitted!"
 *                    state with "Back to Home" and "Submit another"
 *
 * Props:
 *  - category   stored on the report: 'input-errors' | 'machine-defect'
 *               | 'output-errors'
 *  - icon       SVG node for the round badge
 *  - title      translated screen title
 *  - subtitle   translated one-line description
 *  - onBack()   return to the homepage (also used by Cancel)
 */

import { useRef, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { saveIssueReport } from '../utils/storage.js';
import PrimaryButton from './PrimaryButton.jsx';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  XIcon,
} from './icons.jsx';

/** Build mock attachment metadata from a picked file (no real upload). */
function fileMeta(file) {
  if (!file) return null;
  return { name: file.name, type: file.type || 'unknown', size: file.size };
}

export default function ReportForm({ category, icon, title, subtitle, onBack }) {
  const { t } = useI18n();

  /* ---- form state ---- */
  const [attachment, setAttachment] = useState(null); // { name, type, size } | null
  const [error, setError] = useState('');
  // null until a report is submitted, then the saved record
  const [submitted, setSubmitted] = useState(null);

  // Hidden <input type="file"> — the visible pill button triggers it.
  const fileInputRef = useRef(null);

  /** Keep only the picked file's metadata; clear the input so the same
      file can be picked again after a remove. Picking a file also clears
      the "attachment required" validation message. */
  function handlePickFile(event) {
    const file = event.target.files?.[0];
    setAttachment(fileMeta(file));
    setError('');
    event.target.value = '';
  }

  /** Validate, persist to suab.issueReports, then show the confirmation.
      The attachment is mandatory — a report without the photo/video is
      rejected with a clear message. */
  function handleSubmit() {
    if (!attachment) {
      setError(t('attachmentRequired'));
      return;
    }
    setSubmitted(
      saveIssueReport({
        category,
        timestamp: new Date().toISOString(),
        attachment,
      }),
    );
  }

  /** "Submit another report" — back to a clean form. */
  function handleReset() {
    setAttachment(null);
    setError('');
    setSubmitted(null);
  }

  /* ---- confirmation state (after a successful submit) ---- */
  if (submitted) {
    return (
      <div className="report">
        <header className="report__topbar">
          <button
            type="button"
            className="back-button"
            aria-label={t('backToHome')}
            onClick={onBack}
          >
            <ArrowLeftIcon size={20} />
          </button>
        </header>

        <span className="icon-badge icon-badge--lg report__sent-icon" aria-hidden="true">
          <CheckCircleIcon size={34} />
        </span>
        <h1 className="screen__title">{t('reportSent')}</h1>
        <p className="screen__subtitle">{t('reportSentSub')}</p>

        <button type="button" className="btn-primary report__action" onClick={onBack}>
          {t('backToHome')}
        </button>
        <button type="button" className="link-button" onClick={handleReset}>
          {t('submitAnother')}
        </button>
      </div>
    );
  }

  return (
    <div className="report">
      <header className="report__topbar">
        <button
          type="button"
          className="back-button"
          aria-label={t('backToHome')}
          onClick={onBack}
        >
          <ArrowLeftIcon size={20} />
        </button>
      </header>

      <span className="icon-badge icon-badge--lg" aria-hidden="true">
        {icon}
      </span>
      <h1 className="screen__title">{title}</h1>
      <p className="screen__subtitle">{subtitle}</p>

      <div className="report__form">
        {/* ---- attachment (MANDATORY — metadata only, nothing is uploaded).
             Submitting without a file shows the validation message below. ---- */}
        <p className="report__label">{t('addPhotoVideo')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="report__file-input"
          onChange={handlePickFile}
          tabIndex={-1}
          aria-hidden="true"
        />
        {attachment ? (
          <div className="report__attachment">
            <span className="report__attachment-icon" aria-hidden="true">
              <CameraIcon size={18} />
            </span>
            <span className="report__attachment-name">{attachment.name}</span>
            <button
              type="button"
              className="report__attachment-remove"
              aria-label={t('removeFile')}
              onClick={() => setAttachment(null)}
            >
              <XIcon size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={'report__pick' + (error ? ' report__pick--error' : '')}
            onClick={() => fileInputRef.current?.click()}
          >
            <CameraIcon size={20} />
            <span>{t('chooseFile')}</span>
          </button>
        )}
        {error && <p className="field__error">{error}</p>}

        {/* ---- actions ----
            Submit wears the default primary style — the same solid blue as
            the check-in / confirm buttons across the app. ---- */}
        <div className="report__actions">
          <PrimaryButton onClick={handleSubmit}>
            {t('submitReport')}
          </PrimaryButton>
          <button type="button" className="link-button" onClick={onBack}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
