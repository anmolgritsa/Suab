/**
 * FaceIdAuthScreen.jsx — the mock Face ID scanner login.
 *
 * The twin of FingerprintAuthScreen for the "Use Face ID instead"
 * option on the EnterPinScreen. It simulates a front-camera face scan
 * with exactly the same state machine and timing:
 *
 *   ready     → blue ring + green check badge, "look at the camera"
 *   scanning  → the art pulses for ~1.4 s
 *   matched   → green ring + "Identity verified", then onUnlocked()
 *   no-match  → coral ring + "not recognised", retry
 *
 * The first scan deliberately fails once (so the demo shows the
 * not-recognised state and the retry path); every later scan matches,
 * like a real sensor would for the enrolled face. The PIN remains the
 * source of truth — a matched scan simply replays the same verify the
 * PIN pad would.
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

const SCAN_MS = 1400 // how long the fake "scan" takes

export default function FaceIdAuthScreen({ onUnlocked, onFallback }) {
  const { t } = useI18n()

  /* ###section-state### */
  const [state, setState] = useState('ready') // ready | scanning | matched | no-match
  const [tries, setTries] = useState(0) // failed scans so far
  const timerRef = useRef(null) // the running scan timeout, cleared on unmount

  /* ###section-effects### */
  // Clean up the fake scan timer when the screen goes away.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  /* ###section-handlers### */
  /** The scan button was tapped — run the fake face scan and resolve it. */
  function startScan() {
    if (state !== 'ready' && state !== 'no-match') return
    setState('scanning')
    timerRef.current = setTimeout(() => {
      if (tries === 0) {
        // The FIRST scan deliberately fails once so the demo shows the
        // "not recognised" state and the retry path; every later scan
        // matches, like a real sensor would for the enrolled face.
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
    <div className="home bio bio--face">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="bio__main">
        <BiometricArt variant="face" state={state} />

        <h1 className="screen__title">{t('bioFaceTitle')}</h1>
        <p className="screen__subtitle">{t('bioFaceSub')}</p>

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
