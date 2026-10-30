/**
 * TextField.jsx — a reusable, touch-friendly text input.
 *
 * Props:
 *  - label       placeholder text shown inside the field (like the mockups)
 *  - icon        React node drawn on the left inside the field
 *  - type        input type, e.g. 'text' | 'tel' | 'password'
 *  - value/onChange  standard controlled-input pair
 *  - error       error message string ('' or undefined = no error)
 *  - ...rest     anything else is passed to <input> (maxLength, inputMode…)
 */

export default function TextField({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  error,
  ...rest
}) {
  // Build the class list so CSS can highlight the field when it has an error.
  const fieldClass =
    'field' + (error ? ' field--error' : '') + (icon ? ' field--with-icon' : '')

  return (
    <div className={fieldClass}>
      <div className="field__box">
        {icon && <span className="field__icon">{icon}</span>}
        <input
          className="field__input"
          type={type}
          value={value}
          onChange={onChange}
          placeholder={label}
          aria-label={label}
          aria-invalid={Boolean(error)}
          {...rest}
        />
      </div>
      {/* Error text is rendered only when there is something to show. */}
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}
