/**
 * MachineInputsScreen.jsx — "Machine Inputs".
 *
 * Opens when the worker taps the Machine No. card on the Machine
 * Allotment screen. Lists the raw materials loaded into the allotted
 * machine as a clean read-only table — one row per material with its
 * grade and specification under clear column headings (soft header row,
 * hairline dividers, zebra striping) — deliberately text-light for the
 * shop floor.
 *
 * The materials are STATIC demo data for now (they will be made dynamic
 * later); the short names/grades/specs live in the i18n dictionary as
 * inputMaterial1-3 / inputGrade1-3 / inputSpec1-3. Reuses the app's
 * header (logo + language) and back-button pattern; the table is styled
 * by the scoped .inputs__table* rules in screens.css.
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import {
  ArrowLeftIcon,
  BadgeIcon,
  ClipboardIcon,
  FactoryIcon,
  PackageIcon,
  WrenchIcon,
} from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'

export default function MachineInputsScreen({ onBack }) {
  const { t } = useI18n()

  // Static demo data — the machine's three input materials. `color`
  // drives the row badge's colour (same palette as the allotment).
  const materials = [
    { Icon: PackageIcon, name: t('inputMaterial1'), grade: t('inputGrade1'), spec: t('inputSpec1'), color: 'raw' },
    { Icon: FactoryIcon, name: t('inputMaterial2'), grade: t('inputGrade2'), spec: t('inputSpec2'), color: 'machine' },
    { Icon: WrenchIcon, name: t('inputMaterial3'), grade: t('inputGrade3'), spec: t('inputSpec3'), color: 'job' },
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

        {/* inputs__body: scoped positioning — see screens.css (.inputs__body). */}
        <div className="detail__body inputs__body">
          <h1 className="screen__title">{t('machineInputsTitle')}</h1>
          <p className="screen__subtitle">{t('machineInputsSub')}</p>

          {/* One row per material: badge + name, then grade and spec.
              A real <table> keeps the columns aligned and screen-reader
              friendly; styling is scoped to .inputs__table*. */}
          <table className="inputs__table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="inputs__th">
                    <PackageIcon size={13} />
                    {t('materialLabel')}
                  </span>
                </th>
                <th scope="col">
                  <span className="inputs__th">
                    <BadgeIcon size={13} />
                    {t('gradeLabel')}
                  </span>
                </th>
                <th scope="col">
                  <span className="inputs__th">
                    <ClipboardIcon size={13} />
                    {t('specLabel')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {materials.map(({ Icon, name, grade, spec, color }) => (
                <tr key={name}>
                  <th scope="row" className="inputs__material">
                    <span className="inputs__material-inner">
                      <span
                        className={`inputs__icon inputs__icon--${color}`}
                        aria-hidden="true"
                      >
                        <Icon size={15} />
                      </span>
                      {name}
                    </span>
                  </th>
                  <td>{grade}</td>
                  <td>{spec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
