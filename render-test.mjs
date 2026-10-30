/**
 * render-test.mjs — server-side render smoke test.
 *
 * Uses Vite's own module loader (already a dev dependency) so the JSX
 * files can be imported under plain node. Every screen is rendered to a
 * string to catch render-time crashes without needing a browser.
 * Run with:  node render-test.mjs
 */

import { createServer } from 'vite'
// react / react-dom load natively in node (only the app's JSX needs Vite).
const { renderToString } = await import('react-dom/server')
const { createElement } = await import('react')

// Minimal localStorage shim BEFORE the app modules load (node has none).
const memoryStore = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => memoryStore.set(k, String(v)),
    removeItem: (k) => memoryStore.delete(k),
  },
}

// Start Vite in middleware mode — no browser, just module transformation.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const { default: App } = await vite.ssrLoadModule('/src/App.jsx')
const { default: LoginScreen } = await vite.ssrLoadModule('/src/screens/LoginScreen.jsx')
const { default: AttendanceScreen } = await vite.ssrLoadModule('/src/screens/AttendanceScreen.jsx')
const { I18nProvider } = await vite.ssrLoadModule('/src/i18n.jsx')
const { default: HomeScreen } = await vite.ssrLoadModule('/src/screens/HomeScreen.jsx')
const { default: InputErrorScreen } = await vite.ssrLoadModule('/src/screens/InputErrorScreen.jsx')
const { default: MachineDefectScreen } = await vite.ssrLoadModule('/src/screens/MachineDefectScreen.jsx')
const { default: OutputErrorScreen } = await vite.ssrLoadModule('/src/screens/OutputErrorScreen.jsx')
const { default: ProductSubmissionScreen } = await vite.ssrLoadModule('/src/screens/ProductSubmissionScreen.jsx')
const { saveRegisteredUser } = await vite.ssrLoadModule('/src/utils/storage.js')

let failures = 0

function renderCase(label, element, mustContain = []) {
  try {
    const raw = renderToString(element)
    // SSR inserts <!-- --> between adjacent text expressions (so
    // "00:00:00" becomes 00<!-- -->:<!-- -->00...) and escapes entities
    // (& → &amp;). Normalise both so expectations read naturally.
    const html = raw
      .replace(/<!--.*?-->/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
    const missing = mustContain.filter((text) => !html.includes(text))
    if (missing.length > 0) {
      failures += 1
      console.log('FAIL', label, '— missing:', missing.join(' | '))
    } else {
      console.log('PASS', label, `(${raw.length} chars)`)
    }
  } catch (error) {
    failures += 1
    console.log('FAIL', label, '— threw:', error.message)
  }
}

// 1. Full app, fresh visitor → login screen first.
renderCase('App fresh → login', createElement(App), [
  'Welcome Back,',
  'Use the ID your supervisor gave you',
  'Phone Number',
  'Employee ID',
  'Login',
  'Demo: any Employee ID works',
  'SUAB',
])

// 2. Each screen rendered directly with representative props.
renderCase(
  'LoginScreen (no registered user)',
  createElement(LoginScreen, {
    registeredUser: null,
    onLogin: () => {},
  }),
  [
    'Welcome Back,',
    'Use the ID your supervisor gave you',
    'Phone Number',
    'Employee ID',
    'Login',
    'Use Fingerprint',
    'Forgot Password?',
    'Help',
  ],
)

renderCase(
  'LoginScreen (registered user greeting)',
  createElement(LoginScreen, {
    registeredUser: { name: 'Anmol Bajpai', phone: '9876543210' },
    onLogin: () => {},
  }),
  ['Welcome Back,', 'Anmol Bajpai'],
)

// Part 2 screens: attendance (default simulated GPS = at location) and the
// Machine Allotment screen that follows a successful check-in.
renderCase(
  'AttendanceScreen (at location)',
  createElement(AttendanceScreen, {
    attendanceRecord: null,
    onCheckIn: () => {},
    onContinue: () => {},
  }),
  // Note: renderToString escapes the apostrophe (&#x27;), so match a
  // substring without one.
  ['Mark Attendance', 'at the location', 'Check In', 'SUAB Factory', 'At location'],
)

renderCase(
  'AttendanceScreen (already checked in)',
  createElement(AttendanceScreen, {
    attendanceRecord: { date: '2026-10-28', checkInAt: '2026-10-28T09:42:11.000Z' },
    onCheckIn: () => {},
    onContinue: () => {},
  }),
  ['Attendance Marked', 'checked in at', 'Continue'],
)

// Part 3 screens: the labour homepage and its report / product screens.
// The homepage (and every screen using translations) needs the I18nProvider.
renderCase(
  'HomeScreen',
  createElement(I18nProvider, null, createElement(HomeScreen, {
    onShiftEnd: () => {},
    onOpenScreen: () => {},
    onResetDemo: () => {},
  })),
  [
    'SUAB',
    '00:00:0', // fresh shift timer starts at 00:00:00 (hh:mm:ss)
    'Raw Material Issue',
    'Machine Breakdown',
    'Output Defect',
    'SOS',
    'EMERGENCY',
    'Reset demo data',
  ],
)

renderCase(
  'InputErrorScreen (report form)',
  createElement(I18nProvider, null, createElement(InputErrorScreen, { onBack: () => {} })),
  ['Input Errors', 'raw material', 'Add a photo or video (required)', 'Choose photo / video', 'Submit Report', 'Cancel'],
)

renderCase(
  'MachineDefectScreen (report form)',
  createElement(I18nProvider, null, createElement(MachineDefectScreen, { onBack: () => {} })),
  ['Machine Defect', 'fault', 'Add a photo or video (required)', 'Choose photo / video', 'Submit Report', 'Cancel'],
)

renderCase(
  'OutputErrorScreen (report form)',
  createElement(I18nProvider, null, createElement(OutputErrorScreen, { onBack: () => {} })),
  ['Output Errors', 'defective pieces', 'Add a photo or video (required)', 'Choose photo / video', 'Submit Report', 'Cancel'],
)

renderCase(
  'ProductSubmissionScreen (keypad form)',
  createElement(I18nProvider, null, createElement(ProductSubmissionScreen, {
    onStartNewShift: () => {},
    onLogout: () => {},
  })),
  ['Product Submission', 'Assigned quantity', '>500<', 'Confirm', 'End Shift & Submit'],
)

// 3. Full app with a registered user in localStorage → starts on login.
saveRegisteredUser({ name: 'Anmol Bajpai', phone: '9876543210' })
renderCase('App returning visitor → login', createElement(App), [
  'Welcome Back,',
  'Anmol Bajpai',
  'Use Fingerprint',
])

// 4. Full app with a LIVE session + today's attendance + today's accepted
//    machine allotment → resumes on the Labour Homepage (the flow's last
//    step). Without the allotment the app would stop at the Machine
//    Allotment screen instead.
const { saveSession, saveAttendance, saveAllotment, clearSession, clearAttendance, clearAllotment } =
  await vite.ssrLoadModule('/src/utils/storage.js')
saveSession({ mobile: '9876543210', employeeId: 'SUAB-1024' })
saveAttendance({ checkInAt: new Date().toISOString() })
saveAllotment({
  machineId: 'M-04',
  machineName: 'Tile Press #4',
  machineType: 'Pressing',
  targetQuantity: 500,
  acceptedAt: new Date().toISOString(),
})
renderCase('App live session + attendance + allotment → home', createElement(App), [
  'Raw Material Issue',
  'Machine Breakdown',
  'Output Defect',
  'SOS',
])
clearSession()
clearAttendance()
clearAllotment()

await vite.close()

if (failures > 0) {
  console.log(`\n${failures} render test(s) FAILED`)
  process.exit(1)
}
console.log('\nAll render tests passed')
