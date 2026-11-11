/**
 * PrimaryButton.jsx — the big pill button used on every screen.
 *
 * Props:
 *  - children  button text (or any content)
 *  - onClick   click handler
 *  - disabled  greys the button out and blocks clicks
 *  - type      'button' (default) or 'submit' when used inside a <form>
 *  - variant   'primary' (solid blue, default) | 'coral' | 'purple' —
 *              the attendance screen recolours this button per GPS state
 */

const VARIANTS = {
  primary: 'btn-primary',
  coral: 'btn-primary btn-primary--coral',
  purple: 'btn-primary btn-primary--purple',
}

export default function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  variant = 'primary',
}) {
  return (
    <button
      className={VARIANTS[variant] ?? VARIANTS.primary}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
