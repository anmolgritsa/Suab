/**
 * App.jsx — the app's tiny state-based router (no react-router).
 *
 * Flow:
 *   Part 1 (auth)       login (phone + supervisor-issued Employee ID)
 *   Part 2 (attendance) login → attendance (simulated GPS check-in)
 *                       → machine allotment (today's assigned machine)
 *   Part 3 (homepage)   allotment → home ⇄ { input-errors, machine-defect,
 *                       output-errors } → product-submission (shift end)
 *
 * The whole tree is wrapped in one <I18nProvider> so every screen can
 * translate its strings and the language choice persists across screens.
 */

import { useState } from 'react'
import { I18nProvider } from './i18n.jsx'
import LoginScreen from './screens/LoginScreen.jsx'
import AttendanceScreen from './screens/AttendanceScreen.jsx'
import MachineAllotmentScreen from './screens/MachineAllotmentScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import InputErrorScreen from './screens/InputErrorScreen.jsx'
import MachineDefectScreen from './screens/MachineDefectScreen.jsx'
import OutputErrorScreen from './screens/OutputErrorScreen.jsx'
import ProductSubmissionScreen from './screens/ProductSubmissionScreen.jsx'
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

/**
 * Where should the app open? A returning visitor resumes mid-flow:
 *   live session + attendance + machine allotment → the labour homepage
 *   live session + attendance                     → the machine allotment
 *   live session only                             → the attendance screen
 *   anything else                                 → the login screen
 */
function resolveStartScreen() {
  if (getSession()) {
    if (!getTodayAttendance()) return 'attendance'
    return getTodayAllotment() ? 'home' : 'machine-allotment'
  }
  return 'login'
}

export default function App() {
  // Which screen is visible. The names double as the report-screen keys
  // the homepage's cards navigate to ('input-errors', …).
  const [screen, setScreen] = useState(resolveStartScreen)

  // The account saved on this device (survives refreshes via localStorage).
  // Nothing creates it anymore — signup was removed — but a device that
  // still carries one gets the mockup's personalised greeting.
  const [registeredUser] = useState(getRegisteredUser)

  // Today's attendance record — null until the worker checks in.
  const [attendanceRecord, setAttendanceRecord] = useState(getTodayAttendance)

  // Today's machine allotment — null until the worker confirms it.
  const [machineAllotment, setMachineAllotment] = useState(getTodayAllotment)

  /* ---- navigation helpers ---- */

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
  }

  /** Wipe every persisted value and restart the demo at the login screen. */
  function handleResetDemo() {
    clearAllDemoData()
    setAttendanceRecord(null)
    setMachineAllotment(null)
    setScreen('login')
  }

  /* ---- screen switch ---- */

  function renderScreen() {
    switch (screen) {
      case 'login':
        return <LoginScreen registeredUser={registeredUser} onLogin={handleLogin} />

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
          />
        )

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

      default:
        return null
    }
  }

  /* The app-frame shell (index.css) is the flex-column parent every screen's
     `flex: 1` layout expects: full phone height, 430px column on desktop,
     and it clips the decorative background shapes. */
  return (
    <I18nProvider>
      <div className="app-frame">{renderScreen()}</div>
    </I18nProvider>
  )
}
