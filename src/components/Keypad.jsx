/**
 * Keypad.jsx — the on-screen number pad.
 *
 * Layout (matches the reference image):
 *   1 2 3
 *   4 5 6
 *   7 8 9
 *   0 ⌫        <- two keys in the bottom row, like the mockup
 *
 * Props:
 *  - onDigit      called with the pressed digit ('0'-'9')
 *  - onBackspace  called when ⌫ is pressed
 *  - onClear      when given, the bottom row's empty slot
 *                 becomes a "C" (clear all) key — used by the product
 *                 submission screen
 */

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

export default function Keypad({ onDigit, onBackspace, onClear }) {
  return (
    <div className="keypad" aria-label="Number keypad">
      {ROWS.map((row) => (
        <div className="keypad__row" key={row[0]}>
          {row.map((digit) => (
            <button
              key={digit}
              type="button"
              className="keypad__key"
              onClick={() => onDigit(digit)}
            >
              {digit}
            </button>
          ))}
        </div>
      ))}

      {/* Bottom row: 0 and backspace, matching the mockup's two keys. */}
      <div className="keypad__row">
        <button
          type="button"
          className="keypad__key"
          onClick={() => onDigit('0')}
        >
          0
        </button>
        <button
          type="button"
          className="keypad__key keypad__key--icon"
          onClick={onBackspace}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
        {/* Third slot: a clear key when the screen asks for one
            (product submission), otherwise empty like the mockup. */}
        {onClear ? (
          <button
            type="button"
            className="keypad__key keypad__key--clear"
            onClick={onClear}
            aria-label="Clear entry"
          >
            C
          </button>
        ) : (
          <span className="keypad__key keypad__key--empty" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
