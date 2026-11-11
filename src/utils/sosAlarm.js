/**
 * sosAlarm.js — the supervisor's SOS alarm sound (Web Audio API).
 *
 * The repo has no audio assets (the build stays asset-free), so the SOS
 * alarm is SYNTHESISED: a repeating square-wave beep (880 Hz) scheduled
 * every half second for the alarm duration (4 s). See utils/sound.js for
 * the quieter update chime this pattern follows.
 *
 * Design notes:
 *   - The AudioContext is created lazily and reused (browsers cap live
 *     contexts).
 *   - Browsers require a user gesture before audio; an SOS arrives from
 *     the SYNC CALLBACK (no gesture), so resume() is attempted and an
 *     autoplay block degrades to silence — the blinking overlay is the
 *     notification that must always work. A later tap anywhere lets a
 *     subsequent alarm sound.
 *   - Every entry point is try/catch-wrapped and node-safe (no window →
 *     no-op), so importing this module can never crash a screen.
 */

/** The lazily-created, shared AudioContext (null until the first alarm). */
let audioContext = null;

/** The auto-stop timer started by startSosAlarm (null when idle). */
let autoStopTimer = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

/** One short beep: square wave, quick attack, fast decay. */
function beep(ctx, at) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880; // A5 — urgent but not ear-piercing
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.32);
}

/** Cancel any pending auto-stop (safe to call any time). */
export function stopSosAlarm() {
  if (autoStopTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(autoStopTimer);
  }
  autoStopTimer = null;
}

/**
 * Schedule repeating beeps for `durationMs` (default 4000 — the SOS alarm
 * sounds for exactly 4 seconds, then stops by itself). Returns true when
 * beeps were scheduled, false when audio is unavailable or blocked
 * (never throws).
 */
export function startSosAlarm(durationMs = 4000) {
  stopSosAlarm();
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const seconds = Math.max(0, durationMs) / 1000;
    const now = ctx.currentTime;
    for (let at = 0; at < seconds; at += 0.5) beep(ctx, now + at);
    if (typeof window !== 'undefined') {
      autoStopTimer = window.setTimeout(stopSosAlarm, durationMs);
    }
    return true;
  } catch {
    return false; // no audio — the blinking overlay still announces the SOS
  }
}
