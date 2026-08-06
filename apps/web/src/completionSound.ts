import type { CompletionSound } from "@t3tools/contracts/settings";

import {
  __resetAudioCuesForTests,
  getRunningAudioContext,
  playToneSequence,
  type ToneSpec,
} from "./lib/audioCues";

const CHIME: ReadonlyArray<ToneSpec> = [
  { frequency: 659.25, offset: 0, duration: 0.22, volume: 0.055 },
  { frequency: 987.77, offset: 0.11, duration: 0.38, volume: 0.045 },
];

export async function prepareCompletionSound(): Promise<boolean> {
  return (await getRunningAudioContext()) !== null;
}

export async function playCompletionSound(sound: CompletionSound): Promise<boolean> {
  if (sound === "none") return false;
  return playToneSequence(CHIME);
}

export function __resetCompletionSoundForTests(): void {
  __resetAudioCuesForTests();
}
