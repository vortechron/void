/**
 * The two cues that tell a user whether the microphone is open.
 *
 * Dictation is the one control in the composer whose state the user cannot
 * see while using it — they are looking away, or talking, and the button is a
 * small circle in the corner. So the moment it opens and the moment it closes
 * each get a sound and a short buzz on devices that can buzz.
 *
 * Both cues are a two-note step: up when it starts listening, down when it
 * stops. Direction is what carries the meaning, so the pair reads correctly
 * even at a volume you barely notice. They are kept short and quiet on
 * purpose — the start cue plays with the microphone already open, and the
 * capture stream runs with echo cancellation on, so a brief sine tone does
 * not end up in the transcript.
 */
import { playToneSequence, type ToneSpec } from "../audioCues";

/** D5 then A5: a small step up, over in under a fifth of a second. */
export const DICTATION_START_TONES: ReadonlyArray<ToneSpec> = [
  { frequency: 587.33, offset: 0, duration: 0.08, volume: 0.04 },
  { frequency: 880, offset: 0.06, duration: 0.14, volume: 0.05 },
];

/** The same two notes the other way round, so stopping is unmistakable. */
export const DICTATION_STOP_TONES: ReadonlyArray<ToneSpec> = [
  { frequency: 880, offset: 0, duration: 0.08, volume: 0.045 },
  { frequency: 587.33, offset: 0.06, duration: 0.16, volume: 0.04 },
];

export type DictationCue = "start" | "stop";

/**
 * A tap for opening, a longer double buzz for closing. Only Android and
 * desktop Chrome implement this; everywhere else the call is missing and the
 * sound carries the cue on its own.
 */
const HAPTIC_PATTERNS: Readonly<Record<DictationCue, number | ReadonlyArray<number>>> = {
  start: 12,
  stop: [8, 28, 8],
};

function pulseHaptic(cue: DictationCue): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern = HAPTIC_PATTERNS[cue];
  try {
    navigator.vibrate(Array.isArray(pattern) ? [...pattern] : (pattern as number));
  } catch {
    // A vibration a browser refuses is not worth telling anyone about.
  }
}

/**
 * Plays a cue. Sound is opt-out through settings; the haptic rides along with
 * it, because a user who turned the sound off did so to keep the room quiet
 * and a buzz is the same interruption in a shared space.
 */
export function playDictationCue(cue: DictationCue, enabled: boolean): void {
  if (!enabled) return;
  pulseHaptic(cue);
  // Fire and forget: a cue that cannot play (no audio context, or a browser
  // that never let one start) must not hold up opening the microphone.
  void playToneSequence(cue === "start" ? DICTATION_START_TONES : DICTATION_STOP_TONES);
}
