/**
 * voiceNote.js — the shared voice-note recording engine.
 *
 * One implementation of the "record a short voice note" flow, reused by
 * every form that wants one (the half-day request screen and the three
 * defect report forms). It wraps the browser's MediaRecorder:
 *
 *   startRecording()   ask for the microphone and begin the capture
 *                      (auto-stops after MAX_RECORDING_MS; replaces any
 *                      previous take — that IS the Retake action)
 *   stopRecording()    finalise the clip early
 *   togglePlayback()   listen to the finished take / stop it
 *   deleteClip()       remove the take entirely (back to idle)
 *
 * The finished clip plays from a blob URL right away; the data URL used
 * for persistence (localStorage) is filled in asynchronously and only
 * kept when it fits MAX_SAVED_AUDIO_CHARS, so the storage quota can
 * never blow up. The caller decides what to do with `clip.dataUrl` —
 * the half-day request stores it on its record, the report forms store
 * it as the report's `voiceNote`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Recording auto-stops after one minute — keeps the saved data URL small. */
export const MAX_RECORDING_MS = 60 * 1000;

/** Voice notes larger than this (as a data URL) are not persisted, so the
    localStorage record can never blow the storage quota. The clip still
    plays for the rest of the session. */
export const MAX_SAVED_AUDIO_CHARS = 500000;

/** 65000 → '1:05' — the recording timer's mm:ss label. */
export function formatVoiceTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/**
 * useVoiceNote — the recording engine behind a voice-note form.
 *
 * One state line: 'idle' → 'recording' → 'recorded' (a single take at a
 * time). Media objects and timers live in refs — they must survive
 * re-renders and be released on unmount, but never drive the UI
 * directly. Returns the state plus the actions documented above.
 */
export function useVoiceNote() {
  // ── state the UI renders from ──
  const [phase, setPhase] = useState('idle'); // 'idle' | 'recording' | 'recorded'
  const [micError, setMicError] = useState(false); // mic missing / permission denied
  const [elapsedMs, setElapsedMs] = useState(0); // recording (or take) length
  const [playing, setPlaying] = useState(false); // playback in progress
  const [clip, setClip] = useState(null); // { url, blob, dataUrl } once recorded

  // ── media objects & timers (refs — never re-render, cleaned up on unmount) ──
  const recordingRef = useRef(null); // the active MediaRecorder
  const streamRef = useRef(null); // the live microphone stream
  const chunksRef = useRef([]); // encoded audio chunks of the current take
  const clipRef = useRef(null); // mirrors `clip` for the async FileReader
  const audioRef = useRef(null); // the Audio element playing the take back
  const startedAtRef = useRef(0); // Date.now() when the take began
  const tickRef = useRef(null); // the 200 ms recording timer
  // ── clip helpers ──
  const applyClip = useCallback((next) => {
    if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    clipRef.current = next;
    setClip(next);
  }, []);

  /** Delete the take entirely — back to the idle mic. */
  const deleteClip = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
    applyClip(null);
    setElapsedMs(0);
  }, [applyClip]);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // ── recording ──
  /** Stop the active take early (the pill's stop button). */
  const stopRecording = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const recorder = recordingRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  /** Start a new take — replaces (retakes) any previous one. */
  const startRecording = useCallback(async () => {
    deleteClip();
    setMicError(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setMicError(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recordingRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        cleanupStream();
        recordingRef.current = null;
        setElapsedMs(Math.min(MAX_RECORDING_MS, Date.now() - startedAtRef.current));
        if (!blob.size) {
          setPhase('idle');
          return;
        }
        const url = URL.createObjectURL(blob);
        applyClip({ url, blob, dataUrl: '' });
        setPhase('recorded');
        // Fill in the storable data URL asynchronously — only when it fits.
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (clipRef.current && clipRef.current.url === url) {
            applyClip({
              ...clipRef.current,
              dataUrl: dataUrl.length <= MAX_SAVED_AUDIO_CHARS ? dataUrl : '',
            });
          }
        };
        reader.readAsDataURL(blob);
      };
      startedAtRef.current = Date.now();
      recorder.start();
      setPhase('recording');
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) stopRecording();
      }, 200);
    } catch {
      cleanupStream();
      recordingRef.current = null;
      setPhase('idle');
      setMicError(true);
    }
  }, [applyClip, cleanupStream, deleteClip, stopRecording]);
  // ── playback ──
  /** Play the finished take / stop it. */
  const togglePlayback = useCallback(() => {
    if (!clip) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(clip.url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio.play().catch(() => setPlaying(false));
    setPlaying(true);
  }, [clip, playing]);

  // ── unmount ──
  // Release the microphone, the timer, the blob URL and the audio element.
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      if (audioRef.current) audioRef.current.pause();
    },
    [],
  );

  return {
    phase,
    recording: phase === 'recording',
    clip, // null until a take exists — the UI's play/retake/delete gate
    elapsedMs,
    playing,
    micError,
    startRecording, // also the Retake action (it replaces the previous take)
    stopRecording,
    togglePlayback,
    deleteClip,
  };
}
