/**
 * check-i18n-parity.mjs — verifies that every language dictionary in
 * src/i18n/translations.js has exactly the same key set as the English
 * dictionary in src/i18n.jsx (and the same {placeholder} tokens per key).
 *
 * Run: node scripts/check-i18n-parity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i18nSrc = fs.readFileSync(path.join(root, 'src/i18n.jsx'), 'utf8');
const trSrc = fs.readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8');

/** Extract a `const NAME = { ... };` object literal by brace counting. */
function extractObject(src, name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`const ${name} not found`);
  const objStart = src.indexOf('{', start);
  let depth = 0;
  let inStr = null; // ' or " or `
  for (let i = objStart; i < src.length; i++) {
    const c = src[i];
    const prev = src[i - 1];
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '/' && src[i + 1] === '/') { // skip line comment
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) {
        const literal = src.slice(objStart, i + 1);
        return new Function(`return (${literal})`)();
      }
    }
  }
  throw new Error(`unbalanced braces for const ${name}`);
}

/** Pull {placeholder} tokens out of every string value in a dict. */
function placeholders(dict) {
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v === 'string') {
      out[k] = [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    }
  }
  return out;
}

const en = extractObject(i18nSrc, 'en');
const enKeys = Object.keys(en).sort();
const enPh = placeholders(en);

// Import the language modules (ESM export list discovered from the file).
const langNames = [...trSrc.matchAll(/^export const (\w+) = \{/gm)].map(m => m[1]);
const mod = await import(pathToFileURL(path.join(root, 'src/i18n/translations.js')).href);

let failures = 0;
for (const lang of langNames) {
  const dict = mod[lang];
  if (!dict) { console.error(`${lang}: MISSING EXPORT`); failures++; continue; }
  const keys = Object.keys(dict).sort();
  const missing = enKeys.filter(k => !keys.includes(k));
  const extra = keys.filter(k => !enKeys.includes(k));
  if (missing.length) { console.error(`${lang}: MISSING ${missing.length} keys: ${missing.join(', ')}`); failures++; }
  if (extra.length) { console.error(`${lang}: EXTRA ${extra.length} keys: ${extra.join(', ')}`); failures++; }
  // placeholder parity
  const ph = placeholders(dict);
  const phBad = enKeys.filter(k => (ph[k] ?? '') !== (enPh[k] ?? ''));
  if (phBad.length) { console.error(`${lang}: PLACEHOLDER MISMATCH in: ${phBad.join(', ')}`); failures++; }
  if (!missing.length && !extra.length && !phBad.length) {
    console.log(`${lang}: OK — ${keys.length} keys, exact parity with en`);
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nALL PARITY CHECKS PASSED (${langNames.length} languages, ${enKeys.length} keys each).`);
