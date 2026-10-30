/**
 * Toast.jsx — a small dark message that pops up near the bottom of the
 * screen and disappears on its own. Used for the mock interactions
 * (Forgot Password, Help, Fingerprint, SOS sent, report submitted, …).
 *
 * Each screen owns its own toast state; this component just renders it.
 *
 * Props:
 *  - message  text to show (null/undefined = hidden)
 *  - onClose  called when the toast's close button is tapped
 */

import { useEffect } from 'react'

export default function Toast({ message, onClose }) {
  // Auto-hide after 2.6 seconds. The timer is cleaned up when the toast
  // unmounts or the message changes, which avoids stale timers.
  useEffect(() => {
    if (!message) return undefined
    const timer = setTimeout(onClose, 2600)
    return () => clearTimeout(timer)
  }, [message, onClose])

  if (!message) return null

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button className="toast__close" type="button" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
