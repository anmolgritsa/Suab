/**
 * CoilArt.jsx — the purple steel-coil illustrations on the Product
 * Dimensions screen (drawn to match the UI mockup).
 *
 * Two variants serve the whole screen:
 *
 *   disc (default) — the big round coil: a purple disc with a white
 *     spiral curl, shown as the "Finished Product" figure inside the
 *     lavender product card.
 *
 *   side — the small side-view coil used by the Grade row: a wide
 *     rounded purple bar (a coil seen edge-on) that carries the grade
 *     value ("SS 304") as white text, overlapping a white disc.
 *
 * Pure SVG so it scales crisply on every phone width, like AttendanceArt.
 */

export default function CoilArt({ variant = 'disc', value }) {
  if (variant === 'side') {
    return (
      <svg viewBox="0 0 120 52" width="100%" height="100%" role="img" aria-label={value}>
        <defs>
          <linearGradient id="pdCoilSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8f74f0" />
            <stop offset="1" stopColor="#6a4de0" />
          </linearGradient>
        </defs>
        {/* coil seen edge-on: wide rounded bar */}
        <rect x="2" y="8" width="116" height="36" rx="18" fill="url(#pdCoilSide)" />
        {/* faint layer lines suggesting the rolled strip */}
        <path d="M24 10v32M42 10v32" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
        {/* the grade value, e.g. SS 304 */}
        <text
          x="64"
          y="32.5"
          textAnchor="middle"
          fontSize="17"
          fontWeight="800"
          fill="#fff"
          fontFamily="inherit"
        >
          {value}
        </text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="pdCoilDisc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9377f2" />
          <stop offset="1" stopColor="#6a4de0" />
        </linearGradient>
      </defs>
      {/* the coil face */}
      <circle cx="60" cy="60" r="56" fill="url(#pdCoilDisc)" />
      {/* white spiral — the rolled strip, drawn as growing semicircle curls */}
      <path
        d="M60 60a6 6 0 0 1-12 0 9 9 0 0 1 18 0 12 12 0 0 1-24 0 15 15 0 0 1 30 0 18 18 0 0 1-36 0 21 21 0 0 1 42 0"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  )
}
