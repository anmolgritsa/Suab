/**
 * SupervisorLabourUpdatesScreen.jsx — "Labour Updates" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's "Labour Updates" action card
 * (App.jsx routes Employee ID 9977 here). Shows the labour work updates
 * feed, grouped date-wise:
 *
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Labour Updates" + one-line hint
 *   4. feed         date-wise groups (newest date first); within a date,
 *                   newest updates first — one row per update with the
 *                   labourer's initials avatar, name, ID and time, inline
 *                   image previews and inline video players, plus a status
 *                   badge (green "Submitted")
 *   5. viewer       full-screen overlay with the update enlarged and a
 *                   close button — plays the REAL voice note and shows the
 *                   labourer's details text
 *   6. bottom nav   the shared SupervisorBottomNav — Home is active,
 *                   Reports opens the reports screen, Alerts opens the
 *                   alerts screen
 *
 * The feed is the SHARED updates collection (data/db.js — filed by the
 * labour's Work Activities screen), grouped date-wise. It is LIVE via the
 * sync bridge (useStorageSync): an update submitted in the labour's browser
 * appears here without a refresh. NO demo/static rows are shown — only real
 * submissions from labour. Attached images/videos are saved by the sync
 * server into data/work-uploads/ and rendered inline (<img>/<video>).
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 *  - onOpenReports()  open the "Reports" screen (App.jsx routes to
 *                     'supervisor-reports')
 *  - onOpenAlerts()   open the "Emergency Alerts" screen (App.jsx routes
 *                     to 'supervisor-alerts')
 */

import { useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import { useI18n } from '../i18n.jsx';
import { DB_KEY, getUpdates } from '../data/db.js';
import { mediaOfKind, allMediaOfKind, mediaUrl } from '../data/workUploads.js';
import { todayKey } from '../utils/storage.js';
import { useStorageSync } from '../hooks/useStorageSync.js';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  PlayIcon,
  StopIcon,
  XIcon,
} from '../components/icons.jsx';

// Avatar accent colors, cycled across the feed (the same soft palette the
// dashboard's action cards use).
const AVATAR_COLORS = ['blue', 'green', 'amber', 'purple', 'coral'];

/* ### live-helpers */
// '2026-11-09T09:15:00.000Z' → '9:15 AM' (a live update's display time).
function formatTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

// '2026-11-09' → 'Mon, Nov 9' — a date group's heading.
function formatDateHeading(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// The update's voice note data URL (its first audio media item), or null.
function voiceNoteOf(update) {
  const audio = mediaOfKind(update, 'audio');
  return audio?.dataUrl ?? null;
}

// The labourer's local 'YYYY-MM-DD' key for an ISO timestamp (mirrors
// utils/storage.js todayKey, for records that predate the `date` field).
function dateKeyOf(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The SHARED updates collection (data/db.js) grouped date-wise, newest
 * date first; within a date, newest updates first (getUpdates() is already
 * newest-first). Every real submission is shown — labourers who filed but
 * are not on any roster get their own row. Returns date groups:
 *   [{ dateKey, rows: [{ id, name, labourId, color, update }] }]
 * where update = { at, details, voiceNote, images, videos }.
 */
function buildRows() {
  const groups = new Map();
  // Defensive: getUpdates() must always return an array, and one malformed
  // record (missing fields, non-string dates…) must never take the whole
  // feed down — a throw here happens during render and React unmounts the
  // entire tree (the blank page). Bad records are skipped, not fatal.
  const updates = Array.isArray(getUpdates()) ? getUpdates() : [];
  for (const update of updates) {
    if (!update || typeof update !== 'object') continue;
    const dateKey =
      (typeof update.date === 'string' && update.date) ||
      dateKeyOf(update.createdAt) ||
      todayKey();
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    const bucket = groups.get(dateKey);
    bucket.push({
      id: String(update.id ?? `upd-${bucket.length}`),
      labourId: update.labourId ?? '',
      name: update.labourName || update.labourId || '',
      color: AVATAR_COLORS[bucket.length % AVATAR_COLORS.length],
      update: {
        at: formatTime(update.createdAt),
        details: update.details ?? null,
        // mediaUrl() prefixes server-saved '/api/work-uploads/…' paths with
        // the app's base (data URLs pass through unchanged) — the viewer's
        // Audio element and the inline <img>/<video> all need that.
        voiceNote: mediaUrl(voiceNoteOf(update)),
        images: allMediaOfKind(update, 'image').map((item) => mediaUrl(item.dataUrl)),
        videos: allMediaOfKind(update, 'video').map((item) => mediaUrl(item.dataUrl)),
      },
    });
  }
  return [...groups.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([dateKey, groupRows]) => ({ dateKey, rows: groupRows }));
}

/* ### screen */
export default function SupervisorLabourUpdatesScreen({
  onBack,
  onOpenReports,
  onOpenAlerts,
}) {
  /* ### state */
  const { t } = useI18n();

  // The feed with each update joined on — LIVE via the sync bridge: a work
  // update submitted in the labour's browser re-merges the groups here
  // without a refresh (no manual reload).
  const [groups, setGroups] = useState(buildRows);
  useStorageSync(() => setGroups(buildRows()), DB_KEY);

  // The labourer whose update is open in the full-screen viewer (or null).
  const [viewing, setViewing] = useState(null);

  // Real voice-note playback inside the viewer (live updates only) — one
  // clip at a time, stopped when the viewer closes or the screen unmounts.
  const [viewerPlaying, setViewerPlaying] = useState(false);
  const viewerAudioRef = useRef(null);

  useEffect(
    () => () => {
      viewerAudioRef.current?.pause();
      viewerAudioRef.current = null;
    },
    [],
  );

  /** Close the viewer, stopping any playback first. */
  function closeViewer() {
    viewerAudioRef.current?.pause();
    viewerAudioRef.current = null;
    setViewerPlaying(false);
    setViewing(null);
  }

  /** Play/stop the open update's REAL voice note (live rows only). */
  function toggleViewerAudio() {
    if (!viewing?.update?.voiceNote) return;
    if (viewerPlaying) {
      viewerAudioRef.current?.pause();
      viewerAudioRef.current = null;
      setViewerPlaying(false);
      return;
    }
    const audio = new Audio(viewing.update.voiceNote);
    viewerAudioRef.current = audio;
    audio.onended = () => {
      setViewerPlaying(false);
      viewerAudioRef.current = null;
    };
    viewerAudioRef.current = audio;
    audio.play().catch(() => setViewerPlaying(false));
    setViewerPlaying(true);
  }

  /* ### helpers */
  // Two-letter initials for a labourer's avatar circle (same helper as the
  // assign screen).
  function initials(name) {
    return name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  /* ### render */
  return (
    <div className="home supu">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('supUpdatesBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supUpdatesBack')}</span>
      </button>

      <h1 className="screen__title">{t('supUpdatesTitle')}</h1>
      <p className="screen__subtitle">{t('supUpdatesSub')}</p>

      <main className="supu__body">
        {groups.length === 0 ? (
          /* Empty state — no real submissions yet (no demo rows are shown). */
          <p className="supu__empty">{t('supUpdatesEmpty')}</p>
        ) : (
          groups.map((group) => (
            <section key={group.dateKey} className="supu__date-group">
              <h2 className="supu__date-heading">{formatDateHeading(group.dateKey)}</h2>
              <ul className="supu__list">
                {group.rows.map((row) => (
                  <li key={row.id} className="supu__row">
                    <span
                      className={`supu__avatar supu__avatar--${row.color}`}
                      aria-hidden="true"
                    >
                      {initials(row.name)}
                    </span>
                    <span className="supu__text">
                      <strong>{row.name}</strong>
                      <small>
                        {row.labourId}
                        {row.update.at ? ` · ${row.update.at}` : ''}
                      </small>
                      {row.update.details ? (
                        <span className="supu__details">{row.update.details}</span>
                        ) : null}
                      {row.update.images.length > 0 && (
                        /* Inline image previews — click to open the viewer. */
                        <span className="supu__media">
                          {row.update.images.map((src, index) => (
                            <img
                              key={`${row.id}-img-${index}`}
                              className="supu__media-img"
                              src={src}
                              alt={`${row.name}'s work photo ${index + 1}`}
                              loading="lazy"
                              onClick={() => setViewing(row)}
                            />
                          ))}
                        </span>
                      )}
                      {row.update.videos.length > 0 && (
                        /* Inline video players — the supervisor watches
                           directly, no download or viewer needed. */
                        <span className="supu__media">
                          {row.update.videos.map((src, index) => (
                            <video
                              key={`${row.id}-vid-${index}`}
                              className="supu__media-video"
                              src={src}
                              controls
                              playsInline
                              preload="metadata"
                            />
                          ))}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="supu__thumb"
                      aria-label={t('supUpdatesView')}
                      onClick={() => setViewing(row)}
                    >
                      <PlayIcon size={16} aria-hidden="true" />
                    </button>
                    <span className="supu__badge supu__badge--on">
                      <CheckCircleIcon size={12} aria-hidden="true" />
                      {t('supUpdatesSubmitted')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {/* Bottom tab navigation — Home is active; Reports and Alerts open
          their screens. */}
      <SupervisorBottomNav
        active="home"
        onReports={onOpenReports}
        onAlerts={onOpenAlerts}
      />

      {/* Full-screen viewer — the update enlarged: plays its REAL voice
          note and shows the labourer's details text. */}
      {viewing && (
        <div
          className="supu__modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('supUpdatesVideo')}
        >
          <button
            type="button"
            className="supu__modal-close"
            aria-label={t('supUpdatesClose')}
            onClick={closeViewer}
          >
            <XIcon size={20} aria-hidden="true" />
          </button>
          <div className="supu__modal-media">
            {viewing.update.voiceNote ? (
              /* Live voice note — a real play/stop button over the
                 placeholder (the clip plays through an Audio element). */
              <button
                type="button"
                className="supu__modal-play"
                aria-label={
                  viewerPlaying ? t('voiceStop') : t('supUpdatesVoiceNote')
                }
                onClick={toggleViewerAudio}
              >
                {viewerPlaying ? (
                  <StopIcon size={40} aria-hidden="true" />
                ) : (
                  <PlayIcon size={56} aria-hidden="true" />
                )}
              </button>
            ) : (
              <PlayIcon size={56} aria-hidden="true" />
            )}
          </div>
          <p className="supu__modal-caption">
            <strong>{viewing.name}</strong>
            <span>{viewing.update.at}</span>
            {viewing.update.details ? (
              <span className="supu__modal-details">{viewing.update.details}</span>
            ) : null}
          </p>
        </div>
      )}
    </div>
  );
}
