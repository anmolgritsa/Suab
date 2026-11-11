/**
 * restore-pre-scale.mjs — undo the partial scale-ui.mjs run so it can be
 * re-applied cleanly in one pass.
 *
 * - The three stylesheets are restored from the .bak-*.css copies taken
 *   before any scaling.
 * - The JSX icon pass already ran (size={N} -> size={round(N*1.15)}); the
 *   mapping is a bijection on the icon sizes used in this codebase, so it
 *   is inverted in place. BrandLogo's height default goes 44 -> 38.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = import.meta.dirname

// 1. CSS from backups.
for (const [bak, real] of [
  ['.bak-index.css', 'src/index.css'],
  ['.bak-components.css', 'src/styles/components.css'],
  ['.bak-screens.css', 'src/styles/screens.css'],
]) {
  const from = join(ROOT, bak)
  if (!existsSync(from)) throw new Error('missing backup ' + bak)
  copyFileSync(from, join(ROOT, real))
  console.log('restored ' + real)
}

// 2. Invert the JSX icon scaling. Every original size maps to a distinct
//    scaled size, so the inverse is unambiguous.
const INVERSE = {
  16: 14, 18: 16, 21: 18, 23: 20, 25: 22, 30: 26,
  32: 28, 35: 30, 39: 34, 44: 38, 46: 40, 83: 72,
}

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

let restored = 0
for (const rel of jsxFiles) {
  const path = join(ROOT, rel)
  const source = readFileSync(path, 'utf8')
  const out = source.replace(/size=\{(\d+)\}/g, (match, px) => {
    const original = INVERSE[Number(px)]
    if (original === undefined) return match // untouched size — leave it
    restored += 1
    return 'size={' + original + '}'
  })
  if (out !== source) writeFileSync(path, out)
}

const brandPath = join(ROOT, 'src/components/BrandLogo.jsx')
const brand = readFileSync(brandPath, 'utf8')
if (brand.includes('height = 44')) {
  writeFileSync(brandPath, brand.replace('height = 44', 'height = 38'))
}

console.log('icon sizes restored: ' + restored)
console.log('BrandLogo height back to 38')
