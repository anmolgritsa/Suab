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
 *  - icon     SVG node drawn inside the colour badge
 *  - label    translated action name
 *  - color    'amber' | 'blue' | 'green' — picks the card's palette
 *  - wide     render the full-width row variant
 *  - onClick() open the matching report screen
 */

const PALETTES = {
  amber: { badge: '#f6a723', soft: '#fdf3d7', text: '#8a5a10' },
  blue: { badge: '#2e83f9', soft: '#e3effd', text: '#1b5fb8' },
  green: { badge: '#22b57f', soft: '#e0f6ec', text: '#157a55' },
};

export default function ActionCard({ icon, label, color = 'blue', wide = false, onClick }) {
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
    <button type="button" className="action-card" style={style} onClick={onClick}>
      <span className="action-card__badge" aria-hidden="true">
        {icon}
      </span>
      <span className="action-card__label">{label}</span>
    </button>
  );
}
