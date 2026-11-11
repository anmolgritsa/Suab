/**
 * AttendanceArt.jsx — the big circular illustration on the attendance screen.
 *
 * The mockup shows a large soft circle with a thick state-coloured ring, a
 * location pin in the middle and a small badge at the top-right. The colours
 * come from CSS custom properties (--att / --att-soft) that the attendance
 * screen sets per GPS state, so this one component serves all three states:
 *
 *   at-location      → blue ring, green check badge
 *   not-at-location  → coral ring, coral "!" badge
 *   location-off     → purple ring, purple power badge + slashed pin
 */

const BADGES = {
  'at-location': { fill: 'var(--success)', glyph: 'check', label: 'You are at the factory location' },
  'not-at-location': { fill: 'var(--att)', glyph: 'alert', label: 'You are not at the factory location' },
  'location-off': { fill: 'var(--att)', glyph: 'power', label: 'Location services are switched off' },
}

/** The small white glyph drawn inside the badge circle. */
function BadgeGlyph({ glyph }) {
  if (glyph === 'check') {
    return <path d="M162 50l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
  }
  if (glyph === 'alert') {
    return (
      <>
        <path d="M172 39v13" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="172" cy="60" r="2.8" fill="#fff" />
      </>
    )
  }
  return ( // 'power' — the universal "switched off" symbol
    <>
      <path d="M164 44a11 11 0 1 0 16 0" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M172 37v13" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    </>
  )
}

export default function AttendanceArt({ state = 'at-location' }) {
  const badge = BADGES[state] ?? BADGES['at-location']

  return (
    <div className="att-art" role="img" aria-label={badge.label}>
      <svg viewBox="0 0 220 220" width="100%" height="100%">
        {/* soft halo + thick state-coloured ring */}
        <circle cx="110" cy="110" r="105" fill="var(--att-soft)" />
        <circle cx="110" cy="110" r="78" fill="none" stroke="var(--att)" strokeWidth="12" />

        {/* the location pin (teardrop + white dot) */}
        <path
          d="M110 150C102 138 76 116 76 96a34 34 0 1 1 68 0c0 20-26 42-34 54z"
          fill="var(--att)"
        />
        <circle cx="110" cy="96" r="13" fill="#fff" />

        {/* slashed pin = location services off */}
        {state === 'location-off' && (
          <path d="M82 62l56 64" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
        )}

        {/* status badge at the top-right */}
        <circle cx="172" cy="50" r="24" fill={badge.fill} stroke="#fff" strokeWidth="5" />
        <BadgeGlyph glyph={badge.glyph} />
      </svg>
    </div>
  )
}
