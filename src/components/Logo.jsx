/**
 * Logo.jsx — the SUAB brand lock-up used at the top of the auth screens.
 *
 * Layout (matches the reference mockups):
 *   [blue rounded icon with a factory glyph]
 *   SUAB                <- big wordmark
 *   FACTORY MANAGEMENT  <- small letter-spaced tagline
 */

import { FactoryIcon } from './icons.jsx'

export default function Logo({ compact = false }) {
  return (
    <div className={compact ? 'logo logo--compact' : 'logo'}>
      <span className="logo__badge">
        <FactoryIcon size={30} />
      </span>
      <span className="logo__text">
        <span className="logo__name">SUAB</span>
        <span className="logo__tagline">Factory Management</span>
      </span>
    </div>
  )
}
