const fs = require('fs');
const en = { ...require('./en-block.cjs').en };

// Fix the few corrupted punctuation marks in the salvaged English values.
const fixes = {
  loginDemoHint: 'Demo: any Employee ID works — e.g. {id}',
  supSignedInAs: 'Signed in as supervisor — {id}',
  sosSent: 'Emergency alert sent — supervisor notified.',
  productSubmissionSub: "Your shift is complete — submit today's product count.",
  updateConfirmSub: 'Thanks — your supervisor received your update.',
  listening: 'Listening…',
  voiceFailed: 'No number heard — try again',
  attCheckInFailed: 'Could not save attendance — please sign in again',
  enterPinLockedLabel: 'Too many attempts — try again in {seconds}s',
  bioScanningLabel: 'Scanning…',
  bioScanning: 'Scanning…',
  lockPatternHint: 'Demo pattern: draw an "L" — top-left → bottom-left → bottom-right',
  halfDayPending: 'Pending…',
  halfDayRecording: 'Recording…',
  halfDayMicError: 'Microphone not available — please allow mic access and try again.',
  voiceRecording: 'Recording…',
  voiceMicError: 'Microphone not available — please allow mic access and try again.',
  supAssignReassignNote: '{name} is on {machine} — pick a new machine to reassign',
  supUpdatesSub: "Video updates from today's shift",
};
Object.assign(en, fixes);

// Required app keys that are not display strings (used programmatically).
en['key'] = en['languageLabel'];
en[' '] = ' ';
en['0'] = '0';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

function emit(obj) {
  const entries = Object.entries(obj).map(([k, v]) => {
    const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
    return '    ' + key + ': ' + JSON.stringify(v) + ',';
  });
  return '{\n' + entries.join('\n') + '\n  }';
}

const out = `/**
 * i18n.jsx — tiny translation layer (no i18n library).
 *
 * One provider holds the active language (persisted in localStorage so the
 * choice survives refreshes) and hands every screen a t(key) lookup. All
 * five demo languages currently ship the English copy for keys without a
 * dedicated translation; the structure (and the language dropdown) is
 * ready for per-language strings to be filled in.
 */


import { createContext, useCallback, useContext, useState } from 'react';
import { getLanguage, setLanguage } from './utils/storage.js';

export const LANGUAGES = ${JSON.stringify(LANGUAGES, null, 2)};

const en = ${emit(en)};
const translations = {
  en,
  hi: { ...en },
  bn: { ...en },
  pa: { ...en },
  te: { ...en },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => getLanguage());
  const setLang = useCallback((code) => {
    setLanguage(code);
    setLangState(code);
  }, []);
  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    [lang],
  );
  const value = { lang, setLang, t };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside an <I18nProvider>');
  return ctx;
}
`;

fs.writeFileSync('src/i18n.jsx', out, 'utf8');
console.log('wrote src/i18n.jsx —', Object.keys(en).length, 'keys per language');
