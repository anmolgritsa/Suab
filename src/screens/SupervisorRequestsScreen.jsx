/**
 * SupervisorRequestsScreen.jsx — "Requests" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's "Requests" action card (App.jsx
 * routes Employee ID 9977 here). Shows the labourers' half-day and
 * overtime requests as compact cards:
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Requests" + one-line hint
 *   4. cards        one card per request — initials avatar, name, ID, date
 *                   and request time, a color-coded type badge (Half Day /
 *                   Overtime, with the requested hours for overtime), the
 *                   reason text, a voice-note player (real playback of the
 *                   labour's recorded clip when one is attached; a demo
 *                   waveform for the seeded requests; a muted "no voice
 *                   note" state otherwise), a status badge (Pending /
 *                   Approved / Rejected) and — while pending — Approve /
 *                   Reject buttons
 *   5. decisions    Approve/Reject flip the card's status badge, hide the
 *                   buttons and toast the result. Live labour requests are
 *                   decided ONCE in the shared store (data/db.js —
 *                   setRequestDecision refuses a second decision, so two
 *                   tabs can't double-handle); the demo requests persist in
 *                   data/requests.js as before.
 *
 * The inbox reads the SHARED requests collection (data/db.js) live via the
 * sync bridge: a labour submission or a decision in another tab appears
 * here without a refresh. The seeded demo requests are merged in below the
 * live ones so the screen keeps its populated look.
 *
 * Props:
 *  - onBack()  return to the Supervisor dashboard
 */

import { useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import Toast from '../components/Toast.jsx';
import { useI18n } from '../i18n.jsx';
import { EMPLOYEE_ROSTER } from '../data/assignments.js';
import {
  getSupervisorRequests,
  setRequestStatus,
  REQUEST_STATUSES,
  REQUEST_TYPES,
} from '../data/requests.js';
import {
  DB_KEY,
  REQUEST_TYPES as DB_REQUEST_TYPES,
  getRequests,
  setRequestDecision,
} from '../data/db.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ClockPlusIcon,
  MicIcon,
  PlayIcon,
  StopIcon,
  TimerIcon,
  XIcon,
} from '../components/icons.jsx';

/* ### demo-data */
// Avatar accent colors, cycled across the cards (the same soft palette the
// dashboard's action cards use).
const AVATAR_COLORS = ['blue', 'green', 'amber', 'purple', 'coral'];

/* ### helpers */
// Replace {placeholders} in a translated string: fill('{n} hr', { n: 2 })
function fill(text, vars) {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
}

// Two-letter initials for a labourer's avatar circle (same helper as the
// other supervisor screens).
function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// '2026-11-06T09:15:00.000Z' → '9:15 AM' (a live request's display time).
function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

/**
 * The SHARED requests collection (data/db.js) mapped onto the card shape —
 * labour id, name-carrying record, date, time, type, hours, reason and the
 * voice note as a data URL. The db's type values ('half_day' / 'overtime')
 * are mapped onto the demo store's ('halfDay' / 'overtime') so the existing
 * color-coded badges and CSS keep working untouched.
 */
function liveRequests() {
  return getRequests().map((request) => ({
    id: request.id,
    employeeId: request.labourId,
    name: request.labourName ?? null,
    type:
      request.type === DB_REQUEST_TYPES.OVERTIME
        ? REQUEST_TYPES.OVERTIME
        : REQUEST_TYPES.HALF_DAY,
    hours: request.hours,
    reason: request.reason ?? null,
    audio: Boolean(request.voiceNote),
    voiceNote: request.voiceNote ?? null,
    at: formatTime(request.requestedAt),
    date: request.date,
    status: request.status,
    live: true,
  }));
}

/* ### screen */
export default function SupervisorRequestsScreen({ onBack }) {
  /* ### state */
  const { t } = useI18n();

  // The inbox: the SHARED requests collection (live labour requests) plus
  // the seeded demo requests. Live via the sync bridge — a submission or a
  // decision in another tab re-merges the list without a refresh.
  const [requests, setRequests] = useState(() => [
    ...liveRequests(),
    ...getSupervisorRequests(),
  ]);
  useStorageSync(
    () => setRequests([...liveRequests(), ...getSupervisorRequests()]),
    DB_KEY,
  );

  // The request whose voice note is playing — a real <audio> for live
  // clips (audioRef), a simulated waveform for the demo ones.
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  // Leaving the screen stops any real playback.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  /** Play/stop a REAL voice note (live labour request). One clip at a
      time; the badge returns to "play" when the clip ends. */
  function toggleRealAudio(request) {
    if (playing === request.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(request.voiceNote);
    audio.onended = () => {
      setPlaying(null);
      audioRef.current = null;
    };
    audioRef.current = audio;
    audio.play().catch(() => setPlaying(null));
    setPlaying(request.id);
  }

  // Transient toast after a decision.
  const [toast, setToast] = useState(null);

  /* ### decisions */
  // Approve or reject a request. Live labour requests are decided ONCE in
  // the shared store (data/db.js — setRequestDecision refuses a second
  // decision, so a double-click or a second tab can't double-handle); the
  // demo requests persist in data/requests.js as before. Either way the
  // card re-renders with the new status badge and the buttons disappear.
  function decide(request, status) {
    if (request.live) {
      const decided = setRequestDecision(request.id, status);
      if (!decided) return; // already decided (another tab won the race)
    } else {
      setRequestStatus(request.id, status);
    }
    setRequests((current) =>
      current.map((entry) =>
        entry.id === request.id ? { ...entry, status } : entry,
      ),
    );
    setToast(
      status === REQUEST_STATUSES.APPROVED
        ? t('supReqToastApproved')
        : t('supReqToastRejected'),
    );
  }

  /* ### render */
  // The roster's names joined onto each request (the demo store carries
  // only Employee IDs).
  const rows = requests.map((request) => {
    const employee = EMPLOYEE_ROSTER.find(
      (entry) => entry.id === request.employeeId,
    );
    const index = EMPLOYEE_ROSTER.findIndex(
      (entry) => entry.id === request.employeeId,
    );
    return {
      ...request,
      name: request.name ?? employee?.name ?? request.employeeId,
      color: AVATAR_COLORS[(index >= 0 ? index : 0) % AVATAR_COLORS.length],
    };
  });

  return (
    <div className="home supr">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('supReqBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supReqBack')}</span>
      </button>

      <h1 className="screen__title">{t('supReqTitle')}</h1>
      <p className="screen__subtitle">{t('supReqSub')}</p>

      <main className="supr__body">
        <ul className="supr__list">
          {rows.map((request) => (
            <li key={request.id} className="supr__card">
              <div className="supr__head">
                <span
                  className={`supr__avatar supr__avatar--${request.color}`}
                  aria-hidden="true"
                >
                  {initials(request.name)}
                </span>
                <span className="supr__who">
                  <strong>{request.name}</strong>
                  <small>
                    {request.employeeId}
                    {request.date ? ` · ${request.date}` : ''}
                    {request.at ? ` · ${request.at}` : ''}
                  </small>
                </span>
                <span
                  className={`supr__type supr__type--${request.type}`}
                >
                  {request.type === REQUEST_TYPES.OVERTIME ? (
                    <ClockPlusIcon size={12} aria-hidden="true" />
                  ) : (
                    <ClockIcon size={12} aria-hidden="true" />
                  )}
                  {request.type === REQUEST_TYPES.OVERTIME
                    ? t('supReqTypeOvertime')
                    : t('supReqTypeHalfDay')}
                </span>
              </div>

              {request.reason ? (
                <p className="supr__reason">{request.reason}</p>
              ) : (
                <p className="supr__reason supr__reason--none">
                  {t('supReqNoReason')}
                </p>
              )}

              <div className="supr__meta">
                {request.audio || request.voiceNote ? (
                  /* Voice-note player — a real clip for live labour
                     requests, a simulated waveform for the demo ones. */
                  <span className="supr__audio">
                    <button
                      type="button"
                      className="supr__audio-btn"
                      aria-label={
                        playing === request.id
                          ? t('supReqStop')
                          : t('supReqPlay')
                      }
                      onClick={() =>
                        request.voiceNote
                          ? toggleRealAudio(request)
                          : setPlaying(
                              playing === request.id ? null : request.id,
                            )
                      }
                    >
                      {playing === request.id ? (
                        <StopIcon size={13} aria-hidden="true" />
                      ) : (
                        <PlayIcon size={13} aria-hidden="true" />
                      )}
                    </button>
                    <span
                      className={
                        'supr__wave' +
                        (playing === request.id ? ' supr__wave--on' : '')
                      }
                      aria-hidden="true"
                    >
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                ) : (
                  /* Muted "no voice note" state. */
                  <span className="supr__audio supr__audio--none">
                    <MicIcon size={13} aria-hidden="true" />
                    <span>{t('supReqNoAudio')}</span>
                  </span>
                )}

                {request.type === REQUEST_TYPES.OVERTIME &&
                Number.isFinite(request.hours) ? (
                  <span className="supr__hours">
                    <TimerIcon size={13} aria-hidden="true" />
                    {fill(t('supReqHours'), { n: request.hours })}
                  </span>
                ) : null}

                <span
                  className={`supr__status supr__status--${request.status}`}
                >
                  {request.status === REQUEST_STATUSES.APPROVED ? (
                    <CheckCircleIcon size={12} aria-hidden="true" />
                  ) : request.status === REQUEST_STATUSES.REJECTED ? (
                    <XIcon size={12} aria-hidden="true" />
                  ) : (
                    <ClockIcon size={12} aria-hidden="true" />
                  )}
                  {request.status === REQUEST_STATUSES.APPROVED
                    ? t('supReqApproved')
                    : request.status === REQUEST_STATUSES.REJECTED
                      ? t('supReqRejected')
                      : t('supReqPending')}
                </span>
              </div>

              {request.status === REQUEST_STATUSES.PENDING && (
                <div className="supr__actions">
                  <button
                    type="button"
                    className="supr__act supr__act--approve"
                    onClick={() => decide(request, REQUEST_STATUSES.APPROVED)}
                  >
                    <CheckCircleIcon size={14} aria-hidden="true" />
                    <span>{t('supReqApprove')}</span>
                  </button>
                  <button
                    type="button"
                    className="supr__act supr__act--reject"
                    onClick={() => decide(request, REQUEST_STATUSES.REJECTED)}
                  >
                    <XIcon size={14} aria-hidden="true" />
                    <span>{t('supReqReject')}</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <p className="supr__empty">{t('supReqEmpty')}</p>
        )}
      </main>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
