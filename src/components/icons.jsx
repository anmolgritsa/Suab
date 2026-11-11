/**
 * icons.jsx — small inline SVG icons used across the app.
 *
 * Every icon takes a `size` (pixels) and inherits its colour from the
 * surrounding text via `currentColor`, so you can colour them with CSS.
 * They are simple "stroke" drawings (Feather-style) to keep the code light.
 */

function Svg({ size = 20, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Person silhouette — used in the Full Name field. */
export function UserIcon(props) {
  return (
    <Svg {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

/** Telephone handset — used in the Phone Number field. */
export function PhoneIcon(props) {
  return (
    <Svg {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </Svg>
  )
}

/** ID badge with a portrait and text lines — the Employee ID field. */
export function BadgeIcon(props) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <circle cx="8" cy="10.5" r="2.2" />
      <path d="M4.6 16.9c.7-2 6.1-2 6.8 0" />
      <path d="M14.5 9.5h4" />
      <path d="M14.5 13h4" />
    </Svg>
  )
}

/** Left arrow — the back button on the report and product screens. */
export function ArrowLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Svg>
  )
}

/** Fingerprint — the mock biometric login option. */
export function FingerprintIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </Svg>
  )
}

/** Face inside corner brackets — the mock Face ID login option. */
export function FaceIdIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 8V5a2 2 0 0 1 2-2h3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M9 9.5h.01" />
      <path d="M15 9.5h.01" />
      <path d="M9 14.5c.9 1 2 1.5 3 1.5s2.1-.5 3-1.5" />
    </Svg>
  )
}

/** Padlock — the PIN screens' identity/lock art. */
export function PadlockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1.3" />
    </Svg>
  )
}

/** Question mark in a circle — the Help action. */
export function HelpIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

/** Circular question mark variant for "Forgot Password?" */
export function KeyIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </Svg>
  )
}

/** Checkmark inside a circle — success states. */
export function CheckCircleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m22 4-10 10-3-3" />
    </Svg>
  )
}

/** Small factory glyph used in the SUAB logo mark. */
export function FactoryIcon(props) {
  return (
    <Svg {...props}>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1" />
      <path d="M12 18h1" />
      <path d="M7 18h1" />
    </Svg>
  )
}

/** Map pin — the attendance screen's location states. */
export function MapPinIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  )
}

/** Map pin with a slash — "location services are switched off". */
export function MapPinOffIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
      <path d="M4 4l16 16" />
    </Svg>
  )
}

/** Downward chevron — the language selector pill. */
export function ChevronDownIcon(props) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  )
}

/** Clock face — the active shift timer on the labour homepage. */
export function ClockIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  )
}

/** Clock with a plus — the overtime tail of the shift timer (homepage). */
export function ClockPlusIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="11.5" r="8" />
      <path d="M10.5 7.5v4l3 2" />
      <path d="M18 16v6" />
      <path d="M15 19h6" />
    </Svg>
  )
}

/** Closed box — raw material / product actions. */
export function PackageIcon(props) {
  return (
    <Svg {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </Svg>
  )
}

/** Wrench — machine breakdown / defect actions. */
export function WrenchIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  )
}

/** Chevron right — "this card opens something" affordance on tappable cards. */
export function ChevronRightIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  )
}

/** Chevron left — "go back / previous" affordance (e.g. date switchers). */
export function ChevronLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  )
}

/** Warning triangle — defects and emergency alerts. */
export function AlertTriangleIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

/** Camera — "send a photo or video to supervisor". */
export function CameraIcon(props) {
  return (
    <Svg {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </Svg>
  )
}

/** X — close buttons (reminder modal, SOS dialog). */
export function XIcon(props) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  )
}

/** House — "back to home" on the placeholder screens. */
export function HomeIcon(props) {
  return (
    <Svg {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Svg>
  )
}

/** Gear — the machine assignment placeholder screen. */
export function CogIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  )
}

/** Target (circle + crosshair) — the machine's shift-target detail. */
export function TargetIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </Svg>
  )
}

/** Microphone — "speak your count" button on the product submission screen. */
export function MicIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </Svg>
  )
}

/** Three dots (⋯) — the "Other" card on the machine allotment screen. */
export function DotsIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </Svg>
  )
}

/** Stopwatch — "Apply for Overtime" on the Other screen. */
export function TimerIcon(props) {
  return (
    <Svg {...props}>
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="14" x2="15" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </Svg>
  )
}

/** Clipboard with lines — "Update Other Work Activities" on the Other screen. */
export function ClipboardIcon(props) {
  return (
    <Svg {...props}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </Svg>
  )
}

/** Play triangle — listen to a recorded voice note (half-day request). */
export function PlayIcon(props) {
  return (
    <Svg {...props}>
      <path d="M6.5 4.5 19 12 6.5 19.5z" />
    </Svg>
  )
}

/** Solid rounded square — stop a recording / stop playback. The filled
    shape (unlike the stroke-only icons) reads instantly as "stop". */
export function StopIcon(props) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Circular arrow — "Retake" a recorded voice note (half-day request). */
export function RefreshIcon(props) {
  return (
    <Svg {...props}>
      <polyline points="1.5 4.5 1.5 10.5 7.5 10.5" />
      <path d="M4 15a9 9 0 1 0 2.1-9.4L1.5 10.5" />
    </Svg>
  )
}

/** Speaker with sound waves — the "Unusual sound" reason chip on the
    machine maintenance form. */
export function VolumeIcon(props) {
  return (
    <Svg {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.8 5.2a9.4 9.4 0 0 1 0 13.6" />
    </Svg>
  )
}

/** Eye — "view" a labourer's work-history report (supervisor reports). */
export function EyeIcon(props) {
  return (
    <Svg {...props}>
      <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

/** Calendar — the date picker on the supervisor reports screen. */
export function CalendarIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </Svg>
  )
}
