import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { __resetAudioCuesForTests } from "../audioCues";
import { DICTATION_START_TONES, DICTATION_STOP_TONES, playDictationCue } from "./dictationCues";

afterEach(() => {
  __resetAudioCuesForTests();
  vi.unstubAllGlobals();
});

function installAudioContext(initialState: AudioContextState = "running") {
  const frequencies: number[] = [];
  const context = {
    state: initialState,
    currentTime: 5,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    createOscillator: () => ({
      type: "sine",
      frequency: {
        setValueAtTime: (frequency: number) => frequencies.push(frequency),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  const AudioContext = vi.fn(function AudioContext() {
    return context;
  });
  vi.stubGlobal("window", { AudioContext });

  return { AudioContext, frequencies };
}

function installVibrate() {
  const vibrate = vi.fn(() => true);
  vi.stubGlobal("navigator", { vibrate });
  return vibrate;
}

describe("dictation cues", () => {
  it("steps up when the microphone opens", async () => {
    const { frequencies } = installAudioContext();

    playDictationCue("start", true);
    await vi.waitFor(() => expect(frequencies).toHaveLength(2));

    expect(frequencies[0]).toBeLessThan(frequencies[1]!);
    expect(frequencies).toEqual(DICTATION_START_TONES.map((tone) => tone.frequency));
  });

  it("steps down when it closes, so the two cues cannot be confused", async () => {
    const { frequencies } = installAudioContext();

    playDictationCue("stop", true);
    await vi.waitFor(() => expect(frequencies).toHaveLength(2));

    expect(frequencies[0]).toBeGreaterThan(frequencies[1]!);
    expect(frequencies).toEqual(DICTATION_STOP_TONES.map((tone) => tone.frequency));
  });

  it("opens no audio context at all when the cues are switched off", () => {
    const { AudioContext } = installAudioContext();

    playDictationCue("start", false);

    expect(AudioContext).not.toHaveBeenCalled();
  });

  it("buzzes alongside the sound where the browser supports it", () => {
    installAudioContext();
    const vibrate = installVibrate();

    playDictationCue("start", true);

    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("stays silent and still when the cues are switched off", () => {
    installAudioContext();
    const vibrate = installVibrate();

    playDictationCue("stop", false);

    expect(vibrate).not.toHaveBeenCalled();
  });
});
