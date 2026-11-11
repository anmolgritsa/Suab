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
<<<<<<< HEAD
 *   3. actions       Submit (saves to suab.issueReports) / Cancel
 *   4. confirmation  after a successful submit: a "Report submitted!"
=======
 *   3. voice note    OPTIONAL spoken description of the defect, recorded
 *                    with the shared engine in utils/voiceNote.js (the
 *                    same one the half-day request uses): record, play
 *                    back, retake or delete. Persisted as a data URL on
 *                    the saved report when it fits MAX_SAVED_AUDIO_CHARS.
 *   4. actions       Submit (saves to suab.issueReports) / Cancel
 *   5. confirmation  after a successful submit: a "Report submitted!"
>>>>>>> master
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
<<<<<<< HEAD
import { saveIssueReport } from '../utils/storage.js';
=======
import { addDefectReport, getCurrentLabour } from '../data/db.js';
import { saveIssueReport } from '../utils/storage.js';
import { formatVoiceTime, useVoiceNote } from '../utils/voiceNote.js';
>>>>>>> master
import PrimaryButton from './PrimaryButton.jsx';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
<<<<<<< HEAD
=======
  MicIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
>>>>>>> master
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

<<<<<<< HEAD
=======
  // Optional voice note — the shared recording engine (utils/voiceNote.js):
  // record → play back / retake / delete, persisted as a data URL on submit.
  const voice = useVoiceNote();

>>>>>>> master
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

<<<<<<< HEAD
  /** Validate, persist to suab.issueReports, then show the confirmation.
      The attachment is mandatory — a report without the photo/video is
      rejected with a clear message. */
=======
  /** Validate, persist, then show the confirmation.
      The attachment is mandatory — a report without the photo/video is
      rejected with a clear message. The voice note is optional: its data
      URL rides along when one was recorded and it fits the storage cap
      ('' from an oversized take becomes undefined, keeping the record
      clean). Submit stays disabled while a take is still recording so a
      half-captured note can never be saved.

      Two stores are written:
        1. suab.issueReports (utils/storage.js) — the device-local queue,
           unchanged behaviour.
        2. the SHARED defectReports collection (data/db.js) — what the
           supervisor's Alerts screen reads live. The attachment rides as
           METADATA ONLY (name/type/size): the picked image/video is
           deliberately NOT uploaded (images-only upload comes later), so
           no file data ever enters the shared DB from this form. */
>>>>>>> master
  function handleSubmit() {
    if (!attachment) {
      setError(t('attachmentRequired'));
      return;
    }
<<<<<<< HEAD
    setSubmitted(
      saveIssueReport({
        category,
        timestamp: new Date().toISOString(),
        attachment,
      }),
    );
  }

  /** "Submit another report" — back to a clean form. */
=======
    const voiceDataUrl = voice.clip?.dataUrl || undefined;
    // 1) Device-local queue (existing behaviour, untouched).
    const saved = saveIssueReport({
      category,
      timestamp: new Date().toISOString(),
      attachment,
      voiceNote: voiceDataUrl,
    });
    // 2) Shared DB — the supervisor sees this within ~1 s via the sync
    //    bridge. Unattributable (no signed-in labourer) is refused by
    //    addDefectReport and simply skips the shared write.
    const labour = getCurrentLabour();
    addDefectReport({
      labourId: labour.id,
      labourName: labour.name,
      type: category,
      voiceNote: voiceDataUrl,
      attachment,
      reportedAt: saved.timestamp,
    });
    setSubmitted(saved);
  }

  /** "Submit another report" — back to a clean form (the voice note goes
      with it: the next report starts without the previous take). */
>>>>>>> master
  function handleReset() {
    setAttachment(null);
    setError('');
    setSubmitted(null);
<<<<<<< HEAD
=======
    voice.deleteClip();
>>>>>>> master
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

<<<<<<< HEAD
        {/* ---- actions ----
            Submit wears the default primary style — the same solid blue as
            the check-in / confirm buttons across the app. ---- */}
        <div className="report__actions">
          <PrimaryButton onClick={handleSubmit}>
=======
        {/* ---- voice note (OPTIONAL — a spoken description of the defect).
             Same engine as the half-day request (utils/voiceNote.js): tap
             the mic pill to record (auto-stops after one minute), then
             play the take back, retake it or delete it. Saved on the
             report as a data URL when it fits MAX_SAVED_AUDIO_CHARS. ---- */}
        <p className="report__label">{t('voiceNoteLabel')}</p>
        {voice.clip ? (
          <div className="report__voice">
            <button
              type="button"
              className="report__voice-chip"
              onClick={voice.togglePlayback}
              aria-label={voice.playing ? t('voiceStop') : t('voicePlay')}
            >
              {voice.playing ? <StopIcon size={16} /> : <PlayIcon size={16} />}
              <span>{voice.playing ? t('voiceStop') : t('voicePlay')}</span>
            </button>
            <button
              type="button"
              className="report__voice-chip report__voice-chip--retake"
              onClick={voice.startRecording}
            >
              <RefreshIcon size={16} />
              <span>{t('voiceRetake')}</span>
            </button>
            <span className="report__voice-length">
              {formatVoiceTime(voice.elapsedMs)}
            </span>
            <button
              type="button"
              className="report__voice-remove"
              aria-label={t('voiceDelete')}
              onClick={voice.deleteClip}
            >
              <XIcon size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={'report__voice-mic' + (voice.recording ? ' report__voice-mic--rec' : '')}
            onClick={voice.recording ? voice.stopRecording : voice.startRecording}
            aria-label={voice.recording ? t('voiceStop') : t('voiceRecord')}
          >
            {voice.recording ? <StopIcon size={18} /> : <MicIcon size={18} />}
            <span>
              {voice.recording
                ? `${t('voiceRecording')} ${formatVoiceTime(voice.elapsedMs)}`
                : t('voiceRecord')}
            </span>
          </button>
        )}
        {voice.micError && (
          <p className="report__voice-error" role="alert">
            {t('voiceMicError')}
          </p>
        )}

        {/* ---- actions ----
            Submit wears the default primary style — the same solid blue as
            the check-in / confirm buttons across the app. Disabled while a
            voice take is still recording so it can't be saved half-captured. ---- */}
        <div className="report__actions">
          <PrimaryButton onClick={handleSubmit} disabled={voice.recording}>
>>>>>>> master
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
