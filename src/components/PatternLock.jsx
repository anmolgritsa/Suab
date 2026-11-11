/**
 * PatternLock.jsx — the in-app "draw pattern to unlock" grid.
 *
 * A 3×3 field of dots (like a phone's pattern lock). The worker presses a
 * dot and drags through the grid; every dot the pointer passes through is
 * added to the path in order, with an SVG line tracing the trail. On
 * release the finished path is handed to the parent for verification.
 *
 * Behaviour:
 *   - works with touch AND mouse (Pointer Events + pointer capture), so
 *     the desktop demo can be driven with a mouse
 *   - a path shorter than 4 dots is discarded silently (matches Android)
 *   - when the parent bumps `wrongCount` (a failed attempt) the dots turn
 *     red and shake, then the grid clears itself for the next try
 *   - `disabled` freezes the grid (used during the lockout countdown)
 *
 * Props:
 *  - onComplete(path)     pointer released with ≥4 dots — path = indices
 *                         in draw order (row-major: 0 top-left … 8 bottom-right)
 *  - wrongCount           increment to flash the "wrong pattern" state
 *  - disabled             ignore all pointer input while true
 *  - onDrawStart()        a new draw just began (the parent clears its
 *                         error text with it)
 */

import { useEffect, useRef, useState } from 'react'

/** A draw must join at least this many dots to be offered for verification. */
const MIN_DOTS = 4

/** How far (px) from a dot's centre the pointer still counts as "on" it. */
const HIT_RADIUS = 30

/** How long the red "wrong" flash lasts before the grid clears. */
const ERROR_MS = 600

/* The grid is a fixed 240×240 square (keep in sync with .pattern in
   screens.css), so the dot centres are pure constants — the SVG trail can
   be rendered without touching the DOM. */
const GRID_SIZE = 240
const CELL = GRID_SIZE / 3

/** The 9 dot centres in the grid's LOCAL coordinates (row-major). */
const CENTRES = Array.from({ length: 9 }, (_, index) => ({
  x: (index % 3) * CELL + CELL / 2,
  y: Math.floor(index / 3) * CELL + CELL / 2,
}))

export default function PatternLock({ onComplete, wrongCount = 0, disabled = false, onDrawStart }) {
  const gridRef = useRef(null)
  // Dot indices joined so far, in draw order.
  const [path, setPath] = useState([])
  // Pointer position while dragging — the live segment's endpoint.
  const [trail, setTrail] = useState(null)
  // True for the brief red shake after a failed attempt.
  const [wrong, setWrong] = useState(false)
  // The wrongCount value we last reacted to (see the render-time check below).
  const [seenWrong, setSeenWrong] = useState(wrongCount)

  /* React to a failed attempt (the parent bumps wrongCount) during render —
     the React-endorsed "adjust state when a prop changes" pattern, which
     avoids a cascading extra render from an effect. */
  if (wrongCount !== seenWrong) {
    setSeenWrong(wrongCount)
    if (wrongCount) {
      setWrong(true)
      setPath([])
      setTrail(null)
    }
  }

  /* The red flash clears itself after a moment (setState inside the
     timeout callback is fine — it is not synchronous in the effect body). */
  useEffect(() => {
    if (!wrong) return undefined
    const timer = setTimeout(() => setWrong(false), ERROR_MS)
    return () => clearTimeout(timer)
  }, [wrong])

  /**
   * Convert a pointer event's viewport coordinates into the grid's LOCAL
   * coordinates (event handlers may read the DOM; render may not).
   */
  function toLocal(clientX, clientY) {
    const rect = gridRef.current.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  /** Which dot (if any) sits under this local position? */
  function hitTest(localX, localY) {
    for (let index = 0; index < CENTRES.length; index += 1) {
      const dx = CENTRES[index].x - localX
      const dy = CENTRES[index].y - localY
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return index
    }
    return -1
  }

  function handleDown(event) {
    if (disabled) return
    const local = toLocal(event.clientX, event.clientY)
    const index = hitTest(local.x, local.y)
    if (index === -1) return
    gridRef.current.setPointerCapture(event.pointerId)
    onDrawStart?.() // a new draw began — the parent can clear its error text
    setPath([index])
    setTrail(local)
  }

  function handleMove(event) {
    if (disabled || path.length === 0) return
    const local = toLocal(event.clientX, event.clientY)
    setTrail(local)
    const index = hitTest(local.x, local.y)
    if (index !== -1 && !path.includes(index)) setPath((current) => [...current, index])
  }

  function handleUp() {
    if (disabled || path.length === 0) return
    setTrail(null)
    if (path.length >= MIN_DOTS) {
      onComplete([...path]) // a full pattern — let the parent verify it
    }
    setPath([]) // too short (or already handed over) — reset for the next draw
  }

  /* Build the SVG polyline through the joined dots (+ the live trail).
     Pure state + constants — safe to call during render. */
  function linePoints() {
    const points = path.map((index) => CENTRES[index])
    if (trail && path.length > 0) points.push(trail)
    return points.map((point) => `${point.x},${point.y}`).join(' ')
  }

  const hasPath = path.length > 0

  return (
    <div
      ref={gridRef}
      className={wrong ? 'pattern pattern--wrong' : 'pattern'}
      role="group"
      aria-label="Pattern lock grid"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={() => {
        setPath([])
        setTrail(null)
      }}
    >
      {/* The trail is drawn under the dots but above the background.
          No viewBox: the SVG's user units are 1:1 with the grid's CSS px,
          which is the space geometry() measures in. */}
      {hasPath && (
        <svg className="pattern__lines" aria-hidden="true">
          <polyline points={linePoints()} className="pattern__line" />
        </svg>
      )}

      {Array.from({ length: 9 }, (_, index) => (
        <span
          key={index}
          className={
            path.includes(index) ? 'pattern__dot pattern__dot--active' : 'pattern__dot'
          }
          data-index={index}
        />
      ))}
    </div>
  )
}
