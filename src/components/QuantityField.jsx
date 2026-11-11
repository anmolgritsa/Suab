/**
 * QuantityField.jsx — one count row on the Product Submission screen.
 *
 * Layout: [icon] Label          [−] [ input ] [+] [🎤]
 *
 * The worker can TYPE in the field, tap − / + to step the count, or tap
 * the mic and say the number (the screen owns the mic logic — this row
 * only reports the tap and shows the pulsing "listening" state).
 *
 * Props:
 *  - icon         React node shown in the coloured badge
 *  - accent       'success' | 'danger' | 'info' — badge + border colour
 *  - label        the field's name (already translated)
 *  - value        the count as a STRING ('' = empty)
 *  - onChange     called with the new string on every edit/step
 *  - listening    true while this row's mic is recording (pulses red)
 *  - onMicPress   mic tapped (toggle handled by the screen)
 *  - micDisabled  true when speech recognition is unavailable
 *  - micLabel     accessible name for the mic button
 */

import { MicIcon } from './icons.jsx';

const MAX_COUNT = 99999; // plenty for a shift, keeps the input tidy

export default function QuantityField({
  icon,
  accent = 'info',
  label,
  value,
  onChange,
  listening = false,
  onMicPress,
  micDisabled = false,
  micLabel,
}) {
  const count = Number(value || 0);

  /** Keep the value a plain digit string, capped at MAX_COUNT. */
  function handleInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 5);
    onChange(digits);
  }

  function step(delta) {
    const next = Math.max(0, Math.min(MAX_COUNT, count + delta));
    onChange(String(next));
  }

  const classes =
    'qty-field' +
    (accent ? ` qty-field--${accent}` : '') +
    (listening ? ' qty-field--listening' : '');

  return (
    <div className={classes}>
      <div className="qty-field__head">
        <span className="qty-field__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="qty-field__label">{label}</span>
      </div>

      <div className="qty-field__box">
        <button
          type="button"
          className="qty-field__step"
          onClick={() => step(-1)}
          disabled={count <= 0}
          aria-label="-1"
        >
          −
        </button>

        <input
          className="qty-field__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={handleInput}
          placeholder="0"
          aria-label={label}
        />

        <button
          type="button"
          className="qty-field__step"
          onClick={() => step(1)}
          aria-label="+1"
        >
          +
        </button>

        <button
          type="button"
          className={
            'qty-field__mic' + (listening ? ' qty-field__mic--listening' : '')
          }
          onClick={onMicPress}
          disabled={micDisabled}
          aria-label={micLabel}
          aria-pressed={listening}
        >
          <MicIcon size={18} />
        </button>
      </div>
    </div>
  );
}
