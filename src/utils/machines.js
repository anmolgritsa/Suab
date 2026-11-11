/**
 * machines.js — the mock machine catalogue behind the Machine Allotment
 * screen (Part 2, step 3 of the daily flow).
 *
 * There is no backend: the "supervisor's morning allotment" is picked
 * deterministically from the date, so the same machine shows for the whole
 * day and the roster rotates across days. Every machine carries the demo
 * shift quota (500), which the product-submission keypad caps at.
 */

export const MACHINE_CATALOG = [
  { id: 'M-04', name: 'Tile Press #4', type: 'Pressing', targetQuantity: 500 },
  { id: 'M-07', name: 'Clay Mixer #7', type: 'Mixing', targetQuantity: 500 },
  { id: 'M-12', name: 'Kiln Line #12', type: 'Firing', targetQuantity: 500 },
  { id: 'M-15', name: 'Glaze Sprayer #15', type: 'Finishing', targetQuantity: 500 },
];

/**
 * The machine allotted for `dateKey` ('YYYY-MM-DD'). A simple character-sum
 * hash spreads the roster across days while staying stable for the whole
 * day — and deterministic for the browser tests.
 */
export function getAllottedMachine(dateKey) {
  const hash = Array.from(dateKey).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return MACHINE_CATALOG[hash % MACHINE_CATALOG.length];
}
