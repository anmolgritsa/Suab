/**
 * LoginScreen.jsx — "Welcome Back" (mockup 3).
 *
 * There is no signup: a worker's credentials — mobile number and Employee
 * ID — are handed out by their supervisor. The demo accepts any valid pair
 * (a 10-digit mobile starting 6-9, plus any sensible Employee ID such as
 * SUAB-1024). On success App.jsx opens a session record and routes by the
 * day-keyed flow flags: attendance → machine allotment → homepage.
 *
 * When this device already has a PIN (secureStore.hasPinAuth()), the form
 * is joined by quick-unlock options: fingerprint and Face ID (the mock
 * biometric scanners) and an "Unlock with PIN" link. Without a saved PIN
 * those options are mock-only and show a toast instead.
 *
 * "Forgot Password?" and "Help" stay mock-only — they show a toast.
 *
 * All visible text comes from t() (see i18n.jsx), so it follows the
 * language chosen in <LanguageDropdown /> in the top bar.
 *
 * Props:
 *  - registeredUser   optional saved account for the personalised greeting
 *  - onLogin(phone, employeeId)   valid credentials → App.jsx routes on
 *  - onUnlockWithPin()            quick-unlock: the PIN pad screen
 *  - onFingerprint()              quick-unlock: the fingerprint scanner
 *  - onFaceId()                   quick-unlock: the Face ID scanner
 */

import { useState } from 'react'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import TextField from '../components/TextField.jsx'
import PrimaryButton from '../components/PrimaryButton.jsx'
import Toast from '../components/Toast.jsx'
import {
  BadgeIcon,
  FaceIdIcon,
  FingerprintIcon,
  HelpIcon,
  KeyIcon,
  PadlockIcon,
  PhoneIcon,
} from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
import { hasPinAuth } from '../utils/secureStore.js'
import { checkLogin, validatePhone } from '../utils/validation.js'

export default function LoginScreen({
  registeredUser,
  onLogin,
  onUnlockWithPin,
  onFingerprint,
  onFaceId,
}) {
  const { t } = useI18n()
  // A PIN saved on this device (checked here, not passed in) enables the
  // quick-unlock options below — fingerprint, Face ID and the PIN pad.
  const hasPinSaved = hasPinAuth()
  const [phone, setPhone] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  // { field: 'phone' | 'employeeId', message } — shown under the field the
  // message is about (null = no error).
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  function handleLogin(event) {
    event.preventDefault()
    // checkLogin returns '' when everything is fine. It validates the phone
    // first, so a surviving phone error means the message belongs under the
    // phone field — otherwise under the Employee ID field.
    const problem = checkLogin(phone, employeeId)
    if (problem) {
      setError({
        field: validatePhone(phone) ? 'phone' : 'employeeId',
        message: problem,
      })
      return
    }
    onLogin(phone.replace(/\D/g, ''), employeeId.trim())
  }

  /** Show a friendly "this is only a demo" message (key = translation key). */
  function mockAction(messageKey) {
    setToast(t(messageKey))
  }

  return (
    <div className="home login">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      {/* Decorative shapes in the corners (pure CSS, like the mockup). */}
      <div className="decor decor--corner" aria-hidden="true" />

      {/* Everything below is centred in the free space under the top bar. */}
      <div className="login__main">
        {/* Personalised greeting — uses the name saved on this device, if any. */}
        <h1 className="screen__title login__title">{t('loginWelcome')}</h1>
        <p className="login__who">
          {registeredUser ? registeredUser.name : t('loginUseSupervisorId')}
        </p>

        <form className="login__form" onSubmit={handleLogin} noValidate>
          <TextField
            label={t('loginPhone')}
            icon={<PhoneIcon size={18} />}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, ''))
              if (error) setError(null)
            }}
            error={error?.field === 'phone' ? error.message : ''}
            autoComplete="tel"
          />

          <TextField
            label={t('loginEmployeeId')}
            icon={<BadgeIcon size={18} />}
            type="text"
            maxLength={20}
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value)
              if (error) setError(null)
            }}
            error={error?.field === 'employeeId' ? error.message : ''}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />

          {/* <p className="demo-chip">
            {fill(t('loginDemoHint'), { id: DEMO_EMPLOYEE_ID })}
          </p> */}

          <PrimaryButton type="submit">{t('loginButton')}</PrimaryButton>
        </form>

        {/* Quick unlock — only once this device has a PIN to protect.
            Without a saved PIN the fingerprint button stays mock-only. */}
        {hasPinSaved ? (
          <div className="login__quick">
            <button type="button" className="fingerprint" onClick={onFingerprint}>
              <span className="fingerprint__icon" aria-hidden="true">
                <FingerprintIcon size={30} />
              </span>
              {t('loginFingerprint')}
            </button>
            <button type="button" className="fingerprint" onClick={onFaceId}>
              <span className="fingerprint__icon" aria-hidden="true">
                <FaceIdIcon size={30} />
              </span>
              {t('loginFaceUnlock')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="fingerprint"
            onClick={() => mockAction('loginFingerprintNA')}
          >
            <span className="fingerprint__icon" aria-hidden="true">
              <FingerprintIcon size={30} />
            </span>
            {t('loginFingerprint')}
          </button>
        )}

        <div className="login__divider" aria-hidden="true" />

        {/* Mock-only footer actions (+ PIN unlock when one is set up). */}
        <div className="login__footer">
          {hasPinSaved && (
            <button type="button" className="link-button" onClick={onUnlockWithPin}>
              <PadlockIcon size={16} />
              {t('loginPinUnlock')}
            </button>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => mockAction('loginResetNA')}
          >
            <KeyIcon size={16} />
            {t('loginForgot')}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => mockAction('loginHelpNA')}
          >
            <HelpIcon size={16} />
            {t('loginHelp')}
          </button>
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}