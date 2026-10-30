/**
 * BiometricArt.jsx — the big circular illustration for the mock biometric
 * screens (fingerprint / Face ID), drawn in the same language as the
 * attendance screen's AttendanceArt: a soft halo circle with a thick
 * state-coloured ring, a centre glyph and a small status badge top-right.
 *
 * Colours come from CSS custom properties (--bio / --bio-soft) that each
 * biometric screen sets per state, so one component serves them all:
 *
 *   ready / scanning  → blue ring, green check badge
 *   matched           → green ring, green check badge
 *   no-match          → coral ring, coral "!" badge
 *   no-sensor         → purple ring, purple power badge
 *
 * While scanning the whole art pulses (see .bio-art--scanning in CSS).
 */

import { FaceIdIcon, FingerprintIcon } from './icons.jsx'

const BADGES = {
  ready: { fill: 'var(--success)', glyph: 'check', label: 'Sensor ready to scan' },
  scanning: { fill: 'var(--success)', glyph: 'check', label: 'Scanning in progress' },
  matched: { fill: 'var(--success)', glyph: 'check', label: 'Identity verified' },
  'no-match': { fill: 'var(--bio)', glyph: 'alert', label: 'Identity not recognised' },
  'no-sensor': { fill: 'var(--bio)', glyph: 'power', label: 'Scanner is unavailable' },
}

/** The small white glyph drawn inside the badge circle (same set as AttendanceArt). */
function BadgeGlyph({ glyph }) {
  if (glyph === 'alert') {
    return (
      <>
        <path d="M172 39v13" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="172" cy="60" r="2.8" fill="#fff" />
      </>
    )
  }
  if (glyph === 'power') {
    return (
      <>
        <path d="M164 44a11 11 0 1 0 16 0" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M172 37v13" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      </>
    )
  }
  return ( // 'check'
    <path d="M162 50l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  )
}

/** The centre glyph — the fingerprint or face drawing from icons.jsx. */
function CentreGlyph({ variant }) {
  const Icon = variant === 'face' ? FaceIdIcon : FingerprintIcon
  return (
    <span className="bio-art__glyph" aria-hidden="true">
      <Icon size={72} />
    </span>
  )
}

export default function BiometricArt({ variant = 'fingerprint', state = 'ready' }) {
  const badge = BADGES[state] ?? BADGES.ready

  return (
    <div
      className={
        state === 'scanning'
          ? 'bio-art bio-art--scanning'
          : `bio-art bio-art--${state}`
      }
      role="img"
      aria-label={`${badge.label} (${variant})`}
    >
      <svg viewBox="0 0 220 220" width="100%" height="100%">
        {/* soft halo + thick state-coloured ring */}
        <circle cx="110" cy="110" r="105" fill="var(--bio-soft)" />
        <circle cx="110" cy="110" r="78" fill="none" stroke="var(--bio)" strokeWidth="12" />
        {/* status badge at the top-right */}
        <circle cx="172" cy="50" r="24" fill={badge.fill} stroke="#fff" strokeWidth="5" />
        <BadgeGlyph glyph={badge.glyph} />
      </svg>
      <CentreGlyph variant={variant} />
    </div>
  )
}
