/**
 * LanguageDropdown.jsx — the small pill in the homepage's top-right corner
 * (mockup: "EN ▾"). Opens a compact menu with all five demo languages;
 * picking one switches every translated string on the homepage instantly
 * and remembers the choice in localStorage.
 */

import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, useI18n } from '../i18n.jsx';
import { ChevronDownIcon } from './icons.jsx';

export default function LanguageDropdown() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = LANGUAGES.find((item) => item.code === lang) ?? LANGUAGES[0];

  /* Close the menu when the worker taps anywhere else, or presses Escape. */
  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="lang" ref={rootRef}>
      <button
        type="button"
        className="lang__pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('languageLabel')}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current.native}</span>
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <ul className="lang__menu" role="listbox" aria-label={t('languageLabel')}>
          {LANGUAGES.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                role="option"
                aria-selected={item.code === lang}
                className={
                  item.code === lang
                    ? 'lang__option lang__option--active'
                    : 'lang__option'
                }
                onClick={() => {
                  setLang(item.code);
                  setOpen(false);
                }}
              >
                <span className="lang__native">{item.native}</span>
                <span className="lang__label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
