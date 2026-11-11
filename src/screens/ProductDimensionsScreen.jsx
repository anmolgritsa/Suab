/**
 * ProductDimensionsScreen.jsx — "Product Dimensions".
 *
 * Opens when the worker taps the Job (output) card on the Machine
 * Allotment screen. Shows the finished product the machine turns out —
 * Stainless Steel Coils — with its dimension fields.
 *
 * Layout (top to bottom, all centered on screen):
 *   1. Title + subtitle
 *   2. Product hero  (big icon, "Finished product", product name, grade pill)
 *   3. 2 x 2 grid of dimension tiles (Width, Thickness, Coil weight)
 *
 * Values are STATIC demo data for now (they live in the i18n dictionary:
 * allotFinishedProductValue, dimWidth, dimThickness, dimCoilWeight, dimGrade).
 * Styles live in ProductDimensionsScreen.css.
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import { ArrowLeftIcon, TargetIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
// import './ProductDimensionsScreen.css'

export default function ProductDimensionsScreen({ onBack }) {
  const { t } = useI18n()

  // Static demo data — split into the measurements and the grade,
  // because the grade is shown as a highlighted badge, not a tile.
  const measurements = [
    { key: 'width', label: t('widthLabel'), value: t('dimWidth') },
    { key: 'thickness', label: t('thicknessLabel'), value: t('dimThickness') },
    { key: 'weight', label: t('coilWeightLabel'), value: t('dimCoilWeight') },
  ]
  const grade = { label: t('gradeLabel'), value: t('dimGrade') }

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

          {/* Product hero */}
          <section className="pd-hero">
            <span className="pd-hero__badge" aria-hidden="true">
              <TargetIcon size={40} />
            </span>
            <span className="pd-hero__label">{t('allotFinishedProduct')}</span>
            <strong className="pd-hero__name">{t('allotFinishedProductValue')}</strong>

            <span className="pd-hero__grade">
              <span className="pd-hero__grade-label">{grade.label}</span>
              <span className="pd-hero__grade-value">{grade.value}</span>
            </span>
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
        </div>
      </div>
    </div>
  )
}