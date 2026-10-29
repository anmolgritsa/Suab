/**
 * AttendanceScreen.jsx — "Mark Attendance" (mockup 4).
 *
 * The worker's GPS is SIMULATED (see utils/geo.js): the screen shows one of
 * three situations, switched with the small demo strip at the bottom —
 *
 *   at-location      blue    "Check In"          → records attendance
 *   not-at-location  coral   "Go to Location"    → mock action (toast)
 *   location-off     purple  "Turn On Location"  → simulates enabling GPS
 *
 * A check-in is saved to localStorage (one record per day) and the app then
 * moves to the Machine Allotment screen. If today's record already exists
 * (e.g. after a refresh) the screen shows the "checked in" view.
 *
 * All visible text comes from t() (see i18n.jsx), so it follows the
 * language chosen in <LanguageDropdown /> in the top bar.
 *
 * Props:
 *  - attendanceRecord today's saved record or null
 *  - onCheckIn(record) called after a new record is saved
 *  - onContinue()     called when the worker continues after checking in
 */

import { useState } from 'react'
import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import PrimaryButton from '../components/PrimaryButton.jsx'
import Toast from '../components/Toast.jsx'
import AttendanceArt from '../components/AttendanceArt.jsx'
import { useI18n } from '../i18n.jsx'
import {
  FACTORY_LOCATION,
  LOCATION_STATES,
  WORKER_PRESETS,
  distanceMeters,
  formatDistance,
  resolveLocationState,
} from '../utils/geo.js'
import { formatTime12h, saveAttendance } from '../utils/storage.js'
import { DEMO_INTERVAL_MINUTES, SHIFT_DURATION_MINUTES } from '../utils/shift.js'

/* Replace {placeholders} in a translated string: fill('Every {n} min', { n: 5 }) */
function fill(text, vars) {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  )
}

/* Translation keys for each simulated GPS state (resolved with t() below). */
const STATE_COPY = {
  'at-location': {
    title: 'attMarkTitle',
    subtitle: 'attAtLocationSub',
    button: 'attCheckIn',
    variant: 'primary',
  },
  'not-at-location': {
    title: 'attNotAtTitle',
    subtitle: 'attNotAtSub',
    button: 'attGoToLocation',
    variant: 'coral',
  },
  'location-off': {
    title: 'attLocOffTitle',
    subtitle: 'attLocOffSub',
    button: 'attTurnOnLocation',
    variant: 'purple',
  },
}

/* The three demo chips shown at the bottom of the screen. */
const SIM_OPTIONS = [
  { state: LOCATION_STATES.AT_LOCATION, labelKey: 'attSimAt' },
  { state: LOCATION_STATES.NOT_AT_LOCATION, labelKey: 'attSimNot' },
  { state: LOCATION_STATES.LOCATION_OFF, labelKey: 'attSimOff' },
]

export default function AttendanceScreen({
  attendanceRecord,
  onCheckIn,
  onContinue,
}) {
  const { t } = useI18n()

  /* ---- simulated GPS state ---- */
  const [simState, setSimState] = useState(LOCATION_STATES.AT_LOCATION)
  const [toast, setToast] = useState(null)

  // Which situation the worker is in + how far they are from the factory.
  // "Not at location" puts them ~1.1 km away; the other two use the inside preset.
  const workerCoords =
    simState === LOCATION_STATES.NOT_AT_LOCATION
      ? WORKER_PRESETS.outside
      : WORKER_PRESETS.inside
  const state = attendanceRecord
    ? LOCATION_STATES.AT_LOCATION // already checked in → show the checked-in view
    : resolveLocationState(simState !== LOCATION_STATES.LOCATION_OFF, workerCoords)
  const checkedIn = Boolean(attendanceRecord)
  const copy = STATE_COPY[state]
  const distance = distanceMeters(workerCoords, FACTORY_LOCATION)
  const checkInTime = checkedIn ? formatTime12h(attendanceRecord.checkInAt) : ''

  /* ---- actions ---- */

  /** The blue "Check In" button — record today's attendance. */
  function handleCheckIn() {
    const record = saveAttendance({
      checkInAt: new Date().toISOString(),
      workerLat: WORKER_PRESETS.inside.lat,
      workerLng: WORKER_PRESETS.inside.lng,
      distanceMeters: Math.round(distance),
    })
    onCheckIn(record) // App.jsx stores it and moves to the Machine Allotment
  }

  /** Coral "Go to Location" — pretend the worker walked to the factory. */
  function handleGoToLocation() {
    setSimState(LOCATION_STATES.AT_LOCATION)
    setToast(t('attReachedToast'))
  }

  /** Purple "Turn On Location" — pretend the worker enabled GPS. */
  function handleTurnOnLocation() {
    setSimState(LOCATION_STATES.AT_LOCATION)
    setToast(t('attLocationOnToast'))
  }

  /** The "Continue" button on the already-checked-in view. */
  function handleContinue() {
    onContinue()
  }

  /* ---- what the screen shows ---- */
  const title = checkedIn ? t('attMarkedTitle') : t(copy.title)
  const subtitle = checkedIn
    ? fill(t('attCheckedInAtSub'), { time: checkInTime })
    : t(copy.subtitle)
  const buttonLabel = checkedIn ? t('attContinue') : t(copy.button)
  const buttonVariant = checkedIn ? 'primary' : copy.variant

  function getAction() {
    if (checkedIn) return handleContinue
    if (state === LOCATION_STATES.AT_LOCATION) return handleCheckIn
    if (state === LOCATION_STATES.NOT_AT_LOCATION) return handleGoToLocation
    return handleTurnOnLocation
  }

  return (
    <div className={`att att--${state}`}>
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      {/* Header aur footer ke beech ka sab kuch yahan center hota hai. */}
      <div className="att__main">
        <div className="att__body">
          <AttendanceArt state={state} />
          <h1 className="att__title">{title}</h1>
          <p className="att__subtitle">{subtitle}</p>
          {!checkedIn && (
            <p className="att__distance">
              {state === LOCATION_STATES.LOCATION_OFF
                ? t('attGpsOff')
                : fill(t('attDistanceFrom'), {
                    distance: formatDistance(distance),
                    place: FACTORY_LOCATION.name,
                  })}
            </p>
          )}
        </div>

        <div className="att__actions">
          <PrimaryButton onClick={getAction()} variant={buttonVariant}>
            {buttonLabel}
          </PrimaryButton>
        </div>

        {/* ---- "Today's Shift" summary: read-only card under the button ---- */}
        <section className="att__shift-card" aria-label={t('attShiftTitle')}>
          <h2 className="att__shift-title">{t('attShiftTitle')}</h2>
          <dl className="att__shift-rows">
            <div className="att__shift-row">
              <dt>{t('attShiftDuration')}</dt>
              <dd>{fill(t('attMinDemo'), { n: SHIFT_DURATION_MINUTES })}</dd>
            </div>
            <div className="att__shift-row">
              <dt>{t('attReminder')}</dt>
              <dd>{fill(t('attEveryMin'), { n: DEMO_INTERVAL_MINUTES })}</dd>
            </div>
            <div className="att__shift-row">
              <dt>{t('attStatus')}</dt>
              <dd
                className={
                  checkedIn
                    ? 'att__shift-status att__shift-status--on'
                    : 'att__shift-status'
                }
              >
                {checkedIn
                  ? fill(t('attCheckedInAtStatus'), { time: checkInTime })
                  : t('attNotCheckedIn')}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <footer className="att__footer">
        {!checkedIn && (
          <div className="att__sim" role="group" aria-label={t('attDemoAria')}>
            <span className="att__sim-label">{t('attDemoGps')}</span>
            {SIM_OPTIONS.map((option) => (
              <button
                key={option.state}
                type="button"
                className={
                  simState === option.state
                    ? 'att__sim-chip att__sim-chip--active'
                    : 'att__sim-chip'
                }
                onClick={() => setSimState(option.state)}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        )}

        {/* Decorative wave tinted with the current state colour (mockup bottom
            band). aria-hidden because it is purely visual. */}
        <svg
          className="att__wave"
          viewBox="0 0 390 84"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 46C70 84 150 10 240 22c60 8 110-4 150 8v54H0z"
            fill="var(--att-tint)"
          />
        </svg>
      </footer>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}