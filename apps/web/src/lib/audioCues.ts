/**
 * The one `AudioContext` the app plays short UI cues through.
 *
 * Browsers cap how many contexts a page may open, and every cue here is a
 * handful of oscillators lasting under half a second, so they all share one
 * context rather than each opening their own. A context can only start
 * running off the back of a user gesture, so every caller resumes before it
 * schedules and treats a context that stays suspended as "no sound today"
 * rather than an error worth surfacing.
 */
type AudioContextConstructor = new () => AudioContext;

let sharedAudioContext: AudioContext | null = null;

function readAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as typeof window & {
    readonly webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export function getSharedAudioContext(): AudioContext | null {
  if (sharedAudioContext) return sharedAudioContext;
  const AudioContextClass = readAudioContextConstructor();
  if (!AudioContextClass) return null;
  sharedAudioContext = new AudioContextClass();
  return sharedAudioContext;
}

/** Resolves to a context that is actually running, or null if none can be. */
export async function getRunningAudioContext(): Promise<AudioContext | null> {
  const context = getSharedAudioContext();
  if (!context) return null;
  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    return context.state === "running" ? context : null;
  } catch {
    return null;
  }
}

export interface ToneSpec {
  readonly frequency: number;
  /** Seconds after the cue's own start, so a spec reads as a little score. */
  readonly offset: number;
  readonly duration: number;
  readonly volume: number;
}

/**
 * Schedules one tone. The gain ramps rather than steps because an oscillator
 * switched on at full volume clicks, and a click is what a cue is meant to
 * avoid sounding like.
 */
export function scheduleTone(input: {
  readonly context: AudioContext;
  readonly frequency: number;
  readonly startsAt: number;
  readonly duration: number;
  readonly volume: number;
  readonly type?: OscillatorType;
}): void {
  const oscillator = input.context.createOscillator();
  const gain = input.context.createGain();
  const endsAt = input.startsAt + input.duration;

  oscillator.type = input.type ?? "sine";
  oscillator.frequency.setValueAtTime(input.frequency, input.startsAt);
  gain.gain.setValueAtTime(0.0001, input.startsAt);
  gain.gain.exponentialRampToValueAtTime(input.volume, input.startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  oscillator.connect(gain);
  gain.connect(input.context.destination);
  oscillator.start(input.startsAt);
  oscillator.stop(endsAt);
}

/** Plays a whole cue, resuming the context first. `false` means it stayed silent. */
export async function playToneSequence(tones: ReadonlyArray<ToneSpec>): Promise<boolean> {
  if (tones.length === 0) return false;
  const context = await getRunningAudioContext();
  if (!context) return false;
  const startsAt = context.currentTime + 0.01;
  for (const tone of tones) {
    scheduleTone({
      context,
      frequency: tone.frequency,
      startsAt: startsAt + tone.offset,
      duration: tone.duration,
      volume: tone.volume,
    });
  }
  return true;
}

export function __resetAudioCuesForTests(): void {
  sharedAudioContext = null;
}
