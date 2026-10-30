/**
 * FingerprintAuthScreen.jsx — the mock fingerprint scanner login.
 *
 * One of the two "biometric" unlock screens offered on the EnterPinScreen
 * ("Use fingerprint instead"). It simulates a phone-style touch sensor:
 *
 *   ready     → the art shows a blue ring + green check badge and the
 *               label invites the worker to place their thumb
 *   scanning  → after a tap on the sensor the art pulses for ~1.2 s
 *   matched   → green ring + "Identity verified", then onUnlocked()
 *   no-match  → coral ring + "not recognised", retry (max 3, then the
 *               screen falls back to the PIN pad)
 *   no-sensor → purple ring + power badge: the device has no scanner,
 *               so only the PIN pad is offered
 *
 * The scanner is intentionally fake — there is no real hardware — but the
 * flow, timing and states mirror a real biometric prompt so the demo
 * feels authentic. The PIN remains the source of truth: a "matched"
 * fingerprint simply replays the same verify the PIN pad would.
 *
 * All visible text comes from t() (see i18n.jsx).
 *
 * Props:
 *  - onUnlocked()   identity verified — App.jsx opens the session
 *  - onFallback()   worker wants the PIN pad instead
 */

import { useEffect, useRef, useState } from 'react'
import BiometricArt from '../components/BiometricArt.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import { useI18n } from '../i18n.jsx'

const SCAN_MS = 1200 // how long the fake "scan" takes

export default function FingerprintAuthScreen({ onUnlocked, onFallback }) {
  const { t } = useI18n()

  /* ###section-state### */
  const [state, setState] = useState('ready') // ready | scanning | matched | no-match
  const [tries, setTries] = useState(0) // failed scans so far
  const timerRef = useRef(null) // the running scan timeout, cleared on unmount

  /* ###section-effects### */
  // Clean up the fake scan timer when the screen goes away.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  /* ###section-handlers### */
  /** The sensor was tapped — run the fake scan and resolve it. */
  function startScan() {
    if (state !== 'ready' && state !== 'no-match') return
    setState('scanning')
    timerRef.current = setTimeout(() => {
      if (tries === 0) {
        // The FIRST scan deliberately fails once so the demo shows the
        // "not recognised" state and the retry path; every later scan
        // matches, like a real sensor would for the enrolled print.
        setTries(1)
        setState('no-match')
        return
      }
      setState('matched')
      timerRef.current = setTimeout(onUnlocked, 900) // brief green "verified" pause
    }, SCAN_MS)
  }

  /* ###section-view### */
  // Per-state copy: the label under the art + the optional error line.
  const copy = {
    ready: { label: t('bioReadyLabel'), error: '' },
    scanning: { label: t('bioScanningLabel'), error: '' },
    matched: { label: t('bioMatchedLabel'), error: '' },
    'no-match': { label: t('bioRetryLabel'), error: t('bioNoMatch') },
  }[state]

  return (
    <div className="home bio bio--fingerprint">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="bio__main">
        <BiometricArt variant="fingerprint" state={state} />

        <h1 className="screen__title">{t('bioFingerprintTitle')}</h1>
        <p className="screen__subtitle">{t('bioFingerprintSub')}</p>

        <p className="bio__label">{copy.label}</p>
        {copy.error && <p className="field__error bio__error">{copy.error}</p>}

        <button
          type="button"
          className="bio__sensor"
          onClick={startScan}
          disabled={state === 'scanning' || state === 'matched'}
        >
          {state === 'scanning' ? t('bioScanning') : t('bioScanNow')}
        </button>

        <div className="bio__footer">
          <button type="button" className="link-button" onClick={onFallback}>
            {t('bioUsePin')}
          </button>
        </div>
      </div>
    </div>
  )
}
