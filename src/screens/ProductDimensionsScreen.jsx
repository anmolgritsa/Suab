/**
 * ProductDimensionsScreen.jsx — "Product Dimensions".
 *
 * Updated: 2026-11-23 — rebuilt to match the new UI mockup.
 *
 * Opens when the worker taps the Job (output) card on the Machine
 * Allotment screen. Shows the finished product the machine turns out —
 * Stainless Steel Coils — with its dimension tiles and grade.
 *
 * Layout (top to bottom, matching the mockup):
 *   1. Top bar: brand logo (left) + language dropdown (right)
 *   2. Back chevron (no chip) + centred title + subtitle
 *   3. Lavender product card: "Finished Product" label, product name,
 *      a big purple coil illustration, and a Grade row
 *      (white disc + side-view coil carrying the "SS 304" value)
 *   4. Two half-width tiles (Width, Thickness) + one full-width tile
 *      (Coil Weight)
 *
 * Values are STATIC demo data, defined once in the DIMENSIONS constant
 * below — update them there (labels still come from the i18n dictionary).
 * Styles live in the .pd block of src/styles/screens.css; the coil
 * illustrations are drawn by src/components/CoilArt.jsx.
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import CoilArt from '../components/CoilArt.jsx'
import { ChevronLeftIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'

// All displayed dimension values in one place — edit here to update the
// screen (labels still come from the i18n dictionary).
const DIMENSIONS = {
  width: '1250 mm', // tile — coil width
  thickness: '0.5 mm', // tile — thickness
  coilWeight: '2.5 t', // tile — coil weight
  grade: 'SS 304', // grade row inside the product card
}

export default function ProductDimensionsScreen({ onBack }) {
  const { t } = useI18n()

  // The two half-width tiles under the product card.
  const tiles = [
    { key: 'width', label: t('widthLabel'), value: DIMENSIONS.width },
    { key: 'thickness', label: t('thicknessLabel'), value: DIMENSIONS.thickness },
  ]

  return (
    <div className="home detail">
      <header className="home__topbar">
        <BrandLogo height={30} />
        <LanguageDropdown />
      </header>

      <div className="detail__main">
        <button
          type="button"
          className="pd-back"
          aria-label={t('backToAllotment')}
          onClick={onBack}
        >
          <ChevronLeftIcon size={22} />
        </button>

        {/* Centred content block */}
        <div className="detail__body pd">
          <h1 className="pd__title">{t('productDimensionsTitle')}</h1>
          <p className="pd__subtitle">{t('productDimensionsSub')}</p>

          {/* Product card — lavender panel with the coil figure */}
          <section className="pd-card" aria-label={t('allotFinishedProduct')}>
            <span className="pd-card__label">{t('allotFinishedProduct')}</span>
            <span className="pd-card__name">{t('allotFinishedProductValue')}</span>

            {/* Big coil illustration */}
            <span className="pd-card__art">
              <CoilArt variant="disc" />
            </span>

            {/* Grade row — white "Grade" disc + side-view coil with the value */}
            <span className="pd-grade">
              <span className="pd-grade__disc">
                <span className="pd-grade__disc-label">{t('gradeLabel')}</span>
              </span>
              <span className="pd-grade__pill">
                <CoilArt variant="side" value={DIMENSIONS.grade} />
              </span>
            </span>
          </section>

          {/* Dimension tiles: two half-width, then one full-width */}
          <ul className="pd-grid">
            {tiles.map(({ key, label, value }) => (
              <li key={key} className={`pd-tile pd-tile--${key}`}>
                <span className="pd-tile__label">{label}</span>
                <span className="pd-tile__value">{value}</span>
              </li>
            ))}
          </ul>

          <ul className="pd-grid pd-grid--full">
            <li className="pd-tile pd-tile--weight">
              <span className="pd-tile__label">{t('coilWeightLabel')}</span>
              <span className="pd-tile__value">{DIMENSIONS.coilWeight}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
