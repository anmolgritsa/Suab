/**
 * smoke-test.mjs — quick node check of the pure logic layers.
 * Run with:  node smoke-test.mjs
 * (Not part of the app bundle — just a developer sanity check.)
 *
 * Two sections:
 *   1. login validation (utils/validation.js) — a worker logs in with the
 *      mobile number and Employee ID their supervisor handed out, so the
 *      validators only have to check that both are present and sensible.
 *   2. the PIN vault (utils/secureStore.js) — save / read / verify / clear
 *      round-trip, plus the "the PIN is never stored as plain text" and
 *      "a corrupted vault degrades to no-PIN" guarantees.
 */

import {
  validatePhone,
  validateEmployeeId,
  checkLogin,
  DEMO_EMPLOYEE_ID,
} from './src/utils/validation.js'

let failures = 0

function t(label, actual, expected) {
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(ok ? 'PASS' : 'FAIL', label, '->', JSON.stringify(actual))
}

/* ---- phone ---- */
t('phone empty', validatePhone(''), 'Please enter your phone number')
t('phone short', validatePhone('98765'), 'Phone number must be exactly 10 digits')
t('phone starts 5', validatePhone('5876543210'), 'Indian mobile numbers start with 6-9')
t('phone ok', validatePhone('9876543210'), '')

/* ---- employee id ---- */
t('employee id empty', validateEmployeeId(''), 'Please enter your Employee ID')
t('employee id too short', validateEmployeeId('A1'), 'Employee ID looks too short — check it with your supervisor')
t('employee id bad chars', validateEmployeeId('SUAB 1024!'), 'Employee ID can only contain letters, numbers, dots, dashes and slashes')
t('employee id ok', validateEmployeeId('SUAB-1024'), '')
t('employee id with slashes ok', validateEmployeeId('DL/2210'), '')

/* ---- combined login check (phone is reported first) ---- */
t('login missing employee id', checkLogin('9876543210', ''), 'Please enter your Employee ID')
t('login bad phone reported first', checkLogin('12345', 'SUAB-1024'), 'Phone number must be exactly 10 digits')
t('login ok', checkLogin('9876543210', 'SUAB-1024'), '')
console.log('DEMO_EMPLOYEE_ID =', DEMO_EMPLOYEE_ID)

/* ---- async flavour of t() for the PIN vault ----
   every ta(...) call below is awaited: t() bumps `failures` from inside
   a microtask, so an un-awaited call would settle after the exit-code
   gate at the bottom and could never fail the run. */
async function ta(label, promise, expected) {
  t(label, await promise, expected)
}

/* ==========================================================================
   PIN vault (utils/secureStore.js)
   --------------------------------------------------------------------------
   secureStore talks to window.localStorage (and Web Crypto when present),
   neither of which exists in node — so a tiny in-memory window mock is
   installed BEFORE the dynamic import below. Without crypto.subtle the
   module automatically falls back to base64-only storage (its documented
   "insecure context" path), so the API contract is exercised either way.
   ========================================================================== */

const memory = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    clear: () => memory.clear(),
  },
  crypto: globalThis.crypto, // undefined on older node → base64 fallback
}

const { STORAGE_KEYS } = await import('./src/utils/storage.js')
const {
  PIN_LENGTH,
  hasPinAuth,
  savePinAuth,
  getPinAuth,
  verifyPin,
  clearPinAuth,
} = await import('./src/utils/secureStore.js')

t('PIN_LENGTH is 4', PIN_LENGTH, 4)
await ta('no PIN at first', hasPinAuth(), false)
await ta('getPinAuth empty', getPinAuth(), null)
await ta('verifyPin before any save', verifyPin('1234'), false)

await savePinAuth({ pin: '4821', employeeId: 'SUAB-1024', mobile: '9876543210' })

await ta('hasPinAuth after save', hasPinAuth(), true)
const record = await getPinAuth()
t('record pin', record && record.pin, '4821')
t('record employeeId', record && record.employeeId, 'SUAB-1024')
t('record mobile', record && record.mobile, '9876543210')
t('record stamped with setAt', Boolean(record && record.setAt), true)
await ta('verifyPin correct', verifyPin('4821'), true)
await ta('verifyPin wrong', verifyPin('0000'), false)
await ta('verifyPin accepts a number', verifyPin(4821), true)

/* the vault must never hold the PIN as plain text */
const rawVault = memory.get(STORAGE_KEYS.PIN_VAULT) || ''
t('vault hides the pin', rawVault.includes('"pin":"4821"'), false)

/* a corrupted vault degrades to "no PIN" instead of crashing */
memory.set(STORAGE_KEYS.PIN_VAULT, 'not-json')
await ta('corrupted vault reads as null', getPinAuth(), null)

/* clearPinAuth forgets everything (demo reset / "not you?") */
clearPinAuth()
await ta('hasPinAuth after clear', hasPinAuth(), false)
await ta('getPinAuth after clear', getPinAuth(), null)

if (failures > 0) {
  console.log(`\n${failures} test(s) FAILED`)
  process.exit(1)
}
console.log('\nAll validation tests passed')
