/**
 * sound.js — the work-update confirmation chime (Part 3).
 *
 * The repo has no audio assets (the build stays asset-free), so the
 * "your update was sent" sound is SYNTHESISED with the Web Audio API: a
 * short two-note sine chime played at the exact moment a work update is
 * recorded (see HomeScreen.handleSendUpdate).
 *
 * Design notes:
 *   - The AudioContext is created lazily on first use and reused after
 *     that — browsers cap the number of live contexts, and building one
 *     per ping would hit that cap quickly.
 *   - Browsers only allow audio after a user gesture; the chime is always
 *     triggered from a tap ("Send Update"), but resume() is called anyway
 *     to cover a suspended context (e.g. the tab was backgrounded).
 *   - Everything degrades to a silent no-op when Web Audio is missing or
 *     fails (old browsers, node/tests): the toast is the notification
 *     that must always work — the chime is a bonus on top.
 */

/** The lazily-created, shared AudioContext (null until the first chime). */
let audioContext = null;

/**
 * The shared AudioContext, or null when the Web Audio API is unavailable.
 * The typeof window check keeps this module importable from node (the
 * smoke test), where there is no window at all.
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

/**
 * Play one chime note: a sine oscillator with a quick attack and an
 * exponential decay, so the note "pings" instead of cutting off abruptly.
 */
function playNote(ctx, frequency, startAt, duration, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02); // quick attack
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration); // decay
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/**
 * The work-update chime: two ascending notes (A5 → D6), short (~0.5 s)
 * and quiet, so it confirms the send without being alarming. Returns
 * true when a sound was actually scheduled, false when audio is not
 * available (never throws).
 */
export function playUpdateChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume(); // autoplay-policy safety

    const now = ctx.currentTime;
    playNote(ctx, 880, now, 0.22, 0.14); // A5 — "your update…"
    playNote(ctx, 1174.66, now + 0.13, 0.32, 0.16); // D6 — "…was sent"
    return true;
  } catch {
    return false; // no audio — the toast alone still confirms the send
  }
}
