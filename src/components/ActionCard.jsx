/**
 * ActionCard.jsx — the big rounded tiles on the labour homepage
 * (mockups 6.1/6.2): a pale tinted card with a solid colour icon badge
 * and the action's name.
 *
 * Two shapes:
 *  - default  square-ish tile in the two-column grid (icon above label)
 *  - wide     full-width row (icon left, label right) — "Output Defect"
 *
 * Props:
<<<<<<< HEAD
 *  - icon     SVG node drawn inside the colour badge
 *  - label    translated action name
 *  - color    'amber' | 'blue' | 'green' — picks the card's palette
 *  - wide     render the full-width row variant
 *  - onClick() open the matching report screen
=======
 *  - icon      SVG node drawn inside the colour badge
 *  - label     translated action name
 *  - color     'amber' | 'blue' | 'green' | 'slate' | 'coral' | 'purple'
 *              — picks the card's palette
 *  - wide      render the full-width row variant
 *  - disabled  block taps (the Other screen's half-day tile while its
 *              request is pending / approved)
 *  - note      optional small status line under the label (tile variant)
 *  - onClick() open the matching report screen
 *
 * Dimensions are NOT props — every card shares the app's standard box
 * dimensions defined as CSS tokens in index.css (:root): --box-pad for
 * padding, --tile-min-h for the tile height and --row-min-h for the wide
 * row height (applied in screens.css). Keep it that way so all boxes
 * across the app stay the same size.
>>>>>>> master
 */

const PALETTES = {
  amber: { badge: '#f6a723', soft: '#fdf3d7', text: '#8a5a10' },
  blue: { badge: '#2e83f9', soft: '#e3effd', text: '#1b5fb8' },
  green: { badge: '#22b57f', soft: '#e0f6ec', text: '#157a55' },
<<<<<<< HEAD
};

export default function ActionCard({ icon, label, color = 'blue', wide = false, onClick }) {
=======
  // Neutral slate — the "Other" card's colours (matches allot-card--other).
  slate: { badge: '#7f8eb5', soft: '#edf1f9', text: '#7f8eb5' },
  // Coral & purple — the Other screen's maintenance / activities tiles
  // (the same colours allot-card--maintenance / --activities already use).
  coral: { badge: '#f96d7f', soft: '#fde5ea', text: '#c23a55' },
  purple: { badge: '#8f7bfa', soft: '#e6e0fd', text: '#5b46d6' },
};

export default function ActionCard({
  icon,
  label,
  color = 'blue',
  wide = false,
  disabled = false,
  note = null,
  onClick,
}) {
>>>>>>> master
  const palette = PALETTES[color] ?? PALETTES.blue;

  const style = {
    '--card-badge': palette.badge,
    '--card-soft': palette.soft,
    '--card-text': palette.text,
  };

  if (wide) {
    return (
      <button
        type="button"
        className="action-card action-card--wide"
        style={style}
<<<<<<< HEAD
=======
        disabled={disabled}
>>>>>>> master
        onClick={onClick}
      >
        <span className="action-card__badge" aria-hidden="true">
          {icon}
        </span>
        <span className="action-card__label">{label}</span>
        <span className="action-card__arrow" aria-hidden="true">
          ›
        </span>
      </button>
    );
  }

  return (
<<<<<<< HEAD
    <button type="button" className="action-card" style={style} onClick={onClick}>
=======
    <button
      type="button"
      className="action-card"
      style={style}
      disabled={disabled}
      onClick={onClick}
    >
>>>>>>> master
      <span className="action-card__badge" aria-hidden="true">
        {icon}
      </span>
      <span className="action-card__label">{label}</span>
<<<<<<< HEAD
=======
      {note && <span className="action-card__note">{note}</span>}
>>>>>>> master
    </button>
  );
}
