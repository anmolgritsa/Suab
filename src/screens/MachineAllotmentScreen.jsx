/**
 * MachineAllotmentScreen.jsx — "Machine Allotment".
 *
 * Step 3 of the daily flow: after checking in, the worker sees today's
 * assignment — the machine number and the job it runs — and taps Next
 * to reach the homepage.
 *
 * The page has three buttons, in order:
 *   1. Machine No.  → MachineInputsScreen  (the raw materials the machine
 *                    consumes, with grade/spec per input)
 *   2. Job (output) → ProductDimensionsScreen (the finished product's
 *                    dimensions)
 *   3. Next         → confirms the allotment and opens the homepage
 *
 * The allotment saved for the shift quota comes from the mock catalogue
 * (utils/machines.js), picked from the date. All labels come from t()
 * (see i18n.jsx).
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import PrimaryButton from '../components/PrimaryButton.jsx'
import {
  ChevronRightIcon,
  CogIcon,
  WrenchIcon,
} from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
import { getAllottedMachine } from '../utils/machines.js'
import { saveAllotment, saveAssignedQuantity, todayKey } from '../utils/storage.js'

export default function MachineAllotmentScreen({ onConfirm, onOpenScreen }) {
  const { t } = useI18n()

  // The supervisor's assignment for today, resolved once per mount.
  const machine = getAllottedMachine(todayKey())

  /** Accept today's machine and move on to the homepage. */
  function handleNext() {
    // Still saved even though it is not shown: the Product Submission
    // keypad caps at the machine's shift quota.
    const stamped = saveAllotment({
      machineId: machine.id,
      machineName: machine.name,
      machineType: machine.type,
      targetQuantity: machine.targetQuantity,
      acceptedAt: new Date().toISOString(),
    })
    saveAssignedQuantity(machine.targetQuantity)
    onConfirm(stamped)
  }

  return (
    <div className="home allot">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <div className="allot__main">
        <h1 className="screen__title">{t('allotTitle')}</h1>

        <div className="allot__cards">
          {/* 1. Machine number — tap to see the machine's input materials */}
          <button
            type="button"
            className="allot-card allot-card--machine allot-card--tap"
            onClick={() => onOpenScreen('machine-inputs')}
          >
            <span className="allot-card__badge" aria-hidden="true">
              <CogIcon size={34} />
            </span>
            <span className="allot-card__text">
              <span className="allot-card__label">{t('allotMachineNo')}</span>
              <strong className="allot-card__value">{machine.id}</strong>
            </span>
            <span className="allot-card__chevron" aria-hidden="true">
              <ChevronRightIcon size={22} />
            </span>
          </button>

          {/* 2. Job / output — tap to see the finished product's dimensions */}
          <button
            type="button"
            className="allot-card allot-card--job allot-card--tap"
            onClick={() => onOpenScreen('product-dimensions')}
          >
            <span className="allot-card__badge" aria-hidden="true">
              <WrenchIcon size={34} />
            </span>
            <span className="allot-card__text">
              <span className="allot-card__label">{t('allotJob')}</span>
              <strong className="allot-card__value">{t('allotJobValue')}</strong>
            </span>
            <span className="allot-card__chevron" aria-hidden="true">
              <ChevronRightIcon size={22} />
            </span>
          </button>
        </div>

        <div className="allot__actions">
          <PrimaryButton onClick={handleNext}>{t('allotNext')}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
