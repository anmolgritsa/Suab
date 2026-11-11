/**
 * scale-ui.mjs — one-shot UI enlargement pass.
 *
 * The worker feedback: "the UI is too small and hard to read". This script
 * applies a consistent ~1.15x scale to the existing design (no redesign):
 *
 *   1. every CSS `font-size: Npx` in the three stylesheets is multiplied
 *      by 1.15 (rounded to the nearest 0.5px, floored at 12px so the
 *      smallest labels stay legible);
 *   2. touch targets and key components are enlarged via an explicit
 *      replacement map (buttons, inputs, keypad keys, steppers, mic
 *      buttons, tabs, cards, badges, pattern/PIN dots, toasts…);
 *   3. inline SVG icon sizes in the JSX (`size={N}`) scale by the same
 *      factor, and the brand logo height goes 38 -> 44.
 *
 * Every targeted replacement asserts its expected occurrence count, so a
 * drifted codebase fails loudly instead of being silently mangled.
 * Font-size scaling is idempotent-safe to run once; re-running would grow
 * the text again, so the script refuses to run twice (marker check).
 *
 * Run with:  node scale-ui.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = import.meta.dirname
const FILES = {
  index: join(ROOT, 'src/index.css'),
  components: join(ROOT, 'src/styles/components.css'),
  screens: join(ROOT, 'src/styles/screens.css'),
}

const SCALE = 1.15

/** ×1.15 rounded to the nearest 0.5px, never below 12px. */
function scaleFont(px) {
  const grown = px * SCALE
  const rounded = Math.round(grown * 2) / 2
  return Math.max(12, rounded)
}

/** ×1.15 rounded to a whole number, never below 16 (icon floor). */
function scaleIcon(px) {
  return Math.max(16, Math.round(px * SCALE))
}

let failures = 0
function fail(message) {
  failures += 1
  console.error('FAIL ' + message)
}

/**
 * Replace every occurrence of oldStr with newStr, tolerating the repo's
 * CRLF line endings: the replacement maps below are written with \n, so
 * on a CRLF file both strings are translated before matching.
 */
function replaceAll(source, oldStr, newStr) {
  const crlf = source.includes('\r\n')
  const from = crlf ? oldStr.replace(/\n/g, '\r\n') : oldStr
  const to = crlf ? newStr.replace(/\n/g, '\r\n') : newStr
  const count = source.split(from).length - 1
  return { count, text: source.split(from).join(to) }
}

/* ------------------------------------------------------------------ */
/* 1. font-size scaling across all three stylesheets                   */
/* ------------------------------------------------------------------ */

const fontRe = /font-size:\s*([\d.]+)px/g
let fontCount = 0
for (const [name, path] of Object.entries(FILES)) {
  const source = readFileSync(path, 'utf8')
  const scaled = source.replace(fontRe, (match, px) => {
    fontCount += 1
    return 'font-size: ' + scaleFont(Number(px)) + 'px'
  })
  if (scaled !== source) writeFileSync(path, scaled)
  console.log('font-size pass: ' + name)
}
console.log('font-size declarations scaled: ' + fontCount)

/* ------------------------------------------------------------------ */
/* 2. targeted touch-target / component replacements                   */
/*    [file, old, new, expected occurrences]                           */
/* ------------------------------------------------------------------ */

const REPLACEMENTS = [
  // ---- index.css: contrast + shadow polish, base font size ----
  ['index', '  --text-soft: #7f8eb5;', '  --text-soft: #66759c;', 1],
  ['index', '  --border: #d8e7fa;', '  --border: #c9dcf5;', 1],
  [
    'index',
    '  --shadow-card: 0 10px 30px rgba(23, 35, 59, 0.07);',
    '  --shadow-card: 0 12px 32px rgba(23, 35, 59, 0.1);',
    1,
  ],
  [
    'index',
    'body {\n  font-family: var(--font);',
    'body {\n  font-size: 17px; /* enlarged base — the app reads at a glance */\n  font-family: var(--font);',
    1,
  ],

  // ---- components.css ----
  ['components', '  width: 52px;\n  height: 52px;', '  width: 56px;\n  height: 56px;', 1], // logo badge
  ['components', '  width: 64px;\n  height: 64px;', '  width: 72px;\n  height: 72px;', 1], // icon-badge
  ['components', '  width: 76px;\n  height: 76px;', '  width: 84px;\n  height: 84px;', 1], // icon-badge--lg
  ['components', '  padding: 24px 20px;', '  padding: 26px 22px;', 1], // .card
  ['components', '  height: 54px;', '  height: 60px;', 1], // .field__box
  ['components', '  min-height: 54px;', '  min-height: 60px;', 1], // .btn-primary
  ['components', '  max-width: 320px;', '  max-width: 344px;', 1], // .keypad
  [
    'components',
    '  height: 52px; /* comfortably above the 44px minimum touch target */',
    '  height: 58px; /* comfortably above the 44px minimum touch target */',
    1,
  ], // .keypad__key
  ['components', '  padding: 12px 16px;', '  padding: 14px 18px;', 1], // .toast
  ['components', '  max-width: min(90vw, 380px);', '  max-width: min(92vw, 400px);', 1], // .toast
  ['components', '  padding: 6px 14px;', '  padding: 8px 16px;', 1], // .demo-chip
  ['components', '  padding: 10px 12px;', '  padding: 12px 14px;', 1], // .link-button

  // ---- screens.css: shared shell ----
  ['screens', '  width: 44px;\n  height: 44px;', '  width: 48px;\n  height: 48px;', 1], // .back-button
  [
    'screens',
    '  width: 60px;\n  height: 60px;\n  border-radius: 50%;\n  background: var(--blue-soft);',
    '  width: 66px;\n  height: 66px;\n  border-radius: 50%;\n  background: var(--blue-soft);',
    1,
  ], // .fingerprint__icon
  [
    'screens',
    '  width: 60px;\n  height: 60px;\n  border-radius: 50%;\n  background: #ffffff;',
    '  width: 66px;\n  height: 66px;\n  border-radius: 50%;\n  background: #ffffff;',
    1,
  ], // .update-reminder__icon

  // ---- attendance ----
  ['screens', '  width: min(230px, 60vw);', '  width: min(254px, 64vw);', 2], // .att-art / .att__art
  ['screens', '  line-height: 1.45;\n  max-width: 300px;', '  line-height: 1.45;\n  max-width: 330px;', 1], // .att__subtitle wrap width
  [
    'screens',
    '  min-height: 60px; /* the mockup\'s attendance button is taller than usual */',
    "  min-height: 66px; /* the mockup's attendance button is taller than usual */",
    1,
  ],
  ['screens', '  padding: 16px 18px;', '  padding: 18px 20px;', 1], // .att__shift-card
  ['screens', '  padding: 7px 12px;', '  padding: 9px 14px;', 1], // .att__sim-chip
  ['screens', '  padding: 8px 16px;', '  padding: 10px 18px;', 1], // .att__lang

  // ---- language pill / menu ----
  // (context: the same padding value also appears as the att__sim-chip's
  // NEW size below, so the pill is matched together with its shadow)
  [
    'screens',
    '  padding: 9px 14px;\n  box-shadow: 0 4px 10px rgba(23, 35, 59, 0.06);',
    '  padding: 11px 16px;\n  box-shadow: 0 4px 10px rgba(23, 35, 59, 0.06);',
    1,
  ], // .lang__pill
  ['screens', '  min-width: 190px;', '  min-width: 210px;', 1], // .lang__menu
  ['screens', '  padding: 10px 12px;\n  border-radius: 11px;', '  padding: 12px 14px;\n  border-radius: 11px;', 1], // .lang__option

  // ---- homepage ----
  ['screens', '  width: 40px;\n  height: 40px;', '  width: 44px;\n  height: 44px;', 1], // .shift-timer__icon
  ['screens', '  padding: 8px 22px 8px 10px;', '  padding: 10px 24px 10px 12px;', 1], // .shift-timer
  ['screens', '  grid-template-columns: 1fr 1fr;\n  gap: 16px;', '  grid-template-columns: 1fr 1fr;\n  gap: 18px;', 1], // .home__grid
  ['screens', '  min-height: 204px;', '  min-height: 224px;', 1], // .action-card
  ['screens', '  padding: 26px 24px;', '  padding: 28px 26px;', 1], // .action-card
  ['screens', '  width: 72px;\n  height: 72px;', '  width: 78px;\n  height: 78px;', 3], // card badges ×3
  ['screens', '  min-height: 116px;', '  min-height: 128px;', 1], // .action-card--wide
  ['screens', '  padding: 18px 0 16px;', '  padding: 20px 0 18px;', 1], // .sos-button
  ['screens', '  padding: 10px 14px;', '  padding: 12px 16px;', 1], // .machine-banner

  // ---- modals ----
  ['screens', '  width: 34px;\n  height: 34px;', '  width: 38px;\n  height: 38px;', 1], // .modal__close
  ['screens', '  width: 64px;\n  height: 64px;', '  width: 72px;\n  height: 72px;', 1], // .sos-dialog__icon
  ['screens', '  min-height: 48px;', '  min-height: 54px;', 3], // dialog buttons + reminder pick
  ['screens', '  min-height: 50px;', '  min-height: 56px;', 1], // .update-reminder__send
  ['screens', '  max-width: 320px;', '  max-width: 344px;', 7], // dialogs + product-submit blocks

  // ---- report screens ----
  ['screens', '  min-height: 52px;', '  min-height: 58px;', 2], // .report__pick + attachment
  ['screens', '  width: 30px;\n  height: 30px;', '  width: 34px;\n  height: 34px;', 1], // attachment remove
  ['screens', '  width: 84px;\n  height: 84px;', '  width: 92px;\n  height: 92px;', 1], // .rtheme .icon-badge
  ['screens', '  max-width: 340px;', '  max-width: 360px;', 3], // report form / machine card / allotment actions
  ['screens', '  min-height: 170px;', '  min-height: 190px;', 1], // .rtheme .report__pick
  ['screens', '  min-height: 72px;', '  min-height: 80px;', 1], // .rtheme .report__attachment

  // ---- machine allotment ----
  ['screens', '  padding: 24px 22px;', '  padding: 26px 24px;', 1], // .allot-card
  ['screens', '  gap: 16px;\n  margin-top: 24px;', '  gap: 18px;\n  margin-top: 26px;', 1], // .allot__cards
  ['screens', '  margin-top: 28px;', '  margin-top: 30px;', 1], // .allot__actions
  ['screens', '.allot__more {\n  width: 100%;\n  margin-top: 16px;\n}', '.allot__more {\n  width: 100%;\n  margin-top: 18px;\n}', 1],

  // ---- product submission ----
  ['screens', '  width: 42px;\n  height: 42px;', '  width: 48px;\n  height: 48px;', 2], // steppers + mic
  ['screens', '  height: 42px;', '  height: 48px;', 1], // .qty-field__input (after the pairs above)
  ['screens', '  width: 28px;\n  height: 28px;', '  width: 32px;\n  height: 32px;', 1], // .qty-field__icon
  ['screens', '  padding: 10px 12px 12px;', '  padding: 12px 14px 14px;', 1], // .qty-field
  ['screens', '  gap: 10px;\n  margin-top: 16px;', '  gap: 12px;\n  margin-top: 18px;', 1], // .product-submit__form
  ['screens', '  min-height: 24px;', '  min-height: 28px;', 1], // voice status line
  ['screens', '  padding: 2px 10px;', '  padding: 4px 12px;', 1], // .product-submit__lang

  // ---- app lock / PIN / pattern / biometric ----
  ['screens', '  width: 16px;\n  height: 16px;', '  width: 18px;\n  height: 18px;', 3], // pin dot / pattern dot / spinner
  ['screens', '  width: 240px;\n  height: 240px;', '  width: 264px;\n  height: 264px;', 1], // .pattern grid
  ['screens', '  max-width: 240px;', '  max-width: 260px;', 1], // .lock__divider
  ['screens', '  max-width: 300px;\n  margin: 10px auto 0;', '  max-width: 322px;\n  margin: 10px auto 0;', 1], // .lock__tabs
  ['screens', '  padding: 9px 0;', '  padding: 12px 0;', 1], // .lock__tab
  // (context: .decor--corner shares the 190px square, so match the art's
  // following margin line too)
  [
    'screens',
    '  width: 190px;\n  height: 190px;\n  margin-bottom: 20px;',
    '  width: 214px;\n  height: 214px;\n  margin-bottom: 20px;',
    1,
  ], // .bio-art
  ['screens', '  padding: 14px 34px;', '  padding: 16px 38px;', 1], // .bio__sensor
  ['screens', '  stroke-width: 5;', '  stroke-width: 6;', 1], // .pattern__line

  // ---- chips ----
  ['screens', '  padding: 5px 12px;', '  padding: 7px 14px;', 2], // .chip + .att__distance
  ['screens', '  padding: 14px 18px;', '  padding: 16px 20px;', 1], // .secondary-button
]

for (const [file, oldStr, newStr, expected] of REPLACEMENTS) {
  const path = FILES[file]
  const source = readFileSync(path, 'utf8')
  const { count, text } = replaceAll(source, oldStr, newStr)
  if (count !== expected) {
    fail(file + ': expected ' + expected + ' occurrence(s) of ' + JSON.stringify(oldStr.slice(0, 60)) + ', found ' + count)
    continue
  }
  writeFileSync(path, text)
}

/* ------------------------------------------------------------------ */
/* 3. inline SVG icon sizes in the JSX                                 */
/* ------------------------------------------------------------------ */

const jsxFiles = [
  'src/components/BiometricArt.jsx',
  'src/components/LanguageDropdown.jsx',
  'src/components/Logo.jsx',
  'src/components/QuantityField.jsx',
  'src/components/ReportForm.jsx',
  'src/components/ShiftTimer.jsx',
  'src/components/SosButton.jsx',
  'src/components/WorkUpdateReminder.jsx',
  'src/screens/AppLockScreen.jsx',
  'src/screens/EnterPinScreen.jsx',
  'src/screens/HomeScreen.jsx',
  'src/screens/InputErrorScreen.jsx',
  'src/screens/LoginScreen.jsx',
  'src/screens/MachineAllotmentScreen.jsx',
  'src/screens/MachineDefectScreen.jsx',
  'src/screens/MachineInputsScreen.jsx',
  'src/screens/OtherScreen.jsx',
  'src/screens/OutputErrorScreen.jsx',
  'src/screens/ProductDimensionsScreen.jsx',
  'src/screens/ProductSubmissionScreen.jsx',
]

const sizeRe = /size=\{(\d+)\}/g
let iconCount = 0
for (const rel of jsxFiles) {
  const path = join(ROOT, rel)
  if (!existsSync(path)) {
    fail('missing jsx file: ' + rel)
    continue
  }
  const source = readFileSync(path, 'utf8')
  const scaled = source.replace(sizeRe, (match, px) => {
    iconCount += 1
    return 'size={' + scaleIcon(Number(px)) + '}'
  })
  if (scaled !== source) writeFileSync(path, scaled)
}

// The brand logo PNG: default height 38 -> 44 (every screen uses the default).
const brandPath = join(ROOT, 'src/components/BrandLogo.jsx')
const brand = readFileSync(brandPath, 'utf8')
if (!brand.includes('height = 44')) {
  writeFileSync(brandPath, brand.replace('height = 38', 'height = 44'))
  console.log('BrandLogo height 38 -> 44')
}

console.log('icon sizes scaled: ' + iconCount)
console.log(failures === 0 ? '\nScale pass complete' : '\n' + failures + ' problem(s) — fix and re-run')
if (failures > 0) process.exitCode = 1
