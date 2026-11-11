import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // design tokens, reset, app shell
import './styles/components.css' // reusable pieces (fields, buttons, keypad…)
import './styles/screens.css' // per-screen layout
import './styles/supervisor-assign.css' // supervisor assign-machine screen + labour job banner
import './styles/supervisor-updates.css' // supervisor labour-updates screen
import './styles/supervisor-attendance.css' // supervisor attendance screen
import './styles/supervisor-requests.css' // supervisor requests screen
import './styles/supervisor-reports.css' // supervisor reports screen
import './styles/supervisor-alerts.css' // supervisor emergency-alerts screen
import App from './App.jsx'
import { startSyncBridge } from './data/syncBridge.js'

// Cross-BROWSER sync: pull the shared DB (survives restarts in
// .data/db.json) and subscribe to live updates. We await the initial pull
// BEFORE mounting so a brand-new browser adopts the shared attendance
// instead of overwriting it with its own fresh seed on its first write.
// If the API is absent the await resolves immediately and the app simply
// runs as pure localStorage.
startSyncBridge().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// PWA: register the build-time service worker (production only — the dev
// server never emits sw.js, and a failed registration is harmless anyway).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {})
  })
}
