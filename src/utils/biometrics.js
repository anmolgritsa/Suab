/**
 * biometrics.js — the device's own screen-lock authentication.
 *
 * The requirement: "use the phone's existing screen-lock authentication
 * (fingerprint / PIN / pattern via the platform's biometric/local
 * authentication API) if supported". In the browser that API is WebAuthn
 * with the PLATFORM authenticator — the same OS prompt that unlocks the
 * device itself (Windows Hello, Touch ID, Android fingerprint, …). On a
 * native build this module would be swapped for BiometricPrompt /
 * LocalAuthentication without changing the callers.
 *
 * How it works:
 *   - isPlatformAuthAvailable()  asks the browser whether a built-in
 *     user-verifying authenticator exists (async capability probe).
 *   - authenticateWithPlatform() runs the OS prompt. The FIRST call
 *     enrols a device passkey (navigator.credentials.create — the OS
 *     asks for the fingerprint/face/PIN right there); every later call
 *     verifies against it (navigator.credentials.get). Success/failure
 *     is decided by the OS, so no app-side credential is involved.
 *
 * Everything degrades gracefully: no WebAuthn, an insecure context or a
 * cancelled prompt simply resolves to false and the caller falls back to
 * the in-app PIN / pattern (or the mock scan in the demo).
 */

import { STORAGE_KEYS, readJson, writeJson, removeKey } from './storage.js';

/** Ask the browser if this device has a built-in biometric/lock-screen authenticator. */
export async function isPlatformAuthAvailable() {
  try {
    const probe = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
    if (!probe) return false;
    return Boolean(await probe.call(window.PublicKeyCredential));
  } catch {
    return false;
  }
}

/** Random 32-byte challenge for the WebAuthn ceremony. */
function freshChallenge() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return bytes;
}

/** base64 <-> Uint8Array helpers for the stored credential id. */
function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/**
 * Run the platform (OS lock-screen) authentication prompt.
 * Resolves true when the device verified the user, false when the prompt
 * was cancelled, failed, or the platform authenticator is unavailable.
 */
export async function authenticateWithPlatform() {
  if (!window.PublicKeyCredential || !window.crypto?.subtle) return false;
  try {
    const storedId = readJson(STORAGE_KEYS.BIOMETRIC_ID, null);

    if (!storedId) {
      // First use: enrol a device-bound passkey. The OS itself asks for
      // the fingerprint / face / lock-screen PIN during this prompt.
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: freshChallenge(),
          rp: { name: 'SUAB Factory App' },
          user: {
            id: freshChallenge().slice(0, 16),
            name: 'suab-worker',
            displayName: 'SUAB Worker',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      });
      writeJson(STORAGE_KEYS.BIOMETRIC_ID, bytesToBase64(new Uint8Array(credential.rawId)));
      return true;
    }

    // Every later unlock: verify against the enrolled passkey.
    await navigator.credentials.get({
      publicKey: {
        challenge: freshChallenge(),
        allowCredentials: [{ type: 'public-key', id: base64ToBytes(storedId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return true;
  } catch {
    return false; // cancelled / unsupported / failed verification
  }
}

/** Forget the enrolled passkey (demo reset). */
export function clearBiometricEnrolment() {
  removeKey(STORAGE_KEYS.BIOMETRIC_ID);
}
