/**
 * appLock.js — the app lock ("log in once, then unlock") persistence layer.
 *
 * The demo requirement: the worker signs in with their credentials ONCE.
 * Every later time the app opens, an app-lock screen stands between them
 * and the app. The lock accepts three ways in, mirroring a phone's
 * lock screen:
 *
 *   1. the device's own screen-lock auth (fingerprint / face / OS PIN)
 *      via the WebAuthn platform authenticator — see utils/biometrics.js
 *   2. an in-app 4-digit PIN (demo default: 1234)
 *   3. an in-app draw pattern (demo default: an "L")
 *
 * What is stored (localStorage, via utils/storage.js):
 *   APP_LOCK_SET  — plain NON-SECRET flag "this device has logged in
 *                   once", read synchronously by the router on startup.
 *   APP_LOCK      — ENCRYPTED vault (AES-GCM, see utils/secureStore.js)
 *                   holding { pin, pattern, employeeId, mobile, setAt }.
 *                   The identity inside lets App.jsx re-open the session
 *                   after an unlock without re-typing credentials.
 *
 * The vault is written through the same encryption helpers as the legacy
 * PIN vault, so the PIN/pattern never sit on disk in the clear.
 */

import { STORAGE_KEYS, readJson, writeJson, removeKey } from './storage.js';
import { decryptJson, encryptJson } from './secureStore.js';

/** The demo PIN every fresh install starts with. */
export const DEFAULT_PIN = '1234';

/** The demo draw pattern: an "L" across the 3×3 grid (row-major indices). */
export const DEFAULT_PATTERN = [0, 3, 6, 7, 8];

/** A drawn pattern must join at least this many dots to count. */
export const PATTERN_MIN_LENGTH = 4;

/**
 * True when this device has completed a credential login at least once.
 * Read from the plain flag so App.jsx can route synchronously on startup.
 */
export function hasLoggedInOnce() {
  return readJson(STORAGE_KEYS.APP_LOCK_SET, false) === true;
}

/** Stamp the "logged in once" flag (called after the first credential login). */
export function markLoggedInOnce() {
  writeJson(STORAGE_KEYS.APP_LOCK_SET, true);
}

export function clearLoggedInOnce() {
  removeKey(STORAGE_KEYS.APP_LOCK_SET);
}

/**
 * Create (or replace) the lock vault for `identity`:
 *   { mobile, employeeId } — the credentials typed on the login screen.
 * The demo PIN + pattern are seeded so the lock screen works immediately;
 * a future build can let the worker change them after sign-in.
 */
export async function seedAppLock(identity) {
  const vault = await encryptJson({
    pin: DEFAULT_PIN,
    pattern: DEFAULT_PATTERN,
    employeeId: identity.employeeId,
    mobile: identity.mobile,
    setAt: new Date().toISOString(),
  });
  writeJson(STORAGE_KEYS.APP_LOCK, vault);
  writeJson(STORAGE_KEYS.APP_LOCK_SET, true);
}

/**
 * The decrypted lock record, or null when absent/corrupted:
 * { pin, pattern, employeeId, mobile, setAt }
 */
export async function getAppLock() {
  return decryptJson(readJson(STORAGE_KEYS.APP_LOCK, null));
}

/** True when the typed PIN matches the lock's PIN. */
export async function verifyAppPin(pin) {
  const lock = await getAppLock();
  return Boolean(lock) && lock.pin === String(pin);
}

/** True when the drawn pattern matches the lock's pattern (order matters). */
export async function verifyAppPattern(path) {
  const lock = await getAppLock();
  if (!lock || !Array.isArray(lock.pattern)) return false;
  return lock.pattern.join('-') === path.join('-');
}

/** Forget the lock (demo reset / "use another account"). */
export function clearAppLock() {
  removeKey(STORAGE_KEYS.APP_LOCK);
  removeKey(STORAGE_KEYS.APP_LOCK_SET);
}
