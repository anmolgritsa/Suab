/**
 * MachineAllotmentScreen.jsx — "Machine Allotment".
 *
 * Step 3 of the daily flow: after checking in, the worker sees only two
 * things — today's machine number and the job (e.g. "Bolt Size 4") — and
 * taps Next to reach the homepage.
 *
 * The allotment is mock data (utils/machines.js), picked from the date.
 * The job text comes from machine.job (falls back to machine.type).
 * All labels come from t() (see i18n.jsx).
 */

import BrandLogo from '../components/BrandLogo.jsx'
import LanguageDropdown from '../components/LanguageDropdown.jsx'
import PrimaryButton from '../components/PrimaryButton.jsx'
import { CogIcon, WrenchIcon } from '../components/icons.jsx'
import { useI18n } from '../i18n.jsx'
import { getAllottedMachine } from '../utils/machines.js'
import { saveAllotment, saveAssignedQuantity, todayKey } from '../utils/storage.js'

export default function MachineAllotmentScreen({ onConfirm }) {
  const { t } = useI18n()

  // The supervisor's assignment for today, resolved once per mount.
  const machine = getAllottedMachine(todayKey())
  // const job = machine.job ?? machine.type

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
          {/* 1. Machine number */}
          <section className="allot-card allot-card--machine">
            <span className="allot-card__badge" aria-hidden="true">
              <CogIcon size={34} />
            </span>
            <div className="allot-card__text">
              <span className="allot-card__label">{t('allotMachineNo')}</span>
              <strong className="allot-card__value">{machine.id}</strong>
            </div>
          </section>

          {/* 2. Job */}
          {/* <section className="allot-card allot-card--job">
            <span className="allot-card__badge" aria-hidden="true">
              <WrenchIcon size={34} />
            </span>
            <div className="allot-card__text">
              <span className="allot-card__label">{t('allotJob')}</span>
              <strong className="allot-card__value">{job}</strong>
            </div>
          </section> */}
          <section className="allot-card allot-card--job">
  <span className="allot-card__badge" aria-hidden="true">
    <WrenchIcon size={34} />
  </span>
  <div className="allot-card__text">
    <span className="allot-card__label">{t('allotJob')}</span>
    <strong className="allot-card__value">{t('allotJobValue')}</strong>
  </div>
</section>
        </div>

        <div className="allot__actions">
          <PrimaryButton onClick={handleNext}>{t('allotNext')}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}