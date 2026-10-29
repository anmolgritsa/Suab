/**
 * BrandLogo.jsx — the official SUAB company logo (attached PNG asset).
 *
 * The source file is a navy logo on a white background, so it is drawn
 * with `mix-blend-mode: multiply`: the white box disappears into the
 * light page background and only the navy mark stays visible.
 */

import logoUrl from '../assets/suab-logo.png';

export default function BrandLogo({ height = 38 }) {
  return (
    <img
      className="brand-logo"
      src={logoUrl}
      alt="SUAB"
      style={{ height }}
      draggable="false"
    />
  );
}
