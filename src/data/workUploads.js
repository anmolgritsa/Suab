/**
 * workUploads.js — resolve a work-update media item's URL for rendering.
 *
 * The sync server saves a labour's attached image/video/audio into
 * data/work-uploads/ and stores the served path ('/api/work-uploads/x.jpg')
 * on the update record (see server/syncServer.js). The app is served under
 * a base path ('/Suab-deploy/'), so those root-relative paths must be
 * prefixed with BASE_URL before an <img>/<video> can load them — the same
 * rule data/syncBridge.js applies to its API endpoints.
 *
 * A media item that still carries a data: URL (offline / no sync server)
 * renders directly, so nothing breaks without the backend.
 */

/** True when the value is a data: URL (self-contained, no prefix needed). */
export function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

/**
 * The URL an <img>/<video>/<audio> should load for a media item's dataUrl:
 *  - data: URL          → returned unchanged
 *  - '/api/…' path      → BASE_URL-prefixed (works in dev + preview + Pages)
 *  - anything else      → returned unchanged (already absolute)
 *
 * The prefix is plain STRING concatenation, deliberately NOT new URL(path,
 * BASE_URL): BASE_URL ('/Suab-deploy/') is a RELATIVE path, which is an
 * invalid URL base — new URL() threw 'TypeError: Invalid URL' for every
 * server-saved upload, the supervisor feed's buildRows() died mid-render
 * and React unmounted the whole tree (the blank updates page). Concat keeps
 * the exact same result ('/Suab-deploy/' + 'api/…') without ever throwing.
 */
export function mediaUrl(dataUrl) {
  const value = String(dataUrl ?? '');
  if (!value || isDataUrl(value)) return value;
  if (value.startsWith('/api/')) {
    const base = String(import.meta.env?.BASE_URL ?? '/');
    return base.endsWith('/') ? `${base}${value.slice(1)}` : `${base}${value}`;
  }
  return value;
}

/** The update's media array, tolerating a missing/malformed record. */
function mediaListOf(update) {
  return Array.isArray(update?.media) ? update.media : [];
}

/** The first media item of the given kind on an update, or null. */
export function mediaOfKind(update, kind) {
  return mediaListOf(update).find((item) => item?.kind === kind && item?.dataUrl) ?? null;
}

/** Every media item of the given kind on an update (may be empty). */
export function allMediaOfKind(update, kind) {
  return mediaListOf(update).filter((item) => item?.kind === kind && item?.dataUrl);
}
