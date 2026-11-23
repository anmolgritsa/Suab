/**
 * ProductDimensionsScreen.jsx — "Product Dimensions".
 *
 * Updated: 2026-11-20
 *
 * Opens when the worker taps the Job (output) card on the Machine
 * Allotment screen. Shows the finished product the machine turns out —
 * Stainless Steel Welded Pipes & Tubes — with its dimension fields.
 *
 * Layout (top to bottom, all centered on screen):
 *   1. Title + product name as subtitle
 *   2. Product figure — a CSS-drawn pipe with three dimension callouts
 *      (Length, Outer Diameter, Wall Thickness) pointing at the drawing
 *   3. Row of three dimension tiles (Length, Thickness, Coil weight)
 *   4. Grade pill (Grade + SS 304)
 *
 * Values are STATIC demo data, defined once in the DIMENSIONS constant
 * below — update them there (labels still come from the i18n dictionary).
 * Styles live in the .pd block of src/styles/screens.css.
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import { ArrowLeftIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'

// All displayed dimension values in one place — edit here to update the
// screen (labels still come from the i18n dictionary).
const DIMENSIONS = {
  length: '1250 mm', // figure callout — pipe length
  outerDiameter: '2.5"', // figure callout — outer diameter
  wallThickness: '0.5 mm', // figure callout — wall thickness
  tileLength: '1250 mm', // tile — pipe length
  thickness: '0.5 mm', // tile — thickness
  coilWeight: '2.5 t', // tile — coil weight
  grade: 'SS 304', // grade pill
}

export default function ProductDimensionsScreen({ onBack }) {
  const { t } = useI18n()

  // Callouts pinned around the pipe drawing (see .pd-figure in screens.css).
  const callouts = [
    { key: 'length', label: t('lengthLabel'), value: DIMENSIONS.length },
    { key: 'diameter', label: t('outerDiameterLabel'), value: DIMENSIONS.outerDiameter },
    { key: 'wall', label: t('wallThicknessLabel'), value: DIMENSIONS.wallThickness },
  ]

  // The measurement tiles under the figure.
  const measurements = [
    { key: 'length', label: t('lengthLabel'), value: DIMENSIONS.tileLength },
    { key: 'thickness', label: t('thicknessLabel'), value: DIMENSIONS.thickness },
    { key: 'weight', label: t('coilWeightLabel'), value: DIMENSIONS.coilWeight },
  ]

  return (
    <div className="home detail">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="detail__main">
        <button
          type="button"
          className="back-button detail__back"
          aria-label={t('backToAllotment')}
          onClick={onBack}
        >
          <ArrowLeftIcon size={20} />
        </button>

        {/* Centered content block */}
        <div className="detail__body pd">
          <h1 className="pd__title">{t('productDimensionsTitle')}</h1>
          <p className="pd__subtitle">{t('productDimensionsSub')}</p>

          {/* Product figure — CSS-drawn pipe with dimension callouts */}
          <section className="pd-figure" role="img" aria-label={t('productDimensionsSub')}>
            <span className="pd-figure__pipe" aria-hidden="true" />
            <span className="pd-figure__flange pd-figure__flange--left" aria-hidden="true" />
            <span className="pd-figure__flange pd-figure__flange--right" aria-hidden="true" />
            {callouts.map(({ key, label, value }) => (
              <span key={key} className={`pd-callout pd-callout--${key}`}>
                <span className="pd-callout__label">{label}</span>
                <span className="pd-callout__value">{value}</span>
              </span>
            ))}
          </section>

          {/* Dimension tiles */}
          <ul className="pd-grid">
            {measurements.map(({ key, label, value }) => (
              <li key={key} className={`pd-tile pd-tile--${key}`}>
                <span className="pd-tile__label">{label}</span>
                <span className="pd-tile__value">{value}</span>
              </li>
            ))}
          </ul>

          {/* Grade pill */}
          <span className="pd-grade">
            <span className="pd-grade__label">{t('gradeLabel')}</span>
            <span className="pd-grade__value">{DIMENSIONS.grade}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
