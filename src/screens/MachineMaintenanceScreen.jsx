/**
 * MachineMaintenanceScreen.jsx — voice-based "Report Machine Maintenance".
 *
 * Opened from the Other screen's maintenance tile (App.jsx routes the
 * 'machine-maintenance' screen key here). Like the half-day request and
 * work-activities screens, the worker records a short voice note instead
 * of typing: tap the big round mic → the shared voice engine (useVoiceNote,
 * utils/voiceNote.js) records — pulsing coral ring, running timer,
 * auto-stop after a minute → Play / Retake to review or replace the take →
 * Submit saves the clip as a data URL on a work update (saveWorkUpdate,
 * utils/storage.js) marked kind: 'maintenance', so it lands in the
 * supervisor's update feed like any other update → a success toast pops,
 * then the screen returns to Other.
 *
 * Around that voice flow the screen shows the quick-report sections from
 * the reference design (all optional, icon-first, minimal text):
 *   1. machine chip   which machine the report is about — today's
 *                     allotted machine id (getTodayAllotment), e.g. M-04
 *   2. reason chips   three quick-pick cards — "Machine not working" /
 *                     "Unusual sound" / "Other issue" — one tap selects
 *                     (tap again to clear); stored as a short token
 *   3. voice header   "Tell us the problem / Speak in your language"
 *                     above the mic (it carries the idle instruction,
 *                     so the old idle hint line is gone)
 *   4. add photo      OPTIONAL photo evidence — metadata only (name,
 *                     type, size), nothing is uploaded
 *
 * If the microphone is unavailable or permission is denied, a friendly
 * inline message appears and the back button stays available.
 *
 * The voice half is visually identical to the half-day voice form, so it
 * reuses the same scoped styles — every .halfday__* rule in screens.css
 * also matches this screen's .maint__* classes; the new sections add
 * their own .maint__* rules in the same block.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Toast from '../components/Toast.jsx';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  CogIcon,
  HelpIcon,
  MicIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
  VolumeIcon,
  XIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import { getTodayAllotment, saveWorkUpdate } from '../utils/storage.js';
// The shared recording engine: state, mic actions and the mm:ss label.
import {
  formatVoiceTime as formatTime,
  useVoiceNote,
} from '../utils/voiceNote.js';

/** How long the success toast shows before the screen returns to Other. */
const SENT_TOAST_MS = 1500;

/** The three quick-pick reason cards (reference design): a stable token
    `key` is stored on the update, `label` is its i18n key and `icon` is
    the card's coloured glyph (coral = broken, amber = sound, blue = other
    — the same accents the ActionCards/report themes use). */
const REASONS = [
  { key: 'not-working', label: 'mReasonNotWorking', icon: <CogIcon size={22} /> },
  { key: 'sound', label: 'mReasonSound', icon: <VolumeIcon size={22} /> },
  { key: 'other', label: 'mReasonOther', icon: <HelpIcon size={22} /> },
];

/** Build mock attachment metadata from a picked file (no real upload) —
    the same shape the defect ReportForm keeps. */
function fileMeta(file) {
  if (!file) return null;
  return { name: file.name, type: file.type || 'unknown', size: file.size };
}

export default function MachineMaintenanceScreen({ onBack }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false); // submit tapped — freeze the UI
  const navigateRef = useRef(null); // post-submit navigation timer

  // The quick-report extras: today's machine (chip), the picked reason
  // (one of REASONS' keys or null) and the optional photo's metadata.
  const [machineId] = useState(() => getTodayAllotment()?.machineId || null);
  const [reason, setReason] = useState(null);
  const [photo, setPhoto] = useState(null);

  // Hidden <input type="file"> — the visible "Add photo" pill drives it.
  const fileInputRef = useRef(null);

  /** Keep only the picked photo's metadata; clear the input so the same
      file can be picked again after a remove. */
  function handlePickPhoto(event) {
    const file = event.target.files?.[0];
    setPhoto(fileMeta(file));
    event.target.value = '';
  }

  // The shared voice engine: one take at a time; the mic, blob URL and
  // audio element are released on unmount by the hook itself.
  const voice = useVoiceNote();

  /* ---- submit -----------------------------------------------------------
     Persist the take as a work update (the supervisor's update feed) and
     return to Other after the toast. A take too large to store simply
     sends without the clip. */
  const handleSubmit = useCallback(() => {
    if (!voice.clip || busy) return;
    saveWorkUpdate({
      at: new Date().toISOString(),
      kind: 'maintenance', // distinguishes it from the photo/video updates
      machine: machineId || undefined, // which machine the report is about
      reason: reason || undefined, // 'not-working' | 'sound' | 'other'
      photo: photo || undefined, // metadata only — nothing is uploaded
      voiceNote: voice.clip.dataUrl || undefined, // '' when too large to store
    });
    setBusy(true);
    setToast(t('maintenanceSent'));
    navigateRef.current = setTimeout(onBack, SENT_TOAST_MS);
  }, [busy, machineId, onBack, photo, reason, t, voice.clip]);

  /* ---- leaving the screen: cancel the navigation timer ------------------
     (the voice engine releases the mic, blob URL and audio on unmount). */
  useEffect(
    () => () => {
      if (navigateRef.current) clearTimeout(navigateRef.current);
    },
    [],
  );

  /* ---- render -----------------------------------------------------------
     Same shell as the half-day voice screen: topbar (logo + language),
     round back button, centred body — mic hero, status line, review
     chips, submit. The control labels reuse the shared voice-note keys
     (voiceRecord / voiceStop / voicePlay / voiceRetake / voiceMicError). */
  const recording = voice.recording;
  // The idle instruction now lives in the voice header ("Tell us the
  // problem / Speak in your language"), so the status line only speaks
  // up while recording or when a take is ready to review.
  const statusLine = recording
    ? `${t('voiceRecording')} ${formatTime(voice.elapsedMs)}`
    : voice.clip
      ? formatTime(voice.elapsedMs)
      : '';

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

        {/* maint__body: the half-day voice screen's scoped styles shared
            via grouped selectors — see screens.css (.maint__body). */}
        <div className="detail__body maint__body">
          <h1 className="screen__title">{t('otherMaintenance')}</h1>
          <p className="screen__subtitle">{t('maintenanceSub')}</p>

          {/* ---- machine chip (reference design) — which machine the
              report is about: today's allotted machine id. Hidden when
              no allotment was accepted (the chip would be a guess). ---- */}
          {machineId && (
            <div className="maint__machine">
              <span className="maint__machine-icon" aria-hidden="true">
                <CogIcon size={18} />
              </span>
              <span className="maint__machine-text">
                <span className="maint__machine-label">{t('maintenanceMachineLabel')}</span>
                <span className="maint__machine-no">{machineId}</span>
              </span>
            </div>
          )}

          {/* ---- quick-pick reason cards (reference design) — one tap
              tells the supervisor what's wrong; tap again to clear.
              Each card wears its own accent (coral / amber / blue). ---- */}
          <div className="maint__reasons" role="group" aria-label={t('maintenanceReasonsLabel')}>
            {REASONS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                className={
                  `maint__reason maint__reason--${key}` +
                  (reason === key ? ' maint__reason--on' : '')
                }
                onClick={() => setReason(reason === key ? null : key)}
                aria-pressed={reason === key}
                disabled={busy}
              >
                <span className="maint__reason-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="maint__reason-label">{t(label)}</span>
              </button>
            ))}
          </div>

          {/* ---- voice header (reference design) — carries the idle
              instruction, so the status line below stays quiet until the
              worker actually records. ---- */}
          <div className="maint__voicehead">
            <span className="maint__voicehead-icon" aria-hidden="true">
              <MicIcon size={18} />
            </span>
            <span className="maint__voicehead-text">
              <span className="maint__voicehead-title">{t('maintenanceVoiceTitle')}</span>
              <span className="maint__voicehead-sub">{t('maintenanceVoiceSub')}</span>
            </span>
          </div>

          <button
            type="button"
            className={`maint__mic${recording ? ' maint__mic--rec' : ''}`}
            aria-label={recording ? t('voiceStop') : t('voiceRecord')}
            onClick={recording ? voice.stopRecording : voice.startRecording}
            disabled={busy}
          >
            {recording ? <StopIcon size={38} /> : <MicIcon size={44} />}
          </button>

          {statusLine && (
            <p
              className={`maint__status${recording ? ' maint__status--rec' : ''}`}
              role="status"
            >
              {statusLine}
            </p>
          )}

          {voice.clip && (
            <div className="maint__review">
              <button
                type="button"
                className="maint__chip"
                onClick={voice.togglePlayback}
                aria-label={voice.playing ? t('voiceStop') : t('voicePlay')}
              >
                {voice.playing ? <StopIcon size={17} /> : <PlayIcon size={17} />}
                <span>{voice.playing ? t('voiceStop') : t('voicePlay')}</span>
              </button>
              <button
                type="button"
                className="maint__chip maint__chip--retake"
                onClick={voice.deleteClip}
              >
                <RefreshIcon size={17} />
                <span>{t('voiceRetake')}</span>
              </button>
            </div>
          )}

          {voice.micError && (
            <p className="maint__error" role="alert">
              {t('voiceMicError')}
            </p>
          )}

          {/* ---- add photo (reference design, OPTIONAL) — the same
              metadata-only picker the defect ReportForm uses: the pill
              drives a hidden file input; a picked photo shows as a row
              with its name and a remove button. ---- */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="report__file-input"
            onChange={handlePickPhoto}
            tabIndex={-1}
            aria-hidden="true"
          />
          {photo ? (
            <div className="report__attachment maint__photo">
              <span className="report__attachment-icon" aria-hidden="true">
                <CameraIcon size={18} />
              </span>
              <span className="report__attachment-name">{photo.name}</span>
              <button
                type="button"
                className="report__attachment-remove"
                aria-label={t('removeFile')}
                onClick={() => setPhoto(null)}
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="report__pick maint__photo-pick"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <CameraIcon size={20} />
              <span>{t('maintenanceAddPhoto')}</span>
            </button>
          )}

          <button
            type="button"
            className="btn-primary maint__submit"
            onClick={handleSubmit}
            disabled={!voice.clip || busy}
          >
            <CheckCircleIcon size={20} />
            <span>{t('maintenanceSubmit')}</span>
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
