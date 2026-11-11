/**
 * WorkActivitiesScreen.jsx — voice-based "Update Other Work Activities".
 *
 * Opened from the Other screen's activities tile (App.jsx routes the
 * 'work-activities' screen key here). Like the half-day request screen,
 * the worker records a short voice note plus a one-line description:
 *
 *   1. describe the work in the details field (the update's text)
 *   2. tap the big round mic → the shared voice engine (useVoiceNote,
 *      utils/voiceNote.js) records from getUserMedia — pulsing coral
 *      ring, a running timer, auto-stop after a minute
 *   3. Play / Retake to review or replace the take
 *   4. optionally attach up to 4 photos/videos from the device — each is
 *      read as a data URL and rides along as image/video media
 *   5. Submit → files the update in the SHARED data layer (data/db.js —
 *      addUpdate): labour id + name, date, time, type 'work-activity',
 *      the details text, the attachments and the voice note as media,
 *      status 'new'. The sync server saves attached images/videos into
 *      data/work-uploads/ and stores their file paths on the record.
 *      The same labour filing the same details within a minute returns
 *      the existing record (created === false) — the "already sent"
 *      message pops instead of a duplicate. The supervisor's Labour
 *      Updates feed reads the same record live via the sync bridge.
 *   6. a success toast pops, then the screen returns to Other.
 *
 * If the microphone is unavailable or permission is denied, a friendly
 * inline message appears and the back button stays available.
 *
 * The screen is visually identical to the half-day voice form, so it
 * reuses the same scoped styles — every .halfday__* rule in screens.css
 * also matches this screen's .workact__* classes (the details field adds
 * its own .workact__field rules in the same block).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Toast from '../components/Toast.jsx';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  MicIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  XIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  UPDATE_TYPE_WORK_ACTIVITY,
  addUpdate,
  getCurrentLabour,
} from '../data/db.js';
// The shared recording engine: state, mic actions and the mm:ss label.
import {
  formatVoiceTime as formatTime,
  useVoiceNote,
} from '../utils/voiceNote.js';

/** How long the success toast shows before the screen returns to Other. */
const SENT_TOAST_MS = 1500;

/** Attachment limits (the sync server enforces the same per-file cap). */
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export default function WorkActivitiesScreen({ onBack }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false); // submit tapped — freeze the UI
  const [details, setDetails] = useState(''); // the update's text
  const [attachments, setAttachments] = useState([]); // picked image/video files
  const navigateRef = useRef(null); // post-submit navigation timer

  // The shared voice engine: one take at a time; the mic, blob URL and
  // audio element are released on unmount by the hook itself.
  const voice = useVoiceNote();

  /* ---- submit -----------------------------------------------------------
     File the update in the SHARED data layer (data/db.js — addUpdate) and
     return to Other after the toast. Fields are mapped EXPLICITLY (the
     addRequest lesson): getCurrentLabour() returns { id, name } while
     addUpdate reads { labourId, labourName } — spreading the identity
     object would file an unattributable update and trip the dedup guard.
     Attachments ride along as image/video media and the voice note as
     audio media; a take too large to store simply sends without the clip. */
  const handleSubmit = useCallback(() => {
    const text = details.trim();
    if (!voice.clip || !text || busy) return;
    const labour = getCurrentLabour();
    const attachmentMedia = attachments.map((file) => ({
      kind: String(file.type ?? '').startsWith('video/') ? 'video' : 'image',
      dataUrl: file.dataUrl,
      name: file.name,
    }));
    const result = addUpdate({
      labourId: labour.id,
      labourName: labour.name,
      type: UPDATE_TYPE_WORK_ACTIVITY,
      details: text,
      media: [
        ...attachmentMedia,
        ...(voice.clip.dataUrl
          ? [{ kind: 'audio', dataUrl: voice.clip.dataUrl, name: 'voice-note.webm' }]
          : []), // take too large to store — send without the clip
      ],
    });
    if (!result) return; // unreachable via the gated button — stay usable
    setBusy(true);
    setToast(t(result.created ? 'activitiesSent' : 'activitiesDuplicate'));
    navigateRef.current = setTimeout(onBack, SENT_TOAST_MS);
  }, [attachments, busy, details, onBack, t, voice.clip]);

  /* ---- leaving the screen: cancel the navigation timer ------------------
     (the voice engine releases the mic, blob URL and audio on unmount). */
  useEffect(
    () => () => {
      if (navigateRef.current) clearTimeout(navigateRef.current);
    },
    [],
  );

  /* ---- attachments: pick images/videos from the device -------------------
     A hidden <input type="file" accept="image/*,video/*" multiple> opens
     the camera/gallery; each picked file is read as a data URL (capped at
     MAX_ATTACHMENTS files / MAX_ATTACHMENT_BYTES each). */
  function handlePickFiles(event) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // allow re-picking the same file again
    if (!files.length || busy) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    files.slice(0, Math.max(remaining, 0)).forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) return; // too large — skip
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((current) =>
          current.length >= MAX_ATTACHMENTS
            ? current
            : [
                ...current,
                {
                  name: file.name,
                  type: file.type,
                  dataUrl: String(reader.result ?? ''),
                },
              ],
        );
      };
      reader.readAsDataURL(file);
    });
  }

  /** Remove one picked attachment before submitting. */
  function removeAttachment(index) {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }

  /* ---- render -----------------------------------------------------------
     Same shell as the half-day voice screen: topbar (logo + language),
     round back button, centred body — mic hero, status line, review
     chips, attachment previews, submit. The control labels reuse the
     shared voice-note keys (voiceRecord / voiceStop / voicePlay /
     voiceRetake / voiceMicError). */
  const recording = voice.recording;
  const statusLine = recording
    ? `${t('voiceRecording')} ${formatTime(voice.elapsedMs)}`
    : voice.clip
      ? formatTime(voice.elapsedMs)
      : t('activitiesHint');

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

        {/* workact__body: the half-day voice screen's scoped styles shared
            via grouped selectors — see screens.css (.workact__body). */}
        <div className="detail__body workact__body">
          <h1 className="screen__title">{t('otherActivities')}</h1>
          <p className="screen__subtitle">{t('activitiesSub')}</p>

          {/* Details field — the update's text (the same white-card
              language as the overtime hours field, .workact__field). */}
          <div className="workact__field">
            <label className="workact__label" htmlFor="workact-details">
              {t('activitiesDetailsLabel')}
            </label>
            <input
              id="workact-details"
              className="workact__input"
              type="text"
              value={details}
              placeholder={t('activitiesDetailsPlaceholder')}
              onChange={(event) => setDetails(event.target.value)}
              disabled={busy}
              maxLength={200}
            />
          </div>

          <button
            type="button"
            className={`workact__mic${recording ? ' workact__mic--rec' : ''}`}
            aria-label={recording ? t('voiceStop') : t('voiceRecord')}
            onClick={recording ? voice.stopRecording : voice.startRecording}
            disabled={busy}
          >
            {recording ? <StopIcon size={38} /> : <MicIcon size={44} />}
          </button>

          <p
            className={`workact__status${recording ? ' workact__status--rec' : ''}`}
            role="status"
          >
            {statusLine}
          </p>

          {voice.clip && (
            <div className="workact__review">
              <button
                type="button"
                className="workact__chip"
                onClick={voice.togglePlayback}
                aria-label={voice.playing ? t('voiceStop') : t('voicePlay')}
              >
                {voice.playing ? <StopIcon size={17} /> : <PlayIcon size={17} />}
                <span>{voice.playing ? t('voiceStop') : t('voicePlay')}</span>
              </button>
              <button
                type="button"
                className="workact__chip workact__chip--retake"
                onClick={voice.deleteClip}
              >
                <RefreshIcon size={17} />
                <span>{t('voiceRetake')}</span>
              </button>
            </div>
          )}

          {voice.micError && (
            <p className="workact__error" role="alert">
              {t('voiceMicError')}
            </p>
          )}

          {/* Attachments — pick images/videos from the device; each preview
              carries a remove chip; the label wraps the hidden file input. */}
          <div className="workact__attachments">
            {attachments.map((file, index) => (
              <div key={`${file.name}-${index}`} className="workact__attachment">
                {String(file.type ?? '').startsWith('video/') ? (
                  <video
                    className="workact__attachment-media"
                    src={file.dataUrl}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="workact__attachment-media"
                    src={file.dataUrl}
                    alt={file.name}
                  />
                )}
                <button
                  type="button"
                  className="workact__attachment-remove"
                  aria-label={t('activitiesRemoveAttachment')}
                  onClick={() => removeAttachment(index)}
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
            {attachments.length < MAX_ATTACHMENTS && (
              <label className="workact__attachment-add">
                <CameraIcon size={18} />
                <span>{t('activitiesAddPhotoVideo')}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handlePickFiles}
                  disabled={busy}
                />
              </label>
            )}
          </div>

          <button
            type="button"
            className="btn-primary workact__submit"
            onClick={handleSubmit}
            disabled={!voice.clip || !details.trim() || busy}
          >
            <CheckCircleIcon size={20} />
            <span>{t('activitiesSubmit')}</span>
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
