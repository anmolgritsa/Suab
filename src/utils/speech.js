/**
 * speech.js — a thin wrapper around the Web Speech API for the
 * product-count mic (speech-to-number on the Product Submission screen).
 *
 * The platform here is the browser (the app is a PWA-style web build), so
 * the recogniser is the Web Speech API — `SpeechRecognition`, with the
 * `webkit`-prefixed twin Chrome ships. On a React-Native shell the same
 * contract maps onto the platform recogniser; only this file would change.
 *
 * Callback contract (exactly one of the first two, then onEnd once):
 *   onResult(number, transcript)  a number was heard and parsed
 *   onError(reason)               the attempt failed ('no-speech',
 *                                 'no-match', 'not-allowed', …)
 *   onEnd()                       always fires once, after the above
 *
 * start() opens the mic for ONE utterance (continuous = false), so it
 * deactivates by itself when the worker stops speaking. stop() ends the
 * attempt gracefully (a result may still arrive); cancel() aborts it and
 * silences every callback — used when the worker taps the mic again or
 * leaves the screen.
 */

import { parseSpokenNumber } from './voiceNumbers.js';

/** True when this browser exposes a speech recogniser at all. */
export function isSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

/**
 * Run one recognition attempt in `lang` (a BCP-47 tag, e.g. 'hi-IN').
 * Returns { stop, cancel } — or null when speech recognition is missing.
 */
export function startSpeechRecognition({ lang, onResult, onError, onEnd }) {
  if (!isSpeechSupported()) return null;

  const Recognizer = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec;
  try {
    rec = new Recognizer();
  } catch {
    onError?.('not-supported');
    onEnd?.();
    return null;
  }

  let settled = false; // the result/error pair may fire only once
  let cancelled = false; // cancel() silences every callback
  let finalText = ''; // best final transcript heard so far
  let lastError = ''; // the recogniser's own error code, if any

  const settle = (kind, value) => {
    if (settled || cancelled) return;
    settled = true;
    if (kind === 'result') onResult?.(value.number, value.transcript);
    else onError?.(value);
    onEnd?.();
  };

  rec.lang = lang;
  rec.continuous = false; // one utterance per attempt — auto-stops
  rec.interimResults = true; // partial text keeps the session responsive
  rec.maxAlternatives = 3;

  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result.isFinal) continue; // wait for the settled reading
      finalText = `${finalText} ${result[0].transcript}`.trim();
      let number;
      try {
        number = parseSpokenNumber(finalText);
      } catch {
        number = null; // a malformed transcript must never crash the mic
      }
      if (number !== null) {
        rec.stop();
        settle('result', { number, transcript: finalText });
        return;
      }
    }
  };

  rec.onerror = (event) => {
    // 'aborted' is our own stop()/cancel() — not a real failure.
    if (event.error === 'aborted') return;
    lastError = event.error;
  };

  rec.onend = () => {
    if (settled || cancelled) return; // already answered
    if (finalText) {
      // Speech ended but no number could be parsed from it.
      settle('error', 'no-match');
    } else {
      settle('error', lastError || 'no-speech');
    }
  };

  rec.start();

  return {
    /** Graceful stop — the utterance may still produce a result. */
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
    /** Hard abort — no callbacks fire after this. */
    cancel: () => {
      cancelled = true;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
