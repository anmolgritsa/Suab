/**
 * validation.js — small, pure functions that check form values.
 *
 * Each validator returns an error message string, or '' (empty string)
 * when the value is valid. Returning '' keeps the call sites simple:
 *   const error = validatePhone(phone);  // '' means "no problem"
 *
 * There is no signup in this app: a worker's credentials (mobile number
 * and Employee ID) are handed out by their supervisor, so login only has
 * to check that both are present and sensibly formatted.
 */

/** Example Employee ID shown on the login screen (any valid ID is accepted). */
export const DEMO_EMPLOYEE_ID = 'SUAB-1024';

/** Keep only the digits of a string: '+91 98765 43210' -> '9876543210'. */
export function onlyDigits(value) {
  return (value || '').replace(/\D/g, '');
}

/** Phone Number: exactly 10 digits (Indian mobile numbers). */
export function validatePhone(phone) {
  const digits = onlyDigits(phone);
  if (!digits) return 'Please enter your phone number';
  if (digits.length !== 10) return 'Phone number must be exactly 10 digits';
  if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6-9';
  return '';
}

/**
 * Employee ID: issued by the worker's supervisor (e.g. 'SUAB-1024' or
 * 'DL/2210'). Must be non-empty, at least 3 characters, and made only of
 * letters, digits, dots, dashes and slashes — no spaces or symbols.
 */
export function validateEmployeeId(employeeId) {
  const id = (employeeId ?? '').trim();
  if (!id) return 'Please enter your Employee ID';
  if (id.length < 3) return 'Employee ID looks too short — check it with your supervisor';
  if (!/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(id)) {
    return 'Employee ID can only contain letters, numbers, dots, dashes and slashes';
  }
  return '';
}

/**
 * Check a login attempt. Both values come from the supervisor:
 *  - the phone must be a valid 10-digit mobile number
 *  - the Employee ID must be present and sensibly formatted
 * The phone is checked first so its error is reported first.
 */
export function checkLogin(phone, employeeId) {
  return validatePhone(phone) || validateEmployeeId(employeeId);
}
