/**
 * smoke-test.mjs — quick node check of the pure validation logic.
 * Run with:  node smoke-test.mjs
 * (Not part of the app bundle — just a developer sanity check.)
 *
 * There is no signup and no PIN: a worker logs in with the mobile number
 * and Employee ID their supervisor handed out, so the validators only have
 * to check that both are present and sensibly formatted.
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

if (failures > 0) {
  console.log(`\n${failures} test(s) FAILED`)
  process.exit(1)
}
console.log('\nAll validation tests passed')
