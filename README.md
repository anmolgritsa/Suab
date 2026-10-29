# SUAB — Factory Management App

A mobile-first React + Vite demo covering the **Login → Attendance → Labour
Homepage → Product Submission** flow of the SUAB factory management app.
Built for the iPhone 16 viewport (393×852) and touch-first, but it also
renders as a centred phone column on desktop.

> The original auth flow (Signup → OTP) was removed — the demo now starts
> straight at Login. A device that still carries an old `suab.registeredUser`
> record gets the mockup's personalised greeting.

## Run it

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run lint     # eslint
```

## The flow

```
login ──(ok)──> attendance ──(Check In)──> home ──(End Shift)──> product submission
                  ▲                        │                        │
                  │                        │                        ├─(Logout)──> login
                  └────(refresh resumes)───┘                        └─(Start New Shift)──> home

home ──(action cards)──> report screens (Raw Material Issue / Machine Defect / Output Error)
```

- **Login** — phone + 4-digit PIN, a mock **Use Fingerprint** action and mock
  **Forgot Password?** / **Help** actions (they only show a toast). A device
  with a saved account is greeted by name.
- **Attendance** — the worker's GPS is simulated with three states (small
  "Demo GPS" chips at the bottom): **At location** (blue, Check In),
  **Not at location** (coral, Go to Location) and **Location off** (purple,
  Turn On Location). A check-in saves today's record and opens the homepage.
  If today's record already exists (e.g. after a refresh) the screen shows
  "Attendance Marked" with the time, and a "Today's Shift" summary card
  mirrors the demo timing knobs.
- **Labour Homepage** — a live shift timer (5-minute demo shift), three
  action cards (Raw Material Issue / Machine Defect / Output Error), an SOS
  button with a confirm dialog, a work-update reminder that pops every
  3 minutes, a language dropdown (English, हिन्दी, বাংলা, ਪੰਜਾਬੀ, తెలుగు)
  and a "Reset demo data" link.
- **Report screens** — one per action card: category + a mandatory photo
  attachment, with validation, a confirmation toast and a back arrow.
- **Product Submission** — after the shift auto-ends (or "End Shift" is
  tapped): a keypad to enter today's output (capped at the assigned
  quantity), then a shift-completed confirmation with Logout and
  "Start New Shift".

## Demo credentials (no real backend)

| Thing        | Value  |
| ------------ | ------ |
| Demo PIN     | `1234` |
| Phone number | any 10-digit Indian mobile |

The login screen shows the demo PIN in a small chip so testers don't have
to remember it.

## Persistence

Everything is stored in `localStorage` (see `src/utils/storage.js`):

- `suab.session` — set after login, cleared by Logout. A visitor with a
  live session resumes the flow after a refresh (attendance or homepage).
- `suab.attendance` — today's check-in record
  `{ date, checkInAt, workerLat, workerLng, distanceMeters }`. The date
  inside the record makes attendance reset automatically every day.
- `suab.shiftStart` — ISO time the current shift began (drives the timer,
  the reminder cadence and the automatic end-of-shift).
- `suab.language` — the language the homepage is translated into.
- `suab.sosEvents` / `suab.workUpdates` / `suab.issueReports` /
  `suab.productSubmissions` — the demo's mock event logs.
- `suab.registeredUser` — legacy; only read to personalise the greeting.

Clearing site data (or tapping **Reset demo data**) resets the demo.

## Project structure

```
src/
  main.jsx               entry — imports the styles and mounts <App />
  App.jsx                tiny state-based router for the seven screens
  i18n.jsx               language list + translations (I18nProvider)
  index.css              design tokens, reset, app shell, decorations
  styles/
    components.css       reusable pieces (fields, buttons, keypad, toast…)
    screens.css          per-screen layout
  utils/
    storage.js           localStorage helpers (+ attendance records)
    validation.js        form validators + demo PIN constant
    geo.js               simulated GPS: factory geofence + worker presets
    shift.js             shift timer / reminder / auto-end maths
  components/
    icons.jsx            inline SVG icon set
    BrandLogo.jsx        SUAB brand lock-up (homepage header)
    Logo.jsx             SUAB brand lock-up (auth screens)
    TextField.jsx        input with icon + error text
    PrimaryButton.jsx    big pill button (blue/coral/purple variants)
    AttendanceArt.jsx    state-themed attendance illustration
    Keypad.jsx           on-screen number pad
    Toast.jsx            auto-hiding toast for mock actions
    ShiftTimer.jsx       hh:mm:ss shift timer
    SosButton.jsx        emergency button + confirm dialog
    ActionCard.jsx       homepage action card
    LanguageDropdown.jsx language picker
    WorkUpdateReminder.jsx periodic "send work update" popup
    ReportForm.jsx       shared report form (category / description / photo)
  screens/
    LoginScreen.jsx      mockup 3 — Welcome Back
    AttendanceScreen.jsx mockup 4 — Mark Attendance (simulated GPS)
    HomeScreen.jsx       mockup 6 — Labour Homepage
    InputErrorScreen.jsx    Raw Material Issue report
    MachineDefectScreen.jsx Machine Defect report
    OutputErrorScreen.jsx   Output Error report
    ProductSubmissionScreen.jsx output entry + shift completed
```

## Developer sanity checks

Five node scripts (no test framework needed):

```bash
node smoke-test.mjs        # checks validation, geo and attendance logic
node shift-test.mjs        # checks the shift timer / reminder maths
node render-test.mjs       # server-renders every screen to catch crashes
node attendance-check.mjs  # real-browser walk of the three GPS states
node home-check.mjs        # real-browser walk of the whole homepage flow
```
