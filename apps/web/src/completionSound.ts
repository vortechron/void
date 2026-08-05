import type { CompletionSound } from "@t3tools/contracts/settings";

type AudioContextConstructor = new () => AudioContext;

let sharedAudioContext: AudioContext | null = null;

function readAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as typeof window & {
    readonly webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

function getAudioContext(): AudioContext | null {
  if (sharedAudioContext) return sharedAudioContext;
  const AudioContextClass = readAudioContextConstructor();
  if (!AudioContextClass) return null;
  sharedAudioContext = new AudioContextClass();
  return sharedAudioContext;
}

function scheduleTone(input: {
  readonly context: AudioContext;
  readonly frequency: number;
  readonly startsAt: number;
  readonly duration: number;
  readonly volume: number;
}): void {
  const oscillator = input.context.createOscillator();
  const gain = input.context.createGain();
  const endsAt = input.startsAt + input.duration;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(input.frequency, input.startsAt);
  gain.gain.setValueAtTime(0.0001, input.startsAt);
  gain.gain.exponentialRampToValueAtTime(input.volume, input.startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  oscillator.connect(gain);
  gain.connect(input.context.destination);
  oscillator.start(input.startsAt);
  oscillator.stop(endsAt);
}

function scheduleChime(context: AudioContext): void {
  const startsAt = context.currentTime + 0.01;
  scheduleTone({
    context,
    frequency: 659.25,
    startsAt,
    duration: 0.22,
    volume: 0.055,
  });
  scheduleTone({
    context,
    frequency: 987.77,
    startsAt: startsAt + 0.11,
    duration: 0.38,
    volume: 0.045,
  });
}

export async function prepareCompletionSound(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    return context.state === "running";
  } catch {
    return false;
  }
}

export async function playCompletionSound(sound: CompletionSound): Promise<boolean> {
  if (sound === "none") return false;
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    if (context.state !== "running") return false;
    scheduleChime(context);
    return true;
  } catch {
    return false;
  }
}

export function __resetCompletionSoundForTests(): void {
  sharedAudioContext = null;
}
