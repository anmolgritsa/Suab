/**
 * EnterPinScreen.jsx — returning login: "Enter Your PIN".
 *
 * Shown instead of the credential form when this device has logged in
 * before (secureStore.hasPinAuth()). The worker unlocks the app
 * with the 4-digit PIN saved on this device — the temporary stand-in
 * for real biometrics — so they never re-type their mobile number or
 * Employee ID.
 *
 * Behaviour:
 *   - digits are collected with the shared <Keypad /> and shown as dots
 *   - the 4th digit is checked immediately against the stored identity
 *     (App.jsx → secureStore.verifyPin) — no "submit" button needed
 *   - a wrong PIN shows an error, shakes the dots and clears the entry
 *   - after 3 wrong tries the screen locks for 30 seconds (a simple
 *     anti-guessing delay, mirroring how phone lockouts feel) with a
 *     live countdown, then resets the attempt counter
 *   - "Not you? Use another account" forgets the saved PIN + identity
 *     and returns to the credential form (fresh sign-up path)
 *
 * All visible text comes from t() (see i18n.jsx).
 *
 * Props:
 *  - onUnlocked()      PIN verified — App.jsx opens the session
 *  - onForgot()        "not you" — App.jsx clears the vault + shows LoginScreen
 */

import { useEffect, useState } from 'react'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import Keypad from '../components/Keypad.jsx'
import { PadlockIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
import * as secureStore from '../utils/secureStore.js'

const MAX_ATTEMPTS = 3
const LOCK_SECONDS = 30

/* Replace {placeholders} in a translated string: fill('Hi {id}', { id: 1 }) */
function fill(text, vars) {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  )
}

export default function EnterPinScreen({ onUnlocked, onForgot }) {
  const { t } = useI18n()

  /* ###section-state### */
  const [entry, setEntry] = useState('') // digits typed so far (max 4)
  const [error, setError] = useState('') // '' while the entry is valid
  const [attempts, setAttempts] = useState(0) // wrong tries since last success
  const [lockUntil, setLockUntil] = useState(0) // epoch ms while locked out, else 0
  // Ticking clock for the countdown. Starts at 0 (Date.now() is impure and
  // may not be called during render) — the lock effect below syncs it the
  // moment a lockout begins, and the wrong-PIN handler stamps it too.
  const [now, setNow] = useState(0)
  // The saved identity (decrypted async by Web Crypto) for the subtitle.
  const [saved, setSaved] = useState(null)

  const locked = lockUntil > now
  const secondsLeft = locked ? Math.ceil((lockUntil - now) / 1000) : 0

  /* ###section-effects### */
  // Load the saved identity once (async decrypt) for the "Employee ID …" line.
  useEffect(() => {
    let alive = true
    secureStore.getPinAuth().then((record) => {
      if (alive) setSaved(record)
    })
    return () => {
      alive = false
    }
  }, [])

  // While locked out, tick every second so the countdown stays live. The
  // clock itself is stamped by the wrong-PIN handler the moment the lockout
  // starts (setState in an effect body is not allowed), so the first second
  // is already exact when this effect begins ticking.
  useEffect(() => {
    if (!locked) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [locked])

  /* ###section-handlers### */
  /** A digit was tapped — the 4th one is checked straight away. */
  async function handleDigit(digit) {
    if (locked || entry.length >= 4) return
    const next = entry + digit
    setEntry(next)
    if (next.length < 4) return

    if (await secureStore.verifyPin(next)) {
      onUnlocked() // correct PIN — open the session
      return
    }
    // Wrong PIN: count the attempt, show the error, clear the dots.
    const tries = attempts + 1
    setAttempts(tries)
    setError(tries >= MAX_ATTEMPTS ? t('enterPinLocked') : t('enterPinWrong'))
    setEntry('')
    if (tries >= MAX_ATTEMPTS) {
      setLockUntil(Date.now() + LOCK_SECONDS * 1000)
      setNow(Date.now()) // stamp the clock so the first countdown second is exact
      setAttempts(0) // the counter resets once the lockout starts
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

  /* ###section-view### */
  const label = locked
    ? fill(t('enterPinLockedLabel'), { seconds: secondsLeft })
    : t('enterPinLabel')

  return (
    <div className="home pin">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="pin__main">
        <div className="icon-badge icon-badge--blue">
          <PadlockIcon size={28} />
        </div>

        <h1 className="screen__title">{t('enterPinTitle')}</h1>
        <p className="screen__subtitle">
          {saved ? fill(t('enterPinSub'), { id: saved.employeeId }) : t('enterPinSub')}
        </p>

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
        {error && !locked && <p className="field__error pin__error">{error}</p>}

        <Keypad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />

        <button type="button" className="pin__forgot" onClick={onForgot}>
          {t('enterPinForgot')}
        </button>
      </div>
    </div>
  )
}
