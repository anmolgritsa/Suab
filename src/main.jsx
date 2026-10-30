import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // design tokens, reset, app shell
import './styles/components.css' // reusable pieces (fields, buttons, keypad…)
import './styles/screens.css' // per-screen layout
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
