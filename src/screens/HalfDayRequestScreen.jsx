/**
 * HalfDayRequestScreen.jsx — voice-based "Apply for Half Day".
 *
 * Opened from the Other screen's half-day tile (App.jsx routes the
 * 'half-day' screen key here). Instead of typing, the worker records a
 * short voice note for the supervisor:
 *
 *   1. tap the big round mic → MediaRecorder records from getUserMedia
 *      (pulsing coral ring + a running timer; auto-stops after a minute)
 *   2. listen back with Play / Stop, or Retake to delete the clip and
 *      record again
 *   3. Submit → files the request in the SHARED data layer (data/db.js —
 *      addRequest): labour id + name, date, time, type 'half_day' and the
 *      voice note as a data URL, status 'pending'. One pending/approved
 *      half-day request per labour per day — a repeat submission is
 *      refused with an "already requested" message. The supervisor's
 *      Requests inbox reads the same record, and the decision (Approved /
 *      Rejected) syncs back here live via the app's sync bridge.
 *   4. a success toast pops, then the screen returns to Other — whose
 *      tile shows the request's live status.
 *
 * If the microphone is unavailable or permission is denied, a friendly
 * inline message appears and the back button stays available.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Toast from '../components/Toast.jsx';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  MicIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
} from '../components/icons.jsx';
import { useI18n } from '../i18n.jsx';
import {
  REQUEST_TYPES,
  addRequest,
  findActiveRequest,
  getCurrentLabour,
} from '../data/db.js';
// The recording caps and the mm:ss label live in the shared voice-note
// engine (utils/voiceNote.js) so every voice form stays in sync.
import {
  formatVoiceTime as formatTime,
  MAX_RECORDING_MS,
  MAX_SAVED_AUDIO_CHARS,
} from '../utils/voiceNote.js';

/** How long the success toast shows before the screen returns to Other. */
const SENT_TOAST_MS = 1500;

export default function HalfDayRequestScreen({ onBack }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);

  // Duplicate guard: a pending/approved half-day request for today already
  // exists (the Other screen's tile is disabled then, but a stale navigation
  // can still land here) — show the message and lock the form.
  const [alreadyRequested] = useState(() =>
    Boolean(findActiveRequest(getCurrentLabour().id, REQUEST_TYPES.HALF_DAY)),
  );

  // idle → recording → recorded → submitted (the screen's one state line).
  const [phase, setPhase] = useState('idle');
  const [micError, setMicError] = useState(false); // mic missing / denied
  const [elapsedMs, setElapsedMs] = useState(0); // running (or final) length
  const [playing, setPlaying] = useState(false);
  // The finished clip — { url (blob: playback), blob, dataUrl (persistence) }.
  const [clip, setClip] = useState(null);

  // Media objects and timers live in refs: they must survive re-renders
  // and be released on unmount, but never drive the UI directly.
  const recordingRef = useRef(null); // active MediaRecorder
  const streamRef = useRef(null); // getUserMedia stream (mic)
  const chunksRef = useRef([]); // recorded Blob parts
  const clipRef = useRef(null); // mirror of `clip` for event callbacks
  const audioRef = useRef(null); // playback Audio element
  const startedAtRef = useRef(0); // Date.now() when recording began
  const tickRef = useRef(null); // recording timer interval
  const navigateRef = useRef(null); // post-submit navigation timer

  /** Replace (or clear) the clip, revoking the previous blob URL. */
  const applyClip = useCallback((next) => {
    if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    clipRef.current = next;
    setClip(next);
  }, []);

  /** Delete the current clip — Retake, or starting a fresh recording. */
  const discardClip = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
    applyClip(null);
    setElapsedMs(0);
  }, [applyClip]);

  /** Release the microphone (the browser tab's recording indicator too). */
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /* ---- recording ----------------------------------------------------------
     The mic button toggles: start asks for the microphone and begins a
     MediaRecorder capture; stop finalises the clip. A 200ms tick drives
     the on-screen timer and auto-stops at the one-minute cap. */

  /** Stop the active recording — the recorder's onstop builds the clip. */
  const stopRecording = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const recorder = recordingRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  /** Ask for the microphone and start recording (replaces any old clip). */
  const startRecording = useCallback(async () => {
    discardClip();
    setMicError(false);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === 'undefined'
    ) {
      setMicError(true); // no mic support — friendly message, back stays open
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recordingRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        cleanupStream();
        recordingRef.current = null;
        setElapsedMs(Math.min(MAX_RECORDING_MS, Date.now() - startedAtRef.current));
        if (!blob.size) {
          setPhase('idle'); // nothing captured — back to the hint
          return;
        }
        // The clip plays from a blob URL right away; the data URL (for the
        // saved request) is filled in once the async read finishes.
        const url = URL.createObjectURL(blob);
        const next = { url, blob, dataUrl: '' };
        clipRef.current = next;
        setClip(next);
        setPhase('recorded');
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          // Only attach to the clip still on screen — a quick Retake may
          // have replaced it while the read was in flight.
          if (clipRef.current && clipRef.current.url === url) {
            const updated = {
              ...clipRef.current,
              dataUrl: dataUrl.length <= MAX_SAVED_AUDIO_CHARS ? dataUrl : '',
            };
            clipRef.current = updated;
            setClip(updated);
          }
        };
        reader.readAsDataURL(blob);
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase('recording');
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) stopRecording(); // auto-stop at 1 min
      }, 200);
    } catch {
      // Permission denied, no device, or the stream failed — stay usable.
      cleanupStream();
      recordingRef.current = null;
      setPhase('idle');
      setMicError(true);
    }
  }, [cleanupStream, discardClip, stopRecording]);

  /* ---- playback · retake · submit ----------------------------------------- */

  /** Play / stop the recorded clip (listen before submitting). */
  const togglePlayback = useCallback(() => {
    if (!clip) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(clip.url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio.play().catch(() => setPlaying(false));
    setPlaying(true);
  }, [clip, playing]);

  /** Submit → file the request in the SHARED data layer (data/db.js):
      labour id + name, date, time, type and the voice note, status
      'pending'. One pending/approved half-day per labour per day — a
      repeat submission returns the existing record (created === false)
      and pops the "already requested" message instead. Then toast and
      return to the Other screen, whose tile shows the live status. */
  const handleSubmit = useCallback(() => {
    if (!clip || phase === 'submitted' || alreadyRequested) return;
    const labour = getCurrentLabour();
    const result = addRequest({
      labourId: labour.id,
      labourName: labour.name,
      type: REQUEST_TYPES.HALF_DAY,
      // Optional voice note as a data URL — '' when too large to store.
      voiceNote: clip.dataUrl || undefined,
    });
    setPhase('submitted');
    setToast(t(result?.created === true ? 'halfDaySent' : 'halfDayDuplicate'));
    navigateRef.current = setTimeout(onBack, SENT_TOAST_MS);
  }, [alreadyRequested, clip, onBack, phase, t]);

  /* ---- leaving the screen: release the mic, timers and the clip ---------- */
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (navigateRef.current) clearTimeout(navigateRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      if (audioRef.current) audioRef.current.pause();
    },
    [],
  );

  /* ---- render --------------------------------------------------------------
     Same shell as the other detail screens: topbar (logo + language),
     round back button, centred body. The mic is the hero control; the
     status line, review chips and submit button follow underneath. */
  const recording = phase === 'recording';
  const busy = phase === 'submitted';
  const statusLine =
    recording
      ? `${t('halfDayRecording')} ${formatTime(elapsedMs)}`
      : clip
        ? formatTime(elapsedMs)
        : t('halfDayRecordHint');

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

        {/* halfday__body: scoped positioning — see screens.css (.halfday__body). */}
        <div className="detail__body halfday__body">
          <h1 className="screen__title">{t('otherHalfDay')}</h1>
          <p className="screen__subtitle">{t('halfDaySub')}</p>

          <button
            type="button"
            className={`halfday__mic${recording ? ' halfday__mic--rec' : ''}`}
            aria-label={recording ? t('halfDayStop') : t('halfDayRecord')}
            onClick={recording ? stopRecording : startRecording}
            disabled={busy || alreadyRequested}
          >
            {recording ? <StopIcon size={38} /> : <MicIcon size={44} />}
          </button>

          <p
            className={`halfday__status${recording ? ' halfday__status--rec' : ''}`}
            role="status"
          >
            {statusLine}
          </p>

          {clip && (
            <div className="halfday__review">
              <button
                type="button"
                className="halfday__chip"
                onClick={togglePlayback}
                aria-label={playing ? t('halfDayStopPlay') : t('halfDayPlay')}
              >
                {playing ? <StopIcon size={17} /> : <PlayIcon size={17} />}
                <span>{playing ? t('halfDayStopPlay') : t('halfDayPlay')}</span>
              </button>
              <button
                type="button"
                className="halfday__chip halfday__chip--retake"
                onClick={discardClip}
              >
                <RefreshIcon size={17} />
                <span>{t('halfDayRetake')}</span>
              </button>
            </div>
          )}

          {(micError || alreadyRequested) && (
            <p className="halfday__error" role="alert">
              {alreadyRequested ? t('halfDayDuplicate') : t('halfDayMicError')}
            </p>
          )}

          <button
            type="button"
            className="btn-primary halfday__submit"
            onClick={handleSubmit}
            disabled={!clip || busy || alreadyRequested}
          >
            <CheckCircleIcon size={20} />
            <span>{t('halfDaySubmit')}</span>
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
