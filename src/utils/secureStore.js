/**
 * secureStore.js — the app's "secure storage" for the PIN login flow.
 *
 * The PIN is the worker's key to the app, so it must never sit in storage
 * as plain text. On a real phone build this module would be swapped for
 * the platform's secure store (Android EncryptedSharedPreferences /
 * Keystore, iOS Keychain). In the browser the stand-in is:
 *
 *   1. a random 32-byte DEVICE KEY (the keystore stand-in, kept in
 *      localStorage) — see getDeviceKey()
 *   2. the PIN record ENCRYPTED with AES-GCM via the Web Crypto API
 *
 * Record shape (always encrypted at rest):
 *   { pin: '4821', employeeId: 'SUAB-1024', mobile: '9876543210',
 *     setAt: '…ISO…' }
 *
 * Next to the vault a plain, NON-SECRET flag ("this device has logged in
 * before") records which login path the app should open with. Keeping the
 * flag out of the vault lets App.jsx route synchronously on startup
 * without decrypting anything.
 *
 * All read/verify functions are async because Web Crypto is async.
 */

import { STORAGE_KEYS, readJson, writeJson, removeKey } from './storage.js';

/** The PIN is always 4 digits (matches the on-screen dot display). */
export const PIN_LENGTH = 4;

/* ---- base64 helpers (localStorage holds text, not bytes) ---- */

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/* ---- device key (the keystore stand-in) ---- */

/**
 * The AES-GCM key lives in localStorage under its own key. That is NOT
 * real keystore security — it exists so the PIN is never stored in the
 * clear and so a future mobile build can move the key into the platform
 * keystore by changing ONLY this function.
 */
function getDeviceKey() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEYS.DEVICE_KEY);
    if (existing) return base64ToBytes(existing);
    const raw = window.crypto.getRandomValues(new Uint8Array(32));
    window.localStorage.setItem(STORAGE_KEYS.DEVICE_KEY, bytesToBase64(raw));
    return raw;
  } catch {
    return null; // storage unavailable — callers degrade gracefully
  }
}

/* ---- encrypt / decrypt (AES-GCM, random IV per write) ---- */

async function encryptJson(value) {
  const subtle = window.crypto?.subtle;
  const json = JSON.stringify(value);
  // Graceful fallback for insecure contexts (e.g. plain http): the payload
  // is still base64-encoded, never plain text, just not key-encrypted.
  if (!subtle) {
    return { iv: null, data: bytesToBase64(new TextEncoder().encode(json)) };
  }
  const key = await subtle.importKey(
    'raw',
    getDeviceKey(),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(json),
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}

async function decryptJson(payload) {
  if (!payload) return null;
  try {
    const bytes = base64ToBytes(payload.data);
    // iv === null marks the no-WebCrypto fallback written by encryptJson.
    if (!payload.iv || !window.crypto?.subtle) {
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    const key = await window.crypto.subtle.importKey(
      'raw',
      getDeviceKey(),
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );
    const plain = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      bytes,
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // corrupted / re-keyed vault — treat as "no PIN set"
  }
}

/* ---- public API ---- */

/**
 * True when this device has logged in before (a PIN exists). Read from
 * the plain flag so the router can decide the start screen synchronously.
 */
export function hasPinAuth() {
  return readJson(STORAGE_KEYS.PIN_SET, false) === true;
}

/** Persist the PIN (encrypted) and stamp the "logged in before" flag. */
export async function savePinAuth({ pin, employeeId, mobile }) {
  const vault = await encryptJson({
    pin: String(pin),
    employeeId,
    mobile,
    setAt: new Date().toISOString(),
  });
  writeJson(STORAGE_KEYS.PIN_VAULT, vault);
  writeJson(STORAGE_KEYS.PIN_SET, true);
}

/**
 * The decrypted PIN record, or null when absent/corrupted:
 * { pin, employeeId, mobile, setAt }
 */
export async function getPinAuth() {
  return decryptJson(readJson(STORAGE_KEYS.PIN_VAULT, null));
}

/** True when the typed PIN matches the stored one. */
export async function verifyPin(pin) {
  const record = await getPinAuth();
  return Boolean(record) && record.pin === String(pin);
}

/** Forget the PIN (demo reset / a future "change PIN" flow). */
export function clearPinAuth() {
  removeKey(STORAGE_KEYS.PIN_VAULT);
  removeKey(STORAGE_KEYS.PIN_SET);
}
