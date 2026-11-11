/**
 * SupervisorAssignMachineScreen.jsx — "Assign Machine" (supervisor workflow).
 *
 * Opened from the Supervisor dashboard's "Assign Machine" action card
 * (App.jsx routes Employee ID 9977 here). The supervisor picks a worker,
 * a machine, a raw material, the job's output details and a priority,
 * previews the assignment, then confirms it.
 *
 * Layout, top to bottom:
 *   1. top bar      SUAB company logo + language dropdown
 *   2. back chip    round back button → the supervisor dashboard
 *   3. title        "Assign Machine" + one-line hint
 *   4. employees    compact roster — avatar, name, ID and a status badge
 *                   (green "Assigned · M-xx" / amber "Not Assigned");
 *                   tapping a row selects the worker
 *   5. machine      Machine 01–04 dropdown, color-coded by status
 *                   (Available / Assigned / Maintenance) — the first
 *                   available machine is auto-suggested; a worker who is
 *                   already assigned gets the reassign note
 *   6. material     raw-material dropdown (predefined options, no typing)
 *   7. output       demo product dimensions — length, width, thickness,
 *                   weight and target quantity (prefilled, editable)
 *   8. priority     Normal / High / Urgent color-coded chips
 *   9. preview      summary card (employee, machine, material, output,
 *                   priority) with Confirm / Back
 *  10. history      recent assignments (demo seeds + new ones)
 *  11. bottom nav   the shared SupervisorBottomNav — Home is active,
 *                   Reports opens the reports screen, Alerts opens the
 *                   alerts screen
 *
 * State lives in data/assignments.js (localStorage today, Supabase-ready):
 * confirming writes the assignment, flips the machine's status to
 * 'assigned' (freeing the worker's previous machine on a reassign), and
 * the labour home's assigned-job banner picks it up from the same store.
 *
 * Props:
 *  - onBack()         return to the Supervisor dashboard
 *  - onOpenReports()  open the "Reports" screen (App.jsx routes to
 *                     'supervisor-reports')
 *  - onOpenAlerts()   open the "Emergency Alerts" screen (App.jsx routes
 *                     to 'supervisor-alerts')
 */

import { useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import LanguageDropdown from '../components/LanguageDropdown.jsx';
import PrimaryButton from '../components/PrimaryButton.jsx';
import SupervisorBottomNav from '../components/SupervisorBottomNav.jsx';
import Toast from '../components/Toast.jsx';
import { useI18n } from '../i18n.jsx';
import { todayKey } from '../utils/storage.js';
import {
  ASSIGNMENT_MATERIALS,
  DEFAULT_OUTPUT_DETAILS,
  EMPLOYEE_ROSTER,
  MACHINE_LIST,
  PRIORITY_OPTIONS,
  getAssignments,
  getEmployeeAssignment,
  getMachineStatuses,
  saveAssignment,
  setMachineStatus,
} from '../data/assignments.js';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CogIcon,
  PackageIcon,
} from '../components/icons.jsx';

export default function SupervisorAssignMachineScreen({
  onBack,
  onOpenReports,
  onOpenAlerts,
}) {
  /* ### state */
  const { t } = useI18n();
  const [toast, setToast] = useState(null);

  // The shared store, read once per mount (screens remount on navigation,
  // so a fresh read is always current — the same pattern the labour
  // screens use with utils/storage.js).
  const [assignments, setAssignments] = useState(getAssignments);
  const [machineStatuses, setMachineStatuses] = useState(getMachineStatuses);

  // The form: worker → machine → material → output details → priority.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [machineId, setMachineId] = useState('');
  const [material, setMaterial] = useState(ASSIGNMENT_MATERIALS[0]);
  const [output, setOutput] = useState({ ...DEFAULT_OUTPUT_DETAILS });
  const [priority, setPriority] = useState('normal');
  const [previewing, setPreviewing] = useState(false);

  /* ### helpers */
  // Replace {placeholders} in a translated string (same helper as the
  // dashboard screen).
  function fill(text, vars) {
    return Object.entries(vars).reduce(
      (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
      text,
    );
  }

  // Two-letter initials for an employee's avatar circle.
  function initials(name) {
    return name
      .split(' ')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // Translated machine-status label ('available' | 'assigned' | 'maintenance').
  function statusLabel(status) {
    return status === 'assigned'
      ? t('supAssignStAssigned')
      : status === 'maintenance'
        ? t('supAssignStMaintenance')
        : t('supAssignStAvailable');
  }

  // The roster with each worker's today assignment joined on.
  const employeeRows = EMPLOYEE_ROSTER.map((employee) => ({
    ...employee,
    assignment: assignments.find(
      (a) => a.employeeId === employee.id && a.dayKey === todayKey(),
    ),
  }));

  const selectedRow = employeeRows.find((row) => row.id === selectedEmployeeId);
  const reassigning = Boolean(selectedRow?.assignment);

  /* ### employee selection + form fields */
  // Selecting a worker auto-suggests the first AVAILABLE machine — for a
  // reassignment the worker's current machine is skipped, so the suggestion
  // is always a new one. No effect needed: the handler sets both values.
  function handleSelectEmployee(id) {
    setSelectedEmployeeId(id);
    const current = employeeRows.find((row) => row.id === id)?.assignment;
    const free = MACHINE_LIST.find(
      (m) =>
        (machineStatuses[m.id] ?? 'available') === 'available' &&
        m.id !== current?.machineId,
    );
    setMachineId(free?.id ?? '');
    setPreviewing(false);
  }

  function handleOutputChange(field, value) {
    setOutput((current) => ({ ...current, [field]: value }));
  }

  // Preview needs a worker and a machine (maintenance machines are
  // disabled in the dropdown, so any selected id is usable).
  const canPreview = Boolean(selectedEmployeeId) && Boolean(machineId);

  /* ### confirm */
  function handleConfirm() {
    const employee = EMPLOYEE_ROSTER.find((e) => e.id === selectedEmployeeId);
    const previous = getEmployeeAssignment(selectedEmployeeId);
    const record = {
      id: `asg-${Date.now()}`,
      employeeId: selectedEmployeeId,
      employeeName: employee?.name ?? selectedEmployeeId,
      machineId,
      material,
      output: {
        ...output,
        targetQuantity:
          Number(output.targetQuantity) || DEFAULT_OUTPUT_DETAILS.targetQuantity,
      },
      priority,
      assignedAt: new Date().toISOString(),
      dayKey: todayKey(),
    };
    saveAssignment(record);
    // A reassignment frees the worker's previous machine.
    if (previous && previous.machineId !== machineId) {
      setMachineStatus(previous.machineId, 'available');
    }
    setMachineStatus(machineId, 'assigned');
    // Re-read the store so the roster badges and history reflect the change.
    setAssignments(getAssignments());
    setMachineStatuses(getMachineStatuses());
    setToast(
      fill(t('supAssignSuccess'), {
        name: record.employeeName,
        machine: machineId,
      }),
    );
    setPreviewing(false);
  }

  /* ### render */
  return (
    <div className="home supa">
      <header className="home__topbar">
        <BrandLogo />
        <LanguageDropdown />
      </header>

      <button
        type="button"
        className="back-button home__back"
        aria-label={t('supAssignBack')}
        onClick={onBack}
      >
        <ArrowLeftIcon size={18} aria-hidden="true" />
        <span>{t('supAssignBack')}</span>
      </button>

      <h1 className="screen__title">{t('supAssignTitle')}</h1>
      <p className="screen__subtitle">{t('supAssignSub')}</p>

      <main className="supa__body">
        {!previewing ? (
          <>
            {/* 1. Employee roster — tap a row to select the worker. */}
            <section>
              <h2 className="supa__heading">{t('supAssignEmployees')}</h2>
              <ul className="supa__list">
                {employeeRows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={
                        'supa__emp' +
                        (row.id === selectedEmployeeId ? ' supa__emp--on' : '')
                      }
                      onClick={() => handleSelectEmployee(row.id)}
                    >
                      <span className="supa__avatar" aria-hidden="true">
                        {initials(row.name)}
                      </span>
                      <span className="supa__emp-text">
                        <strong>{row.name}</strong>
                        <small>{row.id}</small>
                      </span>
                      {row.assignment ? (
                        <span className="supa__badge supa__badge--on">
                          <CheckCircleIcon size={12} aria-hidden="true" />
                          {t('supAssignBadgeAssigned')} · {row.assignment.machineId}
                        </span>
                      ) : (
                        <span className="supa__badge supa__badge--off">
                          {t('supAssignBadgeFree')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* 2. Machine + material dropdowns. */}
            <section>
              <label className="supa__label" htmlFor="supa-machine">
                {t('supAssignMachineLabel')}
              </label>
              <div className="supa__select-wrap">
                <CogIcon size={18} aria-hidden="true" />
                <select
                  id="supa-machine"
                  className="supa__select"
                  value={machineId}
                  onChange={(event) => setMachineId(event.target.value)}
                >
                  <option value="" disabled>
                    {t('supAssignPickEmployee')}
                  </option>
                  {MACHINE_LIST.map((machine) => {
                    const status = machineStatuses[machine.id] ?? 'available';
                    return (
                      <option
                        key={machine.id}
                        value={machine.id}
                        disabled={status === 'maintenance'}
                      >
                        {machine.name} · {statusLabel(status)}
                      </option>
                    );
                  })}
                </select>
                <ChevronDownIcon size={16} aria-hidden="true" />
              </div>
              {reassigning && selectedRow?.assignment && (
                <p className="supa__note">
                  {fill(t('supAssignReassignNote'), {
                    name: selectedRow.assignment.employeeName,
                    machine: selectedRow.assignment.machineId,
                  })}
                </p>
              )}

              <label className="supa__label" htmlFor="supa-material">
                {t('supAssignMaterialLabel')}
              </label>
              <div className="supa__select-wrap">
                <PackageIcon size={18} aria-hidden="true" />
                <select
                  id="supa-material"
                  className="supa__select"
                  value={material}
                  onChange={(event) => setMaterial(event.target.value)}
                >
                  {ASSIGNMENT_MATERIALS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon size={16} aria-hidden="true" />
              </div>
            </section>

            {/* 3. Output details — demo dimensions, prefilled + editable. */}
            <section>
              <h2 className="supa__heading">{t('supAssignOutputLabel')}</h2>
              <div className="supa__dims">
                <div className="supa__dim">
                  <label htmlFor="supa-length">{t('supAssignLength')}</label>
                  <input
                    id="supa-length"
                    value={output.length}
                    onChange={(e) => handleOutputChange('length', e.target.value)}
                  />
                </div>
                <div className="supa__dim">
                  <label htmlFor="supa-width">{t('supAssignWidth')}</label>
                  <input
                    id="supa-width"
                    value={output.width}
                    onChange={(e) => handleOutputChange('width', e.target.value)}
                  />
                </div>
                <div className="supa__dim">
                  <label htmlFor="supa-thickness">{t('supAssignThickness')}</label>
                  <input
                    id="supa-thickness"
                    value={output.thickness}
                    onChange={(e) => handleOutputChange('thickness', e.target.value)}
                  />
                </div>
                <div className="supa__dim">
                  <label htmlFor="supa-weight">{t('supAssignWeight')}</label>
                  <input
                    id="supa-weight"
                    value={output.weight}
                    onChange={(e) => handleOutputChange('weight', e.target.value)}
                  />
                </div>
                <div className="supa__dim supa__dim--wide">
                  <label htmlFor="supa-target">{t('supAssignTarget')}</label>
                  <input
                    id="supa-target"
                    type="number"
                    min="1"
                    value={output.targetQuantity}
                    onChange={(e) =>
                      handleOutputChange('targetQuantity', e.target.value)
                    }
                  />
                </div>
              </div>
            </section>

            {/* 4. Job priority chips. */}
            <section>
              <h2 className="supa__heading">{t('supAssignPriority')}</h2>
              <div className="supa__prio">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      `supa__prio-chip supa__prio-chip--${option.id}` +
                      (priority === option.id ? ' supa__prio-chip--on' : '')
                    }
                    onClick={() => setPriority(option.id)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            {/* 5. Preview opens the summary card below. */}
            <div className="supa__actions">
              <PrimaryButton
                disabled={!canPreview}
                onClick={() => setPreviewing(true)}
              >
                {t('supAssignPreview')}
              </PrimaryButton>
            </div>
          </>
        ) : (
          /* 6. Preview — summary card with Confirm / Back. */
          <section className="supa__preview">
            <h2 className="supa__heading">{t('supAssignPreview')}</h2>
            <div className="supa__prev-row">
              <span className="supa__prev-label">{t('supAssignEmployee')}</span>
              <span className="supa__prev-value">
                {selectedRow?.name} · {selectedEmployeeId}
              </span>
            </div>
            <div className="supa__prev-row">
              <span className="supa__prev-label">{t('allotMachineNo')}</span>
              <span className="supa__prev-value">
                {MACHINE_LIST.find((m) => m.id === machineId)?.name ?? machineId}
              </span>
            </div>
            <div className="supa__prev-row">
              <span className="supa__prev-label">{t('materialLabel')}</span>
              <span className="supa__prev-value">{material}</span>
            </div>
            <div className="supa__prev-row">
              <span className="supa__prev-label">{t('supAssignOutputLabel')}</span>
              <span className="supa__prev-dims">
                <span className="supa__prev-dim">
                  <small>{t('supAssignLength')}</small>
                  <strong>{output.length}</strong>
                </span>
                <span className="supa__prev-dim">
                  <small>{t('supAssignWidth')}</small>
                  <strong>{output.width}</strong>
                </span>
                <span className="supa__prev-dim">
                  <small>{t('supAssignThickness')}</small>
                  <strong>{output.thickness}</strong>
                </span>
                <span className="supa__prev-dim">
                  <small>{t('supAssignWeight')}</small>
                  <strong>{output.weight}</strong>
                </span>
                <span className="supa__prev-dim">
                  <small>{t('supAssignTarget')}</small>
                  <strong>{output.targetQuantity}</strong>
                </span>
              </span>
            </div>
            <div className="supa__prev-row">
              <span className="supa__prev-label">{t('supAssignPriority')}</span>
              <span
                className={`supa__prio-dot supa__prio-dot--${priority}`}
                aria-hidden="true"
              />
              <span className="supa__prev-value">
                {t(
                  PRIORITY_OPTIONS.find((p) => p.id === priority)?.labelKey ??
                    'supAssignNormal',
                )}
              </span>
            </div>
            <div className="supa__actions">
              <PrimaryButton onClick={handleConfirm}>
                {reassigning ? t('supAssignReassign') : t('supAssignConfirm')}
              </PrimaryButton>
            </div>
            <button
              type="button"
              className="supa__back"
              onClick={() => setPreviewing(false)}
            >
              {t('supAssignBack')}
            </button>
          </section>
        )}

        {/* 7. Recent assignments — demo seeds + everything just created. */}
        <section>
          <h2 className="supa__heading">{t('supAssignHistory')}</h2>
          {assignments.length === 0 ? (
            <p className="supa__empty">{t('supAssignHistoryEmpty')}</p>
          ) : (
            <ul className="supa__history">
              {assignments.map((a) => (
                <li key={a.id} className="supa__hist-row">
                  <span className="supa__avatar supa__avatar--sm" aria-hidden="true">
                    {initials(a.employeeName)}
                  </span>
                  <span className="supa__hist-text">
                    <strong>{a.employeeName}</strong>
                    <small>
                      {a.machineId} · {a.material}
                    </small>
                  </span>
                  <span
                    className={`supa__prio-dot supa__prio-dot--${a.priority}`}
                    title={t(
                      PRIORITY_OPTIONS.find((p) => p.id === a.priority)
                        ?.labelKey ?? 'supAssignNormal',
                    )}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Bottom tab navigation — Home is active; Reports and Alerts open
          their screens. */}
      <SupervisorBottomNav
        active="home"
        onReports={onOpenReports}
        onAlerts={onOpenAlerts}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
