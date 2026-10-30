/**
 * SetPinScreen.jsx — first-time login, step 2: "Create Your PIN".
 *
 * Shown right after the credential form (Employee ID + mobile) when this
 * device has never logged in before. The worker picks a 4-digit PIN with
 * the on-screen keypad, re-enters it to confirm, and the app then hands
 * the PIN to App.jsx → utils/secureStore.js, which stores it ENCRYPTED
 * (AES-GCM) together with the identity it belongs to. From the next
 * login on, the worker only has to type this PIN (EnterPinScreen) — the
 * PIN is the temporary stand-in for real biometrics.
 *
 * Layout, top to bottom:
 *   1. header      SUAB logo + language dropdown (+ a back arrow)
 *   2. title       "Create Your PIN" + why-this-screen subtitle
 *   3. identity    chip showing which Employee ID is being set up
 *   4. dots        the 4-digit PIN display (dots, never the digits)
 *   5. keypad      0-9 + backspace (the shared <Keypad />)
 *   6. hint        "your PIN stays on this device"
 *
 * After a matching confirm the screen shows a short "PIN saved securely"
 * confirmation and only then continues — same pattern as the product
 * submission screen's completion view.
 *
 * All visible text comes from t() (see i18n.jsx), so it follows the
 * language chosen in <LanguageDropdown /> in the top bar.
 *
 * Props:
 *  - identity       { phone, employeeId } typed on the login screen
 *  - onPinSet(pin)  PIN confirmed — App.jsx saves it encrypted + opens the session
 *  - onBack()       back to the credential form
 */

import { useState } from 'react'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import Keypad from '../components/Keypad.jsx'
import PrimaryButton from '../components/PrimaryButton.jsx'
import { ArrowLeftIcon, CheckCircleIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'

/* Replace {placeholders} in a translated string: fill('Hi {id}', { id: 1 }) */
function fill(text, vars) {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  )
}

export default function SetPinScreen({ identity, onPinSet, onBack }) {
  const { t } = useI18n()

  /* ###section-state### */
  const [phase, setPhase] = useState('enter') // 'enter' → 'confirm' → 'done'
  const [firstPin, setFirstPin] = useState('') // the PIN typed in step 1
  const [entry, setEntry] = useState('') // digits typed so far (max 4)
  const [error, setError] = useState('') // '' while the entry is valid

  /* ###section-handlers### */
  /** A digit was tapped — collect up to 4, then advance or verify. */
  function handleDigit(digit) {
    if (entry.length >= 4) return
    const next = entry + digit
    setEntry(next)
    if (next.length < 4) return

    if (phase === 'enter') {
      // Step 1 done — remember it and ask for the same PIN again.
      setFirstPin(next)
      setEntry('')
      setPhase('confirm')
      return
    }
    if (next === firstPin) {
      setPhase('done') // both entries match — show the saved confirmation
    } else {
      // Mismatch — start over with a clear message.
      setError(t('setPinMismatch'))
      setFirstPin('')
      setEntry('')
      setPhase('enter')
    }
  }

  /** Remove the last typed digit (and any stale error with it). */
  function handleBackspace() {
    setError('')
    setEntry((current) => current.slice(0, -1))
  }

  /** Throw the whole entry away and start from an empty display. */
  function handleClear() {
    setError('')
    setEntry('')
  }

  /* ###section-done-view### */
  if (phase === 'done') {
    return (
      <div className="home pin">
        <header className="home__topbar">
          <BrandLogo />
          <LanguageDropdown />
        </header>
        <div className="pin__main">
          <div className="icon-badge icon-badge--success">
            <CheckCircleIcon size={28} />
          </div>
          <h1 className="screen__title">{t('setPinSaved')}</h1>
          <p className="screen__subtitle">{t('setPinSavedSub')}</p>
          <div className="pin__actions">
            <PrimaryButton onClick={() => onPinSet(firstPin)}>
              {t('attContinue')}
            </PrimaryButton>
          </div>
        </div>
      </div>
    )
  }

  /* ###section-setup-view### */
  const label = phase === 'confirm' ? t('setPinConfirmLabel') : t('setPinEnterLabel')

  return (
    <div className="home pin">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="pin__main">
        <div className="pin__back">
          <button type="button" className="back-button" onClick={onBack} aria-label={t('cancel')}>
            <ArrowLeftIcon size={20} />
          </button>
        </div>

        <h1 className="screen__title">{t('setPinTitle')}</h1>
        <p className="screen__subtitle">{t('setPinSub')}</p>

        {identity && (
          <div className="demo-chip">
            {fill(t('setPinIdentity'), { id: identity.employeeId })}
          </div>
        )}

        <div className={error ? 'pin__dots pin__dots--shake' : 'pin__dots'} aria-label={label}>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={
                error
                  ? 'pin__dot pin__dot--error'
                  : index < entry.length
                    ? 'pin__dot pin__dot--filled'
                    : 'pin__dot'
              }
            />
          ))}
        </div>

        <p className="pin__label">{label}</p>
        {error && <p className="field__error pin__error">{error}</p>}

        <Keypad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />

        <p className="pin__hint">{t('setPinHint')}</p>
      </div>
    </div>
  )
}
