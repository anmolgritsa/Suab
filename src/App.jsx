/**
 * App.jsx — the app's tiny state-based router (no react-router).
 *
 * Flow:
<<<<<<< HEAD
 *   Part 1 (auth)       login (phone + supervisor-issued Employee ID)
 *   Part 2 (attendance) login → attendance (simulated GPS check-in)
 *                       → machine allotment (today's assigned machine)
 *   Part 3 (homepage)   allotment → home ⇄ { input-errors, machine-defect,
 *                       output-errors } → product-submission (shift end)
=======
 *   Part 1 (auth)       login: credentials (phone + supervisor-issued
 *                       Employee ID) → attendance. The FIRST successful
 *                       login also seeds the app lock (utils/appLock.js):
 *                       on every later reopen the AppLockScreen stands
 *                       between the worker and the app, unlocked with the
 *                       device's own screen-lock auth (fingerprint via the
 *                       WebAuthn platform authenticator), the demo PIN
 *                       (1234) or the demo draw pattern ("L").
 *   Part 2 (attendance) login → attendance (simulated GPS check-in)
 *                       → machine allotment (today's assigned machine)
 *   Part 3 (homepage)   allotment → home ⇄ { input-errors, machine-defect,
 *                       output-errors, other } (a back chip on home also
 *                       reopens the allotment) → product-submission (shift
 *                       end) → app-lock (unlocking continues at attendance,
 *                       starting the next shift's check-in → allotment run)
 *                       (the allotment's Machine No. / Job cards also open
 *                       the machine-inputs / product-dimensions detail
 *                       screens, which return to the allotment; the Other
 *                       screen's half-day and overtime tiles open their own
 *                       request screens ('half-day' / 'overtime'), its
 *                       maintenance tile opens the voice maintenance
 *                       request screen ('machine-maintenance'), and its
 *                       activities tile opens the voice update screen
 *                       ('work-activities'); an
 *                       approved half-day request shortens the running
 *                       shift to HALF, an approved overtime request
 *                       stretches it (demo: +1 min per approved hour))
>>>>>>> master
 *
 * The whole tree is wrapped in one <I18nProvider> so every screen can
 * translate its strings and the language choice persists across screens.
 */

import { useState } from 'react'
import { I18nProvider } from './i18n.jsx'
import LoginScreen from './screens/LoginScreen.jsx'
<<<<<<< HEAD
import AttendanceScreen from './screens/AttendanceScreen.jsx'
import MachineAllotmentScreen from './screens/MachineAllotmentScreen.jsx'
=======
import AppLockScreen from './screens/AppLockScreen.jsx'
import EnterPinScreen from './screens/EnterPinScreen.jsx'
import FingerprintAuthScreen from './screens/FingerprintAuthScreen.jsx'
import FaceIdAuthScreen from './screens/FaceIdAuthScreen.jsx'
import AttendanceScreen from './screens/AttendanceScreen.jsx'
import MachineAllotmentScreen from './screens/MachineAllotmentScreen.jsx'
import MachineInputsScreen from './screens/MachineInputsScreen.jsx'
import ProductDimensionsScreen from './screens/ProductDimensionsScreen.jsx'
import OtherScreen from './screens/OtherScreen.jsx'
import HalfDayRequestScreen from './screens/HalfDayRequestScreen.jsx'
import OvertimeRequestScreen from './screens/OvertimeRequestScreen.jsx'
import WorkActivitiesScreen from './screens/WorkActivitiesScreen.jsx'
import MachineMaintenanceScreen from './screens/MachineMaintenanceScreen.jsx'
>>>>>>> master
import HomeScreen from './screens/HomeScreen.jsx'
import InputErrorScreen from './screens/InputErrorScreen.jsx'
import MachineDefectScreen from './screens/MachineDefectScreen.jsx'
import OutputErrorScreen from './screens/OutputErrorScreen.jsx'
import ProductSubmissionScreen from './screens/ProductSubmissionScreen.jsx'
<<<<<<< HEAD
import {
  clearAllDemoData,
  clearAllotment,
  clearLastReminderAt,
  clearSession,
  clearShiftStart,
  getRegisteredUser,
  getSession,
  getTodayAllotment,
  getTodayAttendance,
  saveSession,
  todayKey,
} from './utils/storage.js'
=======
import SupervisorDashboardScreen from './screens/SupervisorDashboardScreen.jsx'
import SupervisorAssignMachineScreen from './screens/SupervisorAssignMachineScreen.jsx'
import SupervisorLabourUpdatesScreen from './screens/SupervisorLabourUpdatesScreen.jsx'
import SupervisorAttendanceScreen from './screens/SupervisorAttendanceScreen.jsx'
import SupervisorRequestsScreen from './screens/SupervisorRequestsScreen.jsx'
import SupervisorReportsScreen from './screens/SupervisorReportsScreen.jsx'
import SupervisorAlertsScreen from './screens/SupervisorAlertsScreen.jsx'
import SupervisorSosScreen from './screens/SupervisorSosScreen.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import {
  clearAllDemoData,
  clearAllotment,
  clearHalfDayRequest,
  clearOvertimeRequest,
  clearSession,
  clearShiftAlertsShown,
  clearShiftStart,
  clearShiftType,
  getRegisteredUser,
  getSession,
  getTodayAllotment,
  saveSession,
  todayKey,
} from './utils/storage.js'
import { clearPinAuth, getPinAuth } from './utils/secureStore.js'
import {
  clearAppLock,
  clearLoggedInOnce,
  getAppLock,
  hasLoggedInOnce,
  markLoggedInOnce,
  seedAppLock,
} from './utils/appLock.js'
import { clearBiometricEnrolment } from './utils/biometrics.js'
import { getRoleForEmployeeId } from './utils/validation.js'
import {
  clearCurrentUser,
  findUserByEmployeeId,
  getAttendanceFor,
  saveCurrentUser,
} from './data/db.js'
>>>>>>> master

/**
 * Where should the app open? A returning visitor resumes mid-flow:
 *   live session + attendance + machine allotment → the labour homepage
 *   live session + attendance                     → the machine allotment
 *   live session only                             → the attendance screen
<<<<<<< HEAD
 *   anything else                                 → the login screen
 */
function resolveStartScreen() {
  if (getSession()) {
    if (!getTodayAttendance()) return 'attendance'
    return getTodayAllotment() ? 'home' : 'machine-allotment'
  }
  return 'login'
=======
 *   logged in once, no live session               → the app lock screen
 *   anything else                                 → the login screen
 *
 * The app lock (utils/appLock.js) implements "log in once": after the
 * first successful credential login every reopen must pass the lock
 * screen (fingerprint / pattern / PIN) before the app opens.
 */
function resolveStartScreen() {
  const session = getSession()
  if (session) {
    // Role-based access control: the supervisor's ID opens the supervisor
    // dashboard; every other ID resumes the labour flow exactly as before.
    if (getRoleForEmployeeId(session.employeeId) === 'supervisor') {
      return 'supervisor'
    }
    // Per-account attendance from the data layer: this worker's record for
    // today (their id + name + check-in time live on it), not a shared flag.
    if (!getAttendanceFor(session.employeeId)) return 'attendance'
    return getTodayAllotment() ? 'home' : 'machine-allotment'
  }
  return hasLoggedInOnce() ? 'app-lock' : 'login'
>>>>>>> master
}

export default function App() {
  // Which screen is visible. The names double as the report-screen keys
  // the homepage's cards navigate to ('input-errors', …).
  const [screen, setScreen] = useState(resolveStartScreen)

<<<<<<< HEAD
=======
  // NOTE: no useI18n() here. App renders the <I18nProvider> itself, so a
  // hook call in App's body would run ABOVE the provider and throw
  // 'useI18n must be used inside an <I18nProvider>' during the first
  // render — unmounting the whole tree (the blank page on every screen).
  // The ErrorBoundary translates its own fallback (see ErrorBoundary.jsx).

>>>>>>> master
  // The account saved on this device (survives refreshes via localStorage).
  // Nothing creates it anymore — signup was removed — but a device that
  // still carries one gets the mockup's personalised greeting.
  const [registeredUser] = useState(getRegisteredUser)

<<<<<<< HEAD
  // Today's attendance record — null until the worker checks in.
  const [attendanceRecord, setAttendanceRecord] = useState(getTodayAttendance)
=======
  // Today's attendance record for the logged-in labour — null until they
  // check in. Read from the data layer (one record per account per day).
  const [attendanceRecord, setAttendanceRecord] = useState(() =>
    getAttendanceFor(getSession()?.employeeId),
  )
>>>>>>> master

  // Today's machine allotment — null until the worker confirms it.
  const [machineAllotment, setMachineAllotment] = useState(getTodayAllotment)

  /* ---- navigation helpers ---- */

<<<<<<< HEAD
  /** Login succeeded: open the session and go to the attendance screen. */
  function handleLogin(phone, employeeId) {
    // Session shape matches utils/storage.js: who signed in, when, and on
    // which day (the day key lets a future "one login per day" check in).
    saveSession({
      mobile: phone,
      employeeId,
      loginTimestamp: new Date().toISOString(),
      dayKey: todayKey(),
    })
    setScreen('attendance')
=======
  /** Open the session for an identity and route by role (labour →
      attendance, supervisor → the supervisor dashboard). */
  function openSession(identity) {
    // Session shape matches utils/storage.js: who signed in, when, and on
    // which day (the day key lets a future "one login per day" check in).
    saveSession({
      mobile: identity.phone,
      employeeId: identity.employeeId,
      loginTimestamp: new Date().toISOString(),
      dayKey: todayKey(),
    })
    // Mirror the logged-in account (id, name, role, credentials) from the
    // data layer for cross-page state — any screen can greet/profile via
    // getCurrentUser(). Null for identities with no account (e.g. the lock
    // vault's corrupted-record fallback); routing still falls back below.
    const user = findUserByEmployeeId(identity.employeeId)
    if (user) saveCurrentUser(user)
    else clearCurrentUser()
    // Role-based access control: a supervisor account (see data/db.js)
    // opens the supervisor dashboard; labour accounts keep the labour flow.
    setScreen(
      getRoleForEmployeeId(identity.employeeId) === 'supervisor'
        ? 'supervisor'
        : 'attendance',
    )
  }

  /** Credential login succeeded → straight into the app (attendance). */
  function handleLogin(phone, employeeId) {
    // "Log in once": stamp the flag and seed the app lock (demo PIN 1234
    // + the demo "L" pattern) so every future reopen shows the lock
    // screen instead of the credential form.
    markLoggedInOnce()
    seedAppLock({ mobile: phone, employeeId })
    openSession({ phone, employeeId })
  }

  /** The saved PIN (or a mock biometric) verified → open the session. */
  async function handleUnlocked() {
    const identity = await getPinAuth()
    if (identity) openSession(identity)
  }

  /** "Not you? Use another account" → forget the PIN + identity, show login. */
  function handlePinForgot() {
    clearPinAuth()
    clearCurrentUser() // the mirrored account belongs to the forgotten identity
    setScreen('login')
  }

  /**
   * The app lock was opened (fingerprint / pattern / PIN) → re-open the
   * session with the identity saved in the lock vault and continue at the
   * attendance screen, the top of the daily flow (attendance → allotment
   * → home).
   */
  async function handleLockUnlocked() {
    const lock = await getAppLock()
    const identity = lock
      ? { phone: lock.mobile, employeeId: lock.employeeId }
      : { phone: '', employeeId: 'SUAB-1024' } // corrupted vault fallback
    openSession(identity) // saves the session and routes to attendance
  }

  /** "Not you? Use another account" on the lock screen → fresh login. */
  function handleLockForgot() {
    clearAppLock()
    clearLoggedInOnce()
    clearBiometricEnrolment()
    clearCurrentUser() // the mirrored account belongs to the forgotten identity
    setScreen('login')
>>>>>>> master
  }

  /** A check-in was saved (or already existed) → the machine allotment. */
  function handleAttendanceDone(record) {
    if (record) setAttendanceRecord(record)
    setScreen('machine-allotment')
  }

  /** Today's machine was confirmed → the labour homepage. */
  function handleMachineAllotted(record) {
    setMachineAllotment(record)
    setScreen('home')
  }

<<<<<<< HEAD
  /** "Start New Shift" on the product submission screen → fresh allotment. */
  function handleStartNewShift() {
    clearShiftStart()
    clearLastReminderAt()
    clearAllotment()
    setMachineAllotment(null)
    setScreen('machine-allotment')
  }

  /** End the session (logout / end shift) → back to the login screen. */
  function handleLogout() {
    clearSession()
    setScreen('login')
=======
  /** "Start New Shift" on the product submission screen → the app lock.
      The new shift is a full shift again at its base length — any
      half-day approval and approved overtime applied to the shift that
      just ended. Unlocking the app continues at the attendance screen,
      which starts the next shift's flow. */
  function handleStartNewShift() {
    clearShiftStart()
    clearShiftAlertsShown()
    clearShiftType()
    clearHalfDayRequest()
    clearOvertimeRequest()
    clearAllotment()
    setMachineAllotment(null)
    setScreen('app-lock')
  }

  /** End the session (logout / end shift) → back past the app lock. */
  function handleLogout() {
    clearSession()
    clearCurrentUser() // forget the mirrored logged-in account too
    // The device has logged in once, so the lock screen — not the
    // credential form — guards the next reopen.
    setScreen(hasLoggedInOnce() ? 'app-lock' : 'login')
>>>>>>> master
  }

  /** Wipe every persisted value and restart the demo at the login screen. */
  function handleResetDemo() {
<<<<<<< HEAD
    clearAllDemoData()
=======
    clearAllDemoData() // also clears the encrypted PIN vault (secureStore)
    clearBiometricEnrolment() // forget the enrolled OS passkey too
>>>>>>> master
    setAttendanceRecord(null)
    setMachineAllotment(null)
    setScreen('login')
  }

  /* ---- screen switch ---- */

  function renderScreen() {
    switch (screen) {
      case 'login':
<<<<<<< HEAD
        return <LoginScreen registeredUser={registeredUser} onLogin={handleLogin} />
=======
        return (
          <LoginScreen
            registeredUser={registeredUser}
            onLogin={handleLogin}
            onUnlockWithPin={() => setScreen('enter-pin')}
            onFingerprint={() => setScreen('fingerprint')}
            onFaceId={() => setScreen('face-id')}
          />
        )

      case 'app-lock':
        return <AppLockScreen onUnlocked={handleLockUnlocked} onForgot={handleLockForgot} />

      case 'enter-pin':
        return <EnterPinScreen onUnlocked={handleUnlocked} onForgot={handlePinForgot} />

      case 'fingerprint':
        return <FingerprintAuthScreen onUnlocked={handleUnlocked} onFallback={() => setScreen('enter-pin')} />

      case 'face-id':
        return <FaceIdAuthScreen onUnlocked={handleUnlocked} onFallback={() => setScreen('enter-pin')} />
>>>>>>> master

      case 'attendance':
        return (
          <AttendanceScreen
            attendanceRecord={attendanceRecord}
            onCheckIn={handleAttendanceDone}
            onContinue={handleAttendanceDone}
          />
        )

      case 'machine-allotment':
        return (
          <MachineAllotmentScreen
            onBack={() => setScreen('attendance')}
            onConfirm={handleMachineAllotted}
<<<<<<< HEAD
          />
        )

=======
            onOpenScreen={setScreen}
          />
        )

      /* Detail screens opened by tapping the allotment cards — they only
         read static demo data, so nothing here touches the flow state. */
      case 'machine-inputs':
        return <MachineInputsScreen onBack={() => setScreen('machine-allotment')} />

      case 'product-dimensions':
        return <ProductDimensionsScreen onBack={() => setScreen('machine-allotment')} />

      /* "Other" — requests & updates. A half-day approval flips the shift
         type to 'half' in storage; the homepage's existing timer picks it
         up when it next mounts. The half-day tile itself opens the voice
         recording screen ('half-day'), which saves the same PENDING
         request the old in-place tap used to — returning here resumes the
         pending → approved countdown untouched. The overtime tile opens
         the hours request screen ('overtime'), which runs its own
         10-second demo approval. */
      case 'other':
        return (
          <OtherScreen
            onBack={() => setScreen('machine-allotment')}
            onHome={() => setScreen('home')}
            onApplyHalfDay={() => setScreen('half-day')}
            onApplyOvertime={() => setScreen('overtime')}
            onReportMaintenance={() => setScreen('machine-maintenance')}
            onUpdateActivities={() => setScreen('work-activities')}
          />
        )

      /* The voice-based "Apply for Half Day" form (MediaRecorder note →
         play back / retake → submit). Submitting saves the pending
         half-day request and returns to "Other", whose approval effect
         picks the countdown back up. */
      case 'half-day':
        return <HalfDayRequestScreen onBack={() => setScreen('other')} />

      /* The "Apply for Overtime" form (quick-pick hour chips / − + stepper
         → submit). Submitting saves the pending overtime request and runs
         the screen's own 10-second demo approval, then returns to "Other". */
      case 'overtime':
        return <OvertimeRequestScreen onBack={() => setScreen('other')} />

      /* The voice-based "Update Other Work Activities" form (MediaRecorder
         note → play back / retake → submit). Submitting saves the take as
         a work update (kind: 'activity') and returns to "Other". */
      case 'work-activities':
        return <WorkActivitiesScreen onBack={() => setScreen('other')} />

      /* The voice-based "Report Machine Maintenance" form (MediaRecorder
         note → play back / retake → submit). Submitting saves the take as
         a work update (kind: 'maintenance') and returns to "Other". */
      case 'machine-maintenance':
        return <MachineMaintenanceScreen onBack={() => setScreen('other')} />

>>>>>>> master
      case 'home':
        return (
          <HomeScreen
            allottedMachine={machineAllotment}
            onShiftEnd={() => setScreen('product-submission')}
            onOpenScreen={setScreen}
            onResetDemo={handleResetDemo}
          />
        )

      case 'input-errors':
        return <InputErrorScreen onBack={() => setScreen('home')} />

      case 'machine-defect':
        return <MachineDefectScreen onBack={() => setScreen('home')} />

      case 'output-errors':
        return <OutputErrorScreen onBack={() => setScreen('home')} />

      case 'product-submission':
        return (
          <ProductSubmissionScreen
            onStartNewShift={handleStartNewShift}
            onLogout={handleLogout}
          />
        )

<<<<<<< HEAD
=======
      /* Supervisor dashboard — reached only when the login's Employee ID is
         the supervisor's (9977, see getRoleForEmployeeId). Logout reuses the
         same session teardown as the labour flow. "Assign Machine" opens
         the supervisor's assignment screen (see 'supervisor-assign'). */
      case 'supervisor':
        return (
          <SupervisorDashboardScreen
            employeeId={getSession()?.employeeId ?? ''}
            onLogout={handleLogout}
            onOpenAssignMachine={() => setScreen('supervisor-assign')}
          onOpenLabourUpdates={() => setScreen('supervisor-updates')}
          onOpenAttendance={() => setScreen('supervisor-attendance')}
          onOpenRequests={() => setScreen('supervisor-requests')}
          onOpenReports={() => setScreen('supervisor-reports')}
          onOpenAlerts={() => setScreen('supervisor-alerts')}
          onOpenSos={() => setScreen('supervisor-sos')}
          />
        )

      /* Supervisor "Assign Machine" — pick a worker, machine, raw material,
         output details and priority, preview, then confirm. Assignments
         live in data/assignments.js; the labour home's assigned-job banner
         reads the same store. Back returns to the dashboard; the bottom
         nav's Reports/Alerts tabs open their screens. */
      case 'supervisor-assign':
        return (
          <SupervisorAssignMachineScreen
            onBack={() => setScreen('supervisor')}
            onOpenReports={() => setScreen('supervisor-reports')}
            onOpenAlerts={() => setScreen('supervisor-alerts')}
          />
        )

      /* Supervisor "Labour Updates" — the roster with each labourer's video
         update (or a muted "not submitted" state). Back returns to the
         dashboard, same pattern as 'supervisor-assign'. */
      case 'supervisor-updates':
        return (
          <SupervisorLabourUpdatesScreen
            onBack={() => setScreen('supervisor')}
            onOpenReports={() => setScreen('supervisor-reports')}
            onOpenAlerts={() => setScreen('supervisor-alerts')}
          />
        )

      /* Supervisor "Attendance" — the roster with each labourer's check-in
         status for a chosen day (date strip + present/not-present badges).
         Back returns to the dashboard, same pattern as 'supervisor-updates'. */
      case 'supervisor-attendance':
        return (
          <SupervisorAttendanceScreen
            onBack={() => setScreen('supervisor')}
            onOpenReports={() => setScreen('supervisor-reports')}
            onOpenAlerts={() => setScreen('supervisor-alerts')}
          />
        )

      /* Supervisor "Requests" — the labourers' half-day/overtime requests
         with Approve/Reject decisions (persisted in data/requests.js; live
         labour requests write back to utils/storage.js). Back returns to
         the dashboard, same pattern as 'supervisor-attendance'. */
      case 'supervisor-requests':
        return <SupervisorRequestsScreen onBack={() => setScreen('supervisor')} />

      /* Supervisor "Reports" — each labourer's work-history metrics for a
         chosen day (date picker + collapsible cards). Back returns to the
         dashboard; the bottom nav's Alerts tab opens the alerts screen. */
      case 'supervisor-reports':
        return (
          <SupervisorReportsScreen
            onBack={() => setScreen('supervisor')}
            onOpenAlerts={() => setScreen('supervisor-alerts')}
          />
        )

      /* Supervisor "Emergency Alerts" — the labourers' breakdown/defect
         alerts with Acknowledge/Resolve actions (persisted in
         data/alerts.js). Back returns to the dashboard; the bottom nav's
         Reports tab opens the reports screen. */
      case 'supervisor-alerts':
        return (
          <SupervisorAlertsScreen
            onBack={() => setScreen('supervisor')}
            onOpenReports={() => setScreen('supervisor-reports')}
          />
        )

      /* Supervisor "SOS Alerts" — the labourers' emergency alerts with
         Acknowledge/Resolve actions (the shared sosAlerts collection).
         Reached from the dashboard's blinking SOS overlay or its SOS
         banner; Back returns to the dashboard. */
      case 'supervisor-sos':
        return <SupervisorSosScreen onBack={() => setScreen('supervisor')} />

>>>>>>> master
      default:
        return null
    }
  }

  /* The app-frame shell (index.css) is the flex-column parent every screen's
     `flex: 1` layout expects: full phone height, 430px column on desktop,
<<<<<<< HEAD
     and it clips the decorative background shapes. */
  return (
    <I18nProvider>
      <div className="app-frame">{renderScreen()}</div>
=======
     and it clips the decorative background shapes. A boundary wraps ONLY the
     routed screen: a crash in one screen (e.g. a malformed update record)
     shows a recoverable message instead of unmounting the whole tree — the
     login screen and the shell stay alive. */
  return (
    <I18nProvider>
      <div className="app-frame">
        <ErrorBoundary>
          {renderScreen()}
        </ErrorBoundary>
      </div>
>>>>>>> master
    </I18nProvider>
  )
}
