/**
 * assignments.js — the shared machine-assignment store behind the
 * Supervisor workflow (and the labour home's assigned-job banner).
 *
 * WHY a separate module: the supervisor's "Assign Machine" screen and the
 * labour interface must see the same assignments, so the data lives in one
 * place. Persistence follows the same localStorage pattern as
 * utils/storage.js (readJson/writeJson), exposed as small get/save
 * functions so the store can later be swapped for Supabase without
 * touching any screen.
 *
 * Demo data:
 *  - EMPLOYEE_ROSTER        the factory's workers (names + Employee IDs)
 *  - MACHINE_LIST           Machine 01–04, each with a persisted status
 *                           (available / assigned / maintenance)
 *  - ASSIGNMENT_MATERIALS   the raw materials a job can run on
 *  - DEFAULT_OUTPUT_DETAILS the demo product dimensions (prefilled and
 *                           editable on the assign screen)
 *  - PRIORITY_OPTIONS       Normal / High / Urgent
 */

import { readJson, writeJson, todayKey } from '../utils/storage.js';

/* The keys are also listed in storage.js STORAGE_KEYS so the demo reset
   wipes them together with everything else. */
const KEY_MACHINES = 'suab.machineStatuses';
const KEY_ASSIGNMENTS = 'suab.assignments';

/** The factory's demo workers (the supervisor's assignable roster). */
export const EMPLOYEE_ROSTER = [
  { id: '9988', name: 'Ramesh Kumar' },
  { id: 'SUAB-1024', name: 'Amit Sharma' },
  { id: 'SUAB-1031', name: 'Sunita Devi' },
  { id: 'SUAB-1055', name: 'Vijay Singh' },
  { id: 'SUAB-1062', name: 'Pooja Patel' },
];

/** Machine 01–04 — the supervisor's assignable machine pool. */
export const MACHINE_LIST = [
  { id: 'M-01', name: 'Machine 01' },
  { id: 'M-02', name: 'Machine 02' },
  { id: 'M-03', name: 'Machine 03' },
  { id: 'M-04', name: 'Machine 04' },
];

/** Machine statuses: 'available' | 'assigned' | 'maintenance'. */
const DEFAULT_MACHINE_STATUSES = {
  'M-01': 'available',
  'M-02': 'assigned',
  'M-03': 'assigned',
  'M-04': 'maintenance',
};

/** Raw materials a job can run on (dropdown options — no typing). */
export const ASSIGNMENT_MATERIALS = [
  'Stainless Steel Welded Pipes & Tubes',
  'Stainless Steel Sheets',
  'Stainless Steel Rods',
  'Stainless Steel Coils',
];

/** Demo product dimensions, prefilled and editable on the assign screen. */
export const DEFAULT_OUTPUT_DETAILS = {
  length: '6000 mm',
  width: '1250 mm',
  thickness: '0.5 mm',
  weight: '2.5 t',
  targetQuantity: 500,
};

/** Job priorities (color-coded chips on the assign screen). */
export const PRIORITY_OPTIONS = [
  { id: 'normal', labelKey: 'supAssignNormal' },
  { id: 'high', labelKey: 'supAssignHigh' },
  { id: 'urgent', labelKey: 'supAssignUrgent' },
];

/* ---- machine statuses ---------------------------------------------------- */

/** Every machine's current status (defaults merged with what is saved). */
export function getMachineStatuses() {
  return { ...DEFAULT_MACHINE_STATUSES, ...readJson(KEY_MACHINES, {}) };
}

/** Flip one machine's status and persist the whole map. */
export function setMachineStatus(machineId, status) {
  const statuses = getMachineStatuses();
  statuses[machineId] = status;
  writeJson(KEY_MACHINES, statuses);
  return statuses;
}

/* ---- assignments ----------------------------------------------------------
 * A record: { id, employeeId, employeeName, machineId, material,
 *             output: { length, width, thickness, weight, targetQuantity },
 *             priority, assignedAt, dayKey }
 */

/** Two demo assignments seeded on first read, matching the default
    machine statuses (M-02 and M-03 start out assigned). */
function seedAssignments() {
  const today = todayKey();
  return [
    {
      id: 'asg-demo-1',
      employeeId: 'SUAB-1031',
      employeeName: 'Sunita Devi',
      machineId: 'M-02',
      material: ASSIGNMENT_MATERIALS[1],
      output: { ...DEFAULT_OUTPUT_DETAILS },
      priority: 'normal',
      assignedAt: `${today}T03:00:00.000Z`,
      dayKey: today,
      demo: true,
    },
    {
      id: 'asg-demo-2',
      employeeId: 'SUAB-1055',
      employeeName: 'Vijay Singh',
      machineId: 'M-03',
      material: ASSIGNMENT_MATERIALS[0],
      output: { ...DEFAULT_OUTPUT_DETAILS },
      priority: 'high',
      assignedAt: `${today}T03:45:00.000Z`,
      dayKey: today,
      demo: true,
    },
  ];
}

/** Every assignment on this device, newest first (seeds the demo history
    on first read so the roster's badges and the history section are never
    empty). */
export function getAssignments() {
  const stored = readJson(KEY_ASSIGNMENTS, null);
  if (stored) return stored;
  const seeds = seedAssignments();
  writeJson(KEY_ASSIGNMENTS, seeds);
  return seeds;
}

/** Record a new assignment and keep the list short (last 20). */
export function saveAssignment(assignment) {
  const assignments = getAssignments();
  assignments.unshift(assignment);
  writeJson(KEY_ASSIGNMENTS, assignments.slice(0, 20));
  return assignment;
}

/** Today's active assignment for an employee (null when none). The labour
    home's assigned-job banner reads this for the signed-in worker. */
export function getEmployeeAssignment(employeeId) {
  if (!employeeId) return null;
  const today = todayKey();
  return (
    getAssignments().find(
      (a) => a.employeeId === employeeId && a.dayKey === today,
    ) ?? null
  );
}
