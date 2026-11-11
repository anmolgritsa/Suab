/**
 * AppLockScreen.jsx — the app lock shown before the app on every reopen.
 *
 * The worker signs in with credentials once (LoginScreen); after that this
 * screen guards the app. It mirrors a phone's lock screen with three ways
 * in, so nothing new has to be memorised:
 *
 *   - Tabs at the top choose the manual method: 'Pattern' or 'PIN'.
 *     The demo PIN is 1234 (utils/appLock.js DEFAULT_PIN) and the demo
 *     pattern is an "L" — both seeded at the first login.
 *   - The fingerprint button uses the DEVICE'S OWN screen-lock auth via
 *     the WebAuthn platform authenticator (utils/biometrics.js) when the
 *     device has one — the same prompt that unlocks the phone. Devices
 *     without one fall back to a mock scan so the demo still flows.
 *   - The required message "Place Fingerprint or Enter Password" sits
 *     under the title.
 *
 * Anti-guessing: 3 wrong PIN/pattern tries lock the screen for 30 seconds
 * with a live countdown (same rule as the legacy EnterPinScreen).
 * "Not you? Use another account" forgets the lock and returns to the
 * credential login (App.jsx → onForgot).
 *
 * All visible text comes from t() (see i18n.jsx).
 *
 * Props:
 *  - onUnlocked()   verified (biometric, PIN or pattern) — App.jsx opens
 *                   the session and continues at the attendance screen
 *  - onForgot()     "not you" — App.jsx clears the lock + shows LoginScreen
 */

import { useEffect, useRef, useState } from 'react'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import Keypad from '../components/Keypad.jsx'
import PatternLock from '../components/PatternLock.jsx'
import { FingerprintIcon, PadlockIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
import { authenticateWithPlatform, isPlatformAuthAvailable } from '../utils/biometrics.js'
import { verifyAppPattern, verifyAppPin } from '../utils/appLock.js'

const MAX_ATTEMPTS = 3
const LOCK_SECONDS = 30
const SCAN_MS = 1200 // mock scan duration (no platform authenticator)
const MATCHED_PAUSE_MS = 700 // green "verified" pause before entering the app

/* Replace {placeholders} in a translated string: fill('Hi {id}', { id: 1 }) */
function fill(text, vars) {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  )
}

export default function AppLockScreen({ onUnlocked, onForgot }) {
  const { t } = useI18n()

  /* ###section-state### */
  const [tab, setTab] = useState('pattern') // 'pattern' | 'pin' — the top tabs
  // PIN entry (same shape as EnterPinScreen).
  const [entry, setEntry] = useState('') // digits typed so far (max 4)
  const [pinError, setPinError] = useState('') // '' while the entry is valid
  // Pattern feedback: bumping this flashes the grid red (see PatternLock).
  const [patternWrong, setPatternWrong] = useState(0)
  // Text under the grid while the last draw was wrong (cleared on the
  // next draw via PatternLock's onDrawStart).
  const [patternError, setPatternError] = useState(false)
  // Shared anti-guessing counter for BOTH manual methods.
  const [attempts, setAttempts] = useState(0) // wrong tries since last success
  const [lockUntil, setLockUntil] = useState(0) // epoch ms while locked out, else 0
  // Ticking clock for the countdown (stamped when a lockout begins).
  const [now, setNow] = useState(0)
  // Biometric button state: idle | scanning | matched | no-match.
  const [bioState, setBioState] = useState('idle')
  // Does this device have a real platform authenticator? null = still probing.
  const [platformBio, setPlatformBio] = useState(null)
  // Holds the mock-scan / matched-pause timer so it can be cancelled on unmount.
  const timerRef = useRef(null)

  const locked = lockUntil > now
  const secondsLeft = locked ? Math.ceil((lockUntil - now) / 1000) : 0

  /* ###section-effects### */
  // Probe the device once: does it offer its own screen-lock auth? The
  // fingerprint button switches between the real OS prompt and the mock
  // scan based on the answer.
  useEffect(() => {
    let alive = true
    isPlatformAuthAvailable().then((available) => {
      if (alive) setPlatformBio(available)
    })
    return () => {
      alive = false
    }
  }, [])

  // While locked out, tick every second so the countdown stays live. The
  // clock is stamped by the failure handler the moment a lockout starts.
  useEffect(() => {
    if (!locked) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [locked])

  // Clear any running scan/verified timer when the screen goes away.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  /* ###section-handlers### */
  /** Count a failed manual attempt; after MAX_ATTEMPTS start the lockout.
      Returns true when this failure just started the lockout. */
  function countFailure() {
    const tries = attempts + 1
    setAttempts(tries)
    if (tries >= MAX_ATTEMPTS) {
      setLockUntil(Date.now() + LOCK_SECONDS * 1000)
      setNow(Date.now()) // stamp the clock so the first countdown second is exact
      setAttempts(0) // the counter resets once the lockout starts
      return true
    }
    return false
  }

  /** A digit was tapped — the 4th one is checked straight away. */
  async function handleDigit(digit) {
    if (locked || entry.length >= 4) return
    const next = entry + digit
    setEntry(next)
    if (next.length < 4) return

    if (await verifyAppPin(next)) {
      onUnlocked() // correct PIN — enter the app
      return
    }
    // Wrong PIN: count the attempt, show the error, clear the dots.
    setPinError(countFailure() ? t('enterPinLocked') : t('enterPinWrong'))
    setEntry('')
  }

  /** Remove the last typed digit (and any stale error with it). */
  function handleBackspace() {
    setPinError('')
    setEntry((current) => current.slice(0, -1))
  }

  /** Throw the whole entry away and start from an empty display. */
  function handleClear() {
    setPinError('')
    setEntry('')
  }

  /** A full pattern was drawn — verify it against the saved one. */
  async function handlePattern(path) {
    if (locked) return
    if (await verifyAppPattern(path)) {
      onUnlocked() // correct pattern — enter the app
      return
    }
    setPatternWrong((count) => count + 1) // flash the grid red + clear it
    setPatternError(true)
    countFailure()
  }

  /** The fingerprint button: the OS lock-screen prompt, or the mock scan. */
  async function handleBiometric() {
    if (locked || bioState === 'scanning' || bioState === 'matched') return
    setBioState('scanning')

    // Real device auth — the same fingerprint/face/OS-PIN prompt that
    // unlocks the phone itself (WebAuthn platform authenticator). Devices
    // without one (e.g. desktop demo) simulate the scan so the flow can
    // still be demonstrated end to end.
    const verified = platformBio
      ? await authenticateWithPlatform()
      : await new Promise((resolve) => {
          timerRef.current = setTimeout(() => resolve(true), SCAN_MS)
        })

    if (verified) {
      setBioState('matched')
      timerRef.current = setTimeout(onUnlocked, MATCHED_PAUSE_MS)
    } else {
      setBioState('no-match') // cancelled or not recognised — try again
    }
  }

  /* ###section-view### */
  // The countdown replaces the manual method's label while locked out.
  const countdownLabel = fill(t('enterPinLockedLabel'), { seconds: secondsLeft })
  const pinLabel = locked ? countdownLabel : t('enterPinLabel')
  const patternLabel = locked ? countdownLabel : t('lockPatternLabel')
  const bioBusy = bioState === 'scanning' || bioState === 'matched'

  return (
    <div className="home lock">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      {/* The two unlock methods, as tabs at the top of the lock screen. */}
      <div className="lock__tabs" role="tablist" aria-label="Unlock method">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pattern'}
          className={tab === 'pattern' ? 'lock__tab lock__tab--active' : 'lock__tab'}
          onClick={() => setTab('pattern')}
        >
          {t('lockTabPattern')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pin'}
          className={tab === 'pin' ? 'lock__tab lock__tab--active' : 'lock__tab'}
          onClick={() => setTab('pin')}
        >
          {t('lockTabPin')}
        </button>
      </div>

      <div className="lock__main">
        <div className="icon-badge icon-badge--blue">
          <PadlockIcon size={28} />
        </div>

        <h1 className="screen__title">{t('lockTitle')}</h1>
        <p className="screen__subtitle">{t('lockSub')}</p>

        {/* Quick way in: the device's own fingerprint / lock-screen auth. */}
        <button
          type="button"
          className="bio__sensor lock__bio"
          onClick={handleBiometric}
          disabled={locked || bioBusy}
        >
          <span className="lock__bio-icon" aria-hidden="true">
            <FingerprintIcon size={22} />
          </span>
          {bioState === 'scanning' ? t('bioScanning') : t('lockUseBiometric')}
        </button>
        {bioState === 'matched' && <p className="bio__label">{t('bioMatchedLabel')}</p>}
        {bioState === 'no-match' && (
          <p className="field__error bio__error">{t('bioNoMatch')}</p>
        )}

        <div className="lock__divider" aria-hidden="true" />

        {/* The manual method selected by the tabs. */}
        {tab === 'pin' ? (
          <div className="lock__panel">
            <div
              className={pinError ? 'pin__dots pin__dots--shake' : 'pin__dots'}
              aria-label={pinLabel}
            >
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={
                    pinError
                      ? 'pin__dot pin__dot--error'
                      : index < entry.length
                        ? 'pin__dot pin__dot--filled'
                        : 'pin__dot'
                  }
                />
              ))}
            </div>

            <p className="pin__label">{pinLabel}</p>
            {pinError && !locked && <p className="field__error pin__error">{pinError}</p>}

            {/* Shared Keypad - re-skinned for this screen only via the
                .lock__panel rules in screens.css (polished tile keys,
                PIN dots inside a white "display" pill). Behaviour is
                unchanged. */}
            <Keypad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />
          </div>
        ) : (
          <div className="lock__panel">
            <PatternLock
              onComplete={handlePattern}
              wrongCount={patternWrong}
              disabled={locked}
              onDrawStart={() => setPatternError(false)}
            />
            <p className="pin__label">{patternLabel}</p>
            {patternError && !locked && (
              <p className="field__error pin__error">{t('lockPatternWrong')}</p>
            )}
            <p className="lock__hint">{t('lockPatternHint')}</p>
          </div>
        )}

        <button type="button" className="pin__forgot" onClick={onForgot}>
          {t('enterPinForgot')}
        </button>
      </div>
    </div>
  )
}
